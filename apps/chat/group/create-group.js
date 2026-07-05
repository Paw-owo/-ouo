// apps/chat/group/create-group.js
// 发起群聊流程：选成员 → 起群名 → 选群头像 → 建会话 → 进入群聊。
// 群会话复用 STORES.chatSessions，加 isGroup / groupId / participants 字段标记。
// 群消息走独立的 STORES.groupMessages，记忆走 scope='group'（隔离已就绪）。
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/util.js, ./group-detail-view.js
// 全中文注释；不省 token；功能不阉割。

import { STORES, KEYS } from '../../core/storage-keys.js';
import { getDB, setDB, getAllDB, generateId, getNow, compressImage } from '../../core/storage.js';
import { showToast, showConfirm, showBottomSheet, createIcon, registerIcon } from '../../core/ui.js';
import { pickImageFile, isUsableImage, cssUrl, injectStyle } from '../../core/util.js';
import { escapeHTML, escapeAttr } from '../shared-utils.js';
import { enterChat } from '../index.js';

// 注册建群用到的图标（users / sparkles）
registerIcon('users', 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75');
registerIcon('sparkles', 'M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2z M5 14l.8 2.4L8 17l-2.2.6L5 20l-.8-2.4L2 17l2.2-.6L5 14z');

// 注入建群流程样式（基于 CSS 变量，6 套主题都好看）
let createGroupStyleInjected = false;
function ensureCreateGroupStyle() {
  if (createGroupStyleInjected) return;
  injectStyle('app-chat-create-group', `
    .cg-wrap{padding:4px 0 8px}
    .cg-step-title{font-size:var(--font-size-small);color:var(--text-hint);padding:6px 4px 8px;display:flex;align-items:center;gap:6px}
    .cg-member-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:10px;padding:4px 0}
    .cg-member-card{display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 6px;border-radius:var(--radius-md);background:color-mix(in srgb,var(--bg-secondary) 60%,transparent);border:1.5px solid transparent;cursor:pointer;transition:var(--motion);position:relative}
    .cg-member-card:active{transform:scale(var(--press-scale))}
    .cg-member-card.selected{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 10%,transparent)}
    .cg-member-avatar{width:48px;height:48px;border-radius:50%;background-size:cover;background-position:center;display:flex;align-items:center;justify-content:center;color:var(--text-hint);overflow:hidden}
    .cg-member-avatar.empty{background:color-mix(in srgb,var(--text-hint) 18%,transparent)}
    .cg-member-name{font-size:var(--font-size-small);color:var(--text-primary);text-align:center;max-width:84px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .cg-member-check{position:absolute;top:6px;right:6px;width:20px;height:20px;border-radius:50%;background:var(--accent);color:var(--bubble-user-text);display:none;align-items:center;justify-content:center}
    .cg-member-card.selected .cg-member-check{display:flex}
    .cg-name-row{display:flex;align-items:center;gap:10px;padding:10px 4px}
    .cg-name-input{flex:1;padding:10px 12px;border-radius:var(--radius-sm);border:1px solid color-mix(in srgb,var(--text-hint) 24%,transparent);background:var(--bg-secondary);color:var(--text-primary);font-size:var(--font-size-base)}
    .cg-name-input:focus{outline:none;border-color:var(--accent)}
    .cg-avatar-row{display:flex;align-items:center;gap:14px;padding:8px 4px}
    .cg-avatar-preview{width:64px;height:64px;border-radius:50%;background-size:cover;background-position:center;background-color:color-mix(in srgb,var(--text-hint) 18%,transparent);display:flex;align-items:center;justify-content:center;color:var(--text-hint);flex-shrink:0;overflow:hidden}
    .cg-avatar-tip{font-size:var(--font-size-small);color:var(--text-hint);line-height:1.5}
    .cg-avatar-tip button{color:var(--accent);background:none;border:none;padding:0;font-size:inherit;cursor:pointer;text-decoration:underline}
    .cg-footer{display:flex;gap:10px;padding:14px 4px 4px}
    .cg-footer button{flex:1;padding:12px;border-radius:var(--radius-sm);font-size:var(--font-size-base);font-weight:500;transition:var(--motion)}
    .cg-btn-primary{background:var(--accent);color:var(--bubble-user-text)}
    .cg-btn-primary:disabled{opacity:.5;cursor:not-allowed}
    .cg-btn-primary:active:not(:disabled){transform:scale(var(--press-scale))}
    .cg-btn-ghost{background:color-mix(in srgb,var(--text-hint) 14%,transparent);color:var(--text-primary)}
    .cg-empty{padding:30px 12px;text-align:center;color:var(--text-hint);font-size:var(--font-size-small)}
  `);
  createGroupStyleInjected = true;
}

// ════════════════════════════════════════
// 主入口：打开「发起群聊」面板
// ════════════════════════════════════════

/**
 * 打开建群流程。流程为单页 form：成员多选 + 群名 + 群头像，确认即建群。
 * 之所以用单页而不是多步向导：成员不多时一页更顺手，少点几下。
 */
export async function openCreateGroupSheet() {
  ensureCreateGroupStyle();

  // 读全部角色
  let characters = [];
  try {
    characters = await getAllDB(STORES.characters);
  } catch (e) {
    console.warn('[group] 读取角色列表失败', e);
  }
  if (!characters.length) {
    showConfirm({
      title: '还没有角色呢',
      body: '群聊至少需要 2 个角色，先去角色 App 里创建几个嘛',
      confirmText: '去创建',
      cancelText: '再想想',
      onConfirm: () => { import('../../core/router.js').then(({ openApp }) => openApp('characters')); }
    });
    return;
  }
  if (characters.length < 2) {
    showToast('群聊至少要 2 个角色呀，再多建几个嘛', 'default', 2000);
    return;
  }

  // 选中的成员 id 集合
  const selected = new Set();
  // 群名 + 群头像（用户可改）
  let groupName = '';
  let groupAvatar = '';

  // 构建面板
  const body = document.createElement('div');
  body.className = 'cg-wrap';
  body.innerHTML = `
    <div class="cg-step-title">${createIcon('users', 16).outerHTML}<span>选成员（至少 2 个）</span></div>
    <div class="cg-member-grid" id="cg-member-grid"></div>
    <div class="cg-step-title">${createIcon('edit', 16).outerHTML}<span>起个群名</span></div>
    <div class="cg-name-row">
      <input class="cg-name-input" id="cg-name" type="text" placeholder="给群里起个可爱的名字吧" maxlength="30" aria-label="群名">
    </div>
    <div class="cg-step-title">${createIcon('smile', 16).outerHTML}<span>群头像（可选）</span></div>
    <div class="cg-avatar-row">
      <div class="cg-avatar-preview" id="cg-avatar-preview">${createIcon('users', 28).outerHTML}</div>
      <div class="cg-avatar-tip">不选的话会用默认群头像哒<br><button type="button" id="cg-pick-avatar">从相册选一张</button></div>
    </div>
    <div class="cg-footer">
      <button type="button" class="cg-btn-ghost" id="cg-cancel">再想想</button>
      <button type="button" class="cg-btn-primary" id="cg-confirm" disabled>建群啦</button>
    </div>
  `;

  // 渲染成员网格
  const grid = body.querySelector('#cg-member-grid');
  grid.innerHTML = characters.map((c) => `
    <div class="cg-member-card" data-id="${escapeAttr(c.id)}" role="button" tabindex="0" aria-label="选择 ${escapeAttr(c.name || c.nickname || '角色')}">
      <div class="cg-member-avatar ${c.avatar && isUsableImage(c.avatar) ? '' : 'empty'}" style="${c.avatar && isUsableImage(c.avatar) ? `background-image:${cssUrl(c.avatar)}` : ''}">
        ${(!c.avatar || !isUsableImage(c.avatar)) ? createIcon('smile', 24).outerHTML : ''}
      </div>
      <div class="cg-member-name">${escapeHTML(c.name || c.nickname || '未命名')}</div>
      <div class="cg-member-check">${createIcon('check', 14).outerHTML}</div>
    </div>
  `).join('');

  // 成员点击切换选中
  grid.querySelectorAll('.cg-member-card').forEach((card) => {
    const toggle = () => {
      const id = card.dataset.id;
      if (selected.has(id)) {
        selected.delete(id);
        card.classList.remove('selected');
      } else {
        selected.add(id);
        card.classList.add('selected');
      }
      updateConfirmBtn();
    };
    card.addEventListener('click', toggle);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
  });

  // 群名输入
  const nameInput = body.querySelector('#cg-name');
  nameInput.addEventListener('input', (e) => {
    groupName = e.target.value.trim();
    updateConfirmBtn();
  });

  // 群头像选择
  body.querySelector('#cg-pick-avatar').addEventListener('click', async () => {
    try {
      const file = await pickImageFile();
      if (!file) return;
      const compressed = await compressImage(file, { maxWidth: 320, quality: 0.8 });
      groupAvatar = compressed;
      const preview = body.querySelector('#cg-avatar-preview');
      preview.style.backgroundImage = cssUrl(compressed);
      preview.innerHTML = '';
    } catch (e) {
      console.warn('[group] 选群头像失败', e);
      showToast('图片没选好，再试一下嘛', 'error');
    }
  });

  // 确认按钮可用性：成员≥2 且 群名非空
  function updateConfirmBtn() {
    const ok = selected.size >= 2 && groupName.length > 0;
    body.querySelector('#cg-confirm').disabled = !ok;
  }

  const sheet = showBottomSheet({
    title: '发起群聊',
    bodyElement: body,
    dismissible: true
  });

  // 取消 / 确认
  body.querySelector('#cg-cancel').addEventListener('click', () => sheet.close());
  body.querySelector('#cg-confirm').addEventListener('click', async () => {
    if (selected.size < 2 || !groupName) return;
    const btn = body.querySelector('#cg-confirm');
    btn.disabled = true;
    btn.textContent = '正在建群...';
    try {
      const sessionId = await createGroupSession({
        name: groupName,
        avatar: groupAvatar,
        participantIds: Array.from(selected)
      });
      sheet.close();
      showToast('群聊建好啦，开始聊天吧', 'success', 1600);
      // 进入群聊视图（enterChat 会根据 isGroup 自动路由到 group-detail-view）
      enterChat(sessionId);
    } catch (e) {
      console.warn('[group] 建群失败', e);
      btn.disabled = false;
      btn.textContent = '建群啦';
      showToast('群没建好，再试一下嘛', 'error');
    }
  });
}

// ════════════════════════════════════════
// 创建群会话（落库）
// ════════════════════════════════════════

/**
 * 创建一个群会话并写库。
 * @param {object} opts { name, avatar, participantIds }
 * @returns {Promise<string>} sessionId
 */
export async function createGroupSession({ name, avatar, participantIds }) {
  if (!name || !Array.isArray(participantIds) || participantIds.length < 2) {
    throw new Error('参数不合法');
  }
  const now = getNow();
  const sessionId = generateId('gsess');
  const groupId = generateId('grp');
  // 读成员角色信息，缓存到 session.participants 里（避免每次进群都重查）
  const participants = [];
  for (const id of participantIds) {
    let char = null;
    try { char = await getDB(STORES.characters, id); } catch (e) {}
    if (char) {
      participants.push({
        id: char.id,
        name: char.name || char.nickname || '未命名',
        avatar: char.avatar || '',
        persona: (char.persona || '').slice(0, 200)
      });
    }
  }
  if (participants.length < 2) {
    throw new Error('有效成员不足');
  }
  const session = {
    id: sessionId,
    isGroup: true,
    groupId,
    characterId: null,           // 群聊无单一角色；兼容旧逻辑留 null
    participants,                // [{id,name,avatar,persona}]
    participantIds: participants.map((p) => p.id),
    owner: participants[0].id,   // 建群者默认是第一个成员（即用户最先选的）
    title: name,
    avatar: avatar || '',
    announcement: '',
    pinned: false,
    muted: false,
    draft: '',
    unread: 0,
    wallpaper: null,
    lastMessage: '',
    lastAt: now,
    createdAt: now,
    updatedAt: now
  };
  await setDB(STORES.chatSessions, sessionId, session);
  // 初始化群配置（轮询回复指针等）
  try {
    const cfg = {
      groupId,
      lastReplierIndex: 0,
      groupAtTrigger: true,      // 默认 @我 才触发；用户可在群设置里关掉
      hapticOnReceive: true,
      createdAt: now
    };
    localStorage.setItem(KEYS.groupConfig(groupId), JSON.stringify(cfg));
  } catch (e) {
    console.warn('[group] 写群配置失败', e);
  }
  return sessionId;
}

// ════════════════════════════════════════
// 群成员选择器（给群设置/加人用）
// ════════════════════════════════════════

/**
 * 弹一个多选角色面板，返回选中的角色 id 数组。
 * 用于「邀请成员进群」「@某人」等场景。
 * @param {object} opts { title, excludeIds:[], minSelect:0, confirmText }
 * @returns {Promise<string[]|null>} 选中的 id 数组；取消返回 null
 */
export function pickCharacters(opts = {}) {
  const {
    title = '选角色',
    excludeIds = [],
    minSelect = 0,
    confirmText = '确定'
  } = opts;
  const excludeSet = new Set(excludeIds);
  return new Promise((resolve) => {
    (async () => {
      ensureCreateGroupStyle();
      let characters = [];
      try { characters = await getAllDB(STORES.characters); } catch (e) {}
      const available = characters.filter((c) => !excludeSet.has(c.id));
      if (!available.length) {
        showToast('没有可选的角色呀', 'default', 1600);
        resolve(null);
        return;
      }
      const selected = new Set();
      const body = document.createElement('div');
      body.className = 'cg-wrap';
      body.innerHTML = `
        <div class="cg-member-grid" id="pick-grid"></div>
        <div class="cg-footer">
          <button type="button" class="cg-btn-ghost" id="pick-cancel">取消</button>
          <button type="button" class="cg-btn-primary" id="pick-confirm">${escapeHTML(confirmText)}</button>
        </div>
      `;
      const grid = body.querySelector('#pick-grid');
      grid.innerHTML = available.map((c) => `
        <div class="cg-member-card" data-id="${escapeAttr(c.id)}" role="button" tabindex="0">
          <div class="cg-member-avatar ${c.avatar && isUsableImage(c.avatar) ? '' : 'empty'}" style="${c.avatar && isUsableImage(c.avatar) ? `background-image:${cssUrl(c.avatar)}` : ''}">
            ${(!c.avatar || !isUsableImage(c.avatar)) ? createIcon('smile', 24).outerHTML : ''}
          </div>
          <div class="cg-member-name">${escapeHTML(c.name || c.nickname || '未命名')}</div>
          <div class="cg-member-check">${createIcon('check', 14).outerHTML}</div>
        </div>
      `).join('');
      grid.querySelectorAll('.cg-member-card').forEach((card) => {
        const toggle = () => {
          const id = card.dataset.id;
          if (selected.has(id)) { selected.delete(id); card.classList.remove('selected'); }
          else { selected.add(id); card.classList.add('selected'); }
        };
        card.addEventListener('click', toggle);
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
        });
      });
      const sheet = showBottomSheet({ title, bodyElement: body, dismissible: true });
      body.querySelector('#pick-cancel').addEventListener('click', () => { sheet.close(); resolve(null); });
      body.querySelector('#pick-confirm').addEventListener('click', () => {
        if (selected.size < minSelect) {
          showToast(`至少选 ${minSelect} 个呀`, 'default', 1400);
          return;
        }
        sheet.close();
        resolve(Array.from(selected));
      });
    })().catch((e) => {
      console.warn('[group] pickCharacters 失败', e);
      resolve(null);
    });
  });
}
