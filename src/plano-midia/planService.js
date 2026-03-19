// TODO: Implementar lógica de IA do Plano de Mídia
// Este serviço receberá:
//   - messages: histórico da conversa
//   - files: arquivos enviados pelo usuário (briefing, lista de praças, etc.)
// E usará o datasetService para cruzar com a Base Spotifinder.

function createPlanService({ datasetService }) {
  async function answer(_messages, _files) {
    throw new Error('Plano de Mídia ainda não implementado.');
  }

  return { answer };
}

module.exports = { createPlanService };
