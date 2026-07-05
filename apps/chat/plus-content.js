// apps/chat/plus-content.js
// + 菜单扩展：拍照 / 文件 / 位置 / 名片的真实发送实现。
// 单聊走 sending.js 的 triggerAIReply；群聊走 group-sending.js 的 sendGroupRichMessage。
// 用 opts.group 区分单聊/群聊。富字段塞 msg.meta，content 塞给 AI 看的文字描述。
// 新消息类型：file / location / contact；渲染分支在 detail-view.js / group-detail-view.js。
// 全中文注释；不省 token；功能不阉割。

import { STORES } from '../../core/storage-keys.js';
import { getDB, setDB, generateId, getNow, compressImage } from '../../core/storage.js';
import { showToast, showBottomSheet, showConfirm, createIcon, registerIcon } from '../../core/ui.js';
import { pickImageFile, isUsableImage, injectStyle } from '../../core/util.js';
import bus from '../../core/events.js';
import { isAIConfigured } from '../../js/ai/ai-client.js';
import { getState } from './index.js';
import { escapeHTML, escapeAttr } from './shared-utils.js';
import {
  sendMessage, sendImageMessage, triggerAIReply
} from './sending.js';

// 单聊富消息发送（写 STORES.messages + 渲染 + 触发 AI）
import { appendMessageEl, updateChatHeader, scrollToBottom, updateMessageStatus } from './detail-view.js';

// 群聊富消息发送
import { sendGroupRichMessage } from './group/group-sending.js';

registerIcon('file', 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8');
registerIcon('location', 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z');
registerIcon('contact', 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75');
registerIcon('camera', 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z');

// ════════════════════════════════════════
// 拍照
// ════════════════════════════════════════

/**
 * 发送拍照消息。用 <input type="file" accept="image/*" capture="environment"> 唤起相机。
 * 桌面浏览器无相机时降级为相册选择。
 * @param {object} opts { group: boolean }
 */
export async function sendShootMessage(opts = {}) {
  const file = await pickCameraFile();
  if (!file) return;
  let dataUrl = '';
  try {
    dataUrl = await compressImage(file, { maxWidth: 1620, quality: 0.82 });
  } catch (e) {
    console.warn('[plus] 拍照压缩失败', e);
    showToast('照片处理不了，换一张试试嘛', 'error');
    return;
  }
  if (opts.group) {
    await sendGroupRichMessage({
      type: 'image',
      content: '',
      meta: { mediaUrl: dataUrl },
      preview: '[拍照]'
    });
    return;
  }
  // 单聊：复用 sendImageMessage 的逻辑，但用已选的 file
  await sendSingleImage(dataUrl, '拍照');
}

// 唤起相机拍照
function pickCameraFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment'; // 优先后置摄像头
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const f = input.files && input.files[0];
      document.body.removeChild(input);
      resolve(f || null);
    }, { once: true });
    // 用户取消：change 不触发，监听 window focus 做兜底（如果还挂着说明取消了）
    setTimeout(() => {
      if (input.parentNode) {
        document.body.removeChild(input);
        resolve(null);
      }
    }, 60000);
    input.click();
  });
}

// ════════════════════════════════════════
// 文件
// ════════════════════════════════════════

/**
 * 发送文件消息。任意类型文件，转 dataUrl 落库（限制 5MB 内，避免 IndexedDB 爆）。
 * @param {object} opts { group: boolean }
 */
export async function sendFileMessage(opts = {}) {
  const file = await pickAnyFile();
  if (!file) return;
  const MAX = 5 * 1024 * 1024;
  if (file.size > MAX) {
    showToast('文件太大了（超过 5MB），换个小一点的嘛', 'default', 2000);
    return;
  }
  let dataUrl = '';
  try {
    dataUrl = await readFileAsDataURL(file);
  } catch (e) {
    console.warn('[plus] 文件读取失败', e);
    showToast('文件读不了，换一个试试嘛', 'error');
    return;
  }
  const meta = {
    mediaUrl: dataUrl,
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type
  };
  const contentForAI = `（用户发了一个文件：${file.name}，${formatFileSize(file.size)}）`;
  const preview = `[文件] ${file.name}`;
  if (opts.group) {
    await sendGroupRichMessage({
      type: 'file',
      content: contentForAI,
      meta,
      preview
    });
    return;
  }
  await sendSingleRich({
    type: 'file',
    content: contentForAI,
    meta,
    preview
  });
}

function pickAnyFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const f = input.files && input.files[0];
      document.body.removeChild(input);
      resolve(f || null);
    }, { once: true });
    setTimeout(() => {
      if (input.parentNode) {
        document.body.removeChild(input);
        resolve(null);
      }
    }, 60000);
    input.click();
  });
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

// ════════════════════════════════════════
// 位置
// ════════════════════════════════════════

/**
 * 发送当前位置消息。用 navigator.geolocation 获取经纬度。
 * 逆地理用免费 Nominatim API（OpenStreetMap），失败则只显示坐标。
 * @param {object} opts { group: boolean }
 */
export async function sendLocationMessage(opts = {}) {
  if (!navigator.geolocation) {
    showToast('这个设备不支持定位呢', 'error');
    return;
  }
  showToast('正在获取位置...', 'default', 1500);
  const pos = await new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000
    });
  }).catch((e) => {
    console.warn('[plus] 定位失败', e);
    return null;
  });
  if (!pos) {
    showToast('定位失败了，检查一下权限嘛', 'error');
    return;
  }
  const lat = pos.coords.latitude;
  const lng = pos.coords.longitude;
  // 逆地理（可选）
  let name = '我的位置';
  let addr = '';
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
      headers: { 'Accept-Language': 'zh-CN' }
    });
    if (r.ok) {
      const data = await r.json();
      if (data && data.display_name) {
        addr = data.display_name;
        name = data.name || data.address?.suburb || data.address?.city || '我的位置';
      }
    }
  } catch (e) {
    // 逆地理失败不影响发送，只显示坐标
  }
  const meta = {
    lat,
    lng,
    locationName: name,
    locationAddr: addr
  };
  const contentForAI = `（用户分享了位置：${name}${addr ? '，' + addr : ''}，坐标 ${lat.toFixed(5)},${lng.toFixed(5)}）`;
  const preview = `[位置] ${name}`;
  if (opts.group) {
    await sendGroupRichMessage({
      type: 'location',
      content: contentForAI,
      meta,
      preview
    });
    return;
  }
  await sendSingleRich({
    type: 'location',
    content: contentForAI,
    meta,
    preview
  });
}

// ════════════════════════════════════════
// 名片
// ════════════════════════════════════════

/**
 * 发送角色名片。弹角色选择面板，选一个角色生成名片消息。
 * @param {object} opts { group: boolean, excludeId?: string }
 */
export async function sendContactMessage(opts = {}) {
  const { pickCharacters } = await import('./group/create-group.js');
  const excludeIds = opts.excludeId ? [opts.excludeId] : [];
  const picked = await pickCharacters({
    title: '选一张名片',
    excludeIds,
    minSelect: 1,
    confirmText: '发送名片'
  });
  if (!picked || !picked.length) return;
  let char = null;
  try { char = await getDB(STORES.characters, picked[0]); } catch (e) {}
  if (!char) {
    showToast('找不到这个角色呀', 'error');
    return;
  }
  const meta = {
    contactId: char.id,
    contactName: char.name || char.nickname || '未命名',
    contactAvatar: char.avatar || '',
    contactDesc: (char.persona || '').slice(0, 50) || '点击查看资料'
  };
  const contentForAI = `（用户分享了一张名片：${meta.contactName}，${meta.contactDesc}）`;
  const preview = `[名片] ${meta.contactName}`;
  if (opts.group) {
    await sendGroupRichMessage({
      type: 'contact',
      content: contentForAI,
      meta,
      preview
    });
    return;
  }
  await sendSingleRich({
    type: 'contact',
    content: contentForAI,
    meta,
    preview
  });
}

// ════════════════════════════════════════
// 单聊富消息发送（写 STORES.messages + 渲染 + 触发 AI）
// ════════════════════════════════════════

async function sendSingleRich({ type, content, meta, preview }) {
  const state = getState();
  if (state.isReplying) {
    showToast('等她回完再发嘛', 'default', 1400);
    return;
  }
  const session = state.currentSession;
  if (!session) return;
  const userMsg = {
    id: generateId('msg'),
    sessionId: session.id,
    characterId: session.characterId,
    role: 'user',
    content,
    type,
    ...meta,
    status: 'sending',
    timestamp: getNow()
  };
  appendMessageEl(userMsg);
  updateChatHeader(userMsg.timestamp);
  scrollToBottom();
  try {
    await setDB(STORES.messages, userMsg.id, userMsg);
    userMsg.status = 'sent';
    try { await setDB(STORES.messages, userMsg.id, userMsg); } catch (e) {}
    updateMessageStatus(userMsg.id, 'sent');
  } catch (e) {
    console.warn('[plus] 保存富消息失败', e);
    userMsg.status = 'failed';
    try { await setDB(STORES.messages, userMsg.id, userMsg); } catch (e2) {}
    updateMessageStatus(userMsg.id, 'failed', userMsg);
    showToast('没发出去，再试一下嘛', 'error');
    return;
  }
  // 更新会话
  await bumpSingleSession(session, preview, userMsg.timestamp);
  bus.emit('chat:user-message', {
    characterId: session.characterId,
    sessionId: session.id,
    preview
  });
  // 触发 AI 回复
  await triggerAIReply(userMsg);
}

// 单聊图片发送（拍照复用）
async function sendSingleImage(dataUrl, label) {
  const state = getState();
  if (state.isReplying) {
    showToast('等她回完再发图片嘛', 'default', 1400);
    return;
  }
  const session = state.currentSession;
  if (!session) return;
  const userMsg = {
    id: generateId('msg'),
    sessionId: session.id,
    characterId: session.characterId,
    role: 'user',
    content: '',
    type: 'image',
    mediaUrl: dataUrl,
    status: 'sending',
    timestamp: getNow()
  };
  appendMessageEl(userMsg);
  updateChatHeader(userMsg.timestamp);
  scrollToBottom();
  try {
    await setDB(STORES.messages, userMsg.id, userMsg);
    userMsg.status = 'sent';
    try { await setDB(STORES.messages, userMsg.id, userMsg); } catch (e) {}
    updateMessageStatus(userMsg.id, 'sent');
  } catch (e) {
    userMsg.status = 'failed';
    try { await setDB(STORES.messages, userMsg.id, userMsg); } catch (e2) {}
    updateMessageStatus(userMsg.id, 'failed', userMsg);
    showToast(`${label}没发出去，再试一下嘛`, 'error');
    return;
  }
  await bumpSingleSession(session, `[${label}]`, userMsg.timestamp);
  await triggerAIReply(userMsg);
}

// 单聊会话 lastMessage 更新
async function bumpSingleSession(sess, preview, timestamp) {
  const state = getState();
  try {
    const cur = await getDB(STORES.chatSessions, sess.id) || sess;
    const nextUnread = (state.view === 'chat' && state.currentSessionId === sess.id) ? 0 : (cur.unread || 0);
    await setDB(STORES.chatSessions, sess.id, {
      ...cur,
      lastMessage: preview,
      lastAt: timestamp,
      unread: nextUnread
    });
    if (state.currentSessionId === sess.id) {
      state.currentSession = { ...cur, lastMessage: preview, lastAt: timestamp, unread: nextUnread };
    }
  } catch (e) {
    console.warn('[plus] 更新会话失败', e);
  }
}

// ════════════════════════════════════════
// 富消息气泡渲染（file / location / contact）
// detail-view.js 和 group-detail-view.js 都用这套，避免重复
// ════════════════════════════════════════

/** 文件气泡 HTML */
export function renderFileBubble(msg) {
  const name = escapeHTML(msg.fileName || msg.content || '文件');
  const size = msg.fileSize ? formatFileSize(msg.fileSize) : '';
  const url = escapeAttr(msg.mediaUrl || '');
  return `<div class="chat-file-card" data-url="${url}" role="button" tabindex="0" aria-label="下载文件">
    <div class="chat-file-icon">${createIcon('file', 22).outerHTML}</div>
    <div class="chat-file-info">
      <div class="chat-file-name">${name}</div>
      <div class="chat-file-meta">${size} · 点击下载</div>
    </div>
  </div>`;
}

/** 位置气泡 HTML */
export function renderLocationBubble(msg) {
  const name = escapeHTML(msg.locationName || msg.content || '我的位置');
  const addr = escapeHTML(msg.locationAddr || '');
  const lat = msg.lat || 0;
  const lng = msg.lng || 0;
  return `<div class="chat-location-card" data-lat="${escapeAttr(lat)}" data-lng="${escapeAttr(lng)}" data-name="${escapeAttr(msg.locationName || '')}" role="button" tabindex="0" aria-label="查看位置">
    <div class="chat-location-name">${createIcon('location', 16).outerHTML}<span>${name}</span></div>
    ${addr ? `<div class="chat-location-addr">${addr}</div>` : ''}
    <div class="chat-location-coord">${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}</div>
  </div>`;
}

/** 名片气泡 HTML */
export function renderContactBubble(msg) {
  const name = escapeHTML(msg.contactName || '名片');
  const desc = escapeHTML(msg.contactDesc || '点击查看资料');
  const avatar = msg.contactAvatar;
  const avatarHTML = (avatar && isUsableImage(avatar))
    ? `<div class="chat-contact-avatar" style="background-image:${cssUrlAttr(avatar)}"></div>`
    : `<div class="chat-contact-avatar">${createIcon('smile', 22).outerHTML}</div>`;
  return `<div class="chat-contact-card" data-contact-id="${escapeAttr(msg.contactId || '')}" role="button" tabindex="0" aria-label="查看名片">
    ${avatarHTML}
    <div class="chat-contact-info">
      <div class="chat-contact-name">${name}</div>
      <div class="chat-contact-desc">${desc}</div>
    </div>
  </div>`;
}

/** cssUrl 兜底（plus-content.js 没从 util import cssUrl，这里包一层） */
function cssUrlAttr(url) {
  if (!url) return 'none';
  return `url("${String(url).replace(/"/g, '\\"')}")`;
}

/** 绑定富消息交互（文件下载 / 位置查看 / 名片跳转） */
export function bindRichBubble(el, msg) {
  if (!el) return;
  const fileCard = el.querySelector('.chat-file-card');
  if (fileCard) {
    fileCard.addEventListener('click', (e) => {
      e.stopPropagation();
      const url = fileCard.dataset.url;
      if (!url) return;
      try {
        const a = document.createElement('a');
        a.href = url;
        a.download = msg.fileName || 'file';
        a.click();
      } catch (e) { showToast('下载不了呢', 'error'); }
    });
  }
  const locCard = el.querySelector('.chat-location-card');
  if (locCard) {
    locCard.addEventListener('click', (e) => {
      e.stopPropagation();
      const lat = parseFloat(locCard.dataset.lat);
      const lng = parseFloat(locCard.dataset.lng);
      if (isNaN(lat) || isNaN(lng)) return;
      const url = `https://www.google.com/maps?q=${lat},${lng}`;
      window.open(url, '_blank');
    });
  }
  const contactCard = el.querySelector('.chat-contact-card');
  if (contactCard) {
    contactCard.addEventListener('click', async (e) => {
      e.stopPropagation();
      const cid = contactCard.dataset.contactId;
      if (!cid) return;
      try {
        const { openApp } = await import('../../core/router.js');
        openApp('characters', { characterId: cid });
      } catch (e) { showToast('打开不了名片呢', 'error'); }
    });
  }
}

/** 注入富消息样式（detail-view.js / group-detail-view.js 启动时调一次） */
let _richStyleInjected = false;
export function ensureRichBubbleStyle() {
  if (_richStyleInjected) return;
  injectStyle('app-chat-rich-bubbles', `
    .chat-file-card{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:var(--radius-sm);background:color-mix(in srgb,var(--bg-secondary) 60%,transparent);border:1px solid color-mix(in srgb,var(--text-hint) 14%,transparent);cursor:pointer;transition:var(--motion);min-width:200px}
    .chat-file-card:active{transform:scale(var(--press-scale))}
    .chat-file-icon{width:40px;height:40px;border-radius:var(--radius-sm);background:color-mix(in srgb,var(--accent) 14%,transparent);display:flex;align-items:center;justify-content:center;color:var(--accent-dark);flex-shrink:0}
    .chat-file-info{flex:1;min-width:0}
    .chat-file-name{font-size:var(--font-size-base);color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .chat-file-meta{font-size:var(--font-size-small);color:var(--text-hint);margin-top:2px}
    .chat-location-card{padding:10px 12px;border-radius:var(--radius-sm);background:color-mix(in srgb,var(--accent) 8%,var(--bg-card));border:1px solid color-mix(in srgb,var(--accent) 24%,transparent);cursor:pointer;min-width:200px}
    .chat-location-name{font-size:var(--font-size-base);color:var(--text-primary);font-weight:500;display:flex;align-items:center;gap:6px}
    .chat-location-addr{font-size:var(--font-size-small);color:var(--text-hint);margin-top:4px}
    .chat-location-coord{font-size:11px;color:var(--text-hint);margin-top:2px;font-family:var(--font-mono,ui-monospace,monospace)}
    .chat-contact-card{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:var(--radius-sm);background:color-mix(in srgb,var(--bg-secondary) 60%,transparent);border:1px solid color-mix(in srgb,var(--text-hint) 14%,transparent);cursor:pointer;transition:var(--motion);min-width:200px}
    .chat-contact-card:active{transform:scale(var(--press-scale))}
    .chat-contact-avatar{width:40px;height:40px;border-radius:50%;background-size:cover;background-position:center;background-color:color-mix(in srgb,var(--text-hint) 18%,transparent);display:flex;align-items:center;justify-content:center;color:var(--text-hint);flex-shrink:0;overflow:hidden}
    .chat-contact-info{flex:1;min-width:0}
    .chat-contact-name{font-size:var(--font-size-base);color:var(--text-primary);font-weight:500}
    .chat-contact-desc{font-size:var(--font-size-small);color:var(--text-hint);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  `);
  _richStyleInjected = true;
}

// ════════════════════════════════════════
// 工具
// ════════════════════════════════════════

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}
