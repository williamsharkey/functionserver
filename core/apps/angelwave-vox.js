// System App: Angelwave VOX - Choir Synthesizer
ALGO.app.name = 'Angelwave VOX';
ALGO.app.icon = '👼';
ALGO.app.category = 'media';

const _aw_state = {
  instances: {},
  counter: 0,
  voicePresets: {
    soprano: { pitch: 1.4, rate: 0.9 },
    alto: { pitch: 1.1, rate: 0.95 },
    tenor: { pitch: 0.9, rate: 1.0 },
    bass: { pitch: 0.7, rate: 1.0 },
    child: { pitch: 1.6, rate: 1.1 },
    whisper: { pitch: 1.0, rate: 0.8 }
  },
  audioCtx: null,
  meSpeakLoaded: false,
  useMeSpeak: true
};

// Load meSpeak.js for true polyphonic TTS
function _aw_loadMeSpeak() {
  if (window.meSpeak && meSpeak.isConfigLoaded && meSpeak.isConfigLoaded()) {
    _aw_state.meSpeakLoaded = true;
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/mespeak@1.9.6/mespeak.full.js';
    script.onload = () => {
      meSpeak.loadConfig('https://unpkg.com/mespeak@1.9.6/mespeak_config.json');
      meSpeak.loadVoice('https://unpkg.com/mespeak@1.9.6/voices/en/en-us.json', () => {
        _aw_state.meSpeakLoaded = true;
        console.log('meSpeak 1.9.6 loaded for polyphonic choir');
        resolve();
      });
    };
    script.onerror = (e) => {
      console.warn('meSpeak failed to load:', e);
      reject(e);
    };
    document.head.appendChild(script);
  });
}

function _aw_getAudioCtx() {
  if (!_aw_state.audioCtx) {
    _aw_state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (_aw_state.audioCtx.state === 'suspended') {
    _aw_state.audioCtx.resume();
  }
  return _aw_state.audioCtx;
}

async function _aw_meSpeakToBuffer(text, pitch, speed, volume) {
  if (!_aw_state.meSpeakLoaded) return null;
  const msPitch = Math.round(pitch * 50);
  const msSpeed = Math.round(175 * speed);
  const dataUrl = meSpeak.speak(text, {
    rawdata: 'data-url',
    pitch: msPitch,
    speed: msSpeed,
    volume: Math.round(volume * 100)
  });
  if (!dataUrl) return null;
  try {
    const base64 = dataUrl.split(',')[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const audioCtx = _aw_getAudioCtx();
    return await audioCtx.decodeAudioData(bytes.buffer);
  } catch(e) {
    console.error('Failed to decode meSpeak audio:', e);
    return null;
  }
}

function _aw_playBuffersSimultaneously(buffers, offsets, volumes) {
  const audioCtx = _aw_getAudioCtx();
  const now = audioCtx.currentTime;
  buffers.forEach((buffer, i) => {
    if (!buffer) return;
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = volumes[i] || 1;
    source.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    source.start(now + (offsets[i] || 0) / 1000);
  });
}

function _aw_getVoices() {
  return new Promise(resolve => {
    let voices = speechSynthesis.getVoices();
    if (voices.length) resolve(voices);
    else speechSynthesis.onvoiceschanged = () => resolve(speechSynthesis.getVoices());
  });
}

function _aw_renderVoicePanel(instId, idx, voice) {
  const presets = Object.keys(_aw_state.voicePresets);
  return '<div id="aw-voice-' + idx + '-' + instId + '" style="background:#2a2a3a;border:1px solid #444;padding:4px;font-size:9px;' + (voice.enabled ? 'border-color:#5a5a7a;' : 'opacity:0.5;') + '">' +
    '<div style="display:flex;align-items:center;gap:4px;margin-bottom:3px;">' +
      '<input type="checkbox" id="aw-enable-' + idx + '-' + instId + '" ' + (voice.enabled ? 'checked' : '') + ' onchange="_aw_toggleVoice(\'' + instId + '\',' + idx + ',this.checked)" style="margin:0;">' +
      '<span style="font-weight:bold;color:#ffd700;">V' + (idx + 1) + '</span>' +
      '<select id="aw-preset-' + idx + '-' + instId + '" onchange="_aw_setPreset(\'' + instId + '\',' + idx + ',this.value)" style="padding:1px;background:#c0c0c0;border:1px inset #808080;font-size:8px;flex:1;">' +
        presets.map(p => '<option value="' + p + '"' + (voice.preset === p ? ' selected' : '') + '>' + p.slice(0,3) + '</option>').join('') +
      '</select>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:28px 1fr 24px;gap:2px;align-items:center;">' +
      '<span style="color:#888;">Pit</span><input type="range" min="0.5" max="2.0" step="0.1" value="' + voice.pitch + '" onchange="_aw_setPitch(\'' + instId + '\',' + idx + ',this.value)" style="width:100%;height:12px;"><span id="aw-pitch-val-' + idx + '-' + instId + '" style="color:#ffd700;font-size:8px;">' + voice.pitch.toFixed(1) + '</span>' +
      '<span style="color:#888;">Spd</span><input type="range" min="0.5" max="1.5" step="0.05" value="' + voice.rate + '" onchange="_aw_setRate(\'' + instId + '\',' + idx + ',this.value)" style="width:100%;height:12px;"><span id="aw-rate-val-' + idx + '-' + instId + '" style="color:#ffd700;font-size:8px;">' + voice.rate.toFixed(1) + '</span>' +
      '<span style="color:#888;">Vol</span><input type="range" min="0" max="1" step="0.05" value="' + voice.volume + '" onchange="_aw_setVolume(\'' + instId + '\',' + idx + ',this.value)" style="width:100%;height:12px;"><span id="aw-vol-val-' + idx + '-' + instId + '" style="color:#ffd700;font-size:8px;">' + Math.round(voice.volume * 100) + '</span>' +
      '<span style="color:#888;">Off</span><input type="range" min="0" max="300" step="10" value="' + voice.offset + '" onchange="_aw_setOffset(\'' + instId + '\',' + idx + ',this.value)" style="width:100%;height:12px;"><span id="aw-offset-val-' + idx + '-' + instId + '" style="color:#ffd700;font-size:8px;">' + voice.offset + '</span>' +
    '</div>' +
  '</div>';
}

function _aw_open() {
  if (typeof hideStartMenu === 'function') hideStartMenu();
  _aw_loadMeSpeak().catch(e => console.warn('meSpeak failed to load, using fallback:', e));

  _aw_state.counter++;
  const instId = 'aw-' + _aw_state.counter;

  const inst = {
    instId: instId,
    voices: [
      { enabled: true, preset: 'soprano', pitch: 1.4, rate: 0.9, volume: 0.8, offset: 0, voiceIdx: 0 },
      { enabled: true, preset: 'alto', pitch: 1.1, rate: 0.95, volume: 0.8, offset: 50, voiceIdx: 0 },
      { enabled: true, preset: 'tenor', pitch: 0.9, rate: 1.0, volume: 0.7, offset: 100, voiceIdx: 0 },
      { enabled: true, preset: 'bass', pitch: 0.7, rate: 1.0, volume: 0.7, offset: 150, voiceIdx: 0 },
      { enabled: true, preset: 'child', pitch: 1.6, rate: 1.1, volume: 0.6, offset: 0, voiceIdx: 0 },
      { enabled: true, preset: 'whisper', pitch: 1.0, rate: 0.8, volume: 0.5, offset: 200, voiceIdx: 0 }
    ],
    lyrics: 'Ah La Lu Alleluia Amen Oh Holy Light Divine',
    currentWordIndex: 0,
    availableVoices: []
  };

  _aw_state.instances[instId] = inst;

  ALGO.createWindow({
    title: 'Angelwave VOX',
    icon: '👼',
    width: 420,
    height: 340,
    content: '<div style="display:flex;flex-direction:column;height:100%;background:linear-gradient(180deg,#1a1a2e 0%,#16213e 100%);color:#e0e0e0;font-size:10px;">' +
      '<div style="display:flex;flex-wrap:wrap;gap:2px;padding:3px 6px;background:#c0c0c0;border-bottom:2px groove #fff;">' +
        '<button onclick="_aw_testChoir(\'' + instId + '\')" style="padding:2px 6px;background:#c0c0c0;border:2px outset #fff;font-size:9px;cursor:pointer;">▶Test</button>' +
        '<button onclick="_aw_stopChoir()" style="padding:2px 6px;background:#c0c0c0;border:2px outset #fff;font-size:9px;cursor:pointer;">■Stop</button>' +
        '<button onclick="_aw_randomize(\'' + instId + '\')" style="padding:2px 6px;background:#e0ffe0;border:2px outset #fff;font-size:9px;cursor:pointer;" title="Randomize all voice parameters">🎲Rand</button>' +
        '<button onclick="_aw_tightChorus(\'' + instId + '\')" style="padding:2px 6px;background:#ffe4b5;border:2px outset #fff;font-size:9px;cursor:pointer;" title="Tight offsets">🎶Tight</button>' +
        '<button onclick="_aw_saveAngel(\'' + instId + '\')" style="padding:2px 6px;background:#c0c0c0;border:2px outset #fff;font-size:9px;cursor:pointer;">💾Save</button>' +
        '<button onclick="_aw_loadAngel(\'' + instId + '\')" style="padding:2px 6px;background:#c0c0c0;border:2px outset #fff;font-size:9px;cursor:pointer;">📂Load</button>' +
      '</div>' +
      '<div style="padding:4px 6px;background:#2a2a3a;border-bottom:1px solid #444;">' +
        '<div style="display:flex;align-items:center;gap:4px;">' +
          '<span style="color:#aaa;font-size:9px;">Lyrics:</span>' +
          '<input type="text" id="aw-lyrics-' + instId + '" value="' + inst.lyrics + '" onchange="_aw_setLyrics(\'' + instId + '\',this.value)" style="flex:1;padding:3px;background:#1a1a2a;color:#fff;border:1px inset #333;font-size:10px;">' +
        '</div>' +
        '<div style="margin-top:3px;display:flex;align-items:center;gap:6px;font-size:9px;">' +
          '<span id="aw-current-word-' + instId + '" style="background:#ffd700;color:#000;padding:1px 6px;font-weight:bold;">Ah</span>' +
          '<button onclick="_aw_resetWord(\'' + instId + '\')" style="padding:1px 4px;background:#c0c0c0;border:1px outset #fff;font-size:8px;cursor:pointer;">↺</button>' +
          '<button onclick="_aw_nextWord(\'' + instId + '\')" style="padding:1px 4px;background:#c0c0c0;border:1px outset #fff;font-size:8px;cursor:pointer;">▶</button>' +
          '<span id="aw-status-' + instId + '" style="color:#888;margin-left:auto;">' + inst.voices.filter(v => v.enabled).length + ' voices</span>' +
        '</div>' +
      '</div>' +
      '<div id="aw-voices-' + instId + '" style="flex:1;overflow-y:auto;padding:4px;display:grid;grid-template-columns:repeat(3,1fr);gap:4px;">' +
        inst.voices.map((v, i) => _aw_renderVoicePanel(instId, i, v)).join('') +
      '</div>' +
    '</div>',
    onClose: () => delete _aw_state.instances[instId]
  });

  _aw_getVoices().then(voices => {
    inst.availableVoices = voices;
  });
}

// Randomize all voice parameters while keeping voices enabled
function _aw_randomize(instId) {
  const inst = _aw_state.instances[instId];
  if (!inst) return;

  inst.voices.forEach((voice, idx) => {
    voice.enabled = true;
    voice.pitch = 0.5 + Math.random() * 1.5; // 0.5 to 2.0
    voice.rate = 0.5 + Math.random() * 1.0;  // 0.5 to 1.5
    voice.volume = 0.3 + Math.random() * 0.7; // 0.3 to 1.0
    voice.offset = Math.floor(Math.random() * 200); // 0 to 200ms

    // Update UI
    const panel = document.getElementById('aw-voice-' + idx + '-' + instId);
    if (panel) {
      panel.style.opacity = '1';
      panel.style.borderColor = '#5a5a7a';
    }
    const checkbox = document.getElementById('aw-enable-' + idx + '-' + instId);
    if (checkbox) checkbox.checked = true;

    const pitchEl = document.getElementById('aw-pitch-val-' + idx + '-' + instId);
    if (pitchEl) pitchEl.textContent = voice.pitch.toFixed(1);
    const rateEl = document.getElementById('aw-rate-val-' + idx + '-' + instId);
    if (rateEl) rateEl.textContent = voice.rate.toFixed(1);
    const volEl = document.getElementById('aw-vol-val-' + idx + '-' + instId);
    if (volEl) volEl.textContent = Math.round(voice.volume * 100);
    const offsetEl = document.getElementById('aw-offset-val-' + idx + '-' + instId);
    if (offsetEl) offsetEl.textContent = voice.offset;
  });

  // Re-render to update sliders
  const container = document.getElementById('aw-voices-' + instId);
  if (container) {
    container.innerHTML = inst.voices.map((v, i) => _aw_renderVoicePanel(instId, i, v)).join('');
  }
  _aw_updateStatus(instId);
}

async function _aw_singWord(instId, word, pitchMod, velocityMod) {
  const inst = _aw_state.instances[instId];
  if (!inst) return;

  const pm = pitchMod || 1;
  const vm = velocityMod || 1;
  const meSpeakBuffers = [];
  const meSpeakOffsets = [];
  const meSpeakVolumes = [];

  for (let idx = 0; idx < inst.voices.length; idx++) {
    const voice = inst.voices[idx];
    if (!voice.enabled) continue;

    if (idx === 0) {
      setTimeout(() => {
        if (!window.speechSynthesis) return;
        const utterance = new SpeechSynthesisUtterance(word);
        if (inst.availableVoices.length > 0 && voice.voiceIdx < inst.availableVoices.length) {
          utterance.voice = inst.availableVoices[voice.voiceIdx];
        }
        utterance.pitch = Math.min(2, Math.max(0.1, voice.pitch * pm));
        utterance.rate = voice.rate;
        utterance.volume = Math.min(1, voice.volume * vm);
        speechSynthesis.speak(utterance);
      }, voice.offset);
    } else if (_aw_state.meSpeakLoaded) {
      const finalPitch = voice.pitch * pm;
      const buffer = await _aw_meSpeakToBuffer(word, finalPitch, voice.rate, voice.volume * vm);
      if (buffer) {
        meSpeakBuffers.push(buffer);
        meSpeakOffsets.push(voice.offset);
        meSpeakVolumes.push(voice.volume * vm);
      }
    } else {
      setTimeout(() => {
        if (!window.speechSynthesis) return;
        const utterance = new SpeechSynthesisUtterance(word);
        if (inst.availableVoices.length > 0 && voice.voiceIdx < inst.availableVoices.length) {
          utterance.voice = inst.availableVoices[voice.voiceIdx];
        }
        utterance.pitch = Math.min(2, Math.max(0.1, voice.pitch * pm));
        utterance.rate = voice.rate;
        utterance.volume = Math.min(1, voice.volume * vm);
        speechSynthesis.speak(utterance);
      }, voice.offset);
    }
  }

  if (meSpeakBuffers.length > 0) {
    _aw_playBuffersSimultaneously(meSpeakBuffers, meSpeakOffsets, meSpeakVolumes);
  }
}

function _aw_tightChorus(instId) {
  const inst = _aw_state.instances[instId];
  if (!inst) return;
  const tightOffsets = [0, 25, 50, 75, 100, 125];
  inst.voices.forEach((voice, idx) => {
    voice.enabled = true;
    voice.offset = tightOffsets[idx] || 0;
    const panel = document.getElementById('aw-voice-' + idx + '-' + instId);
    if (panel) {
      panel.style.opacity = '1';
      panel.style.borderColor = '#5a5a7a';
    }
    const checkbox = document.getElementById('aw-enable-' + idx + '-' + instId);
    if (checkbox) checkbox.checked = true;
    const offsetEl = document.getElementById('aw-offset-val-' + idx + '-' + instId);
    if (offsetEl) offsetEl.textContent = voice.offset;
  });
  const container = document.getElementById('aw-voices-' + instId);
  if (container) {
    container.innerHTML = inst.voices.map((v, i) => _aw_renderVoicePanel(instId, i, v)).join('');
  }
  _aw_updateStatus(instId);
}

function _aw_updateCurrentWord(instId) {
  const inst = _aw_state.instances[instId];
  if (!inst) return;
  const words = inst.lyrics.split(/\s+/).filter(w => w.length > 0);
  const word = words[inst.currentWordIndex % words.length] || 'Ah';
  const el = document.getElementById('aw-current-word-' + instId);
  if (el) el.textContent = word;
}

function _aw_updateStatus(instId) {
  const inst = _aw_state.instances[instId];
  if (!inst) return;
  const activeCount = inst.voices.filter(v => v.enabled).length;
  const el = document.getElementById('aw-status-' + instId);
  if (el) el.textContent = activeCount + ' voices';
}

function _aw_toggleVoice(instId, idx, enabled) {
  const inst = _aw_state.instances[instId];
  if (!inst) return;
  inst.voices[idx].enabled = enabled;
  const panel = document.getElementById('aw-voice-' + idx + '-' + instId);
  if (panel) {
    panel.style.opacity = enabled ? '1' : '0.5';
    panel.style.borderColor = enabled ? '#5a5a7a' : '#444';
  }
  _aw_updateStatus(instId);
}

function _aw_setPreset(instId, idx, preset) {
  const inst = _aw_state.instances[instId];
  if (!inst) return;
  const p = _aw_state.voicePresets[preset];
  if (p) {
    inst.voices[idx].preset = preset;
    inst.voices[idx].pitch = p.pitch;
    inst.voices[idx].rate = p.rate;
    document.getElementById('aw-pitch-val-' + idx + '-' + instId).textContent = p.pitch.toFixed(1);
    document.getElementById('aw-rate-val-' + idx + '-' + instId).textContent = p.rate.toFixed(1);
  }
}

function _aw_setPitch(instId, idx, val) {
  const inst = _aw_state.instances[instId];
  if (!inst) return;
  inst.voices[idx].pitch = parseFloat(val);
  document.getElementById('aw-pitch-val-' + idx + '-' + instId).textContent = parseFloat(val).toFixed(1);
}

function _aw_setRate(instId, idx, val) {
  const inst = _aw_state.instances[instId];
  if (!inst) return;
  inst.voices[idx].rate = parseFloat(val);
  document.getElementById('aw-rate-val-' + idx + '-' + instId).textContent = parseFloat(val).toFixed(1);
}

function _aw_setVolume(instId, idx, val) {
  const inst = _aw_state.instances[instId];
  if (!inst) return;
  inst.voices[idx].volume = parseFloat(val);
  document.getElementById('aw-vol-val-' + idx + '-' + instId).textContent = Math.round(parseFloat(val) * 100);
}

function _aw_setOffset(instId, idx, val) {
  const inst = _aw_state.instances[instId];
  if (!inst) return;
  inst.voices[idx].offset = parseInt(val);
  document.getElementById('aw-offset-val-' + idx + '-' + instId).textContent = val;
}

function _aw_setSysVoice(instId, idx, val) {
  const inst = _aw_state.instances[instId];
  if (!inst) return;
  inst.voices[idx].voiceIdx = parseInt(val);
}

function _aw_setLyrics(instId, lyrics) {
  const inst = _aw_state.instances[instId];
  if (!inst) return;
  inst.lyrics = lyrics;
  inst.currentWordIndex = 0;
  _aw_updateCurrentWord(instId);
}

function _aw_resetWord(instId) {
  const inst = _aw_state.instances[instId];
  if (!inst) return;
  inst.currentWordIndex = 0;
  _aw_updateCurrentWord(instId);
}

function _aw_nextWord(instId) {
  const inst = _aw_state.instances[instId];
  if (!inst) return;
  const words = inst.lyrics.split(/\s+/).filter(w => w.length > 0);
  const word = words[inst.currentWordIndex % words.length] || 'Ah';
  _aw_singWord(instId, word, 1.0, 1.0);
  inst.currentWordIndex++;
  _aw_updateCurrentWord(instId);
}

function _aw_testChoir(instId) {
  const inst = _aw_state.instances[instId];
  if (!inst) return;
  const words = inst.lyrics.split(/\s+/).filter(w => w.length > 0);
  _aw_singWord(instId, words[inst.currentWordIndex % words.length] || 'Ah', 1.0, 1.0);
  inst.currentWordIndex++;
  _aw_updateCurrentWord(instId);
}

function _aw_stopChoir() {
  speechSynthesis.cancel();
}

function _aw_saveAngel(instId) {
  const inst = _aw_state.instances[instId];
  if (!inst) return;
  const name = prompt('Save preset as:', 'choir.angel');
  if (!name) return;
  const data = {
    format: 'angelwave-v1',
    lyrics: inst.lyrics,
    voices: inst.voices.map(v => ({
      enabled: v.enabled, preset: v.preset, pitch: v.pitch,
      rate: v.rate, volume: v.volume, offset: v.offset, voiceIdx: v.voiceIdx
    }))
  };
  const fileName = name.endsWith('.angel') ? name : name + '.angel';
  if (typeof savedFiles !== 'undefined') {
    const existing = savedFiles.findIndex(f => f.name === fileName);
    if (existing >= 0) savedFiles[existing].content = JSON.stringify(data, null, 2);
    else savedFiles.push({ name: fileName, content: JSON.stringify(data, null, 2), type: 'text', icon: '👼' });
    if (typeof saveState === 'function') saveState();
    if (typeof createDesktopIcons === 'function') createDesktopIcons();
  }
  ALGO.notify('Saved ' + fileName);
}

function _aw_loadAngel(instId) {
  const inst = _aw_state.instances[instId];
  if (!inst || typeof savedFiles === 'undefined') return;
  const angelFiles = savedFiles.filter(f => f.name.endsWith('.angel') || f.name.endsWith('.choir'));
  if (angelFiles.length === 0) {
    ALGO.notify('No .angel files found');
    return;
  }
  const fileName = prompt('Load preset:\n' + angelFiles.map(f => '• ' + f.name).join('\n'), angelFiles[0].name);
  if (!fileName) return;
  const file = savedFiles.find(f => f.name === fileName || f.name === fileName + '.angel');
  if (!file) {
    ALGO.notify('File not found: ' + fileName);
    return;
  }
  try {
    const data = JSON.parse(file.content);
    if (data.format !== 'angelwave-v1' && data.format !== 'angelwave-choir-v1') throw new Error('Invalid format');
    inst.lyrics = data.lyrics || 'Ah';
    inst.currentWordIndex = 0;
    if (data.voices && data.voices.length === 6) inst.voices = data.voices;
    document.getElementById('aw-lyrics-' + instId).value = inst.lyrics;
    const container = document.getElementById('aw-voices-' + instId);
    if (container) {
      container.innerHTML = inst.voices.map((v, i) => _aw_renderVoicePanel(instId, i, v)).join('');
    }
    _aw_updateCurrentWord(instId);
    _aw_updateStatus(instId);
    ALGO.notify('Loaded ' + fileName);
  } catch (e) {
    ALGO.notify('Error loading: ' + e.message);
  }
}

function _aw_handleMidiInput(message, opts, from) {
  const instId = Object.keys(_aw_state.instances)[0];
  if (!instId) return;
  const inst = _aw_state.instances[instId];
  if (!inst) return;

  if (message.type === 'noteOn' || message.type === 'note') {
    const pitchMod = Math.pow(2, (message.note - 60) / 12);
    const velocityMod = (message.velocity || 100) / 127;
    const words = inst.lyrics.split(/\s+/).filter(w => w.length > 0);
    const word = words[inst.currentWordIndex % words.length] || 'Ah';
    _aw_singWord(instId, word, pitchMod, velocityMod);
    inst.currentWordIndex++;
    _aw_updateCurrentWord(instId);
  }
}

if (window.ALGO && ALGO.pubsub) {
  ALGO.pubsub.register('Angelwave VOX', { autoOpen: false });
  ALGO.pubsub.subscribe('Angelwave VOX', _aw_handleMidiInput);
}

window._aw_open = _aw_open;
window._aw_toggleVoice = _aw_toggleVoice;
window._aw_setPreset = _aw_setPreset;
window._aw_setPitch = _aw_setPitch;
window._aw_setRate = _aw_setRate;
window._aw_setVolume = _aw_setVolume;
window._aw_setOffset = _aw_setOffset;
window._aw_setSysVoice = _aw_setSysVoice;
window._aw_setLyrics = _aw_setLyrics;
window._aw_resetWord = _aw_resetWord;
window._aw_nextWord = _aw_nextWord;
window._aw_testChoir = _aw_testChoir;
window._aw_stopChoir = _aw_stopChoir;
window._aw_saveAngel = _aw_saveAngel;
window._aw_loadAngel = _aw_loadAngel;
window._aw_handleMidiInput = _aw_handleMidiInput;
window._aw_tightChorus = _aw_tightChorus;
window._aw_randomize = _aw_randomize;

_aw_open();
