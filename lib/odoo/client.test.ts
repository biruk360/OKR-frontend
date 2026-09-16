import test from 'node:test'
import assert from 'node:assert/strict'
import {
  encodeCall,
  executeKw,
  isReadOnlyMethod,
  OdooNotConfiguredError,
  OdooWriteRefusedError,
  parseResponse,
  readOdooConfig,
} from './client'

/**
 * The XML-RPC codec had no tests before it was extracted out of
 * lib/odoo-contacts.ts. These pin the wire format and the read-only guard.
 */

// ---------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------

test('encodeCall emits a well-formed methodCall envelope', () => {
  const xml = encodeCall('authenticate', ['mydb', 'bot@example.org', 'key', {}])
  assert.ok(xml.startsWith('<?xml version="1.0"?><methodCall>'))
  assert.ok(xml.includes('<methodName>authenticate</methodName>'))
  assert.ok(xml.includes('<string>mydb</string>'))
  assert.ok(xml.includes('<struct></struct>'))
})

test('encodeCall distinguishes int from double and encodes booleans as 0/1', () => {
  const xml = encodeCall('m', [42, 4.5, true, false])
  assert.ok(xml.includes('<int>42</int>'), xml)
  assert.ok(xml.includes('<double>4.5</double>'), xml)
  assert.ok(xml.includes('<boolean>1</boolean>'), xml)
  assert.ok(xml.includes('<boolean>0</boolean>'), xml)
})

test('encodeCall escapes XML metacharacters in strings and struct keys', () => {
  const xml = encodeCall('m', [{ 'a&b': '<script>"x"</script>' }])
  assert.ok(!xml.includes('<script>'), xml)
  assert.ok(xml.includes('&lt;script&gt;'), xml)
  assert.ok(xml.includes('a&amp;b'), xml)
})

test('a search domain encodes as nested arrays', () => {
  const xml = encodeCall('execute_kw', [[[['write_date', '<', '2026-09-02']]]])
  assert.ok(xml.includes('<string>write_date</string>'))
  assert.ok(xml.includes('<string>&lt;</string>'), 'the operator itself must be escaped')
})

// ---------------------------------------------------------------------------
// Decoding
// ---------------------------------------------------------------------------

function response(inner: string): string {
  return `<?xml version="1.0"?><methodResponse><params><param><value>${inner}</value></param></params></methodResponse>`
}

test('parseResponse decodes scalars', () => {
  assert.equal(parseResponse(response('<int>7</int>')), 7)
  assert.equal(parseResponse(response('<double>1.5</double>')), 1.5)
  assert.equal(parseResponse(response('<boolean>1</boolean>')), true)
  assert.equal(parseResponse(response('<string>hello</string>')), 'hello')
  assert.equal(parseResponse(response('<nil/>')), null)
})

test('parseResponse decodes a search_read row set', () => {
  const xml = response(
    '<array><data>' +
      '<value><struct>' +
        '<member><name>id</name><value><int>11</int></value></member>' +
        '<member><name>name</name><value><string>Awash Bank</string></value></member>' +
        '<member><name>expected_revenue</name><value><double>8400000</double></value></member>' +
      '</struct></value>' +
      '<value><struct>' +
        '<member><name>id</name><value><int>12</int></value></member>' +
        '<member><name>name</name><value><string>Dashen Bank</string></value></member>' +
      '</struct></value>' +
    '</data></array>'
  )
  const rows = parseResponse(xml) as Array<Record<string, unknown>>
  assert.equal(rows.length, 2)
  assert.deepEqual(rows[0], { id: 11, name: 'Awash Bank', expected_revenue: 8400000 })
  assert.equal(rows[1].name, 'Dashen Bank')
})

test('parseResponse decodes entities back to their characters', () => {
  const value = parseResponse(response('<string>R&amp;D &lt;tag&gt; &quot;q&quot;</string>'))
  assert.equal(value, 'R&D <tag> "q"')
})

test('parseResponse handles a many2one pair and an empty array', () => {
  const pair = parseResponse(response('<array><data><value><int>5</int></value><value><string>Acme</string></value></data></array>'))
  assert.deepEqual(pair, [5, 'Acme'])
  assert.deepEqual(parseResponse(response('<array><data></data></array>')), [])
})

test('parseResponse turns an Odoo fault into a thrown error', () => {
  const fault = '<?xml version="1.0"?><methodResponse><fault><value><struct>' +
    '<member><name>faultString</name><value><string>AccessError: not allowed</string></value></member>' +
    '</struct></value></fault></methodResponse>'
  assert.throws(() => parseResponse(fault), /Odoo XML-RPC fault/)
})

test('parseResponse rejects a body with no value', () => {
  assert.throws(() => parseResponse('<?xml version="1.0"?><methodResponse></methodResponse>'), /no <value>/)
})

// ---------------------------------------------------------------------------
// Read-only guard
// ---------------------------------------------------------------------------

test('read methods are allowed, write methods are not', () => {
  for (const method of ['search_read', 'search', 'search_count', 'read', 'read_group', 'fields_get']) {
    assert.equal(isReadOnlyMethod(method), true, method)
  }
  for (const method of ['create', 'write', 'unlink', 'copy', 'action_confirm', 'message_post']) {
    assert.equal(isReadOnlyMethod(method), false, method)
  }
})

test('executeKw refuses a write before doing any I/O', async () => {
  // No Odoo credentials are needed to prove this: the refusal happens first, so
  // a write can never leave the process even when the ERP is reachable.
  await assert.rejects(
    () => executeKw('crm.lead', 'write', [[1], { name: 'x' }]),
    (error: unknown) => {
      assert.ok(error instanceof OdooWriteRefusedError)
      assert.match((error as Error).message, /read-only/)
      return true
    }
  )
})

test('executeKw reports a missing configuration distinctly from a refusal', async () => {
  const hadConfig = readOdooConfig() !== null
  if (hadConfig) return // a configured environment would attempt a real call

  await assert.rejects(
    () => executeKw('crm.lead', 'search_read', [[]]),
    (error: unknown) => {
      assert.ok(error instanceof OdooNotConfiguredError)
      return true
    }
  )
})
