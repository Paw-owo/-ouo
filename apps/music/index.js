// apps/music/index.js
// 音乐播放器 App —— 软萌少女风 PWA「泡泡」。
// 我会把本地歌曲偷偷收进口袋，慢慢陪你听。
// 设计要点：
//   1) 歌曲元数据存 IndexedDB（STORES.songs）：{id, title, artist, duration, fileName, addedAt}
//   2) blob URL 没法持久化，重启后失效 → 只在内存 session 里维护 id→blobUrl
//   3) 历史记录从 DB 读出来显示列表，播放时若内存里没有 blobUrl 就提示“重新选一下这首歌嘛”
//   4) 顶部播放器卡片：标题 / 艺术家 / 进度条 / 上一首 / 播放暂停 / 下一首
//   5) 下方列表按 addedAt 倒序：标题 + 艺术家 + 时长 + 播放 + 删除
//   6) 右上角 + 选本地音频文件，读 metadata 后入 DB + session
//   7) 与桌面 vinyl widget 联动：播放时 bus.emit('music:playing', {title, artist})
//   8) unmount 必须暂停 audioEl，避免后台继续放
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js, core/util.js

import { STORES } from '../../core/storage-keys.js';
import { getDB, setDB, deleteDB, getAllDB, generateId, getNow } from '../../core/storage.js';
import { showToast, showConfirm, createIcon } from '../../core/ui.js';
import bus from '../../core/events.js';
import { injectStyle, clamp } from '../../core/util.js';

let containerEl = null;
let audioEl = null;

// 内存 session：id → blobUrl。重启后清空，需重新选歌
const sessionBlobs = new Map();
// 当前展示的歌曲列表（从 DB 读出，按 addedAt 倒序）
let songs = [];
// 当前播放歌曲在 songs 里的索引，-1 表示没选
let currentIndex = -1;

injectStyle('app-music-style', `
  .music-player-card{
    background:linear-gradient(135deg,var(--accent) 0%,var(--accent-dark) 100%);
    color:var(--bubble-user-text);
    border-radius:var(--radius-card);
    padding:20px 18px 16px;
    box-shadow:var(--shadow-md);
    margin-bottom:18px;
    display:flex;flex-direction:column;align-items:center;gap:12px;
  }
  .music-disc{
    width:64px;height:64px;border-radius:50%;
    background:rgba(255,255,255,.18);
    display:flex;align-items:center;justify-content:center;
    border:2px solid rgba(255,255,255,.32);
  }
  .music-disc.spinning{animation:musicSpin 6s linear infinite;}
  @keyframes musicSpin{to{transform:rotate(360deg)}}
  .music-meta{text-align:center;width:100%;}
  .music-title{
    font-size:var(--font-size-title);font-weight:700;line-height:1.3;
    word-break:break-word;
  }
  .music-artist{font-size:var(--font-size-small);opacity:.85;margin-top:2px;}
  .music-progress{
    position:relative;width:100%;height:6px;
    background:rgba(255,255,255,.28);border-radius:999px;
    cursor:pointer;overflow:hidden;
  }
  .music-progress-bar{
    height:100%;background:#fff;border-radius:999px;width:0%;
    transition:width .12s linear;
  }
  .music-time{
    width:100%;display:flex;justify-content:space-between;
    font-size:var(--font-size-small);opacity:.85;font-variant-numeric:tabular-nums;
  }
  .music-controls{display:flex;align-items:center;gap:18px;}
  .music-ctrl-btn{
    width:42px;height:42px;border-radius:50%;
    background:rgba(255,255,255,.2);color:inherit;border:none;
    display:flex;align-items:center;justify-content:center;
    transition:var(--motion);
  }
  .music-ctrl-btn:active{transform:scale(var(--press-scale));}
  .music-ctrl-btn.primary{
    width:56px;height:56px;background:#fff;color:var(--accent-dark);
  }
  .music-section-title{
    font-size:var(--font-size-small);color:var(--text-secondary);
    margin:4px 2px 10px;font-weight:600;
  }
  .music-item{
    display:flex;align-items:center;gap:10px;
    background:var(--bg-card);border-radius:var(--radius-card);
    padding:12px 14px;margin-bottom:10px;box-shadow:var(--shadow-sm);
    border:1px solid transparent;transition:var(--motion);
  }
  .music-item:active{transform:scale(var(--press-scale));}
  .music-item.active{border-color:var(--accent);}
  .music-item-main{flex:1;min-width:0;cursor:pointer;}
  .music-item-title{
    font-size:var(--font-size-base);font-weight:600;color:var(--text-primary);
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
    display:flex;align-items:center;gap:6px;
  }
  .music-item-sub{
    font-size:var(--font-size-small);color:var(--text-hint);
    margin-top:3px;display:flex;align-items:center;gap:5px;flex-wrap:wrap;
  }
  .music-item-hint{
    color:var(--accent-dark);font-size:var(--font-size-small);
    background:color-mix(in srgb,var(--accent-light) 60%,transparent);
    padding:1px 8px;border-radius:999px;
  }
  .music-playing-dot{
    width:7px;height:7px;border-radius:50%;background:var(--accent);
    display:inline-block;animation:musicPulse 1s ease-in-out infinite;
    flex-shrink:0;
  }
  @keyframes musicPulse{0%,100%{transform:scale(.7);opacity:.6}50%{transform:scale(1.1);opacity:1}}
  .music-item-actions{display:flex;align-items:center;gap:2px;flex-shrink:0;}
  .music-icon-btn{
    width:32px;height:32px;border-radius:50%;
    background:transparent;color:var(--text-hint);border:none;
    display:flex;align-items:center;justify-content:center;
    transition:var(--motion);
  }
  .music-icon-btn:active{transform:scale(var(--press-scale));}
  .music-empty-icon{opacity:.5;margin-bottom:12px;color:var(--text-hint);}
  @media (prefers-reduced-motion:reduce){
    .music-disc.spinning,.music-playing-dot{animation:none!important;}
    .music-progress-bar{transition:none!important;}
  }
`);

// ════════════════════════════════════════
// mount / unmount
// ════════════════════════════════════════

export async function mount(container, context) {
  containerEl = container;
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
}

export function unmount() {
  // 红线：必须暂停 audioEl，避免后台继续放
  if (audioEl) {
    try { audioEl.pause(); } catch (e) {}
    try { bus.emit('music:paused'); } catch (e) {}
    audioEl = null;
  }
  containerEl = null;
}

// ════════════════════════════════════════
// 数据加载 + 渲染
// ════════════════════════════════════════

async function refresh() {
  if (!containerEl) return;
  try {
    songs = await getAllDB(STORES.songs);
  } catch (e) {
    console.warn('[music] 读取歌曲失败', e);
    showToast('歌曲列表读不出来嘛，等一下再试试', 'error');
    songs = [];
  }
  // 按 addedAt 倒序（兜底用 createdAt）
  songs.sort((a, b) => {
    const ta = new Date(a.addedAt || a.createdAt || 0).getTime();
    const tb = new Date(b.addedAt || b.createdAt || 0).getTime();
    return tb - ta;
  });
  if (currentIndex >= songs.length) currentIndex = -1;
  render();
}

function render() {
  if (!containerEl) return;
  const body = containerEl.querySelector('#music-body');
  if (!body) return;

  if (songs.length === 0) {
    body.innerHTML = `
      <div class="empty-state">
        <div class="music-empty-icon">${createIcon('music', 48).outerHTML}</div>
        <div class="empty-state-text">还没有歌曲，选几首本地音乐嘛</div>
      </div>
    `;
    return;
  }

  body.innerHTML = `
    <div id="music-player"></div>
    <div class="music-section-title">歌单（${songs.length}）</div>
    <div id="music-list"></div>
  `;
  renderPlayer(body.querySelector('#music-player'));
  renderList(body.querySelector('#music-list'));
  onTimeUpdate(); // 同步一次进度
}

function renderPlayer(el) {
  const song = currentIndex >= 0 ? songs[currentIndex] : null;
  const isPlaying = !!(audioEl && !audioEl.paused);
  const title = song ? (song.title || '（没名字的歌）') : '还没选歌呢';
  const artist = song ? (song.artist || '未知') : '点下面列表挑一首嘛';
  const cur = (audioEl && audioEl.currentTime) || 0;
  const dur = (audioEl && audioEl.duration && !isNaN(audioEl.duration))
    ? audioEl.duration
    : (song ? (song.duration || 0) : 0);
  const pct = dur > 0 ? clamp(cur / dur, 0, 1) * 100 : 0;

  el.innerHTML = `
    <div class="music-player-card">
      <div class="music-disc ${isPlaying ? 'spinning' : ''}">${createIcon('music', 28).outerHTML}</div>
      <div class="music-meta">
        <div class="music-title">${escapeHTML(title)}</div>
        <div class="music-artist">${escapeHTML(artist)}</div>
      </div>
      <div class="music-progress" id="music-progress" role="slider" aria-label="播放进度" tabindex="0" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}">
        <div class="music-progress-bar" style="width:${pct}%"></div>
      </div>
      <div class="music-time">
        <span id="music-cur">${formatDur(cur)}</span>
        <span id="music-dur">${formatDur(dur)}</span>
      </div>
      <div class="music-controls">
        <button class="music-ctrl-btn" id="music-prev" aria-label="上一首">${createIcon('prev', 22).outerHTML}</button>
        <button class="music-ctrl-btn primary" id="music-play" aria-label="${isPlaying ? '暂停' : '播放'}">${createIcon(isPlaying ? 'pause' : 'play', 26).outerHTML}</button>
        <button class="music-ctrl-btn" id="music-next" aria-label="下一首">${createIcon('next', 22).outerHTML}</button>
      </div>
    </div>
  `;
  el.querySelector('#music-prev').addEventListener('click', playPrev);
  el.querySelector('#music-next').addEventListener('click', playNext);
  el.querySelector('#music-play').addEventListener('click', togglePlay);
  const prog = el.querySelector('#music-progress');
  prog.addEventListener('click', seekTo);
  // 键盘左右调整进度
  prog.addEventListener('keydown', (e) => {
    if (!audioEl || !audioEl.duration || isNaN(audioEl.duration)) return;
    if (e.key === 'ArrowLeft') {
      audioEl.currentTime = Math.max(0, audioEl.currentTime - 5);
      onTimeUpdate();
    } else if (e.key === 'ArrowRight') {
      audioEl.currentTime = Math.min(audioEl.duration, audioEl.currentTime + 5);
      onTimeUpdate();
    }
  });
}

function renderList(el) {
  el.innerHTML = songs.map((s, i) => {
    const hasBlob = sessionBlobs.has(s.id);
    const active = i === currentIndex;
    const isPlaying = active && !!(audioEl && !audioEl.paused);
    const playIcon = createIcon(isPlaying ? 'pause' : 'play', 18).outerHTML;
    return `
      <div class="music-item ${active ? 'active' : ''}">
        <div class="music-item-main" data-action="toggle" data-index="${i}">
          <div class="music-item-title">
            <span>${escapeHTML(s.title || '（没名字的歌）')}</span>
            ${isPlaying ? '<span class="music-playing-dot"></span>' : ''}
          </div>
          <div class="music-item-sub">
            <span>${escapeHTML(s.artist || '未知')}</span>
            <span>·</span>
            <span>${formatDur(s.duration || 0)}</span>
            ${hasBlob ? '' : '<span class="music-item-hint">需重选</span>'}
          </div>
        </div>
        <div class="music-item-actions">
          <button class="music-icon-btn" data-action="toggle" data-index="${i}" aria-label="${isPlaying ? '暂停' : '播放'}">${playIcon}</button>
          <button class="music-icon-btn" data-action="del" data-index="${i}" aria-label="删除">${createIcon('trash', 18).outerHTML}</button>
        </div>
      </div>
    `;
  }).join('');
  el.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = Number(btn.dataset.index);
      const action = btn.dataset.action;
      if (action === 'toggle') togglePlayAt(idx);
      else if (action === 'del') confirmDelete(idx);
    });
  });
}

// ════════════════════════════════════════
// 播放控制
// ════════════════════════════════════════

function ensureAudio(song) {
  if (audioEl) return;
  audioEl = new Audio();
  audioEl.preload = 'auto';
  audioEl.addEventListener('timeupdate', onTimeUpdate);
  audioEl.addEventListener('durationchange', onTimeUpdate);
  audioEl.addEventListener('ended', playNext);
  audioEl.addEventListener('play', () => {
    render();
    onTimeUpdate();
    const s = songs[currentIndex];
    if (s) {
      try { bus.emit('music:playing', { title: s.title, artist: s.artist || '未知' }); } catch (e) {}
    }
  });
  audioEl.addEventListener('pause', () => {
    render();
    onTimeUpdate();
    try { bus.emit('music:paused'); } catch (e) {}
  });
  audioEl.addEventListener('error', () => {
    showToast('这首歌播不出来嘛，换个文件试试', 'error');
  });
}

async function playAt(idx) {
  if (idx < 0 || idx >= songs.length) return;
  const song = songs[idx];
  if (!sessionBlobs.has(song.id)) {
    showToast('这首歌要重新选一下嘛，blob 失效啦', 'error');
    return;
  }
  currentIndex = idx;
  ensureAudio(song);
  audioEl.src = sessionBlobs.get(song.id);
  try {
    await audioEl.play();
  } catch (e) {
    console.warn('[music] 播放失败', e);
    showToast('播放不出来嘛，换个文件试试', 'error');
  }
}

// 列表里点一首：正在播这首就暂停，暂停中就继续，否则换这首
async function togglePlayAt(idx) {
  if (idx === currentIndex && audioEl) {
    if (audioEl.paused) {
      try { await audioEl.play(); } catch (e) { showToast('播放不出来嘛', 'error'); }
    } else {
      audioEl.pause();
    }
    return;
  }
  await playAt(idx);
}

// 顶部大播放按钮
async function togglePlay() {
  if (!audioEl || currentIndex < 0) {
    if (songs.length === 0) {
      showToast('还没有歌曲，先选几首嘛', 'default');
      return;
    }
    // 优先播第一首有 blob 的
    const idx = songs.findIndex((s) => sessionBlobs.has(s.id));
    if (idx < 0) {
      showToast('当前没有可播放的歌，先选几首嘛', 'error');
      return;
    }
    await playAt(idx);
    return;
  }
  if (audioEl.paused) {
    try { await audioEl.play(); } catch (e) { showToast('播放不出来嘛', 'error'); }
  } else {
    audioEl.pause();
  }
}

async function playPrev() {
  if (songs.length === 0) return;
  if (currentIndex < 0) { await playAt(firstAvailableIndex(0, 1)); return; }
  const idx = findAvailableIndex(currentIndex - 1, -1);
  if (idx < 0) {
    showToast('前面没有可播放的歌啦，先选几首嘛', 'error');
    return;
  }
  await playAt(idx);
}

async function playNext() {
  if (songs.length === 0) return;
  if (currentIndex < 0) { await playAt(firstAvailableIndex(0, 1)); return; }
  const idx = findAvailableIndex(currentIndex + 1, 1);
  if (idx < 0) {
    showToast('后面没有可播放的歌啦，先选几首嘛', 'error');
    return;
  }
  await playAt(idx);
}

// 从 fromIndex 沿 step 方向找第一首有 blob 的（循环一圈）
function findAvailableIndex(fromIndex, step) {
  const n = songs.length;
  for (let k = 0; k < n; k++) {
    const i = ((fromIndex + k * step) % n + n) % n;
    if (sessionBlobs.has(songs[i].id)) return i;
  }
  return -1;
}

function firstAvailableIndex(start, step) {
  return findAvailableIndex(start, step);
}

function onTimeUpdate() {
  if (!audioEl || !containerEl) return;
  const cur = audioEl.currentTime || 0;
  const dur = (audioEl.duration && !isNaN(audioEl.duration)) ? audioEl.duration : 0;
  const pct = dur > 0 ? clamp(cur / dur, 0, 1) * 100 : 0;
  const bar = containerEl.querySelector('#music-progress .music-progress-bar');
  if (bar) bar.style.width = pct + '%';
  const curEl = containerEl.querySelector('#music-cur');
  if (curEl) curEl.textContent = formatDur(cur);
  const durEl = containerEl.querySelector('#music-dur');
  if (durEl) durEl.textContent = formatDur(dur);
  const prog = containerEl.querySelector('#music-progress');
  if (prog) prog.setAttribute('aria-valuenow', String(Math.round(pct)));
}

function seekTo(e) {
  if (!audioEl || !audioEl.duration || isNaN(audioEl.duration)) return;
  const prog = containerEl.querySelector('#music-progress');
  if (!prog) return;
  const rect = prog.getBoundingClientRect();
  const ratio = clamp((e.clientX - rect.left) / rect.width, 0, 1);
  audioEl.currentTime = ratio * audioEl.duration;
  onTimeUpdate();
}

// ════════════════════════════════════════
// 添加 / 删除
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
    if (files.length === 0) return;
    await addFiles(files);
  });
  // 失焦兜底（用户取消）
  input.addEventListener('blur', () => {
    setTimeout(() => {
      if (!done && (!input.files || !input.files.length)) cleanup();
    }, 400);
  });
  input.click();
}

async function addFiles(files) {
  let ok = 0;
  for (const file of files) {
    try {
      const meta = await readAudioMeta(file);
      if (!meta) continue;
      const id = generateId('song');
      const title = file.name.replace(/\.[^.]+$/, '') || '未命名';
      const record = {
        id,
        title,
        artist: '未知',
        duration: Math.round(meta.duration) || 0,
        fileName: file.name,
        addedAt: getNow()
      };
      await setDB(STORES.songs, id, record);
      sessionBlobs.set(id, meta.url);
      ok++;
    } catch (e) {
      console.warn('[music] 添加失败', file.name, e);
    }
  }
  if (ok > 0) {
    showToast(`加好啦 ${ok} 首歌`, 'success', 1400);
    await refresh();
    // 没在播就自动放第一首新加的（列表最顶）
    if (currentIndex < 0 && audioEl === null) {
      const idx = songs.findIndex((s) => sessionBlobs.has(s.id));
      if (idx >= 0) playAt(idx);
    }
  } else {
    showToast('没加上歌，换个文件试试嘛', 'error');
  }
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

function confirmDelete(idx) {
  const song = songs[idx];
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
        const url = sessionBlobs.get(song.id);
        if (url) {
          try { URL.revokeObjectURL(url); } catch (e) {}
          sessionBlobs.delete(song.id);
        }
        // 正在播这首 → 停掉
        if (audioEl && currentIndex === idx) {
          try { audioEl.pause(); audioEl.src = ''; } catch (e) {}
          currentIndex = -1;
        } else if (currentIndex > idx) {
          // 删前面的，索引往前挪
          currentIndex -= 1;
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
// 工具
// ════════════════════════════════════════

// 把秒数格式化成 mm:ss，超过一小时显示 h:mm:ss
function formatDur(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  const ss = String(r).padStart(2, '0');
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}:${String(m % 60).padStart(2, '0')}:${ss}`;
  }
  return `${String(m).padStart(2, '0')}:${ss}`;
}

function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
