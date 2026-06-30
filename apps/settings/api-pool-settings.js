// apps/settings/api-pool-settings.js
// imports:
//   from '../../core/ui.js': showToast, showBottomSheet, hideBottomSheet, showConfirm, createIcon
//   from '../../core/api.js': smartModelsUrl, parseErrorResponse, buildHeaders, getApiPoolItems, getPoolGroups, setPoolGroups, addPoolEndpoint, updatePoolEndpoint, deletePoolEndpoint, getMergedPoolModels, testPoolEndpoint, testAllPoolEndpoints
//   from '../../core/storage.js': generateId, getNow

import { showToast, showBottomSheet, hideBottomSheet, showConfirm, createIcon } from '../../core/ui.js';
import {
  smartModelsUrl,
  parseErrorResponse,
  buildHeaders,
  getApiPoolItems,
  getPoolGroups,
  setPoolGroups,
  addPoolEndpoint,
  updatePoolEndpoint,
  deletePoolEndpoint,
  getMergedPoolModels,
  testPoolEndpoint,
  testAllPoolEndpoints
} from '../../core/api.js';
import { generateId, getNow } from '../../core/storage.js';

let hostEl = null;
let backHandler = null;
let refreshHandler = null;
let styleEl = null;
let testingAll = false;

const GROUP_COLLAPSE_KEY = 'app_api_pool_collapsed';

const STATUS_LABELS = {
  active: '可用',
  ok: '可用',
  billing: '欠费',
  invalid_key: 'Key 无效',
  model_not_found: '模型不存在',
  rate_limited: '限流',
  network_error: '网络错误',
  bad_response: '返回格式异常',
  error: '未知异常',
  cooldown: '限流',
  disabled: '已停用',
  unknown: '未知异常'
};

const STATUS_ORDER = {
  active: 0,
  ok: 0,
  billing: 7,
  invalid_key: 6,
  model_not_found: 5,
  rate_limited: 4,
  cooldown: 4,
  network_error: 3,
  bad_response: 2,
  error: 1,
  unknown: 1,
  disabled: 9
};

export async function mount(containerEl, options = {}) {
  hostEl = containerEl;
  backHandler = typeof options.onBack === 'function' ? options.onBack : null;
  refreshHandler = typeof options.onRefresh === 'function' ? options.onRefresh : null;
  injectStyle();
  await render();
}

export function unmount() {
  hideBottomSheet();
  hostEl = null;
  backHandler = null;
  refreshHandler = null;
}

export async function renderApiPoolSettings(options = {}) {
  const wrap = page();
  backHandler = typeof options.onBack === 'function' ? options.onBack : backHandler;
  refreshHandler = typeof options.onRefresh === 'function' ? options.onRefresh : refreshHandler;
  injectStyle();

  const groups = getPoolGroups();
  const rawItems = await getApiPoolItems();
  const items = sortPoolItems(rawItems);
  const mergedModels = await getMergedPoolModels();
  const collapsed = getCollapsedGroups();

  const top = card('API 轮换池', '按可用性、模型、最近成功、延迟和分组自动排队，不会把低延迟异常源当成好接口');
  top.append(actionRow([
    actionBtn('back', '返回设置', () => goBack()),
    actionBtn('add', '新增接口', () => openPoolEndpointEditor(null)),
    actionBtn('refresh', testingAll ? '测试中' : '全部测试', () => testAll())
  ]));
  wrap.append(top);

  const quick = card('快捷添加', '免 Key 直连和免费 API 预设可以直接加进免费组');
  quick.append(actionRow([
    actionBtn('play', '免Key直连', openAnonymousSelector),
    actionBtn('play', '免费API预设', openFreeApiSelector)
  ]));
  wrap.append(quick);

  const stat = card('模型总览', `已合并 ${mergedModels.length} 个模型名`);
  stat.append(actionRow([
    actionBtn('copy', '查看模型', () => openModelSummary(mergedModels)),
    actionBtn('refresh', '刷新列表', () => rerender())
  ]));
  wrap.append(stat);

  const listContainer = el('div', 'api-pool-list-container');
  listContainer.dataset.role = 'pool-list';

  if (!items.length) {
    listContainer.append(empty('轮换池还空空的，先加一条接口吧 OvO'));
  } else {
    const paidItems = items.filter((item) => item.groupType !== 'free');
    const freeItems = items.filter((item) => item.groupType === 'free');

    listContainer.append(
      collapsibleGroupCard({
        groupKey: 'paid',
        title: groups.paid?.name || '付费组',
        desc: '失败会自动切下一个，优先记住上次成功的那条',
        items: paidItems,
        enabled: groups.paid?.enabled !== false,
        collapsed: collapsed.paid !== false
      })
    );

    listContainer.append(
      collapsibleGroupCard({
        groupKey: 'free',
        title: groups.free?.name || '免费组',
        desc: '只试第一条，超过一分钟才提醒换模型',
        items: freeItems,
        enabled: groups.free?.enabled !== false,
        collapsed: collapsed.free !== false
      })
    );
  }

  wrap.append(listContainer);
  return wrap;
}

// ═══════════════════════════════════════
// 【折叠分组卡片】
// ═══════════════════════════════════════

function getCollapsedGroups() {
  return getData_local(GROUP_COLLAPSE_KEY) || { paid: true, free: true };
}

function saveCollapsedGroups(state) {
  setData_local(GROUP_COLLAPSE_KEY, state || { paid: true, free: true });
}

function getData_local(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setData_local(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function collapsibleGroupCard({ groupKey, title, desc, items, enabled, collapsed }) {
  const box = el('div', 'api-pool-collapsible-group');
  box.dataset.groupKey = groupKey;
  box.dataset.collapsed = collapsed ? 'true' : 'false';

  // ── 标题行 ──
  const header = el('div', 'api-pool-group-header');

  const toggleBtn = el('button', 'api-pool-group-toggle');
  toggleBtn.type = 'button';
  toggleBtn.setAttribute('aria-label', `展开或收起 ${title}`);

  const toggleIcon = el('span', 'api-pool-group-toggle-icon');
  toggleIcon.append(safeIcon('chevron', 16));

  const titleBox = el('div', 'api-pool-group-title-box');
  const nameInput = el('input', 'api-pool-group-name-input');
  nameInput.type = 'text';
  nameInput.value = title;
  nameInput.setAttribute('aria-label', `${title} 分组名字`);
  nameInput.addEventListener('blur', () => {
    const newName = nameInput.value.trim() || title;
    const groups = getPoolGroups();
    setPoolGroups({ ...groups, [groupKey]: { ...groups[groupKey], name: newName } });
    showToast('分组名字收好啦');
  });
  nameInput.addEventListener('click', (e) => e.stopPropagation());

  const countBadge = el('span', 'api-pool-group-count', String(items.length));

  titleBox.append(nameInput, countBadge);

  toggleBtn.append(toggleIcon, titleBox);
  toggleBtn.addEventListener('click', () => {
    const isCollapsed = box.dataset.collapsed === 'true';
    const nextCollapsed = !isCollapsed;
    box.dataset.collapsed = nextCollapsed ? 'true' : 'false';
    const state = getCollapsedGroups();
    state[groupKey] = nextCollapsed;
    saveCollapsedGroups(state);
  });

  // ── 启用开关 ──
  const switchEl = el('button', `api-pool-group-switch ${enabled ? 'on' : ''}`);
  switchEl.type = 'button';
  switchEl.dataset.value = enabled ? 'true' : 'false';
  switchEl.append(el('i', 'api-pool-group-switch-dot'));
  switchEl.addEventListener('click', (e) => {
    e.stopPropagation();
    const next = switchEl.dataset.value !== 'true';
    switchEl.dataset.value = next ? 'true' : 'false';
    switchEl.classList.toggle('on', next);
    const groups = getPoolGroups();
    setPoolGroups({ ...groups, [groupKey]: { ...groups[groupKey], enabled: next } });
    showToast(next ? `${title} 开启啦` : `${title} 关好啦`);
  });

  header.append(toggleBtn, switchEl);
  box.append(header);

  // ── 描述 ──
  const descEl = el('p', 'api-pool-group-desc', desc);
  box.append(descEl);

  // ── 折叠摘要 ──
  const summary = el('div', 'api-pool-group-summary');
  if (items.length) {
    items.slice(0, 3).forEach((item) => {
      const row = el('div', 'api-pool-summary-row');
      const status = normalizeStatus(item.status, item.lastErrorMessage);
      const statusLabel = STATUS_LABELS[status] || STATUS_LABELS.unknown;
      const model = item.model || item.models?.[0] || '未选择';
      const latency = Number(item.lastLatencyMs || 0) > 0 ? `${item.lastLatencyMs}ms` : '';
      row.append(
        el('span', `api-pool-summary-dot api-pool-status-dot-${status}`, ''),
        el('strong', '', item.name || '未命名接口'),
        el('small', '', model),
        latency ? el('small', 'api-pool-summary-latency', latency) : el('span', ''),
        el('span', `api-pool-summary-badge api-pool-status-${status}`, statusLabel)
      );
      summary.append(row);
    });
    if (items.length > 3) {
      summary.append(el('div', 'api-pool-summary-more', `还有 ${items.length - 3} 条，点展开看全部`));
    }
  } else {
    summary.append(empty('还没有接口'));
  }
  box.append(summary);

  // ── 展开详情区 ──
  const detail = el('div', 'api-pool-group-detail');
  items.forEach((item) => {
    detail.append(poolProviderCard(item, title));
  });
  detail.append(actionRow([
    actionBtn('add', `加${title}接口`, () => openPoolEndpointEditor({ groupType }))
  ]));
  box.append(detail);

  return box;
}

async function render() {
  if (!hostEl) return;
  hostEl.innerHTML = '';
  hostEl.append(await renderApiPoolSettings({ onBack: backHandler, onRefresh: refreshHandler }));
}

function rerender() {
  if (hostEl) {
    render();
    return;
  }
  refreshHandler?.();
}

async function refreshList() {
  if (!hostEl) return;
  const container = hostEl.querySelector('[data-role="pool-list"]');
  if (!container) {
    rerender();
    return;
  }

  const groups = getPoolGroups();
  const rawItems = await getApiPoolItems();
  const items = sortPoolItems(rawItems);
  const collapsed = getCollapsedGroups();

  container.innerHTML = '';

  if (!items.length) {
    container.append(empty('轮换池还空空的，先加一条接口吧 OvO'));
    return;
  }

  const paidItems = items.filter((item) => item.groupType !== 'free');
  const freeItems = items.filter((item) => item.groupType === 'free');

  container.append(
    collapsibleGroupCard({
      groupKey: 'paid',
      title: groups.paid?.name || '付费组',
      desc: '失败会自动切下一个，优先记住上次成功的那条',
      items: paidItems,
      enabled: groups.paid?.enabled !== false,
      collapsed: collapsed.paid !== false
    })
  );

  container.append(
    collapsibleGroupCard({
      groupKey: 'free',
      title: groups.free?.name || '免费组',
      desc: '只试第一条，超过一分钟才提醒换模型',
      items: freeItems,
      enabled: groups.free?.enabled !== false,
      collapsed: collapsed.free !== false
    })
  );
}

function goBack() {
  if (backHandler) {
    backHandler();
    return;
  }
  window.dispatchEvent(new CustomEvent('settings:back'));
}

function poolProviderCard(api, groupName) {
  const item = el('div', 'api-pool-provider-card');
  item.dataset.poolId = api.id;

  const normalizedStatus = normalizeStatus(api.status, api.lastErrorMessage);
  const statusLabel = STATUS_LABELS[normalizedStatus] || STATUS_LABELS.unknown;
  const lastSuccess = api.lastSuccessAt || '还没有';
  const latency = Number(api.lastLatencyMs || 0) > 0 ? `${api.lastLatencyMs}ms` : '未记录';
  const model = api.model || api.models?.[0] || '未选择';

  const head = el('div', 'api-pool-provider-head');

  const iconEl = el('span', 'api-pool-provider-icon');
  iconEl.append(safeIcon(api.groupType === 'free' ? 'play' : 'settings', 16));

  const info = el('div', 'api-pool-provider-info');
  info.append(
    el('strong', '', api.name || '未命名接口'),
    el('small', '', api.endpoint || '未填写 baseURL')
  );

  const badge = el('span', `api-pool-status api-pool-status-${normalizedStatus}`, statusLabel);

  head.append(iconEl, info, badge);

  const meta = el('div', 'api-pool-meta');
  meta.append(
    metaItem('分组', api.groupName || groupName || (api.groupType === 'free' ? '免费组' : '付费组')),
    metaItem('当前模型', model),
    metaItem('上次成功', lastSuccess),
    metaItem('延迟', latency),
    metaItem('密钥', Array.isArray(api.keys) && api.keys.length ? `${api.keys.length} 个` : '没有'),
    metaItem('错误原因', api.lastErrorMessage || '暂无')
  );

  const actions = actionRow([
    actionBtn('check', '单独测试', async () => testOne(api.id)),
    actionBtn('refresh', '拉取模型', () => fetchModelsForExisting(api)),
    actionBtn('copy', '复制', () => duplicatePoolItem(api)),
    actionBtn('edit', '编辑', () => openPoolEndpointEditor(api)),
    actionBtn('delete', '删除', async () => {
      const ok = await showConfirm(`要删除 ${api.name || '这条接口'} 吗？`);
      if (!ok) return;
      await deletePoolEndpoint(api.id);
      showToast('接口删好啦');
      refreshList();
    })
  ]);

  item.append(head, meta, actions);
  return item;
}

function metaItem(label, value) {
  const node = el('div', 'api-pool-meta-item');
  node.append(el('span', '', label), el('strong', '', value || '未填写'));
  return node;
}

async function duplicatePoolItem(api) {
  const groups = getPoolGroups();
  await addPoolEndpoint({
    id: generateId('pool'),
    groupType: api.groupType,
    groupName: api.groupName || (api.groupType === 'free' ? '免费组' : '付费组'),
    name: `${api.name || '未命名接口'} 副本`,
    endpoint: api.endpoint,
    provider: api.provider,
    keys: [...(api.keys || [])],
    model: api.model,
    models: [...(api.models || [])],
    source: api.source || '',
    status: 'active'
  });
  showToast('复制好啦，改一下名字和 Key 就能用');
  refreshList();
}

async function testOne(id) {
  showToast('正在测试这条接口...');
  const result = await testPoolEndpoint(id);
  if (result.ok) {
    showToast(`连上啦，延迟 ${result.latencyMs}ms`);
  } else {
    showToast(formatApiError(result.message || '测试失败啦'));
  }
  refreshList();
}

async function testAll() {
  if (testingAll) {
    showToast('正在测试中，等一下哦');
    return;
  }

  testingAll = true;
  showToast('开始测试全部接口啦');

  try {
    const results = await testAllPoolEndpoints();
    const okCount = results.filter((item) => item.ok).length;
    showToast(`测完啦，${okCount} 条可用，${results.length - okCount} 条要哄哄`);
  } finally {
    testingAll = false;
    refreshList();
  }
}

async function fetchModelsForExisting(api) {
  const key = Array.isArray(api.keys) ? api.keys[0] || '' : '';
  if (!api.endpoint) {
    showToast('地址还没填哦');
    return;
  }

  showToast('正在拉取模型...');
  try {
    const models = await fetchModelsDirect({
      endpoint: api.endpoint,
      provider: api.provider || detectProviderFromUrl(api.endpoint),
      apiKey: key
    });

    if (!models.length) {
      showToast('没拉到模型，可以手填模型名');
      return;
    }

    await updatePoolEndpoint(api.id, {
      ...api,
      models,
      model: api.model || models[0],
      status: 'active',
      lastErrorMessage: '',
      updatedAt: getNow()
    });

    showToast(`拉到 ${models.length} 个模型啦`);
    refreshList();
  } catch (error) {
    await updatePoolEndpoint(api.id, {
      ...api,
      status: classifyStatusFromError(error),
      lastErrorAt: getNow(),
      lastErrorMessage: formatApiError(error?.message || '模型拉取失败'),
      updatedAt: getNow()
    });
    showToast(formatApiError(error?.message || '模型拉取失败'));
    refreshList();
  }
}

async function openPoolEndpointEditor(poolItem) {
  const groups = getPoolGroups();
  const current = {
    id: poolItem?.id || generateId('pool'),
    groupType: poolItem?.groupType === 'free' ? 'free' : 'paid',
    groupName: poolItem?.groupName || '',
    name: poolItem?.name || '',
    endpoint: poolItem?.endpoint || '',
    provider: poolItem?.provider || detectProviderFromUrl(poolItem?.endpoint || ''),
    keys: Array.isArray(poolItem?.keys) ? poolItem.keys : [],
    model: poolItem?.model || '',
    models: Array.isArray(poolItem?.models) ? [...poolItem.models] : [],
    source: poolItem?.source || '',
    status: poolItem?.status || 'active',
    lastSuccessAt: poolItem?.lastSuccessAt || '',
    lastErrorAt: poolItem?.lastErrorAt || '',
    lastErrorMessage: poolItem?.lastErrorMessage || '',
    lastLatencyMs: poolItem?.lastLatencyMs || 0
  };

  let draftModels = [...current.models];

  const sheet = sheetBox(poolItem?.id ? '编辑轮换池接口' : '新增轮换池接口');

  const groupType = selectRow('分组', current.groupType, [
    ['paid', groups.paid?.name || '付费组'],
    ['free', groups.free?.name || '免费组']
  ]);
  const name = inputRow('名称', current.name, '比如：主力接口');
  const endpoint = inputRow('地址', current.endpoint, 'https://api.xxx.com/v1');
  const provider = selectRow('接口类型', current.provider || detectProviderFromUrl(current.endpoint), [
    ['openai', '通用中转 / OpenAI 格式'],
    ['anthropic', 'Claude / Anthropic 格式'],
    ['gemini', 'Gemini 格式'],
    ['ollama', '本地 Ollama']
  ]);
  const model = inputRow('当前模型', current.model, '例如 gpt-4o-mini / deepseek-chat');

  const keyField = el('label', 'api-pool-field');
  const keyInput = el('textarea', 'api-pool-input');
  keyInput.rows = 4;
  keyInput.value = current.keys.join('\n');
  keyInput.placeholder = '一行一个 Key\n匿名接口可以留空';
  keyField.append(el('span', '', '密钥'), keyInput);

  const modelArea = el('div', 'api-pool-model-area');

  function renderModels() {
    modelArea.innerHTML = '';
    modelArea.append(modelPicker({
      models: draftModels,
      current: model.input.value.trim(),
      emptyText: '还没有模型，点拉取模型或手填都可以',
      onSelect: (value) => {
        model.input.value = value;
        renderModels();
        showToast(`模型抱好啦：${value}`);
      }
    }));
  }

  renderModels();

  sheet.body.append(groupType.wrap, name.wrap, endpoint.wrap, provider.wrap, keyField, model.wrap, modelArea);

  let loading = false;

  sheet.actions.append(
    actionBtn('refresh', '拉取模型', async () => {
      if (loading) {
        showToast('正在忙，等一下哦');
        return;
      }

      const endpointValue = endpoint.input.value.trim();
      const providerValue = provider.input.value || detectProviderFromUrl(endpointValue);
      const key = splitKeys(keyInput.value)[0] || '';

      if (!endpointValue) {
        showToast('先填地址哦');
        return;
      }

      loading = true;
      showToast('正在拉取模型...');

      try {
        draftModels = await fetchModelsDirect({ endpoint: endpointValue, provider: providerValue, apiKey: key });
        if (!draftModels.length) {
          showToast('没拉到模型，可以手填模型名');
        } else {
          renderModels();
          showToast(`拉到 ${draftModels.length} 个模型啦`);
        }
      } catch (error) {
        showToast(formatApiError(error?.message || '模型拉取失败'));
      } finally {
        loading = false;
      }
    }),

    actionBtn('play', '测试接口', async () => {
      if (loading) return;

      const endpointValue = endpoint.input.value.trim();
      const providerValue = provider.input.value || detectProviderFromUrl(endpointValue);
      const modelValue = model.input.value.trim();
      const key = splitKeys(keyInput.value)[0] || '';

      if (!endpointValue) {
        showToast('先填地址哦');
        return;
      }

      if (providerValue !== 'gemini' && !modelValue) {
        showToast('先填主模型哦');
        return;
      }

      loading = true;
      showToast('正在发一条小测试...');

      try {
        const result = await testDirect({
          endpoint: endpointValue,
          provider: providerValue,
          apiKey: key,
          model: modelValue
        });
        if (result.ok) {
          showToast(`连上啦，延迟 ${result.latencyMs}ms`);
        } else {
          showToast(formatApiError(result.message));
        }
      } finally {
        loading = false;
      }
    }),

    actionBtn('check', '保存', async () => {
      const endpointValue = endpoint.input.value.trim();
      const providerValue = provider.input.value || detectProviderFromUrl(endpointValue);
      const modelValue = model.input.value.trim();

      if (!endpointValue) {
        showToast('地址还没填哦');
        return;
      }

      if (providerValue !== 'gemini' && !modelValue) {
        showToast('主模型也要填一下哦');
        return;
      }

      const nextGroupType = groupType.input.value === 'free' ? 'free' : 'paid';
      const next = {
        ...current,
        groupType: nextGroupType,
        groupName: nextGroupType === 'free' ? (groups.free?.name || '免费组') : (groups.paid?.name || '付费组'),
        name: name.input.value.trim() || '未命名接口',
        endpoint: endpointValue,
        provider: providerValue,
        keys: splitKeys(keyInput.value),
        model: modelValue,
        models: draftModels,
        updatedAt: getNow()
      };

      const existing = await getApiPoolItems();
      const hasSame = existing.some((item) => String(item.id) === String(current.id));

      if (hasSame) await updatePoolEndpoint(current.id, next);
      else await addPoolEndpoint(next);

      hideBottomSheet();
      showToast('轮换池存好啦');
      refreshList();
    })
  );

  showBottomSheet(sheet.root);
}

async function openAnonymousSelector() {
  const items = await getApiPoolItems();
  const existingPresetIds = new Set(
    items
      .filter((item) => item.source === 'anonymous' && item.name)
      .map((item) => item.name)
  );

  const sheet = sheetBox('免Key直连');
  sheet.body.append(el('p', 'settings-free-note', '不需要注册，不需要填Key，点一下就能用。请求失败会自动切换到下一个接口'));

  const ANONYMOUS_API_PRESETS = [
    {
      id: 'anon_llm7',
      name: 'LLM7',
      endpoint: 'https://api.llm7.io/v1',
      provider: 'openai',
      model: 'gpt-4o-mini',
      modelList: ['gpt-4o-mini', 'deepseek-v3-0324', 'deepseek-r1-0528', 'gemini-2.5-flash-lite', 'qwen2.5-coder-32b', 'mistral-small-3.1-24b'],
      description: '免Key直连，30次/分钟'
    },
    {
      id: 'anon_ovhcloud',
      name: 'OVHcloud',
      endpoint: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1',
      provider: 'openai',
      model: 'Qwen/Qwen3.5-397B-A17B',
      modelList: ['Qwen/Qwen3.5-397B-A17B', 'Meta-Llama-3_3-70B-Instruct', 'Qwen/Qwen3.6-27B', 'Qwen/Qwen3-32B', 'Mistral-Small-3.1-24B-Instruct'],
      description: '免Key直连，欧盟机房'
    }
  ];

  ANONYMOUS_API_PRESETS.forEach((preset) => {
    const isActivated = existingPresetIds.has(preset.name);
    const presetCard = el('div', 'settings-free-preset');
    const info = el('div', 'settings-free-preset-info');
    info.append(
      el('strong', '', preset.name),
      el('small', '', `${preset.model} · ${preset.description}`)
    );
    const btn = actionBtn(
      isActivated ? 'check' : 'add',
      isActivated ? '已启用' : '加入免费组',
      () => {
        if (isActivated) {
          showToast('这个已经启用啦');
          return;
        }
        addAnonymousToPool(preset);
      }
    );
    presetCard.append(info, btn);
    sheet.body.append(presetCard);
  });

  showBottomSheet(sheet.root);
}

async function addAnonymousToPool(preset) {
  const groups = getPoolGroups();
  await addPoolEndpoint({
    id: generateId('pool'),
    groupType: 'free',
    groupName: groups.free?.name || '免费组',
    name: preset.name,
    endpoint: preset.endpoint,
    provider: preset.provider || 'openai',
    keys: [],
    model: preset.model,
    models: Array.isArray(preset.modelList) ? [...preset.modelList] : [],
    source: 'anonymous',
    status: 'active'
  });
  hideBottomSheet();
  showToast(`${preset.name} 加入免费组啦`);
  refreshList();
}

async function openFreeApiSelector() {
  const items = await getApiPoolItems();
  const existingPresetIds = new Set(
    items
      .filter((item) => item.source === 'free' && item.name)
      .map((item) => item.name)
  );

  const sheet = sheetBox('选择免费 API');
  sheet.body.append(el('p', 'settings-free-note', '免费 API 需要自己注册拿 Key，但不花钱。每个平台都有免费额度，注册后把 Key 填进去就行'));

  const FREE_API_PRESETS = [
    {
      id: 'free_siliconflow',
      name: '硅基流动',
      endpoint: 'https://api.siliconflow.cn/v1',
      provider: 'openai',
      model: 'Qwen/Qwen3-8B',
      modelList: ['Qwen/Qwen3-8B', 'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B'],
      description: '永久免费，注册即用'
    },
    {
      id: 'free_zhipu',
      name: '智谱清言',
      endpoint: 'https://open.bigmodel.cn/api/paas/v4',
      provider: 'openai',
      model: 'GLM-4.7-Flash',
      modelList: ['GLM-4.7-Flash', 'GLM-4.6V-Flash'],
      description: 'GLM-4.7-Flash 永久免费'
    },
    {
      id: 'free_openrouter',
      name: 'OpenRouter',
      endpoint: 'https://openrouter.ai/api/v1',
      provider: 'openai',
      model: 'meta-llama/llama-3.3-70b-instruct:free',
      modelList: ['meta-llama/llama-3.3-70b-instruct:free', 'openai/gpt-oss-20b:free', 'google/gemma-4-31b-it:free', 'qwen/qwen3-coder:free'],
      description: '22个免费模型，注册即用'
    },
    {
      id: 'free_groq',
      name: 'Groq',
      endpoint: 'https://api.groq.com/openai/v1',
      provider: 'openai',
      model: 'llama-3.3-70b-versatile',
      modelList: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'meta-llama/llama-4-scout-17b-16e-instruct', 'qwen3-32b', 'openai/gpt-oss-120b'],
      description: '超快推理，每日1000次免费'
    },
    {
      id: 'free_cerebras',
      name: 'Cerebras',
      endpoint: 'https://api.cerebras.ai/v1',
      provider: 'openai',
      model: 'gpt-oss-120b',
      modelList: ['gpt-oss-120b', 'gpt-oss-20b'],
      description: '超快芯片，每日100万Token免费'
    },
    {
      id: 'free_sambanova',
      name: 'SambaNova',
      endpoint: 'https://api.sambanova.ai/v1',
      provider: 'openai',
      model: 'DeepSeek-V3.1',
      modelList: ['DeepSeek-V3.1', 'Meta-Llama-3.3-70B-Instruct', 'gpt-oss-120b', 'MiniMax-M2.7'],
      description: '超快RDU推理，每日20万Token免费'
    }
  ];

  FREE_API_PRESETS.forEach((preset) => {
    const isActivated = existingPresetIds.has(preset.name);
    const presetCard = el('div', 'settings-free-preset');
    const info = el('div', 'settings-free-preset-info');
    const modelStr = Array.isArray(preset.modelList) ? preset.modelList.join(' / ') : preset.model;
    info.append(
      el('strong', '', preset.name),
      el('small', '', `${preset.description}\n免费模型：${modelStr}`)
    );
    const btn = actionBtn(
      isActivated ? 'check' : 'add',
      isActivated ? '已启用' : '加入免费组',
      () => {
        if (isActivated) {
          showToast('这个已经启用啦');
          return;
        }
        addFreeToPool(preset);
      }
    );
    presetCard.append(info, btn);
    sheet.body.append(presetCard);
  });

  showBottomSheet(sheet.root);
}

async function addFreeToPool(preset) {
  const groups = getPoolGroups();
  await addPoolEndpoint({
    id: generateId('pool'),
    groupType: 'free',
    groupName: groups.free?.name || '免费组',
    name: preset.name,
    endpoint: preset.endpoint,
    provider: preset.provider || 'openai',
    keys: [],
    model: preset.model,
    models: Array.isArray(preset.modelList) ? [...preset.modelList] : [],
    source: 'free',
    status: 'active'
  });
  hideBottomSheet();
  showToast(`${preset.name} 加入免费组啦，点编辑填入 Key`);
  refreshList();
}

function openModelSummary(models) {
  const sheet = sheetBox('模型总表');

  if (!models.length) {
    sheet.body.append(empty('还没有模型记录'));
  } else {
    models.forEach((model) => {
      const item = el('div', 'api-pool-model-item');
      item.append(
        el('strong', '', model.name || model.key || '未命名模型'),
        el('small', '', `别名：${(model.aliases || []).join(' / ') || '暂无'}\n来源：${(model.sources || []).length} 条接口`)
      );
      sheet.body.append(item);
    });
  }

  sheet.actions.append(actionBtn('check', '知道啦', hideBottomSheet));
  showBottomSheet(sheet.root);
}

function sortPoolItems(items) {
  return [...(items || [])].sort((a, b) => {
    const aStatus = normalizeStatus(a.status, a.lastErrorMessage);
    const bStatus = normalizeStatus(b.status, b.lastErrorMessage);

    const statusDiff = (STATUS_ORDER[aStatus] ?? STATUS_ORDER.unknown) - (STATUS_ORDER[bStatus] ?? STATUS_ORDER.unknown);
    if (statusDiff !== 0) return statusDiff;

    const modelDiff = Number(Boolean(b.model || b.models?.length)) - Number(Boolean(a.model || a.models?.length));
    if (modelDiff !== 0) return modelDiff;

    const successDiff = parseTime(b.lastSuccessAt) - parseTime(a.lastSuccessAt);
    if (successDiff !== 0) return successDiff;

    const aLatency = Number(a.lastLatencyMs || 999999);
    const bLatency = Number(b.lastLatencyMs || 999999);
    const latencyDiff = aLatency - bLatency;
    if (latencyDiff !== 0) return latencyDiff;

    const groupDiff = groupPriority(a) - groupPriority(b);
    if (groupDiff !== 0) return groupDiff;

    return String(a.name || '').localeCompare(String(b.name || ''));
  });
}

function groupPriority(item) {
  if (item.groupType !== 'free') return 0;
  return 1;
}

function parseTime(value) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function normalizeStatus(status, message = '') {
  const raw = String(status || '').trim();
  if (raw && raw !== 'error') return raw;

  const text = String(message || '').toLowerCase();

  if (/402|insufficient|quota|balance|额度|余额|欠费/.test(text)) return 'billing';
  if (/401|403|unauthorized|forbidden|invalid.*key|api key|密钥|key/.test(text)) return 'invalid_key';
  if (/404|model.*not.*found|模型.*不存在|模型名没找到/.test(text)) return 'model_not_found';
  if (/429|rate|limit|too many|限流|请求太密/.test(text)) return 'rate_limited';
  if (/failed to fetch|network|cors|网络|跨域|连接失败/.test(text)) return 'network_error';
  if (/format|json|parse|格式/.test(text)) return 'bad_response';

  if (raw === 'active' || raw === 'ok') return 'active';
  if (raw === 'disabled') return 'disabled';
  return raw || 'unknown';
}

function classifyStatusFromError(error) {
  if (error?.status === 402) return 'billing';
  if (error?.status === 401 || error?.status === 403) return 'invalid_key';
  if (error?.status === 404) return 'model_not_found';
  if (error?.status === 429) return 'rate_limited';

  const message = String(error?.message || '');
  return normalizeStatus('error', message);
}

function formatApiError(message) {
  const raw = String(message || '').trim();
  if (!raw) return '测试失败啦';

  if (/failed to fetch|load failed|networkerror|cors/i.test(raw)) {
    return '这个中转站被浏览器拦住啦，可能没开放网页直连';
  }

  return raw
    .replace(/^HTTP\s*\d+\s*[｜|]\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .trim() || '测试失败啦';
}

function splitKeys(value) {
  return String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function detectProviderFromUrl(endpoint) {
  const raw = String(endpoint || '').toLowerCase();
  if (raw.includes('anthropic.com')) return 'anthropic';
  if (raw.includes('generativelanguage.googleapis.com')) return 'gemini';
  if (raw.includes('localhost') || raw.includes('127.0.0.1')) return 'ollama';
  return 'openai';
}

function page() {
  return el('div', 'api-pool-page settings-page');
}

function card(title, desc) {
  const node = el('div', 'settings-card');
  node.append(el('div', 'settings-card-title', title));
  if (desc) node.append(el('p', 'settings-card-desc', desc));
  return node;
}

function empty(text) {
  const node = el('div', 'settings-empty');
  node.textContent = text;
  return node;
}

function actionRow(buttons) {
  const row = el('div', 'settings-actions');
  buttons.forEach((btn) => row.append(btn));
  return row;
}

function actionBtn(icon, text, onClick) {
  const btn = el('button', 'settings-action-btn');
  btn.type = 'button';
  btn.append(safeIcon(icon, 17), el('span', '', text));
  btn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick?.(event);
  });
  return btn;
}

function inputRow(label, value, placeholder) {
  const wrap = el('label', 'api-pool-field');
  const input = el('input', 'api-pool-input');
  input.type = 'text';
  input.value = value || '';
  input.placeholder = placeholder || '';
  wrap.append(el('span', '', label), input);
  return { wrap, input };
}

function selectRow(label, value, options) {
  const wrap = el('label', 'api-pool-field');
  const input = el('select', 'api-pool-input api-pool-select');

  options.forEach(([val, text]) => {
    const option = document.createElement('option');
    option.value = val;
    option.textContent = text;
    input.append(option);
  });

  input.value = value || options[0]?.[0] || '';
  wrap.append(el('span', '', label), input);
  return { wrap, input };
}

function modelPicker({ models = [], current = '', onSelect, emptyText = '还没有模型' }) {
  const box = el('div', 'api-pool-model-picker');
  box.append(el('div', 'api-pool-model-title', '模型小篮子'));

  if (!models.length) {
    box.append(el('p', 'settings-note', emptyText));
    return box;
  }

  const list = el('div', 'api-pool-model-list');

  models.forEach((model) => {
    const btn = el('button', `api-pool-model-chip ${model === current ? 'active' : ''}`);
    btn.type = 'button';
    btn.append(el('span', '', model), el('small', '', model === current ? '正在用' : '点我选'));
    btn.addEventListener('click', () => onSelect?.(model));
    list.append(btn);
  });

  box.append(list);
  return box;
}

function sheetBox(title) {
  const root = el('div', 'api-pool-sheet');
  const body = el('div', 'api-pool-sheet-body');
  const actions = el('div', 'settings-actions');
  root.append(el('div', 'api-pool-sheet-title', title), body, actions);
  return { root, body, actions };
}

async function fetchModelsDirect({ endpoint, provider, apiKey }) {
  const url = buildModelsUrl(endpoint, provider);
  const response = await fetch(url, {
    method: 'GET',
    headers: buildHeaders(apiKey, provider),
    cache: 'no-store'
  });

  if (!response.ok) {
    const message = await parseErrorResponse(response);
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  const data = await response.json().catch(() => null);
  const models = extractModelList(data, provider);

  if (!Array.isArray(models)) {
    const error = new Error('返回格式异常');
    error.statusType = 'bad_response';
    throw error;
  }

  return [...new Set(models.filter(Boolean))];
}

async function testDirect({ endpoint, provider, apiKey, model }) {
  const startedAt = Date.now();

  try {
    const url = buildChatUrl(endpoint, provider, model, apiKey);
    const body = buildTestBody(provider, model);

    const response = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(apiKey, provider),
      cache: 'no-store',
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const message = await parseErrorResponse(response);
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }

    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('json') && provider !== 'ollama') {
      const text = await response.text().catch(() => '');
      if (!text.trim()) {
        return { ok: false, message: '返回格式异常', latencyMs: Date.now() - startedAt };
      }
      return { ok: true, message: '连接成功', latencyMs: Date.now() - startedAt };
    }

    const data = await response.json().catch(() => null);
    if (!isValidChatResponse(data, provider)) {
      return { ok: false, message: '返回格式异常', latencyMs: Date.now() - startedAt };
    }

    return { ok: true, message: '连接成功', latencyMs: Date.now() - startedAt };
  } catch (error) {
    return {
      ok: false,
      message: formatApiError(error?.message || '连接失败'),
      latencyMs: Date.now() - startedAt
    };
  }
}

function buildModelsUrl(endpoint, provider) {
  const base = String(endpoint || '').trim().replace(/\/+$/, '');

  if (provider === 'gemini') {
    if (/\/v1beta\/models$/i.test(base)) return base;
    return base
      .replace(/\/v1beta\/models\/[^/]+:generateContent$/i, '/v1beta/models')
      .replace(/\/v1beta\/models\/[^/]+:streamGenerateContent$/i, '/v1beta/models')
      .replace(/\/v1beta\/?$/i, '/v1beta/models')
      .replace(/\/+$/, '');
  }

  return smartModelsUrl(base, provider);
}

function buildChatUrl(endpoint, provider, model, apiKey) {
  const base = String(endpoint || '').trim().replace(/\/+$/, '');

  if (provider === 'anthropic') {
    if (/\/messages$/i.test(base)) return base;
    if (/\/v1$/i.test(base)) return `${base}/messages`;
    return `${base}/v1/messages`;
  }

  if (provider === 'ollama') {
    if (/\/api\/chat$/i.test(base)) return base;
    return `${base}/api/chat`;
  }

  if (provider === 'gemini') {
    let cleanBase = base
      .replace(/\/v1beta\/models\/[^/]+:generateContent$/i, '')
      .replace(/\/v1beta\/models\/[^/]+:streamGenerateContent$/i, '')
      .replace(/\/v1beta\/models\/?$/i, '')
      .replace(/\/v1beta\/?$/i, '')
      .replace(/\/+$/, '');
    const url = new URL(`${cleanBase}/v1beta/models/${encodeURIComponent(model || 'gemini-1.5-flash')}:generateContent`);
    if (apiKey) url.searchParams.set('key', apiKey);
    return url.toString();
  }

  if (/\/chat\/completions$/i.test(base)) return base;
  if (/\/v1$/i.test(base)) return `${base}/chat/completions`;
  return `${base}/v1/chat/completions`;
}

function buildTestBody(provider, model) {
  if (provider === 'anthropic') {
    return {
      model: model || 'claude-3-haiku-20240307',
      max_tokens: 32,
      messages: [{ role: 'user', content: [{ type: 'text', text: '请回复：连接成功' }] }]
    };
  }

  if (provider === 'gemini') {
    return {
      contents: [{ role: 'user', parts: [{ text: '请回复：连接成功' }] }]
    };
  }

  if (provider === 'ollama') {
    return {
      model: model || 'llama3',
      stream: false,
      messages: [{ role: 'user', content: '请回复：连接成功' }]
    };
  }

  return {
    model,
    stream: false,
    messages: [{ role: 'user', content: '请回复：连接成功' }]
  };
}

function extractModelList(data, provider) {
  if (!data || typeof data !== 'object') return [];

  if (provider === 'ollama') {
    return (Array.isArray(data.models) ? data.models : []).map((item) => item?.name).filter(Boolean);
  }

  if (provider === 'gemini') {
    return (Array.isArray(data.models) ? data.models : [])
      .map((item) => String(item?.name || '').replace(/^models\//, ''))
      .filter(Boolean);
  }

  return (Array.isArray(data.data) ? data.data : [])
    .map((item) => typeof item === 'string' ? item : item?.id)
    .filter(Boolean);
}

function isValidChatResponse(data, provider) {
  if (!data || typeof data !== 'object') return false;

  if (provider === 'gemini') {
    return Array.isArray(data.candidates);
  }

  if (provider === 'anthropic') {
    return Array.isArray(data.content) || typeof data.content === 'string';
  }

  if (provider === 'ollama') {
    return Boolean(data.message || data.response || data.done !== undefined);
  }

  return Array.isArray(data.choices) || Boolean(data.content || data.message || data.response);
}

function safeIcon(name, size = 18) {
  try {
    const icon = createIcon(name, size);
    if (icon) return icon;
  } catch {}

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', '12');
  circle.setAttribute('cy', '12');
  circle.setAttribute('r', '4.5');
  svg.append(circle);

  return svg;
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

function injectStyle() {
  const old = document.getElementById('api-pool-settings-style');
  if (old) old.remove();

  styleEl = document.createElement('style');
  styleEl.id = 'api-pool-settings-style';
  styleEl.textContent = `
    .api-pool-page {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    /* ── 折叠分组卡片 ── */

    .api-pool-collapsible-group {
      border-radius: var(--radius-lg);
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .api-pool-group-header {
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 44px;
    }

    .api-pool-group-toggle {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0;
      border: none;
      outline: none;
      background: transparent;
      color: var(--text-primary);
      text-align: left;
      cursor: pointer;
    }

    .api-pool-group-toggle-icon {
      width: 24px;
      height: 24px;
      flex: 0 0 24px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      background: var(--accent-light);
      color: var(--accent-dark);
      transition: transform 200ms ease;
    }

    .api-pool-collapsible-group[data-collapsed="false"] .api-pool-group-toggle-icon {
      transform: rotate(90deg);
    }

    .api-pool-group-title-box {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .api-pool-group-name-input {
      flex: 1;
      min-width: 0;
      max-width: 160px;
      padding: 4px 8px;
      border: none;
      outline: none;
      border-radius: 10px;
      background: var(--surface-muted);
      color: var(--text-primary);
      font-size: var(--font-size-base);
      font-weight: 600;
    }

    .api-pool-group-count {
      flex: 0 0 auto;
      padding: 2px 8px;
      border-radius: 999px;
      background: var(--surface-muted);
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      font-weight: 600;
    }

    .api-pool-group-switch {
      flex: 0 0 auto;
      position: relative;
      width: 44px;
      height: 26px;
      border: none;
      outline: none;
      border-radius: 999px;
      background: var(--bg-secondary);
      transition: var(--motion);
      cursor: pointer;
    }

    .api-pool-group-switch.on {
      background: var(--accent);
    }

    .api-pool-group-switch-dot {
      position: absolute;
      top: 4px;
      left: 4px;
      width: 18px;
      height: 18px;
      border-radius: 999px;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      transition: var(--motion);
    }

    .api-pool-group-switch.on .api-pool-group-switch-dot {
      transform: translateX(18px);
    }

    .api-pool-group-desc {
      margin: 0;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.45;
    }

    /* ── 折叠摘要 ── */

    .api-pool-group-summary {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .api-pool-collapsible-group[data-collapsed="false"] .api-pool-group-summary {
      display: none;
    }

    .api-pool-summary-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border-radius: 14px;
      background: var(--surface-muted);
    }

    .api-pool-summary-dot {
      width: 8px;
      height: 8px;
      flex: 0 0 8px;
      border-radius: 999px;
      background: var(--text-hint);
    }

    .api-pool-status-dot-active,
    .api-pool-status-dot-ok {
      background: var(--accent);
    }

    .api-pool-status-dot-error,
    .api-pool-status-dot-unknown,
    .api-pool-status-dot-network_error {
      background: var(--text-secondary);
    }

    .api-pool-summary-row strong {
      flex: 0 1 auto;
      min-width: 0;
      overflow: hidden;
      color: var(--text-primary);
      font-size: var(--font-size-small);
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .api-pool-summary-row small {
      flex: 0 1 auto;
      min-width: 0;
      overflow: hidden;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .api-pool-summary-latency {
      color: var(--text-hint);
      font-size: calc(var(--font-size-small) * 0.86);
    }

    .api-pool-summary-badge {
      flex: 0 0 auto;
      padding: 2px 8px;
      border-radius: 999px;
      background: var(--bg-card);
      color: var(--text-secondary);
      font-size: calc(var(--font-size-small) * 0.86);
      font-weight: 600;
    }

    .api-pool-status-active,
    .api-pool-status-ok {
      background: var(--accent-light);
      color: var(--accent-dark);
    }

    .api-pool-status-billing,
    .api-pool-status-invalid_key,
    .api-pool-status-model_not_found,
    .api-pool-status-rate_limited,
    .api-pool-status-network_error,
    .api-pool-status-bad_response,
    .api-pool-status-error,
    .api-pool-status-unknown {
      background: var(--surface-muted);
      color: var(--text-secondary);
    }

    .api-pool-summary-more {
      padding: 6px 10px;
      color: var(--text-hint);
      font-size: var(--font-size-small);
      text-align: center;
    }

    /* ── 展开详情区 ── */

    .api-pool-group-detail {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .api-pool-collapsible-group[data-collapsed="true"] .api-pool-group-detail {
      display: none;
    }

    /* ── 接口卡片（展开态） ── */

    .api-pool-provider-card {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 12px;
      border-radius: var(--radius-md);
      background: var(--surface-muted);
      box-shadow: var(--shadow-sm);
    }

    .api-pool-provider-head {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }

    .api-pool-provider-icon {
      width: 34px;
      height: 34px;
      flex: 0 0 34px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 14px;
      background: var(--accent-light);
      color: var(--accent-dark);
    }

    .api-pool-provider-info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .api-pool-provider-info strong {
      overflow: hidden;
      color: var(--text-primary);
      font-size: var(--font-size-base);
      font-weight: 600;
      line-height: 1.35;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .api-pool-provider-info small,
    .api-pool-meta-item span,
    .api-pool-model-item small {
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.45;
      white-space: pre-line;
      word-break: break-word;
    }

    .api-pool-status {
      flex: 0 0 auto;
      padding: 4px 9px;
      border-radius: var(--radius-full);
      background: var(--bg-card);
      color: var(--text-secondary);
      box-shadow: var(--shadow-sm);
      font-size: var(--font-size-small);
      font-weight: 600;
      white-space: nowrap;
    }

    .api-pool-meta {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .api-pool-meta-item {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
      padding: 9px 10px;
      border-radius: 14px;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
    }

    .api-pool-meta-item strong {
      overflow: hidden;
      color: var(--text-primary);
      font-size: var(--font-size-small);
      font-weight: 600;
      line-height: 1.35;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .api-pool-field {
      width: 100%;
      min-height: 48px;
      display: flex;
      align-items: stretch;
      flex-direction: column;
      gap: 8px;
      margin-top: 10px;
      padding: 10px 12px;
      border-radius: 16px;
      background: var(--surface-muted);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
    }

    .api-pool-field span {
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      font-weight: 600;
    }

    .api-pool-input {
      width: 100%;
      min-height: 44px;
      resize: vertical;
      padding: 10px 12px;
      border: none;
      outline: none;
      border-radius: 15px;
      background: var(--bg-card);
      color: var(--text-primary);
      font-family: var(--font-main);
      font-size: max(var(--font-size-base), 16px);
      line-height: 1.5;
    }

    .api-pool-select {
      appearance: none;
      -webkit-appearance: none;
      cursor: pointer;
    }

    .api-pool-model-picker {
      margin-top: 12px;
      padding: 12px;
      border-radius: 16px;
      background: var(--surface-muted);
      box-shadow: var(--shadow-sm);
    }

    .api-pool-model-title {
      margin-bottom: 10px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      font-weight: 600;
    }

    .api-pool-model-list {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      padding: 2px 2px 8px;
      scrollbar-width: none;
      -webkit-overflow-scrolling: touch;
    }

    .api-pool-model-list::-webkit-scrollbar {
      display: none;
    }

        .api-pool-model-chip {
      min-width: 148px;
      max-width: 220px;
      min-height: 58px;
      flex: 0 0 auto;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      justify-content: center;
      gap: 3px;
      padding: 10px 12px;
      border: none;
      outline: none;
      border-radius: 16px;
      background: var(--bg-card);
      color: var(--text-primary);
      text-align: left;
      box-shadow: var(--shadow-sm);
      transition: var(--motion);
    }

    .api-pool-model-chip:active {
      transform: scale(var(--press-scale));
    }

    .api-pool-model-chip.active {
      background: var(--accent-light);
      color: var(--accent-dark);
    }

    .api-pool-model-chip span {
      width: 100%;
      overflow: hidden;
      font-size: var(--font-size-small);
      font-weight: 600;
      line-height: 1.3;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .api-pool-model-chip small {
      color: var(--text-secondary);
      font-size: calc(var(--font-size-small) * 0.86);
      line-height: 1.2;
    }

    .api-pool-sheet {
      width: min(100%, 460px);
      margin: 0 auto;
      color: var(--text-primary);
    }

    .api-pool-sheet-title {
      margin-bottom: 12px;
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
    }

    .api-pool-sheet-body {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .api-pool-model-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-top: 8px;
      padding: 12px;
      border-radius: 16px;
      background: var(--surface-muted);
      box-shadow: var(--shadow-sm);
    }

    .api-pool-model-item strong {
      color: var(--text-primary);
      font-size: var(--font-size-base);
      font-weight: 600;
      line-height: 1.35;
      word-break: break-word;
    }

    @media (max-width: 520px) {
      .api-pool-meta {
        grid-template-columns: 1fr;
      }

      .api-pool-provider-head {
        align-items: flex-start;
      }

      .api-pool-status {
        max-width: 86px;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .api-pool-group-name-input {
        max-width: 100px;
      }
    }
  `;

  document.head.appendChild(styleEl);
}

