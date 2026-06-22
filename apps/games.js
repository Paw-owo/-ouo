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
    intro: '身份、发言、投票和夜晚行动，由 AI 主持推进。',
    tone: '悬疑、克制、有暗流',
    minPlayers: 3
  },
  {
    id: 'undercover',
    name: '谁是卧底',
    intro: '每个人拿到词语，轮流描述，找出不一样的人。',
    tone: '悬疑、轻松、适合猜测',
    minPlayers: 3
  },
  {
    id: 'cards',
    name: '扑克牌',
    intro: '用一张干净牌桌玩简单牌局，规则由 AI 解释。',
    tone: '桌边、安静、有判断',
    minPlayers: 1
  },
  {
    id: 'truth',
    name: '真心话大冒险',
    intro: '抽取对象，再选择真心话或大冒险。',
    tone: '亲近、柔软、轻微心动',
    minPlayers: 1
  },
  {
    id: 'tarot',
    name: '塔罗牌',
    intro: '选择牌阵，抽牌后由 AI 分段解读。',
    tone: '神秘、温柔、留白',
    minPlayers: 1
  },
  {
    id: 'match',
    name: '配对',
    intro: 'AI 猜你想的，或你猜 AI 心里想的。',
    tone: '试探、推理、轻松',
    minPlayers: 1
  },
  {
    id: 'script',
    name: '剧本杀',
    intro: 'AI 主持案件、线索与角色发言。',
    tone: '沉浸、推理、剧情感',
    minPlayers: 1
  },
  {
    id: 'pet',
    name: '云养宠',
    intro: '照顾一只会回应你的小宠物。',
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

  const back = iconButton('back', '返回');
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

  const settingsButton = iconButton('image', '图片内容');
  settingsButton.addEventListener('click', () => openImageContentSheet());

  const body = renderShell('游戏', '选一个小世界进去玩', settingsButton);

  const hero = el('section', 'games-hero');
  const heroArt = el('div', 'games-hero-art');
  heroArt.appendChild(createHeroSvg());

  const heroText = el('div', 'games-hero-text');
  heroText.append(
    el('div', 'games-kicker', '小游戏大厅'),
    el('div', 'games-hero-title', '轻一点，也能很好玩'),
    el('div', 'games-hero-desc', '图片内容里可以统一换大厅背景、游戏图标、游戏背景和宠物 GIF。')
  );

  hero.append(heroArt, heroText);
  body.appendChild(hero);

  const grid = el('div', 'game-card-grid');

  GAME_LIST.forEach((game) => {
    grid.appendChild(createGameCard(game));
  });

  body.appendChild(grid);
}

function createGameCard(game) {
  const visual = getGameVisual(game.id);
  const customImage = getVisualImage(game.id);
  const card = el('button', 'game-card');
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

  const main = el('div', 'game-card-main');
  main.append(
    el('div', 'game-card-title', getGameDisplayName(game.id)),
    el('div', 'game-card-desc', game.intro)
  );

  const foot = el('div', 'game-card-foot');
  foot.append(
    el('span', 'game-card-tag', game.id === 'pet' ? getPetStatusText() : getConfigSummary(game.id)),
    createIcon('arrow-right', 18)
  );

  card.append(art, main, foot);
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
  if (count) return `${count} 个角色`;
  return '可配置';
}

function getPetStatusText() {
  if (!petData) return '准备中';
  if (petData.hunger < PET_LOW_LIMIT || petData.mood < PET_LOW_LIMIT) return '需要照顾';
  if (petData.affection >= 80) return '很亲近';
  return '状态不错';
}

async function openGameSetup(gameId) {
  currentView = 'setup';
  currentGameId = gameId;
  await applyGameBackground(gameId);

  const game = getGame(gameId);
  const body = renderShell(getGameDisplayName(gameId), game.intro, createSetupActionButton(gameId));
  const config = configs[gameId] || { ...DEFAULT_CONFIG, gameId };

  const panel = el('section', 'game-setup-card');

  const mode = createSegmented(
    [
      { value: 'host', label: 'AI 主持' },
      { value: 'player', label: 'AI 玩家' }
    ],
    config.mode || 'host',
    (value) => {
      config.mode = value;
      config.updatedAt = getNow();
      configs[gameId] = config;
      saveConfigs();
    }
  );

  panel.append(
    createSettingBlock('模式', '主持模式适合规则推进；玩家模式更像一起玩。', mode),
    createCharacterPicker(config),
    createThemeEditor(gameId, config)
  );

  const start = button('开始这一局', 'primary', 'play');
  start.classList.add('wide-btn');
  start.addEventListener('click', () => startGenericGame(gameId));

  panel.appendChild(start);
  body.appendChild(panel);

  const recent = getRecentSessions(gameId);
  if (recent.length) {
    const section = el('section', 'game-section');
    section.appendChild(el('div', 'section-title', '最近记录'));
    const list = el('div', 'session-list');

    recent.forEach((session) => {
      list.appendChild(createSessionCard(session));
    });

    section.appendChild(list);
    body.appendChild(section);
  }
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
  const wrap = el('div', 'setup-block');

  wrap.append(
    el('div', 'setup-block-title', '参与角色'),
    el('div', 'setup-block-desc', '不选角色也可以开始，AI 会用主持口吻推进。')
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
        saveConfigs();
      });

      list.appendChild(chip);
    });
  }

  wrap.appendChild(list);
  return wrap;
}

function createThemeEditor(gameId, config) {
  const wrap = el('div', 'setup-block');
  wrap.append(
    el('div', 'setup-block-title', '视觉小调'),
    el('div', 'setup-block-desc', '只保存这个游戏的小氛围，不影响全局主题。')
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

  const sheet = el('div');
  sheet.append(
    el('div', 'sheet-title', '图片内容'),
    el('div', 'sheet-description', '所有能换图片的地方都放在这里。')
  );

  const appBgFile = document.createElement('input');
  appBgFile.type = 'file';
  appBgFile.accept = 'image/*';
  appBgFile.className = 'hidden';

  const appBgBtn = button('更换游戏大厅背景', 'ghost', 'image');
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

  const topActions = el('div', 'visual-actions');
  topActions.append(appBgBtn, clearAppBg);

  sheet.append(appBgFile, topActions, list);
  showBottomSheet(sheet);
}

function openGameVisualSheet(gameId) {
  hideBottomSheet();

  const game = getGame(gameId);
  const visual = { ...getGameVisual(gameId) };
  const config = configs[gameId] || { ...DEFAULT_CONFIG, gameId };

  const sheet = el('div');
  sheet.append(
    el('div', 'sheet-title', `${game.name} 图片内容`),
    el('div', 'sheet-description', gameId === 'pet' ? '这里可以换图标、背景和宠物 GIF。' : '这里可以换名字、图标、背景和透明度。')
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

  const body = renderShell(getGameDisplayName(gameId), getGamePhaseText(), reset);

  const play = el('section', `game-play game-play-${gameId}`);
  play.appendChild(createGameBoard(gameId));

  const log = el('div', 'game-log');
  log.id = 'game-log';

  normalizeArray(activeSession?.messages).forEach((message) => {
    log.appendChild(createGameMessage(message));
  });

  const inputBar = createGameInput(gameId);

  play.append(log, inputBar);
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
    el('div', 'board-subtitle', '身份先藏好，发言慢慢来')
  );

  const seats = el('div', 'seat-grid');
  getSessionCharacters().forEach((character, index) => {
    const seat = el('button', 'seat-card');
    seat.type = 'button';
    seat.append(
      createMiniAvatar(character),
      el('div', 'seat-name', character.name || `玩家 ${index + 1}`),
      el('div', 'seat-role-back', '身份牌')
    );
    seat.addEventListener('click', () => chooseBoardTarget(character.id));
    seats.appendChild(seat);
  });

  if (!seats.children.length) {
    seats.appendChild(el('div', 'soft-note', '没有选择角色时，AI 会用主持视角推进。'));
  }

  board.append(top, seats);
  return board;
}

function createUndercoverBoard() {
  const board = el('div', 'game-board undercover-board');
  board.append(
    el('div', 'board-title', '词语卡'),
    el('div', 'board-subtitle', '描述时别太明显，也别太模糊')
  );

  const cards = el('div', 'word-card-row');
  getSessionCharacters().forEach((character) => {
    const card = el('button', 'word-card');
    card.type = 'button';
    card.append(createMiniAvatar(character), el('div', 'word-card-name', character.name || '玩家'), el('div', 'word-card-hidden', '隐藏词语'));
    card.addEventListener('click', () => chooseBoardTarget(character.id));
    cards.appendChild(card);
  });

  if (!cards.children.length) cards.appendChild(el('div', 'soft-note', '可以让 AI 主持直接发词。'));

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
    hand.appendChild(el('button', 'paper-card', text));
  });

  board.append(
    el('div', 'board-title', '安静牌桌'),
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
  const dare = button('大冒险', 'ghost', 'star');

  truth.addEventListener('click', () => sendGamePrompt('请给我一个真心话题目，柔软一点，可以有一点心动感。'));
  dare.addEventListener('click', () => sendGamePrompt('请给我一个大冒险题目，安全、轻松、有互动感。'));

  actions.append(truth, dare);

  board.append(
    el('div', 'board-title', '转到谁，就问谁'),
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
    el('div', 'board-title', '选一个牌阵'),
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
    `请让游戏可以继续推进，回复不要太长，优先给出下一步可操作内容。`,
    `禁止使用 emoji。`,
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
  const bubble = el('div', 'game-message-bubble');

  if (message.content === '正在想') {
    const dots = el('span', 'typing-dots');
    dots.append(el('span'), el('span'), el('span'));
    bubble.appendChild(dots);
  } else {
    bubble.textContent = message.content || '';
  }

  body.append(name, bubble);

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
    const selected = getSessionCharacters()[Math.floor(Math.random() * Math.max(1, getSessionCharacters().length))];
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

  stage.append(bubble, pet);

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

  const bar = el('div', 'pet-stat-bar');
  const fill = el('div', 'pet-stat-fill');
  fill.style.width = `${clamp(value, 0, 100)}%`;
  bar.appendChild(fill);

  item.append(top, bar);
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
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/* SVG */

function createHeroSvg() {
  const svg = createSvgBase(96, 96);
  svg.append(
    svgPath('M24 26h48a8 8 0 0 1 8 8v28a8 8 0 0 1-8 8H24a8 8 0 0 1-8-8V34a8 8 0 0 1 8-8z'),
    svgPath('M32 26v-6a8 8 0 0 1 8-8h16a8 8 0 0 1 8 8v6'),
    svgPath('M30 44h12'),
    svgPath('M54 44h12'),
    svgPath('M37 56c5 5 17 5 22 0'),
    svgPath('M24 74l-8 10'),
    svgPath('M72 74l8 10')
  );
  return svg;
}

function createGameSvg(gameId, size = 54) {
  const svg = createSvgBase(size, size);
  const s = size / 54;

  function p(d) {
    return svgPath(scalePath(d, s));
  }

  if (gameId === 'werewolf') {
    svg.append(
      p('M14 17l8-8 8 8'),
      p('M12 20c2 15 8 22 15 22s13-7 15-22'),
      p('M18 23h.1'),
      p('M36 23h.1'),
      p('M21 34c4 3 8 3 12 0'),
      p('M16 16l-6-4 3 10'),
      p('M38 16l6-4-3 10')
    );
    return svg;
  }

  if (gameId === 'undercover') {
    svg.append(
      p('M14 11h26v32H14z'),
      p('M20 20h14'),
      p('M20 27h10'),
      p('M20 34h14'),
      p('M10 17h4'),
      p('M40 37h4')
    );
    return svg;
  }

  if (gameId === 'cards') {
    svg.append(
      p('M16 10h20v30H16z'),
      p('M22 16h8'),
      p('M22 24h8'),
      p('M12 16h20v30H12z')
    );
    return svg;
  }

  if (gameId === 'truth') {
    svg.append(
      p('M27 9a18 18 0 1 1 0 36 18 18 0 0 1 0-36z'),
      p('M27 9v18l13 10'),
      p('M27 27L14 37'),
      p('M27 27h18')
    );
    return svg;
  }

  if (gameId === 'tarot') {
    svg.append(
      p('M17 8h20v38H17z'),
      p('M27 15l3 6 6 .8-4.5 4.4 1.1 6.4L27 29.6l-5.6 3 1.1-6.4L18 21.8l6-.8z')
    );
    return svg;
  }

  if (gameId === 'match') {
    svg.append(
      p('M18 18a9 9 0 1 1 0 18 9 9 0 0 1 0-18z'),
      p('M36 18a9 9 0 1 1 0 18 9 9 0 0 1 0-18z'),
      p('M25 27h4'),
      p('M27 12v6'),
      p('M27 36v6')
    );
    return svg;
  }

  if (gameId === 'script') {
    svg.append(
      p('M13 9h28v36H13z'),
      p('M19 17h16'),
      p('M19 24h12'),
      p('M19 31h16'),
      p('M18 39l6-4 6 4 6-4')
    );
    return svg;
  }

  if (gameId === 'pet') {
    svg.append(
      p('M17 23c0-8 5-14 10-14s10 6 10 14v8c0 8-5 13-10 13s-10-5-10-13z'),
      p('M19 18l-5-7 1 11'),
      p('M35 18l5-7-1 11'),
      p('M23 27h.1'),
      p('M31 27h.1'),
      p('M24 35c2 2 4 2 6 0')
    );
    return svg;
  }

  svg.append(p('M27 9l6 12 13 2-9.5 9 2.3 13L27 38.7 15.2 45 17.5 32 8 23l13-2z'));
  return svg;
}

function createPetSvg(type) {
  const svg = createSvgBase(180, 180);
  svg.classList.add('pet-svg');

  if (type === 'dog') {
    svg.append(
      petFill('M52 72c0-28 18-48 38-48s38 20 38 48v30c0 30-18 50-38 50s-38-20-38-50z'),
      svgPath('M55 70c-16-14-26-10-29 4-2 10 4 24 19 28'),
      svgPath('M125 70c16-14 26-10 29 4 2 10-4 24-19 28'),
      svgPath('M75 82h.1'),
      svgPath('M105 82h.1'),
      svgPath('M86 96h8'),
      svgPath('M80 112c7 7 20 7 27 0')
    );
    return svg;
  }

  if (type === 'rabbit') {
    svg.append(
      petFill('M56 78c0-28 16-44 34-44s34 16 34 44v26c0 30-16 48-34 48s-34-18-34-48z'),
      svgPath('M72 42C62 16 54 8 46 12c-7 4-4 25 14 52'),
      svgPath('M108 42c10-26 18-34 26-30 7 4 4 25-14 52'),
      svgPath('M78 88h.1'),
      svgPath('M102 88h.1'),
      svgPath('M86 103h8'),
      svgPath('M82 118c6 5 16 5 22 0')
    );
    return svg;
  }

  if (type === 'fantasy') {
    svg.append(
      petFill('M50 84c0-30 22-52 40-52s40 22 40 52v16c0 32-20 52-40 52s-40-20-40-52z'),
      svgPath('M64 48l-16-24 4 34'),
      svgPath('M116 48l16-24-4 34'),
      svgPath('M72 86h.1'),
      svgPath('M108 86h.1'),
      svgPath('M80 108c8 8 20 8 28 0'),
      svgPath('M90 30v-14'),
      svgPath('M78 136c-18 10-30 4-36-8'),
      svgPath('M102 136c18 10 30 4 36-8')
    );
    return svg;
  }

  svg.append(
    petFill('M54 76c0-30 17-50 36-50s36 20 36 50v26c0 30-17 50-36 50s-36-20-36-50z'),
    svgPath('M62 54L48 26l2 38'),
    svgPath('M118 54l14-28-2 38'),
    svgPath('M78 86h.1'),
    svgPath('M102 86h.1'),
    svgPath('M86 101h8'),
    svgPath('M82 116c6 6 16 6 22 0'),
    svgPath('M126 118c18 0 26 10 20 22')
  );

  return svg;
}

function createTruthWheelSvg() {
  const svg = createSvgBase(150, 150);
  svg.append(
    svgPath('M75 20a55 55 0 1 1 0 110 55 55 0 0 1 0-110z'),
    svgPath('M75 20v55l38-39'),
    svgPath('M75 75l54 8'),
    svgPath('M75 75l-32 45'),
    svgPath('M75 75L28 45'),
    svgPath('M75 75h.1')
  );
  return svg;
}

function createTarotCardSvg() {
  const svg = createSvgBase(62, 92);
  svg.append(
    svgPath('M12 8h38v76H12z'),
    svgPath('M31 22l4 8 9 1.3-6.5 6.3 1.5 9-8-4.2-8 4.2 1.5-9L18 31.3l9-1.3z'),
    svgPath('M22 68h18')
  );
  return svg;
}

function petFill(d) {
  const path = svgPath(d);
  path.setAttribute('fill', 'var(--pet-color)');
  path.setAttribute('opacity', '0.22');
  return path;
}

function createMiniAvatar(character) {
  const box = el('span', 'mini-avatar');

  if (character.avatar) {
    const img = document.createElement('img');
    img.src = character.avatar;
    img.alt = '';
    box.appendChild(img);
  } else {
    box.appendChild(createIcon('smile', 16));
  }

  return box;
}

function createSvgBase(width, height) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  return svg;
}

function svgPath(d) {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  return path;
}

function scalePath(path, scale) {
  if (scale === 1) return path;
  return path.replace(/-?\d+(\.\d+)?/g, (num) => String(Math.round(Number(num) * scale * 100) / 100));
}

/* helpers */

function getGame(gameId) {
  return GAME_LIST.find((item) => item.id === gameId) || GAME_LIST[0];
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function toggleId(list, id, active) {
  const set = new Set(normalizeArray(list));
  if (active) set.add(id);
  else set.delete(id);
  return [...set];
}

function formatTime(value) {
  if (!value) return '刚刚';

  try {
    return new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value));
  } catch (_) {
    return '刚刚';
  }
}

function getPetTypeLabel(type) {
  if (type === 'dog') return '狗';
  if (type === 'rabbit') return '兔';
  if (type === 'fantasy') return '异世界小生物';
  return '猫';
}

function readCssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function normalizeColorValue(value) {
  const raw = String(value || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw;
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`;
  return '#D4956A';
}

function openHallSettings() {
  const sheet = el('div');
  sheet.append(
    el('div', 'sheet-title', '游戏设置'),
    el('div', 'sheet-description', '这里只放轻量设置，具体游戏背景在每个游戏里换。')
  );

  const clearBadge = button('清除游戏角标', 'ghost', 'clear');
  clearBadge.addEventListener('click', () => {
    const unread = getData(GAMES_BADGE_KEY) || {};
    unread.games = 0;
    setData(GAMES_BADGE_KEY, unread);
    window.AppEvents?.emit?.('badge:games', 0);
    showToast('角标清掉了');
    hideBottomSheet();
  });

  const clearSessions = button('清空游戏记录', 'ghost', 'delete');
  clearSessions.addEventListener('click', async () => {
    const ok = await showConfirm('确定清空所有游戏记录吗？宠物不会删除。');
    if (!ok) return;
    sessions = [];
    saveSessions();
    hideBottomSheet();
    renderHall();
    showToast('游戏记录已清空');
  });

  sheet.append(clearBadge, clearSessions);
  showBottomSheet(sheet);
}

function button(text, variant = 'ghost', iconName = '') {
  const item = el('button', variant === 'primary' ? 'btn-primary' : 'btn-ghost');
  item.type = 'button';
  if (iconName) item.appendChild(createIcon(iconName, 18));
  item.appendChild(el('span', '', text));
  return item;
}

function iconButton(iconName, label) {
  const item = el('button', 'icon-button');
  item.type = 'button';
  item.setAttribute('aria-label', label);
  item.appendChild(createIcon(iconName, 22));
  return item;
}

function input(placeholder, value = '', type = 'text') {
  const item = document.createElement('input');
  item.className = 'input-card';
  item.type = type;
  item.placeholder = placeholder || '';
  item.value = value ?? '';
  return item;
}

function field(labelText, control) {
  const wrap = el('label', 'settings-field');
  wrap.append(el('span', 'field-label', labelText), control);
  return wrap;
}

function customRow(labelText, control) {
  const row = el('div', 'form-row');
  const label = el('div', 'form-label', labelText);
  const box = el('div', 'form-control');
  box.appendChild(control);
  row.append(label, box);
  return row;
}

function switchButton(active, onChange) {
  const item = el('button', 'switch');
  item.type = 'button';
  item.classList.toggle('active', Boolean(active));
  item.addEventListener('click', () => {
    item.classList.toggle('active');
    onChange?.(item.classList.contains('active'));
  });
  return item;
}

function createSegmented(options, value, onChange) {
  const wrap = el('div', 'segmented');
  options.forEach((option) => {
    const item = el('button', '', option.label);
    item.type = 'button';
    item.classList.toggle('active', option.value === value);
    item.addEventListener('click', () => onChange(option.value));
    wrap.appendChild(item);
  });
  return wrap;
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null && text !== '') node.textContent = String(text);
  return node;
}

/* styles */

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .games-screen {
      --game-accent: var(--accent);
      position: fixed;
      inset: 0;
      z-index: 10;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--bg-primary);
      color: var(--text-primary);
      font-family: var(--font-main);
    }

    .games-screen.has-bg {
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
    }

    .games-soft-layer {
      position: absolute;
      inset: 0;
      z-index: 0;
      pointer-events: none;
      background: color-mix(in srgb, var(--bg-primary) 80%, transparent);
    }

    .games-nav {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 100;
      height: calc(56px + env(safe-area-inset-top));
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      padding: env(safe-area-inset-top) 20px 0;
      background: var(--surface-glass);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
    }

    .games-nav-titlebox {
      flex: 1;
      min-width: 0;
    }

    .games-nav-title {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.25;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .games-nav-subtitle {
      margin-top: 2px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.3;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .games-body {
      position: relative;
      z-index: 1;
      flex: 1;
      overflow-x: hidden;
      overflow-y: auto;
      padding: calc(56px + env(safe-area-inset-top) + 18px) 20px calc(88px + env(safe-area-inset-bottom));
      -webkit-overflow-scrolling: touch;
    }

    .games-hero,
    .game-setup-card,
    .game-board,
    .pet-page,
    .game-section {
      border-radius: 28px;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
    }

    .games-hero {
      min-height: 178px;
      display: grid;
      grid-template-columns: 96px minmax(0, 1fr);
      align-items: center;
      gap: var(--spacing-md);
      padding: 22px;
      margin-bottom: var(--spacing-md);
    }

    .games-hero-art {
      width: 96px;
      height: 96px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 30px;
      background: var(--accent-light);
      color: var(--accent-dark);
    }

    .games-kicker {
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.4;
    }

    .games-hero-title {
      margin-top: 5px;
      color: var(--text-primary);
      font-size: 24px;
      font-weight: 600;
      line-height: 1.25;
      letter-spacing: -0.02em;
    }

    .games-hero-desc {
      margin-top: 9px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.65;
    }

    .game-card-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: var(--spacing-md);
    }

    .game-card {
      width: 100%;
      display: grid;
      grid-template-columns: 72px minmax(0, 1fr);
      gap: var(--spacing-md);
      padding: var(--spacing-md);
      border-radius: 26px;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      text-align: left;
      color: var(--text-primary);
    }

    .game-art {
      width: 72px;
      height: 72px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 24px;
      background: var(--surface-muted);
      color: var(--accent-dark);
    }

    .game-card-main {
      min-width: 0;
    }

    .game-card-title {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
    }

    .game-card-desc {
      margin-top: 4px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.55;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .game-card-foot {
      grid-column: 2;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-sm);
      margin-top: 10px;
      color: var(--text-secondary);
    }

    .game-card-tag {
      padding: 4px 10px;
      border-radius: 999px;
      background: var(--surface-muted);
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1.3;
    }

    .game-setup-card,
    .pet-page,
    .game-section {
      padding: var(--spacing-md);
      margin-bottom: var(--spacing-md);
    }

    .setup-block {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
      margin-bottom: var(--spacing-lg);
    }

    .setup-block-title,
    .section-title,
    .board-title {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
    }

    .setup-block-desc,
    .board-subtitle {
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.6;
    }

    .wide-btn {
      width: 100%;
    }

    .character-chip-list {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-sm);
    }

    .character-chip {
      min-height: 40px;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 7px 12px;
      border-radius: 999px;
      background: var(--surface-muted);
      color: var(--text-secondary);
      box-shadow: var(--shadow-sm);
      font-size: var(--font-size-small);
    }

    .character-chip.active {
      background: var(--accent-light);
      color: var(--accent-dark);
    }

    .character-chip-avatar,
    .mini-avatar {
      width: 24px;
      height: 24px;
      flex: 0 0 24px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border-radius: 50%;
      background: var(--bg-card);
      color: var(--accent-dark);
    }

    .character-chip-avatar img,
    .mini-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .theme-row {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
    }

    .theme-color-input {
      width: 54px;
      height: 42px;
      padding: 5px;
      border-radius: var(--radius-md);
      background: var(--surface-muted);
    }

    .session-list {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
      margin-top: var(--spacing-sm);
    }

    .session-card {
      width: 100%;
      padding: 14px;
      border-radius: var(--radius-lg);
      background: var(--surface-muted);
      color: var(--text-primary);
      text-align: left;
    }

    .session-card-title {
      font-size: var(--font-size-base);
      font-weight: 600;
      line-height: 1.4;
    }

    .session-card-text {
      margin-top: 4px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.5;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .session-card-time {
      margin-top: 6px;
      color: var(--text-hint);
      font-size: 12px;
    }
  `;
  document.head.appendChild(style);
  injectMoreStyles();
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

    .game-board {
      padding: var(--spacing-md);
      overflow: hidden;
    }

    .board-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--spacing-md);
      margin-bottom: var(--spacing-md);
    }

    .seat-grid,
    .word-card-row {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--spacing-sm);
      margin-top: var(--spacing-md);
    }

    .seat-card,
    .word-card {
      min-height: 118px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--spacing-sm);
      padding: var(--spacing-sm);
      border-radius: var(--radius-lg);
      background: var(--surface-muted);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      text-align: center;
    }

    .seat-name,
    .word-card-name {
      max-width: 100%;
      color: var(--text-primary);
      font-size: var(--font-size-small);
      font-weight: 600;
      line-height: 1.35;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .seat-role-back,
    .word-card-hidden {
      padding: 5px 10px;
      border-radius: 999px;
      background: var(--bg-card);
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1.3;
      box-shadow: var(--shadow-sm);
    }

    .card-table {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--spacing-md);
      margin: var(--spacing-md) 0;
    }

    .card-pile,
    .play-area {
      min-height: 108px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--radius-lg);
      background: var(--surface-muted);
      color: var(--text-secondary);
      box-shadow: var(--shadow-sm);
      font-size: var(--font-size-small);
    }

    .hand-row {
      display: flex;
      gap: var(--spacing-sm);
      overflow-x: auto;
      padding-bottom: 2px;
    }

    .paper-card {
      width: 54px;
      height: 78px;
      flex: 0 0 54px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 14px;
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      font-size: 22px;
      font-weight: 600;
    }

    .truth-board {
      text-align: center;
    }

    .truth-wheel {
      width: 150px;
      height: 150px;
      margin: 18px auto;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      color: var(--accent-dark);
      background: var(--accent-light);
      box-shadow: var(--shadow-sm);
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
      gap: var(--spacing-sm);
      overflow-x: auto;
      padding: var(--spacing-md) 2px 4px;
    }

    .tarot-card {
      width: 62px;
      height: 92px;
      flex: 0 0 62px;
      border-radius: 16px;
      color: var(--accent-dark);
      background: var(--accent-light);
      box-shadow: var(--shadow-sm);
      transform-style: preserve-3d;
    }

    .tarot-card.revealed {
      background: var(--bg-card);
      color: var(--text-primary);
      transform: rotateY(180deg);
    }

    .guess-progress {
      position: relative;
      height: 42px;
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
      border-radius: var(--radius-lg);
      background: var(--surface-muted);
      box-shadow: var(--shadow-sm);
    }

    .clue-panel summary {
      cursor: pointer;
      color: var(--text-primary);
      font-size: var(--font-size-base);
      font-weight: 600;
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
      border-radius: var(--radius-md);
      background: var(--bg-card);
      color: var(--text-secondary);
      box-shadow: var(--shadow-sm);
      font-size: var(--font-size-small);
    }

    .game-log {
      flex: 1;
      min-height: 260px;
      max-height: 42vh;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
      padding: var(--spacing-sm);
      border-radius: 26px;
      background: color-mix(in srgb, var(--bg-card) 76%, transparent);
      box-shadow: var(--shadow-sm);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
    }

    .game-message {
      max-width: 92%;
      display: flex;
      align-items: flex-start;
      gap: var(--spacing-sm);
    }

    .game-message.user {
      align-self: flex-end;
      justify-content: flex-end;
    }

    .game-message.assistant {
      align-self: flex-start;
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
      padding: 0 4px;
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1.3;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .game-message-bubble {
      padding: 10px 13px;
      border-radius: var(--radius-lg);
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      font-size: var(--font-size-base);
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .game-message.user .game-message-bubble {
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
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
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
      display: flex;
      flex-direction: column;
      gap: var(--spacing-lg);
    }

    .pet-stage {
      position: relative;
      min-height: 300px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 30px;
      background: var(--surface-muted);
      overflow: hidden;
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

    .pet-creature {
      width: 180px;
      height: 180px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--pet-color);
      animation: pet-breathe 2600ms ease-in-out infinite;
    }

    .pet-creature.custom-gif {
      overflow: hidden;
      border-radius: 42px;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
    }

    .pet-creature.custom-gif img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .pet-svg {
      width: 180px;
      height: 180px;
    }

    @keyframes pet-breathe {
      0%,
      100% {
        transform: translateY(0) scale(1);
      }
      50% {
        transform: translateY(-4px) scale(1.015);
      }
    }

    .pet-stats {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
    }

    .pet-stat {
      padding: 12px 14px;
      border-radius: var(--radius-lg);
      background: var(--surface-muted);
      box-shadow: var(--shadow-sm);
    }

    .pet-stat-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-md);
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.4;
    }

    .pet-stat-bar {
      height: 8px;
      overflow: hidden;
      margin-top: 8px;
      border-radius: 999px;
      background: var(--bg-card);
    }

    .pet-stat-fill {
      height: 100%;
      border-radius: inherit;
      background: var(--accent);
      transition: var(--motion);
    }

    .pet-actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--spacing-sm);
    }

    .pet-actions button {
      min-height: 48px;
    }

    .pet-note {
      padding: 12px 14px;
      border-radius: var(--radius-lg);
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

    .game-art.has-custom-image {
      padding: 0;
      background: var(--bg-card);
      overflow: hidden;
    }

    .game-art.has-custom-image img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: inherit;
    }

    .image-content-list {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
      margin-top: var(--spacing-md);
    }

    .image-content-item {
      width: 100%;
      display: grid;
      grid-template-columns: 46px minmax(0, 1fr) 20px;
      align-items: center;
      gap: var(--spacing-sm);
      padding: 12px;
      border-radius: var(--radius-lg);
      background: var(--surface-muted);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      text-align: left;
    }

    .image-content-preview {
      width: 46px;
      height: 46px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border-radius: 16px;
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
      gap: 2px;
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
      border-radius: var(--radius-lg);
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
      border-radius: 50%;
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
      .game-card-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .seat-grid,
      .word-card-row {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }

      .pet-actions {
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }
    }
  `;
}

// 依赖：../core/storage.js 的 getData/setData/generateId/getNow/getAllDB/getDB/setDB/deleteDB/compressImage；../core/api.js 的 silentRequest；../core/ui.js 的 showToast/showBottomSheet/hideBottomSheet/showConfirm/createIcon；动态依赖 ./chat.js 的 recordExternalInteraction
