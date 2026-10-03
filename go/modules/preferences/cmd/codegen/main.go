package main

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/kisstar/x-tools/go/modules/preferences"
)

func main() {
	root, err := repositoryRoot()
	if err != nil {
		fail(err)
	}
	if err := preferences.WriteContracts(root); err != nil {
		fail(err)
	}
}

func repositoryRoot() (string, error) {
	directory, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for {
		if _, err := os.Stat(filepath.Join(directory, "go.work")); err == nil {
			return directory, nil
		}
		parent := filepath.Dir(directory)
		if parent == directory {
			return "", fmt.Errorf("repository root not found")
		}
		directory = parent
	}
}
func fail(err error) { fmt.Fprintln(os.Stderr, err); os.Exit(1) }
