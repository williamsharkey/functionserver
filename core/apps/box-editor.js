// System App: Box Editor
// ASCII/Unicode box drawing editor
ALGO.app.name = 'Box Editor';
ALGO.app.icon = '📦';
ALGO.app.category = 'graphics';

// App state
const _be_instances = {}; // winId -> { grid, cursorX, cursorY, width, height, filename, currentChar }

const _be_CHARS = {
  corners: ['┌', '┐', '└', '┘', '╔', '╗', '╚', '╝'],
  lines: ['─', '│', '═', '║', '╌', '╎'],
  tees: ['├', '┤', '┬', '┴', '╠', '╣', '╦', '╩', '┼', '╬'],
  arrows: ['←', '→', '↑', '↓', '↔', '↕'],
  blocks: ['█', '▓', '▒', '░', '▄', '▀', '▌', '▐']
};

function _be_open(content, filename) {
  if (typeof hideStartMenu === 'function') hideStartMenu();
  const id = typeof winId !== 'undefined' ? winId : 0;
  const fname = filename || 'untitled.box';
  const width = 60;
  const height = 20;
  const esc = typeof escapeHtml === 'function' ? escapeHtml : (s => s);

  ALGO.createWindow({
    title: 'Box Editor',
    icon: '📦',
    width: 600,
    height: 450,
    content: ''
  });

  const win = typeof getWindowById === 'function' ? getWindowById(id) : document.querySelector('.window:last-child');
  if (!win) return;

  const contentEl = win.querySelector('.window-content');
  contentEl.style.background = '#1a1a2e';
  contentEl.style.padding = '0';
  contentEl.style.overflow = 'hidden';

  // Initialize grid
  let grid = [];
  if (content && content.trim().startsWith('//')) {
    const lines = content.split('\n').slice(1);
    for (let y = 0; y < height; y++) {
      grid[y] = [];
      const line = lines[y] || '';
      for (let x = 0; x < width; x++) {
        grid[y][x] = line[x] || ' ';
      }
    }
  } else if (content) {
    const lines = content.split('\n');
    for (let y = 0; y < height; y++) {
      grid[y] = [];
      const line = lines[y] || '';
      for (let x = 0; x < width; x++) {
        grid[y][x] = line[x] || ' ';
      }
    }
  } else {
    for (let y = 0; y < height; y++) {
      grid[y] = [];
      for (let x = 0; x < width; x++) {
        grid[y][x] = ' ';
      }
    }
  }

  _be_instances[id] = {
    grid,
    cursorX: 0,
    cursorY: 0,
    width,
    height,
    filename: fname,
    currentChar: '█'
  };

  const charButtons = Object.values(_be_CHARS).flat().map(c =>
    '<button onclick="_be_setChar(' + id + ',\'' + c + '\')">' + c + '</button>'
  ).join('');

  contentEl.innerHTML = `
    <div class="box-editor">
      <div class="box-editor-toolbar">
        <button onclick="_be_new(${id})">New</button>
        <button onclick="_be_clear(${id})">Clear</button>
        <span style="margin-left:8px;color:#888;" id="be-filename-${id}">${esc(fname)}</span>
      </div>
      <div class="box-editor-toolbar">
        <div class="box-editor-charbar">${charButtons}</div>
        <span style="color:#4ecdc4;" id="be-current-${id}">Current: █</span>
      </div>
      <div class="box-editor-canvas" id="be-canvas-${id}" onclick="_be_click(event,${id})">
        <pre id="be-grid-${id}"></pre>
      </div>
      <div class="box-editor-status">
        <span id="be-pos-${id}">Pos: 0,0</span>
        <span>Click to place character | Type to insert text</span>
      </div>
    </div>
  `;

  _be_render(id);

  const canvas = document.getElementById('be-canvas-' + id);
  canvas.tabIndex = 0;
  canvas.addEventListener('keydown', (e) => _be_keydown(e, id));
  canvas.focus();
}

function _be_render(id) {
  const inst = _be_instances[id];
  if (!inst) return;

  const gridEl = document.getElementById('be-grid-' + id);
  if (!gridEl) return;

  const esc = typeof escapeHtml === 'function' ? escapeHtml : (s => s);
  let html = '';
  for (let y = 0; y < inst.height; y++) {
    for (let x = 0; x < inst.width; x++) {
      const char = inst.grid[y][x] || ' ';
      if (x === inst.cursorX && y === inst.cursorY) {
        html += '<span style="background:#e94560;color:#fff;">' + esc(char) + '</span>';
      } else {
        html += esc(char);
      }
    }
    html += '\n';
  }
  gridEl.innerHTML = html;
}

function _be_click(e, id) {
  const inst = _be_instances[id];
  if (!inst) return;

  const gridEl = document.getElementById('be-grid-' + id);
  const rect = gridEl.getBoundingClientRect();
  const style = window.getComputedStyle(gridEl);
  const charWidth = parseFloat(style.fontSize) * 0.6;
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;

  const x = Math.floor((e.clientX - rect.left) / charWidth);
  const y = Math.floor((e.clientY - rect.top) / lineHeight);

  if (x >= 0 && x < inst.width && y >= 0 && y < inst.height) {
    inst.cursorX = x;
    inst.cursorY = y;
    inst.grid[y][x] = inst.currentChar;
    _be_render(id);
    document.getElementById('be-pos-' + id).textContent = 'Pos: ' + x + ',' + y;
  }

  document.getElementById('be-canvas-' + id).focus();
}

function _be_keydown(e, id) {
  const inst = _be_instances[id];
  if (!inst) return;

  e.preventDefault();

  if (e.key === 'ArrowUp' && inst.cursorY > 0) inst.cursorY--;
  else if (e.key === 'ArrowDown' && inst.cursorY < inst.height - 1) inst.cursorY++;
  else if (e.key === 'ArrowLeft' && inst.cursorX > 0) inst.cursorX--;
  else if (e.key === 'ArrowRight' && inst.cursorX < inst.width - 1) inst.cursorX++;
  else if (e.key === 'Backspace') {
    if (inst.cursorX > 0) inst.cursorX--;
    inst.grid[inst.cursorY][inst.cursorX] = ' ';
  } else if (e.key === 'Delete') {
    inst.grid[inst.cursorY][inst.cursorX] = ' ';
  } else if (e.key === 'Enter') {
    inst.cursorX = 0;
    if (inst.cursorY < inst.height - 1) inst.cursorY++;
  } else if (e.key.length === 1) {
    inst.grid[inst.cursorY][inst.cursorX] = e.key;
    if (inst.cursorX < inst.width - 1) inst.cursorX++;
  }

  _be_render(id);
  document.getElementById('be-pos-' + id).textContent = 'Pos: ' + inst.cursorX + ',' + inst.cursorY;
}

function _be_setChar(id, char) {
  const inst = _be_instances[id];
  if (!inst) return;
  inst.currentChar = char;
  document.getElementById('be-current-' + id).textContent = 'Current: ' + char;
}

function _be_new(id) {
  const inst = _be_instances[id];
  if (!inst) return;
  for (let y = 0; y < inst.height; y++) {
    for (let x = 0; x < inst.width; x++) {
      inst.grid[y][x] = ' ';
    }
  }
  inst.cursorX = 0;
  inst.cursorY = 0;
  inst.filename = 'untitled.box';
  document.getElementById('be-filename-' + id).textContent = 'untitled.box';
  _be_render(id);
}

function _be_clear(id) {
  const inst = _be_instances[id];
  if (!inst) return;
  for (let y = 0; y < inst.height; y++) {
    for (let x = 0; x < inst.width; x++) {
      inst.grid[y][x] = ' ';
    }
  }
  _be_render(id);
}

// Run the app
_be_open();
