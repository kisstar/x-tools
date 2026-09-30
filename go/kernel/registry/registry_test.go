package registry_test

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/kisstar/x-tools/go/contracts"
	"github.com/kisstar/x-tools/go/kernel/registry"
)

func TestRegistryRejectsDuplicatesAndRegistrationAfterFreeze(t *testing.T) {
	r := registry.New()
	capability := completeCapability()
	if err := r.Register(capability); err != nil {
		t.Fatalf("first Register returned error: %v", err)
	}
	if err := r.Register(capability); err == nil {
		t.Fatal("duplicate Register succeeded")
	}
	snapshot := r.Freeze()
	if got := snapshot.IDs(); len(got) != 1 || got[0] != testContract().ID {
		t.Fatalf("IDs() = %v", got)
	}
	if err := r.Register(completeCapability()); err == nil {
		t.Fatal("Register after Freeze succeeded")
	}
}

func testContract() contracts.CapabilityContract {
	schema := contracts.JSONSchema{Type: "object", AdditionalProperties: contracts.AdditionalProperties{Allowed: false}}
	return contracts.CapabilityContract{ID: "workbench.preferences.get@1", Kind: contracts.Query, Idempotent: true, SupportsCancellation: true, DefaultDeadline: 1000000000, MaxInputBytes: 1024, MaxOutputBytes: 4096, MaxConcurrent: 4, InputSchema: schema, OutputSchema: schema, Permissions: []contracts.Permission{"workbench.preferences.read"}, Exposure: []contracts.Exposure{contracts.ExposureWebSocket}, Availability: contracts.Availability{Available: true}}
}
func completeCapability() registry.Capability {
	return registry.Capability{Contract: testContract(), ValidateInput: func([]byte) *contracts.Error { return nil }, Authorize: func(context.Context, contracts.Principal, json.RawMessage) *contracts.Error { return nil }, Available: func(context.Context) contracts.Availability { return contracts.Availability{Available: true} }, Handler: func(context.Context, []byte) ([]byte, *contracts.Error) { return []byte(`{}`), nil }, ValidateOutput: func([]byte) *contracts.Error { return nil }}
}
