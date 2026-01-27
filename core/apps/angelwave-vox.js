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
  audioCache: {}, // Cache of pre-recorded audio: { "word_voiceIdx_pitch": AudioBuffer }
  audioCtx: null,
  isRecording: false,
  usePrerecorded: false
};

// Get or create AudioContext
function _aw_getAudioCtx() {
  if (!_aw_state.audioCtx) {
    _aw_state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (_aw_state.audioCtx.state === 'suspended') {
    _aw_state.audioCtx.resume();
  }
  return _aw_state.audioCtx;
}

// Record a single utterance to AudioBuffer
async function _aw_recordUtterance(word, voice, availableVoices) {
  return new Promise(async (resolve, reject) => {
    try {
      // Request tab audio capture (user must select the tab)
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: 1, height: 1 }, // Minimal video
        audio: true
      });

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        stream.getTracks().forEach(t => t.stop());
        reject(new Error('No audio track - make sure to select "Share tab audio"'));
        return;
      }

      const audioStream = new MediaStream(audioTracks);
      const mediaRecorder = new MediaRecorder(audioStream, { mimeType: 'audio/webm' });
      const chunks = [];

      mediaRecorder.ondataavailable = e => chunks.push(e.data);
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const arrayBuffer = await blob.arrayBuffer();
        const audioCtx = _aw_getAudioCtx();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        resolve(audioBuffer);
      };

      // Start recording
      mediaRecorder.start();

      // Speak the word
      const utterance = new SpeechSynthesisUtterance(word);
      if (availableVoices.length > 0 && voice.voiceIdx < availableVoices.length) {
        utterance.voice = availableVoices[voice.voiceIdx];
      }
      utterance.pitch = voice.pitch;
      utterance.rate = voice.rate;
      utterance.volume = voice.volume;

      utterance.onend = () => {
        // Small delay to capture tail
        setTimeout(() => mediaRecorder.stop(), 100);
      };
      utterance.onerror = () => {
        mediaRecorder.stop();
        reject(new Error('Speech synthesis error'));
      };

      speechSynthesis.speak(utterance);
    } catch (e) {
      reject(e);
    }
  });
}

// Pre-record all voices for current lyrics
async function _aw_prerecordAll(instId) {
  const inst = _aw_state.instances[instId];
  if (!inst) return;

  if (_aw_state.isRecording) {
    ALGO.notify('Already recording...');
    return;
  }

  const words = inst.lyrics.split(/\s+/).filter(w => w.length > 0);
  const enabledVoices = inst.voices.map((v, i) => ({ ...v, idx: i })).filter(v => v.enabled);

  if (enabledVoices.length === 0) {
    ALGO.notify('Enable at least one voice first');
    return;
  }

  ALGO.notify('Starting pre-record. Select THIS TAB and check "Share tab audio"');
  _aw_state.isRecording = true;

  try {
    for (const word of words) {
      for (const voice of enabledVoices) {
        const key = `${word}_${voice.idx}_${voice.pitch.toFixed(1)}`;
        if (_aw_state.audioCache[key]) continue; // Already cached

        ALGO.notify(`Recording: "${word}" voice ${voice.idx + 1}`);
        const buffer = await _aw_recordUtterance(word, voice, inst.availableVoices);
        _aw_state.audioCache[key] = buffer;
      }
    }
    _aw_state.usePrerecorded = true;
    ALGO.notify('Pre-recording complete! Chorus mode enabled.');
  } catch (e) {
    ALGO.notify('Recording failed: ' + e.message);
  }

  _aw_state.isRecording = false;
}

// Play pre-recorded samples simultaneously
function _aw_playPrerecorded(instId, word, pitchMod, velocityMod) {
  const inst = _aw_state.instances[instId];
  if (!inst) return false;

  const audioCtx = _aw_getAudioCtx();
  let played = false;

  inst.voices.forEach((voice, idx) => {
    if (!voice.enabled) return;
    const key = `${word}_${idx}_${voice.pitch.toFixed(1)}`;
    const buffer = _aw_state.audioCache[key];
    if (!buffer) return;

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;

    // Apply pitch modification via playbackRate
    source.playbackRate.value = pitchMod || 1;

    // Apply volume
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = voice.volume * (velocityMod || 1);

    source.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    // Start with voice offset
    source.start(audioCtx.currentTime + voice.offset / 1000);
    played = true;
  });

  return played;
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
  return '<div id="aw-voice-' + idx + '-' + instId + '" style="background:#2a2a3a;border:2px outset #444;padding:8px;' + (voice.enabled ? 'border-color:#5a5a7a;' : 'opacity:0.5;') + '">' +
    '<div style="display:flex;align-items:center;gap:6px;padding-bottom:6px;border-bottom:1px solid #444;margin-bottom:6px;">' +
      '<input type="checkbox" id="aw-enable-' + idx + '-' + instId + '" ' + (voice.enabled ? 'checked' : '') + ' onchange="_aw_toggleVoice(\'' + instId + '\',' + idx + ',this.checked)">' +
      '<label style="font-weight:bold;color:#ffd700;">Voice ' + (idx + 1) + '</label>' +
      '<select id="aw-preset-' + idx + '-' + instId + '" onchange="_aw_setPreset(\'' + instId + '\',' + idx + ',this.value)" style="padding:2px 4px;background:#c0c0c0;border:2px inset #808080;font-size:10px;">' +
        presets.map(p => '<option value="' + p + '"' + (voice.preset === p ? ' selected' : '') + '>' + p.charAt(0).toUpperCase() + p.slice(1) + '</option>').join('') +
      '</select>' +
    '</div>' +
    '<div style="display:flex;flex-direction:column;gap:4px;">' +
      '<div style="display:flex;align-items:center;gap:6px;">' +
        '<label style="min-width:80px;font-size:10px;color:#aaa;">System Voice:</label>' +
        '<select id="aw-sysvoice-' + idx + '-' + instId + '" onchange="_aw_setSysVoice(\'' + instId + '\',' + idx + ',this.value)" style="flex:1;padding:2px;background:#c0c0c0;border:2px inset #808080;font-size:9px;max-width:140px;"><option>Loading...</option></select>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:6px;">' +
        '<label style="min-width:80px;font-size:10px;color:#aaa;">Pitch: <span id="aw-pitch-val-' + idx + '-' + instId + '" style="color:#ffd700;font-weight:bold;">' + voice.pitch.toFixed(1) + '</span></label>' +
        '<input type="range" min="0.5" max="2.0" step="0.1" value="' + voice.pitch + '" onchange="_aw_setPitch(\'' + instId + '\',' + idx + ',this.value)" style="flex:1;height:16px;">' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:6px;">' +
        '<label style="min-width:80px;font-size:10px;color:#aaa;">Rate: <span id="aw-rate-val-' + idx + '-' + instId + '" style="color:#ffd700;font-weight:bold;">' + voice.rate.toFixed(2) + '</span></label>' +
        '<input type="range" min="0.5" max="1.5" step="0.05" value="' + voice.rate + '" onchange="_aw_setRate(\'' + instId + '\',' + idx + ',this.value)" style="flex:1;height:16px;">' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:6px;">' +
        '<label style="min-width:80px;font-size:10px;color:#aaa;">Volume: <span id="aw-vol-val-' + idx + '-' + instId + '" style="color:#ffd700;font-weight:bold;">' + Math.round(voice.volume * 100) + '%</span></label>' +
        '<input type="range" min="0" max="1" step="0.05" value="' + voice.volume + '" onchange="_aw_setVolume(\'' + instId + '\',' + idx + ',this.value)" style="flex:1;height:16px;">' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:6px;">' +
        '<label style="min-width:80px;font-size:10px;color:#aaa;">Offset: <span id="aw-offset-val-' + idx + '-' + instId + '" style="color:#ffd700;font-weight:bold;">' + voice.offset + 'ms</span></label>' +
        '<input type="range" min="0" max="500" step="10" value="' + voice.offset + '" onchange="_aw_setOffset(\'' + instId + '\',' + idx + ',this.value)" style="flex:1;height:16px;">' +
      '</div>' +
    '</div>' +
  '</div>';
}

function _aw_open() {
  if (typeof hideStartMenu === 'function') hideStartMenu();

  _aw_state.counter++;
  const instId = 'aw-' + _aw_state.counter;

  const inst = {
    instId: instId,
    voices: [
      { enabled: true, preset: 'soprano', pitch: 1.4, rate: 0.9, volume: 0.8, offset: 0, voiceIdx: 0 },
      { enabled: true, preset: 'alto', pitch: 1.1, rate: 0.95, volume: 0.8, offset: 50, voiceIdx: 0 },
      { enabled: false, preset: 'tenor', pitch: 0.9, rate: 1.0, volume: 0.7, offset: 100, voiceIdx: 0 },
      { enabled: false, preset: 'bass', pitch: 0.7, rate: 1.0, volume: 0.7, offset: 150, voiceIdx: 0 },
      { enabled: false, preset: 'child', pitch: 1.6, rate: 1.1, volume: 0.6, offset: 0, voiceIdx: 0 },
      { enabled: false, preset: 'whisper', pitch: 1.0, rate: 0.8, volume: 0.5, offset: 200, voiceIdx: 0 }
    ],
    lyrics: 'Ah La Lu Alleluia Amen Oh Holy Light Divine',
    currentWordIndex: 0,
    availableVoices: []
  };

  _aw_state.instances[instId] = inst;

  ALGO.createWindow({
    title: 'Angelwave VOX - Choir Synthesizer',
    icon: '👼',
    width: 650,
    height: 500,
    content: '<div style="display:flex;flex-direction:column;height:100%;background:linear-gradient(180deg,#1a1a2e 0%,#16213e 100%);color:#e0e0e0;font-size:11px;">' +
      '<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:linear-gradient(180deg,#2a2a4a 0%,#1a1a3a 100%);border-bottom:2px groove #444;">' +
        '<span style="font-size:24px;">👼</span>' +
        '<span style="font-size:14px;font-weight:bold;color:#ffd700;text-shadow:1px 1px 2px #000;">ANGELWAVE VOX</span>' +
        '<span style="font-size:10px;color:#aaa;font-style:italic;">Celestial Choir Synthesizer</span>' +
      '</div>' +
      '<div style="display:flex;gap:4px;padding:4px 8px;background:#c0c0c0;border-bottom:2px groove #fff;">' +
        '<button onclick="_aw_testChoir(\'' + instId + '\')" style="padding:3px 8px;background:#c0c0c0;border:2px outset #fff;font-size:10px;cursor:pointer;">▶ Test</button>' +
        '<button onclick="_aw_stopChoir()" style="padding:3px 8px;background:#c0c0c0;border:2px outset #fff;font-size:10px;cursor:pointer;">■ Stop</button>' +
        '<button onclick="_aw_tightChorus(\'' + instId + '\')" style="padding:3px 8px;background:#ffe4b5;border:2px outset #fff;font-size:10px;cursor:pointer;" title="Enable all voices with tight 25ms offsets for chorus effect">🎶 Tight Chorus</button>' +
        '<button onclick="_aw_prerecordAll(\'' + instId + '\')" style="padding:3px 8px;background:#ffd0d0;border:2px outset #fff;font-size:10px;cursor:pointer;" title="Pre-record all voices for true simultaneous playback">🎙️ Pre-record</button>' +
        '<div style="width:1px;height:20px;background:#808080;margin:0 4px;"></div>' +
        '<button onclick="_aw_saveChoir(\'' + instId + '\')" style="padding:3px 8px;background:#c0c0c0;border:2px outset #fff;font-size:10px;cursor:pointer;">💾 Save</button>' +
        '<button onclick="_aw_loadChoir(\'' + instId + '\')" style="padding:3px 8px;background:#c0c0c0;border:2px outset #fff;font-size:10px;cursor:pointer;">📂 Load</button>' +
      '</div>' +
      '<div style="padding:8px;background:#2a2a3a;border-bottom:1px solid #444;">' +
        '<label style="display:block;margin-bottom:4px;color:#aaa;font-size:10px;">📜 Lyrics (space-separated - click Test to hear each word):</label>' +
        '<input type="text" id="aw-lyrics-' + instId + '" value="' + inst.lyrics + '" onchange="_aw_setLyrics(\'' + instId + '\',this.value)" style="width:100%;padding:6px;background:#1a1a2a;color:#fff;border:2px inset #333;font-size:12px;font-family:Georgia,serif;box-sizing:border-box;">' +
        '<div style="margin-top:6px;display:flex;align-items:center;gap:8px;font-size:11px;">' +
          'Current word: <span id="aw-current-word-' + instId + '" style="background:#ffd700;color:#000;padding:2px 8px;font-weight:bold;border-radius:2px;">Ah</span>' +
          '<button onclick="_aw_resetWord(\'' + instId + '\')" style="padding:2px 6px;background:#c0c0c0;border:2px outset #fff;font-size:10px;cursor:pointer;">↺ Reset</button>' +
          '<button onclick="_aw_nextWord(\'' + instId + '\')" style="padding:2px 6px;background:#c0c0c0;border:2px outset #fff;font-size:10px;cursor:pointer;">Next ▶</button>' +
        '</div>' +
      '</div>' +
      '<div id="aw-voices-' + instId + '" style="flex:1;overflow-y:auto;padding:8px;display:grid;grid-template-columns:repeat(2,1fr);gap:8px;">' +
        inst.voices.map((v, i) => _aw_renderVoicePanel(instId, i, v)).join('') +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:8px;padding:4px 8px;background:#c0c0c0;border-top:2px groove #fff;font-size:10px;color:#000;">' +
        '<span id="aw-status-' + instId + '">Ready - ' + inst.voices.filter(v => v.enabled).length + ' voices active</span>' +
      '</div>' +
    '</div>',
    onClose: () => delete _aw_state.instances[instId]
  });

  _aw_getVoices().then(voices => {
    inst.availableVoices = voices;
    _aw_updateVoiceSelects(instId);
  });
}

function _aw_updateVoiceSelects(instId) {
  const inst = _aw_state.instances[instId];
  if (!inst) return;
  inst.voices.forEach((voice, idx) => {
    const select = document.getElementById('aw-sysvoice-' + idx + '-' + instId);
    if (select && inst.availableVoices.length > 0) {
      select.innerHTML = inst.availableVoices.map((v, i) =>
        '<option value="' + i + '"' + (i === voice.voiceIdx ? ' selected' : '') + '>' + v.name + ' (' + v.lang + ')</option>'
      ).join('');
    }
  });
}

// Sing a word - uses pre-recorded audio if available for true polyphony,
// otherwise falls back to speechSynthesis (sequential)
function _aw_singWord(instId, word, pitchMod, velocityMod) {
  const inst = _aw_state.instances[instId];
  if (!inst) return;

  // Try pre-recorded polyphonic playback first
  if (_aw_state.usePrerecorded && _aw_playPrerecorded(instId, word, pitchMod, velocityMod)) {
    return; // Successfully played pre-recorded
  }

  // Fallback to speechSynthesis (sequential)
  if (!window.speechSynthesis) return;

  inst.voices.forEach((voice, idx) => {
    if (!voice.enabled) return;
    setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(word);
      if (inst.availableVoices.length > 0 && voice.voiceIdx < inst.availableVoices.length) {
        utterance.voice = inst.availableVoices[voice.voiceIdx];
      }
      utterance.pitch = Math.min(2, Math.max(0, voice.pitch * (pitchMod || 1)));
      utterance.rate = voice.rate;
      utterance.volume = voice.volume * (velocityMod || 1);
      speechSynthesis.speak(utterance);
    }, voice.offset);
  });
}

// Apply tight chorus preset - minimal offsets for "doubling" effect
function _aw_tightChorus(instId) {
  const inst = _aw_state.instances[instId];
  if (!inst) return;
  // Enable all voices with tight 25ms staggered offsets
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
    if (offsetEl) offsetEl.textContent = voice.offset + 'ms';
  });
  _aw_updateStatus(instId);
  if (typeof algoSpeak === 'function') algoSpeak('Tight chorus mode - all voices enabled with minimal offsets');
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
  if (el) el.textContent = 'Ready - ' + activeCount + ' voice' + (activeCount !== 1 ? 's' : '') + ' active';
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
    document.getElementById('aw-rate-val-' + idx + '-' + instId).textContent = p.rate.toFixed(2);
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
  document.getElementById('aw-rate-val-' + idx + '-' + instId).textContent = parseFloat(val).toFixed(2);
}

function _aw_setVolume(instId, idx, val) {
  const inst = _aw_state.instances[instId];
  if (!inst) return;
  inst.voices[idx].volume = parseFloat(val);
  document.getElementById('aw-vol-val-' + idx + '-' + instId).textContent = Math.round(parseFloat(val) * 100) + '%';
}

function _aw_setOffset(instId, idx, val) {
  const inst = _aw_state.instances[instId];
  if (!inst) return;
  inst.voices[idx].offset = parseInt(val);
  document.getElementById('aw-offset-val-' + idx + '-' + instId).textContent = val + 'ms';
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

function _aw_saveChoir(instId) {
  const inst = _aw_state.instances[instId];
  if (!inst) return;
  const name = prompt('Save choir as:', 'my-choir.choir');
  if (!name) return;
  const choirData = {
    format: 'angelwave-choir-v1',
    lyrics: inst.lyrics,
    voices: inst.voices.map(v => ({
      enabled: v.enabled, preset: v.preset, pitch: v.pitch,
      rate: v.rate, volume: v.volume, offset: v.offset, voiceIdx: v.voiceIdx
    }))
  };
  const fileName = name.endsWith('.choir') ? name : name + '.choir';
  if (typeof savedFiles !== 'undefined') {
    savedFiles.push({ name: fileName, content: JSON.stringify(choirData, null, 2), type: 'text', icon: '👼' });
    if (typeof saveState === 'function') saveState();
    if (typeof createDesktopIcons === 'function') createDesktopIcons();
  }
  ALGO.notify('Saved ' + fileName);
}

function _aw_loadChoir(instId) {
  const inst = _aw_state.instances[instId];
  if (!inst || typeof savedFiles === 'undefined') return;
  const choirFiles = savedFiles.filter(f => f.name.endsWith('.choir'));
  if (choirFiles.length === 0) {
    ALGO.notify('No .choir files found');
    return;
  }
  const fileName = prompt('Load choir file:\n' + choirFiles.map(f => '• ' + f.name).join('\n'), choirFiles[0].name);
  if (!fileName) return;
  const file = savedFiles.find(f => f.name === fileName || f.name === fileName + '.choir');
  if (!file) {
    ALGO.notify('File not found: ' + fileName);
    return;
  }
  try {
    const data = JSON.parse(file.content);
    if (data.format !== 'angelwave-choir-v1') throw new Error('Invalid format');
    inst.lyrics = data.lyrics || 'Ah';
    inst.currentWordIndex = 0;
    if (data.voices && data.voices.length === 6) inst.voices = data.voices;
    document.getElementById('aw-lyrics-' + instId).value = inst.lyrics;
    const container = document.getElementById('aw-voices-' + instId);
    if (container) {
      container.innerHTML = inst.voices.map((v, i) => _aw_renderVoicePanel(instId, i, v)).join('');
      _aw_updateVoiceSelects(instId);
    }
    _aw_updateCurrentWord(instId);
    _aw_updateStatus(instId);
    ALGO.notify('Loaded ' + fileName);
  } catch (e) {
    ALGO.notify('Error loading choir: ' + e.message);
  }
}

// Handle incoming MIDI messages from Joy or other apps
function _aw_handleMidiInput(message, opts, from) {
  // Find the first active instance to play the note
  const instId = Object.keys(_aw_state.instances)[0];
  if (!instId) return;

  const inst = _aw_state.instances[instId];
  if (!inst) return;

  // Flash MIDI indicator
  const indicator = document.getElementById('aw-midi-indicator-' + instId);
  if (indicator) {
    indicator.style.background = '#00ff00';
    setTimeout(() => { if (indicator) indicator.style.background = '#004400'; }, 100);
  }

  if (message.type === 'noteOn' || message.type === 'note') {
    // Map MIDI note to pitch modifier (middle C = 60 = 1.0)
    const pitchMod = Math.pow(2, (message.note - 60) / 12);
    const velocityMod = (message.velocity || 100) / 127;

    // Get the current word from lyrics
    const words = inst.lyrics.split(/\s+/).filter(w => w.length > 0);
    const word = words[inst.currentWordIndex % words.length] || 'Ah';

    _aw_singWord(instId, word, pitchMod, velocityMod);
    inst.currentWordIndex++;
    _aw_updateCurrentWord(instId);
  }
}

// Register with pubsub to receive MIDI from Joy and other apps
// Note: Browser speechSynthesis can only speak one utterance at a time,
// so true simultaneous chorus is not possible. Voices will be staggered
// by their offset values for a "call and response" style choir effect.
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
window._aw_saveChoir = _aw_saveChoir;
window._aw_loadChoir = _aw_loadChoir;
window._aw_handleMidiInput = _aw_handleMidiInput;
window._aw_tightChorus = _aw_tightChorus;
window._aw_prerecordAll = _aw_prerecordAll;

_aw_open();
