package lifecycle

import (
	"context"
	"fmt"
	"sort"
	"sync"
)

type State string

const (
	Created    State = "created"
	Activating State = "activating"
	Frozen     State = "frozen"
	Serving    State = "serving"
	Stopping   State = "stopping"
	Stopped    State = "stopped"
)

type Manifest struct {
	ID        string
	DependsOn []string
}
type (
	ActivationContext struct{}
	Module            interface {
		Manifest() Manifest
		Activate(ActivationContext) error
		Deactivate(context.Context) error
	}
)

type Manager struct {
	mu      sync.Mutex
	state   State
	modules map[string]Module
	active  []Module
}

func New(modules []Module) *Manager {
	values := make(map[string]Module, len(modules))
	for _, module := range modules {
		values[module.Manifest().ID] = module
	}
	return &Manager{state: Created, modules: values}
}

func (manager *Manager) State() State {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	return manager.state
}

func (manager *Manager) Activate(ctx context.Context, required []string, activationContext ActivationContext) error {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	if manager.state != Created {
		return fmt.Errorf("cannot activate from %s", manager.state)
	}
	for _, id := range required {
		if _, ok := manager.modules[id]; !ok {
			return fmt.Errorf("required module %s is missing", id)
		}
	}
	ordered, err := resolve(manager.modules)
	if err != nil {
		return err
	}
	manager.state = Activating
	for _, module := range ordered {
		if err := module.Activate(activationContext); err != nil {
			manager.rollback(ctx)
			return fmt.Errorf("activate %s: %w", module.Manifest().ID, err)
		}
		manager.active = append(manager.active, module)
	}
	manager.state = Frozen
	return nil
}

func (manager *Manager) StartServing() error {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	if manager.state != Frozen {
		return fmt.Errorf("cannot serve from %s", manager.state)
	}
	manager.state = Serving
	return nil
}

func (manager *Manager) Stop(ctx context.Context) error {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	if manager.state != Serving && manager.state != Frozen {
		return fmt.Errorf("cannot stop from %s", manager.state)
	}
	manager.state = Stopping
	manager.rollback(ctx)
	return nil
}

func (manager *Manager) rollback(ctx context.Context) {
	for index := len(manager.active) - 1; index >= 0; index-- {
		_ = manager.active[index].Deactivate(ctx)
	}
	manager.active = nil
	manager.state = Stopped
}

func resolve(modules map[string]Module) ([]Module, error) {
	ids := make([]string, 0, len(modules))
	for id := range modules {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	visiting, visited := map[string]bool{}, map[string]bool{}
	ordered := make([]Module, 0, len(modules))
	var visit func(string) error
	visit = func(id string) error {
		if visiting[id] {
			return fmt.Errorf("module dependency cycle at %s", id)
		}
		if visited[id] {
			return nil
		}
		module, ok := modules[id]
		if !ok {
			return fmt.Errorf("module dependency %s is missing", id)
		}
		visiting[id] = true
		dependencies := append([]string(nil), module.Manifest().DependsOn...)
		sort.Strings(dependencies)
		for _, dependency := range dependencies {
			if err := visit(dependency); err != nil {
				return err
			}
		}
		visiting[id] = false
		visited[id] = true
		ordered = append(ordered, module)
		return nil
	}
	for _, id := range ids {
		if err := visit(id); err != nil {
			return nil, err
		}
	}
	return ordered, nil
}
