package httptransport_test

import (
	"io"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"

	httptransport "github.com/kisstar/x-tools/go/transports/http"
)

func TestHealthDistinguishesLivenessAndReadiness(t *testing.T) {
	ready := false
	handler := httptransport.New(httptransport.Config{Assets: assets(), Token: "secret-token", Ready: func() bool { return ready }})
	assertStatus(t, handler, "/health/live", http.StatusOK)
	assertStatus(t, handler, "/health/ready", http.StatusServiceUnavailable)
	ready = true
	assertStatus(t, handler, "/health/ready", http.StatusOK)
}

func TestIndexInjectsEscapedSessionTokenAndLocksResourcesToSelf(t *testing.T) {
	handler := httptransport.New(httptransport.Config{Assets: assets(), Token: `token"<&`, Ready: func() bool { return true }})
	response := serve(handler, "/")
	body, _ := io.ReadAll(response.Result().Body)
	text := string(body)
	if !strings.Contains(text, `<meta name="xtools-session-token" content="token&#34;&lt;&amp;">`) {
		t.Fatalf("token meta missing or unescaped: %s", text)
	}
	if csp := response.Header().Get("Content-Security-Policy"); !strings.Contains(csp, "default-src 'self'") || !strings.Contains(csp, "connect-src 'self' ws:") {
		t.Fatalf("CSP = %q", csp)
	}
	if response.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("Cache-Control = %q", response.Header().Get("Cache-Control"))
	}
}

func TestIndexRejectsUntrustedHostBeforeDisclosingToken(t *testing.T) {
	handler := httptransport.New(httptransport.Config{Assets: assets(), Token: "secret-token", Port: 10312, Ready: func() bool { return true }})
	request := httptest.NewRequest(http.MethodGet, "http://evil.example/", nil)
	request.Host = "evil.example"
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusForbidden {
		t.Fatalf("status = %d", recorder.Code)
	}
	if strings.Contains(recorder.Body.String(), "secret-token") {
		t.Fatal("response disclosed token")
	}
}

func TestStaticAssetsServeAndUnknownRoutesFallBackToIndex(t *testing.T) {
	handler := httptransport.New(httptransport.Config{Assets: assets(), Token: "token", Ready: func() bool { return true }})
	response := serve(handler, "/assets/app.js")
	data, _ := io.ReadAll(response.Result().Body)
	if string(data) != "console.log('ok')" {
		t.Fatalf("asset = %q", data)
	}
	response = serve(handler, "/home/default")
	data, _ = io.ReadAll(response.Result().Body)
	if !strings.Contains(string(data), "<main>workbench</main>") {
		t.Fatalf("fallback = %q", data)
	}
}

func assets() fs.FS {
	return fstest.MapFS{"index.html": &fstest.MapFile{Data: []byte(`<html><head><!-- XTOOLS_RUNTIME --></head><body><main>workbench</main></body></html>`)}, "assets/app.js": &fstest.MapFile{Data: []byte(`console.log('ok')`)}}
}
func serve(handler http.Handler, target string) *httptest.ResponseRecorder {
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, target, nil))
	return recorder
}
func assertStatus(t *testing.T, handler http.Handler, target string, want int) {
	t.Helper()
	response := serve(handler, target)
	if response.Code != want {
		t.Fatalf("%s status = %d, want %d", target, response.Code, want)
	}
}
