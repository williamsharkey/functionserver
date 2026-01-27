// System App: Joy - Pad Performance + Clip Arrangement
ALGO.app.name = 'Joy';
ALGO.app.icon = '🎹';
ALGO.app.category = 'media';

const _joy_state = {
  bpm: 120,
  playing: false,
  beat: 0,
  startTime: 0,
  playTimer: null,
  animTimer: null,

  // Grid: 5 cols x 8 rows
  gridRows: 8,
  gridCols: 5,
  scale: 'minor',
  rootNote: 60, // C4
  activeNotes: new Set(),

  // Retrospective looper
  retroBuffer: [],
  retroMaxBeats: 64,
  floatingNotes: [],

  // Session view
  lanes: [
    { id: 0, name: 'WC', generator: 'windchime-dad', muted: false, volume: 1 },
    { id: 1, name: 'SW', generator: 'simpwave', muted: false, volume: 1 },
    { id: 2, name: 'AW', generator: 'angelwave', muted: false, volume: 1 }
  ],
  scenes: Array(6).fill(null).map((_, i) => ({ id: i, name: '' + (i + 1) })),
  clips: new Map(),
  playingClips: new Set(),
  selectedLane: 0,

  // Available generators
  generators: {
    'windchime-dad': { name: 'Windchime', icon: '🎐', channel: 'windchime-dad' },
    'simpwave': { name: 'Simpwave', icon: '🌊', channel: 'simpwave' },
    'angelwave': { name: 'Angelwave', icon: '👼', channel: 'Angelwave VOX' }
  }
};

const _joy_scales = {
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  pentatonic: [0, 2, 4, 7, 9],
  blues: [0, 3, 5, 6, 7, 10]
};

const _joy_noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// ============================================================
// MIDI OUTPUT
// ============================================================
function _joy_send(channel, msg) {
  if (!channel) return;
  if (window._algoChannels && window._algoChannels[channel]) {
    window._algoChannels[channel].callback(msg, { sender: 'joy', senderIcon: '🎹' });
    return;
  }
  if (window.ALGO && ALGO.pubsub && ALGO.pubsub.publish) {
    ALGO.pubsub.publish(channel, msg, {}, 'joy');
  }
}

function _joy_noteOn(note, velocity, laneIdx) {
  const lane = _joy_state.lanes[laneIdx !== undefined ? laneIdx : _joy_state.selectedLane];
  if (!lane || lane.muted) return;

  const gen = _joy_state.generators[lane.generator];
  if (gen) {
    _joy_send(gen.channel, { type: 'noteOn', note, velocity: velocity || 100, duration: 0.4 });
  }

  const beatPos = _joy_getCurrentBeat();
  _joy_state.retroBuffer.push({
    type: 'noteOn', note, velocity: velocity || 100,
    beat: beatPos, timestamp: Date.now(),
    lane: laneIdx !== undefined ? laneIdx : _joy_state.selectedLane
  });

  _joy_state.floatingNotes.push({
    note, velocity: velocity || 100, beat: beatPos,
    timestamp: Date.now(), x: 1, captured: false
  });

  _joy_trimRetroBuffer();
}

function _joy_noteOff(note, laneIdx) {
  const lane = _joy_state.lanes[laneIdx !== undefined ? laneIdx : _joy_state.selectedLane];
  if (!lane) return;
  const gen = _joy_state.generators[lane.generator];
  if (gen) _joy_send(gen.channel, { type: 'noteOff', note });
}

// ============================================================
// TIMING
// ============================================================
function _joy_getCurrentBeat() {
  if (!_joy_state.playing) return _joy_state.beat;
  return _joy_state.beat + (Date.now() - _joy_state.startTime) / (60000 / _joy_state.bpm);
}

function _joy_trimRetroBuffer() {
  const maxMs = _joy_state.retroMaxBeats * (60000 / _joy_state.bpm);
  const cutoff = Date.now() - maxMs;
  _joy_state.retroBuffer = _joy_state.retroBuffer.filter(e => e.timestamp > cutoff);
  _joy_state.floatingNotes = _joy_state.floatingNotes.filter(n => n.timestamp > cutoff);
}

// ============================================================
// GRID
// ============================================================
function _joy_getNote(row, col) {
  const scale = _joy_scales[_joy_state.scale] || _joy_scales.minor;
  const idx = (_joy_state.gridRows - 1 - row) * _joy_state.gridCols + col;
  const octave = Math.floor(idx / scale.length);
  const degree = idx % scale.length;
  return _joy_state.rootNote + octave * 12 + scale[degree];
}

window._joy_padDown = function(row, col) {
  const key = row + ',' + col;
  if (_joy_state.activeNotes.has(key)) return;
  _joy_state.activeNotes.add(key);
  _joy_noteOn(_joy_getNote(row, col));
};

window._joy_padUp = function(row, col) {
  const key = row + ',' + col;
  if (!_joy_state.activeNotes.has(key)) return;
  _joy_state.activeNotes.delete(key);
  _joy_noteOff(_joy_getNote(row, col));
};

// ============================================================
// RETROSPECTIVE CAPTURE
// ============================================================
window._joy_capture = function(beats) {
  const beatDur = 60000 / _joy_state.bpm;
  const captureMs = beats * beatDur;
  const now = Date.now();

  const events = _joy_state.retroBuffer.filter(e => e.timestamp > now - captureMs);
  if (events.length === 0) {
    _joy_notify('No notes to capture');
    return;
  }

  _joy_state.floatingNotes.forEach(n => {
    if (n.timestamp > now - captureMs) n.captured = true;
  });

  const clip = {
    id: 'clip-' + Date.now(),
    events: events.map(e => ({ ...e, time: (e.timestamp - (now - captureMs)) / beatDur })),
    length: beats,
    capturedAt: now
  };

  const laneIdx = _joy_state.selectedLane;
  for (let s = 0; s < _joy_state.scenes.length; s++) {
    const key = laneIdx + '-' + s;
    if (!_joy_state.clips.has(key)) {
      _joy_state.clips.set(key, { ...clip, lane: laneIdx, scene: s });
      _joy_notify('Captured ' + events.length + ' notes (' + beats + ' beats)');
      _joy_render();
      return;
    }
  }
  _joy_notify('No empty slots');
};

// ============================================================
// SESSION CONTROLS
// ============================================================
window._joy_toggleClip = function(lane, scene) {
  const key = lane + '-' + scene;
  if (!_joy_state.clips.has(key)) return;
  if (_joy_state.playingClips.has(key)) {
    _joy_state.playingClips.delete(key);
  } else {
    for (const pk of _joy_state.playingClips) {
      if (pk.startsWith(lane + '-')) _joy_state.playingClips.delete(pk);
    }
    _joy_state.playingClips.add(key);
  }
  _joy_render();
};

window._joy_triggerScene = function(scene) {
  for (let l = 0; l < _joy_state.lanes.length; l++) {
    const key = l + '-' + scene;
    if (_joy_state.clips.has(key)) {
      for (const pk of _joy_state.playingClips) {
        if (pk.startsWith(l + '-')) _joy_state.playingClips.delete(pk);
      }
      _joy_state.playingClips.add(key);
    }
  }
  _joy_render();
};

window._joy_stopAll = function() {
  _joy_state.playingClips.clear();
  _joy_render();
};

window._joy_selectLane = function(idx) {
  _joy_state.selectedLane = idx;
  _joy_render();
};

window._joy_setGenerator = function(laneIdx, gen) {
  _joy_state.lanes[laneIdx].generator = gen;
  _joy_render();
};

window._joy_toggleMute = function(laneIdx) {
  _joy_state.lanes[laneIdx].muted = !_joy_state.lanes[laneIdx].muted;
  _joy_render();
};

window._joy_deleteClip = function(lane, scene) {
  const key = lane + '-' + scene;
  _joy_state.clips.delete(key);
  _joy_state.playingClips.delete(key);
  _joy_render();
};

// ============================================================
// TRANSPORT
// ============================================================
window._joy_play = function() {
  _joy_state.playing = true;
  _joy_state.startTime = Date.now();
  _joy_render();
  _joy_playLoop();
};

window._joy_stop = function() {
  _joy_state.playing = false;
  _joy_state.beat = 0;
  if (_joy_state.playTimer) cancelAnimationFrame(_joy_state.playTimer);
  _joy_render();
};

window._joy_toggle = function() {
  _joy_state.playing ? window._joy_stop() : window._joy_play();
};

function _joy_playLoop() {
  if (!_joy_state.playing) return;
  const currentBeat = _joy_getCurrentBeat();

  for (const clipKey of _joy_state.playingClips) {
    const clip = _joy_state.clips.get(clipKey);
    if (!clip) continue;
    const lane = _joy_state.lanes[clip.lane];
    if (lane.muted) continue;

    const clipBeat = currentBeat % clip.length;
    const gen = _joy_state.generators[lane.generator];

    clip.events.forEach(event => {
      const eventBeat = event.time % clip.length;
      if (Math.abs(eventBeat - clipBeat) < 0.05 && !event._played) {
        event._played = true;
        if (gen) _joy_send(gen.channel, { type: 'noteOn', note: event.note, velocity: event.velocity, duration: 0.3 });
      }
      if (clipBeat < eventBeat - 0.1) event._played = false;
    });
  }

  _joy_trimRetroBuffer();
  _joy_state.playTimer = requestAnimationFrame(_joy_playLoop);
}

window._joy_setBpm = function(bpm) {
  _joy_state.bpm = Math.max(40, Math.min(300, parseInt(bpm) || 120));
  _joy_render();
};

window._joy_setScale = function(scale) {
  _joy_state.scale = scale;
  _joy_render();
};

window._joy_setRoot = function(root) {
  _joy_state.rootNote = 48 + parseInt(root);
  _joy_render();
};

// ============================================================
// UTILITIES
// ============================================================
function _joy_notify(msg) {
  if (typeof algoSpeak === 'function') algoSpeak(msg);
  else if (window.ALGO && ALGO.notify) ALGO.notify(msg);
  else console.log(msg);
}

// ============================================================
// RENDER
// ============================================================
function _joy_render() {
  const el = document.getElementById('joy-content');
  if (!el) return;

  const scale = _joy_scales[_joy_state.scale];
  const selectedLane = _joy_state.lanes[_joy_state.selectedLane];
  const selectedGen = _joy_state.generators[selectedLane.generator];

  let html = '<div style="display:flex;height:100%;background:#0d0d12;color:#ddd;font-family:-apple-system,sans-serif;font-size:10px;overflow:hidden;">';

  // ===== LEFT: PADS + RETRO LOOPER =====
  html += '<div style="width:180px;display:flex;flex-direction:column;border-right:1px solid #222;padding:6px;gap:6px;">';

  // Controls row
  html += '<div style="display:flex;gap:4px;flex-wrap:wrap;">';
  html += '<button onclick="_joy_toggle()" style="padding:3px 8px;background:' + (_joy_state.playing ? '#a33' : '#3a3') + ';border:none;color:#fff;border-radius:3px;cursor:pointer;font-size:10px;">' + (_joy_state.playing ? '⏹' : '▶') + '</button>';
  html += '<input type="range" min="60" max="200" value="' + _joy_state.bpm + '" onchange="_joy_setBpm(this.value)" style="width:50px;height:14px;" title="BPM: ' + _joy_state.bpm + '">';
  html += '<span style="color:#888;font-size:9px;">' + _joy_state.bpm + '</span>';
  html += '</div>';

  // Scale + Root selectors
  html += '<div style="display:flex;gap:4px;">';
  html += '<select onchange="_joy_setScale(this.value)" style="flex:1;background:#1a1a22;color:#aaa;border:1px solid #333;padding:2px;font-size:9px;border-radius:2px;">';
  Object.keys(_joy_scales).forEach(s => {
    html += '<option value="' + s + '"' + (_joy_state.scale === s ? ' selected' : '') + '>' + s + '</option>';
  });
  html += '</select>';
  html += '<select onchange="_joy_setRoot(this.value)" style="width:40px;background:#1a1a22;color:#aaa;border:1px solid #333;padding:2px;font-size:9px;border-radius:2px;">';
  _joy_noteNames.forEach((n, i) => {
    html += '<option value="' + i + '"' + ((_joy_state.rootNote % 12) === i ? ' selected' : '') + '>' + n + '</option>';
  });
  html += '</select>';
  html += '</div>';

  // Pad grid (5 cols x 8 rows)
  html += '<div style="display:grid;grid-template-columns:repeat(' + _joy_state.gridCols + ',1fr);gap:2px;flex:1;">';
  for (let r = 0; r < _joy_state.gridRows; r++) {
    for (let c = 0; c < _joy_state.gridCols; c++) {
      const idx = (_joy_state.gridRows - 1 - r) * _joy_state.gridCols + c;
      const deg = idx % scale.length;
      const hue = (deg / scale.length) * 280 + 180;
      const isActive = _joy_state.activeNotes.has(r + ',' + c);
      html += '<div onmousedown="_joy_padDown(' + r + ',' + c + ')" onmouseup="_joy_padUp(' + r + ',' + c + ')" onmouseleave="_joy_padUp(' + r + ',' + c + ')" ontouchstart="_joy_padDown(' + r + ',' + c + ');event.preventDefault()" ontouchend="_joy_padUp(' + r + ',' + c + ')" style="background:hsl(' + hue + ',50%,' + (isActive ? '45' : '22') + '%);border-radius:3px;cursor:pointer;min-height:18px;" onmouseenter="if(event.buttons===1)_joy_padDown(' + r + ',' + c + ')"></div>';
    }
  }
  html += '</div>';

  // Retrospective looper canvas
  html += '<div style="background:#08080c;border-radius:4px;padding:4px;">';
  html += '<canvas id="joy-retro-canvas" width="164" height="50" style="display:block;border-radius:3px;"></canvas>';
  html += '</div>';

  // Capture buttons
  html += '<div style="display:flex;gap:2px;">';
  [4, 8, 16, 32].forEach(beats => {
    html += '<button onclick="_joy_capture(' + beats + ')" style="flex:1;padding:4px 2px;background:#1a1a28;border:1px solid #333;color:#888;border-radius:3px;cursor:pointer;font-size:9px;">' + beats + '</button>';
  });
  html += '</div>';

  html += '</div>'; // End left panel

  // ===== RIGHT: SESSION GRID =====
  html += '<div style="flex:1;display:flex;flex-direction:column;padding:6px;gap:4px;overflow:hidden;">';

  // Lane headers
  html += '<div style="display:flex;gap:2px;">';
  html += '<div style="width:24px;"></div>';
  _joy_state.lanes.forEach((lane, i) => {
    const isSelected = i === _joy_state.selectedLane;
    const gen = _joy_state.generators[lane.generator];
    html += '<div onclick="_joy_selectLane(' + i + ')" style="flex:1;background:' + (isSelected ? '#2a2a35' : '#181820') + ';padding:4px;cursor:pointer;text-align:center;border-radius:3px;border:' + (isSelected ? '1px solid #444' : '1px solid transparent') + ';">';
    html += '<div style="font-size:11px;">' + gen.icon + '</div>';
    html += '<div style="font-size:8px;color:#666;">' + lane.name + '</div>';
    html += '</div>';
  });
  html += '<div style="width:20px;"></div>';
  html += '</div>';

  // Scene grid
  html += '<div style="flex:1;overflow-y:auto;">';
  _joy_state.scenes.forEach((scene, s) => {
    html += '<div style="display:flex;gap:2px;margin-bottom:2px;">';

    // Scene launcher
    html += '<div onclick="_joy_triggerScene(' + s + ')" style="width:24px;background:#1a1a28;padding:4px 2px;cursor:pointer;text-align:center;border-radius:3px;font-size:10px;">▶</div>';

    // Clip slots
    _joy_state.lanes.forEach((lane, l) => {
      const key = l + '-' + s;
      const clip = _joy_state.clips.get(key);
      const isPlaying = _joy_state.playingClips.has(key);

      if (clip) {
        html += '<div onclick="_joy_toggleClip(' + l + ',' + s + ')" oncontextmenu="_joy_deleteClip(' + l + ',' + s + ');event.preventDefault()" style="flex:1;background:' + (isPlaying ? '#2a5a2a' : '#1a3a4a') + ';padding:6px 4px;cursor:pointer;border-radius:3px;text-align:center;min-height:28px;">';
        html += '<div style="font-size:10px;">' + (isPlaying ? '■' : '▶') + '</div>';
        html += '<div style="font-size:8px;color:#888;">' + clip.events.length + '</div>';
        html += '</div>';
      } else {
        html += '<div style="flex:1;background:#111118;border:1px dashed #252530;border-radius:3px;min-height:28px;"></div>';
      }
    });

    // Stop button
    html += '<div onclick="_joy_stopAll()" style="width:20px;background:#2a1a1a;padding:4px 2px;cursor:pointer;text-align:center;border-radius:3px;font-size:9px;">⏹</div>';

    html += '</div>';
  });
  html += '</div>';

  // Selected lane controls
  html += '<div style="background:#141418;border-radius:4px;padding:6px;display:flex;gap:6px;align-items:center;">';
  html += '<span style="font-size:11px;">' + selectedGen.icon + '</span>';
  html += '<select onchange="_joy_setGenerator(' + _joy_state.selectedLane + ',this.value)" style="background:#1a1a22;color:#aaa;border:1px solid #333;padding:3px;font-size:9px;border-radius:2px;">';
  Object.entries(_joy_state.generators).forEach(([id, gen]) => {
    html += '<option value="' + id + '"' + (selectedLane.generator === id ? ' selected' : '') + '>' + gen.icon + ' ' + gen.name + '</option>';
  });
  html += '</select>';
  html += '<button onclick="_joy_toggleMute(' + _joy_state.selectedLane + ')" style="padding:3px 8px;background:' + (selectedLane.muted ? '#a44' : '#333') + ';border:1px solid #444;color:#fff;border-radius:3px;cursor:pointer;font-size:9px;">' + (selectedLane.muted ? 'MUTED' : 'M') + '</button>';
  html += '</div>';

  html += '</div>'; // End right panel

  html += '</div>';
  el.innerHTML = html;

  // Start canvas animation
  if (!_joy_state.animTimer) {
    _joy_state.animTimer = setInterval(_joy_drawRetroCanvas, 50);
  }
}

function _joy_drawRetroCanvas() {
  const canvas = document.getElementById('joy-retro-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const now = Date.now();
  const maxMs = _joy_state.retroMaxBeats * (60000 / _joy_state.bpm);

  ctx.fillStyle = '#08080c';
  ctx.fillRect(0, 0, w, h);

  // Beat markers
  ctx.strokeStyle = '#151520';
  ctx.lineWidth = 1;
  for (let b = 0; b <= _joy_state.retroMaxBeats; b += 8) {
    const x = w - (b / _joy_state.retroMaxBeats) * w;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  // Capture zone markers
  [4, 8, 16, 32].forEach(beats => {
    const x = w - (beats / _joy_state.retroMaxBeats) * w;
    ctx.strokeStyle = 'rgba(80, 120, 180, 0.25)';
    ctx.beginPath();
    ctx.moveTo(x, h - 3);
    ctx.lineTo(x, h);
    ctx.stroke();
  });

  // Floating notes (moving right to left)
  _joy_trimRetroBuffer();
  _joy_state.floatingNotes.forEach(note => {
    const age = now - note.timestamp;
    const x = w - (age / maxMs) * w;
    const y = h - ((note.note - 36) / 60) * (h - 6) - 3;
    const size = Math.max(2, (note.velocity / 127) * 5 + 2);
    const hue = (note.note % 12) * 30;
    const alpha = note.captured ? 0.9 : Math.max(0.2, 1 - age / maxMs);

    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fillStyle = note.captured
      ? 'rgba(100, 255, 150, ' + alpha + ')'
      : 'hsla(' + hue + ', 70%, 55%, ' + alpha + ')';
    ctx.fill();
  });

  // Playhead
  if (_joy_state.playing) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w - 1, 0);
    ctx.lineTo(w - 1, h);
    ctx.stroke();
  }
}

// ============================================================
// INITIALIZE
// ============================================================
function _joy_open() {
  if (typeof hideStartMenu === 'function') hideStartMenu();

  const createWin = (typeof ALGO !== 'undefined' && ALGO.createWindow) ? ALGO.createWindow :
                    (typeof createWindow === 'function' ? createWindow : null);

  if (createWin) {
    createWin({
      title: 'Joy',
      icon: '🎹',
      width: 480,
      height: 360,
      content: '<div id="joy-content" style="height:100%;"></div>',
      onClose: () => {
        window._joy_stop();
        if (_joy_state.animTimer) {
          clearInterval(_joy_state.animTimer);
          _joy_state.animTimer = null;
        }
      }
    });
    setTimeout(_joy_render, 50);
  } else {
    console.error('Joy: No window creation function available');
  }
}

_joy_open();
