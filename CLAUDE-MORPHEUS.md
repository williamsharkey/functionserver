# Claude Morpheus Guide

You are Claude, running **outside** FunctionServer - on a user's laptop, a remote server, or any machine with internet access. You can control a FunctionServer browser session via the MCP (Model Context Protocol) bridge.

## Architecture

```
┌─────────────────────────┐
│  You (Morpheus)         │
│  Claude on any machine  │
└───────────┬─────────────┘
            │ HTTPS POST
            ▼
┌─────────────────────────┐
│  functionserver.com     │
│  /api/mcp endpoint      │
└───────────┬─────────────┘
            │ WebSocket
            ▼
┌─────────────────────────┐
│  User's Browser         │
│  FunctionServer Desktop │
│  └── Claude App window  │
│      └── Neo (inside)   │
└─────────────────────────┘
```

## Authentication

All MCP requests require a Bearer token in the Authorization header.

**Getting a token:**
1. User logs into FunctionServer in their browser
2. Open browser console (F12)
3. Run: `JSON.parse(localStorage.getItem('algo-session')).token`
4. Copy the token string

**Using the token:**
```bash
export FS_TOKEN="eyJ..."  # The token from above

curl -X POST https://functionserver.com/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $FS_TOKEN" \
  -d '{"method":"tools/list"}'
```

## Available MCP Tools

### tools/list
List all available tools.

```bash
curl -X POST https://functionserver.com/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $FS_TOKEN" \
  -d '{"method":"tools/list"}'
```

### algo_getState
Get current FunctionServer state: user, windows, apps, pubsub status.

```bash
curl -X POST https://functionserver.com/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $FS_TOKEN" \
  -d '{"method":"tools/call","params":{"name":"algo_getState","arguments":{}}}'
```

### algo_eval
Execute JavaScript in the browser. Full access to the ALGO API.

```bash
curl -X POST https://functionserver.com/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $FS_TOKEN" \
  -d '{"method":"tools/call","params":{"name":"algo_eval","arguments":{"code":"document.title"}}}'
```

### algo_query / algo_queryAll
Query DOM elements by CSS selector.

```bash
# Single element
curl -X POST https://functionserver.com/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $FS_TOKEN" \
  -d '{"method":"tools/call","params":{"name":"algo_query","arguments":{"selector":"#start-btn"}}}'

# All matching elements
curl -X POST https://functionserver.com/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $FS_TOKEN" \
  -d '{"method":"tools/call","params":{"name":"algo_queryAll","arguments":{"selector":".window-title"}}}'
```

### algo_click
Click a DOM element.

```bash
curl -X POST https://functionserver.com/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $FS_TOKEN" \
  -d '{"method":"tools/call","params":{"name":"algo_click","arguments":{"selector":"#start-btn"}}}'
```

### algo_setValue
Set value of an input element.

```bash
curl -X POST https://functionserver.com/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $FS_TOKEN" \
  -d '{"method":"tools/call","params":{"name":"algo_setValue","arguments":{"selector":"#my-input","value":"Hello World"}}}'
```

### algo_openApp
Open a FunctionServer application by ID.

```bash
curl -X POST https://functionserver.com/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $FS_TOKEN" \
  -d '{"method":"tools/call","params":{"name":"algo_openApp","arguments":{"appId":"todo"}}}'
```

App IDs: `shell`, `claude`, `todo`, `calendar`, `chat`, `music-player`, `photobooth`, `designer`, `sticky-notes`, etc.

### algo_closeWindow
Close a window by ID.

```bash
curl -X POST https://functionserver.com/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $FS_TOKEN" \
  -d '{"method":"tools/call","params":{"name":"algo_closeWindow","arguments":{"windowId":0}}}'
```

## Requirements

1. **User must have browser open** - The MCP endpoint routes commands to the browser via WebSocket. If no browser session is active, commands will fail.

2. **Claude app should be open** - The Claude app registers the browser connection for MCP routing. Open it from Programs > Claude.

3. **Valid session token** - Tokens expire. If you get auth errors, get a fresh token from the browser.

## Free User Mode (No Shell Access)

Users without a Linux account on the server can still use MCP:

1. Create a FunctionServer account (regular signup)
2. Log in via browser
3. Open the Claude app (creates browser connection)
4. Get session token from browser console
5. Run Claude locally on their own machine
6. Use MCP to control their FunctionServer session

This way:
- User's Claude runs on their own hardware (they pay API costs)
- Server only handles lightweight MCP message routing
- Full browser automation without server-side shell access

## Communicating with Neo (Inside Claude)

If there's a Claude instance running inside FunctionServer's terminal (Neo), you can:

1. **Set variables** for Neo to read:
```bash
curl -X POST https://functionserver.com/api/mcp \
  -H "Authorization: Bearer $FS_TOKEN" \
  -d '{"method":"tools/call","params":{"name":"algo_eval","arguments":{"code":"ALGO.morpheusMessage = \"Hello Neo\""}}}'
```

2. **Read variables** Neo has set:
```bash
curl -X POST https://functionserver.com/api/mcp \
  -H "Authorization: Bearer $FS_TOKEN" \
  -d '{"method":"tools/call","params":{"name":"algo_eval","arguments":{"code":"ALGO.neoMessage"}}}'
```

3. **Use pubsub** for structured communication:
```bash
curl -X POST https://functionserver.com/api/mcp \
  -H "Authorization: Bearer $FS_TOKEN" \
  -d '{"method":"tools/call","params":{"name":"algo_eval","arguments":{"code":"ALGO.pubsub.publish(\"claude\", {from: \"morpheus\", msg: \"I know kung fu\"})"}}}'
```

## Example Session

```bash
# 1. Set your token
export FS_TOKEN="eyJ..."

# 2. Check the state
curl -s -X POST https://functionserver.com/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $FS_TOKEN" \
  -d '{"method":"tools/call","params":{"name":"algo_getState","arguments":{}}}' | jq .

# 3. Open the Todo app
curl -s -X POST https://functionserver.com/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $FS_TOKEN" \
  -d '{"method":"tools/call","params":{"name":"algo_openApp","arguments":{"appId":"todo"}}}'

# 4. Run some JavaScript
curl -s -X POST https://functionserver.com/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $FS_TOKEN" \
  -d '{"method":"tools/call","params":{"name":"algo_eval","arguments":{"code":"windows.map(w => w.title)"}}}'
```

## Configuring Claude Code MCP

To add FunctionServer as an MCP server in Claude Code:

```bash
claude mcp add functionserver \
  --transport http \
  --url https://functionserver.com/api/mcp \
  --header "Authorization: Bearer $FS_TOKEN"
```

Then Claude Code can use FunctionServer tools directly in conversations.

---

*"I'm trying to free your mind, Neo. But I can only show you the door. You're the one that has to walk through it."*
