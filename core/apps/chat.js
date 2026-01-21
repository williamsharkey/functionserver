// System App: Chat (P2P)
ALGO.app.name = 'Chat';
ALGO.app.icon = '💬';

let _chat_peerId = 'p' + Math.random().toString(36).substr(2, 9);
let _chat_peers = {};
let _chat_room = 'general';
let _chat_name = localStorage.getItem('algo-chat-name') || 'anon';
let _chat_pollInterval = null;
let _chat_winId = null;

function _chat_open() {
  if (typeof hideStartMenu === 'function') hideStartMenu();
  const id = typeof winId !== 'undefined' ? winId : Date.now();
  _chat_winId = id;

  ALGO.createWindow({
    title: 'Chat (P2P)',
    icon: '💬',
    width: 500,
    height: 400,
    content: '<div class="chat-container">' +
      '<div style="padding:4px;background:#c0c0c0;border-bottom:1px solid #808080;display:flex;gap:4px;align-items:center;">' +
        '<label>Name:</label>' +
        '<input type="text" id="chat-name-' + id + '" value="' + _chat_escape(_chat_name) + '" style="width:80px;padding:2px;border:2px inset #808080;" onchange="_chat_updateName()">' +
        '<span style="margin-left:auto;font-size:10px;color:#666;" id="chat-status-' + id + '">Connecting...</span>' +
      '</div>' +
      '<div style="display:flex;flex:1;overflow:hidden;">' +
        '<div class="chat-messages" id="chat-messages-' + id + '"></div>' +
        '<div class="users-list" id="chat-users-' + id + '">' +
          '<h4>Online</h4>' +
          '<div id="chat-online-' + id + '"></div>' +
        '</div>' +
      '</div>' +
      '<div class="chat-input-area">' +
        '<input type="text" id="chat-input-' + id + '" placeholder="Type a message..." onkeypress="if(event.key===\'Enter\')_chat_send()">' +
        '<button onclick="_chat_send()">Send</button>' +
      '</div>' +
    '</div>',
    onClose: () => {
      _chat_leave();
    }
  });

  _chat_join();
}

function _chat_escape(s) {
  if (typeof escapeHtml === 'function') return escapeHtml(s);
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function _chat_updateName() {
  const id = _chat_winId;
  const input = document.getElementById('chat-name-' + id);
  if (input) {
    _chat_name = input.value.trim() || 'anon';
    localStorage.setItem('algo-chat-name', _chat_name);
    // Broadcast name change to peers
    _chat_broadcast({ type: 'name', name: _chat_name, peerId: _chat_peerId });
  }
}

function _chat_join() {
  const id = _chat_winId;
  const status = document.getElementById('chat-status-' + id);
  if (status) status.textContent = 'Joining...';

  // Poll for other peers
  _chat_pollInterval = setInterval(_chat_poll, 3000);
  _chat_poll();

  // Announce ourselves
  _chat_announce();
  _chat_addMessage('System', 'Connected as ' + _chat_name, true);
}

function _chat_leave() {
  if (_chat_pollInterval) {
    clearInterval(_chat_pollInterval);
    _chat_pollInterval = null;
  }
  // Close all peer connections
  Object.keys(_chat_peers).forEach(peerId => {
    if (_chat_peers[peerId].pc) {
      _chat_peers[peerId].pc.close();
    }
  });
  _chat_peers = {};
}

function _chat_announce() {
  // Store our presence in localStorage for same-browser tabs
  const presence = {
    peerId: _chat_peerId,
    name: _chat_name,
    room: _chat_room,
    timestamp: Date.now()
  };
  try {
    const peers = JSON.parse(localStorage.getItem('algo-chat-peers') || '[]');
    const updated = peers.filter(p => p.peerId !== _chat_peerId && Date.now() - p.timestamp < 30000);
    updated.push(presence);
    localStorage.setItem('algo-chat-peers', JSON.stringify(updated));
  } catch(e) {}
}

function _chat_poll() {
  _chat_announce();

  // Check for other peers
  try {
    const peers = JSON.parse(localStorage.getItem('algo-chat-peers') || '[]');
    const active = peers.filter(p => p.peerId !== _chat_peerId && p.room === _chat_room && Date.now() - p.timestamp < 30000);

    active.forEach(p => {
      if (!_chat_peers[p.peerId]) {
        _chat_peers[p.peerId] = { name: p.name, connected: true };
        _chat_addMessage('System', p.name + ' is online', true);
      } else {
        _chat_peers[p.peerId].name = p.name;
      }
    });

    // Remove stale peers
    Object.keys(_chat_peers).forEach(peerId => {
      if (!active.find(p => p.peerId === peerId)) {
        _chat_addMessage('System', _chat_peers[peerId].name + ' left', true);
        delete _chat_peers[peerId];
      }
    });

    _chat_updateUsers();
    _chat_updateStatus();
  } catch(e) {}

  // Check for messages
  _chat_checkMessages();
}

function _chat_checkMessages() {
  try {
    const messages = JSON.parse(localStorage.getItem('algo-chat-messages-' + _chat_room) || '[]');
    const lastRead = parseInt(localStorage.getItem('algo-chat-lastread-' + _chat_peerId) || '0');

    messages.filter(m => m.timestamp > lastRead && m.peerId !== _chat_peerId).forEach(m => {
      _chat_addMessage(m.name, m.text, false);
    });

    if (messages.length > 0) {
      localStorage.setItem('algo-chat-lastread-' + _chat_peerId, String(messages[messages.length - 1].timestamp));
    }

    // Clean old messages
    const recent = messages.filter(m => Date.now() - m.timestamp < 60000);
    localStorage.setItem('algo-chat-messages-' + _chat_room, JSON.stringify(recent));
  } catch(e) {}
}

function _chat_broadcast(msg) {
  try {
    const messages = JSON.parse(localStorage.getItem('algo-chat-messages-' + _chat_room) || '[]');
    messages.push({ ...msg, timestamp: Date.now() });
    localStorage.setItem('algo-chat-messages-' + _chat_room, JSON.stringify(messages.slice(-50)));
  } catch(e) {}
}

function _chat_send() {
  const id = _chat_winId;
  const input = document.getElementById('chat-input-' + id);
  if (!input || !input.value.trim()) return;

  const text = input.value.trim();
  input.value = '';

  _chat_addMessage(_chat_name + ' (you)', text, false);
  _chat_broadcast({ type: 'message', peerId: _chat_peerId, name: _chat_name, text: text });
}

function _chat_addMessage(name, text, isSystem) {
  const id = _chat_winId;
  const container = document.getElementById('chat-messages-' + id);
  if (!container) return;

  const msg = document.createElement('div');
  msg.className = 'chat-message' + (isSystem ? ' system' : '');
  msg.innerHTML = '<span class="chat-name">' + _chat_escape(name) + ':</span> ' + _chat_escape(text);
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}

function _chat_updateUsers() {
  const id = _chat_winId;
  const container = document.getElementById('chat-online-' + id);
  if (!container) return;

  let html = '<div class="user-item">' + _chat_escape(_chat_name) + ' (you)</div>';
  Object.keys(_chat_peers).forEach(peerId => {
    html += '<div class="user-item">' + _chat_escape(_chat_peers[peerId].name || 'anon') + '</div>';
  });
  container.innerHTML = html;
}

function _chat_updateStatus() {
  const id = _chat_winId;
  const status = document.getElementById('chat-status-' + id);
  if (status) {
    const count = Object.keys(_chat_peers).length + 1;
    status.textContent = count + ' user' + (count > 1 ? 's' : '') + ' online';
  }
}

// Export for global access
window._chat_open = _chat_open;
window._chat_send = _chat_send;
window._chat_updateName = _chat_updateName;

// Auto-open
_chat_open();
