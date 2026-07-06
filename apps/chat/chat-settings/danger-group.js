// apps/chat/chat-settings/danger-group.js
// 「危险操作」分组——删除会话、清空该角色/群的记忆、重置偏好。
// 红线：图标只准 SVG 线稿，禁止任何 emoji 字符；所有操作都要二次确认。
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, ./widgets.js, ../../core/memory.js

import { STORES, KEYS } from '../../../core/storage-keys.js';
import { getDB, setDB, getAllDB, deleteDB } from '../../../core/storage.js';
import { createCollapsibleCard, showToast, showConfirm } from '../../../core/ui.js';
import { removeData } from '../../../core/storage.js';
import bus from '../../../core/events.js';
import {
  makeButton, makeHintBar, makeBadge, makeSection, makeSectionTitle
} from './widgets.js';

/**
 * 构建「危险操作」分组。
 * @param {object} ctx { session, character, scope, groupId, onDeleteSession, onResetPrefs }
 * @returns {HTMLElement}
 */
export function buildDangerGroup(ctx) {
  const { session, character, scope = 'chat', groupId, onDeleteSession, onResetPrefs } = ctx;
  const section = makeSection();
  section.appendChild(makeSectionTitle('危险操作'));

  const ownerId = scope === 'group' ? groupId : character?.id;

  const content = document.createElement('div');
  content.appendChild(makeHintBar(
    '这些操作不可撤销，想清楚再点哦',
    'danger'
  ));

  // 清空该角色/群的记忆
  if (ownerId) {
    content.appendChild(makeButton({
      label: scope === 'group' ? '清空本群 AI 记忆' : '清空本角色 AI 记忆',
      icon: 'trash', variant: 'danger', block: true,
      onClick: () => confirmClearMemory(ownerId, scope)
    }));
  }

  // 重置偏好
  if (ownerId) {
    content.appendChild(makeButton({
      label: '重置本会话偏好设置',
      icon: 'refresh', variant: 'danger', block: true,
      onClick: () => confirmResetPrefs(ownerId, onResetPrefs)
    }));
  }

  // 删除整个会话
  if (session) {
    content.appendChild(makeButton({
      label: '删除整个会话',
      icon: 'trash', variant: 'danger', block: true,
      onClick: () => confirmDeleteSession(session, onDeleteSession)
    }));
  }

  // 状态徽标
  const badgeRow = document.createElement('div');
  badgeRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;padding:4px 0;';
  badgeRow.appendChild(makeBadge('谨慎操作', 'danger'));
  content.appendChild(badgeRow);

  const card = createCollapsibleCard('危险操作', content, {
    collapsed: true,
    icon: 'alert',
    subtitle: '删除 / 清空 / 重置'
  });
  section.appendChild(card);
  return section;
}

// 清空记忆
function confirmClearMemory(ownerId, scope) {
  showConfirm({
    title: scope === 'group' ? '清空本群 AI 记忆吗？' : '清空本角色 AI 记忆吗？',
    body: 'AI 对你们之前互动的记忆都会消失，她会"忘记"很多事情。确定嘛？',
    confirmText: '清空吧',
    cancelText: '不要',
    danger: true,
    onConfirm: async () => {
      try {
        await clearMemoriesFor(ownerId, scope);
        showToast('记忆已清空', 'default', 1200);
      } catch (e) {
        console.warn('[chat-settings] 清空记忆失败', e);
        showToast('清空出错了，再试一下嘛', 'error');
      }
    }
  });
}

// 调用 core/memory.js 的清空函数
async function clearMemoriesFor(ownerId, scope) {
  try {
    const mem = await import('../../core/memory.js');
    if (scope === 'group' && typeof mem.clearGroupMemories === 'function') {
      await mem.clearGroupMemories(ownerId);
      bus.emit('chat:memory-cleared', { scope: 'group', groupId: ownerId });
      return;
    }
    // 私聊：只删 scope='character' 且 ownerId 匹配的记忆。
    // 修复：原版用 r.ownerId === ownerId || r.characterId === ownerId，
    // 群记忆写入时 characterId=replier.id，如果 replier.id === ownerId（角色清自己记忆），
    // 会把该角色在群里写的群记忆也删掉。必须按 scope 严格过滤。
    const all = await getAllDB(STORES.memories);
    const toDelete = all.filter((r) => {
      const s = r.scope || 'character';
      if (s !== 'character') return false; // group / global 不在这里删
      const owner = r.ownerId || r.characterId;
      return owner === ownerId;
    });
    for (const r of toDelete) {
      try { await deleteDB(STORES.memories, r.id); } catch (e) {}
    }
    // 失效该角色缓存
    if (typeof mem.invalidateCache === 'function') mem.invalidateCache(ownerId);
    bus.emit('chat:memory-cleared', { scope: 'character', ownerId });
  } catch (e) {
    // memory.js 不可用时直接按 store 删（兜底，仍按 scope 过滤）
    const all = await getAllDB(STORES.memories);
    const toDelete = all.filter((r) => {
      const s = r.scope || 'character';
      if (scope === 'group') {
        return s === 'group' && (r.ownerId === ownerId || r.groupId === ownerId);
      }
      return s === 'character' && (r.ownerId === ownerId || r.characterId === ownerId);
    });
    for (const r of toDelete) {
      try { await deleteDB(STORES.memories, r.id); } catch (e) {}
    }
    bus.emit('chat:memory-cleared', { scope, ownerId });
  }
}

// 重置偏好
function confirmResetPrefs(ownerId, onResetPrefs) {
  showConfirm({
    title: '重置本会话偏好吗？',
    body: '字号、模式、快捷回复、AI 调试参数都会恢复默认，确定嘛？',
    confirmText: '重置吧',
    cancelText: '不要',
    danger: true,
    onConfirm: () => {
      try {
        removeData(KEYS.chatConfig(ownerId));
        bus.emit('chat:prefs-reset', { ownerId });
        showToast('偏好已重置', 'default', 1200);
        if (typeof onResetPrefs === 'function') onResetPrefs();
      } catch (e) {
        console.warn('[chat-settings] 重置偏好失败', e);
        showToast('重置出错了，再试一下嘛', 'error');
      }
    }
  });
}

// 删除整个会话
function confirmDeleteSession(session, onDeleteSession) {
  showConfirm({
    title: '删除整个会话吗？',
    body: '会话和里面所有消息、记忆都会一起删掉，没法恢复哦，确定嘛？',
    confirmText: '删掉吧',
    cancelText: '再想想',
    danger: true,
    onConfirm: async () => {
      try {
        const isGroup = !!session.isGroup;
        const groupId = session.groupId;
        if (isGroup && groupId) {
          // 群聊：删 STORES.groupMessages（按 groupId 过滤）
          let groupMsgs = [];
          try { groupMsgs = await getAllDB(STORES.groupMessages); } catch (e) {}
          const groupToDelete = groupMsgs.filter((m) => m.groupId === groupId);
          for (const m of groupToDelete) {
            try { await deleteDB(STORES.groupMessages, m.id); } catch (e) {}
          }
          // 清群记忆（scope='group'）
          try {
            const mem = await import('../../core/memory.js');
            if (typeof mem.clearGroupMemories === 'function') {
              await mem.clearGroupMemories(groupId);
            }
          } catch (e) {}
          // 清群配置 + 群快捷回复
          try {
            removeData(KEYS.groupConfig(groupId));
            removeData(KEYS.groupQuickReplies(groupId));
          } catch (e) {}
        } else {
          // 单聊：删 STORES.messages
          const all = await getAllDB(STORES.messages);
          const toDelete = all.filter((m) =>
            m.sessionId === session.id ||
            (!m.sessionId && m.characterId === session.characterId)
          );
          for (const m of toDelete) {
            try { await deleteDB(STORES.messages, m.id); } catch (e) {}
          }
        }
        // 删会话本身
        await deleteDB(STORES.chatSessions, session.id);
        bus.emit('chat:session-deleted', { sessionId: session.id, isGroup, groupId });
        showToast(isGroup ? '群聊已删掉' : '会话已删掉', 'default', 1200);
        if (typeof onDeleteSession === 'function') onDeleteSession();
      } catch (e) {
        console.warn('[chat-settings] 删除会话失败', e);
        showToast('删除出错了，再试一下嘛', 'error');
      }
    }
  });
}
