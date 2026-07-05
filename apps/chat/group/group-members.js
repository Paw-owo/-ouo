// apps/chat/group/group-members.js
// 群成员管理：列表 / 加人 / 踢人 / 改群昵称 / 群公告。
// 成员信息存在 session.participants 里，改动后写回 STORES.chatSessions。
// 全中文注释；不省 token；功能不阉割。

import { STORES } from '../../core/storage-keys.js';
import { getDB, setDB, getAllDB } from '../../core/storage.js';
import { showToast, showConfirm, showBottomSheet, createIcon, registerIcon } from '../../core/ui.js';
import { isUsableImage, cssUrl, injectStyle } from '../../core/util.js';
import { escapeHTML, escapeAttr } from '../shared-utils.js';
import { getState } from '../index.js';
import { pickCharacters } from './create-group.js';
import { refreshGroupHeader } from './group-detail-view.js';
import bus from '../../core/events.js';

registerIcon('users', 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75');
registerIcon('plus', 'M12 5v14 M5 12h14');
registerIcon('minus', 'M5 12h14');
registerIcon('edit', 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z');

injectStyle('app-chat-group-members', `
  .gm-wrap{padding:4px 0}
  .gm-list{display:flex;flex-direction:column;gap:2px}
  .gm-item{display:flex;align-items:center;gap:12px;padding:10px 8px;border-radius:var(--radius-sm);cursor:pointer;transition:var(--motion)}
  .gm-item:active{transform:scale(var(--press-scale))}
  .gm-avatar{width:44px;height:44px;border-radius:50%;background-size:cover;background-position:center;background-color:color-mix(in srgb,var(--text-hint) 18%,transparent);display:flex;align-items:center;justify-content:center;color:var(--text-hint);flex-shrink:0;overflow:hidden}
  .gm-info{flex:1;min-width:0}
  .gm-name{font-size:var(--font-size-base);color:var(--text-primary);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .gm-role{font-size:var(--font-size-small);color:var(--accent);margin-top:2px}
  .gm-actions{display:flex;gap:6px;flex-shrink:0}
  .gm-actions button{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--text-hint) 14%,transparent);color:var(--text-secondary);border:none;cursor:pointer;transition:var(--motion)}
  .gm-actions button:active{transform:scale(var(--press-scale))}
  .gm-actions button.danger{background:color-mix(in srgb,var(--danger) 16%,transparent);color:var(--danger)}
  .gm-add-row{display:flex;align-items:center;gap:12px;padding:12px 8px;border-radius:var(--radius-sm);cursor:pointer;border:1.5px dashed color-mix(in srgb,var(--accent) 40%,transparent);margin-top:8px}
  .gm-add-icon{width:44px;height:44px;border-radius:50%;background:color-mix(in srgb,var(--accent) 14%,transparent);display:flex;align-items:center;justify-content:center;color:var(--accent-dark);flex-shrink:0}
  .gm-add-text{color:var(--accent);font-size:var(--font-size-base);font-weight:500}
  .gm-announce{margin:8px 0;padding:12px;border-radius:var(--radius-md);background:color-mix(in srgb,var(--bg-secondary) 60%,transparent);border:1px solid color-mix(in srgb,var(--text-hint) 14%,transparent)}
  .gm-announce-title{font-size:var(--font-size-small);color:var(--text-hint);margin-bottom:6px;display:flex;align-items:center;gap:6px}
  .gm-announce-text{font-size:var(--font-size-base);color:var(--text-primary);line-height:1.5;white-space:pre-wrap;word-break:break-word}
  .gm-announce-empty{color:var(--text-hint);font-size:var(--font-size-small)}
`);

/**
 * 打开群成员管理面板。
 * @param {string} groupId
 */
export async function openGroupMembersSheet(groupId) {
  if (!groupId) return;
  const session = await findGroupSession(groupId);
  if (!session) {
    showToast('群不见了，可能被删了', 'error');
    return;
  }
  const body = document.createElement('div');
  body.className = 'gm-wrap';
  await renderMembersList(body, session);
  const sheet = showBottomSheet({
    title: `群成员（${(session.participants || []).length}）`,
    bodyElement: body,
    dismissible: true
  });
  // 把 sheet 引用挂到 body 上，方便子函数刷新
  body._sheet = sheet;
  body._groupId = groupId;
}

async function renderMembersList(container, session) {
  const participants = session.participants || [];
  const ownerId = session.owner;
  container.innerHTML = `
    ${renderAnnouncement(session)}
    <div class="gm-list">
      ${participants.map((p) => `
        <div class="gm-item" data-id="${escapeAttr(p.id)}">
          <div class="gm-avatar ${p.avatar && isUsableImage(p.avatar) ? '' : 'empty'}" style="${p.avatar && isUsableImage(p.avatar) ? `background-image:${cssUrl(p.avatar)}` : ''}">
            ${(!p.avatar || !isUsableImage(p.avatar)) ? createIcon('smile', 24).outerHTML : ''}
          </div>
          <div class="gm-info">
            <div class="gm-name">${escapeHTML(p.name || '未命名')}</div>
            ${p.id === ownerId ? `<div class="gm-role">群主</div>` : ''}
          </div>
          <div class="gm-actions">
            <button class="gm-edit" data-id="${escapeAttr(p.id)}" aria-label="改昵称">${createIcon('edit', 16).outerHTML}</button>
            ${participants.length > 2 && p.id !== ownerId ? `<button class="gm-kick danger" data-id="${escapeAttr(p.id)}" aria-label="移出群聊">${createIcon('minus', 16).outerHTML}</button>` : ''}
          </div>
        </div>
      `).join('')}
    </div>
    <div class="gm-add-row" id="gm-add" role="button" tabindex="0" aria-label="邀请成员">
      <div class="gm-add-icon">${createIcon('plus', 22).outerHTML}</div>
      <div class="gm-add-text">邀请成员进群</div>
    </div>
  `;

  // 邀请成员
  container.querySelector('#gm-add').addEventListener('click', async () => {
    const excludeIds = participants.map((p) => p.id);
    const picked = await pickCharacters({
      title: '邀请成员进群',
      excludeIds,
      minSelect: 1,
      confirmText: '邀请'
    });
    if (!picked || !picked.length) return;
    await addMembers(session, picked);
    // 刷新面板
    const fresh = await findGroupSession(session.groupId);
    if (fresh) {
      await renderMembersList(container, fresh);
      const sheet = container._sheet;
      // 更新标题
      const titleEl = sheet?.querySelector?.('.popo-sheet-title');
      if (titleEl) titleEl.textContent = `群成员（${(fresh.participants || []).length}）`;
    }
    await refreshGroupHeader();
  });

  // 改昵称
  container.querySelectorAll('.gm-edit').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      await editMemberAlias(session, id);
      const fresh = await findGroupSession(session.groupId);
      if (fresh) await renderMembersList(container, fresh);
      await refreshGroupHeader();
    });
  });

  // 踢人
  container.querySelectorAll('.gm-kick').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const member = participants.find((p) => p.id === id);
      if (!member) return;
      showConfirm({
        title: '把ta移出群聊？',
        body: `要把「${member.name}」移出群聊嘛？移出后ta就收不到群消息啦`,
        confirmText: '移出',
        cancelText: '再想想',
        danger: true,
        onConfirm: async () => {
          await removeMember(session, id);
          const fresh = await findGroupSession(session.groupId);
          if (fresh) {
            await renderMembersList(container, fresh);
            const sheet = container._sheet;
            const titleEl = sheet?.querySelector?.('.popo-sheet-title');
            if (titleEl) titleEl.textContent = `群成员（${(fresh.participants || []).length}）`;
          }
          await refreshGroupHeader();
        }
      });
    });
  });
}

function renderAnnouncement(session) {
  const ann = session.announcement || '';
  if (!ann) {
    return `<div class="gm-announce" id="gm-announce-box">
      <div class="gm-announce-title">${createIcon('bell', 14).outerHTML}<span>群公告</span></div>
      <div class="gm-announce-empty">还没有公告，点这里写一句吧</div>
    </div>`;
  }
  return `<div class="gm-announce" id="gm-announce-box">
    <div class="gm-announce-title">${createIcon('bell', 14).outerHTML}<span>群公告</span></div>
    <div class="gm-announce-text">${escapeHTML(ann)}</div>
  </div>`;
}

// ════════════════════════════════════════
// 群成员操作
// ════════════════════════════════════════

async function addMembers(session, charIds) {
  const newOnes = [];
  for (const id of charIds) {
    let char = null;
    try { char = await getDB(STORES.characters, id); } catch (e) {}
    if (char) {
      newOnes.push({
        id: char.id,
        name: char.name || char.nickname || '未命名',
        avatar: char.avatar || '',
        persona: (char.persona || '').slice(0, 200)
      });
    }
  }
  const participants = (session.participants || []).concat(newOnes);
  await updateGroupSession(session, { participants, participantIds: participants.map((p) => p.id) });
  // 写一条系统消息
  await writeGroupSysMessage(session, `${newOnes.map((p) => p.name).join('、')} 加入了群聊`);
  showToast('邀请成功啦', 'success', 1400);
  bus.emit('chat:group-members-changed', { groupId: session.groupId, action: 'add', added: newOnes });
}

async function removeMember(session, memberId) {
  const participants = (session.participants || []).filter((p) => p.id !== memberId);
  await updateGroupSession(session, { participants, participantIds: participants.map((p) => p.id) });
  const removed = (session.participants || []).find((p) => p.id === memberId);
  await writeGroupSysMessage(session, `${removed?.name || '成员'} 被移出了群聊`);
  bus.emit('chat:group-members-changed', { groupId: session.groupId, action: 'remove', removedId: memberId });
}

async function editMemberAlias(session, memberId) {
  const member = (session.participants || []).find((p) => p.id === memberId);
  if (!member) return;
  // 复用 widgets.js 的 promptText
  try {
    const { promptText } = await import('../chat-settings/widgets.js');
    promptText(
      `给「${member.name}」起个群昵称`,
      member.alias || member.name,
      async (newAlias) => {
        const alias = (newAlias || '').trim();
        const participants = (session.participants || []).map((p) =>
          p.id === memberId ? { ...p, alias } : p
        );
        await updateGroupSession(session, { participants });
        showToast('昵称改好啦', 'success', 1400);
      },
      { placeholder: '留空则用原昵称' }
    );
  } catch (e) {
    showToast('编辑器打不开呢', 'error');
  }
}

export async function editGroupAnnouncement(session) {
  try {
    const { promptText } = await import('../chat-settings/widgets.js');
    promptText(
      '写一句群公告',
      session.announcement || '',
      async (text) => {
        const ann = (text || '').trim().slice(0, 500);
        await updateGroupSession(session, { announcement: ann });
        showToast('公告更新啦', 'success', 1400);
        await refreshGroupHeader();
      },
      { placeholder: '群里的小约定写在这里吧', multiline: true }
    );
  } catch (e) {
    showToast('编辑器打不开呢', 'error');
  }
}

// ════════════════════════════════════════
// 工具函数
// ════════════════════════════════════════

export async function findGroupSession(groupId) {
  let sessions = [];
  try { sessions = await getAllDB(STORES.chatSessions); } catch (e) {}
  return sessions.find((s) => s.isGroup && s.groupId === groupId) || null;
}

async function updateGroupSession(session, patch) {
  const cur = await getDB(STORES.chatSessions, session.id) || session;
  const next = { ...cur, ...patch, updatedAt: Date.now() };
  await setDB(STORES.chatSessions, session.id, next);
  // 同步 state
  const state = getState();
  if (state.currentSession?.id === session.id) {
    state.currentSession = next;
  }
  bus.emit('chat:session-updated', { session: next });
  return next;
}

async function writeGroupSysMessage(session, text) {
  const { generateId, getNow, setDB } = await import('../../core/storage.js');
  const msg = {
    id: generateId('gsys'),
    groupId: session.groupId,
    sessionId: session.id,
    senderId: 'system',
    senderName: '系统',
    role: 'system',
    content: text,
    type: 'system',
    timestamp: getNow()
  };
  try { await setDB(STORES.groupMessages, msg.id, msg); } catch (e) {}
}
