// ============================================
// settings/index.js — 设置 APP 入口
// 导出 init(container) → 渲染设置页面 → 返回 destroy
// 第一版：AI与接口 配置区域
// ============================================

import { get, set } from '../../core/config.js';
import events from '../../core/events.js';

let _styleEl = null;

function _injectStyles() {
  if (_styleEl) return;
  _styleEl = document.createElement('style');
  _styleEl.id = 'settings-app-styles';
  _styleEl.textContent = `
    .settings-section { margin-bottom: 24px; }
    .settings-section-title { font-size: 0.8rem; font-weight: var(--font-weight-bold); color: var(--text-placeholder); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 10px; padding-left: 4px; }
    .settings-group { background: var(--bg-surface); border-radius: var(--radius-lg); overflow: hidden; box-shadow: var(--shadow-soft); border: 1px solid var(--border-color); }
    .settings-field { display: flex; flex-direction: column; gap: 6px; padding: 14px 16px; border-bottom: 1px solid var(--border-color); }
    .settings-field:last-child { border-bottom: none; }
    .settings-field-label { font-size: 0.85rem; font-weight: var(--font-weight-bold); color: var(--text-primary); }
    .settings-field-hint { font-size: 0.75rem; color: var(--text-placeholder); margin-bottom: 2px; }
    .settings-input { width: 100%; padding: 12px 14px; background: var(--bg-base); border: 1.5px solid var(--border-color); border-radius: var(--radius-sm); font-size: 0.95rem; font-family: var(--font-family); color: var(--text-primary); transition: border-color var(--duration-fast) var(--ease-smooth); box-sizing: border-box; min-height: 44px; }
    .settings-input:focus { outline: none; border-color: var(--color-primary); box-shadow: 0 0 0 3px var(--color-primary-ultralight); }
    .settings-input::placeholder { color: var(--text-placeholder); }
    .settings-save-area { padding: 16px 0; }
    .settings-save-btn { width: 100%; padding: 14px; min-height: 48px; background: linear-gradient(135deg, var(--color-primary), var(--color-primary-deep)); color: #fff; border: none; border-radius: var(--radius-md); font-size: 1rem; font-weight: var(--font-weight-bold); font-family: var(--font-family); cursor: pointer; transition: all var(--duration-fast) var(--ease-soft); box-shadow: 0 4px 14px var(--color-primary-light); }
    .settings-save-btn:active { transform: scale(0.97); box-shadow: 0 2px 8px var(--color-primary-light); }
    .settings-save-btn.saved { background: var(--color-success); box-shadow: 0 4px 14px rgba(140,184,138,0.3); }
    .settings-status { text-align: center; font-size: 0.8rem; color: var(--text-placeholder); margin-top: 8px; min-height: 1.2em; transition: color var(--duration-fast) var(--ease-smooth); }
    .settings-status.success { color: var(--color-success); }
    .settings-status.error { color: var(--color-error); }
  `;
  document.head.appendChild(_styleEl);
}

function _render(container) {
  const cfg = { baseUrl: get('apiBaseUrl') || '', apiKey: get('apiKey') || '', model: get('apiModel') || '' };

  const page = document.createElement('div');
  page.className = 'app-page';
  page.innerHTML = `
    <div class="app-header">
      <button class="app-header-back" id="settings-back-btn" aria-label="返回">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <span class="app-header-title">设置</span>
      <div class="app-header-action"></div>
    </div>
    <div class="app-body">
      <div class="settings-section">
        <div class="settings-section-title">AI与接口</div>
        <div class="settings-group">
          <div class="settings-field">
            <label class="settings-field-label" for="settings-api-url">API Base URL</label>
            <span class="settings-field-hint">兼容 OpenAI 格式的接口地址</span>
            <input class="settings-input" id="settings-api-url" type="text" placeholder="https://api.openai.com" value="${_esc(cfg.baseUrl)}" autocomplete="off"/>
          </div>
          <div class="settings-field">
            <label class="settings-field-label" for="settings-api-key">API Key</label>
            <span class="settings-field-hint">您的 API 密钥，仅保存在本地浏览器</span>
            <input class="settings-input" id="settings-api-key" type="password" placeholder="sk-xxxxxxxxxxxxxxxx" value="${_esc(cfg.apiKey)}" autocomplete="off"/>
          </div>
          <div class="settings-field">
            <label class="settings-field-label" for="settings-api-model">模型名</label>
            <span class="settings-field-hint">例如 gpt-4o、gpt-3.5-turbo、deepseek-chat</span>
            <input class="settings-input" id="settings-api-model" type="text" placeholder="gpt-4o" value="${_esc(cfg.model)}" autocomplete="off"/>
          </div>
        </div>
      </div>
      <div class="settings-save-area">
        <button class="settings-save-btn" id="settings-save-btn">保存配置</button>
        <div class="settings-status" id="settings-status"></div>
      </div>
    </div>
  `;
  container.appendChild(page);
  _bindEvents(page);
}

function _bindEvents(page) {
  const backBtn = page.querySelector('#settings-back-btn');
  const saveBtn = page.querySelector('#settings-save-btn');
  const statusEl = page.querySelector('#settings-status');
  const urlInput = page.querySelector('#settings-api-url');
  const keyInput = page.querySelector('#settings-api-key');
  const modelInput = page.querySelector('#settings-api-model');

  let _saveTimer = null;

  backBtn.addEventListener('click', () => {
    events.emit('app:closed', { appId: 'settings' });
  });

  saveBtn.addEventListener('click', () => {
    if (_saveTimer) return; // 防连点
    _saveTimer = setTimeout(() => { _saveTimer = null; }, 600);

    const baseUrl = urlInput.value.trim();
    const apiKey = keyInput.value.trim();
    const model = modelInput.value.trim();

    try {
      set('apiBaseUrl', baseUrl);
      set('apiKey', apiKey);
      set('apiModel', model);

      events.emit('settings.changed', { key: 'api', values: { apiBaseUrl: baseUrl, apiKey: '***', apiModel: model } });
      events.emit('api.changed', { baseUrl, model });

      saveBtn.textContent = '已保存';
      saveBtn.classList.add('saved');
      statusEl.textContent = '配置已保存，刷新后仍保留';
      statusEl.className = 'settings-status success';

      setTimeout(() => {
        saveBtn.textContent = '保存配置';
        saveBtn.classList.remove('saved');
      }, 2000);
    } catch (err) {
      statusEl.textContent = '保存失败，请重试';
      statusEl.className = 'settings-status error';
      console.error('[Settings] 保存失败:', err);
    }
  });
}

function _esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function _destroy() {
  if (_styleEl) { _styleEl.remove(); _styleEl = null; }
  const el = document.getElementById('settings-app-styles');
  if (el) el.remove();
}

function init(container) {
  _injectStyles();
  _render(container);
  return _destroy;
}

export { init };