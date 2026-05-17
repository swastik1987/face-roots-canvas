/**
 * Tiny in-memory singleton for handing a File object from one route to the
 * next without going through the History API (which requires structured-clone
 * serialization — File objects can silently fail in sandboxed environments).
 *
 * Usage:
 *   // caller (e.g. Home.tsx):
 *   setPendingFile(file);
 *   navigate('/family/add?...');
 *
 *   // receiver (e.g. FamilyAdd.tsx), in a mount useEffect:
 *   const file = consumePendingFile();
 *   if (file) handleFile(file);
 */

let _pending: File | null = null;

/** Store a file to be picked up by the next route. */
export function setPendingFile(file: File): void {
  _pending = file;
}

/**
 * Retrieve and clear the pending file.
 * Returns null if nothing was stored.
 */
export function consumePendingFile(): File | null {
  const f = _pending;
  _pending = null;
  return f;
}
