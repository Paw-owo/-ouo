// apps/chat/chat-settings/records-group.js
// 「聊天记录」分组——导出（txt/json/md）、清空记录。
// 红线：图标只准 SVG 线稿，禁止任何 emoji 字符。
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, ./widgets.js

import { STORES } from '../../../core/storage-keys.js';
import { getDB, getAllDB, deleteDB } from '../../../core/storage.js';
import { createCollapsibleCard, showToast, showConfirm, createIcon } from '../../../core/ui.js';
import { downloadBlob } from '../../../core/util.js';
import bus from '../../../core/events.js';
import {
  makeButton, makeHintBar, makeBadge, makeSection, makeSectionTitle
} from './widgets.js';
import { escapeHTML } from '../shared-utils.js';

/**
 * 构建「聊天记录」分组。
 * @param {object} ctx { session, character, scope, groupId, onRecordsChange }
 * @returns {HTMLElement}
 */
export function buildRecordsGroup(ctx) {
  const { session, character, scope = 'chat', groupId, onRecordsChange } = ctx;
  const section = makeSection();
  section.appendChild(makeSectionTitle('聊天记录'));

  if (!session) {
    section.appendChild(makeHintBar('还没有打开会话呢'));
    return section;
  }

  const content = document.createElement('div');

  // 统计
  const statBox = document.createElement('div');
  statBox.className = 'cs-field';
  statBox.style.cssText = 'flex-direction:row;justify-content:space-between;align-items:center;';
  statBox.innerHTML = `
    <span style="color:var(--text-tertiary,#8e8e93);font-size:14px;">消息总数</span>
    <span id="cs-records-count" style="font-size:17px;font-weight:600;">统计中...</span>
  `;
  content.appendChild(statBox);

  // 异步统计
  refreshCount(statBox, session, scope, groupId);

  // 导出按钮组
  const exportRow = document.createElement('div');
  exportRow.className = 'cs-btn-row';
  exportRow.style.marginTop = '8px';
  exportRow.appendChild(makeButton({
    label: '导出 TXT', icon: 'download',
    onClick: () => exportRecords(session, 'txt', scope, groupId)
  }));
  exportRow.appendChild(makeButton({
    label: '导出 JSON', icon: 'download',
    onClick: () => exportRecords(session, 'json', scope, groupId)
  }));
  exportRow.appendChild(makeButton({
    label: '导出 Markdown', icon: 'download',
    onClick: () => exportRecords(session, 'md', scope, groupId)
  }));
  content.appendChild(exportRow);

  // 清空记录
  content.appendChild(makeButton({
    label: '清空本会话记录', icon: 'trash', variant: 'danger', block: true,
    onClick: () => confirmClearRecords(session, scope, groupId, async () => {
      await refreshCount(statBox, session, scope, groupId);
      onRecordsChange?.();
    })
  }));

  const card = createCollapsibleCard('聊天记录', content, {
    collapsed: true,
    icon: 'memo',
    subtitle: '导出 / 清空'
  });
  section.appendChild(card);
  return section;
}

// 刷新统计数字
async function refreshCount(statBox, session, scope, groupId) {
  try {
    const messages = await loadMessages(session, scope, groupId);
    const countEl = statBox.querySelector('#cs-records-count');
    if (countEl) {
      countEl.textContent = `${messages.length} 条`;
    }
  } catch (e) {
    console.warn('[chat-settings] 统计消息失败', e);
  }
}

// 加载本会话消息
async function loadMessages(session, scope, groupId) {
  // 群聊消息存在独立的 STORES.groupMessages 里（按 groupId 隔离）
  if (scope === 'group' && groupId) {
    let groupMsgs = [];
    try { groupMsgs = await getAllDB(STORES.groupMessages); } catch (e) {}
    return groupMsgs
      .filter((m) => m.groupId === groupId)
      .sort((a, b) => new Date(a.timestamp || a.createdAt) - new Date(b.timestamp || b.createdAt));
  }
  const all = await getAllDB(STORES.messages);
  return all
    .filter((m) => m.sessionId === session.id || (!m.sessionId && m.characterId === session.characterId))
    .sort((a, b) => new Date(a.timestamp || a.createdAt) - new Date(b.timestamp || b.createdAt));
}

// 导出
async function exportRecords(session, format, scope, groupId) {
  try {
    const messages = await loadMessages(session, scope, groupId);
    if (!messages.length) {
      showToast('还没有消息可以导出呀', 'default', 1400);
      return;
    }
    let charName = '聊天';
    if (session.characterId) {
      try {
        const c = await getDB(STORES.characters, session.characterId);
        if (c) charName = c.name || c.nickname || charName;
      } catch (e) {}
    }
    const title = scope === 'group' ? (session.title || '群聊') : charName;
    const date = new Date();
    const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    let blob, filename;
    if (format === 'json') {
      const payload = {
        title, scope, exportedAt: date.toISOString(),
        session: { id: session.id, characterId: session.characterId, groupId: groupId || null },
        messages
      };
      blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      filename = `${title}_${dateStr}.json`;
    } else if (format === 'md') {
      blob = new Blob([toMarkdown(title, messages, scope)], { type: 'text/markdown;charset=utf-8' });
      filename = `${title}_${dateStr}.md`;
    } else {
      blob = new Blob([toText(title, messages, scope)], { type: 'text/plain;charset=utf-8' });
      filename = `${title}_${dateStr}.txt`;
    }
    downloadBlob(blob, filename);
    showToast(`导出好啦，${messages.length} 条`, 'success', 1600);
  } catch (e) {
    console.warn('[chat-settings] 导出失败', e);
    showToast('导出失败了，再试一下嘛', 'error');
  }
}

function toText(title, messages, scope) {
  const lines = [`# ${title} 聊天记录`, `导出时间：${new Date().toLocaleString()}`, ''];
  messages.forEach((m) => {
    const time = formatDate(m.timestamp || m.createdAt);
    const speaker = speakerOf(m, scope);
    let body = m.content || '';
    if (m.type === 'image') body = '[图片]';
    if (m.type === 'voice' || m.type === 'audio') body = `[语音 ${m.duration || ''}"]`;
    if (m.type === 'file') body = `[文件] ${m.fileName || ''}`;
    if (m.type === 'location') body = `[位置] ${m.locationName || ''}`;
    if (m.type === 'contact') body = `[名片] ${m.contactName || ''}`;
    if (m.recalled) body = '[已撤回]';
    if (m.quote) body = `（引用：${m.quote}）${body}`;
    lines.push(`[${time}] ${speaker}：${body}`);
  });
  return lines.join('\n');
}

function toMarkdown(title, messages, scope) {
  const lines = [`# ${title}`, `> 导出时间：${new Date().toLocaleString()}`, ''];
  messages.forEach((m) => {
    const time = formatDate(m.timestamp || m.createdAt);
    const speaker = speakerOf(m, scope);
    let body = m.content || '';
    if (m.type === 'image') body = '![图片](' + (m.mediaUrl || '') + ')';
    if (m.type === 'voice' || m.type === 'audio') body = `[语音 ${m.duration || ''}"]`;
    if (m.type === 'file') body = `[文件] ${m.fileName || ''}`;
    if (m.type === 'location') body = `[位置] ${m.locationName || ''}`;
    if (m.type === 'contact') body = `[名片] ${m.contactName || ''}`;
    if (m.recalled) body = '_已撤回_';
    lines.push(`### ${speaker} _${time}_`);
    lines.push('');
    lines.push(body);
    lines.push('');
  });
  return lines.join('\n');
}

// 发言人名称：群聊用 senderName，单聊用"我"/"她"
function speakerOf(m, scope) {
  if (scope === 'group') {
    if (m.role === 'user') return '我';
    if (m.role === 'system') return '系统';
    return m.senderName || m.role || '成员';
  }
  if (m.role === 'user') return '我';
  if (m.role === 'assistant') return '她';
  return m.role || '未知';
}

function formatDate(ts) {
  if (!ts) return '未知时间';
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return String(ts);
    return d.toLocaleString();
  } catch (e) {
    return String(ts);
  }
}

// 确认清空
function confirmClearRecords(session, scope, groupId, onDone) {
  showConfirm({
    title: '清空本会话记录吗？',
    body: '所有消息都会删掉，没法恢复哦，确定嘛？',
    confirmText: '清空吧',
    cancelText: '不要',
    danger: true,
    onConfirm: async () => {
      try {
        const messages = await loadMessages(session, scope, groupId);
        // 群聊消息在 STORES.groupMessages，单聊在 STORES.messages
        const storeName = (scope === 'group' && groupId) ? STORES.groupMessages : STORES.messages;
        for (const m of messages) {
          try { await deleteDB(storeName, m.id); } catch (e) {}
        }
        // 更新会话 lastMessage
        try {
          const { setDB } = await import('../../core/storage.js');
          const cur = await getDB(STORES.chatSessions, session.id) || session;
          await setDB(STORES.chatSessions, session.id, { ...cur, lastMessage: '', lastAt: Date.now() });
        } catch (e) {}
        bus.emit('chat:records-cleared', { sessionId: session.id, scope, groupId });
        showToast('记录已清空', 'default', 1200);
        await onDone();
      } catch (e) {
        console.warn('[chat-settings] 清空失败', e);
        showToast('清空出错了，再试一下嘛', 'error');
      }
    }
  });
}
