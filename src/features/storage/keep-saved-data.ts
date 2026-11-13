/** The part of the browser's StorageManager this needs. */
export type StorageKeeper = Partial<Pick<StorageManager, 'persist' | 'persisted'>>

const asked = new WeakSet<object>()

/**
 * Asks the browser to keep what Mydrobe saves on this device, rather than
 * treating it as a cache it may clear when the device runs short of space.
 *
 * It's asked once something has been saved, not on arrival, because Firefox
 * shows a prompt for it, which only makes sense once there's something to
 * keep; and only once a visit. Browsers that don't offer it, or say no, carry
 * on saving as before. Resolves to whether the data is now kept.
 */
export async function keepSavedData(storage: StorageKeeper | undefined = globalThis.navigator?.storage): Promise<boolean> {
  if (!storage?.persist || asked.has(storage)) return false
  asked.add(storage)
  try {
    if (await storage.persisted?.()) return true
    return await storage.persist()
  } catch {
    return false
  }
}
