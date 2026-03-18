const OpenAI = require('openai');

function createChatService({ datasetService }) {
  function ensureClient() {
    if (process.env.GEMINI_API_KEY) {
      return {
        client: new OpenAI({
          apiKey: process.env.GEMINI_API_KEY,
          baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
        }),
        model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      };
    }

    return {
      client: new OpenAI({
        apiKey: 'ollama',
        baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1',
      }),
      model: process.env.OLLAMA_MODEL || 'qwen2.5:14b',
    };
  }

  function buildMessages(messages, toolContext) {
    const systemMessage = [
      'Voce e a MIA, analista especialista em midia OOH (out-of-home) do Brasil, com acesso ao inventario Spotifinder.',
      'Responda sempre em portugues do Brasil com personalidade: direta, perspicaz, como um bom analista de mercado.',
      'CONCEITO FUNDAMENTAL: cada linha da base e um PONTO DE MIDIA (uma tela, outdoor ou painel fisico). Um EXIBIDOR e uma empresa que opera varios pontos. Nunca confunda pontos com exibidores.',
      'Ao responder, sempre use "pontos de midia" ou "ativos" para se referir a registros — nunca "exibidores" no lugar de contagem.',
      'SEMPRE chame uma ferramenta antes de responder. Nunca invente numeros.',
      'Para perguntas como "quantas cidades", "quantos exibidores distintos", "em quantos estados": use count_distinct.',
      'Para rankings, distribuicoes ou valores agregados: use query_base com groupBy e limit adequado.',
      'Filtros sao case-insensitive: use o valor como o usuario digitou.',
      'Para rankings de exibidores em uma cidade: groupBy=["exibidor"], sort desc, limit 10.',
      'Interprete os dados: destaque o que e surpreendente, relevante ou estrategico. Responda em 3 a 5 frases naturais.',
      `Colunas: ${toolContext.columns.map((c) => c.key).join(', ')}. Base: ${toolContext.totalRows} pontos de midia.`,
    ].join(' ');

    return [
      { role: 'system', content: systemMessage },
      ...messages
        .filter((message) => message && typeof message.content === 'string' && ['user', 'assistant'].includes(message.role))
        .map((message) => {
          if (message.role === 'assistant' && message.context) {
            return {
              role: 'assistant',
              content: `${message.content}\n\n[contexto_interno]\n${JSON.stringify(message.context)}\n[/contexto_interno]`,
            };
          }

          return { role: message.role, content: message.content };
        }),
    ];
  }

  async function answer(messages) {
    const { client, model } = ensureClient();
    const toolContext = datasetService.getToolContext();
    const chatMessages = buildMessages(messages, toolContext);

    const tools = [
      {
        type: 'function',
        function: {
          name: 'count_distinct',
          description: 'Conta quantos valores distintos existem em uma coluna, com filtros opcionais. Use para perguntas como "em quantas cidades temos midia?", "quantos exibidores distintos?", "em quantos estados?". Retorna o numero exato sem limitacao de paginacao.',
          parameters: {
            type: 'object',
            properties: {
              column: { type: 'string', description: 'Nome da coluna para contar valores distintos (ex: cidade, estado, exibidor).' },
              filters: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    column: { type: 'string' },
                    operator: { type: 'string' },
                    value: { oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'array', items: { oneOf: [{ type: 'string' }, { type: 'number' }] } }] },
                  },
                  required: ['column', 'operator'],
                },
              },
            },
            required: ['column'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'query_base',
          description: 'Consulta a aba Base tratada com filtros, agrupamentos, agregacoes, ordenacao e selecao de linhas.',
          parameters: {
            type: 'object',
            properties: {
              filters: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    column: { type: 'string' },
                    operator: { type: 'string' },
                    value: {
                      oneOf: [
                        { type: 'string' },
                        { type: 'number' },
                        { type: 'array', items: { oneOf: [{ type: 'string' }, { type: 'number' }] } },
                      ],
                    },
                  },
                  required: ['column', 'operator'],
                },
              },
              groupBy: {
                type: 'array',
                items: { type: 'string' },
              },
              metric: {
                type: 'string',
                enum: ['count', 'sum', 'avg', 'min', 'max'],
              },
              metricColumn: {
                type: 'string',
              },
              limit: {
                type: 'number',
              },
              select: {
                type: 'array',
                items: { type: 'string' },
              },
            },
          },
        },
      },
    ];

    const isOllama = !process.env.GEMINI_API_KEY;

    let lastQueryResult = null;
    let lastDistinctResult = null;
    let response = await client.chat.completions.create({
      model,
      temperature: 0.1,
      messages: chatMessages,
      tools,
      ...(isOllama ? {} : { tool_choice: 'auto' }),
    });

    let assistantMessage = response.choices[0]?.message;
    let toolsWereCalled = false;

    while (assistantMessage?.tool_calls?.length) {
      toolsWereCalled = true;
      chatMessages.push(assistantMessage);

      for (const toolCall of assistantMessage.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments || '{}');
        console.log('[tool call]', toolCall.function.name, JSON.stringify(args));
        let result;

        if (toolCall.function.name === 'query_base') {
          result = datasetService.query(args);
          lastQueryResult = result;
        } else if (toolCall.function.name === 'count_distinct') {
          result = datasetService.countDistinct(args);
          lastDistinctResult = result;
        } else if (toolCall.function.name === 'list_distinct_values') {
          result = datasetService.listDistinctValues(args);
          lastDistinctResult = result;
        } else {
          result = { error: `Ferramenta desconhecida: ${toolCall.function.name}` };
        }

        chatMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }

      response = await client.chat.completions.create({
        model,
        temperature: 0.1,
        messages: chatMessages,
        tools,
        ...(isOllama ? {} : { tool_choice: 'auto' }),
      });

      assistantMessage = response.choices[0]?.message;
    }

    // Se o modelo respondeu sem usar nenhuma ferramenta, forçar uma nova tentativa
    if (!toolsWereCalled) {
      console.log('[chat] modelo nao usou ferramenta — forcando retry');
      chatMessages.push({
        role: 'user',
        content: 'Voce precisa chamar uma ferramenta (query_base ou count_distinct) para responder com dados reais. Chame a ferramenta agora.',
      });

      response = await client.chat.completions.create({
        model,
        temperature: 0.1,
        messages: chatMessages,
        tools,
        ...(isOllama ? {} : { tool_choice: 'auto' }),
      });

      assistantMessage = response.choices[0]?.message;

      while (assistantMessage?.tool_calls?.length) {
        chatMessages.push(assistantMessage);

        for (const toolCall of assistantMessage.tool_calls) {
          const args = JSON.parse(toolCall.function.arguments || '{}');
          console.log('[retry tool call]', toolCall.function.name, JSON.stringify(args));
          let result;

          if (toolCall.function.name === 'query_base') {
            result = datasetService.query(args);
            lastQueryResult = result;
          } else if (toolCall.function.name === 'count_distinct') {
            result = datasetService.countDistinct(args);
            lastDistinctResult = result;
          } else {
            result = { error: `Ferramenta desconhecida: ${toolCall.function.name}` };
          }

          chatMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(result),
          });
        }

        response = await client.chat.completions.create({
          model,
          temperature: 0.1,
          messages: chatMessages,
          tools,
          ...(isOllama ? {} : { tool_choice: 'auto' }),
        });

        assistantMessage = response.choices[0]?.message;
      }
    }

    return {
      answer: assistantMessage?.content || 'Nao consegui gerar uma resposta.',
      model,
      result: lastQueryResult ? lastQueryResult.presentation : null,
      lastQuery: lastQueryResult ? lastQueryResult.query : null,
    };
  }

  return { answer };
}

module.exports = {
  createChatService,
};
