# I Let Claude Debug My Browser From the Command Line (Without Refreshing)

Today I built something that felt like crossing a threshold: an AI that can see, inspect, and manipulate a web browser in real-time from completely outside it. Not Puppeteer. Not Selenium. An LLM with authenticated API access to your DOM.

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

## The Live Debugging Session

Here's where it got interesting. The user reported that the Programs submenu was appearing off-screen on larger displays. Instead of the normal debug cycle (inspect element, edit CSS, refresh, repeat), I did this:

**1. Diagnosed remotely via MCP:**
```javascript
// Injected via algo_eval from my terminal
const submenu = document.getElementById('programs-menu');
const rect = submenu.getBoundingClientRect();
// Result: top=616, bottom=1290, viewport=803
// The menu was 487px off-screen
```

**2. Created a virtual cursor to visualize the problem:**
```javascript
const cursor = document.createElement('div');
cursor.innerHTML = '👆';
cursor.style.cssText = 'position:fixed;z-index:99999;font-size:24px;';
document.body.appendChild(cursor);
```

I moved this cursor around to show exactly where the menu was (and wasn't).

**3. Tested fixes by injecting CSS live:**
```javascript
submenu.style.cssText = 'position:fixed; bottom:33px; left:200px;';
```

**4. Hot-reloaded the actual JavaScript function** without refreshing:
```javascript
window.openSubmenu = function(el) {
  // ... patched code ...
};
```

**5. Verified with the cursor walking through all 27 menu items.**

Total time from bug report to fix: ~5 minutes. Zero page refreshes. The user watched their screen change as I manipulated it from outside.

## The Architecture: Neo and Morpheus

We ended up with two personas:

- **Neo** - Claude running inside FunctionServer's terminal (has shell access, runs on server)
- **Morpheus** - Claude running anywhere else (laptop, cloud, phone), controlling the browser via MCP

They can coexist. Neo handles terminal tasks. Morpheus handles browser automation. They can even communicate - Morpheus sets `window.MORPHEUS_MESSAGE`, Neo reads it via the PTY.

For users without shell access ("free tier"), there's Claude Eyes - a window that just shows an ASCII Claude face watching you, logging MCP activity as it happens. You run Claude locally, it controls your cloud desktop, the Eye watches.

```
┌─────────────────────────────┐
│      ◉            ◉        │  <- blinks when commands arrive
│           ────              │
│   Morpheus connected        │
│   ─── MCP Activity ───      │
│   algo_openApp(todo)  ✓     │
│   algo_eval           ✓     │
└─────────────────────────────┘
```

## Why This Matters

**1. The debugging loop just got shorter.**

Instead of: write code → deploy → refresh → inspect → repeat

It's: inspect live → test fix live → commit when it works

The browser becomes a REPL you can poke from anywhere.

**2. AI assistants can have eyes.**

Most AI coding assistants are blind. They read your code, guess what it does, and hope for the best. With MCP, Claude can actually see the rendered output, query element positions, check computed styles, and verify fixes worked.

**3. The "browser as API" pattern scales.**

Right now this is one user, one browser. But there's no reason it couldn't be:
- CI pipelines that verify visual regressions by querying live DOMs
- Support agents that see exactly what the user sees (with permission)
- AI that doesn't just write UI code but verifies it renders correctly

**4. Free users get power without server costs.**

You don't need a shell on my server to use this. Create an account, open Claude Eyes in the browser, run Claude on your own laptop, use MCP to control your cloud desktop. Your API costs, your compute, but you get browser automation for free.

## The Code

It's all open source: https://github.com/williamsharkey/functionserver

Key files:
- `go/main.go` - MCP endpoint, WebSocket routing, auth
- `core/apps/claude/claude.js` - Terminal with MCP command handling
- `core/apps/claude-eyes.js` - The visual MCP activity monitor
- `CLAUDE-MORPHEUS.md` - Docs for external Claude instances

## What's Next

- Multi-tab support (broadcast MCP to all open tabs)
- Recorded sessions (replay MCP command sequences)
- Claude Code native MCP integration (skip curl, use tools directly)

## The Uncomfortable Question

Yes, this means an AI can manipulate your browser. That's why there's auth. Your session token, your control. But the potential for misuse exists, as it does with any powerful tool.

The upside is that an AI can now help you in ways that weren't possible before. It can see what you see. It can try things and check if they worked. It can debug CSS without asking you to "open DevTools and tell me what you see."

Is that worth the tradeoff? For me, watching Claude create a virtual cursor, walk it through my menu, and fix a positioning bug in real-time without me touching anything - yeah, it's worth it.

---

*"I'm trying to free your mind, Neo. But I can only show you the door. You're the one that has to walk through it."*

We built the door today. Let's see who walks through.

---

**Try it:** https://functionserver.com/app (create account, open Claude Eyes, use MCP from anywhere)

**Code:** https://github.com/williamsharkey/functionserver

**Docs:** See CLAUDE.md and CLAUDE-MORPHEUS.md in the repo
