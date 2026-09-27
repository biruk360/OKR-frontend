/**
 * LPV-5 — IP address block-list for the SSRF-safe link-preview fetcher.
 *
 * `isBlockedAddress` answers "may the server open a socket to this address?".
 * It is deliberately conservative: anything it cannot parse is blocked, and any
 * IPv6 form that embeds an IPv4 address (mapped, compatible, translated, NAT64,
 * 6to4) is either judged by the embedded address or blocked outright.
 *
 * Pure — no Node imports — so it is trivially unit-testable.
 */

/** Parse strict dotted-quad IPv4 (`a.b.c.d`, decimal, no leading zeros) to an unsigned 32-bit int. */
export function parseIPv4(input: string): number | null {
  const parts = input.split('.')
  if (parts.length !== 4) return null
  let value = 0
  for (const part of parts) {
    if (!/^(0|[1-9][0-9]{0,2})$/.test(part)) return null
    const n = Number(part)
    if (n > 255) return null
    value = value * 256 + n
  }
  return value
}

/** Parse an IPv6 address (optionally with an embedded dotted IPv4 tail and/or a `%zone`) to eight 16-bit groups. */
export function parseIPv6(input: string): number[] | null {
  let s = input
  const zone = s.indexOf('%')
  if (zone !== -1) s = s.slice(0, zone)
  if (s.length === 0 || !/^[0-9a-fA-F:.]+$/.test(s)) return null

  // Embedded IPv4 tail → two hex groups.
  let tail: number[] = []
  const lastColon = s.lastIndexOf(':')
  if (s.indexOf('.') !== -1) {
    const v4 = parseIPv4(s.slice(lastColon + 1))
    if (v4 === null) return null
    tail = [Math.floor(v4 / 0x10000), v4 % 0x10000]
    s = s.slice(0, lastColon + 1)
    // `::1.2.3.4` leaves `::`; `::ffff:1.2.3.4` leaves `::ffff:` — drop a single trailing colon unless it is part of `::`.
    if (s.slice(-2) !== '::') s = s.slice(0, -1)
  }

  const halves = s.split('::')
  if (halves.length > 2) return null
  const toGroups = (h: string): number[] | null => {
    if (h === '') return []
    const out: number[] = []
    for (const g of h.split(':')) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null
      out.push(parseInt(g, 16))
    }
    return out
  }
  const head = toGroups(halves[0])
  if (head === null) return null
  const needed = 8 - tail.length

  if (halves.length === 1) {
    if (head.length !== needed) return null
    return head.concat(tail)
  }
  const back = toGroups(halves[1])
  if (back === null) return null
  const fill = needed - head.length - back.length
  if (fill < 1) return null
  const zeros: number[] = []
  for (let i = 0; i < fill; i++) zeros.push(0)
  return head.concat(zeros, back, tail)
}

type V4Range = [base: number, prefix: number]

function v4(a: number, b: number, c: number, d: number): number {
  return ((a * 256 + b) * 256 + c) * 256 + d
}

const BLOCKED_V4: V4Range[] = [
  [v4(0, 0, 0, 0), 8], // "this" network / unspecified
  [v4(10, 0, 0, 0), 8], // RFC 1918
  [v4(100, 64, 0, 0), 10], // CGNAT (RFC 6598)
  [v4(127, 0, 0, 0), 8], // loopback
  [v4(169, 254, 0, 0), 16], // link-local incl. cloud metadata 169.254.169.254
  [v4(172, 16, 0, 0), 12], // RFC 1918
  [v4(192, 0, 0, 0), 24], // IETF protocol assignments
  [v4(192, 0, 2, 0), 24], // TEST-NET-1
  [v4(192, 88, 99, 0), 24], // 6to4 relay anycast (deprecated)
  [v4(192, 168, 0, 0), 16], // RFC 1918
  [v4(198, 18, 0, 0), 15], // benchmarking
  [v4(198, 51, 100, 0), 24], // TEST-NET-2
  [v4(203, 0, 113, 0), 24], // TEST-NET-3
  [v4(224, 0, 0, 0), 4], // multicast
  [v4(240, 0, 0, 0), 4], // reserved, incl. 255.255.255.255 broadcast
]

function inV4Range(ip: number, [base, prefix]: V4Range): boolean {
  const size = Math.pow(2, 32 - prefix)
  return ip >= base && ip < base + size
}

export function isBlockedIPv4(ip: number): boolean {
  return BLOCKED_V4.some((r) => inV4Range(ip, r))
}

function embeddedV4(g: number[], hi: number): number {
  return g[hi] * 0x10000 + g[hi + 1]
}

export function isBlockedIPv6(g: number[]): boolean {
  const zeroUpTo = (n: number) => g.slice(0, n).every((x) => x === 0)

  // ::/96 — unspecified (::), loopback (::1) and IPv4-compatible (::a.b.c.d).
  if (zeroUpTo(6)) return isBlockedIPv4(embeddedV4(g, 6))
  // ::ffff:0:0/96 — IPv4-mapped.
  if (zeroUpTo(5) && g[5] === 0xffff) return isBlockedIPv4(embeddedV4(g, 6))
  // ::ffff:0:0:0/96 — IPv4-translated (RFC 2765).
  if (zeroUpTo(4) && g[4] === 0xffff && g[5] === 0) return isBlockedIPv4(embeddedV4(g, 6))
  // 64:ff9b::/96 (well-known NAT64) and 64:ff9b:1::/48 (local-use NAT64) — could reach any IPv4, internal included.
  if (g[0] === 0x64 && g[1] === 0xff9b) return true
  // 100::/64 — discard-only.
  if (g[0] === 0x100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return true
  // 2001::/32 Teredo (tunnels to arbitrary IPv4) and 2001:db8::/32 documentation.
  if (g[0] === 0x2001 && (g[1] === 0 || g[1] === 0xdb8)) return true
  // 2002::/16 — 6to4, embeds an IPv4 address in bits 16..47.
  if (g[0] === 0x2002) return isBlockedIPv4(embeddedV4(g, 1))
  // fc00::/7 — unique local.
  if ((g[0] & 0xfe00) === 0xfc00) return true
  // fe80::/10 link-local and fec0::/10 deprecated site-local.
  if ((g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xffc0) === 0xfec0) return true
  // ff00::/8 — multicast.
  if ((g[0] & 0xff00) === 0xff00) return true
  return false
}

/**
 * True when the server must NOT connect to `ip`. Accepts IPv4 dotted-quad,
 * IPv6 (with or without brackets / zone id). Unparsable input → blocked.
 */
export function isBlockedAddress(ip: string): boolean {
  if (typeof ip !== 'string') return true
  let s = ip.trim()
  if (s.charAt(0) === '[' && s.charAt(s.length - 1) === ']') s = s.slice(1, -1)
  if (s.indexOf(':') === -1) {
    const v = parseIPv4(s)
    return v === null ? true : isBlockedIPv4(v)
  }
  const groups = parseIPv6(s)
  return groups === null ? true : isBlockedIPv6(groups)
}
