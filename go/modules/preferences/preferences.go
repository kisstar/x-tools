package preferences

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"time"

	"github.com/kisstar/x-tools/go/contracts"
	"github.com/kisstar/x-tools/go/kernel/registry"
)

const (
	GetID    contracts.CapabilityID = "workbench.preferences.get@1"
	UpdateID contracts.CapabilityID = "workbench.preferences.update@1"
)

type (
	GetInput  struct{}
	GetOutput struct {
		Preferences WorkbenchPreferences `json:"preferences"`
	}
)

type UpdateInput struct {
	ExpectedRevision string          `json:"expectedRevision" minLength:"1"`
	Preferences      PreferenceState `json:"preferences"`
}
type UpdateOutput struct {
	Preferences WorkbenchPreferences `json:"preferences"`
}
type WorkbenchPreferences struct {
	Revision   string                     `json:"revision"`
	Global     PreferenceLayer            `json:"global"`
	Workspaces map[string]PreferenceLayer `json:"workspaces"`
}
type PreferenceState struct {
	Global     PreferenceLayer            `json:"global"`
	Workspaces map[string]PreferenceLayer `json:"workspaces"`
}
type PreferenceLayer struct {
	Containers map[string]ContainerPreference `json:"containers,omitempty"`
}
type ContainerPreference struct {
	Regions    map[string]RegionPreference `json:"regions,omitempty"`
	Navigation NavigationPreference        `json:"navigation,omitempty"`
}
type RegionPreference struct {
	RendererID *string  `json:"rendererId,omitempty"`
	Width      *float64 `json:"width,omitempty"`
	Visible    *bool    `json:"visible,omitempty"`
}
type NavigationPreference struct {
	Hidden []string `json:"hidden,omitempty"`
	Pinned []string `json:"pinned,omitempty"`
	Order  []string `json:"order,omitempty"`
}

type Module struct {
	mu       sync.RWMutex
	revision uint64
	state    PreferenceState
	path     string
	loadErr  error
}

func New(paths ...string) *Module {
	module := &Module{state: emptyState()}
	if len(paths) > 0 {
		module.path = paths[0]
		module.loadErr = module.load()
	}
	return module
}

func (module *Module) Register(target *registry.Registry) error {
	if module.loadErr != nil {
		return module.loadErr
	}
	getContract := capabilityContract(
		GetID,
		contracts.Query,
		true,
		GetInput{},
		GetOutput{},
		"workbench.preferences.read",
	)
	if err := target.Register(
		registry.Capability{
			Contract: getContract,
			ValidateInput: getContract.InputSchema.Validator(
				contracts.CodeInvalidArgument,
				"invalid preferences get input",
			),
			Authorize: authorizeWebOrModule,
			Available: available,
			Handler:   module.get,
			ValidateOutput: getContract.OutputSchema.Validator(
				contracts.CodeInternal,
				"invalid preferences get output",
			),
		},
	); err != nil {
		return err
	}
	updateContract := capabilityContract(
		UpdateID,
		contracts.Command,
		false,
		UpdateInput{},
		UpdateOutput{},
		"workbench.preferences.write",
	)
	return target.Register(
		registry.Capability{
			Contract: updateContract,
			ValidateInput: updateContract.InputSchema.Validator(
				contracts.CodeInvalidArgument,
				"invalid preferences update input",
			),
			Authorize: authorizeWebOrModule,
			Available: available,
			Handler:   module.update,
			ValidateOutput: updateContract.OutputSchema.Validator(
				contracts.CodeInternal,
				"invalid preferences update output",
			),
		},
	)
}

func capabilityContract(
	id contracts.CapabilityID,
	kind contracts.CapabilityKind,
	idempotent bool,
	input, output any,
	permission contracts.Permission,
) contracts.CapabilityContract {
	return contracts.CapabilityContract{
		ID:                   id,
		Kind:                 kind,
		Idempotent:           idempotent,
		SupportsCancellation: true,
		DefaultDeadline:      time.Second,
		MaxInputBytes:        256 << 10,
		MaxOutputBytes:       256 << 10,
		MaxConcurrent:        8,
		InputSchema:          RuntimeSchema(input),
		OutputSchema:         RuntimeSchema(output),
		Permissions:          []contracts.Permission{permission},
		Exposure:             []contracts.Exposure{contracts.ExposureWebSocket, contracts.ExposureCLI},
		Availability:         contracts.Availability{Available: true},
	}
}

func (module *Module) get(context.Context, []byte) ([]byte, *contracts.Error) {
	module.mu.RLock()
	defer module.mu.RUnlock()
	return marshal(GetOutput{Preferences: module.snapshot()})
}

func (module *Module) update(_ context.Context, input []byte) ([]byte, *contracts.Error) {
	var request UpdateInput
	if err := json.Unmarshal(input, &request); err != nil {
		return nil, contracts.NewError(contracts.CodeInvalidArgument, "invalid preferences update", "", nil)
	}
	module.mu.Lock()
	defer module.mu.Unlock()
	current := strconv.FormatUint(module.revision, 10)
	if request.ExpectedRevision != current {
		return nil, contracts.NewError(
			contracts.CodeConflict,
			"preferences revision conflict",
			"",
			map[string]any{"currentRevision": current},
		)
	}
	module.revision++
	previousState, previousRevision := module.state, module.revision-1
	module.state = cloneState(request.Preferences)
	if err := module.persist(); err != nil {
		module.state, module.revision = previousState, previousRevision
		return nil, contracts.NewError(contracts.CodeInternal, "preferences persistence failed", "", nil)
	}
	return marshal(UpdateOutput{Preferences: module.snapshot()})
}

func emptyState() PreferenceState {
	return PreferenceState{
		Global:     PreferenceLayer{Containers: map[string]ContainerPreference{}},
		Workspaces: map[string]PreferenceLayer{},
	}
}

func authorizeWebOrModule(_ context.Context, principal contracts.Principal, _ json.RawMessage) *contracts.Error {
	if principal.Kind != contracts.PrincipalWebSession && principal.Kind != contracts.PrincipalCLISession &&
		principal.Kind != contracts.PrincipalModule {
		return contracts.NewError(contracts.CodePermissionDenied, "principal cannot access preferences", "", nil)
	}
	return nil
}

func available(context.Context) contracts.Availability {
	return contracts.Availability{Available: true}
}

func (module *Module) load() error {
	if module.path == "" {
		return nil
	}
	data, err := os.ReadFile(module.path)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("read preferences: %w", err)
	}
	var value WorkbenchPreferences
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&value); err != nil {
		return fmt.Errorf("decode preferences: %w", err)
	}
	revision, err := strconv.ParseUint(value.Revision, 10, 64)
	if err != nil {
		return fmt.Errorf("decode preferences revision: %w", err)
	}
	module.revision, module.state = revision, cloneState(
		PreferenceState{Global: value.Global, Workspaces: value.Workspaces},
	)
	return nil
}

func (module *Module) persist() error {
	if module.path == "" {
		return nil
	}
	data, err := json.Marshal(module.snapshot())
	if err != nil {
		return err
	}
	directory := filepath.Dir(module.path)
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return err
	}
	temporary, err := os.CreateTemp(directory, ".preferences-*")
	if err != nil {
		return err
	}
	temporaryName := temporary.Name()
	defer func() { _ = os.Remove(temporaryName) }()
	if err := temporary.Chmod(0o600); err != nil {
		_ = temporary.Close()
		return err
	}
	if _, err := temporary.Write(data); err != nil {
		_ = temporary.Close()
		return err
	}
	if err := temporary.Sync(); err != nil {
		_ = temporary.Close()
		return err
	}
	if err := temporary.Close(); err != nil {
		return err
	}
	if err := os.Rename(temporaryName, module.path); err != nil {
		return err
	}
	return os.Chmod(module.path, 0o600)
}

func (module *Module) snapshot() WorkbenchPreferences {
	state := cloneState(module.state)
	return WorkbenchPreferences{
		Revision:   strconv.FormatUint(module.revision, 10),
		Global:     state.Global,
		Workspaces: state.Workspaces,
	}
}

func cloneState(state PreferenceState) PreferenceState {
	data, _ := json.Marshal(state)
	var cloned PreferenceState
	_ = json.Unmarshal(data, &cloned)
	if cloned.Global.Containers == nil {
		cloned.Global.Containers = map[string]ContainerPreference{}
	}
	if cloned.Workspaces == nil {
		cloned.Workspaces = map[string]PreferenceLayer{}
	}
	return cloned
}

func marshal(value any) ([]byte, *contracts.Error) {
	data, err := json.Marshal(value)
	if err != nil {
		return nil, contracts.NewError(contracts.CodeInternal, "preferences serialization failed", "", nil)
	}
	return data, nil
}
