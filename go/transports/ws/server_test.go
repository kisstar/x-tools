package ws_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/kisstar/x-tools/go/contracts"
	"github.com/kisstar/x-tools/go/kernel/invoke"
	"github.com/kisstar/x-tools/go/kernel/registry"
	wstransport "github.com/kisstar/x-tools/go/transports/ws"
)

const token = "test-session-token"

func TestAdmissionRejectsInvalidHostOriginAndTokenIndependently(t *testing.T) {
	cases := []struct{ name, host, origin, protocol string }{
		{"host", "evil.example", "http://localhost:10312", "xtools-token." + token},
		{"origin", "127.0.0.1:10312", "https://evil.example", "xtools-token." + token},
		{"token", "127.0.0.1:10312", "http://localhost:10312", "xtools-token.wrong"},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			config := wstransport.Config{Port: 10312, Token: token, Origins: []string{"http://localhost:10312"}}
			if test.name != "host" {
				config.ExpectedHost = "127.0.0.1:10312"
			}
			server := newServerWithConfig(t, config)
			request, err := http.NewRequestWithContext(t.Context(), http.MethodGet, server.URL+"/ws", nil)
			if err != nil {
				t.Fatal(err)
			}
			request.Host = test.host
			request.Header.Set("Origin", test.origin)
			request.Header.Set("Sec-WebSocket-Protocol", "xtools, "+test.protocol)
			response, err := http.DefaultClient.Do(request)
			if err != nil {
				t.Fatal(err)
			}
			defer func() { _ = response.Body.Close() }()
			if response.StatusCode != http.StatusForbidden && response.StatusCode != http.StatusUnauthorized {
				t.Fatalf("status = %d", response.StatusCode)
			}
		})
	}
}

func TestValidBrowserConnectionInvokesFrozenMethodAndIgnoresPayloadPrincipal(t *testing.T) {
	server := newServer(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	connection, response, err := websocket.Dial(ctx, server.URL+"/ws", &websocket.DialOptions{
		HTTPHeader:   http.Header{"Origin": []string{"http://localhost:10312"}},
		Subprotocols: []string{"xtools", "xtools-token." + token},
	})
	if response != nil && response.Body != nil {
		defer func() { _ = response.Body.Close() }()
	}
	if err != nil {
		if response != nil {
			t.Fatalf("dial: %v (status %d)", err, response.StatusCode)
		}
		t.Fatal(err)
	}
	defer func() { _ = connection.CloseNow() }()
	request := map[string]any{
		"jsonrpc": "2.0",
		"id":      1,
		"method":  "test.identity@1",
		"params":  map[string]any{"principal": map[string]string{"kind": "module", "id": "forged"}},
	}
	if err := wsjsonWrite(ctx, connection, request); err != nil {
		t.Fatal(err)
	}
	var result struct {
		JSONRPC string                    `json:"jsonrpc"`
		ID      int                       `json:"id"`
		Result  struct{ Kind, ID string } `json:"result"`
	}
	if err := wsjsonRead(ctx, connection, &result); err != nil {
		t.Fatal(err)
	}
	if result.Result.Kind != string(contracts.PrincipalWebSession) || result.Result.ID == "forged" {
		t.Fatalf("principal = %#v", result.Result)
	}
}

func TestUnknownMethodReturnsStableError(t *testing.T) {
	server := newServer(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	connection, dialResponse, err := websocket.Dial(
		ctx,
		server.URL+"/ws",
		&websocket.DialOptions{
			HTTPHeader:   http.Header{"Origin": []string{"http://localhost:10312"}},
			Subprotocols: []string{"xtools", "xtools-token." + token},
		},
	)
	if dialResponse != nil && dialResponse.Body != nil {
		defer func() { _ = dialResponse.Body.Close() }()
	}
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = connection.CloseNow() }()
	if err := wsjsonWrite(
		ctx,
		connection,
		map[string]any{"jsonrpc": "2.0", "id": 2, "method": "missing.run@1", "params": map[string]any{}},
	); err != nil {
		t.Fatal(err)
	}
	var response struct {
		Error contracts.Error `json:"error"`
	}
	if err := wsjsonRead(ctx, connection, &response); err != nil {
		t.Fatal(err)
	}
	if response.Error.Code != contracts.CodeNotFound || response.Error.TraceID == "" {
		t.Fatalf("error = %#v", response.Error)
	}
}

func TestAcceptsTokenProtocolAndNegotiatesXToolsSubprotocol(t *testing.T) {
	server := newServer(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	connection, response, err := websocket.Dial(
		ctx,
		server.URL+"/ws",
		&websocket.DialOptions{
			HTTPHeader:   http.Header{"Origin": []string{"http://localhost:10312"}},
			Subprotocols: []string{"xtools", "xtools-token." + token},
		},
	)
	if response != nil && response.Body != nil {
		defer func() { _ = response.Body.Close() }()
	}
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = connection.CloseNow() }()
	if got := connection.Subprotocol(); got != "xtools" {
		t.Fatalf("subprotocol = %q", got)
	}
}

func newServer(t *testing.T) *httptest.Server {
	t.Helper()
	return newServerWithConfig(
		t,
		wstransport.Config{
			Port:         10312,
			Token:        token,
			Origins:      []string{"http://localhost:10312"},
			ExpectedHost: "127.0.0.1:10312",
		},
	)
}

func newServerWithConfig(t *testing.T, config wstransport.Config) *httptest.Server {
	t.Helper()
	registryValue := registry.New()
	schema := contracts.JSONSchema{Type: "object", AdditionalProperties: contracts.AdditionalProperties{Allowed: true}}
	contract := contracts.CapabilityContract{
		ID:                   "test.identity@1",
		Kind:                 contracts.Query,
		Idempotent:           true,
		SupportsCancellation: true,
		DefaultDeadline:      time.Second,
		MaxInputBytes:        1024,
		MaxOutputBytes:       1024,
		MaxConcurrent:        4,
		InputSchema:          schema,
		OutputSchema:         schema,
		Permissions:          []contracts.Permission{"test.identity"},
		Exposure:             []contracts.Exposure{contracts.ExposureWebSocket},
		Availability:         contracts.Availability{Available: true},
	}
	err := registryValue.Register(
		registry.Capability{Contract: contract, Handler: func(_ context.Context, _ []byte) ([]byte, *contracts.Error) {
			t.Fatal("transport must pass principal through Invoker context-aware facade")
			return nil, nil
		}},
	)
	if err != nil {
		t.Fatal(err)
	}
	snapshot := registryValue.Freeze()
	invoker := &capturingInvoker{delegate: invoke.New(snapshot)}
	handler := wstransport.New(config, snapshot, invoker)
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	return server
}

type capturingInvoker struct{ delegate *invoke.Invoker }

func (invoker *capturingInvoker) Invoke(
	_ context.Context,
	principal contracts.Principal,
	id contracts.CapabilityID,
	_ []byte,
) ([]byte, *contracts.Error) {
	if id != "test.identity@1" {
		return invoker.delegate.Invoke(context.Background(), principal, id, []byte(`{}`))
	}
	data, err := json.Marshal(map[string]string{"Kind": string(principal.Kind), "ID": principal.ID})
	if err != nil {
		return nil, contracts.NewError(contracts.CodeInternal, "encode failed", "", nil)
	}
	return data, nil
}

func wsjsonWrite(ctx context.Context, connection *websocket.Conn, value any) error {
	data, err := json.Marshal(value)
	if err != nil {
		return err
	}
	return connection.Write(ctx, websocket.MessageText, data)
}

func wsjsonRead(ctx context.Context, connection *websocket.Conn, value any) error {
	_, data, err := connection.Read(ctx)
	if err != nil {
		return err
	}
	return json.Unmarshal(data, value)
}
