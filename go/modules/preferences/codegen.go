package preferences

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"

	"github.com/kisstar/x-tools/go/contracts"
)

type schema struct {
	Schema               string            `json:"$schema"`
	Comment              string            `json:"$comment"`
	Title                string            `json:"title"`
	Type                 string            `json:"type"`
	Properties           orderedProperties `json:"properties,omitempty"`
	Required             []string          `json:"required,omitempty"`
	AdditionalProperties any               `json:"additionalProperties"`
	Items                *schema           `json:"items,omitempty"`
	MinLength            int               `json:"minLength,omitempty"`
}
type orderedProperties map[string]schema

func (properties orderedProperties) MarshalJSON() ([]byte, error) {
	keys := make([]string, 0, len(properties))
	for key := range properties {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	var output bytes.Buffer
	output.WriteByte('{')
	for index, key := range keys {
		if index > 0 {
			output.WriteByte(',')
		}
		encodedKey, _ := json.Marshal(key)
		encodedValue, err := json.Marshal(properties[key])
		if err != nil {
			return nil, err
		}
		output.Write(encodedKey)
		output.WriteByte(':')
		output.Write(encodedValue)
	}
	output.WriteByte('}')
	return output.Bytes(), nil
}

func GenerateContracts() (map[string][]byte, error) {
	definitions := []struct {
		id, direction string
		value         any
	}{
		{string(GetID), "input", GetInput{}},
		{string(GetID), "output", GetOutput{}},
		{string(UpdateID), "input", UpdateInput{}},
		{string(UpdateID), "output", UpdateOutput{}},
	}
	files := make(map[string][]byte, 5)
	for _, definition := range definitions {
		generated, err := json.MarshalIndent(
			schemaFor(reflect.TypeOf(definition.value), definition.id+" "+definition.direction),
			"",
			"  ",
		)
		if err != nil {
			return nil, err
		}
		generated = append(generated, '\n')
		files[fmt.Sprintf("contracts/schema/%s/%s.json", definition.id, definition.direction)] = generated
	}
	files["packages/contracts/src/generated.ts"] = generateTypeScript(definitions)
	return files, nil
}

func WriteContracts(root string) error {
	files, err := GenerateContracts()
	if err != nil {
		return err
	}
	schemaRoot := filepath.Join(root, "contracts", "schema")
	if err := os.RemoveAll(schemaRoot); err != nil {
		return err
	}
	paths := make([]string, 0, len(files))
	for path := range files {
		paths = append(paths, path)
	}
	sort.Strings(paths)
	for _, path := range paths {
		absolute := filepath.Join(root, filepath.FromSlash(path))
		if err := os.MkdirAll(filepath.Dir(absolute), 0o755); err != nil {
			return err
		}
		if err := os.WriteFile(absolute, files[path], 0o644); err != nil {
			return err
		}
	}
	return nil
}

func RuntimeSchema(value any) contracts.JSONSchema { return runtimeSchemaFor(reflect.TypeOf(value)) }

func runtimeSchemaFor(value reflect.Type) contracts.JSONSchema {
	for value.Kind() == reflect.Pointer {
		value = value.Elem()
	}
	result := contracts.JSONSchema{
		Type:                 schemaType(value),
		AdditionalProperties: contracts.AdditionalProperties{Allowed: false},
	}
	switch value.Kind() {
	case reflect.Struct:
		result.Properties = make(map[string]contracts.JSONSchema)
		for index := 0; index < value.NumField(); index++ {
			field := value.Field(index)
			name, options, _ := strings.Cut(field.Tag.Get("json"), ",")
			if name == "" {
				name = field.Name
			}
			if name == "-" {
				continue
			}
			result.Properties[name] = runtimeSchemaFor(field.Type)
			if field.Tag.Get("minLength") != "" {
				child := result.Properties[name]
				_, _ = fmt.Sscan(field.Tag.Get("minLength"), &child.MinLength)
				result.Properties[name] = child
			}
			if options != "omitempty" {
				result.Required = append(result.Required, name)
			}
		}
	case reflect.Map:
		child := runtimeSchemaFor(value.Elem())
		result.AdditionalProperties.Schema = &child
	case reflect.Slice, reflect.Array:
		child := runtimeSchemaFor(value.Elem())
		result.Items = &child
	}
	return result
}

func schemaType(value reflect.Type) string {
	switch value.Kind() {
	case reflect.Struct, reflect.Map:
		return "object"
	case reflect.Slice, reflect.Array:
		return "array"
	case reflect.Bool:
		return "boolean"
	case reflect.Int,
		reflect.Int8,
		reflect.Int16,
		reflect.Int32,
		reflect.Int64,
		reflect.Uint,
		reflect.Uint8,
		reflect.Uint16,
		reflect.Uint32,
		reflect.Uint64:
		return "integer"
	case reflect.Float32, reflect.Float64:
		return "number"
	default:
		return "string"
	}
}

func schemaFor(value reflect.Type, title string) schema {
	for value.Kind() == reflect.Pointer {
		value = value.Elem()
	}
	result := schema{
		Schema:               "https://json-schema.org/draft/2020-12/schema",
		Comment:              "Code generated from Go contracts; DO NOT EDIT.",
		Title:                title,
		AdditionalProperties: false,
	}
	switch value.Kind() {
	case reflect.Struct:
		result.Type = "object"
		result.Properties = orderedProperties{}
		for index := 0; index < value.NumField(); index++ {
			field := value.Field(index)
			name, options, _ := strings.Cut(field.Tag.Get("json"), ",")
			if name == "" {
				name = field.Name
			}
			if name == "-" {
				continue
			}
			result.Properties[name] = schemaFor(field.Type, field.Name)
			if field.Tag.Get("minLength") != "" {
				child := result.Properties[name]
				_, _ = fmt.Sscan(field.Tag.Get("minLength"), &child.MinLength)
				result.Properties[name] = child
			}
			if options != "omitempty" {
				result.Required = append(result.Required, name)
			}
		}
	case reflect.Map:
		result.Type = "object"
		result.AdditionalProperties = schemaFor(value.Elem(), title)
	case reflect.Slice, reflect.Array:
		result.Type = "array"
		item := schemaFor(value.Elem(), title)
		result.Items = &item
	case reflect.Bool:
		result.Type = "boolean"
	case reflect.Int,
		reflect.Int8,
		reflect.Int16,
		reflect.Int32,
		reflect.Int64,
		reflect.Uint,
		reflect.Uint8,
		reflect.Uint16,
		reflect.Uint32,
		reflect.Uint64:
		result.Type = "integer"
	case reflect.Float32, reflect.Float64:
		result.Type = "number"
	default:
		result.Type = "string"
	}
	return result
}
