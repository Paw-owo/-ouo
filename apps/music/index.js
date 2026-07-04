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
import { openApp } from '../../core/router.js';
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
  escapeAttr,
  parseLRC,
  renderLyricsHTML,
  getRecent,
  refreshLyricsForCurrent,
  queueMove,
  queueRemove,
  queueClear
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
  // 恢复最近播放列表（localStorage，getRecent 返回 [{id, ts}]，这里只取 id）
  state.recentIds = getRecent().map((r) => r && r.id).filter(Boolean);
  state.viewMode = 'all';
  state.queue = [];
  state.queueIndex = -1;
  state.lyrics = [];
  state.lyricsActiveIndex = -1;
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
      <button class="app-header-gear" id="music-settings" aria-label="音乐设置">${createIcon('settings', 18).outerHTML}</button>
      <button class="app-add" id="music-add" aria-label="添加歌曲">${createIcon('plus', 20).outerHTML}</button>
    </div>
    <div class="app-body" id="music-body"></div>
  `;
  container.querySelector('#music-back').addEventListener('click', () => bus.emit('router:home'));
  container.querySelector('#music-add').addEventListener('click', () => pickFiles());
  // 齿轮跳到设置「外观」分组
  container.querySelector('#music-settings').addEventListener('click', () => openApp('settings', { deepLink: { tab: 'appearance' } }));
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
    <div id="music-lyrics-wrap"></div>
    <div class="music-section-title">
      <span>${escapeHTML(listTitle)}</span>
    </div>
    <div class="music-playlist-row" id="music-playlist-row"></div>
    <div class="music-tabs" id="music-tabs"></div>
    <div id="music-list"></div>
  `;
  renderPlayer(body.querySelector('#music-player'));
  renderLyricsPanel(body.querySelector('#music-lyrics-wrap'));
  renderPlaylistRow(
    body.querySelector('#music-playlist-row'),
    state.playlists,
    state.currentPlaylistId,
    {
      onSelectAll: () => { state.currentPlaylistId = null; state.viewMode = 'all'; refresh(); },
      onSelectPlaylist: (id) => { state.currentPlaylistId = id; state.viewMode = 'all'; refresh(); },
      onAddNew: () => openCreatePlaylist()
    }
  );
  renderTabs(body.querySelector('#music-tabs'));
  renderList(body.querySelector('#music-list'));
  onTimeUpdate(); // 同步一次进度 + 歌词
}

// 视图 Tab：全部 / 队列 / 最近 / 收藏
function renderTabs(el) {
  if (!el) return;
  const tabs = [
    { key: 'all', label: '全部歌曲', icon: 'music' },
    { key: 'queue', label: '播放队列', icon: 'next' },
    { key: 'recent', label: '最近在听', icon: 'play' },
    { key: 'favorite', label: '收藏的歌', icon: 'heart' }
  ];
  el.innerHTML = tabs.map((t) => `
    <button class="music-tab ${state.viewMode === t.key ? 'active' : ''}" data-tab="${escapeAttr(t.key)}">
      ${createIcon(t.icon, 14).outerHTML}<span>${escapeHTML(t.label)}</span>
    </button>
  `).join('');
  el.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.tab;
      if (state.viewMode === key) return;
      state.viewMode = key;
      render();
    });
  });
}

// 歌词面板：当前在播才显示
function renderLyricsPanel(wrapEl) {
  if (!wrapEl) return;
  const { audioEl, currentIndex, viewSongs } = state;
  // 没在播就不显示歌词面板
  if (!audioEl || currentIndex < 0) {
    wrapEl.innerHTML = '';
    return;
  }
  const song = viewSongs[currentIndex];
  if (!song) { wrapEl.innerHTML = ''; return; }
  wrapEl.innerHTML = `
    <div class="music-lyrics-card">
      <div class="music-lyrics-head">
        <div class="music-lyrics-title">${createIcon('memo', 14).outerHTML} 这首歌的歌词</div>
        <button class="music-lyrics-upload" id="music-lyrics-upload" aria-label="上传歌词">${createIcon('upload', 16).outerHTML}</button>
      </div>
      <div class="music-lyrics-body" id="music-lyrics-body">
        ${renderLyricsHTML()}
      </div>
    </div>
  `;
  const upBtn = wrapEl.querySelector('#music-lyrics-upload');
  if (upBtn) upBtn.addEventListener('click', () => pickLrcForSong(song));
}

// ── 歌曲列表 ──

function renderList(el) {
  // 按 viewMode 分发
  if (state.viewMode === 'queue') return renderQueueList(el);
  if (state.viewMode === 'recent') return renderRecentList(el);
  if (state.viewMode === 'favorite') return renderFavoriteList(el);
  renderAllList(el);
}

// 全部歌曲 / 歌单视图
function renderAllList(el) {
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
    const fav = !!s.favorite;
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
          <button class="music-fav-btn ${fav ? 'on' : ''}" data-action="fav" data-index="${i}" aria-label="${fav ? '取消收藏' : '收藏'}">${createIcon('heart', 18).outerHTML}</button>
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
    } else if (action === 'fav') {
      btn.addEventListener('click', (e) => { e.stopPropagation(); toggleFavorite(idx); });
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

// 队列视图：显示当前播放队列 + 上下移动 / 移除 / 清空
function renderQueueList(el) {
  const { queue, queueIndex, songs, audioEl } = state;
  if (queue.length === 0) {
    el.innerHTML = `
      <div class="empty-state" style="padding:24px 0;">
        <div class="music-empty-icon">${createIcon('next', 36).outerHTML}</div>
        <div class="empty-state-text">播放队列还是空的，去挑几首歌嘛</div>
      </div>
    `;
    return;
  }
  el.innerHTML = `
    <div class="music-queue-toolbar">
      <div class="music-queue-count">队列里有 ${queue.length} 首歌</div>
      <button class="music-queue-clear" id="music-queue-clear">${createIcon('trash', 14).outerHTML} 清空队列</button>
    </div>
    <div id="music-queue-list"></div>
  `;
  const listEl = el.querySelector('#music-queue-list');
  listEl.innerHTML = queue.map((songId, i) => {
    const s = songs.find((x) => x.id === songId);
    if (!s) return '';
    const isCurrent = i === queueIndex;
    const isPlaying = isCurrent && !!(audioEl && !audioEl.paused);
    return `
      <div class="music-queue-item ${isCurrent ? 'current' : ''}" data-index="${i}">
        <div class="music-queue-index">${isPlaying ? createIcon('play', 12).outerHTML : (i + 1)}</div>
        <div class="music-queue-info" data-action="q-play" data-index="${i}">
          <div class="music-queue-title">${escapeHTML(s.title || '（没名字的歌）')}</div>
          <div class="music-queue-sub">${escapeHTML(s.artist || '未知')} · ${formatDur(s.duration || 0)}</div>
        </div>
        <div class="music-queue-actions">
          <button class="music-queue-btn" data-action="q-up" data-index="${i}" aria-label="上移">${createIcon('upload', 14).outerHTML}</button>
          <button class="music-queue-btn" data-action="q-down" data-index="${i}" aria-label="下移">${createIcon('download', 14).outerHTML}</button>
          <button class="music-queue-btn danger" data-action="q-remove" data-index="${i}" aria-label="移除">${createIcon('close', 14).outerHTML}</button>
        </div>
      </div>
    `;
  }).join('');
  // 绑定事件
  listEl.querySelectorAll('[data-action]').forEach((btn) => {
    const action = btn.dataset.action;
    const idx = Number(btn.dataset.index);
    if (action === 'q-play') {
      btn.addEventListener('click', (e) => { e.stopPropagation(); playQueueItem(idx); });
    } else if (action === 'q-up') {
      btn.addEventListener('click', (e) => { e.stopPropagation(); moveQueueItem(idx, 'up'); });
    } else if (action === 'q-down') {
      btn.addEventListener('click', (e) => { e.stopPropagation(); moveQueueItem(idx, 'down'); });
    } else if (action === 'q-remove') {
      btn.addEventListener('click', (e) => { e.stopPropagation(); removeQueueItem(idx); });
    }
  });
  const clearBtn = el.querySelector('#music-queue-clear');
  if (clearBtn) clearBtn.addEventListener('click', () => clearQueueList());
}

// 最近播放视图
function renderRecentList(el) {
  const { recentIds, songs, audioEl, queue, queueIndex } = state;
  // 把 recentIds 解析成歌曲对象（过滤已删除的）
  const list = recentIds.map((id) => songs.find((s) => s.id === id)).filter(Boolean);
  if (list.length === 0) {
    el.innerHTML = `
      <div class="empty-state" style="padding:24px 0;">
        <div class="music-empty-icon">${createIcon('play', 36).outerHTML}</div>
        <div class="empty-state-text">最近还没听过歌呢，去挑一首嘛</div>
      </div>
    `;
    return;
  }
  el.innerHTML = list.map((s, i) => {
    // 当前在播高亮
    const currentId = queueIndex >= 0 ? queue[queueIndex] : null;
    const isCurrent = s.id === currentId;
    const isPlaying = isCurrent && !!(audioEl && !audioEl.paused);
    const playIcon = createIcon(isPlaying ? 'pause' : 'play', 18).outerHTML;
    return `
      <div class="music-item ${isCurrent ? 'active' : ''}" data-id="${escapeAttr(s.id)}">
        <div class="music-item-main" data-action="r-toggle" data-index="${i}">
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
        <div class="music-item-actions">
          <button class="music-icon-btn" data-action="r-toggle" data-index="${i}" aria-label="${isPlaying ? '暂停' : '播放'}">${playIcon}</button>
        </div>
      </div>
    `;
  }).join('');
  el.querySelectorAll('[data-action=r-toggle]').forEach((btn) => {
    const idx = Number(btn.dataset.index);
    btn.addEventListener('click', (e) => { e.stopPropagation(); playRecentAt(idx); });
  });
}

// 收藏视图
function renderFavoriteList(el) {
  const { songs, audioEl, queue, queueIndex } = state;
  const list = songs.filter((s) => s && s.favorite);
  if (list.length === 0) {
    el.innerHTML = `
      <div class="empty-state" style="padding:24px 0;">
        <div class="music-empty-icon">${createIcon('heart', 36).outerHTML}</div>
        <div class="empty-state-text">还没有收藏呢，点歌曲上的心心收藏嘛</div>
      </div>
    `;
    return;
  }
  el.innerHTML = list.map((s, i) => {
    const currentId = queueIndex >= 0 ? queue[queueIndex] : null;
    const isCurrent = s.id === currentId;
    const isPlaying = isCurrent && !!(audioEl && !audioEl.paused);
    const playIcon = createIcon(isPlaying ? 'pause' : 'play', 18).outerHTML;
    return `
      <div class="music-item ${isCurrent ? 'active' : ''}" data-id="${escapeAttr(s.id)}">
        <div class="music-item-main" data-action="f-toggle" data-index="${i}">
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
        <div class="music-item-actions">
          <button class="music-icon-btn" data-action="f-toggle" data-index="${i}" aria-label="${isPlaying ? '暂停' : '播放'}">${playIcon}</button>
          <button class="music-fav-btn on" data-action="f-fav" data-index="${i}" aria-label="取消收藏">${createIcon('heart', 18).outerHTML}</button>
        </div>
      </div>
    `;
  }).join('');
  el.querySelectorAll('[data-action=f-toggle]').forEach((btn) => {
    const idx = Number(btn.dataset.index);
    btn.addEventListener('click', (e) => { e.stopPropagation(); playFavoriteAt(idx); });
  });
  el.querySelectorAll('[data-action=f-fav]').forEach((btn) => {
    const idx = Number(btn.dataset.index);
    btn.addEventListener('click', (e) => { e.stopPropagation(); unfavoriteAt(idx); });
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
        // 同步从播放队列移除
        const qIdx = state.queue.indexOf(song.id);
        if (qIdx >= 0) {
          state.queue.splice(qIdx, 1);
          if (state.queueIndex > qIdx) state.queueIndex -= 1;
          else if (state.queueIndex === qIdx) state.queueIndex = -1;
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

// ════════════════════════════════════════
// 收藏 / 队列 / 最近 / 歌词 操作
// ════════════════════════════════════════

// 切换收藏（全部歌曲视图里点星标）
async function toggleFavorite(idx) {
  const song = state.viewSongs[idx];
  if (!song) return;
  const next = !song.favorite;
  try {
    await setDB(STORES.songs, song.id, { ...song, favorite: next });
    song.favorite = next;
    // 同步 songs 池
    const inPool = state.songs.find((s) => s.id === song.id);
    if (inPool) inPool.favorite = next;
    showToast(next ? '收藏好啦' : '取消收藏啦', 'default', 1000);
    render();
  } catch (e) {
    console.warn('[music] 收藏失败', e);
    showToast('没收藏上，再试一下嘛', 'error');
  }
}

// 收藏视图里取消收藏
async function unfavoriteAt(idx) {
  const list = state.songs.filter((s) => s && s.favorite);
  const song = list[idx];
  if (!song) return;
  try {
    await setDB(STORES.songs, song.id, { ...song, favorite: false });
    song.favorite = false;
    showToast('取消收藏啦', 'default', 1000);
    render();
  } catch (e) {
    console.warn('[music] 取消收藏失败', e);
    showToast('没取消掉，再试一下嘛', 'error');
  }
}

// 队列视图：点一首播放
function playQueueItem(idx) {
  // 直接调 player 的 playQueueAt（通过 queueIndex 操控）
  // 这里复用 togglePlayAt 不合适，因为它基于 viewSongs。
  // 改为：把 queueIndex 设为目标，然后若当前正在播这一首就暂停，否则播放。
  const { queue, queueIndex, audioEl } = state;
  if (idx < 0 || idx >= queue.length) return;
  if (idx === queueIndex && audioEl) {
    if (audioEl.paused) { audioEl.play().catch(() => {}); }
    else { audioEl.pause(); }
    return;
  }
  // 借用 playAt 的逻辑：临时把 viewSongs 替换为队列对应的歌曲视图太重，
  // 这里直接 import playAt 不行（它是 viewSongs 索引）。
  // 用一个轻量内联播放：复用 player.js 暴露的能力。
  playQueueSongByIndex(idx);
}

// 让 player 播放队列第 idx 首（通过事件桥接不行，直接复用 playAt 的内部逻辑）
// 这里用一个简单办法：把 viewSongs 临时设成队列对应歌曲列表，调 playAt，再恢复。
// 但这会破坏 currentIndex 语义。更干净的做法是在 player.js 暴露 playQueueAt。
// 这里通过 import 一个 helper：实际上 player.js 没导出 playQueueAt。
// 改为：通过 togglePlayAt 需要先把目标歌加入 viewSongs 顶部？太 hacky。
// 直接用动态 import 调 player.js 内部函数不可行（没导出）。
// 因此：把 queue 当作 viewSongs 的临时视图来 playAt。
function playQueueSongByIndex(idx) {
  const { queue, songs } = state;
  if (idx < 0 || idx >= queue.length) return;
  const songId = queue[idx];
  // 在 viewSongs 里找这首歌的索引；找不到就临时把 viewSongs 替换为队列
  let viewIdx = state.viewSongs.findIndex((s) => s.id === songId);
  if (viewIdx >= 0) {
    togglePlayAt(viewIdx);
    return;
  }
  // 当前 viewSongs 里没有这首歌（比如在收藏/最近视图）——
  // 临时把 viewSongs 设为队列里的歌曲快照，播完一首后保持一致
  const snapshot = queue.map((id) => songs.find((s) => s.id === id)).filter(Boolean);
  const prevView = state.viewSongs;
  state.viewSongs = snapshot;
  viewIdx = snapshot.findIndex((s) => s.id === songId);
  if (viewIdx < 0) { state.viewSongs = prevView; return; }
  // playAt 会基于 viewSongs 设队列 + queueIndex
  togglePlayAt(viewIdx);
}

// 队列：上移 / 下移
function moveQueueItem(idx, dir) {
  const ok = queueMove(idx, dir);
  if (ok) render();
}

// 队列：移除某项
async function removeQueueItem(idx) {
  await queueRemove(idx);
  render();
}

// 队列：清空
function clearQueueList() {
  if (state.queue.length === 0) return;
  showConfirm({
    title: '清空播放队列吗？',
    body: '队列里的歌都会被移除（不会删掉哦），当前播放也会停掉',
    confirmText: '清空吧',
    cancelText: '再想想',
    danger: true,
    onConfirm: () => {
      queueClear();
      showToast('队列清空啦', 'default', 1200);
      render();
    }
  });
}

// 最近播放：点一首播放
function playRecentAt(idx) {
  const { recentIds, songs } = state;
  const songId = recentIds[idx];
  if (!songId) return;
  // 把最近列表作为临时 viewSongs，让 playAt 把队列设成最近列表
  const snapshot = recentIds.map((id) => songs.find((s) => s.id === id)).filter(Boolean);
  const prevView = state.viewSongs;
  state.viewSongs = snapshot;
  const viewIdx = snapshot.findIndex((s) => s.id === songId);
  if (viewIdx < 0) { state.viewSongs = prevView; return; }
  togglePlayAt(viewIdx);
}

// 收藏视图：点一首播放
function playFavoriteAt(idx) {
  const { songs } = state;
  const list = songs.filter((s) => s && s.favorite);
  const song = list[idx];
  if (!song) return;
  const prevView = state.viewSongs;
  state.viewSongs = list;
  const viewIdx = list.findIndex((s) => s.id === song.id);
  if (viewIdx < 0) { state.viewSongs = prevView; return; }
  togglePlayAt(viewIdx);
}

// 上传 .lrc 歌词文件给当前歌曲
async function pickLrcForSong(song) {
  if (!song) return;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.lrc,text/plain';
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
    const file = (input.files && input.files[0]) || null;
    cleanup();
    if (!file) { showToast('没选到歌词文件嘛', 'default', 1200); return; }
    try {
      const text = await file.text();
      // 校验一下：至少有一个时间标签才算合法 LRC
      const parsed = parseLRC(text);
      if (parsed.length === 0) {
        showToast('歌词格式不对嘛，要 [mm:ss.xx] 时间标签的', 'error', 2000);
        return;
      }
      await setDB(STORES.songs, song.id, { ...song, lyrics: text });
      // 同步内存
      song.lyrics = text;
      const inPool = state.songs.find((s) => s.id === song.id);
      if (inPool) inPool.lyrics = text;
      // 重新解析当前歌词
      refreshLyricsForCurrent();
      showToast(`歌词加好啦，共 ${parsed.length} 行`, 'success', 1400);
      render();
      onTimeUpdate();
    } catch (e) {
      console.warn('[music] 歌词加载失败', e);
      showToast('歌词没加载上，再试一下嘛', 'error');
    }
  });
  input.addEventListener('blur', () => {
    setTimeout(() => { if (!done && (!input.files || !input.files.length)) cleanup(); }, 400);
  });
  try {
    input.click();
  } catch (e) {
    cleanup();
    showToast('打不开选文件的窗口嘛', 'error');
  }
}
