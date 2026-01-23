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
	if len(os.Args) > 1 && (os.Args[1] == "-h" || os.Args[1] == "--help") {
		fmt.Println(`eye - Fast browser JS VM bridge

USAGE:
  eye [expression]    Execute JS (use id: prefix for response)
  eye                 Interactive REPL mode

EXAMPLES:
  eye 'a:document.title'
  eye 'a:ALGO.bridge.getState()'`)
		return
	}

	token, server := loadConfig()
	if token == "" {
		fmt.Fprintln(os.Stderr, "No token. Set EYE_TOKEN or create ~/.algo/config.json")
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
	if err != nil || string(msg) != ":ready" {
		fmt.Fprintf(os.Stderr, "Handshake failed\n")
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
			if colonIdx := strings.Index(result, ":"); colonIdx > 0 {
				prefix := result[:colonIdx]
				result = result[colonIdx+1:]
				if strings.HasSuffix(prefix, "!") {
					fmt.Fprintf(os.Stderr, "Error: %s\n", result)
					os.Exit(1)
				}
			}
			fmt.Println(result)
		}
		return
	}

	// REPL mode
	fmt.Println("eye connected (Ctrl+D to exit)")
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
		if line != "" {
			conn.WriteMessage(websocket.TextMessage, []byte(line))
		}
		fmt.Print("> ")
	}
}

func loadConfig() (token, server string) {
	token = os.Getenv("EYE_TOKEN")
	server = os.Getenv("EYE_SERVER")

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
	return
}

func connectWebSocket(token, server string) (*websocket.Conn, error) {
	url := server + "?token=" + token
	dialer := websocket.Dialer{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}}
	conn, _, err := dialer.Dial(url, http.Header{})
	return conn, err
}

func hasIDPrefix(expr string) bool {
	colonIdx := strings.Index(expr, ":")
	if colonIdx <= 0 || colonIdx >= 20 {
		return false
	}
	for _, c := range expr[:colonIdx] {
		if !((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_') {
			return false
		}
	}
	return true
}
