// System App: Angelwave VOX - Choir Synthesizer
ALGO.app.name = 'Angelwave VOX';
ALGO.app.icon = '👼';
ALGO.app.category = 'media';

const _aw_state = {
  instances: {},
  counter: 0,
  voicePresets: {
    soprano: { octave: 1, cents: 0, rate: 0.9 },
    alto: { octave: 0, cents: 20, rate: 0.95 },
    tenor: { octave: 0, cents: -20, rate: 1.0 },
    bass: { octave: -1, cents: 0, rate: 1.0 },
    child: { octave: 1, cents: 50, rate: 1.1 },
    whisper: { octave: 0, cents: 0, rate: 0.8 }
  },
  audioCtx: null,
  meSpeakLoaded: false,
  meSpeakOwner: null  // Only one instance uses mespeak to prevent conflicts
};

// Load fs-mespeak.js (FunctionServer's vanilla JS fork)
function _aw_loadMeSpeak() {
  if (window.meSpeak && typeof meSpeak.speak === 'function') {
    _aw_state.meSpeakLoaded = true;
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/lib/fs-mespeak.js';
    script.onload = () => {
      // fs-mespeak.js auto-loads config and en-us voice
      // Wait a tick for initialization
      setTimeout(() => {
        if (window.meSpeak && meSpeak.isConfigLoaded && meSpeak.isConfigLoaded()) {
          _aw_state.meSpeakLoaded = true;
          resolve();
        } else {
          // Config loading is async, poll for ready
          let attempts = 0;
          const checkReady = setInterval(() => {
            attempts++;
            if (window.meSpeak && meSpeak.isConfigLoaded && meSpeak.isConfigLoaded()) {
              clearInterval(checkReady);
              _aw_state.meSpeakLoaded = true;
              resolve();
            } else if (attempts > 50) {
              clearInterval(checkReady);
              reject(new Error('meSpeak config timeout'));
            }
          }, 100);
        }
      }, 50);
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function _aw_getAudioCtx() {
  if (!_aw_state.audioCtx) {
    _aw_state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (_aw_state.audioCtx.state === 'suspended') _aw_state.audioCtx.resume();
  return _aw_state.audioCtx;
}

// Generate speech audio buffer using meSpeak
function _aw_meSpeakToBuffer(text, pitch, speed, volume) {
  if (!_aw_state.meSpeakLoaded || !window.meSpeak) return Promise.resolve(null);

  // meSpeak pitch: 0-99 (50 = normal)
  // Our pitch is a multiplier where 1.0 = normal
  // Convert: pitch 0.5 -> 25, pitch 1.0 -> 50, pitch 2.0 -> 100
  const msPitch = Math.max(0, Math.min(99, Math.round(50 * pitch)));
  const msSpeed = Math.max(80, Math.min(450, Math.round(175 * speed)));
  const msVolume = Math.max(0, Math.min(200, Math.round(volume * 100)));

  try {
    const wavData = meSpeak.speak(text, {
      rawdata: 'arraybuffer',
      pitch: msPitch,
      speed: msSpeed,
      amplitude: msVolume
    });

    if (!wavData) return Promise.resolve(null);

    return _aw_getAudioCtx().decodeAudioData(wavData);
  } catch(e) {
    console.warn('meSpeak error:', e);
    return Promise.resolve(null);
  }
}

// Play multiple audio buffers with offsets
function _aw_playBuffersSimultaneously(buffers, offsets, volumes) {
  const ctx = _aw_getAudioCtx();
  const now = ctx.currentTime;
  buffers.forEach((buffer, i) => {
    if (!buffer) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = volumes[i] || 1;
    source.connect(gain);
    gain.connect(ctx.destination);
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

// Convert octave + cents to pitch multiplier
function _aw_calcPitch(octave, cents) {
  return Math.pow(2, octave + cents / 1200);
}

function _aw_renderOctaveButtons(instId, idx, currentOctave) {
  const octaves = [-2, -1, 0, 1, 2];
  return '<div style="display:flex;gap:1px;">' +
    octaves.map(o =>
      '<button onclick="_aw_setOctave(\'' + instId + '\',' + idx + ',' + o + ')" ' +
      'style="width:22px;height:18px;padding:0;font-size:9px;border:1px solid #555;cursor:pointer;' +
      'background:' + (o === currentOctave ? '#ffd700' : '#3a3a4a') + ';' +
      'color:' + (o === currentOctave ? '#000' : '#ccc') + ';">' +
      (o > 0 ? '+' + o : o) + '</button>'
    ).join('') +
  '</div>';
}

function _aw_renderVoicePanel(instId, idx, voice) {
  const presets = Object.keys(_aw_state.voicePresets);
  // Voice 0 uses browser TTS and needs voice selector
  const voiceSelector = idx === 0 ?
    '<div style="display:grid;grid-template-columns:50px 1fr;gap:4px 8px;align-items:center;margin-bottom:4px;">' +
      '<span style="color:#999;">Voice</span>' +
      '<select id="aw-sysvoice-' + instId + '" onchange="_aw_setSysVoice(\'' + instId + '\',this.value)" style="padding:2px;background:#c0c0c0;border:1px inset #808080;font-size:9px;max-width:160px;">' +
        '<option>Loading...</option>' +
      '</select>' +
    '</div>' : '';

  return '<div id="aw-voice-' + idx + '-' + instId + '" style="background:#2a2a3a;border:1px solid ' + (voice.enabled ? '#5a5a7a' : '#333') + ';padding:6px;font-size:10px;opacity:' + (voice.enabled ? '1' : '0.5') + ';">' +
    '<div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;border-bottom:1px solid #444;padding-bottom:4px;">' +
      '<input type="checkbox" id="aw-enable-' + idx + '-' + instId + '" ' + (voice.enabled ? 'checked' : '') + ' onchange="_aw_toggleVoice(\'' + instId + '\',' + idx + ',this.checked)" style="margin:0;">' +
      '<span style="font-weight:bold;color:#ffd700;min-width:42px;">Voice ' + (idx + 1) + (idx === 0 ? ' (Lead)' : '') + '</span>' +
      '<select id="aw-preset-' + idx + '-' + instId + '" onchange="_aw_setPreset(\'' + instId + '\',' + idx + ',this.value)" style="padding:2px;background:#c0c0c0;border:1px inset #808080;font-size:9px;">' +
        presets.map(p => '<option value="' + p + '"' + (voice.preset === p ? ' selected' : '') + '>' + p.charAt(0).toUpperCase() + p.slice(1) + '</option>').join('') +
      '</select>' +
      '<button onclick="_aw_previewVoice(\'' + instId + '\',' + idx + ')" style="margin-left:auto;width:18px;height:18px;padding:0;background:#ffd700;border:1px solid #b8860b;cursor:pointer;font-size:10px;line-height:16px;" title="Preview this voice">▶</button>' +
    '</div>' +
    voiceSelector +
    '<div style="display:grid;grid-template-columns:50px 1fr;gap:4px 8px;align-items:center;">' +
      '<span style="color:#999;">Octave</span>' +
      '<div id="aw-octave-btns-' + idx + '-' + instId + '">' + _aw_renderOctaveButtons(instId, idx, voice.octave) + '</div>' +

      '<span style="color:#999;">Cents</span>' +
      '<div style="display:flex;align-items:center;gap:4px;">' +
        '<input type="range" min="-100" max="100" step="5" value="' + voice.cents + '" onchange="_aw_setCents(\'' + instId + '\',' + idx + ',this.value)" style="flex:1;height:14px;">' +
        '<span id="aw-cents-val-' + idx + '-' + instId + '" style="color:#ffd700;min-width:32px;text-align:right;font-family:monospace;">' + (voice.cents >= 0 ? '+' : '') + voice.cents + '</span>' +
      '</div>' +

      '<span style="color:#999;">Speed</span>' +
      '<div style="display:flex;align-items:center;gap:4px;">' +
        '<input type="range" min="0.5" max="1.5" step="0.05" value="' + voice.rate + '" onchange="_aw_setRate(\'' + instId + '\',' + idx + ',this.value)" style="flex:1;height:14px;">' +
        '<span id="aw-rate-val-' + idx + '-' + instId + '" style="color:#ffd700;min-width:32px;text-align:right;font-family:monospace;">' + voice.rate.toFixed(2) + '</span>' +
      '</div>' +

      '<span style="color:#999;">Volume</span>' +
      '<div style="display:flex;align-items:center;gap:4px;">' +
        '<input type="range" min="0" max="100" step="5" value="' + Math.round(voice.volume * 100) + '" onchange="_aw_setVolume(\'' + instId + '\',' + idx + ',this.value/100)" style="flex:1;height:14px;">' +
        '<span id="aw-vol-val-' + idx + '-' + instId + '" style="color:#ffd700;min-width:32px;text-align:right;font-family:monospace;">' + Math.round(voice.volume * 100) + '%</span>' +
      '</div>' +

      '<span style="color:#999;">Offset</span>' +
      '<div style="display:flex;align-items:center;gap:4px;">' +
        '<input type="range" min="0" max="300" step="10" value="' + voice.offset + '" onchange="_aw_setOffset(\'' + instId + '\',' + idx + ',this.value)" style="flex:1;height:14px;">' +
        '<span id="aw-offset-val-' + idx + '-' + instId + '" style="color:#ffd700;min-width:32px;text-align:right;font-family:monospace;">' + voice.offset + 'ms</span>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function _aw_open() {
  if (typeof hideStartMenu === 'function') hideStartMenu();

  _aw_state.counter++;
  const instId = 'aw-' + _aw_state.counter;

  // Only the first instance loads and owns mespeak to prevent conflicts
  const canUseMeSpeak = !_aw_state.meSpeakOwner;
  if (canUseMeSpeak) {
    _aw_state.meSpeakOwner = instId;
    _aw_loadMeSpeak().catch(e => console.warn('meSpeak load failed:', e));
  }

  const inst = {
    instId,
    globalVolume: 0.8,
    globalOctave: 0,
    voices: [
      { enabled: true, preset: 'soprano', octave: 1, cents: 0, rate: 0.9, volume: 0.8, offset: 0 },
      { enabled: true, preset: 'alto', octave: 0, cents: 20, rate: 0.95, volume: 0.8, offset: 30 },
      { enabled: true, preset: 'tenor', octave: 0, cents: -20, rate: 1.0, volume: 0.7, offset: 60 },
      { enabled: true, preset: 'bass', octave: -1, cents: 0, rate: 1.0, volume: 0.7, offset: 90 },
      { enabled: true, preset: 'child', octave: 1, cents: 50, rate: 1.1, volume: 0.6, offset: 0 },
      { enabled: true, preset: 'whisper', octave: 0, cents: 0, rate: 0.8, volume: 0.5, offset: 120 }
    ],
    lyrics: 'Ah La Lu Alleluia Amen Oh Holy Light Divine',
    currentWordIndex: 0,
    availableVoices: []
  };

  _aw_state.instances[instId] = inst;

  ALGO.createWindow({
    title: 'Angelwave VOX',
    icon: '👼',
    width: 540,
    height: 420,
    content: '<div style="display:flex;flex-direction:column;height:100%;background:linear-gradient(180deg,#1a1a2e 0%,#16213e 100%);color:#e0e0e0;font-size:10px;">' +
      // Toolbar
      '<div style="display:flex;flex-wrap:wrap;gap:3px;padding:4px 8px;background:#c0c0c0;border-bottom:2px groove #fff;align-items:center;">' +
        '<button onclick="_aw_testChoir(\'' + instId + '\')" style="padding:3px 8px;background:#c0c0c0;border:2px outset #fff;font-size:10px;cursor:pointer;">▶ Test</button>' +
        '<button onclick="_aw_stopChoir()" style="padding:3px 8px;background:#c0c0c0;border:2px outset #fff;font-size:10px;cursor:pointer;">■ Stop</button>' +
        '<button onclick="_aw_randomize(\'' + instId + '\')" style="padding:3px 8px;background:#e0ffe0;border:2px outset #fff;font-size:10px;cursor:pointer;">🎲 Rand</button>' +
        '<button onclick="_aw_tightChorus(\'' + instId + '\')" style="padding:3px 8px;background:#ffe4b5;border:2px outset #fff;font-size:10px;cursor:pointer;">🎶 Tight</button>' +
        '<span style="width:1px;height:20px;background:#808080;margin:0 2px;"></span>' +
        '<button onclick="_aw_saveAngel(\'' + instId + '\')" style="padding:3px 6px;background:#c0c0c0;border:2px outset #fff;font-size:10px;cursor:pointer;">💾</button>' +
        '<button onclick="_aw_loadAngel(\'' + instId + '\')" style="padding:3px 6px;background:#c0c0c0;border:2px outset #fff;font-size:10px;cursor:pointer;">📂</button>' +
      '</div>' +
      // Global controls
      '<div style="display:flex;align-items:center;gap:12px;padding:6px 10px;background:#252538;border-bottom:1px solid #444;">' +
        '<div style="display:flex;align-items:center;gap:6px;">' +
          '<span style="color:#aaa;font-size:9px;">Master Vol</span>' +
          '<input type="range" min="0" max="100" value="' + Math.round(inst.globalVolume * 100) + '" onchange="_aw_setGlobalVolume(\'' + instId + '\',this.value/100)" style="width:80px;height:14px;">' +
          '<span id="aw-global-vol-' + instId + '" style="color:#ffd700;font-family:monospace;min-width:28px;">' + Math.round(inst.globalVolume * 100) + '%</span>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:6px;">' +
          '<span style="color:#aaa;font-size:9px;">Master Oct</span>' +
          '<div id="aw-global-oct-' + instId + '">' + _aw_renderGlobalOctaveButtons(instId, inst.globalOctave) + '</div>' +
        '</div>' +
      '</div>' +
      // Lyrics
      '<div style="padding:5px 10px;background:#2a2a3a;border-bottom:1px solid #444;">' +
        '<div style="display:flex;align-items:center;gap:6px;">' +
          '<span style="color:#aaa;font-size:9px;">Lyrics:</span>' +
          '<input type="text" id="aw-lyrics-' + instId + '" value="' + inst.lyrics + '" onchange="_aw_setLyrics(\'' + instId + '\',this.value)" style="flex:1;padding:4px;background:#1a1a2a;color:#fff;border:1px inset #333;font-size:11px;">' +
        '</div>' +
        '<div style="margin-top:4px;display:flex;align-items:center;gap:8px;">' +
          '<span style="color:#888;font-size:9px;">Current:</span>' +
          '<span id="aw-current-word-' + instId + '" style="background:#ffd700;color:#000;padding:2px 10px;font-weight:bold;font-size:12px;">Ah</span>' +
          '<button onclick="_aw_resetWord(\'' + instId + '\')" style="padding:2px 6px;background:#c0c0c0;border:1px outset #fff;font-size:9px;cursor:pointer;">↺ Reset</button>' +
          '<button onclick="_aw_nextWord(\'' + instId + '\')" style="padding:2px 6px;background:#c0c0c0;border:1px outset #fff;font-size:9px;cursor:pointer;">▶ Next</button>' +
          '<span id="aw-status-' + instId + '" style="color:#888;margin-left:auto;font-size:9px;">' + inst.voices.filter(v => v.enabled).length + ' voices active</span>' +
        '</div>' +
      '</div>' +
      // Voice panels
      '<div id="aw-voices-' + instId + '" style="flex:1;overflow-y:auto;padding:6px;display:grid;grid-template-columns:repeat(2,1fr);gap:6px;">' +
        inst.voices.map((v, i) => _aw_renderVoicePanel(instId, i, v)).join('') +
      '</div>' +
    '</div>',
    onClose: () => {
      // Release mespeak ownership if this instance owned it
      if (_aw_state.meSpeakOwner === instId) {
        _aw_state.meSpeakOwner = null;
      }
      delete _aw_state.instances[instId];
    }
  });

  _aw_getVoices().then(voices => {
    inst.availableVoices = voices;
    _aw_updateVoiceSelect(instId);
  });
}

function _aw_updateVoiceSelect(instId) {
  const inst = _aw_state.instances[instId];
  if (!inst || !inst.availableVoices.length) return;
  const select = document.getElementById('aw-sysvoice-' + instId);
  if (select) {
    select.innerHTML = inst.availableVoices.map((v, i) =>
      '<option value="' + i + '"' + (i === (inst.voiceIdx || 0) ? ' selected' : '') + '>' +
      v.name.substring(0, 25) + '</option>'
    ).join('');
  }
}

function _aw_setSysVoice(instId, val) {
  const inst = _aw_state.instances[instId];
  if (!inst) return;
  inst.voiceIdx = parseInt(val);
}

function _aw_renderGlobalOctaveButtons(instId, currentOctave) {
  const octaves = [-2, -1, 0, 1, 2];
  return '<div style="display:flex;gap:2px;">' +
    octaves.map(o =>
      '<button onclick="_aw_setGlobalOctave(\'' + instId + '\',' + o + ')" ' +
      'style="width:26px;height:20px;padding:0;font-size:10px;border:1px solid #555;cursor:pointer;' +
      'background:' + (o === currentOctave ? '#ffd700' : '#3a3a4a') + ';' +
      'color:' + (o === currentOctave ? '#000' : '#ccc') + ';">' +
      (o > 0 ? '+' + o : o) + '</button>'
    ).join('') +
  '</div>';
}

function _aw_setGlobalVolume(instId, val) {
  const inst = _aw_state.instances[instId];
  if (!inst) return;
  inst.globalVolume = parseFloat(val);
  const el = document.getElementById('aw-global-vol-' + instId);
  if (el) el.textContent = Math.round(val * 100) + '%';
}

function _aw_setGlobalOctave(instId, oct) {
  const inst = _aw_state.instances[instId];
  if (!inst) return;
  inst.globalOctave = oct;
  const container = document.getElementById('aw-global-oct-' + instId);
  if (container) container.innerHTML = _aw_renderGlobalOctaveButtons(instId, oct);
}

function _aw_setOctave(instId, idx, oct) {
  const inst = _aw_state.instances[instId];
  if (!inst) return;
  inst.voices[idx].octave = oct;
  const container = document.getElementById('aw-octave-btns-' + idx + '-' + instId);
  if (container) container.innerHTML = _aw_renderOctaveButtons(instId, idx, oct);
}

function _aw_setCents(instId, idx, val) {
  const inst = _aw_state.instances[instId];
  if (!inst) return;
  inst.voices[idx].cents = parseInt(val);
  const el = document.getElementById('aw-cents-val-' + idx + '-' + instId);
  if (el) el.textContent = (val >= 0 ? '+' : '') + val;
}

function _aw_randomize(instId) {
  const inst = _aw_state.instances[instId];
  if (!inst) return;

  inst.voices.forEach((voice, idx) => {
    voice.enabled = true;
    voice.octave = Math.floor(Math.random() * 3) - 1; // -1 to +1
    voice.cents = Math.floor(Math.random() * 201) - 100; // -100 to +100
    voice.rate = 0.6 + Math.random() * 0.8; // 0.6 to 1.4
    voice.volume = 0.4 + Math.random() * 0.6; // 0.4 to 1.0
    voice.offset = Math.floor(Math.random() * 150); // 0 to 150ms
  });

  const container = document.getElementById('aw-voices-' + instId);
  if (container) container.innerHTML = inst.voices.map((v, i) => _aw_renderVoicePanel(instId, i, v)).join('');
  _aw_updateStatus(instId);
  _aw_updateVoiceSelect(instId);
}

async function _aw_singWord(instId, word, midiPitchMod, velocityMod) {
  const inst = _aw_state.instances[instId];
  if (!inst) return;

  const pm = midiPitchMod || 1;
  const vm = (velocityMod || 1) * inst.globalVolume;
  const globalOctMult = Math.pow(2, inst.globalOctave);

  const meSpeakBuffers = [];
  const meSpeakOffsets = [];
  const meSpeakVolumes = [];

  for (let idx = 0; idx < inst.voices.length; idx++) {
    const voice = inst.voices[idx];
    if (!voice.enabled) continue;

    // Calculate pitch: combine voice octave, cents, global octave, and MIDI pitch
    const voicePitch = _aw_calcPitch(voice.octave, voice.cents) * globalOctMult * pm;
    const voiceVol = Math.min(1, voice.volume * vm);

    // Voice 0 (lead) uses browser SpeechSynthesis with selected voice
    if (idx === 0) {
      setTimeout(() => {
        if (!window.speechSynthesis) return;
        const utt = new SpeechSynthesisUtterance(word);
        const vIdx = inst.voiceIdx || 0;
        if (inst.availableVoices.length > vIdx) utt.voice = inst.availableVoices[vIdx];
        utt.pitch = Math.min(2, Math.max(0.1, voicePitch));
        utt.rate = voice.rate;
        utt.volume = voiceVol;
        speechSynthesis.speak(utt);
      }, voice.offset);
    } else if (_aw_state.meSpeakLoaded && _aw_state.meSpeakOwner === instId) {
      // Other voices use meSpeak (only if this instance owns it)
      const buffer = await _aw_meSpeakToBuffer(word, voicePitch, voice.rate, voiceVol);
      if (buffer) {
        meSpeakBuffers.push(buffer);
        meSpeakOffsets.push(voice.offset);
        meSpeakVolumes.push(voiceVol);
      }
    } else {
      // Fallback to browser SpeechSynthesis
      setTimeout(() => {
        if (!window.speechSynthesis) return;
        const utt = new SpeechSynthesisUtterance(word);
        utt.pitch = Math.min(2, Math.max(0.1, voicePitch));
        utt.rate = voice.rate;
        utt.volume = voiceVol;
        speechSynthesis.speak(utt);
      }, voice.offset);
    }
  }

  // Play all meSpeak buffers simultaneously with their offsets
  if (meSpeakBuffers.length > 0) {
    _aw_playBuffersSimultaneously(meSpeakBuffers, meSpeakOffsets, meSpeakVolumes);
  }
}

function _aw_tightChorus(instId) {
  const inst = _aw_state.instances[instId];
  if (!inst) return;
  const tightOffsets = [0, 20, 40, 60, 80, 100];
  inst.voices.forEach((voice, idx) => {
    voice.enabled = true;
    voice.offset = tightOffsets[idx] || 0;
  });
  const container = document.getElementById('aw-voices-' + instId);
  if (container) container.innerHTML = inst.voices.map((v, i) => _aw_renderVoicePanel(instId, i, v)).join('');
  _aw_updateStatus(instId);
  _aw_updateVoiceSelect(instId);
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
  const count = inst.voices.filter(v => v.enabled).length;
  const el = document.getElementById('aw-status-' + instId);
  if (el) el.textContent = count + ' voice' + (count !== 1 ? 's' : '') + ' active';
}

function _aw_toggleVoice(instId, idx, enabled) {
  const inst = _aw_state.instances[instId];
  if (!inst) return;
  inst.voices[idx].enabled = enabled;
  const panel = document.getElementById('aw-voice-' + idx + '-' + instId);
  if (panel) {
    panel.style.opacity = enabled ? '1' : '0.5';
    panel.style.borderColor = enabled ? '#5a5a7a' : '#333';
  }
  _aw_updateStatus(instId);
}

async function _aw_previewVoice(instId, idx) {
  const inst = _aw_state.instances[instId];
  if (!inst) return;
  const voice = inst.voices[idx];
  if (!voice) return;

  const words = inst.lyrics.split(/\s+/).filter(w => w.length > 0);
  const word = words[inst.currentWordIndex % words.length] || 'Ah';
  const globalOctMult = Math.pow(2, inst.globalOctave);
  const voicePitch = _aw_calcPitch(voice.octave, voice.cents) * globalOctMult;
  const voiceVol = Math.min(1, voice.volume * inst.globalVolume);

  // Voice 0 (lead) uses browser SpeechSynthesis
  if (idx === 0) {
    if (!window.speechSynthesis) return;
    const utt = new SpeechSynthesisUtterance(word);
    const vIdx = inst.voiceIdx || 0;
    if (inst.availableVoices.length > vIdx) utt.voice = inst.availableVoices[vIdx];
    utt.pitch = Math.min(2, Math.max(0.1, voicePitch));
    utt.rate = voice.rate;
    utt.volume = voiceVol;
    speechSynthesis.speak(utt);
  } else if (_aw_state.meSpeakLoaded && _aw_state.meSpeakOwner === instId) {
    // Other voices use meSpeak (only if this instance owns it)
    const buffer = await _aw_meSpeakToBuffer(word, voicePitch, voice.rate, voiceVol);
    if (buffer) {
      _aw_playBuffersSimultaneously([buffer], [0], [voiceVol]);
    }
  } else {
    // Fallback to browser SpeechSynthesis
    if (!window.speechSynthesis) return;
    const utt = new SpeechSynthesisUtterance(word);
    utt.pitch = Math.min(2, Math.max(0.1, voicePitch));
    utt.rate = voice.rate;
    utt.volume = voiceVol;
    speechSynthesis.speak(utt);
  }
}

function _aw_setPreset(instId, idx, preset) {
  const inst = _aw_state.instances[instId];
  if (!inst) return;
  const p = _aw_state.voicePresets[preset];
  if (p) {
    inst.voices[idx].preset = preset;
    inst.voices[idx].octave = p.octave;
    inst.voices[idx].cents = p.cents;
    inst.voices[idx].rate = p.rate;
    // Re-render this voice panel
    const container = document.getElementById('aw-voices-' + instId);
    if (container) container.innerHTML = inst.voices.map((v, i) => _aw_renderVoicePanel(instId, i, v)).join('');
    _aw_updateVoiceSelect(instId);
  }
}

function _aw_setRate(instId, idx, val) {
  const inst = _aw_state.instances[instId];
  if (!inst) return;
  inst.voices[idx].rate = parseFloat(val);
  const el = document.getElementById('aw-rate-val-' + idx + '-' + instId);
  if (el) el.textContent = parseFloat(val).toFixed(2);
}

function _aw_setVolume(instId, idx, val) {
  const inst = _aw_state.instances[instId];
  if (!inst) return;
  inst.voices[idx].volume = parseFloat(val);
  const el = document.getElementById('aw-vol-val-' + idx + '-' + instId);
  if (el) el.textContent = Math.round(parseFloat(val) * 100) + '%';
}

function _aw_setOffset(instId, idx, val) {
  const inst = _aw_state.instances[instId];
  if (!inst) return;
  inst.voices[idx].offset = parseInt(val);
  const el = document.getElementById('aw-offset-val-' + idx + '-' + instId);
  if (el) el.textContent = val + 'ms';
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
  _aw_singWord(instId, words[inst.currentWordIndex % words.length] || 'Ah', 1.0, 1.0);
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
    format: 'angelwave-v2',
    globalVolume: inst.globalVolume,
    globalOctave: inst.globalOctave,
    lyrics: inst.lyrics,
    voices: inst.voices.map(v => ({
      enabled: v.enabled, preset: v.preset, octave: v.octave, cents: v.cents,
      rate: v.rate, volume: v.volume, offset: v.offset
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
    ALGO.notify('File not found');
    return;
  }
  try {
    const data = JSON.parse(file.content);
    // Support v1 and v2 formats
    if (data.globalVolume !== undefined) inst.globalVolume = data.globalVolume;
    if (data.globalOctave !== undefined) inst.globalOctave = data.globalOctave;
    inst.lyrics = data.lyrics || 'Ah';
    inst.currentWordIndex = 0;
    if (data.voices && data.voices.length === 6) {
      inst.voices = data.voices.map(v => ({
        enabled: v.enabled !== false,
        preset: v.preset || 'soprano',
        octave: v.octave !== undefined ? v.octave : 0,
        cents: v.cents !== undefined ? v.cents : 0,
        rate: v.rate || 1.0,
        volume: v.volume !== undefined ? v.volume : 0.8,
        offset: v.offset || 0
      }));
    }
    // Re-render
    document.getElementById('aw-lyrics-' + instId).value = inst.lyrics;
    document.getElementById('aw-global-vol-' + instId).textContent = Math.round(inst.globalVolume * 100) + '%';
    document.getElementById('aw-global-oct-' + instId).innerHTML = _aw_renderGlobalOctaveButtons(instId, inst.globalOctave);
    document.getElementById('aw-voices-' + instId).innerHTML = inst.voices.map((v, i) => _aw_renderVoicePanel(instId, i, v)).join('');
    _aw_updateCurrentWord(instId);
    _aw_updateStatus(instId);
    _aw_updateVoiceSelect(instId);
    ALGO.notify('Loaded ' + fileName);
  } catch (e) {
    ALGO.notify('Error: ' + e.message);
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
    _aw_singWord(instId, words[inst.currentWordIndex % words.length] || 'Ah', pitchMod, velocityMod);
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
window._aw_previewVoice = _aw_previewVoice;
window._aw_setPreset = _aw_setPreset;
window._aw_setOctave = _aw_setOctave;
window._aw_setCents = _aw_setCents;
window._aw_setRate = _aw_setRate;
window._aw_setVolume = _aw_setVolume;
window._aw_setOffset = _aw_setOffset;
window._aw_setSysVoice = _aw_setSysVoice;
window._aw_setGlobalVolume = _aw_setGlobalVolume;
window._aw_setGlobalOctave = _aw_setGlobalOctave;
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
