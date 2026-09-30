package contracts_test

import (
	"testing"
	"time"

	"github.com/kisstar/x-tools/go/contracts"
)

func TestCapabilityIDNormalizesImplicitMajor(t *testing.T) {
	id, err := contracts.ParseCapabilityID("workbench.preferences.get")
	if err != nil {
		t.Fatalf("ParseCapabilityID returned error: %v", err)
	}
	if got, want := id.String(), "workbench.preferences.get@1"; got != want {
		t.Fatalf("String() = %q, want %q", got, want)
	}
}

func TestCapabilityIDRejectsInvalidValue(t *testing.T) {
	if _, err := contracts.ParseCapabilityID("Workbench/Get@1"); err == nil {
		t.Fatal("ParseCapabilityID accepted invalid value")
	}
}

func TestCapabilityContractRequiresBoundedInvocationMetadata(t *testing.T) {
	contract := contracts.CapabilityContract{
		ID:                   "workbench.preferences.get@1",
		Kind:                 contracts.Query,
		Idempotent:           true,
		SupportsCancellation: true,
		DefaultDeadline:      time.Second,
		MaxInputBytes:        1024,
		MaxOutputBytes:       4096,
		MaxConcurrent:        4,
		InputSchema:          objectSchema(),
		OutputSchema:         objectSchema(),
		Permissions:          []contracts.Permission{"workbench.preferences.read"},
		Exposure:             []contracts.Exposure{contracts.ExposureWebSocket},
		Availability:         contracts.Availability{Available: true},
	}
	if err := contract.Validate(); err != nil {
		t.Fatalf("Validate returned error: %v", err)
	}
}

func TestJSONSchemaValidatesNestedObjectsArraysAndUnknownFields(t *testing.T) {
	schema := contracts.JSONSchema{
		Type: "object", Required: []string{"preferences"}, AdditionalProperties: contracts.AdditionalProperties{Allowed: false},
		Properties: map[string]contracts.JSONSchema{
			"preferences": {Type: "object", Required: []string{"items"}, AdditionalProperties: contracts.AdditionalProperties{Allowed: false}, Properties: map[string]contracts.JSONSchema{
				"items": {Type: "array", Items: &contracts.JSONSchema{Type: "object", Required: []string{"rendererId"}, AdditionalProperties: contracts.AdditionalProperties{Allowed: false}, Properties: map[string]contracts.JSONSchema{"rendererId": {Type: "string"}}}},
			}},
		},
	}
	if violations := schema.ValidateJSON([]byte(`{"preferences":{"items":[{"rendererId":42,"extra":true}]}}`)); len(violations) != 2 {
		t.Fatalf("violations = %v", violations)
	}
}

func objectSchema() contracts.JSONSchema {
	return contracts.JSONSchema{Type: "object", AdditionalProperties: contracts.AdditionalProperties{Allowed: false}}
}

func TestStableErrorCarriesCodeTraceAndSafeDetails(t *testing.T) {
	err := contracts.NewError(contracts.CodeConflict, "revision conflict", "trace-1", map[string]any{"currentRevision": "2"})
	if err.Code != contracts.CodeConflict || err.TraceID != "trace-1" {
		t.Fatalf("unexpected error: %#v", err)
	}
}
