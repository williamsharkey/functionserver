// Nostalgia - FunctionServer Theme Switcher
// Contains the classic Windows 95-style theme for FunctionServer
ALGO.app.name = 'Nostalgia';
ALGO.app.icon = '🎨';

(function() {
  const CLASSIC_THEME = `
:root {
  /* Classic Windows 95-style colors */
  --bg: #008080;
  --surface: #c0c0c0;
  --surface-raised: #dfdfdf;
  --text: #000000;
  --text-secondary: #404040;
  --text-tertiary: #808080;
  --border: #808080;
  --border-subtle: #a0a0a0;

  /* Accent colors */
  --accent: #000080;
  --accent-dim: #000060;
  --green: #008000;
  --green-dim: #006000;

  /* Window button colors - classic style */
  --btn-close: #c0c0c0;
  --btn-minimize: #c0c0c0;
  --btn-maximize: #c0c0c0;

  /* Window styles */
  --win-bg: #c0c0c0;
  --win-border: #000000;
  --titlebar-active: linear-gradient(90deg, #000080, #1084d0);
  --titlebar-inactive: linear-gradient(90deg, #808080, #b0b0b0);

  /* Desktop */
  --desktop-bg: #008080;

  /* Taskbar */
  --taskbar-bg: #c0c0c0;
  --taskbar-border: #ffffff;

  /* Start menu */
  --menu-bg: #c0c0c0;
  --menu-hover: #000080;
  --menu-sidebar: linear-gradient(#000080, #1084d0);
}

/* Classic button styling */
.window-btn {
  background: var(--surface) !important;
  border: 2px outset #fff !important;
  border-radius: 0 !important;
  width: 16px !important;
  height: 14px !important;
  font-size: 10px !important;
  line-height: 10px !important;
}
.window-btn:active {
  border-style: inset !important;
}
.window-btn::after {
  display: none !important;
}
.btn-close::before { content: '×'; color: #000; font-weight: bold; }
.btn-minimize::before { content: '_'; color: #000; position: relative; top: -3px; }
.btn-maximize::before { content: '□'; color: #000; }

/* Classic window styling */
.window {
  border-radius: 0 !important;
  border: 2px outset #fff !important;
  box-shadow: 2px 2px 0 #000 !important;
}
.window-titlebar {
  border-radius: 0 !important;
}
.window-content {
  border-radius: 0 !important;
}

/* Classic taskbar */
#taskbar {
  border-radius: 0 !important;
  border-top: 2px outset #fff !important;
}
.start-btn {
  border: 2px outset #fff !important;
  border-radius: 0 !important;
}
.taskbar-item {
  border: 2px outset #fff !important;
  border-radius: 0 !important;
}
.taskbar-item.active {
  border-style: inset !important;
}

/* Classic start menu */
.start-menu {
  border-radius: 0 !important;
  border: 2px outset #fff !important;
  box-shadow: 2px 2px 0 #000 !important;
}

/* Classic desktop icons */
.desktop-icon {
  border-radius: 0 !important;
}
.desktop-icon span {
  text-shadow: 1px 1px 0 #008080 !important;
  color: #fff !important;
}

/* Classic scrollbars */
::-webkit-scrollbar {
  width: 16px;
  height: 16px;
}
::-webkit-scrollbar-track {
  background: repeating-conic-gradient(#c0c0c0 0% 25%, #808080 0% 50%) 50% / 2px 2px;
}
::-webkit-scrollbar-thumb {
  background: #c0c0c0;
  border: 2px outset #fff;
}
::-webkit-scrollbar-button {
  background: #c0c0c0;
  border: 2px outset #fff;
}
`;

  function getCurrentTheme() {
    return localStorage.getItem('fs-theme') ? 'classic' : 'veil';
  }

  function setTheme(themeName) {
    if (themeName === 'classic') {
      localStorage.setItem('fs-theme', CLASSIC_THEME);
    } else {
      localStorage.removeItem('fs-theme');
    }
  }

  function applyTheme(themeName) {
    setTheme(themeName);
    // Apply immediately without reload
    let override = document.getElementById('fs-theme-override');
    if (themeName === 'classic') {
      if (!override) {
        override = document.createElement('style');
        override.id = 'fs-theme-override';
        document.head.appendChild(override);
      }
      override.textContent = CLASSIC_THEME;
    } else {
      if (override) {
        override.remove();
      }
    }
  }

  function createNostalgiaApp(container) {
    const currentTheme = getCurrentTheme();

    container.innerHTML = `
      <div style="padding: 20px; font-family: system-ui, sans-serif; color: var(--text);">
        <h2 style="margin: 0 0 8px; font-size: 18px; color: var(--text);">Nostalgia</h2>
        <p style="margin: 0 0 20px; font-size: 13px; color: var(--text-secondary);">
          Switch between FunctionServer themes
        </p>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
          <!-- Veil Theme -->
          <div class="theme-option" data-theme="veil" style="cursor: pointer; border: 2px solid ${currentTheme === 'veil' ? 'var(--accent)' : 'var(--border)'}; border-radius: 8px; overflow: hidden; transition: border-color 0.2s;">
            <div style="background: #09090b; padding: 12px;">
              <!-- Mini window preview -->
              <div style="background: #18181b; border: 1px solid #3f3f46; border-radius: 6px; overflow: hidden;">
                <div style="background: linear-gradient(90deg, #7c3aed, #a78bfa); padding: 4px 8px; display: flex; align-items: center; gap: 6px;">
                  <div style="display: flex; gap: 4px;">
                    <span style="width: 8px; height: 8px; border-radius: 50%; background: #e94560;"></span>
                    <span style="width: 8px; height: 8px; border-radius: 50%; background: #a78bfa;"></span>
                    <span style="width: 8px; height: 8px; border-radius: 50%; background: #86efac;"></span>
                  </div>
                  <span style="font-size: 9px; color: #fff;">Window</span>
                </div>
                <div style="padding: 8px; font-size: 9px; color: #a1a1aa;">Content area</div>
              </div>
              <!-- Mini taskbar -->
              <div style="margin-top: 8px; background: #18181b; border: 1px solid #3f3f46; border-radius: 4px; padding: 4px 8px; font-size: 9px; color: #a1a1aa;">
                ⊞ Start
              </div>
            </div>
            <div style="padding: 12px; background: var(--surface); text-align: center;">
              <strong style="font-size: 14px; color: var(--text);">Veil</strong>
              <p style="font-size: 11px; color: var(--text-secondary); margin: 4px 0 0;">Modern dark theme</p>
              ${currentTheme === 'veil' ? '<span style="display: inline-block; margin-top: 8px; font-size: 11px; color: var(--accent);">✓ Active</span>' : ''}
            </div>
          </div>

          <!-- Classic Theme -->
          <div class="theme-option" data-theme="classic" style="cursor: pointer; border: 2px solid ${currentTheme === 'classic' ? 'var(--accent)' : 'var(--border)'}; border-radius: 8px; overflow: hidden; transition: border-color 0.2s;">
            <div style="background: #008080; padding: 12px;">
              <!-- Mini window preview -->
              <div style="background: #c0c0c0; border: 2px outset #fff; overflow: hidden;">
                <div style="background: linear-gradient(90deg, #000080, #1084d0); padding: 2px 4px; display: flex; align-items: center; gap: 4px;">
                  <span style="font-size: 9px; color: #fff; flex: 1;">Window</span>
                  <div style="display: flex; gap: 2px;">
                    <span style="width: 12px; height: 10px; background: #c0c0c0; border: 1px outset #fff; font-size: 8px; text-align: center; line-height: 8px;">_</span>
                    <span style="width: 12px; height: 10px; background: #c0c0c0; border: 1px outset #fff; font-size: 8px; text-align: center; line-height: 8px;">□</span>
                    <span style="width: 12px; height: 10px; background: #c0c0c0; border: 1px outset #fff; font-size: 8px; text-align: center; line-height: 8px;">×</span>
                  </div>
                </div>
                <div style="padding: 6px; font-size: 9px; color: #000;">Content area</div>
              </div>
              <!-- Mini taskbar -->
              <div style="margin-top: 8px; background: #c0c0c0; border: 2px outset #fff; padding: 2px 4px; font-size: 9px; color: #000;">
                <span style="border: 1px outset #fff; padding: 1px 4px;">⊞ Start</span>
              </div>
            </div>
            <div style="padding: 12px; background: var(--surface); text-align: center;">
              <strong style="font-size: 14px; color: var(--text);">Classic</strong>
              <p style="font-size: 11px; color: var(--text-secondary); margin: 4px 0 0;">Windows 95 style</p>
              ${currentTheme === 'classic' ? '<span style="display: inline-block; margin-top: 8px; font-size: 11px; color: var(--accent);">✓ Active</span>' : ''}
            </div>
          </div>
        </div>

        <p style="margin-top: 20px; font-size: 11px; color: var(--text-tertiary); text-align: center;">
          Click a theme to apply. Changes take effect immediately.
        </p>
      </div>
    `;

    // Add click handlers
    container.querySelectorAll('.theme-option').forEach(option => {
      option.addEventListener('click', () => {
        const theme = option.dataset.theme;
        applyTheme(theme);
        // Re-render to update active states
        createNostalgiaApp(container);
        showToast('Theme changed to ' + (theme === 'veil' ? 'Veil' : 'Classic'));
      });
      option.addEventListener('mouseenter', () => {
        if (getCurrentTheme() !== option.dataset.theme) {
          option.style.borderColor = 'var(--text-tertiary)';
        }
      });
      option.addEventListener('mouseleave', () => {
        option.style.borderColor = getCurrentTheme() === option.dataset.theme ? 'var(--accent)' : 'var(--border)';
      });
    });
  }

  // Register with FunctionServer
  if (typeof registerApp === 'function') {
    registerApp({
      id: 'nostalgia',
      name: 'Nostalgia',
      icon: '🎨',
      init: createNostalgiaApp,
      defaultWidth: 480,
      defaultHeight: 400
    });
  }

  // Also expose globally for external access
  window.Nostalgia = {
    getTheme: getCurrentTheme,
    setTheme: applyTheme,
    themes: ['veil', 'classic']
  };
})();
