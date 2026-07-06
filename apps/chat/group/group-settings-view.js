// apps/chat/group/group-settings-view.js
// 群聊独立设置页。复用 chat-settings/*-group.js 分组，scope='group'。
// 编排：群资料 → 群成员入口 → AI 模型 → AI 调试 → 偏好 → 背景 → 记录 → 危险。
// 全中文注释；不省 token；功能不阉割。

import { STORES, KEYS } from '../../core/storage-keys.js';
import { getDB, setDB, getAllDB } from '../../core/storage.js';
import { showToast, showConfirm, createIcon, registerIcon, createCollapsibleCard } from '../../core/ui.js';
import { isUsableImage, cssUrl, injectStyle } from '../../core/util.js';
import { escapeHTML, escapeAttr } from '../shared-utils.js';
import { getState } from '../index.js';
import { findGroupSession, openGroupMembersSheet, editGroupAnnouncement } from './group-members.js';
import { refreshGroupHeader } from './group-detail-view.js';
import bus from '../../core/events.js';

// 复用 chat-settings 共用控件 + 分组
import {
  ensureSettingsStyle, getChatPrefs, saveChatPrefs,
  getGlobalMsgPrefs, saveGlobalMsgPrefs,
  makeField, makeInput, makeToggle, makeButton, makeButtonRow, makeHintBar, makeBadge,
  makeSectionTitle, makeSection, makeAvatarPicker
} from '../chat-settings/widgets.js';
import { buildAIModelGroup } from '../chat-settings/ai-model-group.js';
import { buildAIDebugGroup } from '../chat-settings/ai-debug-group.js';
import { buildPrefsGroup } from '../chat-settings/prefs-group.js';
import { buildBackgroundGroup } from '../chat-settings/background-group.js';
import { buildRecordsGroup } from '../chat-settings/records-group.js';
import { buildDangerGroup } from '../chat-settings/danger-group.js';

registerIcon('users', 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75');
registerIcon('back', 'M19 12H5 M12 19l-7-7 7-7');
registerIcon('close', 'M18 6L6 18 M6 6l12 12');
registerIcon('edit', 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z');
registerIcon('bell', 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0');
registerIcon('trash', 'M3 6h18 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2');

// 设置页单例：保证同时只有一个群设置页
let _currentOverlay = null;

/**
 * 打开群聊设置页。
 * @param {string} groupId
 */
export async function openGroupSettings(groupId) {
  if (!groupId) return;
  // 单例：已经开着就先关掉
  if (_currentOverlay) {
    closeGroupSettings();
  }
  // 关掉可能开着的私聊设置 overlay，避免双层遮罩叠加锁死滚动
  try {
    const { closeChatSettings } = await import('../chat-settings-view.js');
    closeChatSettings();
  } catch (e) {}
  ensureSettingsStyle();

  const session = await findGroupSession(groupId);
  if (!session) {
    showToast('群不见了，可能被删了', 'error');
    return;
  }

  const prefs = getChatPrefs(groupId); // 群聊复用 KEYS.chatConfig(characterId) 的结构，传 groupId 当 key

  // 构建骨架
  const overlay = buildOverlayShell({
    title: '群聊与 AI 调试设置',
    subtitle: session.title || '群聊',
    onBack: () => closeGroupSettings()
  });

  // 顶部群资料卡
  overlay.querySelector('.chat-settings-page').appendChild(buildGroupHeader(session));

  // ── 群资料分组：群名 / 群头像 / 群公告 / 群成员入口 ──
  overlay.querySelector('.chat-settings-page').appendChild(buildGroupProfileGroup(session));

  // ── AI 模型与接口（scope='group'）──
  try {
    const aiModelGroup = buildAIModelGroup({
      character: null,
      prefs,
      scope: 'group',
      groupId
    });
    overlay.querySelector('.chat-settings-page').appendChild(aiModelGroup);
  } catch (e) {
    console.warn('[group-settings] AI 模型分组构建失败', e);
  }

  // ── AI 调试（scope='group'）──
  try {
    const aiDebugGroup = buildAIDebugGroup({
      character: null,
      prefs,
      scope: 'group',
      groupId
    });
    overlay.querySelector('.chat-settings-page').appendChild(aiDebugGroup);
  } catch (e) {
    console.warn('[group-settings] AI 调试分组构建失败', e);
  }

  // ── 偏好（scope='group'）──
  try {
    const prefsGroup = buildPrefsGroup({
      character: null,
      prefs,
      scope: 'group',
      groupId
    });
    overlay.querySelector('.chat-settings-page').appendChild(prefsGroup);
  } catch (e) {
    console.warn('[group-settings] 偏好分组构建失败', e);
  }

  // ── 背景（scope='group'）──
  try {
    const bgGroup = buildBackgroundGroup({
      session,
      scope: 'group',
      groupId,
      onBackgroundChange: async () => {
        // 壁纸改了，刷新 detail-view 的壁纸
        try {
          const { applySessionWallpaper } = await import('../wallpaper.js');
          applySessionWallpaper();
        } catch (e) {}
      }
    });
    overlay.querySelector('.chat-settings-page').appendChild(bgGroup);
  } catch (e) {
    console.warn('[group-settings] 背景分组构建失败', e);
  }

  // ── 群聊专属：@触发 / 震动 ──
  overlay.querySelector('.chat-settings-page').appendChild(buildGroupTriggerGroup(session));

  // ── 记录（scope='group'）──
  try {
    const recordsGroup = buildRecordsGroup({
      session,
      character: null,
      scope: 'group',
      groupId,
      onRecordsChange: async () => {
        // 记录清空后刷新消息列表
        try {
          const { renderGroupDetailView } = await import('./group-detail-view.js');
          await renderGroupDetailView();
        } catch (e) {}
      }
    });
    overlay.querySelector('.chat-settings-page').appendChild(recordsGroup);
  } catch (e) {
    console.warn('[group-settings] 记录分组构建失败', e);
  }

  // ── 危险（scope='group'）──
  try {
    const dangerGroup = buildDangerGroup({
      session,
      character: null,
      scope: 'group',
      groupId,
      onDeleteSession: async () => {
        closeGroupSettings();
        // 删除群会话后回列表
        try {
          const { backToSessionList } = await import('../index.js');
          await backToSessionList();
          const { refreshSessionList } = await import('../index.js');
          await refreshSessionList();
        } catch (e) {}
      },
      onResetPrefs: () => {
        // 重置群偏好后刷新当前设置页
        closeGroupSettings();
        setTimeout(() => openGroupSettings(groupId), 100);
      }
    });
    overlay.querySelector('.chat-settings-page').appendChild(dangerGroup);
  } catch (e) {
    console.warn('[group-settings] 危险分组构建失败', e);
  }

  mountOverlay(overlay);
}

export function closeGroupSettings() {
  if (!_currentOverlay) return;
  const ov = _currentOverlay;
  _currentOverlay = null;
  try {
    if (ov._popHandler) {
      window.removeEventListener('popstate', ov._popHandler);
      // 若是我们 push 的 state 仍在栈顶（页内按钮关闭，而非物理返回键触发），
      // 主动 history.back() 弹掉它，否则会留下幻影历史条目，下次物理返回键空跳一次。
      try {
        if (history.state && history.state.chatGroupSettings) {
          history.back();
        }
      } catch (e) {}
    }
  } catch (e) {}
  try { if (ov.parentNode) ov.parentNode.removeChild(ov); } catch (e) {}
  try { document.body.style.overflow = ''; } catch (e) {}
}

// ════════════════════════════════════════
// 设置页骨架
// ════════════════════════════════════════

function buildOverlayShell({ title, subtitle, onBack }) {
  const overlay = document.createElement('div');
  overlay.className = 'chat-settings-overlay';
  overlay.innerHTML = `
    <div class="chat-settings-page">
      <div class="chat-settings-header">
        <button class="chat-settings-back" type="button" aria-label="返回">${createIcon('back', 20).outerHTML}</button>
        <div class="chat-settings-title">
          <div class="chat-settings-title-main">${escapeHTML(title)}</div>
          ${subtitle ? `<div class="chat-settings-title-sub">${escapeHTML(subtitle)}</div>` : ''}
        </div>
        <button class="chat-settings-close" type="button" aria-label="关闭">${createIcon('close', 20).outerHTML}</button>
      </div>
      <div class="chat-settings-body"></div>
    </div>
  `;
  overlay.querySelector('.chat-settings-back').addEventListener('click', onBack);
  overlay.querySelector('.chat-settings-close').addEventListener('click', onBack);
  return overlay;
}

function mountOverlay(overlay) {
  _currentOverlay = overlay;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  // 物理返回键支持
  try {
    history.pushState({ chatGroupSettings: true }, '');
    const onPop = () => closeGroupSettings();
    overlay._popHandler = onPop;
    window.addEventListener('popstate', onPop, { once: true });
  } catch (e) {}
  requestAnimationFrame(() => overlay.classList.add('show'));
}

// ════════════════════════════════════════
// 群资料卡（顶部）
// ════════════════════════════════════════

function buildGroupHeader(session) {
  const card = document.createElement('div');
  card.className = 'chat-settings-header-card';
  const members = session.participants || [];
  const avatarsHTML = members.slice(0, 4).map((p) => {
    if (p.avatar && isUsableImage(p.avatar)) {
      return `<div class="csh-avatar" style="background-image:${cssUrl(p.avatar)}"></div>`;
    }
    return `<div class="csh-avatar csh-avatar-empty">${createIcon('smile', 16).outerHTML}</div>`;
  }).join('');
  card.innerHTML = `
    <div class="csh-avatars">${avatarsHTML}</div>
    <div class="csh-info">
      <div class="csh-name">${escapeHTML(session.title || '群聊')}</div>
      <div class="csh-meta">${members.length} 人 · 群聊</div>
    </div>
  `;
  return card;
}

// ════════════════════════════════════════
// 群资料分组：群名 / 群头像 / 群公告 / 群成员入口
// ════════════════════════════════════════

function buildGroupProfileGroup(session) {
  const body = document.createElement('div');
  body.className = 'cs-section-body';

  // 群名
  body.appendChild(makeField({
    label: '群名',
    control: makeInput({
      value: session.title || '',
      placeholder: '给群里起个可爱的名字',
      onChange: async (v) => {
        const name = (v || '').trim();
        if (!name) return;
        await patchSession(session, { title: name });
        showToast('群名改好啦', 'success', 1400);
        await refreshGroupHeader();
      }
    })
  }));

  // 群头像
  body.appendChild(makeField({
    label: '群头像',
    control: makeAvatarPicker(session.avatar || '', async (newAvatar) => {
      await patchSession(session, { avatar: newAvatar || '' });
      showToast('群头像换好啦', 'success', 1400);
      await refreshGroupHeader();
    })
  }));

  // 群公告
  body.appendChild(makeField({
    label: '群公告',
    control: makeButton({
      label: session.announcement ? '编辑公告' : '写一句公告',
      icon: 'bell',
      onClick: () => editGroupAnnouncement(session)
    })
  }));

  // 群成员入口
  body.appendChild(makeField({
    label: '群成员',
    control: makeButton({
      label: `管理（${(session.participants || []).length}）`,
      icon: 'users',
      onClick: () => openGroupMembersSheet(session.groupId)
    })
  }));

  return createCollapsibleCard('群资料', body, {
    collapsed: false,
    icon: 'smile',
    subtitle: session.title || '群聊'
  });
}

// ════════════════════════════════════════
// 群聊触发分组：@触发 / 震动反馈
// ════════════════════════════════════════

function buildGroupTriggerGroup(session) {
  const body = document.createElement('div');
  body.className = 'cs-section-body';
  const groupId = session.groupId;
  let cfg = readGroupTriggerConfig(groupId);

  // @触发开关
  body.appendChild(makeToggle({
    label: '@我 才触发回复',
    helper: '开启后，群里只有 @角色名 或 @所有人 才会有人回复；关闭后每条消息都会触发回复',
    value: !!cfg.groupAtTrigger,
    onChange: (v) => {
      cfg = writeGroupTriggerConfig(groupId, { groupAtTrigger: v });
    }
  }));

  // 收到消息震动
  body.appendChild(makeToggle({
    label: '收到新消息轻震动',
    helper: '群里有人回复时震动一下提醒你',
    value: !!cfg.hapticOnReceive,
    onChange: (v) => {
      cfg = writeGroupTriggerConfig(groupId, { hapticOnReceive: v });
    }
  }));

  return createCollapsibleCard('群聊触发', body, {
    collapsed: false,
    icon: 'bell',
    subtitle: cfg.groupAtTrigger ? '@触发' : '每条都回复'
  });
}

// 群触发配置读写（与 group-sending.js 共享同一个 KEYS.groupConfig key）
function readGroupTriggerConfig(groupId) {
  try {
    const raw = localStorage.getItem(KEYS.groupConfig(groupId));
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return { groupAtTrigger: true, hapticOnReceive: true };
}
function writeGroupTriggerConfig(groupId, patch) {
  const cur = readGroupTriggerConfig(groupId);
  const next = { ...cur, ...patch };
  try { localStorage.setItem(KEYS.groupConfig(groupId), JSON.stringify(next)); } catch (e) {}
  return next;
}

// ════════════════════════════════════════
// 工具
// ════════════════════════════════════════

async function patchSession(session, patch) {
  const cur = await getDB(STORES.chatSessions, session.id) || session;
  const next = { ...cur, ...patch, updatedAt: Date.now() };
  await setDB(STORES.chatSessions, session.id, next);
  const state = getState();
  if (state.currentSession?.id === session.id) {
    state.currentSession = next;
  }
  bus.emit('chat:session-updated', { session: next });
  return next;
}
