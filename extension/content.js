// FunctionServer Bridge - Content Script
// Injected into all pages to enable communication

// Mark that extension is present
window.__fsBridgeActive = true;

// Listen for messages from the page (in case apps want to communicate)
window.addEventListener('message', (event) => {
  if (event.data?.type === 'FS_BRIDGE_REQUEST') {
    // Forward to background script
    chrome.runtime.sendMessage(event.data, (response) => {
      window.postMessage({
        type: 'FS_BRIDGE_RESPONSE',
        id: event.data.id,
        response
      }, '*');
    });
  }
});

// Notify that bridge is ready
console.log('[FSBridge] Content script loaded');
