/**
 * script.js — AI-Powered Task Management Assistant
 *
 * Sections:
 *  1.  Application State
 *  2.  DOM References
 *  3.  Persistence (localStorage)
 *  4.  Utility Helpers
 *  5.  Task Render
 *  6.  Task CRUD
 *  7.  Task Filter
 *  8.  Edit Modal
 *  9.  AI — API Key Management
 *  10. AI — System Prompt Builder
 *  11. AI — Chat Renderer
 *  12. AI — Gemini API Call
 *  13. AI — Send Message Flow
 *  14. Event Listeners
 *  15. Initialise
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// 1. APPLICATION STATE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {{ id: string, text: string, completed: boolean }} Task
 * @type {Task[]}
 */
let tasks = [];

/** @type {'all' | 'active' | 'completed'} */
let currentFilter = 'all';

/** ID of task being edited; null when modal is closed. */
let editingId = null;

/** Prevents sending a new message while AI is responding. */
let isChatLoading = false;

// ─────────────────────────────────────────────────────────────────────────────
// 2. DOM REFERENCES
// ─────────────────────────────────────────────────────────────────────────────

// ── Task List ──
const taskForm       = /** @type {HTMLFormElement}      */ (document.getElementById('task-form'));
const taskInput      = /** @type {HTMLInputElement}     */ (document.getElementById('task-input'));
const taskList       = /** @type {HTMLUListElement}     */ (document.getElementById('task-list'));
const emptyState     = /** @type {HTMLElement}          */ (document.getElementById('empty-state'));
const emptyText      = /** @type {HTMLParagraphElement} */ (document.getElementById('empty-text'));
const itemsLeftLabel = /** @type {HTMLSpanElement}      */ (document.getElementById('items-left'));
const clearCompleted = /** @type {HTMLButtonElement}    */ (document.getElementById('clear-completed'));
const filterBtns     = /** @type {NodeListOf<HTMLButtonElement>} */ (document.querySelectorAll('.filter-btn'));

// ── Edit Modal ──
const editModal     = /** @type {HTMLElement}       */ (document.getElementById('edit-modal'));
const editInput     = /** @type {HTMLInputElement}  */ (document.getElementById('edit-input'));
const editCancelBtn = /** @type {HTMLButtonElement} */ (document.getElementById('edit-cancel'));
const editSaveBtn   = /** @type {HTMLButtonElement} */ (document.getElementById('edit-save'));

// ── AI Chat ──
const chatMessages  = /** @type {HTMLElement}       */ (document.getElementById('chat-messages'));
const chatInput     = /** @type {HTMLInputElement}  */ (document.getElementById('chat-input'));
const chatSendBtn   = /** @type {HTMLButtonElement} */ (document.getElementById('chat-send-btn'));
const quickPrompts  = /** @type {NodeListOf<HTMLButtonElement>} */ (document.querySelectorAll('.quick-prompt'));

// ── API Key ──
const apiKeyBtn     = /** @type {HTMLButtonElement} */ (document.getElementById('api-key-btn'));
const apiKeyStatus  = /** @type {HTMLSpanElement}   */ (document.getElementById('api-key-status'));
const apiKeyModal   = /** @type {HTMLElement}       */ (document.getElementById('api-key-modal'));
const apiKeyInput   = /** @type {HTMLInputElement}  */ (document.getElementById('api-key-input'));
const apiKeyError   = /** @type {HTMLElement}       */ (document.getElementById('api-key-error'));
const apiKeySaveBtn = /** @type {HTMLButtonElement} */ (document.getElementById('api-key-save'));
const apiKeyCancel  = /** @type {HTMLButtonElement} */ (document.getElementById('api-key-cancel'));
const apiKeyDelete  = /** @type {HTMLButtonElement} */ (document.getElementById('api-key-delete'));

// ─────────────────────────────────────────────────────────────────────────────
// 3. PERSISTENCE — localStorage
// ─────────────────────────────────────────────────────────────────────────────

const TASK_STORAGE_KEY   = 'tasklist_v1';
const APIKEY_STORAGE_KEY = 'gemini_api_key';

/** Load tasks array from localStorage. Falls back to []. */
function loadTasksFromStorage() {
  try {
    const raw = localStorage.getItem(TASK_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Persist tasks to localStorage. */
function saveTasksToStorage() {
  localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(tasks));
}

/** Read the stored Gemini API key (may be null). */
function loadApiKey() {
  return localStorage.getItem(APIKEY_STORAGE_KEY);
}

/** Save Gemini API key to localStorage. */
function saveApiKey(key) {
  localStorage.setItem(APIKEY_STORAGE_KEY, key);
}

/** Remove the stored API key. */
function deleteApiKey() {
  localStorage.removeItem(APIKEY_STORAGE_KEY);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. UTILITY HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Generate a collision-resistant unique ID for a new task. */
function generateId() {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Escape HTML special characters to prevent XSS when inserting user text.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Convert simple markdown-like syntax to HTML for AI responses.
 * Handles **bold**, *italic*, and line breaks.
 * @param {string} text
 * @returns {string}
 */
function formatAiText(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')  // **bold**
    .replace(/\*(.+?)\*/g, '<em>$1</em>')              // *italic*
    .replace(/\n/g, '<br>');                            // newlines
}

/**
 * Return tasks that match the current filter.
 * @returns {Task[]}
 */
function getFilteredTasks() {
  if (currentFilter === 'active')    return tasks.filter(t => !t.completed);
  if (currentFilter === 'completed') return tasks.filter(t =>  t.completed);
  return tasks;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. TASK RENDER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a single <li> element for a task.
 * @param {Task} task
 * @returns {HTMLLIElement}
 */
function createTaskElement(task) {
  const li = document.createElement('li');
  li.className = 'task-item';
  li.dataset.id = task.id;

  li.innerHTML = `
    <input
      type="checkbox"
      class="task-checkbox"
      ${task.completed ? 'checked' : ''}
      aria-label="Tandai sebagai ${task.completed ? 'aktif' : 'selesai'}"
    />
    <span class="task-label ${task.completed ? 'is-completed' : ''}">
      ${escapeHtml(task.text)}
    </span>
    <div class="task-actions" aria-label="Aksi tugas">
      <button class="btn-icon btn-edit" data-action="edit" aria-label="Edit tugas">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14"
          fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round"
            d="M16.862 4.487a2.25 2.25 0 113.182 3.182L7.5 20.213l-4.5 1 1-4.5 12.862-12.226z"/>
        </svg>
      </button>
      <button class="btn-icon btn-delete" data-action="delete" aria-label="Hapus tugas">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14"
          fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    </div>
  `;

  return li;
}

/**
 * Re-render the task list and update all reactive UI elements.
 * Must be called after every state change.
 */
function render() {
  const filtered    = getFilteredTasks();
  const activeCount = tasks.filter(t => !t.completed).length;

  // ── Task items ──
  taskList.innerHTML = '';

  if (filtered.length === 0) {
    const messages = {
      all:       'Belum ada tugas. Tambahkan di atas!',
      active:    'Tidak ada tugas aktif. Hebat! 🎉',
      completed: 'Belum ada tugas yang selesai.',
    };
    emptyText.textContent = messages[currentFilter];
    emptyState.classList.remove('hidden');
  } else {
    emptyState.classList.add('hidden');
    filtered.forEach(task => taskList.appendChild(createTaskElement(task)));
  }

  // ── Footer counter ──
  itemsLeftLabel.textContent =
    `${activeCount} tugas tersisa`;

  // ── Filter button states ──
  filterBtns.forEach(btn => {
    const isActive = btn.dataset.filter === currentFilter;
    btn.classList.toggle('is-active-filter', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. TASK CRUD
// ─────────────────────────────────────────────────────────────────────────────

/** Add a new task. Ignores blank input. */
function addTask(text) {
  const trimmed = text.trim();
  if (!trimmed) return;

  tasks.push({ id: generateId(), text: trimmed, completed: false });
  saveTasksToStorage();
  render();
}

/** Permanently remove a task by ID. */
function deleteTask(id) {
  tasks = tasks.filter(t => t.id !== id);
  saveTasksToStorage();
  render();
}

/** Toggle the completed status of a task. */
function toggleTask(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  task.completed = !task.completed;
  saveTasksToStorage();
  render();
}

/** Update the text of an existing task. Ignores blank new text. */
function updateTask(id, newText) {
  const trimmed = newText.trim();
  if (!trimmed) return;

  const task = tasks.find(t => t.id === id);
  if (!task) return;

  task.text = trimmed;
  saveTasksToStorage();
  render();
}

/** Remove all completed tasks in one action. */
function clearCompletedTasks() {
  tasks = tasks.filter(t => !t.completed);
  saveTasksToStorage();
  render();
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. TASK FILTER
// ─────────────────────────────────────────────────────────────────────────────

/** Switch the active filter and re-render. */
function setFilter(filter) {
  currentFilter = filter;
  render();
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. EDIT MODAL
// ─────────────────────────────────────────────────────────────────────────────

function openEditModal(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  editingId       = id;
  editInput.value = task.text;
  editModal.classList.remove('hidden');
  editInput.focus();
  editInput.select();
}

function closeEditModal() {
  editingId       = null;
  editInput.value = '';
  editModal.classList.add('hidden');
}

function saveEdit() {
  if (editingId) updateTask(editingId, editInput.value);
  closeEditModal();
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. AI — API KEY MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

/** Refresh the button label/style based on whether a key is stored. */
function updateApiKeyStatusUI() {
  const key = loadApiKey();
  if (key) {
    apiKeyStatus.textContent = 'API Key ✓';
    apiKeyBtn.classList.add('api-key-active');
  } else {
    apiKeyStatus.textContent = 'Atur API Key';
    apiKeyBtn.classList.remove('api-key-active');
  }
}

function openApiKeyModal() {
  const stored = loadApiKey();
  apiKeyInput.value = stored || '';
  apiKeyError.classList.add('hidden');
  apiKeyModal.classList.remove('hidden');
  apiKeyInput.focus();
}

function closeApiKeyModal() {
  apiKeyModal.classList.add('hidden');
}

function handleApiKeySave() {
  const value = apiKeyInput.value.trim();

  if (!value) {
    apiKeyError.textContent = 'API key tidak boleh kosong.';
    apiKeyError.classList.remove('hidden');
    return;
  }

  // Accept both legacy "AIza..." keys and newer "AQ..." Authorization Keys.
  // Minimum length check (32 chars) guards against obvious copy-paste errors.
  if (value.length < 32) {
    apiKeyError.textContent = 'API key terlalu pendek. Pastikan Anda menyalin seluruh key.';
    apiKeyError.classList.remove('hidden');
    return;
  }

  saveApiKey(value);
  updateApiKeyStatusUI();
  closeApiKeyModal();
  appendAiMessage('✅ API key berhasil disimpan! Sekarang Anda bisa mulai bertanya kepada saya.');
}

function handleApiKeyDelete() {
  deleteApiKey();
  updateApiKeyStatusUI();
  closeApiKeyModal();
  appendAiMessage('🗑️ API key telah dihapus. Silakan atur API key baru untuk menggunakan fitur AI.');
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. AI — SYSTEM PROMPT BUILDER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a compact system prompt with the current task list.
 * Kept short intentionally — fewer input tokens = faster first token latency.
 * @returns {string}
 */
function buildSystemPrompt() {
  const activeTasks    = tasks.filter(t => !t.completed);
  const completedTasks = tasks.filter(t =>  t.completed);

  // Compact task list lines
  const activeLines    = activeTasks.map((t, i) => `${i + 1}. ${t.text}`).join('\n');
  const completedLines = completedTasks.map((t, i) => `${i + 1}. ${t.text}`).join('\n');

  let taskSection = 'Belum ada tugas.';
  if (activeTasks.length)    taskSection  = `Aktif:\n${activeLines}`;
  if (completedTasks.length) taskSection += `\nSelesai:\n${completedLines}`;

  // Concise instructions — Gemini doesn't need verbose capability lists
  return (
    `Kamu adalah AI Task Assistant. Jawab selalu dalam Bahasa Indonesia, singkat, terstruktur, dan mudah ditindaklanjuti. ` +
    `Bantu pengguna dengan prioritas tugas, jadwal, dan produktivitas. ` +
    `Jika ditanya prioritas, pertimbangkan urgensi dan deadline.\n\n` +
    `Daftar tugas pengguna:\n${taskSection}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. AI — CHAT RENDERER
// ─────────────────────────────────────────────────────────────────────────────

/** Scroll the chat window to the bottom. */
function scrollChatToBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

/**
 * Append a user message bubble to the chat.
 * @param {string} text
 */
function appendUserMessage(text) {
  const div = document.createElement('div');
  div.className = 'flex justify-end';

  div.innerHTML = `
    <div class="chat-bubble chat-bubble-user">${escapeHtml(text)}</div>
  `;

  chatMessages.appendChild(div);
  scrollChatToBottom();
}

/**
 * Append an AI response bubble (with avatar) to the chat.
 * @param {string} text — may contain **bold** and *italic* markdown
 */
function appendAiMessage(text) {
  const row = document.createElement('div');
  row.className = 'chat-row-ai';

  row.innerHTML = `
    <div class="chat-avatar" aria-hidden="true">
      <svg class="w-3 h-3 text-white" xmlns="http://www.w3.org/2000/svg"
        fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round"
          d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12
             l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0
             003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
      </svg>
    </div>
    <div class="chat-bubble chat-bubble-ai">${formatAiText(text)}</div>
  `;

  chatMessages.appendChild(row);
  scrollChatToBottom();
}

/**
 * Append an error bubble to the chat.
 * @param {string} message
 */
function appendErrorMessage(message) {
  const row = document.createElement('div');
  row.className = 'chat-row-ai';

  row.innerHTML = `
    <div class="chat-avatar" style="background-color:#ef4444;" aria-hidden="true">
      <svg class="w-3 h-3 text-white" xmlns="http://www.w3.org/2000/svg"
        fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round"
          d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71
             c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0
             L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
      </svg>
    </div>
    <div class="chat-bubble chat-bubble-error">${escapeHtml(message)}</div>
  `;

  chatMessages.appendChild(row);
  scrollChatToBottom();
}

/**
 * Show the animated typing indicator. Returns the element so caller can remove it.
 * @returns {HTMLElement}
 */
function showTypingIndicator() {
  const row = document.createElement('div');
  row.className = 'chat-row-ai';
  row.id = 'typing-indicator';

  row.innerHTML = `
    <div class="chat-avatar" aria-hidden="true">
      <svg class="w-3 h-3 text-white" xmlns="http://www.w3.org/2000/svg"
        fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round"
          d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12
             l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0
             003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
      </svg>
    </div>
    <div class="typing-indicator" aria-label="AI sedang mengetik">
      <span></span><span></span><span></span>
    </div>
  `;

  chatMessages.appendChild(row);
  scrollChatToBottom();
  return row;
}

/** Remove the typing indicator from the DOM. */
function removeTypingIndicator() {
  const el = document.getElementById('typing-indicator');
  if (el) el.remove();
}

// ─────────────────────────────────────────────────────────────────────────────
// 12. AI — GEMINI API CALL
// ─────────────────────────────────────────────────────────────────────────────

// Model name as instructed by the Google API error response.
const GEMINI_MODEL   = 'gemini-3.8-flash';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/**
 * Build the shared fetch request body for the Gemini API.
 * @param {string} userMessage
 * @returns {object}
 */
function buildRequestBody(userMessage) {
  return {
    systemInstruction: {
      parts: [{ text: buildSystemPrompt() }],
    },
    contents: [
      { role: 'user', parts: [{ text: userMessage }] },
    ],
    generationConfig: {
      temperature:     0.7,
      maxOutputTokens: 512,
      topP:            0.85,
    },
  };
}

/**
 * Translate a non-2xx HTTP status into a friendly Indonesian error message.
 * @param {number} status
 * @param {string} detail — message from the API error body
 * @returns {string}
 */
function geminiErrorMessage(status, detail) {
  if (status === 400) return `Permintaan tidak valid: ${detail}`;
  if (status === 403) return 'API key tidak valid atau tidak memiliki akses. Periksa kembali di Google AI Studio.';
  if (status === 404) return `Model tidak ditemukan: ${detail}`;
  if (status === 429) return 'Batas kuota tercapai. Tunggu beberapa detik lalu coba lagi.';
  if (status >= 500)  return `Server Google mengalami gangguan (${status}). Coba lagi nanti.`;
  return `Gagal menghubungi AI (${status}): ${detail}`;
}

/**
 * Call Gemini generateContent and return the text response.
 *
 * @param {string} userMessage
 * @param {string} apiKey
 * @returns {Promise<string>}
 */
async function callGeminiApi(userMessage, apiKey) {
  // 30 s is generous for a non-streaming call with a short prompt
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 30_000);

  let response;
  try {
    response = await fetch(`${GEMINI_API_URL}?key=${encodeURIComponent(apiKey)}`, {
      method:  'POST',
      headers: {
        'Content-Type':   'application/json',
        'x-goog-api-key': apiKey,
      },
      body:   JSON.stringify(buildRequestBody(userMessage)),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('Permintaan timeout (>30 detik). Periksa koneksi internet Anda lalu coba lagi.');
    }
    throw new Error(`Tidak dapat terhubung ke server AI: ${err.message}`);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    // Read the real error body so the user sees the actual cause
    const errorData = await response.json().catch(() => ({}));
    const detail    = errorData?.error?.message || `HTTP ${response.status}`;
    throw new Error(geminiErrorMessage(response.status, detail));
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('AI memberikan respons kosong. Coba ajukan pertanyaan kembali.');
  return text;
}

// ─────────────────────────────────────────────────────────────────────────────
// 13. AI — SEND MESSAGE FLOW
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send a message, show typing indicator, then display the AI reply.
 * Prevents re-entrant calls while a request is in flight.
 * @param {string} message
 */
async function sendChatMessage(message) {
  const trimmed = message.trim();
  if (!trimmed || isChatLoading) return;

  const apiKey = loadApiKey();
  if (!apiKey) {
    appendAiMessage(
      '⚠️ Silakan atur **API Key** terlebih dahulu dengan mengklik tombol "Atur API Key" di pojok kanan atas panel ini.'
    );
    return;
  }

  // Lock UI — prevent double-send
  isChatLoading        = true;
  chatSendBtn.disabled = true;
  chatInput.disabled   = true;

  appendUserMessage(trimmed);
  chatInput.value = '';
  showTypingIndicator();

  try {
    const aiResponse = await callGeminiApi(trimmed, apiKey);
    removeTypingIndicator();
    appendAiMessage(aiResponse);
  } catch (error) {
    removeTypingIndicator();
    appendErrorMessage(`❌ ${error.message}`);
  } finally {
    isChatLoading        = false;
    chatSendBtn.disabled = false;
    chatInput.disabled   = false;
    chatInput.focus();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 14. EVENT LISTENERS
// ─────────────────────────────────────────────────────────────────────────────

// ── Task: Add ──
taskForm.addEventListener('submit', e => {
  e.preventDefault();
  addTask(taskInput.value);
  taskInput.value = '';
  taskInput.focus();
});

// ── Task: Delegated click (toggle / edit / delete) ──
taskList.addEventListener('click', e => {
  const li = /** @type {Element} */ (e.target).closest('.task-item');
  if (!li) return;

  const id = /** @type {HTMLElement} */ (li).dataset.id;

  if (/** @type {Element} */ (e.target).matches('.task-checkbox')) {
    toggleTask(id);
    return;
  }

  const btn = /** @type {Element} */ (e.target).closest('[data-action]');
  if (!btn) return;

  const action = /** @type {HTMLElement} */ (btn).dataset.action;
  if (action === 'edit')   openEditModal(id);
  if (action === 'delete') deleteTask(id);
});

// ── Task: Filters ──
filterBtns.forEach(btn => {
  btn.addEventListener('click', () => setFilter(btn.dataset.filter));
});

// ── Task: Clear completed ──
clearCompleted.addEventListener('click', clearCompletedTasks);

// ── Edit modal ──
editSaveBtn.addEventListener('click', saveEdit);
editCancelBtn.addEventListener('click', closeEditModal);
editInput.addEventListener('keydown', e => {
  if (e.key === 'Enter')  saveEdit();
  if (e.key === 'Escape') closeEditModal();
});
editModal.addEventListener('click', e => {
  if (e.target === editModal) closeEditModal();
});

// ── AI Chat: Send button ──
chatSendBtn.addEventListener('click', () => sendChatMessage(chatInput.value));

// ── AI Chat: Enter key in input ──
chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage(chatInput.value);
  }
});

// ── AI Chat: Quick prompt chips ──
quickPrompts.forEach(btn => {
  btn.addEventListener('click', () => {
    // Strip the emoji prefix to get clean prompt text
    const text = btn.textContent.replace(/^[\u{1F300}-\u{1F9FF}]|^[^\w\s]/u, '').trim();
    chatInput.value = text;
    sendChatMessage(text);
  });
});

// ── API Key modal: open ──
apiKeyBtn.addEventListener('click', openApiKeyModal);

// ── API Key modal: save ──
apiKeySaveBtn.addEventListener('click', handleApiKeySave);

// ── API Key modal: cancel ──
apiKeyCancel.addEventListener('click', closeApiKeyModal);

// ── API Key modal: delete key ──
apiKeyDelete.addEventListener('click', () => {
  if (confirm('Hapus API key? Fitur AI tidak akan dapat digunakan tanpa API key.')) {
    handleApiKeyDelete();
  }
});

// ── API Key modal: Enter saves ──
apiKeyInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') handleApiKeySave();
});

// ── API Key modal: click backdrop to close ──
apiKeyModal.addEventListener('click', e => {
  if (e.target === apiKeyModal) closeApiKeyModal();
});

// ─────────────────────────────────────────────────────────────────────────────
// 15. INITIALISE
// ─────────────────────────────────────────────────────────────────────────────

// Load persisted tasks and render the list
tasks = loadTasksFromStorage();
render();

// Update the API key button label
updateApiKeyStatusUI();

// Show welcome message in the chat window
appendAiMessage(
  'Halo! 👋 Saya adalah **AI Task Assistant** Anda, didukung oleh Google Gemini.\n\n' +
  'Saya dapat membantu Anda:\n' +
  '- 📋 Menganalisis dan memprioritaskan tugas\n' +
  '- ⏱️ Membuat jadwal pengerjaan yang efektif\n' +
  '- 🎯 Memberikan tips produktivitas\n' +
  '- 💬 Menjawab pertanyaan seputar manajemen waktu\n\n' +
  (loadApiKey()
    ? 'Silakan ajukan pertanyaan atau gunakan tombol cepat di bawah!'
    : '⚠️ Untuk memulai, klik **"Atur API Key"** di pojok kanan atas untuk menghubungkan ke Google Gemini.')
);
