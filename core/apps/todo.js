// System App: Todo Manager
ALGO.app.name = 'Todo Manager';
ALGO.app.icon = '📋';

let _todo_lists = [];
let _todo_selectedList = null;
let _todo_winId = null;

function _todo_open() {
  if (typeof hideStartMenu === 'function') hideStartMenu();
  _todo_load();
  const id = typeof winId !== 'undefined' ? winId : Date.now();
  _todo_winId = id;

  ALGO.createWindow({
    title: 'Todo Manager',
    icon: '📋',
    width: 400,
    height: 350,
    content: '<div class="todo-app" id="todo-app-' + id + '"></div>'
  });

  _todo_render();
}

function _todo_load() {
  try {
    const saved = localStorage.getItem('algo-todo-lists');
    if (saved) _todo_lists = JSON.parse(saved);
    if (_todo_lists.length === 0) {
      _todo_lists.push({ id: 'default', name: 'My Tasks', items: [] });
    }
    if (!_todo_selectedList) _todo_selectedList = _todo_lists[0].id;
  } catch(e) {
    _todo_lists = [{ id: 'default', name: 'My Tasks', items: [] }];
    _todo_selectedList = 'default';
  }
}

function _todo_save() {
  try {
    localStorage.setItem('algo-todo-lists', JSON.stringify(_todo_lists));
  } catch(e) {}
}

function _todo_render() {
  const id = _todo_winId;
  const container = document.getElementById('todo-app-' + id);
  if (!container) return;

  const list = _todo_lists.find(l => l.id === _todo_selectedList) || _todo_lists[0];
  if (!list) return;

  let html = '<div class="todo-header">';
  html += '<select onchange="_todo_selectList(this.value)">';
  _todo_lists.forEach(l => {
    html += '<option value="' + l.id + '"' + (l.id === _todo_selectedList ? ' selected' : '') + '>' +
      (typeof escapeHtml === 'function' ? escapeHtml(l.name) : l.name) + '</option>';
  });
  html += '</select>';
  html += '<button onclick="_todo_newList()" title="New List">+</button>';
  html += '</div>';

  html += '<div class="todo-items">';
  if (list.items.length === 0) {
    html += '<div class="todo-empty">No tasks yet. Add one below!</div>';
  } else {
    list.items.forEach(item => {
      html += '<div class="todo-item' + (item.done ? ' done' : '') + '">';
      html += '<input type="checkbox" ' + (item.done ? 'checked' : '') + ' onchange="_todo_toggle(\'' + item.id + '\')">';
      html += '<span class="todo-text">' + (typeof escapeHtml === 'function' ? escapeHtml(item.text) : item.text) + '</span>';
      html += '<button class="todo-delete" onclick="_todo_delete(\'' + item.id + '\')">✕</button>';
      html += '</div>';
    });
  }
  html += '</div>';

  html += '<div class="todo-add">';
  html += '<input type="text" id="todo-input-' + id + '" placeholder="Add a task..." onkeypress="if(event.key===\'Enter\')_todo_add()">';
  html += '<button onclick="_todo_add()">Add</button>';
  html += '</div>';

  // Stats
  const done = list.items.filter(i => i.done).length;
  const total = list.items.length;
  html += '<div class="todo-stats">' + done + '/' + total + ' completed</div>';

  container.innerHTML = html;
}

function _todo_selectList(listId) {
  _todo_selectedList = listId;
  _todo_render();
}

function _todo_newList() {
  const name = prompt('List name:', 'New List');
  if (!name) return;
  const newList = { id: 'list-' + Date.now(), name: name, items: [] };
  _todo_lists.push(newList);
  _todo_selectedList = newList.id;
  _todo_save();
  _todo_render();
}

function _todo_add() {
  const id = _todo_winId;
  const input = document.getElementById('todo-input-' + id);
  if (!input || !input.value.trim()) return;

  const list = _todo_lists.find(l => l.id === _todo_selectedList);
  if (!list) return;

  list.items.push({
    id: 'item-' + Date.now(),
    text: input.value.trim(),
    done: false,
    created: Date.now()
  });

  input.value = '';
  _todo_save();
  _todo_render();
}

function _todo_toggle(itemId) {
  const list = _todo_lists.find(l => l.id === _todo_selectedList);
  if (!list) return;

  const item = list.items.find(i => i.id === itemId);
  if (item) {
    item.done = !item.done;
    _todo_save();
    _todo_render();
  }
}

function _todo_delete(itemId) {
  const list = _todo_lists.find(l => l.id === _todo_selectedList);
  if (!list) return;

  list.items = list.items.filter(i => i.id !== itemId);
  _todo_save();
  _todo_render();
}

// Export for global access
window._todo_open = _todo_open;
window._todo_selectList = _todo_selectList;
window._todo_newList = _todo_newList;
window._todo_add = _todo_add;
window._todo_toggle = _todo_toggle;
window._todo_delete = _todo_delete;

// Auto-open
_todo_open();
