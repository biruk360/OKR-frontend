/**
 * Operating package service error — mapped to the API envelope by http.server.ts.
 */
export type PackageErrorStatus = 400 | 403 | 404 | 409 | 423

export class PackageError extends Error {
  constructor(
    public readonly status: PackageErrorStatus,
    message: string,
    public readonly code: string = 'PACKAGE_ERROR',
  ) {
    super(message)
    this.name = 'PackageError'
  }
}

export function isPackageError(error: unknown): error is PackageError {
  return error instanceof PackageError
}
