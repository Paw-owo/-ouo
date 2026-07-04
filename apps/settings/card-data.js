// apps/settings/card-data.js
// 数据管理卡。导出、导入、清空、重置都在这里，
// 比原来的备份卡多了清空和重置两个危险操作，我都加了二次确认。
// 依赖：core/storage-keys.js, core/storage.js, core/ui.js, core/util.js, core/events.js

import { KEYS, STORES } from '../../core/storage-keys.js';
import { setData, removeData, getAllDB, setDB, clearStoreDB } from '../../core/storage.js';
import { showToast, showConfirm } from '../../core/ui.js';
import { downloadBlob } from '../../core/util.js';
import bus from '../../core/events.js';

// 默认值：和 storage.js 的 ensureDefaultSettings 对齐
const DEFAULT_THEME_ID = 'sky';
const DEFAULT_LOCK_PASSWORD = '0326';

// 把所有 localStorage + 所有 IndexedDB store 打包成一个对象
async function packAllData() {
  const out = {
    schema: 2,
    exportedAt: new Date().toISOString(),
    localStorage: {},
    stores: {}
  };
  // localStorage 全量带出（KEYS 注册过的也都在里面）
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    try { out.localStorage[k] = localStorage.getItem(k); } catch (e) { /* 忽略单条失败 */ }
  }
  // 用 getAllDB 遍历每个 store
  for (const name of Object.values(STORES)) {
    try { out.stores[name] = await getAllDB(name); }
    catch (e) { console.warn('[data] 导出失败', name, e); }
  }
  return out;
}

// 从备份对象还原：localStorage 覆盖写，IndexedDB 逐条 setDB
async function restoreAllData(data) {
  if (!data || typeof data !== 'object') throw new Error('备份文件格式不对嘛');
  if (data.localStorage && typeof data.localStorage === 'object') {
    for (const [k, v] of Object.entries(data.localStorage)) {
      try { localStorage.setItem(k, String(v)); } catch (e) { /* 忽略单条 */ }
    }
  }
  if (data.stores && typeof data.stores === 'object') {
    for (const [name, records] of Object.entries(data.stores)) {
      if (!Array.isArray(records)) continue;
      for (const r of records) {
        if (!r || !r.id) continue;
        try { await setDB(name, r.id, r); }
        catch (e) { console.warn('[data] 导入失败', name, e); }
      }
    }
  }
  return true;
}

// 清空所有 localStorage + 所有 IndexedDB store
async function wipeAllData() {
  try { localStorage.clear(); } catch (e) { /* 忽略 */ }
  for (const name of Object.values(STORES)) {
    try { await clearStoreDB(name); }
    catch (e) { console.warn('[data] 清空失败', name, e); }
  }
}

export function renderDataMgmtCard() {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="card-title">数据</div>
    <div class="card-row">
      <span class="card-row-label">导出全部数据</span>
      <button class="btn" id="dm-export" type="button">导出</button>
    </div>
    <div class="card-row">
      <span class="card-row-label">导入备份</span>
      <button class="btn" id="dm-import" type="button">导入</button>
    </div>
    <div class="card-row">
      <span class="card-row-label">清空所有数据</span>
      <button class="btn ghost" id="dm-clear" type="button">清空</button>
    </div>
    <div class="card-row">
      <span class="card-row-label">重置回出厂状态</span>
      <button class="btn ghost" id="dm-reset" type="button">重置</button>
    </div>
    <div style="font-size:var(--font-size-small);color:var(--text-hint);margin-top:8px;line-height:1.5">数据都乖乖待在本机，导出后请藏好哦。清空和重置不可恢复，要三思嘛</div>
  `;

  // 导出：打包成 JSON Blob 下载
  card.querySelector('#dm-export').addEventListener('click', async () => {
    try {
      const data = await packAllData();
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const date = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `popo-data-${date}.json`);
      showToast('数据导出好啦', 'success');
    } catch (e) {
      showToast('导出失败：' + (e && e.message || '未知错误'), 'error');
    }
  });

  // 导入：文件选择 + 二次确认覆盖
  card.querySelector('#dm-import').addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', async () => {
      const f = input.files && input.files[0];
      document.body.removeChild(input);
      if (!f) return;
      showConfirm({
        title: '确定导入吗？',
        body: '导入会覆盖现在的数据哦，建议先导出一份备份',
        confirmText: '导入',
        cancelText: '不要',
        danger: true,
        onConfirm: async () => {
          try {
            const text = await f.text();
            let data;
            try { data = JSON.parse(text); }
            catch (e) { throw new Error('备份文件读不出来嘛'); }
            await restoreAllData(data);
            showToast('数据导入好啦，刷新一下', 'success');
            setTimeout(() => location.reload(), 800);
          } catch (e) {
            showToast('导入失败：' + (e && e.message || '未知错误'), 'error');
          }
        }
      });
    });
    input.click();
  });

  // 清空数据：两次确认
  card.querySelector('#dm-clear').addEventListener('click', () => {
    showConfirm({
      title: '真的要清空吗？',
      body: '所有数据都会不见，而且找不回来哦',
      confirmText: '真的清空',
      cancelText: '不要',
      danger: true,
      onConfirm: () => {
        showConfirm({
          title: '最后一次确认嘛',
          body: '所有聊天、相册、备忘录都会消失哦',
          confirmText: '我确定',
          cancelText: '再想想',
          danger: true,
          onConfirm: async () => {
            try {
              await wipeAllData();
              showToast('数据清空啦');
              setTimeout(() => location.reload(), 600);
            } catch (e) {
              showToast('清空失败：' + (e && e.message || '未知错误'), 'error');
            }
          }
        });
      }
    });
  });

  // 重置系统：清空 + 还原默认主题和密码
  card.querySelector('#dm-reset').addEventListener('click', () => {
    showConfirm({
      title: '真的要重置吗？',
      body: '会清空数据并恢复默认主题和密码',
      confirmText: '重置',
      cancelText: '不要',
      danger: true,
      onConfirm: () => {
        showConfirm({
          title: '最后一次确认嘛',
          body: '重置后只能从头开始配置啦',
          confirmText: '我确定',
          cancelText: '再想想',
          danger: true,
          onConfirm: async () => {
            try {
              await wipeAllData();
              // 重置主题、密码、自定义颜色为默认
              setData(KEYS.appTheme, DEFAULT_THEME_ID);
              setData(KEYS.appLockPassword, DEFAULT_LOCK_PASSWORD);
              removeData(KEYS.appCustomColors);
              removeData(KEYS.appCustomTheme);
              bus.emit('theme:changed', { id: DEFAULT_THEME_ID });
              showToast('重置完成啦');
              setTimeout(() => location.reload(), 600);
            } catch (e) {
              showToast('重置失败：' + (e && e.message || '未知错误'), 'error');
            }
          }
        });
      }
    });
  });

  return card;
}
