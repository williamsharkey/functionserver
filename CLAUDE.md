# Welcome to FunctionServer

You are Claude, running inside a terminal within FunctionServer - a browser-based operating system. You have direct access to the browser's JavaScript VM.

## Fresh Session Setup

**First thing in any session - load the tools:**
```javascript
eye 'getFileFromDisk("~/studio.js").then(code => runApp(code, "studio.js"))'
```

Or load everything at once:
```javascript
eye 'getFileFromDisk("~/launcher.js").then(code => runApp(code, "launcher.js"))'
```

Then get the command cheat sheet:
```javascript
eye 'Lens.help()'
```

## The Happy Path (AI-First Development)

**Use Lens for token-efficient editing:**
```javascript
Lens.state()              // Check desktop: "w:Studio e:0 u:root"
Lens.open('~/app.js')     // Open file in Studio
Lens.code(1, 20)          // View lines 1-20 with numbers
Lens.grep('function')     // Find pattern with line numbers
Lens.setLine(42, 'code')  // Replace line 42
Lens.insertLine(5, 'x')   // Insert at line 5
Lens.deleteLine(10)       // Delete line 10
Lens.save()               // Save to disk
Lens.run()                // Execute as app
```

**Full docs:** https://functionserver.com/thehappypath.html

## Quick Start: The `eye` Tool

**`eye` is your primary interface to the browser.** It's a direct WebSocket bridge to the JS VM - no HTTP overhead, no JSON wrapping.

```bash
# One-time setup (if not already done)
cat ~/.algo/config.json   # Check if config exists

# Basic usage (MCP tool - just use plain expressions)
eye 'document.title'                      # Get page title
eye '1+1'                                 # Evaluate any JS
eye 'ALGO.bridge.openApp("shell")'        # Open an app
```

**MCP vs CLI:**
- **MCP tool** (Claude): Always returns results. Just use plain expressions.
- **CLI** (humans): Use `id:expr` for response, plain `expr` for fire-and-forget.

## Eye Cheat Sheet

```bash
# Inspect (short helpers available in browser)
eye 'apps()'                              # List all app names
eye 'wins()'                              # List open windows
eye '$(".window-title").textContent'      # Query single element
eye '$$(".window").length'                # Query all elements

# Full API
eye 'document.title'                      # Page title
eye 'windows.length'                      # Open window count
eye 'systemApps.map(a=>a.name)'           # List all apps
eye 'ALGO.bridge.getState()'              # Full desktop state

# Control
eye 'ALGO.bridge.openApp("shade-station")'   # Open app
eye 'ALGO.bridge.closeWindow(0)'             # Close window
eye 'ALGO.bridge.focusWindow(1)'             # Focus window

# DOM
eye 'document.querySelector(".window-title").textContent'
eye '[...document.querySelectorAll(".window")].length'

# Debug CSS
eye 'JSON.stringify($(".menu").getBoundingClientRect())'
eye 'getComputedStyle($(".menu")).bottom'

# Inject CSS/JS
eye 'document.body.style.background="red"'
eye '$(".window").style.border="2px solid lime"'
```

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│           FunctionServer WebSocket (/api/eye)                │
└──────────────────────────┬───────────────────────────────────┘
                           │
         ┌─────────────────┴─────────────────┐
         │                                   │
   ┌─────▼─────┐                      ┌──────▼──────┐
   │  eye CLI  │                      │  eye-mcp    │
   │  (human)  │                      │  (Claude)   │
   │  ~75ms    │                      │  ~25ms      │
   └───────────┘                      └─────────────┘
```

- **eye CLI**: Simple, stateless - connects fresh each call. Good for humans typing.
- **eye-mcp**: MCP server with persistent WebSocket. 3x faster. Native Claude Code tool.

## Browser Shortcuts

These terse helpers are available in the browser for shorter commands:

```javascript
$(sel)     // document.querySelector(sel)
$$(sel)    // [...document.querySelectorAll(sel)]
apps()     // systemApps.map(a => a.name)
wins()     // windows.map(w => ({id, title, app}))
```

## ALGO.bridge API

```javascript
ALGO.bridge.getState()        // → {user, windows, activeWindow, systemApps}
ALGO.bridge.openApp(name)     // → {success, opened}
ALGO.bridge.closeWindow(id)   // → {success}
ALGO.bridge.focusWindow(id)   // → {success}
ALGO.bridge.query(selector)   // → element info
ALGO.bridge.queryAll(selector)// → array of element info
ALGO.bridge.click(selector)   // → {success}
ALGO.bridge.setValue(sel,val) // → {success}
ALGO.bridge.eval(code)        // → result (same as direct expression)
```

## Useful Globals in Browser

```javascript
windows           // Array of window state objects
systemApps        // Array of {id, name, icon, file, ...}
savedFiles        // User's saved files
localStorage      // Persistent storage
document          // Full DOM access
```

## Common Patterns

**Batch multiple queries (faster):**
```bash
# Instead of 3 calls:
eye 'document.title'
eye 'wins()'
eye 'apps()'

# One call:
eye '[document.title, wins(), apps()]'
```

**List window titles:**
```bash
eye 'wins()'
```

**Find and fix CSS issue:**
```bash
eye 'JSON.stringify($("#menu").getBoundingClientRect())'
# See the problem, then fix:
eye '$("#menu").style.bottom="40px"'
```

**Async operations (eye-mcp awaits promises):**
```bash
eye 'saveFileToDisk("test.txt", "hello")'    # Returns true/false
eye 'fetchDesktopFiles()'                     # Returns file list
```

**Inject a style:**
```bash
eye 'const s=document.createElement("style");s.textContent=".x{color:red}";document.head.appendChild(s)'
```

**Hot-reload a function:**
```bash
eye 'window.myFunc = function(x) { return x * 2; }'
```

## File Locations

- `/root/functionserver/` - The codebase
- `/root/functionserver/go/main.go` - Backend server
- `/root/functionserver/core/algo-os.html` - Frontend OS
- `/root/functionserver/core/apps/` - App JavaScript files
- `~/.algo/config.json` - Eye configuration

## You Are Inside the Machine

This isn't automation from outside. When you call `eye 'document.title'`, you're executing JavaScript in the same VM as the apps. When you patch a function, that's the real running code. When you inject CSS, the user sees it instantly.

The browser is your REPL. The OS is your canvas.
