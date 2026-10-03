// Package ws exposes frozen capabilities over WebSocket JSON-RPC.
package ws

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"net"
	"net/http"
	"strconv"
	"strings"

	"github.com/coder/websocket"
	"github.com/kisstar/x-tools/go/contracts"
	"github.com/kisstar/x-tools/go/kernel/registry"
)

type Invoker interface {
	Invoke(context.Context, contracts.Principal, contracts.CapabilityID, []byte) ([]byte, *contracts.Error)
}

type Config struct {
	Port    int
	Token   string
	Origins []string
	// ExpectedHost is only for an in-memory test server whose listener port differs from Port.
	ExpectedHost string
}

type server struct {
	config  Config
	methods map[string]contracts.CapabilityID
	invoker Invoker
}

func New(config Config, snapshot registry.Snapshot, invoker Invoker) http.Handler {
	methods := make(map[string]contracts.CapabilityID)
	for _, id := range snapshot.IDs() {
		methods[id.String()] = id
	}
	return &server{config: config, methods: methods, invoker: invoker}
}

func (server *server) ServeHTTP(writer http.ResponseWriter, request *http.Request) {
	server.handle(writer, request)
}

type request struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params"`
}

type response struct {
	JSONRPC string           `json:"jsonrpc"`
	ID      json.RawMessage  `json:"id"`
	Result  json.RawMessage  `json:"result,omitempty"`
	Error   *contracts.Error `json:"error,omitempty"`
}

func (server *server) handle(writer http.ResponseWriter, requestValue *http.Request) {
	token, status := server.admit(requestValue)
	if status != 0 {
		http.Error(writer, http.StatusText(status), status)
		return
	}
	connection, err := websocket.Accept(
		writer,
		requestValue,
		&websocket.AcceptOptions{OriginPatterns: server.originPatterns(), Subprotocols: []string{"xtools"}},
	)
	if err != nil {
		return
	}
	defer func() { _ = connection.CloseNow() }()
	if token == "" {
		return
	}
	principal := contracts.Principal{Kind: contracts.PrincipalWebSession, ID: sessionID()}
	for {
		_, data, err := connection.Read(requestValue.Context())
		if err != nil {
			return
		}
		rpcResponse := server.invoke(requestValue.Context(), principal, data)
		output, err := json.Marshal(rpcResponse)
		if err != nil {
			return
		}
		if err := connection.Write(requestValue.Context(), websocket.MessageText, output); err != nil {
			return
		}
	}
}

func (server *server) invoke(ctx context.Context, principal contracts.Principal, data []byte) response {
	var value request
	if err := json.Unmarshal(data, &value); err != nil || value.JSONRPC != "2.0" || len(value.ID) == 0 {
		return response{
			JSONRPC: "2.0",
			ID:      value.ID,
			Error:   contracts.NewError(contracts.CodeInvalidArgument, "invalid JSON-RPC request", sessionID(), nil),
		}
	}
	id, exposed := server.methods[value.Method]
	if !exposed {
		return response{
			JSONRPC: "2.0",
			ID:      value.ID,
			Error:   contracts.NewError(contracts.CodeNotFound, "capability not found", sessionID(), nil),
		}
	}
	params := value.Params
	if len(params) == 0 {
		params = json.RawMessage(`{}`)
	}
	result, invokeErr := server.invoker.Invoke(ctx, principal, id, params)
	return response{JSONRPC: "2.0", ID: value.ID, Result: result, Error: invokeErr}
}

func (server *server) admit(request *http.Request) (string, int) {
	hostValue := request.Host
	if server.config.ExpectedHost != "" {
		hostValue = server.config.ExpectedHost
	}
	host, port, err := net.SplitHostPort(hostValue)
	if err != nil || !allowedHost(host) || port != strconv.Itoa(server.config.Port) {
		return "", http.StatusForbidden
	}
	if !server.allowedOrigin(request.Header.Get("Origin")) {
		return "", http.StatusForbidden
	}
	token := websocketToken(strings.Split(request.Header.Get("Sec-WebSocket-Protocol"), ","))
	if token == "" || subtle.ConstantTimeCompare([]byte(token), []byte(server.config.Token)) != 1 {
		return "", http.StatusUnauthorized
	}
	return token, 0
}

func allowedHost(host string) bool {
	return host == "127.0.0.1" || host == "localhost" || host == "::1"
}

func (server *server) allowedOrigin(origin string) bool {
	for _, allowed := range server.config.Origins {
		if origin == allowed {
			return true
		}
	}
	return false
}

func (server *server) originPatterns() []string {
	values := make([]string, 0, len(server.config.Origins))
	for _, origin := range server.config.Origins {
		values = append(values, strings.TrimPrefix(strings.TrimPrefix(origin, "http://"), "https://"))
	}
	return values
}

func websocketToken(protocols []string) string {
	for _, protocol := range protocols {
		protocol = strings.TrimSpace(protocol)
		if strings.HasPrefix(protocol, "xtools-token.") {
			return strings.TrimPrefix(protocol, "xtools-token.")
		}
	}
	return ""
}

func sessionID() string {
	var value [8]byte
	if _, err := rand.Read(value[:]); err != nil {
		return "session-unavailable"
	}
	return hex.EncodeToString(value[:])
}
