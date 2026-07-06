// apps/chat/chat-settings/widgets.js
// 聊天设置页共用控件与偏好存储助手——所有分组文件都从这里拿表单零件。
// 红线：图标只准 SVG 线稿，禁止任何 emoji 字符；文案软萌友好。
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/util.js, core/events.js

import { KEYS } from '../../../core/storage-keys.js';
import { getData, setData } from '../../../core/storage.js';
import { createIcon, registerIcon, showToast } from '../../../core/ui.js';
import { injectStyle, clamp, isUsableImage, cssUrl } from '../../../core/util.js';
import bus from '../../../core/events.js';
import { escapeHTML, escapeAttr } from '../shared-utils.js';

// 注册本模块用到的额外图标（幂等，重复注册无副作用）
registerIcon('file', 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M9 13h6 M9 17h6');
registerIcon('location', 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6z');
registerIcon('contact', 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75');
registerIcon('image', 'M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z M8.5 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M21 15l-5-5L5 21');
registerIcon('link', 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71');
registerIcon('arrow-up', 'M12 19V5 M5 12l7-7 7 7');
registerIcon('arrow-down', 'M12 5v14 M19 12l-7 7-7-7');
registerIcon('users', 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75');
registerIcon('send', 'M22 2L11 13 M22 2l-7 20-4-9-9-4 20-7z');
registerIcon('alert', 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01');
registerIcon('save', 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z M17 21v-8H7v8 M7 3v5h8');
registerIcon('palette', 'M12 2C6.49 2 2 6.49 2 12s4.49 10 10 10c1.38 0 2.5-1.12 2.5-2.5 0-.61-.23-1.18-.61-1.62-.42-.48-.62-1.06-.62-1.62 0-1.38 1.12-2.5 2.5-2.5H16c3.31 0 6-2.69 6-6 0-4.96-4.49-9-10-9z M6.5 12a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M9.5 7a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M14.5 7a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M17.5 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z');
registerIcon('tag', 'M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z M7 7h.01');
registerIcon('sliders', 'M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6');
registerIcon('sparkle', 'M12 3l1.9 5.8L20 10l-5.8 1.9L12 18l-1.9-5.8L4 10l5.8-1.2L12 3z');

// ════════════════════════════════════════
// 样式注入（幂等）
// ════════════════════════════════════════

let _styleInjected = false;
export function ensureSettingsStyle() {
  if (_styleInjected) return;
  _styleInjected = true;
  injectStyle('chat-settings-style', `
    .chat-settings-page {
      position: fixed; inset: 0; z-index: 9000;
      display: flex; flex-direction: column;
      background: var(--bg-base, #f5f5f7);
      color: var(--text-primary, #1c1c1e);
      font-size: 15px;
      animation: chat-settings-in .22s ease;
    }
    @keyframes chat-settings-in {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .chat-settings-page .app-header {
      background: var(--bg-card, #fff);
      border-bottom: 1px solid var(--border-soft, rgba(0,0,0,.06));
    }
    .chat-settings-scroll {
      flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch;
      padding: 12px 14px calc(32px + env(safe-area-inset-bottom));
      max-width: 720px; width: 100%; margin: 0 auto; box-sizing: border-box;
    }
    .chat-settings-section { margin-bottom: 12px; }
    .chat-settings-section-title {
      font-size: 12px; color: var(--text-tertiary, #8e8e93);
      padding: 12px 6px 6px; letter-spacing: .3px;
      text-transform: uppercase;
    }
    /* 表单行 */
    .cs-field {
      background: var(--bg-card, #fff);
      border-radius: 12px; padding: 12px 14px;
      margin-bottom: 8px; display: flex; flex-direction: column;
      gap: 6px;
    }
    .cs-field-row {
      display: flex; align-items: center; gap: 10px;
      min-height: 24px;
    }
    .cs-field-label { flex: 1; font-size: 15px; }
    .cs-field-label .cs-label-title { font-weight: 500; }
    .cs-field-helper {
      font-size: 12px; color: var(--text-tertiary, #8e8e93);
      line-height: 1.4; padding-left: 0;
    }
    .cs-field-stack { display: flex; flex-direction: column; gap: 4px; }
    .cs-field-stack > .cs-field-label { flex: none; }
    /* 输入框 */
    .cs-input, .cs-textarea, .cs-select {
      width: 100%; box-sizing: border-box;
      background: var(--bg-base, #f5f5f7);
      border: 1px solid var(--border-soft, rgba(0,0,0,.08));
      border-radius: 10px; padding: 10px 12px;
      color: var(--text-primary, #1c1c1e);
      font-size: 15px; font-family: inherit;
      transition: border-color .15s;
    }
    .cs-input:focus, .cs-textarea:focus, .cs-select:focus {
      outline: none; border-color: var(--accent, #007aff);
    }
    .cs-textarea { resize: vertical; min-height: 72px; line-height: 1.5; }
    .cs-input-row { display: flex; align-items: center; gap: 8px; }
    .cs-input-row .cs-input { flex: 1; }
    /* 开关 */
    .cs-toggle {
      flex: none; width: 46px; height: 28px; border-radius: 999px;
      background: var(--bg-base, #e5e5ea); border: none; cursor: pointer;
      position: relative; transition: background .2s; padding: 0;
    }
    .cs-toggle::after {
      content: ''; position: absolute; top: 2px; left: 2px;
      width: 24px; height: 24px; border-radius: 50%;
      background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.2);
      transition: transform .2s;
    }
    .cs-toggle[aria-checked="true"] {
      background: var(--accent, #007aff);
    }
    .cs-toggle[aria-checked="true"]::after { transform: translateX(18px); }
    .cs-toggle:disabled { opacity: .5; cursor: not-allowed; }
    /* 滑块 */
    .cs-slider-row { display: flex; align-items: center; gap: 12px; }
    .cs-slider {
      flex: 1; -webkit-appearance: none; appearance: none;
      height: 4px; border-radius: 2px;
      background: var(--bg-base, #e5e5ea); outline: none;
    }
    .cs-slider::-webkit-slider-thumb {
      -webkit-appearance: none; appearance: none;
      width: 22px; height: 22px; border-radius: 50%;
      background: var(--accent, #007aff); cursor: pointer;
      box-shadow: 0 1px 4px rgba(0,0,0,.2); border: 2px solid #fff;
    }
    .cs-slider::-moz-range-thumb {
      width: 22px; height: 22px; border-radius: 50%;
      background: var(--accent, #007aff); cursor: pointer;
      border: 2px solid #fff;
    }
    .cs-slider-value {
      min-width: 48px; text-align: right;
      font-variant-numeric: tabular-nums; font-size: 14px;
      color: var(--text-secondary, #6b6b6f);
    }
    /* 分段控件 */
    .cs-segmented {
      display: inline-flex; background: var(--bg-base, #e5e5ea);
      border-radius: 9px; padding: 2px; gap: 2px;
    }
    .cs-segmented button {
      border: none; background: transparent; cursor: pointer;
      padding: 6px 14px; border-radius: 7px; font-size: 14px;
      color: var(--text-secondary, #6b6b6f); font-family: inherit;
      transition: background .15s, color .15s;
    }
    .cs-segmented button[aria-pressed="true"] {
      background: var(--bg-card, #fff); color: var(--text-primary, #1c1c1e);
      box-shadow: 0 1px 3px rgba(0,0,0,.12); font-weight: 500;
    }
    /* 按钮 */
    .cs-btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      padding: 10px 16px; border-radius: 10px; border: none;
      background: var(--bg-base, #e5e5ea); color: var(--text-primary, #1c1c1e);
      font-size: 15px; font-family: inherit; cursor: pointer;
      transition: opacity .15s, transform .1s;
    }
    .cs-btn:active { transform: scale(.97); }
    .cs-btn.primary { background: var(--accent, #007aff); color: #fff; }
    .cs-btn.danger { background: rgba(255,59,48,.12); color: var(--danger, #ff3b30); }
    .cs-btn.ghost { background: transparent; }
    .cs-btn:disabled { opacity: .5; cursor: not-allowed; }
    .cs-btn-block { width: 100%; }
    .cs-btn-row { display: flex; gap: 8px; flex-wrap: wrap; }
    /* 快捷回复 chips */
    .cs-chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .cs-chip {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 6px 10px; border-radius: 999px;
      background: var(--bg-base, #e5e5ea); font-size: 13px;
      max-width: 100%;
    }
    .cs-chip-text {
      max-width: 140px; overflow: hidden; text-overflow: ellipsis;
      white-space: nowrap;
    }
    .cs-chip-remove {
      border: none; background: transparent; cursor: pointer;
      padding: 0; display: inline-flex; color: var(--text-tertiary, #8e8e93);
    }
    .cs-chip-add {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 6px 12px; border-radius: 999px; border: 1px dashed var(--border-strong, rgba(0,0,0,.15));
      background: transparent; cursor: pointer; font-size: 13px;
      color: var(--text-secondary, #6b6b6f);
    }
    /* 头像选择 */
    .cs-avatar-picker {
      display: flex; align-items: center; gap: 12px;
    }
    .cs-avatar-preview {
      width: 64px; height: 64px; border-radius: 50%;
      background: var(--bg-base, #e5e5ea) center/cover no-repeat;
      flex: none; display: flex; align-items: center; justify-content: center;
      color: var(--text-tertiary, #8e8e93);
    }
    /* 模型列表 */
    .cs-model-list {
      max-height: 200px; overflow-y: auto;
      border: 1px solid var(--border-soft, rgba(0,0,0,.08));
      border-radius: 10px; margin-top: 6px;
    }
    .cs-model-item {
      padding: 10px 12px; border-bottom: 1px solid var(--border-soft, rgba(0,0,0,.05));
      cursor: pointer; display: flex; align-items: center; gap: 8px;
    }
    .cs-model-item:last-child { border-bottom: none; }
    .cs-model-item:hover { background: var(--bg-base, #f5f5f7); }
    .cs-model-item.active { color: var(--accent, #007aff); font-weight: 500; }
    .cs-model-item .cs-model-check { margin-left: auto; }
    /* 状态徽标 */
    .cs-badge {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 2px 8px; border-radius: 999px; font-size: 11px;
      background: var(--bg-base, #e5e5ea); color: var(--text-secondary, #6b6b6f);
    }
    .cs-badge.success { background: rgba(52,199,89,.14); color: #34c759; }
    .cs-badge.warn { background: rgba(255,149,0,.14); color: #ff9500; }
    .cs-badge.danger { background: rgba(255,59,48,.14); color: #ff3b30; }
    /* 空提示 */
    .cs-empty {
      text-align: center; padding: 24px 12px;
      color: var(--text-tertiary, #8e8e93); font-size: 13px;
    }
    /* 头部说明条 */
    .cs-hint-bar {
      display: flex; gap: 8px; align-items: flex-start;
      padding: 10px 12px; border-radius: 10px;
      background: rgba(0,122,255,.08); color: var(--accent, #007aff);
      font-size: 13px; line-height: 1.5; margin-bottom: 10px;
    }
    .cs-hint-bar.warn { background: rgba(255,149,0,.1); color: #ff9500; }
    .cs-hint-bar.danger { background: rgba(255,59,48,.1); color: #ff3b30; }
    /* loading 小圈 */
    .cs-spinner {
      width: 14px; height: 14px; border-radius: 50%;
      border: 2px solid currentColor; border-top-color: transparent;
      animation: cs-spin .8s linear infinite; display: inline-block;
    }
    @keyframes cs-spin { to { transform: rotate(360deg); } }
  `);
}

// ════════════════════════════════════════
// 偏好存储：单聊（按角色）+ 全局消息默认
// ════════════════════════════════════════

// 单聊偏好默认值
const DEFAULT_CHAT_PREFS = Object.freeze({
  // AI 专属配置覆盖（enabled=false 时跟随全局）
  aiOverride: {
    enabled: false,
    url: '', apiKey: '', model: '',
    temperature: 0.8, maxTokens: 800, timeoutMs: 30000,
    style: '', enableChain: false,
    topP: null, presencePenalty: null, frequencyPenalty: null
  },
  // 快捷回复
  quickReplies: [],
  // 字号：small | medium | large
  fontSize: 'medium',
  // 自动播放对方语音
  autoPlayVoice: false,
  // 显示思维链
  showThinking: true,
  // 进入聊天自动滚到底部
  autoScroll: true,
  // 按回车发送（true=回车发送，false=回车换行）
  enterToSend: true,
  // 双击消息快捷点赞（增加好感）
  quickLike: true,
  // 显示对方"正在输入"提示
  showTyping: true,
  // 流式时显示光标
  showCursor: true
});

// 全局消息默认偏好
const DEFAULT_GLOBAL_MSG_PREFS = Object.freeze({
  // 默认聊天模式
  chatMode: 'bubble', // bubble | dialog
  // 默认字号
  fontSize: 'medium',
  // 默认回车发送
  enterToSend: true,
  // 默认自动滚底
  autoScroll: true,
  // AI 主动消息
  proactiveEnabled: true,
  proactiveBudget: 3,      // 每天最多主动消息条数
  nightSilent: true,       // 夜间静默（22:00-08:00）
  nightSilentStart: 22,
  nightSilentEnd: 8,
  // 群聊默认 @提及触发回复
  groupAtTrigger: true,
  // 收到新消息轻震动
  hapticOnReceive: true
});

/** 读取某个角色的聊天偏好（含默认值合并） */
export function getChatPrefs(characterId) {
  if (!characterId) return JSON.parse(JSON.stringify(DEFAULT_CHAT_PREFS));
  const saved = getData(KEYS.chatConfig(characterId), null);
  if (!saved || typeof saved !== 'object') {
    return JSON.parse(JSON.stringify(DEFAULT_CHAT_PREFS));
  }
  // 深合并：保证新增字段有默认值
  return deepMergeDefaults(JSON.parse(JSON.stringify(DEFAULT_CHAT_PREFS)), saved);
}

/** 保存某个角色的聊天偏好（patch 合并） */
export function saveChatPrefs(characterId, patch) {
  if (!characterId) return null;
  const cur = getChatPrefs(characterId);
  const next = deepMergeDefaults(cur, patch);
  setData(KEYS.chatConfig(characterId), next);
  bus.emit('chat:prefs-changed', { characterId, prefs: next });
  return next;
}

/** 读取全局消息默认偏好 */
export function getGlobalMsgPrefs() {
  const saved = getData('chat_global_msg_prefs', null);
  if (!saved || typeof saved !== 'object') {
    return JSON.parse(JSON.stringify(DEFAULT_GLOBAL_MSG_PREFS));
  }
  return deepMergeDefaults(JSON.parse(JSON.stringify(DEFAULT_GLOBAL_MSG_PREFS)), saved);
}

/** 保存全局消息默认偏好 */
export function saveGlobalMsgPrefs(patch) {
  const cur = getGlobalMsgPrefs();
  const next = deepMergeDefaults(cur, patch);
  setData('chat_global_msg_prefs', next);
  bus.emit('chat:global-prefs-changed', { prefs: next });
  return next;
}

// 浅对象深合并：把 src 合并到 dst，dst 中 src 没有的键保留默认值
function deepMergeDefaults(dst, src) {
  if (!src || typeof src !== 'object') return dst;
  for (const k of Object.keys(src)) {
    const v = src[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && dst[k] && typeof dst[k] === 'object' && !Array.isArray(dst[k])) {
      dst[k] = deepMergeDefaults({ ...dst[k] }, v);
    } else {
      dst[k] = v;
    }
  }
  return dst;
}

// ════════════════════════════════════════
// 通用控件工厂
// ════════════════════════════════════════

/**
 * 字段容器：标题 + 助手说明 + 控件
 * @returns {HTMLElement}
 */
export function makeField({ label, helper, control, stacked = false }) {
  const field = document.createElement('div');
  field.className = 'cs-field' + (stacked ? ' cs-field-stack' : '');
  if (stacked) {
    if (label) {
      const lab = document.createElement('div');
      lab.className = 'cs-field-label';
      lab.innerHTML = `<span class="cs-label-title">${escapeHTML(label)}</span>`;
      field.appendChild(lab);
    }
    if (control instanceof HTMLElement) field.appendChild(control);
    else if (control) field.insertAdjacentHTML('beforeend', control);
    if (helper) {
      const h = document.createElement('div');
      h.className = 'cs-field-helper';
      h.textContent = helper;
      field.appendChild(h);
    }
  } else {
    const row = document.createElement('div');
    row.className = 'cs-field-row';
    if (label) {
      const lab = document.createElement('div');
      lab.className = 'cs-field-label';
      lab.innerHTML = `<span class="cs-label-title">${escapeHTML(label)}</span>`;
      row.appendChild(lab);
    }
    if (control instanceof HTMLElement) row.appendChild(control);
    else if (control) row.insertAdjacentHTML('beforeend', control);
    field.appendChild(row);
    if (helper) {
      const h = document.createElement('div');
      h.className = 'cs-field-helper';
      h.textContent = helper;
      field.appendChild(h);
    }
  }
  return field;
}

/**
 * 文本输入字段
 * @param {object} opts { label, value, placeholder, onChange, helper, type, stacked, debounceMs }
 */
export function makeInput(opts = {}) {
  const {
    label, value = '', placeholder = '', onChange,
    helper, type = 'text', stacked = false, debounceMs = 250
  } = opts;
  const input = document.createElement('input');
  input.className = 'cs-input';
  input.type = type;
  input.value = String(value ?? '');
  if (placeholder) input.placeholder = placeholder;
  input.spellcheck = false;
  if (typeof onChange === 'function') {
    let timer = null;
    input.addEventListener('input', () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        try { onChange(input.value); } catch (e) { console.warn('[chat-settings] input onChange 失败', e); }
      }, debounceMs);
    });
  }
  return makeField({ label, helper, control: input, stacked });
}

/**
 * 多行文本
 */
export function makeTextarea(opts = {}) {
  const {
    label, value = '', placeholder = '', onChange,
    helper, rows = 3, stacked = true, debounceMs = 400
  } = opts;
  const ta = document.createElement('textarea');
  ta.className = 'cs-textarea';
  ta.rows = rows;
  ta.value = String(value ?? '');
  if (placeholder) ta.placeholder = placeholder;
  if (typeof onChange === 'function') {
    let timer = null;
    ta.addEventListener('input', () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        try { onChange(ta.value); } catch (e) { console.warn('[chat-settings] textarea onChange 失败', e); }
      }, debounceMs);
    });
  }
  return makeField({ label, helper, control: ta, stacked });
}

/**
 * 开关
 * @param {object} opts { label, value, onChange, helper, disabled }
 */
export function makeToggle(opts = {}) {
  const { label, value = false, onChange, helper, disabled = false } = opts;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'cs-toggle';
  btn.setAttribute('role', 'switch');
  btn.setAttribute('aria-checked', value ? 'true' : 'false');
  if (disabled) btn.disabled = true;
  btn.addEventListener('click', () => {
    if (btn.disabled) return;
    const next = btn.getAttribute('aria-checked') !== 'true';
    btn.setAttribute('aria-checked', next ? 'true' : 'false');
    if (typeof onChange === 'function') {
      try { onChange(next); } catch (e) { console.warn('[chat-settings] toggle onChange 失败', e); }
    }
  });
  return makeField({ label, helper, control: btn });
}

/**
 * 滑块
 * @param {object} opts { label, value, min, max, step, onChange, helper, format }
 */
export function makeSlider(opts = {}) {
  const {
    label, value = 0, min = 0, max = 100, step = 1,
    onChange, helper, format
  } = opts;
  const wrap = document.createElement('div');
  wrap.className = 'cs-slider-row';
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'cs-slider';
  slider.min = min; slider.max = max; slider.step = step;
  slider.value = clamp(Number(value) || 0, min, max);
  const valEl = document.createElement('span');
  valEl.className = 'cs-slider-value';
  const fmtFn = typeof format === 'function' ? format : (v) => String(v);
  valEl.textContent = fmtFn(Number(slider.value));
  slider.addEventListener('input', () => {
    valEl.textContent = fmtFn(Number(slider.value));
  });
  slider.addEventListener('change', () => {
    if (typeof onChange === 'function') {
      try { onChange(Number(slider.value)); } catch (e) { console.warn('[chat-settings] slider onChange 失败', e); }
    }
  });
  wrap.appendChild(slider);
  wrap.appendChild(valEl);
  return makeField({ label, helper, control: wrap });
}

/**
 * 下拉选择
 * @param {object} opts { label, value, options:[{value,label}], onChange, helper }
 */
export function makeSelect(opts = {}) {
  const { label, value = '', options = [], onChange, helper } = opts;
  const sel = document.createElement('select');
  sel.className = 'cs-select';
  options.forEach((o) => {
    const opt = document.createElement('option');
    opt.value = o.value;
    opt.textContent = o.label;
    if (String(o.value) === String(value)) opt.selected = true;
    sel.appendChild(opt);
  });
  if (typeof onChange === 'function') {
    sel.addEventListener('change', () => {
      try { onChange(sel.value); } catch (e) { console.warn('[chat-settings] select onChange 失败', e); }
    });
  }
  return makeField({ label, helper, control: sel });
}

/**
 * 分段控件
 * @param {object} opts { label, value, options:[{value,label}], onChange, helper }
 */
export function makeSegmented(opts = {}) {
  const { label, value = '', options = [], onChange, helper } = opts;
  const seg = document.createElement('div');
  seg.className = 'cs-segmented';
  seg.setAttribute('role', 'radiogroup');
  options.forEach((o) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = o.label;
    const active = String(o.value) === String(value);
    b.setAttribute('aria-pressed', active ? 'true' : 'false');
    b.addEventListener('click', () => {
      seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true');
      if (typeof onChange === 'function') {
        try { onChange(o.value); } catch (e) { console.warn('[chat-settings] segmented onChange 失败', e); }
      }
    });
    seg.appendChild(b);
  });
  return makeField({ label, helper, control: seg });
}

/**
 * 按钮
 * @param {object} opts { label, onClick, variant:'default'|'primary'|'danger'|'ghost', icon, block, disabled }
 */
export function makeButton(opts = {}) {
  const {
    label = '', onClick, variant = 'default', icon, block = false, disabled = false
  } = opts;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'cs-btn' + (variant !== 'default' ? ' ' + variant : '') + (block ? ' cs-btn-block' : '');
  if (icon) {
    try { btn.appendChild(createIcon(icon, 16)); } catch (e) {}
  }
  if (label) {
    const span = document.createElement('span');
    span.textContent = label;
    btn.appendChild(span);
  }
  if (disabled) btn.disabled = true;
  if (typeof onClick === 'function') {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      try { onClick(); } catch (e) { console.warn('[chat-settings] button onClick 失败', e); }
    });
  }
  return btn;
}

/**
 * 按钮行（多个按钮并排）
 * @param {Array<HTMLElement>} btns
 */
export function makeButtonRow(btns = []) {
  const row = document.createElement('div');
  row.className = 'cs-btn-row';
  btns.forEach((b) => { if (b) row.appendChild(b); });
  return row;
}

/**
 * 提示条
 * @param {string} text
 * @param {'info'|'warn'|'danger'} variant
 */
export function makeHintBar(text, variant = 'info') {
  const bar = document.createElement('div');
  bar.className = 'cs-hint-bar' + (variant !== 'info' ? ' ' + variant : '');
  const icon = variant === 'danger' ? 'alert' : (variant === 'warn' ? 'moon' : 'sparkle');
  try { bar.appendChild(createIcon(icon, 16)); } catch (e) {}
  const span = document.createElement('span');
  span.textContent = text;
  bar.appendChild(span);
  return bar;
}

/**
 * 状态徽标
 */
export function makeBadge(text, variant = 'default') {
  const b = document.createElement('span');
  b.className = 'cs-badge' + (variant !== 'default' ? ' ' + variant : '');
  b.textContent = text;
  return b;
}

/**
 * 空提示
 */
export function makeEmpty(text) {
  const d = document.createElement('div');
  d.className = 'cs-empty';
  d.textContent = text;
  return d;
}

/**
 * 段落标题
 */
export function makeSectionTitle(text) {
  const t = document.createElement('div');
  t.className = 'chat-settings-section-title';
  t.textContent = text;
  return t;
}

/**
 * 字段分组容器
 */
export function makeSection() {
  const s = document.createElement('div');
  s.className = 'chat-settings-section';
  return s;
}

// ════════════════════════════════════════
// 快捷回复 chips 编辑器
// ════════════════════════════════════════

/**
 * 渲染快捷回复 chips，支持增删。
 * @param {string[]} replies
 * @param {(next:string[])=>void} onChange
 * @returns {HTMLElement}
 */
export function makeQuickRepliesEditor(replies = [], onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'cs-field';
  const lab = document.createElement('div');
  lab.className = 'cs-field-label';
  lab.innerHTML = `<span class="cs-label-title">快捷回复</span>`;
  wrap.appendChild(lab);
  const chipsEl = document.createElement('div');
  chipsEl.className = 'cs-chips';
  wrap.appendChild(chipsEl);

  const emit = (next) => {
    if (typeof onChange === 'function') {
      try { onChange(next); } catch (e) { console.warn('[chat-settings] quickReplies onChange 失败', e); }
    }
  };

  const render = (list) => {
    chipsEl.innerHTML = '';
    list.forEach((text, i) => {
      const chip = document.createElement('span');
      chip.className = 'cs-chip';
      const t = document.createElement('span');
      t.className = 'cs-chip-text';
      t.textContent = text;
      chip.appendChild(t);
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'cs-chip-remove';
      rm.setAttribute('aria-label', '删除这条快捷回复');
      rm.appendChild(createIcon('close', 14));
      rm.addEventListener('click', () => {
        const next = list.slice();
        next.splice(i, 1);
        render(next);
        emit(next);
      });
      chip.appendChild(rm);
      chipsEl.appendChild(chip);
    });
    // 添加按钮
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'cs-chip-add';
    addBtn.appendChild(createIcon('plus', 14));
    const addLabel = document.createElement('span');
    addLabel.textContent = '添加';
    addBtn.appendChild(addLabel);
    addBtn.addEventListener('click', () => {
      promptText('写一句快捷回复吧', '', (val) => {
        const v = (val || '').trim();
        if (!v) return;
        if (list.includes(v)) {
          showToast('已经有这句啦', 'default', 1200);
          return;
        }
        if (list.length >= 30) {
          showToast('快捷回复最多 30 条哦', 'default', 1400);
          return;
        }
        const next = list.concat(v);
        render(next);
        emit(next);
      });
    });
    chipsEl.appendChild(addBtn);
  };
  render(replies.slice());
  return wrap;
}

// ════════════════════════════════════════
// 轻量文本输入弹窗（替代 prompt）
// ════════════════════════════════════════

/**
 * 弹一个文本输入对话框。确认时回调 onConfirm(value)，取消时不调用。
 * @param {string} title
 * @param {string} defaultValue
 * @param {(value:string)=>void} onConfirm
 * @param {object} opts { placeholder, multiline, confirmText, cancelText, helper }
 */
export function promptText(title, defaultValue, onConfirm, opts = {}) {
  const {
    placeholder = '', multiline = false, confirmText = '好哒',
    cancelText = '不要', helper = ''
  } = opts;
  // 复用 ui 的 showDialog 构建自定义弹窗
  const overlay = document.createElement('div');
  overlay.className = 'popo-dialog-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;padding:20px;';
  const card = document.createElement('div');
  card.className = 'popo-dialog';
  card.style.cssText = 'background:var(--bg-card,#fff);border-radius:16px;width:100%;max-width:340px;padding:20px;box-shadow:0 8px 32px rgba(0,0,0,.2);';
  const titleEl = document.createElement('div');
  titleEl.style.cssText = 'font-size:17px;font-weight:600;margin-bottom:8px;';
  titleEl.textContent = title;
  card.appendChild(titleEl);
  if (helper) {
    const h = document.createElement('div');
    h.style.cssText = 'font-size:13px;color:var(--text-tertiary,#8e8e93);margin-bottom:12px;line-height:1.5;';
    h.textContent = helper;
    card.appendChild(h);
  }
  const input = document.createElement(multiline ? 'textarea' : 'input');
  input.className = 'cs-input';
  if (multiline) input.rows = 3;
  input.value = String(defaultValue || '');
  if (placeholder) input.placeholder = placeholder;
  input.style.cssText = 'width:100%;box-sizing:border-box;margin-bottom:16px;';
  card.appendChild(input);
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'cs-btn ghost';
  cancelBtn.textContent = cancelText;
  cancelBtn.addEventListener('click', () => overlay.remove());
  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'cs-btn primary';
  confirmBtn.textContent = confirmText;
  confirmBtn.addEventListener('click', () => {
    const val = input.value;
    overlay.remove();
    if (typeof onConfirm === 'function') {
      try { onConfirm(val); } catch (e) { console.warn('[chat-settings] promptText onConfirm 失败', e); }
    }
  });
  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(confirmBtn);
  card.appendChild(btnRow);
  overlay.appendChild(card);
  // 点遮罩关闭
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  document.body.appendChild(overlay);
  // 自动聚焦
  setTimeout(() => { try { input.focus(); input.select(); } catch (e) {} }, 50);
  // 回车确认（单行）
  if (!multiline) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        confirmBtn.click();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelBtn.click();
      }
    });
  }
}

// ════════════════════════════════════════
// 头像预览
// ════════════════════════════════════════

/**
 * 头像预览圆 + 换头像按钮
 * @param {string} avatarUrl 当前头像
 * @param {(newAvatar:string|null)=>void} onPick 选择后的回调
 */
export function makeAvatarPicker(avatarUrl, onPick) {
  const wrap = document.createElement('div');
  wrap.className = 'cs-avatar-picker';
  const preview = document.createElement('div');
  preview.className = 'cs-avatar-preview';
  const applyUrl = (url) => {
    if (url && isUsableImage(url)) {
      preview.style.backgroundImage = cssUrl(url);
      preview.innerHTML = '';
    } else {
      preview.style.backgroundImage = '';
      preview.innerHTML = '';
      preview.appendChild(createIcon('smile', 28));
    }
  };
  applyUrl(avatarUrl);
  wrap.appendChild(preview);
  const btnCol = document.createElement('div');
  btnCol.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
  const pickBtn = makeButton({
    label: '换头像', icon: 'camera', variant: 'default',
    onClick: async () => {
      try {
        const { pickImageFile } = await import('../../core/util.js');
        const { compressImage } = await import('../../core/storage.js');
        const file = await pickImageFile('image/*');
        const dataUrl = await compressImage(file, { quality: 0.85, maxWidth: 512, maxHeight: 512 });
        applyUrl(dataUrl);
        if (typeof onPick === 'function') onPick(dataUrl);
      } catch (e) {
        console.warn('[chat-settings] 换头像失败', e);
        showToast('图片没选好嘛，再试一下', 'error');
      }
    }
  });
  const clearBtn = makeButton({
    label: '恢复默认', icon: 'refresh', variant: 'ghost',
    onClick: () => {
      applyUrl('');
      if (typeof onPick === 'function') onPick(null);
    }
  });
  btnCol.appendChild(pickBtn);
  btnCol.appendChild(clearBtn);
  wrap.appendChild(btnCol);
  return wrap;
}

// ════════════════════════════════════════
// 模型列表加载器（拉取 /models 接口）
// ════════════════════════════════════════

/**
 * 拉取模型列表。url 形如 https://api.openai.com/v1/chat/completions，
 * 自动改成 https://api.openai.com/v1/models。
 * @param {string} url
 * @param {string} apiKey
 * @returns {Promise<string[]>}
 */
export async function fetchModelList(url, apiKey) {
  if (!url) throw new Error('接口地址还没填呀');
  // 把 /chat/completions 替换成 /models；若已是 /models 则保持
  let modelsUrl = String(url).trim();
  if (modelsUrl.endsWith('/chat/completions')) {
    modelsUrl = modelsUrl.slice(0, -'/chat/completions'.length) + '/models';
  } else if (modelsUrl.endsWith('/chat/completions/')) {
    modelsUrl = modelsUrl.replace(/\/chat\/completions\/?$/, '/models');
  } else if (!modelsUrl.endsWith('/models')) {
    // 兜底：拼到 /v1 末尾
    modelsUrl = modelsUrl.replace(/\/$/, '') + '/models';
  }
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  const res = await fetch(modelsUrl, { method: 'GET', headers });
  if (!res.ok) throw new Error(`拉模型列表失败：HTTP ${res.status}`);
  const json = await res.json();
  // OpenAI 兼容格式：{ data: [{ id }] }
  if (Array.isArray(json?.data)) {
    return json.data.map((m) => m.id || m.name).filter(Boolean).sort();
  }
  // 部分服务直接返回数组
  if (Array.isArray(json)) {
    return json.map((m) => (typeof m === 'string' ? m : (m.id || m.name))).filter(Boolean).sort();
  }
  return [];
}

/**
 * 渲染模型选择列表（可搜索）
 * @param {string[]} models
 * @param {string} current
 * @param {(model:string)=>void} onPick
 * @returns {HTMLElement}
 */
export function makeModelList(models, current, onPick) {
  const wrap = document.createElement('div');
  if (!models || !models.length) {
    wrap.appendChild(makeEmpty('没有拉到模型列表呀，检查一下接口地址和 Key'));
    return wrap;
  }
  const search = document.createElement('input');
  search.className = 'cs-input';
  search.placeholder = '搜一下模型名...';
  search.style.marginBottom = '6px';
  wrap.appendChild(search);
  const list = document.createElement('div');
  list.className = 'cs-model-list';
  wrap.appendChild(list);
  const render = (kw) => {
    list.innerHTML = '';
    const k = kw.trim().toLowerCase();
    models.forEach((m) => {
      if (k && !String(m).toLowerCase().includes(k)) return;
      const item = document.createElement('div');
      item.className = 'cs-model-item' + (String(m) === String(current) ? ' active' : '');
      item.setAttribute('role', 'button');
      item.setAttribute('tabindex', '0');
      const name = document.createElement('span');
      name.textContent = m;
      item.appendChild(name);
      if (String(m) === String(current)) {
        const chk = document.createElement('span');
        chk.className = 'cs-model-check';
        chk.appendChild(createIcon('check', 16));
        item.appendChild(chk);
      }
      item.addEventListener('click', () => {
        if (typeof onPick === 'function') onPick(m);
      });
      list.appendChild(item);
    });
    if (!list.children.length) {
      list.appendChild(makeEmpty('没找到匹配的模型呀'));
    }
  };
  render('');
  search.addEventListener('input', () => render(search.value));
  return wrap;
}

// ════════════════════════════════════════
// 工具
// ════════════════════════════════════════

/** 创建一个带 loading 状态的按钮（点击后变 loading，完成后恢复） */
export function makeAsyncButton(opts = {}) {
  const { label = '', onClick, variant = 'default', icon, block = false } = opts;
  const btn = makeButton({
    label, variant, icon, block,
    onClick: async () => {
      if (btn.disabled) return;
      const original = btn.innerHTML;
      btn.disabled = true;
      const spinner = document.createElement('span');
      spinner.className = 'cs-spinner';
      btn.innerHTML = '';
      btn.appendChild(spinner);
      const lab = document.createElement('span');
      lab.textContent = '稍等一下';
      btn.appendChild(lab);
      try {
        await onClick();
      } catch (e) {
        console.warn('[chat-settings] asyncButton onClick 失败', e);
        showToast('出错了，再试一下嘛', 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = original;
      }
    }
  });
  return btn;
}

/** 字号映射 */
export const FONT_SIZE_OPTIONS = [
  { value: 'small', label: '小' },
  { value: 'medium', label: '中' },
  { value: 'large', label: '大' }
];

/** 字号 -> CSS font-size（px） */
export const FONT_SIZE_PX = { small: 14, medium: 16, large: 18 };

/** 聊天模式选项 */
export const CHAT_MODE_OPTIONS = [
  { value: 'bubble', label: '气泡' },
  { value: 'dialog', label: '对话' }
];
