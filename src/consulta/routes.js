const express = require('express');
const XLSX = require('xlsx');
const { createChatService } = require('./chatService');

function createConsultaRouter(datasetService) {
  const router = express.Router();
  const chatService = createChatService({ datasetService });

  router.get('/options', (_req, res) => {
    try {
      res.json({
        estados:   datasetService.listDistinctValues({ column: 'estado',           limit: 100  }).values,
        cidades:   datasetService.listDistinctValues({ column: 'cidade',           limit: 300  }).values,
        exibidores:datasetService.listDistinctValues({ column: 'exibidor',         limit: 200  }).values,
        tipos:     datasetService.listDistinctValues({ column: 'tipo',             limit: 20   }).values,
        tiposMidia:datasetService.listDistinctValues({ column: 'tipo_de_midia',    limit: 150  }).values,
        verticais: datasetService.listDistinctValues({ column: 'vertical',         limit: 30   }).values,
        exposicoes:datasetService.listDistinctValues({ column: 'tipo_de_exposicao',limit: 10   }).values,
      });
    } catch (error) {
      res.status(500).json({ error: 'Falha ao carregar as opcoes.' });
    }
  });

  router.post('/filtered-options', (req, res) => {
    try {
      const { column, filters = [] } = req.body;
      const result = datasetService.query({ filters, groupBy: [column], limit: 2000, _bypassLimit: true });
      const values = result.groups
        .map((g) => ({ value: g.group[column], count: g.rowCount }))
        .filter((v) => v.value && v.value !== '(vazio)');
      res.json({ values });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/query', (req, res) => {
    try {
      const result = datasetService.query(req.body || {});
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message || 'Falha ao executar a consulta.' });
    }
  });

  router.post('/chat', async (req, res) => {
    try {
      const { messages } = req.body;
      if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'Envie um array de messages.' });
      }
      const result = await chatService.answer(messages);
      res.json(result);
    } catch (error) {
      console.error('[consulta chat error]', error);
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  router.post('/export-xlsx', (req, res) => {
    try {
      const queryParams = req.body?.query;
      if (!queryParams) return res.status(400).json({ error: 'Parametros de query ausentes.' });

      const result = datasetService.query({ filters: queryParams.filters || [], limit: 100000, _bypassLimit: true });
      const table  = result.presentation.table;
      if (!table?.columns?.length) return res.status(400).json({ error: 'Nenhum dado para exportar.' });

      const header = table.columns.map((c) => String(c.label ?? c.key));
      const matrix = [header, ...table.rows.map((row) =>
        table.columns.map((c) => row?.[c.key] ?? '')
      )];

      const ws  = XLSX.utils.aoa_to_sheet(matrix);
      const wb  = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Resultado');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="resultado-clone-mia.xlsx"');
      return res.send(buf);
    } catch (error) {
      console.error('[consulta export-xlsx error]', error);
      return res.status(500).json({ error: 'Falha ao exportar o resultado.' });
    }
  });

  router.post('/export-table-xlsx', (req, res) => {
    try {
      const table = req.body?.table;
      if (!table || !Array.isArray(table.columns) || !Array.isArray(table.rows)) {
        return res.status(400).json({ error: 'Tabela inválida para exportação.' });
      }

      const header = table.columns.map((c) => String(c.label ?? c.key));
      const matrix = [header, ...table.rows.map((row) =>
        table.columns.map((c) => row?.[c.key] ?? '')
      )];

      const ws  = XLSX.utils.aoa_to_sheet(matrix);
      const wb  = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Tabela');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="tabela-clone-mia.xlsx"');
      return res.send(buf);
    } catch (error) {
      console.error('[consulta export-table-xlsx error]', error);
      return res.status(500).json({ error: 'Falha ao exportar a tabela.' });
    }
  });

  router.post('/export', (req, res) => {
    try {
      const table = req.body?.table;
      if (!table || !Array.isArray(table.columns) || !Array.isArray(table.rows)) {
        return res.status(400).json({ error: 'Resultado invalido para exportacao.' });
      }

      const header = table.columns.map((c) => String(c.label ?? c.key));
      const matrix = [header, ...table.rows.map((row) =>
        table.columns.map((c) => { const v = row?.[c.key]; return v == null ? '' : String(v); })
      )];

      const ws  = XLSX.utils.aoa_to_sheet(matrix);
      const csv = XLSX.utils.sheet_to_csv(ws);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="resultado-base-spotifinder.csv"');
      return res.send(`\uFEFF${csv}`);
    } catch (_error) {
      return res.status(500).json({ error: 'Falha ao exportar o resultado.' });
    }
  });

  return router;
}

module.exports = createConsultaRouter;
