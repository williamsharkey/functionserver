// System App: recur-web - Browser Automation IDE
// A recursive browser inside a browser with Puppeteer-like scripting
// https://github.com/williamsharkey/recur-web
ALGO.app.name = 'recur-web';
ALGO.app.icon = '🔄';

const _rw_state = {
  instances: {},
  counter: 0
};

function _rw_open() {
  if (typeof hideStartMenu === 'function') hideStartMenu();

  _rw_state.counter++;
  const instId = 'rw-' + _rw_state.counter;

  const inst = {
    instId: instId,
    isRecording: false,
    recordedActions: [],
    pageDocument: null,
    pageWindow: null,
    currentUrl: ''
  };
  _rw_state.instances[instId] = inst;

  ALGO.createWindow({
    title: 'recur-web',
    icon: '🔄',
    width: 1200,
    height: 800,
    content: _rw_buildUI(instId)
  });

  setTimeout(() => _rw_init(instId), 50);
}

function _rw_buildUI(id) {
  return `
<div id="rw-container-${id}" style="display:flex;flex-direction:column;height:100%;background:#1a1a2e;color:#eee;font-family:'Monaco','Menlo','Consolas',monospace;font-size:12px;">
  <!-- Toolbar -->
  <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:linear-gradient(180deg,#2a2a4a,#1f1f3a);border-bottom:1px solid #3a3a5a;">
    <input type="text" id="rw-url-${id}" placeholder="Enter URL or paste HTML..." value="about:blank"
      style="flex:1;padding:8px 12px;background:#0d0d1a;border:1px solid #3a3a5a;border-radius:4px;color:#fff;font-family:inherit;font-size:12px;outline:none;">
    <button onclick="_rw_navigate('${id}')" style="padding:8px 16px;background:#4f46e5;border:none;border-radius:4px;color:#fff;font-weight:600;cursor:pointer;">Go</button>
    <button id="rw-record-btn-${id}" onclick="_rw_toggleRecord('${id}')" style="padding:8px 16px;background:#dc2626;border:none;border-radius:4px;color:#fff;font-weight:600;cursor:pointer;">◉ Record</button>
    <button onclick="_rw_runScript('${id}')" style="padding:8px 16px;background:#16a34a;border:none;border-radius:4px;color:#fff;font-weight:600;cursor:pointer;">▶ Run</button>
    <button onclick="_rw_clearConsole('${id}')" style="padding:8px 16px;background:#6b7280;border:none;border-radius:4px;color:#fff;font-weight:600;cursor:pointer;">Clear</button>
  </div>

  <!-- Main Area -->
  <div style="display:flex;flex:1;overflow:hidden;">
    <!-- Left: Browser + Inspector -->
    <div style="display:flex;flex-direction:column;width:50%;border-right:1px solid #3a3a5a;">
      <div style="padding:6px 12px;background:#252540;border-bottom:1px solid #3a3a5a;font-weight:600;color:#a5b4fc;">🌐 Browser</div>
      <div style="flex:1;background:#fff;position:relative;overflow:hidden;">
        <iframe id="rw-frame-${id}" style="width:100%;height:100%;border:none;" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
        <div id="rw-loading-${id}" style="position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:none;align-items:center;justify-content:center;color:#fff;font-size:14px;">
          <div style="text-align:center"><div style="font-size:24px;margin-bottom:8px">⏳</div>Loading...</div>
        </div>
      </div>
      <div style="padding:6px 12px;background:#252540;border-top:1px solid #3a3a5a;border-bottom:1px solid #3a3a5a;font-weight:600;color:#a5b4fc;">🔍 Inspector</div>
      <div id="rw-inspector-${id}" style="height:150px;overflow:auto;background:#0d0d1a;padding:8px;font-size:11px;color:#94a3b8;"></div>
    </div>

    <!-- Right: Script + Console -->
    <div style="display:flex;flex-direction:column;flex:1;">
      <div style="padding:6px 12px;background:#252540;border-bottom:1px solid #3a3a5a;font-weight:600;color:#a5b4fc;display:flex;justify-content:space-between;align-items:center;">
        <span>📜 Script</span>
        <select id="rw-examples-${id}" onchange="_rw_loadExample('${id}')" style="padding:4px 8px;background:#1a1a2e;border:1px solid #3a3a5a;border-radius:4px;color:#fff;font-size:11px;cursor:pointer;">
          <option value="">Load Example...</option>
          <option value="basic">Basic Navigation</option>
          <option value="scrape">Web Scraping</option>
          <option value="form">Form Automation</option>
          <option value="test">Assertion Testing</option>
          <option value="loop">Multi-Page Loop</option>
        </select>
      </div>
      <textarea id="rw-script-${id}" spellcheck="false" style="flex:1;background:#0d0d1a;border:none;color:#e2e8f0;padding:12px;font-family:inherit;font-size:12px;line-height:1.6;resize:none;outline:none;tab-size:2;">// recur-web Automation Script
// Puppeteer-like API running in the browser!

// Navigate to a page
await page.goto('https://example.com');

// Wait and query
await page.waitFor(500);
const title = await page.title();
console.log('Page title:', title);

// Get element text
const heading = await page.$eval('h1', el => el.textContent);
console.log('Heading:', heading);

// Get all links
const links = await page.$$eval('a', els =>
  els.map(a => ({ text: a.textContent, href: a.href }))
);
console.log('Links found:', links.length);
links.forEach(l => console.log(' -', l.text, l.href));

// Screenshot (base64)
const screenshot = await page.screenshot();
console.log('Screenshot taken:', screenshot.slice(0, 50) + '...');

console.log('✓ Script complete!');</textarea>
      <div style="padding:6px 12px;background:#252540;border-top:1px solid #3a3a5a;border-bottom:1px solid #3a3a5a;font-weight:600;color:#a5b4fc;">💻 Console</div>
      <div id="rw-console-${id}" style="height:200px;overflow:auto;background:#0d0d1a;padding:8px 12px;font-size:11px;"></div>
    </div>
  </div>
</div>`;
}

function _rw_init(id) {
  const urlInput = document.getElementById('rw-url-' + id);
  const scriptEditor = document.getElementById('rw-script-' + id);

  // URL enter key
  urlInput.onkeydown = (e) => {
    if (e.key === 'Enter') _rw_navigate(id);
  };

  // Script tab support
  scriptEditor.onkeydown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = scriptEditor.selectionStart;
      const end = scriptEditor.selectionEnd;
      scriptEditor.value = scriptEditor.value.substring(0, start) + '  ' + scriptEditor.value.substring(end);
      scriptEditor.selectionStart = scriptEditor.selectionEnd = start + 2;
    }
  };

  // Listen for messages from iframe
  window.addEventListener('message', (e) => _rw_handleMessage(id, e.data));

  _rw_log(id, 'recur-web initialized', 'system');
  _rw_log(id, 'Enter a URL and click Go, or press Cmd/Ctrl+Enter to run script', 'system');
  _rw_navigateTo(id, 'about:blank');
}

// CORS proxies
const _rw_PROXIES = [
  'https://api.allorigins.win/raw?url=',
  'https://corsproxy.io/?'
];
let _rw_proxyIdx = 0;

async function _rw_fetchWithProxy(url) {
  // Try direct first
  try {
    const resp = await fetch(url, { mode: 'cors' });
    if (resp.ok) return await resp.text();
  } catch (e) {}

  // Try proxies
  for (let i = 0; i < _rw_PROXIES.length; i++) {
    const idx = (_rw_proxyIdx + i) % _rw_PROXIES.length;
    try {
      const proxyUrl = _rw_PROXIES[idx] + encodeURIComponent(url);
      const resp = await fetch(proxyUrl);
      if (resp.ok) {
        _rw_proxyIdx = idx;
        return await resp.text();
      }
    } catch (e) {}
  }
  throw new Error('Failed to fetch URL');
}

function _rw_rewriteUrls(html, baseUrl) {
  const base = new URL(baseUrl);
  if (!html.includes('<base')) {
    html = html.replace(/<head[^>]*>/i, `$&<base href="${base.origin}${base.pathname}">`);
  }
  return html;
}

function _rw_injectBridge(html) {
  const script = `<script>
window.__recurWeb = { ready: true };
document.addEventListener('click', (e) => {
  const path = [];
  let el = e.target;
  while (el && el !== document.body) {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    else if (el.className) s += '.' + String(el.className).split(' ')[0];
    path.unshift(s);
    el = el.parentElement;
  }
  window.parent.postMessage({ type: 'recur-click', selector: path.join(' > '), text: e.target.textContent?.slice(0, 50) }, '*');
}, true);
document.addEventListener('input', (e) => {
  const el = e.target;
  let s = el.tagName.toLowerCase();
  if (el.id) s = '#' + el.id;
  else if (el.name) s = '[name="' + el.name + '"]';
  window.parent.postMessage({ type: 'recur-input', selector: s, value: el.value }, '*');
}, true);
<\/script>`;
  if (html.includes('</head>')) return html.replace('</head>', script + '</head>');
  return script + html;
}

function _rw_navigate(id) {
  const url = document.getElementById('rw-url-' + id).value;
  _rw_navigateTo(id, url);
}

async function _rw_navigateTo(id, url) {
  const inst = _rw_state.instances[id];
  const frame = document.getElementById('rw-frame-' + id);
  const loading = document.getElementById('rw-loading-' + id);

  loading.style.display = 'flex';
  inst.currentUrl = url;
  document.getElementById('rw-url-' + id).value = url;

  try {
    if (!url || url === 'about:blank') {
      frame.srcdoc = '<html><head></head><body style="background:#fff;font-family:system-ui;padding:20px;color:#333"><h1>about:blank</h1><p>Enter a URL above to begin.</p></body></html>';
      _rw_log(id, 'Loaded about:blank', 'system');
    } else if (url.startsWith('data:') || url.startsWith('<')) {
      const html = url.startsWith('data:') ? atob(url.split(',')[1] || '') : url;
      frame.srcdoc = _rw_injectBridge(html);
      _rw_log(id, 'Loaded HTML document', 'system');
    } else {
      _rw_log(id, 'Fetching: ' + url, 'system');
      const html = await _rw_fetchWithProxy(url);
      const rewritten = _rw_rewriteUrls(html, url);
      frame.srcdoc = _rw_injectBridge(rewritten);
      _rw_log(id, 'Loaded: ' + url, 'system');
    }

    await new Promise(r => { frame.onload = r; setTimeout(r, 3000); });
    inst.pageDocument = frame.contentDocument;
    inst.pageWindow = frame.contentWindow;
    _rw_updateInspector(id);

  } catch (err) {
    _rw_log(id, 'Error: ' + err.message, 'error');
  }

  loading.style.display = 'none';
}

function _rw_handleMessage(id, data) {
  const inst = _rw_state.instances[id];
  if (!inst || !inst.isRecording) return;

  if (data?.type === 'recur-click') {
    const action = `await page.click('${data.selector}');`;
    inst.recordedActions.push(action);
    _rw_log(id, 'Click: ' + data.selector, 'record');
  } else if (data?.type === 'recur-input') {
    const action = `await page.type('${data.selector}', '${data.value}');`;
    inst.recordedActions.push(action);
    _rw_log(id, 'Input: ' + data.selector + ' = "' + data.value + '"', 'record');
  }
}

function _rw_toggleRecord(id) {
  const inst = _rw_state.instances[id];
  const btn = document.getElementById('rw-record-btn-' + id);

  inst.isRecording = !inst.isRecording;
  btn.textContent = inst.isRecording ? '⏹ Stop' : '◉ Record';
  btn.style.background = inst.isRecording ? '#ea580c' : '#dc2626';

  if (inst.isRecording) {
    inst.recordedActions = [`await page.goto('${inst.currentUrl}');`];
    _rw_log(id, 'Recording started - interact with the page', 'record');
  } else {
    _rw_log(id, 'Recording stopped', 'record');
    if (inst.recordedActions.length > 1) {
      document.getElementById('rw-script-' + id).value =
        '// Recorded Actions\n' + inst.recordedActions.join('\n') + "\n\nconsole.log('✓ Playback complete!');";
      _rw_log(id, 'Generated ' + inst.recordedActions.length + ' actions', 'system');
    }
  }
}

function _rw_updateInspector(id) {
  const inst = _rw_state.instances[id];
  const inspector = document.getElementById('rw-inspector-' + id);

  if (!inst.pageDocument) {
    inspector.innerHTML = '<span style="color:#64748b">No page loaded</span>';
    return;
  }

  function nodeToHtml(node, depth) {
    if (depth > 4) return '';
    const indent = '  '.repeat(depth);

    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent.trim();
      if (t) return `<span style="color:#94a3b8">${indent}${_rw_esc(t.slice(0, 50))}${t.length > 50 ? '...' : ''}</span>\n`;
      return '';
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const tag = node.tagName.toLowerCase();
    if (['script', 'style', 'noscript', 'svg', 'path'].includes(tag))
      return `<span style="color:#64748b">${indent}&lt;${tag}&gt;...&lt;/${tag}&gt;</span>\n`;

    let attrs = '';
    if (node.id) attrs += ` <span style="color:#f472b6">id</span>=<span style="color:#a5b4fc">"${node.id}"</span>`;
    if (node.className) attrs += ` <span style="color:#f472b6">class</span>=<span style="color:#a5b4fc">"${node.className}"</span>`;

    let h = `<span style="color:#60a5fa">${indent}&lt;${tag}${attrs}&gt;</span>\n`;
    for (const c of node.childNodes) h += nodeToHtml(c, depth + 1);
    h += `<span style="color:#60a5fa">${indent}&lt;/${tag}&gt;</span>\n`;
    return h;
  }

  try {
    inspector.innerHTML = `<pre style="margin:0;font-family:inherit">${nodeToHtml(inst.pageDocument.body, 0)}</pre>`;
  } catch (e) {
    inspector.innerHTML = `<span style="color:#f87171">Cannot inspect: ${e.message}</span>`;
  }
}

function _rw_log(id, msg, type) {
  const cons = document.getElementById('rw-console-' + id);
  if (!cons) return;

  const line = document.createElement('div');
  line.style.cssText = 'padding:2px 0;border-bottom:1px solid #1a1a2e;word-break:break-all;';

  const colors = { log: '#e2e8f0', info: '#60a5fa', warn: '#fbbf24', error: '#f87171', system: '#a78bfa', record: '#f472b6' };
  line.style.color = colors[type] || colors.log;

  const time = new Date().toLocaleTimeString('en-US', { hour12: false });
  const prefix = type === 'system' ? '⚙' : type === 'record' ? '◉' : '›';

  if (typeof msg === 'object') {
    try { msg = JSON.stringify(msg, null, 2); } catch (e) { msg = String(msg); }
  }

  line.textContent = `[${time}] ${prefix} ${msg}`;
  cons.appendChild(line);
  cons.scrollTop = cons.scrollHeight;
}

function _rw_clearConsole(id) {
  const cons = document.getElementById('rw-console-' + id);
  if (cons) cons.innerHTML = '';
  _rw_log(id, 'Console cleared', 'system');
}

function _rw_esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Page API (Puppeteer-like)
function _rw_createPageAPI(id) {
  const inst = _rw_state.instances[id];

  return {
    async goto(url) {
      await _rw_navigateTo(id, url);
      return { url };
    },
    async title() {
      return inst.pageDocument?.title || '';
    },
    async content() {
      return inst.pageDocument?.documentElement?.outerHTML || '';
    },
    async url() {
      return inst.currentUrl;
    },
    async waitFor(ms) {
      return new Promise(r => setTimeout(r, ms));
    },
    async waitForSelector(sel, opts = {}) {
      const timeout = opts.timeout || 5000;
      const start = Date.now();
      while (Date.now() - start < timeout) {
        const el = inst.pageDocument?.querySelector(sel);
        if (el) return el;
        await new Promise(r => setTimeout(r, 100));
      }
      throw new Error('Timeout: ' + sel);
    },
    async $(sel) {
      return inst.pageDocument?.querySelector(sel);
    },
    async $$(sel) {
      return Array.from(inst.pageDocument?.querySelectorAll(sel) || []);
    },
    async $eval(sel, fn) {
      const el = inst.pageDocument?.querySelector(sel);
      if (!el) throw new Error('Not found: ' + sel);
      return fn(el);
    },
    async $$eval(sel, fn) {
      const els = Array.from(inst.pageDocument?.querySelectorAll(sel) || []);
      return fn(els);
    },
    async click(sel) {
      const el = inst.pageDocument?.querySelector(sel);
      if (!el) throw new Error('Not found: ' + sel);
      el.click();
      return true;
    },
    async type(sel, text, opts = {}) {
      const el = inst.pageDocument?.querySelector(sel);
      if (!el) throw new Error('Not found: ' + sel);
      el.focus();
      if (opts.clear !== false) el.value = '';
      for (const c of text) {
        el.value += c;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        if (opts.delay) await new Promise(r => setTimeout(r, opts.delay));
      }
      return true;
    },
    async select(sel, val) {
      const el = inst.pageDocument?.querySelector(sel);
      if (!el) throw new Error('Not found: ' + sel);
      el.value = val;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return [val];
    },
    async focus(sel) {
      const el = inst.pageDocument?.querySelector(sel);
      if (!el) throw new Error('Not found: ' + sel);
      el.focus();
      return true;
    },
    async hover(sel) {
      const el = inst.pageDocument?.querySelector(sel);
      if (!el) throw new Error('Not found: ' + sel);
      el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      return true;
    },
    async screenshot() {
      try {
        const frame = document.getElementById('rw-frame-' + id);
        const canvas = document.createElement('canvas');
        const rect = frame.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#000';
        ctx.font = '14px system-ui';
        const text = inst.pageDocument?.body?.innerText || '';
        text.split('\n').slice(0, 30).forEach((line, i) => {
          ctx.fillText(line.slice(0, 100), 10, 20 + i * 18);
        });
        return canvas.toDataURL('image/png');
      } catch (e) {
        throw new Error('Screenshot failed: ' + e.message);
      }
    },
    async evaluate(fn, ...args) {
      try {
        return inst.pageWindow?.eval(`(${fn.toString()})(${args.map(a => JSON.stringify(a)).join(',')})`);
      } catch (e) {
        throw new Error('Evaluate failed: ' + e.message);
      }
    },
    async getAttribute(sel, attr) {
      const el = inst.pageDocument?.querySelector(sel);
      if (!el) throw new Error('Not found: ' + sel);
      return el.getAttribute(attr);
    },
    async getProperty(sel, prop) {
      const el = inst.pageDocument?.querySelector(sel);
      if (!el) throw new Error('Not found: ' + sel);
      return el[prop];
    },
    async expect(val) {
      return {
        toBe: (exp) => { if (val !== exp) throw new Error(`Expected "${exp}" but got "${val}"`); return true; },
        toContain: (exp) => { if (!String(val).includes(exp)) throw new Error(`Expected "${val}" to contain "${exp}"`); return true; },
        toBeTruthy: () => { if (!val) throw new Error(`Expected truthy but got "${val}"`); return true; },
        toBeGreaterThan: (exp) => { if (!(val > exp)) throw new Error(`Expected ${val} > ${exp}`); return true; }
      };
    }
  };
}

async function _rw_runScript(id) {
  _rw_log(id, '═══ Script Started ═══', 'system');

  const code = document.getElementById('rw-script-' + id).value;
  const page = _rw_createPageAPI(id);

  const customConsole = {
    log: (...args) => _rw_log(id, args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '), 'log'),
    info: (...args) => _rw_log(id, args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '), 'info'),
    warn: (...args) => _rw_log(id, args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '), 'warn'),
    error: (...args) => _rw_log(id, args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '), 'error')
  };

  try {
    const asyncFn = new Function('page', 'console', 'expect', `return (async () => { ${code} })();`);
    await asyncFn(page, customConsole, page.expect);
    _rw_log(id, '═══ Script Completed ═══', 'system');
  } catch (err) {
    _rw_log(id, 'Error: ' + err.message, 'error');
    _rw_log(id, 'Stack: ' + (err.stack?.split('\n')[1] || 'N/A'), 'error');
  }

  _rw_updateInspector(id);
}

const _rw_EXAMPLES = {
  basic: `// Basic Navigation Example
await page.goto('https://example.com');
await page.waitFor(500);

const title = await page.title();
console.log('Page Title:', title);

const url = await page.url();
console.log('Current URL:', url);

console.log('✓ Navigation complete!');`,

  scrape: `// Web Scraping Example
await page.goto('https://news.ycombinator.com');
await page.waitFor(1000);

// Get all story titles
const stories = await page.$$eval('.titleline > a', els =>
  els.slice(0, 10).map(a => ({
    title: a.textContent,
    url: a.href
  }))
);

console.log('Top 10 Hacker News Stories:');
stories.forEach((s, i) => {
  console.log(\`\${i + 1}. \${s.title}\`);
});

console.log('✓ Scraping complete!');`,

  form: `// Form Automation Example
await page.goto(\`data:text/html,
<html>
<head><title>Test Form</title></head>
<body style="font-family:system-ui;padding:20px">
  <h1>Login Form</h1>
  <form id="login">
    <input id="email" type="email" placeholder="Email"><br><br>
    <input id="password" type="password" placeholder="Password"><br><br>
    <select id="role">
      <option value="">Select Role</option>
      <option value="admin">Admin</option>
      <option value="user">User</option>
    </select><br><br>
    <button type="submit">Login</button>
  </form>
</body>
</html>\`);

await page.waitFor(300);

await page.type('#email', 'test@example.com');
console.log('Entered email');

await page.type('#password', 'secretpassword');
console.log('Entered password');

await page.select('#role', 'admin');
console.log('Selected role');

const email = await page.getProperty('#email', 'value');
const role = await page.getProperty('#role', 'value');

console.log('Form values:', { email, role });
console.log('✓ Form automation complete!');`,

  test: `// Assertion Testing Example
await page.goto('https://example.com');
await page.waitFor(500);

console.log('Running tests...');

// Test 1: Page title
const title = await page.title();
(await page.expect(title)).toContain('Example');
console.log('✓ Test 1: Title contains "Example"');

// Test 2: H1 exists
const h1 = await page.$('h1');
(await page.expect(h1)).toBeTruthy();
console.log('✓ Test 2: H1 element exists');

// Test 3: H1 text content
const h1Text = await page.$eval('h1', el => el.textContent);
(await page.expect(h1Text)).toContain('Example');
console.log('✓ Test 3: H1 contains "Example"');

// Test 4: Links exist
const linkCount = await page.$$eval('a', els => els.length);
(await page.expect(linkCount)).toBeGreaterThan(0);
console.log('✓ Test 4: Page has links');

console.log('═══════════════════════');
console.log('All tests passed! ✓');`,

  loop: `// Multi-Page Loop Example
const urls = [
  'https://example.com',
  'https://httpbin.org/html',
  'https://jsonplaceholder.typicode.com'
];

const results = [];

for (const url of urls) {
  console.log('Visiting:', url);
  await page.goto(url);
  await page.waitFor(500);

  const title = await page.title();
  const bodyLength = await page.$eval('body', el => el.innerText.length);

  results.push({ url, title, bodyLength });
  console.log('  Title:', title);
  console.log('  Body length:', bodyLength);
}

console.log('');
console.log('Summary:');
results.forEach(r => {
  console.log(\`  \${r.title}: \${r.bodyLength} chars\`);
});

console.log('✓ Multi-page crawl complete!');`
};

function _rw_loadExample(id) {
  const sel = document.getElementById('rw-examples-' + id);
  const example = _rw_EXAMPLES[sel.value];
  if (example) {
    document.getElementById('rw-script-' + id).value = example;
  }
  sel.value = '';
}

// Expose functions globally
window._rw_open = _rw_open;
window._rw_navigate = _rw_navigate;
window._rw_toggleRecord = _rw_toggleRecord;
window._rw_runScript = _rw_runScript;
window._rw_clearConsole = _rw_clearConsole;
window._rw_loadExample = _rw_loadExample;

// Auto-open
_rw_open();
