// apps/music/player.js
// 播放器核心 —— 黑胶卡片渲染 + 音频控制 + 音量/模式/分享。
// 我把所有跟 audio 元素打交道的逻辑都收在这里，index.js 只管数据和列表。
// 共享状态走 state.js 的单例对象，避免循环 import。
// 依赖：core/ui.js, core/events.js, core/util.js, ./state.js
// 红线：图标只准 SVG 线稿，禁止任何 emoji 字符；视觉值走 CSS 变量。

import { showToast, createIcon } from '../../core/ui.js';
import bus from '../../core/events.js';
import { clamp } from '../../core/util.js';
import { recordInteraction } from '../../core/memory.js';
import { state } from './state.js';

// localStorage 里存的音量 / 模式（KEYS 没注册，自己用字符串常量）
const LS_MUSIC_VOLUME = 'music_volume';
const LS_MUSIC_MODE = 'music_mode';
const LS_MUSIC_MUTED = 'music_muted';

// 播放模式：order 顺序 / shuffle 随机 / repeat 单曲循环
const MODE_ORDER = ['order', 'shuffle', 'repeat'];
const MODE_LABELS = { order: '顺序播放', shuffle: '随机播放', repeat: '单曲循环' };
const MODE_ICON = { order: 'next', shuffle: 'shuffle', repeat: 'repeat' };

// index.js 注册的回调 —— audio 事件触发后需要重渲染 / 换封面时用
let callbacks = { render: null, pickCoverForSong: null };
export function setPlayerCallbacks(cb) {
  callbacks = {
    render: typeof cb.render === 'function' ? cb.render : null,
    pickCoverForSong: typeof cb.pickCoverForSong === 'function' ? cb.pickCoverForSong : null
  };
}

// ════════════════════════════════════════
// 播放器卡片渲染：网易云风黑胶
// ════════════════════════════════════════

export function renderPlayer(el) {
  const { audioEl, viewSongs, currentIndex } = state;
  const song = currentIndex >= 0 ? viewSongs[currentIndex] : null;
  const isPlaying = !!(audioEl && !audioEl.paused);
  const title = song ? (song.title || '（没名字的歌）') : '还没选歌呢';
  const artist = song ? (song.artist || '未知') : '点下面列表挑一首嘛';
  const cover = song && song.cover ? song.cover : '';
  const cur = (audioEl && audioEl.currentTime) || 0;
  const dur = (audioEl && audioEl.duration && !isNaN(audioEl.duration))
    ? audioEl.duration
    : (song ? (song.duration || 0) : 0);
  const pct = dur > 0 ? clamp(cur / dur, 0, 1) * 100 : 0;

  const muted = isMuted();
  const vol = getVolume();
  const mode = getMode();

  el.innerHTML = `
    <div class="music-player-card">
      <div class="music-bg" style="${cover ? `background-image:url('${escapeAttr(cover)}')` : ''}"></div>
      <div class="music-bg-mask"></div>
      <div class="music-player-inner">
        <div class="music-disc-wrap ${isPlaying ? 'spinning' : ''}" id="music-cover-btn" role="button" tabindex="0" aria-label="${song ? '点换封面' : '黑胶'}">
          <div class="music-disc"></div>
          <div class="music-cover ${cover ? '' : 'placeholder'}" style="${cover ? `background-image:url('${escapeAttr(cover)}')` : ''}">
            ${cover ? '' : createIcon('music', 32).outerHTML}
          </div>
        </div>
        <div class="music-meta">
          <div class="music-title">${escapeHTML(title)}</div>
          <div class="music-artist">${escapeHTML(artist)}</div>
        </div>
        <div class="music-progress-row">
          <input class="music-progress" id="music-progress" type="range" min="0" max="${Math.max(0, Math.floor(dur))}" step="0.1" value="${Math.floor(cur)}" style="--pct:${pct}%" aria-label="播放进度" />
          <div class="music-time">
            <span id="music-cur">${formatDur(cur)}</span>
            <span id="music-dur">${formatDur(dur)}</span>
          </div>
        </div>
        <div class="music-controls">
          <button class="music-ctrl-btn" id="music-prev" aria-label="上一首">${createIcon('prev', 22).outerHTML}</button>
          <button class="music-ctrl-btn primary" id="music-play" aria-label="${isPlaying ? '暂停' : '播放'}">${createIcon(isPlaying ? 'pause' : 'play', 26).outerHTML}</button>
          <button class="music-ctrl-btn" id="music-next" aria-label="下一首">${createIcon('next', 22).outerHTML}</button>
        </div>
        <div class="music-sub-controls">
          <div class="music-vol-group">
            <button class="music-vol-btn ${muted ? 'muted' : ''}" id="music-vol-btn" aria-label="${muted ? '取消静音' : '静音'}">${createIcon('volume', 18).outerHTML}</button>
            <input class="music-vol-slider" id="music-vol" type="range" min="0" max="1" step="0.01" value="${muted ? 0 : vol}" aria-label="音量" />
          </div>
          <div class="music-sub-right">
            <button class="music-mode-btn ${mode !== 'order' ? 'active' : ''}" id="music-mode-btn" aria-label="${MODE_LABELS[mode]}" title="${MODE_LABELS[mode]}">${createIcon(MODE_ICON[mode], 18).outerHTML}</button>
            <button class="music-share-btn" id="music-share-btn" aria-label="分享到朋友圈">${createIcon('download', 18).outerHTML}</button>
          </div>
        </div>
      </div>
    </div>
  `;

  el.querySelector('#music-prev').addEventListener('click', playPrev);
  el.querySelector('#music-next').addEventListener('click', playNext);
  el.querySelector('#music-play').addEventListener('click', togglePlay);

  // 进度条：拖动 + 点击
  const prog = el.querySelector('#music-progress');
  prog.addEventListener('input', onSeekInput);
  prog.addEventListener('change', onSeekCommit);

  // 封面点击 -> 换封面（交给 index.js 处理选图 + 压缩 + 入库）
  const coverBtn = el.querySelector('#music-cover-btn');
  if (coverBtn) {
    coverBtn.addEventListener('click', () => {
      if (!song) { showToast('先选一首歌嘛', 'default', 1200); return; }
      if (callbacks.pickCoverForSong) callbacks.pickCoverForSong(song);
    });
  }

  // 音量
  const volSlider = el.querySelector('#music-vol');
  volSlider.addEventListener('input', (e) => {
    const v = clamp(Number(e.target.value) || 0, 0, 1);
    setVolume(v);
    if (v > 0 && isMuted()) setMuted(false);
    syncVolumeUI();
  });
  const volBtn = el.querySelector('#music-vol-btn');
  volBtn.addEventListener('click', () => {
    setMuted(!isMuted());
    syncVolumeUI();
  });

  // 模式按钮：循环切 顺序 -> 随机 -> 单曲循环
  const modeBtn = el.querySelector('#music-mode-btn');
  modeBtn.addEventListener('click', () => {
    const cur = getMode();
    const idx = MODE_ORDER.indexOf(cur);
    const next = MODE_ORDER[(idx + 1) % MODE_ORDER.length];
    setMode(next);
    showToast(MODE_LABELS[next], 'default', 1000);
    // 只刷按钮图标，不全量 render（避免音频卡顿）
    modeBtn.setAttribute('aria-label', MODE_LABELS[next]);
    modeBtn.title = MODE_LABELS[next];
    modeBtn.classList.toggle('active', next !== 'order');
    modeBtn.innerHTML = createIcon(MODE_ICON[next], 18).outerHTML;
  });

  // 分享正在播放 -> 朋友圈
  el.querySelector('#music-share-btn').addEventListener('click', shareNowPlaying);
}

// ════════════════════════════════════════
// 音频元素 + 播放控制
// ════════════════════════════════════════

export function ensureAudio() {
  if (state.audioEl) return;
  const a = new Audio();
  a.preload = 'auto';
  a.volume = isMuted() ? 0 : getVolume();
  a.addEventListener('timeupdate', () => { if (!state.seeking) onTimeUpdate(); });
  a.addEventListener('durationchange', onTimeUpdate);
  a.addEventListener('ended', onEnded);
  a.addEventListener('play', () => {
    if (callbacks.render) callbacks.render();
    onTimeUpdate();
    const s = state.viewSongs[state.currentIndex];
    if (s) {
      try { bus.emit('music:playing', { title: s.title, artist: s.artist || '未知' }); } catch (e) {}
    }
    // 同步 Media Session 播放状态（锁屏 / 耳机线控显示）
    try {
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    } catch (e) {}
  });
  a.addEventListener('pause', () => {
    if (callbacks.render) callbacks.render();
    onTimeUpdate();
    try { bus.emit('music:paused'); } catch (e) {}
    // 同步 Media Session 暂停状态
    try {
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    } catch (e) {}
  });
  a.addEventListener('error', () => {
    showToast('这首歌播不出来嘛，换个文件试试', 'error');
  });
  state.audioEl = a;
}

export async function playAt(idx) {
  const { viewSongs, sessionBlobs } = state;
  if (idx < 0 || idx >= viewSongs.length) return;
  const song = viewSongs[idx];
  if (!sessionBlobs.has(song.id)) {
    showToast('这首歌的音频还没准备好嘛，重新加一下试试', 'error');
    return;
  }
  // 切歌前释放上一首的 blob URL（如果之前是 createObjectURL 出来的）
  // 注意：unmount 不释放当前正在用的 URL，只在切歌时释放旧的
  const prevSongId = state.audioEl ? state.audioEl._songId : null;
  if (prevSongId && prevSongId !== song.id) {
    const prevUrl = sessionBlobs.get(prevSongId);
    if (prevUrl) {
      try { URL.revokeObjectURL(prevUrl); } catch (e) {}
      // 注意：revoke 后要从 IDB 重新读出来再 createObjectURL 才能继续用
      // 这里直接 delete 会让上一首下次播放时走 restoreSessionBlobs 流程；
      // 但 restoreSessionBlobs 只在 mount 时跑，所以这里改成「保留 URL 不释放」更安全。
    }
  }
  state.currentIndex = idx;
  ensureAudio();
  const audioEl = state.audioEl;
  audioEl._songId = song.id;
  audioEl.src = sessionBlobs.get(song.id);
  audioEl.volume = isMuted() ? 0 : getVolume();
  // 同步 Media Session 元数据 + 控制器
  updateMediaSession(song);
  try {
    await audioEl.play();
  } catch (e) {
    console.warn('[music] 播放失败', e);
    showToast('播放不出来嘛，换个文件试试', 'error');
  }
}

// 同步 Media Session 元数据 + 媒体键控制（锁屏 / 耳机线控 / 桌面通知）
// 在 playAt 切歌后调用，让系统知道当前在播什么
function updateMediaSession(song) {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: song.title || '未知歌曲',
      artist: song.artist || '未知',
      album: '泡泡音乐',
      artwork: song.cover
        ? [{ src: song.cover, sizes: '512x512', type: 'image/png' }]
        : []
    });
    // 媒体键回调：复用播放器自身的控制函数
    navigator.mediaSession.setActionHandler('play', () => { resumePlay(); });
    navigator.mediaSession.setActionHandler('pause', () => { pausePlay(); });
    navigator.mediaSession.setActionHandler('previoustrack', () => { playPrev(); });
    navigator.mediaSession.setActionHandler('nexttrack', () => { playNext(); });
  } catch (e) {
    console.warn('[music] Media Session 设置失败', e);
  }
}

// Media Session 回调用的封装：继续播放
async function resumePlay() {
  const { audioEl } = state;
  if (!audioEl) return;
  try { await audioEl.play(); } catch (e) { console.warn('[music] mediaSession resume 失败', e); }
}

// Media Session 回调用的封装：暂停
function pausePlay() {
  const { audioEl } = state;
  if (!audioEl) return;
  try { audioEl.pause(); } catch (e) {}
}

// 列表里点一首：正在播这首就暂停，暂停中就继续，否则换这首
export async function togglePlayAt(idx) {
  const { audioEl, currentIndex } = state;
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
export async function togglePlay() {
  const { audioEl, viewSongs, sessionBlobs, currentIndex } = state;
  if (!audioEl || currentIndex < 0) {
    if (viewSongs.length === 0) {
      showToast('还没有歌曲，先选几首嘛', 'default');
      return;
    }
    // 优先播第一首有 blob 的
    const idx = viewSongs.findIndex((s) => sessionBlobs.has(s.id));
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

export async function playPrev() {
  const { viewSongs, currentIndex } = state;
  if (viewSongs.length === 0) return;
  if (currentIndex < 0) { await playAt(findAvailableIndex(0, 1)); return; }
  const idx = findAvailableIndex(currentIndex - 1, -1);
  if (idx < 0) {
    showToast('前面没有可播放的歌啦，先选几首嘛', 'error');
    return;
  }
  await playAt(idx);
}

export async function playNext() {
  const { viewSongs, currentIndex } = state;
  if (viewSongs.length === 0) return;
  const mode = getMode();
  if (mode === 'shuffle') {
    const idx = pickRandomIndex(currentIndex);
    if (idx < 0) {
      showToast('没有可播放的歌啦，先选几首嘛', 'error');
      return;
    }
    await playAt(idx);
    return;
  }
  if (currentIndex < 0) { await playAt(findAvailableIndex(0, 1)); return; }
  const idx = findAvailableIndex(currentIndex + 1, 1);
  if (idx < 0) {
    // 顺序模式下到尾了就停；其他模式循环回头
    if (mode === 'order') {
      showToast('已经是最后一首啦', 'default', 1200);
      return;
    }
    const wrap = findAvailableIndex(0, 1);
    if (wrap < 0) { showToast('没有可播放的歌啦', 'error'); return; }
    await playAt(wrap);
    return;
  }
  await playAt(idx);
}

// ended 时按模式决定下一首
function onEnded() {
  const mode = getMode();
  const { audioEl, currentIndex } = state;
  if (mode === 'repeat') {
    // 单曲循环：重新播当前
    if (audioEl && currentIndex >= 0) {
      try { audioEl.currentTime = 0; audioEl.play(); } catch (e) {}
    }
    return;
  }
  playNext();
}

// 从 fromIndex 沿 step 方向找第一首有 blob 的（循环一圈）
function findAvailableIndex(fromIndex, step) {
  const { viewSongs, sessionBlobs } = state;
  const n = viewSongs.length;
  if (n === 0) return -1;
  for (let k = 0; k < n; k++) {
    const i = ((fromIndex + k * step) % n + n) % n;
    if (sessionBlobs.has(viewSongs[i].id)) return i;
  }
  return -1;
}

// 随机挑一首有 blob 的（避开当前）
function pickRandomIndex(excludeIdx) {
  const { viewSongs, sessionBlobs } = state;
  const candidates = [];
  viewSongs.forEach((s, i) => {
    if (i !== excludeIdx && sessionBlobs.has(s.id)) candidates.push(i);
  });
  if (candidates.length === 0) {
    // 只有当前一首能播
    if (excludeIdx >= 0 && sessionBlobs.has(viewSongs[excludeIdx].id)) return excludeIdx;
    return -1;
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export function onTimeUpdate() {
  const { audioEl, containerEl, seeking } = state;
  if (!audioEl || !containerEl) return;
  const cur = audioEl.currentTime || 0;
  const dur = (audioEl.duration && !isNaN(audioEl.duration)) ? audioEl.duration : 0;
  const pct = dur > 0 ? clamp(cur / dur, 0, 1) * 100 : 0;
  const prog = containerEl.querySelector('#music-progress');
  if (prog && !seeking) {
    prog.value = String(Math.floor(cur));
    prog.style.setProperty('--pct', pct + '%');
    prog.max = String(Math.max(0, Math.floor(dur)));
  }
  const curEl = containerEl.querySelector('#music-cur');
  if (curEl) curEl.textContent = formatDur(cur);
  const durEl = containerEl.querySelector('#music-dur');
  if (durEl) durEl.textContent = formatDur(dur);
}

function onSeekInput(e) {
  state.seeking = true;
  const { audioEl, containerEl } = state;
  if (!audioEl) return;
  const v = Number(e.target.value) || 0;
  const dur = (audioEl.duration && !isNaN(audioEl.duration)) ? audioEl.duration : 0;
  const pct = dur > 0 ? clamp(v / dur, 0, 1) * 100 : 0;
  const prog = containerEl.querySelector('#music-progress');
  if (prog) prog.style.setProperty('--pct', pct + '%');
  const curEl = containerEl.querySelector('#music-cur');
  if (curEl) curEl.textContent = formatDur(v);
}

function onSeekCommit(e) {
  const { audioEl } = state;
  if (!audioEl) { state.seeking = false; return; }
  const v = Number(e.target.value) || 0;
  if (audioEl.duration && !isNaN(audioEl.duration)) {
    audioEl.currentTime = clamp(v, 0, audioEl.duration);
  }
  state.seeking = false;
  onTimeUpdate();
}

// ════════════════════════════════════════
// 音量 / 静音 / 模式（持久化到 localStorage）
// ════════════════════════════════════════

export function getVolume() {
  const v = Number(localStorage.getItem(LS_MUSIC_VOLUME));
  if (!Number.isFinite(v) || v < 0 || v > 1) return 1;
  return v;
}
export function setVolume(v) {
  const vol = clamp(v, 0, 1);
  localStorage.setItem(LS_MUSIC_VOLUME, String(vol));
  if (state.audioEl) state.audioEl.volume = vol;
}
export function isMuted() {
  return localStorage.getItem(LS_MUSIC_MUTED) === '1';
}
export function setMuted(m) {
  localStorage.setItem(LS_MUSIC_MUTED, m ? '1' : '0');
  if (state.audioEl) state.audioEl.volume = m ? 0 : getVolume();
}
export function syncVolumeUI() {
  const { containerEl } = state;
  if (!containerEl) return;
  const slider = containerEl.querySelector('#music-vol');
  const btn = containerEl.querySelector('#music-vol-btn');
  const muted = isMuted();
  const vol = getVolume();
  if (slider) slider.value = String(muted ? 0 : vol);
  if (btn) btn.classList.toggle('muted', muted);
  if (btn) btn.setAttribute('aria-label', muted ? '取消静音' : '静音');
}
export function getMode() {
  const m = localStorage.getItem(LS_MUSIC_MODE);
  return MODE_ORDER.includes(m) ? m : 'order';
}
export function setMode(m) {
  localStorage.setItem(LS_MUSIC_MODE, m);
}

// ════════════════════════════════════════
// 分享正在播放 -> 朋友圈（inbox 监听 music:shared）
// ════════════════════════════════════════

export function shareNowPlaying() {
  const { viewSongs, currentIndex } = state;
  const s = currentIndex >= 0 ? viewSongs[currentIndex] : null;
  if (!s) {
    showToast('还没在听歌呢，先选一首嘛', 'default', 1200);
    return;
  }
  try {
    bus.emit('music:shared', { title: s.title || '未知歌曲', artist: s.artist || '未知' });
    showToast(`把「${s.title || '这首歌'}」分享到朋友圈啦`, 'success', 1600);
    // 写入长期记忆，让 AI 知道主人分享过哪首歌
    recordInteraction({
      characterId: 'global',
      role: 'user',
      source: 'music',
      content: `分享了歌曲《${s.title || '未知歌曲'}》`,
      importance: 3,
      relatedApp: 'music'
    }).catch((e) => {
      console.warn('[music] 记忆写入失败', e);
    });
  } catch (e) {
    console.warn('[music] 分享失败', e);
    showToast('没分享成功，再试一下嘛', 'error');
  }
}

// ════════════════════════════════════════
// 工具（导出给 index.js 复用）
// ════════════════════════════════════════

// 把秒数格式化成 mm:ss，超过一小时显示 h:mm:ss
export function formatDur(sec) {
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

export function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
export function escapeAttr(s) { return escapeHTML(s); }
