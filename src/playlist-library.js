const catalog = 'catalog';
const media = 'media';
let opening;

function openLibrary() {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    const request = indexedDB.open('kahve-playlists', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(catalog, { keyPath: 'id' });
      request.result.createObjectStore(media, { keyPath: 'id' });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        opening = undefined;
      };
      resolve(db);
    };
  });
  opening.catch(() => { opening = undefined; });
  return opening;
}

async function transaction(stores, mode, execute) {
  const db = await openLibrary();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    tx.onabort = () => reject(tx.error);
    let request;
    tx.oncomplete = () => resolve(request?.result);
    try {
      request = execute(tx);
    } catch (error) {
      tx.abort();
      reject(error);
    }
  });
}

export async function listSavedPlaylists() {
  const playlists = await transaction(catalog, 'readonly', (tx) => tx.objectStore(catalog).getAll());
  return playlists.sort((a, b) => b.savedAt - a.savedAt);
}

export function savePlaylist(name, entries, activeIndex) {
  const id = crypto.randomUUID();
  return transaction([catalog, media], 'readwrite', (tx) => {
    tx.objectStore(catalog).add({ id, name, count: entries.length, savedAt: Date.now() });
    tx.objectStore(media).add({ id, entries, activeIndex });
  });
}

export function loadSavedPlaylist(id) {
  return transaction(media, 'readonly', (tx) => tx.objectStore(media).get(id));
}

export function deleteSavedPlaylist(id) {
  return transaction([catalog, media], 'readwrite', (tx) => {
    tx.objectStore(catalog).delete(id);
    tx.objectStore(media).delete(id);
  });
}
