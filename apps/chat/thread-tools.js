// apps/chat/thread-tools.js
// imports:
//   from '../../core/ui.js': createIcon, showToast
//   from '../../core/storage.js': getData, setData
//   from './thread-call.js': mountThreadCall
//   from './thread-actions.js': sendDiceMessage, sendRpsMessage, sendThreadMessage, sendTransferMessage

import { createIcon, showToast } from '../../core/ui.js';
import { getData, setData } from '../../core/storage.js';
import { mountThreadCall } from './thread-call.js';
import { sendDiceMessage, sendRpsMessage, sendThreadMessage, sendTransferMessage } from './thread-actions.js';

const STYLE_ID = 'chat-thread-tools-style';

const DEFAULT_TOOLS = [
  { id: 'quickReply', title: '快捷回复', desc: '一键发短句', icon: 'message' },
  { id: 'mood', title: '心情', desc: '发点情绪', icon: 'heart' },
  { id: 'relay', title: '接龙', desc: '把话题丢出去', icon: 'repeat' },
  { id: 'transfer', title: '转账', desc: '发小卡片', icon: 'wallet' },
  { id: 'voiceText', title: '语音文字', desc: '先发文字', icon: 'mic' },
  { id: 'clearContext', title: '清上下文', desc: '收短一点', icon: 'trash' },
  { id: 'relationship', title: '关系锁', desc: '看当前状态', icon: 'lock' },
  { id: 'call', title: '电话', desc: '打给 TA', icon: 'phone' },
  { id: 'dice', title: '骰子', desc: '摇一把', icon: 'dice' },
  { id: 'rps', title: '猜拳', desc: '来一局', icon: 'hand' },
  { id: 'mcp', title: 'MCP', desc: '外部工具', icon: 'web' }
];

const DEFAULT_QUICK_REPLIES = ['我在', '等我一下', '好呀', '抱抱我', '慢慢说', '我听着呢'];

const DEFAULT_MOOD_OPTIONS = [
  { id: 'warm', title: '暖一点', desc: '说话更软一点，慢一点。', icon: 'heart', text: '我今天想要你温柔一点陪我。' },
  { id: 'cute', title: '可爱一点', desc: '语气轻轻的，黏一点。', icon: 'sparkles', text: '我今天想要更软乎一点的陪伴。' },
  { id: 'calm', title: '安静一点', desc: '少说废话，慢慢接住我。', icon: 'moon', text: '我今天想安静一点，陪我慢慢聊。' },
  { id: 'clingy', title: '黏一点', desc: '想被多理理。', icon: 'chat', text: '我今天有点想你，多陪我一会儿。' }
];

const toolState = {
  containerEl: null,
  state: null,
  options: null,
  currentView: 'grid',
  currentTool: null
};

// ═══════════════════════════════════════
// 【工具宫格】横向滑动两行图标工具入口
// ═══════════════════════════════════════

export function createThreadToolsGrid(state, options = {}) {
  injectStyle();

  toolState.containerEl = options.containerEl || null;
  toolState.state = state;
  toolState.options = options;
  toolState.currentView = 'grid';
  toolState.currentTool = null;

  return createToolGridView();
}

// ───────────────────
// 工具宫格主界面
// ───────────────────

function createToolGridView() {
  const view = el('div', 'thread-tools-grid-view');

  const header = el('div', 'thread-tools-header');
  header.append(
    el('div', 'thread-tools-title', toolState.options?.title || '小工具'),
    el('div', 'thread-tools-subtitle', toolState.options?.subtitle || '横向滑一滑')
  );

  const scroller = el('div', 'thread-tools-scroller');
  const grid = el('div', 'thread-tools-grid');

  const tools = normalizeList(toolState.options?.tools || DEFAULT_TOOLS);

  tools.forEach((item) => {
    const button = el('button', 'thread-tool-card');
    button.type = 'button';

    const icon = el('span', 'thread-tool-icon');
    icon.appendChild(createIcon(item.icon || 'message', 18));

    const text = el('span', 'thread-tool-text');
    text.append(
      el('span', 'thread-tool-title', item.title || ''),
      el('span', 'thread-tool-desc', item.desc || '')
    );

    button.append(icon, text);
    button.addEventListener('click', () => handleToolClick(item), { passive: true });

    grid.append(button);
  });

  scroller.append(grid);
  view.append(header, scroller);
  return view;
}

// ───────────────────
// 工具详情页
// ───────────────────

function createToolDetailView(item, bodyContent) {
  const view = el('div', 'thread-tools-detail-view');

  const header = el('div', 'thread-tools-detail-header');

  const back = iconButton('arrow-left', '返回');
  back.addEventListener('click', () => switchToGrid(), { passive: true });

  header.append(
    back,
    el('div', 'thread-tools-detail-title', item?.title || '工具'),
    el('div', 'thread-tools-detail-spacer')
  );

  const body = el('div', 'thread-tools-detail-body');
  if (bodyContent) {
    body.appendChild(bodyContent);
  } else {
    body.appendChild(el('div', 'thread-tools-detail-empty', '加载中'));
  }

  view.append(header, body);
  return view;
}

function switchToGrid() {
  toolState.currentView = 'grid';
  toolState.currentTool = null;

  if (!toolState.containerEl) return;
  toolState.containerEl.replaceChildren(createToolGridView());
}

function switchToDetail(item, bodyContent) {
  toolState.currentView = 'detail';
  toolState.currentTool = item;

  if (!toolState.containerEl) return;
  toolState.containerEl.replaceChildren(createToolDetailView(item, bodyContent));
}

// ═══════════════════════════════════════
// 【工具点击】根据类型切换详情页内容
// ═══════════════════════════════════════

async function handleToolClick(item) {
  const id = String(item?.id || '').trim();
  if (!id) return;

  const state = toolState.state;
  const options = toolState.options || {};

  if (typeof options.onPick === 'function') {
    const handled = await options.onPick(item, state);
    if (handled) return;
  }

  if (id === 'quickReply') {
    switchToDetail(item, createQuickReplyContent(state));
    return;
  }

  if (id === 'mood') {
    switchToDetail(item, createMoodContent(state));
    return;
  }

  if (id === 'relay') {
    switchToDetail(item, createRelayContent(state));
    return;
  }

  if (id === 'transfer') {
    switchToDetail(item, createTransferContent(state));
    return;
  }

  if (id === 'clearContext') {
    switchToDetail(item, createClearContextContent(state));
    return;
  }

  if (id === 'voiceText') {
    switchToDetail(item, createVoiceTextContent(state));
    return;
  }

  if (id === 'mcp') {
    switchToDetail(item, createMcpContent(state));
    return;
  }

  if (id === 'relationship') {
    switchToDetail(item, createRelationshipContent(state));
    return;
  }

  if (id === 'call') {
    await mountThreadCall(document.body, {
      state,
      character: state?.character || null,
      characterId: state?.characterId || '',
      close: typeof options.onCloseCall === 'function' ? options.onCloseCall : null,
      onReject: typeof options.onRejectCall === 'function' ? options.onRejectCall : null
    });
    return;
  }

  if (id === 'dice') {
    await sendDiceMessage(state, { triggerAI: true });
    return;
  }

  if (id === 'rps') {
    await sendRpsMessage(state, { triggerAI: true });
    return;
  }

  showToast('这个工具还没接好');
}

// ═══════════════════════════════════════
// 【快捷回复】一键发预设短句
// ═══════════════════════════════════════

function createQuickReplyContent(state) {
  const replies = normalizeList(getData('chat_quick_replies') || DEFAULT_QUICK_REPLIES);
  return createChipGrid(
    replies.map((item) => ({ title: String(item).trim(), desc: '', icon: 'message' })),
    async (chip) => {
      await sendThreadMessage(state, chip.title, { triggerAI: true });
      switchToGrid();
    },
    '没有可用的快捷回复。'
  );
}

// ═══════════════════════════════════════
// 【心情】快速发一条带情绪的消息
// ═══════════════════════════════════════

function createMoodContent(state) {
  const moods = normalizeList(getData('chat_mood_options') || DEFAULT_MOOD_OPTIONS);
  return createChipGrid(
    moods.map((item) => ({
      title: String(item.title || item.name || '').trim(),
      desc: String(item.desc || item.description || '').trim(),
      icon: String(item.icon || 'heart'),
      text: item.text
    })),
    async (chip) => {
      await sendThreadMessage(state, chip.text || chip.title, { triggerAI: true });
      switchToGrid();
    },
    '还没有心情卡片。'
  );
}

// ═══════════════════════════════════════
// 【接龙】发一条可继续接的话
// ═══════════════════════════════════════

function createRelayContent(state) {
  const presets = normalizeList(getData('chat_relay_presets') || [
    { title: '接龙开始', desc: '谁来接下一句。', text: '我先起个头，谁来接下一句。' },
    { title: '轮到你啦', desc: '轻轻把球丢出去。', text: '轮到你啦，快接住。' },
    { title: '继续吧', desc: '让话题别断掉。', text: '我们继续吧，别停。' }
  ]);

  return createChipGrid(
    presets.map((item) => ({
      title: String(item.title || '').trim(),
      desc: String(item.desc || '').trim(),
      icon: 'repeat',
      text: item.text
    })),
    async (chip) => {
      await sendThreadMessage(state, chip.text || chip.title, { triggerAI: true });
      switchToGrid();
    },
    '还没有接龙内容。'
  );
}

// ═══════════════════════════════════════
// 【转账】发转账小卡片
// ═══════════════════════════════════════

function createTransferContent(state) {
  const form = el('section', 'thread-sheet-form');

  const amountInput = numberInput('金额', '输入一个大于 0 的数。', 10, 0.01, 999999, 1);
  const noteInput = textInput('备注', '例如：今天的奶茶。', '');
  const titleInput = textInput('标题', '卡片上显示什么名字。', '转账小心意');

  const actions = el('div', 'thread-sheet-actions');

  const cancel = actionButton('先不发', 'ghost');
  cancel.addEventListener('click', () => switchToGrid());

  const send = actionButton('发出去', 'primary');
  send.addEventListener('click', async () => {
    const amount = clampMoney(amountInput.input.value);
    const note = String(noteInput.input.value || '').trim();
    const title = String(titleInput.input.value || '').trim() || '转账小心意';

    if (!(amount > 0)) {
      showToast('金额要大于 0');
      return;
    }

    await sendTransferMessage(state, amount, note, { title, triggerAI: true });
    switchToGrid();
  });

  actions.append(cancel, send);
  form.append(amountInput.wrap, noteInput.wrap, titleInput.wrap, actions);

  return form;
}

// ═══════════════════════════════════════
// 【清上下文】减少当前聊天可见上下文
// ═══════════════════════════════════════

function createClearContextContent(state) {
  const visibleCount = Number(state?.visibleCount || 12);
  const wrap = el('section', 'thread-sheet-card');

  wrap.append(
    el('div', 'thread-sheet-desc', '只保留更近的消息，页面会轻一点。'),
    el('div', 'thread-sheet-note', `当前会显示最近 ${visibleCount} 条。`)
  );

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'thread-sheet-slider';
  slider.min = '4';
  slider.max = '40';
  slider.step = '1';
  slider.value = String(clampNumber(visibleCount, 4, 40));

  const valueText = el('div', 'thread-sheet-slider-value', `最近 ${slider.value} 条`);

  slider.addEventListener('input', () => {
    valueText.textContent = `最近 ${slider.value} 条`;
  });

  const actions = el('div', 'thread-sheet-actions');

  const cancel = actionButton('取消', 'ghost');
  cancel.addEventListener('click', () => switchToGrid());

  const save = actionButton('确定', 'primary');
  save.addEventListener('click', async () => {
    const next = clampNumber(slider.value, 4, 40);
    state.visibleCount = next;
    setData(getVisibleCountKey(state), next);

    if (typeof state?.reloadAndRender === 'function') {
      await state.reloadAndRender();
    }

    showToast('已经收好了');
    switchToGrid();
  });

  actions.append(cancel, save);
  wrap.append(slider, valueText, actions);

  return wrap;
}

// ═══════════════════════════════════════
// 【语音文字】发一条可当作语音文字的消息
// ═══════════════════════════════════════

function createVoiceTextContent(state) {
  const form = el('section', 'thread-sheet-form');

  const textInputEl = textareaInput('文字', '这里先手动输入要发的话。', '');
  const noteInput = textInput('备注', '可不填。', '');

  const actions = el('div', 'thread-sheet-actions');

  const cancel = actionButton('先不发', 'ghost');
  cancel.addEventListener('click', () => switchToGrid());

  const send = actionButton('发出去', 'primary');
  send.addEventListener('click', async () => {
    const text = String(textInputEl.input.value || '').trim();
    const note = String(noteInput.input.value || '').trim();

    if (!text) {
      showToast('先写点内容吧');
      return;
    }

    await sendThreadMessage(state, text, { type: 'voice', note, triggerAI: true });
    switchToGrid();
  });

  actions.append(cancel, send);
  form.append(textInputEl.wrap, noteInput.wrap, actions);

  return form;
}

// ═══════════════════════════════════════
// 【MCP】工具入口占位
// ═══════════════════════════════════════

function createMcpContent(state) {
  const list = normalizeList(getData('chat_mcp_tools') || []);

  if (!list.length) {
    return el('div', 'thread-tools-detail-empty', '这里还没有接入外部工具。');
  }

  return createChipGrid(
    list.map((item) => ({
      title: String(item.title || item.name || '工具').trim(),
      desc: String(item.desc || item.description || '').trim(),
      icon: String(item.icon || 'web'),
      onClick: item.onClick
    })),
    async (chip) => {
      if (typeof chip.onClick === 'function') {
        await chip.onClick(state, chip);
        return;
      }
      showToast('这个工具还没接上');
    },
    '还没有工具。'
  );
}

// ═══════════════════════════════════════
// 【关系锁】占位
// ═══════════════════════════════════════

function createRelationshipContent(state) {
  return el('div', 'thread-tools-detail-empty', '关系锁详情晚点再接。');
}

// ═══════════════════════════════════════
// 【公共组件】卡片宫格和表单输入
// ═══════════════════════════════════════

function createChipGrid(items, onPick, emptyText) {
  const wrap = el('div', 'thread-chip-grid');

  if (!items.length) {
    wrap.append(el('div', 'thread-sheet-empty', emptyText || '没有内容。'));
    return wrap;
  }

  items.forEach((item) => {
    const button = el('button', 'thread-chip-card');
    button.type = 'button';

    const icon = el('span', 'thread-chip-icon');
    icon.appendChild(createIcon(item.icon || 'message', 18));

    const text = el('span', 'thread-chip-text');
    text.append(
      el('span', 'thread-chip-title', item.title || ''),
      el('span', 'thread-chip-desc', item.desc || '')
    );

    button.append(icon, text);
    button.addEventListener('click', async () => {
      await onPick?.(item);
    });

    wrap.append(button);
  });

  return wrap;
}

function textInput(title, desc, value) {
  const wrap = el('section', 'thread-sheet-field');
  wrap.append(
    el('div', 'thread-sheet-field-title', title || ''),
    el('div', 'thread-sheet-field-desc', desc || '')
  );

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'thread-sheet-input';
  input.value = String(value || '');
  input.autocomplete = 'off';
  input.setAttribute('spellcheck', 'false');

  wrap.append(input);
  return { wrap, input };
}

function textareaInput(title, desc, value) {
  const wrap = el('section', 'thread-sheet-field');
  wrap.append(
    el('div', 'thread-sheet-field-title', title || ''),
    el('div', 'thread-sheet-field-desc', desc || '')
  );

  const input = document.createElement('textarea');
  input.className = 'thread-sheet-textarea';
  input.value = String(value || '');
  input.rows = 3;
  input.autocomplete = 'off';
  input.setAttribute('spellcheck', 'false');

  wrap.append(input);
  return { wrap, input };
}

function numberInput(title, desc, value, min, max, step) {
  const wrap = el('section', 'thread-sheet-field');
  wrap.append(
    el('div', 'thread-sheet-field-title', title || ''),
    el('div', 'thread-sheet-field-desc', desc || '')
  );

  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'thread-sheet-input';
  input.value = String(value ?? 0);
  input.min = String(min);
  input.max = String(max);
  input.step = String(step || 1);

  wrap.append(input);
  return { wrap, input };
}

function actionButton(text, kind = 'ghost') {
  const button = el('button', `thread-sheet-btn ${kind}`);
  button.type = 'button';
  button.textContent = text || '';
  return button;
}

function iconButton(iconName, label) {
  const button = el('button', 'thread-tools-icon-btn');
  button.type = 'button';
  button.setAttribute('aria-label', label || iconName);
  button.appendChild(createIcon(iconName, 18));
  return button;
}

// ═══════════════════════════════════════
// 【工具函数】数组、数字、DOM
// ═══════════════════════════════════════

function normalizeList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function clampMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Number(number.toFixed(2)));
}

function getVisibleCountKey(state) {
  if (!state?.characterId) return 'chat_visible_count_default';
  return `chat_${state.characterId}_visible_count`;
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}
// ═══════════════════════════════════════
// 【样式】工具宫格、横向滑动、详情页、表单和按钮反馈
// ═══════════════════════════════════════

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .thread-tools-grid-view,
    .thread-tools-detail-view{
      display:flex;
      flex-direction:column;
      gap:14px;
      min-height:0;
    }

    .thread-tools-header{
      display:flex;
      flex-direction:column;
      gap:4px;
    }

    .thread-tools-title{
      color:var(--text-primary);
      font-size:17px;
      font-weight:600;
      line-height:1.35;
    }

    .thread-tools-subtitle{
      color:var(--text-secondary);
      font-size:13px;
      line-height:1.5;
    }

    .thread-tools-scroller{
      overflow-x:auto;
      overflow-y:hidden;
      -webkit-overflow-scrolling:touch;
      overscroll-behavior-x:contain;
      padding-bottom:4px;
    }

    .thread-tools-grid{
      display:grid;
      grid-template-columns:repeat(auto-fill,minmax(152px,1fr));
      grid-auto-flow:column;
      grid-template-rows:repeat(2,minmax(0,1fr));
      gap:10px;
      width:max-content;
      min-width:100%;
    }

    .thread-tool-card{
      min-width:152px;
      min-height:76px;
      display:grid;
      grid-template-columns:auto minmax(0,1fr);
      align-items:center;
      gap:10px;
      padding:12px;
      border-radius:20px;
      background:var(--bg-card);
      color:var(--text-primary);
      box-shadow:var(--shadow-sm);
      text-align:left;
      transition:transform 200ms ease;
    }

    .thread-tool-card:active{
      transform:scale(.96);
    }

    .thread-tool-icon{
      width:38px;
      height:38px;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      border-radius:14px;
      background:var(--surface-muted);
      color:var(--accent);
      box-shadow:var(--shadow-sm);
      flex:0 0 auto;
    }

    .thread-tool-text{
      min-width:0;
      display:flex;
      flex-direction:column;
      gap:4px;
    }

    .thread-tool-title{
      color:var(--text-primary);
      font-size:14px;
      font-weight:600;
      line-height:1.35;
      overflow:hidden;
      white-space:nowrap;
      text-overflow:ellipsis;
    }

    .thread-tool-desc{
      color:var(--text-secondary);
      font-size:12px;
      line-height:1.45;
      overflow:hidden;
      white-space:nowrap;
      text-overflow:ellipsis;
    }

    .thread-tools-detail-header{
      display:grid;
      grid-template-columns:auto minmax(0,1fr) auto;
      align-items:center;
      gap:12px;
    }

    .thread-tools-detail-title{
      color:var(--text-primary);
      font-size:17px;
      font-weight:600;
      line-height:1.35;
      text-align:center;
    }

    .thread-tools-detail-spacer{
      width:44px;
      height:44px;
    }

    .thread-tools-icon-btn{
      width:44px;
      height:44px;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      border-radius:16px;
      background:var(--bg-card);
      color:var(--text-primary);
      box-shadow:var(--shadow-sm);
      transition:transform 200ms ease;
    }

    .thread-tools-icon-btn:active{
      transform:scale(.96);
    }

    .thread-tools-detail-body{
      min-height:240px;
      overflow-y:auto;
      -webkit-overflow-scrolling:touch;
    }

    .thread-tools-detail-empty{
      padding:32px 16px;
      color:var(--text-secondary);
      font-size:13px;
      line-height:1.6;
      text-align:center;
    }

    .thread-chip-grid{
      display:grid;
      grid-template-columns:repeat(2,minmax(0,1fr));
      gap:10px;
    }

    .thread-chip-card{
      min-height:74px;
      display:grid;
      grid-template-columns:auto minmax(0,1fr);
      align-items:center;
      gap:10px;
      padding:12px;
      border-radius:18px;
      background:var(--surface-muted);
      color:var(--text-primary);
      box-shadow:var(--shadow-sm);
      text-align:left;
      transition:transform 200ms ease;
    }

    .thread-chip-card:active,
    .thread-sheet-btn:active{
      transform:scale(.96);
    }

    .thread-chip-icon{
      width:36px;
      height:36px;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      border-radius:14px;
      background:var(--bg-card);
      color:var(--accent);
      box-shadow:var(--shadow-sm);
      flex:0 0 auto;
    }

    .thread-chip-text{
      min-width:0;
      display:flex;
      flex-direction:column;
      gap:4px;
    }

    .thread-chip-title{
      color:var(--text-primary);
      font-size:14px;
      font-weight:600;
      line-height:1.35;
      overflow:hidden;
      white-space:nowrap;
      text-overflow:ellipsis;
    }

    .thread-chip-desc{
      color:var(--text-secondary);
      font-size:12px;
      line-height:1.45;
      overflow:hidden;
      white-space:nowrap;
      text-overflow:ellipsis;
    }

    .thread-sheet-card,
    .thread-sheet-form{
      padding:14px;
      border-radius:24px;
      background:var(--bg-card);
      box-shadow:var(--shadow-sm);
    }

    .thread-sheet-desc{
      color:var(--text-secondary);
      font-size:13px;
      line-height:1.55;
    }

    .thread-sheet-note{
      margin-top:8px;
      color:var(--text-hint);
      font-size:12px;
      line-height:1.5;
    }

    .thread-sheet-empty{
      padding:16px 12px;
      border-radius:18px;
      background:var(--surface-muted);
      color:var(--text-secondary);
      font-size:13px;
      line-height:1.6;
      text-align:center;
    }

    .thread-sheet-field{
      margin-top:12px;
      display:flex;
      flex-direction:column;
      gap:8px;
    }

    .thread-sheet-field:first-child{
      margin-top:0;
    }

    .thread-sheet-field-title{
      color:var(--text-primary);
      font-size:14px;
      font-weight:600;
      line-height:1.35;
    }

    .thread-sheet-field-desc{
      color:var(--text-secondary);
      font-size:12px;
      line-height:1.5;
    }

    .thread-sheet-input,
    .thread-sheet-textarea{
      width:100%;
      border-radius:18px;
      background:var(--surface-muted);
      color:var(--text-primary);
      box-shadow:var(--shadow-sm);
      font:inherit;
      font-size:16px;
      line-height:1.6;
      -webkit-appearance:none;
      appearance:none;
    }

    .thread-sheet-input{
      min-height:44px;
      padding:0 12px;
    }

    .thread-sheet-textarea{
      min-height:96px;
      padding:11px 12px;
      resize:none;
    }

    .thread-sheet-slider{
      width:100%;
      margin-top:12px;
      accent-color:var(--accent);
    }

    .thread-sheet-slider-value{
      margin-top:8px;
      color:var(--text-hint);
      font-size:12px;
      line-height:1.4;
    }

    .thread-sheet-actions{
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:10px;
      margin-top:14px;
    }

    .thread-sheet-btn{
      min-height:44px;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      border-radius:16px;
      box-shadow:var(--shadow-sm);
      font:inherit;
      font-size:14px;
      font-weight:600;
      transition:all 200ms ease;
    }

    .thread-sheet-btn.ghost{
      background:var(--bg-card);
      color:var(--text-secondary);
    }

    .thread-sheet-btn.primary{
      background:var(--accent);
      color:var(--bubble-user-text);
    }

    @media(max-width:430px){
      .thread-tools-grid{
        grid-template-columns:repeat(auto-fill,minmax(140px,1fr));
      }

      .thread-tool-card{
        min-width:140px;
      }

      .thread-chip-grid{
        grid-template-columns:1fr;
      }

      .thread-sheet-actions{
        grid-template-columns:1fr;
      }
    }

    @media(prefers-reduced-motion:reduce){
      .thread-tool-card,
      .thread-tools-icon-btn,
      .thread-chip-card,
      .thread-sheet-btn{
        transition:none;
      }
    }
  `;

  document.head.appendChild(style);
}

// 依赖：../../core/ui.js(createIcon,showToast)；../../core/storage.js(getData,setData)；./thread-call.js(mountThreadCall)；./thread-actions.js(sendDiceMessage,sendRpsMessage,sendThreadMessage,sendTransferMessage)
