package main

import (
	"io/fs"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"testing/fstest"
)

func TestComposeRejectsMissingRequiredModuleBeforeServing(t *testing.T) {
	_, err := compose(hostConfig{Assets: testAssets(), Token: "token", RequiredModules: []string{"missing.module"}})
	if err == nil {
		t.Fatal("compose accepted missing required module")
	}
}

func TestComposeFreezesPreferencesMethodsBeforeReadiness(t *testing.T) {
	host, err := compose(hostConfig{Assets: testAssets(), Token: "token", PreferencesPath: filepath.Join(t.TempDir(), "preferences.json"), RequiredModules: []string{"workbench.preferences"}})
	if err != nil {
		t.Fatal(err)
	}
	recorder := httptest.NewRecorder()
	host.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/health/ready", nil))
	if recorder.Code != http.StatusOK {
		t.Fatalf("ready status = %d", recorder.Code)
	}
}

func TestComposeLoadsPreferencesFromInjectedUserConfigurationPath(t *testing.T) {
	filename := filepath.Join(t.TempDir(), "preferences.json")
	first, err := compose(hostConfig{Assets: testAssets(), Token: "token", PreferencesPath: filename, RequiredModules: []string{preferencesModuleID}})
	if err != nil {
		t.Fatal(err)
	}
	if err := first.Stop(t.Context()); err != nil {
		t.Fatal(err)
	}
	if _, err := compose(hostConfig{Assets: testAssets(), Token: "token", PreferencesPath: filename, RequiredModules: []string{preferencesModuleID}}); err != nil {
		t.Fatalf("restart compose failed: %v", err)
	}
}

func TestWriteSessionTokenUsesPrivatePermissionsAndReplacesOldValue(t *testing.T) {
	filename := filepath.Join(t.TempDir(), "session-token")
	if err := writeSessionToken(filename, "first"); err != nil {
		t.Fatal(err)
	}
	if err := writeSessionToken(filename, "second"); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filename)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "second" {
		t.Fatalf("token = %q", data)
	}
	info, err := os.Stat(filename)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("permissions = %o", info.Mode().Perm())
	}
}

func testAssets() fs.FS {
	return fstest.MapFS{"index.html": &fstest.MapFile{Data: []byte(`<html><head><!-- XTOOLS_RUNTIME --></head></html>`)}}
}
