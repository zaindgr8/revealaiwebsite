'use client';

/**
 * Local durable cache for recordings awaiting upload (N-7).
 *
 * "The system handles upload failure and processing failure without losing the
 * user's recording."
 *
 * Holding the Blob in React state satisfies that only until the tab is
 * refreshed or closed — and the realistic failure is exactly that: patchy
 * signal at the end of a long conversation, the upload stalls, the user
 * navigates away or the browser reclaims the tab. A twenty-minute conversation
 * cannot be recorded again. It happened once.
 *
 * So the recording is written to IndexedDB the moment it stops, before any
 * upload is attempted, and only removed once the upload is confirmed. A
 * pending recording is then recoverable on the next visit.
 *
 * IndexedDB rather than localStorage because localStorage cannot hold binary
 * and caps around 5MB — twenty minutes at 64kbps is roughly 10MB.
 */

const DB_NAME = 'revealai-recordings';
const DB_VERSION = 1;
const STORE = 'pending';

export type PendingRecording = {
  sessionId: string;
  /**
   * Ordered segments. A long conversation is recorded as several independent
   * files so they can be transcribed in parallel (see useSegmentedRecorder),
   * and all of them have to survive together — a set missing its third segment
   * is a conversation with a hole in it, which is worse than none at all.
   */
  segments: { blob: Blob; mimeType: string; durationSeconds: number }[];
  savedAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable in this browser'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'sessionId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Could not open IndexedDB'));
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = fn(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
        transaction.oncomplete = () => db.close();
      })
  );
}

/**
 * Persist a recording before attempting upload.
 *
 * Failure here is logged but not thrown. If IndexedDB is unavailable — private
 * browsing, quota exhausted, an older browser — the upload should still be
 * attempted with the in-memory Blob. Degraded durability is better than
 * refusing to accept a conversation that already happened.
 */
export async function cachePendingRecording(rec: Omit<PendingRecording, 'savedAt'>): Promise<boolean> {
  try {
    await tx('readwrite', (store) =>
      store.put({ ...rec, savedAt: Date.now() } satisfies PendingRecording)
    );
    return true;
  } catch (err) {
    console.error('[recordingCache] could not cache recording:', err);
    return false;
  }
}

export async function getPendingRecording(sessionId: string): Promise<PendingRecording | null> {
  try {
    const result = await tx<PendingRecording | undefined>('readonly', (store) =>
      store.get(sessionId)
    );
    return result ?? null;
  } catch {
    return null;
  }
}

export async function listPendingRecordings(): Promise<PendingRecording[]> {
  try {
    const all = await tx<PendingRecording[]>('readonly', (store) => store.getAll());
    return (all ?? []).sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

/** Only ever called after an upload is confirmed. */
export async function clearPendingRecording(sessionId: string): Promise<void> {
  try {
    await tx('readwrite', (store) => store.delete(sessionId));
  } catch (err) {
    console.error('[recordingCache] could not clear cached recording:', err);
  }
}

/**
 * Estimated remaining quota, so the UI can warn before a long recording rather
 * than failing to cache one after the conversation is over.
 */
export async function storageHeadroomBytes(): Promise<number | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
    const { quota, usage } = await navigator.storage.estimate();
    if (typeof quota !== 'number' || typeof usage !== 'number') return null;
    return quota - usage;
  } catch {
    return null;
  }
}
