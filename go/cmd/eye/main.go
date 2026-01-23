package main

import (
	"bufio"
	"crypto/tls"
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/gorilla/websocket"
)

func main() {
	// Get token from env or file
	token := os.Getenv("EYE_TOKEN")
	if token == "" {
		data, err := os.ReadFile(os.ExpandEnv("$HOME/.algo/token"))
		if err == nil {
			token = strings.TrimSpace(string(data))
		}
	}

	if token == "" {
		fmt.Fprintln(os.Stderr, "No token found. Set EYE_TOKEN or create ~/.algo/token")
		os.Exit(1)
	}

	// Get server URL
	server := os.Getenv("EYE_SERVER")
	if server == "" {
		server = "wss://localhost/api/eye"
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
			fmt.Println(string(msg))
		}
		return
	}

	// Interactive REPL mode
	fmt.Println("eye bridge connected (Ctrl+D to exit)")
	fmt.Println("  expression      -> fire & forget")
	fmt.Println("  id:expression   -> get response")
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
		conn.WriteMessage(websocket.TextMessage, []byte(line))
		fmt.Print("> ")
	}
	fmt.Println()
}
