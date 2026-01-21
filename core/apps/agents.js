// System App: AI Agents
ALGO.app.name = 'Agents';
ALGO.app.icon = '⚡';

let _agents_running = false;
let _agents_winId = null;

function _agents_open() {
  if (typeof hideStartMenu === 'function') hideStartMenu();
  const id = typeof winId !== 'undefined' ? winId : Date.now();
  _agents_winId = id;

  // Load saved API keys
  let savedKeys = {};
  try {
    savedKeys = JSON.parse(localStorage.getItem('algo-api-keys') || '{}');
  } catch(e) {}

  ALGO.createWindow({
    title: 'Agents',
    icon: '⚡',
    width: 550,
    height: 520,
    content: '<div class="agents-container">' +
      '<div class="agents-header">' +
        '<h2>⚡ AI Agents</h2>' +
        '<p>Generate code, build apps, or run as ticket worker</p>' +
      '</div>' +
      '<div class="agents-form">' +
        '<div class="agents-row">' +
          '<label>Model:</label>' +
          '<select id="agent-model-' + id + '" onchange="_agents_modelChange()">' +
            '<option value="claude">Claude (Anthropic)</option>' +
            '<option value="gemini">Gemini (Google)</option>' +
            '<option value="gpt">GPT (OpenAI)</option>' +
          '</select>' +
        '</div>' +
        '<div class="agents-row">' +
          '<label>API Key:</label>' +
          '<input type="password" id="agent-key-' + id + '" value="' + (savedKeys.claude || '') + '" placeholder="Enter API key">' +
          '<button onclick="_agents_saveKey()">Save</button>' +
        '</div>' +
        '<div class="agents-row">' +
          '<label>Mode:</label>' +
          '<select id="agent-mode-' + id + '">' +
            '<option value="generate">Generate App</option>' +
            '<option value="code">Generate Code</option>' +
            '<option value="ticket">Ticket Worker</option>' +
          '</select>' +
        '</div>' +
        '<label>Prompt:</label>' +
        '<textarea id="agent-prompt-' + id + '" placeholder="Describe what you want to build..."></textarea>' +
        '<div class="agents-buttons">' +
          '<button onclick="_agents_run()">⚡ Run Agent</button>' +
          '<button onclick="_agents_stop()" id="agent-stop-' + id + '" style="display:none;">⏹ Stop</button>' +
        '</div>' +
        '<div class="agents-output" id="agent-output-' + id + '">Ready</div>' +
      '</div>' +
    '</div>'
  });
}

function _agents_modelChange() {
  const id = _agents_winId;
  const model = document.getElementById('agent-model-' + id).value;
  const keyInput = document.getElementById('agent-key-' + id);
  try {
    const savedKeys = JSON.parse(localStorage.getItem('algo-api-keys') || '{}');
    keyInput.value = savedKeys[model] || '';
  } catch(e) {}
}

function _agents_saveKey() {
  const id = _agents_winId;
  const model = document.getElementById('agent-model-' + id).value;
  const key = document.getElementById('agent-key-' + id).value.trim();
  if (key) {
    try {
      const savedKeys = JSON.parse(localStorage.getItem('algo-api-keys') || '{}');
      savedKeys[model] = key;
      localStorage.setItem('algo-api-keys', JSON.stringify(savedKeys));
    } catch(e) {}
    document.getElementById('agent-output-' + id).textContent = 'API key saved for ' + model;
  }
}

function _agents_run() {
  const id = _agents_winId;
  const model = document.getElementById('agent-model-' + id).value;
  const key = document.getElementById('agent-key-' + id).value.trim();
  const mode = document.getElementById('agent-mode-' + id).value;
  const prompt = document.getElementById('agent-prompt-' + id).value.trim();
  const output = document.getElementById('agent-output-' + id);
  const stopBtn = document.getElementById('agent-stop-' + id);

  if (!key) { output.textContent = 'Please enter an API key'; return; }
  if (!prompt) { output.textContent = 'Please enter a prompt'; return; }

  _agents_running = true;
  stopBtn.style.display = 'inline-block';
  output.textContent = 'Running agent...';

  const providerMap = { claude: 'anthropic', gemini: 'google', gpt: 'openai' };
  const provider = providerMap[model];

  fetch('/api/ai-create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: provider, apiKey: key, prompt: prompt, mode: mode })
  })
  .then(r => r.json())
  .then(data => {
    _agents_running = false;
    stopBtn.style.display = 'none';

    if (data.error) {
      output.textContent = 'Error: ' + data.error;
      return;
    }

    if (mode === 'code') {
      const escaped = typeof escapeHtml === 'function' ? escapeHtml(data.code || data.html || 'No output') : (data.code || data.html || 'No output');
      output.innerHTML = '<pre style="white-space:pre-wrap;font-size:11px;">' + escaped + '</pre>';
    } else if (data.html) {
      const words = prompt.split(/\s+/).slice(0, 2).join('-').toLowerCase().replace(/[^a-z0-9-]/g, '') || 'app';
      const name = words + '-' + Date.now().toString(36);

      // Save as installed program
      if (typeof installedPrograms !== 'undefined' && typeof saveState === 'function') {
        installedPrograms.push({ id: name, name: name, icon: '✨', code: data.html });
        saveState();
        if (typeof createDesktopIcons === 'function') createDesktopIcons();
        if (typeof updateProgramsMenu === 'function') updateProgramsMenu();
      }

      output.textContent = 'Created: ' + name;
      if (typeof algoSpeak === 'function') algoSpeak('New app: ' + name);
    } else {
      output.textContent = data.message || 'Done';
    }
  })
  .catch(e => {
    _agents_running = false;
    stopBtn.style.display = 'none';
    output.textContent = 'Error: ' + e.message;
  });
}

function _agents_stop() {
  const id = _agents_winId;
  _agents_running = false;
  document.getElementById('agent-stop-' + id).style.display = 'none';
  document.getElementById('agent-output-' + id).textContent = 'Stopped';
}

// Export for global access
window._agents_open = _agents_open;
window._agents_modelChange = _agents_modelChange;
window._agents_saveKey = _agents_saveKey;
window._agents_run = _agents_run;
window._agents_stop = _agents_stop;

// Auto-open
_agents_open();
