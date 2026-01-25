// Popup script for FunctionServer Bridge

const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const serverUrlInput = document.getElementById('server-url');
const serverPreset = document.getElementById('server-preset');
const saveBtn = document.getElementById('save-btn');
const reconnectBtn = document.getElementById('reconnect-btn');

function updateStatus() {
  chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
    if (response) {
      statusDot.className = 'dot' + (response.connected ? ' connected' : '');
      const serverDisplay = response.serverUrl?.replace('wss://', '').replace('ws://', '') || 'not set';
      statusText.textContent = response.connected
        ? `Connected to ${serverDisplay}`
        : `Disconnected (${serverDisplay})`;
      serverUrlInput.value = response.serverUrl || 'ws://localhost:8080';
    }
  });
}

// Handle preset dropdown
serverPreset.addEventListener('change', () => {
  const value = serverPreset.value;
  if (value) {
    serverUrlInput.value = value;
    serverPreset.value = '';
  }
});

saveBtn.addEventListener('click', () => {
  let url = serverUrlInput.value.trim();

  // Auto-add protocol if missing
  if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
    if (url.includes('localhost') || url.match(/^[\d.:]+$/)) {
      url = 'ws://' + url;
    } else {
      url = 'wss://' + url;
    }
    serverUrlInput.value = url;
  }

  chrome.runtime.sendMessage({ action: 'setServer', serverUrl: url }, () => {
    statusText.textContent = 'Reconnecting...';
    setTimeout(updateStatus, 1000);
  });
});

reconnectBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'reconnect' }, () => {
    statusText.textContent = 'Reconnecting...';
    setTimeout(updateStatus, 1000);
  });
});

// Initial status check
updateStatus();

// Refresh status periodically
setInterval(updateStatus, 2000);
