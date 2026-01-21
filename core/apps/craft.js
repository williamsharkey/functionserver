// System App: Craft (UI Component Builder)
ALGO.app.name = 'Craft';
ALGO.app.icon = '🔧';

let _craft_winId = null;

const _craft_defaultCode = `ALGO.component('MyButton', {
  props: ['text', 'color'],
  render: (props) => \`
    <button style="background: \${props.color || '#0078d4'}; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer;">
      \${props.text || 'Click Me'}
    </button>
  \`
});`;

function _craft_open() {
  if (typeof hideStartMenu === 'function') hideStartMenu();
  const id = typeof winId !== 'undefined' ? winId : Date.now();
  _craft_winId = id;

  ALGO.createWindow({
    title: 'Craft',
    icon: '🔧',
    width: 650,
    height: 480,
    content: '<div class="craft-container">' +
      '<div class="craft-toolbar">' +
        '<select id="craft-component-' + id + '" onchange="_craft_loadExample(this.value)">' +
          '<option value="">-- Examples --</option>' +
          '<option value="button">Button</option>' +
          '<option value="card">Card</option>' +
          '<option value="input">Input Field</option>' +
          '<option value="alert">Alert Box</option>' +
        '</select>' +
        '<button onclick="_craft_new()">+ New</button>' +
        '<button onclick="_craft_save()">💾 Save</button>' +
        '<button onclick="_craft_test()">▶ Test</button>' +
      '</div>' +
      '<div class="craft-main">' +
        '<div class="craft-editor">' +
          '<h4>Component Definition</h4>' +
          '<textarea id="craft-code-' + id + '" style="width:100%;height:200px;font-family:monospace;font-size:12px;">' + _craft_escape(_craft_defaultCode) + '</textarea>' +
        '</div>' +
        '<div class="craft-preview" id="craft-preview-' + id + '">' +
          '<h4>Preview</h4>' +
          '<div style="padding:20px;border:1px dashed #ccc;min-height:100px;">' +
            '<p style="color:#888;">Click Test to preview</p>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>'
  });
}

function _craft_escape(s) {
  return String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const _craft_examples = {
  button: `ALGO.component('MyButton', {
  props: ['text', 'color', 'onClick'],
  render: (props) => \`
    <button onclick="\${props.onClick || ''}" style="
      background: \${props.color || '#0078d4'};
      color: white;
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
    ">
      \${props.text || 'Button'}
    </button>
  \`
});`,
  card: `ALGO.component('Card', {
  props: ['title', 'content', 'footer'],
  render: (props) => \`
    <div style="
      background: white;
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 16px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      max-width: 300px;
    ">
      <h3 style="margin: 0 0 8px 0;">\${props.title || 'Card Title'}</h3>
      <p style="margin: 0 0 12px 0; color: #666;">\${props.content || 'Card content goes here.'}</p>
      <div style="border-top: 1px solid #eee; padding-top: 8px; font-size: 12px; color: #888;">
        \${props.footer || 'Footer'}
      </div>
    </div>
  \`
});`,
  input: `ALGO.component('TextInput', {
  props: ['label', 'placeholder', 'type'],
  render: (props) => \`
    <div style="margin-bottom: 12px;">
      <label style="display: block; margin-bottom: 4px; font-weight: bold; font-size: 14px;">
        \${props.label || 'Label'}
      </label>
      <input type="\${props.type || 'text'}" placeholder="\${props.placeholder || ''}" style="
        width: 100%;
        padding: 8px;
        border: 1px solid #ccc;
        border-radius: 4px;
        font-size: 14px;
        box-sizing: border-box;
      ">
    </div>
  \`
});`,
  alert: `ALGO.component('AlertBox', {
  props: ['type', 'message'],
  render: (props) => {
    const colors = {
      success: { bg: '#d4edda', border: '#28a745', text: '#155724' },
      warning: { bg: '#fff3cd', border: '#ffc107', text: '#856404' },
      error: { bg: '#f8d7da', border: '#dc3545', text: '#721c24' },
      info: { bg: '#d1ecf1', border: '#17a2b8', text: '#0c5460' }
    };
    const c = colors[props.type] || colors.info;
    return \`
      <div style="
        background: \${c.bg};
        border: 1px solid \${c.border};
        color: \${c.text};
        padding: 12px 16px;
        border-radius: 4px;
        margin-bottom: 12px;
      ">
        \${props.message || 'Alert message'}
      </div>
    \`;
  }
});`
};

function _craft_loadExample(name) {
  const id = _craft_winId;
  if (!name || !_craft_examples[name]) return;
  document.getElementById('craft-code-' + id).value = _craft_examples[name];
}

function _craft_new() {
  const name = prompt('Component name:', 'MyComponent');
  if (!name) return;
  const id = _craft_winId;

  document.getElementById('craft-code-' + id).value =
    `ALGO.component('${name}', {
  props: ['text'],
  render: (props) => \`
    <div>\${props.text || 'Hello'}</div>
  \`
});`;
}

function _craft_save() {
  const id = _craft_winId;
  const code = document.getElementById('craft-code-' + id).value;
  const match = code.match(/ALGO\.component\(['"](\w+)['"]/);
  const name = match ? match[1] : 'component';
  const filename = name.toLowerCase() + '.ui';

  if (typeof savedFiles !== 'undefined' && typeof saveState === 'function') {
    savedFiles.push({ name: filename, type: 'text', content: code });
    saveState();
    if (typeof createDesktopIcons === 'function') createDesktopIcons();
  }

  if (typeof algoSpeak === 'function') algoSpeak('Saved ' + filename);
}

function _craft_test() {
  const id = _craft_winId;
  const code = document.getElementById('craft-code-' + id).value;
  const preview = document.getElementById('craft-preview-' + id);

  try {
    // Create a mock ALGO.component for preview
    let lastComponent = null;
    const mockALGO = {
      component: (name, def) => {
        lastComponent = { name, def };
      }
    };

    // Evaluate with mock
    const fn = new Function('ALGO', code);
    fn(mockALGO);

    if (lastComponent && lastComponent.def && lastComponent.def.render) {
      const rendered = lastComponent.def.render({});
      preview.innerHTML = '<h4>Preview</h4><div style="padding:20px;border:1px solid #ccc;">' + rendered + '</div>';
    } else {
      preview.innerHTML = '<h4>Preview</h4><div style="padding:20px;color:green;">Component registered: ' + (lastComponent ? lastComponent.name : 'unknown') + '</div>';
    }
  } catch (e) {
    const escaped = typeof escapeHtml === 'function' ? escapeHtml(e.message) : e.message;
    preview.innerHTML = '<h4>Preview</h4><div style="padding:20px;color:red;">Error: ' + escaped + '</div>';
  }
}

// Export for global access
window._craft_open = _craft_open;
window._craft_loadExample = _craft_loadExample;
window._craft_new = _craft_new;
window._craft_save = _craft_save;
window._craft_test = _craft_test;

// Auto-open
_craft_open();
