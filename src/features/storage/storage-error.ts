/** Saving on this device failed; the message says what to do about it. */
export class StorageError extends Error {}

function isOutOfSpace(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  // Dexie reports a full disk directly, or as the reason a transaction gave up.
  return error.name === 'QuotaExceededError' || isOutOfSpace((error as Error & { inner?: unknown }).inner)
}

/** Turns whatever went wrong while saving into a message someone can act on. */
export function toStorageError(error: unknown): StorageError {
  return new StorageError(
    isOutOfSpace(error)
      ? "There isn't enough space on this device to save it. Remove pieces you don't need or free up some space, then try again."
      : "Couldn't save it on this device. Please try again.",
  )
}
