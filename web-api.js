'use strict';

(() => {
  const DB_NAME = 'finanze-web-v1';
  const STORE = 'local-data';
  const SNAPSHOTS = 'safety-copies';

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        if (!db.objectStoreNames.contains(SNAPSHOTS)) db.createObjectStore(SNAPSHOTS, { keyPath:'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Archivio locale non disponibile'));
      request.onblocked = () => reject(new Error('Archivio locale bloccato da un’altra scheda'));
    });
  }

  async function readData() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get('data');
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('Lettura dei dati non riuscita'));
      request.transaction.oncomplete = () => db.close();
      request.transaction.onabort = () => db.close();
    });
  }

  async function writeData(data) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).put(data, 'data');
      transaction.oncomplete = () => { db.close(); resolve(true); };
      transaction.onerror = () => { db.close(); reject(transaction.error || new Error('Salvataggio dei dati non riuscito')); };
      transaction.onabort = () => { db.close(); reject(transaction.error || new Error('Salvataggio dei dati annullato')); };
    });
  }

  async function snapshot(label) {
    const data = await readData();
    if (!data) return false;
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SNAPSHOTS, 'readwrite');
      transaction.objectStore(SNAPSHOTS).put({
        id: new Date().toISOString(),
        label: String(label || 'copia'),
        data,
      });
      transaction.oncomplete = () => { db.close(); resolve(true); };
      transaction.onerror = () => { db.close(); reject(transaction.error || new Error('Copia di sicurezza non riuscita')); };
      transaction.onabort = () => { db.close(); reject(transaction.error || new Error('Copia di sicurezza annullata')); };
    });
  }

  function download(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function localDate() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  window.FINANZE_WEB = true;
  window.api = {
    load: async () => ({ data:await readData(), recovered:false }),
    save: writeData,
    parse: async () => { throw new Error('Importa il backup JSON creato dall’app Finanze per PC.'); },
    exportBackup: async () => {
      const data = await readData();
      if (!data) return { ok:false, reason:'Non ci sono ancora dati da salvare.' };
      download('finanze-backup-' + localDate() + '.json', JSON.stringify(data, null, 2), 'application/json;charset=utf-8');
      return { ok:true };
    },
    exportFile: async (name, text) => {
      const ext = name.toLowerCase().endsWith('.csv') ? 'text/csv;charset=utf-8' : 'application/octet-stream';
      download(name, (ext.startsWith('text/csv') ? '\ufeff' : '') + String(text), ext);
      return { ok:true };
    },
    snapshot,
    openFolder: async () => { throw new Error('La cartella locale non è accessibile dal browser.'); },
    info: async () => ({ version:'1.4.5 Web', dataPath:'Dati locali di questo browser e dispositivo' }),
    setTheme: async () => true,
    ready: () => {},
  };
})();
