package main

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"

	"github.com/kisstar/x-tools/go/kernel/invoke"
	"github.com/kisstar/x-tools/go/kernel/lifecycle"
	"github.com/kisstar/x-tools/go/kernel/registry"
	"github.com/kisstar/x-tools/go/modules/preferences"
	httptransport "github.com/kisstar/x-tools/go/transports/http"
	wstransport "github.com/kisstar/x-tools/go/transports/ws"
)

const preferencesModuleID = "workbench.preferences"

type hostConfig struct {
	Assets          fs.FS
	Token           string
	Port            int
	Origins         []string
	RequiredModules []string
	PreferencesPath string
}

type composedHost struct {
	http.Handler
	lifecycle *lifecycle.Manager
}

func (host *composedHost) Stop(ctx context.Context) error { return host.lifecycle.Stop(ctx) }

type preferencesLifecycle struct {
	module   *preferences.Module
	registry *registry.Registry
}

func (module preferencesLifecycle) Manifest() lifecycle.Manifest {
	return lifecycle.Manifest{ID: preferencesModuleID}
}
func (module preferencesLifecycle) Activate(lifecycle.ActivationContext) error {
	return module.module.Register(module.registry)
}
func (preferencesLifecycle) Deactivate(context.Context) error { return nil }

func compose(config hostConfig) (*composedHost, error) {
	capabilities := registry.New()
	manager := lifecycle.New([]lifecycle.Module{preferencesLifecycle{module: preferences.New(config.PreferencesPath), registry: capabilities}})
	if err := manager.Activate(context.Background(), config.RequiredModules, lifecycle.ActivationContext{}); err != nil {
		return nil, fmt.Errorf("activate host: %w", err)
	}
	snapshot := capabilities.Freeze()
	invoker := invoke.New(snapshot)
	staticHandler := httptransport.New(httptransport.Config{Assets: config.Assets, Token: config.Token, Port: config.Port, Ready: func() bool { return manager.State() == lifecycle.Serving }})
	wsHandler := wstransport.New(wstransport.Config{Port: config.Port, Token: config.Token, Origins: config.Origins}, snapshot, invoker)
	mux := http.NewServeMux()
	mux.Handle("/ws", wsHandler)
	mux.Handle("/", staticHandler)
	if err := manager.StartServing(); err != nil {
		_ = manager.Stop(context.Background())
		return nil, err
	}
	return &composedHost{Handler: mux, lifecycle: manager}, nil
}

func newSessionToken() (string, error) {
	value := make([]byte, 32)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(value), nil
}

func writeSessionToken(filename, token string) error {
	directory := filepath.Dir(filename)
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return err
	}
	temporary, err := os.CreateTemp(directory, ".session-token-*")
	if err != nil {
		return err
	}
	temporaryName := temporary.Name()
	defer os.Remove(temporaryName)
	if err := temporary.Chmod(0o600); err != nil {
		temporary.Close()
		return err
	}
	if _, err := temporary.WriteString(token); err != nil {
		temporary.Close()
		return err
	}
	if err := temporary.Close(); err != nil {
		return err
	}
	return os.Rename(temporaryName, filename)
}
