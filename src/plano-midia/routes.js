const express = require('express');
const { createPlanService } = require('./planService');

function createPlanoRouter(datasetService) {
  const router = express.Router();
  const planService = createPlanService({ datasetService });

  router.post('/chat', async (req, res) => {
    try {
      const { messages, files } = req.body;
      if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'Envie um array de messages.' });
      }
      const result = await planService.answer(messages, files);
      res.json(result);
    } catch (error) {
      console.error('[plano chat error]', error);
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  return router;
}

module.exports = createPlanoRouter;
