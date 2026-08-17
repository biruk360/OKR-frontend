import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import * as XLSX from 'xlsx'

export type ProjectCreationUploadExtension = 'csv' | 'xls' | 'xlsx' | 'docx'

export type ProjectCreationUploadSecurityCode =
  | 'INVALID_SIGNATURE'
  | 'UNSAFE_ARCHIVE'
  | 'MACRO_ENABLED'
  | 'ENCRYPTED_FILE'
  | 'MALFORMED_FILE'
  | 'MALWARE_DETECTED'
  | 'MALWARE_SCAN_UNAVAILABLE'
  | 'STORAGE_UNAVAILABLE'

export class ProjectCreationUploadSecurityError extends Error {
  constructor(
    message: string,
    readonly code: ProjectCreationUploadSecurityCode,
  ) {
    super(message)
    this.name = 'ProjectCreationUploadSecurityError'
  }
}

export interface ProjectCreationMalwareScanner {
  scan(bytes: Uint8Array): Promise<{ clean: boolean }>
}

export interface ProjectCreationUploadSecurityLimits {
  maxArchiveEntries: number
  maxArchiveEntryBytes: number
  maxArchiveUncompressedBytes: number
  maxCompressionRatio: number
}

export interface SecureProjectCreationUploadResult {
  sourceRef: string
  hash: string
  detectedMimeType: string
  scanStatus: 'CLEAN'
}

const DEFAULT_SECURITY_LIMITS: ProjectCreationUploadSecurityLimits = {
  maxArchiveEntries: 10_000,
  maxArchiveEntryBytes: 50 * 1024 * 1024,
  maxArchiveUncompressedBytes: 100 * 1024 * 1024,
  maxCompressionRatio: 100,
}

const MIME_BY_EXTENSION: Record<ProjectCreationUploadExtension, string> = {
  csv: 'text/csv',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

const OLE_SIGNATURE = Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
const ZIP_SIGNATURES = new Set([0x04034b50, 0x06054b50, 0x08074b50])
const UNSAFE_ARCHIVE_PATHS = [
  /(^|\/)vbaproject\.bin$/i,
  /(^|\/)vbadata\.xml$/i,
  /(^|\/)macrosheets\//i,
  /(^|\/)activex\//i,
  /(^|\/)embeddings\//i,
  /(^|\/)customui\//i,
]

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : fallback
}

export function resolveProjectCreationUploadSecurityLimits(
  env: Readonly<Record<string, string | undefined>> = process.env,
): ProjectCreationUploadSecurityLimits {
  return {
    maxArchiveEntries: boundedInteger(
      env.PROJECT_CREATION_UPLOAD_MAX_ARCHIVE_ENTRIES,
      DEFAULT_SECURITY_LIMITS.maxArchiveEntries,
      1,
      100_000,
    ),
    maxArchiveEntryBytes: boundedInteger(
      env.PROJECT_CREATION_UPLOAD_MAX_ARCHIVE_ENTRY_BYTES,
      DEFAULT_SECURITY_LIMITS.maxArchiveEntryBytes,
      1_048_576,
      500 * 1024 * 1024,
    ),
    maxArchiveUncompressedBytes: boundedInteger(
      env.PROJECT_CREATION_UPLOAD_MAX_UNCOMPRESSED_BYTES,
      DEFAULT_SECURITY_LIMITS.maxArchiveUncompressedBytes,
      1_048_576,
      1024 * 1024 * 1024,
    ),
    maxCompressionRatio: boundedInteger(
      env.PROJECT_CREATION_UPLOAD_MAX_COMPRESSION_RATIO,
      DEFAULT_SECURITY_LIMITS.maxCompressionRatio,
      2,
      10_000,
    ),
  }
}

export function resolveProjectCreationUploadRoot(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const configured = env.PROJECT_CREATION_UPLOAD_DIR?.trim()
  const root = path.resolve(configured || path.join(os.tmpdir(), 'okr-private', 'project-creation-uploads'))
  const publicRoot = path.resolve(process.cwd(), 'public')
  if (root === publicRoot || root.startsWith(`${publicRoot}${path.sep}`)) {
    throw new ProjectCreationUploadSecurityError(
      'Secure upload storage is unavailable. Contact an administrator.',
      'STORAGE_UNAVAILABLE',
    )
  }
  return root
}

function startsWith(bytes: Uint8Array, signature: Uint8Array): boolean {
  return signature.every((value, index) => bytes[index] === value)
}

function includesAscii(bytes: Uint8Array, value: string): boolean {
  return Buffer.from(bytes).includes(Buffer.from(value, 'ascii'))
    || Buffer.from(bytes).includes(Buffer.from(value, 'utf16le'))
}

interface ZipEntry {
  name: string
  compressedSize: number
  uncompressedSize: number
}

function inspectZipArchive(
  bytes: Uint8Array,
  limits: ProjectCreationUploadSecurityLimits,
): ZipEntry[] {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const minimumEocd = 22
  const searchStart = Math.max(0, buffer.length - 65_557)
  let eocd = -1
  for (let offset = buffer.length - minimumEocd; offset >= searchStart; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      eocd = offset
      break
    }
  }
  if (eocd < 0) {
    throw new ProjectCreationUploadSecurityError('The uploaded archive is malformed.', 'MALFORMED_FILE')
  }

  const diskNumber = buffer.readUInt16LE(eocd + 4)
  const centralDisk = buffer.readUInt16LE(eocd + 6)
  const entriesOnDisk = buffer.readUInt16LE(eocd + 8)
  const entryCount = buffer.readUInt16LE(eocd + 10)
  const centralSize = buffer.readUInt32LE(eocd + 12)
  const centralOffset = buffer.readUInt32LE(eocd + 16)
  if (diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount) {
    throw new ProjectCreationUploadSecurityError('Multi-part archives are not accepted.', 'UNSAFE_ARCHIVE')
  }
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new ProjectCreationUploadSecurityError('ZIP64 uploads are not accepted.', 'UNSAFE_ARCHIVE')
  }
  if (entryCount < 1 || entryCount > limits.maxArchiveEntries || centralOffset + centralSize > eocd) {
    throw new ProjectCreationUploadSecurityError('The uploaded archive exceeds safety limits.', 'UNSAFE_ARCHIVE')
  }

  const entries: ZipEntry[] = []
  const names = new Set<string>()
  let totalCompressed = 0
  let totalUncompressed = 0
  let cursor = centralOffset
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > eocd || buffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw new ProjectCreationUploadSecurityError('The uploaded archive is malformed.', 'MALFORMED_FILE')
    }
    const flags = buffer.readUInt16LE(cursor + 8)
    const compressionMethod = buffer.readUInt16LE(cursor + 10)
    const compressedSize = buffer.readUInt32LE(cursor + 20)
    const uncompressedSize = buffer.readUInt32LE(cursor + 24)
    const nameLength = buffer.readUInt16LE(cursor + 28)
    const extraLength = buffer.readUInt16LE(cursor + 30)
    const commentLength = buffer.readUInt16LE(cursor + 32)
    const next = cursor + 46 + nameLength + extraLength + commentLength
    if (next > eocd || compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
      throw new ProjectCreationUploadSecurityError('The uploaded archive is malformed.', 'MALFORMED_FILE')
    }
    if ((flags & 0x1) !== 0) {
      throw new ProjectCreationUploadSecurityError('Encrypted uploads are not accepted.', 'ENCRYPTED_FILE')
    }
    if (compressionMethod !== 0 && compressionMethod !== 8) {
      throw new ProjectCreationUploadSecurityError('The archive uses an unsupported compression method.', 'UNSAFE_ARCHIVE')
    }
    const name = buffer.toString('utf8', cursor + 46, cursor + 46 + nameLength).replace(/\\/g, '/')
    const normalized = path.posix.normalize(name)
    if (!name || name.startsWith('/') || /^[a-z]:/i.test(name) || normalized === '..' || normalized.startsWith('../')) {
      throw new ProjectCreationUploadSecurityError('The archive contains an unsafe path.', 'UNSAFE_ARCHIVE')
    }
    const key = normalized.toLowerCase()
    if (names.has(key)) {
      throw new ProjectCreationUploadSecurityError('The archive contains duplicate entries.', 'UNSAFE_ARCHIVE')
    }
    names.add(key)
    if (UNSAFE_ARCHIVE_PATHS.some((pattern) => pattern.test(key))) {
      throw new ProjectCreationUploadSecurityError('Macro-enabled or active-content files are not accepted.', 'MACRO_ENABLED')
    }
    if (uncompressedSize > limits.maxArchiveEntryBytes) {
      throw new ProjectCreationUploadSecurityError('An archive entry exceeds the safety limit.', 'UNSAFE_ARCHIVE')
    }
    if (uncompressedSize > 1_048_576 && uncompressedSize / Math.max(1, compressedSize) > limits.maxCompressionRatio) {
      throw new ProjectCreationUploadSecurityError('The archive compression ratio is unsafe.', 'UNSAFE_ARCHIVE')
    }
    totalCompressed += compressedSize
    totalUncompressed += uncompressedSize
    if (totalUncompressed > limits.maxArchiveUncompressedBytes) {
      throw new ProjectCreationUploadSecurityError('The expanded archive exceeds the safety limit.', 'UNSAFE_ARCHIVE')
    }
    entries.push({ name: normalized, compressedSize, uncompressedSize })
    cursor = next
  }
  if (totalUncompressed > 1_048_576
    && totalUncompressed / Math.max(1, totalCompressed) > limits.maxCompressionRatio) {
    throw new ProjectCreationUploadSecurityError('The archive compression ratio is unsafe.', 'UNSAFE_ARCHIVE')
  }
  return entries
}

export function validateProjectCreationUploadContent(input: {
  bytes: Uint8Array
  extension: ProjectCreationUploadExtension
  limits?: ProjectCreationUploadSecurityLimits
}): { detectedMimeType: string } {
  const { bytes, extension } = input
  if (bytes.byteLength < 1) {
    throw new ProjectCreationUploadSecurityError('The selected file is empty.', 'INVALID_SIGNATURE')
  }
  if (extension === 'csv') {
    if (bytes.includes(0)) {
      throw new ProjectCreationUploadSecurityError('The CSV content does not match its extension.', 'INVALID_SIGNATURE')
    }
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
      throw new ProjectCreationUploadSecurityError('The CSV must contain valid UTF-8 text.', 'INVALID_SIGNATURE')
    }
    return { detectedMimeType: MIME_BY_EXTENSION.csv }
  }
  if (extension === 'xls') {
    if (!startsWith(bytes, OLE_SIGNATURE)) {
      throw new ProjectCreationUploadSecurityError('The XLS signature does not match its extension.', 'INVALID_SIGNATURE')
    }
    if (includesAscii(bytes, 'EncryptedPackage') || includesAscii(bytes, 'EncryptionInfo')) {
      throw new ProjectCreationUploadSecurityError('Encrypted uploads are not accepted.', 'ENCRYPTED_FILE')
    }
    try {
      const workbook = XLSX.read(bytes, { type: 'array', bookVBA: true })
      if (workbook.vbaraw) {
        throw new ProjectCreationUploadSecurityError('Macro-enabled files are not accepted.', 'MACRO_ENABLED')
      }
    } catch (error) {
      if (error instanceof ProjectCreationUploadSecurityError) throw error
      throw new ProjectCreationUploadSecurityError('The XLS file is malformed or encrypted.', 'MALFORMED_FILE')
    }
    return { detectedMimeType: MIME_BY_EXTENSION.xls }
  }

  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (buffer.length < 4 || !ZIP_SIGNATURES.has(buffer.readUInt32LE(0))) {
    throw new ProjectCreationUploadSecurityError(
      `The ${extension.toUpperCase()} signature does not match its extension.`,
      'INVALID_SIGNATURE',
    )
  }
  const entries = inspectZipArchive(bytes, input.limits ?? resolveProjectCreationUploadSecurityLimits())
  const names = new Set(entries.map((entry) => entry.name.toLowerCase()))
  if (!names.has('[content_types].xml')) {
    throw new ProjectCreationUploadSecurityError('The Office archive is malformed.', 'MALFORMED_FILE')
  }
  if (extension === 'xlsx') {
    if (!names.has('xl/workbook.xml')) {
      throw new ProjectCreationUploadSecurityError('The XLSX workbook is malformed.', 'MALFORMED_FILE')
    }
    try {
      const workbook = XLSX.read(bytes, { type: 'array', bookVBA: true })
      if (workbook.vbaraw) {
        throw new ProjectCreationUploadSecurityError('Macro-enabled files are not accepted.', 'MACRO_ENABLED')
      }
    } catch (error) {
      if (error instanceof ProjectCreationUploadSecurityError) throw error
      throw new ProjectCreationUploadSecurityError('The XLSX file is malformed or encrypted.', 'MALFORMED_FILE')
    }
  } else if (!names.has('word/document.xml')) {
    throw new ProjectCreationUploadSecurityError('The DOCX document is malformed.', 'MALFORMED_FILE')
  }
  return { detectedMimeType: MIME_BY_EXTENSION[extension] }
}

export function createClamAvProjectCreationScanner(
  env: Readonly<Record<string, string | undefined>> = process.env,
): ProjectCreationMalwareScanner {
  const host = env.PROJECT_CREATION_CLAMAV_HOST?.trim()
  const port = boundedInteger(env.PROJECT_CREATION_CLAMAV_PORT, 3310, 1, 65_535)
  const timeoutMs = boundedInteger(env.PROJECT_CREATION_CLAMAV_TIMEOUT_MS, 10_000, 250, 60_000)
  return {
    async scan(bytes) {
      if (!host) {
        throw new ProjectCreationUploadSecurityError(
          'File safety scanning is temporarily unavailable. Try again later.',
          'MALWARE_SCAN_UNAVAILABLE',
        )
      }
      return new Promise<{ clean: boolean }>((resolve, reject) => {
        const socket = net.createConnection({ host, port })
        let response = ''
        let settled = false
        const finish = (operation: () => void) => {
          if (settled) return
          settled = true
          socket.destroy()
          operation()
        }
        socket.setTimeout(timeoutMs)
        socket.on('connect', () => {
          socket.write(Buffer.from('zINSTREAM\0'))
          const chunkSize = 64 * 1024
          for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
            const chunk = Buffer.from(bytes.slice(offset, Math.min(offset + chunkSize, bytes.byteLength)))
            const size = Buffer.allocUnsafe(4)
            size.writeUInt32BE(chunk.byteLength)
            socket.write(size)
            socket.write(chunk)
          }
          socket.end(Buffer.alloc(4))
        })
        socket.on('data', (chunk) => { response += chunk.toString('utf8') })
        socket.on('timeout', () => finish(() => reject(new ProjectCreationUploadSecurityError(
          'File safety scanning is temporarily unavailable. Try again later.',
          'MALWARE_SCAN_UNAVAILABLE',
        ))))
        socket.on('error', () => finish(() => reject(new ProjectCreationUploadSecurityError(
          'File safety scanning is temporarily unavailable. Try again later.',
          'MALWARE_SCAN_UNAVAILABLE',
        ))))
        socket.on('close', () => finish(() => {
          if (/\bOK\s*\0?$/i.test(response.trim())) return resolve({ clean: true })
          if (/\bFOUND\s*\0?$/i.test(response.trim())) return resolve({ clean: false })
          reject(new ProjectCreationUploadSecurityError(
            'File safety scanning is temporarily unavailable. Try again later.',
            'MALWARE_SCAN_UNAVAILABLE',
          ))
        }))
      })
    },
  }
}

function validateSourceRef(sourceRef: string): string[] {
  const parts = sourceRef.split('/')
  if (parts.length !== 3
    || parts[0] !== 'v1'
    || !/^[a-zA-Z0-9_-]+$/.test(parts[1])
    || !/^[a-f0-9-]+\.(csv|xls|xlsx|docx)$/.test(parts[2])) {
    throw new ProjectCreationUploadSecurityError('The secure source reference is invalid.', 'STORAGE_UNAVAILABLE')
  }
  return parts
}

function sourcePath(root: string, sourceRef: string): string {
  const resolved = path.resolve(root, ...validateSourceRef(sourceRef))
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new ProjectCreationUploadSecurityError('The secure source reference is invalid.', 'STORAGE_UNAVAILABLE')
  }
  return resolved
}

export async function secureProjectCreationUpload(input: {
  draftId: string
  extension: ProjectCreationUploadExtension
  bytes: Uint8Array
  scanner?: ProjectCreationMalwareScanner
  storageRoot?: string
  limits?: ProjectCreationUploadSecurityLimits
}): Promise<SecureProjectCreationUploadResult> {
  if (!/^[a-zA-Z0-9_-]+$/.test(input.draftId)) {
    throw new ProjectCreationUploadSecurityError('The upload target is invalid.', 'STORAGE_UNAVAILABLE')
  }
  const validated = validateProjectCreationUploadContent({
    bytes: input.bytes,
    extension: input.extension,
    limits: input.limits,
  })
  let scanResult: { clean: boolean }
  try {
    scanResult = await (input.scanner ?? createClamAvProjectCreationScanner()).scan(input.bytes)
  } catch (error) {
    if (error instanceof ProjectCreationUploadSecurityError) throw error
    throw new ProjectCreationUploadSecurityError(
      'File safety scanning is temporarily unavailable. Try again later.',
      'MALWARE_SCAN_UNAVAILABLE',
    )
  }
  if (!scanResult.clean) {
    throw new ProjectCreationUploadSecurityError(
      'The uploaded file did not pass the malware safety scan.',
      'MALWARE_DETECTED',
    )
  }

  const root = path.resolve(input.storageRoot ?? resolveProjectCreationUploadRoot())
  const sourceRef = `v1/${input.draftId}/${randomUUID()}.${input.extension}`
  const destination = sourcePath(root, sourceRef)
  try {
    await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 })
    await writeFile(destination, input.bytes, { flag: 'wx', mode: 0o600 })
  } catch {
    throw new ProjectCreationUploadSecurityError(
      'Secure upload storage is temporarily unavailable. Try again later.',
      'STORAGE_UNAVAILABLE',
    )
  }
  return {
    sourceRef,
    hash: createHash('sha256').update(input.bytes).digest('hex'),
    detectedMimeType: validated.detectedMimeType,
    scanStatus: 'CLEAN',
  }
}

export async function readSecureProjectCreationUpload(
  sourceRef: string,
  storageRoot = resolveProjectCreationUploadRoot(),
): Promise<Uint8Array> {
  try {
    return new Uint8Array(await readFile(sourcePath(path.resolve(storageRoot), sourceRef)))
  } catch (error) {
    if (error instanceof ProjectCreationUploadSecurityError) throw error
    throw new ProjectCreationUploadSecurityError(
      'The retained source file is unavailable. Upload it again.',
      'STORAGE_UNAVAILABLE',
    )
  }
}

export async function deleteSecureProjectCreationUpload(
  sourceRef: string | null | undefined,
  storageRoot = resolveProjectCreationUploadRoot(),
): Promise<void> {
  if (!sourceRef) return
  try {
    await unlink(sourcePath(path.resolve(storageRoot), sourceRef))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}
