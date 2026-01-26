// System App: Webcam
ALGO.app.name = 'Webcam';
ALGO.app.icon = '📹';
ALGO.app.category = 'media';

let _webcam_stream = null;

function _webcam_open() {
  if (typeof hideStartMenu === 'function') hideStartMenu();

  ALGO.createWindow({
    title: 'Webcam',
    icon: '📹',
    width: 500,
    height: 400,
    content: '<div style="display:flex;flex-direction:column;height:100%;background:#000;">' +
      '<video id="webcam-video" autoplay playsinline style="flex:1;background:#111;object-fit:cover;"></video>' +
      '<div style="padding:8px;background:#222;display:flex;gap:8px;">' +
        '<button onclick="_webcam_start()" style="color:#fff;background:#444;border:1px solid #666;padding:4px 12px;">📷 Start</button>' +
        '<button onclick="_webcam_snapshot()" style="color:#fff;background:#444;border:1px solid #666;padding:4px 12px;">📸 Snapshot</button>' +
        '<button onclick="_webcam_stop()" style="color:#fff;background:#444;border:1px solid #666;padding:4px 12px;">⏹ Stop</button>' +
      '</div>' +
    '</div>',
    onClose: () => {
      _webcam_stop();
    }
  });
}

function _webcam_start() {
  const video = document.getElementById('webcam-video');
  if (!video) return;

  navigator.mediaDevices.getUserMedia({ video: true, audio: false })
    .then(stream => {
      _webcam_stream = stream;
      video.srcObject = stream;
    })
    .catch(e => {
      if (typeof algoSpeak === 'function') algoSpeak('Camera error: ' + e.message);
      else alert('Camera error: ' + e.message);
    });
}

function _webcam_stop() {
  if (_webcam_stream) {
    _webcam_stream.getTracks().forEach(t => t.stop());
    _webcam_stream = null;
  }
  const video = document.getElementById('webcam-video');
  if (video) video.srcObject = null;
}

function _webcam_snapshot() {
  const video = document.getElementById('webcam-video');
  if (!video || !video.srcObject) {
    if (typeof algoSpeak === 'function') algoSpeak('Start camera first');
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);

  const dataUrl = canvas.toDataURL('image/png');
  const name = 'snapshot-' + Date.now() + '.png';

  // Save to desktop if global functions available
  if (typeof savedFiles !== 'undefined' && typeof saveState === 'function') {
    savedFiles.push({ name: name, type: 'image', data: dataUrl });
    saveState();
    if (typeof createDesktopIcons === 'function') createDesktopIcons();
  }

  if (typeof algoSpeak === 'function') algoSpeak('Saved ' + name);
}

// Export for global access
window._webcam_open = _webcam_open;
window._webcam_start = _webcam_start;
window._webcam_stop = _webcam_stop;
window._webcam_snapshot = _webcam_snapshot;

// Auto-open
_webcam_open();
