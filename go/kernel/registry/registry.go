package registry

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"sync"

	"github.com/kisstar/x-tools/go/contracts"
)

type (
	Validator         func([]byte) *contracts.Error
	Handler           func(context.Context, []byte) ([]byte, *contracts.Error)
	Authorizer        func(context.Context, contracts.Principal, json.RawMessage) *contracts.Error
	AvailabilityCheck func(context.Context) contracts.Availability
)

type Capability struct {
	Contract       contracts.CapabilityContract
	ValidateInput  Validator
	Authorize      Authorizer
	Available      AvailabilityCheck
	Handler        Handler
	ValidateOutput Validator
}

type Registry struct {
	mu           sync.Mutex
	frozen       bool
	capabilities map[contracts.CapabilityID]Capability
}

func New() *Registry { return &Registry{capabilities: make(map[contracts.CapabilityID]Capability)} }

func (registry *Registry) Register(capability Capability) error {
	registry.mu.Lock()
	defer registry.mu.Unlock()
	if registry.frozen {
		return fmt.Errorf("capability registry is frozen")
	}
	if err := capability.Contract.Validate(); err != nil {
		return err
	}
	if capability.Handler == nil {
		return fmt.Errorf("capability %s has no handler", capability.Contract.ID)
	}
	if _, exists := registry.capabilities[capability.Contract.ID]; exists {
		return fmt.Errorf("duplicate capability %s", capability.Contract.ID)
	}
	registry.capabilities[capability.Contract.ID] = capability
	return nil
}

type Snapshot struct {
	capabilities map[contracts.CapabilityID]Capability
}

func (registry *Registry) Freeze() Snapshot {
	registry.mu.Lock()
	defer registry.mu.Unlock()
	registry.frozen = true
	values := make(map[contracts.CapabilityID]Capability, len(registry.capabilities))
	for id, capability := range registry.capabilities {
		values[id] = capability
	}
	return Snapshot{capabilities: values}
}

func (snapshot Snapshot) Lookup(id contracts.CapabilityID) (Capability, bool) {
	capability, ok := snapshot.capabilities[id]
	return capability, ok
}

func (snapshot Snapshot) IDs() []contracts.CapabilityID {
	ids := make([]contracts.CapabilityID, 0, len(snapshot.capabilities))
	for id := range snapshot.capabilities {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	return ids
}
