// ── Active nav item ──────────────────────────────────────────────────────────
(function () {
  const path = window.location.pathname;
  let activeId = 'nav-menu';
  if (path.includes('consulta')) activeId = 'nav-consulta';
  else if (path.includes('plano-midia')) activeId = 'nav-plano-midia';
  document.getElementById(activeId)?.classList.add('active');
})();

// ── Shared utilities ─────────────────────────────────────────────────────────

function formatValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toLocaleString('pt-BR');
  }
  return value ?? '';
}

function createMessage(role, _title, content) {
  const article = document.createElement('article');
  article.className = `message ${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = role === 'user' ? 'Y' : 'M';
  article.appendChild(avatar);

  const messageContent = document.createElement('div');
  messageContent.className = 'message-content';

  const body = document.createElement('div');
  body.className = 'message-body';
  body.textContent = content;
  messageContent.appendChild(body);

  article.appendChild(messageContent);
  return article;
}

function createTypingIndicator() {
  const article = document.createElement('article');
  article.className = 'message assistant';
  article.id = 'typing-indicator';

  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = 'M';
  article.appendChild(avatar);

  const messageContent = document.createElement('div');
  messageContent.className = 'message-content';

  const body = document.createElement('div');
  body.className = 'message-body typing-dots';
  body.textContent = 'Pensando...';
  messageContent.appendChild(body);

  article.appendChild(messageContent);
  return article;
}
