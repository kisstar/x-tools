package preferences

import (
	"bytes"
	"encoding/json"
	"fmt"
	"reflect"
	"sort"
	"strings"
)

func generateTypeScript(definitions []struct {
	id, direction string
	value         any
}) []byte {
	var output bytes.Buffer
	output.WriteString("// Code generated from Go contracts; DO NOT EDIT.\n\n")
	output.WriteString("export const WORKBENCH_PREFERENCES_GET_ID = 'workbench.preferences.get@1' as const\nexport const WORKBENCH_PREFERENCES_UPDATE_ID = 'workbench.preferences.update@1' as const\n\n")
	for _, value := range collectStructTypes(definitions) {
		writeTypeScriptType(&output, value)
	}
	for _, definition := range definitions {
		fmt.Fprintf(&output, "export type %s = %s\n", exportName(definition.id, definition.direction), reflect.TypeOf(definition.value).Name())
	}
	output.WriteByte('\n')
	output.WriteString(validatorRuntime)
	for _, definition := range definitions {
		name := exportName(definition.id, definition.direction)
		schemaJSON, _ := json.Marshal(schemaFor(reflect.TypeOf(definition.value), definition.id+" "+definition.direction))
		fmt.Fprintf(&output, "const %sSchema: Schema = %s as Schema\nexport function validate%s(value: unknown): ValidationResult { return result(validateSchema(%sSchema, value)) }\n\n", lowerFirst(name), schemaJSON, name, lowerFirst(name))
	}
	return bytes.TrimRight(output.Bytes(), "\n")
}

const validatorRuntime = `export interface ValidationResult { readonly valid: boolean; readonly errors: readonly string[] }
type Schema = { readonly type: string; readonly properties?: Readonly<Record<string, Schema>>; readonly required?: readonly string[]; readonly additionalProperties?: boolean | Schema; readonly items?: Schema; readonly minLength?: number }
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const validateSchema = (schema: Schema, value: unknown, path = '$'): string[] => {
  if (schema.type === 'object') {
    if (!isRecord(value)) return [path + ': expected object']
    const errors: string[] = []
    for (const name of schema.required ?? []) if (!(name in value)) errors.push(path + '.' + name + ': required')
    for (const [name, child] of Object.entries(value)) {
      const property = schema.properties?.[name]
      if (property) errors.push(...validateSchema(property, child, path + '.' + name))
      else if (typeof schema.additionalProperties === 'object') errors.push(...validateSchema(schema.additionalProperties, child, path + '.' + name))
      else if (schema.additionalProperties !== true) errors.push(path + '.' + name + ': unknown property')
    }
    return errors
  }
  if (schema.type === 'array') return Array.isArray(value) ? value.flatMap((child, index) => validateSchema(schema.items!, child, path + '[' + index + ']')) : [path + ': expected array']
  if (schema.type === 'number' || schema.type === 'integer') return typeof value === 'number' && Number.isFinite(value) && (schema.type !== 'integer' || Number.isInteger(value)) ? [] : [path + ': expected ' + schema.type]
  if (schema.type === 'string') return typeof value === 'string' && value.length >= (schema.minLength ?? 0) ? [] : [path + ': expected non-empty string']
  return typeof value === schema.type ? [] : [path + ': expected ' + schema.type]
}
const result = (errors: string[]): ValidationResult => ({ valid: errors.length === 0, errors })

`

func collectStructTypes(definitions []struct {
	id, direction string
	value         any
}) []reflect.Type {
	values := map[string]reflect.Type{}
	var visit func(reflect.Type)
	visit = func(value reflect.Type) {
		for value.Kind() == reflect.Pointer {
			value = value.Elem()
		}
		switch value.Kind() {
		case reflect.Struct:
			if value.Name() != "" {
				values[value.Name()] = value
			}
			for index := 0; index < value.NumField(); index++ {
				visit(value.Field(index).Type)
			}
		case reflect.Map, reflect.Slice, reflect.Array:
			visit(value.Elem())
		}
	}
	for _, definition := range definitions {
		visit(reflect.TypeOf(definition.value))
	}
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	result := make([]reflect.Type, 0, len(keys))
	for _, key := range keys {
		result = append(result, values[key])
	}
	return result
}

func writeTypeScriptType(output *bytes.Buffer, value reflect.Type) {
	if value.NumField() == 0 {
		fmt.Fprintf(output, "export type %s = Record<string, never>\n", value.Name())
		return
	}
	fmt.Fprintf(output, "export interface %s {", value.Name())
	for index := 0; index < value.NumField(); index++ {
		field := value.Field(index)
		name, options, _ := strings.Cut(field.Tag.Get("json"), ",")
		if name == "" {
			name = field.Name
		}
		if name == "-" {
			continue
		}
		optional := ""
		if options == "omitempty" {
			optional = "?"
		}
		fmt.Fprintf(output, " readonly %s%s: %s;", name, optional, typeScriptType(field.Type))
	}
	output.WriteString(" }\n")
}
func typeScriptType(value reflect.Type) string {
	for value.Kind() == reflect.Pointer {
		value = value.Elem()
	}
	switch value.Kind() {
	case reflect.Struct:
		return value.Name()
	case reflect.Map:
		return "Readonly<Record<string, " + typeScriptType(value.Elem()) + ">>"
	case reflect.Slice, reflect.Array:
		return "readonly " + typeScriptType(value.Elem()) + "[]"
	case reflect.Bool:
		return "boolean"
	case reflect.Float32, reflect.Float64, reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64, reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
		return "number"
	default:
		return "string"
	}
}
func exportName(id, direction string) string {
	base := strings.TrimSuffix(id, "@1")
	parts := strings.Split(base+"."+direction, ".")
	var output strings.Builder
	for _, part := range parts {
		output.WriteString(strings.ToUpper(part[:1]) + part[1:])
	}
	return output.String()
}
func lowerFirst(value string) string { return strings.ToLower(value[:1]) + value[1:] }
