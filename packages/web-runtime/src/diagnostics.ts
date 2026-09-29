export class UiRuntimeError extends Error {
  constructor(readonly code: string, message: string) { super(message) }
}
