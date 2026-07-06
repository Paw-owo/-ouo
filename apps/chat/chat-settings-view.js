// apps/chat/chat-settings-view.js
// 聊天设置页主入口——私聊设置 + 全局消息设置。
// 私聊：角色资料 / AI 模型 / AI 调试 / 聊天偏好 / 聊天背景 / 会话管理 / 聊天记录 / 危险操作
// 全局：默认偏好 / AI 主动消息 / 群聊默认 / 表情包管理 / 默认 AI 配置 / 关于
// 红线：图标只准 SVG 线稿，禁止任何 emoji 字符；文案软萌友好；不跳全局设置 APP。
// 依赖：core/ui.js, core/storage.js, core/storage-keys.js, ./chat-settings/widgets.js,
//       ./chat-settings/*-group.js, ./index.js（动态 import 避免循环）

import { createIcon, createCollapsibleCard } from '../../core/ui.js';
import { showToast, showConfirm, showBottomSheet } from '../../core/ui.js';
import { getDB } from '../../core/storage.js';
import { STORES, KEYS } from '../../core/storage-keys.js';
import bus from '../../core/events.js';
import { saveAIConfig as saveAIConfigCore } from '../../js/ai/ai-client.js';
import {
  ensureSettingsStyle,
  makeSection, makeSectionTitle, makeField, makeInput, makeToggle,
  makeSlider, makeSegmented, makeButton, makeAsyncButton, makeHintBar,
  makeBadge, makeModelList, makeQuickRepliesEditor,
  getChatPrefs, saveChatPrefs,
  getGlobalMsgPrefs, saveGlobalMsgPrefs,
  fetchModelList,
  FONT_SIZE_OPTIONS, CHAT_MODE_OPTIONS
} from './chat-settings/widgets.js';
import { buildProfileGroup } from './chat-settings/profile-group.js';
import { buildAIModelGroup } from './chat-settings/ai-model-group.js';
import { buildAIDebugGroup } from './chat-settings/ai-debug-group.js';
import { buildPrefsGroup } from './chat-settings/prefs-group.js';
import { buildBackgroundGroup } from './chat-settings/background-group.js';
import { buildSessionMgmtGroup } from './chat-settings/session-mgmt-group.js';
import { buildRecordsGroup } from './chat-settings/records-group.js';
import { buildDangerGroup } from './chat-settings/danger-group.js';
import { escapeHTML, escapeAttr } from './shared-utils.js';

let _currentOverlay = null; // 当前设置页根节点（同时只存在一个）

// ════════════════════════════════════════
// 私聊设置页
// ════════════════════════════════════════

/**
 * 打开当前会话的聊天设置页（私聊）。
 * 从 chat index 的 state 里读 currentSession / currentCharacter。
 */
export async function openChatSettings() {
  if (_currentOverlay) closeChatSettings();
  ensureSettingsStyle();

  const state = await readChatState();
  if (!state.currentSession) {
    showToast('先打开一个聊天再设置嘛', 'default', 1400);
    return;
  }
  const session = state.currentSession;
  let character = state.currentCharacter;
  if (!character || character.id !== session.characterId) {
    try { character = await getDB(STORES.characters, session.characterId); } catch (e) {}
  }
  if (!character) {
    showToast('角色资料读不到呀，去角色 App 看看嘛', 'error');
    return;
  }

  const prefs = getChatPrefs(character.id);

  // 构建页面骨架
  const overlay = buildOverlayShell({
    title: '聊天与 AI 调试设置',
    subtitle: character.name || character.nickname || session.title || '聊天',
    onBack: () => closeChatSettings()
  });
  const scroll = overlay.querySelector('.chat-settings-scroll');

  // 顶部角色卡（头像 + 名字 + 人设摘要）
  scroll.appendChild(buildCharacterHeader(character, session));

  // 各分组
  scroll.appendChild(buildProfileGroup({
    character, session,
    onCharacterChange: (patch) => {
      // 同步到 state（不重渲染，避免输入时丢焦点）
      try {
        const st = window.__popoChatState || state;
        if (st.currentCharacter) Object.assign(st.currentCharacter, patch);
      } catch (e) {}
      // 触发 header 更新
      updateCharacterHeader(overlay, character);
    }
  }));

  scroll.appendChild(buildAIModelGroup({ character, prefs, scope: 'chat' }));
  scroll.appendChild(buildAIDebugGroup({ character, prefs, scope: 'chat' }));
  scroll.appendChild(buildPrefsGroup({ character, prefs, scope: 'chat' }));
  scroll.appendChild(buildBackgroundGroup({
    session,
    onBackgroundChange: async () => {
      // 通知聊天页重新应用壁纸
      bus.emit('chat:wallpaper-changed', { sessionId: session.id });
      try {
        const { applySessionWallpaper, render } = await import('./index.js');
        if (typeof applySessionWallpaper === 'function') applySessionWallpaper();
      } catch (e) {}
    }
  }));
  scroll.appendChild(buildSessionMgmtGroup({
    session, character,
    onSessionChange: () => {
      bus.emit('chat:session-updated', { sessionId: session.id });
    },
    onReopenChat: async (sid) => {
      closeChatSettings();
      try {
        const { enterChat } = await import('./index.js');
        if (typeof enterChat === 'function') enterChat(sid);
      } catch (e) {}
    }
  }));
  scroll.appendChild(buildRecordsGroup({
    session, character, scope: 'chat',
    onRecordsChange: async () => {
      try {
        const { render } = await import('./index.js');
        if (typeof render === 'function') await render();
      } catch (e) {}
    }
  }));
  scroll.appendChild(buildDangerGroup({
    session, character, scope: 'chat',
    onDeleteSession: async () => {
      closeChatSettings();
      try {
        const { backToSessionList, refreshSessionList } = await import('./index.js');
        if (typeof refreshSessionList === 'function') await refreshSessionList();
        if (typeof backToSessionList === 'function') backToSessionList();
      } catch (e) {}
    },
    onResetPrefs: () => {
      // 重置后关闭重开，让所有分组重新读默认值
      closeChatSettings();
      setTimeout(() => openChatSettings(), 60);
    }
  }));

  mountOverlay(overlay);
}

// ════════════════════════════════════════
// 全局消息设置页
// ════════════════════════════════════════

/**
 * 打开全局消息设置页（从消息列表页齿轮进入）。
 * 不依赖具体会话，配置全局默认偏好 + AI 主动消息 + 表情包管理 + 默认 AI 配置。
 */
export async function openGlobalMessageSettings() {
  if (_currentOverlay) closeChatSettings();
  ensureSettingsStyle();

  const prefs = getGlobalMsgPrefs();

  const overlay = buildOverlayShell({
    title: '消息设置',
    subtitle: '全局默认 · 所有聊天通用',
    onBack: () => closeChatSettings()
  });
  const scroll = overlay.querySelector('.chat-settings-scroll');

  // 顶部说明
  scroll.appendChild(makeHintBar('这里管所有聊天的默认行为，单个聊天还能单独覆盖哦', 'info'));

  // ── 默认聊天偏好 ──
  const defSec = makeSection();
  defSec.appendChild(makeSectionTitle('默认聊天偏好'));
  defSec.appendChild(makeSegmented({
    label: '默认显示模式',
    value: prefs.chatMode || 'bubble',
    options: CHAT_MODE_OPTIONS,
    helper: '新建会话时使用的模式',
    onChange: (v) => saveGlobalMsgPrefs({ chatMode: v })
  }));
  defSec.appendChild(makeSegmented({
    label: '默认字号',
    value: prefs.fontSize || 'medium',
    options: FONT_SIZE_OPTIONS,
    onChange: (v) => saveGlobalMsgPrefs({ fontSize: v })
  }));
  defSec.appendChild(makeToggle({
    label: '默认按回车发送',
    value: prefs.enterToSend !== false,
    onChange: (v) => saveGlobalMsgPrefs({ enterToSend: v })
  }));
  defSec.appendChild(makeToggle({
    label: '默认自动滚到底部',
    value: prefs.autoScroll !== false,
    onChange: (v) => saveGlobalMsgPrefs({ autoScroll: v })
  }));
  scroll.appendChild(defSec);

  // ── AI 主动消息 ──
  const aiSec = makeSection();
  aiSec.appendChild(makeSectionTitle('AI 主动消息'));
  aiSec.appendChild(makeHintBar('她会偶尔主动找你聊天，像真的在乎你一样', 'info'));
  aiSec.appendChild(makeToggle({
    label: '允许 AI 主动发消息',
    value: prefs.proactiveEnabled !== false,
    helper: '关闭后她只在你说话后回复',
    onChange: (v) => saveGlobalMsgPrefs({ proactiveEnabled: v })
  }));
  aiSec.appendChild(makeSlider({
    label: '每天主动消息上限',
    value: prefs.proactiveBudget ?? 3,
    min: 0, max: 20, step: 1,
    helper: '0 表示完全不主动，建议 3-5 条',
    format: (v) => `${v} 条`,
    onChange: (v) => saveGlobalMsgPrefs({ proactiveBudget: v })
  }));
  aiSec.appendChild(makeToggle({
    label: '夜间静默',
    value: prefs.nightSilent !== false,
    helper: '夜间不打扰你休息',
    onChange: (v) => saveGlobalMsgPrefs({ nightSilent: v })
  }));
  aiSec.appendChild(makeSlider({
    label: '静默开始时间',
    value: prefs.nightSilentStart ?? 22,
    min: 0, max: 23, step: 1,
    format: (v) => `${String(v).padStart(2, '0')}:00`,
    onChange: (v) => saveGlobalMsgPrefs({ nightSilentStart: v })
  }));
  aiSec.appendChild(makeSlider({
    label: '静默结束时间',
    value: prefs.nightSilentEnd ?? 8,
    min: 0, max: 23, step: 1,
    format: (v) => `${String(v).padStart(2, '0')}:00`,
    onChange: (v) => saveGlobalMsgPrefs({ nightSilentEnd: v })
  }));
  scroll.appendChild(aiSec);

  // ── 群聊默认 ──
  const grpSec = makeSection();
  grpSec.appendChild(makeSectionTitle('群聊默认'));
  grpSec.appendChild(makeToggle({
    label: '@我 才触发回复',
    value: prefs.groupAtTrigger !== false,
    helper: '关闭后群里每条消息都会触发 AI',
    onChange: (v) => saveGlobalMsgPrefs({ groupAtTrigger: v })
  }));
  grpSec.appendChild(makeToggle({
    label: '收到新消息轻震动',
    value: prefs.hapticOnReceive !== false,
    helper: '需要设备支持震动',
    onChange: (v) => saveGlobalMsgPrefs({ hapticOnReceive: v })
  }));
  scroll.appendChild(grpSec);

  // ── 表情包管理入口 ──
  const stickerSec = makeSection();
  stickerSec.appendChild(makeSectionTitle('表情包管理'));
  stickerSec.appendChild(makeHintBar('点下面按钮管理你收藏的表情包图片', 'info'));
  stickerSec.appendChild(makeButton({
    label: '打开表情包管理', icon: 'smile', block: true,
    onClick: () => openStickerManager()
  }));
  scroll.appendChild(stickerSec);

  // ── 默认 AI 配置（全局）──
  scroll.appendChild(buildGlobalAIConfigSection());

  // ── 关于 ──
  const aboutSec = makeSection();
  aboutSec.appendChild(makeSectionTitle('关于'));
  aboutSec.appendChild(buildAboutCard());
  scroll.appendChild(aboutSec);

  mountOverlay(overlay);
}

// ════════════════════════════════════════
// 全局 AI 配置区（复用 widgets，写到 KEYS.aiConfig）
// ════════════════════════════════════════

function buildGlobalAIConfigSection() {
  const content = document.createElement('div');
  content.appendChild(makeHintBar('这是所有聊天的默认 AI 接口，单个角色可在自己设置里覆盖', 'info'));

  // 读全局配置
  let cfg = readAIConfig();
  const refresh = () => { cfg = readAIConfig(); };

  content.appendChild(makeInput({
    label: '接口地址',
    value: cfg.url || '',
    placeholder: 'https://api.openai.com/v1/chat/completions',
    stacked: true,
    helper: 'OpenAI 兼容的 /v1/chat/completions 地址',
    onChange: (v) => { saveAIConfig({ url: v }); }
  }));
  content.appendChild(makeInput({
    label: 'API Key',
    value: cfg.apiKey || '',
    placeholder: 'sk-...',
    type: 'password',
    stacked: true,
    helper: '只存在本机，不会上传',
    onChange: (v) => { saveAIConfig({ apiKey: v }); }
  }));

  // 模型 + 拉取
  const modelWrap = document.createElement('div');
  modelWrap.className = 'cs-field cs-field-stack';
  const modelLabel = document.createElement('div');
  modelLabel.className = 'cs-field-label';
  modelLabel.innerHTML = `<span class="cs-label-title">模型</span>`;
  modelWrap.appendChild(modelLabel);
  const modelInput = document.createElement('input');
  modelInput.className = 'cs-input';
  modelInput.value = cfg.model || '';
  modelInput.placeholder = 'gpt-4o-mini / deepseek-chat ...';
  let modelTimer = null;
  modelInput.addEventListener('input', () => {
    if (modelTimer) clearTimeout(modelTimer);
    modelTimer = setTimeout(() => saveAIConfig({ model: modelInput.value }), 300);
  });
  modelWrap.appendChild(modelInput);

  const listContainer = document.createElement('div');
  const fetchRow = document.createElement('div');
  fetchRow.style.cssText = 'display:flex;gap:6px;margin-top:6px;';
  fetchRow.appendChild(makeAsyncButton({
    label: '拉取模型列表', icon: 'refresh',
    onClick: async () => {
      const c = readAIConfig();
      if (!c.url) { showToast('先填接口地址呀', 'default', 1400); return; }
      const models = await fetchModelList(c.url, c.apiKey);
      listContainer.innerHTML = '';
      listContainer.appendChild(makeModelList(models, c.model, (m) => {
        modelInput.value = m;
        saveAIConfig({ model: m });
        showToast(`已选 ${m}`, 'success', 1200);
        listContainer.innerHTML = '';
      }));
      showToast(`拉到 ${models.length} 个模型`, 'success', 1200);
    }
  }));
  fetchRow.appendChild(makeButton({
    label: '收起', variant: 'ghost', icon: 'close',
    onClick: () => { listContainer.innerHTML = ''; }
  }));
  modelWrap.appendChild(fetchRow);
  modelWrap.appendChild(listContainer);
  content.appendChild(modelWrap);

  // 调试参数
  content.appendChild(makeSlider({
    label: '温度',
    value: cfg.temperature ?? 0.8,
    min: 0, max: 2, step: 0.05,
    format: (v) => v.toFixed(2),
    onChange: (v) => saveAIConfig({ temperature: v })
  }));
  content.appendChild(makeSlider({
    label: '最大回复长度',
    value: cfg.maxTokens ?? 800,
    min: 100, max: 8000, step: 100,
    format: (v) => String(v),
    onChange: (v) => saveAIConfig({ maxTokens: v })
  }));
  content.appendChild(makeToggle({
    label: '显示思维链',
    value: !!cfg.enableChain,
    onChange: (v) => saveAIConfig({ enableChain: v })
  }));
  content.appendChild(makeInput({
    label: '说话风格',
    value: cfg.style || '',
    placeholder: '温柔 / 傲娇 / 毒舌...',
    stacked: true,
    onChange: (v) => saveAIConfig({ style: v })
  }));

  // 状态徽标
  const badgeRow = document.createElement('div');
  badgeRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;padding:4px 0;';
  if (cfg.url && cfg.apiKey) {
    badgeRow.appendChild(makeBadge('已配置', 'success'));
  } else {
    badgeRow.appendChild(makeBadge('未配置', 'warn'));
  }
  content.appendChild(badgeRow);

  // 与其他分组一致：用 createCollapsibleCard 包起来，可折叠
  return createCollapsibleCard('默认 AI 配置', content, { collapsed: false, icon: 'settings' });
}

// ════════════════════════════════════════
// 关于卡片
// ════════════════════════════════════════

function buildAboutCard() {
  const card = document.createElement('div');
  card.className = 'cs-field';
  card.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
      <div style="width:48px;height:48px;border-radius:12px;background:var(--accent,#007aff);color:#fff;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;">聊</div>
      <div>
        <div style="font-size:16px;font-weight:600;">泡泡消息</div>
        <div style="font-size:12px;color:var(--text-tertiary,#8e8e93);">陪你说话的小角落</div>
      </div>
    </div>
    <div style="font-size:13px;color:var(--text-tertiary,#8e8e93);line-height:1.6;">
      所有数据都存在你自己的设备上，不会上传到任何服务器。<br>
      AI 接口由你自己配置，聊天内容只在你和 AI 服务之间流转。
    </div>
  `;
  return card;
}

// ════════════════════════════════════════
// 表情包管理（独立面板）
// ════════════════════════════════════════

async function openStickerManager() {
  const body = document.createElement('div');
  body.style.cssText = 'padding:12px;';
  const listEl = document.createElement('div');
  listEl.className = 'cs-chips';
  listEl.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:8px;';
  body.appendChild(listEl);

  const render = async () => {
    listEl.innerHTML = '';
    let stickers = [];
    try {
      const { getAllDB } = await import('../../core/storage.js');
      stickers = await getAllDB(STORES.stickers);
    } catch (e) {}
    if (!stickers.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'grid-column:1/-1;padding:32px 12px;text-align:center;color:var(--text-tertiary,#8e8e93);font-size:13px;';
      empty.textContent = '还没有收藏表情包呀，去聊天里长按图片就能收藏啦';
      listEl.appendChild(empty);
    } else {
      stickers.forEach((s) => {
        const item = document.createElement('div');
        item.style.cssText = 'position:relative;aspect-ratio:1;border-radius:8px;overflow:hidden;background:var(--bg-base,#e5e5ea);cursor:pointer;';
        item.innerHTML = `<img src="${escapeAttr(s.dataUrl || '')}" style="width:100%;height:100%;object-fit:cover;" alt="表情">`;
        item.addEventListener('click', () => {
          showConfirm({
            title: '删掉这个表情吗？',
            body: '删掉后聊天里就发不了啦',
            confirmText: '删掉吧',
            cancelText: '不要',
            danger: true,
            onConfirm: async () => {
              try {
                const { deleteDB } = await import('../../core/storage.js');
                await deleteDB(STORES.stickers, s.id);
                showToast('删掉啦', 'default', 1200);
                render();
              } catch (e) {
                showToast('没删掉，再试一下嘛', 'error');
              }
            }
          });
        });
        listEl.appendChild(item);
      });
    }
  };
  await render();

  // 添加按钮
  const addBtn = makeButton({
    label: '从相册添加', icon: 'plus', block: true,
    onClick: async () => {
      try {
        const { pickImageFile } = await import('../../core/util.js');
        const { compressImage, setDB, generateId } = await import('../../core/storage.js');
        const file = await pickImageFile('image/*');
        const dataUrl = await compressImage(file, { quality: 0.8, maxWidth: 256, maxHeight: 256 });
        const id = generateId('sticker');
        await setDB(STORES.stickers, id, {
          id, dataUrl, source: 'manual', createdAt: Date.now()
        });
        showToast('添加好啦', 'success', 1200);
        render();
      } catch (e) {
        if (e && e.message && /cancel|abort/i.test(e.message)) return;
        showToast('图片没选好嘛，再试一下', 'error');
      }
    }
  });
  body.appendChild(addBtn);

  showBottomSheet({
    title: '表情包管理',
    bodyElement: body,
    dismissible: true
  });
}

// ════════════════════════════════════════
// 页面骨架
// ════════════════════════════════════════

function buildOverlayShell({ title, subtitle, onBack }) {
  const overlay = document.createElement('div');
  overlay.className = 'chat-settings-page';
  overlay.innerHTML = `
    <div class="app-header">
      <button class="app-back" id="cs-back" aria-label="返回">${createIcon('back', 20).outerHTML}</button>
      <div class="app-header-title">${escapeHTML(title || '设置')}</div>
      <div style="width:32px;"></div>
    </div>
    <div class="chat-settings-scroll" id="cs-scroll"></div>
  `;
  overlay.querySelector('#cs-back').addEventListener('click', () => {
    if (typeof onBack === 'function') onBack();
  });
  // 副标题插入到 scroll 顶部
  if (subtitle) {
    const sub = document.createElement('div');
    sub.style.cssText = 'font-size:13px;color:var(--text-tertiary,#8e8e93);padding:4px 4px 12px;';
    sub.textContent = subtitle;
    overlay.querySelector('.chat-settings-scroll').appendChild(sub);
  }
  return overlay;
}

// 角色头部卡
function buildCharacterHeader(character, session) {
  const card = document.createElement('div');
  card.className = 'cs-field';
  card.id = 'cs-char-header';
  card.style.cssText = 'flex-direction:row;align-items:center;gap:12px;margin-bottom:12px;';
  const avatar = renderAvatarHTML(character);
  const name = escapeHTML(character.name || character.nickname || session.title || '未命名');
  const persona = escapeHTML((character.persona || '还没有人设呢').slice(0, 50));
  card.innerHTML = `
    <div style="width:56px;height:56px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;overflow:hidden;background:var(--bg-base,#e5e5ea);">
      ${avatar}
    </div>
    <div style="flex:1;min-width:0;">
      <div style="font-size:17px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${name}</div>
      <div style="font-size:13px;color:var(--text-tertiary,#8e8e93);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${persona}</div>
    </div>
  `;
  return card;
}

function renderAvatarHTML(character) {
  const av = character.avatar;
  if (av && (av.startsWith('data:') || av.startsWith('http') || av.startsWith('blob:'))) {
    return `<img src="${escapeAttr(av)}" style="width:100%;height:100%;object-fit:cover;" alt="">`;
  }
  return createIcon('smile', 28).outerHTML;
}

// 更新角色头部（角色字段变更后）
function updateCharacterHeader(overlay, character) {
  const header = overlay.querySelector('#cs-char-header');
  if (!header) return;
  // 只更新名字，避免重画导致闪烁
  const nameEl = header.querySelector('div:nth-child(2) > div:first-child');
  if (nameEl) nameEl.textContent = character.name || character.nickname || '未命名';
}

function mountOverlay(overlay) {
  document.body.appendChild(overlay);
  _currentOverlay = overlay;
  // 阻止背景滚动
  try { document.body.style.overflow = 'hidden'; } catch (e) {}
  // 物理返回键支持（history API）
  try {
    history.pushState({ chatSettings: true }, '');
    const onPop = () => {
      closeChatSettings();
      window.removeEventListener('popstate', onPop);
    };
    window.addEventListener('popstate', onPop);
    overlay._popHandler = onPop;
  } catch (e) {}
}

export function closeChatSettings() {
  if (!_currentOverlay) return;
  const ov = _currentOverlay;
  _currentOverlay = null;
  try {
    if (ov._popHandler) {
      window.removeEventListener('popstate', ov._popHandler);
      // 若是我们 push 的 state 仍在栈顶（页内按钮关闭，而非物理返回键触发），
      // 主动 history.back() 弹掉它，否则会留下幻影历史条目，下次物理返回键空跳一次。
      try {
        if (history.state && history.state.chatSettings) {
          history.back();
        }
      } catch (e) {}
    }
  } catch (e) {}
  try { if (ov.parentNode) ov.parentNode.removeChild(ov); } catch (e) {}
  try { document.body.style.overflow = ''; } catch (e) {}
}

// ════════════════════════════════════════
// 工具
// ════════════════════════════════════════

// 动态读 chat index 的 state（避免顶层循环依赖）
async function readChatState() {
  try {
    const mod = await import('./index.js');
    if (typeof mod.getState === 'function') return mod.getState();
  } catch (e) {}
  return window.__popoChatState || { currentSession: null, currentCharacter: null };
}

// 读全局 AI 配置（绕过 ai-client 避免顶层依赖）
function readAIConfig() {
  try {
    const raw = localStorage.getItem(KEYS.aiConfig);
    if (!raw) return { url: '', apiKey: '', model: 'gpt-4o-mini', temperature: 0.8, maxTokens: 800, style: '', enableChain: false };
    const cfg = JSON.parse(raw);
    return {
      url: cfg.url || '',
      apiKey: cfg.apiKey || '',
      model: cfg.model || 'gpt-4o-mini',
      temperature: cfg.temperature ?? 0.8,
      maxTokens: cfg.maxTokens ?? 800,
      style: cfg.style || '',
      enableChain: !!cfg.enableChain
    };
  } catch (e) {
    return { url: '', apiKey: '', model: 'gpt-4o-mini', temperature: 0.8, maxTokens: 800, style: '', enableChain: false };
  }
}

// 写全局 AI 配置（统一走 ai-client.js 的实现，避免双份逻辑漂移；这里只补一层错误提示）
function saveAIConfig(patch) {
  try {
    saveAIConfigCore(patch);
  } catch (e) {
    console.warn('[chat-settings] 保存全局 AI 配置失败', e);
    showToast('保存出错了，再试一下嘛', 'error');
  }
}
