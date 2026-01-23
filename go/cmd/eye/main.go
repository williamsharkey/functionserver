package main

import (
	"bufio"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/gorilla/websocket"
)

func main() {
	// Check for help flag
	if len(os.Args) > 1 && (os.Args[1] == "-h" || os.Args[1] == "--help" || os.Args[1] == "help") {
		printHelp()
		return
	}

	// Get token from env or file
	token := os.Getenv("EYE_TOKEN")
	server := os.Getenv("EYE_SERVER")

	// Try reading config file (~/.algo/config.json)
	if token == "" || server == "" {
		if data, err := os.ReadFile(os.ExpandEnv("$HOME/.algo/config.json")); err == nil {
			var config struct {
				Token  string `json:"token"`
				Server string `json:"server"`
			}
			if json.Unmarshal(data, &config) == nil {
				if token == "" && config.Token != "" {
					token = config.Token
				}
				if server == "" && config.Server != "" {
					server = config.Server
				}
			}
		}
	}

	// Fallback: try plain token file
	if token == "" {
		if data, err := os.ReadFile(os.ExpandEnv("$HOME/.algo/token")); err == nil {
			token = strings.TrimSpace(string(data))
		}
	}

	// Fallback: try server file
	if server == "" {
		if data, err := os.ReadFile(os.ExpandEnv("$HOME/.algo/server")); err == nil {
			server = strings.TrimSpace(string(data))
		}
	}

	if token == "" {
		fmt.Fprintln(os.Stderr, "No token found.")
		fmt.Fprintln(os.Stderr, "  Set EYE_TOKEN env var, or")
		fmt.Fprintln(os.Stderr, "  Create ~/.algo/config.json with {\"token\":\"...\",\"server\":\"...\"}, or")
		fmt.Fprintln(os.Stderr, "  Create ~/.algo/token")
		os.Exit(1)
	}

	// Default server
	if server == "" {
		server = "wss://localhost/api/eye"
	}

	// Normalize server URL
	if !strings.HasPrefix(server, "ws://") && !strings.HasPrefix(server, "wss://") {
		// Assume https URL, convert to wss
		server = strings.Replace(server, "https://", "wss://", 1)
		server = strings.Replace(server, "http://", "ws://", 1)
		if !strings.HasPrefix(server, "ws") {
			server = "wss://" + server
		}
		if !strings.Contains(server, "/api/eye") {
			server = strings.TrimSuffix(server, "/") + "/api/eye"
		}
	}

	url := server + "?token=" + token

	// Connect
	dialer := websocket.Dialer{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
	}
	conn, _, err := dialer.Dial(url, http.Header{})
	if err != nil {
		fmt.Fprintf(os.Stderr, "Connect failed: %v\n", err)
		os.Exit(1)
	}
	defer conn.Close()

	// Wait for ready
	_, msg, err := conn.ReadMessage()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Read failed: %v\n", err)
		os.Exit(1)
	}
	if string(msg) != ":ready" {
		fmt.Fprintf(os.Stderr, "Unexpected: %s\n", msg)
		os.Exit(1)
	}

	// If args provided, send them and exit
	if len(os.Args) > 1 {
		expr := strings.Join(os.Args[1:], " ")

		// Check if it has an ID prefix (e.g., "a:document.title")
		hasID := false
		if colonIdx := strings.Index(expr, ":"); colonIdx > 0 && colonIdx < 20 {
			prefix := expr[:colonIdx]
			hasID = true
			for _, c := range prefix {
				if !((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_') {
					hasID = false
					break
				}
			}
		}

		conn.WriteMessage(websocket.TextMessage, []byte(expr))

		// If has ID, wait for response
		if hasID {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				fmt.Fprintf(os.Stderr, "Read failed: %v\n", err)
				os.Exit(1)
			}
			result := string(msg)
			// Strip the id: prefix from response for cleaner output
			// Response format: "id:result" or "id!:error"
			if colonIdx := strings.Index(result, ":"); colonIdx > 0 {
				prefix := result[:colonIdx]
				// Check if it's our ID (possibly with ! for error)
				checkID := strings.TrimSuffix(prefix, "!")
				if checkID == expr[:strings.Index(expr, ":")] {
					result = result[colonIdx+1:]
					if strings.HasSuffix(prefix, "!") {
						fmt.Fprintf(os.Stderr, "Error: %s\n", result)
						os.Exit(1)
					}
				}
			}
			fmt.Println(result)
		}
		return
	}

	// Interactive REPL mode
	fmt.Println("eye bridge connected (Ctrl+D to exit)")
	fmt.Println("  expression      -> fire & forget")
	fmt.Println("  id:expression   -> get response")
	fmt.Println("  help            -> show API reference")
	fmt.Println()

	// Read responses in background
	go func() {
		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				return
			}
			fmt.Printf("< %s\n", string(msg))
		}
	}()

	// Read commands from stdin
	scanner := bufio.NewScanner(os.Stdin)
	fmt.Print("> ")
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			fmt.Print("> ")
			continue
		}
		if line == "help" || line == "?" {
			printAPIHelp()
			fmt.Print("> ")
			continue
		}
		conn.WriteMessage(websocket.TextMessage, []byte(line))
		fmt.Print("> ")
	}
	fmt.Println()
}

func printHelp() {
	fmt.Println(`eye - Fast browser JS VM bridge

USAGE:
  eye [expression]       Execute JS and exit (use id: prefix for response)
  eye                    Interactive REPL mode

EXAMPLES:
  eye 'console.log("hi")'           Fire and forget
  eye 'a:document.title'            Get response (a: prefix)
  eye 'a:ALGO.bridge.getState()'    Query desktop state

CONFIG (checked in order):
  EYE_TOKEN / EYE_SERVER env vars
  ~/.algo/config.json    {"token":"...","server":"wss://..."}
  ~/.algo/token          Plain token file
  ~/.algo/server         Plain server URL

The server URL auto-converts: "functionserver.com" → "wss://functionserver.com/api/eye"`)
}

func printAPIHelp() {
	fmt.Println(`
ALGO.bridge API:
  getState()              → {windows, apps, user, activeWindow}
  openApp(name)           → opens app by name
  closeWindow(id)         → closes window
  focusWindow(id)         → brings window to front
  query(selector)         → querySelector result
  queryAll(selector)      → querySelectorAll results
  click(selector)         → clicks element
  setValue(sel, value)    → sets input value
  eval(code)              → evaluate JS (same as direct expression)

Useful globals:
  windows                 → array of window data objects
  systemApps              → array of {name, icon, file, ...}
  document.title          → page title
  localStorage            → persistent storage

Examples:
  a:ALGO.bridge.getState()
  b:systemApps.map(a=>a.name).join(", ")
  c:ALGO.bridge.openApp("shell")
  d:[...document.querySelectorAll(".window-title")].map(t=>t.textContent)
`)
}
