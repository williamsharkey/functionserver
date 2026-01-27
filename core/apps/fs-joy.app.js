// fs-joy v2 - Pad Performance + Clip Arrangement for FunctionServer
// Features: Retrospective looper, Session view, Lane generators, Plugin UI
ALGO.app.name = 'fs-joy';
ALGO.app.icon = '🎹';
ALGO.app.category = 'media';

(function() {
  'use strict';

  // ============================================================
  // STATE
  // ============================================================
  const state = {
    mode: 'session', // 'perform' or 'session'
    bpm: 120,
    playing: false,
    beat: 0,
    startTime: 0,
    playTimer: null,

    // Grid
    gridRows: 5,
    gridCols: 8,
    scale: 'pentatonic',
    rootNote: 60,
    activeNotes: new Set(),

    // Retrospective looper
    retroBuffer: [],
    retroMaxBeats: 64,
    floatingNotes: [],

    // Session view
    lanes: [
      { id: 0, name: 'Lane 1', generator: 'windchime-dad', muted: false, volume: 1 },
      { id: 1, name: 'Lane 2', generator: 'windchime-dad', muted: false, volume: 1 },
      { id: 2, name: 'Lane 3', generator: 'simpwave', muted: false, volume: 1 },
      { id: 3, name: 'Lane 4', generator: 'angelwave', muted: false, volume: 1 }
    ],
    scenes: Array(8).fill(null).map((_, i) => ({ id: i, name: 'Scene ' + (i + 1) })),
    clips: new Map(), // key: "lane-scene" -> clip data
    playingClips: new Set(),
    selectedLane: 0,

    // Available generators
    generators: {
      'windchime-dad': { name: 'Windchime Dad', icon: '⛲', channel: 'windchime-dad' },
      'simpwave': { name: 'Simpwave', icon: '🌊', channel: 'simpwave' },
      'angelwave': { name: 'Angelwave VOX', icon: '👼', channel: 'Angelwave VOX' }
    }
  };

  const scales = {
    pentatonic: [0, 2, 4, 7, 9],
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    blues: [0, 3, 5, 6, 7, 10],
    chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
  };

  // ============================================================
  // MIDI OUTPUT
  // ============================================================
  function send(channel, msg) {
    if (!channel) return;
    // Try _algoChannels first
    if (window._algoChannels && window._algoChannels[channel]) {
      window._algoChannels[channel].callback(msg, { sender: 'fs-joy', senderIcon: '🎹' });
      return;
    }
    // Try ALGO.pubsub
    if (window.ALGO && ALGO.pubsub && ALGO.pubsub.publish) {
      ALGO.pubsub.publish(channel, msg, {}, 'fs-joy');
    }
  }

  function noteOn(note, velocity, laneIdx) {
    const lane = state.lanes[laneIdx !== undefined ? laneIdx : state.selectedLane];
    if (!lane || lane.muted) return;

    const gen = state.generators[lane.generator];
    if (gen) {
      send(gen.channel, {
        type: 'noteOn',
        note,
        velocity: velocity || 100,
        duration: 0.4
      });
    }

    // Add to retrospective buffer
    const beatPos = getCurrentBeat();
    state.retroBuffer.push({
      type: 'noteOn',
      note,
      velocity: velocity || 100,
      beat: beatPos,
      timestamp: Date.now(),
      lane: laneIdx !== undefined ? laneIdx : state.selectedLane
    });

    // Add floating note for visualization
    state.floatingNotes.push({
      note,
      velocity: velocity || 100,
      beat: beatPos,
      timestamp: Date.now(),
      x: 1,
      captured: false
    });

    // Trim buffer to max beats
    trimRetroBuffer();
  }

  function noteOff(note, laneIdx) {
    const lane = state.lanes[laneIdx !== undefined ? laneIdx : state.selectedLane];
    if (!lane) return;
    const gen = state.generators[lane.generator];
    if (gen) {
      send(gen.channel, { type: 'noteOff', note });
    }
  }

  // ============================================================
  // TIMING
  // ============================================================
  function getCurrentBeat() {
    if (!state.playing) return state.beat;
    return state.beat + (Date.now() - state.startTime) / (60000 / state.bpm);
  }

  function trimRetroBuffer() {
    const maxMs = state.retroMaxBeats * (60000 / state.bpm);
    const cutoff = Date.now() - maxMs;
    state.retroBuffer = state.retroBuffer.filter(e => e.timestamp > cutoff);
    state.floatingNotes = state.floatingNotes.filter(n => n.timestamp > cutoff);
  }

  // ============================================================
  // GRID
  // ============================================================
  function getNote(row, col) {
    const scale = scales[state.scale] || scales.pentatonic;
    const octaveOffset = (state.gridRows - 1 - row) * 12;
    const scaleDegree = col % scale.length;
    return state.rootNote + octaveOffset + scale[scaleDegree];
  }

  window._joy_padDown = function(row, col) {
    const key = row + ',' + col;
    if (state.activeNotes.has(key)) return;
    state.activeNotes.add(key);
    noteOn(getNote(row, col));
  };

  window._joy_padUp = function(row, col) {
    const key = row + ',' + col;
    if (!state.activeNotes.has(key)) return;
    state.activeNotes.delete(key);
    noteOff(getNote(row, col));
  };

  // ============================================================
  // RETROSPECTIVE CAPTURE
  // ============================================================
  window._joy_capture = function(beats) {
    const beatDur = 60000 / state.bpm;
    const captureMs = beats * beatDur;
    const now = Date.now();

    const events = state.retroBuffer.filter(e => e.timestamp > now - captureMs);
    if (events.length === 0) {
      notify('No notes to capture');
      return;
    }

    // Mark as captured
    state.floatingNotes.forEach(n => {
      if (n.timestamp > now - captureMs) n.captured = true;
    });

    // Create clip
    const clip = {
      id: 'clip-' + Date.now(),
      events: events.map(e => ({
        ...e,
        time: (e.timestamp - (now - captureMs)) / beatDur
      })),
      length: beats,
      capturedAt: now
    };

    // Find first empty slot in selected lane
    const laneIdx = state.selectedLane;
    for (let s = 0; s < state.scenes.length; s++) {
      const key = laneIdx + '-' + s;
      if (!state.clips.has(key)) {
        state.clips.set(key, { ...clip, lane: laneIdx, scene: s });
        notify('Captured ' + beats + ' beats to Lane ' + (laneIdx + 1) + ', Scene ' + (s + 1));
        render();
        return;
      }
    }
    notify('No empty slots in lane');
  };

  // ============================================================
  // SESSION VIEW
  // ============================================================
  window._joy_toggleClip = function(lane, scene) {
    const key = lane + '-' + scene;
    if (!state.clips.has(key)) return;

    if (state.playingClips.has(key)) {
      state.playingClips.delete(key);
    } else {
      // Stop other clips in same lane
      for (const pk of state.playingClips) {
        if (pk.startsWith(lane + '-')) state.playingClips.delete(pk);
      }
      state.playingClips.add(key);
    }
    render();
  };

  window._joy_triggerScene = function(scene) {
    for (let l = 0; l < state.lanes.length; l++) {
      const key = l + '-' + scene;
      if (state.clips.has(key)) {
        for (const pk of state.playingClips) {
          if (pk.startsWith(l + '-')) state.playingClips.delete(pk);
        }
        state.playingClips.add(key);
      }
    }
    render();
  };

  window._joy_stopAll = function() {
    state.playingClips.clear();
    render();
  };

  window._joy_selectLane = function(idx) {
    state.selectedLane = idx;
    render();
  };

  window._joy_setGenerator = function(laneIdx, gen) {
    state.lanes[laneIdx].generator = gen;
    render();
  };

  window._joy_toggleMute = function(laneIdx) {
    state.lanes[laneIdx].muted = !state.lanes[laneIdx].muted;
    render();
  };

  // ============================================================
  // TRANSPORT
  // ============================================================
  window._joy_play = function() {
    state.playing = true;
    state.startTime = Date.now();
    render();
    playLoop();
  };

  window._joy_stop = function() {
    state.playing = false;
    state.beat = 0;
    if (state.playTimer) cancelAnimationFrame(state.playTimer);
    render();
  };

  window._joy_toggle = function() {
    state.playing ? window._joy_stop() : window._joy_play();
  };

  function playLoop() {
    if (!state.playing) return;

    const now = Date.now();
    const currentBeat = getCurrentBeat();

    // Play clips
    for (const clipKey of state.playingClips) {
      const clip = state.clips.get(clipKey);
      if (!clip) continue;

      const lane = state.lanes[clip.lane];
      if (lane.muted) continue;

      const clipBeat = currentBeat % clip.length;
      const gen = state.generators[lane.generator];

      clip.events.forEach(event => {
        const eventBeat = event.time % clip.length;
        if (Math.abs(eventBeat - clipBeat) < 0.05 && !event._played) {
          event._played = true;
          if (gen) {
            send(gen.channel, {
              type: 'noteOn',
              note: event.note,
              velocity: event.velocity,
              duration: 0.3
            });
          }
        }
        // Reset played flag after event passes
        if (clipBeat < eventBeat - 0.1) {
          event._played = false;
        }
      });
    }

    // Update floating notes
    trimRetroBuffer();

    state.playTimer = requestAnimationFrame(playLoop);
  }

  window._joy_setMode = function(mode) {
    state.mode = mode;
    render();
  };

  window._joy_setBpm = function(bpm) {
    state.bpm = parseInt(bpm) || 120;
  };

  // ============================================================
  // UTILITIES
  // ============================================================
  function notify(msg) {
    if (typeof algoSpeak === 'function') algoSpeak(msg);
    else if (window.ALGO && ALGO.notify) ALGO.notify(msg);
    else console.log(msg);
  }

  // ============================================================
  // RENDER
  // ============================================================
  function render() {
    const el = document.getElementById('fsjoy-content');
    if (!el) return;

    const scale = scales[state.scale];
    const selectedLane = state.lanes[state.selectedLane];
    const selectedGen = state.generators[selectedLane.generator];

    let html = '<div style="display:flex;flex-direction:column;height:100%;background:#111;color:#eee;font-family:-apple-system,sans-serif;font-size:11px;">';

    // ===== HEADER =====
    html += '<div style="background:#222;padding:6px 10px;display:flex;gap:10px;align-items:center;border-bottom:1px solid #333;">';
    html += '<span style="font-weight:bold;font-size:13px;">🎹 fs-joy</span>';
    html += '<button onclick="_joy_toggle()" style="padding:4px 12px;background:' + (state.playing ? '#c44' : '#4a4') + ';border:none;color:#fff;border-radius:4px;cursor:pointer;">' + (state.playing ? '⏹ Stop' : '▶ Play') + '</button>';
    html += '<span>BPM: <input type="number" value="' + state.bpm + '" min="40" max="300" onchange="_joy_setBpm(this.value)" style="width:50px;background:#333;color:#fff;border:1px solid #555;padding:2px;"></span>';
    html += '<div style="margin-left:auto;display:flex;gap:4px;">';
    html += '<button onclick="_joy_setMode(\'perform\')" style="padding:4px 8px;background:' + (state.mode === 'perform' ? '#555' : '#333') + ';border:1px solid #555;color:#fff;border-radius:4px;cursor:pointer;">🎹 Perform</button>';
    html += '<button onclick="_joy_setMode(\'session\')" style="padding:4px 8px;background:' + (state.mode === 'session' ? '#555' : '#333') + ';border:1px solid #555;color:#fff;border-radius:4px;cursor:pointer;">📋 Session</button>';
    html += '</div></div>';

    // ===== MAIN AREA =====
    html += '<div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">';

    if (state.mode === 'perform') {
      // ----- PERFORMANCE MODE -----
      html += '<div style="flex:1;display:flex;flex-direction:column;padding:10px;gap:10px;overflow:auto;">';

      // Pad grid
      html += '<div style="display:grid;grid-template-columns:repeat(' + state.gridCols + ',1fr);gap:4px;max-width:500px;margin:0 auto;">';
      for (let r = 0; r < state.gridRows; r++) {
        for (let c = 0; c < state.gridCols; c++) {
          const deg = c % scale.length;
          const hue = (deg / scale.length) * 360;
          html += '<div onmousedown="_joy_padDown(' + r + ',' + c + ')" onmouseup="_joy_padUp(' + r + ',' + c + ')" onmouseleave="_joy_padUp(' + r + ',' + c + ')" ontouchstart="_joy_padDown(' + r + ',' + c + ');event.preventDefault()" ontouchend="_joy_padUp(' + r + ',' + c + ')" style="background:hsl(' + hue + ',60%,25%);border-radius:6px;cursor:pointer;min-height:45px;transition:all 0.1s;" onmouseenter="if(event.buttons===1)_joy_padDown(' + r + ',' + c + ')"></div>';
        }
      }
      html += '</div>';

      // Retrospective looper visualization
      html += '<div style="background:#0a0a0a;border-radius:8px;padding:10px;max-width:500px;margin:0 auto;width:100%;">';
      html += '<div style="color:#666;font-size:10px;margin-bottom:5px;">RETROSPECTIVE LOOPER - Tap to capture last N beats</div>';
      html += '<canvas id="joy-retro-canvas" width="480" height="60" style="background:#050510;border-radius:4px;width:100%;"></canvas>';

      // Capture buttons
      html += '<div style="display:flex;gap:4px;margin-top:8px;justify-content:center;">';
      [4, 8, 16, 32, 64].forEach(beats => {
        html += '<button onclick="_joy_capture(' + beats + ')" style="flex:1;padding:8px 4px;background:#2a2a3a;border:1px solid #444;color:#aaa;border-radius:4px;cursor:pointer;font-size:10px;">' + beats + ' beats</button>';
      });
      html += '</div></div>';

      html += '</div>';
    } else {
      // ----- SESSION MODE -----
      html += '<div style="flex:1;overflow:auto;padding:10px;">';

      // Session grid
      html += '<div style="display:grid;grid-template-columns:120px repeat(' + state.lanes.length + ',1fr) 50px;gap:2px;font-size:10px;">';

      // Header row
      html += '<div style="background:#1a1a1a;padding:6px;"></div>';
      state.lanes.forEach((lane, i) => {
        const isSelected = i === state.selectedLane;
        html += '<div onclick="_joy_selectLane(' + i + ')" style="background:' + (isSelected ? '#333' : '#222') + ';padding:6px;cursor:pointer;text-align:center;border:' + (isSelected ? '1px solid #666' : '1px solid transparent') + ';">';
        html += '<div style="font-weight:bold;">' + lane.name + '</div>';
        html += '<div style="font-size:9px;color:#888;">' + state.generators[lane.generator].icon + ' ' + state.generators[lane.generator].name + '</div>';
        html += '</div>';
      });
      html += '<div style="background:#1a1a1a;padding:6px;"></div>';

      // Scene rows
      state.scenes.forEach((scene, s) => {
        // Scene launcher
        html += '<div onclick="_joy_triggerScene(' + s + ')" style="background:#252530;padding:6px;cursor:pointer;display:flex;align-items:center;gap:4px;">';
        html += '<span style="color:#888;">▶</span> ' + scene.name;
        html += '</div>';

        // Clip slots
        state.lanes.forEach((lane, l) => {
          const key = l + '-' + s;
          const clip = state.clips.get(key);
          const isPlaying = state.playingClips.has(key);

          if (clip) {
            html += '<div onclick="_joy_toggleClip(' + l + ',' + s + ')" style="background:' + (isPlaying ? '#3a6a3a' : '#2a4a5a') + ';padding:6px;cursor:pointer;border-radius:4px;text-align:center;">';
            html += isPlaying ? '■' : '▶';
            html += '<div style="font-size:8px;color:#aaa;">' + clip.events.length + ' notes</div>';
            html += '</div>';
          } else {
            html += '<div style="background:#1a1a1a;padding:6px;border:1px dashed #333;border-radius:4px;"></div>';
          }
        });

        // Stop row button
        html += '<div onclick="_joy_stopAll()" style="background:#3a2a2a;padding:6px;cursor:pointer;text-align:center;border-radius:4px;">⏹</div>';
      });

      html += '</div></div>';
    }

    html += '</div>';

    // ===== LANE CONTROLS / PLUGIN AREA (collapsible) =====
    html += '<div style="border-top:1px solid #333;">';
    html += '<div onclick="document.getElementById(\'joy-plugin-area\').style.display=document.getElementById(\'joy-plugin-area\').style.display===\'none\'?\'block\':\'none\'" style="background:#1a1a1a;padding:6px 10px;cursor:pointer;display:flex;align-items:center;gap:8px;">';
    html += '<span>▼</span>';
    html += '<span style="font-weight:bold;">' + selectedGen.icon + ' ' + selectedLane.name + ' - ' + selectedGen.name + '</span>';
    html += '<button onclick="event.stopPropagation();_joy_toggleMute(' + state.selectedLane + ')" style="margin-left:auto;padding:2px 8px;background:' + (selectedLane.muted ? '#a44' : '#333') + ';border:1px solid #555;color:#fff;border-radius:3px;cursor:pointer;font-size:10px;">' + (selectedLane.muted ? 'MUTED' : 'M') + '</button>';
    html += '</div>';

    html += '<div id="joy-plugin-area" style="background:#0a0a0a;padding:10px;display:block;">';

    // Generator selector
    html += '<div style="margin-bottom:10px;">';
    html += '<span style="color:#888;">Generator: </span>';
    html += '<select onchange="_joy_setGenerator(' + state.selectedLane + ',this.value)" style="background:#222;color:#fff;border:1px solid #444;padding:4px;">';
    Object.entries(state.generators).forEach(([id, gen]) => {
      html += '<option value="' + id + '"' + (selectedLane.generator === id ? ' selected' : '') + '>' + gen.icon + ' ' + gen.name + '</option>';
    });
    html += '</select></div>';

    // Plugin-specific controls placeholder
    html += '<div style="background:#111;border:1px solid #333;border-radius:4px;padding:15px;text-align:center;color:#666;">';
    html += selectedGen.icon + ' ' + selectedGen.name + ' controls would load here<br>';
    html += '<span style="font-size:10px;">Channel: ' + selectedGen.channel + '</span>';
    html += '</div>';

    html += '</div></div>';

    html += '</div>';
    el.innerHTML = html;

    // Draw retro canvas if in perform mode
    if (state.mode === 'perform') {
      setTimeout(drawRetroCanvas, 10);
    }
  }

  function drawRetroCanvas() {
    const canvas = document.getElementById('joy-retro-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const now = Date.now();
    const maxMs = state.retroMaxBeats * (60000 / state.bpm);

    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, w, h);

    // Draw beat markers
    ctx.strokeStyle = '#1a1a2a';
    ctx.lineWidth = 1;
    for (let b = 0; b <= state.retroMaxBeats; b += 4) {
      const x = w - (b / state.retroMaxBeats) * w;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // Draw capture zones
    const zones = [4, 8, 16, 32, 64];
    zones.forEach((beats, i) => {
      const x = w - (beats / state.retroMaxBeats) * w;
      ctx.strokeStyle = 'rgba(100, 100, 150, 0.3)';
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // Draw floating notes
    state.floatingNotes.forEach(note => {
      const age = now - note.timestamp;
      const x = w - (age / maxMs) * w;
      const y = h - ((note.note - 36) / 60) * h;
      const size = (note.velocity / 127) * 10 + 3;
      const hue = (note.note % 12) * 30;

      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fillStyle = note.captured
        ? 'rgba(100, 255, 100, 0.8)'
        : 'hsla(' + hue + ', 70%, 50%, ' + (0.3 + (1 - age / maxMs) * 0.7) + ')';
      ctx.fill();
    });

    if (state.playing) {
      requestAnimationFrame(drawRetroCanvas);
    }
  }

  // ============================================================
  // INITIALIZE
  // ============================================================
  const createWin = (typeof ALGO !== 'undefined' && ALGO.createWindow) ? ALGO.createWindow :
                    (typeof createWindow === 'function' ? createWindow : null);

  if (createWin) {
    createWin({
      title: 'fs-joy v2',
      icon: '🎹',
      width: 650,
      height: 600,
      content: '<div id="fsjoy-content" style="height:100%;"></div>',
      onClose: () => {
        window._joy_stop();
      }
    });
    setTimeout(render, 50);
  } else {
    console.error('fs-joy: No window creation function available');
  }

  console.log('fs-joy v2 loaded');
})();
