// apps/chat/extras.js
// 聊天增强模块——表情面板、语音录制、消息转发、页内搜索、引用消息定位。
// 全部走 CSS 变量，纯 ES Module，无外部依赖。
// 状态由 index.js 持有，本模块通过 getState 协作；导出函数供 detail-view.js 调用。
// 红线：图标只准 SVG 线稿（表情面板内的 emoji 字符是用户输入内容，不算 UI 图标）。

import { STORES } from '../../core/storage-keys.js';
import { getDB, setDB, getAllDB, generateId, getNow } from '../../core/storage.js';
import { showToast, showBottomSheet, createIcon, registerIcon } from '../../core/ui.js';
import bus from '../../core/events.js';
import { clamp } from '../../core/util.js';
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
// 表情面板
// ════════════════════════════════════════

// 六个分类的表情数据（每类约 48-64 个，8 列网格自适应高度）
// 注：这里是用户输入用的 emoji 字符，不是 UI 图标，不违反"禁止 emoji 代替图标"
const EMOJI_CATEGORIES = [
  {
    key: 'face', label: '表情',
    emojis: '😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 ☹️ 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🤭 🤫 🤥 😶 😐 😑 😬 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕'.split(/\s+/)
  },
  {
    key: 'gesture', label: '手势',
    emojis: '👍 👎 👊 ✊ 🤛 🤜 👏 🙌 👐 🤲 🙏 🤝 💪 🦾 👋 🤚 ✋ 🖖 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 👈 👉 👆 👇 ☝️ ✍️ 🖐️ 💅 🤳 🦶 🦵 🦿 🦷 👂 🦻 👃 👀 👁️ 👅 👄 💋'.split(/\s+/)
  },
  {
    key: 'animal', label: '动物',
    emojis: '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🐤 🐣 🐥 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🐛 🦋 🐌 🐞 🐜 🦟 🦗 🕷️ 🦂 🐢 🐍 🦎 🦖 🦕 🐙 🦑 🦐 🦞 🦀 🐡 🐠 🐟 🐬 🐳 🐋 🦈 🐊 🐅 🐆 🦓 🦍 🦧 🐘 🦛 🦏 🐪 🐫 🦒 🦘'.split(/\s+/)
  },
  {
    key: 'food', label: '食物',
    emojis: '🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🍆 🥑 🥦 🥬 🥒 🌶️ 🫑 🌽 🥕 🫒 🧄 🧅 🥔 🍠 🥐 🥯 🍞 🥖 🥨 🧀 🥚 🍳 🧈 🥞 🧇 🥓 🥩 🍗 🍖 🦴 🌭 🍔 🍟 🍕 🥪 🥙 🧆 🌮 🌯 🫔 🥗 🥘 🫕 🥫 🍝 🍜 🍲 🍛 🍣'.split(/\s+/)
  },
  {
    key: 'object', label: '物品',
    emojis: '⌚ 📱 💻 ⌨️ 🖥️ 🖨️ 🖱️ 🕹️ 💾 💿 📀 📷 📸 🎥 📹 🎞️ 📽️ 🎬 📺 📡 📻 🎙️ 🎚️ 🎛️ ⏱️ ⏲️ ⏰ 🕰️ ⌛ ⏳ 🔋 🔌 💡 🔦 🕯️ 🪔 🧯 🛢️ 💸 💵 💴 💶 💷 🪙 💰 💳 💎 ⚖️ 🪜 🧰 🪛 🔧 🔨 ⚒️ 🛠️ ⛏️ 🪚 🔩 ⚙️ 🪤 ⛓️ 🧲 🔫 💣 🧨'.split(/\s+/)
  },
  {
    key: 'symbol', label: '符号',
    emojis: '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ☮️ ✝️ ☪️ 🕉️ ☸️ ✡️ 🔯 🕎 ☯️ ☦️ 🛐 ⛎ ♈ ♉ ♊ ♋ ♌ ♍ ♎ ♏ ♐ ♑ ♒ ♓ 🆔 ⚛️ 🉑 ☢️ ☣️ 📴 📳 🈶 🈚 🈸 🈺 🈷️ ✴️ 🆚 💮 🉐 ㊙️ ㊗️ 🈴 🈵 🈹 🈲 🅰️ 🅱️ 🆎 🆑 🅾️ 🆘 ❌ ⭕ 🛑 ⛔ 📛 🚫 💯 💢 ♨️'.split(/\s+/)
  }
];

let _emojiPanelEl = null;       // 当前展开的表情面板元素
let _emojiActiveCategory = 'face';

/**
 * 打开 / 关闭表情面板。面板挂在输入区上方，点击表情直接插入输入框。
 * @returns {boolean} 打开后的状态：true=已展开，false=已收起
 */
export function toggleEmojiPanel() {
  const state = getState();
  if (!state.containerEl) return false;
  // 已展开则收起
  if (_emojiPanelEl && _emojiPanelEl.isConnected) {
    closeEmojiPanel();
    return false;
  }
  // 收起语音模式（如果开着），避免冲突
  try { closeVoiceMode(); } catch (e) {}
  openEmojiPanel();
  return true;
}

/** 展开表情面板 */
function openEmojiPanel() {
  const state = getState();
  const inputBar = state.containerEl?.querySelector('.chat-input-bar');
  if (!inputBar) return;
  const panel = document.createElement('div');
  panel.className = 'chat-emoji-panel';
  panel.innerHTML = `
    <div class="chat-emoji-tabs" role="tablist"></div>
    <div class="chat-emoji-grid" id="chat-emoji-grid"></div>
  `;
  // 插在 quote-preview 之后、input-row 之前
  const quotePreview = inputBar.querySelector('#chat-quote-preview');
  if (quotePreview) {
    quotePreview.after(panel);
  } else {
    inputBar.prepend(panel);
  }
  _emojiPanelEl = panel;

  // 渲染分类标签
  const tabsEl = panel.querySelector('.chat-emoji-tabs');
  tabsEl.innerHTML = EMOJI_CATEGORIES.map((c) => `
    <button class="chat-emoji-tab ${c.key === _emojiActiveCategory ? 'active' : ''}" data-key="${c.key}" role="tab" aria-selected="${c.key === _emojiActiveCategory}">
      ${escapeHTML(c.label)}
    </button>
  `).join('');
  tabsEl.querySelectorAll('.chat-emoji-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      _emojiActiveCategory = tab.dataset.key;
      tabsEl.querySelectorAll('.chat-emoji-tab').forEach((t) => {
        t.classList.toggle('active', t === tab);
        t.setAttribute('aria-selected', t === tab);
      });
      renderEmojiGrid();
    });
  });

  renderEmojiGrid();
  // 入场动画
  requestAnimationFrame(() => panel.classList.add('show'));
  // 点击表情面板内部不收起；点击外部收起
  setTimeout(() => {
    document.addEventListener('click', _onEmojiOutsideClick, true);
  }, 0);
}

/** 渲染当前分类的表情网格 */
function renderEmojiGrid() {
  if (!_emojiPanelEl || !_emojiPanelEl.isConnected) return;
  const gridEl = _emojiPanelEl.querySelector('#chat-emoji-grid');
  if (!gridEl) return;
  const cat = EMOJI_CATEGORIES.find((c) => c.key === _emojiActiveCategory) || EMOJI_CATEGORIES[0];
  gridEl.innerHTML = cat.emojis.map((e) => `
    <button class="chat-emoji-item" type="button" data-emoji="${escapeAttr(e)}" aria-label="插入表情 ${escapeAttr(e)}">${e}</button>
  `).join('');
  gridEl.querySelectorAll('.chat-emoji-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const emoji = btn.dataset.emoji || '';
      insertTextToInput(emoji);
      // 轻微反馈：点击后短暂高亮
      btn.classList.add('picked');
      setTimeout(() => btn.classList.remove('picked'), 200);
    });
  });
}

/** 把文本插入到输入框光标处 */
function insertTextToInput(text) {
  const state = getState();
  if (!state.inputEl) return;
  const ta = state.inputEl;
  const start = ta.selectionStart ?? ta.value.length;
  const end = ta.selectionEnd ?? ta.value.length;
  ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
  const pos = start + text.length;
  ta.setSelectionRange(pos, pos);
  // 触发 input 事件，让自适应高度 + 草稿保存生效
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  try { ta.focus(); } catch (e) {}
}

/** 关闭表情面板 */
export function closeEmojiPanel() {
  if (_emojiPanelEl && _emojiPanelEl.isConnected) {
    _emojiPanelEl.classList.remove('show');
    const el = _emojiPanelEl;
    setTimeout(() => el.remove(), 220);
  }
  _emojiPanelEl = null;
  document.removeEventListener('click', _onEmojiOutsideClick, true);
}

/** 点击表情面板外部时收起 */
function _onEmojiOutsideClick(e) {
  if (!_emojiPanelEl) return;
  // 点击在面板内或表情按钮上，不收起
  if (_emojiPanelEl.contains(e.target)) return;
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
