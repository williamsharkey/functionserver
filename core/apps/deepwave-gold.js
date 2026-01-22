// System App: Deepwave Dolphin Editor Gold - Multi-lane MIDI Editor
ALGO.app.name = 'Deepwave Gold';
ALGO.app.icon = '🐬';

const _dw_state = {
  instances: {},
  counter: 0
};

const _dw_NOTE_DURATIONS = {
  whole: { beats: 4, symbol: '𝅝', name: 'Whole' },
  half: { beats: 2, symbol: '𝅗𝅥', name: 'Half' },
  quarter: { beats: 1, symbol: '♩', name: 'Quarter' },
  eighth: { beats: 0.5, symbol: '♪', name: '8th' },
  sixteenth: { beats: 0.25, symbol: '𝅘𝅥𝅯', name: '16th' },
  thirtysecond: { beats: 0.125, symbol: '𝅘𝅥𝅰', name: '32nd' }
};

function _dw_open() {
  if (typeof hideStartMenu === 'function') hideStartMenu();

  _dw_state.counter++;
  const instId = 'dw-' + _dw_state.counter;

  const inst = {
    instId: instId,
    tempo: 120,
    beatsPerMeasure: 4,
    measures: 8,
    currentNoteDuration: 'quarter',
    isPlaying: false,
    playbackTimer: null,
    playbackBeat: 0,
    gridPixelsPerBeat: 30,
    noteHeight: 8,
    lanes: [
      { id: 0, name: 'Lane 1', notes: [], output: null, muted: false, color: '#4a90d9' },
      { id: 1, name: 'Lane 2', notes: [], output: null, muted: false, color: '#d94a4a' },
      { id: 2, name: 'Lane 3', notes: [], output: null, muted: false, color: '#4ad94a' },
      { id: 3, name: 'Lane 4', notes: [], output: null, muted: false, color: '#d9d94a' }
    ],
    selectedLane: 0,
    selectedNote: null,
    isDragging: false,
    dragNote: null
  };

  _dw_state.instances[instId] = inst;

  const durationBtns = Object.entries(_dw_NOTE_DURATIONS).map(([key, val]) =>
    '<button onclick="_dw_setNoteDuration(\'' + instId + '\',\'' + key + '\')" id="dw-dur-' + key + '-' + instId + '" class="dw-btn' + (key === 'quarter' ? ' active' : '') + '" style="min-width:40px;padding:3px 8px;background:linear-gradient(180deg,#5a5a7a,#4a4a6a);border:1px solid #666;color:#fff;font-size:11px;cursor:pointer;border-radius:2px;" title="' + val.name + '">' + val.symbol + '</button>'
  ).join('');

  const laneHeaders = inst.lanes.map((lane, i) =>
    '<div id="dw-lane-header-' + i + '-' + instId + '" onclick="_dw_selectLane(\'' + instId + '\',' + i + ')" style="height:80px;padding:4px;border-bottom:1px solid #444;background:' + (i === 0 ? '#3a3a5a' : '#2a2a3a') + ';cursor:pointer;">' +
      '<div style="display:flex;align-items:center;gap:4px;margin-bottom:4px;">' +
        '<span style="width:8px;height:8px;background:' + lane.color + ';border-radius:2px;"></span>' +
        '<input type="text" value="' + lane.name + '" style="flex:1;background:#222;color:#fff;border:1px solid #444;padding:2px;font-size:10px;" onchange="_dw_renameLane(\'' + instId + '\',' + i + ',this.value)">' +
        '<button onclick="_dw_toggleMute(\'' + instId + '\',' + i + ')" id="dw-mute-' + i + '-' + instId + '" style="padding:2px 6px;background:#4a4a6a;border:1px solid #555;color:#fff;font-size:10px;cursor:pointer;">M</button>' +
      '</div>' +
      '<div style="font-size:10px;margin-bottom:2px;">Output:</div>' +
      '<select id="dw-output-' + i + '-' + instId + '" style="width:100%;background:#222;color:#fff;border:1px solid #444;font-size:10px;" onchange="_dw_setOutput(\'' + instId + '\',' + i + ',this.value)">' +
        '<option value="">-- None --</option>' +
      '</select>' +
    '</div>'
  ).join('');

  ALGO.createWindow({
    title: 'Deepwave Dolphin Editor Gold',
    icon: '🐬',
    width: 800,
    height: 550,
    content: '<div style="display:flex;flex-direction:column;height:100%;background:#2a2a3a;color:#fff;font-size:11px;">' +
      '<div style="background:linear-gradient(180deg,#4a4a6a,#3a3a5a);padding:4px 8px;border-bottom:2px groove #666;display:flex;gap:8px;align-items:center;">' +
        '<span style="font-weight:bold;color:#ffd700;">🐬 Deepwave Gold</span>' +
        '<div style="border-left:1px solid #666;height:20px;margin:0 4px;"></div>' +
        '<button onclick="_dw_newScore(\'' + instId + '\')" style="padding:3px 8px;background:linear-gradient(180deg,#5a5a7a,#4a4a6a);border:1px solid #666;color:#fff;font-size:11px;cursor:pointer;border-radius:2px;">📄 New</button>' +
        '<button onclick="_dw_loadScore(\'' + instId + '\')" style="padding:3px 8px;background:linear-gradient(180deg,#5a5a7a,#4a4a6a);border:1px solid #666;color:#fff;font-size:11px;cursor:pointer;border-radius:2px;">📂 Load</button>' +
        '<button onclick="_dw_saveScore(\'' + instId + '\')" style="padding:3px 8px;background:linear-gradient(180deg,#5a5a7a,#4a4a6a);border:1px solid #666;color:#fff;font-size:11px;cursor:pointer;border-radius:2px;">💾 Save</button>' +
        '<div style="border-left:1px solid #666;height:20px;margin:0 4px;"></div>' +
        '<button onclick="_dw_exportAudio(\'' + instId + '\')" style="padding:3px 8px;background:linear-gradient(180deg,#5a5a7a,#4a4a6a);border:1px solid #666;color:#fff;font-size:11px;cursor:pointer;border-radius:2px;">🎵 Export WAV</button>' +
      '</div>' +
      '<div style="background:#3a3a5a;padding:6px 8px;border-bottom:1px solid #555;display:flex;gap:12px;align-items:center;">' +
        '<button onclick="_dw_play(\'' + instId + '\')" id="dw-play-' + instId + '" style="width:60px;padding:3px 8px;background:linear-gradient(180deg,#5a5a7a,#4a4a6a);border:1px solid #666;color:#fff;font-size:11px;cursor:pointer;border-radius:2px;">▶ Play</button>' +
        '<button onclick="_dw_stop(\'' + instId + '\')" style="padding:3px 8px;background:linear-gradient(180deg,#5a5a7a,#4a4a6a);border:1px solid #666;color:#fff;font-size:11px;cursor:pointer;border-radius:2px;">⏹ Stop</button>' +
        '<div style="display:flex;align-items:center;gap:4px;">' +
          '<span>BPM:</span>' +
          '<input type="number" id="dw-tempo-' + instId + '" value="' + inst.tempo + '" min="40" max="300" style="width:50px;background:#222;color:#fff;border:1px solid #555;padding:2px;" onchange="_dw_setTempo(\'' + instId + '\',this.value)">' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:4px;">' +
          '<span>Measures:</span>' +
          '<input type="number" id="dw-measures-' + instId + '" value="' + inst.measures + '" min="1" max="64" style="width:40px;background:#222;color:#fff;border:1px solid #555;padding:2px;" onchange="_dw_setMeasures(\'' + instId + '\',this.value)">' +
        '</div>' +
        '<div id="dw-position-' + instId + '" style="font-family:monospace;background:#111;padding:4px 8px;border:1px inset #333;">Beat: 0.00</div>' +
      '</div>' +
      '<div style="background:#333;padding:4px 8px;border-bottom:1px solid #555;display:flex;gap:4px;align-items:center;">' +
        '<span>Note:</span>' +
        durationBtns +
        '<div style="flex:1;"></div>' +
        '<span>Snap:</span>' +
        '<select id="dw-snap-' + instId + '" style="background:#222;color:#fff;border:1px solid #555;">' +
          '<option value="1">Beat</option>' +
          '<option value="0.5">1/2 Beat</option>' +
          '<option value="0.25" selected>1/4 Beat</option>' +
          '<option value="0.125">1/8 Beat</option>' +
        '</select>' +
      '</div>' +
      '<div style="flex:1;display:flex;overflow:hidden;">' +
        '<div style="width:180px;background:#2a2a3a;border-right:2px solid #555;display:flex;flex-direction:column;">' +
          '<div style="height:24px;background:#333;border-bottom:1px solid #444;padding:4px;font-weight:bold;">Lanes / Output</div>' +
          laneHeaders +
        '</div>' +
        '<div style="flex:1;overflow:auto;position:relative;" id="dw-scroll-' + instId + '">' +
          '<canvas id="dw-canvas-' + instId + '" style="display:block;"></canvas>' +
        '</div>' +
      '</div>' +
      '<div style="background:#222;padding:4px 8px;border-top:1px solid #555;display:flex;justify-content:space-between;">' +
        '<span id="dw-status-' + instId + '">Ready - Click on grid to add notes</span>' +
        '<span>🐬 Deepwave Gold v1.0</span>' +
      '</div>' +
    '</div>',
    onClose: () => {
      _dw_stop(instId);
      delete _dw_state.instances[instId];
    }
  });

  setTimeout(() => _dw_initCanvas(instId), 100);
}

function _dw_initCanvas(instId) {
  const inst = _dw_state.instances[instId];
  if (!inst) return;

  const canvas = document.getElementById('dw-canvas-' + instId);
  if (!canvas) return;

  const totalBeats = inst.measures * inst.beatsPerMeasure;
  canvas.width = totalBeats * inst.gridPixelsPerBeat + 100;
  canvas.height = inst.lanes.length * 80 + 24;

  canvas.onmousedown = (e) => _dw_canvasMouseDown(instId, e);
  canvas.onmousemove = (e) => _dw_canvasMouseMove(instId, e);
  canvas.onmouseup = () => _dw_canvasMouseUp(instId);
  canvas.oncontextmenu = (e) => e.preventDefault();

  _dw_renderCanvas(instId);
}

function _dw_renderCanvas(instId) {
  const inst = _dw_state.instances[instId];
  if (!inst) return;

  const canvas = document.getElementById('dw-canvas-' + instId);
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const ppb = inst.gridPixelsPerBeat;
  const totalBeats = inst.measures * inst.beatsPerMeasure;
  const laneHeight = 80;

  ctx.fillStyle = '#1a1a2a';
  ctx.fillRect(0, 0, width, height);

  // Draw grid
  for (let beat = 0; beat <= totalBeats; beat++) {
    const x = beat * ppb;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    if (beat % inst.beatsPerMeasure === 0) {
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 2;
    } else {
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;
    }
    ctx.stroke();
  }

  // Lane separators
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 1;
  for (let i = 0; i <= inst.lanes.length; i++) {
    const y = 24 + i * laneHeight;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Beat numbers
  ctx.fillStyle = '#888';
  ctx.font = '10px monospace';
  for (let beat = 0; beat < totalBeats; beat++) {
    if (beat % inst.beatsPerMeasure === 0) {
      ctx.fillText('M' + (Math.floor(beat / inst.beatsPerMeasure) + 1), beat * ppb + 2, 14);
    }
  }

  // Draw notes
  inst.lanes.forEach((lane, laneIdx) => {
    const laneY = 24 + laneIdx * laneHeight;

    // Note rows background
    for (let note = 0; note < 12; note++) {
      const noteY = laneY + (11 - note) * (laneHeight / 12);
      const isBlack = [1, 3, 6, 8, 10].includes(note);
      ctx.fillStyle = isBlack ? '#252535' : '#2a2a3a';
      ctx.fillRect(0, noteY, width, laneHeight / 12);
    }

    lane.notes.forEach(note => {
      const x = note.beat * ppb;
      const noteInOctave = note.pitch % 12;
      const y = laneY + (11 - noteInOctave) * (laneHeight / 12);
      const w = note.duration * ppb - 2;
      const h = inst.noteHeight;

      ctx.fillStyle = lane.muted ? '#555' : lane.color;
      ctx.fillRect(x + 1, y, w, h);

      if (inst.selectedNote === note) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y, w, h);
      }
    });
  });

  // Playback position
  if (inst.isPlaying || inst.playbackBeat > 0) {
    const playX = inst.playbackBeat * ppb;
    ctx.strokeStyle = '#ff0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playX, 0);
    ctx.lineTo(playX, height);
    ctx.stroke();
  }
}

function _dw_canvasMouseDown(instId, e) {
  const inst = _dw_state.instances[instId];
  if (!inst) return;

  const canvas = document.getElementById('dw-canvas-' + instId);
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const ppb = inst.gridPixelsPerBeat;
  const laneHeight = 80;
  const laneIdx = Math.floor((y - 24) / laneHeight);

  if (laneIdx < 0 || laneIdx >= inst.lanes.length) return;

  const beat = x / ppb;
  const snap = parseFloat(document.getElementById('dw-snap-' + instId)?.value || 0.25);
  const snappedBeat = Math.round(beat / snap) * snap;

  const lane = inst.lanes[laneIdx];
  const clickedNote = lane.notes.find(n => beat >= n.beat && beat < n.beat + n.duration);

  // Right click or ctrl+click to delete
  if (e.button === 2 || e.ctrlKey) {
    if (clickedNote) {
      lane.notes = lane.notes.filter(n => n !== clickedNote);
      inst.selectedNote = null;
      _dw_renderCanvas(instId);
    }
    return;
  }

  if (clickedNote) {
    inst.selectedNote = clickedNote;
    inst.isDragging = true;
    inst.dragNote = clickedNote;
  } else {
    const noteInLane = Math.floor((y - 24 - laneIdx * laneHeight) / (laneHeight / 12));
    const pitch = 60 + (11 - noteInLane);
    const duration = _dw_NOTE_DURATIONS[inst.currentNoteDuration].beats;
    const newNote = { beat: snappedBeat, pitch: pitch, duration: duration, velocity: 100 };
    lane.notes.push(newNote);
    inst.selectedNote = newNote;
  }

  _dw_selectLane(instId, laneIdx);
  _dw_renderCanvas(instId);
}

function _dw_canvasMouseMove(instId, e) {
  const inst = _dw_state.instances[instId];
  if (!inst || !inst.isDragging || !inst.dragNote) return;

  const canvas = document.getElementById('dw-canvas-' + instId);
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;

  const ppb = inst.gridPixelsPerBeat;
  const snap = parseFloat(document.getElementById('dw-snap-' + instId)?.value || 0.25);
  const beat = Math.max(0, Math.round((x / ppb) / snap) * snap);

  inst.dragNote.beat = beat;
  _dw_renderCanvas(instId);
}

function _dw_canvasMouseUp(instId) {
  const inst = _dw_state.instances[instId];
  if (!inst) return;
  inst.isDragging = false;
  inst.dragNote = null;
}

function _dw_selectLane(instId, laneIdx) {
  const inst = _dw_state.instances[instId];
  if (!inst) return;
  inst.selectedLane = laneIdx;
  inst.lanes.forEach((_, i) => {
    const header = document.getElementById('dw-lane-header-' + i + '-' + instId);
    if (header) header.style.background = i === laneIdx ? '#3a3a5a' : '#2a2a3a';
  });
}

function _dw_setNoteDuration(instId, duration) {
  const inst = _dw_state.instances[instId];
  if (!inst) return;
  inst.currentNoteDuration = duration;
  Object.keys(_dw_NOTE_DURATIONS).forEach(key => {
    const btn = document.getElementById('dw-dur-' + key + '-' + instId);
    if (btn) btn.style.background = key === duration ? 'linear-gradient(180deg,#7a6a2a,#5a4a1a)' : 'linear-gradient(180deg,#5a5a7a,#4a4a6a)';
  });
}

function _dw_setTempo(instId, tempo) {
  const inst = _dw_state.instances[instId];
  if (inst) inst.tempo = Math.max(40, Math.min(300, parseInt(tempo) || 120));
}

function _dw_setMeasures(instId, measures) {
  const inst = _dw_state.instances[instId];
  if (!inst) return;
  inst.measures = Math.max(1, Math.min(64, parseInt(measures) || 8));
  _dw_initCanvas(instId);
}

function _dw_renameLane(instId, laneIdx, name) {
  const inst = _dw_state.instances[instId];
  if (inst) inst.lanes[laneIdx].name = name;
}

function _dw_toggleMute(instId, laneIdx) {
  const inst = _dw_state.instances[instId];
  if (!inst) return;
  inst.lanes[laneIdx].muted = !inst.lanes[laneIdx].muted;
  const btn = document.getElementById('dw-mute-' + laneIdx + '-' + instId);
  if (btn) btn.style.background = inst.lanes[laneIdx].muted ? '#d94a4a' : '#4a4a6a';
  _dw_renderCanvas(instId);
}

function _dw_setOutput(instId, laneIdx, channelId) {
  const inst = _dw_state.instances[instId];
  if (inst) inst.lanes[laneIdx].output = channelId || null;
}

function _dw_play(instId) {
  const inst = _dw_state.instances[instId];
  if (!inst || inst.isPlaying) return;

  inst.isPlaying = true;
  inst.playbackBeat = 0;
  const startTime = performance.now();
  const msPerBeat = 60000 / inst.tempo;

  const btn = document.getElementById('dw-play-' + instId);
  if (btn) btn.textContent = '⏸ Pause';

  function playbackLoop() {
    if (!inst.isPlaying) return;

    const elapsed = performance.now() - startTime;
    inst.playbackBeat = elapsed / msPerBeat;

    const posEl = document.getElementById('dw-position-' + instId);
    if (posEl) posEl.textContent = 'Beat: ' + inst.playbackBeat.toFixed(2);

    _dw_renderCanvas(instId);

    const totalBeats = inst.measures * inst.beatsPerMeasure;
    if (inst.playbackBeat >= totalBeats) {
      _dw_stop(instId);
      return;
    }

    inst.playbackTimer = requestAnimationFrame(playbackLoop);
  }

  playbackLoop();
}

function _dw_stop(instId) {
  const inst = _dw_state.instances[instId];
  if (!inst) return;

  inst.isPlaying = false;
  inst.playbackBeat = 0;
  if (inst.playbackTimer) {
    cancelAnimationFrame(inst.playbackTimer);
    inst.playbackTimer = null;
  }

  const btn = document.getElementById('dw-play-' + instId);
  if (btn) btn.textContent = '▶ Play';

  _dw_renderCanvas(instId);
}

function _dw_newScore(instId) {
  const inst = _dw_state.instances[instId];
  if (!inst) return;
  if (!confirm('Clear all notes?')) return;
  inst.lanes.forEach(lane => lane.notes = []);
  inst.measures = 8;
  inst.tempo = 120;
  document.getElementById('dw-tempo-' + instId).value = 120;
  document.getElementById('dw-measures-' + instId).value = 8;
  _dw_initCanvas(instId);
}

function _dw_saveScore(instId) {
  const inst = _dw_state.instances[instId];
  if (!inst) return;
  const name = prompt('Save score as:', 'my-song.dw');
  if (!name) return;
  const fileName = name.endsWith('.dw') ? name : name + '.dw';
  const scoreData = {
    format: 'deepwave-v1',
    tempo: inst.tempo,
    measures: inst.measures,
    beatsPerMeasure: inst.beatsPerMeasure,
    lanes: inst.lanes.map(lane => ({
      name: lane.name,
      color: lane.color,
      notes: lane.notes.map(n => ({ beat: n.beat, pitch: n.pitch, duration: n.duration, velocity: n.velocity }))
    }))
  };
  if (typeof savedFiles !== 'undefined') {
    savedFiles.push({ name: fileName, content: JSON.stringify(scoreData, null, 2), type: 'text', icon: '🐬' });
    if (typeof saveState === 'function') saveState();
    if (typeof createDesktopIcons === 'function') createDesktopIcons();
  }
  ALGO.notify('Saved: ' + fileName);
}

function _dw_loadScore(instId) {
  const inst = _dw_state.instances[instId];
  if (!inst || typeof savedFiles === 'undefined') return;
  const dwFiles = savedFiles.filter(f => f.name.endsWith('.dw'));
  if (dwFiles.length === 0) { ALGO.notify('No .dw files found'); return; }
  const choice = prompt('Load score:\n' + dwFiles.map((f, i) => (i + 1) + '. ' + f.name).join('\n') + '\n\nEnter number:');
  if (!choice) return;
  const idx = parseInt(choice) - 1;
  if (idx < 0 || idx >= dwFiles.length) return;
  try {
    const data = JSON.parse(dwFiles[idx].content);
    if (data.format === 'deepwave-v1') {
      inst.tempo = data.tempo || 120;
      inst.measures = data.measures || 8;
      data.lanes.forEach((laneData, i) => {
        if (inst.lanes[i]) {
          inst.lanes[i].name = laneData.name;
          inst.lanes[i].notes = laneData.notes || [];
        }
      });
    }
    document.getElementById('dw-tempo-' + instId).value = inst.tempo;
    document.getElementById('dw-measures-' + instId).value = inst.measures;
    _dw_initCanvas(instId);
    ALGO.notify('Loaded: ' + dwFiles[idx].name);
  } catch (e) {
    ALGO.notify('Error: ' + e.message);
  }
}

function _dw_exportAudio(instId) {
  const inst = _dw_state.instances[instId];
  if (!inst) return;

  // Collect all notes from non-muted lanes
  const allNotes = [];
  inst.lanes.forEach((lane, laneIdx) => {
    if (lane.muted) return;
    lane.notes.forEach(note => {
      allNotes.push({
        beat: note.beat,
        pitch: note.pitch,
        duration: note.duration,
        velocity: note.velocity,
        color: lane.color
      });
    });
  });

  if (allNotes.length === 0) {
    ALGO.notify('No notes to export');
    return;
  }

  const name = prompt('Export audio as:', 'deepwave-song.wav');
  if (!name) return;

  ALGO.notify('Rendering audio...');

  const msPerBeat = 60000 / inst.tempo;
  let maxBeat = 0;
  allNotes.forEach(note => {
    const endBeat = note.beat + note.duration;
    if (endBeat > maxBeat) maxBeat = endBeat;
  });

  const duration = (maxBeat * msPerBeat / 1000) + 2;
  const sampleRate = 44100;
  const offlineCtx = new OfflineAudioContext(2, sampleRate * duration, sampleRate);

  // Render each note
  allNotes.forEach(note => {
    const noteTimeSec = note.beat * msPerBeat / 1000;
    const noteDurSec = note.duration * msPerBeat / 1000;
    const vel = (note.velocity || 100) / 127;
    const freq = 440 * Math.pow(2, (note.pitch - 69) / 12);

    // Create oscillator with harmonics for richer sound
    [1, 2, 3, 4].forEach((harmonic, i) => {
      const osc = offlineCtx.createOscillator();
      const gain = offlineCtx.createGain();

      osc.frequency.value = freq * harmonic;
      osc.type = i === 0 ? 'sine' : 'sine';

      const vol = vel * 0.15 / (harmonic * harmonic);
      const decay = Math.min(noteDurSec + 0.5, 2);

      gain.gain.setValueAtTime(0, noteTimeSec);
      gain.gain.linearRampToValueAtTime(vol, noteTimeSec + 0.01);
      gain.gain.setValueAtTime(vol * 0.8, noteTimeSec + noteDurSec * 0.7);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTimeSec + decay);

      osc.connect(gain);
      gain.connect(offlineCtx.destination);

      osc.start(noteTimeSec);
      osc.stop(noteTimeSec + decay + 0.1);
    });
  });

  offlineCtx.startRendering().then(buffer => {
    const wavData = _dw_audioBufferToWav(buffer);
    const blob = new Blob([wavData], { type: 'audio/wav' });

    const reader = new FileReader();
    reader.onload = function() {
      const exportName = name.endsWith('.wav') ? name : name + '.wav';

      if (typeof savedFiles !== 'undefined') {
        savedFiles.push({
          name: exportName,
          content: reader.result,
          type: 'audio',
          icon: '🔊'
        });
        if (typeof saveState === 'function') saveState();
        if (typeof createDesktopIcons === 'function') createDesktopIcons();
      }

      ALGO.notify('Exported: ' + exportName);
    };
    reader.readAsDataURL(blob);
  }).catch(e => {
    ALGO.notify('Export failed: ' + e.message);
  });
}

function _dw_audioBufferToWav(buffer) {
  const numCh = buffer.numberOfChannels;
  const rate = buffer.sampleRate;
  const samples = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numCh * bytesPerSample;
  const dataSize = samples * blockAlign;
  const bufSize = 44 + dataSize;

  const ab = new ArrayBuffer(bufSize);
  const v = new DataView(ab);

  const writeStr = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };

  writeStr(0, 'RIFF');
  v.setUint32(4, bufSize - 8, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, numCh, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * blockAlign, true);
  v.setUint16(32, blockAlign, true);
  v.setUint16(34, 16, true);
  writeStr(36, 'data');
  v.setUint32(40, dataSize, true);

  const channels = [];
  for (let i = 0; i < numCh; i++) channels.push(buffer.getChannelData(i));

  let offset = 44;
  for (let i = 0; i < samples; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      const s = Math.max(-1, Math.min(1, channels[ch][i]));
      v.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }
  }

  return ab;
}

window._dw_open = _dw_open;
window._dw_initCanvas = _dw_initCanvas;
window._dw_renderCanvas = _dw_renderCanvas;
window._dw_canvasMouseDown = _dw_canvasMouseDown;
window._dw_canvasMouseMove = _dw_canvasMouseMove;
window._dw_canvasMouseUp = _dw_canvasMouseUp;
window._dw_selectLane = _dw_selectLane;
window._dw_setNoteDuration = _dw_setNoteDuration;
window._dw_setTempo = _dw_setTempo;
window._dw_setMeasures = _dw_setMeasures;
window._dw_renameLane = _dw_renameLane;
window._dw_toggleMute = _dw_toggleMute;
window._dw_setOutput = _dw_setOutput;
window._dw_play = _dw_play;
window._dw_stop = _dw_stop;
window._dw_newScore = _dw_newScore;
window._dw_saveScore = _dw_saveScore;
window._dw_loadScore = _dw_loadScore;
window._dw_exportAudio = _dw_exportAudio;
window._dw_audioBufferToWav = _dw_audioBufferToWav;
window._dw_state = _dw_state;

_dw_open();
