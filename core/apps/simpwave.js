// System App: Simpwave - Simple Waveform Synthesizer
ALGO.app.name = 'Simpwave';
ALGO.app.icon = '🌊';
ALGO.app.category = 'media';

const _sw_state = {
  instances: {},
  counter: 0
};

let _swAudioCtx = null;
function _sw_getAudioContext() {
  if (!_swAudioCtx) {
    _swAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (_swAudioCtx.state === 'suspended') {
    _swAudioCtx.resume();
  }
  return _swAudioCtx;
}

const _sw_waveforms = ['sine', 'triangle', 'sawtooth', 'square'];
const _sw_waveIcons = { sine: '〜', triangle: '△', sawtooth: '⩘', square: '⊓' };

function _sw_handleMidiInput(instId, message, senderInfo) {
  const inst = _sw_state.instances[instId];
  if (!inst) return;

  const indicator = document.getElementById('sw-midi-indicator-' + inst.winId);
  if (indicator) {
    indicator.style.background = '#00ff00';
    setTimeout(() => { if (indicator) indicator.style.background = '#004400'; }, 100);
  }

  if (message.type === 'noteOn' || message.type === 'note') {
    _sw_playNoteForInstance(instId, message.note, message.velocity / 127, message.duration || 0.4);
  }
}

function _sw_playNoteForInstance(instId, midiNote, velocity, duration) {
  const inst = _sw_state.instances[instId];
  if (!inst) return;

  const ctx = _sw_getAudioContext();
  const now = ctx.currentTime;

  const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
  const detune = (Math.random() - 0.5) * inst.detune * 2;

  // Main oscillator
  const osc = ctx.createOscillator();
  osc.type = inst.waveform;
  osc.frequency.setValueAtTime(freq, now);
  osc.detune.setValueAtTime(detune, now);

  // Filter
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(inst.filterFreq, now);
  filter.Q.setValueAtTime(inst.filterQ, now);

  // Envelope
  const gain = ctx.createGain();
  const vol = velocity * inst.volume * 0.3;

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(vol, now + inst.attack);
  gain.gain.linearRampToValueAtTime(vol * inst.sustain, now + inst.attack + inst.decay);
  gain.gain.setValueAtTime(vol * inst.sustain, now + duration - inst.release);
  gain.gain.linearRampToValueAtTime(0.001, now + duration);

  // Sub oscillator (one octave down)
  if (inst.subLevel > 0) {
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(freq / 2, now);
    subGain.gain.setValueAtTime(0, now);
    subGain.gain.linearRampToValueAtTime(vol * inst.subLevel, now + inst.attack);
    subGain.gain.linearRampToValueAtTime(vol * inst.subLevel * inst.sustain, now + inst.attack + inst.decay);
    subGain.gain.linearRampToValueAtTime(0.001, now + duration);
    subOsc.connect(subGain);
    subGain.connect(ctx.destination);
    subOsc.start(now);
    subOsc.stop(now + duration + 0.1);
  }

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + duration + 0.1);
}

function _sw_open() {
  if (typeof hideStartMenu === 'function') hideStartMenu();

  _sw_state.counter++;
  const instId = 'sw-' + _sw_state.counter;
  const winId = Date.now();
  const channelName = 'Simpwave';

  const inst = {
    winId: winId,
    instId: instId,
    channelName: channelName,
    channelId: 'simpwave',
    waveform: 'sawtooth',
    volume: 0.7,
    attack: 0.01,
    decay: 0.1,
    sustain: 0.7,
    release: 0.2,
    filterFreq: 2000,
    filterQ: 1,
    detune: 5,
    subLevel: 0.3,
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

  _sw_state.instances[instId] = inst;

  // Register MIDI channel
  window._algoChannels = window._algoChannels || {};
  window._algoChannels['simpwave'] = {
    id: 'simpwave',
    name: channelName,
    type: 'midi',
    callback: (msg, sender) => _sw_handleMidiInput(instId, msg, sender),
    metadata: { instrument: 'simpwave', instanceId: instId },
    appName: 'Simpwave',
    appIcon: '🌊',
    created: Date.now()
  };

  // Also register with ALGO.pubsub if available
  if (window.ALGO && ALGO.pubsub) {
    ALGO.pubsub.register('simpwave', { autoOpen: false });
    ALGO.pubsub.subscribe('simpwave', (msg, opts, from) => {
      _sw_handleMidiInput(instId, msg, { sender: from });
    });
  }

  const waveformBtns = _sw_waveforms.map(w =>
    `<button onclick="window._sw_setWaveform('${instId}','${w}')" id="sw-wave-${w}-${winId}" class="win95-btn${w === 'sawtooth' ? ' active' : ''}" style="font-size:12px;padding:4px 10px;">
      ${_sw_waveIcons[w]}
    </button>`
  ).join('');

  const createWin = (typeof ALGO !== 'undefined' && ALGO.createWindow) ? ALGO.createWindow : (typeof createWindow === 'function' ? createWindow : null);

  if (!createWin) {
    console.error('Simpwave: No window creation function available');
    return;
  }

  createWin({
    title: channelName,
    stateKey: 'Simpwave',
    icon: '🌊',
    width: 420, height: 480,
    content: `
      <style>
        .sw-track { transition: background 0.1s; }
        .sw-track:hover { background: #e0e0e0; }
        .sw-track.active { background: #000080; color: white; }
        .win95-btn { padding: 4px 8px; background: #c0c0c0; border: 2px outset #fff; cursor: pointer; font-size: 11px; }
        .win95-btn:active { border-style: inset; }
        .win95-btn.active { background: #000080; color: white; }
      </style>
      <div class="simpwave-app" style="display:flex;flex-direction:column;height:100%;background:#c0c0c0;padding:4px;box-sizing:border-box;">
        <div style="background:#000080;color:#fff;padding:8px;border:2px inset #808080;margin-bottom:4px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:14px;font-weight:bold;">🌊 ${channelName}</span>
            <span id="sw-midi-indicator-${winId}" style="width:10px;height:10px;background:#004400;border-radius:50%;border:1px solid #002200;" title="MIDI Input"></span>
            <span style="font-size:10px;color:#aaa;margin-left:auto;">Channel: simpwave</span>
          </div>
          <div id="sw-track-${winId}" style="font-size:11px;margin-top:4px;">No track loaded</div>
          <div id="sw-time-${winId}" style="font-size:11px;font-family:monospace;">--:-- / --:--</div>
        </div>

        <div style="display:flex;gap:4px;margin-bottom:4px;">
          <button onclick="window._sw_prev('${instId}')" class="win95-btn" title="Previous">⏮</button>
          <button onclick="window._sw_play('${instId}')" id="sw-play-${winId}" class="win95-btn" title="Play" style="flex:1;">▶ Play</button>
          <button onclick="window._sw_pause('${instId}')" class="win95-btn" title="Pause">⏸</button>
          <button onclick="window._sw_stop('${instId}')" class="win95-btn" title="Stop">⏹</button>
          <button onclick="window._sw_next('${instId}')" class="win95-btn" title="Next">⏭</button>
        </div>

        <fieldset style="border:2px groove #fff;padding:6px;margin-bottom:4px;">
          <legend style="font-size:11px;">Waveform</legend>
          <div style="display:flex;gap:4px;justify-content:center;">${waveformBtns}</div>
        </fieldset>

        <fieldset style="border:2px groove #fff;padding:6px;margin-bottom:4px;">
          <legend style="font-size:11px;">Envelope</legend>
          <div style="display:grid;grid-template-columns:60px 1fr 35px;gap:4px;align-items:center;font-size:11px;">
            <label>Attack:</label>
            <input type="range" id="sw-attack-${winId}" min="1" max="100" value="1" oninput="window._sw_updateParam('${instId}','attack',this.value)">
            <span id="sw-att-val-${winId}">10ms</span>
            <label>Decay:</label>
            <input type="range" id="sw-decay-${winId}" min="1" max="100" value="10" oninput="window._sw_updateParam('${instId}','decay',this.value)">
            <span id="sw-dec-val-${winId}">100ms</span>
            <label>Sustain:</label>
            <input type="range" id="sw-sustain-${winId}" min="0" max="100" value="70" oninput="window._sw_updateParam('${instId}','sustain',this.value)">
            <span id="sw-sus-val-${winId}">70%</span>
            <label>Release:</label>
            <input type="range" id="sw-release-${winId}" min="1" max="100" value="20" oninput="window._sw_updateParam('${instId}','release',this.value)">
            <span id="sw-rel-val-${winId}">200ms</span>
          </div>
        </fieldset>

        <fieldset style="border:2px groove #fff;padding:6px;margin-bottom:4px;">
          <legend style="font-size:11px;">Filter & Mix</legend>
          <div style="display:grid;grid-template-columns:60px 1fr 45px;gap:4px;align-items:center;font-size:11px;">
            <label>Cutoff:</label>
            <input type="range" id="sw-filter-${winId}" min="100" max="8000" value="2000" oninput="window._sw_updateParam('${instId}','filter',this.value)">
            <span id="sw-flt-val-${winId}">2kHz</span>
            <label>Resonance:</label>
            <input type="range" id="sw-reso-${winId}" min="0" max="20" value="1" oninput="window._sw_updateParam('${instId}','reso',this.value)">
            <span id="sw-res-val-${winId}">1</span>
            <label>Sub:</label>
            <input type="range" id="sw-sub-${winId}" min="0" max="100" value="30" oninput="window._sw_updateParam('${instId}','sub',this.value)">
            <span id="sw-sub-val-${winId}">30%</span>
            <label>Detune:</label>
            <input type="range" id="sw-detune-${winId}" min="0" max="50" value="5" oninput="window._sw_updateParam('${instId}','detune',this.value)">
            <span id="sw-det-val-${winId}">5ct</span>
          </div>
        </fieldset>

        <div style="flex:1;display:flex;flex-direction:column;min-height:0;">
          <div style="font-size:11px;font-weight:bold;margin-bottom:2px;">📁 MIDI Files</div>
          <div id="sw-playlist-${winId}" style="flex:1;overflow-y:auto;background:#fff;border:2px inset #808080;font-size:11px;">
            <div style="padding:10px;color:#666;">Loading...</div>
          </div>
        </div>

        <canvas id="sw-viz-${winId}" width="400" height="50" style="background:#001830;border:2px inset #808080;margin-top:4px;"></canvas>
      </div>
    `,
    onClose: () => {
      _sw_stop(instId);
      const inst = _sw_state.instances[instId];
      if (inst) {
        if (window._algoChannels) {
          delete window._algoChannels['simpwave'];
        }
        if (window.ALGO && ALGO.pubsub && ALGO.pubsub.unregister) {
          ALGO.pubsub.unregister('simpwave');
        }
        delete _sw_state.instances[instId];
      }
    }
  });

  setTimeout(() => _sw_loadTracks(instId), 100);
  setTimeout(() => _sw_startViz(instId), 200);
}

function _sw_loadTracks(instId) {
  const inst = _sw_state.instances[instId];
  if (!inst) return;

  const midFiles = (typeof savedFiles !== 'undefined' ? savedFiles : (window.savedFiles || [])).filter(f => f.name.endsWith('.mid') || f.name.endsWith('.midi'));
  inst.tracks = midFiles;

  const playlist = document.getElementById('sw-playlist-' + inst.winId);
  if (!playlist) return;

  if (midFiles.length === 0) {
    playlist.innerHTML = '<div style="padding:10px;color:#666;text-align:center;">No .mid files found.<br><br><button onclick="window._sw_createSampleMidi(\'' + instId + '\')" class="win95-btn">Create Sample MIDI</button></div>';
    return;
  }

  playlist.innerHTML = midFiles.map((f, i) =>
    `<div class="sw-track${i === inst.currentTrack ? ' active' : ''}" onclick="window._sw_selectTrack('${instId}',${i})" style="padding:4px 8px;cursor:pointer;border-bottom:1px solid #ddd;">
      🎵 ${(typeof escapeHtml === 'function' ? escapeHtml(f.name) : f.name)}
    </div>`
  ).join('');
}

function _sw_createSampleMidi(instId) {
  const samples = [
    { name: 'bass-line.mid', notes: [36, 36, 38, 36, 41, 40, 38, 36, 36, 38, 36, 43, 41, 38, 36, 36] },
    { name: 'lead-melody.mid', notes: [60, 62, 64, 65, 67, 65, 64, 62, 60, 64, 67, 72, 67, 64, 60, 60] },
    { name: 'arpeggio.mid', notes: [48, 52, 55, 60, 55, 52, 48, 52, 55, 60, 64, 60, 55, 52, 48, 52] }
  ];

  const files = window.savedFiles || (typeof savedFiles !== 'undefined' ? savedFiles : []);

  samples.forEach(sample => {
    const content = JSON.stringify({
      format: 'simpwave-midi',
      name: sample.name.replace('.mid', ''),
      tempo: 120,
      notes: sample.notes.map((note, i) => ({
        time: i * 0.25,
        note: note,
        velocity: 80 + Math.floor(Math.random() * 40),
        duration: 0.2 + Math.random() * 0.1
      }))
    });

    files.push({ name: sample.name, content, type: 'midi', icon: '🎵' });
  });

  if (typeof saveState === 'function') saveState();
  if (typeof createDesktopIcons === 'function') createDesktopIcons();
  _sw_loadTracks(instId);

  const notify = (typeof algoSpeak === 'function') ? algoSpeak :
                 (typeof ALGO !== 'undefined' && ALGO.notify) ? ALGO.notify : console.log;
  notify('Created sample MIDI files!');
}

function _sw_selectTrack(instId, idx) {
  const inst = _sw_state.instances[instId];
  if (!inst) return;
  inst.currentTrack = idx;
  _sw_loadMidi(instId);
  _sw_loadTracks(instId);
}

function _sw_loadMidi(instId) {
  const inst = _sw_state.instances[instId];
  if (!inst || inst.currentTrack < 0 || inst.currentTrack >= inst.tracks.length) return;

  const track = inst.tracks[inst.currentTrack];
  const titleEl = document.getElementById('sw-track-' + inst.winId);
  if (titleEl) titleEl.textContent = track.name;

  try {
    inst.midiData = JSON.parse(track.content);
    inst.noteIndex = 0;
  } catch (e) {
    inst.midiData = { notes: [], tempo: 120 };
  }
}

function _sw_play(instId) {
  const inst = _sw_state.instances[instId];
  if (!inst || inst.tracks.length === 0) return;

  if (inst.currentTrack < 0) {
    inst.currentTrack = 0;
    _sw_loadMidi(instId);
    _sw_loadTracks(instId);
  }

  if (!inst.midiData || !inst.midiData.notes) {
    _sw_loadMidi(instId);
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
  _sw_playbackLoop(instId);

  const btn = document.getElementById('sw-play-' + inst.winId);
  if (btn) btn.textContent = '▶ Playing...';
}

function _sw_playbackLoop(instId) {
  const inst = _sw_state.instances[instId];
  if (!inst || !inst.isPlaying || inst.isPaused) return;

  const data = inst.midiData;
  if (!data || !data.notes) return;

  const elapsed = (performance.now() - inst.startTime) / 1000;
  const notes = data.notes;

  while (inst.noteIndex < notes.length && notes[inst.noteIndex].time <= elapsed) {
    const note = notes[inst.noteIndex];
    _sw_playNoteForInstance(instId, note.note, note.velocity / 127, note.duration || 0.3);
    inst.noteIndex++;
  }

  const total = notes.length > 0 ? notes[notes.length - 1].time + 1 : 0;
  const timeEl = document.getElementById('sw-time-' + inst.winId);
  if (timeEl) {
    const fmt = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
    timeEl.textContent = fmt(elapsed) + ' / ' + fmt(total);
  }

  if (inst.noteIndex >= notes.length) {
    setTimeout(() => { if (inst.isPlaying) { _sw_stop(instId); _sw_next(instId); } }, 2000);
    return;
  }

  inst.playbackTimer = requestAnimationFrame(() => _sw_playbackLoop(instId));
}

function _sw_pause(instId) {
  const inst = _sw_state.instances[instId];
  if (!inst || !inst.isPlaying || inst.isPaused) return;

  inst.isPaused = true;
  inst.pauseTime = performance.now() - inst.startTime;
  if (inst.playbackTimer) cancelAnimationFrame(inst.playbackTimer);
  const btn = document.getElementById('sw-play-' + inst.winId);
  if (btn) btn.textContent = '▶ Paused';
}

function _sw_stop(instId) {
  const inst = _sw_state.instances[instId];
  if (!inst) return;

  inst.isPlaying = false;
  inst.isPaused = false;
  inst.noteIndex = 0;
  if (inst.playbackTimer) cancelAnimationFrame(inst.playbackTimer);
  const btn = document.getElementById('sw-play-' + inst.winId);
  if (btn) btn.textContent = '▶ Play';
  const timeEl = document.getElementById('sw-time-' + inst.winId);
  if (timeEl) timeEl.textContent = '--:-- / --:--';
}

function _sw_prev(instId) {
  const inst = _sw_state.instances[instId];
  if (!inst) return;

  _sw_stop(instId);
  inst.currentTrack--;
  if (inst.currentTrack < 0) inst.currentTrack = inst.tracks.length - 1;
  _sw_loadMidi(instId);
  _sw_loadTracks(instId);
}

function _sw_next(instId) {
  const inst = _sw_state.instances[instId];
  if (!inst) return;

  _sw_stop(instId);
  inst.currentTrack++;
  if (inst.currentTrack >= inst.tracks.length) inst.currentTrack = 0;
  _sw_loadMidi(instId);
  _sw_loadTracks(instId);
  if (inst.tracks.length > 0) _sw_play(instId);
}

function _sw_setWaveform(instId, waveform) {
  const inst = _sw_state.instances[instId];
  if (!inst) return;

  inst.waveform = waveform;

  _sw_waveforms.forEach(w => {
    const btn = document.getElementById('sw-wave-' + w + '-' + inst.winId);
    if (btn) btn.classList.toggle('active', w === waveform);
  });

  // Play test note
  _sw_playNoteForInstance(instId, 60, 0.8, 0.3);
}

function _sw_updateParam(instId, param, value) {
  const inst = _sw_state.instances[instId];
  if (!inst) return;

  value = parseFloat(value);

  switch (param) {
    case 'attack':
      inst.attack = value / 100;
      document.getElementById('sw-att-val-' + inst.winId).textContent = Math.round(inst.attack * 1000) + 'ms';
      break;
    case 'decay':
      inst.decay = value / 100;
      document.getElementById('sw-dec-val-' + inst.winId).textContent = Math.round(inst.decay * 1000) + 'ms';
      break;
    case 'sustain':
      inst.sustain = value / 100;
      document.getElementById('sw-sus-val-' + inst.winId).textContent = Math.round(value) + '%';
      break;
    case 'release':
      inst.release = value / 100;
      document.getElementById('sw-rel-val-' + inst.winId).textContent = Math.round(inst.release * 1000) + 'ms';
      break;
    case 'filter':
      inst.filterFreq = value;
      document.getElementById('sw-flt-val-' + inst.winId).textContent = value >= 1000 ? (value / 1000).toFixed(1) + 'kHz' : value + 'Hz';
      break;
    case 'reso':
      inst.filterQ = value;
      document.getElementById('sw-res-val-' + inst.winId).textContent = value;
      break;
    case 'sub':
      inst.subLevel = value / 100;
      document.getElementById('sw-sub-val-' + inst.winId).textContent = Math.round(value) + '%';
      break;
    case 'detune':
      inst.detune = value;
      document.getElementById('sw-det-val-' + inst.winId).textContent = value + 'ct';
      break;
  }
}

function _sw_startViz(instId) {
  const inst = _sw_state.instances[instId];
  if (!inst) return;

  const canvas = document.getElementById('sw-viz-' + inst.winId);
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const width = canvas.width, height = canvas.height;

  function draw() {
    if (!document.getElementById('sw-viz-' + inst.winId)) return;
    if (!_sw_state.instances[instId]) return;

    ctx.fillStyle = '#001830';
    ctx.fillRect(0, 0, width, height);

    // Draw waveform visualization
    const centerY = height / 2;
    const amplitude = (height / 2) - 5;
    const waveform = inst.waveform;

    ctx.strokeStyle = '#00aaff';
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let x = 0; x < width; x++) {
      const t = (x / width) * 4 * Math.PI + (inst.isPlaying ? performance.now() / 200 : 0);
      let y;

      switch (waveform) {
        case 'sine':
          y = Math.sin(t);
          break;
        case 'triangle':
          y = Math.abs((t % (2 * Math.PI)) / Math.PI - 1) * 2 - 1;
          break;
        case 'sawtooth':
          y = ((t % (2 * Math.PI)) / Math.PI) - 1;
          break;
        case 'square':
          y = Math.sin(t) > 0 ? 1 : -1;
          break;
        default:
          y = Math.sin(t);
      }

      const yPos = centerY - y * amplitude * (inst.isPlaying ? 0.8 : 0.5);
      if (x === 0) ctx.moveTo(x, yPos);
      else ctx.lineTo(x, yPos);
    }

    ctx.stroke();

    // Filter visualization
    const filterX = (inst.filterFreq / 8000) * width;
    ctx.strokeStyle = 'rgba(255, 100, 100, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(filterX, 0);
    ctx.lineTo(filterX, height);
    ctx.stroke();

    requestAnimationFrame(draw);
  }

  draw();
}

// Expose globals
window._sw_open = _sw_open;
window._sw_play = _sw_play;
window._sw_pause = _sw_pause;
window._sw_stop = _sw_stop;
window._sw_prev = _sw_prev;
window._sw_next = _sw_next;
window._sw_setWaveform = _sw_setWaveform;
window._sw_updateParam = _sw_updateParam;
window._sw_selectTrack = _sw_selectTrack;
window._sw_loadTracks = _sw_loadTracks;
window._sw_createSampleMidi = _sw_createSampleMidi;

_sw_open();
