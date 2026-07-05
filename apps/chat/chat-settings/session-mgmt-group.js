// apps/chat/chat-settings/session-mgmt-group.js
// 「会话管理」分组——置顶/免打扰/标记已读/换角色/快捷回复编辑。
// 红线：图标只准 SVG 线稿，禁止任何 emoji 字符。
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, ./widgets.js, ../index.js

import { STORES } from '../../core/storage-keys.js';
import { getDB, setDB, getAllDB } from '../../core/storage.js';
import { createCollapsibleCard, showToast, showConfirm, showBottomSheet, createIcon } from '../../core/ui.js';
import { isUsableImage, cssUrl } from '../../core/util.js';
import bus from '../../core/events.js';
import {
  makeToggle, makeButton, makeQuickRepliesEditor, makeHintBar, makeBadge,
  makeSection, makeSectionTitle, saveChatPrefs, getChatPrefs
} from './widgets.js';
import { escapeHTML, escapeAttr } from '../shared-utils.js';

/**
 * 构建「会话管理」分组。
 * @param {object} ctx { session, character, scope, groupId, onSessionChange, onReopenChat }
 * @returns {HTMLElement}
 */
export function buildSessionMgmtGroup(ctx) {
  const { session, character, onSessionChange, onReopenChat } = ctx;
  const section = makeSection();
  section.appendChild(makeSectionTitle('会话管理'));

  if (!session) {
    section.appendChild(makeHintBar('还没有打开会话呢'));
    return section;
  }

  const ownerId = character?.id;
  const content = document.createElement('div');

  // 置顶
  content.appendChild(makeToggle({
    label: '置顶会话',
    value: !!session.pinned,
    helper: '重要的会话放最上面',
    onChange: async (v) => {
      await patchSession(session, { pinned: v });
      onSessionChange?.({ pinned: v });
      showToast(v ? '置顶好啦' : '取消置顶啦', 'default', 1200);
    }
  }));

  // 免打扰
  content.appendChild(makeToggle({
    label: '免打扰',
    value: !!session.muted,
    helper: '开启后新消息不再提示',
    onChange: async (v) => {
      await patchSession(session, { muted: v });
      onSessionChange?.({ muted: v });
      showToast(v ? '已开启免打扰' : '取消免打扰啦', 'default', 1200);
    }
  }));

  // 标记已读/未读
  content.appendChild(makeToggle({
    label: '标记为未读',
    value: (session.unread || 0) > 0,
    helper: '用来提醒自己还有没看的消息',
    onChange: async (v) => {
      await patchSession(session, { unread: v ? 1 : 0 });
      onSessionChange?.({ unread: v ? 1 : 0 });
      showToast(v ? '已标记未读' : '已标记已读', 'default', 1200);
    }
  }));

  // 换个角色聊（仅私聊）
  if (ownerId) {
    content.appendChild(makeButton({
      label: '换个角色聊', icon: 'smile', variant: 'default', block: true,
      onClick: () => openSwitchCharacterSheet(session, onReopenChat)
    }));
  }

  // ── 快捷回复编辑（折叠卡）──
  if (ownerId) {
    const prefs = getChatPrefs(ownerId);
    const qrContent = document.createElement('div');
    qrContent.appendChild(makeHintBar('点一下就能快速发送，长按可删', 'info'));
    qrContent.appendChild(makeQuickRepliesEditor(prefs.quickReplies || [], (next) => {
      saveChatPrefs(ownerId, { quickReplies: next });
    }));
    const qrCard = createCollapsibleCard('快捷回复', qrContent, {
      collapsed: true,
      icon: 'send',
      subtitle: `${(prefs.quickReplies || []).length} 条`
    });
    content.appendChild(qrCard);
  }

  // 状态徽标
  const badgeRow = document.createElement('div');
  badgeRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;padding:4px 0;';
  badgeRow.appendChild(makeBadge(session.pinned ? '已置顶' : '未置顶'));
  badgeRow.appendChild(makeBadge(session.muted ? '免打扰' : '正常提醒', session.muted ? 'warn' : 'success'));
  if ((session.unread || 0) > 0) badgeRow.appendChild(makeBadge(`${session.unread} 未读`, 'warn'));
  content.appendChild(badgeRow);

  const card = createCollapsibleCard('会话管理', content, {
    collapsed: true,
    icon: 'tag',
    subtitle: session.muted ? '免打扰' : '正常'
  });
  section.appendChild(card);
  return section;
}

// 写回 session 字段
async function patchSession(session, patch) {
  try {
    const cur = await getDB(STORES.chatSessions, session.id) || session;
    await setDB(STORES.chatSessions, session.id, { ...cur, ...patch });
    bus.emit('chat:session-updated', { sessionId: session.id, patch });
  } catch (e) {
    console.warn('[chat-settings] 更新会话失败', e);
    showToast('没存上，再试一下嘛', 'error');
  }
}

// 换角色：弹出角色选择 sheet
async function openSwitchCharacterSheet(session, onReopenChat) {
  let characters = [];
  try { characters = await getAllDB(STORES.characters); } catch (e) {}
  const list = characters.filter((c) => c.id !== session.characterId);
  if (!list.length) {
    showToast('暂时没有别的角色呀，去角色 App 里创建一个嘛', 'default', 1600);
    return;
  }
  showConfirm({
    title: '换个角色聊？',
    body: '切换角色会清空当前对话，确定吗？',
    confirmText: '换一个',
    cancelText: '再想想',
    onConfirm: () => showCharacterList(list, session, onReopenChat)
  });
}

function showCharacterList(list, session, onReopenChat) {
  const body = document.createElement('div');
  body.className = 'chat-char-list';
  body.innerHTML = list.map((c) => `
    <div class="chat-char-item" data-id="${escapeAttr(c.id)}" role="button" tabindex="0" aria-label="切换到 ${escapeAttr(c.name || c.nickname || '角色')}">
      ${renderCharAvatar(c, 44)}
      <div class="chat-char-info">
        <div class="chat-char-name">${escapeHTML(c.name || c.nickname || '未命名')}</div>
        <div class="chat-char-persona">${escapeHTML((c.persona || '还没有人设呢').slice(0, 40))}</div>
      </div>
    </div>
  `).join('');
  const sheet = showBottomSheet({ title: '选一个角色', bodyElement: body, dismissible: true });
  body.querySelectorAll('.chat-char-item').forEach((item) => {
    item.addEventListener('click', () => {
      const id = item.dataset.id;
      sheet.close();
      switchCharacter(session, id, onReopenChat);
    });
  });
}

async function switchCharacter(session, characterId, onReopenChat) {
  try {
    // 清空旧消息
    const { getAllDB, deleteDB } = await import('../../core/storage.js');
    const all = await getAllDB(STORES.messages);
    const toDelete = all.filter((m) => m.sessionId === session.id || (!m.sessionId && m.characterId === session.characterId));
    for (const m of toDelete) {
      try { await deleteDB(STORES.messages, m.id); } catch (e) {}
    }
    const character = await getDB(STORES.characters, characterId);
    if (!character) {
      showToast('找不到这个角色呀', 'error');
      return;
    }
    const now = Date.now();
    await setDB(STORES.chatSessions, session.id, {
      ...session,
      characterId,
      title: character.name || character.nickname || '聊天',
      lastMessage: '',
      lastAt: now
    });
    showToast(`已切换到 ${character.name || character.nickname || '新角色'}`, 'success', 1600);
    if (typeof onReopenChat === 'function') {
      onReopenChat(session.id);
    }
  } catch (e) {
    console.warn('[chat-settings] 切换角色失败', e);
    showToast('切换出错了，再试一下嘛', 'error');
  }
}

function renderCharAvatar(char, size) {
  const av = char.avatar;
  if (av && isUsableImage(av)) {
    return `<div class="chat-char-avatar" style="width:${size}px;height:${size}px;background-image:${cssUrl(av)};background-size:cover;background-position:center"></div>`;
  }
  return `<div class="chat-char-avatar" style="width:${size}px;height:${size}px">${createIcon('smile', Math.round(size * 0.55)).outerHTML}</div>`;
}
