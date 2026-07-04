// apps/characters/io.js
// 角色卡导入 / 导出——我把一个角色的完整数据打包成 JSON 文件给主人下载，
// 也能从别人分享的 JSON 文件里把角色加进来。
// 红线：图标只准 SVG 线稿（createIcon），禁止任何 emoji 字符；视觉值全部走 CSS 变量。
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/util.js, ./shared.js

import { STORES } from '../../core/storage-keys.js';
import { setDB, generateId, getNow } from '../../core/storage.js';
import { showToast } from '../../core/ui.js';
import { downloadBlob } from '../../core/util.js';
import { EXPORT_VERSION, EXPORT_KIND } from './shared.js';

// ════════════════════════════════════════
// 导出单个角色为 JSON 文件
// ════════════════════════════════════════

export function exportCharacter(character) {
  if (!character || !character.id) {
    showToast('这个角色没法导出呀', 'error');
    return;
  }
  // 只导出角色本身的字段，不带上时间戳等内部元数据
  const payload = {
    kind: EXPORT_KIND,
    version: EXPORT_VERSION,
    exportedAt: getNow(),
    character: {
      name: character.name || '',
      nickname: character.nickname || '',
      persona: character.persona || '',
      greeting: character.greeting || '',
      avatar: character.avatar || '',
      temperature: Number(character.temperature ?? 0.7),
      personality: character.personality || '',
      speechStyle: character.speechStyle || '',
      background: character.background || '',
      worldbookIds: Array.isArray(character.worldbookIds) ? character.worldbookIds.slice() : [],
      tags: Array.isArray(character.tags) ? character.tags.slice() : [],
      relation: character.relation || ''
    }
  };
  try {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const safeName = String(character.name || 'character').replace(/[\\/:*?"<>|]/g, '_');
    downloadBlob(blob, `角色_${safeName}.json`);
    showToast('导出好啦，去下载里找找', 'success', 1600);
  } catch (e) {
    console.warn('[characters] 导出失败', e);
    showToast('没导出成功，再试一下嘛', 'error');
  }
}

// ════════════════════════════════════════
// 导入角色（从 JSON 文件）
// @param {File} file
// @param {function} onImported  导入成功后回调（传新角色记录）
// ════════════════════════════════════════

export async function importCharacter(file, onImported) {
  if (!file) {
    showToast('没选到文件呀', 'error');
    return;
  }
  let text;
  try {
    text = await file.text();
  } catch (e) {
    console.warn('[characters] 读文件失败', e);
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

  // 校验：支持 {kind:'popo-character', character:{...}} 或裸 {name,...}
  let raw;
  if (data && data.kind === EXPORT_KIND && data.character && typeof data.character === 'object') {
    raw = data.character;
  } else if (data && typeof data === 'object' && (data.name || data.persona)) {
    raw = data;
  } else {
    showToast('这个文件不像角色卡呀', 'error');
    return;
  }

  // 校验必填
  if (!raw.name || typeof raw.name !== 'string') {
    showToast('角色卡里没有名字，不敢加进来', 'error');
    return;
  }

  try {
    const id = generateId('char');
    const now = getNow();
    const record = {
      id,
      name: String(raw.name).slice(0, 40),
      nickname: String(raw.nickname || '').slice(0, 40),
      persona: String(raw.persona || '').slice(0, 2000),
      greeting: String(raw.greeting || '').slice(0, 500),
      avatar: typeof raw.avatar === 'string' ? raw.avatar : '',
      temperature: clampTemp(raw.temperature),
      personality: String(raw.personality || '').slice(0, 1000),
      speechStyle: String(raw.speechStyle || '').slice(0, 1000),
      background: String(raw.background || '').slice(0, 3000),
      worldbookIds: Array.isArray(raw.worldbookIds) ? raw.worldbookIds.filter((x) => typeof x === 'string') : [],
      tags: Array.isArray(raw.tags) ? raw.tags.filter((x) => typeof x === 'string') : [],
      relation: String(raw.relation || '').slice(0, 40),
      createdAt: now
    };
    await setDB(STORES.characters, id, record);
    showToast(`把「${record.name}」加进来啦`, 'success', 1600);
    if (typeof onImported === 'function') onImported(record);
  } catch (e) {
    console.warn('[characters] 导入失败', e);
    showToast('没导入成功，再试一下嘛', 'error');
  }
}

function clampTemp(v) {
  const n = Number(v);
  if (isNaN(n)) return 0.7;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
