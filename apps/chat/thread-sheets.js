// apps/chat/thread-sheets.js
// imports:
//   from '../../core/storage.js': getData, setData, getNow
//   from '../../core/ui.js': createIcon, showBottomSheet, hideBottomSheet, showToast
//   from './thread-actions.js': sendThreadMessage, sendTransferMessage
//   from './thread-relationship.js': openRelationshipLockSheet

import {
  getData,
  setData,
  getNow
} from '../../core/storage.js';

import {
  createIcon,
  showBottomSheet,
  hideBottomSheet,
  showToast
} from '../../core/ui.js';

import {
  sendThreadMessage,
  sendTransferMessage
} from './thread-actions.js';

import { openRelationshipLockSheet } from './thread-relationship.js';

const SHEET_STYLE_ID = 'chat-thread-sheets-style';

const DEFAULT_QUICK_REPLIES = [
  '我在',
  '等我一下',
  '好呀',
  '抱抱我',
  '慢慢说',
  '我听着呢'
];

const DEFAULT_MOOD_OPTIONS = [
  {
    id: 'warm',
    title: '暖一点',
    desc: '说话更软一点，慢一点。',
    icon: 'heart',
    text: '我今天想要你温柔一点陪我。'
  },
  {
    id: 'cute',
    title: '可爱一点',
    desc: '语气轻轻的，黏一点。',
    icon: 'sparkles',
    text: '我今天想要更软乎一点的陪伴。'
  },
  {
    id: 'calm',
    title: '安静一点',
    desc: '少说废话，慢慢接住我。',
    icon: 'moon',
    text: '我今天想安静一点，陪我慢慢聊。'
  },
  {
    id: 'clingy',
    title: '黏一点',
    desc: '想被多理理。',
    icon: 'chat',
    text: '我今天有点想你，多陪我一会儿。'
  }
];

// ═══════════════════════════════════════
// 【快捷回复】一键发预设短句
// ═══════════════════════════════════════

export function openQuickReplySheet(state, options = {}) {
  injectStyle();

  const replies = normalizeArray(options.items || getData('chat_quick_replies') || DEFAULT_QUICK_REPLIES);
  const sheet = el('div', 'thread-sheet-wrap');

  sheet.append(
    createSheetHead('快捷回复', '点一下就发出去，适合懒懒的。'),
    createChipGrid(replies.map((item) => ({
      title: String(item).trim(),
      desc: '',
      icon: 'message'
    })), async (item) => {
      if (!options.containerEl) hideBottomSheet();
      await sendThreadMessage(state, item.title, { triggerAI: true });
    }, '没有可用的快捷回复。')
  );

  renderSheet(sheet, options.containerEl);
}

// ═══════════════════════════════════════
// 【心情】快速发一条带情绪的消息
// ═══════════════════════════════════════

export function openMoodSheet(state, options = {}) {
  injectStyle();

  const moods = normalizeArray(options.items || getData('chat_mood_options') || DEFAULT_MOOD_OPTIONS);
  const sheet = el('div', 'thread-sheet-wrap');

  sheet.append(
    createSheetHead('心情', '选一个现在的感觉。'),
    createChipGrid(moods.map((item) => ({
      title: String(item.title || item.name || '').trim(),
      desc: String(item.desc || item.description || '').trim(),
      icon: String(item.icon || 'heart')
    })), async (item) => {
      if (!options.containerEl) hideBottomSheet();
      await sendThreadMessage(state, item.text || item.title, { triggerAI: true });
    }, '还没有心情卡片。')
  );

  renderSheet(sheet, options.containerEl);
}

// ═══════════════════════════════════════
// 【接龙】发一条可继续接的话
// ═══════════════════════════════════════

export function openRelaySheet(state, options = {}) {
  injectStyle();

  const presets = normalizeArray(options.items || getData('chat_relay_presets') || [
    {
      title: '接龙开始',
      desc: '谁来接下一句。',
      text: '我先起个头，谁来接下一句。'
    },
    {
      title: '轮到你啦',
      desc: '轻轻把球丢出去。',
      text: '轮到你啦，快接住。'
    },
    {
      title: '继续吧',
      desc: '让话题别断掉。',
      text: '我们继续吧，别停。'
    }
  ]);

  const sheet = el('div', 'thread-sheet-wrap');

  sheet.append(
    createSheetHead('接龙', '把话题递出去。'),
    createChipGrid(presets.map((item) => ({
      title: String(item.title || '').trim(),
      desc: String(item.desc || '').trim(),
      icon: 'repeat'
    })), async (item) => {
      if (!options.containerEl) hideBottomSheet();
      await sendThreadMessage(state, item.text || item.title, { triggerAI: true });
    }, '还没有接龙内容。')
  );

  renderSheet(sheet, options.containerEl);
}

// ═══════════════════════════════════════
// 【转账】发转账小卡片
// ═══════════════════════════════════════

export function openTransferSheet(state, options = {}) {
  injectStyle();

  const preset = {
    amount: Number(options.amount || 0) || 0,
    note: String(options.note || '').trim(),
    title: String(options.title || '转账小心意').trim(),
    description: String(options.description || '').trim()
  };

  const sheet = el('div', 'thread-sheet-wrap');
  const form = el('section', 'thread-sheet-form');

  const amountInput = numberInput('金额', '输入一个大于 0 的数。', preset.amount || 10, 0.01, 999999, 1);
  const noteInput = textInput('备注', '例如：今天的奶茶。', preset.note || '');
  const titleInput = textInput('标题', '卡片上显示什么名字。', preset.title);
  const descInput = textareaInput('说明', '卡片上的一句小字。', preset.description || '');

  const actions = el('div', 'thread-sheet-actions');

  const cancel = actionButton('先不发', 'ghost');
  cancel.addEventListener('click', () => {
    if (options.containerEl) {
      if (typeof options.onBack === 'function') options.onBack();
    } else {
      hideBottomSheet();
    }
  });

  const send = actionButton('发出去', 'primary');
  send.addEventListener('click', async () => {
    const amount = clampMoney(amountInput.value);
    const note = String(noteInput.value || '').trim();
    const title = String(titleInput.value || '').trim() || '转账小心意';
    const description = String(descInput.value || '').trim() || note || `转账 ¥${formatAmount(amount)}`;

    if (!(amount > 0)) {
      showToast('金额要大于 0');
      return;
    }

    if (!options.containerEl) hideBottomSheet();
    await sendTransferMessage(state, amount, note, {
      title,
      description,
      triggerAI: true
    });
  });

  actions.append(cancel, send);
  form.append(
    amountInput.wrap,
    noteInput.wrap,
    titleInput.wrap,
    descInput.wrap,
    actions
  );

  sheet.append(
    createSheetHead('转账', '发一张会进聊天里的小卡片。'),
    form
  );

  renderSheet(sheet, options.containerEl);
}

// ═══════════════════════════════════════
// 【清上下文】减少当前聊天可见上下文
// ═══════════════════════════════════════

export function openClearContextSheet(state, options = {}) {
  injectStyle();

  const visibleCount = Number(state?.visibleCount || 12);
  const sheet = el('div', 'thread-sheet-wrap');

  const wrap = el('section', 'thread-sheet-card');
  wrap.append(
    el('div', 'thread-sheet-title', '清上下文'),
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
  cancel.addEventListener('click', () => {
    if (options.containerEl) {
      if (typeof options.onBack === 'function') options.onBack();
    } else {
      hideBottomSheet();
    }
  });

  const save = actionButton('确定', 'primary');
  save.addEventListener('click', async () => {
    const next = clampNumber(slider.value, 4, 40);
    state.visibleCount = next;
    setData(getVisibleCountKey(state), next);

    if (!options.containerEl) hideBottomSheet();

    if (typeof options.onChange === 'function') {
      await options.onChange(next);
      return;
    }

    if (typeof state?.reloadAndRender === 'function') {
      await state.reloadAndRender();
    }
    showToast('已经收好了');
  });

  actions.append(cancel, save);
  wrap.append(slider, valueText, actions);
  sheet.append(createSheetHead('清上下文', '把聊天缩短一点。'), wrap);

  renderSheet(sheet, options.containerEl);
}

// ═══════════════════════════════════════
// 【MCP】工具入口占位抽屉
// ═══════════════════════════════════════

export function openMcpSheet(state, options = {}) {
  injectStyle();

  const sheet = el('div', 'thread-sheet-wrap');
  const list = normalizeArray(options.items || getData('chat_mcp_tools') || []);

  sheet.append(
    createSheetHead('MCP', '这里放外部工具入口。'),
    list.length
      ? createChipGrid(list.map((item) => ({
          title: String(item.title || item.name || '工具').trim(),
          desc: String(item.desc || item.description || '').trim(),
          icon: String(item.icon || 'web')
        })), async (item) => {
          if (!options.containerEl) hideBottomSheet();
          if (typeof item.onClick === 'function') {
            await item.onClick(state, item);
            return;
          }
          showToast('这个工具还没接上');
        }, '还没有工具。')
      : createEmptyTip('这里还没有接入外部工具。')
  );

  renderSheet(sheet, options.containerEl);
}

// ═══════════════════════════════════════
// 【语音文字】发一条可当作语音文字的消息
// ═══════════════════════════════════════

export function openVoiceTextSheet(state, options = {}) {
  injectStyle();

  const sheet = el('div', 'thread-sheet-wrap');
  const form = el('section', 'thread-sheet-form');

  const textInputEl = textareaInput('文字', '这里先手动输入要发的话。', String(options.text || '').trim() || '');
  const noteInput = textInput('备注', '可不填。', String(options.note || '').trim() || '');

  const actions = el('div', 'thread-sheet-actions');

  const cancel = actionButton('先不发', 'ghost');
  cancel.addEventListener('click', () => {
    if (options.containerEl) {
      if (typeof options.onBack === 'function') options.onBack();
    } else {
      hideBottomSheet();
    }
  });

  const send = actionButton('发出去', 'primary');
  send.addEventListener('click', async () => {
    const text = String(textInputEl.input.value || '').trim();
    const note = String(noteInput.input.value || '').trim();

    if (!text) {
      showToast('先写点内容吧');
      return;
    }

    if (!options.containerEl) hideBottomSheet();
    await sendThreadMessage(state, text, {
      type: 'voice',
      note,
      triggerAI: true
    });
  });

  actions.append(cancel, send);
  form.append(textInputEl.wrap, noteInput.wrap, actions);

  sheet.append(
    createSheetHead('语音文字', '先写成文字发出去，之后再看要不要做成语音。'),
    form
  );

  renderSheet(sheet, options.containerEl);
}

// ═══════════════════════════════════════
// 【关系锁入口】统一转给关系锁抽屉
// ═══════════════════════════════════════

export function openRelationshipSheet(state, options = {}) {
  // 修复：把 containerEl 和 onBack 透传给关系锁函数
  return openRelationshipLockSheet(state, {
    ...options,
    containerEl: options.containerEl || null,
    onBack: options.onBack || null
  });
}

// ═══════════════════════════════════════
// 【渲染分发】有容器就渲染进去，没有就开抽屉
// ═══════════════════════════════════════

function renderSheet(sheet, containerEl) {
  if (containerEl) {
    containerEl.replaceChildren(sheet);
    return;
  }

  showBottomSheet(sheet);
}

// ═══════════════════════════════════════
// 【公共工具】标题、输入、卡片和按钮
// ═══════════════════════════════════════

function createSheetHead(title, desc) {
  const head = el('div', 'thread-sheet-head');
  head.append(
    el('div', 'thread-sheet-title', title || ''),
    el('div', 'thread-sheet-desc', desc || '')
  );
  return head;
}

function createChipGrid(items, onPick, emptyText) {
  const wrap = el('div', 'thread-chip-grid');

  if (!items.length) {
    wrap.append(createEmptyTip(emptyText || '没有内容。'));
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

function createEmptyTip(text) {
  return el('div', 'thread-sheet-empty', text || '');
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

function getVisibleCountKey(state) {
  if (!state?.characterId) return 'chat_visible_count_default';
  return `chat_${state.characterId}_visible_count`;
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

function formatAmount(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '0.00';
  return number.toFixed(2);
}

function normalizeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

// ═══════════════════════════════════════
// 【样式】底部抽屉、卡片和按钮
// ═══════════════════════════════════════

function injectStyle() {
  if (document.getElementById(SHEET_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = SHEET_STYLE_ID;
  style.textContent = `
    .thread-sheet-wrap{
      padding:6px 20px 20px;
      color:var(--text-primary);
    }

    .thread-sheet-head{
      margin-bottom:16px;
    }

    .thread-sheet-title{
      color:var(--text-primary);
      font-size:17px;
      font-weight:600;
      line-height:1.35;
    }

    .thread-sheet-desc{
      margin-top:4px;
      color:var(--text-secondary);
      font-size:13px;
      line-height:1.55;
    }

    .thread-sheet-card,
    .thread-sheet-form{
      padding:14px;
      border-radius:24px;
      background:var(--bg-card);
      box-shadow:var(--shadow-sm);
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
      transition:all 200ms ease;
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
      .thread-chip-grid{
        grid-template-columns:1fr;
      }

      .thread-sheet-actions{
        grid-template-columns:1fr;
      }
    }

    @media(prefers-reduced-motion:reduce){
      .thread-chip-card,
      .thread-sheet-btn{
        transition:none;
      }
    }
  `;

  document.head.appendChild(style);
}

// 依赖：../../core/storage.js(getData,setData,getNow)；../../core/ui.js(createIcon,showBottomSheet,hideBottomSheet,showToast)；./thread-actions.js(sendThreadMessage,sendTransferMessage)；./thread-relationship.js(openRelationshipLockSheet)
