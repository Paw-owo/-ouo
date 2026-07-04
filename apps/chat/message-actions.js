// apps/chat/message-actions.js
// 消息与聊天的操作菜单——长按消息弹小菜单，顶部 more 菜单管整段聊天。
// 负责：复制/引用/撤回/收藏/删除消息，切换模式/聊天背景/免打扰/导出/清空记录。
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js, core/util.js
// 红线：图标只准 SVG 线稿，禁止任何 emoji 字符。

import { KEYS, STORES } from '../../core/storage-keys.js';
import { getData, setData, getDB, setDB, deleteDB, getAllDB, generateId, getNow, compressImage } from '../../core/storage.js';
import { showToast, showConfirm, showBottomSheet, createIcon } from '../../core/ui.js';
import bus from '../../core/events.js';
import { downloadBlob, isUsableImage, cssUrl, clamp, pickImageFile } from '../../core/util.js';
import { getState, render, applySessionWallpaper, setQuoteToInput, enterChat, openForwardSheet } from './index.js';
import { escapeHTML, escapeAttr } from './shared-utils.js';
import { playTTS, stopAllTTS } from '../../core/tts.js';
import { retrySendMessage } from './sending.js';

// 撤回时间窗（毫秒）：仅自己的消息 2 分钟内可撤回
const RECALL_WINDOW_MS = 2 * 60 * 1000;

// ════════════════════════════════════════
// 消息长按操作菜单
// ════════════════════════════════════════

/**
 * 长按消息弹操作菜单（网格布局，圆形按钮 + 文字）。菜单项根据消息类型/角色动态显示。
 * @param {object} msg 消息对象
 */
export function openMessageActionSheet(msg) {
  const isUser = msg.role === 'user';
  const isImage = msg.type === 'image';
  const isVoice = msg.type === 'voice' || msg.type === 'audio';
  // 撤回：仅自己的消息且在 2 分钟内
  const canRecall = isUser && (Date.now() - new Date(msg.timestamp || msg.createdAt).getTime()) < RECALL_WINDOW_MS;
  // 重发：仅 failed 状态的消息
  const canResend = msg.status === 'failed';
  // 转发：图片/语音暂不支持转发媒体本身（仅转发文字描述）
  const canForward = !isImage && !isVoice;

  const actions = [
    { key: 'speak',   label: '念给我听',  icon: 'volume',  show: !isUser && !isImage && !isVoice, onClick: () => speakMessage(msg) },
    { key: 'resend',  label: '重发',     icon: 'refresh', show: canResend, onClick: () => resendMessage(msg) },
    { key: 'copy',    label: '复制',     icon: 'memo',    show: !isImage && !isVoice, onClick: () => copyMessage(msg) },
    { key: 'forward', label: '转发',     icon: 'forward', show: canForward, onClick: () => forwardMessage(msg) },
    { key: 'quote',   label: '引用',      icon: 'chat',    show: !isImage && !isVoice, onClick: () => quoteMessage(msg) },
    { key: 'recall',  label: '撤回',      icon: 'back',    show: canRecall, onClick: () => recallMessage(msg) },
    { key: 'star',    label: '收藏',      icon: 'star',    show: true,    onClick: () => starMessage(msg) },
    { key: 'delete',  label: '删除',      icon: 'trash',   show: true, danger: true, onClick: () => deleteMessage(msg) }
  ].filter((a) => a.show);

  if (!actions.length) return;

  const body = document.createElement('div');
  body.className = 'chat-action-grid';
  body.innerHTML = actions.map((a) => `
    <button class="chat-action-grid-item ${a.danger ? 'danger' : ''}" data-key="${a.key}" type="button" role="menuitem">
      <span class="chat-action-grid-icon">${createIcon(a.icon, 22).outerHTML}</span>
      <span class="chat-action-grid-label">${escapeHTML(a.label)}</span>
    </button>
  `).join('');

  const sheet = showBottomSheet({
    title: '消息操作',
    bodyElement: body,
    dismissible: true
  });

  body.querySelectorAll('.chat-action-grid-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      const action = actions.find((a) => a.key === key);
      sheet.close();
      if (action && typeof action.onClick === 'function') {
        try { action.onClick(); } catch (e) { console.warn('[chat] 消息操作失败', e); }
      }
    });
  });
}

// ── 念给我听（TTS）──
async function speakMessage(msg) {
  const text = String(msg.content || '');
  if (!text) {
    showToast('这条没什么可以念呀', 'default', 1200);
    return;
  }
  // 先停掉任何正在念的，避免叠播
  try { stopAllTTS(); } catch (e) {}
  showToast('正在念给你听～', 'default', 1400);
  try {
    await playTTS(text);
  } catch (e) {
    console.warn('[chat] 念给我听失败', e);
    showToast('念不出来呀，检查一下「我的声音」配置嘛', 'error');
  }
}

// ── 重发失败的消息 ──
function resendMessage(msg) {
  if (typeof retrySendMessage === 'function') {
    retrySendMessage(msg);
  } else {
    showToast('暂时没法重发呀，等一下再试', 'error');
  }
}

// ── 复制 ──
function copyMessage(msg) {
  const text = String(msg.content || '');
  if (!text) {
    showToast('没什么可复制的呀', 'default', 1200);
    return;
  }
  // 优先走剪贴板 API，失败兜底
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(
      () => showToast('复制好啦', 'success', 1200),
      () => fallbackCopy(text)
    );
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    showToast(ok ? '复制好啦' : '没复制成功，长按手动复制吧', ok ? 'success' : 'error', 1200);
  } catch (e) {
    showToast('剪贴板不让用呀', 'error');
  }
}

// ── 引用 ──
// 截断长文本作为引用预览，并带上原消息 id + 发送者名，渲染时生成可点击引用卡片
function quoteMessage(msg) {
  const text = String(msg.content || '');
  if (!text) {
    showToast('这条没法引用呀', 'default', 1200);
    return;
  }
  // 截断长文本，引用只取前 40 字
  const snippet = text.length > 40 ? text.slice(0, 40) + '...' : text;
  // 发送者名：用户消息标"我"，AI 消息标角色名
  const state = getState();
  const sender = msg.role === 'user'
    ? '我'
    : (state.currentCharacter?.name || state.currentCharacter?.nickname || '她');
  setQuoteToInput(snippet, { id: msg.id, sender });
  showToast('已引用，写好回复就发吧', 'default', 1400);
}

// ── 转发 ──
// 调用 extras.js 的 openForwardSheet 弹出会话选择面板
function forwardMessage(msg) {
  if (typeof openForwardSheet !== 'function') {
    showToast('转发功能暂不可用', 'default', 1400);
    return;
  }
  openForwardSheet(msg);
}

// ── 撤回 ──
// 不删除消息，改为标记 recalled=true，渲染时显示"你撤回了一条消息"占位
function recallMessage(msg) {
  showConfirm({
    title: '撤回这条消息吗？',
    body: '撤回后就看不到了，对方也不会再看到。',
    confirmText: '撤回吧',
    cancelText: '不要',
    onConfirm: async () => {
      try {
        const cur = await getDB(STORES.messages, msg.id) || msg;
        await setDB(STORES.messages, msg.id, {
          ...cur,
          recalled: true,
          content: '',
          recalledAt: Date.now()
        });
        showToast('撤回啦', 'default', 1200);
        await render();
      } catch (e) {
        console.warn('[chat] 撤回失败', e);
        showToast('没撤回成功，再试一下嘛', 'error');
      }
    }
  });
}

// ── 收藏 ──
// 存入 IndexedDB favorites store，并 emit 事件供其他 App 监听
async function starMessage(msg) {
  try {
    const favId = generateId('fav');
    await setDB(STORES.favorites, favId, {
      id: favId,
      messageId: msg.id,
      sessionId: msg.sessionId,
      characterId: msg.characterId,
      content: msg.content || '',
      type: msg.type || 'text',
      mediaUrl: msg.mediaUrl || '',
      timestamp: Date.now()
    });
    bus.emit('chat:starred', { id: msg.id, favId, content: msg.content, characterId: msg.characterId });
    showToast('收藏成功啦', 'success', 1400);
  } catch (e) {
    console.warn('[chat] 收藏失败', e);
    showToast('收藏失败了，再试一下嘛', 'error');
  }
}

// ── 删除 ──
function deleteMessage(msg) {
  showConfirm({
    title: '删掉这条消息吗？',
    body: '删掉就看不到啦，确定嘛？',
    confirmText: '删掉吧',
    cancelText: '不要',
    danger: true,
    onConfirm: async () => {
      try {
        await deleteDB(STORES.messages, msg.id);
        showToast('删掉啦', 'default', 1200);
        await render();
      } catch (e) {
        console.warn('[chat] 删除消息失败', e);
        showToast('没删掉，再试一下嘛', 'error');
      }
    }
  });
}

// ════════════════════════════════════════
// 聊天详情顶部 more 菜单
// ════════════════════════════════════════

export function openChatMoreMenu() {
  const state = getState();
  const session = state.currentSession;
  if (!session) return;
  const mode = getData(KEYS.chatMode, 'bubble');
  const isMuted = !!session.muted;

  const actions = [
    { key: 'mode',      label: mode === 'bubble' ? '切换为对话模式' : '切换为气泡模式', icon: 'edit',     onClick: () => toggleChatMode(mode) },
    { key: 'wallpaper', label: '聊天背景',     icon: 'camera',   onClick: () => openWallpaperSheet(session) },
    { key: 'switch',    label: '换个角色聊',   icon: 'smile',    onClick: () => openSwitchCharacterSheet(session) },
    { key: 'mute',      label: isMuted ? '取消免打扰' : '免打扰',  icon: 'moon',      onClick: () => toggleSessionMute(session, isMuted) },
    { key: 'export',    label: '导出记录',     icon: 'download', onClick: () => exportChatRecords(session) },
    { key: 'clear',     label: '清空记录',     icon: 'trash',    danger: true, onClick: () => clearChatRecords(session) }
  ];

  const body = document.createElement('div');
  body.className = 'chat-action-list';
  body.innerHTML = actions.map((a) => `
    <button class="chat-action-item ${a.danger ? 'danger' : ''}" data-key="${a.key}" role="menuitem">
      ${createIcon(a.icon, 20).outerHTML}
      <span>${escapeHTML(a.label)}</span>
    </button>
  `).join('');

  const sheet = showBottomSheet({
    title: '聊天设置',
    bodyElement: body,
    dismissible: true
  });

  body.querySelectorAll('.chat-action-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      const action = actions.find((a) => a.key === key);
      sheet.close();
      if (action && typeof action.onClick === 'function') {
        // 异步操作不阻塞菜单关闭
        Promise.resolve().then(() => action.onClick()).catch((e) => console.warn('[chat] more 菜单失败', e));
      }
    });
  });
}

// ── 切换气泡/对话模式 ──
async function toggleChatMode(curMode) {
  const next = curMode === 'bubble' ? 'dialog' : 'bubble';
  setData(KEYS.chatMode, next);
  showToast(next === 'bubble' ? '已切回气泡模式' : '已切换为对话模式，像剧本一样', 'default', 1400);
  await render();
}

// ── 换个角色聊：选角色后切换当前会话的角色，并清空当前对话 ──
function openSwitchCharacterSheet(session) {
  showConfirm({
    title: '换个角色聊？',
    body: '切换角色会清空当前对话，确定吗？',
    confirmText: '换一个',
    cancelText: '再想想',
    onConfirm: async () => {
      let characters = [];
      try { characters = await getAllDB(STORES.characters); } catch (e) {}
      // 过滤掉当前角色
      const list = characters.filter((c) => c.id !== session.characterId);
      if (!list.length) {
        showToast('暂时没有别的角色呀，去角色 App 里创建一个嘛', 'default', 1600);
        return;
      }
      const body = document.createElement('div');
      body.className = 'chat-char-list';
      body.innerHTML = list.map((c) => `
        <div class="chat-char-item" data-id="${escapeAttr(c.id)}" role="button" tabindex="0" aria-label="切换到 ${escapeAttr(c.name || c.nickname || '角色')}">
          ${renderSwitchCharAvatar(c, 44)}
          <div class="chat-char-info">
            <div class="chat-char-name">${escapeHTML(c.name || c.nickname || '未命名')}</div>
            <div class="chat-char-persona">${escapeHTML((c.persona || '还没有人设呢').slice(0, 40))}</div>
          </div>
        </div>
      `).join('');
      const sheet = showBottomSheet({
        title: '选一个角色',
        bodyElement: body,
        dismissible: true
      });
      body.querySelectorAll('.chat-char-item').forEach((item) => {
        item.addEventListener('click', async () => {
          const id = item.dataset.id;
          sheet.close();
          await switchSessionCharacter(session, id);
        });
      });
    }
  });
}

/** 切换会话角色：清空旧消息，更新 characterId，重新进入 */
async function switchSessionCharacter(session, characterId) {
  try {
    // 清空旧消息
    const all = await getAllDB(STORES.messages);
    const toDelete = all.filter((m) => m.sessionId === session.id || (!m.sessionId && m.characterId === session.characterId));
    for (const m of toDelete) {
      try { await deleteDB(STORES.messages, m.id); } catch (e) {}
    }
    // 读新角色
    const character = await getDB(STORES.characters, characterId);
    if (!character) {
      showToast('找不到这个角色呀', 'error');
      return;
    }
    // 更新会话
    const now = getNow();
    await setDB(STORES.chatSessions, session.id, {
      ...session,
      characterId,
      title: character.name || character.nickname || '聊天',
      lastMessage: '',
      lastAt: now
    });
    setData(KEYS.chatCurrentCharacter, characterId);
    showToast(`已切换到 ${character.name || character.nickname || '新角色'}，重新开始聊吧`, 'success', 1600);
    // 重新进入会话（会刷新角色缓存 + 重新渲染）
    await enterChat(session.id);
  } catch (e) {
    console.warn('[chat] 切换角色失败', e);
    showToast('切换出错了，再试一下嘛', 'error');
  }
}

function renderSwitchCharAvatar(char, size) {
  const av = char.avatar;
  if (av && isUsableImage(av)) {
    return `<div class="chat-char-avatar" style="width:${size}px;height:${size}px;background-image:${cssUrl(av)};background-size:cover;background-position:center"></div>`;
  }
  return `<div class="chat-char-avatar" style="width:${size}px;height:${size}px">${createIcon('smile', Math.round(size * 0.55)).outerHTML}</div>`;
}

// ── 切换免打扰 ──
async function toggleSessionMute(session, isMuted) {
  try {
    await setDB(STORES.chatSessions, session.id, { ...session, muted: !isMuted });
    // 同步到 state
    const state = getState();
    if (state.currentSession) state.currentSession.muted = !isMuted;
    showToast(!isMuted ? '已开启免打扰，新消息不再打扰你' : '取消免打扰啦', 'default', 1400);
    await render();
  } catch (e) {
    console.warn('[chat] 切换免打扰失败', e);
    showToast('没切换成功，再试一下嘛', 'error');
  }
}

// ════════════════════════════════════════
// 聊天背景设置（bottomSheet）
// ════════════════════════════════════════

export function openWallpaperSheet(session) {
  const cur = session.wallpaper || { url: '', opacity: 60 };
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="chat-wallpaper-form">
      <div class="chat-form-row">
        <label class="chat-form-label" for="chat-wp-url">背景图片 URL</label>
        <input class="input" id="chat-wp-url" type="text" placeholder="粘贴图片地址，或留空清除..." value="${escapeAttr(cur.url || '')}">
      </div>
      <div class="chat-form-row">
        <button class="btn block" id="chat-wp-pick" type="button">${createIcon('camera', 18).outerHTML}<span>从相册选一张</span></button>
      </div>
      <div class="chat-form-row">
        <label class="chat-form-label" for="chat-wp-opacity">
          透明度：<span id="chat-wp-opacity-val">${Number(cur.opacity ?? 60)}</span>%
        </label>
        <input id="chat-wp-opacity" type="range" min="0" max="100" value="${Number(cur.opacity ?? 60)}" step="5" aria-label="背景透明度">
      </div>
      <div class="chat-wp-preview" id="chat-wp-preview"></div>
      <div class="chat-wallpaper-actions">
        <button class="btn ghost" id="chat-wp-clear">${createIcon('trash', 18).outerHTML}<span>清除背景</span></button>
        <button class="btn primary" id="chat-wp-save">${createIcon('check', 18).outerHTML}<span>应用背景</span></button>
      </div>
    </div>
  `;

  const sheet = showBottomSheet({
    title: '聊天背景',
    bodyElement: body,
    dismissible: true
  });

  const urlInput = body.querySelector('#chat-wp-url');
  const opacityInput = body.querySelector('#chat-wp-opacity');
  const opacityVal = body.querySelector('#chat-wp-opacity-val');
  const previewEl = body.querySelector('#chat-wp-preview');

  function refreshPreview() {
    const url = urlInput.value.trim();
    const op = Number(opacityInput.value);
    opacityVal.textContent = op;
    if (url && isUsableImage(url)) {
      previewEl.style.display = '';
      previewEl.style.backgroundImage = cssUrl(url);
      previewEl.style.opacity = String(op / 100);
    } else {
      previewEl.style.display = 'none';
    }
  }
  refreshPreview();
  urlInput.addEventListener('input', refreshPreview);
  opacityInput.addEventListener('input', refreshPreview);

  // 从相册选图：压缩成 data URL 塞回 URL 输入框并刷新预览
  body.querySelector('#chat-wp-pick').addEventListener('click', async () => {
    try {
      const file = await pickImageFile();
      const dataUrl = await compressImage(file, { quality: 0.78 });
      urlInput.value = dataUrl;
      refreshPreview();
      showToast('图片选好啦，记得点应用背景哦');
    } catch (e) {
      if (e && /取消/.test(e.message || '')) return;
      showToast('图片读不出来嘛', 'error');
    }
  });

  body.querySelector('#chat-wp-clear').addEventListener('click', async () => {
    try {
      await setDB(STORES.chatSessions, session.id, { ...session, wallpaper: null });
      const state = getState();
      if (state.currentSession && state.currentSession.id === session.id) state.currentSession.wallpaper = null;
      sheet.close();
      showToast('背景已清除', 'default', 1200);
      applySessionWallpaper();
    } catch (e) {
      console.warn('[chat] 清除背景失败', e);
      showToast('没清除成功，再试一下嘛', 'error');
    }
  });

  body.querySelector('#chat-wp-save').addEventListener('click', async () => {
    const url = urlInput.value.trim();
    const op = clamp(Number(opacityInput.value) || 60, 0, 100);
    if (url && !isUsableImage(url)) {
      showToast('图片地址看起来不对呀', 'error');
      return;
    }
    try {
      const wallpaper = url ? { url, opacity: op } : null;
      await setDB(STORES.chatSessions, session.id, { ...session, wallpaper });
      const state = getState();
      if (state.currentSession && state.currentSession.id === session.id) state.currentSession.wallpaper = wallpaper;
      sheet.close();
      showToast(url ? '背景换好啦' : '已清除背景', 'success', 1200);
      applySessionWallpaper();
    } catch (e) {
      console.warn('[chat] 保存背景失败', e);
      showToast('没保存成功，再试一下嘛', 'error');
    }
  });
}

// ════════════════════════════════════════
// 导出聊天记录
// ════════════════════════════════════════

export async function exportChatRecords(session) {
  const state = getState();
  let character = null;
  try { character = await getDB(STORES.characters, session.characterId); } catch (e) {}
  const charName = character?.name || character?.nickname || '角色';

  let messages = [];
  try {
    const all = await getAllDB(STORES.messages);
    messages = all.filter((m) => m.sessionId === session.id || (!m.sessionId && m.characterId === session.characterId));
  } catch (e) {
    console.warn('[chat] 读取消息失败', e);
    showToast('消息读不出来嘛', 'error');
    return;
  }
  if (!messages.length) {
    showToast('还没有消息可以导出呀', 'default', 1400);
    return;
  }
  messages.sort((a, b) => new Date(a.timestamp || a.createdAt) - new Date(b.timestamp || b.createdAt));

  // 组 txt
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const lines = [];
  lines.push(`和 ${charName} 的聊天记录`);
  lines.push(`导出时间：${new Date().toLocaleString('zh-CN')}`);
  lines.push(`消息条数：${messages.length}`);
  lines.push('─'.repeat(28));
  messages.forEach((m) => {
    const who = m.role === 'user' ? '我' : charName;
    const t = m.timestamp || m.createdAt || '';
    const timeStr = t ? new Date(t).toLocaleString('zh-CN', { hour12: false }) : '';
    if (m.type === 'image') {
      lines.push(`[${timeStr}] ${who}：[图片]`);
    } else {
      lines.push(`[${timeStr}] ${who}：${m.content || ''}`);
    }
  });
  const txt = lines.join('\n');
  const filename = `聊天记录_${charName}_${dateStr}.txt`;
  const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
  downloadBlob(blob, filename);
  showToast('导出好啦，去下载列表里看看吧', 'success', 1600);
}

// ════════════════════════════════════════
// 清空聊天记录
// ════════════════════════════════════════

export function clearChatRecords(session) {
  showConfirm({
    title: '清空所有消息吗？',
    body: '这个会话里的全部消息都会被删掉，会话本身保留。确定嘛？',
    confirmText: '清空吧',
    cancelText: '再想想',
    danger: true,
    onConfirm: async () => {
      try {
        const all = await getAllDB(STORES.messages);
        const toDelete = all.filter((m) => m.sessionId === session.id || (!m.sessionId && m.characterId === session.characterId));
        for (const m of toDelete) {
          try { await deleteDB(STORES.messages, m.id); } catch (e) {}
        }
        // 清空 lastMessage + 草稿保留
        await setDB(STORES.chatSessions, session.id, { ...session, lastMessage: '', unread: 0 });
        showToast('清空啦，会话还在，可以重新开始聊', 'default', 1400);
        await render();
      } catch (e) {
        console.warn('[chat] 清空记录失败', e);
        showToast('没清空成功，再试一下嘛', 'error');
      }
    }
  });
}

// ════════════════════════════════════════
// 工具：escapeHTML / escapeAttr 已收拢到 ./shared-utils.js
// ════════════════════════════════════════

