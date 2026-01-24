// System App: Glass Studio
// Three.js 3D Glass Renderer
ALGO.app.name = 'Glass Studio';
ALGO.app.icon = '💎';

const _gs_instances = {};

const _gs_PRESETS = {
  'Clear Glass': { color: '#ffffff', transmission: 1.0, roughness: 0.0, ior: 1.5, thickness: 0.2 },
  'Amber Glass': { color: '#ffaa44', transmission: 1.0, roughness: 0.0, ior: 1.5, thickness: 0.5 },
  'Frosted': { color: '#ffffff', transmission: 0.95, roughness: 0.3, ior: 1.4, thickness: 0.5 },
  'Ruby': { color: '#ff2244', transmission: 1.0, roughness: 0.0, ior: 1.7, thickness: 0.8 },
  'Emerald': { color: '#22ff66', transmission: 1.0, roughness: 0.0, ior: 1.6, thickness: 0.7 },
  'Sapphire': { color: '#4466ff', transmission: 1.0, roughness: 0.0, ior: 1.7, thickness: 0.8 },
  'Obsidian': { color: '#111118', transmission: 0.8, roughness: 0.05, ior: 1.5, thickness: 2.0 }
};

const _gs_SHAPES = ['Rounded Box', 'Sphere', 'Torus', 'Blob', 'Icon Pill'];

function _gs_open() {
  if (typeof hideStartMenu === 'function') hideStartMenu();
  const id = Date.now();

  ALGO.createWindow({
    title: 'Glass Studio',
    icon: '💎',
    width: 750,
    height: 520,
    content: ''
  });

  const win = document.querySelector('.window:last-child');
  if (!win) return;

  const content = win.querySelector('.window-content');
  content.style.cssText = 'background:#1a1a2e;padding:0;overflow:hidden;display:flex;';

  const presetOpts = Object.keys(_gs_PRESETS).map(k => `<option value="${k}">${k}</option>`).join('');
  const shapeOpts = _gs_SHAPES.map(s => `<option value="${s}">${s}</option>`).join('');

  content.innerHTML = `
    <div class="gs-main" style="flex:1;display:flex;flex-direction:column;">
      <canvas id="gs-canvas-${id}" style="flex:1;"></canvas>
    </div>
    <div class="gs-sidebar" style="width:200px;padding:12px;background:#12121a;color:#ccc;font-size:12px;overflow-y:auto;">
      <div style="margin-bottom:12px;">
        <label>Preset</label>
        <select id="gs-preset-${id}" style="width:100%;margin-top:4px;padding:4px;" onchange="_gs_loadPreset(${id}, this.value)">
          <option value="">-- Select --</option>
          ${presetOpts}
        </select>
      </div>
      <div style="margin-bottom:12px;">
        <label>Shape</label>
        <select id="gs-shape-${id}" style="width:100%;margin-top:4px;padding:4px;" onchange="_gs_setShape(${id}, this.value)">
          ${shapeOpts}
        </select>
      </div>
      <div style="margin-bottom:8px;">
        <label>Color</label>
        <input type="color" id="gs-color-${id}" value="#ffaa44" style="width:100%;height:30px;margin-top:4px;" onchange="_gs_updateMaterial(${id})">
      </div>
      <div style="margin-bottom:8px;">
        <label>Transmission: <span id="gs-trans-val-${id}">0.95</span></label>
        <input type="range" id="gs-trans-${id}" min="0" max="1" step="0.01" value="0.95" style="width:100%;" oninput="_gs_updateMaterial(${id})">
      </div>
      <div style="margin-bottom:8px;">
        <label>Roughness: <span id="gs-rough-val-${id}">0.05</span></label>
        <input type="range" id="gs-rough-${id}" min="0" max="1" step="0.01" value="0.05" style="width:100%;" oninput="_gs_updateMaterial(${id})">
      </div>
      <div style="margin-bottom:8px;">
        <label>IOR: <span id="gs-ior-val-${id}">1.5</span></label>
        <input type="range" id="gs-ior-${id}" min="1" max="2.5" step="0.01" value="1.5" style="width:100%;" oninput="_gs_updateMaterial(${id})">
      </div>
      <div style="margin-bottom:8px;">
        <label>Thickness: <span id="gs-thick-val-${id}">0.5</span></label>
        <input type="range" id="gs-thick-${id}" min="0" max="2" step="0.01" value="0.5" style="width:100%;" oninput="_gs_updateMaterial(${id})">
      </div>
      <div style="margin-bottom:12px;">
        <label>Background</label>
        <select id="gs-bg-${id}" style="width:100%;margin-top:4px;padding:4px;" onchange="_gs_setBg(${id}, this.value)">
          <option value="gradient">Gradient</option>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
          <option value="transparent">Transparent</option>
        </select>
      </div>
      <div style="margin-bottom:8px;">
        <label><input type="checkbox" id="gs-rotate-${id}" checked onchange="_gs_toggleRotate(${id})"> Auto Rotate</label>
      </div>
      <hr style="border-color:#333;margin:12px 0;">
      <div style="margin-bottom:8px;">
        <label>Text / Emoji</label>
        <input type="text" id="gs-text-${id}" placeholder="💻 or Start" style="width:100%;margin-top:4px;padding:6px;font-size:16px;" onchange="_gs_updateText(${id})">
      </div>
      <div style="margin-bottom:8px;">
        <label>Text Mode</label>
        <select id="gs-textmode-${id}" style="width:100%;margin-top:4px;padding:4px;" onchange="_gs_updateText(${id})">
          <option value="inside">Inside (floating)</option>
          <option value="emboss">Embossed (raised)</option>
          <option value="engrave">Engraved (carved)</option>
          <option value="cutout">Cutout (void)</option>
        </select>
      </div>
      <div style="margin-bottom:8px;">
        <label>Fit</label>
        <select id="gs-fit-${id}" style="width:100%;margin-top:4px;padding:4px;" onchange="_gs_updateText(${id})">
          <option value="square">Square</option>
          <option value="rect">Rectangle (fit text)</option>
        </select>
      </div>
      <div style="margin-bottom:8px;">
        <label>Text Depth: <span id="gs-textdepth-val-${id}">0.3</span></label>
        <input type="range" id="gs-textdepth-${id}" min="0.05" max="1" step="0.05" value="0.3" style="width:100%;" oninput="_gs_updateText(${id})">
      </div>
      <button onclick="_gs_export(${id})" style="width:100%;padding:8px;margin-top:8px;cursor:pointer;">Export PNG</button>
    </div>
  `;

  // Load Three.js and init after a brief delay to ensure DOM is ready
  _gs_loadThree().then(() => {
    setTimeout(() => _gs_init(id), 100);
  });
}

async function _gs_loadThree() {
  if (window.THREE) return;

  // Load Three.js r160 for best MeshPhysicalMaterial support
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function _gs_init(id) {
  const canvas = document.getElementById('gs-canvas-' + id);
  if (!canvas || !window.THREE) return;

  // Ensure canvas has dimensions
  let width = canvas.clientWidth || 500;
  let height = canvas.clientHeight || 400;
  if (width < 10 || height < 10) {
    width = 500;
    height = 400;
  }

  const THREE = window.THREE;

  // Scene
  const scene = new THREE.Scene();

  // Camera
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
  camera.position.set(0, 0, 4);

  // Renderer
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  // Environment - create gradient environment
  const envScene = new THREE.Scene();
  const envGeo = new THREE.SphereGeometry(50, 32, 32);
  const envMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      topColor: { value: new THREE.Color(0x88aaff) },
      bottomColor: { value: new THREE.Color(0x223344) }
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition).y * 0.5 + 0.5;
        gl_FragColor = vec4(mix(bottomColor, topColor, h), 1.0);
      }
    `
  });
  const envMesh = new THREE.Mesh(envGeo, envMat);
  envScene.add(envMesh);

  // Create environment map from scene
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileCubemapShader();
  const envMap = pmremGenerator.fromScene(envScene).texture;
  scene.environment = envMap;
  scene.background = envMap;

  // Lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 2);
  dirLight.position.set(5, 5, 5);
  scene.add(dirLight);

  const dirLight2 = new THREE.DirectionalLight(0x8888ff, 1);
  dirLight2.position.set(-5, 3, -5);
  scene.add(dirLight2);

  // Glass material - transmission requires transparent:true
  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0xffffff),
    metalness: 0,
    roughness: 0,
    transmission: 1,
    thickness: 0.5,
    ior: 1.5,
    envMapIntensity: 1,
    transparent: true,
    opacity: 1,
    side: THREE.DoubleSide,
    attenuationColor: new THREE.Color(0xffffff),
    attenuationDistance: 2.0
  });

  // Default geometry - rounded box
  let geometry = _gs_createRoundedBox(1.2, 1.2, 0.4, 0.15, 8);
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  // Simple drag controls
  let isDragging = false;
  let prevMouse = { x: 0, y: 0 };
  let targetRotation = { x: 0, y: 0 };

  canvas.addEventListener('mousedown', (e) => {
    isDragging = true;
    prevMouse = { x: e.clientX, y: e.clientY };
  });

  canvas.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - prevMouse.x;
    const dy = e.clientY - prevMouse.y;
    targetRotation.y += dx * 0.01;
    targetRotation.x += dy * 0.01;
    prevMouse = { x: e.clientX, y: e.clientY };
  });

  canvas.addEventListener('mouseup', () => isDragging = false);
  canvas.addEventListener('mouseleave', () => isDragging = false);

  // Store instance
  _gs_instances[id] = {
    scene, camera, renderer, mesh, material,
    envMap, pmremGenerator, envScene, envMat,
    autoRotate: true, bgType: 'gradient',
    targetRotation, isDragging: () => isDragging
  };

  // Animation loop
  function animate() {
    if (!document.getElementById('gs-canvas-' + id)) {
      // Cleanup
      renderer.dispose();
      material.dispose();
      geometry.dispose();
      delete _gs_instances[id];
      return;
    }

    const inst = _gs_instances[id];
    if (inst.autoRotate && !isDragging) {
      inst.targetRotation.y += 0.005;
      inst.targetRotation.x = Math.sin(Date.now() * 0.001) * 0.1;
    }

    // Smooth rotation
    inst.mesh.rotation.x += (inst.targetRotation.x - inst.mesh.rotation.x) * 0.1;
    inst.mesh.rotation.y += (inst.targetRotation.y - inst.mesh.rotation.y) * 0.1;

    inst.renderer.render(inst.scene, inst.camera);
    requestAnimationFrame(animate);
  }
  animate();

  // Resize observer
  const resizeObserver = new ResizeObserver(() => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  });
  resizeObserver.observe(canvas);

  // Load default preset
  _gs_loadPreset(id, 'Amber Glass');
}

function _gs_createRoundedBox(width, height, depth, radius, segments) {
  const THREE = window.THREE;
  const shape = new THREE.Shape();
  const w = width / 2 - radius;
  const h = height / 2 - radius;

  shape.moveTo(-w, -height/2);
  shape.lineTo(w, -height/2);
  shape.quadraticCurveTo(width/2, -height/2, width/2, -h);
  shape.lineTo(width/2, h);
  shape.quadraticCurveTo(width/2, height/2, w, height/2);
  shape.lineTo(-w, height/2);
  shape.quadraticCurveTo(-width/2, height/2, -width/2, h);
  shape.lineTo(-width/2, -h);
  shape.quadraticCurveTo(-width/2, -height/2, -w, -height/2);

  const extrudeSettings = {
    depth: depth,
    bevelEnabled: true,
    bevelThickness: radius,
    bevelSize: radius,
    bevelSegments: segments
  };

  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geometry.center();
  return geometry;
}

function _gs_loadPreset(id, name) {
  const preset = _gs_PRESETS[name];
  if (!preset) return;

  document.getElementById('gs-color-' + id).value = preset.color;
  document.getElementById('gs-trans-' + id).value = preset.transmission;
  document.getElementById('gs-rough-' + id).value = preset.roughness;
  document.getElementById('gs-ior-' + id).value = preset.ior;
  document.getElementById('gs-thick-' + id).value = preset.thickness;

  _gs_updateMaterial(id);
}

function _gs_updateMaterial(id) {
  const inst = _gs_instances[id];
  if (!inst) return;

  const color = document.getElementById('gs-color-' + id).value;
  const trans = parseFloat(document.getElementById('gs-trans-' + id).value);
  const rough = parseFloat(document.getElementById('gs-rough-' + id).value);
  const ior = parseFloat(document.getElementById('gs-ior-' + id).value);
  const thick = parseFloat(document.getElementById('gs-thick-' + id).value);

  // Update value displays
  document.getElementById('gs-trans-val-' + id).textContent = trans.toFixed(2);
  document.getElementById('gs-rough-val-' + id).textContent = rough.toFixed(2);
  document.getElementById('gs-ior-val-' + id).textContent = ior.toFixed(2);
  document.getElementById('gs-thick-val-' + id).textContent = thick.toFixed(2);

  // Use attenuationColor for glass tint, keep base color white for clarity
  // Higher attenuationDistance = more transparent tint
  inst.material.attenuationColor.set(color);
  inst.material.attenuationDistance = 2.0;
  inst.material.transmission = trans;
  inst.material.roughness = rough;
  inst.material.ior = ior;
  inst.material.thickness = thick;
  inst.material.needsUpdate = true;
}

function _gs_setShape(id, shapeName) {
  const inst = _gs_instances[id];
  if (!inst) return;
  const THREE = window.THREE;

  let geometry;
  switch (shapeName) {
    case 'Sphere':
      geometry = new THREE.SphereGeometry(0.8, 64, 64);
      break;
    case 'Torus':
      geometry = new THREE.TorusGeometry(0.6, 0.25, 32, 64);
      break;
    case 'Blob':
      geometry = new THREE.IcosahedronGeometry(0.9, 4);
      // Deform vertices for blob effect
      const pos = geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const noise = Math.sin(x * 3) * Math.sin(y * 3) * Math.sin(z * 3) * 0.15;
        const len = Math.sqrt(x*x + y*y + z*z);
        const scale = (0.9 + noise) / len;
        pos.setXYZ(i, x * scale, y * scale, z * scale);
      }
      geometry.computeVertexNormals();
      break;
    case 'Icon Pill':
      geometry = _gs_createRoundedBox(1.4, 1.4, 0.5, 0.3, 12);
      break;
    case 'Rounded Box':
    default:
      geometry = _gs_createRoundedBox(1.2, 1.2, 0.4, 0.15, 8);
      break;
  }

  inst.mesh.geometry.dispose();
  inst.mesh.geometry = geometry;
}

function _gs_setBg(id, bgType) {
  const inst = _gs_instances[id];
  if (!inst) return;
  const THREE = window.THREE;

  inst.bgType = bgType;

  switch (bgType) {
    case 'transparent':
      inst.scene.background = null;
      inst.renderer.setClearColor(0x000000, 0);
      break;
    case 'dark':
      inst.envMat.uniforms.topColor.value.set(0x222244);
      inst.envMat.uniforms.bottomColor.value.set(0x111122);
      const darkEnv = inst.pmremGenerator.fromScene(inst.envScene).texture;
      inst.scene.environment = darkEnv;
      inst.scene.background = darkEnv;
      break;
    case 'light':
      inst.envMat.uniforms.topColor.value.set(0xffffff);
      inst.envMat.uniforms.bottomColor.value.set(0xccccdd);
      const lightEnv = inst.pmremGenerator.fromScene(inst.envScene).texture;
      inst.scene.environment = lightEnv;
      inst.scene.background = lightEnv;
      break;
    case 'gradient':
    default:
      inst.envMat.uniforms.topColor.value.set(0x88aaff);
      inst.envMat.uniforms.bottomColor.value.set(0x223344);
      const gradEnv = inst.pmremGenerator.fromScene(inst.envScene).texture;
      inst.scene.environment = gradEnv;
      inst.scene.background = gradEnv;
      break;
  }
}

function _gs_toggleRotate(id) {
  const inst = _gs_instances[id];
  if (!inst) return;
  inst.autoRotate = document.getElementById('gs-rotate-' + id).checked;
}

function _gs_export(id) {
  const inst = _gs_instances[id];
  if (!inst) return;

  // Render one frame
  inst.renderer.render(inst.scene, inst.camera);

  // Get data URL
  const dataUrl = inst.renderer.domElement.toDataURL('image/png');

  // Download
  const link = document.createElement('a');
  link.download = 'glass-icon.png';
  link.href = dataUrl;
  link.click();

  algoSpeak('Exported glass-icon.png');
}

// Create text/emoji geometry from canvas
function _gs_createTextGeometry(text, depth) {
  const THREE = window.THREE;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // Measure text
  const fontSize = 200;
  ctx.font = `${fontSize}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
  const metrics = ctx.measureText(text);
  const textWidth = metrics.width;
  const textHeight = fontSize * 1.2;

  // Set canvas size with padding
  const padding = 20;
  canvas.width = textWidth + padding * 2;
  canvas.height = textHeight + padding * 2;

  // Draw text
  ctx.fillStyle = 'white';
  ctx.font = `${fontSize}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  // Get image data and trace outline
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const shapes = _gs_traceShapes(imageData, canvas.width, canvas.height);

  if (shapes.length === 0) return null;

  // Create extrude geometry from shapes
  const extrudeSettings = {
    depth: depth * 100,
    bevelEnabled: true,
    bevelThickness: 5,
    bevelSize: 3,
    bevelSegments: 3
  };

  const geometries = shapes.map(shape => new THREE.ExtrudeGeometry(shape, extrudeSettings));
  const mergedGeometry = geometries.length > 0 ? geometries[0] : null;

  if (mergedGeometry) {
    // Scale and center
    mergedGeometry.center();
    const scale = 2 / Math.max(canvas.width, canvas.height);
    mergedGeometry.scale(scale, -scale, scale);
  }

  return { geometry: mergedGeometry, aspect: textWidth / textHeight };
}

// Simple shape tracing from bitmap (marching squares simplified)
function _gs_traceShapes(imageData, width, height) {
  const THREE = window.THREE;
  const data = imageData.data;
  const threshold = 128;

  // Find contours using simple edge detection
  const shapes = [];
  const visited = new Set();

  // For simplicity, create a rounded rectangle that bounds the text
  // Find bounding box of non-transparent pixels
  let minX = width, maxX = 0, minY = height, maxY = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > threshold) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX <= minX || maxY <= minY) return shapes;

  // Create rounded rectangle shape
  const w = maxX - minX;
  const h = maxY - minY;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const r = Math.min(w, h) * 0.1;

  const shape = new THREE.Shape();
  shape.moveTo(minX + r, minY);
  shape.lineTo(maxX - r, minY);
  shape.quadraticCurveTo(maxX, minY, maxX, minY + r);
  shape.lineTo(maxX, maxY - r);
  shape.quadraticCurveTo(maxX, maxY, maxX - r, maxY);
  shape.lineTo(minX + r, maxY);
  shape.quadraticCurveTo(minX, maxY, minX, maxY - r);
  shape.lineTo(minX, minY + r);
  shape.quadraticCurveTo(minX, minY, minX + r, minY);

  shapes.push(shape);
  return shapes;
}

function _gs_updateText(id) {
  const inst = _gs_instances[id];
  if (!inst) return;
  const THREE = window.THREE;

  const text = document.getElementById('gs-text-' + id).value;
  const mode = document.getElementById('gs-textmode-' + id).value;
  const fit = document.getElementById('gs-fit-' + id).value;
  const depth = parseFloat(document.getElementById('gs-textdepth-' + id).value);

  document.getElementById('gs-textdepth-val-' + id).textContent = depth.toFixed(2);

  // Remove existing text mesh
  if (inst.textMesh) {
    inst.scene.remove(inst.textMesh);
    inst.textMesh.geometry.dispose();
    if (inst.textMesh.material.dispose) inst.textMesh.material.dispose();
    inst.textMesh = null;
  }

  if (!text) return;

  // Create text texture for inside/floating mode
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const fontSize = 256;
  ctx.font = `${fontSize}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
  const metrics = ctx.measureText(text);

  canvas.width = Math.ceil(metrics.width) + 40;
  canvas.height = fontSize * 1.4;

  ctx.font = `${fontSize}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'white';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  const aspect = canvas.width / canvas.height;

  // Resize glass to fit text
  if (fit === 'rect') {
    const newW = Math.max(1.2, aspect * 1.0);
    const newH = 1.0;
    const newGeom = _gs_createRoundedBox(newW, newH, 0.4, 0.12, 8);
    inst.mesh.geometry.dispose();
    inst.mesh.geometry = newGeom;
  } else {
    // Square - use max dimension
    const size = 1.2;
    const newGeom = _gs_createRoundedBox(size, size, 0.4, 0.15, 8);
    inst.mesh.geometry.dispose();
    inst.mesh.geometry = newGeom;
  }

  // Create text plane/mesh based on mode
  const planeW = fit === 'rect' ? aspect * 0.8 : 0.8;
  const planeH = 0.8;

  if (mode === 'inside') {
    // Floating text inside glass
    const planeGeom = new THREE.PlaneGeometry(planeW, planeH);
    const planeMat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    inst.textMesh = new THREE.Mesh(planeGeom, planeMat);
    inst.textMesh.position.z = 0;
    inst.scene.add(inst.textMesh);
  } else if (mode === 'emboss') {
    // Raised text on surface
    const planeGeom = new THREE.PlaneGeometry(planeW, planeH);
    const planeMat = new THREE.MeshPhysicalMaterial({
      map: texture,
      transparent: true,
      transmission: 0.5,
      roughness: 0.1,
      side: THREE.DoubleSide
    });
    inst.textMesh = new THREE.Mesh(planeGeom, planeMat);
    inst.textMesh.position.z = 0.22 + depth * 0.1;
    inst.scene.add(inst.textMesh);
  } else if (mode === 'engrave') {
    // Carved into surface (darker/shadowed)
    const planeGeom = new THREE.PlaneGeometry(planeW, planeH);
    const planeMat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide,
      opacity: 0.4,
      blending: THREE.MultiplyBlending
    });
    inst.textMesh = new THREE.Mesh(planeGeom, planeMat);
    inst.textMesh.position.z = 0.18;
    inst.scene.add(inst.textMesh);
  } else if (mode === 'cutout') {
    // Void/hole effect - render text as dark cutout
    const planeGeom = new THREE.PlaneGeometry(planeW, planeH);

    // Invert texture for cutout
    const invCanvas = document.createElement('canvas');
    invCanvas.width = canvas.width;
    invCanvas.height = canvas.height;
    const invCtx = invCanvas.getContext('2d');
    invCtx.fillStyle = 'white';
    invCtx.fillRect(0, 0, invCanvas.width, invCanvas.height);
    invCtx.globalCompositeOperation = 'destination-out';
    invCtx.drawImage(canvas, 0, 0);

    const invTexture = new THREE.CanvasTexture(invCanvas);

    const planeMat = new THREE.MeshBasicMaterial({
      map: invTexture,
      transparent: true,
      side: THREE.DoubleSide,
      alphaTest: 0.5
    });
    inst.textMesh = new THREE.Mesh(planeGeom, planeMat);
    inst.textMesh.position.z = 0.21;
    inst.scene.add(inst.textMesh);

    // Add dark backing for void effect
    const backGeom = new THREE.PlaneGeometry(planeW, planeH);
    const backMat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      color: 0x000000,
      side: THREE.DoubleSide
    });
    const backMesh = new THREE.Mesh(backGeom, backMat);
    backMesh.position.z = -0.1;
    inst.textMesh.add(backMesh);
  }
}

// Export functions
window._gs_instances = _gs_instances;
window._gs_open = _gs_open;
window._gs_init = _gs_init;
window._gs_loadPreset = _gs_loadPreset;
window._gs_updateMaterial = _gs_updateMaterial;
window._gs_setShape = _gs_setShape;
window._gs_setBg = _gs_setBg;
window._gs_toggleRotate = _gs_toggleRotate;
window._gs_export = _gs_export;
window._gs_updateText = _gs_updateText;
window._gs_PRESETS = _gs_PRESETS;

// Run the app
_gs_open();
