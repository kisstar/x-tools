/**
 * PluginHost (§9, §11, §13) — discovery / install / activate / effect-teardown
 * and the manifest-capability gate (gate ②'s backing data). Deferred: no plugin
 * loads until Step 5; the channel server already enforces the three gates, so
 * nothing here is on the critical path yet.
 *
 * The one honest commitment made now is the lifecycle vocabulary, lifted
 * verbatim from §11 so later code doesn't invent a fourth state:
 *
 *   discovered → installed → active
 *
 * `failed` is the terminal state a third-party plugin lands in when it declares
 * `shell.elevate` or `fsScope: unrestricted` (§12.3) — load-time reject, no user
 * prompt. It isn't in the happy path, so it's modeled only when the host exists.
 */

export type PluginState = "discovered" | "installed" | "active"
