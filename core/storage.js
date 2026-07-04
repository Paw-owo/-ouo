// core/storage.js
// IndexedDB + localStorage 统一存储。修复原 bug：
//  1) initDB 的 onblocked 必须 reject
//  2) dbInstance.onversionchange 关闭后能自动重连
//  3) runRequest/runTransaction 必须有 timeout
//  4) compressImage 处理 EXIF 旋转 + 保留 PNG 透明通道
//  5) setDB 统一三参数签名 setDB(store, key, value)
// 依赖：core/storage-keys.js, core/config.js, core/util.js

import { STORES, KEYS, SCHEMA_VERSION } from './storage-keys.js';
import { get as getConfig } from './config.js';
import { cleanForDB } from './util.js';

const DB_NAME = 'popo_db';
let dbInstance = null;
let initPromise = null;

// ════════════════════════════════════════
// IndexedDB
// ════════════════════════════════════════

export function initDB() {
  if (initPromise) return initPromise;
  initPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('小手机不支持 IndexedDB 嘛'));
      return;
    }
    let req;
    try {
      req = indexedDB.open(DB_NAME, SCHEMA_VERSION);
    } catch (e) {
      reject(e);
      return;
    }

    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      const oldV = event.oldVersion;
      // 创建所有 store（首次或升级）
      Object.values(STORES).forEach((name) => {
        if (!db.objectStoreNames.contains(name)) {
          const store = db.createObjectStore(name, { keyPath: 'id' });
          // 通用索引
          if (!store.indexNames.contains('timestamp')) {
            store.createIndex('timestamp', 'timestamp', { unique: false });
          }
          if (!store.indexNames.contains('characterId')) {
            store.createIndex('characterId', 'characterId', { unique: false });
          }
          if (!store.indexNames.contains('updatedAt')) {
            store.createIndex('updatedAt', 'updatedAt', { unique: false });
          }
        }
      });
      // 迁移标记
      try { localStorage.setItem(KEYS.appSchemaVersion, String(SCHEMA_VERSION)); } catch (e) {}
    };

    req.onsuccess = (event) => {
      const db = event.target.result;
      // 关键修复：版本变更时关闭，下次自动重连
      db.onversionchange = () => {
        try { db.close(); } catch (e) {}
        dbInstance = null;
        initPromise = null;
      };
      dbInstance = db;
      resolve(db);
    };

    // 关键修复：onblocked 必须 reject（原项目挂起）
    req.onblocked = () => {
      reject(new Error('数据库被占用了，请关掉其他小手机再试一次嘛'));
    };

    req.onerror = () => {
      reject(req.error || new Error('数据库打不开啦'));
    };
  });
  return initPromise;
}

export async function ensureDB() {
  if (dbInstance) return dbInstance;
  return await initDB();
}

function withTimeout(promise, ms, label) {
  const storageCfg = getConfig('storage', {});
  const timeout = ms || (storageCfg && storageCfg.requestTimeoutMs) || 8000;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`[${label}] 操作超时啦`));
    }, timeout);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

export async function runRequest(storeName, mode, fn) {
  const db = await ensureDB();
  return withTimeout(
    new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const result = fn(store, tx);
        tx.oncomplete = () => resolve(result && result.result !== undefined ? result.result : result);
        tx.onerror = () => reject(tx.error || new Error('事务出错啦'));
        tx.onabort = () => reject(new Error('事务被打断啦'));
      } catch (e) {
        reject(e);
      }
    }),
    null,
    `runRequest:${storeName}`
  );
}

export async function runTransaction(storeNames, mode, fn) {
  const db = await ensureDB();
  const names = Array.isArray(storeNames) ? storeNames : [storeNames];
  return withTimeout(
    new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(names, mode);
        const stores = names.map((n) => tx.objectStore(n));
        let result;
        const ret = fn(stores, tx);
        if (ret !== undefined) result = ret;
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error || new Error('事务出错啦'));
        tx.onabort = () => reject(new Error('事务被打断啦'));
      } catch (e) {
        reject(e);
      }
    }),
    getConfig('storage.transactionTimeoutMs', 12000),
    `runTransaction:${names.join(',')}`
  );
}

// ════════════════════════════════════════
// IndexedDB CRUD（统一三参数 setDB）
// ════════════════════════════════════════

export async function getDB(store, key) {
  return runRequest(store, 'readonly', (s) => {
    const req = s.get(key);
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  });
}

export async function setDB(store, key, value) {
  // 统一三参数签名：setDB(store, key, value)
  if (arguments.length < 3) throw new Error('setDB 必须三参数：setDB(store, key, value)');
  const record = cleanForDB(value);
  if (typeof record !== 'object' || record === null) {
    throw new Error('setDB 的 value 必须是对象且包含 id 或传入 key');
  }
  // 确保有 id 字段（keyPath 是 'id'）
  if (!record.id) record.id = key;
  if (!record.id) throw new Error('record 缺少 id 字段');
  if (!record.createdAt) record.createdAt = new Date().toISOString();
  record.updatedAt = new Date().toISOString();
  return runRequest(store, 'readwrite', (s) => {
    return new Promise((resolve, reject) => {
      const req = s.put(record);
      req.onsuccess = () => resolve(record);
      req.onerror = () => reject(req.error);
    });
  });
}

export async function deleteDB(store, key) {
  return runRequest(store, 'readwrite', (s) => {
    return new Promise((resolve, reject) => {
      const req = s.delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  });
}

export async function getAllDB(store) {
  return runRequest(store, 'readonly', (s) => {
    return new Promise((resolve, reject) => {
      const req = s.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  });
}

export async function getByIndexDB(store, indexName, value) {
  return runRequest(store, 'readonly', (s) => {
    const idx = s.index(indexName);
    return new Promise((resolve, reject) => {
      const req = idx.getAll(value);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  });
}

export async function clearStoreDB(store) {
  return runRequest(store, 'readwrite', (s) => {
    return new Promise((resolve, reject) => {
      const req = s.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  });
}

// ════════════════════════════════════════
// localStorage（小元数据）
// ════════════════════════════════════════

export function getData(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null || raw === undefined) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[storage] localStorage 读取失败', key, e);
    return fallback;
  }
}

export function setData(key, value) {
  try {
    const safe = cleanForDB(value);
    localStorage.setItem(key, JSON.stringify(safe));
    return true;
  } catch (e) {
    console.warn('[storage] localStorage 写入失败', key, e);
    return false;
  }
}

export function removeData(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (e) {
    console.warn('[storage] localStorage 删除失败', key, e);
    return false;
  }
}

// ════════════════════════════════════════
// ID & 时间
// ════════════════════════════════════════

export function generateId(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getNow() {
  return new Date().toISOString();
}

// ════════════════════════════════════════
// 图片压缩（修复 EXIF 旋转 + PNG 透明保留）
// ════════════════════════════════════════

function readEXIFOrientation(arrayBuffer) {
  // 简化版 EXIF orientation 读取，仅解析 JPEG SOI/APP1
  try {
    const view = new DataView(arrayBuffer);
    if (view.getUint16(0) !== 0xFFD8) return 1; // 不是 JPEG
    let offset = 2;
    while (offset < view.byteLength) {
      const marker = view.getUint16(offset);
      offset += 2;
      if (marker === 0xFFE1) {
        // APP1
        const length = view.getUint16(offset);
        offset += 2;
        const sig = view.getUint32(offset);
        if (sig !== 0x45786966) return 1; // 'Exif'
        offset += 6; // 'Exif\0\0'
        const tiff = view.getUint16(offset);
        const bigEndian = tiff === 0x4D4D;
        const getU16 = (p) => view.getUint16(p, !bigEndian);
        const getU32 = (p) => view.getUint32(p, !bigEndian);
        const ifdOffset = offset + 2 + getU32(offset + 4);
        const entries = getU16(ifdOffset);
        for (let i = 0; i < entries; i++) {
          const entry = ifdOffset + 2 + i * 12;
          if (getU16(entry) === 0x0112) {
            return getU16(entry + 8);
          }
        }
        return 1;
      } else if ((marker & 0xFF00) !== 0xFF00) {
        return 1;
      } else {
        const length = view.getUint16(offset);
        offset += length;
      }
    }
    return 1;
  } catch (e) {
    return 1;
  }
}

function applyOrientation(ctx, canvas, orientation) {
  const w = canvas.width;
  const h = canvas.height;
  switch (orientation) {
    case 2: ctx.transform(-1, 0, 0, 1, w, 0); break;
    case 3: ctx.transform(-1, 0, 0, -1, w, h); break;
    case 4: ctx.transform(1, 0, 0, -1, 0, h); break;
    case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
    case 6: ctx.transform(0, 1, -1, 0, h, 0); break;
    case 7: ctx.transform(0, -1, -1, 0, h, w); break;
    case 8: ctx.transform(0, -1, 1, 0, 0, w); break;
    default: break;
  }
}

/**
 * 压缩图片：保留 PNG 透明通道，处理 EXIF 旋转。
 * @param {File|Blob} file
 * @param {object} opts { quality, maxWidth, maxHeight, forceType }
 * @returns {Promise<string>} dataURL
 */
export async function compressImage(file, opts = {}) {
  if (!file) return '';
  const cfg = getConfig('image', {});
  const quality = opts.quality ?? cfg.compressionQuality ?? 0.78;
  const maxW = opts.maxWidth ?? cfg.maxWidth ?? 1280;
  const maxH = opts.maxHeight ?? cfg.maxHeight ?? 1280;

  // PNG 透明通道：检测类型，保留 PNG 格式
  const isPNG = file.type === 'image/png';
  const outType = opts.forceType || (isPNG ? 'image/png' : 'image/jpeg');

  // 读 EXIF（仅 JPEG 有意义，但 PNG 调用也无害）
  let orientation = 1;
  if (file.type === 'image/jpeg') {
    try {
      const buf = await file.arrayBuffer();
      orientation = readEXIFOrientation(buf);
    } catch (e) { orientation = 1; }
  }

  const dataURL = await fileToDataURL(file);
  const img = await loadImage(dataURL);

  let w = img.naturalWidth || img.width;
  let h = img.naturalHeight || img.height;
  if ([5, 6, 7, 8].includes(orientation)) { [w, h] = [h, w]; }
  const ratio = Math.min(1, Math.min(maxW / w, maxH / h));
  const targetW = Math.round(w * ratio);
  const targetH = Math.round(h * ratio);

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  // PNG 保留透明，JPEG 白底
  if (!isPNG && outType === 'image/jpeg') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetW, targetH);
  }
  applyOrientation(ctx, canvas, orientation);
  ctx.drawImage(img, 0, 0, targetW, targetH);
  return canvas.toDataURL(outType, quality);
}

export function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('文件读不出来啦'));
    reader.readAsDataURL(file);
  });
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载不出来嘛'));
    img.src = src;
  });
}

// ════════════════════════════════════════
// blobs store（图片/音频/字体 base64 集中存）
// ════════════════════════════════════════

export async function saveBlob(key, dataURL, meta = {}) {
  return setDB(STORES.blobs, key, { id: key, dataURL, type: meta.type || 'image', ...meta });
}

export async function loadBlob(key) {
  const r = await getDB(STORES.blobs, key);
  return r ? r.dataURL : null;
}

export async function deleteBlob(key) {
  return deleteDB(STORES.blobs, key);
}

// ════════════════════════════════════════
// 全量导出 / 导入（含 blobs）
// ════════════════════════════════════════

export async function exportAll() {
  const out = { stores: {}, localStorage: {}, schema: SCHEMA_VERSION, exportedAt: getNow() };
  for (const name of Object.values(STORES)) {
    try { out.stores[name] = await getAllDB(name); } catch (e) { console.warn('[storage] 导出失败', name, e); }
  }
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    try { out.localStorage[k] = localStorage.getItem(k); } catch (e) {}
  }
  return out;
}

export async function importAll(data) {
  if (!data || !data.stores) throw new Error('备份文件格式不对嘛');
  for (const [name, records] of Object.entries(data.stores)) {
    if (!Array.isArray(records)) continue;
    for (const r of records) {
      try { await setDB(name, r.id, r); } catch (e) { console.warn('[storage] 导入失败', name, e); }
    }
  }
  if (data.localStorage) {
    for (const [k, v] of Object.entries(data.localStorage)) {
      try { localStorage.setItem(k, v); } catch (e) {}
    }
  }
  return true;
}

// ════════════════════════════════════════
// 默认设置
// ════════════════════════════════════════

export function ensureDefaultSettings() {
  const defaults = {
    [KEYS.appLockPassword]: '0326',
    [KEYS.appTheme]: 'sky',
    [KEYS.appFirstRun]: true,
    [KEYS.appDesktopScale]: 1,
    [KEYS.appWidgetScale]: 1,
    [KEYS.appDockScale]: 1,
    [KEYS.appSchemaVersion]: SCHEMA_VERSION
  };
  for (const [k, v] of Object.entries(defaults)) {
    if (localStorage.getItem(k) === null) {
      try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn('[storage] 默认值写入失败', k, e); }
    }
  }
}
