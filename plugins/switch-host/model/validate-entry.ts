/**
 * Entry validation (plugin-model layer) — pure predicates over a HostEntry's
 * `ip` / `domain`, ported from the PRD §6.3 rules. These run in the ui/ layer
 * for form feedback and again behind the plugin channel before anything reaches
 * /etc/hosts (the kernel's zod gate is the real trust boundary; this is the
 * domain's own notion of "well-formed").
 */

import type { HostEntry } from "./host-model"

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/

// ponytail: pragmatic IPv6 — accepts hex groups and one `::` compression, good
// enough for hosts entries. Not a full RFC 4291 grammar (no embedded IPv4,
// no zone id); tighten only if a real address slips through or is wrongly
// rejected.
const IPV6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|::1|::)$/

// RFC 1123 hostname: dot-separated labels of [a-zA-Z0-9-], each 1–63 chars,
// no leading/trailing hyphen, whole name ≤253 chars. Single-label (localhost) ok.
const HOSTNAME =
  /^(?=.{1,253}$)[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/

export function isValidIp(ip: string): boolean {
  return IPV4.test(ip) || IPV6.test(ip)
}

export function isValidDomain(domain: string): boolean {
  return HOSTNAME.test(domain)
}

/** Problems with an entry's address/domain; empty array means well-formed. */
export function validateEntry(entry: Pick<HostEntry, "ip" | "domain">): readonly string[] {
  const errors: string[] = []
  if (!isValidIp(entry.ip)) errors.push(`invalid ip: ${entry.ip}`)
  if (!isValidDomain(entry.domain)) errors.push(`invalid domain: ${entry.domain}`)
  return errors
}
