// Icons - FunctionServer Icon Customizer
ALGO.app.name = 'Icons';
ALGO.app.icon = '🎭';
ALGO.app.category = 'graphics';

(function() {
  // Icon categories with friendly names
  const CATEGORIES = {
    system: 'FunctionServer',
    programs: 'Programs Menu',
    documentation: 'Documentation',
    help: 'Help',
    about: 'About',
    settings: 'Settings',
    logout: 'Log Out',
    login: 'Login',
    user: 'User',
    eye: 'Eye Bridge',
    shadow: 'Shadow Tabs',
    notepad: 'Notepad',
    ide: 'Code Editor',
    browser: 'Browser',
    toast: 'Notifications',
    copy: 'Copy',
    app: 'Default App'
  };

  const BLEND_MODES = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'difference'];
  const POSITIONS = { tl: 'Top Left', tr: 'Top Right', bl: 'Bottom Left', br: 'Bottom Right', c: 'Center' };

  let currentTab = 'presets';
  let editorState = {
    main: '📁',
    sub: '',
    blend: 'normal',
    scale: 0.5,
    pos: 'br',
    mono: false,
    skewX: 0,
    skewY: 0,
    offsetX: 0,
    offsetY: 0,
    fontSize: 100,    // percentage of parent
    rows: 4,          // max lines for dynamic/multiline
    cols: 12,         // max chars per line
    trimStart: true,  // strip leading whitespace
    showBounds: false, // show bounding box preview
    // New: drop shadow and color options
    shadow: false,     // true for default shadow, or custom string
    shadowCustom: '1px 1px 3px rgba(0,0,0,0.5)', // custom shadow value
    subColor: '',      // explicit color (empty = default)
    useThemeColors: false  // use CSS variables for theme compatibility
  };

  function createIconsApp(container) {
    const defs = window.ICON_DEFS || {};
    const custom = window.customIcons || {};

    let html = `
      <div class="icons-app" style="font-family: system-ui, sans-serif; height: 100%; display: flex; flex-direction: column; background: var(--surface);">
        <div style="display: flex; border-bottom: 1px solid var(--border);">
          <div class="icons-tab ${currentTab === 'presets' ? 'active' : ''}" onclick="window._iconsTab('presets')" style="flex: 1; padding: 12px; text-align: center; cursor: pointer; font-size: 13px; color: ${currentTab === 'presets' ? 'var(--text)' : 'var(--text-secondary)'}; border-bottom: 2px solid ${currentTab === 'presets' ? 'var(--accent)' : 'transparent'};">
            Presets
          </div>
          <div class="icons-tab ${currentTab === 'create' ? 'active' : ''}" onclick="window._iconsTab('create')" style="flex: 1; padding: 12px; text-align: center; cursor: pointer; font-size: 13px; color: ${currentTab === 'create' ? 'var(--text)' : 'var(--text-secondary)'}; border-bottom: 2px solid ${currentTab === 'create' ? 'var(--accent)' : 'transparent'};">
            Create
          </div>
        </div>
        <div style="flex: 1; overflow-y: auto; padding: 16px;">
    `;

    if (currentTab === 'presets') {
      html += renderPresetsTab(defs, custom);
    } else {
      html += renderCreateTab();
    }

    html += `
        </div>
      </div>
    `;

    container.innerHTML = html;
    setupHandlers(container, defs, custom);
  }

  function renderPresetsTab(defs, custom) {
    let html = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <div>
          <h2 style="margin: 0 0 4px; font-size: 18px; color: var(--text);">System Icons</h2>
          <p style="margin: 0; font-size: 12px; color: var(--text-secondary);">Click to select, or create custom icons</p>
        </div>
        <button onclick="window._iconsResetAll()" style="padding: 6px 12px; background: var(--surface-raised); border: 1px solid var(--border); border-radius: 4px; color: var(--text-secondary); cursor: pointer; font-size: 12px;">
          Reset All
        </button>
      </div>
      <div style="display: flex; flex-direction: column; gap: 2px;">
    `;

    for (const [key, label] of Object.entries(CATEGORIES)) {
      const def = defs[key];
      if (!def) continue;

      const current = custom[key] || def.default;
      const isCustomObj = typeof current === 'object';
      const currentDisplay = isCustomObj ? renderIconPreview(current) : current;
      const isDefault = !custom[key];
      const allOptions = [def.default, ...def.alts];

      html += `
        <div class="icon-row" data-key="${key}" style="display: flex; align-items: center; padding: 8px 12px; background: var(--bg); border-radius: 6px; gap: 12px;">
          <div style="width: 100px; font-size: 13px; color: var(--text-secondary);">${label}</div>
          <div style="display: flex; gap: 4px; flex-wrap: wrap; flex: 1;">
            ${allOptions.map((icon, i) => {
              const isSelected = !isCustomObj && icon === current;
              const isDefaultIcon = i === 0;
              return `
                <div class="icon-option ${isSelected ? 'selected' : ''}"
                     onclick="window._iconsSelect('${key}', '${escapeAttr(icon)}')"
                     style="width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
                            border-radius: 6px; cursor: pointer; font-size: 18px;
                            background: ${isSelected ? 'var(--accent-dim)' : 'var(--surface)'};
                            border: 2px solid ${isSelected ? 'var(--accent)' : 'transparent'};
                            color: var(--text); transition: all 0.15s;"
                     title="${isDefaultIcon ? 'Default' : 'Alternative'}">
                  ${wrapIcon(icon)}
                </div>
              `;
            }).join('')}
            <div onclick="window._iconsEditCustom('${key}')"
                 style="width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
                        border-radius: 6px; cursor: pointer; font-size: 14px;
                        background: ${isCustomObj ? 'var(--accent-dim)' : 'var(--surface)'};
                        border: 2px solid ${isCustomObj ? 'var(--accent)' : 'var(--border)'};
                        color: var(--text-secondary); transition: all 0.15s;"
                 title="Create custom icon">
              +
            </div>
          </div>
          ${!isDefault ? `<span style="font-size: 10px; color: var(--accent);">custom</span>` : ''}
        </div>
      `;
    }

    html += `</div>`;
    return html;
  }

  function renderCreateTab() {
    const preview = renderIconPreview(editorState);

    return `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
        <div>
          <h3 style="margin: 0 0 12px; font-size: 14px; color: var(--text);">Icon Editor</h3>

          <div style="margin-bottom: 12px;">
            <label style="display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">Main Icon</label>
            <input type="text" id="icon-main" value="${escapeAttr(editorState.main)}"
                   onchange="window._iconsUpdateEditor('main', this.value)"
                   style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; color: var(--text); font-size: 20px; text-align: center;">
          </div>

          <div style="margin-bottom: 12px;">
            <label style="display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">Sub Icon / Text (optional)</label>
            <textarea id="icon-sub" onchange="window._iconsUpdateEditor('sub', this.value)"
                      placeholder="Emoji, text, or multi-line code"
                      style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; color: var(--text); font-size: 12px; font-family: ${editorState.mono ? 'monospace' : 'inherit'}; resize: vertical; min-height: 60px;">${escapeHtml(editorState.sub)}</textarea>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
            <div>
              <label style="display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">Position</label>
              <select id="icon-pos" onchange="window._iconsUpdateEditor('pos', this.value)"
                      style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; color: var(--text);">
                ${Object.entries(POSITIONS).map(([k, v]) => `<option value="${k}" ${editorState.pos === k ? 'selected' : ''}>${v}</option>`).join('')}
              </select>
            </div>
            <div>
              <label style="display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">Blend Mode</label>
              <select id="icon-blend" onchange="window._iconsUpdateEditor('blend', this.value)"
                      style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; color: var(--text);">
                ${BLEND_MODES.map(m => `<option value="${m}" ${editorState.blend === m ? 'selected' : ''}>${m}</option>`).join('')}
              </select>
            </div>
          </div>

          <div style="margin-bottom: 12px;">
            <label style="display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">Scale: ${Math.round(editorState.scale * 100)}%</label>
            <input type="range" id="icon-scale" min="10" max="100" value="${editorState.scale * 100}"
                   onchange="window._iconsUpdateEditor('scale', this.value / 100)"
                   style="width: 100%;">
          </div>

          <div style="margin-bottom: 12px; display: flex; gap: 16px; flex-wrap: wrap;">
            <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-secondary); cursor: pointer;">
              <input type="checkbox" ${editorState.mono ? 'checked' : ''}
                     onchange="window._iconsUpdateEditor('mono', this.checked)">
              Monospace
            </label>
            <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-secondary); cursor: pointer;">
              <input type="checkbox" ${editorState.trimStart ? 'checked' : ''}
                     onchange="window._iconsUpdateEditor('trimStart', this.checked)">
              Trim leading space
            </label>
            <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--accent); cursor: pointer;">
              <input type="checkbox" ${editorState.showBounds ? 'checked' : ''}
                     onchange="window._iconsUpdateEditor('showBounds', this.checked)">
              Show bounds
            </label>
          </div>

          <div style="margin-bottom: 12px; padding: 12px; background: var(--bg); border-radius: 6px;">
            <h4 style="margin: 0 0 8px; font-size: 12px; color: var(--text-secondary);">Sub-icon Colors & Shadow</h4>
            <div style="display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 8px;">
              <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-secondary); cursor: pointer;">
                <input type="checkbox" ${editorState.shadow ? 'checked' : ''}
                       onchange="window._iconsUpdateEditor('shadow', this.checked)">
                Drop shadow
              </label>
              <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-secondary); cursor: pointer;">
                <input type="checkbox" ${editorState.useThemeColors ? 'checked' : ''}
                       onchange="window._iconsUpdateEditor('useThemeColors', this.checked)">
                Use theme colors
              </label>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              <div>
                <label style="display: block; font-size: 11px; color: var(--text-secondary); margin-bottom: 2px;">Sub color (optional)</label>
                <div style="display: flex; gap: 4px;">
                  <input type="color" value="${editorState.subColor || '#ffffff'}"
                         onchange="window._iconsUpdateEditor('subColor', this.value)"
                         style="width: 32px; height: 28px; padding: 0; border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">
                  <input type="text" value="${escapeAttr(editorState.subColor)}" placeholder="e.g., #fff or var(--text)"
                         onchange="window._iconsUpdateEditor('subColor', this.value)"
                         style="flex: 1; padding: 4px 6px; background: var(--surface); border: 1px solid var(--border); border-radius: 4px; color: var(--text); font-size: 11px;">
                </div>
              </div>
              <div>
                <label style="display: block; font-size: 11px; color: var(--text-secondary); margin-bottom: 2px;">Custom shadow</label>
                <input type="text" value="${escapeAttr(editorState.shadowCustom)}"
                       onchange="window._iconsUpdateEditor('shadowCustom', this.value)"
                       placeholder="1px 1px 2px rgba(0,0,0,0.5)"
                       style="width: 100%; padding: 6px; background: var(--surface); border: 1px solid var(--border); border-radius: 4px; color: var(--text); font-size: 11px;"
                       ${!editorState.shadow ? 'disabled' : ''}>
              </div>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 12px;">
            <div>
              <label style="display: block; font-size: 11px; color: var(--text-secondary); margin-bottom: 2px;">Size: ${editorState.fontSize}%</label>
              <input type="range" min="20" max="200" value="${editorState.fontSize}"
                     onchange="window._iconsUpdateEditor('fontSize', parseInt(this.value))"
                     style="width: 100%;">
            </div>
            <div>
              <label style="display: block; font-size: 11px; color: var(--text-secondary); margin-bottom: 2px;">Rows: ${editorState.rows}</label>
              <input type="range" min="1" max="10" value="${editorState.rows}"
                     onchange="window._iconsUpdateEditor('rows', parseInt(this.value))"
                     style="width: 100%;">
            </div>
            <div>
              <label style="display: block; font-size: 11px; color: var(--text-secondary); margin-bottom: 2px;">Cols: ${editorState.cols}</label>
              <input type="range" min="4" max="24" value="${editorState.cols}"
                     onchange="window._iconsUpdateEditor('cols', parseInt(this.value))"
                     style="width: 100%;">
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
            <div>
              <label style="display: block; font-size: 11px; color: var(--text-secondary); margin-bottom: 2px;">Skew X: ${editorState.skewX}°</label>
              <input type="range" min="-45" max="45" value="${editorState.skewX}"
                     onchange="window._iconsUpdateEditor('skewX', parseInt(this.value))"
                     style="width: 100%;">
            </div>
            <div>
              <label style="display: block; font-size: 11px; color: var(--text-secondary); margin-bottom: 2px;">Skew Y: ${editorState.skewY}°</label>
              <input type="range" min="-45" max="45" value="${editorState.skewY}"
                     onchange="window._iconsUpdateEditor('skewY', parseInt(this.value))"
                     style="width: 100%;">
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px;">
            <div>
              <label style="display: block; font-size: 11px; color: var(--text-secondary); margin-bottom: 2px;">Offset X: ${editorState.offsetX}px</label>
              <input type="range" min="-20" max="20" value="${editorState.offsetX}"
                     onchange="window._iconsUpdateEditor('offsetX', parseInt(this.value))"
                     style="width: 100%;">
            </div>
            <div>
              <label style="display: block; font-size: 11px; color: var(--text-secondary); margin-bottom: 2px;">Offset Y: ${editorState.offsetY}px</label>
              <input type="range" min="-20" max="20" value="${editorState.offsetY}"
                     onchange="window._iconsUpdateEditor('offsetY', parseInt(this.value))"
                     style="width: 100%;">
            </div>
          </div>
        </div>

        <div>
          <h3 style="margin: 0 0 12px; font-size: 14px; color: var(--text);">Preview</h3>
          <div id="icon-preview" style="display: flex; flex-direction: column; align-items: center; gap: 16px;">
            <div style="width: 80px; height: 80px; background: var(--bg); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 48px;">
              ${preview}
            </div>
            <div style="width: 48px; height: 48px; background: var(--bg); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 28px;">
              ${preview}
            </div>
            <div style="width: 32px; height: 32px; background: var(--bg); border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 18px;">
              ${preview}
            </div>
          </div>

          <div style="margin-top: 20px;">
            <h4 style="margin: 0 0 8px; font-size: 12px; color: var(--text-secondary);">Apply to:</h4>
            <select id="icon-apply-target" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; color: var(--text); margin-bottom: 8px;">
              <option value="">Select a system icon...</option>
              ${Object.entries(CATEGORIES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
            </select>
            <button onclick="window._iconsApplyCustom()"
                    style="width: 100%; padding: 10px; background: var(--accent); border: none; border-radius: 6px; color: white; cursor: pointer; font-size: 13px; font-weight: 500;">
              Apply Icon
            </button>
          </div>

          <div style="margin-top: 16px; padding: 12px; background: var(--bg); border-radius: 6px;">
            <h4 style="margin: 0 0 8px; font-size: 12px; color: var(--text-secondary);">Icon Data (JSON)</h4>
            <pre style="margin: 0; font-size: 10px; color: var(--text-tertiary); overflow-x: auto; white-space: pre-wrap;">${escapeHtml(JSON.stringify(buildIconOutput(), null, 2))}</pre>
          </div>
        </div>
      </div>
    `;
  }

  function renderIconPreview(iconData) {
    if (typeof iconData === 'string') {
      return wrapIcon(iconData);
    }
    // Build the complete icon data for preview
    const previewData = buildIconOutput();
    if (typeof renderIcon === 'function') {
      return renderIcon(previewData);
    }
    // Fallback simple render
    return wrapIcon(iconData.main || '📄');
  }

  // Build clean icon output object (excludes internal properties)
  function buildIconOutput() {
    if (!editorState.sub) {
      return editorState.main;
    }

    const output = {
      main: editorState.main,
      sub: editorState.sub
    };

    // Only include non-default values
    if (editorState.pos !== 'br') output.pos = editorState.pos;
    if (editorState.blend !== 'normal') output.blend = editorState.blend;
    if (editorState.scale !== 0.5) output.scale = editorState.scale;
    if (editorState.mono) output.mono = true;
    if (editorState.skewX !== 0) output.skewX = editorState.skewX;
    if (editorState.skewY !== 0) output.skewY = editorState.skewY;
    if (editorState.offsetX !== 0) output.offsetX = editorState.offsetX;
    if (editorState.offsetY !== 0) output.offsetY = editorState.offsetY;
    if (editorState.fontSize !== 100) output.fontSize = editorState.fontSize;
    if (editorState.rows !== 4) output.rows = editorState.rows;
    if (editorState.cols !== 12) output.cols = editorState.cols;
    if (!editorState.trimStart) output.trimStart = false;
    if (editorState.showBounds) output.showBounds = true;

    // Shadow: use custom value if shadow is enabled
    if (editorState.shadow) {
      output.shadow = editorState.shadowCustom || true;
    }

    // Color options
    if (editorState.subColor) output.subColor = editorState.subColor;
    if (editorState.useThemeColors) output.useThemeColors = true;

    return output;
  }

  function setupHandlers(container, defs, custom) {
    window._iconsTab = (tab) => {
      currentTab = tab;
      createIconsApp(container);
    };

    window._iconsSelect = (key, icon) => {
      if (typeof setCustomIcon === 'function') {
        setCustomIcon(key, icon);
        createIconsApp(container);
      }
    };

    window._iconsResetAll = () => {
      window.customIcons = {};
      localStorage.removeItem('fs-icons');
      if (typeof refreshAllIcons === 'function') refreshAllIcons();
      createIconsApp(container);
      if (typeof algoSpeak === 'function') algoSpeak('Icons reset to defaults');
    };

    window._iconsUpdateEditor = (field, value) => {
      editorState[field] = value;
      createIconsApp(container);
    };

    window._iconsEditCustom = (key) => {
      const custom = window.customIcons || {};
      const current = custom[key];
      if (typeof current === 'object') {
        editorState = { ...editorState, ...current };
      } else {
        editorState.main = current || (window.ICON_DEFS[key]?.default || '📄');
        editorState.sub = '';
      }
      currentTab = 'create';
      // Pre-select the target
      setTimeout(() => {
        const select = document.getElementById('icon-apply-target');
        if (select) select.value = key;
      }, 0);
      createIconsApp(container);
    };

    window._iconsApplyCustom = () => {
      const target = document.getElementById('icon-apply-target')?.value;
      if (!target) {
        if (typeof algoSpeak === 'function') algoSpeak('Select a target icon');
        return;
      }
      // Build icon object (or simple string if no sub)
      const iconValue = editorState.sub ? { ...editorState } : editorState.main;
      if (typeof setCustomIcon === 'function') {
        setCustomIcon(target, iconValue);
        createIconsApp(container);
        if (typeof algoSpeak === 'function') algoSpeak('Icon applied to ' + CATEGORIES[target]);
      }
    };
  }

  function escapeAttr(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
  }

  function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function wrapIcon(icon) {
    if (typeof icon !== 'string') return icon;
    if (icon.length <= 2 && !/\p{Emoji}/u.test(icon)) {
      return '<span style="color:var(--text)">' + icon + '</span>';
    }
    return icon;
  }

  // Create window and initialize app
  const winId = Date.now();
  ALGO.createWindow({
    title: 'Icons',
    icon: '🎭',
    width: 600,
    height: 520,
    content: '<div id="icons-app-' + winId + '" style="width:100%;height:100%;overflow:auto;"></div>'
  });

  // Initialize after window is created
  setTimeout(() => {
    const container = document.getElementById('icons-app-' + winId);
    if (container) createIconsApp(container);
  }, 0);
})();
