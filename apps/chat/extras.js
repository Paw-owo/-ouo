// apps/chat/extras.js
// 聊天增强模块——表情包面板、语音录制、消息转发、页内搜索、引用消息定位。
// 全部走 CSS 变量，纯 ES Module，无外部依赖。
// 状态由 index.js 持有，本模块通过 getState 协作；导出函数供 detail-view.js 调用。
// 红线：禁止系统 emoji 字符，表情面板只展示用户收藏的表情包图片；图标只准 SVG 线稿。

import { STORES } from '../../core/storage-keys.js';
import { getDB, setDB, getAllDB, deleteDB, generateId, getNow } from '../../core/storage.js';
import { showToast, showBottomSheet, showConfirm, createIcon, registerIcon } from '../../core/ui.js';
import bus from '../../core/events.js';
import { clamp, pickImageFile, injectStyle } from '../../core/util.js';
import { getState, enterChat } from './index.js';
import { escapeHTML, escapeAttr } from './shared-utils.js';

// 注册新图标（线稿 SVG path）
// 麦克风：语音按钮 / 录制中
registerIcon('mic', 'M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z M19 10v2a7 7 0 0 1-14 0v-2 M12 19v4 M8 23h8');
// 键盘：语音模式切回文字输入
registerIcon('keyboard', 'M2 6h20v12H2z M6 10h.01 M10 10h.01 M14 10h.01 M18 10h.01 M6 14h.01 M18 14h.01 M8 14h8');
// 转发：消息转发动作
registerIcon('forward', 'M15 17v-2a4 4 0 0 0-4-4H3 M11 7l4 4-4 4 M19 21V5a2 2 0 0 0-2-2h-4');
// 上箭头：搜索跳转上一个
registerIcon('arrow-up', 'M12 19V5 M5 12l7-7 7 7');
// 下箭头：搜索跳转下一个
registerIcon('arrow-down', 'M12 5v14 M19 12l-7 7-7-7');
// 位置：发送位置
registerIcon('location', 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z');
// 文件：发送文件
registerIcon('file', 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8');
// 名片：发送角色名片
registerIcon('contact', 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75');
// 语音播放：音频消息上的小三角
registerIcon('voice-play', 'M8 5v14l11-7z');
// 暂停录音
registerIcon('stop', 'M6 6h12v12H6z');

// ════════════════════════════════════════
// 表情包面板（用户收藏的表情包图片，禁止系统 emoji 字符）
// ════════════════════════════════════════

// 图片：从相册添加表情包入口（线稿，描边 1.5px）
registerIcon('image', 'M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z M8.5 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M21 15l-5-5L5 21');
// 链接：从图片链接添加表情包
registerIcon('link', 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71');

// 注入表情包面板样式（仅注入一次，全部走 CSS 变量）
injectStyle('chat-sticker-panel-style', `
  .chat-sticker-panel{
    max-height:0; overflow:hidden;
    background:var(--bg-primary);
    border-top:1px solid color-mix(in srgb, var(--text-hint) 16%, transparent);
    transition:max-height 320ms ease;
    display:flex; flex-direction:column;
    flex-shrink:0;
  }
  .chat-sticker-panel.show{ max-height:40vh; }
  .chat-sticker-panel-inner{
    height:40vh;
    display:flex; flex-direction:column;
    transform:translateY(100%);
    opacity:0;
    transition:transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 220ms ease;
    background:var(--bg-surface);
    border-top-left-radius:var(--radius-xl);
    border-top-right-radius:var(--radius-xl);
  }
  .chat-sticker-panel.show .chat-sticker-panel-inner{
    transform:translateY(0);
    opacity:1;
  }
  /* tab 栏 */
  .chat-sticker-tabs{
    display:flex; flex-shrink:0;
    border-bottom:1px solid color-mix(in srgb, var(--text-hint) 14%, transparent);
    background:var(--bg-surface);
    border-top-left-radius:var(--radius-xl);
    border-top-right-radius:var(--radius-xl);
  }
  .chat-sticker-tab{
    flex:1; padding:12px 0; border:none; cursor:pointer;
    background:transparent; color:var(--text-secondary);
    font-size:var(--font-size-base); font-family:inherit;
    position:relative; transition:color var(--motion);
  }
  .chat-sticker-tab:active{ transform:scale(var(--press-scale)); }
  .chat-sticker-tab.active{ color:var(--accent); font-weight:600; }
  .chat-sticker-tab.active::after{
    content:''; position:absolute; left:50%; bottom:0;
    width:28px; height:3px; border-radius:2px;
    background:var(--accent);
    transform:translateX(-50%);
  }
  /* 内容区 */
  .chat-sticker-content{
    flex:1; overflow-y:auto; -webkit-overflow-scrolling:touch;
    padding:12px;
  }
  /* 收藏表情网格：4 列 */
  .chat-sticker-grid{
    display:grid;
    grid-template-columns:repeat(4, 1fr);
    gap:8px;
  }
  .chat-sticker-item{
    aspect-ratio:1; padding:0; border:none; cursor:pointer;
    background:color-mix(in srgb, var(--bg-secondary) 50%, transparent);
    border-radius:var(--radius-md);
    overflow:hidden;
    transition:transform var(--motion), background var(--motion);
    -webkit-tap-highlight-color:transparent;
  }
  .chat-sticker-item:active{ transform:scale(0.97); }
  .chat-sticker-item.long-press{
    background:color-mix(in srgb, var(--accent-light) 60%, transparent);
  }
  .chat-sticker-item img{
    width:100%; height:100%;
    object-fit:contain;
    display:block;
    pointer-events:none;
    -webkit-user-drag:none;
  }
  /* 空状态 */
  .chat-sticker-empty{
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    gap:14px; padding:32px 16px; min-height:200px;
    color:var(--text-hint);
  }
  .chat-sticker-empty-icon{
    width:96px; height:96px;
    color:var(--text-hint);
    opacity:0.6;
  }
  .chat-sticker-empty-icon svg{
    width:100%; height:100%;
    stroke:currentColor; stroke-width:1.5;
    stroke-linecap:round; stroke-linejoin:round;
    fill:none;
  }
  .chat-sticker-empty-text{
    font-size:var(--font-size-small);
    color:var(--text-hint);
    text-align:center;
  }
  /* 添加表情 tab */
  .chat-sticker-add{
    display:flex; flex-direction:column; gap:18px;
    padding:8px 4px;
  }
  .chat-sticker-add-btn{
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    gap:12px; padding:28px 16px;
    border:1.5px dashed color-mix(in srgb, var(--text-hint) 35%, transparent);
    border-radius:var(--radius-lg);
    background:transparent; cursor:pointer;
    color:var(--text-secondary);
    transition:var(--motion);
  }
  .chat-sticker-add-btn:active{
    transform:scale(0.98);
    border-color:var(--accent);
    color:var(--accent);
    background:color-mix(in srgb, var(--accent-light) 30%, transparent);
  }
  .chat-sticker-add-btn-icon{
    width:48px; height:48px;
    display:flex; align-items:center; justify-content:center;
    color:var(--accent);
  }
  .chat-sticker-add-btn-label{
    font-size:var(--font-size-base);
    color:var(--text-primary);
  }
  /* 链接添加表单 */
  .chat-sticker-url-form{
    display:flex; gap:8px; align-items:stretch;
  }
  .chat-sticker-url-input{
    flex:1; padding:10px 12px;
    border:1px solid color-mix(in srgb, var(--text-hint) 25%, transparent);
    border-radius:var(--radius-md);
    background:var(--bg-secondary);
    color:var(--text-primary);
    font-size:var(--font-size-small); font-family:inherit;
    outline:none;
    transition:border-color var(--motion);
  }
  .chat-sticker-url-input:focus{ border-color:var(--accent); }
  .chat-sticker-url-input::placeholder{ color:var(--text-hint); }
  .chat-sticker-url-btn{
    flex-shrink:0; padding:10px 16px;
    border:none; cursor:pointer;
    border-radius:var(--radius-md);
    background:var(--accent); color:var(--bubble-user-text);
    font-size:var(--font-size-small); font-weight:500; font-family:inherit;
    display:flex; align-items:center; gap:4px;
    transition:var(--motion);
  }
  .chat-sticker-url-btn:active{ transform:scale(var(--press-scale)); }
  .chat-sticker-url-btn:disabled{ opacity:0.5; cursor:not-allowed; }
  @media (prefers-reduced-motion:reduce){
    .chat-sticker-panel, .chat-sticker-panel-inner, .chat-sticker-tab,
    .chat-sticker-item, .chat-sticker-add-btn{
      animation-duration:0.01ms!important; transition-duration:0.01ms!important;
    }
  }
`);

let _stickerPanelEl = null;            // 当前展开的表情包面板元素
let _stickerActiveTab = 'favorites';   // 当前激活的 tab：'favorites' | 'add'

/**
 * 打开 / 关闭表情包面板。面板挂在输入区上方，点击表情直接发送。
 * 导出签名保持兼容（detail-view.js 调用）。
 * @returns {boolean} 打开后的状态：true=已展开，false=已收起
 */
export function toggleEmojiPanel() {
  const state = getState();
  if (!state.containerEl) return false;
  // 已展开则收起
  if (_stickerPanelEl && _stickerPanelEl.isConnected) {
    closeEmojiPanel();
    return false;
  }
  // 收起语音模式（如果开着），避免冲突
  try { closeVoiceMode(); } catch (e) {}
  // 异步打开（先关加号面板，避免重叠）
  openEmojiPanel();
  return true;
}

/** 展开表情包面板（异步：先关加号面板，再渲染） */
async function openEmojiPanel() {
  const state = getState();
  const inputBar = state.containerEl?.querySelector('.chat-input-bar');
  if (!inputBar) return;

  // 与加号面板互斥：动态 import detail-view.js 调用 closeInputPlusMenu（如果有），
  // 没有就退而求其次关掉栈顶 sheet（加号面板是 showBottomSheet 创建的）
  try {
    const mod = await import('./detail-view.js');
    if (typeof mod.closeInputPlusMenu === 'function') {
      mod.closeInputPlusMenu();
    }
  } catch (e) {}

  const panel = document.createElement('div');
  panel.className = 'chat-sticker-panel';
  panel.innerHTML = `
    <div class="chat-sticker-panel-inner">
      <div class="chat-sticker-tabs" role="tablist"></div>
      <div class="chat-sticker-content" id="chat-sticker-content"></div>
    </div>
  `;
  // 插在 quote-preview 之后、input-row 之前
  const quotePreview = inputBar.querySelector('#chat-quote-preview');
  if (quotePreview) {
    quotePreview.after(panel);
  } else {
    inputBar.prepend(panel);
  }
  _stickerPanelEl = panel;

  renderStickerTabs();
  renderStickerContent();
  // 入场动画
  requestAnimationFrame(() => panel.classList.add('show'));
  // 点击表情面板内部不收起；点击外部收起
  setTimeout(() => {
    document.addEventListener('click', _onStickerOutsideClick, true);
  }, 0);
}

/** 渲染 tab 栏（收藏表情 / 添加表情） */
function renderStickerTabs() {
  if (!_stickerPanelEl || !_stickerPanelEl.isConnected) return;
  const tabsEl = _stickerPanelEl.querySelector('.chat-sticker-tabs');
  if (!tabsEl) return;
  const tabs = [
    { key: 'favorites', label: '收藏表情' },
    { key: 'add', label: '添加表情' }
  ];
  tabsEl.innerHTML = tabs.map((t) => `
    <button class="chat-sticker-tab ${t.key === _stickerActiveTab ? 'active' : ''}" data-key="${t.key}" role="tab" aria-selected="${t.key === _stickerActiveTab}">
      ${escapeHTML(t.label)}
    </button>
  `).join('');
  tabsEl.querySelectorAll('.chat-sticker-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      _stickerActiveTab = tab.dataset.key;
      tabsEl.querySelectorAll('.chat-sticker-tab').forEach((t) => {
        t.classList.toggle('active', t === tab);
        t.setAttribute('aria-selected', t === tab);
      });
      renderStickerContent();
    });
  });
}

/** 渲染当前 tab 的内容区 */
function renderStickerContent() {
  if (!_stickerPanelEl || !_stickerPanelEl.isConnected) return;
  if (_stickerActiveTab === 'favorites') {
    renderFavoritesTab();
  } else {
    renderAddTab();
  }
}

/** 渲染收藏表情 tab：从 STORES.stickers 读取并展示 4 列网格 */
async function renderFavoritesTab() {
  const contentEl = _stickerPanelEl?.querySelector('#chat-sticker-content');
  if (!contentEl) return;
  let stickers = [];
  try {
    stickers = await getAllDB(STORES.stickers);
    // 按 createdAt 倒序，最新的排前面
    stickers.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  } catch (e) {
    console.warn('[chat] 表情包读取失败', e);
  }
  if (!stickers.length) {
    // 空状态：线条风 SVG 插画 + 文案
    contentEl.innerHTML = `
      <div class="chat-sticker-empty">
        <div class="chat-sticker-empty-icon" aria-hidden="true">
          <svg viewBox="0 0 100 100">
            <rect x="18" y="22" width="64" height="54" rx="6"/>
            <path d="M18 62 L34 46 L46 58 L60 42 L82 64"/>
            <circle cx="68" cy="38" r="4"/>
            <path d="M42 90 L58 90"/>
            <path d="M50 90 L50 76"/>
          </svg>
        </div>
        <div class="chat-sticker-empty-text">还没有表情包呢，去添加一些吧~</div>
      </div>
    `;
    return;
  }
  const grid = document.createElement('div');
  grid.className = 'chat-sticker-grid';
  grid.innerHTML = stickers.map((s) => `
    <button class="chat-sticker-item" type="button" data-id="${escapeAttr(s.id)}" aria-label="发送表情包">
      <img src="${escapeAttr(s.dataUrl || '')}" alt="表情" loading="lazy">
    </button>
  `).join('');
  contentEl.innerHTML = '';
  contentEl.appendChild(grid);
  // 绑定点击 / 长按
  const map = new Map(stickers.map((s) => [s.id, s]));
  grid.querySelectorAll('.chat-sticker-item').forEach((btn) => {
    const sticker = map.get(btn.dataset.id);
    if (!sticker) return;
    wireStickerItemEvents(btn, sticker);
  });
}

/** 渲染添加表情 tab：相册按钮 + 链接表单 */
function renderAddTab() {
  const contentEl = _stickerPanelEl?.querySelector('#chat-sticker-content');
  if (!contentEl) return;
  contentEl.innerHTML = `
    <div class="chat-sticker-add">
      <button class="chat-sticker-add-btn" type="button" id="chat-sticker-album-btn">
        <span class="chat-sticker-add-btn-icon">${createIcon('image', 36).outerHTML}</span>
        <span class="chat-sticker-add-btn-label">从相册添加</span>
      </button>
      <div class="chat-sticker-url-form">
        <input class="chat-sticker-url-input" type="url" id="chat-sticker-url-input" placeholder="粘贴图片链接（图床地址）" autocomplete="off">
        <button class="chat-sticker-url-btn" type="button" id="chat-sticker-url-btn">
          ${createIcon('link', 16).outerHTML}<span>添加</span>
        </button>
      </div>
    </div>
  `;
  // 相册添加
  const albumBtn = contentEl.querySelector('#chat-sticker-album-btn');
  if (albumBtn) {
    albumBtn.addEventListener('click', () => { addStickerFromAlbum(); });
  }
  // 链接添加
  const urlBtn = contentEl.querySelector('#chat-sticker-url-btn');
  const urlInput = contentEl.querySelector('#chat-sticker-url-input');
  if (urlBtn && urlInput) {
    const submit = () => {
      const url = (urlInput.value || '').trim();
      if (!url) {
        showToast('先把链接填上嘛', 'default', 1200);
        return;
      }
      urlBtn.disabled = true;
      addStickerFromUrl(url).finally(() => { urlBtn.disabled = false; });
    };
    urlBtn.addEventListener('click', submit);
    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
    });
  }
}

/** 从相册添加表情包：选图 → 压缩 → 入库 → 切回收藏 tab */
async function addStickerFromAlbum() {
  let file;
  try {
    file = await pickImageFile('image/*');
  } catch (e) {
    return; // 用户取消，不报错
  }
  // 文件大小预检（5MB 上限）
  if (file.size > 5 * 1024 * 1024) {
    showToast('图片太大啦，换一张小一点的试试~', 'default', 1600);
    return;
  }
  let dataUrl;
  try {
    // 表情包压缩：256 宽 + 0.8 质量，保持清晰但不太大
    const { compressImage } = await import('../../core/storage.js');
    dataUrl = await compressImage(file, { maxWidth: 256, maxHeight: 256, quality: 0.8 });
  } catch (e) {
    console.warn('[chat] 表情压缩失败', e);
    showToast('图片处理不出来嘛', 'error');
    return;
  }
  if (!dataUrl) {
    showToast('图片太大啦，换一张小一点的试试~', 'default', 1600);
    return;
  }
  // 压缩后体积兜底（base64 长度 ≈ 原始字节 × 1.37）
  const approxBytes = Math.round(dataUrl.length * 0.75);
  if (approxBytes > 500 * 1024) {
    showToast('图片太大啦，换一张小一点的试试~', 'default', 1600);
    return;
  }
  const sticker = {
    id: generateId('stk'),
    dataUrl,
    source: 'album',
    createdAt: getNow()
  };
  try {
    await setDB(STORES.stickers, sticker.id, sticker);
  } catch (e) {
    console.warn('[chat] 表情保存失败', e);
    showToast('保存失败了，再试一下嘛', 'error');
    return;
  }
  showToast('加好啦~', 'success', 1200);
  // 切回收藏 tab 并刷新
  _stickerActiveTab = 'favorites';
  renderStickerTabs();
  renderStickerContent();
}

/** 从链接添加表情包：fetch → 转 dataUrl → 入库 → 切回收藏 tab */
async function addStickerFromUrl(url) {
  if (!url) return;
  if (!/^https?:\/\//i.test(url)) {
    showToast('链接不对嘛，要 http(s) 开头的', 'default', 1400);
    return;
  }
  let dataUrl;
  try {
    const resp = await fetch(url, { mode: 'cors' });
    if (!resp.ok) throw new Error('fetch 失败');
    const blob = await resp.blob();
    if (!blob.type || !blob.type.startsWith('image/')) {
      showToast('这个链接不是图片嘛', 'default', 1400);
      return;
    }
    if (blob.size > 5 * 1024 * 1024) {
      showToast('图片太大啦，换一张小一点的试试~', 'default', 1600);
      return;
    }
    const { compressImage } = await import('../../core/storage.js');
    dataUrl = await compressImage(blob, { maxWidth: 256, maxHeight: 256, quality: 0.8 });
  } catch (e) {
    console.warn('[chat] 链接图片获取失败', e);
    showToast('图片拉不到嘛，换个链接试试', 'error');
    return;
  }
  if (!dataUrl) {
    showToast('图片太大啦，换一张小一点的试试~', 'default', 1600);
    return;
  }
  const sticker = {
    id: generateId('stk'),
    dataUrl,
    source: 'url',
    sourceUrl: url,
    createdAt: getNow()
  };
  try {
    await setDB(STORES.stickers, sticker.id, sticker);
  } catch (e) {
    console.warn('[chat] 表情保存失败', e);
    showToast('保存失败了，再试一下嘛', 'error');
    return;
  }
  // 清空链接输入框
  const urlInput = _stickerPanelEl?.querySelector('#chat-sticker-url-input');
  if (urlInput) urlInput.value = '';
  showToast('加好啦~', 'success', 1200);
  _stickerActiveTab = 'favorites';
  renderStickerTabs();
  renderStickerContent();
}

/** 长按删除表情包：弹 showConfirm 确认后从 STORES.stickers 删除并刷新 */
function deleteSticker(sticker) {
  if (!sticker || !sticker.id) return;
  showConfirm({
    title: '删掉这个表情包吗？',
    body: '删掉后就不能再发了哦',
    confirmText: '删掉',
    cancelText: '不要',
    danger: true,
    onConfirm: async () => {
      try {
        await deleteDB(STORES.stickers, sticker.id);
      } catch (e) {
        console.warn('[chat] 表情删除失败', e);
        showToast('没删掉，再试一下嘛', 'error');
        return;
      }
      renderStickerContent();
    }
  });
}

/**
 * 发送表情包消息：写 DB + 渲染 + 更新会话 + 触发 AI 回复。
 * 因为 extras.js 不能静态 import sending.js（会循环依赖），用动态 import。
 * 消息体：{ type:'sticker', mediaUrl:dataUrl, content:'[表情]' }
 * @param {object} sticker 收藏表情包对象 { id, dataUrl, source, createdAt }
 */
async function sendSticker(sticker) {
  const state = getState();
  if (state.isReplying) {
    showToast('等她回完再发表情嘛', 'default', 1400);
    return;
  }
  const session = state.currentSession;
  if (!session || !sticker || !sticker.dataUrl) return;

  const userMsg = {
    id: generateId('msg'),
    sessionId: session.id,
    characterId: session.characterId,
    role: 'user',
    type: 'sticker',
    mediaUrl: sticker.dataUrl,
    content: '[表情]',
    status: 'sent',
    timestamp: getNow()
  };

  // 写 DB
  try {
    await setDB(STORES.messages, userMsg.id, userMsg);
  } catch (e) {
    console.warn('[chat] 保存表情消息失败', e);
    showToast('表情没发出去，再试一下嘛', 'error');
    return;
  }

  // 渲染消息（动态 import detail-view.js，避免循环依赖）
  try {
    const dv = await import('./detail-view.js');
    if (typeof dv.appendMessageEl === 'function') dv.appendMessageEl(userMsg);
    if (typeof dv.updateChatHeader === 'function') dv.updateChatHeader(userMsg.timestamp);
    if (typeof dv.scrollToBottom === 'function') dv.scrollToBottom();
  } catch (e) {
    console.warn('[chat] 渲染表情消息失败', e);
  }

  // 更新会话 lastMessage / lastAt（复刻 sending.js 的 bumpSession 逻辑）
  try {
    const cur = await getDB(STORES.chatSessions, session.id) || session;
    const nextUnread = (state.view === 'chat' && state.currentSessionId === session.id) ? 0 : (cur.unread || 0);
    await setDB(STORES.chatSessions, session.id, {
      ...cur,
      lastMessage: '[表情]',
      lastAt: userMsg.timestamp,
      unread: nextUnread
    });
    if (state.currentSessionId === session.id) {
      state.currentSession = { ...cur, lastMessage: '[表情]', lastAt: userMsg.timestamp, unread: nextUnread };
    }
  } catch (e) {
    console.warn('[chat] 更新会话失败', e);
  }

  // 通知其他模块
  bus.emit('chat:user-message', {
    characterId: session.characterId,
    sessionId: session.id,
    content: '[表情]',
    preview: '[表情]'
  });

  // 触发 AI 回复：sending.js 的 triggerAIReply 是私有的，
  // 但 retrySendMessage 内部会调用 triggerAIReply，借道它来触发。
  try {
    const sending = await import('./sending.js');
    if (typeof sending.triggerAIReply === 'function') {
      // 优先用直接导出的 triggerAIReply（已为表情面板新增导出）
      await sending.triggerAIReply(userMsg);
    } else if (typeof sending.retrySendMessage === 'function') {
      await sending.retrySendMessage(userMsg);
    }
  } catch (e) {
    console.warn('[chat] 触发 AI 回复失败', e);
  }

  // 发送后自动关闭表情面板
  closeEmojiPanel();
}

/** 绑定表情包项的点击 / 长按事件：短按发送，长按删除 */
function wireStickerItemEvents(btn, sticker) {
  let pressTimer = null;
  let longPressed = false;

  const start = () => {
    longPressed = false;
    pressTimer = setTimeout(() => {
      longPressed = true;
      btn.classList.add('long-press');
      // 震动反馈（如果支持）
      if (navigator.vibrate) { try { navigator.vibrate(30); } catch (e) {} }
      // 长按 → 删除
      deleteSticker(sticker);
    }, 500);
  };

  const cancel = () => {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    btn.classList.remove('long-press');
  };

  btn.addEventListener('pointerdown', start);
  btn.addEventListener('pointerup', (e) => {
    cancel();
    // 短按 → 发送
    if (!longPressed) {
      e.preventDefault();
      sendSticker(sticker);
    }
  });
  btn.addEventListener('pointerleave', cancel);
  btn.addEventListener('pointercancel', cancel);
}

/** 关闭表情包面板 */
export function closeEmojiPanel() {
  if (_stickerPanelEl && _stickerPanelEl.isConnected) {
    _stickerPanelEl.classList.remove('show');
    const el = _stickerPanelEl;
    setTimeout(() => el.remove(), 320);
  }
  _stickerPanelEl = null;
  document.removeEventListener('click', _onStickerOutsideClick, true);
}

/** 点击表情面板外部时收起 */
function _onStickerOutsideClick(e) {
  if (!_stickerPanelEl) return;
  if (_stickerPanelEl.contains(e.target)) return;
  const state = getState();
  const emojiBtn = state.containerEl?.querySelector('#chat-emoji-btn');
  if (emojiBtn && emojiBtn.contains(e.target)) return;
  closeEmojiPanel();
}

// ════════════════════════════════════════
// 语音录制（MediaRecorder，不可用时优雅降级）
// ════════════════════════════════════════

let _voiceModeOn = false;        // 是否处于"按住说话"模式
let _voiceRecorder = null;       // VoiceRecorder 实例

/**
 * 切换语音 / 文字输入模式。
 * 语音模式时 textarea 隐藏，显示"按住 说话"大按钮。
 * @returns {boolean} 切换后是否处于语音模式
 */
export function toggleVoiceMode() {
  if (_voiceModeOn) {
    closeVoiceMode();
    return false;
  }
  // 收起表情面板
  try { closeEmojiPanel(); } catch (e) {}
  openVoiceMode();
  return true;
}

/** 进入语音模式 */
function openVoiceMode() {
  const state = getState();
  if (!state.containerEl) return;
  const ta = state.inputEl;
  if (!ta) return;
  // 不允许在有草稿的情况下切语音？允许，但隐藏 textarea 时保留草稿
  _voiceModeOn = true;
  // 把 textarea 隐藏，插入"按住说话"按钮
  const holder = document.createElement('button');
  holder.type = 'button';
  holder.className = 'chat-voice-hold';
  holder.id = 'chat-voice-hold';
  holder.textContent = '按住 说话';
  holder.setAttribute('aria-label', '按住开始说话，松开发送');
  ta.parentElement.insertBefore(holder, ta);
  ta.style.display = 'none';
  // 切换图标：voice -> keyboard
  const voiceBtn = state.containerEl.querySelector('#chat-voice-btn');
  if (voiceBtn) voiceBtn.innerHTML = createIcon('keyboard', 20).outerHTML;
  // 绑定长按
  wireHoldToSpeak(holder);
}

/** 退出语音模式 */
export function closeVoiceMode() {
  if (!_voiceModeOn) return;
  const state = getState();
  if (!state.containerEl) return;
  _voiceModeOn = false;
  const holder = state.containerEl.querySelector('#chat-voice-hold');
  if (holder) holder.remove();
  if (state.inputEl) state.inputEl.style.display = '';
  const voiceBtn = state.containerEl.querySelector('#chat-voice-btn');
  if (voiceBtn) voiceBtn.innerHTML = createIcon('mic', 20).outerHTML;
}

/** 绑定"按住说话"按钮：按下开始录音，松开发送，上滑取消 */
function wireHoldToSpeak(btn) {
  let recorder = null;
  let startY = 0;
  let cancelled = false;
  let overlay = null;

  const start = async (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    startY = e.clientY;
    cancelled = false;
    // 创建录音遮罩
    overlay = createRecordingOverlay();
    document.body.appendChild(overlay.el);
    requestAnimationFrame(() => overlay.el.classList.add('show'));
    try {
      recorder = new VoiceRecorder();
      await recorder.start();
      overlay.setRecording(true);
    } catch (err) {
      console.warn('[chat] 录音启动失败', err);
      overlay.el.remove();
      showToast('麦克风用不了呀，检查一下权限嘛', 'error');
      recorder = null;
    }
  };

  const move = (e) => {
    if (!recorder) return;
    const dy = startY - e.clientY;
    // 上滑超过 60px 视为取消
    const isCancelling = dy > 60;
    if (isCancelling !== cancelled) {
      cancelled = isCancelling;
      overlay.setCancelState(cancelled);
    }
  };

  const end = async (e) => {
    if (!recorder) {
      if (overlay) overlay.el.remove();
      return;
    }
    const r = recorder;
    recorder = null;
    const ov = overlay;
    overlay = null;
    try {
      if (cancelled) {
        r.cancel();
        showToast('已取消', 'default', 800);
      } else {
        const result = await r.stop();
        if (result && result.duration > 0) {
          await sendVoiceMessage(result.dataUrl, result.duration);
        } else {
          showToast('录的太短啦，长一点试试', 'default', 1200);
        }
      }
    } catch (err) {
      console.warn('[chat] 录音结束失败', err);
      showToast('录音出错了，再试一下嘛', 'error');
    } finally {
      ov.el.classList.remove('show');
      setTimeout(() => ov.el.remove(), 220);
    }
  };

  btn.addEventListener('pointerdown', start);
  btn.addEventListener('pointermove', move);
  btn.addEventListener('pointerup', end);
  btn.addEventListener('pointercancel', end);
}

/** 录音遮罩：圆形指示器 + 计时 + 提示文字 */
function createRecordingOverlay() {
  const el = document.createElement('div');
  el.className = 'chat-voice-overlay';
  el.innerHTML = `
    <div class="chat-voice-overlay-card">
      <div class="chat-voice-overlay-icon">
        <span class="chat-voice-mic">${createIcon('mic', 36).outerHTML}</span>
      </div>
      <div class="chat-voice-timer">0:00</div>
      <div class="chat-voice-hint">松开发送，上滑取消</div>
    </div>
  `;
  let timer = null;
  let seconds = 0;
  const hintEl = el.querySelector('.chat-voice-hint');
  const timerEl = el.querySelector('.chat-voice-timer');

  return {
    el,
    setRecording(active) {
      if (!active) return;
      seconds = 0;
      timerEl.textContent = '0:00';
      timer = setInterval(() => {
        seconds++;
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        timerEl.textContent = `${m}:${String(s).padStart(2, '0')}`;
        // 最长 60 秒
        if (seconds >= 60 && timer) {
          clearInterval(timer);
          timer = null;
          // 模拟松开：派发 pointerup 到当前持有指针的元素
          // 这里简单做：直接 dispatch 到 body
          document.body.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
        }
      }, 1000);
    },
    setCancelState(cancelling) {
      el.classList.toggle('cancelling', cancelling);
      hintEl.textContent = cancelling ? '松开取消' : '松开发送，上滑取消';
    }
  };
}

/**
 * 语音录制器：封装 MediaRecorder，返回 dataURL + 时长。
 * 浏览器不支持时 start() 抛错，调用方捕获后降级提示。
 */
class VoiceRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.chunks = [];
    this.stream = null;
    this.startTime = 0;
    this.mime = '';
  }

  async start() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('不支持麦克风');
    }
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // 选一个支持的 mime
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
    this.mime = candidates.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
    this.mediaRecorder = this.mime
      ? new MediaRecorder(this.stream, { mimeType: this.mime })
      : new MediaRecorder(this.stream);
    this.chunks = [];
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    this.mediaRecorder.start();
    this.startTime = Date.now();
  }

  stop() {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) { resolve(null); return; }
      this.mediaRecorder.onstop = () => {
        const duration = Math.max(0, Math.round((Date.now() - this.startTime) / 1000));
        const blob = new Blob(this.chunks, { type: this.mime || 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => resolve({ dataUrl: reader.result, duration });
        reader.onerror = reject;
        reader.readAsDataURL(blob);
        // 释放麦克风
        if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
      };
      this.mediaRecorder.onerror = reject;
      try { this.mediaRecorder.stop(); } catch (e) { reject(e); }
    });
  }

  cancel() {
    try {
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.onstop = null;
        this.mediaRecorder.stop();
      }
      if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    } catch (e) {}
  }
}

/** 发送语音消息（写入 DB + 渲染 + 触发 AI 回复） */
async function sendVoiceMessage(dataUrl, duration) {
  const state = getState();
  if (state.isReplying) {
    showToast('等她回完再发语音嘛', 'default', 1400);
    return;
  }
  const session = state.currentSession;
  if (!session) return;
  // 动态 import 避免循环依赖（sending.js 依赖 detail-view.js，detail-view.js 依赖本模块）
  try {
    const mod = await import('./sending.js');
    if (typeof mod.sendVoiceMessage === 'function') {
      await mod.sendVoiceMessage(dataUrl, duration);
    } else {
      showToast('语音发送暂不可用', 'default', 1400);
    }
  } catch (e) {
    console.warn('[chat] 语音发送失败', e);
    showToast('语音没发出去，再试一下嘛', 'error');
  }
}

// ════════════════════════════════════════
// 消息转发
// ════════════════════════════════════════

/**
 * 打开转发面板：列出所有会话（除当前外），点击即转发。
 * @param {object} msg 待转发的消息
 */
export async function openForwardSheet(msg) {
  const state = getState();
  let sessions = [];
  try {
    sessions = await getAllDB(STORES.chatSessions);
  } catch (e) {
    showToast('会话读不出来嘛', 'error');
    return;
  }
  // 排除当前会话
  const currentId = state.currentSession?.id;
  const list = sessions.filter((s) => s.id !== currentId);
  if (!list.length) {
    showToast('没有别的会话可以转发啦，先去和别人聊聊嘛', 'default', 1600);
    return;
  }
  // 排序：置顶优先，其次 lastAt 倒序
  list.sort((a, b) => {
    const pa = a.pinned ? 1 : 0;
    const pb = b.pinned ? 1 : 0;
    if (pa !== pb) return pb - pa;
    return new Date(b.lastAt || 0) - new Date(a.lastAt || 0);
  });
  // 预读角色头像
  const charCache = new Map();
  try {
    const allChars = await getAllDB(STORES.characters);
    allChars.forEach((c) => charCache.set(c.id, c));
  } catch (e) {}

  const body = document.createElement('div');
  body.className = 'chat-forward-list';
  body.innerHTML = list.map((s) => {
    const char = charCache.get(s.characterId);
    const av = char?.avatar;
    const avHTML = av ? `<div class="chat-forward-avatar" style="background-image:url('${escapeAttr(av)}')"></div>`
      : `<div class="chat-forward-avatar chat-forward-avatar-fallback">${createIcon('smile', 22).outerHTML}</div>`;
    return `
      <div class="chat-forward-item" data-id="${escapeAttr(s.id)}" role="button" tabindex="0" aria-label="转发到 ${escapeAttr(s.title || '会话')}">
        ${avHTML}
        <div class="chat-forward-info">
          <div class="chat-forward-title">${escapeHTML(s.title || char?.name || '未命名')}</div>
          <div class="chat-forward-preview">${escapeHTML((s.lastMessage || '还没有消息呢').slice(0, 28))}</div>
        </div>
      </div>
    `;
  }).join('');

  const sheet = showBottomSheet({
    title: '转发到...',
    bodyElement: body,
    dismissible: true
  });

  body.querySelectorAll('.chat-forward-item').forEach((item) => {
    item.addEventListener('click', async () => {
      const sid = item.dataset.id;
      sheet.close();
      await doForward(msg, sid);
    });
  });
}

/** 执行转发：在目标会话里创建一条新消息（content/type/mediaUrl 复制，标记 forwarded） */
async function doForward(msg, targetSessionId) {
  let sess = null;
  try { sess = await getDB(STORES.chatSessions, targetSessionId); } catch (e) {}
  if (!sess) {
    showToast('那个会话不见了', 'error');
    return;
  }
  const newMsg = {
    id: generateId('msg'),
    sessionId: targetSessionId,
    characterId: sess.characterId,
    role: 'user',
    content: msg.content || '',
    type: msg.type || 'text',
    mediaUrl: msg.mediaUrl || '',
    forwarded: true,
    forwardedAt: getNow(),
    status: 'sent',
    timestamp: getNow()
  };
  try {
    await setDB(STORES.messages, newMsg.id, newMsg);
    // 更新目标会话 lastMessage
    const preview = msg.type === 'image' ? '[图片]' : (msg.content || '').slice(0, 60);
    await setDB(STORES.chatSessions, targetSessionId, {
      ...sess,
      lastMessage: preview,
      lastAt: newMsg.timestamp,
      unread: (sess.unread || 0)
    });
    showToast(`已转发到 ${sess.title || '会话'}`, 'success', 1400);
    bus.emit('chat:message-received', {
      characterId: sess.characterId,
      sessionId: targetSessionId,
      preview
    });
  } catch (e) {
    console.warn('[chat] 转发失败', e);
    showToast('转发失败了，再试一下嘛', 'error');
  }
}

// ════════════════════════════════════════
// 页内搜索（详情页顶部搜索框 + 高亮 + 上下跳转）
// ════════════════════════════════════════

let _searchState = {
  keyword: '',
  matches: [],     // [{ id, el }]
  current: -1      // 当前定位的匹配索引
};

/**
 * 切换页内搜索栏的显示。
 * @returns {boolean} 显示后是否可见
 */
export function toggleInChatSearch() {
  const state = getState();
  if (!state.containerEl) return false;
  const bar = state.containerEl.querySelector('#chat-search-bar');
  if (!bar) return false;
  const visible = bar.classList.toggle('show');
  if (visible) {
    const input = bar.querySelector('#chat-search-input');
    try { input?.focus(); } catch (e) {}
  } else {
    clearSearchHighlight();
    _searchState = { keyword: '', matches: [], current: -1 };
  }
  return visible;
}

/** 执行搜索：扫描当前可见消息，高亮匹配项 */
export function runInChatSearch(keyword) {
  const state = getState();
  _searchState.keyword = (keyword || '').trim();
  _searchState.matches = [];
  _searchState.current = -1;
  clearSearchHighlight();
  if (!_searchState.keyword) {
    updateSearchCount();
    return;
  }
  const listEl = state.messageListEl;
  if (!listEl) return;
  // 遍历所有消息行，在文本内容里找匹配
  const rows = listEl.querySelectorAll('.chat-msg-row[data-id]');
  const kw = _searchState.keyword.toLowerCase();
  rows.forEach((row) => {
    const id = row.dataset.id;
    const bubble = row.querySelector('.chat-bubble');
    if (!bubble) return;
    // 只看纯文本，跳过图片/代码块
    const text = (bubble.textContent || '').trim();
    if (!text) return;
    if (text.toLowerCase().includes(kw)) {
      _searchState.matches.push({ id, el: row });
      highlightInElement(bubble, _searchState.keyword);
    }
  });
  if (_searchState.matches.length > 0) {
    _searchState.current = 0;
    scrollToMatch(0);
  }
  updateSearchCount();
}

/** 在元素内高亮所有匹配关键字（用 mark 包裹） */
function highlightInElement(el, keyword) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      // 跳过 script/style/code
      const parent = node.parentNode;
      if (!parent) return NodeFilter.FILTER_REJECT;
      const tag = parent.nodeName;
      if (tag === 'SCRIPT' || tag === 'STYLE') return NodeFilter.FILTER_REJECT;
      if (parent.classList && parent.classList.contains('md-code-block')) return NodeFilter.FILTER_REJECT;
      if (!node.nodeValue || !node.nodeValue.toLowerCase().includes(keyword.toLowerCase())) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const targets = [];
  while (walker.nextNode()) targets.push(walker.currentNode);
  targets.forEach((node) => {
    const text = node.nodeValue;
    const lower = text.toLowerCase();
    const kw = keyword.toLowerCase();
    const frag = document.createDocumentFragment();
    let i = 0;
    let idx;
    while ((idx = lower.indexOf(kw, i)) !== -1) {
      if (idx > i) frag.appendChild(document.createTextNode(text.slice(i, idx)));
      const mark = document.createElement('mark');
      mark.className = 'chat-search-mark';
      mark.textContent = text.slice(idx, idx + kw.length);
      frag.appendChild(mark);
      i = idx + kw.length;
    }
    if (i < text.length) frag.appendChild(document.createTextNode(text.slice(i)));
    node.parentNode.replaceChild(frag, node);
  });
}

/** 清除所有高亮 mark */
function clearSearchHighlight() {
  const state = getState();
  if (!state.messageListEl) return;
  const marks = state.messageListEl.querySelectorAll('mark.chat-search-mark');
  marks.forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    parent.replaceChild(document.createTextNode(mark.textContent), mark);
    parent.normalize();
  });
}

/** 跳转到第 idx 个匹配（滚动 + 当前高亮） */
function scrollToMatch(idx) {
  if (idx < 0 || idx >= _searchState.matches.length) return;
  // 移除上一个 current
  _searchState.matches.forEach((m) => m.el.classList.remove('search-current'));
  const m = _searchState.matches[idx];
  m.el.classList.add('search-current');
  m.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  _searchState.current = idx;
  updateSearchCount();
}

/** 跳到上一个匹配 */
export function searchPrev() {
  if (!_searchState.matches.length) return;
  const n = _searchState.matches.length;
  const next = (_searchState.current - 1 + n) % n;
  scrollToMatch(next);
}

/** 跳到下一个匹配 */
export function searchNext() {
  if (!_searchState.matches.length) return;
  const n = _searchState.matches.length;
  const next = (_searchState.current + 1) % n;
  scrollToMatch(next);
}

/** 更新搜索计数显示 */
function updateSearchCount() {
  const state = getState();
  if (!state.containerEl) return;
  const countEl = state.containerEl.querySelector('#chat-search-count');
  if (!countEl) return;
  const total = _searchState.matches.length;
  const cur = total > 0 ? _searchState.current + 1 : 0;
  countEl.textContent = total > 0 ? `${cur}/${total}` : (_searchState.keyword ? '无匹配' : '');
}

// ════════════════════════════════════════
// 引用消息定位：点击引用卡片滚动到原消息并高亮闪烁
// ════════════════════════════════════════

/**
 * 滚动到指定 id 的消息并高亮闪烁。
 * @param {string} msgId 原消息 id
 */
export function scrollToMessageAndHighlight(msgId) {
  const state = getState();
  if (!state.messageListEl || !msgId) return;
  const target = state.messageListEl.querySelector(`.chat-msg-row[data-id="${cssEscape(msgId)}"]`);
  if (!target) {
    showToast('原消息可能太远啦，往上翻翻看', 'default', 1400);
    return;
  }
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  // 闪烁动画
  target.classList.add('highlight-flash');
  setTimeout(() => target.classList.remove('highlight-flash'), 1600);
}

/** CSS.escape 兜底 */
function cssEscape(s) {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(String(s));
  return String(s).replace(/["\\]/g, '\\$&');
}

// ════════════════════════════════════════
// 已读回执：把当前会话里所有 sending/sent 状态的用户消息标记为 read
// ════════════════════════════════════════

/**
 * 把指定会话内所有用户消息标记为 read（AI 已读）。
 * 由 sending.js 在 AI 开始回复前调用。
 * @param {string} sessionId
 */
export async function markUserMessagesRead(sessionId) {
  if (!sessionId) return;
  const state = getState();
  let updated = false;
  try {
    const all = await getAllDB(STORES.messages);
    const userMsgs = all.filter((m) => m.sessionId === sessionId && m.role === 'user' && m.status !== 'read' && m.status !== 'failed');
    for (const m of userMsgs) {
      try {
        await setDB(STORES.messages, m.id, { ...m, status: 'read' });
        updated = true;
      } catch (e) {}
    }
  } catch (e) {
    console.warn('[chat] 标记已读失败', e);
  }
  if (updated) {
    // 刷新 UI 状态图标
    try {
      const { updateMessageStatus } = await import('./detail-view.js');
      // 只更新当前会话的可见消息
      if (state.messageListEl && state.currentSessionId === sessionId) {
        const rows = state.messageListEl.querySelectorAll('.chat-msg-row.user[data-id]');
        rows.forEach((row) => {
          updateMessageStatus(row.dataset.id, 'read');
        });
      }
    } catch (e) {}
    // 通知其他模块
    bus.emit('chat:messages-read', { sessionId });
  }
}

/**
 * 清理增强模块的临时状态：收起表情面板 / 退出语音模式 / 清除搜索高亮。
 * 由 index.js 的 unmount 调用，避免组件卸载后残留监听。
 */
export function cleanupExtras() {
  try { closeEmojiPanel(); } catch (e) {}
  try { closeVoiceMode(); } catch (e) {}
  _voiceRecorder = null;
  _searchState = { keyword: '', matches: [], current: -1 };
}
