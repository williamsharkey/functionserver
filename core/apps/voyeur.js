// System App: VOYEUR.JS - Webcam Chat
ALGO.app.name = 'VOYEUR.JS';
ALGO.app.icon = '👁️';
ALGO.app.category = 'development';

const _voyeur_state = {
  instances: {},
  counter: 0,
  defaultRooms: [
    { id: 'developer', name: 'Developer', icon: '💻' },
    { id: 'chitchat', name: 'Chit Chat', icon: '💬' },
    { id: 'lounge', name: 'Lounge', icon: '🛋️' }
  ]
};

window._voyeurRooms = window._voyeurRooms || {};
window._voyeurUsers = window._voyeurUsers || {};

function _voyeur_escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function _voyeur_initRooms() {
  _voyeur_state.defaultRooms.forEach(room => {
    if (!window._voyeurRooms[room.id]) {
      window._voyeurRooms[room.id] = { ...room, messages: [], users: [] };
    }
  });
}

function _voyeur_open() {
  if (typeof hideStartMenu === 'function') hideStartMenu();
  _voyeur_initRooms();

  const id = typeof winId !== 'undefined' ? winId : Date.now();
  _voyeur_state.counter++;
  const instId = 'voyeur-' + _voyeur_state.counter;

  const randomNames = ['Neo', 'Trinity', 'Morpheus', 'Tank', 'Cypher', 'Mouse', 'Switch'];
  const userName = randomNames[Math.floor(Math.random() * randomNames.length)] + Math.floor(Math.random() * 100);

  const inst = {
    instId: instId,
    userName: userName,
    currentRoom: 'chitchat',
    webcamStream: null,
    webcamMode: 'off',
    userId: 'user-' + Date.now()
  };

  _voyeur_state.instances[instId] = inst;

  window._voyeurUsers[inst.userId] = {
    id: inst.userId,
    name: userName,
    status: 'online',
    webcamMode: 'off',
    room: 'chitchat'
  };

  _voyeur_joinRoom(instId, 'chitchat');

  ALGO.createWindow({
    title: 'VOYEUR.JS - ' + userName,
    icon: '👁️',
    width: 700,
    height: 500,
    content: '<div class="voyeur-app" data-inst="' + instId + '" style="display:flex;height:100%;background:#c0c0c0;font-size:11px;">' +
      '<div style="width:130px;background:#c0c0c0;border-right:2px groove #fff;display:flex;flex-direction:column;">' +
        '<div style="padding:6px 8px;background:#000080;color:white;font-weight:bold;font-size:10px;">👁️ VOYEUR.JS</div>' +
        '<div style="padding:4px 8px;font-size:10px;border-bottom:1px solid #808080;">' +
          '<div style="color:#666;">Logged in as:</div>' +
          '<div style="font-weight:bold;">' + userName + '</div>' +
        '</div>' +
        '<div style="padding:4px 8px;font-size:10px;font-weight:bold;background:#e0e0e0;">Rooms</div>' +
        '<div id="voyeur-rooms-' + instId + '" style="flex:1;overflow-y:auto;">' +
          _voyeur_state.defaultRooms.map(r =>
            '<div class="voyeur-room' + (r.id === 'chitchat' ? ' active' : '') + '" data-room="' + r.id + '" ' +
            'onclick="_voyeur_joinRoom(\'' + instId + '\',\'' + r.id + '\')" ' +
            'style="padding:6px 8px;cursor:pointer;display:flex;align-items:center;gap:4px;' +
            (r.id === 'chitchat' ? 'background:#000080;color:white;' : '') + '">' +
              '<span>' + r.icon + '</span>' +
              '<span>' + r.name + '</span>' +
              '<span id="voyeur-count-' + r.id + '-' + instId + '" style="margin-left:auto;background:#808080;color:white;padding:1px 4px;border-radius:8px;font-size:9px;">0</span>' +
            '</div>'
          ).join('') +
        '</div>' +
      '</div>' +
      '<div style="flex:1;display:flex;flex-direction:column;">' +
        '<div style="background:linear-gradient(180deg,#d4d4d4,#c0c0c0);padding:4px 8px;border-bottom:2px groove #fff;display:flex;align-items:center;gap:8px;">' +
          '<span id="voyeur-room-title-' + instId + '" style="font-weight:bold;">💬 Chit Chat</span>' +
          '<div style="flex:1;"></div>' +
          '<button onclick="_voyeur_toggleWebcam(\'' + instId + '\')" style="padding:2px 8px;background:#c0c0c0;border:2px outset #fff;font-size:10px;cursor:pointer;">📹 Webcam</button>' +
        '</div>' +
        '<div id="voyeur-webcams-' + instId + '" style="display:none;flex-wrap:wrap;gap:4px;padding:4px;background:#1a1a1a;border:2px inset #808080;margin:4px;min-height:80px;"></div>' +
        '<div style="flex:1;display:flex;overflow:hidden;">' +
          '<div style="flex:1;display:flex;flex-direction:column;">' +
            '<div id="voyeur-messages-' + instId + '" style="flex:1;overflow-y:auto;background:white;border:2px inset #808080;margin:4px;padding:4px;">' +
              '<div style="color:#008000;font-style:italic;">Welcome to VOYEUR.JS!</div>' +
            '</div>' +
            '<div style="display:flex;gap:4px;padding:4px;background:#c0c0c0;">' +
              '<input type="text" id="voyeur-input-' + instId + '" placeholder="Type a message..." ' +
                'style="flex:1;padding:4px;border:2px inset #808080;font-size:11px;" ' +
                'onkeydown="if(event.key===\'Enter\')_voyeur_sendMessage(\'' + instId + '\')">' +
              '<button onclick="_voyeur_sendMessage(\'' + instId + '\')" style="padding:2px 8px;background:#c0c0c0;border:2px outset #fff;font-size:10px;cursor:pointer;">Send</button>' +
            '</div>' +
          '</div>' +
          '<div style="width:120px;background:#c0c0c0;border-left:2px groove #fff;display:flex;flex-direction:column;">' +
            '<div style="padding:4px 8px;background:#000080;color:white;font-weight:bold;font-size:10px;">👥 Users</div>' +
            '<div id="voyeur-users-' + instId + '" style="flex:1;overflow-y:auto;"></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>',
    onClose: () => _voyeur_cleanup(instId)
  });

  setTimeout(() => {
    _voyeur_updateUI(instId);
    _voyeur_addSystemMessage(instId, userName + ' has joined the chat');
  }, 100);
}

function _voyeur_joinRoom(instId, roomId) {
  const inst = _voyeur_state.instances[instId];
  if (!inst) return;

  const oldRoom = window._voyeurRooms[inst.currentRoom];
  if (oldRoom) oldRoom.users = oldRoom.users.filter(u => u !== inst.userId);

  inst.currentRoom = roomId;
  const room = window._voyeurRooms[roomId];
  if (room && !room.users.includes(inst.userId)) room.users.push(inst.userId);

  if (window._voyeurUsers[inst.userId]) window._voyeurUsers[inst.userId].room = roomId;

  const roomsEl = document.getElementById('voyeur-rooms-' + instId);
  if (roomsEl) {
    roomsEl.querySelectorAll('.voyeur-room, [data-room]').forEach(el => {
      const isActive = el.dataset.room === roomId;
      el.style.background = isActive ? '#000080' : '';
      el.style.color = isActive ? 'white' : '';
    });
  }

  const titleEl = document.getElementById('voyeur-room-title-' + instId);
  if (titleEl && room) titleEl.textContent = room.icon + ' ' + room.name;

  _voyeur_updateUI(instId);
  _voyeur_renderMessages(instId);
  _voyeur_addSystemMessage(instId, inst.userName + ' joined ' + room.name);
}

function _voyeur_updateUI(instId) {
  const inst = _voyeur_state.instances[instId];
  if (!inst) return;

  Object.keys(window._voyeurRooms).forEach(roomId => {
    const room = window._voyeurRooms[roomId];
    const countEl = document.getElementById('voyeur-count-' + roomId + '-' + instId);
    if (countEl) countEl.textContent = room.users.length;
  });

  const usersEl = document.getElementById('voyeur-users-' + instId);
  if (usersEl) {
    const room = window._voyeurRooms[inst.currentRoom];
    const users = room ? room.users.map(uid => window._voyeurUsers[uid]).filter(Boolean) : [];
    usersEl.innerHTML = users.map(u =>
      '<div style="padding:4px 8px;display:flex;align-items:center;gap:4px;">' +
        '<span style="width:8px;height:8px;border-radius:50%;background:#00ff00;border:1px solid #008000;"></span>' +
        '<span>' + _voyeur_escapeHtml(u.name) + '</span>' +
        (u.webcamMode !== 'off' ? '<span style="margin-left:auto;font-size:10px;">📹</span>' : '') +
      '</div>'
    ).join('');
  }

  _voyeur_updateWebcams(instId);
}

function _voyeur_updateWebcams(instId) {
  const inst = _voyeur_state.instances[instId];
  if (!inst) return;

  const webcamsEl = document.getElementById('voyeur-webcams-' + instId);
  if (!webcamsEl || webcamsEl.style.display === 'none') return;

  const room = window._voyeurRooms[inst.currentRoom];
  const users = room ? room.users.map(uid => window._voyeurUsers[uid]).filter(Boolean) : [];
  const webcamUsers = users.filter(u => u.webcamMode !== 'off');

  if (webcamUsers.length === 0) {
    webcamsEl.innerHTML = '<div style="color:#666;width:100%;text-align:center;padding:20px;">No webcams active</div>';
    return;
  }

  webcamsEl.innerHTML = webcamUsers.map(u =>
    '<div style="width:120px;height:90px;background:#000;border:1px solid #444;position:relative;overflow:hidden;">' +
      '<video id="voyeur-video-' + u.id + '-' + instId + '" autoplay muted playsinline style="width:100%;height:100%;object-fit:cover;"></video>' +
      '<div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.7);color:white;font-size:9px;padding:2px 4px;text-align:center;">' + _voyeur_escapeHtml(u.name) + '</div>' +
    '</div>'
  ).join('');

  webcamUsers.filter(u => u.webcamMode === 'on').forEach(u => {
    const userInst = Object.values(_voyeur_state.instances).find(i => i.userId === u.id);
    if (userInst && userInst.webcamStream) {
      const video = document.getElementById('voyeur-video-' + u.id + '-' + instId);
      if (video && video.srcObject !== userInst.webcamStream) video.srcObject = userInst.webcamStream;
    }
  });
}

function _voyeur_toggleWebcam(instId) {
  const inst = _voyeur_state.instances[instId];
  if (!inst) return;

  const webcamsEl = document.getElementById('voyeur-webcams-' + instId);
  if (!webcamsEl) return;

  const isHidden = webcamsEl.style.display === 'none';
  webcamsEl.style.display = isHidden ? 'flex' : 'none';

  if (isHidden && inst.webcamMode === 'off') {
    navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      .then(stream => {
        inst.webcamStream = stream;
        inst.webcamMode = 'on';
        if (window._voyeurUsers[inst.userId]) window._voyeurUsers[inst.userId].webcamMode = 'on';
        Object.values(_voyeur_state.instances).forEach(i => {
          if (i.currentRoom === inst.currentRoom) {
            _voyeur_updateWebcams(i.instId);
            _voyeur_updateUI(i.instId);
          }
        });
      })
      .catch(err => {
        if (typeof algoSpeak === 'function') algoSpeak('Could not access webcam');
      });
  }

  if (isHidden) _voyeur_updateWebcams(instId);
}

function _voyeur_sendMessage(instId) {
  const inst = _voyeur_state.instances[instId];
  if (!inst) return;

  const input = document.getElementById('voyeur-input-' + instId);
  if (!input || !input.value.trim()) return;

  const room = window._voyeurRooms[inst.currentRoom];
  if (!room) return;

  room.messages.push({
    id: Date.now(),
    user: inst.userName,
    userId: inst.userId,
    text: input.value.trim(),
    time: new Date().toLocaleTimeString()
  });

  input.value = '';

  Object.values(_voyeur_state.instances).forEach(i => {
    if (i.currentRoom === inst.currentRoom) _voyeur_renderMessages(i.instId);
  });
}

function _voyeur_renderMessages(instId) {
  const inst = _voyeur_state.instances[instId];
  if (!inst) return;

  const messagesEl = document.getElementById('voyeur-messages-' + instId);
  if (!messagesEl) return;

  const room = window._voyeurRooms[inst.currentRoom];
  if (!room) return;

  const messages = room.messages.slice(-100);

  messagesEl.innerHTML = messages.map(msg => {
    if (msg.system) return '<div style="color:#008000;font-style:italic;">' + _voyeur_escapeHtml(msg.text) + '</div>';
    return '<div style="margin-bottom:6px;">' +
      '<div style="font-size:10px;color:#666;">' +
        '<span style="font-weight:bold;color:#000080;">' + _voyeur_escapeHtml(msg.user) + '</span>' +
        '<span style="color:#888;margin-left:4px;">' + msg.time + '</span>' +
      '</div>' +
      '<div style="margin-top:2px;word-wrap:break-word;">' + _voyeur_escapeHtml(msg.text) + '</div>' +
    '</div>';
  }).join('');

  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function _voyeur_addSystemMessage(instId, text) {
  const inst = _voyeur_state.instances[instId];
  if (!inst) return;

  const room = window._voyeurRooms[inst.currentRoom];
  if (!room) return;

  room.messages.push({ id: Date.now(), system: true, text: text, time: new Date().toLocaleTimeString() });

  Object.values(_voyeur_state.instances).forEach(i => {
    if (i.currentRoom === inst.currentRoom) _voyeur_renderMessages(i.instId);
  });
}

function _voyeur_cleanup(instId) {
  const inst = _voyeur_state.instances[instId];
  if (!inst) return;

  if (inst.webcamStream) inst.webcamStream.getTracks().forEach(t => t.stop());

  const room = window._voyeurRooms[inst.currentRoom];
  if (room) room.users = room.users.filter(u => u !== inst.userId);

  delete window._voyeurUsers[inst.userId];
  delete _voyeur_state.instances[instId];

  Object.values(_voyeur_state.instances).forEach(i => _voyeur_updateUI(i.instId));
}

window._voyeur_open = _voyeur_open;
window._voyeur_joinRoom = _voyeur_joinRoom;
window._voyeur_toggleWebcam = _voyeur_toggleWebcam;
window._voyeur_sendMessage = _voyeur_sendMessage;

_voyeur_open();
