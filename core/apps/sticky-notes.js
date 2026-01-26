// System App: Sticky Notes
ALGO.app.name = 'Sticky Notes';
ALGO.app.icon = '📌';
ALGO.app.category = 'productivity';

let _sticky_notes = [];
let _sticky_nextId = 0;
let _sticky_dragging = null;
let _sticky_offset = { x: 0, y: 0 };

function _sticky_open() {
  if (typeof hideStartMenu === 'function') hideStartMenu();
  _sticky_load();

  ALGO.createWindow({
    title: 'Sticky Notes',
    icon: '📌',
    width: 300,
    height: 250,
    content: '<div style="padding:15px;">' +
      '<p style="margin:0 0 15px 0;">Create colorful sticky notes on your desktop!</p>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:15px;">' +
        '<button onclick="_sticky_create(\'#ffff88\')" style="background:#ffff88;width:32px;height:32px;border:1px solid #ccc;cursor:pointer;" title="Yellow">📝</button>' +
        '<button onclick="_sticky_create(\'#88ff88\')" style="background:#88ff88;width:32px;height:32px;border:1px solid #ccc;cursor:pointer;" title="Green">📝</button>' +
        '<button onclick="_sticky_create(\'#88ffff\')" style="background:#88ffff;width:32px;height:32px;border:1px solid #ccc;cursor:pointer;" title="Cyan">📝</button>' +
        '<button onclick="_sticky_create(\'#ff88ff\')" style="background:#ff88ff;width:32px;height:32px;border:1px solid #ccc;cursor:pointer;" title="Pink">📝</button>' +
        '<button onclick="_sticky_create(\'#ffbb88\')" style="background:#ffbb88;width:32px;height:32px;border:1px solid #ccc;cursor:pointer;" title="Orange">📝</button>' +
      '</div>' +
      '<p style="font-size:11px;color:#666;">Click a color to create a new note.<br>Drag notes by their header to move them.<br>Notes are saved automatically.</p>' +
      '<div style="margin-top:15px;border-top:1px solid #ccc;padding-top:10px;">' +
        '<strong>Active notes: <span id="sticky-count">' + _sticky_notes.length + '</span></strong>' +
        '<button onclick="_sticky_clearAll()" style="margin-left:10px;font-size:11px;">Clear All</button>' +
      '</div>' +
    '</div>'
  });
}

function _sticky_load() {
  try {
    const saved = localStorage.getItem('algo-sticky-notes');
    if (saved) {
      _sticky_notes = JSON.parse(saved);
      _sticky_nextId = Math.max(0, ..._sticky_notes.map(n => n.id)) + 1;
      _sticky_notes.forEach(n => _sticky_render(n));
    }
  } catch(e) {}
}

function _sticky_save() {
  try {
    localStorage.setItem('algo-sticky-notes', JSON.stringify(_sticky_notes));
  } catch(e) {}
  _sticky_updateCount();
}

function _sticky_updateCount() {
  const el = document.getElementById('sticky-count');
  if (el) el.textContent = _sticky_notes.length;
}

function _sticky_create(color) {
  const id = _sticky_nextId++;
  const note = {
    id: id,
    x: 200 + (id % 5) * 30,
    y: 100 + (id % 5) * 30,
    text: '',
    color: color || '#ffff88',
    width: 200,
    height: 150
  };
  _sticky_notes.push(note);
  _sticky_save();
  _sticky_render(note);
}

function _sticky_render(note) {
  // Remove existing if re-rendering
  const existing = document.getElementById('sticky-' + note.id);
  if (existing) existing.remove();

  const desktop = document.getElementById('desktop');
  if (!desktop) return;

  const el = document.createElement('div');
  el.id = 'sticky-' + note.id;
  el.className = 'sticky-note';
  el.style.cssText = `
    position: absolute;
    left: ${note.x}px;
    top: ${note.y}px;
    width: ${note.width}px;
    height: ${note.height}px;
    background: ${note.color};
    border: 1px solid rgba(0,0,0,0.2);
    box-shadow: 2px 2px 8px rgba(0,0,0,0.2);
    display: flex;
    flex-direction: column;
    z-index: 100;
    font-family: 'Comic Sans MS', cursive, sans-serif;
  `;

  el.innerHTML = `
    <div class="sticky-header" style="
      background: rgba(0,0,0,0.1);
      padding: 4px 8px;
      cursor: move;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
    " onmousedown="_sticky_startDrag(event, ${note.id})">
      <span>📌 Note</span>
      <button onclick="_sticky_delete(${note.id})" style="background:none;border:none;cursor:pointer;font-size:14px;">✕</button>
    </div>
    <textarea style="
      flex: 1;
      border: none;
      background: transparent;
      padding: 8px;
      font-family: inherit;
      font-size: 13px;
      resize: none;
      outline: none;
    " placeholder="Type here..." onchange="_sticky_updateText(${note.id}, this.value)">${_sticky_escape(note.text)}</textarea>
  `;

  desktop.appendChild(el);
}

function _sticky_escape(s) {
  return String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _sticky_startDrag(e, id) {
  e.preventDefault();
  const note = _sticky_notes.find(n => n.id === id);
  if (!note) return;

  _sticky_dragging = note;
  const el = document.getElementById('sticky-' + id);
  if (el) {
    const rect = el.getBoundingClientRect();
    _sticky_offset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  document.addEventListener('mousemove', _sticky_onDrag);
  document.addEventListener('mouseup', _sticky_endDrag);
}

function _sticky_onDrag(e) {
  if (!_sticky_dragging) return;
  const el = document.getElementById('sticky-' + _sticky_dragging.id);
  if (!el) return;

  const desktop = document.getElementById('desktop');
  const dRect = desktop ? desktop.getBoundingClientRect() : { left: 0, top: 0 };

  _sticky_dragging.x = e.clientX - dRect.left - _sticky_offset.x;
  _sticky_dragging.y = e.clientY - dRect.top - _sticky_offset.y;

  el.style.left = _sticky_dragging.x + 'px';
  el.style.top = _sticky_dragging.y + 'px';
}

function _sticky_endDrag() {
  document.removeEventListener('mousemove', _sticky_onDrag);
  document.removeEventListener('mouseup', _sticky_endDrag);
  _sticky_save();
  _sticky_dragging = null;
}

function _sticky_updateText(id, text) {
  const note = _sticky_notes.find(n => n.id === id);
  if (note) {
    note.text = text;
    _sticky_save();
  }
}

function _sticky_delete(id) {
  const el = document.getElementById('sticky-' + id);
  if (el) el.remove();
  _sticky_notes = _sticky_notes.filter(n => n.id !== id);
  _sticky_save();
}

function _sticky_clearAll() {
  if (!confirm('Delete all sticky notes?')) return;
  _sticky_notes.forEach(n => {
    const el = document.getElementById('sticky-' + n.id);
    if (el) el.remove();
  });
  _sticky_notes = [];
  _sticky_save();
}

// Export for global access
window._sticky_open = _sticky_open;
window._sticky_create = _sticky_create;
window._sticky_startDrag = _sticky_startDrag;
window._sticky_onDrag = _sticky_onDrag;
window._sticky_endDrag = _sticky_endDrag;
window._sticky_updateText = _sticky_updateText;
window._sticky_delete = _sticky_delete;
window._sticky_clearAll = _sticky_clearAll;

// Auto-open
_sticky_open();
