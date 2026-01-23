package main

import (
	"bufio"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
)

// Build version - changes when binary is recompiled
// Use: go build -ldflags "-X main.buildVersion=$(date +%s)" ./cmd/eye/
var buildVersion = "dev"

const (
	idleTimeout    = 5 * time.Minute
	socketName     = "eye.sock"
	connectTimeout = 2 * time.Second
)

func main() {
	// Daemon mode (internal - started automatically)
	if len(os.Args) > 1 && os.Args[1] == "--daemon" {
		runDaemon()
		return
	}

	// Help
	if len(os.Args) > 1 && (os.Args[1] == "-h" || os.Args[1] == "--help" || os.Args[1] == "help") {
		printHelp()
		return
	}

	// Status check
	if len(os.Args) > 1 && os.Args[1] == "--status" {
		printStatus()
		return
	}

	// Kill daemon
	if len(os.Args) > 1 && os.Args[1] == "--kill" {
		killDaemon()
		return
	}

	// Normal client mode - try daemon first, fallback to direct
	if runViaSocket() {
		return
	}

	// Fallback: direct connection (daemon unavailable)
	runDirect()
}

// ==================== CLIENT MODE ====================

func getSocketPath() string {
	return filepath.Join(os.TempDir(), fmt.Sprintf("eye-%d.sock", os.Getuid()))
}

func printStatus() {
	socketPath := getSocketPath()
	conn, err := net.DialTimeout("unix", socketPath, 100*time.Millisecond)
	if err != nil {
		fmt.Println("Daemon: not running")
		// Check for stale socket
		if _, err := os.Stat(socketPath); err == nil {
			fmt.Printf("Socket: %s (stale)\n", socketPath)
		}
		return
	}
	defer conn.Close()

	fmt.Fprintf(conn, "VERSION:%s\n", buildVersion)
	reader := bufio.NewReader(conn)
	response, _ := reader.ReadString('\n')
	response = strings.TrimSpace(response)

	if response == "OK" {
		fmt.Println("Daemon: running (version match)")
	} else if response == "RESTART" {
		fmt.Println("Daemon: running (version mismatch, will restart on next call)")
	} else {
		fmt.Println("Daemon: running (unknown state)")
	}
	fmt.Printf("Socket: %s\n", socketPath)
}

func killDaemon() {
	socketPath := getSocketPath()
	conn, err := net.DialTimeout("unix", socketPath, 100*time.Millisecond)
	if err != nil {
		fmt.Println("Daemon not running")
		// Clean up stale socket if exists
		if _, err := os.Stat(socketPath); err == nil {
			os.Remove(socketPath)
			fmt.Println("Removed stale socket")
		}
		return
	}
	conn.Close()

	// Send version mismatch to trigger restart, then remove socket before it restarts
	conn, _ = net.DialTimeout("unix", socketPath, 100*time.Millisecond)
	if conn != nil {
		fmt.Fprintf(conn, "VERSION:__kill__\n")
		conn.Close()
	}
	time.Sleep(150 * time.Millisecond)
	os.Remove(socketPath)
	fmt.Println("Daemon killed")
}

func runViaSocket() bool {
	socketPath := getSocketPath()

	// Try to connect to existing daemon
	conn, err := net.DialTimeout("unix", socketPath, 100*time.Millisecond)
	if err != nil {
		// Daemon not running - try to start it
		if !startDaemon() {
			return false
		}
		// Wait for daemon to be ready
		for i := 0; i < 20; i++ {
			time.Sleep(100 * time.Millisecond)
			conn, err = net.DialTimeout("unix", socketPath, 100*time.Millisecond)
			if err == nil {
				break
			}
		}
		if err != nil {
			return false
		}
	}
	defer conn.Close()

	// Send version check
	fmt.Fprintf(conn, "VERSION:%s\n", buildVersion)
	reader := bufio.NewReader(conn)
	response, err := reader.ReadString('\n')
	if err != nil {
		return false
	}
	response = strings.TrimSpace(response)

	if response == "RESTART" {
		// Version mismatch - daemon is restarting, retry
		conn.Close()
		time.Sleep(200 * time.Millisecond)
		return runViaSocket()
	}
	if response != "OK" {
		return false
	}

	// Send expression(s)
	if len(os.Args) > 1 {
		// Single command mode
		expr := strings.Join(os.Args[1:], " ")
		fmt.Fprintf(conn, "EVAL:%s\n", expr)

		// Check if expecting response
		hasID := hasIDPrefix(expr)
		if hasID {
			result, err := reader.ReadString('\n')
			if err != nil {
				fmt.Fprintf(os.Stderr, "Read failed: %v\n", err)
				os.Exit(1)
			}
			result = strings.TrimSpace(result)
			if strings.HasPrefix(result, "ERR:") {
				fmt.Fprintf(os.Stderr, "Error: %s\n", strings.TrimPrefix(result, "ERR:"))
				os.Exit(1)
			}
			fmt.Println(strings.TrimPrefix(result, "OK:"))
		}
	} else {
		// REPL mode through daemon
		fmt.Println("eye bridge connected via daemon (Ctrl+D to exit)")
		fmt.Println("  expression      -> fire & forget")
		fmt.Println("  id:expression   -> get response")
		fmt.Println()

		// Read responses in background
		go func() {
			for {
				line, err := reader.ReadString('\n')
				if err != nil {
					return
				}
				line = strings.TrimSpace(line)
				if strings.HasPrefix(line, "RESP:") {
					fmt.Printf("< %s\n", strings.TrimPrefix(line, "RESP:"))
				}
			}
		}()

		// Read from stdin
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
			fmt.Fprintf(conn, "EVAL:%s\n", line)
			fmt.Print("> ")
		}
		fmt.Println()
	}
	return true
}

func startDaemon() bool {
	exe, err := os.Executable()
	if err != nil {
		return false
	}

	cmd := exec.Command(exe, "--daemon")
	cmd.Stdout = nil
	cmd.Stderr = nil
	cmd.Stdin = nil
	// Detach from parent
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Setsid: true,
	}
	if err := cmd.Start(); err != nil {
		return false
	}
	// Don't wait - let it run in background
	go cmd.Wait()
	return true
}

// ==================== DAEMON MODE ====================

func runDaemon() {
	socketPath := getSocketPath()

	// Clean up old socket
	os.Remove(socketPath)

	// Create socket
	listener, err := net.Listen("unix", socketPath)
	if err != nil {
		os.Exit(1)
	}
	defer listener.Close()
	defer os.Remove(socketPath)

	// Handle signals for clean shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	// Load config and connect to browser
	token, server := loadConfig()
	if token == "" {
		os.Exit(1)
	}

	wsConn, err := connectWebSocket(token, server)
	if err != nil {
		os.Exit(1)
	}
	defer wsConn.Close()

	// Wait for ready
	_, msg, err := wsConn.ReadMessage()
	if err != nil || string(msg) != ":ready" {
		os.Exit(1)
	}

	// Track last activity for idle timeout
	var lastActivity time.Time
	var activityMu sync.Mutex
	touch := func() {
		activityMu.Lock()
		lastActivity = time.Now()
		activityMu.Unlock()
	}
	touch()

	// Pending requests waiting for responses
	var pendingMu sync.Mutex
	pending := make(map[string]net.Conn)

	// Read WebSocket responses (exit if connection dies)
	go func() {
		for {
			_, msg, err := wsConn.ReadMessage()
			if err != nil {
				// Browser disconnected - daemon is now useless, exit
				os.Exit(0)
			}
			touch()
			result := string(msg)

			// Extract ID from response
			if colonIdx := strings.Index(result, ":"); colonIdx > 0 {
				id := result[:colonIdx]
				id = strings.TrimSuffix(id, "!")

				pendingMu.Lock()
				if conn, ok := pending[id]; ok {
					// Send response to waiting client
					isError := strings.HasSuffix(result[:colonIdx], "!")
					value := result[colonIdx+1:]
					if isError {
						fmt.Fprintf(conn, "ERR:%s\n", value)
					} else {
						fmt.Fprintf(conn, "OK:%s\n", value)
					}
					delete(pending, id)
				}
				pendingMu.Unlock()
			}

			// Also broadcast to REPL clients
			pendingMu.Lock()
			for _, conn := range pending {
				fmt.Fprintf(conn, "RESP:%s\n", result)
			}
			pendingMu.Unlock()
		}
	}()

	// Idle timeout checker
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			activityMu.Lock()
			idle := time.Since(lastActivity)
			activityMu.Unlock()
			if idle > idleTimeout {
				os.Exit(0)
			}
		}
	}()

	// Accept client connections
	go func() {
		for {
			conn, err := listener.Accept()
			if err != nil {
				continue
			}
			go handleClient(conn, wsConn, &pendingMu, pending, touch)
		}
	}()

	// Wait for signal
	<-sigChan
}

func handleClient(conn net.Conn, wsConn *websocket.Conn, pendingMu *sync.Mutex, pending map[string]net.Conn, touch func()) {
	defer conn.Close()
	reader := bufio.NewReader(conn)

	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			return
		}
		touch()
		line = strings.TrimSpace(line)

		if strings.HasPrefix(line, "VERSION:") {
			clientVersion := strings.TrimPrefix(line, "VERSION:")
			if clientVersion != buildVersion {
				// Version mismatch - tell client to retry, then exit
				fmt.Fprintf(conn, "RESTART\n")
				go func() {
					time.Sleep(100 * time.Millisecond)
					os.Exit(0)
				}()
				return
			}
			fmt.Fprintf(conn, "OK\n")
		} else if strings.HasPrefix(line, "EVAL:") {
			expr := strings.TrimPrefix(line, "EVAL:")

			// Check if has ID prefix
			if hasIDPrefix(expr) {
				// Register pending request
				id := expr[:strings.Index(expr, ":")]
				pendingMu.Lock()
				pending[id] = conn
				pendingMu.Unlock()
			}

			// Send to browser
			wsConn.WriteMessage(websocket.TextMessage, []byte(expr))
		}
	}
}

// ==================== DIRECT MODE (fallback) ====================

func runDirect() {
	token, server := loadConfig()
	if token == "" {
		fmt.Fprintln(os.Stderr, "No token found.")
		fmt.Fprintln(os.Stderr, "  Set EYE_TOKEN env var, or")
		fmt.Fprintln(os.Stderr, "  Create ~/.algo/config.json with {\"token\":\"...\",\"server\":\"...\"}, or")
		fmt.Fprintln(os.Stderr, "  Create ~/.algo/token")
		os.Exit(1)
	}

	conn, err := connectWebSocket(token, server)
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

	// Single command mode
	if len(os.Args) > 1 {
		expr := strings.Join(os.Args[1:], " ")
		conn.WriteMessage(websocket.TextMessage, []byte(expr))

		if hasIDPrefix(expr) {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				fmt.Fprintf(os.Stderr, "Read failed: %v\n", err)
				os.Exit(1)
			}
			result := string(msg)
			// Strip ID prefix
			if colonIdx := strings.Index(result, ":"); colonIdx > 0 {
				prefix := result[:colonIdx]
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

	// REPL mode
	fmt.Println("eye bridge connected (Ctrl+D to exit)")
	fmt.Println("  expression      -> fire & forget")
	fmt.Println("  id:expression   -> get response")
	fmt.Println("  help            -> show API reference")
	fmt.Println()

	go func() {
		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				return
			}
			fmt.Printf("< %s\n", string(msg))
		}
	}()

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

// ==================== SHARED UTILITIES ====================

func loadConfig() (token, server string) {
	token = os.Getenv("EYE_TOKEN")
	server = os.Getenv("EYE_SERVER")

	// Try config.json
	if token == "" || server == "" {
		if data, err := os.ReadFile(os.ExpandEnv("$HOME/.algo/config.json")); err == nil {
			var config struct {
				Token  string `json:"token"`
				Server string `json:"server"`
			}
			if json.Unmarshal(data, &config) == nil {
				if token == "" {
					token = config.Token
				}
				if server == "" {
					server = config.Server
				}
			}
		}
	}

	// Fallback files
	if token == "" {
		if data, err := os.ReadFile(os.ExpandEnv("$HOME/.algo/token")); err == nil {
			token = strings.TrimSpace(string(data))
		}
	}
	if server == "" {
		if data, err := os.ReadFile(os.ExpandEnv("$HOME/.algo/server")); err == nil {
			server = strings.TrimSpace(string(data))
		}
	}

	// Default and normalize server
	if server == "" {
		server = "wss://localhost/api/eye"
	}
	if !strings.HasPrefix(server, "ws://") && !strings.HasPrefix(server, "wss://") {
		server = strings.Replace(server, "https://", "wss://", 1)
		server = strings.Replace(server, "http://", "ws://", 1)
		if !strings.HasPrefix(server, "ws") {
			server = "wss://" + server
		}
		if !strings.Contains(server, "/api/eye") {
			server = strings.TrimSuffix(server, "/") + "/api/eye"
		}
	}

	return token, server
}

func connectWebSocket(token, server string) (*websocket.Conn, error) {
	url := server + "?token=" + token
	dialer := websocket.Dialer{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
	}
	conn, _, err := dialer.Dial(url, http.Header{})
	return conn, err
}

func hasIDPrefix(expr string) bool {
	colonIdx := strings.Index(expr, ":")
	if colonIdx <= 0 || colonIdx >= 20 {
		return false
	}
	prefix := expr[:colonIdx]
	for _, c := range prefix {
		if !((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_') {
			return false
		}
	}
	return true
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

DAEMON:
  A background daemon auto-starts to maintain persistent connection.
  - Auto-starts on first eye call
  - Auto-exits after 5 minutes idle or if browser disconnects
  - Auto-restarts when eye is recompiled

  eye --status   Check if daemon is running
  eye --kill     Stop the daemon`)
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
