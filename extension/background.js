// FunctionServer Bridge - Background Service Worker
// Manages WebSocket connection to FunctionServer (local or remote)

let ws = null;
let serverUrl = 'ws://localhost:8080';
let connected = false;
let shadowTabs = new Map(); // tabId -> { url, title, shadowId }
let tabGroupId = null; // Chrome tab group for shadow tabs
let pingInterval = null;

// Load saved server URL
chrome.storage.local.get(['serverUrl'], (result) => {
  if (result.serverUrl) serverUrl = result.serverUrl;
  connect();
});

function connect() {
  if (ws && ws.readyState === WebSocket.OPEN) return;

  try {
    ws = new WebSocket(`${serverUrl}/api/content-bridge`);

    ws.onopen = () => {
      connected = true;
      console.log('[FSBridge] Connected to FunctionServer');
      updateBadge();
      // Send list of currently bridged tabs
      sendTabList();
      // Start keepalive ping
      if (pingInterval) clearInterval(pingInterval);
      pingInterval = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ action: 'ping' }));
        }
      }, 30000);
    };

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        await handleMessage(msg);
      } catch (e) {
        console.error('[FSBridge] Message error:', e);
      }
    };

    ws.onclose = () => {
      connected = false;
      console.log('[FSBridge] Disconnected');
      updateBadge();
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }
      // Reconnect after delay
      setTimeout(connect, 3000);
    };

    ws.onerror = (err) => {
      console.error('[FSBridge] WebSocket error');
    };
  } catch (e) {
    console.error('[FSBridge] Connect failed:', e);
    setTimeout(connect, 3000);
  }
}

function updateBadge() {
  chrome.action.setBadgeText({ text: connected ? 'ON' : '' });
  chrome.action.setBadgeBackgroundColor({ color: connected ? '#4a4' : '#888' });
}

async function handleMessage(msg) {
  const { id, action, tabId, data } = msg;

  switch (action) {
    case 'ping':
      send({ id, result: 'pong' });
      break;

    case 'listTabs':
      sendTabList();
      break;

    case 'getContent':
      // Get DOM content from a tab
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => ({
            html: document.documentElement.outerHTML,
            url: location.href,
            title: document.title
          })
        });
        send({ id, result: results[0]?.result });
      } catch (e) {
        send({ id, error: e.message });
      }
      break;

    case 'executeScript':
      // Execute JS in a tab and return result
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId },
          func: new Function('return (' + data.script + ')'),
          args: data.args || []
        });
        send({ id, result: results[0]?.result });
      } catch (e) {
        send({ id, error: e.message });
      }
      break;

    case 'eval':
      // Evaluate expression in tab context
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId },
          func: (expr) => {
            try {
              return { success: true, result: eval(expr) };
            } catch (e) {
              return { success: false, error: e.message };
            }
          },
          args: [data.expression]
        });
        const res = results[0]?.result;
        if (res?.success) {
          send({ id, result: res.result });
        } else {
          send({ id, error: res?.error || 'Unknown error' });
        }
      } catch (e) {
        send({ id, error: e.message });
      }
      break;

    case 'query':
      // Query selector in tab
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId },
          func: (selector, all) => {
            if (all) {
              return [...document.querySelectorAll(selector)].map(el => ({
                tag: el.tagName,
                text: el.textContent?.slice(0, 200),
                html: el.outerHTML?.slice(0, 500)
              }));
            } else {
              const el = document.querySelector(selector);
              return el ? {
                tag: el.tagName,
                text: el.textContent?.slice(0, 200),
                html: el.outerHTML?.slice(0, 500)
              } : null;
            }
          },
          args: [data.selector, data.all || false]
        });
        send({ id, result: results[0]?.result });
      } catch (e) {
        send({ id, error: e.message });
      }
      break;

    case 'click':
      // Click element in tab
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId },
          func: (selector) => {
            const el = document.querySelector(selector);
            if (el) {
              el.click();
              return true;
            }
            return false;
          },
          args: [data.selector]
        });
        send({ id, result: results[0]?.result });
      } catch (e) {
        send({ id, error: e.message });
      }
      break;

    case 'injectCSS':
      // Inject CSS into tab
      try {
        await chrome.scripting.insertCSS({
          target: { tabId },
          css: data.css
        });
        send({ id, result: true });
      } catch (e) {
        send({ id, error: e.message });
      }
      break;

    case 'screenshot':
      // Capture visible tab
      try {
        const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
        send({ id, result: dataUrl });
      } catch (e) {
        send({ id, error: e.message });
      }
      break;

    case 'openShadow':
      // Open a shadow tab (background, in collapsed group)
      try {
        const tab = await openShadowTab(data.url, data.shadowId);
        send({ id, result: { tabId: tab.id, shadowId: data.shadowId } });
      } catch (e) {
        send({ id, error: e.message });
      }
      break;

    case 'closeShadow':
      // Close a shadow tab
      try {
        await closeShadowTab(data.tabId || data.shadowId);
        send({ id, result: true });
      } catch (e) {
        send({ id, error: e.message });
      }
      break;

    case 'listShadows':
      // List all shadow tabs
      send({ id, result: Array.from(shadowTabs.entries()).map(([tabId, info]) => ({
        tabId, ...info
      }))});
      break;

    case 'navigateShadow':
      // Navigate a shadow tab to new URL
      try {
        await chrome.tabs.update(tabId, { url: data.url });
        send({ id, result: true });
      } catch (e) {
        send({ id, error: e.message });
      }
      break;
  }
}

// Create or get the shadow tab group
async function ensureTabGroup() {
  if (tabGroupId !== null) {
    // Verify group still exists
    try {
      const group = await chrome.tabGroups.get(tabGroupId);
      if (group) return tabGroupId;
    } catch (e) {
      tabGroupId = null;
    }
  }
  return null; // Will create when first tab is added
}

// Open a shadow tab in the background
async function openShadowTab(url, shadowId) {
  // Create tab in background (not active)
  const tab = await chrome.tabs.create({
    url,
    active: false,
    pinned: false
  });

  // Store puppet info
  shadowTabs.set(tab.id, {
    url,
    shadowId: shadowId || `puppet_${tab.id}`,
    originalTitle: null
  });

  // Add to tab group
  try {
    if (tabGroupId === null) {
      // Create new group with this tab
      tabGroupId = await chrome.tabs.group({ tabIds: [tab.id] });
      await chrome.tabGroups.update(tabGroupId, {
        title: '🔗 FS Shadows',
        color: 'grey',
        collapsed: true
      });
    } else {
      // Add to existing group
      await chrome.tabs.group({ tabIds: [tab.id], groupId: tabGroupId });
    }
  } catch (e) {
    console.error('[FSBridge] Failed to group tab:', e);
  }

  // Wait for page to load then rename title
  const renameTitle = async () => {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (shadowId) => {
          document.title = `🔗 ${document.title} (Shadow)`;
        },
        args: [shadowId]
      });
    } catch (e) {
      // Tab might not be ready yet
    }
  };

  // Rename after a delay to let page load
  setTimeout(renameTitle, 2000);

  return tab;
}

// Close a shadow tab by tabId or shadowId
async function closeShadowTab(idOrPuppetId) {
  let tabId = idOrPuppetId;

  // If it's a shadowId, find the tabId
  if (typeof idOrPuppetId === 'string') {
    for (const [tid, info] of shadowTabs.entries()) {
      if (info.shadowId === idOrPuppetId) {
        tabId = tid;
        break;
      }
    }
  }

  if (typeof tabId === 'number') {
    shadowTabs.delete(tabId);
    try {
      await chrome.tabs.remove(tabId);
    } catch (e) {
      // Tab might already be closed
    }
  }

  // If no more shadow tabs, clear the group reference
  if (shadowTabs.size === 0) {
    tabGroupId = null;
  }
}

function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

async function sendTabList() {
  try {
    const tabs = await chrome.tabs.query({});
    const tabList = tabs.map(t => ({
      id: t.id,
      url: t.url,
      title: t.title,
      active: t.active,
      favIconUrl: t.favIconUrl
    }));
    send({ action: 'tabList', tabs: tabList });
  } catch (e) {
    console.error('[FSBridge] Error getting tabs:', e);
  }
}

// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && connected) {
    sendTabList();
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (connected) {
    sendTabList();
  }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'getStatus') {
    sendResponse({ connected, serverUrl });
  } else if (msg.action === 'setServer') {
    serverUrl = msg.serverUrl;
    chrome.storage.local.set({ serverUrl });
    if (ws) ws.close();
    connect();
    sendResponse({ ok: true });
  } else if (msg.action === 'reconnect') {
    if (ws) ws.close();
    connect();
    sendResponse({ ok: true });
  }
  return true;
});
