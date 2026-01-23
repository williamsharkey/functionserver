// Shell - PTY Terminal for FunctionServer
// Provides full terminal emulation with xterm.js
ALGO.app.name = "Shell";
ALGO.app.icon = "🐚";

(function() {
  // Check if user is logged in
  if (!sessionToken) {
    algoSpeak("Please login to use Shell");
    return;
  }

  const shellWinId = Date.now();

  // Create window with terminal container
  const termId = 'shell-term-' + shellWinId;

  createWindow({
    title: 'Shell',
    icon: '🐚',
    width: 800,
    height: 500,
    content: `
      <div id="${termId}-container" style="display:flex;flex-direction:column;width:100%;height:100%;min-height:0;background:#000;">
        <div id="${termId}" style="flex:1;min-height:0;overflow:hidden;"></div>
        <div id="${termId}-status" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#0f0;font-family:monospace;text-align:center;display:none;">
          <div style="font-size:24px;margin-bottom:10px;">🐚</div>
          <div id="${termId}-msg">Connecting...</div>
        </div>
      </div>
    `
  });

  const container = document.getElementById(termId + '-container');
  const statusDiv = document.getElementById(termId + '-status');
  const msgDiv = document.getElementById(termId + '-msg');

  // Fix parent window-content overflow for proper terminal sizing
  if (container && container.parentElement) {
    container.parentElement.style.overflow = 'hidden';
    container.parentElement.style.position = 'relative';
    container.parentElement.style.display = 'flex';
    container.parentElement.style.flexDirection = 'column';
  }

  // Show status message
  function showStatus(msg, isError) {
    statusDiv.style.display = 'block';
    msgDiv.textContent = msg;
    msgDiv.style.color = isError ? '#f55' : '#0f0';
  }

  function hideStatus() {
    statusDiv.style.display = 'none';
  }

  showStatus('Loading terminal...');

  // Load xterm.js from CDN
  function loadScript(url) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${url}"]`)) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = url;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function loadCSS(url) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`link[href="${url}"]`)) {
        resolve();
        return;
      }
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      link.onload = resolve;
      link.onerror = reject;
      document.head.appendChild(link);
    });
  }

  // Load xterm.js and addons
  Promise.all([
    loadCSS('https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css'),
    loadScript('https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.min.js'),
    loadScript('https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.min.js'),
    loadScript('https://cdn.jsdelivr.net/npm/xterm-addon-web-links@0.9.0/lib/xterm-addon-web-links.min.js')
  ]).then(() => {
    showStatus('Connecting to PTY...');
    initTerminal();
  }).catch(err => {
    showStatus('Failed to load terminal library: ' + err.message, true);
  });

  function initTerminal() {
    const termElement = document.getElementById(termId);
    if (!termElement) return;

    // Create terminal
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      scrollback: 10000,
      theme: {
        background: '#1a1a2e',
        foreground: '#eee',
        cursor: '#0f0',
        cursorAccent: '#000',
        selection: 'rgba(255,255,255,0.3)',
        black: '#000000',
        red: '#ff5555',
        green: '#50fa7b',
        yellow: '#f1fa8c',
        blue: '#bd93f9',
        magenta: '#ff79c6',
        cyan: '#8be9fd',
        white: '#f8f8f2',
        brightBlack: '#6272a4',
        brightRed: '#ff6e6e',
        brightGreen: '#69ff94',
        brightYellow: '#ffffa5',
        brightBlue: '#d6acff',
        brightMagenta: '#ff92df',
        brightCyan: '#a4ffff',
        brightWhite: '#ffffff'
      },
      allowProposedApi: true
    });

    // Load addons
    const fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);

    const webLinksAddon = new WebLinksAddon.WebLinksAddon();
    term.loadAddon(webLinksAddon);

    // Open terminal
    term.open(termElement);

    // Aggressive focus handling - xterm must capture all input
    term.focus();
    container.addEventListener('click', (e) => { e.preventDefault(); term.focus(); });
    container.addEventListener('mousedown', (e) => { term.focus(); });
    termElement.addEventListener('click', (e) => { e.preventDefault(); term.focus(); });

    // Prevent scroll events from bubbling to parent
    container.addEventListener('wheel', (e) => { e.stopPropagation(); }, { passive: false });

    // Fit to container (multiple passes for reliable sizing)
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

    // Connect to WebSocket PTY
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/pty?token=${encodeURIComponent(sessionToken)}`;

    let ws;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 3;

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
      };

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          term.write(new Uint8Array(event.data));
        } else {
          term.write(event.data);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      ws.onclose = (event) => {
        if (event.code === 1000) {
          term.write('\r\n\x1b[33mConnection closed.\x1b[0m\r\n');
          showStatus('Session ended', false);
        } else if (event.code === 1006) {
          // Connection failed - likely not a system user
          term.write('\r\n\x1b[31mConnection failed.\x1b[0m\r\n');
          term.write('\x1b[33mShell requires system user login.\x1b[0m\r\n');
          term.write('\x1b[90mLogin with "System User" checkbox enabled.\x1b[0m\r\n');
          showStatus('System user login required', true);
        } else {
          term.write(`\r\n\x1b[31mDisconnected (code: ${event.code})\x1b[0m\r\n`);

          // Try to reconnect
          if (reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            term.write(`\x1b[33mReconnecting (${reconnectAttempts}/${maxReconnectAttempts})...\x1b[0m\r\n`);
            setTimeout(connect, 1000 * reconnectAttempts);
          } else {
            showStatus('Connection lost', true);
          }
        }
      };
    }

    // Handle terminal input
    term.onData(data => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    // Handle binary data (for things like mouse events)
    term.onBinary(data => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        const buffer = new Uint8Array(data.length);
        for (let i = 0; i < data.length; i++) {
          buffer[i] = data.charCodeAt(i);
        }
        ws.send(buffer);
      }
    });

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      const dims = fitAddon.proposeDimensions();
      if (dims && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(`RESIZE:${dims.cols}:${dims.rows}`);
      }
    });
    resizeObserver.observe(container);

    // Connect
    connect();

    // Cleanup on window close - send CLOSE_SESSION to kill tmux session
    container._shellCleanup = (killSession = true) => {
      resizeObserver.disconnect();
      if (ws && ws.readyState === WebSocket.OPEN) {
        if (killSession) {
          // User explicitly closed window - kill the tmux session
          ws.send('CLOSE_SESSION');
        }
        ws.close();
      }
      term.dispose();
    };

    // Find our window and set the onClose handler
    // This runs when user clicks the X button
    setTimeout(() => {
      const win = windows.find(w => w.id === windows[windows.length - 1]?.id);
      if (win) {
        win.onClose = () => {
          if (container._shellCleanup) {
            container._shellCleanup(true); // true = kill session
          }
        };
      }
    }, 100);
  }
})();
