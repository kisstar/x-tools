package invoke

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/kisstar/x-tools/go/contracts"
	"github.com/kisstar/x-tools/go/kernel/registry"
)

type AuditRecord struct {
	CapabilityID contracts.CapabilityID
	Principal    contracts.Principal
	TraceID      string
	Duration     time.Duration
	ResultCode   string
}
type Options struct{ Audit func(AuditRecord) }
type Invoker struct {
	snapshot registry.Snapshot
	options  Options
	mu       sync.Mutex
	inFlight map[contracts.CapabilityID]int
}

func New(snapshot registry.Snapshot) *Invoker { return NewWithOptions(snapshot, Options{}) }
func NewWithOptions(snapshot registry.Snapshot, options Options) *Invoker {
	return &Invoker{snapshot: snapshot, options: options, inFlight: make(map[contracts.CapabilityID]int)}
}

func (invoker *Invoker) Invoke(parent context.Context, principal contracts.Principal, id contracts.CapabilityID, input []byte) (output []byte, invokeErr *contracts.Error) {
	traceID := newTraceID()
	started := time.Now()
	defer func() {
		if invoker.options.Audit != nil {
			resultCode := "ok"
			if invokeErr != nil {
				resultCode = string(invokeErr.Code)
			}
			invoker.options.Audit(AuditRecord{CapabilityID: id, Principal: principal, TraceID: traceID, Duration: time.Since(started), ResultCode: resultCode})
		}
	}()
	defer func() {
		if recover() != nil {
			output = nil
			invokeErr = contracts.NewError(contracts.CodeInternal, "internal invocation error", traceID, nil)
		}
	}()
	capability, ok := invoker.snapshot.Lookup(id)
	if !ok {
		return nil, contracts.NewError(contracts.CodeNotFound, "capability not found", traceID, nil)
	}
	if int64(len(input)) > capability.Contract.MaxInputBytes {
		return nil, contracts.NewError(contracts.CodeResourceExhausted, "input exceeds capability limit", traceID, nil)
	}
	ctx, cancel := context.WithTimeout(parent, capability.Contract.DefaultDeadline)
	defer cancel()
	if capability.ValidateInput != nil {
		if err := capability.ValidateInput(input); err != nil {
			return nil, withTrace(err, traceID)
		}
	}
	if principal.Kind == "" {
		return nil, contracts.NewError(contracts.CodeUnauthenticated, "principal is required", traceID, nil)
	}
	if capability.Authorize != nil {
		if err := runAuthorizer(ctx, capability.Authorize, principal, input); err != nil {
			if err.Code == contracts.CodeDeadlineExceeded {
				return nil, deadlineError(traceID)
			}
			return nil, withTrace(err, traceID)
		}
	}
	if capability.Available != nil {
		state, deadline := runAvailability(ctx, capability.Available)
		if deadline {
			return nil, deadlineError(traceID)
		}
		if !state.Available {
			return nil, contracts.NewError(contracts.CodeUnavailable, "capability unavailable", traceID, map[string]any{"reason": state.Reason})
		}
	}
	if ctx.Err() != nil {
		return nil, deadlineError(traceID)
	}
	if !invoker.acquire(id, capability.Contract.MaxConcurrent) {
		return nil, contracts.NewError(contracts.CodeResourceExhausted, "capability concurrency limit reached", traceID, nil)
	}
	defer invoker.release(id)
	type result struct {
		output []byte
		err    *contracts.Error
	}
	completed := make(chan result, 1)
	go func() {
		var value result
		defer func() {
			if recover() != nil {
				value.err = contracts.NewError(contracts.CodeInternal, "internal invocation error", traceID, nil)
			}
			completed <- value
		}()
		value.output, value.err = capability.Handler(ctx, input)
	}()
	select {
	case <-ctx.Done():
		return nil, contracts.NewError(contracts.CodeDeadlineExceeded, "capability deadline exceeded", traceID, nil)
	case value := <-completed:
		if value.err != nil {
			return nil, withTrace(value.err, traceID)
		}
		if int64(len(value.output)) > capability.Contract.MaxOutputBytes {
			return nil, contracts.NewError(contracts.CodeResourceExhausted, "output exceeds capability limit", traceID, nil)
		}
		if capability.ValidateOutput != nil {
			if err := capability.ValidateOutput(value.output); err != nil {
				return nil, contracts.NewError(contracts.CodeInternal, "capability produced invalid output", traceID, nil)
			}
		}
		return value.output, nil
	}
}

func runAuthorizer(ctx context.Context, authorizer registry.Authorizer, principal contracts.Principal, input []byte) *contracts.Error {
	completed := make(chan *contracts.Error, 1)
	go func() { completed <- authorizer(ctx, principal, json.RawMessage(input)) }()
	select {
	case <-ctx.Done():
		return deadlineError("")
	case err := <-completed:
		return err
	}
}
func runAvailability(ctx context.Context, available registry.AvailabilityCheck) (contracts.Availability, bool) {
	completed := make(chan contracts.Availability, 1)
	go func() { completed <- available(ctx) }()
	select {
	case <-ctx.Done():
		return contracts.Availability{}, true
	case state := <-completed:
		return state, false
	}
}
func deadlineError(traceID string) *contracts.Error {
	return contracts.NewError(contracts.CodeDeadlineExceeded, "capability deadline exceeded", traceID, nil)
}
func (invoker *Invoker) acquire(id contracts.CapabilityID, limit int) bool {
	invoker.mu.Lock()
	defer invoker.mu.Unlock()
	if invoker.inFlight[id] >= limit {
		return false
	}
	invoker.inFlight[id]++
	return true
}
func (invoker *Invoker) release(id contracts.CapabilityID) {
	invoker.mu.Lock()
	defer invoker.mu.Unlock()
	invoker.inFlight[id]--
}

type CapabilityClient struct {
	invoker   *Invoker
	principal contracts.Principal
}

func (invoker *Invoker) ModuleClient(moduleID string) (*CapabilityClient, error) {
	if moduleID == "" {
		return nil, fmt.Errorf("module ID is required")
	}
	return &CapabilityClient{invoker: invoker, principal: contracts.Principal{Kind: contracts.PrincipalModule, ID: "module:" + moduleID}}, nil
}
func (client *CapabilityClient) Invoke(ctx context.Context, id contracts.CapabilityID, input []byte) ([]byte, *contracts.Error) {
	return client.invoker.Invoke(ctx, client.principal, id, input)
}

func withTrace(err *contracts.Error, traceID string) *contracts.Error {
	if err.TraceID == "" {
		err.TraceID = traceID
	}
	return err
}
func newTraceID() string {
	var value [8]byte
	if _, err := rand.Read(value[:]); err != nil {
		return "trace-unavailable"
	}
	return hex.EncodeToString(value[:])
}
