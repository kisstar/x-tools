package preferences

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"
)

func TestGenerateContractsIsDeterministicAndContainsCapabilitySchemas(t *testing.T) {
	first, err := GenerateContracts()
	if err != nil {
		t.Fatalf("GenerateContracts returned error: %v", err)
	}
	second, err := GenerateContracts()
	if err != nil {
		t.Fatalf("GenerateContracts returned error: %v", err)
	}
	if len(first) != 5 {
		t.Fatalf("file count = %d, want 5", len(first))
	}
	for path, content := range first {
		if !bytes.Equal(content, second[path]) {
			t.Fatalf("%s is not deterministic", path)
		}
		if path[len(path)-5:] == ".json" && !bytes.Contains(content, []byte(`"additionalProperties": false`)) {
			t.Fatalf("%s is not closed JSON schema", path)
		}
	}
	generated := first["packages/contracts/src/generated.ts"]
	for _, expected := range [][]byte{[]byte("DO NOT EDIT"), []byte("validateWorkbenchPreferencesUpdateInput"), []byte("WorkbenchPreferences")} {
		if !bytes.Contains(generated, expected) {
			t.Fatalf("generated.ts missing %q", expected)
		}
	}
	if bytes.Contains(generated, []byte("expectedRevision and preferences are required")) {
		t.Fatal("generated validator still contains handwritten capability-specific validation")
	}
	for _, expected := range [][]byte{[]byte("validateSchema"), []byte("additionalProperties"), []byte("rendererId")} {
		if !bytes.Contains(generated, expected) {
			t.Fatalf("generated.ts missing schema-derived %q", expected)
		}
	}
}

func TestWriteContractsRemovesOrphanSchemaFiles(t *testing.T) {
	root := t.TempDir()
	orphan := filepath.Join(root, "contracts/schema/removed.capability@1/input.json")
	if err := os.MkdirAll(filepath.Dir(orphan), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(orphan, []byte("orphan"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := WriteContracts(root); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(orphan); !os.IsNotExist(err) {
		t.Fatalf("orphan remains: %v", err)
	}
}
