// FunctionServer App: fs-joy
// Pad performance with retrospective looping and clip arrangement
// Save to FunctionServer desktop to auto-load

ALGO.app.name = 'fs-joy';
ALGO.app.icon = '🎹';
ALGO.app.category = 'media';

// ============================================================
// STATE
// ============================================================

const _joy_state = {
  mode: 'performance',
  playing: false,
  beat: 0,
  bpm: 120,
  gridRows: 5,
  gridCols: 8,
  scale: 'pentatonic',
  rootNote: 60,
  outputChannel: null,
  retroBuffer: [],
  retroBufferBars: 8,
  floatingNotes: [],
  clips: new Map(),
  playingClips: new Set(),
  activeNotes: new Set()
};

// Scale definitions
const _joy_scales = {
  pentatonic: [0, 2, 4, 7, 9],
  pentatonicMinor: [0, 3, 5, 7, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  blues: [0, 3, 5, 6, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
};

// ============================================================
// MIDI OUTPUT
// ============================================================

function _joy_send(msg) {
  const channel = _joy_state.outputChannel;
  if (!channel) return;

  // Try ALGO.pubsub
  if (ALGO.pubsub?.publish) {
    ALGO.pubsub.publish(channel, msg, {}, 'fs-joy');
    return;
  }

  // Fallback to legacy channels
  if (window._algoChannels?.[channel]?.callback) {
    window._algoChannels[channel].callback(msg, {
      sender: 'fs-joy',
      senderIcon: '🎹'
    });
  }
}

function _joy_noteOn(note, velocity = 100) {
  _joy_send({
    type: 'noteOn',
    note,
    velocity,
    duration: 0.5
  });

  // Record to retrospective buffer
  _joy_state.retroBuffer.push({
    type: 'noteOn',
    note,
    velocity,
    time: _joy_state.beat,
    timestamp: Date.now()
  });

  // Add floating note
  _joy_state.floatingNotes.push({
    note,
    velocity,
    timestamp: Date.now(),
    x: 1,
    captured: false
  });

  // Trim buffer
  const maxAge = _joy_state.retroBufferBars * 4 * (60000 / _joy_state.bpm);
  const cutoff = Date.now() - maxAge;
  _joy_state.retroBuffer = _joy_state.retroBuffer.filter(e => e.timestamp > cutoff);
  _joy_state.floatingNotes = _joy_state.floatingNotes.filter(n => n.timestamp > cutoff);
}

function _joy_noteOff(note) {
  _joy_send({ type: 'noteOff', note });
}

// ============================================================
// GRID
// ============================================================

function _joy_getNote(row, col) {
  const scale = _joy_scales[_joy_state.scale] || _joy_scales.pentatonic;
  const octaveOffset = (_joy_state.gridRows - 1 - row) * 12;
  const scaleDegree = col % scale.length;
  const scaleOctave = Math.floor(col / scale.length) * 12;
  return _joy_state.rootNote + octaveOffset + scale[scaleDegree] + scaleOctave;
}

function _joy_padDown(row, col) {
  const key = row + ',' + col;
  if (_joy_state.activeNotes.has(key)) return;
  _joy_state.activeNotes.add(key);
  const note = _joy_getNote(row, col);
  _joy_noteOn(note);
}

function _joy_padUp(row, col) {
  const key = row + ',' + col;
  if (!_joy_state.activeNotes.has(key)) return;
  _joy_state.activeNotes.delete(key);
  const note = _joy_getNote(row, col);
  _joy_noteOff(note);
}

// ============================================================
// RETROSPECTIVE LOOPER
// ============================================================

function _joy_capture() {
  if (_joy_state.retroBuffer.length === 0) {
    ALGO.notify('Nothing to capture');
    return null;
  }

  const barsToCapture = 4;
  const beatsToCapture = barsToCapture * 4;
  const beatDuration = 60000 / _joy_state.bpm;
  const captureWindow = beatsToCapture * beatDuration;
  const now = Date.now();

  const events = _joy_state.retroBuffer
    .filter(e => e.timestamp > now - captureWindow)
    .map(e => ({
      ...e,
      time: (e.timestamp - (now - captureWindow)) / beatDuration
    }));

  if (events.length === 0) {
    ALGO.notify('No recent notes to capture');
    return null;
  }

  // Mark floating notes as captured
  _joy_state.floatingNotes.forEach(n => {
    if (n.timestamp > now - captureWindow) n.captured = true;
  });

  const clip = {
    id: 'clip-' + Date.now(),
    events,
    length: beatsToCapture,
    capturedAt: now
  };

  // Add to first available slot
  let added = false;
  for (let s = 0; s < 8 && !added; s++) {
    for (let t = 0; t < 8 && !added; t++) {
      const key = t + '-' + s;
      if (!_joy_state.clips.has(key)) {
        _joy_state.clips.set(key, { ...clip, trackIndex: t, sceneIndex: s });
        added = true;
        ALGO.notify('Captured clip to Track ' + (t + 1) + ', Scene ' + (s + 1));
      }
    }
  }

  _joy_render();
  return clip;
}

// ============================================================
// ARRANGEMENT
// ============================================================

function _joy_toggleClip(trackIndex, sceneIndex) {
  const key = trackIndex + '-' + sceneIndex;
  const clip = _joy_state.clips.get(key);
  if (!clip) return;

  if (_joy_state.playingClips.has(key)) {
    _joy_state.playingClips.delete(key);
  } else {
    // Stop other clips on same track
    for (const pk of _joy_state.playingClips) {
      if (pk.startsWith(trackIndex + '-')) {
        _joy_state.playingClips.delete(pk);
      }
    }
    _joy_state.playingClips.add(key);
  }
  _joy_render();
}

function _joy_triggerScene(sceneIndex) {
  for (let t = 0; t < 8; t++) {
    const key = t + '-' + sceneIndex;
    if (_joy_state.clips.has(key)) {
      // Stop other clips on track
      for (const pk of _joy_state.playingClips) {
        if (pk.startsWith(t + '-')) _joy_state.playingClips.delete(pk);
      }
      _joy_state.playingClips.add(key);
    }
  }
  _joy_render();
}

function _joy_stopAll() {
  _joy_state.playingClips.clear();
  _joy_render();
}

// ============================================================
// RENDER
// ============================================================

function _joy_render() {
  const scale = _joy_scales[_joy_state.scale] || _joy_scales.pentatonic;

  // Build output channel dropdown
  const channels = [];
  if (ALGO.pubsub?.appRegistry) {
    Object.entries(ALGO.pubsub.appRegistry).forEach(([name, info]) => {
      if (info.running) channels.push(name);
    });
  }
  if (window._algoChannels) {
    Object.keys(window._algoChannels).forEach(name => {
      if (!channels.includes(name)) channels.push(name);
    });
  }

  const channelOptions = '<option value="">-- Select Output --</option>' +
    channels.map(c => '<option value="' + c + '"' + (_joy_state.outputChannel === c ? ' selected' : '') + '>' + c + '</option>').join('');

  let html = '<div style="display:flex;flex-direction:column;height:100%;background:#1a1a2a;color:#fff;font-family:-apple-system,sans-serif;font-size:12px;">';

  // Toolbar
  html += '<div style="background:linear-gradient(180deg,#3a3a5a,#2a2a4a);padding:8px;display:flex;gap:12px;align-items:center;border-bottom:1px solid #444;">';
  html += '<span style="font-weight:bold;font-size:14px;">🎹 fs-joy</span>';
  html += '<button onclick="_joy_toggle()" style="padding:4px 12px;background:#4a4;border:none;color:#fff;border-radius:4px;cursor:pointer;">' + (_joy_state.playing ? '⏹ Stop' : '▶ Play') + '</button>';
  html += '<button onclick="_joy_toggleMode()" style="padding:4px 12px;background:#44a;border:none;color:#fff;border-radius:4px;cursor:pointer;">' + (_joy_state.mode === 'performance' ? '📋 Arrange' : '🎹 Perform') + '</button>';
  html += '<button onclick="_joy_capture()" style="padding:4px 12px;background:#a44;border:none;color:#fff;border-radius:4px;cursor:pointer;">⏺ Capture (R)</button>';
  html += '<select onchange="_joy_setOutput(this.value)" style="padding:4px;background:#222;color:#fff;border:1px solid #555;">' + channelOptions + '</select>';
  html += '<span style="margin-left:auto;">BPM: <input type="number" value="' + _joy_state.bpm + '" min="40" max="300" style="width:50px;background:#222;color:#fff;border:1px solid #555;padding:2px;" onchange="_joy_setBpm(this.value)"></span>';
  html += '</div>';

  if (_joy_state.mode === 'performance') {
    // Grid
    html += '<div style="flex:1;display:flex;flex-direction:column;padding:20px;gap:20px;">';
    html += '<div style="display:grid;grid-template-columns:repeat(' + _joy_state.gridCols + ',1fr);grid-template-rows:repeat(' + _joy_state.gridRows + ',1fr);gap:4px;max-width:600px;margin:0 auto;aspect-ratio:' + _joy_state.gridCols + '/' + _joy_state.gridRows + ';">';

    for (let row = 0; row < _joy_state.gridRows; row++) {
      for (let col = 0; col < _joy_state.gridCols; col++) {
        const degree = col % scale.length;
        const hue = (degree / scale.length) * 360;
        html += '<div onmousedown="_joy_padDown(' + row + ',' + col + ')" onmouseup="_joy_padUp(' + row + ',' + col + ')" onmouseleave="_joy_padUp(' + row + ',' + col + ')" ontouchstart="_joy_padDown(' + row + ',' + col + ');event.preventDefault()" ontouchend="_joy_padUp(' + row + ',' + col + ')" style="background:hsl(' + hue + ',60%,30%);border-radius:6px;cursor:pointer;min-height:50px;transition:all 0.1s;" onmouseenter="if(event.buttons===1)_joy_padDown(' + row + ',' + col + ')"></div>';
      }
    }

    html += '</div>';

    // Retro canvas placeholder
    html += '<canvas id="joy-retro-canvas" width="600" height="100" style="background:#111;border-radius:8px;max-width:600px;margin:0 auto;display:block;"></canvas>';
    html += '<div style="text-align:center;color:#666;">Retrospective buffer - tap R to capture recent notes</div>';
    html += '</div>';
  } else {
    // Arrangement view
    html += '<div style="flex:1;overflow:auto;padding:20px;">';
    html += '<div style="display:grid;grid-template-columns:60px repeat(8,1fr);gap:2px;max-width:700px;margin:0 auto;">';

    // Header
    html += '<div style="background:#222;padding:8px;"></div>';
    for (let t = 0; t < 8; t++) {
      html += '<div style="background:#333;padding:8px;text-align:center;">Track ' + (t + 1) + '</div>';
    }

    // Scenes
    for (let s = 0; s < 8; s++) {
      html += '<div onclick="_joy_triggerScene(' + s + ')" style="background:#2a2a3a;padding:8px;cursor:pointer;">▶ ' + (s + 1) + '</div>';
      for (let t = 0; t < 8; t++) {
        const key = t + '-' + s;
        const clip = _joy_state.clips.get(key);
        const isPlaying = _joy_state.playingClips.has(key);
        if (clip) {
          html += '<div onclick="_joy_toggleClip(' + t + ',' + s + ')" style="background:' + (isPlaying ? '#4a7' : '#357') + ';padding:8px;cursor:pointer;border-radius:4px;text-align:center;">' + (isPlaying ? '■' : '▶') + '</div>';
        } else {
          html += '<div style="background:#1a1a1a;padding:8px;border:1px dashed #333;border-radius:4px;"></div>';
        }
      }
    }

    html += '</div>';
    html += '<div style="text-align:center;margin-top:20px;"><button onclick="_joy_stopAll()" style="padding:8px 16px;background:#a44;border:none;color:#fff;border-radius:4px;cursor:pointer;">Stop All (Esc)</button></div>';
    html += '</div>';
  }

  // Status bar
  html += '<div style="background:#222;padding:6px 12px;border-top:1px solid #444;display:flex;justify-content:space-between;">';
  html += '<span>Scale: ' + _joy_state.scale + ' | Root: ' + _joy_state.rootNote + ' | Buffer: ' + _joy_state.retroBuffer.length + ' events</span>';
  html += '<span>Space: play/stop | Tab: mode | R: capture | 1-8: scenes | Esc: stop all</span>';
  html += '</div>';

  html += '</div>';

  ALGO.html(html);

  // Draw retro canvas if in performance mode
  if (_joy_state.mode === 'performance') {
    setTimeout(_joy_drawRetro, 10);
  }
}

function _joy_drawRetro() {
  const canvas = document.getElementById('joy-retro-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const now = Date.now();
  const maxAge = _joy_state.retroBufferBars * 4 * (60000 / _joy_state.bpm);

  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw floating notes
  _joy_state.floatingNotes.forEach(note => {
    const age = now - note.timestamp;
    const x = (1 - age / maxAge) * canvas.width;
    const y = ((note.note - 36) / 60) * canvas.height;
    const size = (note.velocity / 127) * 15 + 3;
    const hue = (note.note % 12) * 30;

    ctx.beginPath();
    ctx.arc(x, canvas.height - y, size, 0, Math.PI * 2);
    ctx.fillStyle = note.captured
      ? 'rgba(100, 255, 100, 0.8)'
      : 'hsla(' + hue + ', 70%, 50%, ' + (0.3 + (1 - age / maxAge) * 0.7) + ')';
    ctx.fill();
  });
}

// ============================================================
// CONTROLS
// ============================================================

function _joy_toggle() {
  _joy_state.playing = !_joy_state.playing;
  _joy_render();
}

function _joy_toggleMode() {
  _joy_state.mode = _joy_state.mode === 'performance' ? 'arrangement' : 'performance';
  _joy_render();
}

function _joy_setOutput(channel) {
  _joy_state.outputChannel = channel || null;
}

function _joy_setBpm(bpm) {
  _joy_state.bpm = parseInt(bpm) || 120;
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  switch (e.code) {
    case 'Space':
      e.preventDefault();
      _joy_toggle();
      break;
    case 'Tab':
      e.preventDefault();
      _joy_toggleMode();
      break;
    case 'KeyR':
      _joy_capture();
      break;
    case 'Escape':
      _joy_stopAll();
      break;
    case 'Digit1':
    case 'Digit2':
    case 'Digit3':
    case 'Digit4':
    case 'Digit5':
    case 'Digit6':
    case 'Digit7':
    case 'Digit8':
      _joy_triggerScene(parseInt(e.code.slice(-1)) - 1);
      break;
  }
});

// Export for global access
window._joy_padDown = _joy_padDown;
window._joy_padUp = _joy_padUp;
window._joy_toggle = _joy_toggle;
window._joy_toggleMode = _joy_toggleMode;
window._joy_capture = _joy_capture;
window._joy_toggleClip = _joy_toggleClip;
window._joy_triggerScene = _joy_triggerScene;
window._joy_stopAll = _joy_stopAll;
window._joy_setOutput = _joy_setOutput;
window._joy_setBpm = _joy_setBpm;

// Initialize
_joy_render();
