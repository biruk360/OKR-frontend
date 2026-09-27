import test from 'node:test'
import assert from 'node:assert/strict'
import { isBlockedAddress, parseIPv6 } from './ip'

/** LPV-5 — the connect-time block-list. */

const BLOCKED = [
  '127.0.0.1', '127.255.255.254', // loopback
  '0.0.0.0', '0.1.2.3', // unspecified / "this" network
  '10.0.0.1', '10.255.255.255', // RFC 1918
  '172.16.0.1', '172.31.255.255', // RFC 1918 172.16/12 edges
  '192.168.1.1', // RFC 1918
  '169.254.169.254', '169.254.0.1', // link-local incl. cloud metadata
  '100.64.0.1', '100.127.255.255', // CGNAT
  '192.0.0.8', '192.0.2.1', '198.18.0.1', '198.19.255.255', '198.51.100.7', '203.0.113.9', // reserved / test nets
  '224.0.0.1', '239.255.255.250', // multicast
  '240.0.0.1', '255.255.255.255', // reserved + broadcast
  '::', '::1', '[::1]', // unspecified / loopback
  'fe80::1', 'fe80::1%en0', 'febf::1', // link-local
  'fc00::', 'fd12:3456:789a::1', // ULA
  'ff02::1', // multicast
  '2001:db8::1', // documentation
  '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.0.0.1', '::ffff:a9fe:a9fe', // IPv4-mapped
  '::127.0.0.1', '::a00:1', // IPv4-compatible
  '64:ff9b::a00:1', '64:ff9b::7f00:1', '64:ff9b::808:808', // NAT64 — whole prefix
  '2002:7f00:1::', '2002:a00:1::1', // 6to4 wrapping internal v4
]

const ALLOWED = [
  '8.8.8.8', '1.1.1.1', '93.184.216.34', '140.82.112.3',
  '172.15.255.255', '172.32.0.1', // just outside 172.16/12
  '100.63.255.255', '100.128.0.1', // just outside CGNAT
  '169.253.255.255', '11.0.0.1', '223.255.255.255',
  '2606:4700::1', '2606:4700:4700::1111', '2a00:1450:4001:80b::200e',
  '::ffff:8.8.8.8', '::ffff:808:808', // mapped public
  '2002:808:808::1', // 6to4 wrapping public v4
]

for (const ip of BLOCKED) {
  test(`blocks ${ip}`, () => assert.equal(isBlockedAddress(ip), true))
}
for (const ip of ALLOWED) {
  test(`allows ${ip}`, () => assert.equal(isBlockedAddress(ip), false))
}

test('anything unparsable is blocked', () => {
  for (const junk of ['', 'localhost', '1.2.3', '1.2.3.4.5', '256.1.1.1', '01.2.3.4', '1::2::3', 'gggg::1', '1:2:3:4:5:6:7:8:9', ':::']) {
    assert.equal(isBlockedAddress(junk), true, junk)
  }
})

test('IPv6 parser expands :: and embedded IPv4 correctly', () => {
  assert.deepEqual(parseIPv6('::ffff:127.0.0.1'), [0, 0, 0, 0, 0, 0xffff, 0x7f00, 1])
  assert.deepEqual(parseIPv6('2606:4700::1'), [0x2606, 0x4700, 0, 0, 0, 0, 0, 1])
  assert.deepEqual(parseIPv6('1:2:3:4:5:6:7:8'), [1, 2, 3, 4, 5, 6, 7, 8])
  assert.equal(parseIPv6('1:2:3:4:5:6:7'), null)
})
