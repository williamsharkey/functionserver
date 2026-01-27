// FunctionServer App: simpwave
// Simple Web Audio synthesizer that receives MIDI from other apps
ALGO.app.name = 'simpwave';
ALGO.app.icon = '🌊';
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
    console.log('simpwave: Audio initialized');
  }

  function midiToFreq(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
  }

  function playNote(note, velocity, duration) {
    initAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const freq = midiToFreq(note);
    const vel = (velocity || 100) / 127;

    const osc = audioCtx.createOscillator();
    osc.type = state.waveform;
    osc.frequency.value = freq;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = state.filterFreq;
    filter.Q.value = state.filterQ;

    const env = audioCtx.createGain();
    const now = audioCtx.currentTime;

    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(vel * state.volume, now + state.attack);
    env.gain.linearRampToValueAtTime(vel * state.volume * state.sustain, now + state.attack + state.decay);

    osc.connect(filter);
    filter.connect(env);
    env.connect(masterGain);
    osc.start(now);

    if (duration) {
      const releaseTime = now + duration;
      env.gain.setValueAtTime(vel * state.volume * state.sustain, releaseTime);
      env.gain.linearRampToValueAtTime(0, releaseTime + state.release);
      osc.stop(releaseTime + state.release + 0.1);
    } else {
      activeNotes.set(note, { osc, env, vel });
    }
  }

  function stopNote(note) {
    const noteData = activeNotes.get(note);
    if (!noteData) return;

    const { osc, env } = noteData;
    const now = audioCtx.currentTime;

    env.gain.cancelScheduledValues(now);
    env.gain.setValueAtTime(env.gain.value, now);
    env.gain.linearRampToValueAtTime(0, now + state.release);
    osc.stop(now + state.release + 0.1);
    activeNotes.delete(note);
  }

  function registerChannel() {
    if (ALGO.pubsub) {
      ALGO.pubsub.register('simpwave', { autoOpen: false });
      ALGO.pubsub.subscribe('simpwave', (msg, opts, from) => handleMidi(msg, from));
    }
    window._algoChannels = window._algoChannels || {};
    window._algoChannels['simpwave'] = { callback: (msg, meta) => handleMidi(msg, meta?.sender) };
    console.log('simpwave: MIDI channel registered');
  }

  function handleMidi(msg, from) {
    if (msg.type === 'noteOn') playNote(msg.note, msg.velocity, msg.duration);
    else if (msg.type === 'noteOff') stopNote(msg.note);
    else if (msg.type === 'cc') {
      if (msg.controller === 1) state.filterFreq = 100 + (msg.value / 127) * 4000;
      if (msg.controller === 7) state.volume = msg.value / 127;
    }
  }

  function render() {
    const el = document.getElementById('simpwave-content');
    if (!el) return;

    el.innerHTML = `
      <div style="padding:10px;background:#1a1a2a;color:#aaf;font-size:11px;height:100%;font-family:monospace;">
        <div style="font-size:14px;font-weight:bold;margin-bottom:10px;">🌊 simpwave</div>
        <div style="margin-bottom:8px;">Status: <span style="color:#4f4;">Ready</span></div>
        <div style="margin-bottom:8px;">MIDI Channel: <code>simpwave</code></div>

        <div style="margin-top:15px;padding-top:10px;border-top:1px solid #3a3a4a;">
          <div style="margin-bottom:8px;">Waveform:
            <select onchange="window._sw_setWave(this.value)" style="background:#2a2a3a;color:#aaf;border:1px solid #4a4a5a;padding:2px;">
              <option value="triangle" ${state.waveform==='triangle'?'selected':''}>Triangle</option>
              <option value="sine" ${state.waveform==='sine'?'selected':''}>Sine</option>
              <option value="square" ${state.waveform==='square'?'selected':''}>Square</option>
              <option value="sawtooth" ${state.waveform==='sawtooth'?'selected':''}>Sawtooth</option>
            </select>
          </div>
          <div style="margin-bottom:8px;">Volume:
            <input type="range" min="0" max="100" value="${state.volume*100}"
              onchange="window._sw_setVol(this.value)" style="width:100px;">
          </div>
          <div style="margin-bottom:8px;">Filter:
            <input type="range" min="100" max="5000" value="${state.filterFreq}"
              onchange="window._sw_setFilter(this.value)" style="width:100px;">
          </div>
        </div>

        <div style="margin-top:15px;padding-top:10px;border-top:1px solid #3a3a4a;">
          <div style="margin-bottom:5px;">Test Keys:</div>
          <div style="display:flex;gap:4px;flex-wrap:wrap;">
            ${[60,62,64,65,67,69,71,72].map(n =>
              `<button onmousedown="window._sw_test(${n})" onmouseup="window._sw_stop(${n})"
                style="width:30px;height:40px;background:#3a3a4a;border:1px solid #5a5a6a;color:#aaf;cursor:pointer;">
                ${['C','D','E','F','G','A','B','C'][n-60]}
              </button>`
            ).join('')}
          </div>
        </div>

        <div style="margin-top:15px;color:#669;">
          Send MIDI to channel "simpwave" from fs-joy
        </div>
      </div>
    `;
  }

  window._sw_setWave = function(w) { state.waveform = w; };
  window._sw_setVol = function(v) { state.volume = v / 100; if (masterGain) masterGain.gain.value = state.volume; };
  window._sw_setFilter = function(f) { state.filterFreq = parseInt(f); };
  window._sw_test = function(n) { playNote(n, 100); };
  window._sw_stop = function(n) { stopNote(n); };

  if (typeof createWindow === 'function') {
    createWindow({
      title: 'simpwave',
      icon: '🌊',
      width: 300,
      height: 320,
      content: '<div id="simpwave-content" style="height:100%;"></div>',
      onClose: () => {
        if (ALGO.pubsub?.unregister) ALGO.pubsub.unregister('simpwave');
        if (window._algoChannels) delete window._algoChannels['simpwave'];
      }
    });
    setTimeout(() => { registerChannel(); render(); }, 50);
  }
})();
