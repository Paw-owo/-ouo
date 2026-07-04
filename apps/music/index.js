// apps/music/index.js
// 音乐播放器 App —— 软萌少女风 PWA「泡泡」。
// 我会把本地歌曲偷偷收进口袋，再帮她一张张分类、慢慢陪她听。
// 设计要点：
//   1) 歌曲：STORES.songs -> {id, title, artist, duration, fileName, cover, addedAt}
//   2) 歌单：STORES.playlists -> {id, name, songIds:[], createdAt}（playlists.js 负责）
//   3) blob URL 没法持久化 -> 内存 session 维护 id->blobUrl，重启后失效就提示重选
//   4) 黑胶卡片 + 音频控制 + 音量/模式/分享 -> 全在 player.js
//   5) 长按歌曲 -> 加入歌单；右上角 + 上传本地音频；播放器封面可点换图
//   6) 桌面黑胶 widget 联动：bus.emit('music:playing' / 'music:paused')（在 player.js 里）
//   7) unmount 必须暂停 audioEl，避免后台继续放
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js, core/util.js, core/app-bg.js
// 红线：图标只准 SVG 线稿，禁止任何 emoji 字符；视觉值走 CSS 变量。

import { STORES } from '../../core/storage-keys.js';
import { setDB, deleteDB, getAllDB, generateId, getNow, compressImage, runRequest } from '../../core/storage.js';
import { showToast, showConfirm, showBottomSheet, createIcon } from '../../core/ui.js';
import bus from '../../core/events.js';
import { pickImageFile } from '../../core/util.js';
import { applyAppBg } from '../../core/app-bg.js';
import { injectMusicStyles } from './styles.js';
import { state } from './state.js';
import {
  renderPlayer,
  togglePlayAt,
  onTimeUpdate,
  setPlayerCallbacks,
  playAt,
  formatDur,
  escapeHTML,
  escapeAttr
} from './player.js';
import {
  getAllPlaylists,
  getPlaylistSongs,
  renderPlaylistRow,
  openCreatePlaylist,
  openAddToPlaylistSheet,
  removeSongFromPlaylist,
  setPlaylistsChangeListener
} from './playlists.js';

// ── 样式（只注入一次） ──
injectMusicStyles();

// ════════════════════════════════════════
// mount / unmount
// ════════════════════════════════════════

export async function mount(container, context) {
  state.containerEl = container;
  // player.js 的回调：audio 状态变化时重渲染 + 换封面入口
  setPlayerCallbacks({
    render: () => render(),
    pickCoverForSong: (song) => pickCoverForSong(song)
  });
  // 歌单变化时刷新横向行 + 列表
  setPlaylistsChangeListener(() => { refresh(); });
  container.innerHTML = `
    <div class="app-header">
      <button class="app-back" id="music-back" aria-label="返回桌面">${createIcon('back', 20).outerHTML}</button>
      <div class="app-header-title">音乐</div>
      <button class="app-add" id="music-add" aria-label="添加歌曲">${createIcon('plus', 20).outerHTML}</button>
    </div>
    <div class="app-body" id="music-body"></div>
  `;
  container.querySelector('#music-back').addEventListener('click', () => bus.emit('router:home'));
  container.querySelector('#music-add').addEventListener('click', () => pickFiles());
  await refresh();
  // 从 IndexedDB 恢复每首歌的 blob URL（重启后内存里没了）
  await restoreSessionBlobs();
  applyAppBg(container, 'music');
}

// 把 IndexedDB 里持久化的 Blob 读出来，转成 blob URL 放进 sessionBlobs
async function restoreSessionBlobs() {
  try {
    const all = await getAllDB(STORES.blobs);
    if (!Array.isArray(all)) return;
    for (const rec of all) {
      if (!rec || !rec.id || !rec.blob) continue;
      // 只关心 music 歌曲的 blob（按 songId 命名空间）
      if (typeof rec.id !== 'string' || !rec.id.startsWith('song_')) continue;
      if (state.sessionBlobs.has(rec.id)) continue; // 已经有了不覆盖
      try {
        const url = URL.createObjectURL(rec.blob);
        state.sessionBlobs.set(rec.id, url);
      } catch (e) {
        console.warn('[music] 恢复 blob URL 失败', rec.id, e);
      }
    }
    render();
  } catch (e) {
    console.warn('[music] 读取 blobs 失败', e);
  }
}

export function unmount() {
  // 红线：必须暂停 audioEl，避免后台继续放
  if (state.audioEl) {
    try { state.audioEl.pause(); } catch (e) {}
    try { bus.emit('music:paused'); } catch (e) {}
    state.audioEl = null;
  }
  setPlaylistsChangeListener(null);
  setPlayerCallbacks({});
  state.containerEl = null;
}

// ════════════════════════════════════════
// 数据加载 + 渲染
// ════════════════════════════════════════

async function refresh() {
  if (!state.containerEl) return;
  try {
    state.songs = await getAllDB(STORES.songs);
  } catch (e) {
    console.warn('[music] 读取歌曲失败', e);
    showToast('歌曲列表读不出来嘛，等一下再试试', 'error');
    state.songs = [];
  }
  if (!Array.isArray(state.songs)) state.songs = [];
  // 按 addedAt 倒序（兜底用 createdAt）
  state.songs.sort((a, b) => {
    const ta = new Date(a.addedAt || a.createdAt || 0).getTime();
    const tb = new Date(b.addedAt || b.createdAt || 0).getTime();
    return tb - ta;
  });
  // 读歌单
  state.playlists = await getAllPlaylists();
  // 如果当前选中的歌单被删了，退回全部
  if (state.currentPlaylistId && !state.playlists.find((p) => p.id === state.currentPlaylistId)) {
    state.currentPlaylistId = null;
  }
  // 算 viewSongs
  if (state.currentPlaylistId) {
    state.viewSongs = await getPlaylistSongs(state.currentPlaylistId, state.songs);
  } else {
    state.viewSongs = state.songs.slice();
  }
  // 当前播放索引可能因为列表变化失效，按 id 重新找
  if (state.currentIndex >= 0) {
    const cur = state.audioEl ? state.audioEl._songId : null;
    state.currentIndex = cur ? state.viewSongs.findIndex((s) => s.id === cur) : -1;
  }
  render();
}

function render() {
  if (!state.containerEl) return;
  const body = state.containerEl.querySelector('#music-body');
  if (!body) return;

  // 空状态：连一首歌都没有
  if (state.songs.length === 0) {
    body.innerHTML = `
      <div class="empty-state">
        <div class="music-empty-icon">${createIcon('music', 48).outerHTML}</div>
        <div class="empty-state-text">还没有歌曲，点右上角 + 选几首本地音乐嘛</div>
      </div>
    `;
    return;
  }

  // 当前歌单名（用于列表标题）
  const currentPl = state.currentPlaylistId ? state.playlists.find((p) => p.id === state.currentPlaylistId) : null;
  const listTitle = currentPl
    ? `歌单 · ${currentPl.name || '未命名'}（${state.viewSongs.length}）`
    : `全部歌曲（${state.viewSongs.length}）`;

  body.innerHTML = `
    <div id="music-player"></div>
    <div class="music-section-title">
      <span>${escapeHTML(listTitle)}</span>
    </div>
    <div class="music-playlist-row" id="music-playlist-row"></div>
    <div id="music-list"></div>
  `;
  renderPlayer(body.querySelector('#music-player'));
  renderPlaylistRow(
    body.querySelector('#music-playlist-row'),
    state.playlists,
    state.currentPlaylistId,
    {
      onSelectAll: () => { state.currentPlaylistId = null; refresh(); },
      onSelectPlaylist: (id) => { state.currentPlaylistId = id; refresh(); },
      onAddNew: () => openCreatePlaylist()
    }
  );
  renderList(body.querySelector('#music-list'));
  onTimeUpdate(); // 同步一次进度
}

// ── 歌曲列表 ──

function renderList(el) {
  const { viewSongs, currentIndex, audioEl } = state;
  if (viewSongs.length === 0) {
    el.innerHTML = `
      <div class="empty-state" style="padding:24px 0;">
        <div class="music-empty-icon">${createIcon('memo', 36).outerHTML}</div>
        <div class="empty-state-text">${state.currentPlaylistId ? '这个歌单还是空的，长按歌曲加进来嘛' : '没有可显示的歌曲'}</div>
      </div>
    `;
    return;
  }
  el.innerHTML = viewSongs.map((s, i) => {
    const active = i === currentIndex;
    const isPlaying = active && !!(audioEl && !audioEl.paused);
    const playIcon = createIcon(isPlaying ? 'pause' : 'play', 18).outerHTML;
    const cover = s.cover ? `background-image:url('${escapeAttr(s.cover)}')` : '';
    const coverInner = s.cover ? '' : createIcon('music', 18).outerHTML;
    return `
      <div class="music-item ${active ? 'active' : ''}" data-id="${escapeAttr(s.id)}">
        <div class="music-item-main" data-action="toggle" data-index="${i}">
          <div class="music-item-title">
            <span>${escapeHTML(s.title || '（没名字的歌）')}</span>
            ${isPlaying ? '<span class="music-playing-dot"></span>' : ''}
          </div>
          <div class="music-item-sub">
            <span>${escapeHTML(s.artist || '未知')}</span>
            <span>·</span>
            <span>${formatDur(s.duration || 0)}</span>
          </div>
        </div>
        <div class="music-item-cover" data-action="cover" data-index="${i}" style="${cover}" aria-label="换封面">${coverInner}</div>
        <div class="music-item-actions">
          <button class="music-icon-btn" data-action="toggle" data-index="${i}" aria-label="${isPlaying ? '暂停' : '播放'}">${playIcon}</button>
          <button class="music-icon-btn" data-action="del" data-index="${i}" aria-label="删除">${createIcon('trash', 18).outerHTML}</button>
          <button class="music-icon-btn" data-action="more" data-index="${i}" aria-label="更多">${createIcon('more', 18).outerHTML}</button>
        </div>
      </div>
    `;
  }).join('');
  el.querySelectorAll('[data-action]').forEach((btn) => {
    const action = btn.dataset.action;
    const idx = Number(btn.dataset.index);
    if (action === 'toggle') {
      btn.addEventListener('click', (e) => { e.stopPropagation(); togglePlayAt(idx); });
    } else if (action === 'del') {
      btn.addEventListener('click', (e) => { e.stopPropagation(); confirmDelete(idx); });
    } else if (action === 'cover') {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const s = state.viewSongs[idx];
        if (s) pickCoverForSong(s);
      });
    } else if (action === 'more') {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const s = state.viewSongs[idx];
        if (s) openSongMoreSheet(s, idx);
      });
    }
  });
  // 长按歌曲行 -> 加入歌单
  el.querySelectorAll('.music-item').forEach((node) => {
    let pressTimer = null;
    node.addEventListener('pointerdown', () => {
      pressTimer = setTimeout(() => {
        pressTimer = null;
        const id = node.dataset.id;
        const s = state.viewSongs.find((x) => x.id === id);
        if (s) openAddToPlaylistSheet(s.id, s.title);
      }, 550);
    });
    const cancel = () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } };
    node.addEventListener('pointerup', cancel);
    node.addEventListener('pointerleave', cancel);
    node.addEventListener('pointercancel', cancel);
  });
}

// 长按"更多"按钮：加入歌单 / 换封面 / 从歌单移除 / 删除
function openSongMoreSheet(song, idx) {
  const body = document.createElement('div');
  body.className = 'music-form';
  const inPlaylist = !!state.currentPlaylistId;
  body.innerHTML = `
    <button class="btn" id="m-add-pl" style="width:100%;margin-bottom:8px;">${createIcon('plus', 18).outerHTML}<span style="margin-left:6px;">加入歌单</span></button>
    <button class="btn" id="m-cover" style="width:100%;margin-bottom:8px;">${createIcon('download', 18).outerHTML}<span style="margin-left:6px;">换封面</span></button>
    ${inPlaylist ? `<button class="btn" id="m-rm-pl" style="width:100%;margin-bottom:8px;">${createIcon('minus', 18).outerHTML}<span style="margin-left:6px;">从当前歌单移除</span></button>` : ''}
    <button class="btn danger" id="m-del" style="width:100%;">${createIcon('trash', 18).outerHTML}<span style="margin-left:6px;">删掉这首歌</span></button>
  `;
  const sheet = showBottomSheet({ title: song.title || '这首歌', bodyElement: body, onClose: () => {} });
  body.querySelector('#m-add-pl').addEventListener('click', () => {
    sheet.close();
    setTimeout(() => openAddToPlaylistSheet(song.id, song.title), 60);
  });
  body.querySelector('#m-cover').addEventListener('click', () => {
    sheet.close();
    setTimeout(() => pickCoverForSong(song), 60);
  });
  const rmBtn = body.querySelector('#m-rm-pl');
  if (rmBtn) {
    rmBtn.addEventListener('click', async () => {
      sheet.close();
      if (state.currentPlaylistId) {
        const ok = await removeSongFromPlaylist(state.currentPlaylistId, song.id);
        if (ok) refresh();
      }
    });
  }
  body.querySelector('#m-del').addEventListener('click', () => {
    sheet.close();
    setTimeout(() => confirmDelete(idx), 60);
  });
}

// ════════════════════════════════════════
// 添加 / 删除 / 换封面
// ════════════════════════════════════════

function pickFiles() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'audio/*';
  input.multiple = true;
  input.style.position = 'fixed';
  input.style.left = '-9999px';
  input.style.top = '-9999px';
  input.style.opacity = '0';
  document.body.appendChild(input);
  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    input.remove();
    try { input.value = ''; } catch (e) {}
  };
  input.addEventListener('change', async () => {
    const files = Array.from(input.files || []);
    cleanup();
    if (files.length === 0) {
      // 用户没选文件 —— 上传失败提示
      showToast('没选到文件嘛，再试一下', 'default', 1200);
      return;
    }
    await addFiles(files);
  });
  // 失焦兜底（用户取消）—— 只清理，不打扰
  input.addEventListener('blur', () => {
    setTimeout(() => {
      if (!done && (!input.files || !input.files.length)) cleanup();
    }, 400);
  });
  try {
    input.click();
  } catch (e) {
    cleanup();
    showToast('打不开选文件的窗口嘛', 'error');
  }
}

async function addFiles(files) {
  let ok = 0;
  let fail = 0;
  for (const file of files) {
    // 简单校验：必须是音频
    if (!file || (file.type && !file.type.startsWith('audio/') && !/\.(mp3|wav|ogg|m4a|aac|flac|opus|weba)$/i.test(file.name))) {
      fail++;
      continue;
    }
    try {
      const meta = await readAudioMeta(file);
      if (!meta) { fail++; continue; }
      const id = generateId('song');
      const title = file.name.replace(/\.[^.]+$/, '') || '未命名';
      const record = {
        id,
        title,
        artist: '未知',
        duration: Math.round(meta.duration) || 0,
        fileName: file.name,
        cover: '',
        addedAt: getNow()
      };
      await setDB(STORES.songs, id, record);
      // 把 Blob 持久化到 STORES.blobs，重启后能从 IDB 恢复
      // 注意：setDB 会调 cleanForDB 把 Blob 拍成 {}，必须用 runRequest 直接写 IDB
      await persistSongBlob(id, file);
      state.sessionBlobs.set(id, meta.url);
      ok++;
    } catch (e) {
      console.warn('[music] 添加失败', file.name, e);
      fail++;
    }
  }
  if (ok > 0) {
    showToast(`加好啦 ${ok} 首歌${fail > 0 ? `，${fail} 首没加上` : ''}`, 'success', 1400);
    await refresh();
    // 没在播就自动放第一首新加的（列表最顶）
    if (state.currentIndex < 0 && state.audioEl === null) {
      const idx = state.viewSongs.findIndex((s) => state.sessionBlobs.has(s.id));
      if (idx >= 0) playAt(idx);
    }
  } else {
    // 全失败 —— 上传失败提示
    showToast(fail > 0 ? `${fail} 首歌都没加上，换个文件试试嘛` : '没加上歌，换个文件试试嘛', 'error');
  }
}

// 把音频 Blob 原样存入 STORES.blobs（绕过 cleanForDB，Blob 会被它拍成 {}）
// key 用 songId，value 是 { id, blob, name, type, size, createdAt, updatedAt }
async function persistSongBlob(songId, file) {
  const blob = file instanceof Blob ? file : new Blob([file], { type: file.type || 'audio/*' });
  const record = {
    id: songId,
    blob,
    name: file.name || '',
    type: file.type || '',
    size: blob.size || file.size || 0,
    createdAt: getNow(),
    updatedAt: getNow()
  };
  return runRequest(STORES.blobs, 'readwrite', (store) => {
    return new Promise((resolve, reject) => {
      const req = store.put(record);
      req.onsuccess = () => resolve(record);
      req.onerror = () => reject(req.error);
    });
  });
}

// 读音频 metadata，返回 {duration, url}；url 是 blob URL，留给 session 用
function readAudioMeta(file) {
  return new Promise((resolve) => {
    let url;
    try {
      url = URL.createObjectURL(file);
    } catch (e) {
      resolve(null);
      return;
    }
    const a = new Audio();
    a.preload = 'metadata';
    let done = false;
    const finish = (duration) => {
      if (done) return;
      done = true;
      resolve({ duration: duration || 0, url });
    };
    a.addEventListener('loadedmetadata', () => finish(a.duration));
    a.addEventListener('error', () => finish(0));
    // 兜底超时（有些浏览器读不出 duration）
    setTimeout(() => finish(0), 4000);
    try {
      a.src = url;
    } catch (e) {
      finish(0);
    }
  });
}

// 给某首歌换封面
async function pickCoverForSong(song) {
  if (!song) return;
  let file;
  try {
    file = await pickImageFile('image/*');
  } catch (e) {
    // 用户取消，不打扰
    return;
  }
  if (!file) return;
  try {
    // 压成 dataURL 持久化（compressImage 返回 dataURL）
    const dataURL = await compressImage(file, { maxWidth: 480, quality: 0.8 });
    if (!dataURL) {
      showToast('封面处理失败，换张图试试嘛', 'error');
      return;
    }
    await setDB(STORES.songs, song.id, { ...song, cover: dataURL });
    // 同步内存里的 songs 池
    const inPool = state.songs.find((s) => s.id === song.id);
    if (inPool) inPool.cover = dataURL;
    const inView = state.viewSongs.find((s) => s.id === song.id);
    if (inView) inView.cover = dataURL;
    showToast('封面换好啦', 'success', 1200);
    render();
    onTimeUpdate();
  } catch (e) {
    console.warn('[music] 换封面失败', e);
    showToast('封面没换好，再试一下嘛', 'error');
  }
}

function confirmDelete(idx) {
  const song = state.viewSongs[idx];
  if (!song) return;
  showConfirm({
    title: '删掉这首歌吗？',
    body: `「${song.title || '未命名'}」删掉就找不回来啦`,
    confirmText: '删掉吧',
    cancelText: '再想想',
    danger: true,
    onConfirm: async () => {
      try {
        await deleteDB(STORES.songs, song.id);
        // 同步删掉持久化的 blob
        try { await deleteDB(STORES.blobs, song.id); } catch (e) {}
        const url = state.sessionBlobs.get(song.id);
        if (url) {
          try { URL.revokeObjectURL(url); } catch (e) {}
          state.sessionBlobs.delete(song.id);
        }
        // 同步从所有歌单里移除这首歌的引用
        for (const pl of state.playlists) {
          if (Array.isArray(pl.songIds) && pl.songIds.includes(song.id)) {
            const newIds = pl.songIds.filter((id) => id !== song.id);
            if (newIds.length !== pl.songIds.length) {
              try { await setDB(STORES.playlists, pl.id, { ...pl, songIds: newIds }); } catch (e) {}
            }
          }
        }
        // 正在播这首 -> 停掉
        if (state.audioEl && state.currentIndex === idx) {
          try { state.audioEl.pause(); state.audioEl.src = ''; } catch (e) {}
          state.currentIndex = -1;
        } else if (state.currentIndex > idx) {
          // 删前面的，索引往前挪
          state.currentIndex -= 1;
        }
        showToast('删掉啦', 'default', 1200);
        await refresh();
      } catch (e) {
        console.warn('[music] 删除失败', e);
        showToast('没删掉，再试一下嘛', 'error');
      }
    }
  });
}
