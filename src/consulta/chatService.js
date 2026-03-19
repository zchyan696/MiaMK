const OpenAI = require('openai');

function createChatService({ datasetService }) {
  function ensureClient() {
    if (process.env.GROQ_API_KEY) {
      return {
        client: new OpenAI({
          apiKey: process.env.GROQ_API_KEY,
          baseURL: 'https://api.groq.com/openai/v1',
        }),
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      };
    }

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
      'REGRA ABSOLUTA: responda SEMPRE e SOMENTE em portugues do Brasil. Nunca use outro idioma, nem parcialmente.',
      'Personalidade: direta, perspicaz, como um bom analista de mercado.',
      'CONCEITO FUNDAMENTAL: cada linha da base e um PONTO DE MIDIA (uma tela, outdoor ou painel fisico). Um EXIBIDOR e uma empresa que opera varios pontos. Nunca confunda pontos com exibidores.',
      'Ao responder, sempre use "pontos de midia" ou "ativos" para se referir a registros — nunca "exibidores" no lugar de contagem.',
      'SEMPRE chame uma ferramenta antes de responder. Nunca invente numeros.',
      'AMBIGUIDADE: se a pergunta mencionar um termo geografico ambiguo (ex: "rio" pode ser estado RJ ou cidade Rio de Janeiro ou cidades como Rio Preto, Rio Verde), use request_clarification com opcoes especificas ANTES de consultar os dados. Faca o mesmo para outros termos que possam gerar confusao.',
      'Para perguntas como "quantas cidades", "quantos exibidores distintos", "em quantos estados": use count_distinct.',
      'Para rankings, distribuicoes ou valores agregados: use query_base com groupBy e limit adequado.',
      'IMPORTANTE: para perguntas como "quais exibidores atuam", "que tipos existem", "quem opera em X" — SEMPRE use groupBy para obter valores distintos. Nunca use select sem groupBy para esse tipo de pergunta.',
      'IMPORTANTE: os valores da base estao em MAIUSCULAS. Nos filtros, use SEMPRE maiusculas (ex: tipo_de_midia="DIGITAL", cidade="SAO PAULO", estado="SP"). Nunca use letras minusculas ou mistas em valores de filtro.',
      'Para rankings de exibidores em uma cidade: groupBy=["exibidor"], filters por cidade, limit 20.',
      'Interprete os dados: destaque o que e surpreendente, relevante ou estrategico. Responda em 3 a 5 frases naturais.',
      `Colunas: ${toolContext.columns.map((c) => c.key).join(', ')}. Base: ${toolContext.totalRows} pontos de midia.`,
      `Exibidores conhecidos (empresas operadoras): ${toolContext.quickStats.topExibidores.map((e) => e.value).join(', ')}, entre outros. Qualquer nome que apareca na conversa como exibidor deve ser filtrado com column="exibidor", nao com tipo_de_midia.`,
      `Valores reais de tipo_de_midia na base: ${toolContext.quickStats.topTiposMidia.map((t) => t.value).join(', ')}. Use EXATAMENTE esses valores ao filtrar tipo_de_midia.`,
      `Valores reais de tipo na base: ${toolContext.quickStats.topTipos.map((t) => t.value).join(', ')}. Use EXATAMENTE esses valores ao filtrar tipo.`,
      `MAPEAMENTO DE TERMOS: quando o usuario pedir algo que nao bate exatamente com os valores acima, encontre o mais proximo. Exemplos: "banca digital" → tipo_de_midia contains "BANCA"; "outdoor" → tipo_de_midia="OUTDOOR"; "busdoor" → tipo_de_midia="BUSDOOR"; "digital" sozinho → tipo="DIGITAL". Se o usuario pedir um tipo especifico de midia, filtre tipo_de_midia, nao tipo.`,
      'IMPORTANTE: quando o usuario mencionar um nome que apareceu na resposta anterior (exibidor, cidade, tipo), interprete pelo contexto — nao trate nomes de empresas como tipos de midia.',
      'NOMES PARCIAIS: se o usuario usar um nome incompleto ou informal (ex: "silva paineis", "clear", "eletromidia"), use o operador contains em vez de eq para buscar. Ex: usuario diz "silva paineis" → filtro {column:"exibidor", operator:"contains", value:"SILVA PAINEIS"}. Nunca exija o nome exato.',
      'CONTEXTO GEOGRAFICO: se a conversa anterior tinha filtros ativos de cidade ou estado E o usuario faz uma pergunta de acompanhamento sobre um exibidor ou tipo sem especificar escopo, use request_clarification com duas opcoes: (1) dentro do filtro geografico anterior, (2) no Brasil inteiro. Exemplo: filtrou SAO JOSE DO RIO PRETO, usuario pergunta "esse silva paineis tem quais midias?" → pergunte: "Voce quer saber do Silva Paineis em Sao Jose do Rio Preto ou no Brasil inteiro?" com botoes para cada opcao. So pule a pergunta se o usuario ja especificou o escopo explicitamente.',
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
          name: 'request_clarification',
          description: 'Use quando a pergunta do usuario for ambigua e precisar de mais contexto antes de consultar os dados. Por exemplo: "rio" pode ser estado RJ, cidade Rio de Janeiro, ou outras cidades com "rio" no nome. Forneca opcoes claras e especificas para o usuario escolher.',
          parameters: {
            type: 'object',
            properties: {
              question: { type: 'string', description: 'Pergunta de esclarecimento para o usuario. Seja breve.' },
              options: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    label: { type: 'string', description: 'Texto do botao (ex: "Rio de Janeiro — estado (RJ)")' },
                    context: { type: 'string', description: 'Como interpretar essa opcao na proxima consulta (ex: "filtrar estado = RJ")' },
                  },
                  required: ['label'],
                },
              },
            },
            required: ['question', 'options'],
          },
        },
      },
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
                    operator: { type: 'string', enum: ['eq', 'not_eq', 'contains', 'starts_with', 'in', 'gt', 'gte', 'lt', 'lte', 'between', 'is_empty', 'is_not_empty'] },
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
                    operator: { type: 'string', enum: ['eq', 'not_eq', 'contains', 'starts_with', 'in', 'gt', 'gte', 'lt', 'lte', 'between', 'is_empty', 'is_not_empty'] },
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
                oneOf: [{ type: 'array', items: { type: 'string' } }, { type: 'null' }],
              },
              metric: {
                type: 'string',
                enum: ['count', 'sum', 'avg', 'min', 'max'],
              },
              metricColumn: {
                oneOf: [{ type: 'string' }, { type: 'null' }],
              },
              limit: {
                oneOf: [{ type: 'number' }, { type: 'null' }],
              },
              select: {
                oneOf: [{ type: 'array', items: { type: 'string' } }, { type: 'null' }],
              },
            },
          },
        },
      },
    ];

    const isOllama = !process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY;

    let lastQueryResult = null;
    let lastDistinctResult = null;
    let clarification = null;
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

        if (toolCall.function.name === 'request_clarification') {
          clarification = args;
          result = { status: 'aguardando_escolha_do_usuario' };
        } else if (toolCall.function.name === 'query_base') {
          if (args.groupBy === null) args.groupBy = [];
          if (args.select === null) args.select = [];
          if (args.metricColumn === null) delete args.metricColumn;
          if (args.limit === null) delete args.limit;
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
            if (args.groupBy === null) args.groupBy = [];
            if (args.select === null) args.select = [];
            if (args.metricColumn === null) delete args.metricColumn;
            if (args.limit === null) delete args.limit;
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
      clarification: clarification || null,
    };
  }

  return { answer };
}

module.exports = {
  createChatService,
};
