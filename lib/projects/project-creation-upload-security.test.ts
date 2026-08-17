import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  ProjectCreationUploadSecurityError,
  createClamAvProjectCreationScanner,
  deleteSecureProjectCreationUpload,
  readSecureProjectCreationUpload,
  resolveProjectCreationUploadRoot,
  secureProjectCreationUpload,
  validateProjectCreationUploadContent,
} from './creation-upload-security'
import { createScheduleImportTemplate } from './schedule-import-template'

const ROOT = process.cwd()
const source = (relativePath: string) => readFileSync(path.join(ROOT, relativePath), 'utf8')

function centralOnlyZip(entries: Array<{
  name: string
  compressedSize?: number
  uncompressedSize?: number
  flags?: number
}>): Uint8Array {
  const centralParts = entries.map((entry) => {
    const name = Buffer.from(entry.name)
    const record = Buffer.alloc(46 + name.length)
    record.writeUInt32LE(0x02014b50, 0)
    record.writeUInt16LE(entry.flags ?? 0, 8)
    record.writeUInt16LE(8, 10)
    record.writeUInt32LE(entry.compressedSize ?? 1, 20)
    record.writeUInt32LE(entry.uncompressedSize ?? 1, 24)
    record.writeUInt16LE(name.length, 28)
    name.copy(record, 46)
    return record
  })
  const central = Buffer.concat(centralParts)
  const prefix = Buffer.alloc(4)
  prefix.writeUInt32LE(0x04034b50, 0)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(central.length, 12)
  eocd.writeUInt32LE(prefix.length, 16)
  return Buffer.concat([prefix, central, eocd])
}

describe('Project creation secure upload storage', () => {
  it('stores a clean XLSX outside public paths under a generated private reference', async () => {
    const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'story21-upload-'))
    try {
      const bytes = createScheduleImportTemplate('xlsx').bytes
      const result = await secureProjectCreationUpload({
        draftId: 'draft-21',
        extension: 'xlsx',
        bytes,
        storageRoot: temporaryRoot,
        scanner: { scan: async () => ({ clean: true }) },
      })
      assert.match(result.sourceRef, /^v1\/draft-21\/[a-f0-9-]+\.xlsx$/)
      assert.equal(result.hash.length, 64)
      assert.equal(result.scanStatus, 'CLEAN')
      assert.equal(result.sourceRef.includes('schedule'), false)
      assert.deepEqual(
        Buffer.from(await readSecureProjectCreationUpload(result.sourceRef, temporaryRoot)),
        Buffer.from(bytes),
      )

      const storedPath = path.join(temporaryRoot, ...result.sourceRef.split('/'))
      const mode = (await stat(storedPath)).mode & 0o777
      assert.equal(mode, 0o600)
      assert.deepEqual(Buffer.from(await readFile(storedPath)), Buffer.from(bytes))
      await deleteSecureProjectCreationUpload(result.sourceRef, temporaryRoot)
      await assert.rejects(stat(storedPath), { code: 'ENOENT' })
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true })
    }
  })

  it('fails closed on malware or an unavailable scanner and stores nothing', async () => {
    const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'story21-malware-'))
    const bytes = new TextEncoder().encode('Row ID,Phase,Milestone,Activity\nA,Plan,Gate,Review')
    try {
      await assert.rejects(
        secureProjectCreationUpload({
          draftId: 'draft-21', extension: 'csv', bytes, storageRoot: temporaryRoot,
          scanner: { scan: async () => ({ clean: false }) },
        }),
        (error: unknown) => error instanceof ProjectCreationUploadSecurityError
          && error.code === 'MALWARE_DETECTED',
      )
      await assert.rejects(
        createClamAvProjectCreationScanner({}).scan(bytes),
        (error: unknown) => error instanceof ProjectCreationUploadSecurityError
          && error.code === 'MALWARE_SCAN_UNAVAILABLE',
      )
      await assert.rejects(stat(path.join(temporaryRoot, 'v1')), { code: 'ENOENT' })
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true })
    }
  })

  it('rejects mismatched signatures, encrypted archives, macros, traversal, and ZIP bombs', () => {
    assert.throws(
      () => validateProjectCreationUploadContent({
        extension: 'xlsx', bytes: new TextEncoder().encode('not an Office archive'),
      }),
      (error: unknown) => error instanceof ProjectCreationUploadSecurityError
        && error.code === 'INVALID_SIGNATURE',
    )
    assert.throws(
      () => validateProjectCreationUploadContent({
        extension: 'xlsx', bytes: centralOnlyZip([{ name: '[Content_Types].xml', flags: 1 }]),
      }),
      (error: unknown) => error instanceof ProjectCreationUploadSecurityError
        && error.code === 'ENCRYPTED_FILE',
    )
    assert.throws(
      () => validateProjectCreationUploadContent({
        extension: 'xlsx', bytes: centralOnlyZip([{ name: 'xl/vbaProject.bin' }]),
      }),
      (error: unknown) => error instanceof ProjectCreationUploadSecurityError
        && error.code === 'MACRO_ENABLED',
    )
    assert.throws(
      () => validateProjectCreationUploadContent({
        extension: 'docx', bytes: centralOnlyZip([{ name: '../word/document.xml' }]),
      }),
      (error: unknown) => error instanceof ProjectCreationUploadSecurityError
        && error.code === 'UNSAFE_ARCHIVE',
    )
    assert.throws(
      () => validateProjectCreationUploadContent({
        extension: 'docx',
        bytes: centralOnlyZip([{
          name: '[Content_Types].xml', compressedSize: 1, uncompressedSize: 20 * 1024 * 1024,
        }]),
        limits: {
          maxArchiveEntries: 10,
          maxArchiveEntryBytes: 50 * 1024 * 1024,
          maxArchiveUncompressedBytes: 100 * 1024 * 1024,
          maxCompressionRatio: 100,
        },
      }),
      (error: unknown) => error instanceof ProjectCreationUploadSecurityError
        && error.code === 'UNSAFE_ARCHIVE',
    )
  })

  it('rejects a configured storage root under the public directory', () => {
    assert.throws(
      () => resolveProjectCreationUploadRoot({
        PROJECT_CREATION_UPLOAD_DIR: path.join(process.cwd(), 'public', 'uploads'),
      }),
      (error: unknown) => error instanceof ProjectCreationUploadSecurityError
        && error.code === 'STORAGE_UNAVAILABLE',
    )
  })

  it('wires scan-before-parse, private source persistence, cleanup, and safe error envelopes', () => {
    const uploadRoute = source('app/api/projects/creation-drafts/[id]/upload/route.ts')
    const analyzeRoute = source('app/api/projects/creation-drafts/[id]/analyze/route.ts')
    const draftRoute = source('app/api/projects/creation-drafts/[id]/route.ts')
    const draftService = source('lib/projects/creation-draft.ts')
    const errorAdapter = source('lib/projects/creation-import-api.ts')

    for (const route of [uploadRoute, analyzeRoute]) {
      assert.match(route, /secureProjectCreationUpload\(\{/)
      assert.ok(route.indexOf('secureProjectCreationUpload({') < route.indexOf('inspectProjectCreationSpreadsheet('))
      assert.match(route, /sourceRef: retainedUpload\.sourceRef/)
      assert.match(route, /scanStatus: retainedUpload\.scanStatus/)
      assert.match(route, /deleteSecureProjectCreationUpload/)
    }
    assert.match(draftService, /sourceRef: sourceMetadata\.sourceRef/)
    assert.match(draftService, /scanStatus: sourceMetadata\.scanStatus/)
    assert.doesNotMatch(draftService, /sourceRef: sourceMetadata\.sourceRef,[\s\S]{0,500}metadata: \{[\s\S]*sourceRef:/)
    assert.match(draftRoute, /deleteSecureProjectCreationUpload\(previous\.sourceRef\)/)
    assert.match(errorAdapter, /MALWARE_SCAN_UNAVAILABLE/)
    assert.match(errorAdapter, /UNSAFE_FILE/)
  })
})
