// System App: Chime Synth
// Windows-style sound effects synthesizer
ALGO.app.name = 'Chime Synth';
ALGO.app.icon = '🔔';

function _cs_open() {
  if (typeof hideStartMenu === 'function') hideStartMenu();
  const id = typeof winId !== 'undefined' ? winId : 0;

  ALGO.createWindow({
    title: 'Chime Synth',
    icon: '🔔',
    width: 400,
    height: 350,
    content: `
      <div style="padding:10px;background:#c0c0c0;height:100%;box-sizing:border-box;">
        <div style="background:white;border:2px inset #808080;padding:10px;margin-bottom:10px;">
          <b>Windows-Style Sound Effects</b><br>
          <small>Click to play classic system sounds</small>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
          <button onclick="playChime('startup')" style="padding:8px;background:#c0c0c0;border:2px outset #fff;cursor:pointer;">
            🖥️ Startup
          </button>
          <button onclick="playChime('shutdown')" style="padding:8px;background:#c0c0c0;border:2px outset #fff;cursor:pointer;">
            🌙 Shutdown
          </button>
          <button onclick="playChime('error')" style="padding:8px;background:#c0c0c0;border:2px outset #fff;cursor:pointer;">
            ❌ Error
          </button>
          <button onclick="playChime('warning')" style="padding:8px;background:#c0c0c0;border:2px outset #fff;cursor:pointer;">
            ⚠️ Warning
          </button>
          <button onclick="playChime('notify')" style="padding:8px;background:#c0c0c0;border:2px outset #fff;cursor:pointer;">
            🔔 Notify
          </button>
          <button onclick="playChime('success')" style="padding:8px;background:#c0c0c0;border:2px outset #fff;cursor:pointer;">
            ✅ Success
          </button>
          <button onclick="playChime('click')" style="padding:8px;background:#c0c0c0;border:2px outset #fff;cursor:pointer;">
            👆 Click
          </button>
          <button onclick="playChime('maximize')" style="padding:8px;background:#c0c0c0;border:2px outset #fff;cursor:pointer;">
            🔲 Maximize
          </button>
          <button onclick="playChime('minimize')" style="padding:8px;background:#c0c0c0;border:2px outset #fff;cursor:pointer;">
            ➖ Minimize
          </button>
          <button onclick="_cs_playCustom(${id})" style="padding:8px;background:#c0c0c0;border:2px outset #fff;cursor:pointer;">
            🎵 Custom
          </button>
        </div>
        <div style="margin-top:12px;background:white;border:2px inset #808080;padding:8px;">
          <b>Custom Chime</b><br>
          <div style="display:flex;gap:6px;margin-top:6px;align-items:center;">
            <label style="font-size:12px;">Freq:</label>
            <input type="range" id="cs-freq-${id}" min="200" max="2000" value="880" style="width:80px;">
            <span id="cs-freq-val-${id}" style="font-size:11px;width:40px;">880Hz</span>
          </div>
          <div style="display:flex;gap:6px;margin-top:4px;align-items:center;">
            <label style="font-size:12px;">Dur:</label>
            <input type="range" id="cs-dur-${id}" min="50" max="1000" value="200" style="width:80px;">
            <span id="cs-dur-val-${id}" style="font-size:11px;width:40px;">200ms</span>
          </div>
          <div style="display:flex;gap:6px;margin-top:4px;align-items:center;">
            <label style="font-size:12px;">Wave:</label>
            <select id="cs-wave-${id}" style="padding:2px;border:2px inset #808080;">
              <option value="sine">Sine</option>
              <option value="square">Square</option>
              <option value="triangle">Triangle</option>
              <option value="sawtooth">Sawtooth</option>
            </select>
          </div>
        </div>
      </div>
    `
  });

  // Setup range input listeners
  setTimeout(() => {
    const freqInput = document.getElementById('cs-freq-' + id);
    const durInput = document.getElementById('cs-dur-' + id);
    if (freqInput) {
      freqInput.oninput = () => {
        document.getElementById('cs-freq-val-' + id).textContent = freqInput.value + 'Hz';
      };
    }
    if (durInput) {
      durInput.oninput = () => {
        document.getElementById('cs-dur-val-' + id).textContent = durInput.value + 'ms';
      };
    }
  }, 100);
}

function _cs_playCustom(id) {
  const freq = parseFloat(document.getElementById('cs-freq-' + id)?.value || 880);
  const dur = parseFloat(document.getElementById('cs-dur-' + id)?.value || 200) / 1000;
  const wave = document.getElementById('cs-wave-' + id)?.value || 'sine';

  const ctx = getAudioContext();
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = wave;
  osc.frequency.setValueAtTime(freq, now);

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.4, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.01, now + dur);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + dur + 0.1);
}

// Run the app
_cs_open();
