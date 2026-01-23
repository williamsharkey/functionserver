//go:build linux

package main

import (
	"fmt"

	"github.com/msteinert/pam"
)

// pamAuthenticate uses PAM to verify system user credentials on Linux
func pamAuthenticate(username, password string) error {
	// Use "su" service for authentication
	t, err := pam.StartFunc("su", username, func(s pam.Style, msg string) (string, error) {
		switch s {
		case pam.PromptEchoOff:
			return password, nil
		case pam.PromptEchoOn:
			return username, nil
		case pam.ErrorMsg:
			return "", nil
		case pam.TextInfo:
			return "", nil
		}
		return "", fmt.Errorf("unrecognized PAM style: %v", s)
	})
	if err != nil {
		return err
	}

	if err := t.Authenticate(0); err != nil {
		return err
	}

	return t.AcctMgmt(0)
}
