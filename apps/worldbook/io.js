// apps/worldbook/io.js
// 世界书导入 / 导出——我把全部词条打包成 JSON 文件给主人下载，
// 也能从别人分享的 JSON 文件里逐条加进来。
// 红线：图标只准 SVG 线稿（createIcon），禁止任何 emoji 字符；视觉值全部走 CSS 变量。
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/util.js, ./shared.js

import { STORES } from '../../core/storage-keys.js';
import { getAllDB, setDB, generateId, getNow } from '../../core/storage.js';
import { showToast } from '../../core/ui.js';
import { downloadBlob } from '../../core/util.js';
import { EXPORT_VERSION, EXPORT_KIND } from './shared.js';

// ════════════════════════════════════════
// 导出全部世界书为 JSON 文件
// ════════════════════════════════════════

export async function exportWorldbook() {
  let entries = [];
  try {
    entries = await getAllDB(STORES.worldbook);
  } catch (e) {
    console.warn('[worldbook] 读取词条失败', e);
    showToast('词条读不出来嘛', 'error');
    return;
  }
  if (!Array.isArray(entries) || !entries.length) {
    showToast('还没有词条，先加一些再导出嘛', 'error');
    return;
  }
  const payload = {
    kind: EXPORT_KIND,
    version: EXPORT_VERSION,
    exportedAt: getNow(),
    entries: entries.map((e) => normalizeEntry(e, { keepId: false }))
  };
  try {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `世界书_${new Date().toISOString().slice(0, 10)}.json`);
    showToast(`导出好啦，共 ${entries.length} 条`, 'success', 1600);
  } catch (e) {
    console.warn('[worldbook] 导出失败', e);
    showToast('没导出成功，再试一下嘛', 'error');
  }
}

// ════════════════════════════════════════
// 导入世界书（从 JSON 文件，逐条 setDB，id 重新生成避免冲突）
// @param {File} file
// @param {function} onImported  导入成功后回调
// ════════════════════════════════════════

export async function importWorldbook(file, onImported) {
  if (!file) {
    showToast('没选到文件呀', 'error');
    return;
  }
  let text;
  try {
    text = await file.text();
  } catch (e) {
    console.warn('[worldbook] 读文件失败', e);
    showToast('文件读不出来嘛', 'error');
    return;
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    showToast('文件格式不对，不是合法的 JSON 嘛', 'error');
    return;
  }

  // 校验：支持 {kind:'popo-worldbook', entries:[...]} 或裸数组 [{...}, ...]
  let list;
  if (data && data.kind === EXPORT_KIND && Array.isArray(data.entries)) {
    list = data.entries;
  } else if (Array.isArray(data)) {
    list = data;
  } else if (data && typeof data === 'object' && data.keyword) {
    list = [data];
  } else {
    showToast('这个文件不像世界书呀', 'error');
    return;
  }

  let okCount = 0;
  let failCount = 0;
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') { failCount++; continue; }
    if (!raw.keyword || typeof raw.keyword !== 'string') { failCount++; continue; }
    try {
      const id = generateId('wb');
      const now = getNow();
      const record = normalizeEntry(raw, { keepId: false });
      record.id = id;
      record.createdAt = now;
      await setDB(STORES.worldbook, id, record);
      okCount++;
    } catch (e) {
      console.warn('[worldbook] 单条导入失败', e);
      failCount++;
    }
  }

  if (okCount > 0) {
    showToast(`加进来 ${okCount} 条${failCount > 0 ? `，${failCount} 条没成功` : ''}`, 'success', 1800);
    if (typeof onImported === 'function') onImported(okCount);
  } else {
    showToast('一条都没加进来，文件里没合法词条呀', 'error');
  }
}

// ════════════════════════════════════════
// 规整词条字段（导出 / 导入共用）
// ════════════════════════════════════════

function normalizeEntry(raw, { keepId } = { keepId: true }) {
  const entry = {
    keyword: String(raw.keyword || '').slice(0, 60),
    content: String(raw.content || '').slice(0, 3000),
    enabled: raw.enabled !== false,
    priority: clampPriority(raw.priority),
    triggers: Array.isArray(raw.triggers) ? raw.triggers.filter((t) => typeof t === 'string') : [],
    characterIds: Array.isArray(raw.characterIds) ? raw.characterIds.filter((t) => typeof t === 'string') : [],
    category: String(raw.category || '').slice(0, 20),
    note: String(raw.note || '').slice(0, 500),
    triggerCount: Number(raw.triggerCount ?? 0) || 0
  };
  if (keepId && raw.id) entry.id = String(raw.id);
  return entry;
}

function clampPriority(v) {
  const n = Number(v);
  if (isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 9999) return 9999;
  return Math.round(n);
}
