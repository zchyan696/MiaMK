// formatValue, createMessage, createTypingIndicator vêm de shared.js

const statusEl = document.getElementById('status');
const formEl = document.getElementById('query-form');
const feedEl = document.getElementById('conversation-feed');
const exportButtonEl = document.getElementById('export-button');
const resetButtonEl = document.getElementById('reset-button');
const questionButtons = document.querySelectorAll('.question-chip');
const chatFormEl = document.getElementById('chat-form');
const chatInputEl = document.getElementById('chat-input');

let chatHistory = [];

const selects = {
  estado: document.getElementById('estado'),
  cidade: document.getElementById('cidade'),
  exibidor: document.getElementById('exibidor'),
  tipo: document.getElementById('tipo'),
  tipo_de_midia: document.getElementById('tipo-de-midia'),
  vertical: document.getElementById('vertical'),
  tipo_de_exposicao: document.getElementById('tipo-de-exposicao'),
  groupBy: document.getElementById('group-by'),
  metric: document.getElementById('metric'),
  limit: document.getElementById('limit'),
};

let lastTable = null;

const CASCADE_ORDER = ['estado', 'cidade', 'exibidor', 'tipo', 'tipo_de_midia', 'vertical', 'tipo_de_exposicao'];
const PLACEHOLDERS = {
  estado: 'Todos os estados',
  cidade: 'Todas as cidades',
  exibidor: 'Todos os exibidores',
  tipo: 'Todos os tipos',
  tipo_de_midia: 'Todos os tipos de mídia',
  vertical: 'Todas as verticais',
  tipo_de_exposicao: 'Todas as exposições',
};

async function refreshDownstream(changedKey) {
  const changedIndex = CASCADE_ORDER.indexOf(changedKey);
  const downstream = CASCADE_ORDER.slice(changedIndex + 1);
  const filters = CASCADE_ORDER.slice(0, changedIndex + 1)
    .filter((key) => selects[key].value)
    .map((key) => ({ column: key, operator: 'eq', value: selects[key].value }));

  await Promise.all(downstream.map(async (key) => {
    try {
      const response = await fetch('/api/consulta/filtered-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ column: key, filters }),
      });
      const data = await response.json();
      const currentVal = selects[key].value;
      fillSelect(selects[key], data.values, PLACEHOLDERS[key]);
      if (data.values.some((v) => v.value === currentVal)) {
        selects[key].value = currentVal;
      }
    } catch (_) {}
  }));
}

function fillSelect(select, values, placeholder) {
  select.innerHTML = '';
  const first = document.createElement('option');
  first.value = '';
  first.textContent = placeholder;
  select.appendChild(first);

  for (const item of values) {
    const option = document.createElement('option');
    option.value = item.value;
    option.textContent = `${item.value} (${item.count})`;
    select.appendChild(option);
  }
}

function createSummaryBlock(result, queryParams) {
  const block = document.createElement('div');
  block.className = 'result-block';

  const cards = document.createElement('div');
  cards.className = 'summary-grid';

  const items = [
    { label: 'Registros filtrados', value: result.presentation.summary.matchedRows },
    { label: 'Modo', value: result.presentation.summary.mode === 'grouped' ? 'Agrupado' : 'Linhas' },
    { label: 'Métrica', value: result.presentation.summary.metric },
  ];

  if (result.presentation.summary.aggregate !== null && result.presentation.summary.aggregate !== undefined) {
    items.push({ label: 'Agregado', value: result.presentation.summary.aggregate });
  }

  for (const item of items) {
    const card = document.createElement('div');
    card.className = 'summary-card';
    card.innerHTML = `<p>${item.label}</p><strong>${formatValue(item.value)}</strong>`;
    cards.appendChild(card);
  }
  block.appendChild(cards);

  const filters = result.presentation.summary.filters || [];
  if (filters.length) {
    const filterLine = document.createElement('div');
    filterLine.className = 'filters-line';
    filterLine.textContent = filters.map((f) => `${f.label} = ${Array.isArray(f.value) ? f.value.join(', ') : f.value}`).join(' | ');
    block.appendChild(filterLine);
  }

  const table = result.presentation.table;
  if (table?.columns?.length && table?.rows?.length) {
    const wrapper = document.createElement('div');
    wrapper.className = 'result-table-wrapper';

    const tbl = document.createElement('table');
    tbl.className = 'result-table';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    for (const col of table.columns) {
      const th = document.createElement('th');
      th.textContent = col.label || col.key;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    tbl.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const row of table.rows) {
      const tr = document.createElement('tr');
      for (const col of table.columns) {
        const td = document.createElement('td');
        td.textContent = formatValue(row[col.key]);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    tbl.appendChild(tbody);
    wrapper.appendChild(tbl);
    block.appendChild(wrapper);
  }

  const totalRows = result.presentation.summary.matchedRows || 0;
  if (totalRows > 0 && queryParams) {
    const exportRow = document.createElement('div');
    exportRow.className = 'export-row';

    if (table?.columns?.length && table?.rows?.length) {
      const tableBtn = document.createElement('button');
      tableBtn.className = 'download-data-btn';
      tableBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Exportar tabela (${table.rows.length.toLocaleString('pt-BR')} linhas)`;
      tableBtn.addEventListener('click', () => exportTableXlsx(table, tableBtn));
      exportRow.appendChild(tableBtn);
    }

    const rawBtn = document.createElement('button');
    rawBtn.className = 'download-data-btn';
    rawBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Exportar registros completos (${totalRows.toLocaleString('pt-BR')} linhas)`;
    rawBtn.addEventListener('click', () => exportXlsx(queryParams, rawBtn));
    exportRow.appendChild(rawBtn);

    block.appendChild(exportRow);
  }

  return block;
}

function buildPromptText(meta = {}) {
  if (meta.prompt) return meta.prompt;

  const parts = [];
  const filters = [
    ['estado', 'estado'],
    ['cidade', 'cidade'],
    ['exibidor', 'exibidor'],
    ['tipo', 'tipo'],
    ['tipo_de_midia', 'tipo de mídia'],
    ['vertical', 'vertical'],
    ['tipo_de_exposicao', 'exposição'],
  ];

  for (const [key, label] of filters) {
    if (selects[key].value) parts.push(`${label}: ${selects[key].value}`);
  }

  const groupBy = selects.groupBy.value ? `agrupado por ${selects.groupBy.options[selects.groupBy.selectedIndex].text}` : 'sem agrupamento';
  const metric = selects.metric.options[selects.metric.selectedIndex].text;

  return parts.length
    ? `Analise ${parts.join(', ')} com ${metric.toLowerCase()} e ${groupBy}.`
    : `Mostre uma visão geral da base com ${metric.toLowerCase()} e ${groupBy}.`;
}

function buildResultText(result) {
  const matched = result.presentation.summary.matchedRows;
  const grouped = result.presentation.summary.mode === 'grouped';
  const aggregate = result.presentation.summary.aggregate;

  if (grouped) return `Encontrei ${formatValue(matched)} registros e organizei a resposta em ranking.`;
  if (aggregate !== null && aggregate !== undefined) return `Encontrei ${formatValue(matched)} registros. O agregado pedido retorna ${formatValue(aggregate)}.`;
  return `Encontrei ${formatValue(matched)} registros com esse contexto.`;
}

function buildQueryPayload() {
  const filters = [];
  const map = [
    ['estado', 'estado'],
    ['cidade', 'cidade'],
    ['exibidor', 'exibidor'],
    ['tipo', 'tipo'],
    ['tipo_de_midia', 'tipo_de_midia'],
    ['vertical', 'vertical'],
    ['tipo_de_exposicao', 'tipo_de_exposicao'],
  ];

  for (const [id, column] of map) {
    const value = selects[id].value;
    if (value) filters.push({ column, operator: 'eq', value });
  }

  return {
    filters,
    groupBy: selects.groupBy.value ? [selects.groupBy.value] : [],
    metric: selects.metric.value,
    metricColumn: 'fluxo_de_passantes',
    limit: Number(selects.limit.value),
    sort: { by: 'value', direction: 'desc' },
  };
}

function buildDynamicSuggestions(lastQuery) {
  if (!lastQuery) return [];

  const suggestions = [];
  const filters = lastQuery.filters || [];
  const groupBy = lastQuery.groupBy || [];

  const cidadeFilter = filters.find((f) => f.column === 'cidade');
  const estadoFilter = filters.find((f) => f.column === 'estado');
  const exibidorFilter = filters.find((f) => f.column === 'exibidor');
  const tipoMidiaFilter = filters.find((f) => f.column === 'tipo_de_midia');

  const groupedByCidade = groupBy.includes('cidade');
  const groupedByEstado = groupBy.includes('estado');
  const groupedByExibidor = groupBy.includes('exibidor');

  if (cidadeFilter) {
    const cidade = cidadeFilter.value;
    if (!groupedByExibidor) suggestions.push(`Quais exibidores atuam em ${cidade}?`);
    if (!tipoMidiaFilter) suggestions.push(`Que tipos de mídia existem em ${cidade}?`);
    suggestions.push(`Como ${cidade} se compara com outras cidades?`);
  } else if (estadoFilter) {
    const estado = estadoFilter.value;
    if (!groupedByCidade) suggestions.push(`Quais cidades têm mais pontos em ${estado}?`);
    if (!groupedByExibidor) suggestions.push(`Quem domina o inventário em ${estado}?`);
    suggestions.push(`Que tipos de mídia predominam em ${estado}?`);
  } else if (groupedByCidade) {
    suggestions.push('Quais exibidores lideram em São Paulo?');
    suggestions.push('Como está a distribuição por tipo de mídia?');
    suggestions.push('Qual cidade tem mais mídia digital?');
  } else if (groupedByEstado) {
    suggestions.push('Detalhar as cidades do estado líder?');
    suggestions.push('Quem são os maiores exibidores do Brasil?');
    suggestions.push('Qual a distribuição por tipo de exposição?');
  } else if (groupedByExibidor) {
    if (!exibidorFilter) suggestions.push('Qual exibidor tem mais pontos digitais?');
    suggestions.push('Como os exibidores se distribuem por estado?');
    suggestions.push('Qual a média de fluxo por exibidor?');
  } else {
    suggestions.push('Quais são as 10 cidades com mais pontos?');
    suggestions.push('Quem são os maiores exibidores?');
    suggestions.push('Como está a distribuição por tipo de mídia?');
  }

  return suggestions.slice(0, 3);
}

function updateSuggestions(lastQuery) {
  const suggestionsEl = document.getElementById('suggestions');
  const dynamic = buildDynamicSuggestions(lastQuery);
  if (!dynamic.length) return;

  suggestionsEl.innerHTML = '';
  for (const text of dynamic) {
    const btn = document.createElement('button');
    btn.className = 'question-chip';
    btn.textContent = text;
    btn.addEventListener('click', async () => {
      chatInputEl.value = '';
      await sendChat(text);
    });
    suggestionsEl.appendChild(btn);
  }
}

function createClarificationBlock(clarification) {
  const block = document.createElement('div');
  block.className = 'clarification-block';

  const question = document.createElement('p');
  question.className = 'clarification-question';
  question.textContent = clarification.question;
  block.appendChild(question);

  const buttons = document.createElement('div');
  buttons.className = 'clarification-options';

  for (const option of clarification.options) {
    const btn = document.createElement('button');
    btn.className = 'clarification-btn';
    btn.textContent = option.label;
    btn.addEventListener('click', () => {
      block.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      btn.classList.add('clarification-btn--chosen');
      sendChat(option.label);
    });
    buttons.appendChild(btn);
  }

  block.appendChild(buttons);
  return block;
}

async function sendChat(text) {
  chatHistory.push({ role: 'user', content: text });

  const userMessage = createMessage('user', 'Você', text);
  feedEl.appendChild(userMessage);

  const typing = createTypingIndicator();
  feedEl.appendChild(typing);
  feedEl.scrollTop = feedEl.scrollHeight;
  chatInputEl.disabled = true;

  try {
    const response = await fetch('/api/consulta/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: chatHistory }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Falha no chat.');

    typing.remove();
    chatHistory.push({ role: 'assistant', content: data.answer });

    const assistantMessage = createMessage('assistant', 'Assistente IA', data.answer);
    if (data.result && data.lastQuery) {
      lastTable = data.result.table;
      exportButtonEl.disabled = false;
      assistantMessage.querySelector('.message-content').appendChild(createSummaryBlock({ presentation: data.result }, data.lastQuery));
      updateSuggestions(data.lastQuery);
    }
    if (data.clarification) {
      assistantMessage.querySelector('.message-content').appendChild(createClarificationBlock(data.clarification));
    }
    feedEl.appendChild(assistantMessage);
    feedEl.scrollTop = feedEl.scrollHeight;
  } catch (error) {
    typing.remove();
    chatHistory.pop();
    const errMessage = createMessage('assistant', 'Erro', error.message);
    feedEl.appendChild(errMessage);
    feedEl.scrollTop = feedEl.scrollHeight;
  } finally {
    chatInputEl.disabled = false;
    chatInputEl.focus();
  }
}

async function runQuery(meta = {}) {
  const payload = buildQueryPayload();
  const userMessage = createMessage('user', 'Você perguntou', buildPromptText(meta));
  feedEl.appendChild(userMessage);

  const response = await fetch('/api/consulta/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Falha ao consultar a base.');

  lastTable = data.presentation.table;
  exportButtonEl.disabled = false;

  const assistantMessage = createMessage('assistant', 'Assistente local', buildResultText(data));
  assistantMessage.querySelector('.message-content').appendChild(createSummaryBlock(data, buildQueryPayload()));
  feedEl.appendChild(assistantMessage);
  feedEl.scrollTop = feedEl.scrollHeight;
  updateSuggestions(data.query);
}

async function exportTableXlsx(table, btn) {
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = 'Gerando arquivo...';
  try {
    const response = await fetch('/api/consulta/export-table-xlsx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Falha ao exportar.');
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'tabela-clone-mia.xlsx';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    alert(error.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = original;
  }
}

async function exportXlsx(queryParams, btn) {
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = 'Gerando arquivo...';
  try {
    const response = await fetch('/api/consulta/export-xlsx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: queryParams }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Falha ao exportar.');
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'resultado-clone-mia.xlsx';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    alert(error.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = original;
  }
}

async function exportCsv() {
  if (!lastTable) return;

  const response = await fetch('/api/consulta/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ table: lastTable }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Falha ao exportar CSV.');
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'resultado-base-spotifinder.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function resetFilters() {
  Object.values(selects).forEach((select) => { select.value = ''; });
  selects.metric.value = 'count';
  selects.limit.value = '20';
}

function applyPreset(name) {
  resetFilters();
  let prompt = '';

  if (name === 'top-estados') {
    selects.groupBy.value = 'estado';
    prompt = 'Onde o inventário total está mais concentrado no Brasil?';
  } else if (name === 'top-cidades-rj') {
    selects.estado.value = 'RJ';
    selects.groupBy.value = 'cidade';
    prompt = 'Como o inventário do estado do Rio de Janeiro se distribui por cidade?';
  } else if (name === 'digitais-sp') {
    selects.estado.value = 'SP';
    selects.tipo.value = 'DIGITAL';
    selects.groupBy.value = 'exibidor';
    prompt = 'Quem domina o inventário digital em São Paulo?';
  } else if (name === 'outdoors-rio') {
    selects.cidade.value = 'RIO DE JANEIRO';
    selects.tipo_de_midia.value = 'OUTDOOR';
    selects.groupBy.value = 'exibidor';
    prompt = 'Quais exibidores lideram outdoor na cidade do Rio de Janeiro?';
  } else if (name === 'verticais-df') {
    selects.estado.value = 'DF';
    selects.groupBy.value = 'vertical';
    prompt = 'Que verticais concentram mais inventário no Distrito Federal?';
  } else if (name === 'aeroportos-br') {
    selects.tipo_de_midia.value = 'AEROPORTO';
    selects.groupBy.value = 'estado';
    prompt = 'Em quais estados a mídia de aeroporto aparece com mais força?';
  }

  runQuery({ prompt }).catch((error) => alert(error.message));
}

async function loadOptions() {
  const [healthResponse, optionsResponse] = await Promise.all([fetch('/api/health'), fetch('/api/consulta/options')]);
  const health = await healthResponse.json();
  const options = await optionsResponse.json();

  statusEl.textContent = `${health.records.toLocaleString('pt-BR')} registros prontos para conversa local`;
  fillSelect(selects.estado, options.estados, 'Todos os estados');
  fillSelect(selects.cidade, options.cidades, 'Todas as cidades');
  fillSelect(selects.exibidor, options.exibidores, 'Todos os exibidores');
  fillSelect(selects.tipo, options.tipos, 'Todos os tipos');
  fillSelect(selects.tipo_de_midia, options.tiposMidia, 'Todos os tipos de mídia');
  fillSelect(selects.vertical, options.verticais, 'Todas as verticais');
  fillSelect(selects.tipo_de_exposicao, options.exposicoes, 'Todas as exposições');
}

// ── Event listeners ──────────────────────────────────────────────────────────

formEl.addEventListener('submit', async (event) => {
  event.preventDefault();
  try { await runQuery(); } catch (error) { alert(error.message); }
});

resetButtonEl.addEventListener('click', () => {
  resetFilters();
  updateQuickAnalysis();
});

exportButtonEl.addEventListener('click', async () => {
  try { await exportCsv(); } catch (error) { alert(error.message); }
});

for (const button of questionButtons) {
  button.addEventListener('click', () => applyPreset(button.dataset.preset));
}

document.getElementById('sidebar-toggle').addEventListener('click', () => {
  document.querySelector('.app-shell').classList.toggle('sidebar-collapsed');
});

document.getElementById('new-chat-button').addEventListener('click', () => {
  chatHistory = [];
  lastTable = null;
  exportButtonEl.disabled = true;
  feedEl.innerHTML = '';
  const intro = document.createElement('div');
  intro.className = 'intro-block';
  intro.innerHTML = '<div class="intro-avatar">M</div><p class="intro-text">Olá! Sou o Clone MIA. Faça uma pergunta sobre a base de inventário ou escolha uma sugestão abaixo.</p>';
  feedEl.appendChild(intro);
});

chatFormEl.addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = chatInputEl.value.trim();
  if (!text) return;
  chatInputEl.value = '';
  await sendChat(text);
});

document.getElementById('extract-button').addEventListener('click', async () => {
  const btn = document.getElementById('extract-button');
  await exportXlsx(buildQueryPayload(), btn);
});

// ── Quick Analysis ───────────────────────────────────────────────────────────

const QUICK_ANALYSIS_OPTIONS = [
  { key: 'exibidor',          label: 'Por Exibidor' },
  { key: 'cidade',            label: 'Por Praça' },
  { key: 'tipo_de_midia',     label: 'Por Tipo de Mídia' },
  { key: 'tipo',              label: 'Por Formato' },
  { key: 'vertical',          label: 'Por Vertical' },
  { key: 'tipo_de_exposicao', label: 'Por Exposição' },
  { key: 'estado',            label: 'Por Estado' },
];

function updateQuickAnalysis() {
  const qaEl = document.getElementById('quick-analysis');
  const ctxEl = document.getElementById('quick-analysis-context');
  const chipsEl = document.getElementById('quick-analysis-chips');

  const activeFilters = CASCADE_ORDER
    .filter((key) => selects[key]?.value)
    .map((key) => selects[key].value);

  if (!activeFilters.length) { qaEl.classList.add('hidden'); return; }

  const filteredKeys = new Set(CASCADE_ORDER.filter((k) => selects[k]?.value));
  const options = QUICK_ANALYSIS_OPTIONS.filter((o) => !filteredKeys.has(o.key));

  if (!options.length) { qaEl.classList.add('hidden'); return; }

  ctxEl.textContent = activeFilters.join(' · ');
  chipsEl.innerHTML = '';

  for (const opt of options) {
    const btn = document.createElement('button');
    btn.className = 'qa-chip';
    btn.type = 'button';
    btn.textContent = opt.label;
    btn.addEventListener('click', () => {
      selects.groupBy.value = opt.key;
      selects.metric.value = 'count';
      runQuery({ prompt: `Análise por ${opt.label.replace('Por ', '').toLowerCase()} — ${activeFilters.join(', ')}` }).catch((err) => alert(err.message));
    });
    chipsEl.appendChild(btn);
  }

  qaEl.classList.remove('hidden');
}

for (const key of CASCADE_ORDER) {
  selects[key].addEventListener('change', () => {
    refreshDownstream(key);
    updateQuickAnalysis();
  });
}

loadOptions().catch(() => {
  statusEl.textContent = 'Nao foi possivel carregar a base local.';
});
