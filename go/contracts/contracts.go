// Package contracts contains stable identifiers and values shared across Go layers.
package contracts

import (
	"bytes"
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
)

var capabilityIDPattern = regexp.MustCompile(`^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+@[1-9][0-9]*$`)

type CapabilityID string

func ParseCapabilityID(value string) (CapabilityID, error) {
	if !strings.Contains(value, "@") {
		value += "@1"
	}
	if !capabilityIDPattern.MatchString(value) {
		return "", fmt.Errorf("invalid capability ID %q", value)
	}
	return CapabilityID(value), nil
}

func (id CapabilityID) String() string { return string(id) }

func (id CapabilityID) Validate() error { _, err := ParseCapabilityID(string(id)); return err }

func (id CapabilityID) Major() uint {
	index := strings.LastIndexByte(string(id), '@')
	if index < 0 {
		return 1
	}
	value, _ := strconv.ParseUint(string(id)[index+1:], 10, 32)
	return uint(value)
}

type CapabilityKind string

const (
	Command CapabilityKind = "command"
	Query   CapabilityKind = "query"
)

type CapabilityContract struct {
	ID                   CapabilityID
	Kind                 CapabilityKind
	Idempotent           bool
	SupportsCancellation bool
	DefaultDeadline      time.Duration
	MaxInputBytes        int64
	MaxOutputBytes       int64
	MaxConcurrent        int
	InputSchema          JSONSchema
	OutputSchema         JSONSchema
	Permissions          []Permission
	Exposure             []Exposure
	Availability         Availability
}

func (contract CapabilityContract) Validate() error {
	if err := contract.ID.Validate(); err != nil {
		return err
	}
	if contract.Kind != Command && contract.Kind != Query {
		return fmt.Errorf("invalid capability kind %q", contract.Kind)
	}
	if contract.DefaultDeadline <= 0 {
		return fmt.Errorf("default deadline must be positive")
	}
	if contract.MaxInputBytes <= 0 || contract.MaxOutputBytes <= 0 {
		return fmt.Errorf("input and output limits must be positive")
	}
	if contract.MaxConcurrent <= 0 {
		return fmt.Errorf("max concurrent must be positive")
	}
	if err := contract.InputSchema.ValidateDefinition(); err != nil {
		return fmt.Errorf("invalid input schema: %w", err)
	}
	if err := contract.OutputSchema.ValidateDefinition(); err != nil {
		return fmt.Errorf("invalid output schema: %w", err)
	}
	if len(contract.Permissions) == 0 || len(contract.Exposure) == 0 {
		return fmt.Errorf("permissions and exposure are required")
	}
	return nil
}

type Permission string
type Exposure string

const (
	ExposureWebSocket Exposure = "websocket"
	ExposureCLI       Exposure = "cli"
)

type AdditionalProperties struct {
	Allowed bool
	Schema  *JSONSchema
}

type JSONSchema struct {
	Type                 string
	MinLength            int
	Properties           map[string]JSONSchema
	Required             []string
	AdditionalProperties AdditionalProperties
	Items                *JSONSchema
}

func (schema JSONSchema) ValidateDefinition() error {
	switch schema.Type {
	case "object", "array", "string", "number", "integer", "boolean":
	default:
		return fmt.Errorf("unsupported schema type %q", schema.Type)
	}
	if schema.Type == "array" && schema.Items == nil {
		return fmt.Errorf("array items are required")
	}
	return nil
}

func (schema JSONSchema) ValidateJSON(payload []byte) []string {
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return []string{"$: invalid JSON"}
	}
	var extra any
	if decoder.Decode(&extra) == nil {
		return []string{"$: multiple JSON values"}
	}
	var violations []string
	schema.validate(value, "$", &violations)
	return violations
}
func (schema JSONSchema) Validator(invalidCode ErrorCode, message string) func([]byte) *Error {
	return func(payload []byte) *Error {
		violations := schema.ValidateJSON(payload)
		if len(violations) == 0 {
			return nil
		}
		return NewError(invalidCode, message, "", map[string]any{"violations": violations})
	}
}

func (schema JSONSchema) validate(value any, path string, violations *[]string) {
	switch schema.Type {
	case "object":
		object, ok := value.(map[string]any)
		if !ok {
			*violations = append(*violations, path+": expected object")
			return
		}
		for _, required := range schema.Required {
			if _, ok := object[required]; !ok {
				*violations = append(*violations, path+"."+required+": required")
			}
		}
		for key, child := range object {
			if property, ok := schema.Properties[key]; ok {
				property.validate(child, path+"."+key, violations)
				continue
			}
			if schema.AdditionalProperties.Schema != nil {
				schema.AdditionalProperties.Schema.validate(child, path+"."+key, violations)
				continue
			}
			if !schema.AdditionalProperties.Allowed {
				*violations = append(*violations, path+"."+key+": unknown property")
			}
		}
	case "array":
		array, ok := value.([]any)
		if !ok {
			*violations = append(*violations, path+": expected array")
			return
		}
		for index, child := range array {
			schema.Items.validate(child, fmt.Sprintf("%s[%d]", path, index), violations)
		}
	case "string":
		text, ok := value.(string)
		if !ok {
			*violations = append(*violations, path+": expected string")
		} else if len(text) < schema.MinLength {
			*violations = append(*violations, path+": string is too short")
		}
	case "boolean":
		if _, ok := value.(bool); !ok {
			*violations = append(*violations, path+": expected boolean")
		}
	case "number":
		if _, ok := value.(json.Number); !ok {
			*violations = append(*violations, path+": expected number")
		}
	case "integer":
		if number, ok := value.(json.Number); !ok {
			*violations = append(*violations, path+": expected integer")
		} else if _, err := number.Int64(); err != nil {
			*violations = append(*violations, path+": expected integer")
		}
	}
}

type ErrorCode string

const (
	CodeInvalidArgument   ErrorCode = "invalid_argument"
	CodeUnauthenticated   ErrorCode = "unauthenticated"
	CodePermissionDenied  ErrorCode = "permission_denied"
	CodeNotFound          ErrorCode = "not_found"
	CodeUnavailable       ErrorCode = "unavailable"
	CodeConflict          ErrorCode = "conflict"
	CodeResourceExhausted ErrorCode = "resource_exhausted"
	CodeDeadlineExceeded  ErrorCode = "deadline_exceeded"
	CodeInternal          ErrorCode = "internal"
)

type Error struct {
	Code    ErrorCode `json:"code"`
	Message string    `json:"message"`
	TraceID string    `json:"traceId"`
	Details any       `json:"details,omitempty"`
}

func NewError(code ErrorCode, message, traceID string, details any) *Error {
	return &Error{Code: code, Message: message, TraceID: traceID, Details: details}
}
func (e *Error) Error() string { return string(e.Code) + ": " + e.Message }

type PrincipalKind string

const (
	PrincipalWebSession PrincipalKind = "web-session"
	PrincipalCLISession PrincipalKind = "cli-session"
	PrincipalModule     PrincipalKind = "module"
)

type Principal struct {
	Kind PrincipalKind
	ID   string
}
type Availability struct {
	Available bool
	Reason    string
}
