// System App: Ticket Manager
// Manage tickets for the ALGO community
ALGO.app.name = 'Ticket Manager';
ALGO.app.icon = '🎫';
ALGO.app.category = 'productivity';

// App state
let _tm_winId = null;
let _tm_tickets = [];
let _tm_selected = null;
let _tm_workerMd = null; // Lazy-loaded instructions

function _tm_open() {
  if (typeof hideStartMenu === 'function') hideStartMenu();
  const id = typeof winId !== 'undefined' ? winId : 0;
  _tm_winId = id;

  ALGO.createWindow({
    title: 'Ticket Manager',
    icon: '🎫',
    width: 550,
    height: 450,
    content: '<div class="ticket-container">' +
      '<div class="ticket-toolbar">' +
        '<button onclick="_tm_refresh()">🔄 Refresh</button>' +
        '<button onclick="_tm_showNew()">➕ New Ticket</button>' +
        '<div class="toolbar-spacer"></div>' +
        '<button class="icon-btn" onclick="_tm_copyGeneric()" title="Copy instructions for AI agents">' +
          '📋' +
          '<span class="win-tooltip">Copy Agent Instructions</span>' +
        '</button>' +
        '<span style="font-size:10px;color:#666;" id="tm-status">Loading...</span>' +
      '</div>' +
      '<div class="ticket-list" id="tm-list"></div>' +
      '<div class="ticket-detail" id="tm-detail" style="display:none;"></div>' +
      '<div class="ticket-new" id="tm-new" style="display:none;">' +
        '<input type="text" id="tm-title" placeholder="Ticket title (e.g., Add dark mode option)">' +
        '<textarea id="tm-desc" placeholder="Description (optional - explain in detail)"></textarea>' +
        '<div style="display:flex;gap:4px;justify-content:flex-end;">' +
          '<button onclick="_tm_hideNew()">Cancel</button>' +
          '<button onclick="_tm_submit()">Submit Ticket</button>' +
        '</div>' +
      '</div>' +
    '</div>'
  });

  _tm_refresh();
}

function _tm_refresh() {
  const status = document.getElementById('tm-status');
  if (status) status.textContent = 'Loading...';

  fetch('/api/tickets?room=algo-world')
    .then(r => r.json())
    .then(data => {
      _tm_tickets = data.tickets || [];
      if (status) status.textContent = _tm_tickets.length + ' ticket(s)';
      _tm_renderList();
    })
    .catch(() => {
      if (status) status.textContent = 'Error loading';
    });
}

function _tm_renderList() {
  const list = document.getElementById('tm-list');
  if (!list) return;

  if (_tm_tickets.length === 0) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:#666;">No tickets yet. Create one!</div>';
    return;
  }

  const esc = typeof escapeHtml === 'function' ? escapeHtml : (s => s);
  list.innerHTML = _tm_tickets.map(t =>
    '<div class="ticket-item' + (_tm_selected === t.id ? ' selected' : '') + '" onclick="_tm_select(\'' + t.id + '\')">' +
      '<span class="ticket-status ' + t.status + '">' + t.status + '</span>' +
      '<div class="ticket-info">' +
        '<div class="ticket-title">' + esc(t.title) + '</div>' +
        '<div class="ticket-desc">' + esc(t.description || 'No description') + '</div>' +
        '<div class="ticket-date">' + t.created + ' • ' + (t.replies ? t.replies.length : 0) + ' replies</div>' +
      '</div>' +
    '</div>'
  ).join('');
}

function _tm_select(ticketId) {
  _tm_selected = ticketId;
  _tm_renderList();

  const ticket = _tm_tickets.find(t => t.id === ticketId);
  if (!ticket) return;

  const detail = document.getElementById('tm-detail');
  if (!detail) return;

  const esc = typeof escapeHtml === 'function' ? escapeHtml : (s => s);
  let html = '<h3>🎫 ' + esc(ticket.title) + '</h3>' +
    '<p><strong>Status:</strong> <span class="ticket-status ' + ticket.status + '">' + ticket.status + '</span></p>' +
    '<p><strong>Created:</strong> ' + ticket.created + '</p>';

  if (ticket.description) {
    html += '<p><strong>Description:</strong><br>' + esc(ticket.description) + '</p>';
  }

  html += '<div style="margin:10px 0;display:flex;gap:4px;flex-wrap:wrap;">';
  if (ticket.status !== 'working' && ticket.status !== 'complete') {
    html += '<button onclick="_tm_claim(\'' + ticketId + '\')">🔧 Claim (Working)</button>';
  }
  html += '<button onclick="_tm_copyInstructions(\'' + ticketId + '\')">📋 Copy Agent Instructions</button>';
  html += '</div>';

  if (ticket.replies && ticket.replies.length > 0) {
    html += '<p><strong>Replies:</strong></p>';
    ticket.replies.forEach(r => {
      html += '<div class="ticket-reply"><div class="reply-date">' + r.date + '</div>' + esc(r.text) + '</div>';
    });
  }

  detail.innerHTML = html;
  detail.style.display = 'block';
}

function _tm_claim(ticketId) {
  // For now, just show a notification - full claim API can be added later
  ALGO.notify('Ticket claim feature coming soon!');
}

// Lazy-load the worker instructions
function _tm_loadWorkerMd() {
  if (_tm_workerMd) return Promise.resolve(_tm_workerMd);
  return fetch('/core/apps/TICKET-WORKER.md')
    .then(r => r.text())
    .then(text => {
      _tm_workerMd = text;
      return text;
    });
}

function _tm_copyInstructions(ticketId) {
  const ticket = _tm_tickets.find(t => t.id === ticketId);
  if (!ticket) return;

  _tm_loadWorkerMd().then(baseMd => {
    // Prepend ticket-specific context
    const instructions = `# Your Current Task

**Ticket #${ticketId}**: ${ticket.title}

**Description:**
${ticket.description || 'No description provided'}

**Status:** ${ticket.status}

**Reply format for this ticket:**
\`\`\`
[TICKET-REPLY:${ticketId}] Your message here [STATUS:status]

#general
\`\`\`

---

${baseMd}`;

    _tm_copyText(instructions, 'Copied agent instructions!');
  }).catch(() => {
    ALGO.notify('Error loading instructions');
  });
}

function _tm_copyGeneric() {
  _tm_loadWorkerMd().then(text => {
    _tm_copyText(text, 'Copied agent setup guide!');
  }).catch(() => {
    ALGO.notify('Error loading instructions');
  });
}

function _tm_copyText(text, msg) {
  navigator.clipboard.writeText(text).then(() => {
    ALGO.notify(msg);
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    ALGO.notify(msg);
  });
}

function _tm_showNew() {
  document.getElementById('tm-new').style.display = 'block';
  document.getElementById('tm-detail').style.display = 'none';
  document.getElementById('tm-title').focus();
}

function _tm_hideNew() {
  document.getElementById('tm-new').style.display = 'none';
  document.getElementById('tm-title').value = '';
  document.getElementById('tm-desc').value = '';
}

function _tm_submit() {
  const title = document.getElementById('tm-title').value.trim();
  const desc = document.getElementById('tm-desc').value.trim();

  if (!title) {
    ALGO.notify('Please enter a title');
    return;
  }

  const status = document.getElementById('tm-status');
  if (status) status.textContent = 'Submitting...';

  fetch('/api/tickets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: title, description: desc })
  })
  .then(r => r.json())
  .then(data => {
    if (data.success) {
      _tm_hideNew();
      _tm_refresh();
      ALGO.notify('Ticket submitted!');
    } else {
      if (status) status.textContent = 'Error';
    }
  })
  .catch(() => {
    if (status) status.textContent = 'Error';
  });
}

// Run the app
_tm_open();
