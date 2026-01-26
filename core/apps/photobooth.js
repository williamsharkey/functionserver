// System App: Photobooth
// Camera snapshot with word art effects
ALGO.app.name = 'Photobooth';
ALGO.app.icon = '📸';
ALGO.app.category = 'graphics';

let _pb_stream = null;

function _pb_open() {
  if (typeof hideStartMenu === 'function') hideStartMenu();
  const id = typeof winId !== 'undefined' ? winId : 0;
  const esc = typeof escapeHtml === 'function' ? escapeHtml : (s => s);

  ALGO.createWindow({
    title: 'Photobooth',
    icon: '📸',
    width: 500,
    height: 450,
    content: `
      <div class="photobooth-container" style="display:flex;flex-direction:column;height:100%;background:#1a1a2e;color:#fff;">
        <div style="flex:1;position:relative;overflow:hidden;background:#000;">
          <video id="pb-video-${id}" autoplay playsinline style="width:100%;height:100%;object-fit:cover;"></video>
          <canvas id="pb-canvas-${id}" style="display:none;"></canvas>
          <div id="pb-wordart-${id}" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none;"></div>
          <img id="pb-preview-${id}" style="display:none;width:100%;height:100%;object-fit:cover;">
        </div>
        <div style="padding:8px;background:#c0c0c0;border-top:2px outset #fff;">
          <div style="display:flex;gap:4px;margin-bottom:6px;align-items:center;">
            <label style="color:#000;font-size:11px;">Word Art:</label>
            <input type="text" id="pb-text-${id}" placeholder="Add text..." style="flex:1;padding:2px 4px;border:2px inset #808080;">
            <select id="pb-style-${id}" style="padding:2px;border:2px inset #808080;">
              <option value="none">None</option>
              <option value="rainbow">Rainbow</option>
              <option value="fire">Fire</option>
              <option value="ice">Ice</option>
              <option value="gold">Gold</option>
              <option value="neon">Neon</option>
              <option value="comic">Comic</option>
            </select>
          </div>
          <div style="display:flex;gap:4px;justify-content:center;">
            <button onclick="_pb_snap(${id})" style="padding:4px 16px;background:#c0c0c0;border:2px outset #fff;">Snap!</button>
            <button onclick="_pb_retake(${id})" style="padding:4px 12px;background:#c0c0c0;border:2px outset #fff;">Retake</button>
            <button onclick="_pb_save(${id})" style="padding:4px 12px;background:#c0c0c0;border:2px outset #fff;">Save</button>
          </div>
        </div>
      </div>
    `,
    onClose: () => {
      if (_pb_stream) {
        _pb_stream.getTracks().forEach(t => t.stop());
        _pb_stream = null;
      }
    }
  });

  setTimeout(() => {
    const video = document.getElementById('pb-video-' + id);
    const textInput = document.getElementById('pb-text-' + id);
    const styleSelect = document.getElementById('pb-style-' + id);

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then(stream => {
        _pb_stream = stream;
        video.srcObject = stream;
      })
      .catch(err => {
        video.parentElement.innerHTML = '<div style="padding:20px;text-align:center;color:#ff6b6b;">Camera access denied<br><small>' + err.message + '</small></div>';
      });

    const updateWordArt = () => {
      const text = textInput.value;
      const style = styleSelect.value;
      const wordart = document.getElementById('pb-wordart-' + id);
      if (!text || style === 'none') {
        wordart.innerHTML = '';
        return;
      }
      wordart.innerHTML = '<div style="' + _pb_getStyle(style) + '">' + esc(text) + '</div>';
    };

    textInput.addEventListener('input', updateWordArt);
    styleSelect.addEventListener('change', updateWordArt);
  }, 100);
}

function _pb_getStyle(style) {
  const base = 'font-size:32px;font-weight:bold;text-align:center;white-space:nowrap;';
  switch (style) {
    case 'rainbow':
      return base + 'background:linear-gradient(90deg,red,orange,yellow,green,blue,violet);-webkit-background-clip:text;-webkit-text-fill-color:transparent;text-shadow:2px 2px 4px rgba(0,0,0,0.5);';
    case 'fire':
      return base + 'color:#ff4500;text-shadow:0 0 10px #ff0,0 0 20px #ff8c00,0 0 30px #ff4500,2px 2px 2px #000;';
    case 'ice':
      return base + 'color:#87ceeb;text-shadow:0 0 10px #fff,0 0 20px #87ceeb,0 0 30px #4169e1,2px 2px 2px #000;';
    case 'gold':
      return base + 'background:linear-gradient(180deg,#ffd700,#ffec8b,#ffd700);-webkit-background-clip:text;-webkit-text-fill-color:transparent;text-shadow:2px 2px 4px rgba(0,0,0,0.7);filter:drop-shadow(0 0 8px gold);';
    case 'neon':
      return base + 'color:#ff00ff;text-shadow:0 0 5px #ff00ff,0 0 10px #ff00ff,0 0 20px #ff00ff,0 0 40px #ff00ff;';
    case 'comic':
      return base + 'color:#ffff00;text-shadow:3px 3px 0 #000,-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000;font-family:Impact,sans-serif;transform:skewX(-5deg);';
    default:
      return base + 'color:#fff;text-shadow:2px 2px 4px #000;';
  }
}

function _pb_snap(id) {
  const video = document.getElementById('pb-video-' + id);
  const canvas = document.getElementById('pb-canvas-' + id);
  const preview = document.getElementById('pb-preview-' + id);
  const wordart = document.getElementById('pb-wordart-' + id);

  if (!video.srcObject) return;

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0);

  const text = document.getElementById('pb-text-' + id).value;
  const style = document.getElementById('pb-style-' + id).value;
  if (text && style !== 'none') {
    ctx.save();
    ctx.font = 'bold 48px Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const x = canvas.width / 2;
    const y = canvas.height / 2;

    switch (style) {
      case 'rainbow':
        const gradient = ctx.createLinearGradient(x - 100, y, x + 100, y);
        gradient.addColorStop(0, 'red');
        gradient.addColorStop(0.17, 'orange');
        gradient.addColorStop(0.33, 'yellow');
        gradient.addColorStop(0.5, 'green');
        gradient.addColorStop(0.67, 'blue');
        gradient.addColorStop(1, 'violet');
        ctx.fillStyle = gradient;
        break;
      case 'fire':
        ctx.fillStyle = '#ff4500';
        ctx.shadowColor = '#ff8c00';
        ctx.shadowBlur = 20;
        break;
      case 'ice':
        ctx.fillStyle = '#87ceeb';
        ctx.shadowColor = '#4169e1';
        ctx.shadowBlur = 20;
        break;
      case 'gold':
        ctx.fillStyle = '#ffd700';
        ctx.shadowColor = 'gold';
        ctx.shadowBlur = 15;
        break;
      case 'neon':
        ctx.fillStyle = '#ff00ff';
        ctx.shadowColor = '#ff00ff';
        ctx.shadowBlur = 30;
        break;
      case 'comic':
        ctx.fillStyle = '#ffff00';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.strokeText(text, x, y);
        break;
    }

    ctx.fillText(text, x, y);
    ctx.restore();
  }

  preview.src = canvas.toDataURL('image/png');
  preview.style.display = 'block';
  video.style.display = 'none';
  wordart.style.display = 'none';
}

function _pb_retake(id) {
  const video = document.getElementById('pb-video-' + id);
  const preview = document.getElementById('pb-preview-' + id);
  const wordart = document.getElementById('pb-wordart-' + id);

  preview.style.display = 'none';
  video.style.display = 'block';
  wordart.style.display = 'block';
}

function _pb_save(id) {
  const preview = document.getElementById('pb-preview-' + id);
  if (!preview.src || preview.style.display === 'none') {
    if (typeof ALGO.notify === 'function') ALGO.notify('Take a photo first!');
    return;
  }

  const filename = 'photo-' + Date.now() + '.png';
  if (typeof savedFiles !== 'undefined') {
    savedFiles.push({ name: filename, content: preview.src, type: 'image' });
    if (typeof saveState === 'function') saveState();
    if (typeof createDesktopIcons === 'function') createDesktopIcons();
  }
  if (typeof ALGO.notify === 'function') ALGO.notify('Saved ' + filename + '!');
}

// Run the app
_pb_open();
