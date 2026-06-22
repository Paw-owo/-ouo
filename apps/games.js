// apps/games.js
// imports:
//   from '../core/storage.js': getData, setData, generateId, getNow, getAllDB, getDB, setDB, deleteDB, compressImage
//   from '../core/api.js': silentRequest
//   from '../core/ui.js': showToast, showBottomSheet, hideBottomSheet, showConfirm, createIcon

import {
  getData,
  setData,
  generateId,
  getNow,
  getAllDB,
  getDB,
  setDB,
  deleteDB,
  compressImage
} from '../core/storage.js';

import { silentRequest } from '../core/api.js';

import {
  showToast,
  showBottomSheet,
  hideBottomSheet,
  showConfirm,
  createIcon
} from '../core/ui.js';

const STYLE_ID = 'games-styles';
const BG_KEY = 'app_bg_games';
const CONFIG_KEY = 'game_configs';
const VISUALS_KEY = 'app_game_visuals';
const SESSION_KEY = 'game_sessions';
const DAILY_REWARD_KEY = 'game_daily_reward_date';
const GAMES_BADGE_KEY = 'chat_unread_counts';

const PET_ID = 'main_pet';
const PET_LOW_LIMIT = 30;
const PET_DECAY_HOUR = 1000 * 60 * 60;

const FALLBACK_ITEM_EFFECTS = {
  'item-pet-food': '宠物饲料可用于恢复宠物饥饿度。',
  'item-dried-fish': '香香小鱼干适合猫类宠物奖励。',
  'item-toy-ball': '软软玩具球可提升宠物心情和亲密度。',
  'item-pet-bed': '月牙宠物窝让宠物休息更安心。',
  'item-clean-brush': '柔毛清洁刷可增加宠物亲密度。',
  'item-energy-snack': '元气小零食可在宠物低落时恢复心情。',
  'item-tarot-wax': '塔罗蜡封卡让塔罗解读更有仪式感。',
  'item-script-clue': '剧本线索夹可辅助整理线索。',
  'item-truth-pack': '真心话卡包可解锁更柔软的问题。',
  'item-werewolf-sleeve': '身份牌护套增强狼人杀身份隐藏氛围。',
  'item-card-cloth': '绒面牌桌布增强扑克牌桌氛围。',
  'item-match-ticket': '灵感提示券可在猜测小游戏里获得提示。'
};

const GAME_LIST = [
  {
    id: 'werewolf',
    name: '狼人杀',
    intro: '身份藏在桌下，发言落在光里。',
    detail: '适合多人角色局，由 AI 安排夜晚、发言、投票与推进。',
    tone: '悬疑、克制、有暗流',
    minPlayers: 3
  },
  {
    id: 'undercover',
    name: '谁是卧底',
    intro: '同一个词里，藏着不一样的人。',
    detail: 'AI 分配词语与回合，你只管描述、观察和投票。',
    tone: '悬疑、轻松、适合猜测',
    minPlayers: 3
  },
  {
    id: 'cards',
    name: '扑克牌',
    intro: '一张安静牌桌，慢慢出牌。',
    detail: '轻量牌局，规则由 AI 解释并随局推进。',
    tone: '桌边、安静、有判断',
    minPlayers: 1
  },
  {
    id: 'truth',
    name: '真心话大冒险',
    intro: '问题轻轻落下，答案靠近一点。',
    detail: '抽对象、选题目，适合轻松互动和角色关系升温。',
    tone: '亲近、柔软、轻微心动',
    minPlayers: 1
  },
  {
    id: 'tarot',
    name: '塔罗牌',
    intro: '把问题放在心里，再翻开一张牌。',
    detail: '支持单张、三张、十字牌阵，AI 做温柔解读。',
    tone: '神秘、温柔、留白',
    minPlayers: 1
  },
  {
    id: 'match',
    name: '配对',
    intro: '一点点试探，慢慢靠近答案。',
    detail: 'AI 猜你想的，或者你猜 AI 想的。',
    tone: '试探、推理、轻松',
    minPlayers: 1
  },
  {
    id: 'script',
    name: '剧本杀',
    intro: '线索像纸页，故事慢慢翻开。',
    detail: 'AI 主持案件、人物、线索与投票。',
    tone: '沉浸、推理、剧情感',
    minPlayers: 1
  },
  {
    id: 'pet',
    name: '云养宠',
    intro: '有一只小家伙，正在等你回来。',
    detail: '喂食、玩耍、抚摸，也可以让它对你说句话。',
    tone: '可爱、陪伴、日常',
    minPlayers: 0
  }
];

const DEFAULT_CONFIG = {
  gameId: '',
  mode: 'host',
  characterIds: [],
  background: '',
  themeColor: '',
  updatedAt: ''
};

const DEFAULT_VISUAL = {
  gameId: '',
  name: '',
  imageSource: '',
  opacity: 100,
  updatedAt: ''
};

const DEFAULT_PET = {
  id: PET_ID,
  name: '小云',
  type: 'cat',
  color: '#D4956A',
  useCustomGif: false,
  gifs: {
    normal: '',
    happy: '',
    sleep: ''
  },
  hunger: 82,
  mood: 78,
  affection: 24,
  lastFed: '',
  lastInteract: ''
};

let container = null;
let rootEl = null;
let currentView = 'hall';
let currentGameId = '';
let characters = [];
let inventory = [];
let sessions = [];
let configs = {};
let visuals = {};
let visualImages = {};
let petData = null;
let activeSession = null;
let petSayTimer = null;
let currentAbort = false;

export async function mount(containerEl) {
  container = containerEl;
  injectStyles();

  rootEl = document.createElement('section');
  rootEl.className = 'games-screen';

  container.innerHTML = '';
  container.appendChild(rootEl);

  await loadData();
  await applyAppBackground();
  renderHall();
}

export function unmount() {
  hideBottomSheet();
  clearPetSayTimer();
  currentAbort = true;

  if (container) {
    container.innerHTML = '';
    container = null;
  }

  rootEl = null;
  currentView = 'hall';
  currentGameId = '';
  activeSession = null;
  petData = null;
}

async function loadData() {
  characters = normalizeArray(await getAllDB('characters')).filter((item) => item?.id);
  inventory = normalizeArray(await getAllDB('inventory'));
  configs = normalizeConfigs(getData(CONFIG_KEY));
  visuals = normalizeVisuals(getData(VISUALS_KEY));
  visualImages = await loadVisualImages();
  sessions = normalizeArray(getData(SESSION_KEY));
  petData = await loadPet();
}

async function loadVisualImages() {
  const next = {};

  await Promise.all(GAME_LIST.map(async (game) => {
    try {
      const record = await getDB('blobs', `app_game_icon_${game.id}`);
      next[game.id] = record?.value || '';
    } catch (_) {
      next[game.id] = '';
    }
  }));

  return next;
}

async function loadPet() {
  const record = await getDB('pet', PET_ID);
  const pet = normalizePet(record || DEFAULT_PET);
  const decayed = applyPetDecay(pet);
  await setDB('pet', PET_ID, decayed);
  petData = decayed;
  updateGamesBadgeByPet();
  return decayed;
}

async function savePet(nextPet) {
  petData = normalizePet(nextPet);
  await setDB('pet', PET_ID, petData);
  updateGamesBadgeByPet();
}

function normalizePet(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};

  return {
    id: source.id || PET_ID,
    name: String(source.name || DEFAULT_PET.name).trim() || DEFAULT_PET.name,
    type: ['cat', 'dog', 'rabbit', 'fantasy'].includes(source.type) ? source.type : 'cat',
    color: typeof source.color === 'string' && source.color ? source.color : DEFAULT_PET.color,
    useCustomGif: Boolean(source.useCustomGif),
    gifs: {
      normal: typeof source.gifs?.normal === 'string' ? source.gifs.normal : '',
      happy: typeof source.gifs?.happy === 'string' ? source.gifs.happy : '',
      sleep: typeof source.gifs?.sleep === 'string' ? source.gifs.sleep : ''
    },
    hunger: clamp(Number(source.hunger ?? DEFAULT_PET.hunger), 0, 100),
    mood: clamp(Number(source.mood ?? DEFAULT_PET.mood), 0, 100),
    affection: clamp(Number(source.affection ?? DEFAULT_PET.affection), 0, 100),
    lastFed: source.lastFed || getNow(),
    lastInteract: source.lastInteract || getNow()
  };
}

function applyPetDecay(pet) {
  const now = Date.now();
  const lastFed = new Date(pet.lastFed || getNow()).getTime();
  const lastInteract = new Date(pet.lastInteract || getNow()).getTime();

  const hungerHours = Math.max(0, (now - lastFed) / PET_DECAY_HOUR);
  const moodHours = Math.max(0, (now - lastInteract) / PET_DECAY_HOUR);

  return {
    ...pet,
    hunger: clamp(Math.round(pet.hunger - hungerHours * 4), 0, 100),
    mood: clamp(Math.round(pet.mood - moodHours * 3), 0, 100)
  };
}

function normalizeConfigs(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const next = {};

  GAME_LIST.forEach((game) => {
    next[game.id] = {
      ...DEFAULT_CONFIG,
      ...(source[game.id] || {}),
      gameId: game.id,
      characterIds: Array.isArray(source[game.id]?.characterIds) ? source[game.id].characterIds : [],
      background: '',
      themeColor: source[game.id]?.themeColor || '',
      updatedAt: source[game.id]?.updatedAt || ''
    };
  });

  return next;
}

function normalizeVisuals(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const next = {};

  GAME_LIST.forEach((game) => {
    const item = source[game.id] || {};
    next[game.id] = {
      ...DEFAULT_VISUAL,
      gameId: game.id,
      name: typeof item.name === 'string' ? item.name : '',
      imageSource: typeof item.imageSource === 'string' ? item.imageSource : '',
      opacity: clamp(Number(item.opacity || 100), 20, 100),
      updatedAt: item.updatedAt || ''
    };
  });

  return next;
}

function saveConfigs() {
  setData(CONFIG_KEY, configs);
}

function saveVisuals() {
  setData(VISUALS_KEY, visuals);
}

function saveSessions() {
  setData(SESSION_KEY, sessions.slice(-60));
}

function getUserProfile() {
  const settings = getData('app_settings') || {};
  const user = settings.user || {};

  return {
    id: 'user',
    name: user.name || '我',
    avatar: user.avatar || ''
  };
}

async function applyAppBackground() {
  if (!rootEl) return;

  rootEl.style.removeProperty('--game-accent');

  try {
    const record = await getDB('blobs', BG_KEY);
    const value = record?.value || '';
    if (value) {
      rootEl.classList.add('has-bg');
      rootEl.style.backgroundImage = `url("${value}")`;
      return;
    }
  } catch (_) {
    /* silent */
  }

  rootEl.classList.remove('has-bg');
  rootEl.style.backgroundImage = '';
}

async function applyGameBackground(gameId) {
  if (!rootEl) return;

  const config = configs[gameId] || {};
  let value = '';

  try {
    const record = await getDB('blobs', `app_game_bg_${gameId}`);
    value = record?.value || '';
  } catch (_) {
    value = '';
  }

  if (config.themeColor) {
    rootEl.style.setProperty('--game-accent', config.themeColor);
  } else {
    rootEl.style.removeProperty('--game-accent');
  }

  if (value) {
    rootEl.classList.add('has-bg');
    rootEl.style.backgroundImage = `url("${value}")`;
  } else {
    const appBg = await getDB('blobs', BG_KEY);
    const appValue = appBg?.value || '';
    if (appValue) {
      rootEl.classList.add('has-bg');
      rootEl.style.backgroundImage = `url("${appValue}")`;
    } else {
      rootEl.classList.remove('has-bg');
      rootEl.style.backgroundImage = '';
    }
  }
}

function getGame(gameId) {
  return GAME_LIST.find((item) => item.id === gameId) || GAME_LIST[0];
}

function getGameDisplayName(gameId) {
  const game = getGame(gameId);
  const visual = visuals[gameId] || {};
  return visual.name || game.name;
}

function getGameVisual(gameId) {
  return visuals[gameId] || { ...DEFAULT_VISUAL, gameId };
}

function getVisualImage(gameId) {
  return visualImages[gameId] || '';
}

function getVisualOpacity(visual) {
  return clamp(Number(visual?.opacity || 100), 20, 100) / 100;
}

function renderShell(title, subtitle = '', rightButton = null) {
  rootEl.innerHTML = '';

  const soft = el('div', 'games-soft-layer');

  const nav = el('div', 'games-nav');

  const back = iconButton('back', currentView === 'hall' ? '关闭' : '返回');
  back.addEventListener('click', () => {
    if (currentView === 'hall') {
      window.closeCurrentApp?.();
      return;
    }
    renderHall();
  });

  const titleBox = el('div', 'games-nav-titlebox');
  titleBox.append(
    el('div', 'games-nav-title', title),
    el('div', 'games-nav-subtitle', subtitle)
  );

  nav.append(back, titleBox);
  if (rightButton) nav.appendChild(rightButton);

  const body = el('div', 'games-body');

  rootEl.append(soft, nav, body);
  return body;
}

function renderHall() {
  currentView = 'hall';
  currentGameId = '';
  activeSession = null;
  currentAbort = false;

  applyAppBackground();

  const imageButton = iconButton('image', '图片内容');
  imageButton.addEventListener('click', () => openImageContentSheet());

  const body = renderShell('游戏', '把小世界收进抽屉里', imageButton);

  const featured = createFeaturedShelf();
  const collection = createGameCollection();
  const recent = createRecentShelf();

  body.append(featured, collection);
  if (recent) body.appendChild(recent);
}

function createFeaturedShelf() {
  const shelf = el('section', 'games-featured');

  const left = el('div', 'games-featured-main');

  const kicker = el('div', 'games-kicker', '今日小世界');
  const title = el('div', 'games-featured-title', getFeaturedTitle());
  const desc = el('div', 'games-featured-desc', getFeaturedDesc());

  const chips = el('div', 'games-featured-chips');
  chips.append(
    createInfoPill('角色', `${characters.length} 位`),
    createInfoPill('记录', `${sessions.length} 局`),
    createInfoPill('宠物', getPetStatusText())
  );

  left.append(kicker, title, desc, chips);

  const art = el('button', 'games-featured-art');
  art.type = 'button';
  art.appendChild(createHeroSvg());
  art.addEventListener('click', () => openPetGame());

  shelf.append(left, art);
  return shelf;
}

function getFeaturedTitle() {
  if (petData && (petData.hunger < PET_LOW_LIMIT || petData.mood < PET_LOW_LIMIT)) {
    return `${petData.name} 想见你`;
  }

  const last = sessions
    .slice()
    .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))[0];

  if (last) return `继续 ${getGameDisplayName(last.gameId)}`;

  return '今天开一局轻轻的游戏';
}

function getFeaturedDesc() {
  if (petData && (petData.hunger < PET_LOW_LIMIT || petData.mood < PET_LOW_LIMIT)) {
    return '它的状态有点低，进去陪一小会儿就好。';
  }

  const last = sessions
    .slice()
    .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))[0];

  if (last) {
    const msg = normalizeArray(last.messages).slice(-1)[0];
    return msg?.content ? msg.content.slice(0, 52) : '上次的局还留着，可以慢慢接上。';
  }

  return '狼人杀、塔罗、剧本杀和云养宠都在这里，不用急着做选择。';
}

function createInfoPill(label, value) {
  const pill = el('div', 'games-info-pill');
  pill.append(el('span', '', label), el('strong', '', value));
  return pill;
}

function createGameCollection() {
  const section = el('section', 'games-collection');

  const head = el('div', 'games-section-head');
  head.append(
    el('div', 'games-section-title', '收藏柜'),
    el('div', 'games-section-note', '横向滑动挑一个')
  );

  const rail = el('div', 'game-rail');

  GAME_LIST.forEach((game) => {
    rail.appendChild(createGameCard(game));
  });

  section.append(head, rail);
  return section;
}

function createRecentShelf() {
  const recent = sessions
    .slice()
    .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))
    .slice(0, 3);

  if (!recent.length) return null;

  const section = el('section', 'games-recent');

  const head = el('div', 'games-section-head');
  head.append(
    el('div', 'games-section-title', '最近玩过'),
    el('div', 'games-section-note', '记录只在本机保存')
  );

  const list = el('div', 'games-recent-list');
  recent.forEach((session) => list.appendChild(createSessionCard(session)));

  section.append(head, list);
  return section;
}

function createGameCard(game) {
  const visual = getGameVisual(game.id);
  const customImage = getVisualImage(game.id);

  const card = el('button', `game-card game-card-${game.id}`);
  card.type = 'button';

  const art = el('div', `game-art game-art-${game.id}`);
  art.style.opacity = String(getVisualOpacity(visual));

  if (customImage) {
    art.classList.add('has-custom-image');
    const img = document.createElement('img');
    img.src = customImage;
    img.alt = '';
    art.appendChild(img);
  } else {
    art.appendChild(createGameSvg(game.id, 54));
  }

  const text = el('div', 'game-card-text');
  text.append(
    el('div', 'game-card-title', getGameDisplayName(game.id)),
    el('div', 'game-card-desc', game.intro)
  );

  const meta = el('div', 'game-card-meta');
  meta.append(
    el('span', '', game.id === 'pet' ? getPetStatusText() : getConfigSummary(game.id)),
    createIcon('arrow-right', 16)
  );

  card.append(art, text, meta);

  card.addEventListener('click', () => {
    if (game.id === 'pet') {
      openPetGame();
    } else {
      openGameSetup(game.id);
    }
  });

  return card;
}

function getConfigSummary(gameId) {
  const config = configs[gameId] || DEFAULT_CONFIG;
  const count = config.characterIds.length;
  if (count) return `${count} 位角色`;
  return '还没布置';
}

function getPetStatusText() {
  if (!petData) return '准备中';
  if (petData.hunger < PET_LOW_LIMIT || petData.mood < PET_LOW_LIMIT) return '想被照顾';
  if (petData.affection >= 80) return '很亲近';
  return '状态不错';
}

async function openGameSetup(gameId) {
  currentView = 'setup';
  currentGameId = gameId;
  await applyGameBackground(gameId);

  const game = getGame(gameId);

  const imageButton = iconButton('image', '图片内容');
  imageButton.addEventListener('click', () => openImageContentSheet(gameId));

  const body = renderShell(getGameDisplayName(gameId), '准备一个舒服的开局', imageButton);
  const config = configs[gameId] || { ...DEFAULT_CONFIG, gameId };

  const cover = el('section', 'game-setup-cover');

  const art = el('div', 'game-setup-art');
  const customImage = getVisualImage(gameId);

  if (customImage) {
    art.classList.add('has-custom-image');
    const img = document.createElement('img');
    img.src = customImage;
    img.alt = '';
    art.appendChild(img);
  } else {
    art.appendChild(createGameSvg(gameId, 72));
  }

  const copy = el('div', 'game-setup-copy');
  copy.append(
    el('div', 'games-kicker', game.tone),
    el('div', 'game-setup-title', getGameDisplayName(gameId)),
    el('div', 'game-setup-desc', game.detail || game.intro)
  );

  cover.append(art, copy);

  const quick = el('section', 'game-start-panel');

  const mode = createModeCards(config);
  const picked = createPickedCharactersPreview(config);
  const start = button('开始这一局', 'primary', 'play');
  start.classList.add('wide-btn', 'start-game-btn');
  start.addEventListener('click', () => startGenericGame(gameId));

  const details = document.createElement('details');
  details.className = 'game-fold-panel';

  const summary = document.createElement('summary');
  summary.append(el('span', '', '小设置'), createIcon('arrow-down', 16));

  const detailsBody = el('div', 'game-fold-content');
  detailsBody.append(
    createCharacterPicker(config),
    createThemeEditor(gameId, config)
  );

  details.append(summary, detailsBody);

  quick.append(
    createSettingBlock('玩法模式', '先选 AI 是主持，还是一起当玩家。', mode),
    createSettingBlock('参与角色', '头像会显示在游戏发言里。', picked),
    start,
    details
  );

  body.append(cover, quick);

  const recent = getRecentSessions(gameId);
  if (recent.length) {
    const section = el('section', 'game-section');
    const head = el('div', 'games-section-head');
    head.append(
      el('div', 'games-section-title', '这类游戏的旧记录'),
      el('div', 'games-section-note', '点一下继续')
    );

    const list = el('div', 'session-list');
    recent.forEach((session) => list.appendChild(createSessionCard(session)));

    section.append(head, list);
    body.appendChild(section);
  }
}

function createModeCards(config) {
  const wrap = el('div', 'mode-card-row');

  [
    { value: 'host', title: 'AI 主持', desc: '它负责规则、节奏和推进。' },
    { value: 'player', title: 'AI 玩家', desc: '它像同桌玩家一样参与。' }
  ].forEach((item) => {
    const card = el('button', 'mode-card');
    card.type = 'button';
    card.classList.toggle('active', (config.mode || 'host') === item.value);

    card.append(
      el('div', 'mode-card-title', item.title),
      el('div', 'mode-card-desc', item.desc)
    );

    card.addEventListener('click', () => {
      config.mode = item.value;
      config.updatedAt = getNow();
      configs[config.gameId] = config;
      saveConfigs();
      wrap.querySelectorAll('.mode-card').forEach((node) => node.classList.remove('active'));
      card.classList.add('active');
    });

    wrap.appendChild(card);
  });

  return wrap;
}

function createPickedCharactersPreview(config) {
  const selected = characters.filter((item) => config.characterIds.includes(item.id));
  const wrap = el('div', 'picked-character-preview');

  if (!selected.length) {
    wrap.appendChild(el('div', 'soft-note', '还没有选择角色。可以直接开始，也可以在小设置里慢慢挑。'));
    return wrap;
  }

  const avatars = el('div', 'picked-avatar-row');

  selected.slice(0, 8).forEach((character) => {
    avatars.appendChild(createMiniAvatar(character));
  });

  const text = el('div', 'picked-character-text', selected.map((item) => item.name || '未命名').join('、'));

  wrap.append(avatars, text);
  return wrap;
}

function createSetupActionButton(gameId) {
  const item = iconButton('image', '图片内容');
  item.addEventListener('click', () => openImageContentSheet(gameId));
  return item;
}

function createSettingBlock(title, desc, content) {
  const block = el('div', 'setup-block');
  block.append(
    el('div', 'setup-block-title', title),
    el('div', 'setup-block-desc', desc),
    content
  );
  return block;
}

function createCharacterPicker(config) {
  const wrap = el('div', 'setup-block compact');

  wrap.append(
    el('div', 'setup-block-title', '挑角色'),
    el('div', 'setup-block-desc', '点头像加入这一局，消息会显示对应名字和头像。')
  );

  const list = el('div', 'character-chip-list');

  if (!characters.length) {
    list.appendChild(el('div', 'soft-note', '还没有角色。可以先去角色应用创建。'));
  } else {
    characters.forEach((character) => {
      const chip = el('button', 'character-chip');
      chip.type = 'button';
      chip.classList.toggle('active', config.characterIds.includes(character.id));

      const avatar = el('span', 'character-chip-avatar');
      if (character.avatar) {
        const img = document.createElement('img');
        img.src = character.avatar;
        img.alt = '';
        avatar.appendChild(img);
      } else {
        avatar.appendChild(createIcon('smile', 16));
      }

      chip.append(avatar, el('span', '', character.name || '未命名'));
      chip.addEventListener('click', () => {
        const active = chip.classList.toggle('active');
        config.characterIds = toggleId(config.characterIds, character.id, active);
        config.updatedAt = getNow();
        configs[config.gameId] = config;
        saveConfigs();
      });

      list.appendChild(chip);
    });
  }

  wrap.appendChild(list);
  return wrap;
}

function createThemeEditor(gameId, config) {
  const wrap = el('div', 'setup-block compact');
  wrap.append(
    el('div', 'setup-block-title', '氛围色'),
    el('div', 'setup-block-desc', '只影响当前游戏，不改全局主题。')
  );

  const row = el('div', 'theme-row');
  const color = document.createElement('input');
  color.type = 'color';
  color.className = 'theme-color-input';
  color.value = normalizeColorValue(config.themeColor || readCssVar('--accent') || '#D4956A');

  color.addEventListener('input', () => {
    config.themeColor = color.value;
    config.updatedAt = getNow();
    configs[gameId] = config;
    saveConfigs();
    rootEl?.style.setProperty('--game-accent', config.themeColor);
  });

  const clear = button('恢复默认', 'ghost', 'clear');
  clear.addEventListener('click', () => {
    config.themeColor = '';
    configs[gameId] = config;
    saveConfigs();
    rootEl?.style.removeProperty('--game-accent');
    color.value = normalizeColorValue(readCssVar('--accent') || '#D4956A');
  });

  row.append(color, clear);
  wrap.appendChild(row);

  if (config.themeColor) rootEl?.style.setProperty('--game-accent', config.themeColor);
  else rootEl?.style.removeProperty('--game-accent');

  return wrap;
}

function openImageContentSheet(defaultGameId = '') {
  if (defaultGameId) {
    openGameVisualSheet(defaultGameId);
    return;
  }

  const sheet = el('div', 'image-workbench');
  sheet.append(
    el('div', 'sheet-title', '图片内容'),
    el('div', 'sheet-description', '能换图片的地方都放在这里。')
  );

  const appBgFile = document.createElement('input');
  appBgFile.type = 'file';
  appBgFile.accept = 'image/*';
  appBgFile.className = 'hidden';

  const appBgBtn = button('更换大厅背景', 'ghost', 'image');
  appBgBtn.addEventListener('click', () => appBgFile.click());

  appBgFile.addEventListener('change', async () => {
    const file = appBgFile.files?.[0];
    if (!file) return;

    try {
      const base64 = await compressImage(file, 1600, 0.82);
      await setDB('blobs', BG_KEY, {
        key: BG_KEY,
        value: base64,
        source: file.name || '',
        updatedAt: getNow()
      });
      await applyAppBackground();
      showToast('大厅背景换好了');
    } catch (_) {
      showToast('背景没有处理好');
    } finally {
      appBgFile.value = '';
    }
  });

  const clearAppBg = button('清除大厅背景', 'ghost', 'clear');
  clearAppBg.addEventListener('click', async () => {
    await deleteDB('blobs', BG_KEY);
    await applyAppBackground();
    showToast('大厅背景已清除');
  });

  const topActions = el('div', 'visual-actions');
  topActions.append(appBgBtn, clearAppBg);

  const list = el('div', 'image-content-list');

  GAME_LIST.forEach((game) => {
    const item = el('button', 'image-content-item');
    item.type = 'button';

    const preview = el('span', 'image-content-preview');
    const imgValue = getVisualImage(game.id);

    if (imgValue) {
      const img = document.createElement('img');
      img.src = imgValue;
      img.alt = '';
      preview.appendChild(img);
    } else {
      preview.appendChild(createGameSvg(game.id, 28));
    }

    const text = el('span', 'image-content-text');
    text.append(
      el('span', 'image-content-title', getGameDisplayName(game.id)),
      el('span', 'image-content-desc', game.id === 'pet' ? '图标、背景、宠物 GIF' : '图标、背景、名字、透明度')
    );

    item.append(preview, text, createIcon('arrow-right', 18));
    item.addEventListener('click', () => openGameVisualSheet(game.id));
    list.appendChild(item);
  });

  sheet.append(appBgFile, topActions, list);
  showBottomSheet(sheet);
}

function openGameVisualSheet(gameId) {
  hideBottomSheet();

  const game = getGame(gameId);
  const visual = { ...getGameVisual(gameId) };
  const config = configs[gameId] || { ...DEFAULT_CONFIG, gameId };

  const sheet = el('div', 'image-workbench');
  sheet.append(
    el('div', 'sheet-title', `${game.name} 图片内容`),
    el('div', 'sheet-description', gameId === 'pet' ? '换图标、背景和宠物 GIF。' : '换名字、图标、背景和透明度。')
  );

  const nameInput = input('显示名字', visual.name || game.name);
  const opacityInput = input('20-100', visual.opacity || 100, 'number');
  opacityInput.min = '20';
  opacityInput.max = '100';

  const iconFile = document.createElement('input');
  iconFile.type = 'file';
  iconFile.accept = 'image/*';
  iconFile.className = 'hidden';

  const bgFile = document.createElement('input');
  bgFile.type = 'file';
  bgFile.accept = 'image/*';
  bgFile.className = 'hidden';

  const iconBtn = button('上传图标', 'ghost', 'upload');
  iconBtn.addEventListener('click', () => iconFile.click());

  const bgBtn = button('上传背景', 'ghost', 'image');
  bgBtn.addEventListener('click', () => bgFile.click());

  iconFile.addEventListener('change', async () => {
    const file = iconFile.files?.[0];
    if (!file) return;

    try {
      const base64 = await compressImage(file, 360, 0.86);
      await setDB('blobs', `app_game_icon_${gameId}`, {
        key: `app_game_icon_${gameId}`,
        value: base64,
        source: file.name || '',
        updatedAt: getNow()
      });
      visualImages[gameId] = base64;
      visual.imageSource = file.name || '';
      showToast('图标选好了');
    } catch (_) {
      showToast('图标没有处理好');
    } finally {
      iconFile.value = '';
    }
  });

  bgFile.addEventListener('change', async () => {
    const file = bgFile.files?.[0];
    if (!file) return;

    try {
      const base64 = await compressImage(file, 1600, 0.82);
      await setDB('blobs', `app_game_bg_${gameId}`, {
        key: `app_game_bg_${gameId}`,
        value: base64,
        source: file.name || '',
        updatedAt: getNow()
      });
      showToast('背景选好了');
    } catch (_) {
      showToast('背景没有处理好');
    } finally {
      bgFile.value = '';
    }
  });

  const clearIcon = button('清除图标', 'ghost', 'clear');
  clearIcon.addEventListener('click', async () => {
    visual.imageSource = '';
    visualImages[gameId] = '';
    await deleteDB('blobs', `app_game_icon_${gameId}`);
    showToast('图标已清除');
  });

  const clearBg = button('清除背景', 'ghost', 'delete');
  clearBg.addEventListener('click', async () => {
    await deleteDB('blobs', `app_game_bg_${gameId}`);
    showToast('背景已清除');
  });

  const actions = el('div', 'visual-actions');
  actions.append(iconBtn, bgBtn, clearIcon, clearBg);

  sheet.append(
    field('名字', nameInput),
    field('透明度', opacityInput),
    iconFile,
    bgFile,
    actions
  );

  if (gameId === 'pet') {
    const petBox = el('div', 'pet-gif-row');
    petBox.append(
      createPetGifUploadButton('normal', '日常 GIF'),
      createPetGifUploadButton('happy', '开心 GIF'),
      createPetGifUploadButton('sleep', '困困 GIF')
    );
    sheet.append(el('div', 'setup-block-title', '宠物 GIF'), petBox);
  }

  const save = button('保存图片内容', 'primary', 'check');
  save.addEventListener('click', async () => {
    visual.name = nameInput.value.trim() === game.name ? '' : nameInput.value.trim();
    visual.opacity = clamp(Number(opacityInput.value || 100), 20, 100);
    visual.updatedAt = getNow();

    config.updatedAt = getNow();
    config.background = '';

    configs[gameId] = config;
    visuals[gameId] = visual;

    saveConfigs();
    saveVisuals();

    hideBottomSheet();

    if (currentView === 'hall') {
      renderHall();
    } else if (gameId === 'pet') {
      await applyGameBackground(gameId);
      renderPetGame();
    } else {
      await openGameSetup(gameId);
    }

    showToast('图片内容收好了');
  });

  sheet.append(save);
  showBottomSheet(sheet);
}

function createPetGifUploadButton(key, label) {
  const file = document.createElement('input');
  file.type = 'file';
  file.accept = 'image/gif,image/*';
  file.className = 'hidden';

  const btn = button(label, 'ghost', 'upload');
  btn.addEventListener('click', () => file.click());

  file.addEventListener('change', async () => {
    const image = file.files?.[0];
    if (!image) return;

    try {
      const nextPet = normalizePet(petData || await loadPet());
      nextPet.useCustomGif = true;
      nextPet.gifs[key] = await fileToDataUrl(image);
      await savePet(nextPet);
      showToast(`${label} 已收好`);
    } catch (_) {
      showToast('GIF 没有处理好');
    } finally {
      file.value = '';
    }
  });

  const wrap = el('div', 'gif-picker');
  wrap.append(btn, file);
  return wrap;
}

async function openBackgroundSheet(gameId) {
  openGameVisualSheet(gameId);
}

function getRecentSessions(gameId) {
  return sessions
    .filter((item) => item.gameId === gameId)
    .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))
    .slice(0, 4);
}

function createSessionCard(session) {
  const card = el('button', 'session-card');
  card.type = 'button';

  const game = getGame(session.gameId);
  const last = normalizeArray(session.messages).slice(-1)[0];

  card.append(
    el('div', 'session-card-title', getGameDisplayName(game.id)),
    el('div', 'session-card-text', last?.content || '继续这局'),
    el('div', 'session-card-time', formatTime(session.updatedAt || session.createdAt))
  );

  card.addEventListener('click', () => {
    activeSession = session;
    renderGenericGame(session.gameId);
  });

  return card;
}

async function startGenericGame(gameId) {
  const config = configs[gameId] || { ...DEFAULT_CONFIG, gameId };
  const game = getGame(gameId);

  if (characters.length && config.characterIds.length < game.minPlayers && game.minPlayers > 1) {
    showToast(`建议至少选 ${game.minPlayers} 个角色`);
  }

  const session = {
    id: generateId(),
    gameId,
    mode: config.mode || 'host',
    characterIds: [...config.characterIds],
    messages: [],
    state: {
      phase: '开局',
      round: 1,
      selected: null,
      revealed: false,
      aiReplyIndex: 0
    },
    createdAt: getNow(),
    updatedAt: getNow()
  };

  sessions.push(session);
  activeSession = session;
  saveSessions();

  renderGenericGame(gameId);
  await appendAiGameMessage(buildOpeningPrompt(gameId), true);
}

function renderGenericGame(gameId) {
  currentView = 'play';
  currentGameId = gameId;

  const game = getGame(gameId);
  applyGameBackground(gameId);

  const reset = iconButton('clear', '结束这一局');
  reset.addEventListener('click', async () => {
    const ok = await showConfirm('要结束这一局吗？记录会保留。');
    if (!ok) return;
    openGameSetup(gameId);
  });

  const body = renderShell(getGameDisplayName(gameId), game.intro, reset);

  const play = el('section', `game-play game-play-${gameId}`);
  const scene = el('div', 'game-scene');
  scene.appendChild(createGameBoard(gameId));

  const logPanel = el('div', 'game-talk-panel');
  const logHead = el('div', 'game-talk-head');
  logHead.append(
    el('div', 'game-talk-title', '发言'),
    el('div', 'game-talk-note', '头像和名字会跟着角色走')
  );

  const log = el('div', 'game-log');
  log.id = 'game-log';

  normalizeArray(activeSession?.messages).forEach((message) => {
    log.appendChild(createGameMessage(message));
  });

  logPanel.append(logHead, log);

  const inputBar = createGameInput(gameId);

  play.append(scene, logPanel, inputBar);
  body.appendChild(play);

  scrollGameLog();
}

function createGameBoard(gameId) {
  if (gameId === 'werewolf') return createWerewolfBoard();
  if (gameId === 'undercover') return createUndercoverBoard();
  if (gameId === 'cards') return createCardsBoard();
  if (gameId === 'truth') return createTruthBoard();
  if (gameId === 'tarot') return createTarotBoard();
  if (gameId === 'match') return createMatchBoard();
  if (gameId === 'script') return createScriptBoard();

  return el('div', 'game-board');
}
function createWerewolfBoard() {
  const board = el('div', 'game-board werewolf-board');

  const top = el('div', 'board-head');
  top.append(
    el('div', 'board-title', getGamePhaseText() || '夜晚第 1 轮'),
    el('div', 'board-subtitle', '身份藏好，话慢慢说')
  );

  const table = el('div', 'round-table');
  const members = getSessionCharacters();

  if (!members.length) {
    table.appendChild(el('div', 'soft-note', '还没有固定角色，AI 会用主持视角推进这一局。'));
  } else {
    members.forEach((character, index) => {
      const seat = el('button', `round-seat seat-${index % 8}`);
      seat.type = 'button';
      seat.append(
        createMiniAvatar(character),
        el('div', 'seat-name', character.name || `玩家 ${index + 1}`),
        el('div', 'seat-role-back', '身份牌')
      );
      seat.addEventListener('click', () => chooseBoardTarget(character.id));
      table.appendChild(seat);
    });
  }

  board.append(top, table);
  return board;
}

function createUndercoverBoard() {
  const board = el('div', 'game-board undercover-board');

  board.append(
    el('div', 'board-title', '词语桌'),
    el('div', 'board-subtitle', '相似的词里，藏着不一样的人')
  );

  const cards = el('div', 'word-card-row');
  const members = getSessionCharacters();

  if (!members.length) {
    cards.appendChild(el('div', 'soft-note', '可以直接让 AI 主持发词。'));
  } else {
    members.forEach((character) => {
      const card = el('button', 'word-card');
      card.type = 'button';
      card.append(
        createMiniAvatar(character),
        el('div', 'word-card-name', character.name || '玩家'),
        el('div', 'word-card-hidden', '隐藏词语')
      );
      card.addEventListener('click', () => chooseBoardTarget(character.id));
      cards.appendChild(card);
    });
  }

  board.appendChild(cards);
  return board;
}

function createCardsBoard() {
  const board = el('div', 'game-board cards-board');

  const table = el('div', 'card-table');
  table.append(
    el('div', 'card-pile', '牌堆'),
    el('div', 'play-area', '出牌区')
  );

  const hand = el('div', 'hand-row');
  ['A', '7', 'Q', '3', 'K'].forEach((text) => {
    const card = el('button', 'paper-card', text);
    card.type = 'button';
    hand.appendChild(card);
  });

  board.append(
    el('div', 'board-title', '安静牌桌'),
    el('div', 'board-subtitle', '规则不急，先把牌放好'),
    table,
    hand
  );

  return board;
}

function createTruthBoard() {
  const board = el('div', 'game-board truth-board');

  const wheel = el('button', 'truth-wheel');
  wheel.type = 'button';
  wheel.appendChild(createTruthWheelSvg());
  wheel.addEventListener('click', () => spinTruthWheel(wheel));

  const actions = el('div', 'truth-actions');

  const truth = button('真心话', 'ghost', 'heart');
  truth.addEventListener('click', () => sendGamePrompt('请给我一个真心话题目，柔软一点，可以有一点心动感。'));

  const dare = button('大冒险', 'ghost', 'star');
  dare.addEventListener('click', () => sendGamePrompt('请给我一个大冒险题目，安全、轻松、有互动感。'));

  actions.append(truth, dare);

  board.append(
    el('div', 'board-title', '轻轻转一下'),
    el('div', 'board-subtitle', '转到谁，就把问题递给谁'),
    wheel,
    actions
  );

  return board;
}

function createTarotBoard() {
  const board = el('div', 'game-board tarot-board');

  const modes = el('div', 'tarot-modes');

  [
    ['单张', '请用单张牌阵解读现在最需要看见的提醒。'],
    ['三张', '请用三张牌阵，按过去、现在、未来解读。'],
    ['十字', '请用五张十字牌阵，简洁但有层次地解读。']
  ].forEach(([label, prompt]) => {
    const item = button(label, 'ghost', 'star');
    item.addEventListener('click', () => sendGamePrompt(prompt));
    modes.appendChild(item);
  });

  const spread = el('div', 'tarot-spread');

  for (let i = 0; i < 5; i += 1) {
    const card = el('button', 'tarot-card');
    card.type = 'button';
    card.appendChild(createTarotCardSvg());
    card.addEventListener('click', () => {
      card.classList.toggle('revealed');
      sendGamePrompt('我抽了一张牌，请继续解读。');
    });
    spread.appendChild(card);
  }

  board.append(
    el('div', 'board-title', '把问题放在心里'),
    el('div', 'board-subtitle', '选牌阵，再翻开牌面'),
    modes,
    spread
  );

  return board;
}

function createMatchBoard() {
  const board = el('div', 'game-board match-board');

  const progress = el('div', 'guess-progress');
  progress.append(
    el('div', 'guess-progress-fill'),
    el('div', 'guess-progress-text', '剩余猜测 6 次')
  );

  const actions = el('div', 'match-actions');

  const aiGuess = button('AI 猜我想的', 'ghost', 'search');
  aiGuess.addEventListener('click', () => sendGamePrompt('请开始玩“AI 猜我想的”。你一步步问我是否相关的问题，我只回答是或否。'));

  const userGuess = button('我猜 AI 想的', 'ghost', 'eye');
  userGuess.addEventListener('click', () => sendGamePrompt('请在心里想一个物品或概念，然后给我第一条提示，让我来猜。'));

  actions.append(aiGuess, userGuess);

  board.append(
    el('div', 'board-title', '一点点靠近答案'),
    el('div', 'board-subtitle', '不要急，线索会慢慢出现'),
    progress,
    actions
  );

  return board;
}

function createScriptBoard() {
  const board = el('div', 'game-board script-board');

  const clues = el('details', 'clue-panel');
  const summary = document.createElement('summary');
  summary.textContent = '线索板';

  const clueList = el('div', 'clue-list');
  ['时间线', '人物关系', '可疑物品'].forEach((item) => {
    clueList.appendChild(el('div', 'clue-item', item));
  });

  clues.append(summary, clueList);

  const actions = el('div', 'script-actions');

  const importBtn = button('导入剧本 JSON', 'ghost', 'upload');
  importBtn.addEventListener('click', openScriptImport);

  const voteBtn = button('进入投票', 'ghost', 'check');
  voteBtn.addEventListener('click', () => sendGamePrompt('请推进到投票环节，让我选择嫌疑人，并总结目前线索。'));

  actions.append(importBtn, voteBtn);

  board.append(
    el('div', 'board-title', '案件慢慢展开'),
    el('div', 'board-subtitle', '线索会先安静地躺在这里'),
    clues,
    actions
  );

  return board;
}

function createGameInput(gameId) {
  const box = el('div', 'game-input-bar');

  const inputEl = document.createElement('textarea');
  inputEl.className = 'game-input';
  inputEl.rows = 1;
  inputEl.placeholder = getInputPlaceholder(gameId);

  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = `${Math.min(118, inputEl.scrollHeight)}px`;
  });

  inputEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendGameText(inputEl);
    }
  });

  const send = iconButton('send', '发送');
  send.classList.add('accent');
  send.addEventListener('click', () => sendGameText(inputEl));

  box.append(inputEl, send);
  return box;
}

function getInputPlaceholder(gameId) {
  if (gameId === 'werewolf') return '发言、投票或夜晚行动';
  if (gameId === 'undercover') return '描述词语或投票';
  if (gameId === 'cards') return '出牌、摸牌或询问规则';
  if (gameId === 'truth') return '回答题目，或要求换一个';
  if (gameId === 'tarot') return '说出想问的问题';
  if (gameId === 'match') return '回答是/否，或输入猜测';
  if (gameId === 'script') return '调查、询问或整理线索';
  return '说点什么';
}

async function sendGameText(inputEl) {
  const text = inputEl.value.trim();
  if (!text || !activeSession) return;

  inputEl.value = '';
  inputEl.style.height = 'auto';

  const user = getUserProfile();

  appendLocalGameMessage({
    role: 'user',
    speakerId: 'user',
    speakerName: user.name,
    speakerAvatar: user.avatar,
    content: text
  });

  await appendAiGameMessage(text);
}

async function sendGamePrompt(text) {
  if (!text || !activeSession) return;

  const user = getUserProfile();

  appendLocalGameMessage({
    role: 'user',
    speakerId: 'user',
    speakerName: user.name,
    speakerAvatar: user.avatar,
    content: text
  });

  await appendAiGameMessage(text);
}

function appendLocalGameMessage(data) {
  const message = {
    id: generateId(),
    role: data.role || 'system',
    speakerId: data.speakerId || '',
    speakerName: data.speakerName || '',
    speakerAvatar: data.speakerAvatar || '',
    content: data.content || '',
    timestamp: getNow()
  };

  activeSession.messages = normalizeArray(activeSession.messages);
  activeSession.messages.push(message);
  activeSession.updatedAt = getNow();

  sessions = sessions.map((item) => item.id === activeSession.id ? activeSession : item);
  saveSessions();

  const log = document.getElementById('game-log');
  if (log) {
    log.appendChild(createGameMessage(message));
    scrollGameLog();
  }

  return message;
}

async function appendAiGameMessage(userText, isOpening = false) {
  if (!activeSession || currentAbort) return;

  const game = getGame(activeSession.gameId);
  const selectedCharacters = getSessionCharacters();
  const speaker = getNextAiSpeaker(selectedCharacters);

  const typing = appendLocalGameMessage({
    role: 'assistant',
    speakerId: speaker.id || 'host',
    speakerName: speaker.name || 'AI 主持',
    speakerAvatar: speaker.avatar || '',
    content: '正在想'
  });

  const characterText = selectedCharacters.length
    ? selectedCharacters.map((item) => `- ${item.name || 'AI'}：${item.systemPrompt || '无详细人设'}`).join('\n')
    : '未选择固定角色，请直接担任主持和 NPC。';

  const inventoryText = await buildInventoryText();

  const history = normalizeArray(activeSession.messages)
    .filter((item) => item.id !== typing.id)
    .slice(-18)
    .map((item) => `${item.speakerName || item.role}：${item.content}`)
    .join('\n');

  const prompt = [
    `你是小游戏「${getGameDisplayName(game.id)}」里的${activeSession.mode === 'player' ? '参与玩家' : '主持与参与 AI'}。`,
    speaker.id ? `这次请优先扮演：${speaker.name || 'AI'}。只能用这个角色的口吻说话。` : '',
    `游戏氛围：${game.tone}。`,
    `当前模式：${activeSession.mode === 'player' ? 'AI 玩家' : 'AI 主持'}。`,
    '请让游戏可以继续推进，回复不要太长，优先给出下一步可操作内容。',
    '禁止使用 emoji。',
    `[参与角色]\n${characterText}`,
    inventoryText ? `[背包道具]\n${inventoryText}` : '',
    `[当前记录]\n${history || '刚开始'}`,
    isOpening ? `[开局要求]\n${buildOpeningPrompt(activeSession.gameId)}` : `[用户输入]\n${userText}`
  ].filter(Boolean).join('\n\n');

  const response = await silentRequest({
    prompt,
    temperature: 0.82,
    maxTokens: 900
  });

  const finalText = response || getFallbackGameReply(activeSession.gameId);

  activeSession.messages = normalizeArray(activeSession.messages).map((item) => {
    if (item.id !== typing.id) return item;
    return {
      ...item,
      speakerId: speaker.id || item.speakerId || 'host',
      speakerName: speaker.name || item.speakerName || 'AI 主持',
      speakerAvatar: speaker.avatar || item.speakerAvatar || '',
      content: finalText,
      timestamp: getNow()
    };
  });

  activeSession.updatedAt = getNow();
  sessions = sessions.map((item) => item.id === activeSession.id ? activeSession : item);
  saveSessions();

  renderGenericGame(activeSession.gameId);
  await recordGameInteraction(speaker.id || selectedCharacters[0]?.id, finalText, getGameDisplayName(game.id));
}

function getNextAiSpeaker(selectedCharacters) {
  const members = normalizeArray(selectedCharacters);

  if (!members.length) {
    return { id: '', name: 'AI 主持', avatar: '' };
  }

  const state = activeSession.state || {};
  const index = Number(state.aiReplyIndex || 0);
  const speaker = members[index % members.length];

  activeSession.state = {
    ...state,
    aiReplyIndex: index + 1
  };

  return {
    id: speaker.id,
    name: speaker.name || 'AI',
    avatar: speaker.avatar || ''
  };
}

function buildOpeningPrompt(gameId) {
  if (gameId === 'werewolf') return '请分配身份但不要直接暴露全部身份，宣布夜晚第 1 轮开始，并告诉用户下一步能做什么。';
  if (gameId === 'undercover') return '请设置平民词和卧底词，安排第一轮发言顺序，但不要直接暴露卧底答案。';
  if (gameId === 'cards') return '请解释本局采用的简单扑克牌规则，并发起第一回合。';
  if (gameId === 'truth') return '请让用户点击转盘或直接指定对象，再给出真心话/大冒险选择。';
  if (gameId === 'tarot') return '请询问用户想问的问题，并提示选择单张、三张或十字牌阵。';
  if (gameId === 'match') return '请让用户选择 AI 猜用户想的，或用户猜 AI 想的，并开始第一步。';
  if (gameId === 'script') return '请生成一个简短案件开场，列出人物、地点和第一条线索。';
  return '请开始这一局。';
}

function getFallbackGameReply(gameId) {
  if (gameId === 'tarot') return '先把想问的问题放在心里。你可以选一张牌，我会顺着它慢慢解读。';
  if (gameId === 'truth') return '轮盘停下来了。选真心话还是大冒险？';
  if (gameId === 'match') return '我先给你第一条提示：它和日常有关，但不一定看得见。';
  return '这一局继续。你可以发言、选择行动，或者让我推进下一步。';
}

function createGameMessage(message) {
  const isUser = message.role === 'user';
  const row = el('article', `game-message ${isUser ? 'user' : 'assistant'}`);

  const avatar = el('div', 'game-message-avatar');

  if (message.speakerAvatar) {
    const img = document.createElement('img');
    img.src = message.speakerAvatar;
    img.alt = '';
    avatar.appendChild(img);
  } else {
    avatar.appendChild(createIcon(isUser ? 'star' : 'smile', 17));
  }

  const body = el('div', 'game-message-body');
  const name = el('div', 'game-message-name', message.speakerName || (isUser ? '我' : 'AI 主持'));
  const paper = el('div', 'game-message-paper');

  if (message.content === '正在想') {
    const dots = el('span', 'typing-dots');
    dots.append(el('span'), el('span'), el('span'));
    paper.appendChild(dots);
  } else {
    paper.textContent = message.content || '';
  }

  body.append(name, paper);

  if (isUser) row.append(body, avatar);
  else row.append(avatar, body);

  return row;
}

function scrollGameLog() {
  requestAnimationFrame(() => {
    const log = document.getElementById('game-log');
    if (log) log.scrollTo({ top: log.scrollHeight, behavior: 'smooth' });
  });
}

function getGamePhaseText() {
  if (!activeSession) return '';
  const phase = activeSession.state?.phase || '进行中';
  const round = activeSession.state?.round || 1;
  return `${phase} · 第 ${round} 轮`;
}

function getSessionCharacters() {
  if (!activeSession) return [];
  const ids = new Set(normalizeArray(activeSession.characterIds));
  return characters.filter((item) => ids.has(item.id));
}

function chooseBoardTarget(characterId) {
  if (!activeSession) return;

  activeSession.state = {
    ...(activeSession.state || {}),
    selected: characterId
  };
  activeSession.updatedAt = getNow();

  sessions = sessions.map((item) => item.id === activeSession.id ? activeSession : item);
  saveSessions();

  const character = characters.find((item) => item.id === characterId);
  showToast(character ? `已选择 ${character.name}` : '已选择');
}

function spinTruthWheel(wheel) {
  wheel.classList.remove('spinning');
  void wheel.offsetWidth;
  wheel.classList.add('spinning');

  window.setTimeout(() => {
    const members = getSessionCharacters();
    const selected = members[Math.floor(Math.random() * Math.max(1, members.length))];

    if (selected) chooseBoardTarget(selected.id);
    showToast(selected ? `转到了 ${selected.name}` : '转盘停下了');
  }, 1400);
}

function openScriptImport() {
  const sheet = el('div');
  sheet.append(
    el('div', 'sheet-title', '导入剧本'),
    el('div', 'sheet-description', '支持 {title, roles, clues, plot} 的 JSON。')
  );

  const file = document.createElement('input');
  file.type = 'file';
  file.accept = 'application/json';
  file.className = 'hidden';

  const pick = button('选择 JSON', 'primary', 'upload');
  pick.addEventListener('click', () => file.click());

  file.addEventListener('change', async () => {
    const item = file.files?.[0];
    if (!item || !activeSession) return;

    try {
      const data = JSON.parse(await item.text());

      activeSession.state = {
        ...(activeSession.state || {}),
        script: data
      };
      activeSession.updatedAt = getNow();

      sessions = sessions.map((session) => session.id === activeSession.id ? activeSession : session);
      saveSessions();

      hideBottomSheet();
      await sendGamePrompt(`我导入了剧本：${JSON.stringify(data).slice(0, 1800)}。请作为主持开始这个剧本杀。`);
    } catch (_) {
      showToast('剧本文件读不了');
    } finally {
      file.value = '';
    }
  });

  sheet.append(file, pick);
  showBottomSheet(sheet);
}

async function buildInventoryText() {
  const allItems = normalizeArray(getData('shop_items'));
  const owned = normalizeArray(await getAllDB('inventory'));

  return owned
    .filter((record) => Number(record.quantity) > 0)
    .map((record) => {
      const item = allItems.find((shopItem) => shopItem.id === record.itemId);
      const fallback = FALLBACK_ITEM_EFFECTS[record.itemId] || '';
      const name = item?.name || getFallbackItemName(record.itemId);
      const effect = item?.effect || item?.description || fallback;
      if (!effect) return '';
      return `${name} ×${record.quantity}：${effect}`;
    })
    .filter(Boolean)
    .join('\n');
}

function getFallbackItemName(itemId) {
  const map = {
    'item-pet-food': '宠物饲料',
    'item-dried-fish': '香香小鱼干',
    'item-toy-ball': '软软玩具球',
    'item-pet-bed': '月牙宠物窝',
    'item-clean-brush': '柔毛清洁刷',
    'item-energy-snack': '元气小零食',
    'item-tarot-wax': '塔罗蜡封卡',
    'item-script-clue': '剧本线索夹',
    'item-truth-pack': '真心话卡包',
    'item-werewolf-sleeve': '身份牌护套',
    'item-card-cloth': '绒面牌桌布',
    'item-match-ticket': '灵感提示券'
  };

  return map[itemId] || itemId || '道具';
}

async function recordGameInteraction(characterId, content, source) {
  if (!characterId || !content) return;

  try {
    const module = await import('./chat.js');
    if (typeof module.recordExternalInteraction === 'function') {
      await module.recordExternalInteraction({
        characterId,
        role: 'assistant',
        content,
        source: `小游戏-${source}`
      });
    }
  } catch (_) {
    /* silent */
  }
}

/* pet */

async function openPetGame() {
  currentView = 'pet';
  currentGameId = 'pet';
  petData = await loadPet();
  await applyGameBackground('pet');
  await giveDailyRewardIfNeeded();
  renderPetGame();
}

function renderPetGame() {
  const tools = el('div', 'nav-tool-group');

  const imageBtn = iconButton('image', '图片内容');
  imageBtn.addEventListener('click', () => openImageContentSheet('pet'));

  const petBtn = createPetSettingsButton();

  tools.append(imageBtn, petBtn);

  const body = renderShell('云养宠', `${petData.name} 在这里等你`, tools);

  const wrap = el('section', 'pet-page');

  const stage = el('div', 'pet-stage');

  const bubble = el('div', 'pet-speech');
  bubble.id = 'pet-speech';
  bubble.textContent = getPetIdleText();

  const pet = el('div', `pet-creature pet-${petData.type}`);
  pet.style.setProperty('--pet-color', petData.color);

  if (petData.useCustomGif && getCurrentPetGif()) {
    const img = document.createElement('img');
    img.src = getCurrentPetGif();
    img.alt = '';
    pet.classList.add('custom-gif');
    pet.appendChild(img);
  } else {
    pet.appendChild(createPetSvg(petData.type));
  }

  const petName = el('div', 'pet-stage-name', petData.name);

  stage.append(bubble, pet, petName);

  const stats = el('div', 'pet-stats');
  stats.append(
    createPetStat('饥饿度', petData.hunger),
    createPetStat('心情', petData.mood),
    createPetStat('亲密度', petData.affection)
  );

  const actions = el('div', 'pet-actions');

  const feed = button('喂食', 'ghost', 'add');
  feed.addEventListener('click', () => interactPet('feed'));

  const play = button('玩耍', 'ghost', 'play');
  play.addEventListener('click', () => interactPet('play'));

  const touch = button('抚摸', 'ghost', 'heart');
  touch.addEventListener('click', () => interactPet('touch'));

  const talk = button('说句话', 'primary', 'send');
  talk.addEventListener('click', petTalk);

  actions.append(feed, play, touch, talk);

  const note = el('div', 'pet-note', getPetCareNote());

  wrap.append(stage, stats, actions, note);
  body.appendChild(wrap);
}

function createPetSettingsButton() {
  const item = iconButton('settings', '宠物设置');
  item.addEventListener('click', openPetSettings);
  return item;
}

function createPetStat(label, value) {
  const item = el('div', 'pet-stat');

  const top = el('div', 'pet-stat-top');
  top.append(el('span', '', label), el('span', '', `${Math.round(value)}%`));

  const dots = el('div', 'pet-stat-dots');
  const activeCount = Math.max(1, Math.ceil(clamp(value, 0, 100) / 20));

  for (let i = 0; i < 5; i += 1) {
    const dot = el('span', i < activeCount ? 'active' : '');
    dots.appendChild(dot);
  }

  item.append(top, dots);
  return item;
}

async function interactPet(type) {
  if (!petData) return;

  const itemMap = {
    feed: ['item-pet-food', 'item-dried-fish', 'item-energy-snack'],
    play: ['item-toy-ball', 'item-lucky-bell'],
    touch: ['item-clean-brush', 'item-soft-blanket']
  };

  const used = await consumeFirstOwnedItem(itemMap[type] || []);

  if (type === 'feed') {
    petData.hunger = clamp(petData.hunger + (used ? 28 : 16), 0, 100);
    petData.mood = clamp(petData.mood + 4, 0, 100);
    petData.lastFed = getNow();
    sayPet(used ? '这个好香，我有精神啦。' : '吃到一点点，也很开心。');
  }

  if (type === 'play') {
    petData.mood = clamp(petData.mood + (used ? 26 : 14), 0, 100);
    petData.affection = clamp(petData.affection + 8, 0, 100);
    petData.lastInteract = getNow();
    sayPet(used ? '再玩一次好不好。' : '你陪我玩，我就很开心。');
  }

  if (type === 'touch') {
    petData.mood = clamp(petData.mood + 12, 0, 100);
    petData.affection = clamp(petData.affection + (used ? 14 : 9), 0, 100);
    petData.lastInteract = getNow();
    sayPet(used ? '被轻轻梳顺了。' : '这里，再摸一下。');
  }

  await savePet(petData);
  renderPetGame();
}

async function consumeFirstOwnedItem(itemIds) {
  const all = await getAllDB('inventory');
  const target = all.find((record) => itemIds.includes(record.itemId) && Number(record.quantity) > 0);

  if (!target) return false;

  const nextQuantity = Number(target.quantity || 0) - 1;

  if (nextQuantity <= 0) {
    await deleteDB('inventory', target.id);
  } else {
    await setDB('inventory', target.id, {
      ...target,
      quantity: nextQuantity,
      updatedAt: getNow()
    });
  }

  inventory = await getAllDB('inventory');
  return true;
}

async function petTalk() {
  if (!petData) return;

  const prompt = [
    '你是一只小宠物，请根据状态说一句很短的话。',
    `名字：${petData.name}`,
    `类型：${getPetTypeLabel(petData.type)}`,
    `饥饿度：${petData.hunger}`,
    `心情：${petData.mood}`,
    `亲密度：${petData.affection}`,
    '要求：不要使用 emoji，不要超过 32 个字，语气可爱但不要幼稚。'
  ].join('\n');

  sayPet('我想一下。');

  const text = await silentRequest({
    prompt,
    temperature: 0.8,
    maxTokens: 80
  });

  const final = text || getPetIdleText();
  sayPet(final);
  await recordPetToChat(final);
}

async function recordPetToChat(content) {
  const character = characters[0];
  if (!character) return;

  await recordGameInteraction(character.id, `${petData.name}：${content}`, '云养宠');
}

function sayPet(text) {
  const bubble = document.getElementById('pet-speech');
  if (bubble) bubble.textContent = text;

  clearPetSayTimer();
  petSayTimer = window.setTimeout(() => {
    const next = document.getElementById('pet-speech');
    if (next) next.textContent = getPetIdleText();
  }, 5000);
}

function clearPetSayTimer() {
  if (petSayTimer) {
    window.clearTimeout(petSayTimer);
    petSayTimer = null;
  }
}

function getPetIdleText() {
  if (!petData) return '我在这里。';
  if (petData.hunger < PET_LOW_LIMIT) return '肚子有点空。';
  if (petData.mood < PET_LOW_LIMIT) return '想被陪一会儿。';
  if (petData.affection > 80) return '我最喜欢你靠近我。';
  return '今天也在等你。';
}

function getPetCareNote() {
  if (petData.hunger < PET_LOW_LIMIT || petData.mood < PET_LOW_LIMIT) {
    return '状态有点低，桌面游戏图标会出现提醒。';
  }

  return '数值会在打开时按时间慢慢变化，不需要后台运行。';
}

function getCurrentPetGif() {
  if (!petData?.useCustomGif) return '';
  if (petData.mood < 35) return petData.gifs.sleep || petData.gifs.normal || '';
  if (petData.mood > 72) return petData.gifs.happy || petData.gifs.normal || '';
  return petData.gifs.normal || '';
}

async function giveDailyRewardIfNeeded() {
  const today = new Date().toISOString().slice(0, 10);
  if (getData(DAILY_REWARD_KEY) === today) return;

  setData(DAILY_REWARD_KEY, today);

  const reward = {
    id: generateId(),
    itemId: 'item-pet-food',
    quantity: 1,
    purchasedAt: getNow()
  };

  await setDB('inventory', reward.id, reward);
  showToast('今天送你一份宠物饲料');
}

function updateGamesBadgeByPet() {
  const needs = petData && (petData.hunger < PET_LOW_LIMIT || petData.mood < PET_LOW_LIMIT);
  const unread = getData(GAMES_BADGE_KEY) || {};
  unread.games = needs ? 1 : 0;
  setData(GAMES_BADGE_KEY, unread);
  window.AppEvents?.emit?.('badge:games', unread.games);
}

function openPetSettings() {
  const draft = JSON.parse(JSON.stringify(petData || DEFAULT_PET));

  const sheet = el('div');
  sheet.append(
    el('div', 'sheet-title', '宠物小资料'),
    el('div', 'sheet-description', '颜色、名字和 GIF 都只保存在你的浏览器里。')
  );

  const name = input('名字', draft.name);

  const typeSelect = document.createElement('select');
  typeSelect.className = 'input-card';

  [
    ['cat', '猫'],
    ['dog', '狗'],
    ['rabbit', '兔'],
    ['fantasy', '异世界小生物']
  ].forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    option.selected = draft.type === value;
    typeSelect.appendChild(option);
  });

  const color = document.createElement('input');
  color.type = 'color';
  color.className = 'input-card';
  color.value = normalizeColorValue(draft.color || '#D4956A');

  const gifSwitch = switchButton(draft.useCustomGif, (active) => {
    draft.useCustomGif = active;
  });

  const gifRow = el('div', 'pet-gif-row');
  gifRow.append(
    createGifPicker('normal', '日常 GIF', draft),
    createGifPicker('happy', '开心 GIF', draft),
    createGifPicker('sleep', '困困 GIF', draft)
  );

  const imageContent = button('打开图片内容', 'ghost', 'image');
  imageContent.addEventListener('click', () => {
    hideBottomSheet();
    openImageContentSheet('pet');
  });

  const save = button('保存宠物', 'primary', 'check');
  save.addEventListener('click', async () => {
    draft.name = name.value.trim() || DEFAULT_PET.name;
    draft.type = typeSelect.value;
    draft.color = color.value;
    await savePet(draft);
    hideBottomSheet();
    renderPetGame();
    showToast('宠物资料收好啦');
  });

  sheet.append(
    field('名字', name),
    field('类型', typeSelect),
    field('颜色', color),
    customRow('使用 GIF', gifSwitch),
    gifRow,
    imageContent,
    save
  );

  showBottomSheet(sheet);
}

function createGifPicker(key, label, draft) {
  const box = el('div', 'gif-picker');

  const pick = button(label, 'ghost', 'upload');
  const inputEl = document.createElement('input');
  inputEl.type = 'file';
  inputEl.accept = 'image/gif,image/*';
  inputEl.className = 'hidden';

  pick.addEventListener('click', () => inputEl.click());

  inputEl.addEventListener('change', async () => {
    const file = inputEl.files?.[0];
    if (!file) return;

    try {
      draft.gifs[key] = await fileToDataUrl(file);
      showToast('GIF 已选择');
    } catch (_) {
      showToast('文件没有处理好');
    } finally {
      inputEl.value = '';
    }
  });

  box.append(pick, inputEl);
  return box;
}
function createHeroSvg() {
  const svg = createSvg('0 0 120 120', 92);
  svg.classList.add('hero-svg');

  const shelf = svgEl('path', {
    d: 'M24 82c8 10 22 16 36 16s28-6 36-16'
  });

  const moon = svgEl('path', {
    d: 'M78 22c-8 4-12 13-9 22 3 10 13 16 23 14-5 9-15 15-27 15-17 0-31-14-31-31 0-11 6-21 15-26 7-4 16-4 29 6z'
  });

  const card1 = svgEl('rect', {
    x: '25',
    y: '44',
    width: '24',
    height: '32',
    rx: '8'
  });

  const card2 = svgEl('rect', {
    x: '54',
    y: '36',
    width: '24',
    height: '40',
    rx: '8'
  });

  const star = svgEl('path', {
    d: 'M88 45l4 8 8 2-7 5 1 9-6-5-8 4 3-8-6-6 8-1 3-8z'
  });

  svg.append(shelf, moon, card1, card2, star);
  return svg;
}

function createGameSvg(gameId, size = 48) {
  if (gameId === 'werewolf') return createWolfSvg(size);
  if (gameId === 'undercover') return createMaskSvg(size);
  if (gameId === 'cards') return createCardsSvg(size);
  if (gameId === 'truth') return createWheelMiniSvg(size);
  if (gameId === 'tarot') return createTarotMiniSvg(size);
  if (gameId === 'match') return createPuzzleSvg(size);
  if (gameId === 'script') return createClueSvg(size);
  if (gameId === 'pet') return createPetMiniSvg(size);
  return createCardsSvg(size);
}

function createWolfSvg(size = 48) {
  const svg = createSvg('0 0 64 64', size);
  svg.append(
    svgEl('path', { d: 'M16 25l8-12 8 10 8-10 8 12v14c0 11-7 19-16 19s-16-8-16-19V25z' }),
    svgEl('path', { d: 'M24 35h.2M40 35h.2' }),
    svgEl('path', { d: 'M28 45c2 2 6 2 8 0' }),
    svgEl('path', { d: 'M22 26c6-3 14-3 20 0' })
  );
  return svg;
}

function createMaskSvg(size = 48) {
  const svg = createSvg('0 0 64 64', size);
  svg.append(
    svgEl('path', { d: 'M12 26c12-8 28-8 40 0v9c0 11-8 19-20 19S12 46 12 35v-9z' }),
    svgEl('path', { d: 'M22 35c3-2 6-2 9 0M33 35c3-2 6-2 9 0' }),
    svgEl('path', { d: 'M25 43c4 4 10 4 14 0' }),
    svgEl('path', { d: 'M20 22v-7M44 22v-7' })
  );
  return svg;
}

function createCardsSvg(size = 48) {
  const svg = createSvg('0 0 64 64', size);
  svg.append(
    svgEl('rect', { x: '18', y: '12', width: '28', height: '40', rx: '8', transform: 'rotate(-8 32 32)' }),
    svgEl('rect', { x: '24', y: '14', width: '28', height: '40', rx: '8', transform: 'rotate(8 38 34)' }),
    svgEl('path', { d: 'M34 27l4-5 4 5-4 5-4-5z' })
  );
  return svg;
}

function createWheelMiniSvg(size = 48) {
  const svg = createSvg('0 0 64 64', size);
  svg.append(
    svgEl('circle', { cx: '32', cy: '32', r: '22' }),
    svgEl('path', { d: 'M32 10v44M10 32h44M17 17l30 30M47 17L17 47' }),
    svgEl('circle', { cx: '32', cy: '32', r: '5' })
  );
  return svg;
}

function createTarotMiniSvg(size = 48) {
  const svg = createSvg('0 0 64 64', size);
  svg.append(
    svgEl('rect', { x: '19', y: '10', width: '26', height: '44', rx: '8' }),
    svgEl('path', { d: 'M32 20l4 8 8 2-7 6 2 8-7-4-7 4 2-8-7-6 8-2 4-8z' })
  );
  return svg;
}

function createPuzzleSvg(size = 48) {
  const svg = createSvg('0 0 64 64', size);
  svg.append(
    svgEl('path', { d: 'M19 16h14v9c0 3 2 5 5 5s5-2 5-5v-9h2c5 0 8 3 8 8v8h-9c-3 0-5 2-5 5s2 5 5 5h9v2c0 5-3 8-8 8H19c-5 0-8-3-8-8V24c0-5 3-8 8-8z' })
  );
  return svg;
}

function createClueSvg(size = 48) {
  const svg = createSvg('0 0 64 64', size);
  svg.append(
    svgEl('path', { d: 'M20 10h20l10 10v34H20V10z' }),
    svgEl('path', { d: 'M40 10v12h10' }),
    svgEl('path', { d: 'M26 31h16M26 39h14M26 47h10' }),
    svgEl('circle', { cx: '43', cy: '42', r: '5' }),
    svgEl('path', { d: 'M47 46l6 6' })
  );
  return svg;
}

function createPetMiniSvg(size = 48) {
  const svg = createSvg('0 0 64 64', size);
  svg.append(
    svgEl('path', { d: 'M18 29c0-11 7-18 14-18s14 7 14 18v9c0 10-6 16-14 16s-14-6-14-16v-9z' }),
    svgEl('path', { d: 'M22 20l-8-8v16M42 20l8-8v16' }),
    svgEl('path', { d: 'M27 35h.2M37 35h.2' }),
    svgEl('path', { d: 'M29 43c2 2 4 2 6 0' })
  );
  return svg;
}

function createTruthWheelSvg() {
  const svg = createSvg('0 0 120 120', 104);
  svg.append(
    svgEl('circle', { cx: '60', cy: '60', r: '46' }),
    svgEl('circle', { cx: '60', cy: '60', r: '8' }),
    svgEl('path', { d: 'M60 14v92M14 60h92M27 27l66 66M93 27L27 93' }),
    svgEl('path', { d: 'M60 20l6 14-6 10-6-10 6-14z' })
  );
  return svg;
}

function createTarotCardSvg() {
  const svg = createSvg('0 0 64 92', 48);
  svg.append(
    svgEl('rect', { x: '8', y: '8', width: '48', height: '76', rx: '12' }),
    svgEl('path', { d: 'M32 26l5 10 11 2-8 8 2 11-10-5-10 5 2-11-8-8 11-2 5-10z' }),
    svgEl('path', { d: 'M22 68h20' })
  );
  return svg;
}

function createPetSvg(type) {
  const svg = createSvg('0 0 160 160', 180);
  svg.classList.add('pet-svg');

  if (type === 'dog') {
    svg.append(
      svgEl('path', { d: 'M42 66c2-32 20-44 38-44s36 12 38 44v22c0 30-16 48-38 48S42 118 42 88V66z' }),
      svgEl('path', { d: 'M45 62c-14 2-23 11-24 25 14 1 24-6 26-20M115 62c14 2 23 11 24 25-14 1-24-6-26-20' }),
      svgEl('path', { d: 'M66 78h.2M94 78h.2' }),
      svgEl('path', { d: 'M76 94c3 3 5 3 8 0' }),
      svgEl('path', { d: 'M69 108c7 5 15 5 22 0' })
    );
    return svg;
  }

  if (type === 'rabbit') {
    svg.append(
      svgEl('path', { d: 'M55 62c2-24 12-36 25-36s23 12 25 36v28c0 28-10 46-25 46S55 118 55 90V62z' }),
      svgEl('path', { d: 'M62 42C56 18 56 5 67 5c8 0 11 15 10 35M98 42c6-24 6-37-5-37-8 0-11 15-10 35' }),
      svgEl('path', { d: 'M70 82h.2M90 82h.2' }),
      svgEl('path', { d: 'M77 98c2 2 4 2 6 0' }),
      svgEl('path', { d: 'M72 112c5 4 11 4 16 0' })
    );
    return svg;
  }

  if (type === 'fantasy') {
    svg.append(
      svgEl('path', { d: 'M42 70c0-26 18-45 38-45s38 19 38 45v20c0 27-16 46-38 46S42 117 42 90V70z' }),
      svgEl('path', { d: 'M56 42l-14-22 24 10M104 42l14-22-24 10' }),
      svgEl('path', { d: 'M66 80h.2M94 80h.2' }),
      svgEl('path', { d: 'M72 100c5 5 11 5 16 0' }),
      svgEl('path', { d: 'M80 18v-8M62 24l-5-7M98 24l5-7' })
    );
    return svg;
  }

  svg.append(
    svgEl('path', { d: 'M44 64c2-28 18-42 36-42s34 14 36 42v24c0 30-15 48-36 48S44 118 44 88V64z' }),
    svgEl('path', { d: 'M52 52L34 28v37M108 52l18-24v37' }),
    svgEl('path', { d: 'M66 80h.2M94 80h.2' }),
    svgEl('path', { d: 'M75 96c3 3 7 3 10 0' }),
    svgEl('path', { d: 'M70 110c7 5 13 5 20 0' })
  );

  return svg;
}

function createMiniAvatar(character) {
  const avatar = el('span', 'mini-avatar');

  if (character?.avatar) {
    const img = document.createElement('img');
    img.src = character.avatar;
    img.alt = '';
    avatar.appendChild(img);
  } else {
    avatar.appendChild(createIcon('smile', 17));
  }

  return avatar;
}

function getPetTypeLabel(type) {
  if (type === 'dog') return '狗';
  if (type === 'rabbit') return '兔';
  if (type === 'fantasy') return '异世界小生物';
  return '猫';
}

function createSvg(viewBox, size) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  return svg;
}

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);

  Object.entries(attrs).forEach(([key, value]) => {
    node.setAttribute(key, String(value));
  });

  return node;
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

function button(text, variant = 'ghost', icon = '') {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = variant === 'primary' ? 'btn-primary games-btn' : 'btn-ghost games-btn';

  if (icon) item.appendChild(createIcon(icon, 17));
  item.appendChild(document.createTextNode(text));

  return item;
}

function iconButton(icon, label) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'icon-button';
  item.setAttribute('aria-label', label || icon);
  item.title = label || icon;
  item.appendChild(createIcon(icon, 19));
  return item;
}

function input(placeholder = '', value = '', type = 'text') {
  const item = document.createElement('input');
  item.className = 'input-card';
  item.type = type;
  item.placeholder = placeholder;
  item.value = value ?? '';
  return item;
}

function field(label, control) {
  const wrap = el('label', 'form-row');
  wrap.append(el('span', '', label), control);
  return wrap;
}

function customRow(label, control) {
  const row = el('div', 'custom-row');
  row.append(el('span', '', label), control);
  return row;
}

function switchButton(initial, onChange) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = `switch-control ${initial ? 'active' : ''}`;
  item.setAttribute('aria-pressed', initial ? 'true' : 'false');

  const knob = el('span', 'switch-knob');
  item.appendChild(knob);

  item.addEventListener('click', () => {
    const active = !item.classList.contains('active');
    item.classList.toggle('active', active);
    item.setAttribute('aria-pressed', active ? 'true' : 'false');
    onChange?.(active);
  });

  return item;
}

function toggleId(list, id, active) {
  const next = new Set(normalizeArray(list));
  if (active) next.add(id);
  else next.delete(id);
  return [...next];
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function clamp(value, min, max) {
  const number = Number(value);
  if (Number.isNaN(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function formatTime(value) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();

  if (sameDay) {
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  return date.toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit'
  });
}

function readCssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function normalizeColorValue(value) {
  const text = String(value || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(text)) return text;
  if (/^#[0-9a-f]{3}$/i.test(text)) {
    return `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`;
  }
  return '#D4956A';
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('file read failed'));

    reader.readAsDataURL(file);
  });
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .games-screen {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      background: var(--bg-primary);
      color: var(--text-primary);
      font-family: var(--font-main);
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
    }

    .games-screen.has-bg {
      background-color: var(--bg-primary);
    }

    .games-soft-layer {
      position: absolute;
      inset: 0;
      pointer-events: none;
      background: color-mix(in srgb, var(--bg-primary) 78%, transparent);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
    }

    .games-nav {
      position: relative;
      z-index: 2;
      flex: 0 0 auto;
      display: grid;
      grid-template-columns: 42px minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--spacing-sm);
      padding: 14px 20px 10px;
    }

    .games-nav-titlebox {
      min-width: 0;
      text-align: center;
    }

    .games-nav-title {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .games-nav-subtitle {
      margin-top: 2px;
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1.35;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .games-body {
      position: relative;
      z-index: 2;
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 8px 20px 24px;
      display: flex;
      flex-direction: column;
      gap: var(--spacing-lg);
      -webkit-overflow-scrolling: touch;
    }

    .icon-button {
      width: 40px;
      height: 40px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 16px;
      background: color-mix(in srgb, var(--bg-card) 88%, transparent);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      transition: var(--motion);
    }

    .icon-button:active,
    .games-btn:active,
    .game-card:active,
    .session-card:active,
    .image-content-item:active,
    .mode-card:active,
    .character-chip:active {
      transform: scale(0.96);
    }

    .games-btn {
      min-height: 42px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      white-space: nowrap;
    }

    .wide-btn {
      width: 100%;
    }

    .hidden {
      display: none !important;
    }

    .games-kicker {
      color: var(--accent-dark);
      font-size: 12px;
      font-weight: 600;
      line-height: 1.35;
    }

    .games-featured {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 104px;
      gap: var(--spacing-md);
      align-items: stretch;
      padding: var(--spacing-lg);
      border-radius: 30px;
      background: color-mix(in srgb, var(--bg-card) 88%, transparent);
      box-shadow: var(--shadow-sm);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
    }

    .games-featured-main {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 9px;
    }

    .games-featured-title {
      color: var(--text-primary);
      font-size: 22px;
      font-weight: 600;
      line-height: 1.25;
      letter-spacing: -0.02em;
    }

    .games-featured-desc {
      color: var(--text-secondary);
      font-size: var(--font-size-base);
      line-height: 1.6;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .games-featured-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 7px;
      margin-top: auto;
    }

    .games-info-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 6px 9px;
      border-radius: 999px;
      background: var(--surface-muted);
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1.25;
    }

    .games-info-pill strong {
      color: var(--text-primary);
      font-weight: 600;
    }

    .games-featured-art {
      min-width: 0;
      min-height: 120px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 26px;
      background: var(--accent-light);
      color: var(--accent-dark);
      box-shadow: var(--shadow-sm);
    }

    .games-section-head {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: var(--spacing-md);
      margin-bottom: var(--spacing-sm);
      padding: 0 2px;
    }

    .games-section-title {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
    }

    .games-section-note {
      color: var(--text-hint);
      font-size: 12px;
      line-height: 1.35;
      white-space: nowrap;
    }

    .game-rail {
      display: flex;
      gap: var(--spacing-md);
      overflow-x: auto;
      padding: 2px 2px 8px;
      scroll-snap-type: x mandatory;
    }

    .game-rail::-webkit-scrollbar,
    .games-body::-webkit-scrollbar,
    .game-log::-webkit-scrollbar {
      display: none;
    }

    .game-rail,
    .games-body,
    .game-log {
      scrollbar-width: none;
      -ms-overflow-style: none;
    }

    .game-card {
      flex: 0 0 220px;
      min-height: 248px;
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
      padding: 14px;
      border-radius: 28px;
      background: color-mix(in srgb, var(--bg-card) 90%, transparent);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      text-align: left;
      scroll-snap-align: start;
      transition: var(--motion);
    }

    .game-art {
      height: 108px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border-radius: 24px;
      background: var(--surface-muted);
      color: var(--accent-dark);
    }

    .game-card-text {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .game-card-title {
      color: var(--text-primary);
      font-size: 18px;
      font-weight: 600;
      line-height: 1.35;
    }

    .game-card-desc {
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.55;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .game-card-meta {
      margin-top: auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-sm);
      color: var(--text-hint);
      font-size: 12px;
      line-height: 1.35;
    }

    .games-recent-list,
    .session-list {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
    }

    .session-card {
      width: 100%;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 4px var(--spacing-md);
      padding: 13px 14px;
      border-radius: 20px;
      background: color-mix(in srgb, var(--bg-card) 88%, transparent);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      text-align: left;
    }

    .session-card-title {
      color: var(--text-primary);
      font-size: var(--font-size-base);
      font-weight: 600;
      line-height: 1.35;
    }

    .session-card-text {
      grid-column: 1 / -1;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.45;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .session-card-time {
      color: var(--text-hint);
      font-size: 12px;
      line-height: 1.35;
      white-space: nowrap;
    }

    .game-setup-cover,
    .game-start-panel,
    .game-section,
    .game-talk-panel,
    .game-board,
    .pet-page {
      border-radius: 30px;
      background: color-mix(in srgb, var(--bg-card) 88%, transparent);
      box-shadow: var(--shadow-sm);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
    }

    .game-setup-cover {
      display: grid;
      grid-template-columns: 94px minmax(0, 1fr);
      gap: var(--spacing-md);
      align-items: center;
      padding: var(--spacing-lg);
    }

    .game-setup-art {
      width: 94px;
      height: 94px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border-radius: 26px;
      background: var(--surface-muted);
      color: var(--accent-dark);
      box-shadow: var(--shadow-sm);
    }

    .game-setup-copy {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 7px;
    }

    .game-setup-title {
      color: var(--text-primary);
      font-size: 22px;
      font-weight: 600;
      line-height: 1.25;
    }

    .game-setup-desc {
      color: var(--text-secondary);
      font-size: var(--font-size-base);
      line-height: 1.6;
    }

    .game-start-panel,
    .game-section {
      padding: var(--spacing-lg);
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
    }

    .setup-block {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
    }

    .setup-block.compact {
      padding: 0;
      background: transparent;
      box-shadow: none;
    }

    .setup-block-title {
      color: var(--text-primary);
      font-size: var(--font-size-base);
      font-weight: 600;
      line-height: 1.35;
    }

    .setup-block-desc {
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.55;
    }

    .mode-card-row {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--spacing-sm);
    }

    .mode-card {
      min-height: 88px;
      padding: 13px;
      border-radius: 20px;
      background: var(--surface-muted);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      text-align: left;
      transition: var(--motion);
    }

    .mode-card.active {
      background: var(--accent-light);
      color: var(--accent-dark);
    }

    .mode-card-title {
      font-size: var(--font-size-base);
      font-weight: 600;
      line-height: 1.35;
    }

    .mode-card-desc {
      margin-top: 5px;
      font-size: 12px;
      line-height: 1.45;
      color: currentColor;
      opacity: .76;
    }

    .picked-character-preview {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
    }

    .picked-avatar-row {
      display: flex;
      align-items: center;
      gap: 8px;
      overflow-x: auto;
      padding-bottom: 2px;
    }

    .picked-character-text {
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.45;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .mini-avatar,
    .character-chip-avatar {
      width: 34px;
      height: 34px;
      flex: 0 0 34px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border-radius: 14px;
      background: var(--bg-card);
      color: var(--accent-dark);
      box-shadow: var(--shadow-sm);
    }

    .mini-avatar img,
    .character-chip-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .game-fold-panel {
      padding: 12px 14px;
      border-radius: 22px;
      background: var(--surface-muted);
      box-shadow: var(--shadow-sm);
    }

    .game-fold-panel summary {
      cursor: pointer;
      list-style: none;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-sm);
      color: var(--text-primary);
      font-size: var(--font-size-base);
      font-weight: 600;
      line-height: 1.35;
    }

    .game-fold-panel summary::-webkit-details-marker {
      display: none;
    }

    .game-fold-content {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
      margin-top: var(--spacing-md);
    }

    .character-chip-list {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-sm);
    }

    .character-chip {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      max-width: 100%;
      padding: 7px 10px 7px 7px;
      border-radius: 999px;
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      font-size: var(--font-size-small);
      line-height: 1.35;
      transition: var(--motion);
    }

    .character-chip.active {
      background: var(--accent-light);
      color: var(--accent-dark);
    }

    .theme-row {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
    }

    .theme-color-input {
      width: 54px;
      height: 42px;
      padding: 6px;
      border-radius: 16px;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
    }

    .form-row,
    .custom-row {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin: 12px 0;
      color: var(--text-primary);
      font-size: var(--font-size-small);
      line-height: 1.45;
    }

    .custom-row {
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-md);
      padding: 12px 14px;
      border-radius: 18px;
      background: var(--surface-muted);
      box-shadow: var(--shadow-sm);
    }

    .switch-control {
      width: 48px;
      height: 28px;
      padding: 3px;
      border-radius: 999px;
      background: var(--surface-muted);
      box-shadow: var(--shadow-sm);
      transition: var(--motion);
    }

    .switch-control.active {
      background: var(--accent-light);
    }

    .switch-knob {
      width: 22px;
      height: 22px;
      display: block;
      border-radius: 999px;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      transition: var(--motion);
    }

    .switch-control.active .switch-knob {
      transform: translateX(20px);
      background: var(--accent);
    }
  `;

  document.head.appendChild(style);

  if (typeof injectMoreStyles === 'function') {
    injectMoreStyles();
  }
}
function injectMoreStyles() {
  const style = document.getElementById(STYLE_ID);
  if (!style) return;

  style.textContent += `
    .game-play {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
      min-height: calc(100vh - 160px);
    }

    .game-scene {
      position: relative;
      min-height: 214px;
      border-radius: 32px;
      overflow: hidden;
    }

    .game-board {
      min-height: 214px;
      padding: var(--spacing-lg);
      overflow: hidden;
    }

    .board-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--spacing-md);
      margin-bottom: var(--spacing-md);
    }

    .board-title {
      color: var(--text-primary);
      font-size: 18px;
      font-weight: 600;
      line-height: 1.35;
      letter-spacing: -0.01em;
    }

    .board-subtitle {
      margin-top: 4px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.55;
    }

    .round-table {
      position: relative;
      min-height: 220px;
      border-radius: 30px;
      background: var(--surface-muted);
      box-shadow: var(--shadow-sm);
      overflow: hidden;
    }

    .round-table::before {
      content: "";
      position: absolute;
      left: 50%;
      top: 50%;
      width: 112px;
      height: 112px;
      border-radius: 999px;
      transform: translate(-50%, -50%);
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
    }

    .round-seat {
      position: absolute;
      width: 82px;
      min-height: 76px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 5px;
      padding: 7px;
      border-radius: 22px;
      background: color-mix(in srgb, var(--bg-card) 92%, transparent);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      text-align: center;
      transition: var(--motion);
    }

    .round-seat:active {
      transform: scale(0.96);
    }

    .seat-0 {
      left: 50%;
      top: 8px;
      transform: translateX(-50%);
    }

    .seat-1 {
      right: 12px;
      top: 38px;
    }

    .seat-2 {
      right: 14px;
      bottom: 38px;
    }

    .seat-3 {
      left: 50%;
      bottom: 8px;
      transform: translateX(-50%);
    }

    .seat-4 {
      left: 14px;
      bottom: 38px;
    }

    .seat-5 {
      left: 12px;
      top: 38px;
    }

    .seat-6 {
      left: 24px;
      top: 50%;
      transform: translateY(-50%);
    }

    .seat-7 {
      right: 24px;
      top: 50%;
      transform: translateY(-50%);
    }

    .seat-name,
    .word-card-name {
      max-width: 100%;
      color: var(--text-primary);
      font-size: 12px;
      font-weight: 600;
      line-height: 1.3;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .seat-role-back,
    .word-card-hidden {
      padding: 4px 9px;
      border-radius: 999px;
      background: var(--surface-muted);
      color: var(--text-secondary);
      font-size: 11px;
      line-height: 1.3;
    }

    .word-card-row {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--spacing-sm);
      margin-top: var(--spacing-md);
    }

    .word-card {
      min-height: 128px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--spacing-sm);
      padding: var(--spacing-md);
      border-radius: 24px;
      background: var(--surface-muted);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      text-align: center;
      transition: var(--motion);
    }

    .word-card:active {
      transform: scale(0.96);
    }

    .card-table {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--spacing-md);
      margin: var(--spacing-md) 0;
    }

    .card-pile,
    .play-area {
      min-height: 118px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 26px;
      background: var(--surface-muted);
      color: var(--text-secondary);
      box-shadow: var(--shadow-sm);
      font-size: var(--font-size-small);
    }

    .hand-row {
      display: flex;
      gap: var(--spacing-sm);
      overflow-x: auto;
      padding: 4px 2px 8px;
    }

    .hand-row::-webkit-scrollbar,
    .tarot-spread::-webkit-scrollbar,
    .picked-avatar-row::-webkit-scrollbar {
      display: none;
    }

    .hand-row,
    .tarot-spread,
    .picked-avatar-row {
      scrollbar-width: none;
      -ms-overflow-style: none;
    }

    .paper-card {
      width: 58px;
      height: 82px;
      flex: 0 0 58px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 18px;
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      font-size: 22px;
      font-weight: 600;
      transition: var(--motion);
    }

    .paper-card:active {
      transform: translateY(2px) scale(0.96);
    }

    .truth-board,
    .tarot-board,
    .match-board,
    .script-board {
      text-align: center;
    }

    .truth-wheel {
      width: 156px;
      height: 156px;
      margin: 18px auto;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      color: var(--accent-dark);
      background: var(--accent-light);
      box-shadow: var(--shadow-sm);
      transition: var(--motion);
    }

    .truth-wheel.spinning {
      animation: truth-spin 1400ms cubic-bezier(.22,.74,.22,1) both;
    }

    @keyframes truth-spin {
      from {
        transform: rotate(0);
      }
      to {
        transform: rotate(980deg);
      }
    }

    .truth-actions,
    .match-actions,
    .script-actions,
    .tarot-modes {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-sm);
      justify-content: center;
      margin-top: var(--spacing-md);
    }

    .tarot-spread {
      display: flex;
      justify-content: flex-start;
      gap: var(--spacing-sm);
      overflow-x: auto;
      padding: var(--spacing-md) 2px 4px;
    }

    .tarot-card {
      width: 64px;
      height: 94px;
      flex: 0 0 64px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 18px;
      color: var(--accent-dark);
      background: var(--accent-light);
      box-shadow: var(--shadow-sm);
      transform-style: preserve-3d;
      transition: var(--motion);
    }

    .tarot-card.revealed {
      background: var(--bg-card);
      color: var(--text-primary);
      transform: rotateY(180deg);
    }

    .guess-progress {
      position: relative;
      height: 44px;
      overflow: hidden;
      margin: var(--spacing-md) 0;
      border-radius: 999px;
      background: var(--surface-muted);
      box-shadow: var(--shadow-sm);
    }

    .guess-progress-fill {
      width: 62%;
      height: 100%;
      border-radius: inherit;
      background: var(--accent-light);
    }

    .guess-progress-text {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--accent-dark);
      font-size: var(--font-size-small);
      font-weight: 600;
    }

    .clue-panel {
      margin-top: var(--spacing-md);
      padding: var(--spacing-md);
      border-radius: 24px;
      background: var(--surface-muted);
      box-shadow: var(--shadow-sm);
      text-align: left;
    }

    .clue-panel summary {
      cursor: pointer;
      color: var(--text-primary);
      font-size: var(--font-size-base);
      font-weight: 600;
      line-height: 1.35;
      list-style: none;
    }

    .clue-panel summary::-webkit-details-marker {
      display: none;
    }

    .clue-list {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
      margin-top: var(--spacing-md);
    }

    .clue-item {
      padding: 10px 12px;
      border-radius: 18px;
      background: var(--bg-card);
      color: var(--text-secondary);
      box-shadow: var(--shadow-sm);
      font-size: var(--font-size-small);
      line-height: 1.6;
    }

    .game-talk-panel {
      padding: var(--spacing-md);
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
    }

    .game-talk-head {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: var(--spacing-md);
      padding: 0 2px;
    }

    .game-talk-title {
      color: var(--text-primary);
      font-size: var(--font-size-base);
      font-weight: 600;
      line-height: 1.35;
    }

    .game-talk-note {
      color: var(--text-hint);
      font-size: 12px;
      line-height: 1.35;
      white-space: nowrap;
    }

    .game-log {
      max-height: 42vh;
      min-height: 236px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
      padding: 4px 2px 2px;
      -webkit-overflow-scrolling: touch;
    }

    .game-message {
      width: 100%;
      display: flex;
      align-items: flex-start;
      gap: var(--spacing-sm);
    }

    .game-message.user {
      justify-content: flex-end;
    }

    .game-message.assistant {
      justify-content: flex-start;
    }

    .game-message-avatar {
      width: 34px;
      height: 34px;
      flex: 0 0 34px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border-radius: 14px;
      background: var(--surface-muted);
      color: var(--accent-dark);
      box-shadow: var(--shadow-sm);
    }

    .game-message-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .game-message-body {
      min-width: 0;
      max-width: min(72vw, 520px);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .game-message.user .game-message-body {
      align-items: flex-end;
    }

    .game-message.assistant .game-message-body {
      align-items: flex-start;
    }

    .game-message-name {
      max-width: 100%;
      padding: 0 4px;
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1.3;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .game-message-paper {
      padding: 10px 13px;
      border-radius: 18px;
      background: var(--surface-muted);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      font-size: var(--font-size-base);
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .game-message.user .game-message-paper {
      background: var(--accent);
      color: var(--bubble-user-text);
    }

    .game-input-bar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 44px;
      align-items: end;
      gap: var(--spacing-sm);
      padding: 10px;
      border-radius: 26px;
      background: color-mix(in srgb, var(--bg-card) 90%, transparent);
      box-shadow: var(--shadow-sm);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
    }

    .game-input {
      width: 100%;
      min-height: 42px;
      max-height: 118px;
      padding: 10px 14px;
      border-radius: 18px;
      background: var(--surface-muted);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      line-height: 1.5;
      resize: none;
    }

    .pet-page {
      padding: var(--spacing-lg);
      display: flex;
      flex-direction: column;
      gap: var(--spacing-lg);
    }

    .pet-stage {
      position: relative;
      min-height: 338px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 32px;
      background: var(--surface-muted);
      overflow: hidden;
      box-shadow: var(--shadow-sm);
    }

    .pet-speech {
      position: absolute;
      left: 18px;
      right: 18px;
      top: 18px;
      min-height: 44px;
      padding: 10px 14px;
      border-radius: 20px;
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      font-size: var(--font-size-small);
      line-height: 1.55;
      text-align: center;
    }

    .pet-stage-name {
      position: absolute;
      left: 50%;
      bottom: 20px;
      transform: translateX(-50%);
      max-width: 72%;
      padding: 7px 12px;
      border-radius: 999px;
      background: var(--bg-card);
      color: var(--text-secondary);
      box-shadow: var(--shadow-sm);
      font-size: 12px;
      line-height: 1.3;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .pet-creature {
      width: 190px;
      height: 190px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--pet-color);
      animation: pet-breathe 2600ms ease-in-out infinite;
    }

    .pet-creature.custom-gif {
      overflow: hidden;
      border-radius: 46px;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
    }

    .pet-creature.custom-gif img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .pet-svg {
      width: 190px;
      height: 190px;
    }

    @keyframes pet-breathe {
      0%,
      100% {
        transform: translateY(0) scale(1);
      }
      50% {
        transform: translateY(-5px) scale(1.018);
      }
    }

    .pet-stats {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--spacing-sm);
    }

    .pet-stat {
      min-width: 0;
      padding: 12px;
      border-radius: 22px;
      background: var(--surface-muted);
      box-shadow: var(--shadow-sm);
    }

    .pet-stat-top {
      display: flex;
      flex-direction: column;
      gap: 3px;
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1.35;
    }

    .pet-stat-top span:last-child {
      color: var(--text-primary);
      font-weight: 600;
    }

    .pet-stat-dots {
      display: flex;
      gap: 4px;
      margin-top: 10px;
    }

    .pet-stat-dots span {
      width: 100%;
      height: 6px;
      border-radius: 999px;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
    }

    .pet-stat-dots span.active {
      background: var(--accent);
    }

    .pet-actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--spacing-sm);
    }

    .pet-actions button {
      min-height: 48px;
      border-radius: 999px;
    }

    .pet-note {
      padding: 12px 14px;
      border-radius: 22px;
      background: var(--surface-muted);
      color: var(--text-secondary);
      box-shadow: var(--shadow-sm);
      font-size: var(--font-size-small);
      line-height: 1.6;
    }

    .pet-gif-row {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
      margin: var(--spacing-md) 0;
    }

    .gif-picker {
      display: flex;
      gap: var(--spacing-sm);
    }

    .visual-actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--spacing-sm);
      margin: var(--spacing-md) 0;
    }

    .game-art.has-custom-image,
    .game-setup-art.has-custom-image {
      padding: 0;
      background: var(--bg-card);
      overflow: hidden;
    }

    .game-art.has-custom-image img,
    .game-setup-art.has-custom-image img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: inherit;
    }

    .image-workbench {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
    }

    .image-content-list {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
      margin-top: var(--spacing-sm);
    }

    .image-content-item {
      width: 100%;
      display: grid;
      grid-template-columns: 48px minmax(0, 1fr) 20px;
      align-items: center;
      gap: var(--spacing-sm);
      padding: 12px;
      border-radius: 20px;
      background: var(--surface-muted);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      text-align: left;
      transition: var(--motion);
    }

    .image-content-preview {
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border-radius: 17px;
      background: var(--bg-card);
      color: var(--accent-dark);
      box-shadow: var(--shadow-sm);
    }

    .image-content-preview img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .image-content-text {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .image-content-title {
      color: var(--text-primary);
      font-size: var(--font-size-base);
      font-weight: 600;
      line-height: 1.35;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .image-content-desc {
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.35;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .nav-tool-group {
      display: flex;
      align-items: center;
      gap: var(--spacing-xs);
    }

    .soft-note {
      padding: 12px 14px;
      border-radius: 20px;
      background: var(--surface-muted);
      color: var(--text-secondary);
      box-shadow: var(--shadow-sm);
      font-size: var(--font-size-small);
      line-height: 1.6;
    }

    .typing-dots {
      display: inline-flex;
      gap: 4px;
      align-items: center;
      padding: 4px 0;
    }

    .typing-dots span {
      width: 5px;
      height: 5px;
      border-radius: 999px;
      background: currentColor;
      opacity: .4;
      animation: game-dot 900ms ease-in-out infinite;
    }

    .typing-dots span:nth-child(2) {
      animation-delay: 120ms;
    }

    .typing-dots span:nth-child(3) {
      animation-delay: 240ms;
    }

    @keyframes game-dot {
      0%,
      100% {
        transform: translateY(0);
        opacity: .35;
      }
      50% {
        transform: translateY(-3px);
        opacity: .8;
      }
    }

    @media (min-width: 680px) {
      .games-featured {
        grid-template-columns: minmax(0, 1fr) 132px;
      }

      .game-card {
        flex-basis: 246px;
      }

      .word-card-row {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }

      .pet-actions {
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }

      .game-play {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(300px, 420px);
        align-items: start;
      }

      .game-scene {
        grid-column: 1 / 2;
      }

      .game-talk-panel {
        grid-column: 2 / 3;
        grid-row: 1 / 3;
        min-height: 520px;
      }

      .game-log {
        max-height: 560px;
      }

      .game-input-bar {
        grid-column: 1 / 2;
      }
    }

    @media (max-width: 380px) {
      .games-featured {
        grid-template-columns: 1fr;
      }

      .games-featured-art {
        min-height: 96px;
      }

      .game-card {
        flex-basis: 204px;
      }

      .pet-stats {
        grid-template-columns: 1fr;
      }

      .round-seat {
        width: 76px;
      }
    }
  `;
}

// 依赖：../core/storage.js 的 getData/setData/generateId/getNow/getAllDB/getDB/setDB/deleteDB/compressImage；../core/api.js 的 silentRequest；../core/ui.js 的 showToast/showBottomSheet/hideBottomSheet/showConfirm/createIcon；动态依赖 ./chat.js 的 recordExternalInteraction
