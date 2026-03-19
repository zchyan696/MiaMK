// createMessage, createTypingIndicator vêm de shared.js

const pmFeedEl = document.getElementById('pm-feed');
const pmChatFormEl = document.getElementById('pm-chat-form');
const pmChatInputEl = document.getElementById('pm-chat-input');
const pmFileInputEl = document.getElementById('pm-file-input');
const pmFileListEl = document.getElementById('pm-file-list');

let pmChatHistory = [];
let pmAttachedFiles = [];

// ── File handling ────────────────────────────────────────────────────────────

pmFileInputEl.addEventListener('change', () => {
  const incoming = Array.from(pmFileInputEl.files);
  for (const f of incoming) {
    if (!pmAttachedFiles.some((existing) => existing.name === f.name)) {
      pmAttachedFiles.push(f);
    }
  }
  pmFileInputEl.value = '';
  renderFileList();
});

function renderFileList() {
  pmFileListEl.innerHTML = '';
  for (const file of pmAttachedFiles) {
    const chip = document.createElement('div');
    chip.className = 'file-chip';
    chip.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
      <span>${file.name}</span>
      <button class="file-chip-remove" type="button">×</button>
    `;
    chip.querySelector('.file-chip-remove').addEventListener('click', () => {
      pmAttachedFiles = pmAttachedFiles.filter((f) => f.name !== file.name);
      renderFileList();
    });
    pmFileListEl.appendChild(chip);
  }
}

// ── Chat ─────────────────────────────────────────────────────────────────────

pmChatFormEl.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = pmChatInputEl.value.trim();
  if (!text && pmAttachedFiles.length === 0) return;

  const displayText = text || `${pmAttachedFiles.length} arquivo(s) anexado(s)`;
  pmFeedEl.appendChild(createMessage('user', 'Você', displayText));
  pmFeedEl.scrollTop = pmFeedEl.scrollHeight;

  pmChatInputEl.value = '';
  pmAttachedFiles = [];
  renderFileList();

  // TODO: implementar chamada à API do Plano de Mídia
});

// ── New chat ─────────────────────────────────────────────────────────────────

document.getElementById('pm-new-chat').addEventListener('click', () => {
  pmChatHistory = [];
  pmAttachedFiles = [];
  renderFileList();
  pmFeedEl.innerHTML = '';
  const intro = document.createElement('div');
  intro.className = 'intro-block';
  intro.innerHTML = '<div class="intro-avatar">M</div><p class="intro-text">Olá! Envie arquivos e descreva o que precisa para montar seu plano de mídia.</p>';
  pmFeedEl.appendChild(intro);
});
