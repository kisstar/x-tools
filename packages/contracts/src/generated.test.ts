import { describe, expect, it } from 'vitest'

import {
  validateWorkbenchPreferencesGetInput,
  validateWorkbenchPreferencesUpdateInput,
} from './generated.ts'

describe('generated preferences validators', () => {
  it('validates empty get input', () => {
    expect(validateWorkbenchPreferencesGetInput({}).valid).toBe(true)
    expect(validateWorkbenchPreferencesGetInput({ unexpected: true }).valid).toBe(false)
  })

  it('requires revision and preferences for update', () => {
    expect(validateWorkbenchPreferencesUpdateInput({ expectedRevision: '1', preferences: { global: {}, workspaces: {} } }).valid).toBe(true)
    expect(validateWorkbenchPreferencesUpdateInput({ expectedRevision: '1' }).valid).toBe(false)
    expect(validateWorkbenchPreferencesUpdateInput({ expectedRevision: '1', preferences: { global: {}, workspaces: [] } }).valid).toBe(false)
  })
})
