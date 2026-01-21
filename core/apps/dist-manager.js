// System App: Distribution Manager
ALGO.app.name = 'Dist Manager';
ALGO.app.icon = '📦';

let _dist_winId = null;

function _dist_open() {
  if (typeof hideStartMenu === 'function') hideStartMenu();
  const id = typeof winId !== 'undefined' ? winId : Date.now();
  _dist_winId = id;

  ALGO.createWindow({
    title: 'Dist Manager',
    icon: '📦',
    width: 500,
    height: 450,
    content: '<div class="dist-container" style="padding:15px;font-family:sans-serif;">' +
      '<h2 style="margin:0 0 10px 0;">📦 Distribution Manager</h2>' +
      '<p style="color:#666;font-size:12px;margin-bottom:15px;">Share files and apps with other users on this server</p>' +

      '<div style="background:#f5f5f5;border:1px solid #ccc;padding:10px;margin-bottom:15px;">' +
        '<h4 style="margin:0 0 8px 0;">📤 Share a File</h4>' +
        '<input type="text" id="dist-name-' + id + '" placeholder="Display name" style="width:100%;padding:5px;margin-bottom:5px;box-sizing:border-box;">' +
        '<textarea id="dist-content-' + id + '" placeholder="File content or URL" style="width:100%;height:60px;padding:5px;box-sizing:border-box;resize:none;"></textarea>' +
        '<select id="dist-type-' + id + '" style="padding:5px;margin-top:5px;">' +
          '<option value="text">Text File</option>' +
          '<option value="app">App (.js)</option>' +
          '<option value="link">Link/URL</option>' +
        '</select>' +
        '<button onclick="_dist_share(' + id + ')" style="padding:5px 15px;margin-left:10px;">Share</button>' +
      '</div>' +

      '<div style="background:#fff;border:1px solid #ccc;padding:10px;">' +
        '<h4 style="margin:0 0 8px 0;">📥 Shared Items</h4>' +
        '<div id="dist-list-' + id + '" style="max-height:180px;overflow-y:auto;"></div>' +
      '</div>' +

      '<div style="margin-top:10px;text-align:right;">' +
        '<button onclick="_dist_refresh(' + id + ')">🔄 Refresh</button>' +
      '</div>' +
    '</div>'
  });

  _dist_refresh(id);
}

function _dist_share(id) {
  const name = document.getElementById('dist-name-' + id).value.trim();
  const content = document.getElementById('dist-content-' + id).value.trim();
  const type = document.getElementById('dist-type-' + id).value;

  if (!name || !content) {
    ALGO.notify('Please enter name and content');
    return;
  }

  // Get existing shared items
  let items = [];
  try {
    items = JSON.parse(localStorage.getItem('algo-dist-items') || '[]');
  } catch(e) {}

  // Add new item
  items.push({
    id: Date.now(),
    name: name,
    content: content,
    type: type,
    shared: new Date().toISOString().split('T')[0],
    author: typeof currentUser !== 'undefined' ? currentUser : 'guest'
  });

  localStorage.setItem('algo-dist-items', JSON.stringify(items));

  // Clear inputs
  document.getElementById('dist-name-' + id).value = '';
  document.getElementById('dist-content-' + id).value = '';

  ALGO.notify('Shared: ' + name);
  _dist_refresh(id);
}

function _dist_refresh(id) {
  const list = document.getElementById('dist-list-' + id);
  if (!list) return;

  let items = [];
  try {
    items = JSON.parse(localStorage.getItem('algo-dist-items') || '[]');
  } catch(e) {}

  if (items.length === 0) {
    list.innerHTML = '<div style="color:#888;font-size:12px;text-align:center;padding:20px;">No shared items yet</div>';
    return;
  }

  list.innerHTML = items.map(item =>
    '<div style="display:flex;align-items:center;padding:8px;border-bottom:1px solid #eee;">' +
      '<span style="font-size:18px;margin-right:10px;">' +
        (item.type === 'app' ? '📜' : item.type === 'link' ? '🔗' : '📄') +
      '</span>' +
      '<div style="flex:1;">' +
        '<div style="font-weight:bold;">' + _dist_escapeHtml(item.name) + '</div>' +
        '<div style="font-size:10px;color:#888;">by ' + _dist_escapeHtml(item.author) + ' on ' + item.shared + '</div>' +
      '</div>' +
      '<button onclick="_dist_download(' + item.id + ')" style="padding:3px 8px;font-size:11px;">Get</button>' +
      '<button onclick="_dist_delete(' + item.id + ',' + id + ')" style="padding:3px 8px;font-size:11px;margin-left:5px;">×</button>' +
    '</div>'
  ).join('');
}

function _dist_download(itemId) {
  let items = [];
  try {
    items = JSON.parse(localStorage.getItem('algo-dist-items') || '[]');
  } catch(e) {}

  const item = items.find(i => i.id === itemId);
  if (!item) {
    ALGO.notify('Item not found');
    return;
  }

  if (item.type === 'link') {
    window.open(item.content, '_blank');
  } else if (item.type === 'app' && typeof openJSIDE === 'function') {
    openJSIDE(item.content, item.name + '.js');
  } else if (typeof openNotepad === 'function') {
    openNotepad(item.content, item.name + '.txt');
  }
}

function _dist_delete(itemId, winId) {
  let items = [];
  try {
    items = JSON.parse(localStorage.getItem('algo-dist-items') || '[]');
  } catch(e) {}

  items = items.filter(i => i.id !== itemId);
  localStorage.setItem('algo-dist-items', JSON.stringify(items));

  _dist_refresh(winId);
  ALGO.notify('Item removed');
}

function _dist_escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

window._dist_open = _dist_open;
window._dist_share = _dist_share;
window._dist_refresh = _dist_refresh;
window._dist_download = _dist_download;
window._dist_delete = _dist_delete;

_dist_open();
