package invoke_test

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/kisstar/x-tools/go/contracts"
	"github.com/kisstar/x-tools/go/kernel/invoke"
	"github.com/kisstar/x-tools/go/kernel/registry"
)

func TestInvokeUsesFixedValidationAuthorizationAvailabilityHandlerOrder(t *testing.T) {
	var order []string
	snapshot := snapshotWith(t, registry.Capability{
		Contract:      contract(100 * time.Millisecond),
		ValidateInput: recordValidator(&order, "input"),
		Authorize: func(context.Context, contracts.Principal, json.RawMessage) *contracts.Error {
			order = append(order, "authorize")
			return nil
		},
		Available: func(context.Context) contracts.Availability {
			order = append(order, "availability")
			return contracts.Availability{Available: true}
		},
		Handler: func(context.Context, []byte) ([]byte, *contracts.Error) {
			order = append(order, "handler")
			return []byte(`{"ok":true}`), nil
		},
		ValidateOutput: recordValidator(&order, "output"),
	})
	result, err := invoke.New(
		snapshot,
	).Invoke(
		context.Background(),
		contracts.Principal{Kind: contracts.PrincipalWebSession, ID: "session"},
		contract(0).ID,
		[]byte(`{}`),
	)
	if err != nil {
		t.Fatalf("Invoke returned error: %v", err)
	}
	if string(result) != `{"ok":true}` {
		t.Fatalf("result = %s", result)
	}
	want := []string{"input", "authorize", "availability", "handler", "output"}
	if len(order) != len(want) {
		t.Fatalf("order = %v", order)
	}
	for i := range want {
		if order[i] != want[i] {
			t.Fatalf("order = %v, want %v", order, want)
		}
	}
}

func TestInvokeFailsClosedBeforeHandler(t *testing.T) {
	cases := []struct {
		name       string
		capability registry.Capability
		code       contracts.ErrorCode
	}{
		{
			"invalid input",
			registry.Capability{Contract: contract(time.Second), ValidateInput: func([]byte) *contracts.Error {
				return contracts.NewError(contracts.CodeInvalidArgument, "bad input", "", nil)
			}, Handler: failHandler(t)},
			contracts.CodeInvalidArgument,
		},
		{
			"denied",
			registry.Capability{
				Contract: contract(time.Second),
				Authorize: func(context.Context, contracts.Principal, json.RawMessage) *contracts.Error {
					return contracts.NewError(contracts.CodePermissionDenied, "denied", "", nil)
				},
				Handler: failHandler(t),
			},
			contracts.CodePermissionDenied,
		},
		{
			"unavailable",
			registry.Capability{
				Contract: contract(time.Second),
				Available: func(context.Context) contracts.Availability {
					return contracts.Availability{Available: false, Reason: "disabled"}
				},
				Handler: failHandler(t),
			},
			contracts.CodeUnavailable,
		},
	}
	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			_, err := invoke.New(
				snapshotWith(t, tt.capability),
			).Invoke(
				context.Background(),
				contracts.Principal{Kind: contracts.PrincipalWebSession},
				contract(0).ID,
				[]byte(`{}`),
			)
			if err == nil || err.Code != tt.code {
				t.Fatalf("error = %#v, want code %s", err, tt.code)
			}
		})
	}
}

func TestInvokeAppliesDeadlineAndRecoversPanicWithTrace(t *testing.T) {
	t.Run("deadline", func(t *testing.T) {
		capability := registry.Capability{
			Contract: contract(10 * time.Millisecond),
			Handler:  func(ctx context.Context, _ []byte) ([]byte, *contracts.Error) { <-ctx.Done(); return nil, nil },
		}
		_, err := invoke.New(
			snapshotWith(t, capability),
		).Invoke(
			context.Background(),
			contracts.Principal{Kind: contracts.PrincipalWebSession},
			contract(0).ID,
			[]byte(`{}`),
		)
		if err == nil || err.Code != contracts.CodeDeadlineExceeded {
			t.Fatalf("error = %#v", err)
		}
	})
	t.Run("panic", func(t *testing.T) {
		capability := registry.Capability{
			Contract: contract(time.Second),
			Handler:  func(context.Context, []byte) ([]byte, *contracts.Error) { panic("secret") },
		}
		_, err := invoke.New(
			snapshotWith(t, capability),
		).Invoke(
			context.Background(),
			contracts.Principal{Kind: contracts.PrincipalWebSession},
			contract(0).ID,
			[]byte(`{}`),
		)
		if err == nil || err.Code != contracts.CodeInternal || err.TraceID == "" || err.Message == "secret" {
			t.Fatalf("error = %#v", err)
		}
	})
}

func TestInvokeDeadlineCoversAuthorizationAndAvailability(t *testing.T) {
	for _, test := range []struct {
		name       string
		capability registry.Capability
	}{
		{"authorization", registry.Capability{Contract: contract(10 * time.Millisecond), Authorize: func(ctx context.Context, _ contracts.Principal, _ json.RawMessage) *contracts.Error {
			<-ctx.Done()
			return nil
		}, Handler: failHandler(t)}},
		{"availability", registry.Capability{Contract: contract(10 * time.Millisecond), Available: func(ctx context.Context) contracts.Availability {
			<-ctx.Done()
			return contracts.Availability{Available: true}
		}, Handler: failHandler(t)}},
	} {
		t.Run(test.name, func(t *testing.T) {
			_, err := invoke.New(
				snapshotWith(t, test.capability),
			).Invoke(
				context.Background(),
				contracts.Principal{Kind: contracts.PrincipalWebSession},
				contract(0).ID,
				[]byte(`{}`),
			)
			if err == nil || err.Code != contracts.CodeDeadlineExceeded {
				t.Fatalf("error = %#v", err)
			}
		})
	}
}

func TestCapabilityClientBindsModulePrincipalAndAuditsResult(t *testing.T) {
	var got contracts.Principal
	var records []invoke.AuditRecord
	capability := registry.Capability{
		Contract: contract(time.Second),
		Authorize: func(_ context.Context, principal contracts.Principal, _ json.RawMessage) *contracts.Error {
			got = principal
			return nil
		},
		Handler: func(context.Context, []byte) ([]byte, *contracts.Error) { return []byte(`{}`), nil },
	}
	invoker := invoke.NewWithOptions(
		snapshotWith(t, capability),
		invoke.Options{Audit: func(record invoke.AuditRecord) { records = append(records, record) }},
	)
	client, err := invoker.ModuleClient("workbench.shell")
	if err != nil {
		t.Fatal(err)
	}
	if _, invokeErr := client.Invoke(context.Background(), contract(0).ID, []byte(`{}`)); invokeErr != nil {
		t.Fatal(invokeErr)
	}
	if got.Kind != contracts.PrincipalModule || got.ID != "module:workbench.shell" {
		t.Fatalf("principal = %#v", got)
	}
	if len(records) != 1 || records[0].CapabilityID != contract(0).ID || records[0].ResultCode != "ok" ||
		records[0].TraceID == "" {
		t.Fatalf("audit records = %#v", records)
	}
}

func TestInvokeRejectsConcurrentCallsAtCapabilityQuota(t *testing.T) {
	entered := make(chan struct{})
	release := make(chan struct{})
	c := contract(time.Second)
	c.MaxConcurrent = 1
	capability := registry.Capability{Contract: c, Handler: func(context.Context, []byte) ([]byte, *contracts.Error) {
		close(entered)
		<-release
		return []byte(`{}`), nil
	}}
	invoker := invoke.New(snapshotWith(t, capability))
	done := make(chan *contracts.Error, 1)
	go func() {
		_, err := invoker.Invoke(
			context.Background(),
			contracts.Principal{Kind: contracts.PrincipalWebSession},
			c.ID,
			[]byte(`{}`),
		)
		done <- err
	}()
	<-entered
	_, err := invoker.Invoke(
		context.Background(),
		contracts.Principal{Kind: contracts.PrincipalWebSession},
		c.ID,
		[]byte(`{}`),
	)
	if err == nil || err.Code != contracts.CodeResourceExhausted {
		t.Fatalf("error = %#v", err)
	}
	close(release)
	if firstErr := <-done; firstErr != nil {
		t.Fatal(firstErr)
	}
}

func snapshotWith(t *testing.T, capability registry.Capability) registry.Snapshot {
	t.Helper()
	r := registry.New()
	if err := r.Register(capability); err != nil {
		t.Fatal(err)
	}
	return r.Freeze()
}

func contract(deadline time.Duration) contracts.CapabilityContract {
	if deadline == 0 {
		deadline = time.Second
	}
	schema := contracts.JSONSchema{Type: "object", AdditionalProperties: contracts.AdditionalProperties{Allowed: false}}
	return contracts.CapabilityContract{
		ID:                   "test.run@1",
		Kind:                 contracts.Command,
		SupportsCancellation: true,
		DefaultDeadline:      deadline,
		MaxInputBytes:        1024,
		MaxOutputBytes:       4096,
		MaxConcurrent:        4,
		InputSchema:          schema,
		OutputSchema:         schema,
		Permissions:          []contracts.Permission{"test.run"},
		Exposure:             []contracts.Exposure{contracts.ExposureWebSocket},
		Availability:         contracts.Availability{Available: true},
	}
}

func recordValidator(order *[]string, name string) registry.Validator {
	return func([]byte) *contracts.Error { *order = append(*order, name); return nil }
}

func failHandler(t *testing.T) registry.Handler {
	return func(context.Context, []byte) ([]byte, *contracts.Error) {
		t.Fatal("handler must not run")
		return nil, nil
	}
}
