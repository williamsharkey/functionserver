// Function Server - Go Backend
// Multi-tenant web-based operating system
//
// Run: go run main.go
// Build: go build -o functionserver main.go

package main

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"time"

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
}

// Token payload
type TokenPayload struct {
	Username string `json:"username"`
	Exp      int64  `json:"exp"`
	Rand     string `json:"rand"`
}

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

	// Serve system apps list
	mux.HandleFunc("/api/system-apps", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Content-Type", "application/json")

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
		for _, f := range files {
			if f.IsDir() || !strings.HasSuffix(f.Name(), ".js") {
				continue
			}

			content, err := os.ReadFile(appsDir + "/" + f.Name())
			if err != nil {
				continue
			}

			code := string(content)
			id := strings.TrimSuffix(f.Name(), ".js")

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

		json.NewEncoder(w).Encode(map[string]interface{}{"apps": apps})
	})

	// Serve install script (proxy from GitHub)
	mux.HandleFunc("/install", func(w http.ResponseWriter, r *http.Request) {
		resp, err := http.Get("https://raw.githubusercontent.com/williamsharkey/functionserver/go-only/install/install.sh")
		if err != nil {
			http.Error(w, "Failed to fetch install script", 500)
			return
		}
		defer resp.Body.Close()
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		io.Copy(w, resp.Body)
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
