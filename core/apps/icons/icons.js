// Icons - FunctionServer Icon Customizer
ALGO.app.name = 'Icons';
ALGO.app.icon = '🎭';
ALGO.app.category = 'graphics';

(function() {
  // Icon categories with friendly names
  const CATEGORIES = {
    programs: 'Programs Menu',
    documentation: 'Documentation',
    help: 'Help',
    about: 'About',
    settings: 'Settings',
    logout: 'Log Out',
    login: 'Login',
    user: 'User',
    shadow: 'Shadow Tabs',
    notepad: 'Notepad',
    ide: 'Code Editor',
    browser: 'Browser',
    toast: 'Notifications',
    copy: 'Copy',
    app: 'Default App'
  };

  function createIconsApp(container) {
    const defs = window.ICON_DEFS || {};
    const custom = window.customIcons || {};

    let html = `
      <div style="padding: 16px; font-family: system-ui, sans-serif; height: 100%; overflow-y: auto; background: var(--surface);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <div>
            <h2 style="margin: 0 0 4px; font-size: 18px; color: var(--text);">Icons</h2>
            <p style="margin: 0; font-size: 12px; color: var(--text-secondary);">Customize system icons</p>
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
      const isDefault = !custom[key];
      const allOptions = [def.default, ...def.alts];

      html += `
        <div class="icon-row" data-key="${key}" style="display: flex; align-items: center; padding: 8px 12px; background: var(--bg); border-radius: 6px; gap: 12px;">
          <div style="width: 100px; font-size: 13px; color: var(--text-secondary);">${label}</div>
          <div style="display: flex; gap: 4px; flex-wrap: wrap; flex: 1;">
            ${allOptions.map((icon, i) => {
              const isSelected = icon === current;
              const isDefaultIcon = i === 0;
              return `
                <div class="icon-option ${isSelected ? 'selected' : ''}"
                     data-icon="${escapeAttr(icon)}"
                     onclick="window._iconsSelect('${key}', '${escapeAttr(icon)}')"
                     style="width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
                            border-radius: 6px; cursor: pointer; font-size: 18px;
                            background: ${isSelected ? 'var(--accent-dim)' : 'var(--surface)'};
                            border: 2px solid ${isSelected ? 'var(--accent)' : 'transparent'};
                            color: var(--text);
                            transition: all 0.15s;"
                     onmouseenter="this.style.background='${isSelected ? 'var(--accent-dim)' : 'var(--surface-raised)'}'"
                     onmouseleave="this.style.background='${isSelected ? 'var(--accent-dim)' : 'var(--surface)'}'"
                     title="${isDefaultIcon ? 'Default' : 'Alternative'}">
                  ${wrapIcon(icon)}
                </div>
              `;
            }).join('')}
          </div>
          ${!isDefault ? `<span style="font-size: 10px; color: var(--accent);">custom</span>` : ''}
        </div>
      `;
    }

    html += `
        </div>
        <p style="margin-top: 16px; font-size: 11px; color: var(--text-tertiary); text-align: center;">
          Click an icon to select it. First option in each row is the default.
        </p>
      </div>
    `;

    container.innerHTML = html;

    // Global handlers
    window._iconsSelect = (key, icon) => {
      if (typeof setCustomIcon === 'function') {
        setCustomIcon(key, icon);
        createIconsApp(container); // Refresh UI
      }
    };

    window._iconsResetAll = () => {
      window.customIcons = {};
      localStorage.removeItem('fs-icons');
      if (typeof refreshAllIcons === 'function') refreshAllIcons();
      createIconsApp(container);
      if (typeof algoSpeak === 'function') algoSpeak('Icons reset to defaults');
    };
  }

  function escapeAttr(str) {
    return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
  }

  function wrapIcon(icon) {
    // Check if it's a plain unicode character (not emoji) that needs color
    if (icon.length <= 2 && !/\p{Emoji}/u.test(icon)) {
      return '<span style="color:var(--text)">' + icon + '</span>';
    }
    return icon;
  }

  // Register with FunctionServer
  if (typeof registerApp === 'function') {
    registerApp({
      id: 'icons',
      name: 'Icons',
      icon: '🎭',
      init: createIconsApp,
      defaultWidth: 520,
      defaultHeight: 480
    });
  }
})();
