// core/storage.js
// imports: none

const DB_NAME = 'ai_phone_db';
const DB_VERSION = 1;

const STORE_DEFINITIONS = [
  { name: 'characters', options: { keyPath: 'id' } },
  { name: 'messages', options: { keyPath: 'id' }, indexes: [{ name: 'characterId', keyPath: 'characterId' }] },
  { name: 'moments', options: { keyPath: 'id' } },
  { name: 'memories', options: { keyPath: 'id' }, indexes: [{ name: 'characterId', keyPath: 'characterId' }] },
  { name: 'stickers', options: { keyPath: 'id' } },
  { name: 'worldbook', options: { keyPath: 'id' } },
  { name: 'inventory', options: { keyPath: 'id' } },
  { name: 'pet', options: { keyPath: 'id' } },
  { name: 'groups', options: { keyPath: 'id' } },
  { name: 'group_messages', options: { keyPath: 'id' }, indexes: [{ name: 'groupId', keyPath: 'groupId' }] },
  { name: 'blobs', options: { keyPath: 'key' } }
];

let dbInstance = null;
let dbPromise = null;

function notifyStorageError(message) {
  try {
    if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
      window.showToast(message);
      return;
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('storage:error', { detail: message }));
    }
  } catch (error) {
    console.warn(message, error);
  }
}

function getPrimaryKeyName(storeName) {
  return storeName === 'blobs' ? 'key' : 'id';
}

function normalizeStoreRecord(storeName, key, value) {
  const primaryKey = getPrimaryKeyName(storeName);

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return {
      ...value,
      [primaryKey]: value[primaryKey] || key,
      updatedAt: value.updatedAt || getNow()
    };
  }

  return {
    [primaryKey]: key,
    value,
    updatedAt: getNow()
  };
}

function runRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
  });
}

function runTransaction(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
  });
}

function getStore(storeName, mode = 'readonly') {
  const db = getDbInstance();

  if (!db.objectStoreNames.contains(storeName)) {
    throw new Error(`IndexedDB store 不存在：${storeName}`);
  }

  return db.transaction(storeName, mode).objectStore(storeName);
}

export async function initDB() {
  if (dbInstance) {
    return dbInstance;
  }

  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    try {
      if (typeof indexedDB === 'undefined') {
        throw new Error('当前浏览器不支持 IndexedDB');
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;

        STORE_DEFINITIONS.forEach((definition) => {
          let store;

          if (!db.objectStoreNames.contains(definition.name)) {
            store = db.createObjectStore(definition.name, definition.options);
          } else {
            store = request.transaction.objectStore(definition.name);
          }

          if (definition.indexes) {
            definition.indexes.forEach((index) => {
              if (!store.indexNames.contains(index.name)) {
                store.createIndex(index.name, index.keyPath, { unique: false });
              }
            });
          }
        });
      };

      request.onsuccess = () => {
        dbInstance = request.result;

        dbInstance.onversionchange = () => {
          dbInstance.close();
          dbInstance = null;
          dbPromise = null;
          notifyStorageError('数据库已更新，请刷新页面');
        };

        resolve(dbInstance);
      };

      request.onerror = () => {
        dbPromise = null;
        notifyStorageError('数据库初始化失败');
        reject(request.error || new Error('IndexedDB open failed'));
      };

      request.onblocked = () => {
        notifyStorageError('请关闭其他页面后刷新');
      };
    } catch (error) {
      dbPromise = null;
      notifyStorageError('当前浏览器不支持本地数据库');
      reject(error);
    }
  });

  return dbPromise;
}

export function getDbInstance() {
  if (!dbInstance) {
    throw new Error('请先调用initDB');
  }

  return dbInstance;
}

export function getConfig(key, fallbackValue = null) {
  try {
    const rawValue = localStorage.getItem(key);

    if (rawValue === null) {
      return fallbackValue;
    }

    return JSON.parse(rawValue);
  } catch (error) {
    notifyStorageError('读取本地配置失败');
    return fallbackValue;
  }
}

export function setConfig(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    notifyStorageError('本地配置空间不足，请清理数据');
    return false;
  }
}

export function getData(key) {
  return getConfig(key, null);
}

export function setData(key, value) {
  return setConfig(key, value);
}

export function removeData(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    notifyStorageError('删除本地配置失败');
    return false;
  }
}

export async function getDB(storeName, key) {
  try {
    const store = getStore(storeName);
    const result = await runRequest(store.get(key));
    return result || null;
  } catch (error) {
    notifyStorageError('读取数据库失败');
    return null;
  }
}

export async function setDB(storeName, key, value) {
  try {
    const db = getDbInstance();
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const record = normalizeStoreRecord(storeName, key, value);

    store.put(record);
    await runTransaction(transaction);

    return record;
  } catch (error) {
    notifyStorageError('写入数据库失败');
    return null;
  }
}

export async function deleteDB(storeName, key) {
  try {
    const db = getDbInstance();
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);

    store.delete(key);
    await runTransaction(transaction);

    return true;
  } catch (error) {
    notifyStorageError('删除数据库内容失败');
    return false;
  }
}

export async function getAllDB(storeName) {
  try {
    const store = getStore(storeName);
    const result = await runRequest(store.getAll());
    return Array.isArray(result) ? result : [];
  } catch (error) {
    notifyStorageError('读取数据库列表失败');
    return [];
  }
}

export async function getByIndexDB(storeName, indexName, value) {
  try {
    const store = getStore(storeName);
    const index = store.index(indexName);
    const result = await runRequest(index.getAll(value));
    return Array.isArray(result) ? result : [];
  } catch (error) {
    notifyStorageError('读取索引数据失败');
    return [];
  }
}

export async function clearStoreDB(storeName) {
  try {
    const db = getDbInstance();
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);

    store.clear();
    await runTransaction(transaction);

    return true;
  } catch (error) {
    notifyStorageError('清理数据库失败');
    return false;
  }
}

export function generateId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch (error) {
    console.warn('randomUUID unavailable', error);
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

export function getNow() {
  return new Date().toISOString();
}

export async function compressImage(file, maxSize = 800, quality = 0.8) {
  return new Promise((resolve, reject) => {
    try {
      if (!file || !file.type || !file.type.startsWith('image/')) {
        reject(new Error('请选择图片文件'));
        return;
      }

      const reader = new FileReader();

      reader.onload = () => {
        const image = new Image();

        image.onload = () => {
          const canvas = document.createElement('canvas');
          const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
          const width = Math.max(1, Math.round(image.width * scale));
          const height = Math.max(1, Math.round(image.height * scale));

          canvas.width = width;
          canvas.height = height;

          const context = canvas.getContext('2d');
          context.drawImage(image, 0, 0, width, height);

          resolve(canvas.toDataURL('image/jpeg', quality));
        };

        image.onerror = () => {
          reject(new Error('图片读取失败'));
        };

        image.src = reader.result;
      };

      reader.onerror = () => {
        reject(new Error('图片读取失败'));
      };

      reader.readAsDataURL(file);
    } catch (error) {
      reject(error);
    }
  });
}

export async function getStorageUsage() {
  try {
    if (navigator.storage && typeof navigator.storage.estimate === 'function') {
      const estimate = await navigator.storage.estimate();
      const used = estimate.usage || 0;
      const quota = estimate.quota || 0;

      return {
        used,
        quota,
        percent: quota ? Math.min(100, Math.round((used / quota) * 100)) : 0
      };
    }
  } catch (error) {
    notifyStorageError('读取存储用量失败');
  }

  return {
    used: 0,
    quota: 0,
    percent: 0
  };
}

// depends: none
