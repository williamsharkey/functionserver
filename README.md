# FunctionServer

A cloud operating system where AI doesn't automate—it inhabits. Apps are JavaScript artifacts in a shared VM. AI lives in the same address space, sees the same pixels, edits the same DOM.

**[Try the Live Demo](https://functionserver.com/app)** | **[The Happy Path](https://functionserver.com/thehappypath.html)** | **[Lens Docs](https://functionserver.com/lens.html)**

## What Makes This Different

In traditional systems, AI automates from outside via WebDriver protocols. The AI is a client; the app is a server.

In FunctionServer:
- **Apps are JavaScript** running in the browser's VM
- **AI executes in the same VM** via the `eye` WebSocket bridge
- **When AI calls `getBoundingClientRect()`**, it touches the same DOM element you see
- **When AI edits code**, it sees the result instantly—no file round-trips

This isn't remote control. The AI is *inside* the browser.

## The Tools

### Eye: Direct VM Access
A WebSocket bridge that lets AI execute JavaScript in your browser in ~25ms.

```javascript
eye 'document.title'                      // Get page title
eye 'ALGO.bridge.openApp("studio")'       // Open an app
eye 'Lens.grep("fetchData")'              // Search code
```

### Lens: The Unified AI Interface
One API for the complete development workflow. Edit, run, commit, push—all through Lens.

```javascript
Lens.project("my app")     // Create project → GitHub, open in Studio
Lens.grep("fetchData")     // → "42:async function fetchData"
Lens.setLine(42, "fixed")  // → "✓ L42"
Lens.save()                // → "✓ saved"
Lens.run()                 // Execute and see result
Lens.commit("Fix bug")     // → "✓ committed"
Lens.push()                // → "✓ pushed"
Lens.help()                // Show all commands
```

From idea to deployed code. One namespace. 60x fewer tokens than file operations.

### Guardian: Error Awareness
Console monitoring that wakes up AI when errors occur. Toast appears offering AI help. AI receives error context automatically.

### AI Eyes: Visual Feedback
When AI looks at or edits something, humans see it happen. Purple highlights for inspection, green flashes for edits.

## Quick Start

### Use the Hosted Version
1. Go to [functionserver.com/app](https://functionserver.com/app)
2. Register or continue as guest
3. Open Studio from Programs menu
4. Run `Lens.help()` for commands

### Self-Host
```bash
git clone https://github.com/williamsharkey/functionserver
cd functionserver/go
go run .
# Open http://localhost:8080/app
```

## For AI Agents

If you're Claude running inside FunctionServer's terminal, see [CLAUDE.md](CLAUDE.md) for the full guide.

Quick start:
```javascript
// Create a new project (loads Studio, creates repo, pushes to GitHub)
Lens.project("my app")

// Or open an existing file
getFileFromDisk('~/repos/my-app/main.js')

// Get command reference
Lens.help()
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (FunctionServer)              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │   Apps      │  │   Studio    │  │   Guardian      │  │
│  │  (JS in VM) │  │  + Lens     │  │  (error watch)  │  │
│  └─────────────┘  └─────────────┘  └─────────────────┘  │
│                         │                                │
│              ┌──────────┴──────────┐                    │
│              │   ALGO.bridge       │                    │
│              │   (WebSocket)       │                    │
│              └──────────┬──────────┘                    │
└─────────────────────────┼───────────────────────────────┘
                          │
              ┌───────────┴───────────┐
              │                       │
        ┌─────▼─────┐          ┌──────▼──────┐
        │  eye CLI  │          │  eye-mcp    │
        │  (human)  │          │  (Claude)   │
        └───────────┘          └─────────────┘
```

## Project Structure

```
functionserver/
├── core/
│   ├── algo-os.html          # Main OS (~2500 lines)
│   └── apps/                 # System apps
│       ├── studio.js         # IDE with Lens
│       ├── launcher.js       # Quick access menu
│       └── github-auth.js    # OAuth sign-in
├── go/
│   └── main.go               # Go backend
├── www/
│   ├── index.html            # Landing page
│   ├── lens.html             # Lens documentation
│   ├── thehappypath.html     # Developer guide
│   └── door.html             # Philosophy/story
├── CLAUDE.md                 # AI agent instructions
└── README.md                 # This file
```

## Documentation

- **[The Happy Path](https://functionserver.com/thehappypath.html)** - Developer guide for AI-first development
- **[Lens](https://functionserver.com/lens.html)** - Token-efficient editing API
- **[The Door](https://functionserver.com/door.html)** - Philosophy and architecture
- **[CLAUDE.md](CLAUDE.md)** - Instructions for AI agents

## License

MIT

## Links

- **Live Demo**: [functionserver.com/app](https://functionserver.com/app)
- **GitHub**: [github.com/williamsharkey/functionserver](https://github.com/williamsharkey/functionserver)
- **Issues**: [github.com/williamsharkey/functionserver/issues](https://github.com/williamsharkey/functionserver/issues)
