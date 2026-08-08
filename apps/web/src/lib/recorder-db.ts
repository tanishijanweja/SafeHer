// Brave, private, local-only storage for emergency recordings.
// Audio blobs are kept entirely on the user's device (IndexedDB) and are never
// sent to the app's servers.

const DB_NAME = "safeher-audio-store";
const STORE = "recordings";
const DB_VERSION = 1;

export type SavedRecording = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  savedAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Could not open audio store"));
  });
}

function tx(
  db: IDBDatabase,
  mode: IDBTransactionMode,
): IDBObjectStore {
  return db.transaction(STORE, mode).objectStore(STORE);
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

export async function saveRecordingBlob(
  blob: Blob,
  name: string,
): Promise<SavedRecording> {
  const record: SavedRecording & { blob: Blob } = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    mimeType: blob.type,
    size: blob.size,
    savedAt: Date.now(),
    blob,
  };
  const db = await openDb();
  try {
    await requestToPromise(tx(db, "readwrite").put(record));
  } finally {
    db.close();
  }
  const { blob: _blob, ...meta } = record;
  return meta;
}

export async function listRecordings(): Promise<SavedRecording[]> {
  const db = await openDb();
  try {
    const all = await requestToPromise<(SavedRecording & { blob: Blob })[]>(
      tx(db, "readonly").getAll(),
    );
    return all
      .map(({ blob: _blob, ...meta }) => meta)
      .sort((a, b) => b.savedAt - a.savedAt);
  } finally {
    db.close();
  }
}

export async function getRecordingBlob(id: string): Promise<Blob | null> {
  const db = await openDb();
  try {
    const rec = await requestToPromise<{ blob: Blob } | undefined>(
      tx(db, "readonly").get(id),
    );
    return rec?.blob ?? null;
  } finally {
    db.close();
  }
}

export async function deleteRecording(id: string): Promise<void> {
  const db = await openDb();
  try {
    await requestToPromise(tx(db, "readwrite").delete(id));
  } finally {
    db.close();
  }
}

/** Creates a temporary object URL for playback/download of a saved recording. */
export async function recordingUrl(id: string): Promise<string | null> {
  const blob = await getRecordingBlob(id);
  return blob ? URL.createObjectURL(blob) : null;
}