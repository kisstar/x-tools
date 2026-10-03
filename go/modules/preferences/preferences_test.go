package preferences_test

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/kisstar/x-tools/go/contracts"
	"github.com/kisstar/x-tools/go/kernel/invoke"
	"github.com/kisstar/x-tools/go/kernel/registry"
	"github.com/kisstar/x-tools/go/modules/preferences"
)

func TestPreferencesPersistAcrossModuleRestartWithPrivateAtomicFile(t *testing.T) {
	filename := filepath.Join(t.TempDir(), "preferences.json")
	first := testInvokerForModule(t, preferences.New(filename))
	principal := contracts.Principal{Kind: contracts.PrincipalWebSession, ID: "web"}
	renderer := "workbench.settings.detail"
	updated := call[preferences.UpdateOutput](t, first, principal, preferences.UpdateID, preferences.UpdateInput{
		ExpectedRevision: "0",
		Preferences: preferences.PreferenceState{
			Global: preferences.PreferenceLayer{Containers: map[string]preferences.ContainerPreference{
				"settings": {Regions: map[string]preferences.RegionPreference{"detail": {RendererID: &renderer}}},
			}},
			Workspaces: map[string]preferences.PreferenceLayer{},
		},
	})
	if updated.Preferences.Revision != "1" {
		t.Fatalf("revision = %q", updated.Preferences.Revision)
	}
	info, err := os.Stat(filename)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("permissions = %o", info.Mode().Perm())
	}
	matches, err := filepath.Glob(filepath.Join(filepath.Dir(filename), ".preferences-*"))
	if err != nil {
		t.Fatal(err)
	}
	if len(matches) != 0 {
		t.Fatalf("temporary files remain: %v", matches)
	}

	second := testInvokerForModule(t, preferences.New(filename))
	got := call[preferences.GetOutput](t, second, principal, preferences.GetID, preferences.GetInput{})
	if got.Preferences.Revision != "1" ||
		*got.Preferences.Global.Containers["settings"].Regions["detail"].RendererID != renderer {
		t.Fatalf("restarted preferences = %#v", got.Preferences)
	}
}

func TestGetAndUpdatePreferencesUseRevisionCASAndPreserveUnknownRenderer(t *testing.T) {
	invoker := testInvoker(t)
	principal := contracts.Principal{Kind: contracts.PrincipalWebSession, ID: "web"}
	initial := call[preferences.GetOutput](t, invoker, principal, preferences.GetID, preferences.GetInput{})
	if initial.Preferences.Revision != "0" {
		t.Fatalf("initial revision = %q", initial.Preferences.Revision)
	}

	unknown := "third.party.removed.renderer"
	updated := call[preferences.UpdateOutput](t, invoker, principal, preferences.UpdateID, preferences.UpdateInput{
		ExpectedRevision: initial.Preferences.Revision,
		Preferences: preferences.PreferenceState{
			Global: preferences.PreferenceLayer{
				Containers: map[string]preferences.ContainerPreference{
					"home": {Regions: map[string]preferences.RegionPreference{"content": {RendererID: &unknown}}},
				},
			},
			Workspaces: map[string]preferences.PreferenceLayer{
				"workspace-a": {
					Containers: map[string]preferences.ContainerPreference{
						"home": {Navigation: preferences.NavigationPreference{Hidden: []string{"home.legacy"}}},
					},
				},
			},
		},
	})
	if updated.Preferences.Revision != "1" {
		t.Fatalf("updated revision = %q", updated.Preferences.Revision)
	}
	got := call[preferences.GetOutput](t, invoker, principal, preferences.GetID, preferences.GetInput{})
	if value := got.Preferences.Global.Containers["home"].Regions["content"].RendererID; value == nil ||
		*value != unknown {
		t.Fatalf("unknown renderer not preserved: %#v", value)
	}
	if got.Preferences.Workspaces["workspace-a"].Containers["home"].Navigation.Hidden[0] != "home.legacy" {
		t.Fatalf("workspace override not preserved: %#v", got.Preferences.Workspaces)
	}
}

func TestUpdateRejectsStaleRevisionAndReturnsCurrentRevision(t *testing.T) {
	invoker := testInvoker(t)
	principal := contracts.Principal{Kind: contracts.PrincipalWebSession}
	empty := preferences.PreferenceState{
		Global:     preferences.PreferenceLayer{Containers: map[string]preferences.ContainerPreference{}},
		Workspaces: map[string]preferences.PreferenceLayer{},
	}
	call[preferences.UpdateOutput](
		t,
		invoker,
		principal,
		preferences.UpdateID,
		preferences.UpdateInput{ExpectedRevision: "0", Preferences: empty},
	)
	input, _ := json.Marshal(preferences.UpdateInput{ExpectedRevision: "0", Preferences: empty})
	_, err := invoker.Invoke(context.Background(), principal, preferences.UpdateID, input)
	if err == nil || err.Code != contracts.CodeConflict {
		t.Fatalf("error = %#v", err)
	}
	details, ok := err.Details.(map[string]any)
	if !ok || details["currentRevision"] != "1" {
		t.Fatalf("details = %#v", err.Details)
	}
}

func TestUpdateRejectsMissingPreferencesAndUnknownFields(t *testing.T) {
	invoker := testInvoker(t)
	principal := contracts.Principal{Kind: contracts.PrincipalWebSession}
	for _, input := range []string{
		`{"expectedRevision":"0"}`,
		`{"expectedRevision":"0","preferences":null}`,
		`{"expectedRevision":"0","preferences":{"global":{},"workspaces":{}},"unexpected":true}`,
		`{"expectedRevision":"0","preferences":{"global":{"containers":{"home":{"regions":{"content":{"rendererId":42}}}}},"workspaces":{}}}`,
	} {
		_, err := invoker.Invoke(context.Background(), principal, preferences.UpdateID, []byte(input))
		if err == nil || err.Code != contracts.CodeInvalidArgument {
			t.Fatalf("input %s returned error %#v", input, err)
		}
	}
}

func testInvoker(t *testing.T) *invoke.Invoker {
	t.Helper()
	return testInvokerForModule(t, preferences.New())
}

func testInvokerForModule(t *testing.T, module *preferences.Module) *invoke.Invoker {
	t.Helper()
	r := registry.New()
	if err := module.Register(r); err != nil {
		t.Fatal(err)
	}
	return invoke.New(r.Freeze())
}

func call[T any](
	t *testing.T,
	invoker *invoke.Invoker,
	principal contracts.Principal,
	id contracts.CapabilityID,
	input any,
) T {
	t.Helper()
	payload, err := json.Marshal(input)
	if err != nil {
		t.Fatal(err)
	}
	output, invokeErr := invoker.Invoke(context.Background(), principal, id, payload)
	if invokeErr != nil {
		t.Fatal(invokeErr)
	}
	var result T
	if err := json.Unmarshal(output, &result); err != nil {
		t.Fatal(err)
	}
	return result
}
