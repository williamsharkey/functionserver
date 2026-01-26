// System App: Designer (Layout Editor)
ALGO.app.name = 'Designer';
ALGO.app.icon = '📐';
ALGO.app.category = 'graphics';

let _designer_winId = null;
let _designer_screens = [];
let _designer_currentScreen = null;
let _designer_selectedComp = null;

function _designer_open() {
  if (typeof hideStartMenu === 'function') hideStartMenu();
  const id = typeof winId !== 'undefined' ? winId : Date.now();
  _designer_winId = id;

  ALGO.createWindow({
    title: 'Designer',
    icon: '📐',
    width: 700,
    height: 500,
    content: '<div class="designer-container">' +
      '<div class="designer-toolbar">' +
        '<select id="designer-screen-' + id + '" onchange="_designer_loadScreen(this.value)">' +
          '<option value="">New Screen</option>' +
        '</select>' +
        '<button onclick="_designer_newScreen()">+ Screen</button>' +
        '<button onclick="_designer_save()">💾 Save</button>' +
        '<button onclick="_designer_preview()">▶ Preview</button>' +
        '<button onclick="_designer_export()">📤 Export</button>' +
      '</div>' +
      '<div class="designer-main">' +
        '<div class="designer-components">' +
          '<h4>Components</h4>' +
          '<div class="comp-item" draggable="true" ondragstart="_designer_dragStart(event,\'button\')">Button</div>' +
          '<div class="comp-item" draggable="true" ondragstart="_designer_dragStart(event,\'text\')">Text</div>' +
          '<div class="comp-item" draggable="true" ondragstart="_designer_dragStart(event,\'input\')">Input</div>' +
          '<div class="comp-item" draggable="true" ondragstart="_designer_dragStart(event,\'image\')">Image</div>' +
          '<div class="comp-item" draggable="true" ondragstart="_designer_dragStart(event,\'container\')">Container</div>' +
          '<div class="comp-item" draggable="true" ondragstart="_designer_dragStart(event,\'list\')">List</div>' +
        '</div>' +
        '<div class="designer-canvas" id="designer-canvas-' + id + '" ondrop="_designer_drop(event)" ondragover="event.preventDefault()">' +
          '<div class="canvas-placeholder">Drag components here</div>' +
        '</div>' +
        '<div class="designer-props" id="designer-props-' + id + '">' +
          '<h4>Properties</h4>' +
          '<p style="color:#666;font-size:11px;">Select a component</p>' +
        '</div>' +
      '</div>' +
    '</div>'
  });
}

function _designer_dragStart(e, type) {
  e.dataTransfer.setData('text/plain', type);
}

function _designer_drop(e) {
  e.preventDefault();
  const id = _designer_winId;
  const type = e.dataTransfer.getData('text/plain');
  const canvas = document.getElementById('designer-canvas-' + id);

  // Remove placeholder
  const placeholder = canvas.querySelector('.canvas-placeholder');
  if (placeholder) placeholder.remove();

  // Create component
  const comp = document.createElement('div');
  comp.className = 'designer-comp';
  comp.dataset.type = type;
  comp.dataset.id = 'comp-' + Date.now();
  comp.onclick = (ev) => { ev.stopPropagation(); _designer_selectComp(comp); };

  const rect = canvas.getBoundingClientRect();
  comp.style.left = (e.clientX - rect.left - 40) + 'px';
  comp.style.top = (e.clientY - rect.top - 15) + 'px';

  switch(type) {
    case 'button':
      comp.innerHTML = '<button>Button</button>';
      break;
    case 'text':
      comp.innerHTML = '<span>Text Label</span>';
      break;
    case 'input':
      comp.innerHTML = '<input type="text" placeholder="Input">';
      break;
    case 'image':
      comp.innerHTML = '<div style="width:100px;height:60px;background:#ddd;display:flex;align-items:center;justify-content:center;">📷</div>';
      break;
    case 'container':
      comp.innerHTML = '<div style="width:150px;height:100px;border:2px dashed #999;background:#f5f5f5;"></div>';
      break;
    case 'list':
      comp.innerHTML = '<ul style="margin:0;padding-left:20px;"><li>Item 1</li><li>Item 2</li><li>Item 3</li></ul>';
      break;
  }

  canvas.appendChild(comp);
  _designer_selectComp(comp);
}

function _designer_selectComp(comp) {
  const id = _designer_winId;
  // Deselect previous
  document.querySelectorAll('.designer-comp.selected').forEach(c => c.classList.remove('selected'));
  comp.classList.add('selected');
  _designer_selectedComp = comp;

  // Show properties
  const props = document.getElementById('designer-props-' + id);
  const type = comp.dataset.type;

  let html = '<h4>Properties</h4>';
  html += '<label>Type: ' + type + '</label>';
  html += '<div style="margin-top:8px;">';
  html += '<label>X:</label><input type="number" value="' + parseInt(comp.style.left) + '" onchange="_designer_updateProp(\'left\',this.value+\'px\')" style="width:50px;">';
  html += '<label style="margin-left:8px;">Y:</label><input type="number" value="' + parseInt(comp.style.top) + '" onchange="_designer_updateProp(\'top\',this.value+\'px\')" style="width:50px;">';
  html += '</div>';
  html += '<button onclick="_designer_deleteComp()" style="margin-top:10px;color:red;">Delete</button>';

  props.innerHTML = html;
}

function _designer_updateProp(prop, value) {
  if (_designer_selectedComp) {
    _designer_selectedComp.style[prop] = value;
  }
}

function _designer_deleteComp() {
  if (_designer_selectedComp) {
    _designer_selectedComp.remove();
    _designer_selectedComp = null;
    const props = document.getElementById('designer-props-' + _designer_winId);
    if (props) props.innerHTML = '<h4>Properties</h4><p style="color:#666;font-size:11px;">Select a component</p>';
  }
}

function _designer_newScreen() {
  const name = prompt('Screen name:', 'screen-' + Date.now().toString(36));
  if (!name) return;
  const id = _designer_winId;

  const canvas = document.getElementById('designer-canvas-' + id);
  canvas.innerHTML = '<div class="canvas-placeholder">Drag components here</div>';
  canvas.dataset.screen = name;
  _designer_currentScreen = name;

  const select = document.getElementById('designer-screen-' + id);
  const opt = document.createElement('option');
  opt.value = name;
  opt.textContent = name;
  select.appendChild(opt);
  select.value = name;
}

function _designer_loadScreen(name) {
  // TODO: Load saved screen
  _designer_currentScreen = name;
}

function _designer_save() {
  const id = _designer_winId;
  const canvas = document.getElementById('designer-canvas-' + id);
  const screenName = canvas.dataset.screen || 'untitled';

  const components = [];
  canvas.querySelectorAll('.designer-comp').forEach(comp => {
    components.push({
      type: comp.dataset.type,
      id: comp.dataset.id,
      x: parseInt(comp.style.left),
      y: parseInt(comp.style.top),
      content: comp.innerHTML
    });
  });

  const layout = { screen: screenName, components: components };
  const filename = screenName + '.layout';

  if (typeof savedFiles !== 'undefined' && typeof saveState === 'function') {
    savedFiles.push({ name: filename, type: 'text', content: JSON.stringify(layout, null, 2) });
    saveState();
    if (typeof createDesktopIcons === 'function') createDesktopIcons();
  }

  if (typeof algoSpeak === 'function') algoSpeak('Saved ' + filename);
}

function _designer_preview() {
  if (typeof algoSpeak === 'function') algoSpeak('Preview coming soon');
}

function _designer_export() {
  const id = _designer_winId;
  const canvas = document.getElementById('designer-canvas-' + id);

  let html = '<div class="screen">\n';
  canvas.querySelectorAll('.designer-comp').forEach(comp => {
    html += '  <div style="position:absolute;left:' + comp.style.left + ';top:' + comp.style.top + ';">\n';
    html += '    ' + comp.innerHTML + '\n';
    html += '  </div>\n';
  });
  html += '</div>';

  ALGO.createWindow({
    title: 'Export',
    icon: '📤',
    width: 400,
    height: 300,
    content: '<textarea style="width:100%;height:100%;font-family:monospace;font-size:11px;">' + html.replace(/</g,'&lt;') + '</textarea>'
  });
}

// Export for global access
window._designer_open = _designer_open;
window._designer_dragStart = _designer_dragStart;
window._designer_drop = _designer_drop;
window._designer_selectComp = _designer_selectComp;
window._designer_updateProp = _designer_updateProp;
window._designer_deleteComp = _designer_deleteComp;
window._designer_newScreen = _designer_newScreen;
window._designer_loadScreen = _designer_loadScreen;
window._designer_save = _designer_save;
window._designer_preview = _designer_preview;
window._designer_export = _designer_export;

// Auto-open
_designer_open();
