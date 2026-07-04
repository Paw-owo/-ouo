// apps/music/state.js
// 音乐 App 的共享可变状态 —— 我把 index.js 和 player.js 都要用的状态收在这里，
// 避免两个文件互相 import 造成循环依赖。
// 红线：图标只准 SVG 线稿，禁止任何 emoji 字符；视觉值走 CSS 变量。

export const state = {
  containerEl: null,        // App 容器
  audioEl: null,            // Audio 元素（首次播放时才创建）
  sessionBlobs: new Map(),  // 内存 session：songId -> blobUrl（重启后失效）
  songs: [],                // 全部歌曲池（按 addedAt 倒序）
  viewSongs: [],            // 当前展示的列表（全部或某歌单子集）
  currentPlaylistId: null,  // 当前选中的歌单 id；null = 全部
  playlists: [],            // 所有歌单
  currentIndex: -1,         // 当前播放歌曲在 viewSongs 里的索引，-1 = 没选
  seeking: false            // 拖动进度时暂停 timeupdate 回写，避免抖动
};
