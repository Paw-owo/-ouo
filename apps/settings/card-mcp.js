// apps/settings/card-mcp.js
// 小工具箱卡——MCP 服务器管理 UI。
// 文案上把 MCP 叫成「小工具箱」，免得吓到主人。
// 功能：预设推荐一键添加 / 自定义服务器增删改查 / 试一下连接 / 展开看可用工具。
// 依赖：core/mcp.js, core/storage.js, core/ui.js, core/util.js

import { getServers, saveServer, deleteServer, testServer, listTools } from '../../core/mcp.js';
import { generateId } from '../../core/storage.js';
import { showToast, showConfirm, showBottomSheet, createIcon } from '../../core/ui.js';
import { injectStyle } from '../../core/util.js';

// 只注入一次样式，重复 import 时 injectStyle 会自动去重
injectStyle('popo-settings-mcp-card', `
  .mcp-section-label{
    font-size:var(--font-size-small); color:var(--text-secondary);
    margin:14px 0 6px; font-weight:500;
  }
  .mcp-section-label:first-child{ margin-top:0; }
  .mcp-add-btn{ margin-top:12px; }
  .mcp-empty{
    padding:24px 12px; text-align:center;
    color:var(--text-hint); font-size:var(--font-size-small);
    border:1px dashed color-mix(in srgb, var(--text-hint) 24%, transparent);
    border-radius:var(--radius-md);
  }
  /* 预设卡片 */
  .mcp-preset{
    display:flex; align-items:center; gap:10px;
    padding:10px 12px; margin-bottom:8px;
    background:color-mix(in srgb, var(--bg-secondary) 60%, transparent);
    border:1px solid color-mix(in srgb, var(--text-hint) 14%, transparent);
    border-radius:var(--radius-md);
  }
  .mcp-preset-main{ flex:1; min-width:0; }
  .mcp-preset-name{
    font-size:var(--font-size-base); color:var(--text-primary);
    font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  }
  .mcp-preset-desc{
    font-size:var(--font-size-small); color:var(--text-hint);
    margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  }
  /* 已添加的服务器行 */
  .mcp-server{
    background:color-mix(in srgb, var(--bg-secondary) 50%, transparent);
    border:1px solid color-mix(in srgb, var(--text-hint) 14%, transparent);
    border-radius:var(--radius-md);
    margin-bottom:8px; overflow:hidden;
  }
  .mcp-server-head{
    display:flex; align-items:center; gap:10px; padding:10px 12px;
    cursor:pointer; transition:var(--motion);
  }
  .mcp-server-head:active{ transform:scale(var(--press-scale)); }
  .mcp-dot{
    width:8px; height:8px; border-radius:50%;
    background:var(--text-hint); flex-shrink:0;
    box-shadow:0 0 0 3px color-mix(in srgb, var(--text-hint) 18%, transparent);
  }
  .mcp-dot.ok{ background:var(--success); box-shadow:0 0 0 3px color-mix(in srgb, var(--success) 22%, transparent); }
  .mcp-dot.err{ background:var(--danger); box-shadow:0 0 0 3px color-mix(in srgb, var(--danger) 22%, transparent); }
  .mcp-dot.unk{ background:var(--text-hint); box-shadow:0 0 0 3px color-mix(in srgb, var(--text-hint) 18%, transparent); }
  .mcp-server-info{ flex:1; min-width:0; }
  .mcp-server-name{
    font-size:var(--font-size-base); color:var(--text-primary); font-weight:500;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  }
  .mcp-server-url{
    font-size:var(--font-size-small); color:var(--text-hint); margin-top:2px;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  }
  .mcp-server-actions{ display:flex; gap:4px; flex-shrink:0; }
  .mcp-icon-btn{
    width:32px; height:32px; border-radius:var(--radius-sm);
    background:transparent; border:none; color:var(--text-secondary);
    display:inline-flex; align-items:center; justify-content:center;
    cursor:pointer; transition:var(--motion);
  }
  .mcp-icon-btn:active{ transform:scale(var(--press-scale)); }
  .mcp-icon-btn.danger{ color:var(--danger); }
  .mcp-server-tools{
    padding:8px 12px 12px 30px;
    border-top:1px dashed color-mix(in srgb, var(--text-hint) 18%, transparent);
    background:color-mix(in srgb, var(--bg-card) 40%, transparent);
  }
  .mcp-tools-title{
    font-size:var(--font-size-small); color:var(--text-secondary);
    margin:4px 0 6px; font-weight:500;
  }
  .mcp-tool-item{
    font-size:var(--font-size-small); color:var(--text-primary);
    padding:6px 8px; border-radius:var(--radius-sm);
    background:color-mix(in srgb, var(--bg-secondary) 60%, transparent);
    margin-bottom:4px;
  }
  .mcp-tool-item:last-child{ margin-bottom:0; }
  .mcp-tool-name{ font-weight:500; }
  .mcp-tool-desc{ color:var(--text-hint); margin-top:2px; }
  .mcp-tools-loading{ font-size:var(--font-size-small); color:var(--text-hint); padding:4px 0; }
  /* 表单 */
  .mcp-form-field{ margin-bottom:12px; }
  .mcp-form-label{
    display:block; font-size:var(--font-size-small);
    color:var(--text-secondary); margin-bottom:4px;
  }
  .mcp-form-actions{ display:flex; gap:8px; margin-top:6px; }
  .mcp-form-actions .btn{ flex:1; }
`);

// 预设的推荐小工具——主人可以一键添加，省得自己找地址
const PRESET_SERVERS = [
  {
    name: '天气小助手',
    url: 'https://mcp.api-infrastructure.com/servers/weather/mcp',
    description: '查天气、预报',
  },
  {
    name: '时间小帮手',
    url: 'https://mcp.api-infrastructure.com/servers/time/mcp',
    description: '查时间、时区转换',
  },
  {
    name: '搜索小达人',
    url: 'https://mcp.api-infrastructure.com/servers/search/mcp',
    description: '上网搜索信息',
  },
];

// 简单转义，防 XSS
function escapeAttr(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/**
 * 渲染小工具箱卡片。返回一个 .card 元素，由 settings/index.js 包到分组里。
 */
export function renderMCPCard() {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="card-title">我的小工具箱</div>
    <div style="font-size:var(--font-size-small);color:var(--text-hint);margin-bottom:6px;line-height:1.5">
      这里收着我能用到的小工具，连上之后我能查天气、查时间、找东西～
    </div>
    <div class="mcp-section-label">推荐工具</div>
    <div id="mcp-presets"></div>
    <div class="mcp-section-label">我的工具</div>
    <div id="mcp-list"></div>
    <button class="btn primary block mcp-add-btn" id="mcp-add" type="button">
      ${createIcon('plus', 18).outerHTML}<span>加一个新工具</span>
    </button>
  `;

  // 展开状态：记录哪些 server.id 处于展开态，跨局部刷新保留
  const expandedSet = new Set();
  // 测试状态：server.id -> 'ok' | 'err' | 'unk'
  const statusMap = new Map();

  // 渲染预设
  const presetsEl = card.querySelector('#mcp-presets');
  PRESET_SERVERS.forEach((p) => {
    const row = document.createElement('div');
    row.className = 'mcp-preset';
    row.innerHTML = `
      <div class="mcp-preset-main">
        <div class="mcp-preset-name">${escapeAttr(p.name)}</div>
        <div class="mcp-preset-desc">${escapeAttr(p.description)}</div>
      </div>
      <button class="btn" data-act="add" type="button">添加</button>
    `;
    row.querySelector('[data-act=add]').addEventListener('click', async () => {
      try {
        const id = generateId('mcp');
        await saveServer({ id, name: p.name, url: p.url, apiKey: '' });
        showToast(`${p.name} 加好啦`, 'success');
        await refreshList();
      } catch (e) {
        console.warn('[mcp] 添加预设失败', e);
        showToast('没添加成功，再试一下嘛', 'error');
      }
    });
    presetsEl.appendChild(row);
  });

  // 渲染服务器列表
  const listEl = card.querySelector('#mcp-list');
  async function refreshList() {
    let servers = [];
    try {
      servers = await getServers();
    } catch (e) {
      console.warn('[mcp] 读取服务器列表失败', e);
      servers = [];
    }
    if (!Array.isArray(servers) || !servers.length) {
      listEl.innerHTML = `<div class="mcp-empty">还没有工具呢，加一个吧～</div>`;
      return;
    }
    listEl.innerHTML = '';
    for (const s of servers) {
      listEl.appendChild(renderServerRow(s, expandedSet, statusMap, refreshList));
    }
  }

  // 加一个新工具：弹表单
  card.querySelector('#mcp-add').addEventListener('click', () => {
    openServerForm({
      title: '加一个新工具',
      onSave: async (data) => {
        if (!data.name || !data.url) {
          showToast('名字和地址要填上嘛', 'error');
          return false;
        }
        try {
          const id = generateId('mcp');
          await saveServer({ id, ...data });
          showToast('工具加好啦', 'success');
          await refreshList();
          return true;
        } catch (e) {
          console.warn('[mcp] 保存失败', e);
          showToast('没保存成功，再试一下嘛', 'error');
          return false;
        }
      }
    });
  });

  refreshList();
  return card;
}

/**
 * 渲染单个服务器行（含展开/编辑/删除/试一下）。
 */
function renderServerRow(server, expandedSet, statusMap, refreshList) {
  const row = document.createElement('div');
  row.className = 'mcp-server';
  const expanded = expandedSet.has(server.id);
  const st = statusMap.get(server.id) || 'unk';
  row.innerHTML = `
    <div class="mcp-server-head" role="button" tabindex="0" aria-label="展开工具列表">
      <span class="mcp-dot ${st}" aria-hidden="true"></span>
      <div class="mcp-server-info">
        <div class="mcp-server-name">${escapeAttr(server.name || '未命名')}</div>
        <div class="mcp-server-url">${escapeAttr(server.url || '')}</div>
      </div>
      <div class="mcp-server-actions">
        <button class="mcp-icon-btn" data-act="test" aria-label="试一下连接">${createIcon('check', 16).outerHTML}</button>
        <button class="mcp-icon-btn" data-act="edit" aria-label="编辑">${createIcon('edit', 16).outerHTML}</button>
        <button class="mcp-icon-btn danger" data-act="del" aria-label="删除">${createIcon('trash', 16).outerHTML}</button>
      </div>
    </div>
    <div class="mcp-server-tools" data-tools style="${expanded ? '' : 'display:none'}">
      <div class="mcp-tools-loading">正在拉取小工具...</div>
    </div>
  `;

  // 阻止操作按钮冒泡到 head，避免点编辑/删除还顺手展开
  const head = row.querySelector('.mcp-server-head');
  head.addEventListener('click', (e) => {
    // 点按钮不触发展开
    if (e.target.closest('[data-act]')) return;
    toggleExpand();
  });
  head.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleExpand();
    }
  });

  async function toggleExpand() {
    const toolsBox = row.querySelector('[data-tools]');
    if (expandedSet.has(server.id)) {
      expandedSet.delete(server.id);
      toolsBox.style.display = 'none';
      return;
    }
    expandedSet.add(server.id);
    toolsBox.style.display = '';
    toolsBox.innerHTML = `<div class="mcp-tools-loading">正在拉取小工具...</div>`;
    try {
      const tools = await listTools(server.id);
      renderTools(toolsBox, tools, server);
      // 拉到工具意味着连接是通的
      statusMap.set(server.id, 'ok');
      const dot = row.querySelector('.mcp-dot');
      if (dot) dot.className = 'mcp-dot ok';
    } catch (e) {
      console.warn('[mcp] 拉取工具失败', e);
      statusMap.set(server.id, 'err');
      const dot = row.querySelector('.mcp-dot');
      if (dot) dot.className = 'mcp-dot err';
      toolsBox.innerHTML = `<div class="mcp-tools-loading" style="color:var(--danger)">拉不到工具呢：${escapeAttr(e.message || '连接失败')}</div>`;
    }
  }

  // 试一下连接
  row.querySelector('[data-act=test]').addEventListener('click', async (e) => {
    e.stopPropagation();
    const btn = e.currentTarget;
    btn.disabled = true;
    const dot = row.querySelector('.mcp-dot');
    if (dot) dot.className = 'mcp-dot unk';
    try {
      const r = await testServer(server.id);
      if (r.ok) {
        statusMap.set(server.id, 'ok');
        if (dot) dot.className = 'mcp-dot ok';
        showToast(`连上啦，找到 ${r.tools} 个小工具`, 'success');
      } else {
        statusMap.set(server.id, 'err');
        if (dot) dot.className = 'mcp-dot err';
        showToast(`连不上嘛：${r.error || '未知原因'}`, 'error');
      }
    } catch (err) {
      statusMap.set(server.id, 'err');
      if (dot) dot.className = 'mcp-dot err';
      showToast('连不上嘛，地址对不对？', 'error');
    } finally {
      btn.disabled = false;
    }
  });

  // 编辑
  row.querySelector('[data-act=edit]').addEventListener('click', (e) => {
    e.stopPropagation();
    openServerForm({
      title: '编辑工具',
      initial: server,
      onSave: async (data) => {
        if (!data.name || !data.url) {
          showToast('名字和地址要填上嘛', 'error');
          return false;
        }
        try {
          await saveServer({ ...server, ...data });
          showToast('改好啦', 'success');
          await refreshList();
          return true;
        } catch (e) {
          console.warn('[mcp] 编辑失败', e);
          showToast('没保存成功，再试一下嘛', 'error');
          return false;
        }
      }
    });
  });

  // 删除
  row.querySelector('[data-act=del]').addEventListener('click', (e) => {
    e.stopPropagation();
    showConfirm({
      title: '删掉这个工具吗？',
      body: `「${server.name || '未命名'}」删掉后就连不上啦。`,
      confirmText: '删掉吧',
      cancelText: '不要',
      danger: true,
      onConfirm: async () => {
        try {
          await deleteServer(server.id);
          showToast('删掉啦', 'default', 1200);
          expandedSet.delete(server.id);
          statusMap.delete(server.id);
          await refreshList();
        } catch (e) {
          console.warn('[mcp] 删除失败', e);
          showToast('没删掉，再试一下嘛', 'error');
        }
      }
    });
  });

  // 如果之前已展开，立即拉一次工具
  if (expanded) {
    Promise.resolve().then(toggleExpand).catch(() => {});
  }

  return row;
}

/** 把工具列表渲染进展开区 */
function renderTools(container, tools, server) {
  if (!Array.isArray(tools) || !tools.length) {
    container.innerHTML = `<div class="mcp-tools-loading">连是连上了，但没找到小工具呢～</div>`;
    return;
  }
  const html = [`<div class="mcp-tools-title">${tools.length} 个小工具</div>`]
    .concat(tools.slice(0, 20).map((t) => `
      <div class="mcp-tool-item">
        <div class="mcp-tool-name">${escapeAttr(t.name || '未命名')}</div>
        ${t.description ? `<div class="mcp-tool-desc">${escapeAttr(t.description)}</div>` : ''}
      </div>
    `))
    .join('');
  container.innerHTML = html;
}

/**
 * 添加 / 编辑 服务器的弹层表单。
 * @param {object} opts { title, initial, onSave } onSave 返回 true 时关闭弹层
 */
function openServerForm(opts = {}) {
  const { title = '加一个新工具', initial = {}, onSave } = opts;
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="mcp-form-field">
      <label class="mcp-form-label" for="mcp-f-name">名字（叫它什么好呢）</label>
      <input class="input" id="mcp-f-name" type="text" placeholder="如：天气小助手" value="${escapeAttr(initial.name || '')}">
    </div>
    <div class="mcp-form-field">
      <label class="mcp-form-label" for="mcp-f-url">地址</label>
      <input class="input" id="mcp-f-url" type="text" placeholder="https://..." value="${escapeAttr(initial.url || '')}">
    </div>
    <div class="mcp-form-field">
      <label class="mcp-form-label" for="mcp-f-key">钥匙（没有就留空）</label>
      <input class="input" id="mcp-f-key" type="password" placeholder="Bearer Token..." value="${escapeAttr(initial.apiKey || '')}">
    </div>
    <div class="mcp-form-actions">
      <button class="btn" id="mcp-f-test" type="button">试一下</button>
      <button class="btn primary" id="mcp-f-save" type="button">存起来</button>
    </div>
  `;

  const sheet = showBottomSheet({ title, bodyElement: body, dismissible: true });

  const readForm = () => ({
    name: body.querySelector('#mcp-f-name').value.trim(),
    url: body.querySelector('#mcp-f-url').value.trim(),
    apiKey: body.querySelector('#mcp-f-key').value.trim()
  });

  // 试一下：临时存一下再调 testServer
  body.querySelector('#mcp-f-test').addEventListener('click', async () => {
    const data = readForm();
    if (!data.url) { showToast('地址要填上嘛', 'error'); return; }
    const btn = body.querySelector('#mcp-f-test');
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = '试一下嘛...';
    try {
      const tempId = initial.id || generateId('mcp_tmp');
      await saveServer({ id: tempId, name: data.name || '临时测试', url: data.url, apiKey: data.apiKey });
      const r = await testServer(tempId);
      if (r.ok) {
        showToast(`连上啦，找到 ${r.tools} 个小工具`, 'success');
      } else {
        showToast(`连不上嘛：${r.error || '未知原因'}`, 'error');
      }
      // 测试用的临时 server 不留在列表里：除非 initial.id 已存在，否则删掉
      if (!initial.id) {
        try { await deleteServer(tempId); } catch (e) {}
      }
    } catch (e) {
      console.warn('[mcp] 测试失败', e);
      showToast('连不上嘛，地址对不对？', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  });

  // 存起来
  body.querySelector('#mcp-f-save').addEventListener('click', async () => {
    const data = readForm();
    if (!data.name || !data.url) {
      showToast('名字和地址要填上嘛', 'error');
      return;
    }
    if (!/^https?:\/\//i.test(data.url)) {
      showToast('地址要 http 或 https 开头哦', 'error');
      return;
    }
    const ok = onSave ? await onSave(data) : true;
    if (ok) {
      sheet.close();
    }
  });
}
