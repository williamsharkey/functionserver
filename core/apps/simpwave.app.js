// FunctionServer App: windchime-dad
// Web Audio synthesizer that receives MIDI from other apps
// Based on the Go/SDL2 windchime-dad architecture

ALGO.app.name = 'windchime-dad';
ALGO.app.icon = '🎐';
ALGO.app.category = 'media';

(function() {
  'use strict';

  let audioCtx = null;
  let activeNotes = new Map();
  let masterGain = null;

  const state = {
    volume: 0.5,
    attack: 0.01,
    decay: 0.1,
    sustain: 0.6,
    release: 0.3,
    waveform: 'triangle',
    filterFreq: 2000,
    filterQ: 1
  };

  function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = state.volume;
    masterGain.connect(audioCtx.destination);
    console.log('windchime-dad: Audio initialized');
  }

  function midiToFreq(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
  }

  function playNote(note, velocity, duration) {
    initAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const freq = midiToFreq(note);
    const vel = (velocity || 100) / 127;

    // Create oscillator
    const osc = audioCtx.createOscillator();
    osc.type = state.waveform;
    osc.frequency.value = freq;

    // Create filter
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = state.filterFreq;
    filter.Q.value = state.filterQ;

    // Create envelope
    const env = audioCtx.createGain();
    const now = audioCtx.currentTime;

    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(vel * state.volume, now + state.attack);
    env.gain.linearRampToValueAtTime(vel * state.volume * state.sustain, now + state.attack + state.decay);

    // Connect
    osc.connect(filter);
    filter.connect(env);
    env.connect(masterGain);

    osc.start(now);

    // If duration specified, schedule release
    if (duration) {
      const releaseTime = now + duration;
      env.gain.setValueAtTime(vel * state.volume * state.sustain, releaseTime);
      env.gain.linearRampToValueAtTime(0, releaseTime + state.release);
      osc.stop(releaseTime + state.release + 0.1);
    } else {
      // Store for manual noteOff
      activeNotes.set(note, { osc, env, vel });
    }
  }

  function stopNote(note) {
    const noteData = activeNotes.get(note);
    if (!noteData) return;

    const { osc, env, vel } = noteData;
    const now = audioCtx.currentTime;

    env.gain.cancelScheduledValues(now);
    env.gain.setValueAtTime(env.gain.value, now);
    env.gain.linearRampToValueAtTime(0, now + state.release);
    osc.stop(now + state.release + 0.1);

    activeNotes.delete(note);
  }

  // Register MIDI input channel
  function registerChannel() {
    // Via ALGO.pubsub
    if (ALGO.pubsub) {
      ALGO.pubsub.register('windchime-dad', { autoOpen: false });
      ALGO.pubsub.subscribe('windchime-dad', (msg, opts, from) => {
        handleMidi(msg, from);
      });
    }

    // Via legacy _algoChannels
    window._algoChannels = window._algoChannels || {};
    window._algoChannels['windchime-dad'] = {
      callback: (msg, meta) => handleMidi(msg, meta?.sender)
    };

    console.log('windchime-dad: MIDI channel registered');
  }

  function handleMidi(msg, from) {
    if (msg.type === 'noteOn') {
      playNote(msg.note, msg.velocity, msg.duration);
    } else if (msg.type === 'noteOff') {
      stopNote(msg.note);
    } else if (msg.type === 'cc') {
      // Handle control changes
      if (msg.controller === 1) state.filterFreq = 100 + (msg.value / 127) * 4000;
      if (msg.controller === 7) state.volume = msg.value / 127;
    }
  }

  function render() {
    const el = document.getElementById('windchime-content');
    if (!el) return;

    el.innerHTML = `
      <div style="padding:10px;background:#1a2a1a;color:#afa;font-size:11px;height:100%;font-family:monospace;">
        <div style="font-size:14px;font-weight:bold;margin-bottom:10px;">🎐 windchime-dad</div>
        <div style="margin-bottom:8px;">Status: <span style="color:#4f4;">Ready</span></div>
        <div style="margin-bottom:8px;">MIDI Channel: <code>windchime-dad</code></div>

        <div style="margin-top:15px;padding-top:10px;border-top:1px solid #3a4a3a;">
          <div style="margin-bottom:8px;">Waveform:
            <select onchange="window._wc_setWave(this.value)" style="background:#2a3a2a;color:#afa;border:1px solid #4a5a4a;padding:2px;">
              <option value="triangle" ${state.waveform==='triangle'?'selected':''}>Triangle</option>
              <option value="sine" ${state.waveform==='sine'?'selected':''}>Sine</option>
              <option value="square" ${state.waveform==='square'?'selected':''}>Square</option>
              <option value="sawtooth" ${state.waveform==='sawtooth'?'selected':''}>Sawtooth</option>
            </select>
          </div>
          <div style="margin-bottom:8px;">Volume:
            <input type="range" min="0" max="100" value="${state.volume*100}"
              onchange="window._wc_setVol(this.value)" style="width:100px;">
          </div>
          <div style="margin-bottom:8px;">Filter:
            <input type="range" min="100" max="5000" value="${state.filterFreq}"
              onchange="window._wc_setFilter(this.value)" style="width:100px;">
          </div>
        </div>

        <div style="margin-top:15px;padding-top:10px;border-top:1px solid #3a4a3a;">
          <div style="margin-bottom:5px;">Test Keys:</div>
          <div style="display:flex;gap:4px;flex-wrap:wrap;">
            ${[60,62,64,65,67,69,71,72].map(n =>
              `<button onmousedown="window._wc_test(${n})" onmouseup="window._wc_stop(${n})"
                style="width:30px;height:40px;background:#3a4a3a;border:1px solid #5a6a5a;color:#afa;cursor:pointer;">
                ${['C','D','E','F','G','A','B','C'][n-60]}
              </button>`
            ).join('')}
          </div>
        </div>

        <div style="margin-top:15px;color:#696;">
          Send MIDI to channel "windchime-dad" from fs-joy or Deepwave Gold
        </div>
      </div>
    `;
  }

  // Control functions
  window._wc_setWave = function(w) { state.waveform = w; };
  window._wc_setVol = function(v) {
    state.volume = v / 100;
    if (masterGain) masterGain.gain.value = state.volume;
  };
  window._wc_setFilter = function(f) { state.filterFreq = parseInt(f); };
  window._wc_test = function(n) { playNote(n, 100); };
  window._wc_stop = function(n) { stopNote(n); };

  // Create window
  if (typeof createWindow === 'function') {
    createWindow({
      title: 'windchime-dad - Synthesizer',
      icon: '🎐',
      width: 320,
      height: 350,
      content: '<div id="windchime-content" style="height:100%;"></div>',
      onClose: () => {
        // Cleanup
        if (ALGO.pubsub?.unregister) ALGO.pubsub.unregister('windchime-dad');
        if (window._algoChannels) delete window._algoChannels['windchime-dad'];
      }
    });
    setTimeout(() => {
      registerChannel();
      render();
    }, 50);
  }
})();
