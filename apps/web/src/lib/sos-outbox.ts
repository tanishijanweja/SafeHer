// Offline SOS outbox. When an emergency happens with no connectivity, every
// action (initial SOS, live-location updates, audio clips) is saved here in
// order. The moment the device is back online the app replays the queue so the
// event and all its updates reach the server and the trusted contacts.

const DB_NAME = "safeher-sos-outbox";
const STORE = "ops";
const DB_VERSION = 1;

export type SosOutboxPayload = {
  latitude?: number;
  longitude?: number;
  batteryLevel?: number;
  location?: string;
  emergencyMessage?: string;
};

export type OutboxOp =
  | { id: string; kind: "sos"; sosKey: string; payload: SosOutboxPayload; at: number }
  | {
      id: string;
      kind: "loc";
      sosKey: string;
      payload: { latitude?: number; longitude?: number; location?: string };
      at: number;
    }
  | { id: string; kind: "media"; sosKey: string; mimeType: string; blob: Blob; at: number };

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
    req.onerror = () => reject(req.error ?? new Error("Could not open SOS outbox"));
  });
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

export async function enqueueOutbox(op: OutboxOp): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    await reqToPromise(tx.objectStore(STORE).put(op));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Could not enqueue"));
    });
  } finally {
    db.close();
  }
}

export async function listOutbox(): Promise<OutboxOp[]> {
  const db = await openDb();
  try {
    const all = await reqToPromise<OutboxOp[]>(db.transaction(STORE, "readonly").objectStore(STORE).getAll());
    return all.sort((a, b) => a.at - b.at);
  } finally {
    db.close();
  }
}

export async function removeOutbox(id: string): Promise<void> {
  const db = await openDb();
  try {
    await reqToPromise(db.transaction(STORE, "readwrite").objectStore(STORE).delete(id));
  } finally {
    db.close();
  }
}

export async function clearOutbox(): Promise<void> {
  const db = await openDb();
  try {
    await reqToPromise(db.transaction(STORE, "readwrite").objectStore(STORE).clear());
  } finally {
    db.close();
  }
}