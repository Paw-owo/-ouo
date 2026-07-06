// apps/chat/group/group-plus-menu.js
// 群聊 + 菜单：相册/拍照/文件/位置/名片/群成员。
// 复用 plus-content.js 的发送能力（群聊版 sendGroupRichMessage）。
// 全中文注释；不省 token；功能不阉割。

import { showBottomSheet, createIcon, registerIcon } from '../../../core/ui.js';
import { escapeHTML, escapeAttr } from '../shared-utils.js';
import { sendGroupImageMessage, sendGroupRichMessage } from './group-sending.js';
import { getState } from '../index.js';
import {
  sendShootMessage, sendFileMessage, sendLocationMessage, sendContactMessage
} from '../plus-content.js';
import { openGroupMembersSheet } from './group-members.js';

registerIcon('file', 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8');
registerIcon('location', 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z');
registerIcon('contact', 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75');
registerIcon('users', 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75');

/** 群聊 + 菜单：网格布局，提供图片/拍照/文件/位置/名片/群成员入口 */
export function openGroupPlusMenu() {
  const state = getState();
  const session = state.currentSession;
  if (!session || !session.isGroup) return;
  const body = document.createElement('div');
  body.className = 'chat-action-grid chat-plus-menu';
  const items = [
    { key: 'image',    label: '相册',   icon: 'camera',   enabled: true,  onClick: () => sendGroupImageMessage() },
    { key: 'shoot',    label: '拍照',   icon: 'camera',   enabled: true,  onClick: () => sendShootMessage({ group: true }) },
    { key: 'file',     label: '文件',   icon: 'file',     enabled: true,  onClick: () => sendFileMessage({ group: true }) },
    { key: 'location', label: '位置',   icon: 'location', enabled: true,  onClick: () => sendLocationMessage({ group: true }) },
    { key: 'contact',  label: '名片',   icon: 'contact',  enabled: true,  onClick: () => sendContactMessage({ group: true }) },
    { key: 'members',  label: '群成员', icon: 'users',    enabled: true,  onClick: () => openGroupMembersSheet(session.groupId) }
  ];
  body.innerHTML = items.map((a) => `
    <button class="chat-action-grid-item${a.enabled ? '' : ' disabled'}" data-key="${a.key}" type="button" role="menuitem"${a.enabled ? '' : ' aria-disabled="true"'}>
      <span class="chat-action-grid-icon">${createIcon(a.icon, 22).outerHTML}</span>
      <span class="chat-action-grid-label">${escapeHTML(a.label)}</span>
    </button>
  `).join('');
  const sheet = showBottomSheet({ title: '选择发送内容', bodyElement: body, dismissible: true });
  body.querySelectorAll('.chat-action-grid-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      const item = items.find((a) => a.key === key);
      if (!item) return;
      sheet.close();
      try { item.onClick(); } catch (e) { console.warn('[group] + 菜单项失败', e); }
    });
  });
}
