// ============================================
// storage-manager.js — IndexedDB/localStorage 读写封装
// 角色隔离自动注入 characterId
// 上层通过 storage.js 统一入口调用
// ============================================

import { STORAGE_KEYS, DB_CONFIG } from './storage-keys.js';

let _currentCharacterId = null;
let _db = null;

// ========== 角色作用域 ==========

function setCurrentCharacter(characterId) {
  _currentCharacterId = characterId;
}

function getCurrentCharacter() {
  return _currentCharacterId;
}

// ========== IndexedDB ==========

function openDB() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_CONFIG.NAME, DB_CONFIG.VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // 消息表：按 characterId + conversationId 索引
      if (!db.objectStoreNames.contains(DB_CONFIG.STORES.MESSAGES)) {
        const store = db.createObjectStore(DB_CONFIG.STORES.MESSAGES, { keyPath: 'id' });
        store.createIndex('characterId', 'characterId', { unique: false });
        store.createIndex('conversationId', 'conversationId', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // 记忆表：按 characterId 索引
      if (!db.objectStoreNames.contains(DB_CONFIG.STORES.MEMORIES)) {
        const store = db.createObjectStore(DB_CONFIG.STORES.MEMORIES, { keyPath: 'id' });
        store.createIndex('characterId', 'characterId', { unique: false });
        store.createIndex('type', 'type', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // 通知表：按时间索引
      if (!db.objectStoreNames.contains(DB_CONFIG.STORES.NOTIFICATIONS)) {
        const store = db.createObjectStore(DB_CONFIG.STORES.NOTIFICATIONS, { keyPath: 'id' });
        store.createIndex('appId', 'appId', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('read', 'read', { unique: false });
      }

      // 角色表
      if (!db.objectStoreNames.contains(DB_CONFIG.STORES.CHARACTERS)) {
        db.createObjectStore(DB_CONFIG.STORES.CHARACTERS, { keyPath: 'id' });
      }

      // 媒体表
      if (!db.objectStoreNames.contains(DB_CONFIG.STORES.MEDIA)) {
        const store = db.createObjectStore(DB_CONFIG.STORES.MEDIA, { keyPath: 'id' });
        store.createIndex('characterId', 'characterId', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      _db = event.target.result;
      resolve(_db);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

async function getStore(storeName, mode = 'readonly') {
  const db = await openDB();
  const tx = db.transaction(storeName, mode);
  return tx.objectStore(storeName);
}

// ========== IndexedDB 通用操作 ==========

async function idbGet(storeName, id) {
  const store = await getStore(storeName);
  return new Promise((resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbGetAll(storeName, indexName, value) {
  const store = await getStore(storeName);
  const source = indexName ? store.index(indexName) : store;
  return new Promise((resolve, reject) => {
    const request = value !== undefined ? source.getAll(value) : source.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbPut(storeName, item) {
  const store = await getStore(storeName, 'readwrite');
  return new Promise((resolve, reject) => {
    const request = store.put(item);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbDelete(storeName, id) {
  const store = await getStore(storeName, 'readwrite');
  return new Promise((resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function idbClear(storeName) {
  const store = await getStore(storeName, 'readwrite');
  return new Promise((resolve, reject) => {
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// ========== localStorage 操作 ==========

function lsGet(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function lsSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function lsRemove(key) {
  localStorage.removeItem(key);
}

// ========== 角色隔离的高层API ==========

// 消息
async function getMessages(characterId, conversationId) {
  const all = await idbGetAll(DB_CONFIG.STORES.MESSAGES, 'characterId', characterId);
  if (!conversationId) return all;
  return all.filter(m => m.conversationId === conversationId).sort((a, b) => a.timestamp - b.timestamp);
}

async function saveMessage(message) {
  return idbPut(DB_CONFIG.STORES.MESSAGES, message);
}

async function deleteMessages(characterId, conversationId) {
  const messages = await getMessages(characterId, conversationId);
  for (const m of messages) {
    await idbDelete(DB_CONFIG.STORES.MESSAGES, m.id);
  }
}

// 记忆
async function getMemories(characterId, type) {
  const all = await idbGetAll(DB_CONFIG.STORES.MEMORIES, 'characterId', characterId);
  if (!type) return all.sort((a, b) => b.timestamp - a.timestamp);
  return all.filter(m => m.type === type).sort((a, b) => b.timestamp - a.timestamp);
}

async function saveMemory(memory) {
  return idbPut(DB_CONFIG.STORES.MEMORIES, memory);
}

async function deleteMemory(id) {
  return idbDelete(DB_CONFIG.STORES.MEMORIES, id);
}

async function clearMemories(characterId) {
  const memories = await getMemories(characterId);
  for (const m of memories) {
    await idbDelete(DB_CONFIG.STORES.MEMORIES, m.id);
  }
}

// 通知
async function getNotifications(appId) {
  const all = await idbGetAll(DB_CONFIG.STORES.NOTIFICATIONS);
  const sorted = [...all].sort((a, b) => b.timestamp - a.timestamp);
  if (!appId) return sorted;
  return sorted.filter(n => n.appId === appId);
}

async function saveNotification(notification) {
  return idbPut(DB_CONFIG.STORES.NOTIFICATIONS, notification);
}

async function deleteNotification(id) {
  return idbDelete(DB_CONFIG.STORES.NOTIFICATIONS, id);
}

async function clearNotifications() {
  return idbClear(DB_CONFIG.STORES.NOTIFICATIONS);
}

async function markNotificationRead(id) {
  const notif = await idbGet(DB_CONFIG.STORES.NOTIFICATIONS, id);
  if (notif) {
    notif.read = true;
    await idbPut(DB_CONFIG.STORES.NOTIFICATIONS, notif);
  }
}

// 角色
async function getCharacter(id) {
  return idbGet(DB_CONFIG.STORES.CHARACTERS, id);
}

async function getAllCharacters() {
  return idbGetAll(DB_CONFIG.STORES.CHARACTERS);
}

async function saveCharacter(character) {
  return idbPut(DB_CONFIG.STORES.CHARACTERS, character);
}

async function deleteCharacter(id) {
  return idbDelete(DB_CONFIG.STORES.CHARACTERS, id);
}

// ========== 设置读写（走 localStorage） ==========

function getSetting(key) {
  return lsGet(key, null);
}

function setSetting(key, value) {
  return lsSet(key, value);
}

// ========== 导出 ==========

export {
  // 角色
  setCurrentCharacter,
  getCurrentCharacter,

  // localStorage
  lsGet,
  lsSet,
  lsRemove,

  // IndexedDB 底层
  openDB,
  idbGet,
  idbGetAll,
  idbPut,
  idbDelete,
  idbClear,

  // 消息
  getMessages,
  saveMessage,
  deleteMessages,

  // 记忆
  getMemories,
  saveMemory,
  deleteMemory,
  clearMemories,

  // 通知
  getNotifications,
  saveNotification,
  deleteNotification,
  clearNotifications,
  markNotificationRead,

  // 角色
  getCharacter,
  getAllCharacters,
  saveCharacter,
  deleteCharacter,

  // 设置
  getSetting,
  setSetting
};