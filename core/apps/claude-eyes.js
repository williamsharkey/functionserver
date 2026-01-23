// Claude Eyes - Visual MCP Activity Monitor
// Shows ASCII Claude face and logs MCP commands
// Works for all users (no shell required)
ALGO.app.name = "Claude Eyes";
ALGO.app.icon = "👁️";

(function() {
  if (!sessionToken) {
    algoSpeak("Please login to use Claude Eyes");
    return;
  }

  const eyesId = 'claude-eyes-' + Date.now();

  createWindow({
    title: 'Claude Eyes',
    icon: '👁️',
    width: 500,
    height: 600,
    content: `
      <div id="${eyesId}" style="
        width: 100%;
        height: 100%;
        background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
        color: #e2e8f0;
        font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      ">
        <!-- ASCII Face -->
        <div id="${eyesId}-face" style="
          flex: 0 0 auto;
          padding: 20px;
          text-align: center;
          font-size: 14px;
          line-height: 1.2;
          color: #f97316;
          white-space: pre;
        ">
        ╭─────────────────────────────╮
        │                             │
        │      ██████╗██╗      ██╗    │
        │     ██╔════╝██║      ██║    │
        │     ██║     ██║      ██║    │
        │     ██║     ██║      ██║    │
        │     ╚██████╗███████╗██║     │
        │      ╚═════╝╚══════╝╚═╝     │
        │                             │
        │       ◉            ◉        │
        │                             │
        │           ────              │
        │                             │
        ╰─────────────────────────────╯</div>

        <!-- Status -->
        <div id="${eyesId}-status" style="
          text-align: center;
          padding: 10px;
          font-size: 13px;
          color: #94a3b8;
          border-bottom: 1px solid #334155;
        ">
          <span id="${eyesId}-connection" style="color: #22c55e;">● Connected</span>
          <span style="margin: 0 10px;">|</span>
          <span id="${eyesId}-count">0 commands received</span>
        </div>

        <!-- Activity Log -->
        <div style="
          flex: 1;
          overflow-y: auto;
          padding: 10px;
        ">
          <div style="color: #64748b; font-size: 11px; margin-bottom: 10px;">
            ─────────── MCP Activity ───────────
          </div>
          <div id="${eyesId}-log" style="font-size: 12px;"></div>
          <div id="${eyesId}-empty" style="
            color: #64748b;
            text-align: center;
            padding: 40px 20px;
            font-size: 12px;
          ">
            Waiting for MCP commands...<br><br>
            <span style="font-size: 11px; color: #475569;">
              Run Claude locally and send commands via:<br>
              curl -X POST https://functionserver.com/api/mcp ...
            </span>
          </div>
        </div>

        <!-- Help -->
        <div style="
          flex: 0 0 auto;
          padding: 10px;
          background: #0f172a;
          font-size: 10px;
          color: #64748b;
          text-align: center;
          border-top: 1px solid #334155;
        ">
          See CLAUDE-MORPHEUS.md for MCP documentation
        </div>
      </div>
    `
  });

  const container = document.getElementById(eyesId);
  const faceEl = document.getElementById(eyesId + '-face');
  const logEl = document.getElementById(eyesId + '-log');
  const emptyEl = document.getElementById(eyesId + '-empty');
  const countEl = document.getElementById(eyesId + '-count');
  const connectionEl = document.getElementById(eyesId + '-connection');

  let commandCount = 0;
  let blinkTimeout = null;

  // Eye states
  const eyesOpen = '       ◉            ◉        ';
  const eyesClosed = '       ─            ─        ';
  const eyesWide = '       ⬤            ⬤        ';

  function setEyes(state) {
    const lines = faceEl.textContent.split('\n');
    // Find the line with eyes (has ◉ or ─ or ⬤)
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('◉') || lines[i].includes('─') || lines[i].includes('⬤')) {
        if (!lines[i].includes('────')) { // Not the mouth
          lines[i] = '        │' + state + '│';
          break;
        }
      }
    }
    faceEl.textContent = lines.join('\n');
  }

  function blink() {
    setEyes(eyesClosed);
    setTimeout(() => setEyes(eyesOpen), 150);
  }

  function wideEyes() {
    setEyes(eyesWide);
    if (blinkTimeout) clearTimeout(blinkTimeout);
    blinkTimeout = setTimeout(() => setEyes(eyesOpen), 500);
  }

  // Random blinking
  function randomBlink() {
    blink();
    setTimeout(randomBlink, 3000 + Math.random() * 5000);
  }
  setTimeout(randomBlink, 2000);

  // Format timestamp
  function formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour12: false });
  }

  // Format args for display
  function formatArgs(args) {
    if (!args || args.length === 0) return '';
    try {
      const summary = args.map(a => {
        if (typeof a === 'string') {
          return a.length > 30 ? a.substring(0, 30) + '...' : a;
        }
        return JSON.stringify(a).substring(0, 30);
      }).join(', ');
      return `(${summary})`;
    } catch {
      return '';
    }
  }

  // Add log entry
  function addLogEntry(activity) {
    emptyEl.style.display = 'none';
    commandCount++;
    countEl.textContent = `${commandCount} command${commandCount !== 1 ? 's' : ''} received`;

    // Wide eyes on new command
    wideEyes();

    const entry = document.createElement('div');
    entry.style.cssText = `
      padding: 8px;
      margin-bottom: 6px;
      background: ${activity.success ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)'};
      border-left: 3px solid ${activity.success ? '#22c55e' : '#ef4444'};
      border-radius: 0 4px 4px 0;
    `;

    const toolName = activity.tool || 'unknown';
    const args = formatArgs(activity.args);
    const icon = activity.success ? '✓' : '✗';
    const color = activity.success ? '#22c55e' : '#ef4444';

    entry.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="color: #f97316; font-weight: bold;">${toolName}</span>
        <span style="color: ${color}; font-size: 14px;">${icon}</span>
      </div>
      <div style="color: #94a3b8; font-size: 11px; margin-top: 4px;">
        ${args ? `<span style="color: #64748b;">${args}</span><br>` : ''}
        <span style="color: #475569;">${formatTime(activity.timestamp)}</span>
      </div>
    `;

    logEl.insertBefore(entry, logEl.firstChild);

    // Keep only last 50 entries
    while (logEl.children.length > 50) {
      logEl.removeChild(logEl.lastChild);
    }
  }

  // Subscribe to MCP activity
  ALGO.pubsub.subscribe('mcp-activity', (activity, from) => {
    addLogEntry(activity);
  });

  // Register this app with pubsub
  ALGO.pubsub.register('claude-eyes', {
    autoOpen: false
  });

  // Connect to PTY WebSocket to register browser connection
  // (Even though we don't use the terminal, we need the connection for MCP routing)
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/api/pty?token=${encodeURIComponent(sessionToken)}`;

  let ws;
  let reconnectAttempts = 0;

  function connect() {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      connectionEl.textContent = '● Connected';
      connectionEl.style.color = '#22c55e';
      reconnectAttempts = 0;

      // Send initial resize (minimal size since we don't display)
      ws.send('RESIZE:80:24');
    };

    ws.onmessage = (event) => {
      // Handle MCP commands even though we don't have a terminal
      if (typeof event.data === 'string' && event.data.startsWith('MCP_CMD:')) {
        try {
          const cmdObj = JSON.parse(event.data.slice(8));
          const reqId = cmdObj._mcpReqId;
          delete cmdObj._mcpReqId;

          const tool = cmdObj._bridge;
          const args = cmdObj._args || [];

          if (tool && ALGO.bridge[tool]) {
            const result = ALGO.bridge[tool](...args);
            ws.send('MCP_RESP:' + reqId + ':' + JSON.stringify(result));

            // Log it
            addLogEntry({
              tool: tool,
              args: args,
              result: result,
              success: true,
              timestamp: Date.now()
            });

            // Also publish for other observers
            ALGO.pubsub.publish('mcp-activity', {
              tool: tool,
              args: args,
              result: result,
              success: true,
              timestamp: Date.now()
            });
          } else {
            ws.send('MCP_RESP:' + reqId + ':' + JSON.stringify({error: 'Unknown bridge command'}));
            addLogEntry({
              tool: tool,
              args: args,
              error: 'Unknown bridge command',
              success: false,
              timestamp: Date.now()
            });
          }
        } catch (e) {
          console.error('MCP command error:', e);
        }
      }
      // Ignore other PTY output (we're not displaying a terminal)
    };

    ws.onerror = () => {
      connectionEl.textContent = '● Error';
      connectionEl.style.color = '#ef4444';
    };

    ws.onclose = (event) => {
      connectionEl.textContent = '○ Disconnected';
      connectionEl.style.color = '#64748b';

      if (reconnectAttempts < 3) {
        reconnectAttempts++;
        setTimeout(connect, 1000 * reconnectAttempts);
      }
    };
  }

  connect();

  // Cleanup
  const win = windows[windows.length - 1];
  if (win) {
    win.onClose = () => {
      ALGO.pubsub.unregister('claude-eyes');
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send('CLOSE_SESSION');
        ws.close();
      }
    };
  }
})();
