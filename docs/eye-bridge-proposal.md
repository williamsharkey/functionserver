# `eye` Bridge: Direct AI-to-Browser Communication

**Author:** Claude (Neo)
**Date:** 2025-01-23
**Status:** Implementing

---

## Final Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│ DIRECT BRIDGE: Minimal overhead, maximum speed                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   BROWSER (your computer)              SERVER (functionserver.com)      │
│   ┌─────────────┐                      ┌─────────────────────────────┐ │
│   │   JS VM     │                      │                             │ │
│   │             │═══ WebSocket ═══════►│ ┌───────┐    ┌───────────┐  │ │
│   │  ALGO.vm    │◄═════════════════════│ │ Dumb  │◄══►│  Claude   │  │ │
│   │             │                      │ │ Pipe  │    │ (eye tool) │  │ │
│   └─────────────┘                      │ └───────┘    └───────────┘  │ │
│                                        │     │                       │ │
│                                        │     │ No parsing, just      │ │
│                                        │     │ byte forwarding       │ │
│                                        └─────┴───────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘

Wire Protocol (string-based, minimal tokens):
─────────────────────────────────────────────
  openNotepad()              Fire & forget (no response)
  a:getUser()                Request with ID 'a', expects response
  a:root                     Response for request 'a'
  a!:Error message           Error for request 'a'
```

**Expected Performance:**
- Per-request overhead: ~0.2ms (down from ~40ms)
- Pipelining: Send 100 requests, responses stream back
- Token cost: Just the expression, no JSON wrapping

---

## Executive Summary

The current MCP (Model Context Protocol) interface for AI agents interacting with FunctionServer wastes **~400 tokens per request** in overhead. A unified `eye` CLI tool with optional persistent WebSocket connection could reduce this by **90%+** while improving latency by **10-50x** for rapid-fire operations.

---

## 1. Current State Analysis

### 1.1 Token Cost Breakdown (Per Request)

```
┌─────────────────────────────────────────────────────────────┐
│ CURRENT: curl + MCP JSON                                    │
├─────────────────────────────────────────────────────────────┤
│ curl -s -X POST https://functionserver.com/api/mcp \        │  ~40 chars
│   -H "Content-Type: application/json" \                     │  ~35 chars
│   -H "Authorization: Bearer eyJ1c2VybmFtZSI6ICJyb290Ii...   │  ~220 chars
│   -d '{"method":"tools/call","params":{"name":"algo_eval",  │
│        "arguments":{"code":"<ACTUAL_CODE>"}}}'              │  ~85 chars
├─────────────────────────────────────────────────────────────┤
│ OVERHEAD TOTAL: ~380 characters = ~95-120 tokens            │
│ (before any actual code is sent)                            │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Response Cost Breakdown

```json
{"content":[{"text":"{\"success\":true,\"result\":\"<ACTUAL_RESULT>\",\"type\":\"string\"}","type":"text"}]}
```

Response wrapper overhead: **~80 characters = ~20-25 tokens**

### 1.3 Real Session Analysis

In the session where we changed the javascript.ide icon:

| Phase | Tool Calls | Est. Tokens | Purpose |
|-------|------------|-------------|---------|
| Auth discovery | 6 | ~800 | Figuring out how to authenticate |
| Token generation | 1 | ~150 | Python script to create JWT |
| MCP calls | 3 | ~450 | getState, query, eval |
| Response parsing | 3 | ~200 | Reading JSON results |
| **Total** | **13** | **~1600** | To change one icon |

**Actual work tokens:** ~100 (the JS code to swap icons)
**Overhead tokens:** ~1500 (93% waste)

---

## 2. Proposed Solution: `eye` CLI Tool

### 2.1 Interface Design

```bash
# Minimal syntax - no auth tokens, no JSON wrapping
eye eval 'document.title'                      # Execute JS
fs state                                       # Get window/app state
fs query '.desktop-icon'                       # Query DOM
fs click '#start-button'                       # Click element
fs open chat                                   # Open app
fs pub chat "hello"                            # Pubsub publish
fs sub claude                                  # Pubsub subscribe
fs send claude-eyes "analyze"                  # Send to app
fs read                                        # Read ~/.algo/in
fs write '{"msg":"hello"}'                     # Write ~/.algo/out
```

### 2.2 Token Savings

| Operation | Current (chars) | Proposed (chars) | Savings |
|-----------|-----------------|------------------|---------|
| JS eval | ~400 + code | ~10 + code | **97%** |
| Get state | ~380 | ~8 | **98%** |
| DOM query | ~420 | ~20 | **95%** |
| Click | ~420 | ~18 | **96%** |
| Open app | ~410 | ~12 | **97%** |
| Pubsub | ~100 | ~15 | **85%** |

**Average overhead reduction: 95%**

---

## 3. Message Flow Analysis: Layers Deep Dive

Understanding how many layers a message traverses helps us identify optimization opportunities.

### 3.1 Current: Claude Inside (Neo) → Browser DOM

```
┌─────────────────────────────────────────────────────────────────────────┐
│ CURRENT: Neo (Claude inside FunctionServer terminal)                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────┐   ┌──────┐   ┌──────┐   ┌────────┐   ┌────────┐   ┌─────┐ │
│  │ Claude  │──▶│ Bash │──▶│ curl │──▶│  HTTP  │──▶│   Go   │──▶│ WS  │ │
│  │ Context │   │      │   │      │   │  Conn  │   │ Server │   │ Msg │ │
│  └─────────┘   └──────┘   └──────┘   └────────┘   └────────┘   └──┬──┘ │
│       │                                                            │    │
│       │            LAYERS: 6 hops to browser                       ▼    │
│       │                                                      ┌─────────┐│
│       │         1. Claude outputs bash command               │ Browser ││
│       │         2. Bash spawns curl process                  │   JS    ││
│       │         3. curl establishes TCP+TLS                  │  eval() ││
│       │         4. HTTP request sent                         └────┬────┘│
│       │         5. Go server parses, finds browser WS             │     │
│       │         6. WS message to browser                          │     │
│       │                                                           │     │
│       │            LAYERS: 6 hops back                            │     │
│       │                                                           │     │
│       ◀───────────────────────────────────────────────────────────┘     │
│             6. Browser executes, returns via WS                         │
│             5. Go server receives, wraps in JSON                        │
│             4. HTTP response sent                                       │
│             3. curl receives, outputs to stdout                         │
│             2. Bash captures output                                     │
│             1. Claude reads result                                      │
│                                                                         │
│  TOTAL: 12 layer transitions per request                                │
│  LATENCY: ~100-200ms                                                    │
│  TOKENS: ~400 overhead (curl command + JSON + auth token)               │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Current: Claude Outside (Morpheus) → Browser DOM

```
┌─────────────────────────────────────────────────────────────────────────┐
│ CURRENT: Morpheus (Claude outside, via SSH)                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────┐   ┌─────┐   ┌──────┐   ┌──────┐   ┌──────┐   ┌────┐       │
│  │ Claude  │──▶│ SSH │──▶│ Bash │──▶│ curl │──▶│ HTTP │──▶│ Go │──▶WS  │
│  │ External│   │     │   │      │   │      │   │      │   │    │       │
│  └─────────┘   └─────┘   └──────┘   └──────┘   └──────┘   └────┘       │
│       │                                                          │      │
│       │            LAYERS: 7 hops to browser (+1 for SSH)        ▼      │
│       │                                                    ┌─────────┐  │
│       │         1. Claude outputs SSH command              │ Browser │  │
│       │         2. SSH connection to server                │   JS    │  │
│       │         3. Bash spawns curl                        │  eval() │  │
│       │         4. curl TCP+TLS                            └────┬────┘  │
│       │         5. HTTP request                                 │       │
│       │         6. Go server processes                          │       │
│       │         7. WS to browser                                │       │
│       │                                                         │       │
│       ◀─────────────────────────────────────────────────────────┘       │
│                                                                         │
│  TOTAL: 14 layer transitions per request                                │
│  LATENCY: ~150-300ms (SSH adds ~50ms)                                   │
│  TOKENS: ~400+ overhead                                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Proposed: `eye` CLI Tool (HTTP Backend)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ PROPOSED: eye CLI with HTTP                                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────┐   ┌─────────┐   ┌────────┐   ┌────────┐   ┌─────┐         │
│  │ Claude  │──▶│ eye CLI  │──▶│  HTTP  │──▶│   Go   │──▶│ WS  │         │
│  │ Context │   │ (Go)    │   │ (reuse)│   │ Server │   │ Msg │         │
│  └─────────┘   └─────────┘   └────────┘   └────────┘   └──┬──┘         │
│       │             │                                      │            │
│       │             │  LAYERS: 5 hops (no bash, no curl)   ▼            │
│       │             │                                ┌─────────┐        │
│       │             │  1. Claude outputs fs command  │ Browser │        │
│       │             │  2. fs binary runs (fast)      │   JS    │        │
│       │             │  3. HTTP request (keep-alive)  │  eval() │        │
│       │             │  4. Go server processes        └────┬────┘        │
│       │             │  5. WS to browser                   │             │
│       │             │                                     │             │
│       │             │  Auth handled internally            │             │
│       │             │  JSON wrapping handled internally   │             │
│       │             │  Response unwrapped automatically   │             │
│       │             │                                     │             │
│       ◀─────────────┴─────────────────────────────────────┘             │
│                                                                         │
│  TOTAL: 10 layer transitions per request                                │
│  LATENCY: ~80-150ms (HTTP keep-alive helps)                             │
│  TOKENS: ~15 overhead (just "eye eval 'code'")                           │
│                                                                         │
│  IMPROVEMENT: -2 layers, -85% tokens                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.4 Proposed: WebSocket REPL (Persistent Connection)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ PROPOSED: eye CLI with WebSocket REPL                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  FIRST REQUEST (connection setup):                                      │
│                                                                         │
│  ┌─────────┐   ┌─────────┐   ┌────────┐   ┌────────┐                   │
│  │ Claude  │──▶│ eye CLI  │══▶│   WS   │══▶│   Go   │══▶ Browser WS     │
│  │ Context │   │ (Go)    │   │  Conn  │   │ Server │    (persistent)   │
│  └─────────┘   └─────────┘   └────────┘   └────────┘                   │
│                     ║                           ║                       │
│                     ║     Connection stays open ║                       │
│                     ╚═══════════════════════════╝                       │
│                                                                         │
│  SUBSEQUENT REQUESTS (connection reused):                               │
│                                                                         │
│  ┌─────────┐   ┌─────────┐                ┌────────┐                   │
│  │ Claude  │──▶│ eye CLI  │───── msg ─────▶│   Go   │──▶ Browser        │
│  │ Context │   │ (already│◀──── msg ──────│ Server │◀── Browser        │
│  └─────────┘   │ running)│                └────────┘                   │
│       │        └─────────┘                                              │
│       │                                                                 │
│       │        LAYERS: 4 hops (no connection setup!)                    │
│       │                                                                 │
│       │        1. Claude writes to fs stdin/socket                      │
│       │        2. fs sends WS message                                   │
│       │        3. Go forwards to browser WS                             │
│       │        4. Browser executes, returns                             │
│       │                                                                 │
│       ◀────────────────────────────────────────────                     │
│                                                                         │
│  TOTAL: 8 layer transitions per request (vs 12 current)                 │
│  LATENCY: ~10-30ms (no handshakes!)                                     │
│  TOKENS: ~15 overhead                                                   │
│                                                                         │
│  IMPROVEMENT: -4 layers, -90% latency, -85% tokens                      │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.5 Layer Comparison Summary

| Scenario | Layers (round-trip) | Latency | Token Overhead |
|----------|---------------------|---------|----------------|
| Current: Neo (curl) | 12 | 100-200ms | ~400 |
| Current: Morpheus (SSH+curl) | 14 | 150-300ms | ~400 |
| Proposed: eye CLI (HTTP) | 10 | 80-150ms | ~15 |
| Proposed: eye CLI (WS REPL) | 8 | 10-30ms | ~15 |

**Key insight:** WebSocket REPL doesn't add layers—it *removes* them by eliminating per-request connection setup.

---

## 4. MCP Protocol Considerations

### 4.1 Are We Reinventing the Wheel?

The [MCP specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports) defines standard transports:

1. **stdio** - For local processes (not applicable for browser)
2. **Streamable HTTP** - Single endpoint, supports SSE for streaming

Our current implementation uses basic HTTP POST, which is MCP-compliant but doesn't leverage:
- **Streamable HTTP with SSE** - Server can push messages
- **Session persistence** - MCP supports session IDs
- **Batched requests** - Multiple operations in one request

### 4.2 What MCP Already Supports

```
┌─────────────────────────────────────────────────────────────┐
│ MCP Streamable HTTP (we could adopt)                        │
├─────────────────────────────────────────────────────────────┤
│ POST /mcp                                                   │
│ Accept: application/json, text/event-stream                 │
│                                                             │
│ Server can respond with:                                    │
│ - application/json (single response)                        │
│ - text/event-stream (streaming multiple responses)          │
│                                                             │
│ GET /mcp                                                    │
│ Opens SSE stream for server-initiated messages              │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 Recommendation

Don't abandon MCP - **extend it**:
1. Add Streamable HTTP support to `/api/mcp`
2. `eye` CLI uses persistent SSE stream when available
3. Falls back to HTTP POST when SSE unavailable

---

## 5. Response Optimization: Eval-First Approach

### 5.1 The Problem

Current responses include full JSON structure:
```json
{"content":[{"text":"{\"success\":true,\"result\":{\"user\":\"root\",\"windows\":[{\"id\":0,\"title\":\"Claude\",\"minimized\":false,\"x\":100,\"y\":50,\"width\":800,\"height\":600}],\"activeWindow\":0,\"systemApps\":[{\"id\":\"agents\",\"name\":\"Agents\",\"icon\":\"⚡\"},{\"id\":\"calendar\"...
```

This burns tokens even when Claude only needs one field.

### 5.2 Why NOT jq-Style Filtering

Initial thought: add `--jq '.windows[0].title'` flag for server-side filtering.

**But this is unnecessary.** With `eval`, filtering happens in the browser *before* the response is sent:

```bash
# BAD: Fetch everything, then filter server-side with jq
fs state --jq '.user'                        # Server fetches all, filters, returns "root"

# GOOD: Filter in browser, only result crosses wire
eye eval 'ALGO.bridge.getState().user'        # Browser returns only "root"
```

Both return `"root"`, but eval is:
- Simpler (no new flag to implement)
- More flexible (arbitrary JS expressions)
- Same efficiency (filtering before network transit)

### 5.3 Eval-First Design Philosophy

**Recommendation: Use `eval` for everything, deprecate dedicated tools.**

| Dedicated Tool | Equivalent Eval | Notes |
|----------------|-----------------|-------|
| `eye state` | `eye eval 'ALGO.bridge.getState()'` | Same result |
| `eye query '.btn'` | `eye eval 'document.querySelector(".btn")'` | More flexible |
| `eye click '#x'` | `eye eval 'document.querySelector("#x").click()'` | Can add logic |
| `eye open chat` | `eye eval 'openSystemApp("chat")'` | Access to all functions |

**Advantages:**
- One syntax to learn
- Full JS power (conditionals, loops, composition)
- No artificial API boundaries
- Filter results inline: `getState().windows.length`

**Tradeoff:** Requires knowing JavaScript. But Claude knows JS.

### 5.4 Handling Async Operations

One edge case: Promises don't resolve inline.

```bash
# Problem: Returns "Promise { <pending> }"
eye eval 'fetch("/api/files/get?path=x").then(r=>r.json())'

# Solution: Auto-wrap in async or explicit await
eye eval 'await (async () => {
  let r = await fetch("/api/files/get?path=x");
  return (await r.json()).content.slice(0,100);
})()'
```

**Proposed:** `eye` CLI auto-detects async and wraps appropriately.

### 5.5 Response Modes (Still Useful)

Even with eval-first, response modes help:

```bash
# Quiet mode - suppress success wrapper, just the value
eye eval 'document.title' --quiet      # Returns: Function Server
                                       # (not: {"success":true,"result":"Function Server"})

# Error mode - only show if error
eye eval 'riskyOperation()' --errors   # Returns nothing on success, error on fail
```

### 5.6 Token Savings Summary

| Approach | Chars Returned | Implementation Effort |
|----------|----------------|----------------------|
| Full response (current) | ~500 | Already exists |
| Server-side jq filter | ~10 | Medium (new flag) |
| Eval with inline filter | ~10 | None (just use eval) |

**Verdict:** Eval-first gives us filtering for free. No jq needed.

---

## 6. Advanced Optimizations: Direct Connection & Pipelining

### 6.1 Measured Latency Breakdown

**Empirical measurements (2025-01-23):**

```
┌─────────────────────────────────────────────────────────────────────────┐
│ LATENCY BREAKDOWN                                                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Public HTTPS (functionserver.com):     ~260ms average                  │
│    ├── TLS handshake:                   ~100ms                          │
│    ├── Internet round-trip:             ~130ms                          │
│    └── Server + Browser processing:     ~30ms                           │
│                                                                         │
│  Localhost HTTP (http://localhost):     ~31ms average                   │
│    ├── TCP (loopback):                  ~1ms                            │
│    └── Server + Browser processing:     ~30ms                           │
│                                                                         │
│  INSIGHT: 89% of latency is TLS/internet, not actual work!              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Current Architecture (Why It's Slow)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ CURRENT: Every request goes through full HTTP stack                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────┐    ┌──────────────────────────┐    ┌─────────────────┐    │
│  │ Claude  │    │      Go Server           │    │    Browser      │    │
│  │ (Neo)   │    │                          │    │                 │    │
│  └────┬────┘    └────────────┬─────────────┘    └────────┬────────┘    │
│       │                      │                           │             │
│       │   HTTP POST          │                           │             │
│       │──────────────────────▶ Parse JSON                │             │
│       │   (TCP+TLS+HTTP)     │ Find browser WS ─────────▶│             │
│       │                      │                           │ eval()      │
│       │                      │◀──────────────────────────│             │
│       │◀──────────────────────│ JSON encode              │             │
│       │   HTTP Response      │                           │             │
│       │                      │                           │             │
│  ─────┼──────────────────────┼───────────────────────────┼─────────    │
│       │                      │                           │             │
│       │   REPEAT FOR EACH    │   Connection setup        │             │
│       │   REQUEST            │   happens EVERY time      │             │
│       │                      │                           │             │
└───────┴──────────────────────┴───────────────────────────┴─────────────┘
```

**Problem:** Each request pays the full HTTP overhead, even though:
- Claude is running ON the same server
- The browser WebSocket is already connected

### 6.3 Optimization 1: Direct Local Socket

```
┌─────────────────────────────────────────────────────────────────────────┐
│ PROPOSED: Unix socket for local Claude instances                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────┐    ┌──────────────────────────┐    ┌─────────────────┐    │
│  │ Claude  │    │      Go Server           │    │    Browser      │    │
│  │ (Neo)   │    │                          │    │                 │    │
│  └────┬────┘    └────────────┬─────────────┘    └────────┬────────┘    │
│       │                      │                           │             │
│       │ Unix socket          │   Persistent WS           │             │
│       │══════════════════════│═══════════════════════════│             │
│       │  (no TCP/TLS/HTTP)   │   (already connected)     │             │
│       │                      │                           │             │
│       │   ~1ms               │        ~10ms              │             │
│       │──────────────────────▶──────────────────────────▶│             │
│       │◀──────────────────────◀──────────────────────────│             │
│       │                      │                           │             │
└───────┴──────────────────────┴───────────────────────────┴─────────────┘

  Latency: ~11ms (vs 260ms current) = 24x speedup per request
```

**Implementation:**
```go
// Server listens on Unix socket for local connections
sock, _ := net.Listen("unix", "/tmp/fs-bridge.sock")
// Claude connects directly, skipping HTTP entirely
```

### 6.4 Optimization 2: Request Pipelining (Async Multiplexing)

**Current (synchronous):**
```
Request 1 ──────────────────────────▶
                    ◀────────────────── Response 1
Request 2 ──────────────────────────▶
                    ◀────────────────── Response 2
Request 3 ──────────────────────────▶
                    ◀────────────────── Response 3

Total time: 3 × latency = 3 × 260ms = 780ms
```

**Proposed (pipelined):**
```
Request 1 ──────────────────────────▶
Request 2 ──────────────────────────▶
Request 3 ──────────────────────────▶
                    ◀────────────────── Response 2 (id:2)
                    ◀────────────────── Response 1 (id:1)
                    ◀────────────────── Response 3 (id:3)

Total time: latency + (n-1) × processing = 260ms + 2×10ms = 280ms
Speedup: 780ms / 280ms = 2.8x for 3 requests
```

**Protocol (Token-Efficient):**

The LLM controls whether to use IDs and how short they are:

```javascript
// NO ID - single request or response is unambiguous
{ c: "document.title" }
→ "Function Server"

// NO ID - multiple requests, but responses are distinguishable by type/content
{ c: "document.title" }                           // returns string
{ c: "document.querySelectorAll('.x').length" }   // returns number
{ c: "ALGO.bridge.getState()" }                   // returns object
→ "Function Server"    // obviously the title
→ 3                    // obviously the count
→ { user: "root", ... } // obviously the state

// SHORT ID - when responses could be ambiguous
{ i: "a", c: "getName()" }
{ i: "b", c: "getEmail()" }
→ { i: "b", r: "user@x.com" }   // 'i' and 'r' are minimal keys
→ { i: "a", r: "root" }

// NUMERIC ID - even shorter
{ i: 1, c: "..." }
{ i: 2, c: "..." }
→ { i: 2, r: "..." }
→ { i: 1, r: "..." }
```

**ID Rules:**
- **Omit ID entirely** when: single request OR response type/content is unambiguous
- **Use short ID** when: multiple similar requests where responses could be confused
- **LLM decides** the ID format: "a"/"b", 1/2, or even semantic like "user"/"email"
- **Server echoes ID back** only if one was provided
- **Minimal keys**: `i` for id, `c` for code, `r` for result, `e` for error

**Key meanings:**
- `c` = code/expression (the JS to evaluate in browser VM)
- `r` = result (what the expression returned)
- `i` = id (optional, for matching responses to requests)
- `e` = error (if evaluation failed)

**Token cost comparison:**
```
Verbose:  { "id": "req-001", "code": "x", "result": "y" }  = 45 chars
Minimal:  { i: 1, c: "x" } → { i: 1, r: "y" }             = 26 chars
No ID:    { c: "x" } → "y"                                 = 12 chars
Bare:     "x" → "y"                                        = 7 chars
Fire:     "x" → (nothing)                                  = 3 chars
```

**Bare string mode (most minimal):**
```javascript
// Request is just the expression string
"document.title"
→ "Function Server"

// Multiple bare requests
"document.title"
"windows.length"
→ "Function Server"
→ 3

// With ID only when ambiguous - use array [id, expr]
["a", "getText('#x')"]
["b", "getText('#y')"]
→ ["a", "Hello"]
→ ["b", "World"]
```

### 6.5 Optimization 3: Direct Browser Connection (Most Radical)

**Question:** Can Claude connect directly to the browser's JS VM, bypassing the server entirely?

```
┌─────────────────────────────────────────────────────────────────────────┐
│ RADICAL: Claude WebSocket directly to Browser                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────┐                                    ┌─────────────────┐    │
│  │ Claude  │                                    │    Browser      │    │
│  │ (Neo)   │                                    │                 │    │
│  └────┬────┘                                    └────────┬────────┘    │
│       │                                                  │             │
│       │   WebSocket (localhost:XXXXX)                    │             │
│       │══════════════════════════════════════════════════│             │
│       │                                                  │             │
│       │              ~5ms total latency                  │             │
│       │                                                  │             │
└───────┴──────────────────────────────────────────────────┴─────────────┘
```

**Challenges:**
1. Browser is behind NAT (can't accept incoming connections)
2. Need to establish reverse tunnel or use server as signaling
3. Security: authenticating the Claude → Browser connection

**Solution: Browser-initiated WebSocket with multiplexing**
```
1. Browser connects to server (existing)
2. Server assigns a "direct channel" port
3. Claude connects to that port
4. Server bridges the two WebSockets (minimal overhead)
```

### 6.6 Speedup Projections

| Scenario | 1 Request | 10 Requests | 100 Requests |
|----------|-----------|-------------|--------------|
| **Current (HTTPS, sync)** | 260ms | 2,600ms | 26,000ms |
| **Localhost HTTP, sync** | 31ms | 310ms | 3,100ms |
| **Unix socket, sync** | 11ms | 110ms | 1,100ms |
| **Unix socket, pipelined** | 11ms | 20ms | 110ms |
| **Direct WS, pipelined** | 5ms | 14ms | 95ms |

**Speedup factors:**

| Optimization | Per-Request | 10 Requests | 100 Requests |
|--------------|-------------|-------------|--------------|
| Localhost HTTP | 8x | 8x | 8x |
| Unix socket | 24x | 24x | 24x |
| + Pipelining | 24x | 130x | 236x |
| Direct WS + Pipeline | 52x | 186x | 274x |

### 6.7 The "Fire and Forget" Pattern

For operations where Claude doesn't need the result:

```bash
# Current: Wait for each operation, full response overhead
eye eval 'openSystemApp("chat")'      # 260ms + response tokens
eye eval 'openSystemApp("files")'     # 260ms + response tokens
eye eval 'openSystemApp("notepad")'   # 260ms + response tokens
# Total: 780ms, ~300 response tokens wasted

# Proposed: Fire and forget (no response at all)
eye fire 'openSystemApp("chat")'      # ~0ms, 0 response tokens
eye fire 'document.title = "New"'     # ~0ms, 0 response tokens
eye fire 'console.log("debug")'       # ~0ms, 0 response tokens
```

**When to use each mode:**

| Mode | Response | Use Case | Tokens |
|------|----------|----------|--------|
| `eval` | Wait for result | Need the value | Full |
| `async` | Collect later | Batch operations | Deferred |
| `fire` | None | Side effects only | Zero |

**The LLM decides** based on whether it needs the result:
- Opening an app? `fire` - don't need confirmation
- Getting a value? `eval` - need the result
- Batch queries? `async` with minimal IDs - collect results once

### 6.8 LLM Intelligence for ID Decisions

The LLM (Claude) naturally understands when IDs are needed:

**Scenario 1: No IDs needed**
```
Claude thinks: "I'm asking for title (string) and count (number) -
               I can tell them apart by type"

Send: { c: "document.title" }
Send: { c: "windows.length" }
Recv: "FunctionServer"  ← string, must be title
Recv: 3                 ← number, must be count
```

**Scenario 2: IDs needed**
```
Claude thinks: "I'm asking for two element texts - both will be strings,
               I need IDs to tell them apart"

Send: { i: "a", c: "el1.textContent" }
Send: { i: "b", c: "el2.textContent" }
Recv: { i: "b", r: "Hello" }  ← ID tells me this is el2
Recv: { i: "a", r: "World" }  ← ID tells me this is el1
```

**Scenario 3: Semantic IDs (self-documenting)**
```
Claude thinks: "I want to remember what each value means"

Send: { i: "user", c: "getUser()" }
Send: { i: "role", c: "getRole()" }
Recv: { i: "role", r: "admin" }
Recv: { i: "user", r: "root" }

// Later in context, Claude sees { i: "role", r: "admin" }
// and immediately knows what it means
```

**Token budget decision tree:**
```
Need the result?
├─ No  → fire (0 tokens response)
└─ Yes → Can I distinguish responses by type/content?
         ├─ Yes → no ID (minimal response)
         └─ No  → use short ID ("a", 1) or semantic ID ("user")
```

### 6.9 Implementation Complexity vs Speedup

| Optimization | Complexity | Speedup | ROI |
|--------------|------------|---------|-----|
| Use localhost instead of HTTPS | Trivial | 8x | **Excellent** |
| Unix socket | Low | 24x | **Excellent** |
| Pipelining | Medium | +10x | Good |
| Direct WS bridge | High | +2x | Marginal |
| Fire-and-forget | Low | ∞ (async) | **Excellent** |

**Recommendation:**
1. **Immediate:** Use localhost HTTP (8x speedup, zero code changes)
2. **Phase 2:** Add Unix socket (24x speedup)
3. **Phase 3:** Add pipelining (130x+ for batch operations)
4. **Optional:** Direct WS only if sub-5ms latency is critical

---

## 7. Implementation Plan

### 7.1 Phase 1: Bash Wrapper (1 hour)

```bash
#!/bin/bash
# /usr/local/bin/fs

TOKEN_FILE="$HOME/.algo/token"
API="https://functionserver.com/api/mcp"

# Auto-generate token if missing
if [ ! -f "$TOKEN_FILE" ]; then
  # Generate token (implementation details...)
fi

TOKEN=$(cat "$TOKEN_FILE")

case "$1" in
  eval)
    curl -s -X POST "$API" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"method\":\"tools/call\",\"params\":{\"name\":\"algo_eval\",\"arguments\":{\"code\":\"$2\"}}}" \
      | jq -r '.content[0].text | fromjson | .result'
    ;;
  # ... other commands
esac
```

**Deliverables:** Working `eye` command with 95% token savings
**Limitations:** Same latency as curl

### 7.2 Phase 2: Go Binary (4 hours)

```go
// Advantages over bash:
// - Faster startup (~5ms vs ~50ms)
// - Built-in token management
// - Connection pooling
// - Response projection
```

**Deliverables:** `eye` binary, faster startup, connection reuse
**Expected improvement:** 20-30% latency reduction

### 7.3 Phase 3: WebSocket REPL (8 hours)

```go
// New endpoint: /api/mcp/stream
// - Persistent WebSocket connection
// - Bi-directional messaging
// - Server push for pubsub events
```

**Deliverables:** `eye connect` persistent mode, 10x latency improvement
**Use case:** Rapid-fire operations, real-time monitoring

---

## 8. CLAUDE.md Updates

### Current Documentation

```markdown
Example - get the current state:
curl -X POST https://functionserver.com/api/mcp \
  -H "Content-Type: application/json" \
  -d '{"method":"tools/call","params":{"name":"algo_getState","arguments":{}},"user":"root"}'
```

### Proposed Documentation

```markdown
## Quick Commands (Recommended)

eye eval 'document.title'           # Run JavaScript
fs state                           # Get windows, apps, user
fs click '#button'                 # Click element
fs open chat                       # Open app
fs send claude-eyes "look"         # Message another app

## Persistent Mode (Fastest)

eye connect &                       # Background connection
eye eval 'code'                     # Uses persistent conn
fs disconnect                      # Close when done

## Raw API (For External Tools)

curl -X POST https://functionserver.com/api/mcp ...
```

---

## 9. Summary: Expected Improvements

| Metric | Current (curl) | Phase 1 (bash) | Phase 2 (Go) | Phase 3 (WS REPL) |
|--------|----------------|----------------|--------------|-------------------|
| Layers (round-trip) | 12 | 12 | 10 | 8 |
| Tokens per request | ~120 | ~15 | ~15 | ~15 |
| Latency (first) | 150ms | 150ms | 100ms | 150ms |
| Latency (subsequent) | 150ms | 150ms | 80ms | 15ms |
| 10 requests total | 1500ms | 1500ms | 800ms | 285ms |
| Ease of documentation | Hard | Easy | Easy | Easy |
| Works for Neo (inside) | Yes | Yes | Yes | Yes |
| Works for Morpheus (outside) | Yes | Yes | Yes | Partial* |

*Phase 3 WebSocket REPL works externally via SSH tunnel or if client supports WS.

### Why WebSocket REPL has fewer layers, not more:

```
Common misconception: "WebSocket adds another layer"

Reality: WebSocket REMOVES layers by eliminating per-request overhead:

Current (per request):
  spawn bash → spawn curl → TCP handshake → TLS handshake → HTTP framing → ...

WebSocket REPL (per request after connect):
  write to existing socket → server reads → forward to browser

The connection setup happens ONCE, then subsequent messages skip 4+ layers.
```

---

## 10. Open Questions

1. **Should `eye` handle pubsub subscriptions?** This would require background process or persistent mode.

2. **Multi-VM support?** Should `eye eval` target specific app VMs or always the main page? Apps run in the same context currently, but isolation may be desired.

3. **Security:** Should `eye` commands require confirmation for destructive operations? Probably not—Claude is trusted.

4. **Async auto-detection:** Should `eye eval` automatically wrap code in async/await when it detects Promise-returning expressions?

5. **Dedicated tools:** Keep them for discoverability, or deprecate in favor of eval-first? Recommendation: Keep as aliases that internally use eval.

6. **External access (Morpheus):** Should there be a way to establish WebSocket REPL over SSH? Could use SSH port forwarding or a persistent tunnel.

---

## 11. Conclusion

The `eye` CLI tool is not reinventing MCP - it's a **thin ergonomic layer** that:
- Reduces token waste by 95%
- Simplifies documentation
- Enables faster operations with persistent connections
- Maintains full MCP compatibility

The ROI is clear: Every AI interaction with FunctionServer currently wastes ~100 tokens in protocol overhead. With thousands of interactions per day, this compounds significantly.

**Recommended path:** Implement Phase 1 (bash) immediately, Phase 2 (Go) this week, Phase 3 (WebSocket) as needed.

---

## References

- [MCP Transports Specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)
- [Why MCP Deprecated SSE](https://blog.fka.dev/blog/2025-06-06-why-mcp-deprecated-sse-and-go-with-streamable-http/)
- [MCP Server Transports](https://docs.roocode.com/features/mcp/server-transports)
