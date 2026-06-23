// imports:
//   from './storage.js': getData, setData, removeData, getAllDB, setDB, clearStoreDB, generateId, getNow

import {
  getData,
  setData,
  removeData,
  getAllDB,
  setDB,
  clearStoreDB,
  generateId,
  getNow
} from './storage.js';

const CLOUD_KEY = 'app_cloud_server';
const SYNC_STATUS_KEY = 'app_cloud_sync_status';
const DEVICE_ID_KEY = 'app_device_id';

const SNAPSHOT_VERSION = 1;

const LOCAL_STORAGE_KEYS = [
  'app_settings',
  'app_theme',
  'app_theme_preset',
  'app_theme_mode',
  'app_cloud_server',
  'app_icons',
  'app_hidden_icons',
  'app_icon_positions',
  'app_widget_positions',
  'app_widget_backgrounds',
  'desktop_layout_scale',
  'app_custom_font_meta',
  'app_custom_widgets',
  'app_wallpaper_opacity',
  'app_weather_cache',
  'weather_cache',
  'app_focus_widget',
  'app_badges',
  'chat_unread_counts',
  'chat_unread_count',
  'moments_unread_count',
  'app_lock_unlocked',
  'app_first_open_seed',
  'anniversaries',
  'app_anniversaries',
  'anniversary_list'
];

const INDEXED_DB_STORES = [
  'characters',
  'messages',
  'moments',
  'memories',
  'stickers',
  'worldbook',
  'inventory',
  'pet',
  'groups',
  'group_messages',
  'blobs'
];

const DEFAULT_CLOUD_CONFIG = {
  enabled: false,
  endpoint: '',
  apiKey: '',
  status: 'unknown',
  lastTestAt: '',
  updatedAt: ''
};

const DEFAULT_SYNC_STATUS = {
  running: false,
  lastSyncAt: '',
  lastUploadAt: '',
  lastDownloadAt: '',
  lastError: '',
  updatedAt: ''
};

let syncLock = false;

export function getCloudConfig() {
  const saved = getData(CLOUD_KEY) || {};
  return {
    ...DEFAULT_CLOUD_CONFIG,
    ...saved,
    enabled: saved.enabled === true,
    endpoint: String(saved.endpoint || '').trim(),
    apiKey: String(saved.apiKey || '').trim()
  };
}

export function saveCloudConfig(config = {}) {
  const next = {
    ...getCloudConfig(),
    ...config,
    endpoint: String(config.endpoint ?? getCloudConfig().endpoint ?? '').trim(),
    apiKey: String(config.apiKey ?? getCloudConfig().apiKey ?? '').trim(),
    updatedAt: getNow()
  };

  if (!next.endpoint || !next.apiKey) {
    next.enabled = false;
  }

  setData(CLOUD_KEY, next);
  return next;
}

export function isCloudReady(config = getCloudConfig()) {
  return Boolean(config?.enabled === true && String(config.endpoint || '').trim() && String(config.apiKey || '').trim());
}

export async function testCloudConnection(config = getCloudConfig()) {
  const cloud = {
    ...getCloudConfig(),
    ...config
  };

  if (!cloud.endpoint || !cloud.apiKey) {
    const next = saveCloudConfig({
      ...cloud,
      enabled: false,
      status: 'error',
      lastTestAt: getNow()
    });

    return {
      ok: false,
      status: next.status,
      message: '请先填写服务器地址和 API 密钥'
    };
  }

  try {
    const response = await cloudFetch('/api/ping', {
      method: 'GET'
    }, cloud);

    const data = await safeJson(response);

    if (!response.ok || data?.status !== 'ok') {
      throw new Error(data?.message || `HTTP ${response.status}`);
    }

    saveCloudConfig({
      ...cloud,
      status: 'ok',
      lastTestAt: getNow()
    });

    return {
      ok: true,
      status: 'ok',
      message: '连接成功',
      data
    };
  } catch (error) {
    saveCloudConfig({
      ...cloud,
      enabled: false,
      status: 'error',
      lastTestAt: getNow()
    });

    return {
      ok: false,
      status: 'error',
      message: error?.message || '连接失败'
    };
  }
}

export async function buildLocalSnapshot() {
  const localStorageData = {};
  const indexedDBData = {};

  LOCAL_STORAGE_KEYS.forEach((key) => {
    const value = getData(key);
    if (value !== null && value !== undefined) {
      localStorageData[key] = value;
    }
  });

  for (const storeName of INDEXED_DB_STORES) {
    indexedDBData[storeName] = await getAllDB(storeName);
  }

  return {
    version: SNAPSHOT_VERSION,
    createdAt: getNow(),
    deviceId: getDeviceId(),
    localStorage: localStorageData,
    indexedDB: indexedDBData
  };
}

export async function applyLocalSnapshot(snapshot, options = {}) {
  if (!isValidSnapshot(snapshot)) {
    throw new Error('云端数据格式不正确');
  }

  const overwrite = options.overwrite !== false;
  const skipCloudConfig = options.skipCloudConfig === true;

  if (overwrite) {
    for (const storeName of INDEXED_DB_STORES) {
      await clearStoreDB(storeName);
    }
  }

  Object.entries(snapshot.localStorage || {}).forEach(([key, value]) => {
    if (skipCloudConfig && key === CLOUD_KEY) return;
    setData(key, value);
  });

  for (const storeName of INDEXED_DB_STORES) {
    const records = Array.isArray(snapshot.indexedDB?.[storeName]) ? snapshot.indexedDB[storeName] : [];

    for (const record of records) {
      const primaryKey = getPrimaryKey(storeName, record);
      if (!primaryKey) continue;
      await setDB(storeName, primaryKey, record);
    }
  }

  setSyncStatus({
    lastDownloadAt: getNow(),
    lastSyncAt: getNow(),
    lastError: ''
  });

  emitStorageChanged();

  return true;
}

export async function uploadSnapshotToCloud(options = {}) {
  return withSyncLock(async () => {
    const cloud = getCloudConfig();

    if (!isCloudReady(cloud)) {
      throw new Error('云服务没有开启，或地址/密钥不完整');
    }

    setSyncStatus({
      running: true,
      lastError: ''
    });

    const snapshot = options.snapshot || await buildLocalSnapshot();

    try {
      const response = await cloudFetch('/api/snapshot', {
        method: 'PUT',
        body: JSON.stringify(snapshot)
      }, cloud);

      const data = await safeJson(response);

      if (!response.ok) {
        throw new Error(data?.message || `上传失败：HTTP ${response.status}`);
      }

      setSyncStatus({
        running: false,
        lastUploadAt: getNow(),
        lastSyncAt: getNow(),
        lastError: ''
      });

      return {
        ok: true,
        uploadedAt: getNow(),
        data
      };
    } catch (error) {
      setSyncStatus({
        running: false,
        lastError: error?.message || '上传失败'
      });
      throw error;
    }
  });
}

export async function downloadSnapshotFromCloud(options = {}) {
  return withSyncLock(async () => {
    const cloud = getCloudConfig();

    if (!isCloudReady(cloud)) {
      throw new Error('云服务没有开启，或地址/密钥不完整');
    }

    setSyncStatus({
      running: true,
      lastError: ''
    });

    try {
      const response = await cloudFetch('/api/snapshot', {
        method: 'GET'
      }, cloud);

      const data = await safeJson(response);

      if (!response.ok) {
        throw new Error(data?.message || `下载失败：HTTP ${response.status}`);
      }

      const snapshot = data?.snapshot || data;

      if (!isValidSnapshot(snapshot)) {
        throw new Error('云端没有可用备份');
      }

      if (options.apply !== false) {
        await applyLocalSnapshot(snapshot, {
          overwrite: options.overwrite !== false,
          skipCloudConfig: options.skipCloudConfig !== false
        });
      }

      setSyncStatus({
        running: false,
        lastDownloadAt: getNow(),
        lastSyncAt: getNow(),
        lastError: ''
      });

      return {
        ok: true,
        snapshot
      };
    } catch (error) {
      setSyncStatus({
        running: false,
        lastError: error?.message || '下载失败'
      });
      throw error;
    }
  });
}

export async function syncWithCloud(options = {}) {
  const mode = options.mode || 'upload';

  if (mode === 'download') {
    return downloadSnapshotFromCloud(options);
  }

  if (mode === 'upload') {
    return uploadSnapshotToCloud(options);
  }

  if (mode === 'pull') {
    return downloadSnapshotFromCloud(options);
  }

  if (mode === 'push') {
    return uploadSnapshotToCloud(options);
  }

  throw new Error('未知同步模式');
}

export function getSyncStatus() {
  return {
    ...DEFAULT_SYNC_STATUS,
    ...(getData(SYNC_STATUS_KEY) || {})
  };
}

export function clearSyncStatus() {
  removeData(SYNC_STATUS_KEY);
  return true;
}

function setSyncStatus(patch = {}) {
  const next = {
    ...getSyncStatus(),
    ...patch,
    updatedAt: getNow()
  };

  setData(SYNC_STATUS_KEY, next);
  window.dispatchEvent(new CustomEvent('cloud-sync-status-changed', { detail: next }));

  return next;
}

function getDeviceId() {
  const saved = getData(DEVICE_ID_KEY);
  if (saved) return saved;

  const id = generateId();
  setData(DEVICE_ID_KEY, id);
  return id;
}

function normalizeEndpoint(endpoint) {
  return String(endpoint || '').trim().replace(/\/+$/, '');
}

function cloudFetch(path, options = {}, config = getCloudConfig()) {
  const endpoint = normalizeEndpoint(config.endpoint);

  if (!endpoint) {
    throw new Error('云服务器地址为空');
  }

  const url = `${endpoint}${path}`;
  const headers = {
    'content-type': 'application/json',
    'x-api-key': config.apiKey,
    ...(options.headers || {})
  };

  return fetch(url, {
    ...options,
    headers,
    cache: 'no-store'
  });
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isValidSnapshot(snapshot) {
  return Boolean(
    snapshot &&
    typeof snapshot === 'object' &&
    typeof snapshot.localStorage === 'object' &&
    typeof snapshot.indexedDB === 'object'
  );
}

function getPrimaryKey(storeName, record) {
  if (!record || typeof record !== 'object') return '';

  if (storeName === 'blobs') {
    return record.key || '';
  }

  return record.id || '';
}

async function withSyncLock(task) {
  if (syncLock) {
    throw new Error('同步正在进行中');
  }

  syncLock = true;

  try {
    return await task();
  } finally {
    syncLock = false;
  }
}

function emitStorageChanged() {
  window.dispatchEvent(new CustomEvent('desktop:refresh'));
  window.dispatchEvent(new CustomEvent('app-settings-updated'));
  window.dispatchEvent(new CustomEvent('app-images-updated'));
}

// 依赖：./storage.js(getData,setData,removeData,getAllDB,setDB,clearStoreDB,generateId,getNow)
