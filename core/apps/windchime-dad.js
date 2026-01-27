// System App: Windchime Dad - MIDI Wind Chime Synthesizer
ALGO.app.name = 'Windchime Dad';
ALGO.app.icon = '🎐';
ALGO.app.category = 'media';

const _wc_state = {
  instances: {},
  counter: 0
};

const _wc_materials = {
  aluminum: { baseFreq: 1.0, harmonics: [1, 2.76, 5.4, 8.93], decay: 2.5, brightness: 0.6, color: '#C0C0C0' },
  brass: { baseFreq: 0.85, harmonics: [1, 2.0, 3.0, 4.0], decay: 3.5, brightness: 0.4, color: '#D4AF37' },
  bamboo: { baseFreq: 1.2, harmonics: [1, 2.5, 4.2], decay: 1.5, brightness: 0.3, color: '#8B7355' },
  glass: { baseFreq: 1.4, harmonics: [1, 3.0, 6.0, 10.0], decay: 4.0, brightness: 0.8, color: '#87CEEB' },
  crystal: { baseFreq: 1.3, harmonics: [1, 2.5, 4.5, 7.5, 11.0], decay: 5.0, brightness: 0.9, color: '#E8E8E8' }
};

let _wcAudioCtx = null;
function _wc_getAudioContext() {
  if (!_wcAudioCtx) {
    _wcAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (_wcAudioCtx.state === 'suspended') {
    _wcAudioCtx.resume();
  }
  return _wcAudioCtx;
}

function _wc_handleMidiInput(instId, message, senderInfo) {
  const inst = _wc_state.instances[instId];
  if (!inst) return;

  const indicator = document.getElementById('wc-midi-indicator-' + inst.winId);
  if (indicator) {
    indicator.style.background = '#00ff00';
    setTimeout(() => { if (indicator) indicator.style.background = '#004400'; }, 100);
  }

  if (message.type === 'noteOn' || message.type === 'note') {
    _wc_playNoteForInstance(instId, message.note, message.velocity / 127, message.duration || 0.3);
  }
}

function _wc_playNoteForInstance(instId, midiNote, velocity, duration) {
  const inst = _wc_state.instances[instId];
  if (!inst) return;

  const ctx = _wc_getAudioContext();
  const now = ctx.currentTime;
  const mat = _wc_materials[inst.material];

  const baseFreq = 440 * Math.pow(2, (midiNote - 69) / 12) * mat.baseFreq;
  const windVar = (Math.random() - 0.5) * inst.windSpeed * 0.1;

  mat.harmonics.forEach((harmonic, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.frequency.setValueAtTime(baseFreq * harmonic * (1 + windVar), now);
    osc.detune.setValueAtTime((Math.random() - 0.5) * 10, now);
    osc.type = 'sine';

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2000 + inst.brightness * 8000, now);
    filter.Q.setValueAtTime(inst.resonance * 10, now);

    const vol = velocity * 0.15 / (i + 1);
    const decay = mat.decay * inst.decay;

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, now + decay);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + decay + 0.1);
  });
}

function _wc_playNote(midiNote, velocity, duration, material, params) {
  const ctx = _wc_getAudioContext();
  const now = ctx.currentTime;
  const mat = _wc_materials[material || 'aluminum'];

  const baseFreq = 440 * Math.pow(2, (midiNote - 69) / 12) * mat.baseFreq;
  const windVar = (Math.random() - 0.5) * (params?.windSpeed || 0.5) * 0.1;

  mat.harmonics.forEach((harmonic, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.frequency.setValueAtTime(baseFreq * harmonic * (1 + windVar), now);
    osc.detune.setValueAtTime((Math.random() - 0.5) * 10, now);
    osc.type = 'sine';

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2000 + (params?.brightness || 0.5) * 8000, now);
    filter.Q.setValueAtTime((params?.resonance || 0.8) * 10, now);

    const vol = velocity * 0.15 / (i + 1);
    const decay = mat.decay * (params?.decay || 2.5);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, now + decay);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + decay + 0.1);
  });
}

function _wc_open() {
  if (typeof hideStartMenu === 'function') hideStartMenu();

  _wc_state.counter++;
  const instId = 'wc-' + _wc_state.counter;
  const winId = Date.now();
  const channelName = 'Windchime Dad';

  const inst = {
    winId: winId,
    instId: instId,
    channelName: channelName,
    channelId: 'windchime-dad',
    material: 'aluminum',
    resonance: 0.8,
    decay: 2.5,
    brightness: 0.5,
    windSpeed: 0.5,
    tracks: [],
    currentTrack: -1,
    isPlaying: false,
    isPaused: false,
    midiData: null,
    playbackTimer: null,
    noteIndex: 0,
    startTime: 0,
    pauseTime: 0
  };

  _wc_state.instances[instId] = inst;

  // Register MIDI channel
  window._algoChannels = window._algoChannels || {};
  window._algoChannels['windchime-dad'] = {
    id: 'windchime-dad',
    name: channelName,
    type: 'midi',
    callback: (msg, sender) => _wc_handleMidiInput(instId, msg, sender),
    metadata: { instrument: 'windchime', instanceId: instId },
    appName: 'Windchime Dad',
    appIcon: '🎐',
    created: Date.now()
  };

  // Also register with ALGO.pubsub if available
  if (window.ALGO && ALGO.pubsub) {
    ALGO.pubsub.register('windchime-dad', { autoOpen: false });
    ALGO.pubsub.subscribe('windchime-dad', (msg, opts, from) => {
      _wc_handleMidiInput(instId, msg, { sender: from });
    });
  }

  const materialBtns = ['aluminum', 'brass', 'bamboo', 'glass', 'crystal'].map(m =>
    `<button onclick="window._wc_setMaterial('${instId}','${m}')" id="wc-mat-${m}-${winId}" class="win95-btn${m === 'aluminum' ? ' active' : ''}" style="font-size:10px;padding:4px 8px;">
      <span style="color:${_wc_materials[m].color};">●</span> ${m.charAt(0).toUpperCase() + m.slice(1)}
    </button>`
  ).join('');

  const createWin = (typeof ALGO !== 'undefined' && ALGO.createWindow) ? ALGO.createWindow : (typeof createWindow === 'function' ? createWindow : null);

  if (!createWin) {
    console.error('Windchime Dad: No window creation function available');
    return;
  }

  createWin({
    title: channelName,
    stateKey: 'Windchime Dad',
    icon: '🎐',
    width: 480, height: 540,
    content: `
      <style>
        .wc-track { transition: background 0.1s; }
        .wc-track:hover { background: #e0e0e0; }
        .wc-track.active { background: #000080; color: white; }
        .win95-btn { padding: 4px 8px; background: #c0c0c0; border: 2px outset #fff; cursor: pointer; font-size: 11px; }
        .win95-btn:active { border-style: inset; }
        .win95-btn.active { background: #000080; color: white; }
      </style>
      <div class="windchime-app" style="display:flex;flex-direction:column;height:100%;background:#c0c0c0;padding:4px;box-sizing:border-box;">
        <div style="background:#000080;color:#fff;padding:8px;border:2px inset #808080;margin-bottom:4px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:14px;font-weight:bold;">🎐 ${channelName}</span>
            <span id="wc-midi-indicator-${winId}" style="width:10px;height:10px;background:#004400;border-radius:50%;border:1px solid #002200;" title="MIDI Input"></span>
            <span style="font-size:10px;color:#aaa;margin-left:auto;">Channel: windchime-dad</span>
          </div>
          <div id="wc-track-${winId}" style="font-size:11px;margin-top:4px;">No track loaded</div>
          <div id="wc-time-${winId}" style="font-size:11px;font-family:monospace;">--:-- / --:--</div>
        </div>

        <div style="display:flex;gap:4px;margin-bottom:4px;">
          <button onclick="window._wc_prev('${instId}')" class="win95-btn" title="Previous">⏮</button>
          <button onclick="window._wc_play('${instId}')" id="wc-play-${winId}" class="win95-btn" title="Play" style="flex:1;">▶ Play</button>
          <button onclick="window._wc_pause('${instId}')" class="win95-btn" title="Pause">⏸</button>
          <button onclick="window._wc_stop('${instId}')" class="win95-btn" title="Stop">⏹</button>
          <button onclick="window._wc_next('${instId}')" class="win95-btn" title="Next">⏭</button>
        </div>

        <fieldset style="border:2px groove #fff;padding:6px;margin-bottom:4px;">
          <legend style="font-size:11px;">Chime Material</legend>
          <div style="display:flex;gap:4px;flex-wrap:wrap;">${materialBtns}</div>
        </fieldset>

        <fieldset style="border:2px groove #fff;padding:6px;margin-bottom:4px;">
          <legend style="font-size:11px;">Parameters</legend>
          <div style="display:grid;grid-template-columns:70px 1fr 40px;gap:4px;align-items:center;font-size:11px;">
            <label>Resonance:</label>
            <input type="range" id="wc-resonance-${winId}" min="0" max="100" value="80" oninput="window._wc_updateParam('${instId}','resonance',this.value)">
            <span id="wc-res-val-${winId}">80%</span>
            <label>Decay:</label>
            <input type="range" id="wc-decay-${winId}" min="10" max="100" value="50" oninput="window._wc_updateParam('${instId}','decay',this.value)">
            <span id="wc-dec-val-${winId}">2.5s</span>
            <label>Brightness:</label>
            <input type="range" id="wc-brightness-${winId}" min="0" max="100" value="50" oninput="window._wc_updateParam('${instId}','brightness',this.value)">
            <span id="wc-bri-val-${winId}">50%</span>
            <label>Wind Speed:</label>
            <input type="range" id="wc-wind-${winId}" min="0" max="100" value="50" oninput="window._wc_updateParam('${instId}','wind',this.value)">
            <span id="wc-win-val-${winId}">50%</span>
          </div>
        </fieldset>

        <div style="flex:1;display:flex;flex-direction:column;min-height:0;">
          <div style="font-size:11px;font-weight:bold;margin-bottom:2px;">📁 MIDI Files</div>
          <div id="wc-playlist-${winId}" style="flex:1;overflow-y:auto;background:#fff;border:2px inset #808080;font-size:11px;">
            <div style="padding:10px;color:#666;">Loading...</div>
          </div>
        </div>

        <canvas id="wc-viz-${winId}" width="460" height="60" style="background:#001830;border:2px inset #808080;margin-top:4px;"></canvas>
      </div>
    `,
    onClose: () => {
      _wc_stop(instId);
      const inst = _wc_state.instances[instId];
      if (inst) {
        if (window._algoChannels) {
          delete window._algoChannels['windchime-dad'];
        }
        if (window.ALGO && ALGO.pubsub && ALGO.pubsub.unregister) {
          ALGO.pubsub.unregister('windchime-dad');
        }
        delete _wc_state.instances[instId];
      }
    }
  });

  setTimeout(() => _wc_loadTracks(instId), 100);
  setTimeout(() => _wc_startViz(instId), 200);
}

function _wc_loadTracks(instId) {
  const inst = _wc_state.instances[instId];
  if (!inst) return;

  const midFiles = (typeof savedFiles !== 'undefined' ? savedFiles : (window.savedFiles || [])).filter(f => f.name.endsWith('.mid') || f.name.endsWith('.midi'));
  inst.tracks = midFiles;

  const playlist = document.getElementById('wc-playlist-' + inst.winId);
  if (!playlist) return;

  if (midFiles.length === 0) {
    playlist.innerHTML = '<div style="padding:10px;color:#666;text-align:center;">No .mid files found.<br><br><button onclick="window._wc_createSampleMidi(\'' + instId + '\')" class="win95-btn">Create Sample MIDI</button></div>';
    return;
  }

  playlist.innerHTML = midFiles.map((f, i) =>
    `<div class="wc-track${i === inst.currentTrack ? ' active' : ''}" onclick="window._wc_selectTrack('${instId}',${i})" style="padding:4px 8px;cursor:pointer;border-bottom:1px solid #ddd;">
      🎵 ${(typeof escapeHtml === 'function' ? escapeHtml(f.name) : f.name)}
    </div>`
  ).join('');
}

function _wc_createSampleMidi(instId) {
  const samples = [
    { name: 'morning-breeze.mid', notes: [60, 64, 67, 72, 67, 64, 60, 62, 65, 69, 72, 69, 65, 62] },
    { name: 'evening-calm.mid', notes: [48, 55, 60, 64, 67, 64, 60, 55, 52, 57, 60, 64, 60, 57] },
    { name: 'wind-dance.mid', notes: [72, 74, 76, 79, 81, 79, 76, 74, 72, 74, 76, 74, 72, 69, 67] }
  ];

  const files = window.savedFiles || (typeof savedFiles !== 'undefined' ? savedFiles : []);

  samples.forEach(sample => {
    const content = JSON.stringify({
      format: 'windchime-midi',
      name: sample.name.replace('.mid', ''),
      tempo: 120,
      notes: sample.notes.map((note, i) => ({
        time: i * 0.4,
        note: note,
        velocity: 64 + Math.floor(Math.random() * 32),
        duration: 0.3 + Math.random() * 0.2
      }))
    });

    files.push({ name: sample.name, content, type: 'midi', icon: '🎵' });
  });

  if (typeof saveState === 'function') saveState();
  if (typeof createDesktopIcons === 'function') createDesktopIcons();
  _wc_loadTracks(instId);

  const notify = (typeof algoSpeak === 'function') ? algoSpeak :
                 (typeof ALGO !== 'undefined' && ALGO.notify) ? ALGO.notify : console.log;
  notify('Created sample MIDI files!');
}

function _wc_selectTrack(instId, idx) {
  const inst = _wc_state.instances[instId];
  if (!inst) return;
  inst.currentTrack = idx;
  _wc_loadMidi(instId);
  _wc_loadTracks(instId);
}

function _wc_loadMidi(instId) {
  const inst = _wc_state.instances[instId];
  if (!inst || inst.currentTrack < 0 || inst.currentTrack >= inst.tracks.length) return;

  const track = inst.tracks[inst.currentTrack];
  const titleEl = document.getElementById('wc-track-' + inst.winId);
  if (titleEl) titleEl.textContent = track.name;

  try {
    inst.midiData = JSON.parse(track.content);
    inst.noteIndex = 0;
  } catch (e) {
    inst.midiData = { notes: [], tempo: 120 };
  }
}

function _wc_play(instId) {
  const inst = _wc_state.instances[instId];
  if (!inst || inst.tracks.length === 0) return;

  if (inst.currentTrack < 0) {
    inst.currentTrack = 0;
    _wc_loadMidi(instId);
    _wc_loadTracks(instId);
  }

  if (!inst.midiData || !inst.midiData.notes) {
    _wc_loadMidi(instId);
    if (!inst.midiData || !inst.midiData.notes) return;
  }

  if (inst.isPaused) {
    inst.isPaused = false;
    inst.startTime = performance.now() - inst.pauseTime;
  } else {
    inst.noteIndex = 0;
    inst.startTime = performance.now();
  }

  inst.isPlaying = true;
  _wc_playbackLoop(instId);

  const btn = document.getElementById('wc-play-' + inst.winId);
  if (btn) btn.textContent = '▶ Playing...';
}

function _wc_playbackLoop(instId) {
  const inst = _wc_state.instances[instId];
  if (!inst || !inst.isPlaying || inst.isPaused) return;

  const data = inst.midiData;
  if (!data || !data.notes) return;

  const elapsed = (performance.now() - inst.startTime) / 1000;
  const notes = data.notes;

  while (inst.noteIndex < notes.length && notes[inst.noteIndex].time <= elapsed) {
    const note = notes[inst.noteIndex];
    _wc_playNoteForInstance(instId, note.note, note.velocity / 127, note.duration || 0.3);
    inst.noteIndex++;
  }

  const total = notes.length > 0 ? notes[notes.length - 1].time + 1 : 0;
  const timeEl = document.getElementById('wc-time-' + inst.winId);
  if (timeEl) {
    const fmt = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
    timeEl.textContent = fmt(elapsed) + ' / ' + fmt(total);
  }

  if (inst.noteIndex >= notes.length) {
    setTimeout(() => { if (inst.isPlaying) { _wc_stop(instId); _wc_next(instId); } }, 2000);
    return;
  }

  inst.playbackTimer = requestAnimationFrame(() => _wc_playbackLoop(instId));
}

function _wc_pause(instId) {
  const inst = _wc_state.instances[instId];
  if (!inst || !inst.isPlaying || inst.isPaused) return;

  inst.isPaused = true;
  inst.pauseTime = performance.now() - inst.startTime;
  if (inst.playbackTimer) cancelAnimationFrame(inst.playbackTimer);
  const btn = document.getElementById('wc-play-' + inst.winId);
  if (btn) btn.textContent = '▶ Paused';
}

function _wc_stop(instId) {
  const inst = _wc_state.instances[instId];
  if (!inst) return;

  inst.isPlaying = false;
  inst.isPaused = false;
  inst.noteIndex = 0;
  if (inst.playbackTimer) cancelAnimationFrame(inst.playbackTimer);
  const btn = document.getElementById('wc-play-' + inst.winId);
  if (btn) btn.textContent = '▶ Play';
  const timeEl = document.getElementById('wc-time-' + inst.winId);
  if (timeEl) timeEl.textContent = '--:-- / --:--';
}

function _wc_prev(instId) {
  const inst = _wc_state.instances[instId];
  if (!inst) return;

  _wc_stop(instId);
  inst.currentTrack--;
  if (inst.currentTrack < 0) inst.currentTrack = inst.tracks.length - 1;
  _wc_loadMidi(instId);
  _wc_loadTracks(instId);
}

function _wc_next(instId) {
  const inst = _wc_state.instances[instId];
  if (!inst) return;

  _wc_stop(instId);
  inst.currentTrack++;
  if (inst.currentTrack >= inst.tracks.length) inst.currentTrack = 0;
  _wc_loadMidi(instId);
  _wc_loadTracks(instId);
  if (inst.tracks.length > 0) _wc_play(instId);
}

function _wc_setMaterial(instId, material) {
  const inst = _wc_state.instances[instId];
  if (!inst) return;

  inst.material = material;

  ['aluminum', 'brass', 'bamboo', 'glass', 'crystal'].forEach(m => {
    const btn = document.getElementById('wc-mat-' + m + '-' + inst.winId);
    if (btn) btn.classList.toggle('active', m === material);
  });
  _wc_playNoteForInstance(instId, 72, 0.8, 0.5);
}

function _wc_updateParam(instId, param, value) {
  const inst = _wc_state.instances[instId];
  if (!inst) return;

  value = parseInt(value);

  switch (param) {
    case 'resonance':
      inst.resonance = value / 100;
      document.getElementById('wc-res-val-' + inst.winId).textContent = value + '%';
      break;
    case 'decay':
      inst.decay = 0.5 + (value / 100) * 4.5;
      document.getElementById('wc-dec-val-' + inst.winId).textContent = inst.decay.toFixed(1) + 's';
      break;
    case 'brightness':
      inst.brightness = value / 100;
      document.getElementById('wc-bri-val-' + inst.winId).textContent = value + '%';
      break;
    case 'wind':
      inst.windSpeed = value / 100;
      document.getElementById('wc-win-val-' + inst.winId).textContent = value + '%';
      break;
  }
}

function _wc_startViz(instId) {
  const inst = _wc_state.instances[instId];
  if (!inst) return;

  const canvas = document.getElementById('wc-viz-' + inst.winId);
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const width = canvas.width, height = canvas.height;

  function draw() {
    if (!document.getElementById('wc-viz-' + inst.winId)) return;
    if (!_wc_state.instances[instId]) return;

    ctx.fillStyle = '#001830';
    ctx.fillRect(0, 0, width, height);

    const mat = _wc_materials[inst.material];
    const tubeCount = 8;
    const tubeWidth = (width - 40) / tubeCount;

    for (let i = 0; i < tubeCount; i++) {
      const x = 20 + i * tubeWidth + tubeWidth / 2;
      const tubeHeight = 20 + (i % 4) * 8;

      let swing = 0;
      if (inst.isPlaying && !inst.isPaused) {
        swing = Math.sin(performance.now() / 200 + i * 0.5) * inst.windSpeed * 10;
      }

      ctx.strokeStyle = mat.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, 5);
      ctx.lineTo(x + swing, 5 + tubeHeight);
      ctx.stroke();

      ctx.fillStyle = mat.color;
      ctx.beginPath();
      ctx.arc(x + swing, 5 + tubeHeight + 4, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#654321';
    ctx.fillRect(10, 0, width - 20, 6);

    requestAnimationFrame(draw);
  }

  draw();
}

// Expose globals
window._wc_open = _wc_open;
window._wc_play = _wc_play;
window._wc_pause = _wc_pause;
window._wc_stop = _wc_stop;
window._wc_prev = _wc_prev;
window._wc_next = _wc_next;
window._wc_setMaterial = _wc_setMaterial;
window._wc_updateParam = _wc_updateParam;
window._wc_selectTrack = _wc_selectTrack;
window._wc_loadTracks = _wc_loadTracks;
window._wc_createSampleMidi = _wc_createSampleMidi;

_wc_open();
