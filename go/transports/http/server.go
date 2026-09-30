// Package http serves the Web application and process health endpoints.
package httptransport

import (
	"bytes"
	"html"
	"io/fs"
	"net"
	"net/http"
	"path"
	"strconv"
)

const runtimeMarker = "<!-- XTOOLS_RUNTIME -->"

type Config struct {
	Assets fs.FS
	Token  string
	Ready  func() bool
	Port   int
}

type server struct {
	config Config
	files  http.Handler
}

func New(config Config) http.Handler {
	value := &server{config: config, files: http.FileServer(http.FS(config.Assets))}
	mux := http.NewServeMux()
	mux.HandleFunc("/health/live", value.live)
	mux.HandleFunc("/health/ready", value.ready)
	mux.HandleFunc("/", value.static)
	return mux
}

func (server *server) live(writer http.ResponseWriter, _ *http.Request) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(http.StatusOK)
	_, _ = writer.Write([]byte(`{"status":"alive"}`))
}

func (server *server) ready(writer http.ResponseWriter, _ *http.Request) {
	writer.Header().Set("Content-Type", "application/json")
	if server.config.Ready == nil || !server.config.Ready() {
		writer.WriteHeader(http.StatusServiceUnavailable)
		_, _ = writer.Write([]byte(`{"status":"not_ready"}`))
		return
	}
	writer.WriteHeader(http.StatusOK)
	_, _ = writer.Write([]byte(`{"status":"ready"}`))
}

func (server *server) static(writer http.ResponseWriter, request *http.Request) {
	if !server.allowedHost(request.Host) {
		http.Error(writer, http.StatusText(http.StatusForbidden), http.StatusForbidden)
		return
	}
	name := path.Clean(request.URL.Path)[1:]
	if name != "" {
		if info, err := fs.Stat(server.config.Assets, name); err == nil && !info.IsDir() {
			server.securityHeaders(writer)
			server.files.ServeHTTP(writer, request)
			return
		}
	}
	server.index(writer)
}

func (server *server) allowedHost(value string) bool {
	host, port, err := net.SplitHostPort(value)
	if err != nil {
		return server.config.Port == 0 && value == "example.com"
	}
	return (host == "127.0.0.1" || host == "localhost" || host == "::1") && (server.config.Port == 0 || port == strconv.Itoa(server.config.Port))
}

func (server *server) index(writer http.ResponseWriter) {
	data, err := fs.ReadFile(server.config.Assets, "index.html")
	if err != nil {
		http.Error(writer, "Web assets unavailable", http.StatusServiceUnavailable)
		return
	}
	meta := []byte(`<meta name="xtools-session-token" content="` + html.EscapeString(server.config.Token) + `">`)
	data = bytes.Replace(data, []byte(runtimeMarker), meta, 1)
	server.securityHeaders(writer)
	writer.Header().Set("Cache-Control", "no-store")
	writer.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = writer.Write(data)
}

func (server *server) securityHeaders(writer http.ResponseWriter) {
	writer.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' ws:; object-src 'none'; base-uri 'none'")
	writer.Header().Set("Referrer-Policy", "no-referrer")
	writer.Header().Set("X-Content-Type-Options", "nosniff")
}
