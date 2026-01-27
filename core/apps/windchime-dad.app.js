// WINDCHIME DAD - MIDI Wind Chime Synthesizer
// Self-contained ALGO OS App
// Save as windchime-dad.app.js on ALGO OS desktop to auto-load

(function() {
  'use strict';

  // App state
  const windchimeInstances = {};
  let windchimeInstanceCounter = 0;

  const windchimeState = {
    winId: null,
    tracks: [],
    currentTrack: -1,
    isPlaying: false,
    isPaused: false,
    midiData: null,
    playbackTimer: null,
    noteIndex: 0,
    startTime: 0,
    pauseTime: 0,
    channelId: null,
    material: 'aluminum',
    tubeCount: 8,
    resonance: 0.8,
    decay: 2.5,
    brightness: 0.5,
    windSpeed: 0.5,
    materials: {
      aluminum: { baseFreq: 1.0, harmonics: [1, 2.76, 5.4, 8.93], decay: 2.5, brightness: 0.6, color: '#C0C0C0' },
      brass: { baseFreq: 0.85, harmonics: [1, 2.0, 3.0, 4.0], decay: 3.5, brightness: 0.4, color: '#D4AF37' },
      bamboo: { baseFreq: 1.2, harmonics: [1, 2.5, 4.2], decay: 1.5, brightness: 0.3, color: '#8B7355' },
      glass: { baseFreq: 1.4, harmonics: [1, 3.0, 6.0, 10.0], decay: 4.0, brightness: 0.8, color: '#87CEEB' },
      crystal: { baseFreq: 1.3, harmonics: [1, 2.5, 4.5, 7.5, 11.0], decay: 5.0, brightness: 0.9, color: '#E8E8E8' }
    }
  };

  // CSS for the app
  const css = `
.wc-track { transition: background 0.1s; }
.wc-track:hover { background: #e0e0e0; }
.wc-track.active { background: #000080; color: white; }
`;

  // Handle incoming MIDI messages
  function wcHandleMidiInput(instId, message, senderInfo) {
    const inst = windchimeInstances[instId];
    if (!inst) return;

    const indicator = document.getElementById('wc-midi-indicator-' + inst.winId);
    if (indicator) {
      indicator.style.background = '#00ff00';
      setTimeout(() => { if (indicator) indicator.style.background = '#004400'; }, 100);
    }

    if (message.type === 'noteOn' || message.type === 'note') {
      wcPlayNoteForInstance(instId, message.note, message.velocity / 127, message.duration || 0.3);
    }
  }

  function wcPlayNoteForInstance(instId, midiNote, velocity, duration) {
    const inst = windchimeInstances[instId];
    if (!inst) return;

    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const mat = windchimeState.materials[inst.material];

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

  function openWindchimeDad() {
    if (typeof hideStartMenu === 'function') hideStartMenu();
    const id = window.winId || Date.now();
    windchimeState.winId = id;

    windchimeInstanceCounter++;
    const instId = 'wc-' + windchimeInstanceCounter;
    const channelName = 'Windchime Dad #' + windchimeInstanceCounter;

    windchimeInstances[instId] = {
      winId: id,
      instId: instId,
      channelName: channelName,
      channelId: null,
      material: 'aluminum',
      resonance: 0.8,
      decay: 2.5,
      brightness: 0.5,
      windSpeed: 0.5
    };

    // Register MIDI channel
    window._algoChannels = window._algoChannels || {};
    const channelId = 'ch-wc-' + instId + '-' + Date.now();
    window._algoChannels[channelId] = {
      id: channelId,
      name: channelName,
      type: 'midi',
      callback: (msg, sender) => wcHandleMidiInput(instId, msg, sender),
      metadata: { instrument: 'windchime', instanceId: instId },
      appName: 'Windchime Dad',
      appIcon: '⛲',
      created: Date.now()
    };
    windchimeInstances[instId].channelId = channelId;

    const materialBtns = ['aluminum', 'brass', 'bamboo', 'glass', 'crystal'].map(m =>
      `<button onclick="window.wcSetMaterial(${id},'${m}')" id="wc-mat-${m}-${id}" class="win95-btn${m === 'aluminum' ? ' active' : ''}" style="font-size:10px;padding:4px 8px;">
        <span style="color:${windchimeState.materials[m].color};">●</span> ${m.charAt(0).toUpperCase() + m.slice(1)}
      </button>`
    ).join('');

    createWindow({
      title: channelName,
      stateKey: 'Windchime Dad',
      icon: '⛲',
      width: 480, height: 540,
      content: `
        <div class="windchime-app" style="display:flex;flex-direction:column;height:100%;background:#c0c0c0;padding:4px;box-sizing:border-box;">
          <div style="background:#000080;color:#fff;padding:8px;border:2px inset #808080;margin-bottom:4px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:14px;font-weight:bold;">⛲ ${channelName}</span>
              <span id="wc-midi-indicator-${id}" style="width:10px;height:10px;background:#004400;border-radius:50%;border:1px solid #002200;" title="MIDI Input"></span>
            </div>
            <div id="wc-track-${id}" style="font-size:11px;margin-top:4px;">No track loaded</div>
            <div id="wc-time-${id}" style="font-size:11px;font-family:monospace;">--:-- / --:--</div>
          </div>

          <div style="display:flex;gap:4px;margin-bottom:4px;">
            <button onclick="window.wcPrev(${id})" class="win95-btn" title="Previous">⏮</button>
            <button onclick="window.wcPlay(${id})" id="wc-play-${id}" class="win95-btn" title="Play" style="flex:1;">▶ Play</button>
            <button onclick="window.wcPause(${id})" class="win95-btn" title="Pause">⏸</button>
            <button onclick="window.wcStop(${id})" class="win95-btn" title="Stop">⏹</button>
            <button onclick="window.wcNext(${id})" class="win95-btn" title="Next">⏭</button>
          </div>

          <fieldset style="border:2px groove #fff;padding:6px;margin-bottom:4px;">
            <legend style="font-size:11px;">Chime Material</legend>
            <div style="display:flex;gap:4px;flex-wrap:wrap;">${materialBtns}</div>
          </fieldset>

          <fieldset style="border:2px groove #fff;padding:6px;margin-bottom:4px;">
            <legend style="font-size:11px;">Parameters</legend>
            <div style="display:grid;grid-template-columns:70px 1fr 40px;gap:4px;align-items:center;font-size:11px;">
              <label>Resonance:</label>
              <input type="range" id="wc-resonance-${id}" min="0" max="100" value="80" oninput="window.wcUpdateParam(${id},'resonance',this.value)">
              <span id="wc-res-val-${id}">80%</span>
              <label>Decay:</label>
              <input type="range" id="wc-decay-${id}" min="10" max="100" value="50" oninput="window.wcUpdateParam(${id},'decay',this.value)">
              <span id="wc-dec-val-${id}">2.5s</span>
              <label>Brightness:</label>
              <input type="range" id="wc-brightness-${id}" min="0" max="100" value="50" oninput="window.wcUpdateParam(${id},'brightness',this.value)">
              <span id="wc-bri-val-${id}">50%</span>
              <label>Wind Speed:</label>
              <input type="range" id="wc-wind-${id}" min="0" max="100" value="50" oninput="window.wcUpdateParam(${id},'wind',this.value)">
              <span id="wc-win-val-${id}">50%</span>
            </div>
          </fieldset>

          <fieldset style="border:2px groove #fff;padding:6px;margin-bottom:4px;">
            <legend style="font-size:11px;">Export</legend>
            <div style="display:flex;gap:4px;align-items:center;">
              <select id="wc-format-${id}" class="win95-select" style="flex:1;">
                <option value="wav">WAV (Uncompressed)</option>
              </select>
              <button onclick="window.wcExport(${id})" class="win95-btn" style="padding:4px 12px;">💾 Export</button>
            </div>
            <div id="wc-export-status-${id}" style="font-size:10px;margin-top:4px;color:#008000;"></div>
          </fieldset>

          <div style="flex:1;display:flex;flex-direction:column;min-height:0;">
            <div style="font-size:11px;font-weight:bold;margin-bottom:2px;">📁 MIDI Files</div>
            <div id="wc-playlist-${id}" style="flex:1;overflow-y:auto;background:#fff;border:2px inset #808080;font-size:11px;">
              <div style="padding:10px;color:#666;">Loading...</div>
            </div>
          </div>

          <canvas id="wc-viz-${id}" width="460" height="60" style="background:#001830;border:2px inset #808080;margin-top:4px;"></canvas>
        </div>
      `,
      onClose: () => {
        wcStop(id);
        windchimeState.winId = null;
        const inst = Object.values(windchimeInstances).find(i => i.winId === id);
        if (inst) {
          if (inst.channelId && window._algoChannels) {
            delete window._algoChannels[inst.channelId];
          }
          delete windchimeInstances[inst.instId];
        }
      }
    });

    setTimeout(() => wcLoadTracks(id), 100);
    setTimeout(() => wcStartViz(id), 200);
  }

  function wcLoadTracks(winId) {
    const midFiles = (typeof savedFiles !== 'undefined' ? savedFiles : []).filter(f => f.name.endsWith('.mid') || f.name.endsWith('.midi'));
    windchimeState.tracks = midFiles;

    const playlist = document.getElementById('wc-playlist-' + winId);
    if (!playlist) return;

    if (midFiles.length === 0) {
      playlist.innerHTML = '<div style="padding:10px;color:#666;text-align:center;">No .mid files found.<br><br><button onclick="window.wcCreateSampleMidi(' + winId + ')" class="win95-btn">Create Sample MIDI</button></div>';
      return;
    }

    playlist.innerHTML = midFiles.map((f, i) =>
      `<div class="wc-track${i === windchimeState.currentTrack ? ' active' : ''}" onclick="window.wcSelectTrack(${i},${winId})" style="padding:4px 8px;cursor:pointer;border-bottom:1px solid #ddd;">
        🎵 ${(typeof escapeHtml === 'function' ? escapeHtml(f.name) : f.name)}
      </div>`
    ).join('');
  }

  function wcCreateSampleMidi(winId) {
    const samples = [
      { name: 'morning-breeze.mid', notes: [60, 64, 67, 72, 67, 64, 60, 62, 65, 69, 72, 69, 65, 62] },
      { name: 'evening-calm.mid', notes: [48, 55, 60, 64, 67, 64, 60, 55, 52, 57, 60, 64, 60, 57] },
      { name: 'wind-dance.mid', notes: [72, 74, 76, 79, 81, 79, 76, 74, 72, 74, 76, 74, 72, 69, 67] }
    ];

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

      (window.savedFiles || savedFiles).push({ name: sample.name, content, type: 'midi', icon: '🎵' });
    });

    if (typeof saveState === 'function') saveState();
    if (typeof createDesktopIcons === 'function') createDesktopIcons();
    wcLoadTracks(winId);
    if (typeof algoSpeak === 'function') algoSpeak('Created sample MIDI files!');
  }

  function wcSelectTrack(idx, winId) {
    windchimeState.currentTrack = idx;
    wcLoadMidi(winId);
    wcLoadTracks(winId);
  }

  function wcLoadMidi(winId) {
    if (windchimeState.currentTrack < 0 || windchimeState.currentTrack >= windchimeState.tracks.length) return;

    const track = windchimeState.tracks[windchimeState.currentTrack];
    const titleEl = document.getElementById('wc-track-' + winId);
    if (titleEl) titleEl.textContent = track.name;

    try {
      windchimeState.midiData = JSON.parse(track.content);
      windchimeState.noteIndex = 0;
    } catch (e) {
      windchimeState.midiData = { notes: [], tempo: 120 };
    }
  }

  function wcPlay(winId) {
    if (windchimeState.tracks.length === 0) return;
    if (windchimeState.currentTrack < 0) {
      windchimeState.currentTrack = 0;
      wcLoadMidi(winId);
      wcLoadTracks(winId);
    }

    if (!windchimeState.midiData || !windchimeState.midiData.notes) {
      wcLoadMidi(winId);
      if (!windchimeState.midiData || !windchimeState.midiData.notes) return;
    }

    if (windchimeState.isPaused) {
      windchimeState.isPaused = false;
      windchimeState.startTime = performance.now() - windchimeState.pauseTime;
    } else {
      windchimeState.noteIndex = 0;
      windchimeState.startTime = performance.now();
    }

    windchimeState.isPlaying = true;
    wcPlaybackLoop(winId);

    const btn = document.getElementById('wc-play-' + winId);
    if (btn) btn.textContent = '▶ Playing...';
  }

  function wcPlaybackLoop(winId) {
    if (!windchimeState.isPlaying || windchimeState.isPaused) return;

    const data = windchimeState.midiData;
    if (!data || !data.notes) return;

    const elapsed = (performance.now() - windchimeState.startTime) / 1000;
    const notes = data.notes;

    while (windchimeState.noteIndex < notes.length && notes[windchimeState.noteIndex].time <= elapsed) {
      const note = notes[windchimeState.noteIndex];
      wcPlayNote(note.note, note.velocity / 127, note.duration || 0.3);
      windchimeState.noteIndex++;
    }

    const total = notes.length > 0 ? notes[notes.length - 1].time + 1 : 0;
    const timeEl = document.getElementById('wc-time-' + winId);
    if (timeEl) {
      const fmt = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
      timeEl.textContent = fmt(elapsed) + ' / ' + fmt(total);
    }

    if (windchimeState.noteIndex >= notes.length) {
      setTimeout(() => { if (windchimeState.isPlaying) { wcStop(winId); wcNext(winId); } }, 2000);
      return;
    }

    windchimeState.playbackTimer = requestAnimationFrame(() => wcPlaybackLoop(winId));
  }

  function wcPlayNote(midiNote, velocity, duration) {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const mat = windchimeState.materials[windchimeState.material];

    const baseFreq = 440 * Math.pow(2, (midiNote - 69) / 12) * mat.baseFreq;
    const windVar = (Math.random() - 0.5) * windchimeState.windSpeed * 0.1;

    mat.harmonics.forEach((harmonic, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.frequency.setValueAtTime(baseFreq * harmonic * (1 + windVar), now);
      osc.detune.setValueAtTime((Math.random() - 0.5) * 10, now);
      osc.type = 'sine';

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2000 + windchimeState.brightness * 8000, now);
      filter.Q.setValueAtTime(windchimeState.resonance * 10, now);

      const vol = velocity * 0.15 / (i + 1);
      const decay = mat.decay * windchimeState.decay;

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

  function wcPause(winId) {
    if (windchimeState.isPlaying && !windchimeState.isPaused) {
      windchimeState.isPaused = true;
      windchimeState.pauseTime = performance.now() - windchimeState.startTime;
      if (windchimeState.playbackTimer) cancelAnimationFrame(windchimeState.playbackTimer);
      const btn = document.getElementById('wc-play-' + winId);
      if (btn) btn.textContent = '▶ Paused';
    }
  }

  function wcStop(winId) {
    windchimeState.isPlaying = false;
    windchimeState.isPaused = false;
    windchimeState.noteIndex = 0;
    if (windchimeState.playbackTimer) cancelAnimationFrame(windchimeState.playbackTimer);
    const btn = document.getElementById('wc-play-' + winId);
    if (btn) btn.textContent = '▶ Play';
    const timeEl = document.getElementById('wc-time-' + winId);
    if (timeEl) timeEl.textContent = '--:-- / --:--';
  }

  function wcPrev(winId) {
    wcStop(winId);
    windchimeState.currentTrack--;
    if (windchimeState.currentTrack < 0) windchimeState.currentTrack = windchimeState.tracks.length - 1;
    wcLoadMidi(winId);
    wcLoadTracks(winId);
  }

  function wcNext(winId) {
    wcStop(winId);
    windchimeState.currentTrack++;
    if (windchimeState.currentTrack >= windchimeState.tracks.length) windchimeState.currentTrack = 0;
    wcLoadMidi(winId);
    wcLoadTracks(winId);
    if (windchimeState.tracks.length > 0) wcPlay(winId);
  }

  function wcSetMaterial(winId, material) {
    windchimeState.material = material;
    // Update instance if exists
    const inst = Object.values(windchimeInstances).find(i => i.winId === winId);
    if (inst) inst.material = material;

    ['aluminum', 'brass', 'bamboo', 'glass', 'crystal'].forEach(m => {
      const btn = document.getElementById('wc-mat-' + m + '-' + winId);
      if (btn) btn.classList.toggle('active', m === material);
    });
    wcPlayNote(72, 0.8, 0.5);
  }

  function wcUpdateParam(winId, param, value) {
    value = parseInt(value);
    const inst = Object.values(windchimeInstances).find(i => i.winId === winId);

    switch (param) {
      case 'resonance':
        windchimeState.resonance = value / 100;
        if (inst) inst.resonance = value / 100;
        document.getElementById('wc-res-val-' + winId).textContent = value + '%';
        break;
      case 'decay':
        windchimeState.decay = 0.5 + (value / 100) * 4.5;
        if (inst) inst.decay = 0.5 + (value / 100) * 4.5;
        document.getElementById('wc-dec-val-' + winId).textContent = windchimeState.decay.toFixed(1) + 's';
        break;
      case 'brightness':
        windchimeState.brightness = value / 100;
        if (inst) inst.brightness = value / 100;
        document.getElementById('wc-bri-val-' + winId).textContent = value + '%';
        break;
      case 'wind':
        windchimeState.windSpeed = value / 100;
        if (inst) inst.windSpeed = value / 100;
        document.getElementById('wc-win-val-' + winId).textContent = value + '%';
        break;
    }
  }

  function wcExport(winId) {
    if (!windchimeState.midiData || !windchimeState.midiData.notes) {
      if (typeof algoSpeak === 'function') algoSpeak('Select a MIDI file first!');
      return;
    }

    const statusEl = document.getElementById('wc-export-status-' + winId);
    const track = windchimeState.tracks[windchimeState.currentTrack];

    if (statusEl) statusEl.textContent = 'Rendering...';

    const notes = windchimeState.midiData.notes;
    const duration = notes.length > 0 ? notes[notes.length - 1].time + 3 : 3;
    const sampleRate = 44100;
    const offlineCtx = new OfflineAudioContext(2, sampleRate * duration, sampleRate);

    const mat = windchimeState.materials[windchimeState.material];

    notes.forEach(note => {
      const baseFreq = 440 * Math.pow(2, (note.note - 69) / 12) * mat.baseFreq;
      const vel = (note.velocity || 64) / 127;

      mat.harmonics.forEach((harmonic, i) => {
        const osc = offlineCtx.createOscillator();
        const gain = offlineCtx.createGain();

        osc.frequency.setValueAtTime(baseFreq * harmonic, note.time);
        osc.type = 'sine';

        const vol = vel * 0.15 / (i + 1);
        const decay = mat.decay * windchimeState.decay;

        gain.gain.setValueAtTime(0, note.time);
        gain.gain.linearRampToValueAtTime(vol, note.time + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.001, note.time + decay);

        osc.connect(gain);
        gain.connect(offlineCtx.destination);

        osc.start(note.time);
        osc.stop(note.time + decay + 0.1);
      });
    });

    offlineCtx.startRendering().then(buffer => {
      const wavData = audioBufferToWav(buffer);
      const blob = new Blob([wavData], { type: 'audio/wav' });

      const baseName = track.name.replace(/\.(mid|midi)$/i, '');
      const exportName = baseName + '-windchime.wav';

      const reader = new FileReader();
      reader.onload = function() {
        window.savedFiles.push({ name: exportName, content: reader.result, type: 'audio', icon: '🔊' });
        if (typeof saveState === 'function') saveState();
        if (typeof createDesktopIcons === 'function') createDesktopIcons();
        if (statusEl) statusEl.textContent = '✓ Exported: ' + exportName;
        if (typeof algoSpeak === 'function') algoSpeak('Exported ' + exportName);
      };
      reader.readAsDataURL(blob);
    }).catch(e => {
      if (statusEl) statusEl.textContent = 'Error: ' + e.message;
    });
  }

  function audioBufferToWav(buffer) {
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

  function wcStartViz(winId) {
    const canvas = document.getElementById('wc-viz-' + winId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width, height = canvas.height;

    function draw() {
      if (!document.getElementById('wc-viz-' + winId)) return;

      ctx.fillStyle = '#001830';
      ctx.fillRect(0, 0, width, height);

      const mat = windchimeState.materials[windchimeState.material];
      const tubeCount = 8;
      const tubeWidth = (width - 40) / tubeCount;

      for (let i = 0; i < tubeCount; i++) {
        const x = 20 + i * tubeWidth + tubeWidth / 2;
        const tubeHeight = 20 + (i % 4) * 8;

        let swing = 0;
        if (windchimeState.isPlaying && !windchimeState.isPaused) {
          swing = Math.sin(performance.now() / 200 + i * 0.5) * windchimeState.windSpeed * 10;
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
  window.openWindchimeDad = openWindchimeDad;
  window.windchimeState = windchimeState;
  window.windchimeInstances = windchimeInstances;
  window.wcPlay = wcPlay;
  window.wcPause = wcPause;
  window.wcStop = wcStop;
  window.wcPrev = wcPrev;
  window.wcNext = wcNext;
  window.wcSetMaterial = wcSetMaterial;
  window.wcUpdateParam = wcUpdateParam;
  window.wcExport = wcExport;
  window.wcSelectTrack = wcSelectTrack;
  window.wcLoadTracks = wcLoadTracks;
  window.wcCreateSampleMidi = wcCreateSampleMidi;

  // Register with ALGO OS
  if (window.algoRegisterApp) {
    window.algoRegisterApp({
      id: 'windchime-dad',
      name: 'Windchime Dad',
      icon: '⛲',
      css: css,
      open: openWindchimeDad
    });
  } else {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    console.log('Windchime Dad loaded (fallback mode)');
  }

})();
