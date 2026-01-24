// Popup script for FunctionServer Bridge

const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const portInput = document.getElementById('port');
const saveBtn = document.getElementById('save-btn');
const reconnectBtn = document.getElementById('reconnect-btn');
const puppetCount = document.getElementById('puppet-count');

function updateStatus() {
  chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
    if (response) {
      statusDot.className = 'dot' + (response.connected ? ' connected' : '');
      statusText.textContent = response.connected
        ? `Connected to localhost:${response.port}`
        : `Disconnected (port ${response.port})`;
      portInput.value = response.port;
    }
  });
}

saveBtn.addEventListener('click', () => {
  const port = parseInt(portInput.value, 10);
  if (port > 0 && port < 65536) {
    chrome.runtime.sendMessage({ action: 'setPort', port }, () => {
      statusText.textContent = 'Reconnecting...';
      setTimeout(updateStatus, 1000);
    });
  }
});

reconnectBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'reconnect' }, () => {
    statusText.textContent = 'Reconnecting...';
    setTimeout(updateStatus, 1000);
  });
});

// Initial status check
updateStatus();

// Refresh status periodically while popup is open
setInterval(updateStatus, 2000);
