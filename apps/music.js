// apps/music.js
// imports:
//   from '../core/storage.js': getData, setData, generateId, getNow, getDB, setDB, deleteDB, getAllDB
//   from '../core/ui.js': createIcon, showToast

import {
  getData,
  setData,
  generateId,
  getNow,
  getDB,
  setDB,
  deleteDB,
  getAllDB
} from '../core/storage.js';

import { createIcon, showToast } from '../core/ui.js';

// ═══════════════════════════════════════
// 【常量】存储key、样式ID、预设壁纸
// ═══════════════════════════════════════

const STYLE_ID = 'music-app-style';
const SONG_STORE = 'songs';
const PLAYLIST_STORE = 'playlists';
const BLOB_STORE = 'blobs';
const CHARACTER_STORE = 'characters';

const MUSIC_SETTINGS_KEY = 'music_app_settings';
const MUSIC_CURRENT_KEY = 'music_current_song';
const MUSIC_QUEUE_KEY = 'music_queue';

const PRESET_FILM_WALLPAPERS = [
  { id: 'film_1', name: '经典胶片', gradient: 'linear-gradient(135deg, #D4A574 0%, #C4956A 50%, #B8896A 100%)' },
  { id: 'film_2', name: '暖光胶片', gradient: 'linear-gradient(135deg, #E8C9A0 0%, #D4B896 50%, #C4A882 100%)' },
  { id: 'film_3', name: '冷调胶片', gradient: 'linear-gradient(135deg, #A8B8C8 0%, #96A8B8 50%, #8498A8 100%)' },
  { id: 'film_4', name: '暮色胶片', gradient: 'linear-gradient(135deg, #D4A0B0 0%, #C49098 50%, #B88088 100%)' }
];

// ═══════════════════════════════════════
// 【全局状态】播放器运行状态
// ═══════════════════════════════════════

let state = {
  mounted: false,
  rootEl: null,
  currentPage: 'player',
  songs: [],
  playlists: [],
  activePlaylistId: 'all',
  queue: [],
  currentSongId: '',
  isPlaying: false,
  playMode: 'list',
  currentTime: 0,
  duration: 0,
  volume: 1,
  audioContext: null,
  audioSource: null,
  audioSourceConnected: false,
  analyser: null,
  gainNode: null,
  audioElement: null,
  lyrics: [],
  currentLyricIndex: -1,
  dualMode: false,
  selectedCharacterId: '',
  characters: [],
  isSettingsOpen: false,
  isLyricsOpen: false,
  isImporting: false,
  filmWallpaper: PRESET_FILM_WALLPAPERS[0],
  customWallpaper: '',
  playerBg: '',
  listBg: '',
  coverRotation: 0,
  animationFrame: null,
  settings: {
    autoPlay: true,
    showLyrics: true,
    filmWallpaperId: 'film_1',
    playerBgKey: 'app_bg_music_player',
    listBgKey: 'app_bg_music_list',
    dualMode: false,
    selectedCharacterId: '',
    playMode: 'list'
  }
};

// ═══════════════════════════════════════
// 【公开接口】mount / unmount
// ═══════════════════════════════════════

export async function mount(containerEl, options = {}) {
  if (state.mounted) return;

  state.rootEl = containerEl;
  state.mounted = true;

  await loadSettings();
  await loadCharacters();
  await loadSongs();
  await loadPlaylists();
  await loadCurrentSong();

  injectStyle();
  render();
  initAudioElement();
  startAnimationLoop();

  window.musicPlayer = {
    isPlaying: () => state.isPlaying,
    getCurrentSong: () => getCurrentSong(),
    togglePlay,
    playNext,
    playPrevious
  };
}

export function unmount() {
  if (!state.mounted) return;

  stopAnimationLoop();

  if (state.audioElement) {
    state.audioElement.pause();
  }

  state.mounted = false;
  state.rootEl = null;

  updateMiniPlayer();
}

// ═══════════════════════════════════════
// 【样式注入】CSS变量、播放器样式
// ═══════════════════════════════════════

function injectStyle() {
  const old = document.getElementById(STYLE_ID);
  if (old) old.remove();

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .music-app {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--bg-primary);
      color: var(--text-primary);
      font-family: var(--font-main);
    }

    .music-topbar {
      min-height: 58px;
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 12px;
      padding: 0 20px 12px;
      background: color-mix(in srgb, var(--bg-primary) 88%, transparent);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      z-index: 10;
    }

    .music-back-btn {
      width: 38px;
      height: 38px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 16px;
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      transition: all 200ms ease;
    }

    .music-back-btn:active {
      transform: scale(0.96);
    }

    .music-title {
      flex: 1;
      text-align: center;
      font-size: 17px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .music-tabs {
      display: flex;
      gap: 6px;
      padding: 0 20px 12px;
    }

    .music-tab {
      flex: 1;
      height: 38px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 16px;
      background: var(--bg-card);
      color: var(--text-secondary);
      font-size: 14px;
      font-weight: 500;
      box-shadow: var(--shadow-sm);
      transition: all 200ms ease;
    }

    .music-tab.active {
      background: var(--accent);
      color: var(--bubble-user-text);
    }

    .music-tab:active {
      transform: scale(0.96);
    }

    .music-page-container {
      flex: 1;
      position: relative;
      overflow: hidden;
    }

    .music-page {
      position: absolute;
      inset: 0;
      transition: transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 200ms ease;
    }

    .music-page.hidden {
      transform: translateX(100%);
      opacity: 0;
      pointer-events: none;
    }

    .music-page.hidden-left {
      transform: translateX(-100%);
      opacity: 0;
      pointer-events: none;
    }

    .player-page {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      padding: 20px;
      padding-bottom: calc(20px + env(safe-area-inset-bottom));
      background-size: cover;
      background-position: center;
      position: relative;
      overflow: hidden;
    }

    .player-bg-overlay {
      position: absolute;
      inset: 0;
      background: color-mix(in srgb, var(--bg-primary) 70%, transparent);
      backdrop-filter: blur(30px);
      -webkit-backdrop-filter: blur(30px);
    }

    .player-dual-header {
      position: relative;
      z-index: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: -12px;
      padding: 10px 0;
    }

    .dual-avatar {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: var(--bg-card);
      box-shadow: var(--shadow-md);
      overflow: hidden;
      border: 3px solid var(--bg-primary);
    }

    .dual-avatar:nth-child(2) {
      margin-left: -16px;
    }

    .dual-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .dual-avatar-placeholder {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--accent);
    }

    .player-cover-container {
      position: relative;
      z-index: 1;
      width: min(280px, 65vw);
      height: min(280px, 65vw);
      border-radius: 20px;
      background: var(--bg-card);
      box-shadow: var(--shadow-lg);
      overflow: hidden;
      margin: 20px 0;
      transition: transform 50ms linear;
    }

    .player-cover-container img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .player-cover-placeholder {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--accent);
      background: color-mix(in srgb, var(--accent) 10%, var(--bg-card));
    }

    .player-info {
      position: relative;
      z-index: 1;
      text-align: center;
      width: 100%;
      padding: 0 10px;
    }

    .player-song-title {
      font-size: 18px;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .player-song-artist {
      font-size: 14px;
      color: var(--text-secondary);
    }

    .player-progress {
      position: relative;
      z-index: 1;
      width: 100%;
      padding: 10px 0;
    }

    .progress-bar {
      width: 100%;
      height: 4px;
      border-radius: 2px;
      background: color-mix(in srgb, var(--text-hint) 30%, transparent);
      cursor: pointer;
      position: relative;
    }

    .progress-fill {
      height: 100%;
      border-radius: 2px;
      background: var(--accent);
      transition: width 100ms linear;
    }

    .progress-thumb {
      position: absolute;
      top: 50%;
      transform: translate(-50%, -50%);
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: var(--accent);
      box-shadow: var(--shadow-sm);
      cursor: grab;
    }

    .progress-times {
      display: flex;
      justify-content: space-between;
      padding-top: 8px;
      font-size: 12px;
      color: var(--text-hint);
    }

    .player-controls {
      position: relative;
      z-index: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 24px;
      padding: 10px 0 20px;
    }

    .control-btn {
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      background: transparent;
      color: var(--text-primary);
      transition: all 200ms ease;
    }

    .control-btn:active {
      transform: scale(0.92);
    }

    .control-btn.main {
      width: 64px;
      height: 64px;
      background: var(--accent);
      color: var(--bubble-user-text);
      box-shadow: var(--shadow-md);
    }

    .player-secondary-controls {
      position: relative;
      z-index: 1;
      display: flex;
      align-items: center;
      justify-content: space-around;
      width: 100%;
      padding: 0 20px;
    }

    .secondary-btn {
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-secondary);
      transition: all 200ms ease;
    }

    .secondary-btn:active {
      transform: scale(0.92);
    }

    .secondary-btn.active {
      color: var(--accent);
    }

    .list-page {
      display: flex;
      flex-direction: column;
      overflow: hidden;
      position: relative;
    }

    .list-bg-overlay {
      position: absolute;
      inset: 0;
      background: color-mix(in srgb, var(--bg-primary) 85%, transparent);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
    }

    .list-content {
      position: relative;
      z-index: 1;
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .list-hero {
      padding: 20px;
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .list-hero-avatar {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      background: var(--bg-card);
      box-shadow: var(--shadow-md);
      overflow: hidden;
      flex-shrink: 0;
      cursor: pointer;
      position: relative;
    }

    .list-hero-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .list-hero-avatar-placeholder {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--accent);
    }

    .list-hero-avatar-edit {
      position: absolute;
      bottom: 0;
      right: 0;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: var(--accent);
      color: var(--bubble-user-text);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: var(--shadow-sm);
    }

    .list-hero-info {
      flex: 1;
    }

    .list-hero-title {
      font-size: 20px;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 4px;
    }

    .list-hero-count {
      font-size: 13px;
      color: var(--text-secondary);
    }

    .list-playlist-bar {
      display: flex;
      gap: 8px;
      padding: 0 20px 12px;
      overflow-x: auto;
      scrollbar-width: none;
      -ms-overflow-style: none;
    }

    .list-playlist-bar::-webkit-scrollbar {
      display: none;
    }

    .list-playlist-chip {
      flex-shrink: 0;
      height: 32px;
      padding: 0 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      background: var(--bg-card);
      color: var(--text-secondary);
      font-size: 13px;
      font-weight: 500;
      box-shadow: var(--shadow-sm);
      transition: all 200ms ease;
      gap: 6px;
    }

    .list-playlist-chip.active {
      background: var(--accent);
      color: var(--bubble-user-text);
    }

    .list-playlist-chip:active {
      transform: scale(0.96);
    }

    .list-playlist-chip svg {
      width: 14px;
      height: 14px;
    }

    .list-actions {
      padding: 0 20px 12px;
      display: flex;
      gap: 10px;
    }

    .list-action-btn {
      flex: 1;
      height: 42px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      border-radius: var(--radius-md);
      background: var(--bg-card);
      color: var(--text-primary);
      font-size: 14px;
      font-weight: 500;
      box-shadow: var(--shadow-sm);
      transition: all 200ms ease;
    }

    .list-action-btn.primary {
      background: var(--accent);
      color: var(--bubble-user-text);
    }

    .list-action-btn:active {
      transform: scale(0.96);
    }

    .song-list {
      flex: 1;
      overflow-y: auto;
      padding: 0 20px;
      padding-bottom: calc(100px + env(safe-area-inset-bottom));
      -webkit-overflow-scrolling: touch;
    }

    .song-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 0;
      border-bottom: 1px solid color-mix(in srgb, var(--text-hint) 10%, transparent);
      cursor: pointer;
      transition: all 200ms ease;
    }

    .song-item:last-child {
      border-bottom: none;
    }

    .song-item:active {
      opacity: 0.7;
    }

    .song-item.active {
      background: color-mix(in srgb, var(--accent) 8%, transparent);
      border-radius: var(--radius-md);
      padding: 12px;
      margin: 0 -12px;
    }

    .song-item-cover {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      background: color-mix(in srgb, var(--accent) 15%, var(--bg-card));
      overflow: hidden;
      flex-shrink: 0;
    }

    .song-item-cover img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .song-item-cover-placeholder {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--accent);
    }

    .song-item-info {
      flex: 1;
      min-width: 0;
    }

    .song-item-title {
      font-size: 15px;
      font-weight: 500;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .song-item.active .song-item-title {
      color: var(--accent);
    }

    .song-item-artist {
      font-size: 13px;
      color: var(--text-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .song-item-duration {
      font-size: 12px;
      color: var(--text-hint);
      flex-shrink: 0;
    }

    .song-item-actions {
      display: flex;
      gap: 4px;
      flex-shrink: 0;
    }

    .song-item-action-btn {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-hint);
      transition: all 200ms ease;
    }

    .song-item-action-btn:active {
      transform: scale(0.9);
      color: var(--accent);
    }

    .song-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 60px 20px;
      text-align: center;
    }

    .song-empty-icon {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: color-mix(in srgb, var(--accent) 15%, var(--bg-card));
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--accent);
      margin-bottom: 16px;
    }

    .song-empty-title {
      font-size: 16px;
      font-weight: 500;
      color: var(--text-primary);
      margin-bottom: 8px;
    }

    .song-empty-desc {
      font-size: 13px;
      color: var(--text-secondary);
    }

    .music-drawer-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.3);
      z-index: 50;
      opacity: 0;
      transition: opacity 200ms ease;
      pointer-events: none;
    }

    .music-drawer-backdrop.open {
      opacity: 1;
      pointer-events: auto;
    }

    .music-drawer {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 51;
      background: var(--bg-primary);
      border-radius: var(--radius-xl) var(--radius-xl) 0 0;
      box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.1);
      transform: translateY(100%);
      transition: transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
      max-height: 80vh;
      overflow-y: auto;
      padding-bottom: env(safe-area-inset-bottom);
    }

    .music-drawer.open {
      transform: translateY(0);
    }

    .music-drawer-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px;
      border-bottom: 1px solid color-mix(in srgb, var(--text-hint) 10%, transparent);
      position: sticky;
      top: 0;
      background: var(--bg-primary);
      z-index: 1;
    }

    .music-drawer-title {
      font-size: 17px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .music-drawer-close {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
    }

    .music-setting-group {
      padding: 16px 20px;
    }

    .music-setting-group-title {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-secondary);
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .music-setting-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 16px;
      background: var(--bg-card);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-sm);
      margin-bottom: 8px;
    }

    .music-setting-label {
      font-size: 15px;
      color: var(--text-primary);
    }

    .music-setting-value {
      font-size: 14px;
      color: var(--text-secondary);
    }

    .music-toggle {
      width: 48px;
      height: 28px;
      border-radius: 14px;
      background: color-mix(in srgb, var(--text-hint) 30%, transparent);
      position: relative;
      cursor: pointer;
      transition: all 200ms ease;
    }

    .music-toggle.active {
      background: var(--accent);
    }

    .music-toggle::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: white;
      box-shadow: var(--shadow-sm);
      transition: transform 200ms ease;
    }

    .music-toggle.active::after {
      transform: translateX(20px);
    }

    .music-volume-slider {
      width: 100%;
      height: 4px;
      border-radius: 2px;
      background: color-mix(in srgb, var(--text-hint) 30%, transparent);
      -webkit-appearance: none;
      appearance: none;
      outline: none;
    }

    .music-volume-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: var(--accent);
      box-shadow: var(--shadow-sm);
      cursor: grab;
    }

    .music-wallpaper-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
    }

    .music-wallpaper-item {
      height: 80px;
      border-radius: var(--radius-md);
      overflow: hidden;
      cursor: pointer;
      position: relative;
      box-shadow: var(--shadow-sm);
    }

    .music-wallpaper-item.active {
      box-shadow: 0 0 0 3px var(--accent);
    }

    .music-wallpaper-item:active {
      transform: scale(0.96);
    }

    .music-character-select {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .music-character-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      transition: all 200ms ease;
    }

    .music-character-item:active {
      transform: scale(0.92);
    }

    .music-character-item.active {
      opacity: 1;
    }

    .music-character-item:not(.active) {
      opacity: 0.6;
    }

    .music-character-avatar {
      width: 52px;
      height: 52px;
      border-radius: 50%;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      overflow: hidden;
    }

    .music-character-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .music-character-avatar-placeholder {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--accent);
    }

    .music-character-name {
      font-size: 11px;
      color: var(--text-secondary);
      max-width: 60px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      text-align: center;
    }

    .music-lyrics-panel {
      position: fixed;
      inset: 0;
      z-index: 60;
      background: color-mix(in srgb, var(--bg-primary) 92%, transparent);
      backdrop-filter: blur(40px);
      -webkit-backdrop-filter: blur(40px);
      transform: translateY(100%);
      transition: transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
      display: flex;
      flex-direction: column;
    }

    .music-lyrics-panel.open {
      transform: translateY(0);
    }

    .music-lyrics-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px;
      min-height: 58px;
    }

    .music-lyrics-close {
      width: 38px;
      height: 38px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 16px;
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
    }

    .music-lyrics-title {
      font-size: 15px;
      font-weight: 500;
      color: var(--text-primary);
    }

    .music-lyrics-container {
      flex: 1;
      overflow-y: auto;
      padding: 20px 30px;
      -webkit-overflow-scrolling: touch;
    }

    .music-lyric-line {
      padding: 12px 0;
      font-size: 16px;
      line-height: 1.8;
      color: var(--text-hint);
      text-align: center;
      transition: all 300ms ease;
    }

    .music-lyric-line.active {
      font-size: 18px;
      font-weight: 500;
      color: var(--text-primary);
    }

    .music-lyrics-empty {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 40px;
    }

    .music-lyrics-empty-icon {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: color-mix(in srgb, var(--accent) 15%, var(--bg-card));
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--accent);
      margin-bottom: 16px;
    }

    .music-lyrics-empty-title {
      font-size: 16px;
      font-weight: 500;
      color: var(--text-primary);
      margin-bottom: 8px;
    }

    .music-lyrics-empty-desc {
      font-size: 13px;
      color: var(--text-secondary);
      margin-bottom: 20px;
    }

    .music-spectrum {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 120px;
      z-index: 0;
      pointer-events: none;
      opacity: 0.3;
    }

    .music-mini-player {
      position: fixed;
      left: 22px;
      right: 22px;
      bottom: calc(108px + env(safe-area-inset-bottom));
      z-index: 25;
      height: 64px;
      border-radius: 20px;
      background: color-mix(in srgb, var(--bg-card) 90%, transparent);
      box-shadow: var(--shadow-md);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0 16px;
      cursor: pointer;
      transition: all 200ms ease;
      transform: translateY(100px);
      opacity: 0;
    }

    .music-mini-player.visible {
      transform: translateY(0);
      opacity: 1;
    }

    .music-mini-player:active {
      transform: scale(0.98);
    }

    .music-mini-cover {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      background: color-mix(in srgb, var(--accent) 15%, var(--bg-card));
      overflow: hidden;
      flex-shrink: 0;
    }

    .music-mini-cover img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .music-mini-info {
      flex: 1;
      min-width: 0;
    }

    .music-mini-title {
      font-size: 14px;
      font-weight: 500;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .music-mini-artist {
      font-size: 12px;
      color: var(--text-secondary);
    }

    .music-mini-controls {
      display: flex;
      gap: 8px;
    }

    .music-mini-btn {
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-primary);
      transition: all 200ms ease;
    }

    .music-mini-btn:active {
      transform: scale(0.9);
    }

    .playlist-drawer {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 53;
      background: var(--bg-primary);
      border-radius: var(--radius-xl) var(--radius-xl) 0 0;
      box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.1);
      transform: translateY(100%);
      transition: transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
      max-height: 70vh;
      overflow-y: auto;
      padding-bottom: env(safe-area-inset-bottom);
    }

    .playlist-drawer.open {
      transform: translateY(0);
    }

    .playlist-item-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 20px;
      border-bottom: 1px solid color-mix(in srgb, var(--text-hint) 10%, transparent);
    }

    .playlist-item-name {
      font-size: 15px;
      color: var(--text-primary);
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .playlist-item-count {
      font-size: 12px;
      color: var(--text-hint);
      margin-left: 8px;
    }

    .playlist-item-btns {
      display: flex;
      gap: 4px;
      flex-shrink: 0;
      margin-left: 12px;
    }

    .playlist-item-btn {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-hint);
      transition: all 200ms ease;
    }

    .playlist-item-btn:active {
      transform: scale(0.9);
      color: var(--accent);
    }

    .playlist-item-btn.danger:active {
      color: #e74c3c;
    }

    .add-to-playlist-btn {
      width: 100%;
      padding: 14px 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      color: var(--accent);
      font-size: 14px;
      font-weight: 500;
      transition: all 200ms ease;
    }

    .add-to-playlist-btn:active {
      opacity: 0.7;
    }
  `;

  document.head.appendChild(style);
}

// ═══════════════════════════════════════
// 【渲染】主渲染函数
// ═══════════════════════════════════════

function render() {
  if (!state.rootEl) return;

  state.rootEl.innerHTML = '';

  const app = document.createElement('section');
  app.className = 'music-app';

  app.appendChild(createTopbar());
  app.appendChild(createTabs());
  app.appendChild(createPageContainer());

  state.rootEl.appendChild(app);
}

function createTopbar() {
  const topbar = document.createElement('div');
  topbar.className = 'music-topbar';

  const backBtn = document.createElement('button');
  backBtn.className = 'music-back-btn';
  backBtn.appendChild(createIcon('back', 20));
  backBtn.addEventListener('click', () => {
    window.closeCurrentApp?.();
  });

  const title = document.createElement('div');
  title.className = 'music-title';
  title.textContent = '音乐';

  const settingsBtn = document.createElement('button');
  settingsBtn.className = 'music-back-btn';
  settingsBtn.appendChild(createIcon('settings', 18));
  settingsBtn.addEventListener('click', () => openSettingsDrawer());

  topbar.append(backBtn, title, settingsBtn);
  return topbar;
}

function createTabs() {
  const tabs = document.createElement('div');
  tabs.className = 'music-tabs';

  const playerTab = document.createElement('button');
  playerTab.className = `music-tab ${state.currentPage === 'player' ? 'active' : ''}`;
  playerTab.textContent = '播放';
  playerTab.addEventListener('click', () => switchPage('player'));

  const listTab = document.createElement('button');
  listTab.className = `music-tab ${state.currentPage === 'list' ? 'active' : ''}`;
  listTab.textContent = '歌单';
  listTab.addEventListener('click', () => switchPage('list'));

  tabs.append(playerTab, listTab);
  return tabs;
}

function createPageContainer() {
  const container = document.createElement('div');
  container.className = 'music-page-container';

  const playerPage = createPlayerPage();
  playerPage.classList.add('music-page');
  if (state.currentPage !== 'player') {
    playerPage.classList.add('hidden');
  }

  const listPage = createListPage();
  listPage.classList.add('music-page');
  if (state.currentPage !== 'list') {
    listPage.classList.add('hidden');
  }

  container.append(playerPage, listPage);
  return container;
}

function createPlayerPage() {
  const page = document.createElement('div');
  page.className = 'player-page';

  if (state.customWallpaper) {
    page.style.backgroundImage = `url(${state.customWallpaper})`;
  } else if (state.filmWallpaper?.gradient) {
    page.style.background = state.filmWallpaper.gradient;
  }

  const bgOverlay = document.createElement('div');
  bgOverlay.className = 'player-bg-overlay';
  page.appendChild(bgOverlay);

  const spectrum = document.createElement('canvas');
  spectrum.className = 'music-spectrum';
  spectrum.id = 'music-spectrum-canvas';
  page.appendChild(spectrum);

  if (state.dualMode && state.selectedCharacterId) {
    page.appendChild(createDualHeader());
  }

  page.appendChild(createCoverContainer());
  page.appendChild(createPlayerInfo());
  page.appendChild(createProgressBar());
  page.appendChild(createPlayerControls());
  page.appendChild(createSecondaryControls());

  return page;
}

function createDualHeader() {
  const header = document.createElement('div');
  header.className = 'player-dual-header';

  const userAvatar = document.createElement('div');
  userAvatar.className = 'dual-avatar';
  const userImg = getUserAvatar();
  if (userImg) {
    const img = document.createElement('img');
    img.src = userImg;
    img.alt = '';
    userAvatar.appendChild(img);
  } else {
    userAvatar.appendChild(createUserAvatarPlaceholder());
  }

  const aiAvatar = document.createElement('div');
  aiAvatar.className = 'dual-avatar';
  const character = state.characters.find(c => c.id === state.selectedCharacterId);
  if (character?.avatar) {
    const img = document.createElement('img');
    img.src = character.avatar;
    img.alt = character.name || '';
    aiAvatar.appendChild(img);
  } else {
    aiAvatar.appendChild(createCharacterAvatarPlaceholder());
  }

  header.append(userAvatar, aiAvatar);
  return header;
}

function createCoverContainer() {
  const container = document.createElement('div');
  container.className = 'player-cover-container';
  container.style.transform = `rotate(${state.coverRotation}deg)`;

  const currentSong = getCurrentSong();
  if (currentSong?.cover) {
    const img = document.createElement('img');
    img.src = currentSong.cover;
    img.alt = currentSong.title || '';
    container.appendChild(img);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'player-cover-placeholder';
    placeholder.appendChild(createIcon('music', 48));
    container.appendChild(placeholder);
  }

  return container;
}

function createPlayerInfo() {
  const info = document.createElement('div');
  info.className = 'player-info';

  const currentSong = getCurrentSong();

  const title = document.createElement('div');
  title.className = 'player-song-title';
  title.textContent = currentSong?.title || '未播放';

  const artist = document.createElement('div');
  artist.className = 'player-song-artist';
  artist.textContent = currentSong?.artist || '未知艺术家';

  info.append(title, artist);
  return info;
}

function createProgressBar() {
  const progress = document.createElement('div');
  progress.className = 'player-progress';

  const bar = document.createElement('div');
  bar.className = 'progress-bar';

  const fill = document.createElement('div');
  fill.className = 'progress-fill';
  fill.style.width = state.duration ? `${(state.currentTime / state.duration) * 100}%` : '0%';

  const thumb = document.createElement('div');
  thumb.className = 'progress-thumb';
  thumb.style.left = state.duration ? `${(state.currentTime / state.duration) * 100}%` : '0%';

  bar.append(fill, thumb);

  bar.addEventListener('click', (e) => {
    if (!state.audioElement || !state.duration) return;
    const rect = bar.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    state.audioElement.currentTime = percent * state.duration;
  });

  const times = document.createElement('div');
  times.className = 'progress-times';

  const current = document.createElement('span');
  current.textContent = formatTime(state.currentTime);

  const duration = document.createElement('span');
  duration.textContent = formatTime(state.duration);

  times.append(current, duration);

  progress.append(bar, times);
  return progress;
}

function createPlayerControls() {
  const controls = document.createElement('div');
  controls.className = 'player-controls';

  const prevBtn = document.createElement('button');
  prevBtn.className = 'control-btn';
  prevBtn.appendChild(createIcon('back', 24));
  prevBtn.addEventListener('click', playPrevious);

  const playBtn = document.createElement('button');
  playBtn.className = 'control-btn main';
  playBtn.appendChild(createIcon(state.isPlaying ? 'pause' : 'play', 28));
  playBtn.addEventListener('click', togglePlay);

  const nextBtn = document.createElement('button');
  nextBtn.className = 'control-btn';
  nextBtn.appendChild(createIcon('forward', 24));
  nextBtn.addEventListener('click', playNext);

  controls.append(prevBtn, playBtn, nextBtn);
  return controls;
}

function createSecondaryControls() {
  const controls = document.createElement('div');
  controls.className = 'player-secondary-controls';

  const lyricsBtn = document.createElement('button');
  lyricsBtn.className = `secondary-btn ${state.isLyricsOpen ? 'active' : ''}`;
  lyricsBtn.appendChild(createIcon('edit', 20));
  lyricsBtn.addEventListener('click', toggleLyricsPanel);

  const dualBtn = document.createElement('button');
  dualBtn.className = `secondary-btn ${state.dualMode ? 'active' : ''}`;
  dualBtn.appendChild(createIcon('heart', 20));
  dualBtn.addEventListener('click', () => {
    state.dualMode = !state.dualMode;
    saveSettings();
    render();
  });

  const loopBtn = document.createElement('button');
  loopBtn.className = `secondary-btn ${state.playMode === 'loop' ? 'active' : ''}`;
  loopBtn.appendChild(createIcon('refresh', 20));
  loopBtn.addEventListener('click', () => {
    state.playMode = state.playMode === 'loop' ? 'list' : 'loop';
    saveSettings();
    render();
  });

  const shuffleBtn = document.createElement('button');
  shuffleBtn.className = `secondary-btn ${state.playMode === 'shuffle' ? 'active' : ''}`;
  shuffleBtn.appendChild(createIcon('star', 20));
  shuffleBtn.addEventListener('click', () => {
    state.playMode = state.playMode === 'shuffle' ? 'list' : 'shuffle';
    saveSettings();
    render();
  });

  controls.append(lyricsBtn, dualBtn, loopBtn, shuffleBtn);
  return controls;
}

function createListPage() {
  const page = document.createElement('div');
  page.className = 'list-page';

  if (state.listBg) {
    page.style.backgroundImage = `url(${state.listBg})`;
    page.style.backgroundSize = 'cover';
    page.style.backgroundPosition = 'center';
  }

  const bgOverlay = document.createElement('div');
  bgOverlay.className = 'list-bg-overlay';
  page.appendChild(bgOverlay);

  const content = document.createElement('div');
  content.className = 'list-content';

  content.appendChild(createListHero());
  content.appendChild(createPlaylistBar());
  content.appendChild(createListActions());
  content.appendChild(createSongList());

  page.appendChild(content);
  return page;
}

function createListHero() {
  const hero = document.createElement('div');
  hero.className = 'list-hero';

  const avatar = document.createElement('div');
  avatar.className = 'list-hero-avatar';
  avatar.addEventListener('click', () => {
    showToast('头像更换功能开发中');
  });

  const avatarImg = getListAvatar();
  if (avatarImg) {
    const img = document.createElement('img');
    img.src = avatarImg;
    img.alt = '';
    avatar.appendChild(img);
  } else {
    avatar.appendChild(createListAvatarPlaceholder());
  }

  const editOverlay = document.createElement('div');
  editOverlay.className = 'list-hero-avatar-edit';
  editOverlay.appendChild(createIcon('edit', 12));
  avatar.appendChild(editOverlay);

  const info = document.createElement('div');
  info.className = 'list-hero-info';

  const activePlaylist = getActivePlaylist();
  const displaySongs = getDisplaySongs();

  const title = document.createElement('div');
  title.className = 'list-hero-title';
  title.textContent = activePlaylist?.name || '全部歌曲';

  const count = document.createElement('div');
  count.className = 'list-hero-count';
  count.textContent = `${displaySongs.length} 首歌曲`;

  info.append(title, count);
  hero.append(avatar, info);
  return hero;
}

function createPlaylistBar() {
  const bar = document.createElement('div');
  bar.className = 'list-playlist-bar';

  const allChip = document.createElement('button');
  allChip.className = `list-playlist-chip ${state.activePlaylistId === 'all' ? 'active' : ''}`;
  allChip.textContent = '全部';
  allChip.addEventListener('click', () => {
    state.activePlaylistId = 'all';
    render();
  });
  bar.appendChild(allChip);

  state.playlists.forEach((pl) => {
    const chip = document.createElement('button');
    chip.className = `list-playlist-chip ${state.activePlaylistId === pl.id ? 'active' : ''}`;
    chip.textContent = pl.name || '未命名歌单';
    chip.addEventListener('click', () => {
      state.activePlaylistId = pl.id;
      render();
    });
    bar.appendChild(chip);
  });

  const manageBtn = document.createElement('button');
  manageBtn.className = 'list-playlist-chip';
  manageBtn.appendChild(createIcon('settings', 14));
  const manageText = document.createElement('span');
  manageText.textContent = '管理';
  manageBtn.appendChild(manageText);
  manageBtn.addEventListener('click', openPlaylistDrawer);
  bar.appendChild(manageBtn);

  return bar;
}

function createListActions() {
  const actions = document.createElement('div');
  actions.className = 'list-actions';

  const importBtn = document.createElement('button');
  importBtn.className = 'list-action-btn primary';
  importBtn.appendChild(createIcon('star', 16));
  const importText = document.createElement('span');
  importText.textContent = '导入歌曲';
  importBtn.appendChild(importText);
  importBtn.addEventListener('click', importSongs);

  const playAllBtn = document.createElement('button');
  playAllBtn.className = 'list-action-btn';
  playAllBtn.appendChild(createIcon('play', 16));
  const playText = document.createElement('span');
  playText.textContent = '播放全部';
  playAllBtn.appendChild(playText);
  playAllBtn.addEventListener('click', playAll);

  actions.append(importBtn, playAllBtn);
  return actions;
}

function createSongList() {
  const list = document.createElement('div');
  list.className = 'song-list';

  const displaySongs = getDisplaySongs();

  if (displaySongs.length === 0) {
    list.appendChild(createSongEmpty());
    return list;
  }

  displaySongs.forEach((song) => {
    list.appendChild(createSongItem(song));
  });

  return list;
}

function createSongEmpty() {
  const empty = document.createElement('div');
  empty.className = 'song-empty';

  const icon = document.createElement('div');
  icon.className = 'song-empty-icon';
  icon.appendChild(createIcon('music', 32));

  const title = document.createElement('div');
  title.className = 'song-empty-title';
  title.textContent = state.activePlaylistId === 'all' ? '还没有歌曲' : '歌单里还没有歌曲';

  const desc = document.createElement('div');
  desc.className = 'song-empty-desc';
  desc.textContent = state.activePlaylistId === 'all' ? '点击上方"导入歌曲"添加音乐' : '去全部歌曲里添加吧';

  empty.append(icon, title, desc);
  return empty;
}

function createSongItem(song) {
  const item = document.createElement('div');
  item.className = `song-item ${song.id === state.currentSongId ? 'active' : ''}`;
  item.addEventListener('click', () => playSong(song.id));

  const cover = document.createElement('div');
  cover.className = 'song-item-cover';
  if (song.cover) {
    const img = document.createElement('img');
    img.src = song.cover;
    img.alt = '';
    cover.appendChild(img);
  } else {
    cover.appendChild(createSongCoverPlaceholder());
  }

  const info = document.createElement('div');
  info.className = 'song-item-info';

  const title = document.createElement('div');
  title.className = 'song-item-title';
  title.textContent = song.title || '未知歌曲';

  const artist = document.createElement('div');
  artist.className = 'song-item-artist';
  artist.textContent = song.artist || '未知艺术家';

  info.append(title, artist);

  const duration = document.createElement('div');
  duration.className = 'song-item-duration';
  duration.textContent = formatTime(song.duration || 0);

  const actions = document.createElement('div');
  actions.className = 'song-item-actions';

  const addBtn = document.createElement('button');
  addBtn.className = 'song-item-action-btn';
  addBtn.appendChild(createIcon('star', 16));
  addBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openAddToPlaylistDrawer(song.id);
  });

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'song-item-action-btn';
  deleteBtn.appendChild(createIcon('close', 16));
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteSong(song.id);
  });

  actions.append(addBtn, deleteBtn);

  item.append(cover, info, duration, actions);
  return item;
}

function openSettingsDrawer() {
  const backdrop = document.createElement('div');
  backdrop.className = 'music-drawer-backdrop';
  backdrop.addEventListener('click', closeSettingsDrawer);

  const drawer = document.createElement('div');
  drawer.className = 'music-drawer';

  const header = document.createElement('div');
  header.className = 'music-drawer-header';

  const title = document.createElement('div');
  title.className = 'music-drawer-title';
  title.textContent = '播放器设置';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'music-drawer-close';
  closeBtn.appendChild(createIcon('close', 16));
  closeBtn.addEventListener('click', closeSettingsDrawer);

  header.append(title, closeBtn);

  const content = document.createElement('div');
  content.appendChild(createWallpaperSection());
  content.appendChild(createListWallpaperSection());
  content.appendChild(createDualModeSection());
  content.appendChild(createVolumeSection());

  drawer.append(header, content);

  document.body.appendChild(backdrop);
  document.body.appendChild(drawer);

  requestAnimationFrame(() => {
    backdrop.classList.add('open');
    drawer.classList.add('open');
  });

  state.settingsDrawer = { backdrop, drawer };
}

function closeSettingsDrawer() {
  if (!state.settingsDrawer) return;

  const { backdrop, drawer } = state.settingsDrawer;
  backdrop.classList.remove('open');
  drawer.classList.remove('open');

  setTimeout(() => {
    backdrop.remove();
    drawer.remove();
    state.settingsDrawer = null;
  }, 300);
}

function createWallpaperSection() {
  const section = document.createElement('div');
  section.className = 'music-setting-group';

  const title = document.createElement('div');
  title.className = 'music-setting-group-title';
  title.textContent = '播放页壁纸';

  const grid = document.createElement('div');
  grid.className = 'music-wallpaper-grid';

  PRESET_FILM_WALLPAPERS.forEach((wp) => {
    const item = document.createElement('div');
    item.className = `music-wallpaper-item ${state.filmWallpaper?.id === wp.id ? 'active' : ''}`;
    item.style.background = wp.gradient;
    item.addEventListener('click', () => {
      state.filmWallpaper = wp;
      state.customWallpaper = '';
      saveSettings();
      render();
    });
    grid.appendChild(item);
  });

  const customItem = document.createElement('div');
  customItem.className = `music-wallpaper-item ${state.customWallpaper ? 'active' : ''}`;
  customItem.style.background = 'var(--bg-card)';
  customItem.style.display = 'flex';
  customItem.style.alignItems = 'center';
  customItem.style.justifyContent = 'center';
  customItem.style.color = 'var(--accent)';
  customItem.appendChild(createIcon('star', 20));
  customItem.addEventListener('click', uploadWallpaper);
  grid.appendChild(customItem);

  section.append(title, grid);
  return section;
}

function createListWallpaperSection() {
  const section = document.createElement('div');
  section.className = 'music-setting-group';

  const title = document.createElement('div');
  title.className = 'music-setting-group-title';
  title.textContent = '列表页背景';

  const grid = document.createElement('div');
  grid.className = 'music-wallpaper-grid';

  const customItem = document.createElement('div');
  customItem.className = `music-wallpaper-item ${state.listBg ? 'active' : ''}`;
  customItem.style.background = 'var(--bg-card)';
  if (state.listBg) {
    customItem.style.backgroundImage = `url(${state.listBg})`;
    customItem.style.backgroundSize = 'cover';
    customItem.style.backgroundPosition = 'center';
  } else {
    customItem.style.display = 'flex';
    customItem.style.alignItems = 'center';
    customItem.style.justifyContent = 'center';
    customItem.style.color = 'var(--accent)';
    customItem.appendChild(createIcon('star', 20));
  }
  customItem.addEventListener('click', uploadListBg);
  grid.appendChild(customItem);

  if (state.listBg) {
    const clearItem = document.createElement('div');
    clearItem.className = 'music-wallpaper-item';
    clearItem.style.background = 'var(--bg-card)';
    clearItem.style.display = 'flex';
    clearItem.style.alignItems = 'center';
    clearItem.style.justifyContent = 'center';
    clearItem.style.color = 'var(--text-hint)';
    clearItem.appendChild(createIcon('close', 20));
    clearItem.addEventListener('click', async () => {
      state.listBg = '';
      await deleteDB(BLOB_STORE, 'app_bg_music_list');
      saveSettings();
      render();
    });
    grid.appendChild(clearItem);
  }

  section.append(title, grid);
  return section;
}

function createDualModeSection() {
  const section = document.createElement('div');
  section.className = 'music-setting-group';

  const title = document.createElement('div');
  title.className = 'music-setting-group-title';
  title.textContent = '双人模式';

  const toggleItem = document.createElement('div');
  toggleItem.className = 'music-setting-item';

  const toggleLabel = document.createElement('div');
  toggleLabel.className = 'music-setting-label';
  toggleLabel.textContent = '开启双人模式';

  const toggle = document.createElement('div');
  toggle.className = `music-toggle ${state.dualMode ? 'active' : ''}`;
  toggle.addEventListener('click', () => {
    state.dualMode = !state.dualMode;
    saveSettings();
    render();
    closeSettingsDrawer();
    setTimeout(openSettingsDrawer, 350);
  });

  toggleItem.append(toggleLabel, toggle);
  section.appendChild(toggleItem);

  if (state.dualMode && state.characters.length > 0) {
    const characterTitle = document.createElement('div');
    characterTitle.className = 'music-setting-group-title';
    characterTitle.textContent = '选择一起听的AI';
    characterTitle.style.marginTop = '16px';

    const grid = document.createElement('div');
    grid.className = 'music-character-select';

    state.characters.forEach((char) => {
      const item = document.createElement('div');
      item.className = `music-character-item ${state.selectedCharacterId === char.id ? 'active' : ''}`;
      item.addEventListener('click', () => {
        state.selectedCharacterId = char.id;
        saveSettings();
        render();
        closeSettingsDrawer();
        setTimeout(openSettingsDrawer, 350);
      });

      const avatar = document.createElement('div');
      avatar.className = 'music-character-avatar';
      if (char.avatar) {
        const img = document.createElement('img');
        img.src = char.avatar;
        img.alt = '';
        avatar.appendChild(img);
      } else {
        avatar.appendChild(createCharacterAvatarItemPlaceholder());
      }

      const name = document.createElement('div');
      name.className = 'music-character-name';
      name.textContent = char.name || 'AI';

      item.append(avatar, name);
      grid.appendChild(item);
    });

    section.append(characterTitle, grid);
  }

  return section;
}

function createVolumeSection() {
  const section = document.createElement('div');
  section.className = 'music-setting-group';

  const title = document.createElement('div');
  title.className = 'music-setting-group-title';
  title.textContent = '音量';

  const item = document.createElement('div');
  item.className = 'music-setting-item';

  const label = document.createElement('div');
  label.className = 'music-setting-label';
  label.textContent = '音量';

  const value = document.createElement('div');
  value.className = 'music-setting-value';
  value.textContent = `${Math.round(state.volume * 100)}%`;

  const slider = document.createElement('input');
  slider.className = 'music-volume-slider';
  slider.type = 'range';
  slider.min = '0';
  slider.max = '100';
  slider.value = String(Math.round(state.volume * 100));
  slider.addEventListener('input', (e) => {
    state.volume = Number(e.target.value) / 100;
    if (state.audioElement) state.audioElement.volume = state.volume;
    if (state.gainNode) state.gainNode.gain.value = state.volume;
    value.textContent = `${Math.round(state.volume * 100)}%`;
    saveSettings();
  });

  item.append(label, value, slider);
  section.appendChild(item);
  return section;
}

function openPlaylistDrawer() {
  const backdrop = document.createElement('div');
  backdrop.className = 'music-drawer-backdrop';
  backdrop.style.zIndex = '52';
  backdrop.addEventListener('click', () => closePlaylistDrawer());

  const drawer = document.createElement('div');
  drawer.className = 'playlist-drawer';
  drawer.id = 'playlist-drawer';

  const header = document.createElement('div');
  header.className = 'music-drawer-header';

  const title = document.createElement('div');
  title.className = 'music-drawer-title';
  title.textContent = '管理歌单';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'music-drawer-close';
  closeBtn.appendChild(createIcon('close', 16));
  closeBtn.addEventListener('click', () => closePlaylistDrawer());

  header.append(title, closeBtn);

  const list = document.createElement('div');

  state.playlists.forEach((pl) => {
    const row = document.createElement('div');
    row.className = 'playlist-item-row';

    const name = document.createElement('div');
    name.className = 'playlist-item-name';
    name.textContent = pl.name || '未命名歌单';

    const count = document.createElement('div');
    count.className = 'playlist-item-count';
    count.textContent = `${(pl.songIds || []).length}首`;

    const btns = document.createElement('div');
    btns.className = 'playlist-item-btns';

    const editBtn = document.createElement('button');
    editBtn.className = 'playlist-item-btn';
    editBtn.appendChild(createIcon('edit', 16));
    editBtn.addEventListener('click', () => editPlaylist(pl.id));

    const delBtn = document.createElement('button');
    delBtn.className = 'playlist-item-btn danger';
    delBtn.appendChild(createIcon('close', 16));
    delBtn.addEventListener('click', () => deletePlaylist(pl.id));

    btns.append(editBtn, delBtn);
    row.append(name, count, btns);
    list.appendChild(row);
  });

  const addBtn = document.createElement('button');
  addBtn.className = 'add-to-playlist-btn';
  addBtn.appendChild(createIcon('star', 16));
  const addText = document.createElement('span');
  addText.textContent = '新建歌单';
  addBtn.appendChild(addText);
  addBtn.addEventListener('click', createPlaylist);

  drawer.append(header, list, addBtn);

  document.body.appendChild(backdrop);
  document.body.appendChild(drawer);

  requestAnimationFrame(() => {
    backdrop.classList.add('open');
    drawer.classList.add('open');
  });

  state.playlistDrawer = { backdrop, drawer };
}

function closePlaylistDrawer() {
  if (!state.playlistDrawer) return;

  const { backdrop, drawer } = state.playlistDrawer;
  backdrop.classList.remove('open');
  drawer.classList.remove('open');

  setTimeout(() => {
    backdrop.remove();
    drawer.remove();
    state.playlistDrawer = null;
  }, 300);
}

function createPlaylist() {
  const name = prompt('歌单名称：');
  if (!name || !name.trim()) return;

  const pl = {
    id: generateId('playlist'),
    name: name.trim(),
    songIds: [],
    createdAt: getNow(),
    updatedAt: getNow()
  };

  state.playlists.push(pl);
  savePlaylists();
  closePlaylistDrawer();
  showToast('歌单已创建');
  render();
}

function editPlaylist(playlistId) {
  const pl = state.playlists.find(p => p.id === playlistId);
  if (!pl) return;

  const name = prompt('修改歌单名称：', pl.name);
  if (!name || !name.trim()) return;

  pl.name = name.trim();
  pl.updatedAt = getNow();
  savePlaylists();
  closePlaylistDrawer();
  showToast('歌单已更新');
  render();
}

// ─────────────────────────────────────
// 删除歌单：同时删 IndexedDB 记录
// ─────────────────────────────────────

async function deletePlaylist(playlistId) {
  if (!confirm('确定要删除这个歌单吗？')) return;

  state.playlists = state.playlists.filter(p => p.id !== playlistId);
  if (state.activePlaylistId === playlistId) {
    state.activePlaylistId = 'all';
  }

  await deleteDB(PLAYLIST_STORE, playlistId);

  closePlaylistDrawer();
  showToast('歌单已删除');
  render();
}

function openAddToPlaylistDrawer(songId) {
  if (!state.playlists.length) {
    showToast('还没有歌单，请先创建');
    return;
  }

  const backdrop = document.createElement('div');
  backdrop.className = 'music-drawer-backdrop';
  backdrop.style.zIndex = '52';
  backdrop.addEventListener('click', () => closeAddToPlaylistDrawer());

  const drawer = document.createElement('div');
  drawer.className = 'playlist-drawer';
  drawer.id = 'add-to-playlist-drawer';

  const header = document.createElement('div');
  header.className = 'music-drawer-header';

  const title = document.createElement('div');
  title.className = 'music-drawer-title';
  title.textContent = '添加到歌单';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'music-drawer-close';
  closeBtn.appendChild(createIcon('close', 16));
  closeBtn.addEventListener('click', () => closeAddToPlaylistDrawer());

  header.append(title, closeBtn);

  const list = document.createElement('div');

  state.playlists.forEach((pl) => {
    const hasSong = (pl.songIds || []).includes(songId);

    const row = document.createElement('div');
    row.className = 'playlist-item-row';
    row.style.cursor = 'pointer';
    row.addEventListener('click', () => {
      toggleSongInPlaylist(songId, pl.id);
      closeAddToPlaylistDrawer();
    });

    const name = document.createElement('div');
    name.className = 'playlist-item-name';
    name.textContent = pl.name || '未命名歌单';

    const count = document.createElement('div');
    count.className = 'playlist-item-count';
    count.textContent = hasSong ? '已添加' : `${(pl.songIds || []).length}首`;

    row.append(name, count);
    list.appendChild(row);
  });

  drawer.append(header, list);

  document.body.appendChild(backdrop);
  document.body.appendChild(drawer);

  requestAnimationFrame(() => {
    backdrop.classList.add('open');
    drawer.classList.add('open');
  });

  state.addToPlaylistDrawer = { backdrop, drawer };
}

function closeAddToPlaylistDrawer() {
  if (!state.addToPlaylistDrawer) return;

  const { backdrop, drawer } = state.addToPlaylistDrawer;
  backdrop.classList.remove('open');
  drawer.classList.remove('open');

  setTimeout(() => {
    backdrop.remove();
    drawer.remove();
    state.addToPlaylistDrawer = null;
  }, 300);
}

function toggleSongInPlaylist(songId, playlistId) {
  const pl = state.playlists.find(p => p.id === playlistId);
  if (!pl) return;

  if (!Array.isArray(pl.songIds)) pl.songIds = [];

  const index = pl.songIds.indexOf(songId);
  if (index >= 0) {
    pl.songIds.splice(index, 1);
    showToast('已从歌单移除');
  } else {
    pl.songIds.push(songId);
    showToast('已添加到歌单');
  }

  pl.updatedAt = getNow();
  savePlaylists();
  render();
}

function toggleLyricsPanel() {
  state.isLyricsOpen = !state.isLyricsOpen;

  let panel = document.querySelector('.music-lyrics-panel');
  if (state.isLyricsOpen) {
    if (!panel) {
      panel = createLyricsPanel();
      document.body.appendChild(panel);
    }
    requestAnimationFrame(() => panel.classList.add('open'));
  } else if (panel) {
    panel.classList.remove('open');
    setTimeout(() => panel.remove(), 300);
  }
}

function createLyricsPanel() {
  const panel = document.createElement('div');
  panel.className = 'music-lyrics-panel';

  const header = document.createElement('div');
  header.className = 'music-lyrics-header';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'music-lyrics-close';
  closeBtn.appendChild(createIcon('close', 20));
  closeBtn.addEventListener('click', toggleLyricsPanel);

  const title = document.createElement('div');
  title.className = 'music-lyrics-title';
  const currentSong = getCurrentSong();
  title.textContent = currentSong?.title || '歌词';

  header.append(closeBtn, title);

  const container = document.createElement('div');
  container.className = 'music-lyrics-container';
  container.id = 'music-lyrics-scroll';

  if (state.lyrics.length > 0) {
    state.lyrics.forEach((line, index) => {
      const lineEl = document.createElement('div');
      lineEl.className = `music-lyric-line ${index === state.currentLyricIndex ? 'active' : ''}`;
      lineEl.textContent = line.text;
      lineEl.dataset.index = index;
      container.appendChild(lineEl);
    });
  } else {
    const empty = createLyricsEmpty();
    panel.append(header, empty);
    return panel;
  }

  panel.append(header, container);
  return panel;
}

function createLyricsEmpty() {
  const empty = document.createElement('div');
  empty.className = 'music-lyrics-empty';

  const icon = document.createElement('div');
  icon.className = 'music-lyrics-empty-icon';
  icon.appendChild(createIcon('edit', 32));

  const title = document.createElement('div');
  title.className = 'music-lyrics-empty-title';
  title.textContent = '暂无歌词';

  const desc = document.createElement('div');
  desc.className = 'music-lyrics-empty-desc';
  desc.textContent = '可以手动上传或输入歌词';

  const uploadBtn = document.createElement('button');
  uploadBtn.className = 'list-action-btn primary';
  uploadBtn.style.marginTop = '20px';
  uploadBtn.appendChild(createIcon('star', 16));
  const btnText = document.createElement('span');
  btnText.textContent = '上传歌词';
  uploadBtn.appendChild(btnText);
  uploadBtn.addEventListener('click', uploadLyrics);

  const inputBtn = document.createElement('button');
  inputBtn.className = 'list-action-btn';
  inputBtn.style.marginTop = '10px';
  inputBtn.appendChild(createIcon('edit', 16));
  const inputText = document.createElement('span');
  inputText.textContent = '手动输入';
  inputBtn.appendChild(inputText);
  inputBtn.addEventListener('click', inputLyrics);

  empty.append(icon, title, desc, uploadBtn, inputBtn);
  return empty;
}

function initAudioElement() {
  if (state.audioElement) return;

  state.audioElement = new Audio();
  state.audioElement.volume = state.volume;

  state.audioElement.addEventListener('timeupdate', () => {
    state.currentTime = state.audioElement.currentTime;
    updateProgressUI();
    updateLyricsIndex();
  });

  state.audioElement.addEventListener('loadedmetadata', () => {
    state.duration = state.audioElement.duration;
    updateProgressUI();
  });

  state.audioElement.addEventListener('ended', () => {
    state.isPlaying = false;
    handleSongEnded();
  });

  state.audioElement.addEventListener('play', () => {
    state.isPlaying = true;
    updatePlayButton();
    updateMiniPlayer();
  });

  state.audioElement.addEventListener('pause', () => {
    state.isPlaying = false;
    updatePlayButton();
    updateMiniPlayer();
  });

  initAudioContext();
}

function initAudioContext() {
  if (state.audioContext) return;

  try {
    state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    state.analyser = state.audioContext.createAnalyser();
    state.analyser.fftSize = 256;
    state.gainNode = state.audioContext.createGain();
    state.gainNode.gain.value = state.volume;
    state.gainNode.connect(state.audioContext.destination);
    state.analyser.connect(state.gainNode);

    state.audioSource = state.audioContext.createMediaElementSource(state.audioElement);
    state.audioSource.connect(state.analyser);
    state.audioSourceConnected = true;
  } catch (e) {
    console.warn('Web Audio API init failed:', e);
  }
}

function handleSongEnded() {
  if (state.playMode === 'loop') {
    if (state.audioElement) {
      state.audioElement.currentTime = 0;
      state.audioElement.play();
    }
    return;
  }

  playNext();
}

async function playSong(songId) {
  const song = state.songs.find(s => s.id === songId);
  if (!song) return;

  state.currentSongId = songId;
  state.currentTime = 0;
  state.lyrics = song.lyrics || [];
  state.currentLyricIndex = -1;

  const audioData = await getDB(BLOB_STORE, `audio_${songId}`);
  if (!audioData?.value) {
    showToast('音频数据不存在');
    return;
  }

  if (state.audioContext?.state === 'suspended') {
    await state.audioContext.resume();
  }

  state.audioElement.src = audioData.value;

  try {
    await state.audioElement.play();
    state.isPlaying = true;
  } catch {
    state.isPlaying = false;
  }

  saveCurrentSong();
  updateMiniPlayer();
  render();

  if (!state.lyrics.length && song.title) {
    fetchLyrics(song.title, song.artist || '').then((lyrics) => {
      if (lyrics.length) {
        state.lyrics = lyrics;
        song.lyrics = lyrics;
        saveSong(song);
      }
    });
  }
}

function togglePlay() {
  if (!state.audioElement || !state.currentSongId) return;

  if (state.isPlaying) {
    state.audioElement.pause();
  } else {
    if (state.audioContext?.state === 'suspended') {
      state.audioContext.resume();
    }
    state.audioElement.play();
  }
}

function playPrevious() {
  const queue = getPlayQueue();
  if (!queue.length) return;

  const currentIndex = queue.findIndex(s => s.id === state.currentSongId);
  const prevIndex = currentIndex > 0 ? currentIndex - 1 : queue.length - 1;
  playSong(queue[prevIndex].id);
}

function playNext() {
  const queue = getPlayQueue();
  if (!queue.length) return;

  if (state.playMode === 'shuffle') {
    const randomIndex = Math.floor(Math.random() * queue.length);
    playSong(queue[randomIndex].id);
    return;
  }

  const currentIndex = queue.findIndex(s => s.id === state.currentSongId);
  const nextIndex = currentIndex < queue.length - 1 ? currentIndex + 1 : 0;
  playSong(queue[nextIndex].id);
}

function playAll() {
  const queue = getPlayQueue();
  if (queue.length) {
    playSong(queue[0].id);
  }
}

function getPlayQueue() {
  return getDisplaySongs();
}

function getDisplaySongs() {
  if (state.activePlaylistId === 'all') return state.songs;

  const pl = state.playlists.find(p => p.id === state.activePlaylistId);
  if (!pl) return state.songs;

  return state.songs.filter(s => (pl.songIds || []).includes(s.id));
}

function getActivePlaylist() {
  if (state.activePlaylistId === 'all') return { name: '全部歌曲' };
  return state.playlists.find(p => p.id === state.activePlaylistId) || { name: '全部歌曲' };
}

async function importSongs() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'audio/mp3,audio/flac,audio/wav,audio/ogg,audio/m4a';
  input.multiple = true;

  input.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    state.isImporting = true;
    showToast(`正在导入 ${files.length} 首歌曲...`);

    let imported = 0;
    for (const file of files) {
      try {
        const song = await processAudioFile(file);
        if (song) {
          state.songs.push(song);
          await saveSong(song);
          imported++;
        }
      } catch (err) {
        console.warn('Import failed:', file.name, err);
      }
    }

    state.isImporting = false;
    showToast(`成功导入 ${imported} 首歌曲`);
    render();
  });

  input.click();
}

async function processAudioFile(file) {
  const id = generateId('song');
  const audioData = await readFileAsDataURL(file);

  await setDB(BLOB_STORE, {
    key: `audio_${id}`,
    value: audioData,
    type: file.type,
    name: file.name
  });

  const tags = await readID3Tags(file);

  const song = {
    id,
    title: tags.title || file.name.replace(/\.[^.]+$/, ''),
    artist: tags.artist || '',
    album: tags.album || '',
    duration: 0,
    cover: tags.picture || '',
    lyrics: [],
    addedAt: getNow()
  };

  try {
    const audio = new Audio();
    audio.src = audioData;
    await new Promise((resolve) => {
      audio.addEventListener('loadedmetadata', () => {
        song.duration = audio.duration;
        resolve();
      });
      audio.addEventListener('error', resolve);
    });
  } catch {}

  try {
    song.lyrics = await fetchLyrics(song.title, song.artist);
  } catch {}

  return song;
}

async function deleteSong(songId) {
  if (!confirm('确定要删除这首歌吗？')) return;

  state.songs = state.songs.filter(s => s.id !== songId);

  state.playlists.forEach(pl => {
    if (Array.isArray(pl.songIds)) {
      pl.songIds = pl.songIds.filter(id => id !== songId);
    }
  });

  await deleteDB(SONG_STORE, songId);
  await deleteDB(BLOB_STORE, `audio_${songId}`);

  if (state.currentSongId === songId) {
    state.currentSongId = '';
    state.isPlaying = false;
    if (state.audioElement) {
      state.audioElement.pause();
      state.audioElement.src = '';
    }
  }

  savePlaylists();
  showToast('已删除');
  render();
}

async function saveSong(song) {
  await setDB(SONG_STORE, song);
}

async function loadSongs() {
  const songs = await getAllDB(SONG_STORE);
  state.songs = Array.isArray(songs) ? songs : [];
}

async function loadPlaylists() {
  const playlists = await getAllDB(PLAYLIST_STORE);
  state.playlists = Array.isArray(playlists) ? playlists : [];
}

async function savePlaylists() {
  for (const pl of state.playlists) {
    await setDB(PLAYLIST_STORE, pl);
  }
}

async function loadCurrentSong() {
  const current = getData(MUSIC_CURRENT_KEY);
  if (current?.songId) {
    state.currentSongId = current.songId;
    const song = state.songs.find(s => s.id === current.songId);
    if (song) {
      state.lyrics = song.lyrics || [];
    }
  }
}

function saveCurrentSong() {
  setData(MUSIC_CURRENT_KEY, {
    songId: state.currentSongId,
    updatedAt: getNow()
  });
}

async function readID3Tags(file) {
  try {
    const buffer = await file.arrayBuffer();
    const view = new DataView(buffer);

    const tags = {
      title: '',
      artist: '',
      album: '',
      picture: ''
    };

    if (view.getUint8(0) === 0x49 && view.getUint8(1) === 0x44 && view.getUint8(2) === 0x33) {
      const version = view.getUint8(3);
      const size = decodeSynchsafe(view, 6, 4);

      let offset = 10;
      const end = Math.min(10 + size, buffer.byteLength);

      while (offset < end - 10) {
        const frameId = String.fromCharCode(
          view.getUint8(offset),
          view.getUint8(offset + 1),
          view.getUint8(offset + 2),
          view.getUint8(offset + 3)
        );

        const frameSize = version >= 4
          ? decodeSynchsafe(view, offset + 4, 4)
          : view.getUint32(offset + 4);

        if (frameSize <= 0 || offset + 10 + frameSize > end) break;

        if (frameId === 'TIT2') {
          tags.title = readTextFrame(view, offset + 10, frameSize);
        } else if (frameId === 'TPE1') {
          tags.artist = readTextFrame(view, offset + 10, frameSize);
        } else if (frameId === 'TALB') {
          tags.album = readTextFrame(view, offset + 10, frameSize);
        } else if (frameId === 'APIC') {
          tags.picture = readPictureFrame(buffer, offset + 10, frameSize);
        }

        offset += 10 + frameSize;
      }
    }

    return tags;
  } catch (e) {
    console.warn('ID3 parse error:', e);
    return { title: '', artist: '', album: '', picture: '' };
  }
}

function decodeSynchsafe(view, offset, length) {
  let value = 0;
  for (let i = 0; i < length; i++) {
    value = (value << 7) | (view.getUint8(offset + i) & 0x7F);
  }
  return value;
}

function readTextFrame(view, offset, size) {
  if (size < 2) return '';
  const encoding = view.getUint8(offset);
  const bytes = new Uint8Array(view.buffer, offset + 1, size - 1);
  return new TextDecoder(encoding === 0 ? 'latin1' : 'utf-8').decode(bytes).replace(/\0/g, '');
}

function readPictureFrame(buffer, offset, size) {
  try {
    const view = new DataView(buffer);
    let pos = offset + 1;

    let mime = '';
    while (pos < offset + size && view.getUint8(pos) !== 0) {
      mime += String.fromCharCode(view.getUint8(pos));
      pos++;
    }
    pos++;

    pos++;

    while (pos < offset + size && view.getUint8(pos) !== 0) {
      pos++;
    }
    pos++;

    const pictureData = new Uint8Array(buffer, pos, offset + size - pos);
    const bytes = Array.from(pictureData);
    const binary = bytes.map(b => String.fromCharCode(b)).join('');
    const base64 = btoa(binary);
    const mimeType = mime || 'image/jpeg';
    return `data:${mimeType};base64,${base64}`;
  } catch {
    return '';
  }
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function fetchLyrics(title, artist) {
  if (!title) return [];

  try {
    const query = encodeURIComponent(`${title} ${artist || ''}`.trim());
    const response = await fetch(`https://lrclib.net/api/search?q=${query}`, {
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) return [];

    const data = await response.json();
    if (!Array.isArray(data) || !data.length) return [];

    const synced = data.find(item => item.syncedLyrics);
    const plain = data.find(item => item.plainLyrics);

    if (synced?.syncedLyrics) {
      return parseLRC(synced.syncedLyrics);
    }

    if (plain?.plainLyrics) {
      return plain.plainLyrics.split('\n').filter(Boolean).map((text, i) => ({
        time: i * 5,
        text: text.trim()
      }));
    }

    return [];
  } catch (e) {
    console.warn('Fetch lyrics failed:', e);
    return [];
  }
}

function parseLRC(lrc) {
  const lines = lrc.split('\n');
  const result = [];

  const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;

  lines.forEach(line => {
    const match = line.match(timeRegex);
    if (!match) return;

    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    const ms = parseInt(match[3].padEnd(3, '0'), 10);
    const time = minutes * 60 + seconds + ms / 1000;

    const text = line.replace(timeRegex, '').trim();
    if (text) {
      result.push({ time, text });
    }
  });

  return result.sort((a, b) => a.time - b.time);
}

function uploadLyrics() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.lrc,.txt';

  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const text = await file.text();
    state.lyrics = parseLRC(text);

    const song = getCurrentSong();
    if (song) {
      song.lyrics = state.lyrics;
      await saveSong(song);
    }

    showToast('歌词已导入');
    toggleLyricsPanel();
  });

  input.click();
}

function inputLyrics() {
  const text = prompt('请输入歌词（LRC格式或纯文本）：');
  if (!text) return;

  state.lyrics = text.includes('[') ? parseLRC(text) : text.split('\n').filter(Boolean).map((t, i) => ({
    time: i * 5,
    text: t.trim()
  }));

  const song = getCurrentSong();
  if (song) {
    song.lyrics = state.lyrics;
    saveSong(song);
  }

  showToast('歌词已保存');
  toggleLyricsPanel();
}

async function uploadWallpaper() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';

  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const dataUrl = await readFileAsDataURL(file);
    state.customWallpaper = dataUrl;

    await setDB(BLOB_STORE, {
      key: 'app_bg_music_player',
      value: dataUrl,
      type: file.type
    });

    saveSettings();
    render();
    showToast('壁纸已更换');
  });

  input.click();
}

async function uploadListBg() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';

  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const dataUrl = await readFileAsDataURL(file);
    state.listBg = dataUrl;

    await setDB(BLOB_STORE, {
      key: 'app_bg_music_list',
      value: dataUrl,
      type: file.type
    });

    saveSettings();
    render();
    showToast('列表页背景已更换');
  });

  input.click();
}

function startAnimationLoop() {
  function animate() {
    state.animationFrame = requestAnimationFrame(animate);
    updateCoverRotation();
    drawSpectrum();
  }
  animate();
}

function stopAnimationLoop() {
  if (state.animationFrame) {
    cancelAnimationFrame(state.animationFrame);
    state.animationFrame = null;
  }
}

function updateCoverRotation() {
  if (!state.isPlaying) return;

  state.coverRotation = (state.coverRotation + 0.15) % 360;
  const cover = document.querySelector('.player-cover-container');
  if (cover) {
    cover.style.transform = `rotate(${state.coverRotation}deg)`;
  }
}

function drawSpectrum() {
  const canvas = document.getElementById('music-spectrum-canvas');
  if (!canvas || !state.analyser) return;

  const ctx = canvas.getContext('2d');
  const bufferLength = state.analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  state.analyser.getByteFrequencyData(dataArray);

  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const barWidth = (canvas.width / bufferLength) * 2.5;
  let x = 0;

  for (let i = 0; i < bufferLength; i++) {
    const barHeight = (dataArray[i] / 255) * canvas.height;

    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#9F8F82';
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.6;
    ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

    x += barWidth + 1;
  }
}

function updateProgressUI() {
  const fill = document.querySelector('.progress-fill');
  const thumb = document.querySelector('.progress-thumb');
  const currentTimeEl = document.querySelector('.progress-times span:first-child');
  const durationEl = document.querySelector('.progress-times span:last-child');

  if (fill && state.duration) {
    fill.style.width = `${(state.currentTime / state.duration) * 100}%`;
  }
  if (thumb && state.duration) {
    thumb.style.left = `${(state.currentTime / state.duration) * 100}%`;
  }
  if (currentTimeEl) currentTimeEl.textContent = formatTime(state.currentTime);
  if (durationEl) durationEl.textContent = formatTime(state.duration);
}

function updatePlayButton() {
  const btn = document.querySelector('.control-btn.main svg');
  if (!btn) return;

  const icon = createIcon(state.isPlaying ? 'pause' : 'play', 28);
  btn.replaceWith(icon);
}

function updateLyricsIndex() {
  if (!state.lyrics.length) return;

  let newIndex = -1;
  for (let i = state.lyrics.length - 1; i >= 0; i--) {
    if (state.currentTime >= state.lyrics[i].time) {
      newIndex = i;
      break;
    }
  }

  if (newIndex !== state.currentLyricIndex) {
    state.currentLyricIndex = newIndex;

    const lines = document.querySelectorAll('.music-lyric-line');
    lines.forEach((line, i) => {
      line.classList.toggle('active', i === newIndex);
    });

    if (newIndex >= 0) {
      const activeLine = document.querySelector('.music-lyric-line.active');
      if (activeLine) {
        activeLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }
}

function switchPage(page) {
  state.currentPage = page;

  const playerPage = document.querySelector('.player-page')?.parentElement;
  const listPage = document.querySelector('.list-page')?.parentElement;

  if (playerPage) {
    if (page === 'player') {
      playerPage.classList.remove('hidden', 'hidden-left');
    } else {
      playerPage.classList.add('hidden-left');
      playerPage.classList.remove('hidden');
    }
  }

  if (listPage) {
    if (page === 'list') {
      listPage.classList.remove('hidden', 'hidden-left');
    } else {
      listPage.classList.add('hidden');
      listPage.classList.remove('hidden-left');
    }
  }

  document.querySelectorAll('.music-tab').forEach((tab, i) => {
    tab.classList.toggle('active', (i === 0 && page === 'player') || (i === 1 && page === 'list'));
  });
}

async function loadSettings() {
  const saved = getData(MUSIC_SETTINGS_KEY) || {};
  state.settings = { ...state.settings, ...saved };
  state.dualMode = state.settings.dualMode;
  state.selectedCharacterId = state.settings.selectedCharacterId;
  state.volume = state.settings.volume ?? 1;
  state.playMode = state.settings.playMode || 'list';

  if (state.settings.filmWallpaperId) {
    state.filmWallpaper = PRESET_FILM_WALLPAPERS.find(w => w.id === state.settings.filmWallpaperId) || PRESET_FILM_WALLPAPERS[0];
  }

  if (state.settings.useCustomWallpaper) {
    try {
      const customWp = await getDB(BLOB_STORE, 'app_bg_music_player');
      state.customWallpaper = customWp?.value || '';
    } catch {
      state.customWallpaper = '';
    }
  } else {
    state.customWallpaper = '';
  }

  try {
    const listBgRecord = await getDB(BLOB_STORE, 'app_bg_music_list');
    state.listBg = listBgRecord?.value || '';
  } catch {
    state.listBg = '';
  }
}

function saveSettings() {
  state.settings = {
    ...state.settings,
    dualMode: state.dualMode,
    selectedCharacterId: state.selectedCharacterId,
    filmWallpaperId: state.filmWallpaper?.id || 'film_1',
    useCustomWallpaper: Boolean(state.customWallpaper),
    volume: state.volume,
    playMode: state.playMode
  };
  setData(MUSIC_SETTINGS_KEY, state.settings);
}

async function loadCharacters() {
  try {
    const chars = await getAllDB(CHARACTER_STORE);
    state.characters = Array.isArray(chars) ? chars : [];
  } catch {
    state.characters = [];
  }
}

function getCurrentSong() {
  return state.songs.find(s => s.id === state.currentSongId) || null;
}

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getUserAvatar() {
  const settings = getData('app_settings') || {};
  return settings.user?.avatar || '';
}

function getUserAvatarPlaceholder() {
  const div = document.createElement('div');
  div.className = 'dual-avatar-placeholder';
  div.appendChild(createIcon('star', 24));
  return div;
}

function createCharacterAvatarPlaceholder() {
  const div = document.createElement('div');
  div.className = 'dual-avatar-placeholder';
  div.appendChild(createIcon('heart', 24));
  return div;
}

function createCharacterAvatarItemPlaceholder() {
  const div = document.createElement('div');
  div.className = 'music-character-avatar-placeholder';
  div.appendChild(createIcon('heart', 20));
  return div;
}

function createSongCoverPlaceholder() {
  const div = document.createElement('div');
  div.className = 'song-item-cover-placeholder';
  div.appendChild(createIcon('music', 20));
  return div;
}

function getListAvatar() {
  return getData('music_list_avatar') || '';
}

function createListAvatarPlaceholder() {
  const div = document.createElement('div');
  div.className = 'list-hero-avatar-placeholder';
  div.appendChild(createIcon('music', 28));
  return div;
}

function updateMiniPlayer() {
  let miniPlayer = document.querySelector('.music-mini-player');

  if (!state.currentSongId || state.mounted) {
    if (miniPlayer) {
      miniPlayer.classList.remove('visible');
      setTimeout(() => miniPlayer.remove(), 300);
    }
    return;
  }

  if (!miniPlayer) {
    miniPlayer = createMiniPlayer();
    document.body.appendChild(miniPlayer);
    requestAnimationFrame(() => miniPlayer.classList.add('visible'));
  }

  const song = getCurrentSong();
  const titleEl = miniPlayer.querySelector('.music-mini-title');
  const artistEl = miniPlayer.querySelector('.music-mini-artist');
  const coverEl = miniPlayer.querySelector('.music-mini-cover');
  const playBtn = miniPlayer.querySelector('.music-mini-play-icon');

  if (titleEl) titleEl.textContent = song?.title || '未播放';
  if (artistEl) artistEl.textContent = song?.artist || '';
  if (coverEl) {
    coverEl.innerHTML = '';
    if (song?.cover) {
      const img = document.createElement('img');
      img.src = song.cover;
      coverEl.appendChild(img);
    } else {
      coverEl.appendChild(createSongCoverPlaceholder());
    }
  }
  if (playBtn) {
    playBtn.innerHTML = '';
    playBtn.appendChild(createIcon(state.isPlaying ? 'pause' : 'play', 20));
  }
}

function createMiniPlayer() {
  const mini = document.createElement('div');
  mini.className = 'music-mini-player';
  mini.addEventListener('click', () => {
    if (typeof window.openApp === 'function') {
      window.openApp('music');
    }
  });

  const cover = document.createElement('div');
  cover.className = 'music-mini-cover';

  const info = document.createElement('div');
  info.className = 'music-mini-info';

  const title = document.createElement('div');
  title.className = 'music-mini-title';
  title.textContent = '未播放';

  const artist = document.createElement('div');
  artist.className = 'music-mini-artist';

  info.append(title, artist);

  const controls = document.createElement('div');
  controls.className = 'music-mini-controls';

  const playBtn = document.createElement('button');
  playBtn.className = 'music-mini-btn music-mini-play-icon';
  playBtn.appendChild(createIcon(state.isPlaying ? 'pause' : 'play', 20));
  playBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePlay();
  });

  const nextBtn = document.createElement('button');
  nextBtn.className = 'music-mini-btn';
  nextBtn.appendChild(createIcon('forward', 18));
  nextBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    playNext();
  });

  controls.append(playBtn, nextBtn);

  mini.append(cover, info, controls);
  return mini;
}

// 依赖：../core/storage.js(getData,setData,generateId,getNow,getDB,setDB,deleteDB,getAllDB)；../core/ui.js(createIcon,showToast)
