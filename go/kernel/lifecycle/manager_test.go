package lifecycle_test

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"github.com/kisstar/x-tools/go/kernel/lifecycle"
)

type module struct {
	id           string
	dependencies []string
	activate     func() error
	deactivate   func() error
}

func (value module) Manifest() lifecycle.Manifest {
	return lifecycle.Manifest{ID: value.id, DependsOn: value.dependencies}
}

func (value module) Activate(lifecycle.ActivationContext) error {
	if value.activate != nil {
		return value.activate()
	}
	return nil
}

func (value module) Deactivate(context.Context) error {
	if value.deactivate != nil {
		return value.deactivate()
	}
	return nil
}

func TestManagerActivatesTopologicallyAndStopsInReverse(t *testing.T) {
	var order []string
	modules := []lifecycle.Module{
		module{
			id:           "host",
			dependencies: []string{"runtime"},
			activate:     func() error { order = append(order, "activate host"); return nil },
			deactivate:   func() error { order = append(order, "deactivate host"); return nil },
		},
		module{
			id:         "runtime",
			activate:   func() error { order = append(order, "activate runtime"); return nil },
			deactivate: func() error { order = append(order, "deactivate runtime"); return nil },
		},
	}
	manager := lifecycle.New(modules)
	if err := manager.Activate(context.Background(), []string{"host"}, lifecycle.ActivationContext{}); err != nil {
		t.Fatal(err)
	}
	if manager.State() != lifecycle.Frozen {
		t.Fatalf("state = %s", manager.State())
	}
	if err := manager.StartServing(); err != nil {
		t.Fatal(err)
	}
	if err := manager.Stop(context.Background()); err != nil {
		t.Fatal(err)
	}
	want := []string{"activate runtime", "activate host", "deactivate host", "deactivate runtime"}
	if !reflect.DeepEqual(order, want) {
		t.Fatalf("order = %v, want %v", order, want)
	}
}

func TestManagerRejectsMissingRequiredModuleBeforeActivation(t *testing.T) {
	activated := false
	manager := lifecycle.New(
		[]lifecycle.Module{module{id: "available", activate: func() error { activated = true; return nil }}},
	)
	if err := manager.Activate(context.Background(), []string{"missing"}, lifecycle.ActivationContext{}); err == nil {
		t.Fatal("Activate succeeded")
	}
	if activated {
		t.Fatal("module activated before required module validation")
	}
}

func TestManagerRollsBackActivatedModulesOnFailure(t *testing.T) {
	var order []string
	manager := lifecycle.New([]lifecycle.Module{
		module{
			id:         "first",
			activate:   func() error { order = append(order, "activate first"); return nil },
			deactivate: func() error { order = append(order, "deactivate first"); return nil },
		},
		module{id: "second", dependencies: []string{"first"}, activate: func() error { return errors.New("failed") }},
	})
	if err := manager.Activate(context.Background(), nil, lifecycle.ActivationContext{}); err == nil {
		t.Fatal("Activate succeeded")
	}
	if manager.State() != lifecycle.Stopped {
		t.Fatalf("state = %s", manager.State())
	}
	want := []string{"activate first", "deactivate first"}
	if !reflect.DeepEqual(order, want) {
		t.Fatalf("order = %v, want %v", order, want)
	}
}

func TestManagerRejectsDependencyCycle(t *testing.T) {
	manager := lifecycle.New(
		[]lifecycle.Module{module{id: "a", dependencies: []string{"b"}}, module{id: "b", dependencies: []string{"a"}}},
	)
	if err := manager.Activate(context.Background(), nil, lifecycle.ActivationContext{}); err == nil {
		t.Fatal("Activate accepted dependency cycle")
	}
}
