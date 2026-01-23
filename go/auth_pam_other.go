//go:build !linux

package main

import "fmt"

// pamAuthenticate is a stub for non-Linux systems
func pamAuthenticate(username, password string) error {
	return fmt.Errorf("PAM authentication not available on this platform")
}
