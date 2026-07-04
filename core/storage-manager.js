// core/storage-manager.js
// 云同步可选模块。仅留接口，Phase 1 不实现具体后端。
// 用户可在设置里配置 WebDAV / S3 / GitHub Gist。
// 依赖：core/storage.js, core/storage-keys.js, core/util.js

import { exportAll, importAll } from './storage.js';
import { getData, setData } from './storage.js';
import { KEYS } from './storage-keys.js';
import { downloadBlob } from './util.js';

const SYNC_PROVIDERS = Object.freeze({
  none: 'none',
  webdav: 'webdav',
  s3: 's3',
  gist: 'gist'
});

export function getSyncConfig() {
  return getData('sync_config', { provider: SYNC_PROVIDERS.none, enabled: false, lastSyncAt: null });
}

export function setSyncConfig(cfg) {
  const cur = getSyncConfig();
  return setData('sync_config', { ...cur, ...cfg });
}

/**
 * 导出全量备份为 JSON 文件（含图片 base64）。
 */
export async function exportToFile() {
  const data = await exportAll();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const date = new Date().toISOString().slice(0, 10);
  downloadBlob(blob, `popo-backup-${date}.json`);
  return true;
}

/**
 * 从 JSON 文件导入。
 */
export async function importFromFile(file) {
  if (!file) throw new Error('没选文件嘛');
  const text = await file.text();
  let data;
  try { data = JSON.parse(text); }
  catch (e) { throw new Error('备份文件读不出来嘛'); }
  return importAll(data);
}

/**
 * 占位：上传到云端。Phase 1 不实现具体后端。
 */
export async function pushToCloud() {
  const cfg = getSyncConfig();
  if (!cfg.enabled || cfg.provider === SYNC_PROVIDERS.none) {
    throw new Error('还没配置云同步呢');
  }
  // TODO Phase 8：根据 provider 调用对应客户端
  throw new Error('云同步还在路上，先用导出文件备份吧');
}

/**
 * 占位：从云端拉取。
 */
export async function pullFromCloud() {
  const cfg = getSyncConfig();
  if (!cfg.enabled || cfg.provider === SYNC_PROVIDERS.none) {
    throw new Error('还没配置云同步呢');
  }
  throw new Error('云同步还在路上，先用导出文件备份吧');
}

export async function syncNow() {
  try {
    await pushToCloud();
    setSyncConfig({ lastSyncAt: new Date().toISOString() });
    return true;
  } catch (e) {
    console.warn('[storage-manager] 同步失败', e);
    throw e;
  }
}

export const PROVIDERS = SYNC_PROVIDERS;
