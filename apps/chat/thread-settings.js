// apps/chat/thread-settings.js
// imports:
//   from '../../core/storage.js': getData, setData, getDB, setDB, getAllDB, getByIndexDB, deleteDB, getNow
//   from '../../core/ui.js': createIcon, showToast

import {
  getData,
  setData,
  getDB,
  setDB,
  getAllDB,
  getByIndexDB,
  deleteDB,
  getNow
} from '../../core/storage.js';

import { createIcon, showToast } from '../../core/ui.js';

// ═══════════════════════════════════════
// 【基础状态】保存设置页运行时状态
// ═══════════════════════════════════════

const STYLE_ID = 'chat-thread-settings-style';

const DEFAULT_CHAT_CONFIG = {
  proactiveMode1Enabled: false,
  proactiveMode1Minutes: 30,
  proactiveMode2Enabled: false,
  proactiveMode2MinMinutes: 5,
  proactiveMode2MaxMinutes: 10,
  proactiveChance: 0.35,
  proactiveLastSentAt: null,
  proactiveAwaitingUserReply: false,
  proactiveNextCheckAt: null,
  readAt: null,
  memoryInjectLimit: 12,
  memoryCandidateLimit: 80,
  memoryAutoEnabled: true,
  memoryWriteIntensity: 'normal',
  memoryAllowEdit: true,
  memoryAllowDelete: true,
  autoTtsEnabled: false,
  ttsVoice: '',
  ttsModel: '',
  ttsSpeed: 1,
  voiceAutoplay: false,
  emojiDisabled: true
};

const DEFAULT_API_CONFIG = {
  useGlobal: true,
  endpointId: '',
  model: '',
  temperature: 0.85,
  topP: 1,
  maxTokens: 1200,
  presencePenalty: 0,
  frequencyPenalty: 0,
  timeout: 45000,
  stream: true
};

const DEFAULT_VOICE_CONFIG = {
  useGlobal: true,
  provider: '',
  model: '',
  voice: '',
  speed: 1
};

const state = {
  rootEl: null,
  mounted: false,
  characterId: '',
  character: null,
  appState: null,
  endpoints: [],
  models: [],
  userProfiles: [],
  worldbooks: [],
  config: { ...DEFAULT_CHAT_CONFIG },
  saving: false
};

// ═══════════════════════════════════════
// 【公开接口】挂载和卸载设置页
// ═══════════════════════════════════════

export async function mountThreadSettings(containerEl, options = {}) {
  state.rootEl = containerEl;
  state.mounted = true;
  state.characterId = String(options.characterId || '').trim();
  state.appState = options.appState || null;
  state.saving = false;

  injectStyle();
  await loadData();
  render();
}

export function unmountThreadSettings() {
  state.mounted = false;

  if (state.rootEl) {
    state.rootEl.replaceChildren();
  }

  state.rootEl = null;
  state.characterId = '';
  state.character = null;
  state.appState = null;
  state.endpoints = [];
  state.models = [];
  state.userProfiles = [];
  state.worldbooks = [];
  state.config = { ...DEFAULT_CHAT_CONFIG };
  state.saving = false;
}

// ═══════════════════════════════════════
// 【数据加载】读取角色、模型、记忆和聊天配置
// ═══════════════════════════════════════

async function loadData() {
  state.character = state.characterId ? await getDB('characters', state.characterId).catch(() => null) : null;
  state.config = getChatConfig();

  const settings = getData('app_settings') || {};
  const cloud = getData('cloud_models') || {};
  const endpoints = normalizeArray(settings.apiEndpoints || settings.endpoints || cloud.endpoints);
  const models = normalizeArray(settings.models || cloud.models);

  state.endpoints = endpoints;
  state.models = models;
  state.userProfiles = loadUserProfiles();
  state.worldbooks = normalizeArray(await getAllDB('worldbook').catch(() => []));
}

function getChatConfig() {
  const stored = state.characterId ? getData(getChatConfigKey()) || {} : {};

  return {
    ...DEFAULT_CHAT_CONFIG,
    ...stored,
    proactiveMode1Minutes: clampNumber(stored.proactiveMode1Minutes || DEFAULT_CHAT_CONFIG.proactiveMode1Minutes, 1, 240),
    proactiveMode2MinMinutes: clampNumber(stored.proactiveMode2MinMinutes || DEFAULT_CHAT_CONFIG.proactiveMode2MinMinutes, 1, 240),
    proactiveMode2MaxMinutes: clampNumber(stored.proactiveMode2MaxMinutes || DEFAULT_CHAT_CONFIG.proactiveMode2MaxMinutes, 1, 240),
    proactiveChance: clampChance(stored.proactiveChance ?? DEFAULT_CHAT_CONFIG.proactiveChance),
    memoryInjectLimit: clampNumber(stored.memoryInjectLimit || DEFAULT_CHAT_CONFIG.memoryInjectLimit, 3, 80),
    memoryCandidateLimit: clampNumber(stored.memoryCandidateLimit || DEFAULT_CHAT_CONFIG.memoryCandidateLimit, 10, 300),
    ttsSpeed: clampFloat(stored.ttsSpeed || DEFAULT_CHAT_CONFIG.ttsSpeed, 0.5, 2, 1)
  };
}

function getChatConfigKey() {
  return `chat_${state.characterId}_config`;
}

function loadUserProfiles() {
  const current = getData('user_profiles');
  const legacy = getData('app_user_profiles');
  const source = Array.isArray(current) && current.length
    ? current
    : Array.isArray(legacy)
      ? legacy
      : [];

  return source.filter(Boolean);
}

// ═══════════════════════════════════════
// 【主渲染】生成完整设置页面
// ═══════════════════════════════════════

function render() {
  if (!state.rootEl || !state.mounted) return;

  const page = el('section', 'thread-settings-page');
  page.append(
    createHeader(),
    createScroll()
  );

  state.rootEl.replaceChildren(page);
}

function createHeader() {
  const header = el('header', 'thread-settings-header');

  const back = iconButton('back', '返回');
  back.addEventListener('click', () => {
    if (typeof state.appState?.goThread === 'function') {
      state.appState.goThread({
        mode: 'private',
        characterId: state.characterId
      });
      return;
    }

    if (typeof state.appState?.back === 'function') {
      state.appState.back();
      return;
    }

    window.history.back();
  });

  const title = el('div', 'thread-settings-title-wrap');
  title.append(
    el('div', 'thread-settings-title', '聊天设置'),
    el('div', 'thread-settings-subtitle', state.character?.name ? `正在调整 ${state.character.name}` : '当前聊天')
  );

  const save = el('button', 'thread-settings-save', '保存');
  save.type = 'button';
  save.disabled = state.saving;
  save.addEventListener('click', () => saveAll());

  header.append(back, title, save);
  return header;
}

function createScroll() {
  const scroll = el('main', 'thread-settings-scroll');

  scroll.append(
    createHeroCard(),
    createApiSection(),
    createMemorySection(),
    createProactiveSection(),
    createVoiceSection(),
    createReplySection(),
    createWorldbookSection(),
    createUserProfileSection(),
    createDangerSection()
  );

  return scroll;
}

function createHeroCard() {
  const card = el('section', 'settings-hero-card');

  const avatar = el('span', 'settings-hero-avatar');
  const src = state.character?.avatar || '';

  if (src) {
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    avatar.appendChild(img);
  } else {
    avatar.textContent = getInitial(state.character?.name || 'A');
  }

  const body = el('div', 'settings-hero-body');
  body.append(
    el('div', 'settings-hero-name', state.character?.name || '当前 AI'),
    el('div', 'settings-hero-desc', '这里控制 TA 在当前聊天里的模型、记忆、语音和回复习惯。')
  );

  card.append(avatar, body);
  return card;
}

// ═══════════════════════════════════════
// 【API配置】模型、中转站、温度和请求参数
// ═══════════════════════════════════════

function createApiSection() {
  const api = getApiConfig();
  const section = createSection('模型和中转站', '控制这个 AI 用哪个连接、模型和回复参数。');

  section.append(
    createSwitchRow({
      title: '跟随全局模型',
      desc: '打开后使用设置里的默认连接和模型。',
      checked: api.useGlobal !== false,
      onChange: async (checked) => updateApiConfig({ useGlobal: checked })
    }),
    createSelectRow({
      title: '中转站',
      desc: '关闭跟随全局后，才会优先使用这里。',
      value: api.endpointId || '',
      options: [
        { value: '', label: '默认中转站' },
        ...state.endpoints.map((item, index) => ({
          value: String(item.id || item.key || item.name || index),
          label: item.name || item.title || item.url || `中转站 ${index + 1}`
        }))
      ],
      onChange: async (value) => updateApiConfig({ useGlobal: false, endpointId: value })
    }),
    createInputRow({
      title: '模型名称',
      desc: '可以手填模型名，也可以填中转站里的模型。',
      value: api.model || '',
      placeholder: '例如 gpt-4o-mini',
      onChange: async (value) => updateApiConfig({ useGlobal: false, model: value })
    }),
    createSliderRow({
      title: '温度',
      desc: '越高越活泼，越低越稳定。',
      value: Math.round(Number(api.temperature ?? 0.85) * 100),
      min: 0,
      max: 200,
      step: 5,
      suffix: '%',
      onChange: (value) => updateApiConfig({ useGlobal: false, temperature: Number(value) / 100 })
    }),
    createSliderRow({
      title: '发散度',
      desc: '控制答案跳跃程度，一般保持 100%。',
      value: Math.round(Number(api.topP ?? 1) * 100),
      min: 10,
      max: 100,
      step: 5,
      suffix: '%',
      onChange: (value) => updateApiConfig({ useGlobal: false, topP: Number(value) / 100 })
    }),
    createNumberRow({
      title: '最大回复长度',
      desc: '限制 TA 一次最多说多少。',
      value: api.maxTokens ?? 1200,
      min: 128,
      max: 12000,
      step: 64,
      suffix: '',
      onChange: (value) => updateApiConfig({ useGlobal: false, maxTokens: value })
    }),
    createSliderRow({
      title: '新话题倾向',
      desc: '越高越不容易重复旧表达。',
      value: Math.round(Number(api.presencePenalty ?? 0) * 100),
      min: -100,
      max: 100,
      step: 5,
      suffix: '',
      onChange: (value) => updateApiConfig({ useGlobal: false, presencePenalty: Number(value) / 100 })
    }),
    createSliderRow({
      title: '重复惩罚',
      desc: '越高越少重复同一句式。',
      value: Math.round(Number(api.frequencyPenalty ?? 0) * 100),
      min: -100,
      max: 100,
      step: 5,
      suffix: '',
      onChange: (value) => updateApiConfig({ useGlobal: false, frequencyPenalty: Number(value) / 100 })
    }),
    createNumberRow({
      title: '等待超时',
      desc: '太久没回复就停止等待。',
      value: Math.round(Number(api.timeout || 45000) / 1000),
      min: 10,
      max: 180,
      step: 5,
      suffix: '秒',
      onChange: (value) => updateApiConfig({ useGlobal: false, timeout: value * 1000 })
    }),
    createSwitchRow({
      title: '流式输出',
      desc: '打开后回复会边生成边显示。',
      checked: api.stream !== false,
      onChange: async (checked) => updateApiConfig({ useGlobal: false, stream: checked })
    })
  );

  return section;
}

function getApiConfig() {
  return {
    ...DEFAULT_API_CONFIG,
    ...(state.character?.apiConfig || {})
  };
}

async function updateApiConfig(patch = {}) {
  await updateCharacter({
    apiConfig: {
      ...getApiConfig(),
      ...patch
    }
  });
}

// ═══════════════════════════════════════
// 【记忆设置】控制记忆读取和自动写入权限
// ═══════════════════════════════════════

function createMemorySection() {
  const section = createSection('记忆', '控制 TA 能看多少记忆，以及能不能自己整理记忆。');

  section.append(
    createSliderRow({
      title: '带进聊天的记忆',
      desc: 'TA 最多真正看见多少条记忆。',
      value: state.config.memoryInjectLimit,
      min: 3,
      max: 80,
      step: 1,
      suffix: '条',
      onChange: (value) => updateChatConfig({ memoryInjectLimit: value })
    }),
    createSliderRow({
      title: '候选记忆范围',
      desc: 'TA 会先从这些记忆里按关键词挑。',
      value: state.config.memoryCandidateLimit,
      min: 10,
      max: 300,
      step: 5,
      suffix: '条',
      onChange: (value) => updateChatConfig({ memoryCandidateLimit: value })
    }),
    createSwitchRow({
      title: '允许自动写记忆',
      desc: '打开后 TA 会主动记录重要信息。',
      checked: state.config.memoryAutoEnabled !== false,
      onChange: (checked) => updateChatConfig({ memoryAutoEnabled: checked })
    }),
    createSelectRow({
      title: '写记忆强度',
      desc: '越高越容易把情绪和关系变化记下来。',
      value: state.config.memoryWriteIntensity || 'normal',
      options: [
        { value: 'low', label: '少记一点' },
        { value: 'normal', label: '正常' },
        { value: 'high', label: '多记一点' }
      ],
      onChange: (value) => updateChatConfig({ memoryWriteIntensity: value })
    }),
    createSwitchRow({
      title: '允许自己编辑记忆',
      desc: '信息变化时，TA 可以把旧记忆改准确。',
      checked: state.config.memoryAllowEdit !== false,
      onChange: (checked) => updateChatConfig({ memoryAllowEdit: checked })
    }),
    createSwitchRow({
      title: '允许自己删除记忆',
      desc: '发现重复、过期或错误时，TA 可以清掉。',
      checked: state.config.memoryAllowDelete !== false,
      onChange: (checked) => updateChatConfig({ memoryAllowDelete: checked })
    })
  );

  return section;
}

// ═══════════════════════════════════════
// 【主动消息】控制离线和在线主动开口
// ═══════════════════════════════════════

function createProactiveSection() {
  const section = createSection('主动消息', 'TA 想你时，可以轻轻主动找你。');

  section.append(
    createSwitchRow({
      title: '离线一会儿主动问候',
      desc: '你发完消息后没继续聊，TA 只主动一次。',
      checked: Boolean(state.config.proactiveMode1Enabled),
      onChange: (checked) => updateChatConfig({ proactiveMode1Enabled: checked })
    }),
    createNumberRow({
      title: '离线等待时间',
      desc: '默认 30 分钟。',
      value: state.config.proactiveMode1Minutes,
      min: 1,
      max: 240,
      step: 1,
      suffix: '分钟',
      onChange: (value) => updateChatConfig({ proactiveMode1Minutes: value })
    }),
    createSwitchRow({
      title: '在线停留主动开口',
      desc: '你停在聊天里没说话时，TA 偶尔接一句。',
      checked: Boolean(state.config.proactiveMode2Enabled),
      onChange: (checked) => updateChatConfig({ proactiveMode2Enabled: checked })
    }),
    createRangeRow({
      title: '在线触发范围',
      desc: '到时间后再按概率触发。',
      minValue: state.config.proactiveMode2MinMinutes,
      maxValue: state.config.proactiveMode2MaxMinutes,
      min: 1,
      max: 240,
      suffix: '分钟',
      onChange: (minValue, maxValue) => updateChatConfig({
        proactiveMode2MinMinutes: minValue,
        proactiveMode2MaxMinutes: Math.max(minValue, maxValue)
      })
    }),
    createSliderRow({
      title: '主动概率',
      desc: '越高越容易主动开口。',
      value: Math.round(state.config.proactiveChance * 100),
      min: 0,
      max: 100,
      step: 5,
      suffix: '%',
      onChange: (value) => updateChatConfig({ proactiveChance: clampChance(value / 100) })
    })
  );

  return section;
}

// ═══════════════════════════════════════
// 【语音设置】控制 TTS、自动播放和语速
// ═══════════════════════════════════════

function createVoiceSection() {
  const voice = getVoiceConfig();
  const section = createSection('语音', '控制 TA 回复后怎么说话。');

  section.append(
    createSwitchRow({
      title: '跟随全局语音',
      desc: '打开后使用全局语音配置。',
      checked: voice.useGlobal !== false,
      onChange: (checked) => updateVoiceConfig({ useGlobal: checked })
    }),
    createSwitchRow({
      title: 'AI 回复后自动朗读',
      desc: '打开后 TA 回复文字后会自动读出来。',
      checked: Boolean(state.config.autoTtsEnabled),
      onChange: (checked) => updateChatConfig({ autoTtsEnabled: checked })
    }),
    createInputRow({
      title: '语音服务',
      desc: '填写服务名，留空走全局。',
      value: voice.provider || '',
      placeholder: '例如 openai',
      onChange: (value) => updateVoiceConfig({ useGlobal: false, provider: value })
    }),
    createInputRow({
      title: '语音模型',
      desc: '填写 TTS 模型名，留空走全局。',
      value: state.config.ttsModel || voice.model || '',
      placeholder: '例如 tts-1',
      onChange: async (value) => {
        updateChatConfig({ ttsModel: value });
        await updateVoiceConfig({ useGlobal: false, model: value });
      }
    }),
    createInputRow({
      title: '声音名',
      desc: '填写音色名，留空走全局。',
      value: state.config.ttsVoice || voice.voice || '',
      placeholder: '例如 alloy / nova',
      onChange: async (value) => {
        updateChatConfig({ ttsVoice: value });
        await updateVoiceConfig({ useGlobal: false, voice: value });
      }
    }),
    createSliderRow({
      title: '语速',
      desc: '慢一点更黏，快一点更利落。',
      value: Math.round(Number(state.config.ttsSpeed || voice.speed || 1) * 100),
      min: 50,
      max: 200,
      step: 5,
      suffix: '%',
      onChange: async (value) => {
        const speed = Number(value) / 100;
        updateChatConfig({ ttsSpeed: speed });
        await updateVoiceConfig({ useGlobal: false, speed });
      }
    })
  );

  return section;
}

function getVoiceConfig() {
  return {
    ...DEFAULT_VOICE_CONFIG,
    ...(state.character?.voiceConfig || {})
  };
}

async function updateVoiceConfig(patch = {}) {
  await updateCharacter({
    voiceConfig: {
      ...getVoiceConfig(),
      ...patch
    }
  });
}

// ═══════════════════════════════════════
// 【回复表现】控制回复长度、模式、称呼和表情
// ═══════════════════════════════════════

function createReplySection() {
  const settings = getData('app_settings') || {};
  const section = createSection('回复表现', '控制聊天看起来和说起来是什么感觉。');

  section.append(
    createSelectRow({
      title: '对话样式',
      desc: '气泡更像聊天，对话更像阅读。',
      value: settings.bubbleMode === 'dialog' ? 'dialog' : 'bubble',
      options: [
        { value: 'bubble', label: '气泡模式' },
        { value: 'dialog', label: '对话模式' }
      ],
      onChange: (value) => {
        setData('app_settings', {
          ...settings,
          bubbleMode: value
        });
        showToast('保存好啦，返回聊天后生效');
      }
    }),
    createSelectRow({
      title: '回复长度',
      desc: '控制 TA 平时回得长还是短。',
      value: state.character?.replyLength || 'medium',
      options: [
        { value: 'short', label: '短一点' },
        { value: 'medium', label: '刚刚好' },
        { value: 'long', label: '多说一点' }
      ],
      onChange: (value) => updateCharacter({ replyLength: value })
    }),
    createInputRow({
      title: 'TA 对你的称呼',
      desc: '比如宝宝、主人、醒醒。',
      value: state.character?.nicknameForUser || '',
      placeholder: '留空就用你的档案名',
      onChange: (value) => updateCharacter({ nicknameForUser: value })
    }),
    createInputRow({
      title: '主动消息风格',
      desc: '比如黏人一点、克制一点、像撒娇。',
      value: state.character?.proactiveStyle || '',
      placeholder: '写一句你想要的感觉',
      onChange: (value) => updateCharacter({ proactiveStyle: value })
    }),
    createSwitchRow({
      title: '禁用表情符号',
      desc: '打开后 TA 不发 emoji，避免破坏界面风格。',
      checked: state.config.emojiDisabled !== false,
      onChange: (checked) => updateChatConfig({ emojiDisabled: checked })
    }),
    createTextareaRow({
      title: '额外回复要求',
      desc: '只影响这个 AI，可以写你想要的语气和边界。',
      value: state.character?.extraReplyRules || '',
      placeholder: '比如：更黏人一点，但不要长篇说教。',
      onChange: (value) => updateCharacter({ extraReplyRules: value })
    })
  );

  return section;
}

// ═══════════════════════════════════════
// 【世界书】绑定当前 AI 的世界设定
// ═══════════════════════════════════════

function createWorldbookSection() {
  const ids = normalizeArray(state.character?.worldbookIds).map(String);
  const section = createSection('世界书', '控制 TA 会参考哪些世界设定。');

  section.append(
    createSelectRow({
      title: '读取方式',
      desc: '全局设定和绑定设定怎么一起用。',
      value: state.character?.worldbookMode || 'bound_plus_global',
      options: [
        { value: 'bound_plus_global', label: '绑定 + 全局' },
        { value: 'only_bound', label: '只看绑定' },
        { value: 'all', label: '全部可见' }
      ],
      onChange: (value) => updateCharacter({ worldbookMode: value })
    })
  );

  if (!state.worldbooks.length) {
    section.append(createHintCard('还没有世界书，之后可以在世界书里新建。'));
    return section;
  }

  state.worldbooks.slice(0, 40).forEach((book) => {
    section.append(createSwitchRow({
      title: book.title || book.name || '未命名设定',
      desc: book.content || book.description || '点开后 TA 会参考这条。',
      checked: ids.includes(String(book.id)),
      onChange: async (checked) => {
        const current = normalizeArray(state.character?.worldbookIds).map(String);
        const next = checked
          ? [...new Set([...current, String(book.id)])]
          : current.filter((item) => item !== String(book.id));
        await updateCharacter({ worldbookIds: next });
      }
    }));
  });

  return section;
}

// ═══════════════════════════════════════
// 【用户档案】绑定当前 AI 看到的用户人设
// ═══════════════════════════════════════

function createUserProfileSection() {
  const section = createSection('你的档案', '控制 TA 眼里的你是谁。');

  section.append(
    createSelectRow({
      title: '绑定档案',
      desc: '不绑定就使用全局默认。',
      value: state.character?.userProfileId || '',
      options: [
        { value: '', label: '使用默认档案' },
        { value: 'none', label: '不绑定档案' },
        ...state.userProfiles.map((item, index) => ({
          value: String(item.id || index),
          label: item.name || item.nickname || item.title || `档案 ${index + 1}`
        }))
      ],
      onChange: (value) => updateCharacter({ userProfileId: value })
    })
  );

  return section;
}

// ═══════════════════════════════════════
// 【危险操作】删除当前聊天记录
// ═══════════════════════════════════════

function createDangerSection() {
  const section = createSection('危险操作', '这里会真的改数据，点之前想一下。');

  section.append(
    createButtonRow({
      title: '清空当前私聊',
      desc: '只删当前聊天消息，不删除角色和记忆。',
      buttonText: '清空',
      danger: true,
      onClick: () => openClearMessagesConfirm()
    })
  );

  return section;
}

// ═══════════════════════════════════════
// 【组件】通用区块、输入行、开关、滑杆
// ═══════════════════════════════════════

function createSection(title, desc) {
  const section = el('section', 'settings-section');
  section.append(
    el('div', 'settings-section-title', title),
    el('div', 'settings-section-desc', desc)
  );
  return section;
}

function createSwitchRow({ title, desc, checked, onChange }) {
  const row = el('label', 'settings-row switch');

  const text = createRowText(title, desc);

  const control = el('span', 'settings-switch');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = Boolean(checked);

  const ui = el('span', 'settings-switch-ui');

  input.addEventListener('change', async () => {
    await onChange?.(Boolean(input.checked));
  });

  control.append(input, ui);
  row.append(text, control);
  return row;
}

function createInputRow({ title, desc, value, placeholder, onChange }) {
  const row = el('section', 'settings-row stacked');
  row.append(createRowText(title, desc));

  const input = document.createElement('input');
  input.className = 'settings-input';
  input.type = 'text';
  input.value = String(value || '');
  input.placeholder = placeholder || '';
  input.autocomplete = 'off';

  input.addEventListener('change', async () => {
    await onChange?.(input.value.trim());
  });

  row.append(input);
  return row;
}

function createTextareaRow({ title, desc, value, placeholder, onChange }) {
  const row = el('section', 'settings-row stacked');
  row.append(createRowText(title, desc));

  const input = document.createElement('textarea');
  input.className = 'settings-textarea';
  input.value = String(value || '');
  input.placeholder = placeholder || '';
  input.rows = 4;
  input.autocomplete = 'off';

  input.addEventListener('change', async () => {
    await onChange?.(input.value.trim());
  });

  row.append(input);
  return row;
}

function createNumberRow({ title, desc, value, min, max, step = 1, suffix, onChange }) {
  const row = el('section', 'settings-row');
  row.append(createRowText(title, desc));

  const wrap = el('span', 'settings-number-wrap');
  const input = document.createElement('input');
  input.className = 'settings-number';
  input.type = 'number';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value ?? min);

  input.addEventListener('change', async () => {
    const next = step < 1
      ? clampFloat(input.value, min, max, Number(value || min))
      : clampNumber(input.value, min, max);

    input.value = String(next);
    await onChange?.(next);
  });

  wrap.append(input, el('span', 'settings-suffix', suffix || ''));
  row.append(wrap);
  return row;
}

function createSliderRow({ title, desc, value, min, max, step = 1, suffix, onChange }) {
  const row = el('section', 'settings-row stacked');

  const top = el('div', 'settings-slider-top');
  top.append(
    createRowText(title, desc),
    el('span', 'settings-slider-value', `${value}${suffix || ''}`)
  );

  const input = document.createElement('input');
  input.className = 'settings-slider';
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);

  const label = top.querySelector('.settings-slider-value');

  input.addEventListener('input', () => {
    label.textContent = `${input.value}${suffix || ''}`;
  });

  input.addEventListener('change', async () => {
    const next = step < 1
      ? clampFloat(input.value, min, max, Number(value || min))
      : clampNumber(input.value, min, max);
    label.textContent = `${next}${suffix || ''}`;
    await onChange?.(next);
  });

  row.append(top, input);
  return row;
}

function createRangeRow({ title, desc, minValue, maxValue, min, max, suffix, onChange }) {
  const row = el('section', 'settings-row stacked');
  row.append(createRowText(title, desc));

  const controls = el('div', 'settings-range-pair');

  const left = document.createElement('input');
  left.className = 'settings-number';
  left.type = 'number';
  left.min = String(min);
  left.max = String(max);
  left.value = String(clampNumber(minValue, min, max));

  const right = document.createElement('input');
  right.className = 'settings-number';
  right.type = 'number';
  right.min = String(min);
  right.max = String(max);
  right.value = String(Math.max(Number(left.value), clampNumber(maxValue, min, max)));

  const commit = async () => {
    const a = clampNumber(left.value, min, max);
    const b = Math.max(a, clampNumber(right.value, min, max));
    left.value = String(a);
    right.value = String(b);
    await onChange?.(a, b);
  };

  left.addEventListener('change', commit);
  right.addEventListener('change', commit);

  controls.append(left, el('span', 'settings-range-mid', '到'), right, el('span', 'settings-suffix', suffix || ''));
  row.append(controls);
  return row;
}

function createSelectRow({ title, desc, value, options, onChange }) {
  const row = el('section', 'settings-row stacked');
  row.append(createRowText(title, desc));

  const select = document.createElement('select');
  select.className = 'settings-select';

  normalizeArray(options).forEach((item) => {
    const option = document.createElement('option');
    option.value = String(item.value ?? '');
    option.textContent = item.label || item.value || '选项';
    select.append(option);
  });

  select.value = String(value ?? '');
  select.addEventListener('change', async () => {
    await onChange?.(select.value);
  });

  row.append(select);
  return row;
}

function createButtonRow({ title, desc, buttonText, danger = false, onClick }) {
  const row = el('section', `settings-row ${danger ? 'danger' : ''}`);
  row.append(createRowText(title, desc));

  const button = el('button', `settings-small-btn ${danger ? 'danger' : ''}`, buttonText || '操作');
  button.type = 'button';
  button.addEventListener('click', onClick);

  row.append(button);
  return row;
}

function createHintCard(text) {
  return el('div', 'settings-hint-card', text || '');
}

function createRowText(title, desc) {
  const text = el('span', 'settings-row-text');
  text.append(
    el('span', 'settings-row-title', title || ''),
    el('span', 'settings-row-desc', desc || '')
  );
  return text;
}

// ═══════════════════════════════════════
// 【确认弹窗】本文件内置确认，避免依赖外部确认框
// ═══════════════════════════════════════

function openClearMessagesConfirm() {
  const overlay = el('div', 'settings-confirm-overlay');
  const card = el('section', 'settings-confirm-card');

  card.append(
    el('div', 'settings-confirm-title', '清空这段聊天？'),
    el('div', 'settings-confirm-desc', '会删除当前私聊消息，但不会删除角色和记忆。')
  );

  const actions = el('div', 'settings-confirm-actions');

  const cancel = el('button', 'settings-confirm-btn ghost', '取消');
  cancel.type = 'button';
  cancel.addEventListener('click', () => overlay.remove());

  const confirm = el('button', 'settings-confirm-btn danger', '清空');
  confirm.type = 'button';
  confirm.addEventListener('click', async () => {
    confirm.disabled = true;
    await clearCurrentMessages();
    overlay.remove();
  });

  actions.append(cancel, confirm);
  card.append(actions);
  overlay.append(card);
  document.body.append(overlay);
}

// ═══════════════════════════════════════
// 【保存操作】保存角色配置和聊天配置
// ═══════════════════════════════════════

async function updateCharacter(patch = {}) {
  if (!state.characterId || !state.character) return;

  const next = {
    ...state.character,
    ...patch,
    updatedAt: getNow()
  };

  await setDB('characters', next);
  state.character = next;
  showToast('保存好啦');
}

function updateChatConfig(patch = {}) {
  if (!state.characterId) return;

  const current = getChatConfig();
  const next = {
    ...current,
    ...patch
  };

  if (Number(next.proactiveMode2MaxMinutes) < Number(next.proactiveMode2MinMinutes)) {
    next.proactiveMode2MaxMinutes = next.proactiveMode2MinMinutes;
  }

  if (Number(next.memoryCandidateLimit) < Number(next.memoryInjectLimit)) {
    next.memoryCandidateLimit = next.memoryInjectLimit;
  }

  state.config = next;
  setData(getChatConfigKey(), next);
  showToast('保存好啦');
}

async function saveAll() {
  if (state.saving) return;

  state.saving = true;

  try {
    if (state.character) {
      await setDB('characters', {
        ...state.character,
        updatedAt: getNow()
      });
    }

    if (state.characterId) {
      setData(getChatConfigKey(), state.config);
    }

    showToast('全部保存好啦');
  } finally {
    state.saving = false;
    render();
  }
}

async function clearCurrentMessages() {
  if (!state.characterId) return;

  const messages = normalizeArray(await getByIndexDB('messages', 'characterId', state.characterId).catch(() => []));

  await Promise.all(
    messages.map((message) => deleteDB('messages', message.id).catch(() => null))
  );

  const counts = getData('chat_unread_counts') || {};
  delete counts[state.characterId];
  setData('chat_unread_counts', counts);

  showToast('聊天清空啦');
}

// ═══════════════════════════════════════
// 【工具函数】图标、数值和 DOM
// ═══════════════════════════════════════

function iconButton(iconName, label) {
  const button = el('button', 'settings-icon-btn');
  button.type = 'button';
  button.setAttribute('aria-label', label || iconName);
  button.appendChild(createIcon(iconName, 18));
  return button;
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function clampFloat(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Number(number.toFixed(2))));
}

function clampChance(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function normalizeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function getInitial(name) {
  const text = String(name || '').trim();
  return text ? text.slice(0, 1).toUpperCase() : 'A';
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

// ═══════════════════════════════════════
// 【样式】设置页视觉和交互
// ═══════════════════════════════════════

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .thread-settings-page{
      height:100%;
      min-height:0;
      display:flex;
      flex-direction:column;
      overflow:hidden;
      background:var(--bg-primary);
      color:var(--text-primary);
    }

    .thread-settings-header{
      flex:0 0 auto;
      min-height:68px;
      display:grid;
      grid-template-columns:auto minmax(0,1fr) auto;
      align-items:center;
      gap:12px;
      padding:12px 20px 10px;
      background:color-mix(in srgb,var(--bg-primary) 92%,transparent);
      backdrop-filter:blur(18px);
      z-index:2;
    }

    .settings-icon-btn{
      width:46px;
      height:46px;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      border-radius:999px;
      background:var(--bg-card);
      color:var(--text-primary);
      box-shadow:var(--shadow-sm);
      transition:all 200ms ease;
    }

    .settings-icon-btn:active{
      transform:scale(.96);
    }

    .thread-settings-title-wrap{
      min-width:0;
      display:flex;
      flex-direction:column;
      gap:2px;
    }

    .thread-settings-title{
      color:var(--text-primary);
      font-size:17px;
      font-weight:650;
      line-height:1.35;
    }

    .thread-settings-subtitle{
      color:var(--text-secondary);
      font-size:12px;
      line-height:1.35;
      overflow:hidden;
      white-space:nowrap;
      text-overflow:ellipsis;
    }

    .thread-settings-save{
      min-width:62px;
      height:40px;
      padding:0 14px;
      border-radius:999px;
      background:var(--accent);
      color:var(--bubble-user-text);
      box-shadow:var(--shadow-sm);
      font:inherit;
      font-size:13px;
      font-weight:600;
      transition:all 200ms ease;
    }

    .thread-settings-save:active{
      transform:scale(.96);
    }

    .thread-settings-scroll{
      flex:1 1 auto;
      min-height:0;
      overflow-y:auto;
      overflow-x:hidden;
      padding:8px 20px calc(28px + env(safe-area-inset-bottom));
      -webkit-overflow-scrolling:touch;
      overscroll-behavior:contain;
    }

    .settings-hero-card,
    .settings-section{
      border-radius:24px;
      background:var(--bg-card);
      box-shadow:var(--shadow-sm);
    }

    .settings-hero-card{
      display:grid;
      grid-template-columns:auto minmax(0,1fr);
      align-items:center;
      gap:14px;
      padding:16px;
      margin-bottom:14px;
    }

    .settings-hero-avatar{
      width:56px;
      height:56px;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      overflow:hidden;
      border-radius:22px;
      background:var(--surface-muted);
      color:var(--text-primary);
      box-shadow:var(--shadow-sm);
      font-size:18px;
      font-weight:650;
    }

    .settings-hero-avatar img{
      width:100%;
      height:100%;
      object-fit:cover;
    }

    .settings-hero-body{
      min-width:0;
      display:flex;
      flex-direction:column;
      gap:5px;
    }

    .settings-hero-name{
      color:var(--text-primary);
      font-size:17px;
      font-weight:650;
      line-height:1.35;
    }

    .settings-hero-desc{
      color:var(--text-secondary);
      font-size:13px;
      line-height:1.55;
    }

    .settings-section{
      padding:16px;
      margin-bottom:14px;
    }

    .settings-section-title{
      color:var(--text-primary);
      font-size:17px;
      font-weight:650;
      line-height:1.35;
    }

    .settings-section-desc{
      margin-top:5px;
      margin-bottom:12px;
      color:var(--text-secondary);
      font-size:13px;
      line-height:1.55;
    }

    .settings-row{
      width:100%;
      min-height:58px;
      display:grid;
      grid-template-columns:minmax(0,1fr) auto;
      align-items:center;
      gap:14px;
      padding:13px 0;
    }

    .settings-row.stacked{
      grid-template-columns:1fr;
      align-items:stretch;
      gap:10px;
    }

    .settings-row-text{
      min-width:0;
      display:flex;
      flex-direction:column;
      gap:4px;
    }

    .settings-row-title{
      color:var(--text-primary);
      font-size:14px;
      font-weight:650;
      line-height:1.35;
    }

    .settings-row-desc{
      color:var(--text-secondary);
      font-size:12px;
      line-height:1.5;
    }

    .settings-switch{
      position:relative;
      width:48px;
      height:30px;
      display:inline-flex;
      flex:0 0 auto;
    }

    .settings-switch input{
      position:absolute;
      inset:0;
      margin:0;
      opacity:0;
    }

    .settings-switch-ui{
      width:48px;
      height:30px;
      border-radius:999px;
      background:var(--surface-muted);
      box-shadow:var(--shadow-sm);
      transition:all 200ms ease;
    }

    .settings-switch-ui::after{
      content:"";
      position:absolute;
      top:5px;
      left:5px;
      width:20px;
      height:20px;
      border-radius:999px;
      background:var(--bg-card);
      box-shadow:var(--shadow-sm);
      transition:all 200ms ease;
    }

    .settings-switch input:checked + .settings-switch-ui{
      background:var(--accent);
    }

    .settings-switch input:checked + .settings-switch-ui::after{
      transform:translateX(18px);
    }

    .settings-input,
    .settings-select,
    .settings-number,
    .settings-textarea{
      border-radius:16px;
      background:var(--surface-muted);
      color:var(--text-primary);
      box-shadow:var(--shadow-sm);
      font:inherit;
      font-size:16px;
      line-height:1.4;
    }

    .settings-input,
    .settings-select{
      width:100%;
      min-height:42px;
      padding:0 12px;
    }

    .settings-textarea{
      width:100%;
      min-height:96px;
      padding:11px 12px;
      resize:none;
      line-height:1.6;
    }

    .settings-number{
      width:82px;
      min-height:42px;
      padding:0 10px;
      text-align:center;
    }

    .settings-number-wrap,
    .settings-range-pair{
      display:inline-flex;
      align-items:center;
      gap:8px;
      justify-content:flex-end;
    }

    .settings-suffix,
    .settings-range-mid{
      color:var(--text-secondary);
      font-size:12px;
      white-space:nowrap;
    }

    .settings-slider-top{
      display:grid;
      grid-template-columns:minmax(0,1fr) auto;
      gap:12px;
      align-items:start;
    }

    .settings-slider-value{
      color:var(--accent);
      font-size:13px;
      font-weight:650;
      line-height:1.4;
      white-space:nowrap;
    }

    .settings-slider{
      width:100%;
      accent-color:var(--accent);
    }

    .settings-small-btn{
      min-height:38px;
      padding:0 14px;
      border-radius:999px;
      background:var(--surface-muted);
      color:var(--text-primary);
      box-shadow:var(--shadow-sm);
      font:inherit;
      font-size:13px;
      font-weight:600;
      transition:all 200ms ease;
    }

    .settings-small-btn.danger{
      background:var(--accent-light);
      color:var(--accent);
    }

    .settings-small-btn:active{
      transform:scale(.96);
    }

    .settings-hint-card{
      margin-top:10px;
      padding:12px;
      border-radius:18px;
      background:var(--surface-muted);
      color:var(--text-secondary);
      box-shadow:var(--shadow-sm);
      font-size:13px;
      line-height:1.55;
    }

    .settings-confirm-overlay{
      position:fixed;
      inset:0;
      z-index:2147483000;
      display:flex;
      align-items:flex-end;
      justify-content:center;
      padding:20px;
      background:var(--bg-overlay);
      color:var(--text-primary);
    }

    .settings-confirm-card{
      width:min(100%,420px);
      padding:18px;
      border-radius:26px;
      background:var(--bg-card);
      box-shadow:var(--shadow-lg);
    }

    .settings-confirm-title{
      color:var(--text-primary);
      font-size:17px;
      font-weight:650;
      line-height:1.35;
    }

    .settings-confirm-desc{
      margin-top:8px;
      color:var(--text-secondary);
      font-size:13px;
      line-height:1.6;
    }

    .settings-confirm-actions{
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:10px;
      margin-top:16px;
    }

    .settings-confirm-btn{
      min-height:44px;
      border-radius:18px;
      background:var(--surface-muted);
      color:var(--text-primary);
      box-shadow:var(--shadow-sm);
      font:inherit;
      font-size:14px;
      font-weight:600;
      transition:all 200ms ease;
    }

    .settings-confirm-btn.danger{
      background:var(--accent);
      color:var(--bubble-user-text);
    }

    .settings-confirm-btn:active{
      transform:scale(.96);
    }

    @media(max-width:430px){
      .thread-settings-header{
        padding-left:20px;
        padding-right:20px;
      }

      .thread-settings-scroll{
        padding-left:20px;
        padding-right:20px;
      }

      .settings-row{
        grid-template-columns:1fr;
        align-items:stretch;
      }

      .settings-switch,
      .settings-number-wrap{
        justify-self:start;
      }

      .settings-range-pair{
        justify-content:flex-start;
        flex-wrap:wrap;
      }

      .settings-number{
        width:78px;
      }
    }

    @media(prefers-reduced-motion:reduce){
      .settings-icon-btn,
      .thread-settings-save,
      .settings-switch-ui,
      .settings-switch-ui::after,
      .settings-small-btn,
      .settings-confirm-btn{
        transition:none;
      }
    }
  `;

  document.head.appendChild(style);
}

// 依赖：../../core/storage.js(getData,setData,getDB,setDB,getAllDB,getByIndexDB,deleteDB,getNow)；../../core/ui.js(createIcon,showToast)
