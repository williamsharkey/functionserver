// System App: Shade Station
// WebGL Shader Editor
ALGO.app.name = 'Shade Station';
ALGO.app.icon = '🎨';

// App state
const _ss_instances = {}; // winId -> { gl, program, canvas, animFrame, time, mouse }

const _ss_DEFAULT = `precision mediump float;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec3 col = 0.5 + 0.5 * cos(u_time + uv.xyx + vec3(0, 2, 4));
  gl_FragColor = vec4(col, 1.0);
}`;

const _ss_PRESETS = {
  'Rainbow': _ss_DEFAULT,
  'Plasma': `precision mediump float;
uniform float u_time;
uniform vec2 u_resolution;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float t = u_time * 0.5;
  float v = sin(uv.x * 10.0 + t) + sin(uv.y * 10.0 + t);
  v += sin((uv.x + uv.y) * 10.0 + t);
  v += sin(sqrt(uv.x*uv.x + uv.y*uv.y) * 10.0 + t);
  vec3 col = vec3(sin(v), sin(v + 2.0), sin(v + 4.0)) * 0.5 + 0.5;
  gl_FragColor = vec4(col, 1.0);
}`,
  'Circles': `precision mediump float;
uniform float u_time;
uniform vec2 u_resolution;

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float d = length(uv);
  float c = sin(d * 20.0 - u_time * 3.0) * 0.5 + 0.5;
  gl_FragColor = vec4(vec3(c * 0.2, c * 0.5, c), 1.0);
}`,
  'Mouse': `precision mediump float;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec2 mouse = u_mouse / u_resolution;
  float d = distance(uv, mouse);
  float glow = 0.02 / d;
  vec3 col = vec3(glow * 0.5, glow * 0.8, glow);
  gl_FragColor = vec4(col, 1.0);
}`
};

function _ss_open() {
  if (typeof hideStartMenu === 'function') hideStartMenu();
  const id = typeof winId !== 'undefined' ? winId : 0;
  const esc = typeof escapeHtml === 'function' ? escapeHtml : (s => s);

  ALGO.createWindow({
    title: 'Shade Station',
    icon: '🎨',
    width: 700,
    height: 480,
    content: ''
  });

  const win = typeof getWindowById === 'function' ? getWindowById(id) : document.querySelector('.window:last-child');
  if (!win) return;

  const content = win.querySelector('.window-content');
  content.style.background = '#1a1a2e';
  content.style.padding = '0';
  content.style.overflow = 'hidden';

  const presetOptions = Object.keys(_ss_PRESETS).map(k => '<option value="' + k + '">' + k + '</option>').join('');

  content.innerHTML = `
    <div class="shade-station">
      <div class="shade-station-toolbar">
        <button onclick="_ss_new(${id})">New</button>
        <select onchange="_ss_preset(${id}, this.value)">
          <option value="">-- Presets --</option>
          ${presetOptions}
        </select>
        <span style="margin-left:auto;color:#888;" id="ss-filename-${id}">untitled.shader</span>
      </div>
      <div class="shade-station-main">
        <div class="shade-station-canvas-wrap">
          <canvas id="ss-canvas-${id}"></canvas>
        </div>
        <div class="shade-station-editor">
          <textarea id="ss-code-${id}" spellcheck="false">${esc(_ss_DEFAULT)}</textarea>
          <div class="shade-station-uniforms">
            <label>Speed: <input type="range" min="0" max="2" step="0.1" value="1" id="ss-speed-${id}"></label>
            <label><input type="checkbox" id="ss-pause-${id}"> Pause</label>
          </div>
          <div class="shade-station-status" id="ss-status-${id}">Ready - Edit shader and it auto-compiles</div>
        </div>
      </div>
    </div>
  `;

  // Initialize WebGL
  setTimeout(() => _ss_init(id), 100);

  // Auto-compile on edit
  const textarea = document.getElementById('ss-code-' + id);
  if (textarea) textarea.addEventListener('input', () => _ss_compile(id));
}

function _ss_init(id) {
  const canvas = document.getElementById('ss-canvas-' + id);
  if (!canvas) return;

  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  if (!gl) {
    const status = document.getElementById('ss-status-' + id);
    if (status) {
      status.textContent = 'WebGL not supported';
      status.classList.add('error');
    }
    return;
  }

  _ss_instances[id] = {
    gl,
    canvas,
    program: null,
    time: 0,
    mouse: [0, 0],
    animFrame: null
  };

  // Mouse tracking
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    _ss_instances[id].mouse = [
      e.clientX - rect.left,
      rect.height - (e.clientY - rect.top)
    ];
  });

  // Resize observer
  const resizeObserver = new ResizeObserver(() => {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    gl.viewport(0, 0, canvas.width, canvas.height);
  });
  resizeObserver.observe(canvas.parentElement);

  _ss_compile(id);
}

function _ss_compile(id) {
  const inst = _ss_instances[id];
  if (!inst) return;

  const { gl, canvas } = inst;
  const fragSource = document.getElementById('ss-code-' + id)?.value || '';
  const statusEl = document.getElementById('ss-status-' + id);

  const vertSource = `
    attribute vec2 a_position;
    void main() { gl_Position = vec4(a_position, 0, 1); }
  `;

  // Compile vertex shader
  const vertShader = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vertShader, vertSource);
  gl.compileShader(vertShader);

  // Compile fragment shader
  const fragShader = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fragShader, fragSource);
  gl.compileShader(fragShader);

  if (!gl.getShaderParameter(fragShader, gl.COMPILE_STATUS)) {
    const err = gl.getShaderInfoLog(fragShader);
    if (statusEl) {
      statusEl.textContent = 'Error: ' + err;
      statusEl.classList.add('error');
    }
    return;
  }

  // Link program
  const program = gl.createProgram();
  gl.attachShader(program, vertShader);
  gl.attachShader(program, fragShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    if (statusEl) {
      statusEl.textContent = 'Link error: ' + gl.getProgramInfoLog(program);
      statusEl.classList.add('error');
    }
    return;
  }

  if (statusEl) {
    statusEl.textContent = 'Compiled successfully';
    statusEl.classList.remove('error');
  }

  // Clean up old
  if (inst.program) gl.deleteProgram(inst.program);
  if (inst.animFrame) cancelAnimationFrame(inst.animFrame);

  inst.program = program;
  gl.useProgram(program);

  // Set up geometry
  const posBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

  const posLoc = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  // Render loop
  function render() {
    const pauseEl = document.getElementById('ss-pause-' + id);
    const speedEl = document.getElementById('ss-speed-' + id);

    if (!document.getElementById('ss-canvas-' + id)) {
      // Window closed - cleanup
      if (_ss_instances[id]) {
        delete _ss_instances[id];
      }
      return;
    }

    const paused = pauseEl?.checked;
    const speed = speedEl ? parseFloat(speedEl.value) : 1;

    if (!paused) {
      inst.time = (inst.time || 0) + 0.016 * speed;
    }

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const timeLoc = gl.getUniformLocation(program, 'u_time');
    const resLoc = gl.getUniformLocation(program, 'u_resolution');
    const mouseLoc = gl.getUniformLocation(program, 'u_mouse');

    if (timeLoc) gl.uniform1f(timeLoc, inst.time || 0);
    if (resLoc) gl.uniform2f(resLoc, canvas.width, canvas.height);
    if (mouseLoc) gl.uniform2f(mouseLoc, inst.mouse[0], inst.mouse[1]);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    inst.animFrame = requestAnimationFrame(render);
  }

  render();
}

function _ss_new(id) {
  const code = document.getElementById('ss-code-' + id);
  const fname = document.getElementById('ss-filename-' + id);
  if (code) code.value = _ss_DEFAULT;
  if (fname) fname.textContent = 'untitled.shader';
  _ss_compile(id);
}

function _ss_preset(id, name) {
  if (!name || !_ss_PRESETS[name]) return;
  const code = document.getElementById('ss-code-' + id);
  const fname = document.getElementById('ss-filename-' + id);
  if (code) code.value = _ss_PRESETS[name];
  if (fname) fname.textContent = name.toLowerCase() + '.shader';
  _ss_compile(id);
}

// Run the app
_ss_open();
