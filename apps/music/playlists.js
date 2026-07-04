// apps/music/playlists.js
// 歌单管理 —— 软萌少女偷偷把喜欢的歌分分类。
// 我把新建 / 重命名 / 删除 / 添加歌曲都收在这里，给 index.js 复用。
// 数据：STORES.playlists -> {id, name, songIds:[], createdAt}
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/util.js
// 红线：图标只准 SVG 线稿，禁止任何 emoji 字符；视觉值走 CSS 变量。

import { STORES } from '../../core/storage-keys.js';
import { getDB, setDB, deleteDB, getAllDB, generateId, getNow } from '../../core/storage.js';
import { showToast, showConfirm, showBottomSheet, createIcon } from '../../core/ui.js';

// 歌单变化时的回调 —— index.js 注册一下，方便列表刷新
let onPlaylistsChange = null;
export function setPlaylistsChangeListener(cb) { onPlaylistsChange = typeof cb === 'function' ? cb : null; }

function notifyChange() {
  if (onPlaylistsChange) {
    try { onPlaylistsChange(); } catch (e) { console.warn('[music/playlists] change 回调失败', e); }
  }
}

// ── 读取 ──

export async function getAllPlaylists() {
  try {
    const list = await getAllDB(STORES.playlists);
    if (!Array.isArray(list)) return [];
    return list.sort((a, b) => {
      const ta = new Date(a.createdAt || 0).getTime();
      const tb = new Date(b.createdAt || 0).getTime();
      return tb - ta;
    });
  } catch (e) {
    console.warn('[music/playlists] 读取歌单失败', e);
    return [];
  }
}

// 拿某个歌单里的歌曲详情（按 songIds 顺序）
export async function getPlaylistSongs(playlistId, allSongs) {
  const pl = await getDB(STORES.playlists, playlistId);
  if (!pl || !Array.isArray(pl.songIds)) return [];
  // allSongs 是 index.js 已经读好的歌曲池，省得反复查
  if (Array.isArray(allSongs)) {
    const map = new Map(allSongs.map((s) => [s.id, s]));
    return pl.songIds.map((id) => map.get(id)).filter(Boolean);
  }
  // 兜底：一条条 getDB
  const out = [];
  for (const id of pl.songIds) {
    const s = await getDB(STORES.songs, id);
    if (s) out.push(s);
  }
  return out;
}

// ── 渲染：横向歌单卡片行 ──

/**
 * 渲染歌单横向滚动条：[全部] + 各歌单卡片 + [+ 新建]
 * @param {HTMLElement} el 容器
 * @param {Array} playlists 所有歌单
 * @param {string|null} activeId 当前选中的歌单 id；null = 全部
 * @param {object} handlers { onSelectAll, onSelectPlaylist, onAddNew }
 */
export function renderPlaylistRow(el, playlists, activeId, handlers) {
  if (!el) return;
  const allActive = activeId === null;
  el.innerHTML = `
    <div class="music-playlist-all ${allActive ? 'active' : ''}" data-action="all" role="button" tabindex="0" aria-label="全部歌曲">
      <div class="music-playlist-cover">${createIcon('music', 28).outerHTML}</div>
      <div class="music-playlist-name">全部歌曲</div>
    </div>
    ${playlists.map((pl) => {
      const active = activeId === pl.id;
      const count = Array.isArray(pl.songIds) ? pl.songIds.length : 0;
      return `
        <div class="music-playlist-card ${active ? 'active' : ''}" data-id="${escapeAttr(pl.id)}" role="button" tabindex="0" aria-label="歌单 ${escapeAttr(pl.name)}">
          <div class="music-playlist-cover">${createIcon('memo', 24).outerHTML}</div>
          <div class="music-playlist-name">${escapeHTML(pl.name || '未命名')}</div>
          <div class="music-playlist-count">${count} 首</div>
        </div>
      `;
    }).join('')}
    <div class="music-playlist-card" data-action="add" role="button" tabindex="0" aria-label="新建歌单">
      <div class="music-playlist-cover">${createIcon('plus', 28).outerHTML}</div>
      <div class="music-playlist-name">新建歌单</div>
      <div class="music-playlist-count">点这里</div>
    </div>
  `;
  el.querySelectorAll('[data-action="all"]').forEach((node) => {
    node.addEventListener('click', () => handlers.onSelectAll && handlers.onSelectAll());
  });
  el.querySelectorAll('.music-playlist-card[data-id]').forEach((node) => {
    const id = node.dataset.id;
    node.addEventListener('click', () => handlers.onSelectPlaylist && handlers.onSelectPlaylist(id));
    // 长按 -> 管理这个歌单
    let pressTimer = null;
    node.addEventListener('pointerdown', () => {
      pressTimer = setTimeout(() => {
        pressTimer = null;
        const pl = playlists.find((p) => p.id === id);
        if (pl) openPlaylistManageSheet(pl);
      }, 550);
    });
    const cancel = () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } };
    node.addEventListener('pointerup', cancel);
    node.addEventListener('pointerleave', cancel);
    node.addEventListener('pointercancel', cancel);
  });
  el.querySelectorAll('[data-action="add"]').forEach((node) => {
    node.addEventListener('click', () => handlers.onAddNew && handlers.onAddNew());
  });
}

// ── 新建歌单 ──

export function openCreatePlaylist() {
  const form = document.createElement('div');
  form.className = 'music-form';
  form.innerHTML = `
    <div class="music-form-row">
      <label class="music-form-label">歌单名字</label>
      <input class="music-form-input" id="pl-name-input" type="text" maxlength="30" placeholder="给歌单起个可爱点的名字嘛" />
    </div>
    <button class="btn primary" id="pl-create-btn" style="width:100%;">${createIcon('check', 18).outerHTML}<span style="margin-left:6px;">建好啦</span></button>
  `;
  const sheet = showBottomSheet({
    title: '新建歌单',
    bodyElement: form,
    onClose: () => {}
  });
  const input = form.querySelector('#pl-name-input');
  const btn = form.querySelector('#pl-create-btn');
  setTimeout(() => { try { input.focus(); } catch (e) {} }, 100);
  const submit = async () => {
    const name = (input.value || '').trim();
    if (!name) { showToast('名字不能空着嘛', 'error'); return; }
    try {
      const id = generateId('pl');
      await setDB(STORES.playlists, id, {
        id,
        name,
        songIds: [],
        createdAt: getNow()
      });
      showToast('歌单建好啦', 'success', 1200);
      sheet.close();
      notifyChange();
    } catch (e) {
      console.warn('[music/playlists] 新建失败', e);
      showToast('没建好，再试一下嘛', 'error');
    }
  };
  btn.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
}

// ── 长按歌单：管理（重命名 / 删除） ──

function openPlaylistManageSheet(playlist) {
  const body = document.createElement('div');
  body.className = 'music-form';
  body.innerHTML = `
    <div style="font-size:var(--font-size-base);color:var(--text-primary);margin-bottom:14px;text-align:center;">
      ${escapeHTML(playlist.name || '未命名')} · ${(playlist.songIds || []).length} 首
    </div>
    <button class="btn" id="pl-rename-btn" style="width:100%;margin-bottom:8px;">${createIcon('edit', 18).outerHTML}<span style="margin-left:6px;">重命名</span></button>
    <button class="btn danger" id="pl-del-btn" style="width:100%;">${createIcon('trash', 18).outerHTML}<span style="margin-left:6px;">删掉这个歌单</span></button>
  `;
  const sheet = showBottomSheet({
    title: '管理歌单',
    bodyElement: body,
    onClose: () => {}
  });
  body.querySelector('#pl-rename-btn').addEventListener('click', () => {
    sheet.close();
    setTimeout(() => openRenamePlaylist(playlist), 60);
  });
  body.querySelector('#pl-del-btn').addEventListener('click', () => {
    sheet.close();
    setTimeout(() => confirmDeletePlaylist(playlist), 60);
  });
}

// ── 重命名 ──

export function openRenamePlaylist(playlist) {
  const form = document.createElement('div');
  form.className = 'music-form';
  form.innerHTML = `
    <div class="music-form-row">
      <label class="music-form-label">新名字</label>
      <input class="music-form-input" id="pl-rename-input" type="text" maxlength="30" value="${escapeAttr(playlist.name || '')}" />
    </div>
    <button class="btn primary" id="pl-rename-ok" style="width:100%;">${createIcon('check', 18).outerHTML}<span style="margin-left:6px;">改好啦</span></button>
  `;
  const sheet = showBottomSheet({
    title: '重命名歌单',
    bodyElement: form,
    onClose: () => {}
  });
  const input = form.querySelector('#pl-rename-input');
  const btn = form.querySelector('#pl-rename-ok');
  setTimeout(() => {
    try { input.focus(); input.select(); } catch (e) {}
  }, 100);
  const submit = async () => {
    const name = (input.value || '').trim();
    if (!name) { showToast('名字不能空着嘛', 'error'); return; }
    if (name === playlist.name) { sheet.close(); return; }
    try {
      await setDB(STORES.playlists, playlist.id, { ...playlist, name });
      showToast('改好啦', 'success', 1200);
      sheet.close();
      notifyChange();
    } catch (e) {
      console.warn('[music/playlists] 重命名失败', e);
      showToast('没改好，再试一下嘛', 'error');
    }
  };
  btn.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
}

// ── 删除 ──

export function confirmDeletePlaylist(playlist) {
  showConfirm({
    title: '删掉这个歌单吗？',
    body: `「${playlist.name || '未命名'}」删掉就找不回来啦（歌曲本身不会删）`,
    confirmText: '删掉吧',
    cancelText: '再想想',
    danger: true,
    onConfirm: async () => {
      try {
        await deleteDB(STORES.playlists, playlist.id);
        showToast('删掉啦', 'default', 1200);
        notifyChange();
      } catch (e) {
        console.warn('[music/playlists] 删除失败', e);
        showToast('没删掉，再试一下嘛', 'error');
      }
    }
  });
}

// ── 添加歌曲到歌单 ──

/**
 * 弹出选歌单的 sheet，让用户把某首歌加到某个歌单里。
 * @param {string} songId 要添加的歌曲 id
 * @param {string} songTitle 用于提示
 */
export async function openAddToPlaylistSheet(songId, songTitle) {
  const playlists = await getAllPlaylists();
  const body = document.createElement('div');
  body.className = 'music-form';
  if (playlists.length === 0) {
    body.innerHTML = `
      <div style="text-align:center;color:var(--text-hint);padding:14px 0 8px;">还没有歌单呢，先去右上角建一个嘛</div>
      <button class="btn primary" id="pl-empty-create" style="width:100%;margin-top:8px;">${createIcon('plus', 18).outerHTML}<span style="margin-left:6px;">现在就建一个</span></button>
    `;
    const sheet = showBottomSheet({
      title: '加入歌单',
      bodyElement: body,
      onClose: () => {}
    });
    body.querySelector('#pl-empty-create').addEventListener('click', () => {
      sheet.close();
      setTimeout(openCreatePlaylist, 60);
    });
    return;
  }
  body.innerHTML = `
    <div style="font-size:var(--font-size-small);color:var(--text-hint);margin-bottom:10px;">
      把「${escapeHTML(songTitle || '这首歌')}」加到：
    </div>
    <div class="music-pick-list">
      ${playlists.map((pl) => {
        const ids = Array.isArray(pl.songIds) ? pl.songIds : [];
        const added = ids.includes(songId);
        return `
          <div class="music-pick-item ${added ? 'added' : ''}" data-id="${escapeAttr(pl.id)}" role="button" tabindex="0">
            <span class="music-pick-item-name">${escapeHTML(pl.name || '未命名')}</span>
            <span class="music-pick-item-count">${ids.length} 首${added ? ' · 已在' : ''}</span>
            ${added ? '' : createIcon('plus', 16).outerHTML}
          </div>
        `;
      }).join('')}
    </div>
  `;
  const sheet = showBottomSheet({
    title: '加入歌单',
    bodyElement: body,
    onClose: () => {}
  });
  body.querySelectorAll('.music-pick-item').forEach((node) => {
    node.addEventListener('click', async () => {
      const id = node.dataset.id;
      const pl = playlists.find((p) => p.id === id);
      if (!pl) return;
      const ids = Array.isArray(pl.songIds) ? pl.songIds.slice() : [];
      if (ids.includes(songId)) {
        showToast('这首歌已经在歌单里啦', 'default', 1200);
        return;
      }
      ids.push(songId);
      try {
        await setDB(STORES.playlists, pl.id, { ...pl, songIds: ids });
        showToast('加好啦', 'success', 1200);
        sheet.close();
        notifyChange();
      } catch (e) {
        console.warn('[music/playlists] 添加歌曲失败', e);
        showToast('没加好，再试一下嘛', 'error');
      }
    });
  });
}

// ── 从歌单移除某首歌 ──

export async function removeSongFromPlaylist(playlistId, songId) {
  const pl = await getDB(STORES.playlists, playlistId);
  if (!pl || !Array.isArray(pl.songIds)) return false;
  const ids = pl.songIds.filter((id) => id !== songId);
  if (ids.length === pl.songIds.length) return false;
  try {
    await setDB(STORES.playlists, pl.id, { ...pl, songIds: ids });
    showToast('从歌单里移走啦', 'default', 1200);
    notifyChange();
    return true;
  } catch (e) {
    console.warn('[music/playlists] 移除失败', e);
    showToast('没移掉，再试一下嘛', 'error');
    return false;
  }
}

// ── 工具 ──

function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function escapeAttr(s) { return escapeHTML(s); }
