// Function Server - Go Backend
// Multi-tenant web-based operating system
//
// Run: go run main.go
// Build: go build -o functionserver main.go

package main

import (
	"bufio"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	osuser "os/user"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/creack/pty"
	"github.com/gorilla/websocket"
	"golang.org/x/crypto/bcrypt"
)

// Configuration
var config = struct {
	OSName        string
	OSIcon        string
	APIBase       string
	DataDir       string
	HomesDir      string
	SessionSecret string
	SessionExpiry time.Duration
	Port          string
	TerminalIcon  string
	FolderIcon    string
	SettingsIcon  string
	LogoutIcon    string
}{
	OSName:        getEnv("OS_NAME", "Cecilia"),
	OSIcon:        getEnv("OS_ICON", "🌼"),
	APIBase:       getEnv("API_BASE", "/api"),
	DataDir:       getEnv("DATA_DIR", "./data"),
	HomesDir:      "",
	SessionSecret: getEnv("SESSION_SECRET", "change-this-secret-key-in-production"),
	SessionExpiry: 7 * 24 * time.Hour,
	Port:          getEnv("PORT", "8080"),
	TerminalIcon:  "💻",
	FolderIcon:    "📁",
	SettingsIcon:  "⚙",
	LogoutIcon:    "🚪",
}

var (
	usersDir       string
	allowedCmds    = []string{"ls", "cd", "pwd", "cat", "head", "tail", "wc", "mkdir", "rmdir", "touch", "cp", "mv", "rm", "echo", "date", "whoami", "id", "uname", "grep", "find", "sort", "uniq", "diff", "tar", "gzip", "gunzip", "zip", "unzip", "curl", "wget", "node", "npm", "npx", "python", "python3", "pip", "pip3", "git", "claude", "go", "vim", "nano", "less", "more"}
	blockedCmds    = []string{"sudo", "su", "passwd", "useradd", "userdel", "usermod", "chown", "chmod", "chgrp", "mount", "umount", "reboot", "shutdown", "halt", "poweroff", "systemctl", "service", "iptables", "ufw", "dd", "mkfs", "fdisk", "parted"}
	usernameRegex  = regexp.MustCompile(`^[a-z][a-z0-9_]{2,31}$`)
)

// MCP Bridge - connects Claude Code to browser ALGO.bridge
type BrowserConnection struct {
	Conn      *websocket.Conn
	Username  string
	Responses map[string]chan string // request ID -> response channel
	mu        sync.Mutex
}

var (
	browserConnections = make(map[string]*BrowserConnection) // username -> connection
	browserConnMu      sync.RWMutex
)

// Register a browser connection for MCP routing
func registerBrowserConn(username string, conn *websocket.Conn) *BrowserConnection {
	browserConnMu.Lock()
	defer browserConnMu.Unlock()

	bc := &BrowserConnection{
		Conn:      conn,
		Username:  username,
		Responses: make(map[string]chan string),
	}
	browserConnections[username] = bc
	return bc
}

// Unregister a browser connection
func unregisterBrowserConn(username string) {
	browserConnMu.Lock()
	defer browserConnMu.Unlock()
	delete(browserConnections, username)
}

// Get a browser connection
func getBrowserConn(username string) *BrowserConnection {
	browserConnMu.RLock()
	defer browserConnMu.RUnlock()
	return browserConnections[username]
}

// Send a bridge command to browser and wait for response
func (bc *BrowserConnection) SendCommand(cmd map[string]interface{}) (string, error) {
	// Generate unique request ID
	reqID := fmt.Sprintf("%d", time.Now().UnixNano())
	cmd["_mcpReqId"] = reqID

	// Create response channel
	respChan := make(chan string, 1)
	bc.mu.Lock()
	bc.Responses[reqID] = respChan
	bc.mu.Unlock()

	defer func() {
		bc.mu.Lock()
		delete(bc.Responses, reqID)
		bc.mu.Unlock()
	}()

	// Send command to browser
	cmdJSON, _ := json.Marshal(cmd)
	err := bc.Conn.WriteMessage(websocket.TextMessage, []byte("MCP_CMD:"+string(cmdJSON)))
	if err != nil {
		return "", err
	}

	// Wait for response with timeout
	select {
	case resp := <-respChan:
		return resp, nil
	case <-time.After(30 * time.Second):
		return "", fmt.Errorf("timeout waiting for browser response")
	}
}

// Eye bridge connections (direct AI-to-browser communication)
type EyeConnection struct {
	Conn     *websocket.Conn
	Username string
}

var (
	eyeConnections = make(map[string][]*EyeConnection) // username -> connections
	eyeConnMu      sync.RWMutex
)

func registerEyeConn(username string, conn *websocket.Conn) *EyeConnection {
	eyeConnMu.Lock()
	defer eyeConnMu.Unlock()

	ec := &EyeConnection{Conn: conn, Username: username}
	eyeConnections[username] = append(eyeConnections[username], ec)
	return ec
}

func unregisterEyeConn(username string, ec *EyeConnection) {
	eyeConnMu.Lock()
	defer eyeConnMu.Unlock()

	conns := eyeConnections[username]
	for i, c := range conns {
		if c == ec {
			eyeConnections[username] = append(conns[:i], conns[i+1:]...)
			break
		}
	}
}

// Send eye response back to all connected Claude instances for this user
func sendEyeResponse(username string, msg string) {
	eyeConnMu.RLock()
	conns := eyeConnections[username]
	eyeConnMu.RUnlock()

	for _, ec := range conns {
		ec.Conn.WriteMessage(websocket.TextMessage, []byte(msg))
	}
}

// Handle MCP response from browser
func (bc *BrowserConnection) HandleResponse(reqID string, result string) {
	bc.mu.Lock()
	respChan, ok := bc.Responses[reqID]
	bc.mu.Unlock()

	if ok {
		select {
		case respChan <- result:
		default:
		}
	}
}

func getEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func init() {
	// Set homes directory based on platform
	if config.HomesDir == "" {
		if runtime.GOOS == "linux" {
			if _, err := os.Stat("/home"); err == nil {
				config.HomesDir = "/home"
			}
		}
		if config.HomesDir == "" {
			config.HomesDir = filepath.Join(config.DataDir, "homes")
		}
	}

	usersDir = filepath.Join(config.DataDir, "users")
	os.MkdirAll(usersDir, 0755)
	os.MkdirAll(config.HomesDir, 0755)
}

// User represents a user account
type User struct {
	Username     string `json:"username"`
	PasswordHash string `json:"password_hash"`
	Created      int64  `json:"created"`
	LastLogin    int64  `json:"last_login"`
	IsSystemUser bool   `json:"is_system_user,omitempty"`
	HomeDir      string `json:"home_dir,omitempty"`
}

// Token payload
type TokenPayload struct {
	Username string `json:"username"`
	Exp      int64  `json:"exp"`
	Rand     string `json:"rand"`
}

// Ticket represents a task/issue
type Ticket struct {
	ID          string   `json:"id"`
	Title       string   `json:"title"`
	Description string   `json:"description,omitempty"`
	Status      string   `json:"status"`
	Created     string   `json:"created"`
	Replies     []Reply  `json:"replies,omitempty"`
}

type Reply struct {
	Date string `json:"date"`
	Text string `json:"text"`
}

var (
	tickets     []Ticket
	ticketMutex sync.RWMutex
	ticketID    int
)

func generateToken(username string) (string, error) {
	randBytes := make([]byte, 16)
	rand.Read(randBytes)

	payload := TokenPayload{
		Username: username,
		Exp:      time.Now().Add(config.SessionExpiry).Unix(),
		Rand:     hex.EncodeToString(randBytes),
	}

	data, _ := json.Marshal(payload)
	encoded := base64.StdEncoding.EncodeToString(data)

	mac := hmac.New(sha256.New, []byte(config.SessionSecret))
	mac.Write([]byte(encoded))
	signature := hex.EncodeToString(mac.Sum(nil))

	return encoded + "." + signature, nil
}

func verifyToken(token string) string {
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return ""
	}

	data, signature := parts[0], parts[1]

	mac := hmac.New(sha256.New, []byte(config.SessionSecret))
	mac.Write([]byte(data))
	expected := hex.EncodeToString(mac.Sum(nil))

	if !hmac.Equal([]byte(signature), []byte(expected)) {
		return ""
	}

	decoded, err := base64.StdEncoding.DecodeString(data)
	if err != nil {
		return ""
	}

	var payload TokenPayload
	if err := json.Unmarshal(decoded, &payload); err != nil {
		return ""
	}

	if payload.Exp < time.Now().Unix() {
		return ""
	}

	return payload.Username
}

func getUserFile(username string) string {
	return filepath.Join(usersDir, username+".json")
}

func loadUser(username string) (*User, error) {
	data, err := os.ReadFile(getUserFile(username))
	if err != nil {
		return nil, err
	}

	var user User
	if err := json.Unmarshal(data, &user); err != nil {
		return nil, err
	}

	return &user, nil
}

func saveUser(user *User) error {
	data, err := json.MarshalIndent(user, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(getUserFile(user.Username), data, 0644)
}

func createHomeDir(username string) bool {
	homeDir := filepath.Join(config.HomesDir, username)
	if err := os.MkdirAll(homeDir, 0755); err != nil {
		return false
	}
	// Also create public folder for web hosting
	publicDir := filepath.Join(homeDir, "public")
	os.MkdirAll(publicDir, 0755)
	return true
}

func isCommandAllowed(cmd string) bool {
	for _, blocked := range blockedCmds {
		if cmd == blocked {
			return false
		}
	}
	for _, allowed := range allowedCmds {
		if cmd == allowed {
			return true
		}
	}
	return false
}

// WebSocket upgrader for PTY connections
var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for now
	},
}

// isUserInAdminGroup checks if a system user is in sudo/admin/wheel group
func isUserInAdminGroup(username string) bool {
	// Get user info
	u, err := osuser.Lookup(username)
	if err != nil {
		return false
	}

	// Get user's groups
	groupIDs, err := u.GroupIds()
	if err != nil {
		return false
	}

	adminGroups := []string{"sudo", "admin", "wheel", "root"}
	for _, gid := range groupIDs {
		g, err := osuser.LookupGroupId(gid)
		if err != nil {
			continue
		}
		for _, admin := range adminGroups {
			if g.Name == admin {
				return true
			}
		}
	}
	return false
}

// authenticateSystemUser verifies system user credentials
// On Linux, this uses PAM. On other systems, it returns an error.
func authenticateSystemUser(username, password string) error {
	if runtime.GOOS != "linux" {
		return fmt.Errorf("system user authentication only available on Linux")
	}
	// PAM authentication is handled in auth_pam_linux.go
	return pamAuthenticate(username, password)
}

// getSystemUserHomeDir returns the home directory for a system user
func getSystemUserHomeDir(username string) string {
	u, err := osuser.Lookup(username)
	if err != nil {
		return "/home/" + username
	}
	return u.HomeDir
}

// getUserShell returns the user's shell from /etc/passwd
func getUserShell(username string) string {
	file, err := os.Open("/etc/passwd")
	if err != nil {
		return "/bin/bash"
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		parts := strings.Split(scanner.Text(), ":")
		if len(parts) >= 7 && parts[0] == username {
			shell := parts[6]
			if shell != "" {
				return shell
			}
		}
	}
	return "/bin/bash"
}

// requireAuthUser returns the full user object for authenticated requests
func requireAuthUser(r *http.Request) *User {
	username := requireAuth(r)
	if username == "" {
		return nil
	}
	user, err := loadUser(username)
	if err != nil {
		return nil
	}
	return user
}

// HTTP Handlers
func jsonResponse(w http.ResponseWriter, data interface{}, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func requireAuth(r *http.Request) string {
	auth := r.Header.Get("Authorization")
	if !strings.HasPrefix(auth, "Bearer ") {
		return ""
	}
	return verifyToken(auth[7:])
}

func handleLogin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonResponse(w, map[string]string{"error": "Invalid request"}, 400)
		return
	}

	if !usernameRegex.MatchString(req.Username) {
		jsonResponse(w, map[string]string{"error": "Invalid username format"}, 400)
		return
	}

	user, err := loadUser(req.Username)
	if err != nil {
		jsonResponse(w, map[string]string{"error": "User not found"}, 401)
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		jsonResponse(w, map[string]string{"error": "Invalid password"}, 401)
		return
	}

	user.LastLogin = time.Now().Unix()
	saveUser(user)

	token, _ := generateToken(req.Username)
	jsonResponse(w, map[string]interface{}{
		"success":  true,
		"username": req.Username,
		"token":    token,
	}, 200)
}

func handleRegister(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonResponse(w, map[string]string{"error": "Invalid request"}, 400)
		return
	}

	if !usernameRegex.MatchString(req.Username) {
		jsonResponse(w, map[string]string{"error": "Invalid username. Must be 3-32 chars, start with letter, lowercase alphanumeric only."}, 400)
		return
	}

	if len(req.Password) < 6 {
		jsonResponse(w, map[string]string{"error": "Password must be at least 6 characters"}, 400)
		return
	}

	if _, err := os.Stat(getUserFile(req.Username)); err == nil {
		jsonResponse(w, map[string]string{"error": "Username already taken"}, 400)
		return
	}

	if !createHomeDir(req.Username) {
		jsonResponse(w, map[string]string{"error": "Could not create user directory"}, 500)
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		jsonResponse(w, map[string]string{"error": "Could not hash password"}, 500)
		return
	}

	user := &User{
		Username:     req.Username,
		PasswordHash: string(hash),
		Created:      time.Now().Unix(),
		LastLogin:    time.Now().Unix(),
	}

	if err := saveUser(user); err != nil {
		jsonResponse(w, map[string]string{"error": "Could not save user"}, 500)
		return
	}

	token, _ := generateToken(req.Username)
	jsonResponse(w, map[string]interface{}{
		"success":  true,
		"username": req.Username,
		"token":    token,
	}, 200)
}

func handleSystemLogin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonResponse(w, map[string]string{"error": "Invalid request: " + err.Error()}, 400)
		return
	}

	if req.Username == "" || req.Password == "" {
		jsonResponse(w, map[string]string{"error": "Username and password required"}, 400)
		return
	}

	// Verify user exists in system
	_, err := osuser.Lookup(req.Username)
	if err != nil {
		jsonResponse(w, map[string]string{"error": "System user not found"}, 401)
		return
	}

	// Check if user is in admin group
	if !isUserInAdminGroup(req.Username) {
		jsonResponse(w, map[string]string{"error": "User must be in sudo/admin/wheel group"}, 403)
		return
	}

	// Authenticate via PAM
	if err := authenticateSystemUser(req.Username, req.Password); err != nil {
		jsonResponse(w, map[string]string{"error": "Invalid password"}, 401)
		return
	}

	// Create or update FunctionServer user
	homeDir := getSystemUserHomeDir(req.Username)
	user, err := loadUser(req.Username)
	if err != nil {
		// New system user - create FunctionServer account
		user = &User{
			Username:     req.Username,
			PasswordHash: "", // No password hash for system users
			Created:      time.Now().Unix(),
			IsSystemUser: true,
			HomeDir:      homeDir,
		}
	}

	user.LastLogin = time.Now().Unix()
	user.IsSystemUser = true
	user.HomeDir = homeDir
	saveUser(user)

	token, _ := generateToken(req.Username)
	jsonResponse(w, map[string]interface{}{
		"success":      true,
		"username":     req.Username,
		"token":        token,
		"isSystemUser": true,
		"homeDir":      homeDir,
	}, 200)
}

func handlePTY(w http.ResponseWriter, r *http.Request) {
	// Get token from query string
	token := r.URL.Query().Get("token")
	if token == "" {
		http.Error(w, "Token required", 401)
		return
	}

	// Verify token and get user
	username := verifyToken(token)
	if username == "" {
		http.Error(w, "Invalid token", 401)
		return
	}

	// Load user and verify system user status
	user, err := loadUser(username)
	if err != nil || !user.IsSystemUser {
		http.Error(w, "PTY access requires system user login", 403)
		return
	}

	// Upgrade to WebSocket
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	homeDir := user.HomeDir
	if homeDir == "" {
		homeDir = getSystemUserHomeDir(username)
	}

	// Use tmux for persistent sessions
	// Session name based on username for persistence
	sessionName := "fs-" + username

	// Enable mouse mode in tmux for scrolling support
	exec.Command("tmux", "set", "-g", "mouse", "on").Run()

	// Check if tmux session exists, create or attach
	// Using tmux new-session -A: attach if exists, create if not
	cmd := exec.Command("tmux", "new-session", "-A", "-s", sessionName)
	cmd.Env = append(os.Environ(),
		"HOME="+homeDir,
		"USER="+username,
		"TERM=xterm-256color",
	)
	cmd.Dir = homeDir

	ptmx, err := pty.Start(cmd)
	if err != nil {
		conn.WriteMessage(websocket.TextMessage, []byte("Error starting PTY: "+err.Error()))
		return
	}
	defer ptmx.Close()

	// Track if user explicitly closed the window
	userClosed := false

	// IPC directory setup
	ipcDir := homeDir + "/.algo"
	ipcInFile := ipcDir + "/in"
	ipcOutFile := ipcDir + "/out"
	os.MkdirAll(ipcDir, 0755)

	// Create empty IPC files if they don't exist
	if _, err := os.Stat(ipcInFile); os.IsNotExist(err) {
		os.WriteFile(ipcInFile, []byte{}, 0644)
	}
	if _, err := os.Stat(ipcOutFile); os.IsNotExist(err) {
		os.WriteFile(ipcOutFile, []byte{}, 0644)
	}

	// Register browser connection for MCP routing
	browserConn := registerBrowserConn(username, conn)
	defer unregisterBrowserConn(username)

	// Handle PTY resize messages and input
	go func() {
		for {
			msgType, msg, err := conn.ReadMessage()
			if err != nil {
				return
			}
			if msgType == websocket.TextMessage {
				msgStr := string(msg)
				// Check for resize message
				if strings.HasPrefix(msgStr, "RESIZE:") {
					var cols, rows uint16
					fmt.Sscanf(msgStr, "RESIZE:%d:%d", &cols, &rows)
					if cols > 0 && rows > 0 {
						pty.Setsize(ptmx, &pty.Winsize{Cols: cols, Rows: rows})
					}
					continue
				}
				// Check for explicit close message
				if msgStr == "CLOSE_SESSION" {
					userClosed = true
					// Kill the tmux session
					exec.Command("tmux", "kill-session", "-t", sessionName).Run()
					return
				}
				// IPC read: read ~/.algo/in, clear it, return content
				if msgStr == "IPC_READ" {
					ipcDir := homeDir + "/.algo"
					inFile := ipcDir + "/in"

					// Ensure directory exists
					os.MkdirAll(ipcDir, 0755)

					// Read and clear the input file atomically
					content, err := os.ReadFile(inFile)
					if err == nil && len(content) > 0 {
						// Clear the file
						os.WriteFile(inFile, []byte{}, 0644)
						// Send response
						conn.WriteMessage(websocket.TextMessage, []byte("IPC_RESPONSE:"+string(content)))
					} else {
						// Empty or no file
						conn.WriteMessage(websocket.TextMessage, []byte("IPC_RESPONSE:"))
					}
					continue
				}
				// IPC write: append to ~/.algo/out
				if strings.HasPrefix(msgStr, "IPC_WRITE:") {
					ipcDir := homeDir + "/.algo"
					outFile := ipcDir + "/out"

					// Ensure directory exists
					os.MkdirAll(ipcDir, 0755)

					// Append content
					content := msgStr[10:] // Skip "IPC_WRITE:"
					f, err := os.OpenFile(outFile, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
					if err == nil {
						f.WriteString(content + "\n")
						f.Close()
					}
					continue
				}
				// MCP response from browser
				if strings.HasPrefix(msgStr, "MCP_RESP:") {
					// Format: MCP_RESP:reqId:jsonResult
					parts := strings.SplitN(msgStr[9:], ":", 2)
					if len(parts) == 2 {
						browserConn.HandleResponse(parts[0], parts[1])
					}
					continue
				}
				// Eye response from browser (direct bridge)
				if strings.HasPrefix(msgStr, "EYE:") {
					// Format: EYE:id:result or EYE:id!:error
					// Forward directly to connected Claude instances
					sendEyeResponse(username, msgStr[4:])
					continue
				}
			}
			// Write to PTY
			ptmx.Write(msg)
		}
	}()

	// Read from PTY and send to WebSocket
	buf := make([]byte, 4096)
	for {
		n, err := ptmx.Read(buf)
		if err != nil {
			break
		}
		if err := conn.WriteMessage(websocket.BinaryMessage, buf[:n]); err != nil {
			break
		}
	}

	// If user didn't explicitly close, detach cleanly (session persists)
	// If user closed, session was already killed above
	if !userClosed {
		// Detach from tmux (Ctrl+B, D) - session continues running
		ptmx.Write([]byte{0x02, 0x64}) // tmux detach sequence
	}
}

// Eye bridge: Direct WebSocket connection for AI-to-browser communication
// Protocol:
//   - "expression"     -> fire and forget (no response)
//   - "id:expression"  -> request with ID, expects "id:result" or "id!:error"
func handleEye(w http.ResponseWriter, r *http.Request) {
	// Get token from query string
	token := r.URL.Query().Get("token")
	if token == "" {
		http.Error(w, "Token required", 401)
		return
	}

	// Verify token and get user
	username := verifyToken(token)
	if username == "" {
		http.Error(w, "Invalid token", 401)
		return
	}

	// Upgrade to WebSocket
	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	// Register this eye connection
	eyeConn := registerEyeConn(username, conn)
	defer unregisterEyeConn(username, eyeConn)

	// Get browser connection
	bc := getBrowserConn(username)
	if bc == nil {
		conn.WriteMessage(websocket.TextMessage, []byte("!:No browser connected"))
		return
	}

	// Send ready message
	conn.WriteMessage(websocket.TextMessage, []byte(":ready"))

	// Read messages from Claude and forward to browser
	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			break
		}

		msgStr := string(msg)
		if msgStr == "" {
			continue
		}

		// Parse: "expression" (fire) or "id:expression" (request)
		// If first char is letter/number and contains ':', it's id:expression
		var id, expression string
		if colonIdx := strings.Index(msgStr, ":"); colonIdx > 0 && colonIdx < 20 {
			// Check if prefix looks like an ID (alphanumeric, short)
			prefix := msgStr[:colonIdx]
			isID := true
			for _, c := range prefix {
				if !((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_') {
					isID = false
					break
				}
			}
			if isID {
				id = prefix
				expression = msgStr[colonIdx+1:]
			} else {
				expression = msgStr
			}
		} else {
			expression = msgStr
		}

		// Send to browser
		// Format: EYE_CMD:id:expression (id may be empty for fire-and-forget)
		cmdMsg := fmt.Sprintf("EYE_CMD:%s:%s", id, expression)
		err = bc.Conn.WriteMessage(websocket.TextMessage, []byte(cmdMsg))
		if err != nil {
			conn.WriteMessage(websocket.TextMessage, []byte(id+"!:Browser disconnected"))
			break
		}
	}
}

// Eye bridge endpoint for browser - connects on page load
// This replaces the need to have Shell open for eye commands
func handleEyeBridge(w http.ResponseWriter, r *http.Request) {
	// Get token from query string
	token := r.URL.Query().Get("token")
	if token == "" {
		http.Error(w, "Token required", 401)
		return
	}

	// Verify token and get user
	username := verifyToken(token)
	if username == "" {
		http.Error(w, "Invalid token", 401)
		return
	}

	// Upgrade to WebSocket
	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	// Register as browser connection for eye commands
	browserConn := registerBrowserConn(username, conn)
	defer unregisterBrowserConn(username)

	// Send ready message
	conn.WriteMessage(websocket.TextMessage, []byte("EYE_BRIDGE:ready"))

	// Read messages from browser
	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			break
		}

		msgStr := string(msg)

		// Eye response from browser (direct bridge)
		// Format: EYE:id:result or EYE:id!:error
		if strings.HasPrefix(msgStr, "EYE:") {
			sendEyeResponse(username, msgStr[4:])
			continue
		}

		// Ping/pong for keepalive
		if msgStr == "ping" {
			conn.WriteMessage(websocket.TextMessage, []byte("pong"))
			continue
		}
	}

	_ = browserConn // Silence unused variable warning
}

// Content bridge - connects browser extension and Clean View instances
var (
	extensionConn    *websocket.Conn
	extensionConnMu  sync.RWMutex
	browserConns     = make(map[*websocket.Conn]bool)
	browserConnsMu   sync.RWMutex
	pendingResponses = make(map[string]*websocket.Conn) // request ID -> requesting browser conn
	pendingMu        sync.Mutex
)

// Handle content bridge WebSocket - serves both extension and browsers
func handleContentBridge(w http.ResponseWriter, r *http.Request) {
	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	// Check if this is the extension (query param) or a browser
	isExtension := r.URL.Query().Get("ext") == "1"

	if isExtension {
		extensionConnMu.Lock()
		extensionConn = conn
		extensionConnMu.Unlock()

		defer func() {
			extensionConnMu.Lock()
			if extensionConn == conn {
				extensionConn = nil
			}
			extensionConnMu.Unlock()
		}()

		fmt.Println("[ContentBridge] Extension connected")

		// Read messages from extension
		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				break
			}

			var data map[string]interface{}
			if err := json.Unmarshal(msg, &data); err != nil {
				continue
			}

			// Forward responses back to requesting browser
			if id, ok := data["id"].(string); ok {
				pendingMu.Lock()
				browserConn, exists := pendingResponses[id]
				if exists {
					delete(pendingResponses, id)
				}
				pendingMu.Unlock()

				if exists && browserConn != nil {
					browserConn.WriteMessage(websocket.TextMessage, msg)
				}
			}

			// Handle tabList - could broadcast to all browsers
			if action, ok := data["action"].(string); ok {
				if action == "tabList" {
					if tabs, ok := data["tabs"].([]interface{}); ok {
						fmt.Printf("[ContentBridge] Got %d tabs\n", len(tabs))
					}
				}
			}
		}

		fmt.Println("[ContentBridge] Extension disconnected")
	} else {
		// This is a browser (Clean View)
		browserConnsMu.Lock()
		browserConns[conn] = true
		browserConnsMu.Unlock()

		defer func() {
			browserConnsMu.Lock()
			delete(browserConns, conn)
			browserConnsMu.Unlock()
		}()

		fmt.Println("[ContentBridge] Browser connected")

		// Read messages from browser and forward to extension
		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				break
			}

			var data map[string]interface{}
			if err := json.Unmarshal(msg, &data); err != nil {
				continue
			}

			// Handle ping locally
			if action, ok := data["action"].(string); ok && action == "ping" {
				if id, ok := data["id"].(string); ok {
					conn.WriteMessage(websocket.TextMessage, []byte(`{"id":"`+id+`","result":"pong"}`))
				}
				continue
			}

			// Forward request to extension
			extensionConnMu.RLock()
			ext := extensionConn
			extensionConnMu.RUnlock()

			if ext == nil {
				// No extension connected, send error
				if id, ok := data["id"].(string); ok {
					errResp := fmt.Sprintf(`{"id":"%s","error":"Extension not connected"}`, id)
					conn.WriteMessage(websocket.TextMessage, []byte(errResp))
				}
				continue
			}

			// Track pending request
			if id, ok := data["id"].(string); ok {
				pendingMu.Lock()
				pendingResponses[id] = conn
				pendingMu.Unlock()
			}

			// Forward to extension
			ext.WriteMessage(websocket.TextMessage, msg)
		}

		fmt.Println("[ContentBridge] Browser disconnected")
	}
}

func handleVerify(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Token    string `json:"token"`
		Username string `json:"username"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonResponse(w, map[string]bool{"valid": false}, 200)
		return
	}

	tokenUser := verifyToken(req.Token)
	if tokenUser == req.Username {
		jsonResponse(w, map[string]interface{}{"valid": true, "username": tokenUser}, 200)
	} else {
		jsonResponse(w, map[string]bool{"valid": false}, 200)
	}
}

func handleTerminalExec(w http.ResponseWriter, r *http.Request) {
	username := requireAuth(r)
	if username == "" {
		jsonResponse(w, map[string]string{"error": "Authorization required"}, 401)
		return
	}

	var req struct {
		Command string `json:"command"`
		Cwd     string `json:"cwd"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonResponse(w, map[string]string{"error": "Invalid request"}, 400)
		return
	}

	command := strings.TrimSpace(req.Command)
	if command == "" {
		jsonResponse(w, map[string]string{"error": "No command provided"}, 400)
		return
	}

	homeDir := filepath.Join(config.HomesDir, username)
	os.MkdirAll(homeDir, 0755)

	// Determine working directory
	workDir := homeDir
	if req.Cwd != "" && req.Cwd != "~" {
		// Expand ~ to home dir
		cwd := req.Cwd
		if strings.HasPrefix(cwd, "~/") {
			cwd = filepath.Join(homeDir, cwd[2:])
		} else if cwd == "~" {
			cwd = homeDir
		} else if !filepath.IsAbs(cwd) {
			cwd = filepath.Join(homeDir, cwd)
		}
		// Resolve and validate path is within home
		resolved, err := filepath.Abs(cwd)
		if err == nil && strings.HasPrefix(resolved, homeDir) {
			if info, err := os.Stat(resolved); err == nil && info.IsDir() {
				workDir = resolved
			}
		}
	}

	parts := strings.Fields(command)
	baseCmd := parts[0]

	// Handle cd specially - validate and return new cwd
	if baseCmd == "cd" {
		newDir := homeDir
		if len(parts) > 1 {
			target := parts[1]
			if target == "~" || target == "" {
				newDir = homeDir
			} else if target == ".." {
				newDir = filepath.Dir(workDir)
			} else if strings.HasPrefix(target, "~/") {
				newDir = filepath.Join(homeDir, target[2:])
			} else if filepath.IsAbs(target) {
				newDir = target
			} else {
				newDir = filepath.Join(workDir, target)
			}
		}
		// Resolve and validate
		resolved, err := filepath.Abs(newDir)
		if err != nil || !strings.HasPrefix(resolved, homeDir) {
			jsonResponse(w, map[string]interface{}{"error": "Access denied", "cwd": workDir}, 403)
			return
		}
		if info, err := os.Stat(resolved); err != nil || !info.IsDir() {
			jsonResponse(w, map[string]interface{}{"error": "Not a directory", "cwd": workDir}, 400)
			return
		}
		// Return display path with ~ prefix
		displayPath := strings.Replace(resolved, homeDir, "~", 1)
		if displayPath == "" {
			displayPath = "~"
		}
		jsonResponse(w, map[string]interface{}{"output": "", "cwd": displayPath}, 200)
		return
	}

	if !isCommandAllowed(baseCmd) {
		if baseCmd == "help" {
			jsonResponse(w, map[string]string{"output": "Available commands: " + strings.Join(allowedCmds, ", ")}, 200)
			return
		}
		jsonResponse(w, map[string]string{"error": fmt.Sprintf("Command not allowed: %s", baseCmd)}, 403)
		return
	}

	cmd := exec.Command("sh", "-c", command)
	cmd.Dir = workDir
	cmd.Env = append(os.Environ(),
		"HOME="+homeDir,
		"USER="+username,
	)

	output, err := cmd.CombinedOutput()
	response := map[string]interface{}{"output": strings.TrimRight(string(output), "\n")}
	if err != nil {
		response["error"] = err.Error()
	}

	jsonResponse(w, response, 200)
}

func handleFileList(w http.ResponseWriter, r *http.Request) {
	username := requireAuth(r)
	if username == "" {
		jsonResponse(w, map[string]string{"error": "Authorization required"}, 401)
		return
	}

	homeDir := filepath.Join(config.HomesDir, username)
	path := r.URL.Query().Get("path")
	if path == "" || path == "~" {
		path = homeDir
	} else if strings.HasPrefix(path, "~") {
		path = filepath.Join(homeDir, path[1:])
	}

	resolved, err := filepath.Abs(path)
	if err != nil || !strings.HasPrefix(resolved, homeDir) {
		jsonResponse(w, map[string]string{"error": "Access denied"}, 403)
		return
	}

	entries, err := os.ReadDir(resolved)
	if err != nil {
		jsonResponse(w, map[string]string{"error": "Not a directory"}, 400)
		return
	}

	var files []map[string]interface{}
	for _, entry := range entries {
		info, _ := entry.Info()
		fileType := "file"
		if entry.IsDir() {
			fileType = "directory"
		}
		size := int64(0)
		if !entry.IsDir() {
			size = info.Size()
		}
		files = append(files, map[string]interface{}{
			"name":     entry.Name(),
			"type":     fileType,
			"size":     size,
			"modified": info.ModTime().Unix(),
		})
	}

	displayPath := strings.Replace(resolved, homeDir, "~", 1)
	jsonResponse(w, map[string]interface{}{
		"path":  displayPath,
		"files": files,
	}, 200)
}

func handleFileSave(w http.ResponseWriter, r *http.Request) {
	username := requireAuth(r)
	if username == "" {
		jsonResponse(w, map[string]string{"error": "Authorization required"}, 401)
		return
	}

	var req struct {
		Path    string `json:"path"`
		Content string `json:"content"`
		Type    string `json:"type"` // text, html, etc.
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonResponse(w, map[string]string{"error": "Invalid request"}, 400)
		return
	}

	if req.Path == "" {
		jsonResponse(w, map[string]string{"error": "Path required"}, 400)
		return
	}

	homeDir := filepath.Join(config.HomesDir, username)
	os.MkdirAll(homeDir, 0755)

	// Resolve path
	filePath := req.Path
	if strings.HasPrefix(filePath, "~/") {
		filePath = filepath.Join(homeDir, filePath[2:])
	} else if !filepath.IsAbs(filePath) {
		filePath = filepath.Join(homeDir, filePath)
	}

	resolved, err := filepath.Abs(filePath)
	if err != nil || !strings.HasPrefix(resolved, homeDir) {
		jsonResponse(w, map[string]string{"error": "Access denied"}, 403)
		return
	}

	// Create parent directory if needed
	os.MkdirAll(filepath.Dir(resolved), 0755)

	// Write file
	if err := os.WriteFile(resolved, []byte(req.Content), 0644); err != nil {
		jsonResponse(w, map[string]string{"error": "Failed to save file"}, 500)
		return
	}

	displayPath := strings.Replace(resolved, homeDir, "~", 1)
	jsonResponse(w, map[string]interface{}{
		"success": true,
		"path":    displayPath,
	}, 200)
}

func handleFileGet(w http.ResponseWriter, r *http.Request) {
	username := requireAuth(r)
	if username == "" {
		jsonResponse(w, map[string]string{"error": "Authorization required"}, 401)
		return
	}

	path := r.URL.Query().Get("path")
	if path == "" {
		jsonResponse(w, map[string]string{"error": "Path required"}, 400)
		return
	}

	homeDir := filepath.Join(config.HomesDir, username)

	// Resolve path
	filePath := path
	if strings.HasPrefix(filePath, "~/") {
		filePath = filepath.Join(homeDir, filePath[2:])
	} else if !filepath.IsAbs(filePath) {
		filePath = filepath.Join(homeDir, filePath)
	}

	resolved, err := filepath.Abs(filePath)
	if err != nil || !strings.HasPrefix(resolved, homeDir) {
		jsonResponse(w, map[string]string{"error": "Access denied"}, 403)
		return
	}

	content, err := os.ReadFile(resolved)
	if err != nil {
		jsonResponse(w, map[string]string{"error": "File not found"}, 404)
		return
	}

	info, _ := os.Stat(resolved)
	displayPath := strings.Replace(resolved, homeDir, "~", 1)
	jsonResponse(w, map[string]interface{}{
		"path":     displayPath,
		"content":  string(content),
		"size":     info.Size(),
		"modified": info.ModTime().Unix(),
	}, 200)
}

func handleFileDelete(w http.ResponseWriter, r *http.Request) {
	username := requireAuth(r)
	if username == "" {
		jsonResponse(w, map[string]string{"error": "Authorization required"}, 401)
		return
	}

	var req struct {
		Path string `json:"path"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonResponse(w, map[string]string{"error": "Invalid request"}, 400)
		return
	}

	if req.Path == "" {
		jsonResponse(w, map[string]string{"error": "Path required"}, 400)
		return
	}

	homeDir := filepath.Join(config.HomesDir, username)

	// Resolve path
	filePath := req.Path
	if strings.HasPrefix(filePath, "~/") {
		filePath = filepath.Join(homeDir, filePath[2:])
	} else if !filepath.IsAbs(filePath) {
		filePath = filepath.Join(homeDir, filePath)
	}

	resolved, err := filepath.Abs(filePath)
	if err != nil || !strings.HasPrefix(resolved, homeDir) {
		jsonResponse(w, map[string]string{"error": "Access denied"}, 403)
		return
	}

	// Don't allow deleting home directory itself
	if resolved == homeDir {
		jsonResponse(w, map[string]string{"error": "Cannot delete home directory"}, 403)
		return
	}

	if err := os.RemoveAll(resolved); err != nil {
		jsonResponse(w, map[string]string{"error": "Failed to delete"}, 500)
		return
	}

	jsonResponse(w, map[string]interface{}{"success": true}, 200)
}

func serveOS(w http.ResponseWriter, r *http.Request) {
	// Try to find algo-os.html (full ALGO OS) or fallback to os.html
	paths := []string{
		"../core/algo-os.html",
		"./core/algo-os.html",
		"../core/os.html",
		"./core/os.html",
	}

	var content []byte
	var err error
	for _, p := range paths {
		content, err = os.ReadFile(p)
		if err == nil {
			break
		}
	}

	if err != nil {
		http.Error(w, "OS template not found", 500)
		return
	}

	html := string(content)
	replacements := map[string]string{
		"{{OS_NAME}}":       config.OSName,
		"{{OS_ICON}}":       config.OSIcon,
		"{{API_BASE}}":      config.APIBase,
		"{{TERMINAL_ICON}}": config.TerminalIcon,
		"{{FOLDER_ICON}}":   config.FolderIcon,
		"{{SETTINGS_ICON}}": config.SettingsIcon,
		"{{LOGOUT_ICON}}":   config.LogoutIcon,
	}

	for key, value := range replacements {
		html = strings.ReplaceAll(html, key, value)
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	io.WriteString(w, html)
}

func main() {
	mux := http.NewServeMux()

	// API routes
	mux.HandleFunc("/api/auth/login", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "OPTIONS" {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			return
		}
		handleLogin(w, r)
	})

	mux.HandleFunc("/api/auth/register", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "OPTIONS" {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			return
		}
		handleRegister(w, r)
	})

	mux.HandleFunc("/api/auth/verify", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "OPTIONS" {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			return
		}
		handleVerify(w, r)
	})

	mux.HandleFunc("/api/auth/system-login", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "OPTIONS" {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			return
		}
		handleSystemLogin(w, r)
	})

	mux.HandleFunc("/api/pty", func(w http.ResponseWriter, r *http.Request) {
		handlePTY(w, r)
	})

	// Eye bridge: Direct AI-to-browser WebSocket (for Claude/eye CLI)
	mux.HandleFunc("/api/eye", func(w http.ResponseWriter, r *http.Request) {
		handleEye(w, r)
	})

	// Eye bridge: Browser-side connection (auto-connects on page load)
	mux.HandleFunc("/api/eye-bridge", func(w http.ResponseWriter, r *http.Request) {
		handleEyeBridge(w, r)
	})

	// Content bridge: Browser extension connection (for Clean View shadow tabs)
	mux.HandleFunc("/api/content-bridge", func(w http.ResponseWriter, r *http.Request) {
		handleContentBridge(w, r)
	})

	mux.HandleFunc("/api/terminal/exec", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "OPTIONS" {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			return
		}
		handleTerminalExec(w, r)
	})

	mux.HandleFunc("/api/files/list", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "OPTIONS" {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			return
		}
		handleFileList(w, r)
	})

	mux.HandleFunc("/api/files/save", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "OPTIONS" {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			return
		}
		handleFileSave(w, r)
	})

	mux.HandleFunc("/api/files/get", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "OPTIONS" {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			return
		}
		handleFileGet(w, r)
	})

	mux.HandleFunc("/api/files/delete", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "OPTIONS" {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			return
		}
		handleFileDelete(w, r)
	})

	// Tickets API
	mux.HandleFunc("/api/tickets", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Content-Type", "application/json")

		if r.Method == "OPTIONS" {
			return
		}

		if r.Method == "POST" {
			var req struct {
				Title       string `json:"title"`
				Description string `json:"description"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Title == "" {
				http.Error(w, `{"error":"title required"}`, 400)
				return
			}
			ticketMutex.Lock()
			ticketID++
			t := Ticket{
				ID:          fmt.Sprintf("T%d", ticketID),
				Title:       req.Title,
				Description: req.Description,
				Status:      "open",
				Created:     time.Now().Format("2006-01-02 15:04"),
			}
			tickets = append(tickets, t)
			ticketMutex.Unlock()
			json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "ticket": t})
			return
		}

		// GET - return tickets
		ticketMutex.RLock()
		result := tickets
		if result == nil {
			result = []Ticket{}
		}
		ticketMutex.RUnlock()
		json.NewEncoder(w).Encode(map[string]interface{}{"tickets": result})
	})

	// Serve system apps list
	mux.HandleFunc("/api/system-apps", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")

		// Find apps directory
		appsDirs := []string{"../core/apps", "./core/apps"}
		var appsDir string
		for _, d := range appsDirs {
			if info, err := os.Stat(d); err == nil && info.IsDir() {
				appsDir = d
				break
			}
		}

		if appsDir == "" {
			json.NewEncoder(w).Encode(map[string]interface{}{"apps": []interface{}{}})
			return
		}

		// Read all .js files in apps directory
		files, err := os.ReadDir(appsDir)
		if err != nil {
			json.NewEncoder(w).Encode(map[string]interface{}{"apps": []interface{}{}})
			return
		}

		var apps []map[string]interface{}

		// Helper function to process an app file
		processApp := func(filePath, id string) {
			content, err := os.ReadFile(filePath)
			if err != nil {
				return
			}

			code := string(content)

			// Extract metadata from code comments/ALGO.app assignments
			name := id
			icon := "📱"
			if m := regexp.MustCompile(`ALGO\.app\.name\s*=\s*['"]([^'"]+)['"]`).FindStringSubmatch(code); len(m) > 1 {
				name = m[1]
			}
			if m := regexp.MustCompile(`ALGO\.app\.icon\s*=\s*['"]([^'"]+)['"]`).FindStringSubmatch(code); len(m) > 1 {
				icon = m[1]
			}

			apps = append(apps, map[string]interface{}{
				"id":     id,
				"name":   name,
				"icon":   icon,
				"code":   code,
				"system": true,
			})
		}

		for _, f := range files {
			if f.IsDir() {
				// Check for subdirectory with matching .js file (e.g., shell/shell.js)
				subAppPath := filepath.Join(appsDir, f.Name(), f.Name()+".js")
				if _, err := os.Stat(subAppPath); err == nil {
					processApp(subAppPath, f.Name())
				}
				continue
			}

			if !strings.HasSuffix(f.Name(), ".js") {
				continue
			}

			id := strings.TrimSuffix(f.Name(), ".js")
			processApp(filepath.Join(appsDir, f.Name()), id)
		}

			json.NewEncoder(w).Encode(map[string]interface{}{"apps": apps})
	})

	// Proxy endpoint for Clean View app (CORS bypass)
	mux.HandleFunc("/api/proxy", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		targetURL := r.URL.Query().Get("url")
		if targetURL == "" {
			http.Error(w, "Missing url parameter", 400)
			return
		}

		// Validate URL
		parsedURL, err := url.Parse(targetURL)
		if err != nil || (parsedURL.Scheme != "http" && parsedURL.Scheme != "https") {
			http.Error(w, "Invalid URL", 400)
			return
		}

		// Fetch the target URL
		client := &http.Client{Timeout: 30 * time.Second}
		req, err := http.NewRequest("GET", targetURL, nil)
		if err != nil {
			http.Error(w, "Failed to create request", 500)
			return
		}

		// Set a browser-like user agent
		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
		req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")

		resp, err := client.Do(req)
		if err != nil {
			http.Error(w, "Failed to fetch URL: "+err.Error(), 500)
			return
		}
		defer resp.Body.Close()

		// Copy response headers
		w.Header().Set("Content-Type", resp.Header.Get("Content-Type"))

		// Copy body
		io.Copy(w, resp.Body)
	})

	// MCP (Model Context Protocol) endpoint for Claude Code integration
	mux.HandleFunc("/api/mcp", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		if r.Method != "POST" {
			http.Error(w, "Method not allowed", 405)
			return
		}

		w.Header().Set("Content-Type", "application/json")

		// Authenticate via Bearer token
		auth := r.Header.Get("Authorization")
		if !strings.HasPrefix(auth, "Bearer ") {
			json.NewEncoder(w).Encode(map[string]interface{}{
				"error": "Authorization required. Use: Authorization: Bearer <session_token>",
			})
			return
		}
		tokenUser := verifyToken(auth[7:])
		if tokenUser == "" {
			json.NewEncoder(w).Encode(map[string]interface{}{
				"error": "Invalid or expired token",
			})
			return
		}

		// Parse MCP request
		var req struct {
			Method string                 `json:"method"`
			Params map[string]interface{} `json:"params"`
			User   string                 `json:"user"` // Target user's browser session (optional, defaults to token user)
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			json.NewEncoder(w).Encode(map[string]interface{}{
				"error": "Invalid request body",
			})
			return
		}

		// Use token user if not specified, or allow targeting another user's session
		// (In future, could add permission checks for cross-user access)
		if req.User == "" {
			req.User = tokenUser
		}

		// Handle MCP methods
		switch req.Method {
		case "tools/list":
			// Return available tools
			tools := []map[string]interface{}{
				{
					"name":        "algo_eval",
					"description": "Execute JavaScript code in the browser and return the result",
					"inputSchema": map[string]interface{}{
						"type": "object",
						"properties": map[string]interface{}{
							"code": map[string]interface{}{
								"type":        "string",
								"description": "JavaScript code to execute",
							},
						},
						"required": []string{"code"},
					},
				},
				{
					"name":        "algo_getState",
					"description": "Get the current ALGO OS state including windows, apps, and user info",
					"inputSchema": map[string]interface{}{
						"type":       "object",
						"properties": map[string]interface{}{},
					},
				},
				{
					"name":        "algo_query",
					"description": "Query a DOM element using CSS selector",
					"inputSchema": map[string]interface{}{
						"type": "object",
						"properties": map[string]interface{}{
							"selector": map[string]interface{}{
								"type":        "string",
								"description": "CSS selector",
							},
						},
						"required": []string{"selector"},
					},
				},
				{
					"name":        "algo_queryAll",
					"description": "Query all matching DOM elements using CSS selector",
					"inputSchema": map[string]interface{}{
						"type": "object",
						"properties": map[string]interface{}{
							"selector": map[string]interface{}{
								"type":        "string",
								"description": "CSS selector",
							},
						},
						"required": []string{"selector"},
					},
				},
				{
					"name":        "algo_click",
					"description": "Click a DOM element by CSS selector",
					"inputSchema": map[string]interface{}{
						"type": "object",
						"properties": map[string]interface{}{
							"selector": map[string]interface{}{
								"type":        "string",
								"description": "CSS selector of element to click",
							},
						},
						"required": []string{"selector"},
					},
				},
				{
					"name":        "algo_setValue",
					"description": "Set the value of an input element",
					"inputSchema": map[string]interface{}{
						"type": "object",
						"properties": map[string]interface{}{
							"selector": map[string]interface{}{
								"type":        "string",
								"description": "CSS selector of input element",
							},
							"value": map[string]interface{}{
								"type":        "string",
								"description": "Value to set",
							},
						},
						"required": []string{"selector", "value"},
					},
				},
				{
					"name":        "algo_openApp",
					"description": "Open an application by ID",
					"inputSchema": map[string]interface{}{
						"type": "object",
						"properties": map[string]interface{}{
							"appId": map[string]interface{}{
								"type":        "string",
								"description": "Application ID to open",
							},
						},
						"required": []string{"appId"},
					},
				},
				{
					"name":        "algo_closeWindow",
					"description": "Close a window by ID",
					"inputSchema": map[string]interface{}{
						"type": "object",
						"properties": map[string]interface{}{
							"windowId": map[string]interface{}{
								"type":        "integer",
								"description": "Window ID to close",
							},
						},
						"required": []string{"windowId"},
					},
				},
			}
			json.NewEncoder(w).Encode(map[string]interface{}{
				"tools": tools,
			})

		case "tools/call":
			// Execute a tool
			toolName, _ := req.Params["name"].(string)
			toolArgs, _ := req.Params["arguments"].(map[string]interface{})

			// Get browser connection
			bc := getBrowserConn(req.User)
			if bc == nil {
				json.NewEncoder(w).Encode(map[string]interface{}{
					"error": fmt.Sprintf("No browser session for user %s. Open the Claude app in the browser first.", req.User),
				})
				return
			}

			// Map tool to bridge command
			var bridgeCmd map[string]interface{}
			switch toolName {
			case "algo_eval":
				bridgeCmd = map[string]interface{}{
					"_bridge": "eval",
					"_args":   []interface{}{toolArgs["code"]},
				}
			case "algo_getState":
				bridgeCmd = map[string]interface{}{
					"_bridge": "getState",
					"_args":   []interface{}{},
				}
			case "algo_query":
				bridgeCmd = map[string]interface{}{
					"_bridge": "query",
					"_args":   []interface{}{toolArgs["selector"]},
				}
			case "algo_queryAll":
				bridgeCmd = map[string]interface{}{
					"_bridge": "queryAll",
					"_args":   []interface{}{toolArgs["selector"]},
				}
			case "algo_click":
				bridgeCmd = map[string]interface{}{
					"_bridge": "click",
					"_args":   []interface{}{toolArgs["selector"]},
				}
			case "algo_setValue":
				bridgeCmd = map[string]interface{}{
					"_bridge": "setValue",
					"_args":   []interface{}{toolArgs["selector"], toolArgs["value"]},
				}
			case "algo_openApp":
				bridgeCmd = map[string]interface{}{
					"_bridge": "openApp",
					"_args":   []interface{}{toolArgs["appId"]},
				}
			case "algo_closeWindow":
				bridgeCmd = map[string]interface{}{
					"_bridge": "closeWindow",
					"_args":   []interface{}{toolArgs["windowId"]},
				}
			default:
				json.NewEncoder(w).Encode(map[string]interface{}{
					"error": fmt.Sprintf("Unknown tool: %s", toolName),
				})
				return
			}

			// Send to browser and wait for response
			result, err := bc.SendCommand(bridgeCmd)
			if err != nil {
				json.NewEncoder(w).Encode(map[string]interface{}{
					"error": err.Error(),
				})
				return
			}

			// Parse and return result
			var resultObj interface{}
			json.Unmarshal([]byte(result), &resultObj)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"content": []map[string]interface{}{
					{
						"type": "text",
						"text": result,
					},
				},
			})

		default:
			json.NewEncoder(w).Encode(map[string]interface{}{
				"error": fmt.Sprintf("Unknown method: %s", req.Method),
			})
		}
	})

	// Serve install script from www folder
	mux.HandleFunc("/install", func(w http.ResponseWriter, r *http.Request) {
		installPaths := []string{"../www/install", "./www/install"}
		for _, p := range installPaths {
			if content, err := os.ReadFile(p); err == nil {
				w.Header().Set("Content-Type", "text/plain; charset=utf-8")
				w.Write(content)
				return
			}
		}
		http.NotFound(w, r)
	})

	// Serve OS at /app
	mux.HandleFunc("/app", serveOS)
	mux.HandleFunc("/app/", serveOS)

	// Serve OS CSS
	mux.HandleFunc("/algo-os.css", func(w http.ResponseWriter, r *http.Request) {
		paths := []string{"../core/algo-os.css", "./core/algo-os.css"}
		for _, p := range paths {
			if content, err := os.ReadFile(p); err == nil {
				w.Header().Set("Content-Type", "text/css")
				w.Write(content)
				return
			}
		}
		http.NotFound(w, r)
	})

	// Serve files from /core/apps/ (for lazy-loaded resources like .md files)
	mux.HandleFunc("/core/apps/", func(w http.ResponseWriter, r *http.Request) {
		filename := strings.TrimPrefix(r.URL.Path, "/core/apps/")
		// Security: only allow specific file types
		if !strings.HasSuffix(filename, ".md") && !strings.HasSuffix(filename, ".txt") {
			http.NotFound(w, r)
			return
		}
		paths := []string{"../core/apps/" + filename, "./core/apps/" + filename}
		for _, p := range paths {
			if content, err := os.ReadFile(p); err == nil {
				if strings.HasSuffix(filename, ".md") {
					w.Header().Set("Content-Type", "text/markdown; charset=utf-8")
				} else {
					w.Header().Set("Content-Type", "text/plain; charset=utf-8")
				}
				w.Write(content)
				return
			}
		}
		http.NotFound(w, r)
	})

	// Serve static files from www directory (screenshots, etc)
	wwwPaths := []string{"../www", "./www"}
	var wwwDir string
	for _, p := range wwwPaths {
		if info, err := os.Stat(p); err == nil && info.IsDir() {
			wwwDir = p
			break
		}
	}
	if wwwDir != "" {
		fs := http.FileServer(http.Dir(wwwDir))
		mux.Handle("/screenshots/", http.StripPrefix("/", fs))
	}

	// Serve landing page at root, or public folders at /username/
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path

		// Root path - serve landing page
		if path == "/" {
			landingPaths := []string{"../www/index.html", "./www/index.html"}
			for _, p := range landingPaths {
				if content, err := os.ReadFile(p); err == nil {
					w.Header().Set("Content-Type", "text/html; charset=utf-8")
					w.Write(content)
					return
				}
			}
			// Fallback to OS if no landing page
			serveOS(w, r)
			return
		}

		// Check for static files in www directory (door.html, etc)
		if strings.HasSuffix(path, ".html") || strings.HasSuffix(path, ".css") || strings.HasSuffix(path, ".js") || strings.HasSuffix(path, ".png") || strings.HasSuffix(path, ".jpg") || strings.HasSuffix(path, ".svg") {
			wwwPaths := []string{"../www" + path, "./www" + path}
			for _, p := range wwwPaths {
				if content, err := os.ReadFile(p); err == nil {
					ext := strings.ToLower(filepath.Ext(path))
					contentType := "text/plain"
					switch ext {
					case ".html":
						contentType = "text/html; charset=utf-8"
					case ".css":
						contentType = "text/css; charset=utf-8"
					case ".js":
						contentType = "application/javascript; charset=utf-8"
					case ".png":
						contentType = "image/png"
					case ".jpg", ".jpeg":
						contentType = "image/jpeg"
					case ".svg":
						contentType = "image/svg+xml"
					}
					w.Header().Set("Content-Type", contentType)
					w.Write(content)
					return
				}
			}
		}

		// Check if path starts with a username (public folder)
		parts := strings.Split(strings.Trim(path, "/"), "/")
		if len(parts) > 0 && usernameRegex.MatchString(parts[0]) {
			username := parts[0]
			// Check if user exists
			if _, err := os.Stat(getUserFile(username)); err == nil {
				// User exists, serve from their public folder
				publicDir := filepath.Join(config.HomesDir, username, "public")
				subPath := strings.Join(parts[1:], "/")
				if subPath == "" {
					subPath = "index.html"
				}
				filePath := filepath.Join(publicDir, subPath)

				// Security: ensure path is within public folder
				resolved, err := filepath.Abs(filePath)
				if err != nil || !strings.HasPrefix(resolved, publicDir) {
					http.NotFound(w, r)
					return
				}

				// Check if file exists
				info, err := os.Stat(resolved)
				if err != nil {
					http.NotFound(w, r)
					return
				}

				// If directory, try index.html
				if info.IsDir() {
					resolved = filepath.Join(resolved, "index.html")
					info, err = os.Stat(resolved)
					if err != nil {
						http.NotFound(w, r)
						return
					}
				}

				// Serve the file
				content, err := os.ReadFile(resolved)
				if err != nil {
					http.NotFound(w, r)
					return
				}

				// Set content type based on extension
				ext := strings.ToLower(filepath.Ext(resolved))
				contentType := "text/plain"
				switch ext {
				case ".html", ".htm":
					contentType = "text/html; charset=utf-8"
				case ".css":
					contentType = "text/css; charset=utf-8"
				case ".js":
					contentType = "application/javascript; charset=utf-8"
				case ".json":
					contentType = "application/json; charset=utf-8"
				case ".png":
					contentType = "image/png"
				case ".jpg", ".jpeg":
					contentType = "image/jpeg"
				case ".gif":
					contentType = "image/gif"
				case ".svg":
					contentType = "image/svg+xml"
				case ".ico":
					contentType = "image/x-icon"
				}

				w.Header().Set("Content-Type", contentType)
				w.Write(content)
				return
			}
		}

		http.NotFound(w, r)
	})

	// Check for SSL certificates
	certFile := "/etc/letsencrypt/live/functionserver.com/fullchain.pem"
	keyFile := "/etc/letsencrypt/live/functionserver.com/privkey.pem"

	_, certErr := os.Stat(certFile)
	_, keyErr := os.Stat(keyFile)

	if certErr == nil && keyErr == nil {
		// SSL certificates found - run HTTPS on 443 and HTTP redirect on 80
		fmt.Printf("\n  %s %s running at https://functionserver.com\n\n", config.OSIcon, config.OSName)

		// HTTP redirect server
		go func() {
			redirect := http.NewServeMux()
			redirect.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
				target := "https://" + r.Host + r.URL.Path
				if r.URL.RawQuery != "" {
					target += "?" + r.URL.RawQuery
				}
				http.Redirect(w, r, target, http.StatusMovedPermanently)
			})
			http.ListenAndServe(":80", redirect)
		}()

		// HTTPS server
		http.ListenAndServeTLS(":443", certFile, keyFile, mux)
	} else {
		// No SSL - run HTTP only
		fmt.Printf("\n  %s %s running at http://localhost:%s\n\n", config.OSIcon, config.OSName, config.Port)
		http.ListenAndServe(":"+config.Port, mux)
	}
}
