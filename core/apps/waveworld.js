// System App: waveWORLD - WAV Player with Waveform Visualization
ALGO.app.name = 'waveWORLD';
ALGO.app.icon = '🌊';

const _ww_state = {
  instances: {},
  counter: 0
};

function _ww_open(fileContent, fileName) {
  if (typeof hideStartMenu === 'function') hideStartMenu();

  _ww_state.counter++;
  const instId = 'ww-' + _ww_state.counter;

  const inst = {
    instId: instId,
    audioContext: null,
    audioBuffer: null,
    sourceNode: null,
    gainNode: null,
    isPlaying: false,
    startTime: 0,
    pauseTime: 0,
    fileName: fileName || 'Untitled',
    waveformData: null
  };

  _ww_state.instances[instId] = inst;

  ALGO.createWindow({
    title: 'waveWORLD - ' + inst.fileName,
    icon: '🌊',
    width: 600,
    height: 400,
    content: '<div style="display:flex;flex-direction:column;height:100%;background:linear-gradient(180deg,#1a1a2e,#0d0d1a);color:#fff;font-family:sans-serif;">' +
      '<div style="background:linear-gradient(180deg,#2a4a6a,#1a3a5a);padding:8px 12px;border-bottom:2px solid #0af;display:flex;align-items:center;gap:10px;">' +
        '<span style="font-weight:bold;color:#0af;font-size:14px;">🌊 waveWORLD</span>' +
        '<div style="flex:1;"></div>' +
        '<button onclick="_ww_openFile(\'' + instId + '\')" style="padding:4px 10px;background:#2a4a6a;border:1px solid #0af;color:#fff;cursor:pointer;border-radius:3px;">📂 Open</button>' +
      '</div>' +
      '<div style="flex:1;display:flex;flex-direction:column;padding:12px;">' +
        '<div style="background:#0a0a14;border:2px solid #1a3a5a;border-radius:4px;flex:1;position:relative;overflow:hidden;">' +
          '<canvas id="ww-canvas-' + instId + '" style="width:100%;height:100%;"></canvas>' +
          '<div id="ww-playhead-' + instId + '" style="position:absolute;top:0;bottom:0;width:2px;background:#0f0;left:0;display:none;"></div>' +
          '<div id="ww-placeholder-' + instId + '" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#446;font-size:14px;">Drop WAV file or click Open</div>' +
        '</div>' +
        '<div style="margin-top:8px;display:flex;align-items:center;gap:8px;">' +
          '<span id="ww-time-' + instId + '" style="font-family:monospace;color:#0af;min-width:100px;">0:00 / 0:00</span>' +
          '<input type="range" id="ww-seek-' + instId + '" min="0" max="100" value="0" style="flex:1;cursor:pointer;" onchange="_ww_seek(\'' + instId + '\',this.value)">' +
        '</div>' +
        '<div style="margin-top:12px;display:flex;align-items:center;justify-content:center;gap:12px;">' +
          '<button onclick="_ww_stop(\'' + instId + '\')" style="padding:8px 16px;background:#2a2a4a;border:1px solid #446;color:#fff;cursor:pointer;border-radius:4px;font-size:16px;">⏹</button>' +
          '<button onclick="_ww_playPause(\'' + instId + '\')" id="ww-play-' + instId + '" style="padding:12px 24px;background:linear-gradient(180deg,#0a6,#084);border:1px solid #0c8;color:#fff;cursor:pointer;border-radius:4px;font-size:20px;">▶</button>' +
          '<div style="display:flex;align-items:center;gap:6px;margin-left:20px;">' +
            '<span style="color:#668;">🔊</span>' +
            '<input type="range" id="ww-vol-' + instId + '" min="0" max="100" value="80" style="width:80px;" onchange="_ww_setVolume(\'' + instId + '\',this.value)">' +
          '</div>' +
        '</div>' +
        '<div id="ww-info-' + instId + '" style="margin-top:10px;text-align:center;color:#668;font-size:11px;">No file loaded</div>' +
      '</div>' +
    '</div>',
    onClose: () => {
      _ww_stop(instId);
      if (inst.audioContext) inst.audioContext.close();
      delete _ww_state.instances[instId];
    }
  });

  setTimeout(() => {
    _ww_initCanvas(instId);
    if (fileContent) _ww_loadAudio(instId, fileContent, fileName);
  }, 100);
}

function _ww_initCanvas(instId) {
  const canvas = document.getElementById('ww-canvas-' + instId);
  if (!canvas) return;
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
}

function _ww_openFile(instId) {
  const inst = _ww_state.instances[instId];
  if (!inst) return;

  if (typeof savedFiles === 'undefined') {
    ALGO.notify('No files available');
    return;
  }

  const wavFiles = savedFiles.filter(f => f.name.endsWith('.wav') || f.type === 'audio');
  if (wavFiles.length === 0) {
    ALGO.notify('No WAV files found');
    return;
  }

  const choice = prompt('Open WAV file:\n' + wavFiles.map((f, i) => (i + 1) + '. ' + f.name).join('\n') + '\n\nEnter number:');
  if (!choice) return;

  const idx = parseInt(choice) - 1;
  if (idx < 0 || idx >= wavFiles.length) return;

  const file = wavFiles[idx];
  _ww_loadAudio(instId, file.content, file.name);
}

function _ww_loadAudio(instId, content, fileName) {
  const inst = _ww_state.instances[instId];
  if (!inst) return;

  inst.fileName = fileName || 'audio.wav';

  // Update window title
  const titleBar = document.querySelector('[data-inst="' + instId + '"]');

  // Hide placeholder
  const placeholder = document.getElementById('ww-placeholder-' + instId);
  if (placeholder) placeholder.style.display = 'none';

  // Create audio context
  if (!inst.audioContext) {
    inst.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    inst.gainNode = inst.audioContext.createGain();
    inst.gainNode.connect(inst.audioContext.destination);
    inst.gainNode.gain.value = 0.8;
  }

  // Decode base64 data URL or raw base64
  let base64Data = content;
  if (content.startsWith('data:')) {
    base64Data = content.split(',')[1];
  }

  try {
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    inst.audioContext.decodeAudioData(bytes.buffer, (buffer) => {
      inst.audioBuffer = buffer;
      _ww_drawWaveform(instId);
      _ww_updateInfo(instId);
      ALGO.notify('Loaded: ' + inst.fileName);
    }, (err) => {
      ALGO.notify('Error decoding audio: ' + err);
    });
  } catch (e) {
    ALGO.notify('Error loading audio: ' + e.message);
  }
}

function _ww_drawWaveform(instId) {
  const inst = _ww_state.instances[instId];
  if (!inst || !inst.audioBuffer) return;

  const canvas = document.getElementById('ww-canvas-' + instId);
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const buffer = inst.audioBuffer;
  const data = buffer.getChannelData(0);

  // Store for analysis
  inst.waveformData = data;

  // Clear
  ctx.fillStyle = '#0a0a14';
  ctx.fillRect(0, 0, width, height);

  // Draw grid
  ctx.strokeStyle = '#1a2a3a';
  ctx.lineWidth = 1;
  for (let i = 0; i < width; i += 50) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, height);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();

  // Draw waveform
  const step = Math.ceil(data.length / width);
  const amp = height / 2;

  ctx.beginPath();
  ctx.strokeStyle = '#0af';
  ctx.lineWidth = 1;

  for (let i = 0; i < width; i++) {
    let min = 1.0;
    let max = -1.0;
    for (let j = 0; j < step; j++) {
      const datum = data[(i * step) + j];
      if (datum < min) min = datum;
      if (datum > max) max = datum;
    }

    const y1 = (1 + min) * amp;
    const y2 = (1 + max) * amp;

    ctx.moveTo(i, y1);
    ctx.lineTo(i, y2);
  }
  ctx.stroke();

  // Draw filled waveform
  ctx.fillStyle = 'rgba(0, 170, 255, 0.3)';
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  for (let i = 0; i < width; i++) {
    let max = -1.0;
    for (let j = 0; j < step; j++) {
      const datum = data[(i * step) + j];
      if (datum > max) max = datum;
    }
    ctx.lineTo(i, (1 - max) * amp);
  }
  ctx.lineTo(width, height / 2);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  for (let i = 0; i < width; i++) {
    let min = 1.0;
    for (let j = 0; j < step; j++) {
      const datum = data[(i * step) + j];
      if (datum < min) min = datum;
    }
    ctx.lineTo(i, (1 - min) * amp);
  }
  ctx.lineTo(width, height / 2);
  ctx.closePath();
  ctx.fill();
}

function _ww_updateInfo(instId) {
  const inst = _ww_state.instances[instId];
  if (!inst || !inst.audioBuffer) return;

  const buffer = inst.audioBuffer;
  const info = document.getElementById('ww-info-' + instId);
  if (info) {
    info.textContent = inst.fileName + ' | ' +
      buffer.numberOfChannels + ' ch | ' +
      buffer.sampleRate + ' Hz | ' +
      buffer.duration.toFixed(2) + 's';
  }

  _ww_updateTime(instId, 0);
}

function _ww_updateTime(instId, currentTime) {
  const inst = _ww_state.instances[instId];
  if (!inst || !inst.audioBuffer) return;

  const duration = inst.audioBuffer.duration;
  const timeEl = document.getElementById('ww-time-' + instId);
  const seekEl = document.getElementById('ww-seek-' + instId);

  if (timeEl) {
    const formatTime = (t) => {
      const m = Math.floor(t / 60);
      const s = Math.floor(t % 60);
      return m + ':' + (s < 10 ? '0' : '') + s;
    };
    timeEl.textContent = formatTime(currentTime) + ' / ' + formatTime(duration);
  }

  if (seekEl && !inst.isSeeking) {
    seekEl.value = (currentTime / duration) * 100;
  }

  // Update playhead
  const canvas = document.getElementById('ww-canvas-' + instId);
  const playhead = document.getElementById('ww-playhead-' + instId);
  if (canvas && playhead) {
    const x = (currentTime / duration) * canvas.width;
    playhead.style.left = x + 'px';
    playhead.style.display = inst.isPlaying ? 'block' : 'none';
  }
}

function _ww_playPause(instId) {
  const inst = _ww_state.instances[instId];
  if (!inst || !inst.audioBuffer) {
    ALGO.notify('No audio loaded');
    return;
  }

  if (inst.isPlaying) {
    _ww_pause(instId);
  } else {
    _ww_play(instId);
  }
}

function _ww_play(instId) {
  const inst = _ww_state.instances[instId];
  if (!inst || !inst.audioBuffer || inst.isPlaying) return;

  inst.sourceNode = inst.audioContext.createBufferSource();
  inst.sourceNode.buffer = inst.audioBuffer;
  inst.sourceNode.connect(inst.gainNode);

  const offset = inst.pauseTime;
  inst.startTime = inst.audioContext.currentTime - offset;
  inst.sourceNode.start(0, offset);
  inst.isPlaying = true;

  inst.sourceNode.onended = () => {
    if (inst.isPlaying) {
      inst.isPlaying = false;
      inst.pauseTime = 0;
      _ww_updatePlayButton(instId);
    }
  };

  _ww_updatePlayButton(instId);
  _ww_startPlaybackLoop(instId);
}

function _ww_pause(instId) {
  const inst = _ww_state.instances[instId];
  if (!inst || !inst.isPlaying) return;

  inst.pauseTime = inst.audioContext.currentTime - inst.startTime;
  inst.sourceNode.stop();
  inst.isPlaying = false;
  _ww_updatePlayButton(instId);
}

function _ww_stop(instId) {
  const inst = _ww_state.instances[instId];
  if (!inst) return;

  if (inst.sourceNode && inst.isPlaying) {
    inst.sourceNode.stop();
  }
  inst.isPlaying = false;
  inst.pauseTime = 0;
  _ww_updatePlayButton(instId);
  _ww_updateTime(instId, 0);

  const playhead = document.getElementById('ww-playhead-' + instId);
  if (playhead) playhead.style.display = 'none';
}

function _ww_seek(instId, value) {
  const inst = _ww_state.instances[instId];
  if (!inst || !inst.audioBuffer) return;

  const wasPlaying = inst.isPlaying;
  if (wasPlaying) {
    inst.sourceNode.stop();
    inst.isPlaying = false;
  }

  inst.pauseTime = (value / 100) * inst.audioBuffer.duration;
  _ww_updateTime(instId, inst.pauseTime);

  if (wasPlaying) {
    _ww_play(instId);
  }
}

function _ww_setVolume(instId, value) {
  const inst = _ww_state.instances[instId];
  if (!inst || !inst.gainNode) return;
  inst.gainNode.gain.value = value / 100;
}

function _ww_updatePlayButton(instId) {
  const inst = _ww_state.instances[instId];
  const btn = document.getElementById('ww-play-' + instId);
  if (btn) {
    btn.textContent = inst.isPlaying ? '⏸' : '▶';
  }
}

function _ww_startPlaybackLoop(instId) {
  const inst = _ww_state.instances[instId];
  if (!inst) return;

  function loop() {
    if (!inst.isPlaying) return;
    const currentTime = inst.audioContext.currentTime - inst.startTime;
    _ww_updateTime(instId, currentTime);
    requestAnimationFrame(loop);
  }
  loop();
}

// Check if waveform has actual audio content (not silence)
function _ww_hasAudioContent(instId) {
  const inst = _ww_state.instances[instId];
  if (!inst || !inst.waveformData) return false;

  const data = inst.waveformData;
  let maxAmp = 0;
  const sampleStep = Math.max(1, Math.floor(data.length / 1000));

  for (let i = 0; i < data.length; i += sampleStep) {
    const amp = Math.abs(data[i]);
    if (amp > maxAmp) maxAmp = amp;
  }

  // Return true if max amplitude > 0.01 (not silence)
  return maxAmp > 0.01;
}

// Register file handler for .wav files
if (typeof window.fileHandlers !== 'undefined') {
  window.fileHandlers['wav'] = (file) => {
    _ww_open(file.content, file.name);
  };
}

// Expose globals
window._ww_open = _ww_open;
window._ww_openFile = _ww_openFile;
window._ww_loadAudio = _ww_loadAudio;
window._ww_drawWaveform = _ww_drawWaveform;
window._ww_playPause = _ww_playPause;
window._ww_play = _ww_play;
window._ww_pause = _ww_pause;
window._ww_stop = _ww_stop;
window._ww_seek = _ww_seek;
window._ww_setVolume = _ww_setVolume;
window._ww_hasAudioContent = _ww_hasAudioContent;
window._ww_state = _ww_state;

_ww_open();
