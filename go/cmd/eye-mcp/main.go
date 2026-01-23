package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
)

// MCP Protocol types
type MCPRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      any             `json:"id"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type MCPResponse struct {
	JSONRPC string    `json:"jsonrpc"`
	ID      any       `json:"id"`
	Result  any       `json:"result,omitempty"`
	Error   *MCPError `json:"error,omitempty"`
}

type MCPError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type ToolCallParams struct {
	Name      string          `json:"name"`
	Arguments json.RawMessage `json:"arguments"`
}

type EyeArgs struct {
	Expr string `json:"expr"`
}

// Config
type Config struct {
	Token  string `json:"token"`
	Server string `json:"server"`
}

// Global state
var (
	conn       *websocket.Conn
	connMu     sync.Mutex
	pending    = make(map[string]chan string)
	pendingMu  sync.Mutex
	msgCounter uint64
	config     Config
)

func loadConfig() error {
	home, _ := os.UserHomeDir()
	data, err := os.ReadFile(filepath.Join(home, ".algo", "config.json"))
	if err != nil {
		return err
	}
	return json.Unmarshal(data, &config)
}

func connect() error {
	connMu.Lock()
	defer connMu.Unlock()

	if conn != nil {
		conn.Close()
	}

	url := config.Server
	if !strings.Contains(url, "?") {
		url += "?token=" + config.Token
	}

	var err error
	conn, _, err = websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		return err
	}

	// Start reader goroutine
	go readLoop()
	return nil
}

func readLoop() {
	for {
		connMu.Lock()
		c := conn
		connMu.Unlock()

		if c == nil {
			return
		}

		_, msg, err := c.ReadMessage()
		if err != nil {
			return
		}

		// Parse response: "id:result" or "id!:error"
		s := string(msg)
		if idx := strings.Index(s, ":"); idx > 0 {
			id := s[:idx]
			isError := strings.HasSuffix(id, "!")
			if isError {
				id = id[:len(id)-1]
			}
			result := s[idx+1:]

			pendingMu.Lock()
			if ch, ok := pending[id]; ok {
				if isError {
					ch <- "ERROR:" + result
				} else {
					ch <- result
				}
				delete(pending, id)
			}
			pendingMu.Unlock()
		}
	}
}

func evalExpr(expr string) (string, error) {
	connMu.Lock()
	c := conn
	connMu.Unlock()

	if c == nil {
		if err := connect(); err != nil {
			return "", fmt.Errorf("connection failed: %v", err)
		}
		connMu.Lock()
		c = conn
		connMu.Unlock()
	}

	// Generate unique ID
	id := fmt.Sprintf("m%d", atomic.AddUint64(&msgCounter, 1))

	// Create response channel
	ch := make(chan string, 1)
	pendingMu.Lock()
	pending[id] = ch
	pendingMu.Unlock()

	// Send message
	msg := id + ":" + expr
	if err := c.WriteMessage(websocket.TextMessage, []byte(msg)); err != nil {
		pendingMu.Lock()
		delete(pending, id)
		pendingMu.Unlock()
		return "", err
	}

	// Wait for response with timeout
	select {
	case result := <-ch:
		if strings.HasPrefix(result, "ERROR:") {
			return "", fmt.Errorf("%s", result[6:])
		}
		return result, nil
	case <-time.After(30 * time.Second):
		pendingMu.Lock()
		delete(pending, id)
		pendingMu.Unlock()
		return "", fmt.Errorf("timeout")
	}
}

func sendResponse(id any, result any, err *MCPError) {
	resp := MCPResponse{
		JSONRPC: "2.0",
		ID:      id,
		Result:  result,
		Error:   err,
	}
	data, _ := json.Marshal(resp)
	fmt.Println(string(data))
}

func handleRequest(req MCPRequest) {
	switch req.Method {
	case "initialize":
		sendResponse(req.ID, map[string]any{
			"protocolVersion": "2024-11-05",
			"capabilities": map[string]any{
				"tools": map[string]any{},
			},
			"serverInfo": map[string]any{
				"name":    "eye-mcp",
				"version": "1.0.0",
			},
		}, nil)

	case "notifications/initialized":
		// No response needed for notifications

	case "tools/list":
		sendResponse(req.ID, map[string]any{
			"tools": []map[string]any{
				{
					"name":        "eye",
					"description": "Execute JavaScript in the browser via persistent WebSocket. Returns the result of the expression.",
					"inputSchema": map[string]any{
						"type": "object",
						"properties": map[string]any{
							"expr": map[string]any{
								"type":        "string",
								"description": "JavaScript expression to evaluate in the browser",
							},
						},
						"required": []string{"expr"},
					},
				},
			},
		}, nil)

	case "tools/call":
		var params ToolCallParams
		if err := json.Unmarshal(req.Params, &params); err != nil {
			sendResponse(req.ID, nil, &MCPError{Code: -32602, Message: "Invalid params"})
			return
		}

		if params.Name != "eye" {
			sendResponse(req.ID, nil, &MCPError{Code: -32601, Message: "Unknown tool"})
			return
		}

		var args EyeArgs
		if err := json.Unmarshal(params.Arguments, &args); err != nil {
			sendResponse(req.ID, nil, &MCPError{Code: -32602, Message: "Invalid arguments"})
			return
		}

		result, err := evalExpr(args.Expr)
		if err != nil {
			sendResponse(req.ID, map[string]any{
				"content": []map[string]any{
					{"type": "text", "text": "Error: " + err.Error()},
				},
				"isError": true,
			}, nil)
			return
		}

		sendResponse(req.ID, map[string]any{
			"content": []map[string]any{
				{"type": "text", "text": result},
			},
		}, nil)

	default:
		sendResponse(req.ID, nil, &MCPError{Code: -32601, Message: "Method not found"})
	}
}

func main() {
	// Load config
	if err := loadConfig(); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to load config: %v\n", err)
		os.Exit(1)
	}

	// Connect to WebSocket
	if err := connect(); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to connect: %v\n", err)
		os.Exit(1)
	}

	// Read MCP requests from stdin
	scanner := bufio.NewScanner(os.Stdin)
	// Increase buffer size for large messages
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)

	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}

		var req MCPRequest
		if err := json.Unmarshal([]byte(line), &req); err != nil {
			continue
		}

		handleRequest(req)
	}
}
