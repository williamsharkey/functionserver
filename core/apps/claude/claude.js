// Claude - AI Assistant Terminal for FunctionServer
// Wraps shell.js with Claude Code integration and pubsub IPC
ALGO.app.name = "Claude";
ALGO.app.icon = "🤖";

(function() {
  // Check if user is logged in as system user
  if (!sessionToken) {
    algoSpeak("Please login to use Claude");
    return;
  }

  const claudeWinId = Date.now();
  const termId = 'claude-term-' + claudeWinId;

  // IPC file paths
  const IPC_OUT = '~/.algo/out';  // Claude writes here
  const IPC_IN = '~/.algo/in';    // Claude reads from here

  // Register with pubsub system
  ALGO.pubsub.register('claude', {
    autoOpen: true,
    openFn: () => runSystemApp('claude')
  });

  createWindow({
    title: 'Claude',
    icon: '🤖',
    width: 900,
    height: 600,
    content: `
      <div id="${termId}-container" style="display:flex;flex-direction:column;width:100%;height:100%;min-height:0;background:#0d1117;">
        <div id="${termId}-ipc-status" style="padding:2px 8px;background:#161b22;color:#58a6ff;font-size:11px;font-family:monospace;display:flex;justify-content:space-between;align-items:center;">
          <span>🤖 Claude Code</span>
          <span id="${termId}-pubsub-status">pubsub: connecting...</span>
        </div>
        <div id="${termId}" style="flex:1;min-height:0;overflow:hidden;"></div>
        <div id="${termId}-status" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#58a6ff;font-family:monospace;text-align:center;display:none;">
          <div style="font-size:32px;margin-bottom:10px;">🤖</div>
          <div id="${termId}-msg">Starting Claude...</div>
        </div>
      </div>
    `
  });

  const container = document.getElementById(termId + '-container');
  const statusDiv = document.getElementById(termId + '-status');
  const msgDiv = document.getElementById(termId + '-msg');
  const pubsubStatus = document.getElementById(termId + '-pubsub-status');

  // Fix parent window-content overflow
  if (container && container.parentElement) {
    container.parentElement.style.overflow = 'hidden';
    container.parentElement.style.position = 'relative';
    container.parentElement.style.display = 'flex';
    container.parentElement.style.flexDirection = 'column';
  }

  function showStatus(msg, isError) {
    statusDiv.style.display = 'block';
    msgDiv.textContent = msg;
    msgDiv.style.color = isError ? '#f85149' : '#58a6ff';
  }

  function hideStatus() {
    statusDiv.style.display = 'none';
  }

  function updatePubsubStatus(status, isError) {
    pubsubStatus.textContent = 'pubsub: ' + status;
    pubsubStatus.style.color = isError ? '#f85149' : '#3fb950';
  }

  showStatus('Loading terminal...');

  // Load xterm.js
  function loadScript(url) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${url}"]`)) { resolve(); return; }
      const script = document.createElement('script');
      script.src = url;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function loadCSS(url) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`link[href="${url}"]`)) { resolve(); return; }
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      link.onload = resolve;
      link.onerror = reject;
      document.head.appendChild(link);
    });
  }

  Promise.all([
    loadCSS('https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css'),
    loadScript('https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.min.js'),
    loadScript('https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.min.js'),
    loadScript('https://cdn.jsdelivr.net/npm/xterm-addon-web-links@0.9.0/lib/xterm-addon-web-links.min.js')
  ]).then(() => {
    showStatus('Connecting to PTY...');
    initTerminal();
  }).catch(err => {
    showStatus('Failed to load terminal: ' + err.message, true);
  });

  function initTerminal() {
    const termElement = document.getElementById(termId);
    if (!termElement) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      scrollback: 10000,
      theme: {
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor: '#58a6ff',
        cursorAccent: '#0d1117',
        selection: 'rgba(56,139,253,0.3)',
        black: '#484f58',
        red: '#ff7b72',
        green: '#3fb950',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#bc8cff',
        cyan: '#39c5cf',
        white: '#b1bac4',
        brightBlack: '#6e7681',
        brightRed: '#ffa198',
        brightGreen: '#56d364',
        brightYellow: '#e3b341',
        brightBlue: '#79c0ff',
        brightMagenta: '#d2a8ff',
        brightCyan: '#56d4dd',
        brightWhite: '#f0f6fc'
      },
      allowProposedApi: true
    });

    const fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);

    const webLinksAddon = new WebLinksAddon.WebLinksAddon();
    term.loadAddon(webLinksAddon);

    term.open(termElement);

    // Focus handling
    term.focus();
    container.addEventListener('click', (e) => { e.preventDefault(); term.focus(); });
    container.addEventListener('mousedown', () => { term.focus(); });
    termElement.addEventListener('click', (e) => { e.preventDefault(); term.focus(); });
    container.addEventListener('wheel', (e) => { e.stopPropagation(); }, { passive: false });

    // Fit terminal
    function doFit() {
      fitAddon.fit();
      const dims = fitAddon.proposeDimensions();
      if (dims && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(`RESIZE:${dims.cols}:${dims.rows}`);
      }
    }
    setTimeout(doFit, 50);
    setTimeout(doFit, 200);
    setTimeout(doFit, 500);

    // WebSocket connection
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/pty?token=${encodeURIComponent(sessionToken)}`;

    let ws;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 3;
    let ipcInitialized = false;

    function connect() {
      ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        hideStatus();
        reconnectAttempts = 0;
        term.focus();

        // Send initial size
        const dims = fitAddon.proposeDimensions();
        if (dims) {
          ws.send(`RESIZE:${dims.cols}:${dims.rows}`);
        }

        // Setup pubsub bridge
        ipcInitialized = true;
        updatePubsubStatus('ready', false);
        setupPubsubBridge();
        // IPC is now push-based via file watcher - no polling needed
      };

      // Process IPC bridge commands (pushed from server via file watcher)
      function processIpcCommand(content) {
        if (!content || !content.trim()) return;

        // Parse lines - each line is a separate command
        const lines = content.trim().split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const cmdObj = JSON.parse(line);
            if (cmdObj._bridge && ALGO.bridge[cmdObj._bridge]) {
              const result = ALGO.bridge[cmdObj._bridge](...(cmdObj._args || []));
              if (cmdObj._id) result._id = cmdObj._id;

              // Write result to output file
              ws.send('IPC_WRITE:' + JSON.stringify(result));
            }
          } catch (e) {
            console.warn('IPC command parse error:', e.message, line.substring(0, 100));
          }
        }
      }

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          term.write(new Uint8Array(event.data));
        } else {
          // Check for MCP command from server
          if (typeof event.data === 'string' && event.data.startsWith('MCP_CMD:')) {
            try {
              const cmdObj = JSON.parse(event.data.slice(8)); // Skip "MCP_CMD:"
              const reqId = cmdObj._mcpReqId;
              delete cmdObj._mcpReqId;

              if (cmdObj._bridge && ALGO.bridge[cmdObj._bridge]) {
                const result = ALGO.bridge[cmdObj._bridge](...(cmdObj._args || []));
                // Send response back to server
                ws.send('MCP_RESP:' + reqId + ':' + JSON.stringify(result));
              } else {
                ws.send('MCP_RESP:' + reqId + ':' + JSON.stringify({error: 'Unknown bridge command'}));
              }
            } catch (e) {
              console.error('MCP command error:', e);
            }
            return;
          }
          // Check for IPC push (from file watcher)
          if (typeof event.data === 'string' && event.data.startsWith('IPC_PUSH:')) {
            const content = event.data.slice(9); // Skip "IPC_PUSH:"
            if (content) {
              processIpcCommand(content);
            }
            return; // Don't write IPC messages to terminal
          }
          // Also handle legacy IPC_RESPONSE for backwards compatibility
          if (typeof event.data === 'string' && event.data.startsWith('IPC_RESPONSE:')) {
            const content = event.data.slice(13);
            if (content) {
              processIpcCommand(content);
            }
            return;
          }
          term.write(event.data);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        updatePubsubStatus('error', true);
      };

      ws.onclose = (event) => {
        ALGO.pubsub.unregister('claude');
        updatePubsubStatus('disconnected', true);

        if (event.code === 1000) {
          term.write('\r\n\x1b[33mSession ended.\x1b[0m\r\n');
          showStatus('Session ended', false);
        } else if (event.code === 1006) {
          term.write('\r\n\x1b[31mConnection failed.\x1b[0m\r\n');
          term.write('\x1b[33mClaude requires system user login.\x1b[0m\r\n');
          showStatus('System user login required', true);
        } else {
          term.write(`\r\n\x1b[31mDisconnected (${event.code})\x1b[0m\r\n`);
          if (reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            setTimeout(connect, 1000 * reconnectAttempts);
          } else {
            showStatus('Connection lost', true);
          }
        }
      };
    }

    // Terminal input
    term.onData(data => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    term.onBinary(data => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        const buffer = new Uint8Array(data.length);
        for (let i = 0; i < data.length; i++) {
          buffer[i] = data.charCodeAt(i);
        }
        ws.send(buffer);
      }
    });

    // Resize handling
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      const dims = fitAddon.proposeDimensions();
      if (dims && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(`RESIZE:${dims.cols}:${dims.rows}`);
      }
    });
    resizeObserver.observe(container);

    // Pubsub bridge - receive messages from other apps AND handle bridge commands
    function setupPubsubBridge() {
      // Subscribe to messages for claude
      ALGO.pubsub.subscribe('claude', (msg, from) => {
        if (!ipcInitialized) return;

        // Check if this is a bridge command
        if (msg && msg._bridge) {
          const cmd = msg._bridge;
          const args = msg._args || [];
          let result;

          // Execute bridge command
          if (ALGO.bridge[cmd] && typeof ALGO.bridge[cmd] === 'function') {
            result = ALGO.bridge[cmd](...args);
          } else {
            result = { success: false, error: 'Unknown bridge command: ' + cmd };
          }

          // Add request ID for correlation
          if (msg._id) {
            result._id = msg._id;
          }

          // Write result to ~/.algo/out for Claude to read
          if (ws && ws.readyState === WebSocket.OPEN) {
            const escapedResult = JSON.stringify(result).replace(/'/g, "'\\''").replace(/\\/g, '\\\\');
            ws.send(`echo '${escapedResult}' >> ~/.algo/out\n`);
          }
          return;
        }

        // Regular message - write to ~/.algo/in for Claude to read
        if (ws && ws.readyState === WebSocket.OPEN) {
          const payload = { from, msg, timestamp: Date.now() };
          const escapedMsg = JSON.stringify(payload).replace(/'/g, "'\\''").replace(/\\/g, '\\\\');
          ws.send(`echo '${escapedMsg}' >> ~/.algo/in\n`);
        }
      });

      // Also subscribe to 'bridge' topic for direct bridge access
      ALGO.pubsub.subscribe('bridge', (msg, from) => {
        if (!msg || !msg._bridge) return;

        const cmd = msg._bridge;
        const args = msg._args || [];
        let result;

        if (ALGO.bridge[cmd] && typeof ALGO.bridge[cmd] === 'function') {
          result = ALGO.bridge[cmd](...args);
        } else {
          result = { success: false, error: 'Unknown bridge command: ' + cmd };
        }

        if (msg._id) {
          result._id = msg._id;
        }

        // Write result for Claude
        if (ws && ws.readyState === WebSocket.OPEN && ipcInitialized) {
          const escapedResult = JSON.stringify(result).replace(/'/g, "'\\''").replace(/\\/g, '\\\\');
          ws.send(`echo '${escapedResult}' >> ~/.algo/out\n`);
        }
      });

      // Terminal output bridge disabled for now - use pubsub instead
      // To execute bridge commands, use: ALGO.pubsub.publish('bridge', {_bridge: 'eval', _args: ['code']})

      // Cleanup on close
      container._claudeCleanup = () => {
        ALGO.pubsub.unregister('claude');
        resizeObserver.disconnect();
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send('CLOSE_SESSION');
          ws.close();
        }
        term.dispose();
      };
    }

    // Connect
    connect();

    // Window close handler
    setTimeout(() => {
      const win = windows.find(w => w.id === windows[windows.length - 1]?.id);
      if (win) {
        win.onClose = () => {
          if (container._claudeCleanup) {
            container._claudeCleanup();
          }
        };
      }
    }, 100);
  }
})();
