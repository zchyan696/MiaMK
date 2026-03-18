const path = require('path');

const XLSX = require('xlsx');

const HEADER_MAP = {
  Codigo: 'codigo',
  'Nome (Endereço)': 'nome_endereco',
  Bairro: 'bairro',
  Cidade: 'cidade',
  Estado: 'estado',
  Latitude: 'latitude',
  Longitude: 'longitude',
  Segmento: 'segmento',
  Exibidor: 'exibidor',
  Tipo: 'tipo',
  'Tipo de midia': 'tipo_de_midia',
  Status: 'status',
  Classificação: 'classificacao',
  Vertical: 'vertical',
  'Tipo de exposição': 'tipo_de_exposicao',
  'Fluxo de passantes': 'fluxo_de_passantes',
};

const COLUMN_DESCRIPTIONS = {
  codigo: 'Identificador do ponto',
  nome_endereco: 'Nome do local ou endereço',
  bairro: 'Bairro',
  cidade: 'Cidade',
  estado: 'UF',
  latitude: 'Latitude',
  longitude: 'Longitude',
  segmento: 'Segmento complementar',
  exibidor: 'Operador/exibidor',
  tipo: 'Tipo principal do ativo',
  tipo_de_midia: 'Categoria da mídia',
  status: 'Status operacional',
  classificacao: 'Classificação geral',
  vertical: 'Vertical de negócio',
  tipo_de_exposicao: 'Indoor ou outdoor',
  fluxo_de_passantes: 'Fluxo informado na base',
};

const NUMERIC_COLUMNS = new Set(['latitude', 'longitude', 'fluxo_de_passantes']);
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function normalizeString(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function toNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeRow(rawRow) {
  const row = {};

  for (const [originalHeader, internalKey] of Object.entries(HEADER_MAP)) {
    const rawValue = rawRow[originalHeader];
    row[internalKey] = NUMERIC_COLUMNS.has(internalKey) ? toNumber(rawValue) : String(rawValue ?? '').trim();
  }

  return row;
}

function compareValues(a, b, direction) {
  if (a === b) {
    return 0;
  }

  if (a === null || a === undefined) {
    return 1;
  }

  if (b === null || b === undefined) {
    return -1;
  }

  if (typeof a === 'number' && typeof b === 'number') {
    return direction === 'asc' ? a - b : b - a;
  }

  return direction === 'asc'
    ? String(a).localeCompare(String(b), 'pt-BR')
    : String(b).localeCompare(String(a), 'pt-BR');
}

function applyFilter(row, filter) {
  const operator = filter.operator || 'eq';
  const column = filter.column;
  const currentValue = row[column];

  if (!(column in row)) {
    return false;
  }

  if (NUMERIC_COLUMNS.has(column)) {
    const left = toNumber(currentValue);
    const right = Array.isArray(filter.value) ? filter.value.map(toNumber) : toNumber(filter.value);

    switch (operator) {
      case 'eq':
        return left === right;
      case 'not_eq':
        return left !== right;
      case 'gt':
        return left !== null && right !== null && left > right;
      case 'gte':
        return left !== null && right !== null && left >= right;
      case 'lt':
        return left !== null && right !== null && left < right;
      case 'lte':
        return left !== null && right !== null && left <= right;
      case 'between':
        return (
          left !== null &&
          Array.isArray(right) &&
          right.length === 2 &&
          right[0] !== null &&
          right[1] !== null &&
          left >= right[0] &&
          left <= right[1]
        );
      case 'in':
        return Array.isArray(right) && right.includes(left);
      default:
        return false;
    }
  }

  const left = normalizeString(currentValue);
  const right = Array.isArray(filter.value) ? filter.value.map(normalizeString) : normalizeString(filter.value);

  switch (operator) {
    case 'eq':
      return left === right;
    case 'not_eq':
      return left !== right;
    case 'contains':
      return left.includes(right);
    case 'starts_with':
      return left.startsWith(right);
    case 'in':
      return Array.isArray(right) && right.includes(left);
    case 'is_empty':
      return left === '';
    case 'is_not_empty':
      return left !== '';
    default:
      return false;
  }
}

function createDatasetService({ workbookPath }) {
  const workbook = XLSX.readFile(workbookPath, { cellDates: false });
  const sheetName = 'Base tratada';
  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    throw new Error(`A aba "${sheetName}" não foi encontrada em ${path.basename(workbookPath)}.`);
  }

  const rawRows = XLSX.utils.sheet_to_json(sheet, {
    defval: '',
    raw: false,
  });

  const rows = rawRows.map(normalizeRow);
  const schema = Object.entries(HEADER_MAP).map(([label, key]) => ({
    key,
    label,
    type: NUMERIC_COLUMNS.has(key) ? 'number' : 'string',
    description: COLUMN_DESCRIPTIONS[key],
  }));
  const labelByKey = Object.fromEntries(schema.map((column) => [column.key, column.label]));

  function topValues(inputRows, column, limit) {
    const counts = new Map();
    for (const row of inputRows) {
      const value = row[column];
      const key = value === '' ? '(vazio)' : value;
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([value, count]) => ({ value, count }));
  }

  const quickStats = {
    totalRegistros: rows.length,
    topEstados: topValues(rows, 'estado', 8),
    topExibidores: topValues(rows, 'exibidor', 8),
    topTiposMidia: topValues(rows, 'tipo_de_midia', 8),
    topTipos: topValues(rows, 'tipo', 5),
  };

  function filterRows(filters = []) {
    if (!Array.isArray(filters) || !filters.length) {
      return rows;
    }

    return rows.filter((row) => filters.every((filter) => applyFilter(row, filter)));
  }

  function aggregate(inputRows, metric = 'count', metricColumn = 'fluxo_de_passantes') {
    switch (metric) {
      case 'count':
        return inputRows.length;
      case 'sum':
        return inputRows.reduce((sum, row) => sum + (toNumber(row[metricColumn]) || 0), 0);
      case 'avg':
        return inputRows.length ? aggregate(inputRows, 'sum', metricColumn) / inputRows.length : 0;
      case 'min': {
        const values = inputRows.map((row) => toNumber(row[metricColumn])).filter((value) => value !== null);
        return values.length ? Math.min(...values) : null;
      }
      case 'max': {
        const values = inputRows.map((row) => toNumber(row[metricColumn])).filter((value) => value !== null);
        return values.length ? Math.max(...values) : null;
      }
      default:
        throw new Error(`Métrica não suportada: ${metric}`);
    }
  }

  function summarizeFilters(filters = []) {
    return filters.map((filter) => ({
      column: filter.column,
      label: labelByKey[filter.column] || filter.column,
      operator: filter.operator || 'eq',
      value: filter.value,
    }));
  }

  function buildPresentation(result, querySpec) {
    const summary = {
      matchedRows: result.matchedRows,
      metric: result.metric,
      metricColumn: result.metricColumn,
      aggregate: Object.prototype.hasOwnProperty.call(result, 'aggregate') ? result.aggregate : null,
      mode: result.mode,
      filters: summarizeFilters(querySpec.filters),
      groupBy: querySpec.groupBy || [],
    };

    if (result.mode === 'grouped') {
      const columns = [
        ...(querySpec.groupBy || []).map((column) => ({
          key: column,
          label: labelByKey[column] || column,
        })),
        { key: 'rowCount', label: 'Registros' },
        { key: 'value', label: result.metric === 'count' ? 'Valor' : `${result.metric} (${labelByKey[result.metricColumn] || result.metricColumn})` },
      ];

      const rowsForTable = result.groups.map((item) => {
        const row = {};
        for (const column of querySpec.groupBy || []) {
          row[column] = item.group[column];
        }
        row.rowCount = item.rowCount;
        row.value = item.value;
        return row;
      });

      return {
        summary,
        table: {
          title: 'Resultado agrupado',
          columns,
          rows: rowsForTable,
        },
      };
    }

    const select = querySpec.select?.length ? querySpec.select : Object.values(HEADER_MAP);
    return {
      summary,
      table: {
        title: 'Linhas encontradas',
        columns: select.map((column) => ({
          key: column,
          label: labelByKey[column] || column,
        })),
        rows: result.rows,
      },
    };
  }

  function query(options = {}) {
    const querySpec = {
      filters: Array.isArray(options.filters) ? options.filters : [],
      groupBy: Array.isArray(options.groupBy) ? options.groupBy : [],
      metric: options.metric || 'count',
      metricColumn: options.metricColumn || 'fluxo_de_passantes',
      limit: options._bypassLimit ? (Number(options.limit) || 100000) : Math.min(Math.max(Number(options.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT),
      sort: { by: 'value', direction: 'desc' },
      select: Array.isArray(options.select) ? options.select : [],
    };

    const filteredRows = filterRows(querySpec.filters);

    let result;
    if (!querySpec.groupBy.length) {
      const rowsSelected = filteredRows.slice(0, querySpec.limit).map((row) => {
        if (!querySpec.select.length) {
          return row;
        }

        return Object.fromEntries(querySpec.select.filter((column) => column in row).map((column) => [column, row[column]]));
      });

      result = {
        mode: 'rows',
        matchedRows: filteredRows.length,
        metric: querySpec.metric,
        metricColumn: querySpec.metricColumn,
        aggregate: aggregate(filteredRows, querySpec.metric, querySpec.metricColumn),
        rows: rowsSelected,
      };
    } else {
      const groups = new Map();
      for (const row of filteredRows) {
        const keyValues = querySpec.groupBy.map((column) => row[column] || '(vazio)');
        const compositeKey = JSON.stringify(keyValues);
        if (!groups.has(compositeKey)) {
          groups.set(compositeKey, []);
        }
        groups.get(compositeKey).push(row);
      }

      const output = [...groups.entries()].map(([compositeKey, groupRows]) => {
        const values = JSON.parse(compositeKey);
        const group = {};
        querySpec.groupBy.forEach((column, index) => {
          group[column] = values[index];
        });

        return {
          group,
          value: aggregate(groupRows, querySpec.metric, querySpec.metricColumn),
          rowCount: groupRows.length,
        };
      });

      const sortBy = querySpec.sort?.by || 'value';
      const direction = querySpec.sort?.direction === 'asc' ? 'asc' : 'desc';

      output.sort((left, right) => {
        if (sortBy === 'value') {
          return compareValues(left.value, right.value, direction);
        }

        if (sortBy === 'rowCount') {
          return compareValues(left.rowCount, right.rowCount, direction);
        }

        return compareValues(left.group?.[sortBy], right.group?.[sortBy], direction);
      });

      result = {
        mode: 'grouped',
        matchedRows: filteredRows.length,
        metric: querySpec.metric,
        metricColumn: querySpec.metricColumn,
        groups: output.slice(0, querySpec.limit),
      };
    }

    return {
      ...result,
      query: querySpec,
      presentation: buildPresentation(result, querySpec),
    };
  }

  function listDistinctValues({ column, search = '', limit = DEFAULT_LIMIT } = {}) {
    if (!column || !schema.some((item) => item.key === column)) {
      throw new Error('Coluna inválida para listagem.');
    }

    const safeLimit = Math.min(Math.max(Number(limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const searchNormalized = normalizeString(search);
    const counts = new Map();

    for (const row of rows) {
      const value = row[column];
      const label = value === '' ? '(vazio)' : value;
      if (searchNormalized && !normalizeString(label).includes(searchNormalized)) {
        continue;
      }
      counts.set(label, (counts.get(label) || 0) + 1);
    }

    return {
      column,
      label: labelByKey[column] || column,
      values: [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, safeLimit)
        .map(([value, count]) => ({ value, count })),
    };
  }

  function getSchema() {
    return {
      workbook: path.basename(workbookPath),
      sheet: sheetName,
      columns: schema,
      stats: quickStats,
    };
  }

  function getToolContext() {
    return {
      workbook: path.basename(workbookPath),
      sheet: sheetName,
      totalRows: rows.length,
      columns: schema,
      quickStats,
      operators: ['eq', 'not_eq', 'contains', 'starts_with', 'in', 'gt', 'gte', 'lt', 'lte', 'between', 'is_empty', 'is_not_empty'],
      metrics: ['count', 'sum', 'avg', 'min', 'max'],
    };
  }

  function countDistinct({ column, filters = [] } = {}) {
    if (!column || !schema.some((item) => item.key === column)) {
      throw new Error('Coluna inválida para contagem distinta.');
    }

    const filteredRows = filterRows(filters);
    const distinct = new Set(filteredRows.map((row) => row[column]));
    return {
      column,
      label: labelByKey[column] || column,
      count: distinct.size,
      totalRows: filteredRows.length,
    };
  }

  return {
    getRowCount: () => rows.length,
    getSchema,
    getToolContext,
    query,
    listDistinctValues,
    countDistinct,
  };
}

module.exports = {
  createDatasetService,
};
