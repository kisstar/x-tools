package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"
)

func main() {
	port := flag.Int("port", 10312, "loopback HTTP port")
	assetsDirectory := flag.String("assets", "apps/web/dist", "built Web assets directory")
	configDirectory, err := os.UserConfigDir()
	if err != nil {
		log.Fatal(err)
	}
	tokenFile := flag.String(
		"token-file",
		filepath.Join(configDirectory, "xtools", "session-token"),
		"private session token file",
	)
	preferencesFile := flag.String(
		"preferences-file",
		filepath.Join(configDirectory, "xtools", "preferences.json"),
		"user workbench preferences file",
	)
	flag.Parse()
	token, err := newSessionToken()
	if err != nil {
		log.Fatal(err)
	}
	if err := writeSessionToken(*tokenFile, token); err != nil {
		log.Fatal(err)
	}
	defer func() { _ = os.Remove(*tokenFile) }()
	assets := os.DirFS(*assetsDirectory)
	origin := fmt.Sprintf("http://localhost:%d", *port)
	host, err := compose(
		hostConfig{
			Assets:          assets,
			Token:           token,
			Port:            *port,
			Origins:         []string{origin, fmt.Sprintf("http://127.0.0.1:%d", *port)},
			PreferencesPath: *preferencesFile,
			RequiredModules: []string{preferencesModuleID},
		},
	)
	if err != nil {
		log.Fatal(err)
	}
	server := &http.Server{Addr: fmt.Sprintf("127.0.0.1:%d", *port), Handler: host}
	log.Printf("xTools listening on %s", server.Addr)
	serverErrors := make(chan error, 1)
	go func() { serverErrors <- server.ListenAndServe() }()
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGINT, syscall.SIGTERM)
	defer signal.Stop(signals)
	select {
	case err := <-serverErrors:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatal(err)
		}
	case <-signals:
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		log.Printf("HTTP shutdown: %v", err)
	}
	if err := host.Stop(ctx); err != nil {
		log.Printf("host shutdown: %v", err)
	}
}
