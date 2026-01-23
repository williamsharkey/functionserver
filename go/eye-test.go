// +build ignore

package main

import (
	"crypto/tls"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
)

func main() {
	// Token for root user
	token := "eyJ1c2VybmFtZSI6ICJyb290IiwgImV4cCI6IDE3Njk4MDMyMjEsICJyYW5kIjogIjkwYzhhMmZkY2RhYTA0ZjUzYjFhMzQzNmI2NWU0Yjk5In0=.12267b97b508c5cf8631788ed29d924d37e103180512d9989f3380de484f0d39"

	// Connect to eye bridge (use wss for HTTPS server)
	url := "wss://localhost/api/eye?token=" + token
	fmt.Printf("Connecting to %s\n", url)

	// Skip TLS verification for localhost
	dialer := websocket.Dialer{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
	}
	conn, _, err := dialer.Dial(url, http.Header{})
	if err != nil {
		log.Fatal("dial:", err)
	}
	defer conn.Close()

	// Wait for ready message
	_, msg, err := conn.ReadMessage()
	if err != nil {
		log.Fatal("read ready:", err)
	}
	fmt.Printf("Server: %s\n", string(msg))

	// Test 1: Fire and forget (no response expected)
	fmt.Println("\n--- Test 1: Fire and forget ---")
	start := time.Now()
	err = conn.WriteMessage(websocket.TextMessage, []byte("console.log('eye test')"))
	if err != nil {
		log.Fatal("write:", err)
	}
	fmt.Printf("Fire sent in %v\n", time.Since(start))

	// Test 2: Request with ID
	fmt.Println("\n--- Test 2: Request with ID ---")
	start = time.Now()
	err = conn.WriteMessage(websocket.TextMessage, []byte("a:document.title"))
	if err != nil {
		log.Fatal("write:", err)
	}

	// Read response
	_, msg, err = conn.ReadMessage()
	if err != nil {
		log.Fatal("read:", err)
	}
	elapsed := time.Since(start)
	fmt.Printf("Response: %s (in %v)\n", string(msg), elapsed)

	// Test 3: Multiple pipelined requests
	fmt.Println("\n--- Test 3: Pipelined requests ---")
	start = time.Now()

	// Send 10 requests rapidly
	for i := 0; i < 10; i++ {
		id := fmt.Sprintf("%d", i)
		msg := fmt.Sprintf("%s:1+%d", id, i)
		conn.WriteMessage(websocket.TextMessage, []byte(msg))
	}
	fmt.Printf("10 requests sent in %v\n", time.Since(start))

	// Read 10 responses
	for i := 0; i < 10; i++ {
		_, msg, err = conn.ReadMessage()
		if err != nil {
			log.Fatal("read pipeline:", err)
		}
		fmt.Printf("  %s\n", string(msg))
	}
	fmt.Printf("All 10 responses received in %v total\n", time.Since(start))

	// Test 4: Compare with old MCP method
	fmt.Println("\n--- Test 4: Old MCP HTTP method ---")
	// (We'd need to implement this separately)

	fmt.Println("\nDone!")
}
