// System App: Clean View
// Web page transformer and API wrapper creator
ALGO.app.name = 'Clean View';
ALGO.app.icon = '🧹';

const _cv_instances = {};

const _cv_PRESETS = {
  'Twitter/X - Clean Feed': {
    url: 'https://twitter.com',
    transform: `// Remove ads, promotions, and clutter
$$('[data-testid="placementTracking"]').forEach(el => el.remove());
$$('aside[role="complementary"]').forEach(el => el.remove());
$$('[data-testid="trend"]').forEach(el => el.parentElement?.remove());

// Clean up tweets
$$('article').forEach(article => {
  // Remove reply/retweet/like counts clutter
  const actions = article.querySelector('[role="group"]');
  if (actions) actions.style.opacity = '0.5';
});

// Simplify header
const header = $('header');
if (header) header.style.background = '#000';`,
    api: `// API endpoints for Twitter
API.register('getTweets', () => {
  return $$('article [data-testid="tweetText"]').map(el => ({
    text: el.textContent,
    time: el.closest('article')?.querySelector('time')?.getAttribute('datetime')
  }));
});

API.register('getUsers', () => {
  return [...new Set($$('article [data-testid="User-Name"] a').map(a => a.href))];
});`
  },
  'Hacker News - Minimal': {
    url: 'https://news.ycombinator.com',
    transform: `// Clean minimal HN
document.body.style.fontFamily = 'system-ui, sans-serif';
document.body.style.maxWidth = '800px';
document.body.style.margin = '0 auto';
document.body.style.padding = '20px';
document.body.style.background = '#fafafa';

// Style links
$$('a.titleline').forEach(a => {
  a.style.fontSize = '16px';
  a.style.color = '#333';
  a.style.textDecoration = 'none';
});

// Remove clutter
$$('img').forEach(img => img.remove());
$$('.spacer').forEach(el => el.remove());`,
    api: `// API for HN
API.register('getStories', () => {
  return $$('.titleline > a').map(a => ({
    title: a.textContent,
    url: a.href,
    points: a.closest('tr')?.nextElementSibling?.querySelector('.score')?.textContent
  }));
});`
  },
  'Generic - Remove Ads': {
    url: '',
    transform: `// Generic ad/clutter removal
const adSelectors = [
  '[class*="ad-"]', '[class*="ads-"]', '[id*="ad-"]',
  '[class*="sponsor"]', '[class*="promo"]',
  'iframe[src*="ad"]', '[data-ad]',
  '.advertisement', '#advertisement'
];
adSelectors.forEach(sel => {
  $$(sel).forEach(el => el.remove());
});

// Remove popups/modals
$$('[class*="modal"]').forEach(el => el.remove());
$$('[class*="popup"]').forEach(el => el.remove());
$$('[class*="overlay"]').forEach(el => {
  if (el.style.position === 'fixed') el.remove();
});`,
    api: `// Generic page API
API.register('getLinks', () => {
  return $$('a[href]').map(a => ({ text: a.textContent.trim(), href: a.href }));
});

API.register('getText', () => {
  return document.body.innerText;
});

API.register('getImages', () => {
  return $$('img[src]').map(img => img.src);
});`
  }
};

function _cv_open() {
  if (typeof hideStartMenu === 'function') hideStartMenu();
  const id = Date.now();

  const presetOpts = Object.keys(_cv_PRESETS).map(k => `<option value="${k}">${k}</option>`).join('');

  ALGO.createWindow({
    title: 'Clean View',
    icon: '🧹',
    width: 1200,
    height: 700,
    content: `
      <div class="cv-container" style="display:flex;flex-direction:column;height:100%;background:#1a1a2e;color:#ccc;font-family:system-ui;">
        <div class="cv-toolbar" style="display:flex;gap:8px;padding:8px;background:#12121a;align-items:center;flex-wrap:wrap;">
          <input type="text" id="cv-url-${id}" placeholder="Enter URL..." style="flex:1;min-width:200px;padding:6px 10px;border:1px solid #333;background:#222;color:#fff;border-radius:4px;">
          <button onclick="_cv_load(${id})" style="padding:6px 12px;cursor:pointer;">Load</button>
          <select id="cv-preset-${id}" style="padding:6px;" onchange="_cv_loadPreset(${id}, this.value)">
            <option value="">-- Presets --</option>
            ${presetOpts}
          </select>
          <button onclick="_cv_runTransform(${id})" style="padding:6px 12px;background:#4a4;color:#fff;border:none;cursor:pointer;">▶ Run</button>
          <button onclick="_cv_registerAPI(${id})" style="padding:6px 12px;background:#44a;color:#fff;border:none;cursor:pointer;">📡 Register API</button>
          <button onclick="_cv_savePreset(${id})" style="padding:6px 12px;cursor:pointer;">💾 Save</button>
        </div>
        <div class="cv-panels" style="display:flex;flex:1;min-height:0;overflow:hidden;">
          <div class="cv-panel" style="flex:1;display:flex;flex-direction:column;border-right:1px solid #333;">
            <div style="padding:4px 8px;background:#222;font-size:11px;color:#888;">Original</div>
            <iframe id="cv-original-${id}" style="flex:1;border:none;background:#fff;" sandbox="allow-same-origin allow-scripts allow-forms"></iframe>
          </div>
          <div class="cv-panel" style="flex:1;display:flex;flex-direction:column;border-right:1px solid #333;">
            <div style="padding:4px 8px;background:#222;font-size:11px;color:#888;">Transformed</div>
            <iframe id="cv-transformed-${id}" style="flex:1;border:none;background:#fff;" sandbox="allow-same-origin allow-scripts allow-forms"></iframe>
          </div>
          <div class="cv-panel" style="flex:1;display:flex;flex-direction:column;min-width:300px;">
            <div style="display:flex;background:#222;">
              <button id="cv-tab-transform-${id}" onclick="_cv_showTab(${id},'transform')" style="flex:1;padding:6px;border:none;background:#333;color:#fff;cursor:pointer;">Transform</button>
              <button id="cv-tab-api-${id}" onclick="_cv_showTab(${id},'api')" style="flex:1;padding:6px;border:none;background:#222;color:#888;cursor:pointer;">API</button>
              <button id="cv-tab-log-${id}" onclick="_cv_showTab(${id},'log')" style="flex:1;padding:6px;border:none;background:#222;color:#888;cursor:pointer;">Log</button>
            </div>
            <textarea id="cv-transform-${id}" style="flex:1;border:none;background:#1e1e2e;color:#9cdcfe;padding:10px;font-family:monospace;font-size:12px;resize:none;" spellcheck="false" placeholder="// Transform script (runs in iframe context)
// Use $ for querySelector, $$ for querySelectorAll
// Example: $$('.ad').forEach(el => el.remove());"></textarea>
            <textarea id="cv-api-${id}" style="flex:1;border:none;background:#1e1e2e;color:#9cdcfe;padding:10px;font-family:monospace;font-size:12px;resize:none;display:none;" spellcheck="false" placeholder="// API registration script
// API.register('methodName', () => { return data; });
// Other apps call: CleanView.call('methodName')"></textarea>
            <div id="cv-log-${id}" style="flex:1;background:#0a0a12;color:#6f6;padding:10px;font-family:monospace;font-size:11px;overflow:auto;display:none;white-space:pre-wrap;"></div>
          </div>
        </div>
        <div class="cv-status" style="padding:4px 10px;background:#12121a;font-size:11px;color:#666;display:flex;justify-content:space-between;">
          <span id="cv-status-${id}">Ready</span>
          <span>API: <code style="color:#8f8;">CleanView.call('endpoint', ...args)</code></span>
        </div>
      </div>
    `
  });

  _cv_instances[id] = {
    url: '',
    html: '',
    transform: '',
    api: '',
    endpoints: {}
  };

  // Initialize global CleanView API
  if (!window.CleanView) {
    window.CleanView = {
      instances: _cv_instances,
      call: async (endpoint, ...args) => {
        // Find instance with this endpoint
        for (const id in _cv_instances) {
          const inst = _cv_instances[id];
          if (inst.endpoints[endpoint]) {
            return await inst.endpoints[endpoint](...args);
          }
        }
        throw new Error(`Endpoint '${endpoint}' not found`);
      },
      list: () => {
        const endpoints = [];
        for (const id in _cv_instances) {
          endpoints.push(...Object.keys(_cv_instances[id].endpoints));
        }
        return endpoints;
      }
    };
  }
}

function _cv_showTab(id, tab) {
  const tabs = ['transform', 'api', 'log'];
  tabs.forEach(t => {
    const el = document.getElementById(`cv-${t}-${id}`);
    const btn = document.getElementById(`cv-tab-${t}-${id}`);
    if (el) el.style.display = t === tab ? 'block' : 'none';
    if (btn) {
      btn.style.background = t === tab ? '#333' : '#222';
      btn.style.color = t === tab ? '#fff' : '#888';
    }
  });
}

function _cv_log(id, msg, type = 'info') {
  const log = document.getElementById('cv-log-' + id);
  if (!log) return;
  const colors = { info: '#6f6', error: '#f66', warn: '#ff6' };
  const time = new Date().toLocaleTimeString();
  log.innerHTML += `<span style="color:${colors[type] || '#6f6'}">[${time}] ${msg}</span>\n`;
  log.scrollTop = log.scrollHeight;
}

function _cv_status(id, msg) {
  const el = document.getElementById('cv-status-' + id);
  if (el) el.textContent = msg;
}

async function _cv_load(id) {
  const inst = _cv_instances[id];
  if (!inst) return;

  const url = document.getElementById('cv-url-' + id).value.trim();
  if (!url) return;

  _cv_status(id, 'Loading...');
  _cv_log(id, `Loading: ${url}`);

  try {
    // Fetch via proxy to avoid CORS
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl);

    if (!res.ok) {
      // Try direct fetch as fallback (might fail due to CORS)
      _cv_log(id, 'Proxy failed, trying direct fetch...', 'warn');
      const directRes = await fetch(url);
      inst.html = await directRes.text();
    } else {
      inst.html = await res.text();
    }

    inst.url = url;

    // Load into both iframes
    _cv_setIframeContent(id, 'original', inst.html, url);
    _cv_setIframeContent(id, 'transformed', inst.html, url);

    _cv_status(id, `Loaded: ${url}`);
    _cv_log(id, `Loaded ${inst.html.length} bytes`);
  } catch (e) {
    _cv_status(id, 'Error: ' + e.message);
    _cv_log(id, `Error: ${e.message}`, 'error');
  }
}

function _cv_setIframeContent(id, which, html, baseUrl) {
  const iframe = document.getElementById(`cv-${which}-${id}`);
  if (!iframe) return;

  // Inject base tag for relative URLs and helper functions
  const helpers = `
    <script>
      window.$ = s => document.querySelector(s);
      window.$$ = s => [...document.querySelectorAll(s)];
    </script>
  `;

  const baseTag = baseUrl ? `<base href="${baseUrl}">` : '';
  const modifiedHtml = html.replace('<head>', `<head>${baseTag}${helpers}`);

  iframe.srcdoc = modifiedHtml;
}

function _cv_runTransform(id) {
  const inst = _cv_instances[id];
  if (!inst) return;

  const transform = document.getElementById('cv-transform-' + id).value;
  inst.transform = transform;

  const iframe = document.getElementById('cv-transformed-' + id);
  if (!iframe || !iframe.contentWindow) {
    _cv_log(id, 'No iframe loaded', 'error');
    return;
  }

  try {
    // Run transform in iframe context
    iframe.contentWindow.eval(transform);
    _cv_log(id, 'Transform applied');
    _cv_status(id, 'Transform applied');
  } catch (e) {
    _cv_log(id, `Transform error: ${e.message}`, 'error');
    _cv_status(id, 'Transform error');
  }
}

function _cv_registerAPI(id) {
  const inst = _cv_instances[id];
  if (!inst) return;

  const apiCode = document.getElementById('cv-api-' + id).value;
  inst.api = apiCode;

  const iframe = document.getElementById('cv-transformed-' + id);
  if (!iframe || !iframe.contentWindow) {
    _cv_log(id, 'No iframe loaded', 'error');
    return;
  }

  try {
    // Create API registration context
    const API = {
      register: (name, fn) => {
        inst.endpoints[name] = async (...args) => {
          // Execute in iframe context
          return iframe.contentWindow.eval(`(${fn.toString()})(...${JSON.stringify(args)})`);
        };
        _cv_log(id, `Registered API: ${name}`);
      }
    };

    // Run API registration
    const fn = new Function('API', apiCode);
    fn(API);

    _cv_status(id, `Registered ${Object.keys(inst.endpoints).length} endpoints`);
    _cv_log(id, `API endpoints: ${Object.keys(inst.endpoints).join(', ')}`);
  } catch (e) {
    _cv_log(id, `API error: ${e.message}`, 'error');
    _cv_status(id, 'API error');
  }
}

function _cv_loadPreset(id, name) {
  const preset = _cv_PRESETS[name];
  if (!preset) return;

  document.getElementById('cv-url-' + id).value = preset.url || '';
  document.getElementById('cv-transform-' + id).value = preset.transform || '';
  document.getElementById('cv-api-' + id).value = preset.api || '';

  _cv_log(id, `Loaded preset: ${name}`);

  if (preset.url) {
    _cv_load(id);
  }
}

async function _cv_savePreset(id) {
  const inst = _cv_instances[id];
  if (!inst) return;

  const name = prompt('Preset name:');
  if (!name) return;

  const preset = {
    url: document.getElementById('cv-url-' + id).value,
    transform: document.getElementById('cv-transform-' + id).value,
    api: document.getElementById('cv-api-' + id).value
  };

  // Save to localStorage
  const saved = JSON.parse(localStorage.getItem('cv-presets') || '{}');
  saved[name] = preset;
  localStorage.setItem('cv-presets', JSON.stringify(saved));

  _cv_log(id, `Saved preset: ${name}`);
  algoSpeak(`Saved preset: ${name}`);
}

// Export functions
window._cv_instances = _cv_instances;
window._cv_open = _cv_open;
window._cv_load = _cv_load;
window._cv_runTransform = _cv_runTransform;
window._cv_registerAPI = _cv_registerAPI;
window._cv_loadPreset = _cv_loadPreset;
window._cv_savePreset = _cv_savePreset;
window._cv_showTab = _cv_showTab;
window._cv_PRESETS = _cv_PRESETS;

// Run the app
_cv_open();
