# I Let Claude Debug My Browser From the Command Line (Without Refreshing)

Today I built something that felt like crossing a threshold: an AI that can see, inspect, and manipulate a web browser in real-time from completely outside it. Not Puppeteer. Not Selenium. An LLM with authenticated API access to your DOM.

![FunctionServer with live shader background, Claude Eyes, and Shade Station](https://functionserver.com/root/full-desktop.png)

## What We Built

FunctionServer is a browser-based operating system (think Windows 95 aesthetic, runs at functionserver.com). It has windows, apps, a start menu, the works. We added:

1. **MCP Bridge** - A Model Context Protocol endpoint that routes commands to the browser via WebSocket
2. **Authenticated API** - Bearer tokens so only you can control your session
3. **Browser Tools** - `algo_eval`, `algo_getState`, `algo_query`, `algo_click`, `algo_openApp`, etc.

The result: Claude (or any LLM with HTTP access) can execute JavaScript in your browser, query the DOM, click buttons, and open apps - all via curl.

```bash
curl -X POST https://functionserver.com/api/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"method":"tools/call","params":{"name":"algo_openApp","arguments":{"appId":"calculator"}}}'
```

A window opens in your browser. From my terminal. No WebDriver. No browser automation framework. Just HTTPS.

## The Live Debugging Sessions

### Session 1: The Invisible Menu

The user reported that the Programs submenu was appearing off-screen. Instead of the normal debug cycle (inspect element, edit CSS, refresh, repeat), I did this:

**1. Diagnosed remotely via MCP:**
```javascript
// Injected via algo_eval from my terminal
const submenu = document.getElementById('programs-menu');
const rect = submenu.getBoundingClientRect();
// Result: {bottom: 343, taskbarTop: 383}
// The menu was 40px too high!
```

**2. Found the conflict:**
```javascript
const cs = getComputedStyle(submenu);
// inline: {top: "auto", bottom: "39px"}
// computed: {top: "0px", bottom: "80px"}  <- CSS overriding inline!
```

**3. Fixed it with setProperty + !important:**
```javascript
submenu.style.setProperty('bottom', '40px', 'important');
submenu.style.setProperty('top', 'auto', 'important');
// Both menus now at 383.3px - aligned!
```

**4. Hot-reloaded the function** without refreshing:
```javascript
window.openSubmenu = function(el) {
  // ... patched code with setProperty ...
};
```

Total time: ~5 minutes. Zero page refreshes.

### Session 2: The Missing Calendar

User: "Calendar looks like unstyled webpage, missing CSS or something."

```javascript
// Check what classes the calendar uses
const grid = document.querySelector('.cal-grid');
getComputedStyle(grid).display;  // "block" - no grid!

// The CSS had .calendar-app-header but the app uses .cal-header
// Completely different naming conventions. Injected fix:
const style = document.createElement('style');
style.textContent = `
  .cal-header { display: flex; background: #008080; color: white; }
  .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); }
  .cal-day { background: white; cursor: pointer; }
  .cal-day.today { background: #c0e0e0; }
`;
document.head.appendChild(style);
// Calendar instantly styled!
```

### Session 3: Live WebGL Desktop Background

This one was just for fun. I wrote a shader in Shade Station, then via MCP:

```javascript
// Create canvas behind desktop icons
const canvas = document.createElement('canvas');
canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:0';
desktop.insertBefore(canvas, desktop.firstChild);

// Initialize WebGL, compile shader, start render loop
const gl = canvas.getContext('webgl');
// ... shader compilation ...
function render() {
  gl.uniform1f(timeLoc, time += 0.016);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  requestAnimationFrame(render);
}
render();
```

Now there's a hypnotic tunnel shader animating as the desktop wallpaper. All injected via MCP. The user watched it appear in real-time.

![Live shader desktop background](https://functionserver.com/root/shader-bg.png)

## The MCP Debugging Technique

| Step | Tool | Purpose |
|------|------|---------|
| Measure | `getBoundingClientRect()` | Get exact pixel positions |
| Diagnose | `getComputedStyle()` vs inline | Find style conflicts |
| Inject CSS | `document.createElement('style')` | Test fixes instantly |
| Force override | `setProperty('prop', 'val', 'important')` | Beat stubborn CSS |
| Patch functions | `window.fn = function() {...}` | Hot-reload JS |
| Verify | `getBoundingClientRect()` again | Confirm fix worked |

The browser becomes a REPL you can poke from anywhere.

## The Architecture: Neo and Morpheus

We ended up with two personas:

- **Neo** - Claude running inside FunctionServer's terminal (has shell access, runs on server)
- **Morpheus** - Claude running anywhere else (laptop, cloud, phone), controlling the browser via MCP

For users without shell access, there's Claude Eyes - a window that shows an ASCII Claude face watching you, logging MCP activity as it happens:

```
┌─────────────────────────────┐
│      ◉            ◉        │  <- blinks when commands arrive
│           ────              │
│   Morpheus connected        │
│   ─── MCP Activity ───      │
│   algo_openApp(calendar) ✓  │
│   algo_eval              ✓  │
│   algo_eval              ✓  │
└─────────────────────────────┘
```

---

> **A note on architecture**
>
> Live patching exists. Browser automation exists. MITM injection exists. So what's actually new here?
>
> In a traditional setup, apps are compiled binaries or isolated processes. You automate them from outside via WebDriver protocols. The AI is a client, the app is a server.
>
> In FunctionServer, apps *are* JavaScript artifacts running in the same VM that MCP accesses. When Claude calls `getBoundingClientRect()`, it's touching the same DOM element the user sees. When it patches `window.openSubmenu`, that's the real running function. The AI doesn't automate the OS—it inhabits it.
>
> This creates an interesting question: how do you version control a system that's constantly being reshaped?
>
> You don't. Each app becomes its own repository. What you version is the *protocol*—the ALGO API, the conventions for file type registration, the pubsub message format. The OS defines the rules. Users and AI agents shape whatever they want within them.
>
> We're not sure yet what this topology enables. But there's something in the architecture worth exploring—a cloud OS where apps, AI, and debugging tools share the same address space.

---

## Why This Matters

**1. The debugging loop collapsed.**

Old way: write code → deploy → refresh → inspect → guess → repeat

New way: inspect live → measure → test fix → verify → commit

**2. AI assistants can have eyes.**

Most AI coding assistants are blind. They read your code, guess what it does, and hope. With MCP, Claude can query element positions, check computed styles, inject test fixes, and verify they worked - all before touching your source files.

**3. It's surprisingly precise.**

When I needed to align two menus, I didn't guess. I measured:
```javascript
startMenu.bottom: 383.3px
programsMenu.bottom: 343.3px  // 40px off!
// After fix:
programsMenu.bottom: 383.3px  // Aligned!
```

**4. Live shader desktop backgrounds.**

I didn't plan this feature. I was testing Shade Station via MCP, saved a shader, and thought "what if the desktop could render this?" Twenty minutes later, there's a hypnotic tunnel animating behind the icons. That's the power of having direct DOM access.

## The Code

Open source: https://github.com/williamsharkey/functionserver

Key files:
- `go/main.go` - MCP endpoint, WebSocket routing, auth
- `core/apps/claude-eyes.js` - Visual MCP activity monitor
- `core/apps/shade-station.js` - WebGL shader editor with save-to-desktop
- `CLAUDE-MORPHEUS.md` - Docs for external Claude instances

## The Uncomfortable Question

Yes, this means an AI can manipulate your browser. That's why there's auth. Your session token, your control.

The upside: an AI can now help you in ways that weren't possible before. It can see what you see. It can try things and check if they worked. It can debug CSS without asking you to "open DevTools and tell me what you see."

Is that worth the tradeoff? For me, watching Claude inject a WebGL shader as my desktop background from a terminal on my laptop - yeah, it's worth it.

---

*"I'm trying to free your mind, Neo. But I can only show you the door. You're the one that has to walk through it."*

We built the door. Come walk through.

---

**Try it:** https://functionserver.com/app (create account, open Claude Eyes, use MCP from anywhere)

**Code:** https://github.com/williamsharkey/functionserver

**Docs:** See CLAUDE.md and CLAUDE-MORPHEUS.md in the repo
