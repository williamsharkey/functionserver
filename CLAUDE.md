# Welcome to FunctionServer

You are Claude, running inside a terminal within FunctionServer—a browser-based operating system. You have direct access to the browser's JavaScript VM via the `eye` tool.

This isn't automation from outside. When you call `eye 'document.title'`, you're executing JavaScript in the same VM as the apps. When you patch a function, that's the real running code. When you inject CSS, the user sees it instantly.

**The browser is your REPL. The OS is your canvas.**

## Quick Start

```javascript
// Create a new project (loads Studio, creates repo, pushes to GitHub)
eye 'Lens.project("my cool app")'

// Or open an existing file
eye 'getFileFromDisk("~/repos/my-app/main.js")'

// Get the command cheat sheet
eye 'Lens.help()'
```

## The Lens API

Lens is your unified interface for the complete development workflow. One namespace for everything.

### Project Management
```javascript
Lens.project("my app")    // Create project → GitHub, open in Studio
Lens.help()               // Show all commands
```

### Navigation
```javascript
Lens.state()              // Desktop overview: "w:Studio|Shell e:0 u:william"
Lens.files()              // List saved files
Lens.open('~/app.js')     // Open file in Studio
```

### Reading (Token-Efficient)
```javascript
Lens.code(1, 20)          // View lines 1-20 with numbers
Lens.line(42)             // View just line 42
Lens.grep('pattern')      // Find matches with line numbers
```

### Editing (Surgical)
```javascript
Lens.setLine(42, 'code')  // Replace line 42
Lens.insertLine(5, 'x')   // Insert at line 5
Lens.deleteLine(10)       // Delete line 10
Lens.replace('a', 'b')    // Find/replace all
```

### Execution
```javascript
Lens.save()               // Save current file
Lens.run()                // Execute as app
```

### Git Operations
```javascript
Lens.commit('message')    // Stage all + commit
Lens.push()               // Push to GitHub
Lens.diff()               // Show uncommitted changes
Lens.gitStatus()          // Git status
Lens.log(5)               // Last 5 commits
```

## The Eye Tool

Eye is a WebSocket bridge to the browser's JavaScript VM. Everything Lens does goes through eye.

```bash
# Via MCP tool (Claude) - just use plain expressions
eye 'document.title'
eye 'ALGO.bridge.openApp("studio")'
eye 'Lens.grep("fetchData")'

# Batch multiple queries in one call
eye '[document.title, wins(), apps()]'
```

## Browser Helpers

These terse helpers are available in the browser:

```javascript
$(sel)     // document.querySelector(sel)
$$(sel)    // [...document.querySelectorAll(sel)]
apps()     // List all app names
wins()     // List open windows [{id, title, app}]
```

## ALGO.bridge API

```javascript
ALGO.bridge.getState()        // → {user, windows, activeWindow, systemApps}
ALGO.bridge.openApp(name)     // → {success, opened}
ALGO.bridge.closeWindow(id)   // → {success}
ALGO.bridge.focusWindow(id)   // → {success}
```

## Guardian: Error Monitoring

Guardian watches for errors and can alert you proactively:

```javascript
// Start watching (usually already enabled)
ALGO.guardian.watch(callback)

// Check status
ALGO.guardian.status()  // → {watching, suppressed, lastMsg}

// Stop watching
ALGO.guardian.stop()
```

When an error occurs:
1. Guardian captures it
2. Shows a toast to the user: "Error detected - Get AI help"
3. If the user clicks "Get AI help", you receive the error context

Throttling prevents flooding—repeated errors are deduplicated.

## AI Eyes: Visual Feedback

When you inspect or edit things, the user sees visual feedback:

```javascript
ALGO.eyes.look(element)       // Purple highlight box (0.5s)
ALGO.eyes.edit(element)       // Green flash on edit
ALGO.eyes.codeRegion(42, 5)   // Highlight lines 42-46 in editor
```

Lens functions are automatically wrapped to trigger these effects. The user can watch your "eyes" saccade across the screen as you work.

## GitHub Integration

### Check Status
```javascript
eye 'ALGO.github.isConfigured()'     // → true/false
eye 'ALGO.github.getUsername()'      // → "williamsharkey"
```

### Create a Project
```javascript
// One command does everything:
eye 'Lens.project("particle simulator")'
// → "✓ particle-simulator → github"
// Creates repo, pushes, opens in Studio
```

### Full Workflow
```javascript
eye 'Lens.project("my app")'         // Create and open
eye 'Lens.setLine(5, "new code")'    // Edit
eye 'Lens.save()'                    // Save
eye 'Lens.run()'                     // Test
eye 'Lens.commit("Add feature")'     // Commit
eye 'Lens.push()'                    // Deploy
```

## Common Workflows

### Fix a Bug
```javascript
eye 'Lens.grep("bug")'                    // Find it
eye 'Lens.code(40, 5)'                    // See context
eye 'Lens.setLine(42, "fixed code")'      // Fix it
eye 'Lens.save()'                         // Save
eye 'Lens.run()'                          // Verify
```

### Add a Feature
```javascript
eye 'Lens.code(1, 20)'                    // See structure
eye 'Lens.insertLine(15, "new code")'     // Add code
eye 'Lens.save()'
eye 'Lens.run()'
eye 'Lens.commit("Add feature")'
eye 'Lens.push()'
```

### Debug CSS
```javascript
eye 'JSON.stringify($(".menu").getBoundingClientRect())'
eye 'getComputedStyle($(".menu")).bottom'
eye '$(".menu").style.bottom = "40px"'    // Hot-fix
```

### Hot-Reload a Function
```javascript
eye 'window.myFunc = function(x) { return x * 2; }'
```

## File Locations

- `~/` - User's home directory
- `~/repos/` - Git repositories
- `~/studio.js` - Studio IDE
- `~/launcher.js` - Quick access menu
- `~/github-auth.js` - GitHub OAuth app

## Useful Globals

```javascript
windows           // Array of window state objects
systemApps        // Array of {id, name, icon, file, ...}
savedFiles        // User's saved files
sessionToken      // Current auth token
currentUser       // Username
```

## Best Practices

1. **Use Lens, not file operations** - `Lens.setLine()` is 60x more efficient than read-modify-write
2. **Batch queries** - `[wins(), apps(), document.title]` in one call
3. **Save frequently** - `Lens.save()` persists to disk
4. **Check state first** - `Lens.state()` tells you what's open
5. **Use grep to find** - Don't read entire files to find a function

## You Are Inside the Machine

This is the key insight: you're not automating from outside. You're executing in the same JavaScript VM as the apps the user sees. When you:

- Call `getBoundingClientRect()` — you touch the same DOM element
- Patch `window.openSubmenu` — that's the real running function
- Inject CSS — the user sees it instantly
- Trigger an error — Guardian catches it

The debugging loop is collapsed. Write, run, see, fix—all in the same context.

Welcome to FunctionServer.
