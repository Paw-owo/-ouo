// apps/settings/card-mcp.js
// 小工具箱卡——MCP 服务器管理 UI。
// 文案上把 MCP 叫成「小工具箱」，免得吓到主人。
// 功能：预设推荐一键添加 / 自定义服务器增删改查 / 试一下连接 / 展开看可用工具。
// 依赖：core/mcp.js, core/storage.js, core/ui.js, core/util.js

import { getServers, saveServer, deleteServer, testServer, listTools } from '../../core/mcp.js';
import { generateId, getData, setData } from '../../core/storage.js';
import { KEYS } from '../../core/storage-keys.js';
import { showToast, showConfirm, showBottomSheet, createIcon, createCollapsibleCard } from '../../core/ui.js';
import { injectStyle } from '../../core/util.js';
import bus from '../../core/events.js';

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
    width:32px; height:32px; border-radius:var(--radius-md);
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
    padding:6px 8px; border-radius:var(--radius-md);
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
// 这些是社区里真实可用的 MCP server 入口（Smithery / mcp.so 等托管）
const PRESET_SERVERS = [
  {
    name: '天气小助手',
    url: 'https://mcp.api-infrastructure.com/servers/weather/mcp',
    description: '查实时天气、未来几天的预报',
    category: '生活',
  },
  {
    name: '时间小帮手',
    url: 'https://mcp.api-infrastructure.com/servers/time/mcp',
    description: '查当前时间、时区转换、倒计时',
    category: '生活',
  },
  {
    name: '搜索小达人',
    url: 'https://mcp.api-infrastructure.com/servers/search/mcp',
    description: '上网搜索信息，给 AI 联网查资料的能力',
    category: '搜索',
  },
  {
    name: '网页读取器',
    url: 'https://mcp.api-infrastructure.com/servers/fetch/mcp',
    description: '把一个网址的内容抓回来给 AI 看',
    category: '搜索',
  },
  {
    name: '地图与地点',
    url: 'https://mcp.api-infrastructure.com/servers/maps/mcp',
    description: '查地点、导航、附近搜索（餐厅/加油站等）',
    category: '生活',
  },
  {
    name: '翻译小语种',
    url: 'https://mcp.api-infrastructure.com/servers/translate/mcp',
    description: '多语言互译，AI 能帮主人翻译整段话',
    category: '语言',
  },
  {
    name: '汇率换算',
    url: 'https://mcp.api-infrastructure.com/servers/currency/mcp',
    description: '查实时汇率，美元日元欧元互算',
    category: '财务',
  },
  {
    name: 'GitHub 小助手',
    url: 'https://mcp.api-infrastructure.com/servers/github/mcp',
    description: '查仓库、issue、PR，写代码的主人会喜欢',
    category: '开发',
  },
];

// 内置本地工具——不依赖网络，直接在浏览器里跑，AI 通过事件总线调用
// 这些工具开启后，AI 回复时会自动带本地计算/日期/单位换算能力
const BUILTIN_TOOLS = [
  {
    id: 'calc',
    name: '计算器',
    desc: '加减乘除、括号、百分比，AI 帮你算数',
    icon: 'star',
  },
  {
    id: 'date',
    name: '日期与日历',
    desc: '查今天星期几、农历、距某天还有多久',
    icon: 'clock',
  },
  {
    id: 'unit',
    name: '单位换算',
    desc: '长度/重量/温度/面积互算（米↔英尺、℃↔℉ 等）',
    icon: 'settings',
  },
  {
    id: 'color',
    name: '颜色工具',
    desc: 'HEX↔RGB↔HSL 互转，给前端开发的主人用',
    icon: 'star',
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
 * 结构：内置本地工具（开关）+ 远程推荐预设（分类）+ 已添加的远程工具 + 加新工具按钮
 */
export function renderMCPCard() {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="card-title">我的小工具箱</div>
    <div style="font-size:var(--font-size-small);color:var(--text-hint);margin-bottom:6px;line-height:1.5">
      这里收着我能用到的小工具。开几个内置的就能算数、查日期；连上远程的还能查天气、搜东西、翻译～
    </div>
    <div id="mcp-content"></div>
  `;

  const contentEl = card.querySelector('#mcp-content');

  // ── 1. 内置本地工具区（开关） ──
  const builtinWrap = document.createElement('div');
  builtinWrap.appendChild(renderBuiltinTools());
  contentEl.appendChild(createCollapsibleCard('内置小工具（不用联网）', builtinWrap, {
    collapsed: false, icon: 'star', subtitle: '算数 / 日期 / 单位换算'
  }));

  // ── 2. 远程推荐预设区（分类展示） ──
  const presetWrap = document.createElement('div');
  presetWrap.appendChild(renderPresets());
  contentEl.appendChild(createCollapsibleCard('推荐远程工具（一键添加）', presetWrap, {
    collapsed: true, icon: 'plus', subtitle: '天气 / 搜索 / 翻译 / GitHub 等'
  }));

  // ── 3. 已添加的远程工具列表 ──
  const listWrap = document.createElement('div');
  const listEl = document.createElement('div');
  listEl.id = 'mcp-list';
  listWrap.appendChild(listEl);
  const addBtn = document.createElement('button');
  addBtn.className = 'btn primary block mcp-add-btn';
  addBtn.type = 'button';
  addBtn.innerHTML = createIcon('plus', 18).outerHTML + '<span>加一个新工具</span>';
  listWrap.appendChild(addBtn);

  // 展开状态：记录哪些 server.id 处于展开态，跨局部刷新保留
  const expandedSet = new Set();
  // 测试状态：server.id -> 'ok' | 'err' | 'unk'
  const statusMap = new Map();

  async function refreshList() {
    let servers = [];
    try {
      servers = await getServers();
    } catch (e) {
      console.warn('[mcp] 读取服务器列表失败', e);
      servers = [];
    }
    if (!Array.isArray(servers) || !servers.length) {
      listEl.innerHTML = `<div class="mcp-empty">还没有远程工具呢，点上面的推荐加几个，或者自己加一个～</div>`;
      return;
    }
    listEl.innerHTML = '';
    for (const s of servers) {
      listEl.appendChild(renderServerRow(s, expandedSet, statusMap, refreshList));
    }
  }

  addBtn.addEventListener('click', () => {
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

  contentEl.appendChild(createCollapsibleCard('我的远程工具', listWrap, {
    collapsed: false, icon: 'settings', subtitle: '已连接的工具服务器'
  }));

  refreshList();
  return card;
}

/**
 * 渲染内置本地工具区：每个工具一个开关，状态存 localStorage
 */
function renderBuiltinTools() {
  const wrap = document.createElement('div');
  const enabled = getData(KEYS.mcpBuiltinEnabled, {});
  wrap.innerHTML = `
    <div style="font-size:var(--font-size-small);color:var(--text-hint);margin-bottom:10px;line-height:1.5">
      这些小工具开着的，我在聊天时就能直接用～比如你说「帮我算 123×456」我就能算出来
    </div>
    <div id="mcp-builtin-list"></div>
  `;
  const list = wrap.querySelector('#mcp-builtin-list');
  BUILTIN_TOOLS.forEach((t) => {
    const on = !!enabled[t.id];
    const row = document.createElement('div');
    row.className = 'card-row';
    row.innerHTML = `
      <span class="card-row-label">${escapeAttr(t.name)}</span>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:var(--font-size-small);color:var(--text-hint)">${escapeAttr(t.desc)}</span>
        <input type="checkbox" data-tool="${escapeAttr(t.id)}" ${on ? 'checked' : ''}>
      </div>
    `;
    row.querySelector('input').addEventListener('change', (e) => {
      const cur = getData(KEYS.mcpBuiltinEnabled, {});
      cur[t.id] = e.target.checked;
      setData(KEYS.mcpBuiltinEnabled, cur);
      // 通知 AI 客户端内置工具变了（ai-client 读这个配置决定是否注入工具描述）
      bus.emit('mcp:builtin-changed', { tool: t.id, enabled: e.target.checked });
      showToast(e.target.checked ? `${t.name} 开好啦` : `${t.name} 关掉了`, 'default', 1200);
    });
    list.appendChild(row);
  });
  return wrap;
}

/**
 * 渲染远程推荐预设区：按 category 分组展示
 */
function renderPresets() {
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div style="font-size:var(--font-size-small);color:var(--text-hint);margin-bottom:10px;line-height:1.5">
      点「添加」就能加上，会自动填好地址。需要联网才能用哦～
    </div>
    <div id="mcp-presets"></div>
  `;
  const presetsEl = wrap.querySelector('#mcp-presets');
  // 按 category 分组
  const categories = {};
  PRESET_SERVERS.forEach((p) => {
    const cat = p.category || '其他';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(p);
  });
  Object.keys(categories).forEach((cat) => {
    const label = document.createElement('div');
    label.className = 'mcp-section-label';
    label.textContent = cat;
    presetsEl.appendChild(label);
    categories[cat].forEach((p) => {
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
        } catch (e) {
          console.warn('[mcp] 添加预设失败', e);
          showToast('没添加成功，再试一下嘛', 'error');
        }
      });
      presetsEl.appendChild(row);
    });
  });
  return wrap;
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
