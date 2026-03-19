require('dotenv').config();

const express = require('express');
const path    = require('path');

const { createDatasetService } = require('./src/dataService');
const createConsultaRouter     = require('./src/consulta/routes');
const createPlanoRouter        = require('./src/plano-midia/routes');

const app          = express();
const port         = Number(process.env.PORT || 3000);
const workbookPath = path.join(__dirname, 'Base Spotifinder.xlsx');
const datasetService = createDatasetService({ workbookPath });

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (_req, res) => {
  res.json({
    ok:       true,
    workbook: path.basename(workbookPath),
    records:  datasetService.getRowCount(),
    mode:     'local',
  });
});

app.use('/api/consulta', createConsultaRouter(datasetService));
app.use('/api/plano',    createPlanoRouter(datasetService));

app.listen(port, () => {
  console.log(`Servidor ativo em http://localhost:${port}`);
});
