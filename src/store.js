import { makeState, reduce } from './model.js';
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('hamster-demo-v1') : null;
const open = new Promise((resolve, reject) => {
  const req = indexedDB.open('hamster-classroom-demo', 1);
  req.onupgradeneeded = () => { req.result.createObjectStore('state'); req.result.createObjectStore('files'); };
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(new Error('브라우저 저장소를 열 수 없어요. 저장 권한을 확인해 주세요.'));
});
export async function readState() {
  const db = await open;
  return new Promise((resolve, reject) => {
    const req = db.transaction('state').objectStore('state').get('current');
    req.onsuccess = () => resolve(req.result ?? makeState()); req.onerror = () => reject(req.error);
  });
}
export async function dispatch(action, file) {
  const db = await open;
  await new Promise((resolve, reject) => {
    const tx = db.transaction(['state', 'files'], 'readwrite');
    let failure;
    const store = tx.objectStore('state');
    const req = store.get('current');
    req.onsuccess = () => {
      try {
        store.put(reduce(req.result ?? makeState(), action), 'current');
        if (file) tx.objectStore('files').put(file, action.id);
      } catch (error) { failure = error; tx.abort(); }
    };
    tx.oncomplete = resolve;
    tx.onabort = () => reject(failure ?? new Error('저장 공간이 부족하거나 저장에 실패했어요.'));
    tx.onerror = () => reject(tx.error);
  });
  channel?.postMessage('changed');
}
export async function getFile(id) {
  const db = await open;
  return new Promise((resolve, reject) => {
    const req = db.transaction('files').objectStore('files').get(id);
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
  });
}
export function subscribe(callback) { if (channel) channel.onmessage = callback; }
export async function reset() {
  const db = await open;
  await new Promise((resolve, reject) => {
    const tx = db.transaction(['state', 'files'], 'readwrite');
    tx.objectStore('state').clear(); tx.objectStore('files').clear();
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  });
  channel?.postMessage('changed');
}
