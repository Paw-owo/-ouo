```js
/*
imports:
- ../../core/storage.js: getData, setData, getAllDB, getDB, setDB, deleteDB, generateId, getNow, compressImage
- ../../core/ui.js: createIcon, showToast, showBottomSheet, hideBottomSheet, showConfirm
- ../../core/api.js: silentRequest
*/
import {
  getData,
  setData,
  getAllDB,
  getDB,
  setDB,
  deleteDB,
  generateId,
  getNow,
  compressImage
} from '../../core/storage.js';
import {
  createIcon,
  showToast,
  showBottomSheet,
  hideBottomSheet,
  showConfirm
} from '../../core/ui.js';
import { silentRequest } from '../../core/api.js';

let rootEl = null;
let onBackHandler = null;
let mounted = false;

const STYLE_ID = 'draw-guess-style';
const BG_KEY = 'app_bg_draw_guess';
const SETTINGS_KEY = 'app_draw_guess_settings';

const DEFAULT_SETTINGS = {
  backgroundOpacity: 0.28,
  allowRoast: true,
  autoAiGuess: true,
  maxHints: 5
};

const LOCAL_WORDS = [
  { word: '电子榨菜', category: '网络梗' },
  { word: '班味', category: '抽象状态' },
  { word: '显眼包', category: '网络梗' },
  { word: '赛博上香', category: '抽象行为' },
  { word: '脆皮大学生', category: '网络梗' },
  { word: '互联网嘴替', category: '网络身份' },
  { word: '淡人', category: '抽象人格' },
  { word: '发疯文学', category: '网络梗' },
  { word: '窝囊废文学', category: '网络梗' },
  { word: '鼠鼠我呀', category: '网络梗' },
  { word: '退退退', category: '网络梗' },
  { word: '一键三连', category: '网络动作' },
  { word: '尊嘟假嘟', category: '网络梗' },
  { word: '精神状态良好', category: '反话文学' },
  { word: '这个家没我得散', category: '抽象台词' },
  { word: '偷感很重', category: '网络梗' },
  { word: '已读乱回', category: '网络行为' },
  { word: '人机感', category: '网络评价' },
  { word: '赛博乞丐', category: '抽象身份' },
  { word: '被窝封印术', category: '生活玄学' }
];

const RANDOM_AI_POOL = [
  {
    name: '阿卷',
    avatarText: '卷',
    persona: '说话像熬夜赶稿的吐槽役，嘴快但不坏，看到怪东西会先笑出来。'
  },
  {
    name: '栗子',
    avatarText: '栗',
    persona: '反应很真诚，脑回路飘，喜欢把抽象画面往食物和小动物上猜。'
  },
  {
    name: '小莓',
    avatarText: '莓',
    persona: '甜妹外壳，吐槽很准，语气轻快，偶尔会小声阴阳怪气。'
  },
  {
    name: '灰桃',
    avatarText: '桃',
    persona: '冷静但很会补刀，猜题像破案，越离谱越认真分析。'
  },
  {
    name: '七七',
    avatarText: '七',
    persona: '5G冲浪选手，梗很多，猜错也能硬圆，喜欢说离谱但好笑的话。'
  },
  {
    name: '麦麦',
    avatarText: '麦',
    persona: '元气笨蛋型，第一眼直觉很强，猜东西经常歪到天边。'
  },
  {
    name: '岚岚',
    avatarText: '岚',
    persona: '文艺又毒舌，喜欢把涂鸦解读成大型行为艺术。'
  }
];

const state = {
  characters: [],
  selectedIds: [],
  players: [],
  settings: { ...DEFAULT_SETTINGS },
  bgRecord: null,
  phase: 'lobby',
  round: 0,
  artist: null,
  secretWord: '',
  category: '',
  strokes: [],
  revealCount: 1,
  guesses: [],
  roasts: [],
  userGuess: '',
  score: {
    user: 0,
    ai: 0
  },
  busy: false,
  lastRoundResult: null
};

export async function mount(container, options = {}) {
  rootEl = container;
  onBackHandler = options.onBack || null;
  mounted = true;

  injectStyle();
  await loadBaseData();
  render();

  window.addEventListener('resize', handleResize);
}

export function unmount() {
  mounted = false;
  window.removeEventListener('resize', handleResize);
  hideBottomSheet();
  if (rootEl) rootEl.innerHTML = '';
  rootEl = null;
  onBackHandler = null;
}

function handleResize() {
  if (!mounted || !rootEl) return;
  const board = rootEl.querySelector('.dg-board-svg');
  if (board) board.classList.add('dg-settled');
}

async function loadBaseData() {
  const [characters, settings, bgRecord] = await Promise.all([
    getAllDB('characters').catch(() => []),
    getData(SETTINGS_KEY, DEFAULT_SETTINGS),
    getDB('blobs', BG_KEY).catch(() => null)
  ]);

  state.characters = normalizeCharacters(characters);
  state.settings = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  state.bgRecord = bgRecord || null;
}

function normalizeCharacters(list) {
  return (Array.isArray(list) ? list : [])
    .filter(Boolean)
    .map((item) => ({
      id: item.id,
      name: item.name || item.nickname || '未命名',
      avatar: readImageValue(item.avatar) || readImageValue(item.iconImage) || '',
      avatarText: String(item.name || item.nickname || 'AI').slice(0, 1),
      persona: [
        item.persona,
        item.profile,
        item.description,
        item.systemPrompt,
        item.speakingStyle ? `说话习惯：${item.speakingStyle}` : '',
        item.relationship ? `关系感：${item.relationship}` : ''
      ].filter(Boolean).join('\n'),
      raw: item,
      isRandom: false,
      type: 'ai'
    }));
}

function readImageValue(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.value || value.source || value.image || value.imageBase64 || value.backgroundImage || value.iconImage || value.url || value.src || value.data || '';
}

function render() {
  if (!rootEl || !mounted) return;

  const bg = readImageValue(state.bgRecord);
  const bgStyle = bg
    ? `style="--dg-bg-image:url('${escapeCssUrl(bg)}');--dg-bg-opacity:${Number(state.bgRecord?.opacity ?? state.settings.backgroundOpacity ?? 0.28)};"`
    : '';

  rootEl.innerHTML = `
    <section class="draw-guess-app ${bg ? 'has-custom-bg' : ''}" ${bgStyle}>
      <div class="dg-bg"></div>
      <div class="dg-shell">
        ${state.phase === 'lobby' ? renderLobby() : renderGame()}
      </div>
    </section>
  `;

  bindEvents();
}

function renderLobby() {
  const selectedCount = state.selectedIds.length;
  const canPickMore = selectedCount < 4;

  return `
    <header class="dg-top">
      <button class="dg-icon-btn" data-action="back" aria-label="返回">
        ${createIcon('chevron-left', 22)}
      </button>
      <div class="dg-title-block">
        <div class="dg-kicker">AI灵魂画手</div>
        <h2>你画我猜，但画手是抽象派</h2>
      </div>
      <button class="dg-icon-btn" data-action="custom" aria-label="装扮">
        ${createIcon('sliders', 21)}
      </button>
    </header>

    <main class="dg-lobby">
      <section class="dg-hero-card">
        <div class="dg-paper-pin"></div>
        <div class="dg-hand-title">今日画风：看不懂，但很好笑</div>
        <p>5人局。你可以拉已创建的AI来玩，不够的位置会自动匹配临时AI。AI会随机出网络梗词，再用SVG画出让人怀疑人生的线条。</p>
        <div class="dg-hero-actions">
          <button class="dg-primary" data-action="start">
            开始组局
          </button>
          <button class="dg-soft-btn" data-action="random-fill">
            随机凑满
          </button>
        </div>
      </section>

      <section class="dg-section">
        <div class="dg-section-head">
          <div>
            <h3>选择上桌AI</h3>
            <p>已选 ${selectedCount}/4，不够会自动补位</p>
          </div>
        </div>

        <div class="dg-character-grid">
          ${state.characters.length ? state.characters.map((item) => {
            const checked = state.selectedIds.includes(item.id);
            const disabled = !checked && !canPickMore;
            return `
              <button class="dg-character-card ${checked ? 'is-selected' : ''}" data-action="toggle-character" data-id="${escapeHtml(item.id)}" ${disabled ? 'data-disabled="true"' : ''}>
                <span class="dg-avatar">${renderAvatar(item)}</span>
                <span class="dg-char-name">${escapeHtml(item.name)}</span>
                <span class="dg-char-note">${checked ? '已上桌' : disabled ? '坐满啦' : '拉TA来猜'}</span>
              </button>
            `;
          }).join('') : `
            <div class="dg-empty-card">
              <div class="dg-empty-title">还没有可选AI</div>
              <p>没关系，这局会用临时AI补满，照样能玩。</p>
            </div>
          `}
        </div>
      </section>
    </main>
  `;
}

function renderGame() {
  const svg = getVisibleSvg();
  const guessList = state.guesses.length
    ? state.guesses.map(renderGuessItem).join('')
    : `<div class="dg-empty-guess">大家正在盯着这坨线条沉思。</div>`;

  const roastList = state.roasts.length
    ? state.roasts.slice(-4).map((item) => `
      <div class="dg-note">
        <b>${escapeHtml(item.name)}</b>
        <span>${escapeHtml(item.text)}</span>
      </div>
    `).join('')
    : `<div class="dg-note dg-note-muted">吐槽纸条还空着，等一个灵魂暴击。</div>`;

  return `
    <header class="dg-top dg-game-top">
      <button class="dg-icon-btn" data-action="to-lobby" aria-label="回大厅">
        ${createIcon('chevron-left', 22)}
      </button>
      <div class="dg-title-block">
        <div class="dg-kicker">第 ${state.round} 局</div>
        <h2>${escapeHtml(state.artist?.name || '画手')} 正在乱画</h2>
      </div>
      <button class="dg-icon-btn" data-action="custom" aria-label="装扮">
        ${createIcon('sliders', 21)}
      </button>
    </header>

    <main class="dg-game">
      <section class="dg-score-row">
        ${state.players.map((player) => `
          <div class="dg-player-chip ${state.artist?.id === player.id ? 'is-artist' : ''}">
            <span class="dg-mini-avatar">${renderAvatar(player)}</span>
            <span>${escapeHtml(player.name)}</span>
          </div>
        `).join('')}
      </section>

      <section class="dg-board-card">
        <div class="dg-board-head">
          <div>
            <span class="dg-label">题目类别</span>
            <strong>${escapeHtml(state.category || '正在生成')}</strong>
          </div>
          <div>
            <span class="dg-label">线索</span>
            <strong>${Math.min(state.revealCount, state.strokes.length || 1)}/${state.strokes.length || 1}</strong>
          </div>
        </div>

        <div class="dg-board">
          <div class="dg-board-svg">
            ${svg}
          </div>
        </div>

        <div class="dg-board-actions">
          <button class="dg-soft-btn" data-action="ai-guess" ${state.busy ? 'disabled' : ''}>让AI猜一轮</button>
          <button class="dg-soft-btn" data-action="add-stroke" ${state.revealCount >= state.strokes.length || state.busy ? 'disabled' : ''}>加一笔</button>
          <button class="dg-soft-btn" data-action="reveal-answer">公布答案</button>
        </div>
      </section>

      <section class="dg-interact-grid">
        <div class="dg-guess-panel">
          <h3>你的猜测</h3>
          <div class="dg-input-row">
            <input class="dg-input" data-role="user-guess" value="${escapeAttr(state.userGuess)}" placeholder="大胆猜，离谱也算参与" autocomplete="off">
            <button class="dg-primary dg-send" data-action="submit-guess">提交</button>
          </div>
          <div class="dg-answer-peek ${state.phase === 'revealed' ? 'is-show' : ''}">
            <span>答案</span>
            <strong>${escapeHtml(state.secretWord || '')}</strong>
          </div>
        </div>

        <div class="dg-roast-panel">
          <h3>小纸条吐槽</h3>
          <div class="dg-note-list">${roastList}</div>
        </div>
      </section>

      <section class="dg-guesses">
        <div class="dg-section-head">
          <div>
            <h3>大家怎么猜</h3>
            <p>猜对会记分，猜错会变成节目效果</p>
          </div>
          <button class="dg-soft-btn" data-action="next-round" ${state.phase === 'revealed' ? '' : 'disabled'}>下一局</button>
        </div>
        <div class="dg-guess-list">${guessList}</div>
      </section>
    </main>
  `;
}

function renderGuessItem(item) {
  return `
    <div class="dg-guess-item ${item.correct ? 'is-correct' : ''}">
      <div class="dg-mini-avatar">${renderAvatar(item.player)}</div>
      <div>
        <b>${escapeHtml(item.name)}</b>
        <p>${escapeHtml(item.guess)}</p>
        ${item.comment ? `<span>${escapeHtml(item.comment)}</span>` : ''}
      </div>
    </div>
  `;
}

function renderAvatar(player) {
  const img = readImageValue(player?.avatar);
  if (img) return `<img src="${escapeAttr(img)}" alt="">`;
  return `<span>${escapeHtml(player?.avatarText || player?.name?.slice(0, 1) || 'AI')}</span>`;
}

function bindEvents() {
  if (!rootEl) return;

  rootEl.querySelectorAll('[data-action]').forEach((el) => {
    el.addEventListener('click', handleAction);
  });

  const input = rootEl.querySelector('[data-role="user-guess"]');
  if (input) {
    input.addEventListener('input', () => {
      state.userGuess = input.value;
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submitUserGuess();
      }
    });
  }
}

async function handleAction(event) {
  const target = event.currentTarget;
  if (!target || target.dataset.disabled === 'true') return;

  const action = target.dataset.action;
  const id = target.dataset.id;

  if (action === 'back') {
    if (onBackHandler) onBackHandler();
    return;
  }

  if (action === 'to-lobby') {
    const ok = state.phase === 'lobby' || await showConfirm('要回到组局页吗？这一局会先收起来。');
    if (!ok) return;
    resetRoundOnly();
    state.phase = 'lobby';
    render();
    return;
  }

  if (action === 'toggle-character') {
    toggleCharacter(id);
    return;
  }

  if (action === 'random-fill') {
    randomFill();
    return;
  }

  if (action === 'start') {
    await startGame();
    return;
  }

  if (action === 'ai-guess') {
    await runAiGuessRound();
    return;
  }

  if (action === 'add-stroke') {
    addStroke();
    return;
  }

  if (action === 'submit-guess') {
    submitUserGuess();
    return;
  }

  if (action === 'reveal-answer') {
    await revealAnswer('manual');
    return;
  }

  if (action === 'next-round') {
    await startRound();
    return;
  }

  if (action === 'custom') {
    openCustomSheet();
  }
}

function toggleCharacter(id) {
  if (!id) return;
  const index = state.selectedIds.indexOf(id);
  if (index >= 0) {
    state.selectedIds.splice(index, 1);
  } else {
    if (state.selectedIds.length >= 4) {
      showToast('桌子坐满啦，先请下一位下桌。');
      return;
    }
    state.selectedIds.push(id);
  }
  render();
}

function randomFill() {
  const shuffled = shuffleArray(state.characters.map((item) => item.id));
  state.selectedIds = shuffled.slice(0, 4);
  showToast('座位已经随缘安排好啦。');
  render();
}

async function startGame() {
  buildPlayers();
  if (state.players.length < 5) {
    showToast('组局失败，座位没凑齐。');
    return;
  }
  state.round = 0;
  state.score = { user: 0, ai: 0 };
  await startRound();
}

function buildPlayers() {
  const user = getUserPlayer();
  const selected = state.selectedIds
    .map((id) => state.characters.find((item) => item.id === id))
    .filter(Boolean)
    .slice(0, 4);

  const needed = Math.max(0, 4 - selected.length);
  const randoms = shuffleArray(RANDOM_AI_POOL)
    .slice(0, needed)
    .map((item, index) => ({
      id: `random_ai_${generateId('dg')}_${index}`,
      name: item.name,
      avatar: '',
      avatarText: item.avatarText,
      persona: item.persona,
      raw: null,
      isRandom: true,
      type: 'ai'
    }));

  state.players = [user, ...selected, ...randoms].slice(0, 5);
}

function getUserPlayer() {
  const settings = getData('app_settings', {}) || {};
  const appUser = getData('app_user', {}) || {};
  const user = settings.user || appUser || {};
  const name = user.name || appUser.name || '我';
  return {
    id: 'user',
    name,
    avatar: readImageValue(user.avatar) || readImageValue(appUser.avatar),
    avatarText: String(name).slice(0, 1) || '我',
    persona: '这位玩家会直接参与猜题，反应自然，喜欢看AI互相猜画。',
    raw: null,
    isRandom: false,
    type: 'user'
  };
}

async function startRound() {
  if (state.busy) return;
  state.busy = true;
  state.phase = 'playing';
  state.round += 1;
  state.guesses = [];
  state.roasts = [];
  state.userGuess = '';
  state.revealCount = 1;
  state.lastRoundResult = null;

  const aiPlayers = state.players.filter((item) => item.type === 'ai');
  state.artist = aiPlayers[Math.floor(Math.random() * aiPlayers.length)] || aiPlayers[0];

  renderLoadingRound();

  try {
    const wordInfo = await generateSecretWord();
    state.secretWord = wordInfo.word;
    state.category = wordInfo.category;
    state.strokes = await generateSvgStrokes(state.secretWord, state.category, state.artist);
    if (!state.strokes.length) {
      state.strokes = buildFallbackStrokes(state.secretWord);
    }
  } catch (error) {
    console.warn('[draw-guess] start round fallback:', error);
    const local = LOCAL_WORDS[Math.floor(Math.random() * LOCAL_WORDS.length)];
    state.secretWord = local.word;
    state.category = local.category;
    state.strokes = buildFallbackStrokes(local.word);
  }

  state.busy = false;
  render();

  if (state.settings.autoAiGuess) {
    setTimeout(() => {
      if (mounted && state.phase === 'playing') runAiGuessRound();
    }, 450);
  }
}

function renderLoadingRound() {
  if (!rootEl) return;
  rootEl.innerHTML = `
    <section class="draw-guess-app">
      <div class="dg-shell">
        <header class="dg-top">
          <button class="dg-icon-btn" data-action="to-lobby" aria-label="回大厅">${createIcon('chevron-left', 22)}</button>
          <div class="dg-title-block">
            <div class="dg-kicker">正在开局</div>
            <h2>画手在憋一个怪东西</h2>
          </div>
        </header>
        <div class="dg-loading-card">
          <div class="dg-scribble-loader">
            <span></span><span></span><span></span>
          </div>
          <p>题词、线条、离谱程度正在揉成一团。</p>
        </div>
      </div>
    </section>
  `;
  bindEvents();
}

async function generateSecretWord() {
  const localSeed = LOCAL_WORDS[Math.floor(Math.random() * LOCAL_WORDS.length)];

  const content = await askAIText([
    {
      role: 'system',
      content: [
        '我会为一个轻松搞笑的你画我猜游戏生成题词。',
        '我的题词会偏5G冲浪、网络梗、抽象生活、离谱但能猜。',
        '我不会生成攻击现实群体、仇恨、露骨色情或血腥内容。',
        '我只输出JSON：{"word":"题词","category":"类别"}。'
      ].join('\n')
    },
    {
      role: 'user',
      content: [
        `我现在想生成一个新的题词。参考味道可以像“${localSeed.word}”，但我会换一个新词。`,
        '我的输出必须是纯JSON，不加解释。'
      ].join('\n')
    }
  ], 0.95);

  const json = parseJsonObject(content);
  const word = String(json?.word || '').trim().slice(0, 18);
  const category = String(json?.category || '').trim().slice(0, 12);

  if (!word) return localSeed;
  return {
    word,
    category: category || '抽象梗'
  };
}

async function generateSvgStrokes(word, category, artist) {
  const content = await askAIText([
    {
      role: 'system',
      content: [
        '我会给一个你画我猜游戏画SVG线条画。',
        '我的画风是轻松、抽象、像随手涂鸦，不追求好看，重点是好猜又好笑。',
        '我会用第一人称理解画手状态，但输出只给JSON。',
        '我的SVG只使用这些标签：svg、g、path、line、circle、ellipse、rect、polyline、text。',
        '我的SVG不写script、不写foreignObject、不写外链图片。',
        '我会分成5步，每一步都是一个完整SVG字符串，从少量线条逐渐加笔画。',
        '我只输出JSON：{"strokes":["<svg ...>...</svg>"]}。'
      ].join('\n')
    },
    {
      role: 'user',
      content: [
        `我现在是画手${artist?.name || ''}。`,
        `我的说话/思考气质：${artist?.persona || '轻松自然，有一点吐槽感。'}`,
        `我要画的答案是：${word}`,
        `类别是：${category}`,
        '我会画得像人类在便签上乱画，线条简单，允许抽象，但不要写出答案文字。',
        '我会让每一步SVG都能直接放进页面显示。'
      ].join('\n')
    }
  ], 0.82);

  const json = parseJsonObject(content);
  const strokes = Array.isArray(json?.strokes) ? json.strokes : [];
  return strokes
    .map((svg) => sanitizeSvg(String(svg || '')))
    .filter(Boolean)
    .slice(0, 5);
}

async function runAiGuessRound() {
  if (state.busy || state.phase !== 'playing') return;
  state.busy = true;
  render();

  const guessers = state.players.filter((item) => item.type === 'ai' && item.id !== state.artist?.id);
  const visibleSvg = getVisibleSvg();

  try {
    const results = await Promise.all(guessers.map((player) => askAiGuess(player, visibleSvg)));
    results.forEach((result) => addGuess(result));
    await maybeRevealIfCorrect();
  } catch (error) {
    console.warn('[draw-guess] ai guess fallback:', error);
    guessers.forEach((player) => {
      addGuess({
        player,
        name: player.name,
        guess: randomWrongGuess(),
        comment: randomRoast(player),
        correct: false
      });
    });
  }

  state.busy = false;
  render();
}

async function askAiGuess(player, visibleSvg) {
  const otherGuesses = state.guesses.map((item) => `${item.name}猜：${item.guess}`).join('\n') || '暂时没人猜出来。';

  const content = await askAIText([
    {
      role: 'system',
      content: [
        '我正在玩你画我猜。',
        '我会根据自己的性格猜这幅抽象SVG画的答案。',
        '我可以轻微吐槽，可以说一点脏话口癖，但我不会攻击现实群体，也不会说仇恨内容。',
        '我不会知道真正答案，除非画里已经明显透露。',
        '我只输出JSON：{"guess":"我的猜测","comment":"我的吐槽"}。'
      ].join('\n')
    },
    {
      role: 'user',
      content: [
        `我叫${player.name}。`,
        `我的性格和说话方式：${player.persona || '自然、活泼、会吐槽。'}`,
        `当前题目类别：${state.category}`,
        `我看到的SVG是：${visibleSvg}`,
        `其他人的猜测：\n${otherGuesses}`,
        '我现在会猜什么？我会怎么吐槽这幅画？',
        '我的输出保持短一点，像真实聊天，不要说明我是被创建的角色。'
      ].join('\n')
    }
  ], 0.9);

  const json = parseJsonObject(content);
  const guess = String(json?.guess || randomWrongGuess()).trim().slice(0, 24);
  const comment = String(json?.comment || randomRoast(player)).trim().slice(0, 80);

  return {
    player,
    name: player.name,
    guess,
    comment,
    correct: isCorrectGuess(guess, state.secretWord)
  };
}

function addGuess(item) {
  const guess = {
    id: generateId('guess'),
    player: item.player,
    playerId: item.player?.id,
    name: item.name || item.player?.name || '某位选手',
    guess: item.guess || '我脑子空了',
    comment: item.comment || '',
    correct: Boolean(item.correct),
    createdAt: getNow()
  };

  state.guesses.push(guess);

  if (guess.comment) {
    state.roasts.push({
      id: generateId('roast'),
      name: guess.name,
      text: guess.comment,
      createdAt: getNow()
    });
  }
}

function submitUserGuess() {
  const input = rootEl?.querySelector('[data-role="user-guess"]');
  const text = String(input?.value || state.userGuess || '').trim();

  if (!text) {
    showToast('先写个猜测嘛。');
    return;
  }

  const user = state.players.find((item) => item.id === 'user') || getUserPlayer();
  const correct = isCorrectGuess(text, state.secretWord);

  addGuess({
    player: user,
    name: user.name,
    guess: text,
    comment: correct ? '我居然猜中了，这画突然合理起来了。' : '我先瞎猜一个，万一世界就是这么抽象。',
    correct
  });

  state.userGuess = '';
  if (correct) {
    revealAnswer('user-correct');
  } else {
    state.roasts.push({
      id: generateId('roast'),
      name: '纸条',
      text: '没中，但这个答案看起来也挺像，画手先背一半锅。',
      createdAt: getNow()
    });
    render();
  }
}

async function maybeRevealIfCorrect() {
  const hasCorrect = state.guesses.some((item) => item.correct);
  if (hasCorrect) {
    await revealAnswer('ai-correct');
  }
}

function addStroke() {
  if (state.revealCount >= state.strokes.length) {
    showToast('已经没有更多笔画啦。');
    return;
  }
  state.revealCount += 1;
  state.roasts.push({
    id: generateId('roast'),
    name: '画板',
    text: '画手又补了一笔，事情好像更复杂了。',
    createdAt: getNow()
  });
  render();

  if (state.settings.autoAiGuess) {
    setTimeout(() => {
      if (mounted && state.phase === 'playing') runAiGuessRound();
    }, 320);
  }
}

async function revealAnswer(reason = 'manual') {
  if (state.phase === 'revealed') return;
  state.phase = 'revealed';
  state.revealCount = state.strokes.length;

  const winnerGuess = state.guesses.find((item) => item.correct);
  const userWon = winnerGuess?.playerId === 'user';

  if (winnerGuess) {
    if (userWon) state.score.user += 1;
    else state.score.ai += 1;
  }

  state.lastRoundResult = {
    id: generateId('dg_round'),
    word: state.secretWord,
    category: state.category,
    artistId: state.artist?.id,
    artistName: state.artist?.name,
    guesses: state.guesses.map((item) => ({
      name: item.name,
      guess: item.guess,
      correct: item.correct
    })),
    result: winnerGuess ? `${winnerGuess.name}猜中了` : '无人猜中',
    reason,
    createdAt: getNow()
  };

  state.roasts.push({
    id: generateId('roast'),
    name: '答案卡',
    text: winnerGuess
      ? `答案是“${state.secretWord}”，${winnerGuess.name}居然真给猜出来了。`
      : `答案是“${state.secretWord}”，这画确实有点为难人。`,
    createdAt: getNow()
  });

  await writeRoundMemories();
  render();
}

async function writeRoundMemories() {
  const existingPlayers = state.players.filter((item) => item.type === 'ai' && !item.isRandom && item.id);
  if (!existingPlayers.length || !state.lastRoundResult) return;

  const guessedText = state.guesses
    .slice(-6)
    .map((item) => `${item.name}猜“${item.guess}”${item.correct ? '，猜中了' : ''}`)
    .join('；');

  await Promise.all(existingPlayers.map(async (player) => {
    const content = [
      `我和大家玩了一局“AI灵魂画手”。`,
      `题目是“${state.secretWord}”，类别是“${state.category}”。`,
      `画手是${state.artist?.name || '某位AI'}。`,
      guessedText ? `这一局大家的反应：${guessedText}。` : '',
      `这局给我的感觉是轻松、抽象、很好笑。`
    ].filter(Boolean).join('');

    const memory = {
      id: generateId('memory'),
      characterId: player.id,
      content,
      source: 'auto',
      createdAt: getNow(),
      updatedAt: getNow()
    };

    try {
      await setDB('memories', memory);
    } catch (error) {
      console.warn('[draw-guess] write memory failed:', error);
    }
  }));
}

function getVisibleSvg() {
  if (!state.strokes.length) return buildFallbackStrokes(state.secretWord || '抽象')[0];
  const index = Math.max(0, Math.min(state.revealCount - 1, state.strokes.length - 1));
  return state.strokes[index];
}

function buildFallbackStrokes(word) {
  const seed = stringSeed(word || 'draw');
  const lines = [];
  for (let i = 0; i < 5; i += 1) {
    const x1 = 35 + ((seed + i * 37) % 220);
    const y1 = 35 + ((seed + i * 53) % 160);
    const x2 = 55 + ((seed + i * 71) % 230);
    const y2 = 55 + ((seed + i * 29) % 160);
    const cx = 60 + ((seed + i * 43) % 210);
    const cy = 50 + ((seed + i * 61) % 150);

    lines.push(`
      <path d="M ${x1} ${y1} C ${cx} ${cy}, ${x2 - 30} ${y2 + 25}, ${x2} ${y2}" />
      <circle cx="${cx}" cy="${cy}" r="${12 + (i * 3)}" />
    `);
  }

  return [1, 2, 3, 4, 5].map((count) => sanitizeSvg(`
    <svg viewBox="0 0 320 220" xmlns="http://www.w3.org/2000/svg">
      <g fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
        ${lines.slice(0, count).join('')}
      </g>
    </svg>
  `));
}

function stringSeed(text) {
  return String(text).split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function randomWrongGuess() {
  const pool = ['一只崩溃的猫', '电子榨菜', '加班人的灵魂', '赛博土豆', '显眼包开会', '精神状态良好', '被窝封印术'];
  return pool[Math.floor(Math.random() * pool.length)];
}

function randomRoast(player) {
  const pool = [
    '这线条看起来像脑子断网了。',
    '我理解了，但我不完全理解。',
    '画手是不是把答案也画丢了。',
    '这很艺术，艺术到有点缺德。',
    '我先猜一个，错了就怪画。'
  ];
  return pool[Math.floor(Math.random() * pool.length)];
}

function isCorrectGuess(guess, answer) {
  const a = normalizeGuess(guess);
  const b = normalizeGuess(answer);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function normalizeGuess(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[，。！？、,.!?'"“”‘’：:；;（）()【】[\]{}]/g, '');
}

async function askAIText(messages, temperature = 0.8) {
  const result = await silentRequest({
    messages,
    temperature,
    max_tokens: 1200
  });

  if (typeof result === 'string') return result;
  return result?.content || result?.text || result?.message || '';
}

function parseJsonObject(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (_) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (error) {
      console.warn('[draw-guess] parse json failed:', error);
      return null;
    }
  }
}

function sanitizeSvg(svg) {
  let clean = String(svg || '').trim();
  if (!clean.includes('<svg')) return '';

  clean = clean
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/href\s*=\s*["'][^"']*["']/gi, '');

  const svgMatch = clean.match(/<svg[\s\S]*<\/svg>/i);
  clean = svgMatch ? svgMatch[0] : '';

  if (!clean) return '';

  if (!/viewBox=/i.test(clean)) {
    clean = clean.replace('<svg', '<svg viewBox="0 0 320 220"');
  }

  clean = clean
    .replace(/stroke="[^"]*"/gi, 'stroke="currentColor"')
    .replace(/fill="(?!none)[^"]*"/gi, 'fill="none"');

  return clean;
}

function resetRoundOnly() {
  state.phase = 'lobby';
  state.artist = null;
  state.secretWord = '';
  state.category = '';
  state.strokes = [];
  state.revealCount = 1;
  state.guesses = [];
  state.roasts = [];
  state.userGuess = '';
  state.busy = false;
}

function openCustomSheet() {
  const wrap = document.createElement('div');
  wrap.className = 'dg-sheet';
  wrap.innerHTML = `
    <div class="dg-sheet-head">
      <h3>给画室换个小背景</h3>
      <p>轻一点就好，别把抽象线条盖住啦。</p>
    </div>

    <div class="dg-sheet-actions">
      <label class="dg-upload-btn">
        ${createIcon('image', 19)}
        <span>上传背景</span>
        <input type="file" accept="image/*" data-role="bg-file">
      </label>
      <button class="dg-soft-btn" data-action="clear-bg">清除背景</button>
    </div>

    <label class="dg-range-row">
      <span>背景透明度</span>
      <input type="range" min="0.08" max="0.6" step="0.02" value="${Number(state.bgRecord?.opacity ?? state.settings.backgroundOpacity ?? 0.28)}" data-role="bg-opacity">
    </label>

    <label class="dg-toggle-row">
      <span>AI自动猜</span>
      <input type="checkbox" data-role="auto-ai" ${state.settings.autoAiGuess ? 'checked' : ''}>
    </label>

    <label class="dg-toggle-row">
      <span>允许轻微吐槽</span>
      <input type="checkbox" data-role="allow-roast" ${state.settings.allowRoast ? 'checked' : ''}>
    </label>
  `;

  showBottomSheet(wrap);

  const fileInput = wrap.querySelector('[data-role="bg-file"]');
  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const image = await compressImage(file, 1600, 0.86);
      const record = {
        key: BG_KEY,
        value: image,
        source: image,
        opacity: Number(state.bgRecord?.opacity ?? state.settings.backgroundOpacity ?? 0.28),
        updatedAt: getNow()
      };
      await setDB('blobs', record);
      state.bgRecord = record;
      showToast('画室背景换好啦。');
      hideBottomSheet();
      render();
    } catch (error) {
      console.warn('[draw-guess] upload bg failed:', error);
      showToast('背景上传失败了。');
    }
  });

  wrap.querySelector('[data-action="clear-bg"]')?.addEventListener('click', async () => {
    await deleteDB('blobs', BG_KEY).catch(() => {});
    state.bgRecord = null;
    showToast('背景清掉啦。');
    hideBottomSheet();
    render();
  });

  wrap.querySelector('[data-role="bg-opacity"]')?.addEventListener('input', async (event) => {
    const opacity = Number(event.target.value);
    state.settings.backgroundOpacity = opacity;
    if (state.bgRecord) {
      state.bgRecord.opacity = opacity;
      await setDB('blobs', { ...state.bgRecord, key: BG_KEY, updatedAt: getNow() }).catch(() => {});
    }
    await saveSettings();
    render();
  });

  wrap.querySelector('[data-role="auto-ai"]')?.addEventListener('change', async (event) => {
    state.settings.autoAiGuess = event.target.checked;
    await saveSettings();
  });

  wrap.querySelector('[data-role="allow-roast"]')?.addEventListener('change', async (event) => {
    state.settings.allowRoast = event.target.checked;
    await saveSettings();
  });
}

async function saveSettings() {
  await setData(SETTINGS_KEY, { ...state.settings });
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .draw-guess-app {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      color: var(--text-primary);
      background: var(--bg-primary);
      font-size: var(--font-size-base);
      line-height: 1.6;
      touch-action: manipulation;
    }

    .draw-guess-app * {
      box-sizing: border-box;
      -webkit-tap-highlight-color: transparent;
    }

    .dg-bg {
      position: absolute;
      inset: 0;
      background-image: var(--dg-bg-image);
      background-size: cover;
      background-position: center;
      opacity: var(--dg-bg-opacity, 0);
      pointer-events: none;
    }

    .dg-bg::after {
      content: "";
      position: absolute;
      inset: 0;
      background: var(--bg-primary);
      opacity: 0.18;
    }

    .dg-shell {
      position: relative;
      z-index: 1;
      height: 100%;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      padding: 18px 20px 24px;
    }

    .dg-top {
      flex: 0 0 auto;
      display: grid;
      grid-template-columns: 44px 1fr 44px;
      align-items: center;
      gap: 12px;
      padding: 4px 0 14px;
    }

    .dg-icon-btn,
    .dg-soft-btn,
    .dg-primary,
    .dg-character-card,
    .dg-upload-btn {
      appearance: none;
      outline: none;
      border-color: transparent;
      color: var(--text-primary);
      transition: all 200ms ease;
      font: inherit;
    }

    .dg-icon-btn:active,
    .dg-soft-btn:active,
    .dg-primary:active,
    .dg-character-card:active,
    .dg-upload-btn:active {
      transform: scale(0.96);
    }

    .dg-icon-btn {
      width: 44px;
      height: 44px;
      display: grid;
      place-items: center;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      border-radius: 18px;
    }

    .dg-title-block {
      min-width: 0;
      text-align: center;
    }

    .dg-kicker {
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.2;
    }

    .dg-title-block h2 {
      margin: 2px 0 0;
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.25;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .dg-lobby,
    .dg-game {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      padding: 4px 0 10px;
    }

    .dg-lobby::-webkit-scrollbar,
    .dg-game::-webkit-scrollbar {
      display: none;
    }

    .dg-hero-card,
    .dg-board-card,
    .dg-guess-panel,
    .dg-roast-panel,
    .dg-guesses,
    .dg-section,
    .dg-loading-card {
      background: color-mix(in srgb, var(--bg-card) 88%, transparent);
      box-shadow: var(--shadow-md);
      border-radius: 24px;
    }

    .dg-hero-card {
      position: relative;
      padding: 24px;
      overflow: hidden;
    }

    .dg-paper-pin {
      position: absolute;
      right: 28px;
      top: 22px;
      width: 34px;
      height: 34px;
      border-radius: 50%;
      background: var(--accent-light);
      opacity: 0.55;
      transform: rotate(12deg);
    }

    .dg-hand-title {
      position: relative;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin-bottom: 10px;
    }

    .dg-hero-card p,
    .dg-section-head p,
    .dg-empty-card p {
      margin: 0;
      color: var(--text-secondary);
      font-size: var(--font-size-base);
      line-height: 1.7;
    }

    .dg-hero-actions,
    .dg-board-actions,
    .dg-sheet-actions {
      display: flex;
      gap: 10px;
      margin-top: 18px;
      flex-wrap: wrap;
    }

    .dg-primary {
      min-height: 42px;
      padding: 0 18px;
      border-radius: 18px;
      background: var(--accent);
      color: var(--bubble-user-text);
      box-shadow: var(--shadow-sm);
      font-weight: 600;
    }

    .dg-soft-btn,
    .dg-upload-btn {
      min-height: 42px;
      padding: 0 15px;
      border-radius: 18px;
      background: var(--bg-secondary);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      font-weight: 500;
    }

    .dg-soft-btn:disabled,
    .dg-primary:disabled {
      opacity: 0.45;
      transform: none;
    }

    .dg-section {
      margin-top: 16px;
      padding: 18px;
    }

    .dg-section-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 14px;
    }

    .dg-section-head h3,
    .dg-guess-panel h3,
    .dg-roast-panel h3,
    .dg-guesses h3 {
      margin: 0;
      font-size: var(--font-size-title);
      font-weight: 600;
    }

    .dg-character-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .dg-character-card {
      min-height: 128px;
      padding: 14px;
      border-radius: 22px;
      background: var(--bg-secondary);
      box-shadow: var(--shadow-sm);
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      text-align: left;
      gap: 9px;
    }

    .dg-character-card.is-selected {
      background: var(--accent-light);
    }

    .dg-character-card[data-disabled="true"] {
      opacity: 0.48;
    }

    .dg-avatar,
    .dg-mini-avatar {
      flex: 0 0 auto;
      display: grid;
      place-items: center;
      overflow: hidden;
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
    }

    .dg-avatar {
      width: 48px;
      height: 48px;
      border-radius: 18px;
      font-weight: 700;
    }

    .dg-mini-avatar {
      width: 30px;
      height: 30px;
      border-radius: 13px;
      font-size: var(--font-size-small);
      font-weight: 700;
    }

    .dg-avatar img,
    .dg-mini-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .dg-char-name {
      font-weight: 600;
      line-height: 1.25;
    }

    .dg-char-note {
      color: var(--text-secondary);
      font-size: var(--font-size-small);
    }

    .dg-empty-card {
      grid-column: 1 / -1;
      padding: 18px;
      border-radius: 22px;
      background: var(--bg-secondary);
    }

    .dg-empty-title {
      font-weight: 600;
      margin-bottom: 4px;
    }

    .dg-score-row {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      overscroll-behavior-x: contain;
      padding: 2px 0 12px;
    }

    .dg-score-row::-webkit-scrollbar {
      display: none;
    }

    .dg-player-chip {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      min-height: 38px;
      padding: 4px 12px 4px 5px;
      border-radius: 18px;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      color: var(--text-secondary);
      font-size: var(--font-size-small);
    }

    .dg-player-chip.is-artist {
      background: var(--accent-light);
      color: var(--text-primary);
      font-weight: 600;
    }

    .dg-board-card {
      padding: 16px;
    }

    .dg-board-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 12px;
    }

    .dg-label {
      display: block;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.2;
    }

    .dg-board-head strong {
      font-size: var(--font-size-title);
      font-weight: 600;
    }

    .dg-board {
      position: relative;
      height: min(46vh, 360px);
      min-height: 270px;
      border-radius: 26px;
      background:
        radial-gradient(circle at 18% 22%, color-mix(in srgb, var(--accent-light) 36%, transparent) 0 1px, transparent 2px),
        var(--bg-secondary);
      background-size: 22px 22px, auto;
      box-shadow: inset 0 0 0 999px color-mix(in srgb, var(--bg-card) 6%, transparent);
      overflow: hidden;
    }

    .dg-board::before,
    .dg-board::after {
      content: "";
      position: absolute;
      background: currentColor;
      color: var(--text-hint);
      opacity: 0.22;
      border-radius: 999px;
      pointer-events: none;
    }

    .dg-board::before {
      width: 120px;
      height: 5px;
      left: 22px;
      top: 22px;
      transform: rotate(-3deg);
    }

    .dg-board::after {
      width: 80px;
      height: 5px;
      right: 34px;
      bottom: 26px;
      transform: rotate(4deg);
    }

    .dg-board-svg {
      position: absolute;
      inset: 16px;
      display: grid;
      place-items: center;
      color: var(--text-primary);
      animation: dg-pop 260ms ease both;
    }

    .dg-board-svg svg {
      width: 100%;
      height: 100%;
      max-height: 100%;
      color: var(--text-primary);
    }

    .dg-board-svg path,
    .dg-board-svg line,
    .dg-board-svg circle,
    .dg-board-svg ellipse,
    .dg-board-svg rect,
    .dg-board-svg polyline {
      vector-effect: non-scaling-stroke;
      stroke: currentColor;
      stroke-width: 4;
      stroke-linecap: round;
      stroke-linejoin: round;
      fill: none;
    }

    .dg-board-svg text {
      fill: var(--text-secondary);
      font-size: 14px;
    }

    .dg-interact-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 12px;
      margin-top: 12px;
    }

    .dg-guess-panel,
    .dg-roast-panel,
    .dg-guesses {
      padding: 16px;
    }

    .dg-input-row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
      margin-top: 12px;
    }

    .dg-input {
      width: 100%;
      min-height: 44px;
      padding: 0 14px;
      border-radius: 18px;
      appearance: none;
      outline: none;
      border-color: transparent;
      background: var(--bg-secondary);
      color: var(--text-primary);
      font: inherit;
      font-size: 16px;
    }

    .dg-send {
      min-width: 72px;
      padding: 0 14px;
    }

    .dg-answer-peek {
      margin-top: 12px;
      padding: 12px 14px;
      border-radius: 18px;
      background: var(--bg-secondary);
      display: none;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .dg-answer-peek.is-show {
      display: flex;
    }

    .dg-answer-peek span {
      color: var(--text-secondary);
      font-size: var(--font-size-small);
    }

    .dg-note-list {
      display: grid;
      gap: 9px;
      margin-top: 12px;
    }

    .dg-note {
      padding: 11px 13px;
      border-radius: 18px 18px 18px 8px;
      background: var(--accent-light);
      box-shadow: var(--shadow-sm);
      transform: rotate(-1deg);
    }

    .dg-note:nth-child(2n) {
      transform: rotate(1deg);
      background: var(--bg-secondary);
    }

    .dg-note b {
      display: block;
      font-size: var(--font-size-small);
      margin-bottom: 2px;
    }

    .dg-note span,
    .dg-note-muted {
      color: var(--text-secondary);
      font-size: var(--font-size-small);
    }

    .dg-guess-list {
      display: grid;
      gap: 10px;
    }

    .dg-guess-item {
      display: grid;
      grid-template-columns: 34px 1fr;
      gap: 10px;
      padding: 12px;
      border-radius: 20px;
      background: var(--bg-secondary);
      box-shadow: var(--shadow-sm);
    }

    .dg-guess-item.is-correct {
      background: var(--accent-light);
    }

    .dg-guess-item b {
      display: block;
      font-weight: 600;
      line-height: 1.25;
    }

    .dg-guess-item p {
      margin: 3px 0 0;
      color: var(--text-primary);
    }

    .dg-guess-item span {
      display: block;
      margin-top: 3px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
    }

    .dg-empty-guess {
      padding: 16px;
      border-radius: 20px;
      background: var(--bg-secondary);
      color: var(--text-secondary);
      text-align: center;
    }

    .dg-loading-card {
      margin-top: 20px;
      padding: 28px 22px;
      text-align: center;
    }

    .dg-scribble-loader {
      height: 88px;
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 8px;
    }

    .dg-scribble-loader span {
      width: 58px;
      height: 10px;
      border-radius: 999px;
      background: var(--accent);
      opacity: 0.75;
      animation: dg-wiggle 700ms ease-in-out infinite alternate;
    }

    .dg-scribble-loader span:nth-child(2) {
      width: 42px;
      animation-delay: 120ms;
      transform: rotate(-8deg);
    }

    .dg-scribble-loader span:nth-child(3) {
      width: 70px;
      animation-delay: 240ms;
      transform: rotate(7deg);
    }

    .dg-loading-card p {
      color: var(--text-secondary);
      margin: 0;
    }

    .dg-sheet {
      padding: 4px 2px 18px;
      color: var(--text-primary);
    }

    .dg-sheet-head h3 {
      margin: 0;
      font-size: var(--font-size-title);
      font-weight: 600;
    }

    .dg-sheet-head p {
      margin: 4px 0 0;
      color: var(--text-secondary);
    }

    .dg-upload-btn {
      position: relative;
      overflow: hidden;
    }

    .dg-upload-btn input {
      position: absolute;
      inset: 0;
      opacity: 0;
    }

    .dg-range-row,
    .dg-toggle-row {
      margin-top: 14px;
      min-height: 48px;
      padding: 0 14px;
      border-radius: 18px;
      background: var(--bg-secondary);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .dg-range-row input {
      width: 44%;
      accent-color: var(--accent);
    }

    .dg-toggle-row input {
      width: 22px;
      height: 22px;
      accent-color: var(--accent);
    }

    @keyframes dg-pop {
      from {
        opacity: 0;
        transform: scale(0.96) rotate(-1deg);
      }
      to {
        opacity: 1;
        transform: scale(1) rotate(0);
      }
    }

    @keyframes dg-wiggle {
      from {
        transform: translateY(-4px) rotate(-5deg);
      }
      to {
        transform: translateY(5px) rotate(6deg);
      }
    }
  `;

  document.head.appendChild(style);
}

function shuffleArray(list) {
  return [...list].sort(() => Math.random() - 0.5);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#096;');
}

function escapeCssUrl(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// 依赖：../../core/storage.js(getData,setData,getAllDB,getDB,setapps/games/draw-guess.js

这是“你画我猜 / AI灵魂画手”游戏文件：5人组局，AI用 SVG 抽象作画，用户和AI一起猜，风格是轻松涂鸦杂志风。

```js
/* imports:
  getData,setData,getAllDB,getDB,setDB,deleteDB,generateId,getNow,compressImage from ../../core/storage.js
  createIcon,showToast,showBottomSheet,hideBottomSheet,showConfirm from ../../core/ui.js
  silentRequest from ../../core/api.js
*/
import {
  getData,
  setData,
  getAllDB,
  getDB,
  setDB,
  deleteDB,
  generateId,
  getNow,
  compressImage
} from '../../core/storage.js';
import {
  createIcon,
  showToast,
  showBottomSheet,
  hideBottomSheet,
  showConfirm
} from '../../core/ui.js';
import { silentRequest } from '../../core/api.js';

const GAME_KEY = 'draw_guess_state';
const SETTINGS_KEY = 'draw_guess_settings';
const BG_KEY = 'app_bg_draw_guess';

let hostEl = null;
let onBackHandler = null;
let mounted = false;

let state = {
  selectedIds: [],
  players: [],
  phase: 'lobby',
  secretWord: '',
  category: '',
  strokes: [],
  revealCount: 0,
  guesses: [],
  roasts: [],
  score: {},
  round: 0,
  artistId: '',
  artistName: '',
  busy: false
};

let settings = {
  bgOpacity: 0.2,
  soundEnabled: true
};

const RANDOM_PERSONAS = [
  {
    name: '桃汽水',
    personality: '嘴很甜但吐槽很准，喜欢把任何东西说成甜品灾难现场',
    style: '轻快、撒娇、突然补刀'
  },
  {
    name: '阿困',
    personality: '永远像刚睡醒，猜东西靠玄学，偶尔灵光一闪',
    style: '慢半拍、冷幽默、短句'
  },
  {
    name: '纸片狗',
    personality: '热血笨蛋，看到什么都先夸，再大声猜错',
    style: '元气、夸张、很会接梗'
  },
  {
    name: '酸梅',
    personality: '表面冷静，实际很爱阴阳怪气，猜错也要嘴硬',
    style: '犀利、轻微毒舌、活人感'
  },
  {
    name: '乱码猫',
    personality: '5G冲浪过量，满嘴抽象梗，脑回路跳跃',
    style: '抽象、搞笑、像弹幕'
  },
  {
    name: '小票根',
    personality: '观察细节很认真，但经常认真地跑偏',
    style: '认真分析、突然离谱'
  },
  {
    name: '爆米花',
    personality: '看热闹不嫌事大，最爱起哄和拱火',
    style: '快乐、吐槽、轻微嘴欠'
  },
  {
    name: '绒绒',
    personality: '温柔但有点天然黑，讲话软软的但杀伤力不低',
    style: '软萌、委婉、补刀'
  }
];

const FALLBACK_WORDS = [
  { category: '网络梗', word: '电子榨菜' },
  { category: '网络梗', word: '脆皮大学生' },
  { category: '网络梗', word: '显眼包' },
  { category: '网络梗', word: '赛博上香' },
  { category: '网络梗', word: '一键三连' },
  { category: '网络梗', word: '班味' },
  { category: '抽象词', word: '窝囊废文学' },
  { category: '抽象词', word: '发疯文学' },
  { category: '抽象词', word: '鼠鼠我呀' },
  { category: '抽象词', word: '互联网嘴替' },
  { category: '日常', word: '外卖骑手迷路' },
  { category: '日常', word: '早八灵魂出窍' },
  { category: '动物', word: '猫猫审判人类' },
  { category: '情绪', word: '突然破防' },
  { category: '赛博生活', word: '手机电量焦虑' },
  { category: '赛博生活', word: 'WiFi断了像失恋' }
];

const SVG_COLORS = [
  'var(--text-primary)',
  'var(--accent)',
  'var(--accent-dark)',
  'var(--text-secondary)'
];

export async function mount(container, options = {}) {
  hostEl = container;
  onBackHandler = options.onBack || null;
  mounted = true;

  await loadSettings();
  await loadSavedState();
  render();
  await hydrateBackground();
}

export function unmount() {
  mounted = false;
  hideBottomSheet();
  if (hostEl) hostEl.innerHTML = '';
  hostEl = null;
  onBackHandler = null;
}

async function loadSettings() {
  settings = {
    ...settings,
    ...(getData(SETTINGS_KEY, {}) || {})
  };
}

async function saveSettings() {
  setData(SETTINGS_KEY, settings);
}

async function loadSavedState() {
  const saved = getData(GAME_KEY, null);
  if (saved && Array.isArray(saved.players)) {
    state = {
      ...state,
      ...saved,
      busy: false
    };
  }
}

function saveState() {
  setData(GAME_KEY, {
    selectedIds: state.selectedIds,
    players: state.players,
    phase: state.phase,
    secretWord: state.secretWord,
    category: state.category,
    strokes: state.strokes,
    revealCount: state.revealCount,
    guesses: state.guesses,
    roasts: state.roasts,
    score: state.score,
    round: state.round,
    artistId: state.artistId,
    artistName: state.artistName
  });
}

async function hydrateBackground() {
  if (!hostEl) return;
  const bg = await getDB('blobs', BG_KEY).catch(() => null);
  const image = bg?.value || bg?.source || bg?.imageBase64 || bg?.image || '';
  hostEl.style.setProperty('--draw-bg-image', image ? `url("${cssUrl(image)}")` : 'none');
  hostEl.style.setProperty('--draw-bg-opacity', String(settings.bgOpacity ?? 0.2));
}

function cssUrl(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '');
}

function render() {
  if (!hostEl || !mounted) return;

  hostEl.innerHTML = `
    <div class="draw-guess-page">
      <style>${styleText()}</style>
      <div class="draw-bg-layer"></div>

      <header class="draw-topbar">
        <button class="draw-icon-btn" data-action="back" aria-label="返回">
          ${createIcon('chevron-left', 22)}
        </button>
        <div class="draw-title-wrap">
          <div class="draw-kicker">AI 灵魂画手</div>
          <h1>你画我猜</h1>
        </div>
        <button class="draw-icon-btn" data-action="customize" aria-label="装扮">
          ${createIcon('settings', 21)}
        </button>
      </header>

      ${state.phase === 'lobby' ? renderLobby() : renderGame()}

      <div class="draw-toast-line" aria-hidden="true"></div>
    </div>
  `;

  bindEvents();
  hydrateBackground();
}

function renderLobby() {
  return `
    <main class="draw-lobby">
      <section class="draw-hero-card">
        <div class="draw-hero-doodle">
          <svg viewBox="0 0 220 130" aria-hidden="true">
            <path d="M28 83 C40 18, 95 35, 80 77 S142 115, 159 65 S194 34, 199 86" />
            <circle cx="63" cy="54" r="9" />
            <path d="M127 38 l18 18 l-16 16 l-18 -18 z" />
            <path d="M39 104 C78 93, 118 100, 181 94" />
            <path d="M172 31 q18 7 13 25" />
          </svg>
        </div>
        <div>
          <p class="draw-pill">5人局 · SVG抽象作画 · 全员乱猜</p>
          <h2>来看看 AI 的灵魂画技到底长什么样</h2>
          <p class="draw-desc">选几个熟人来组局，不够就随机匹配鲜活路人。TA们会按自己的性格猜、吐槽、嘴硬。</p>
        </div>
      </section>

      <section class="draw-panel">
        <div class="draw-section-head">
          <div>
            <h3>组局名单</h3>
            <p>含你自己一共 5 位，最多选 4 个 AI。</p>
          </div>
          <button class="draw-soft-btn" data-action="pick-players">${createIcon('users', 18)}选人</button>
        </div>
        <div class="draw-player-strip">
          ${renderLobbyPlayers()}
        </div>
      </section>

      <section class="draw-panel draw-rules">
        <h3>这局怎么玩</h3>
        <div class="draw-rule-grid">
          <div><b>1</b><span>随机生成网络梗题词</span></div>
          <div><b>2</b><span>AI 用 SVG 分段作画</span></div>
          <div><b>3</b><span>你和其他 AI 一起猜</span></div>
          <div><b>4</b><span>猜不出就加一笔并互相吐槽</span></div>
        </div>
      </section>

      <button class="draw-start-btn" data-action="start-game">
        开始灵魂作画
      </button>
    </main>
  `;
}

function renderLobbyPlayers() {
  const selected = state.players?.length ? state.players : buildPreviewPlayers();
  return selected.map(player => renderPlayerChip(player)).join('');
}

function buildPreviewPlayers() {
  const user = getUserPlayer();
  return [
    user,
    ...state.selectedIds.map(id => ({
      id,
      type: 'ai',
      name: '已选角色',
      avatar: '',
      isRealCharacter: true,
      characterId: id
    })),
    ...Array.from({ length: Math.max(0, 5 - 1 - state.selectedIds.length) }).map((_, index) => ({
      id: `preview_${index}`,
      type: 'random',
      name: RANDOM_PERSONAS[index]?.name || '路人AI',
      avatar: '',
      isRealCharacter: false
    }))
  ].slice(0, 5);
}

function renderPlayerChip(player) {
  return `
    <div class="draw-player-chip ${player.type === 'user' ? 'is-user' : ''}">
      <div class="draw-avatar">${renderAvatar(player)}</div>
      <div>
        <strong>${escapeHtml(player.name || '匿名选手')}</strong>
        <span>${player.type === 'user' ? '你来猜' : player.isRealCharacter ? '熟人局' : '随机匹配'}</span>
      </div>
    </div>
  `;
}

function renderGame() {
  return `
    <main class="draw-game">
      <section class="draw-score-row">
        <button class="draw-soft-btn" data-action="new-round">${createIcon('refresh-cw', 17)}新一轮</button>
        <div class="draw-round-card">
          <span>第 ${state.round || 1} 轮</span>
          <strong>${state.phase === 'revealed' ? '答案已公开' : '正在乱猜'}</strong>
        </div>
        <button class="draw-soft-btn" data-action="open-roasts">${createIcon('message-circle', 17)}吐槽</button>
      </section>

      <section class="draw-board-card">
        <div class="draw-board-head">
          <div>
            <p>本轮画手</p>
            <h2>${escapeHtml(state.artistName || '神秘画手')}</h2>
          </div>
          <div class="draw-secret-card ${state.phase === 'revealed' ? 'is-open' : ''}">
            <span>${escapeHtml(state.category || '抽象题')}</span>
            <strong>${state.phase === 'revealed' ? escapeHtml(state.secretWord) : '答案盖住了'}</strong>
          </div>
        </div>

        <div class="draw-canvas-wrap">
          <div class="draw-paper-tape"></div>
          <div class="draw-svg-board">
            ${renderSvgBoard()}
          </div>
        </div>

        <div class="draw-action-row">
          <button class="draw-soft-btn" data-action="ai-guess" ${state.busy ? 'disabled' : ''}>
            ${createIcon('sparkles', 17)}AI猜一轮
          </button>
          <button class="draw-soft-btn" data-action="add-stroke" ${state.busy || state.phase === 'revealed' ? 'disabled' : ''}>
            ${createIcon('edit-3', 17)}加一笔
          </button>
          <button class="draw-danger-btn" data-action="reveal-answer" ${state.phase === 'revealed' ? 'disabled' : ''}>
            公布答案
          </button>
        </div>
      </section>

      <section class="draw-guess-box">
        <div class="draw-input-wrap">
          <input class="draw-guess-input" data-role="guess-input" placeholder="大胆猜一个，离谱也算参与" maxlength="36" />
          <button class="draw-send-btn" data-action="submit-guess">猜！</button>
        </div>
      </section>

      <section class="draw-live-grid">
        <div class="draw-panel">
          <div class="draw-section-head">
            <div>
              <h3>场上选手</h3>
              <p>猜对的会偷偷加分。</p>
            </div>
          </div>
          <div class="draw-player-list">
            ${(state.players || []).map(renderGamePlayer).join('')}
          </div>
        </div>

        <div class="draw-panel">
          <div class="draw-section-head">
            <div>
              <h3>猜测现场</h3>
              <p>这里经常比画更抽象。</p>
            </div>
          </div>
          <div class="draw-feed">
            ${renderGuessFeed()}
          </div>
        </div>
      </section>
    </main>
  `;
}

function renderSvgBoard() {
  const strokes = Array.isArray(state.strokes) ? state.strokes : [];
  if (!strokes.length) {
    return `
      <svg viewBox="0 0 360 260" class="draw-svg" aria-label="空画板">
        <path d="M88 135 C118 95, 175 99, 203 132 S265 171, 289 120" />
        <path d="M130 184 q74 28 142 -6" />
        <circle cx="116" cy="84" r="8" />
        <circle cx="253" cy="80" r="5" />
      </svg>
      <div class="draw-empty-note">画手还在憋第一笔...</div>
    `;
  }

  return `
    <svg viewBox="0 0 360 260" class="draw-svg" aria-label="AI画出来的抽象SVG">
      ${strokes.map((stroke, index) => renderStroke(stroke, index)).join('')}
    </svg>
  `;
}

function renderStroke(stroke, index) {
  const color = SVG_COLORS[index % SVG_COLORS.length];
  if (typeof stroke === 'string') return sanitizeSvgStroke(stroke, color);

  const type = stroke?.type || 'path';
  if (type === 'circle') {
    return `<circle cx="${num(stroke.cx, 120)}" cy="${num(stroke.cy, 120)}" r="${num(stroke.r, 18)}" stroke="${color}" stroke-width="${num(stroke.width, 5)}" fill="none" stroke-linecap="round" />`;
  }
  if (type === 'line') {
    return `<line x1="${num(stroke.x1, 40)}" y1="${num(stroke.y1, 40)}" x2="${num(stroke.x2, 240)}" y2="${num(stroke.y2, 180)}" stroke="${color}" stroke-width="${num(stroke.width, 5)}" fill="none" stroke-linecap="round" />`;
  }
  if (type === 'text') {
    return `<text x="${num(stroke.x, 120)}" y="${num(stroke.y, 120)}" fill="${color}" font-size="${num(stroke.size, 18)}" font-family="inherit">${escapeHtml(stroke.text || '?')}</text>`;
  }

  const d = String(stroke?.d || 'M60 130 C120 60, 190 200, 300 110').replace(/[^\dMmLlHhVvCcSsQqTtAaZz,\s.\-]/g, '');
  return `<path d="${d}" stroke="${color}" stroke-width="${num(stroke.width, 5)}" fill="none" stroke-linecap="round" stroke-linejoin="round" />`;
}

function sanitizeSvgStroke(input, color) {
  const safe = input
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/href=/gi, 'data-x=');

  if (/^<path/i.test(safe) || /^<circle/i.test(safe) || /^<line/i.test(safe) || /^<polyline/i.test(safe)) {
    return safe
      .replace(/stroke="[^"]*"/gi, `stroke="${color}"`)
      .replace(/fill="[^"]*"/gi, 'fill="none"');
  }
  return `<path d="M80 120 C130 60, 210 190, 292 112" stroke="${color}" stroke-width="5" fill="none" stroke-linecap="round" />`;
}

function renderGamePlayer(player) {
  const score = state.score?.[player.id] || 0;
  const isArtist = player.id === state.artistId;
  return `
    <div class="draw-game-player ${isArtist ? 'is-artist' : ''}">
      <div class="draw-avatar">${renderAvatar(player)}</div>
      <div class="draw-game-player-main">
        <strong>${escapeHtml(player.name || '选手')}</strong>
        <span>${isArtist ? '本轮画手' : player.type === 'user' ? '正在努力猜' : '正在观察抽象艺术'}</span>
      </div>
      <em>${score}</em>
    </div>
  `;
}

function renderGuessFeed() {
  const items = [...(state.guesses || []), ...(state.roasts || [])]
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));

  if (!items.length) {
    return `<div class="draw-empty-feed">还没人开口，空气里全是问号。</div>`;
  }

  return items.slice(-12).map(item => `
    <div class="draw-feed-item ${item.kind === 'roast' ? 'is-roast' : ''} ${item.correct ? 'is-correct' : ''}">
      <strong>${escapeHtml(item.name || '匿名')}</strong>
      <p>${escapeHtml(item.text || '')}</p>
    </div>
  `).join('');
}

function bindEvents() {
  if (!hostEl) return;

  hostEl.querySelector('[data-action="back"]')?.addEventListener('click', handleBack);
  hostEl.querySelector('[data-action="customize"]')?.addEventListener('click', openCustomizeSheet);
  hostEl.querySelector('[data-action="pick-players"]')?.addEventListener('click', openPickPlayersSheet);
  hostEl.querySelector('[data-action="start-game"]')?.addEventListener('click', startGame);
  hostEl.querySelector('[data-action="new-round"]')?.addEventListener('click', startNewRound);
  hostEl.querySelector('[data-action="ai-guess"]')?.addEventListener('click', runAiGuessRound);
  hostEl.querySelector('[data-action="add-stroke"]')?.addEventListener('click', addStroke);
  hostEl.querySelector('[data-action="reveal-answer"]')?.addEventListener('click', revealAnswer);
  hostEl.querySelector('[data-action="submit-guess"]')?.addEventListener('click', submitUserGuess);
  hostEl.querySelector('[data-action="open-roasts"]')?.addEventListener('click', openRoastSheet);

  const input = hostEl.querySelector('[data-role="guess-input"]');
  input?.addEventListener('keydown', event => {
    if (event.key === 'Enter') submitUserGuess();
  });
}

function handleBack() {
  if (state.phase !== 'lobby') {
    state.phase = 'lobby';
    saveState();
    render();
    return;
  }
  if (typeof onBackHandler === 'function') onBackHandler();
}

async function openPickPlayersSheet() {
  const characters = await getAllDB('characters').catch(() => []);
  const sheet = document.createElement('div');
  sheet.className = 'draw-sheet';
  sheet.innerHTML = `
    <div class="draw-sheet-head">
      <div>
        <h3>拉人组局</h3>
        <p>最多选 4 个熟人，不够的位置会随机匹配。</p>
      </div>
      <button class="draw-icon-btn" data-close>${createIcon('x', 20)}</button>
    </div>
    <div class="draw-character-list">
      ${characters.length ? characters.map(character => {
        const checked = state.selectedIds.includes(character.id);
        return `
          <button class="draw-character-row ${checked ? 'is-on' : ''}" data-id="${escapeAttr(character.id)}">
            <div class="draw-avatar">${renderAvatar(normalizeCharacterPlayer(character))}</div>
            <div>
              <strong>${escapeHtml(character.name || '未命名')}</strong>
              <span>${escapeHtml(character.description || character.personality || '等TA来现场锐评')}</span>
            </div>
            <i>${checked ? '已选' : '加入'}</i>
          </button>
        `;
      }).join('') : `<div class="draw-empty-feed">还没有角色，先随机匹配也能玩。</div>`}
    </div>
  `;

  sheet.querySelector('[data-close]')?.addEventListener('click', hideBottomSheet);
  sheet.querySelectorAll('.draw-character-row').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (!id) return;
      const exists = state.selectedIds.includes(id);
      if (exists) {
        state.selectedIds = state.selectedIds.filter(item => item !== id);
      } else {
        if (state.selectedIds.length >= 4) {
          showToast('这局最多带 4 个 AI 哦');
          return;
        }
        state.selectedIds.push(id);
      }
      state.players = [];
      saveState();
      hideBottomSheet();
      render();
      openPickPlayersSheet();
    });
  });

  showBottomSheet(sheet);
}

async function startGame() {
  if (state.busy) return;
  state.busy = true;
  render();

  try {
    state.players = await buildPlayers();
    state.score = Object.fromEntries(state.players.map(player => [player.id, state.score?.[player.id] || 0]));
    state.round = state.round || 0;
    await startNewRound();
  } finally {
    state.busy = false;
  }
}

async function buildPlayers() {
  const characters = await getAllDB('characters').catch(() => []);
  const picked = state.selectedIds
    .map(id => characters.find(character => character.id === id))
    .filter(Boolean)
    .slice(0, 4)
    .map(normalizeCharacterPlayer);

  const players = [getUserPlayer(), ...picked];
  const usedNames = new Set(players.map(player => player.name));

  while (players.length < 5) {
    const persona = RANDOM_PERSONAS[Math.floor(Math.random() * RANDOM_PERSONAS.length)];
    const uniqueName = usedNames.has(persona.name) ? `${persona.name}${players.length}` : persona.name;
    usedNames.add(uniqueName);
    players.push({
      id: generateId('random_ai'),
      type: 'random',
      name: uniqueName,
      avatar: '',
      isRealCharacter: false,
      characterId: null,
      personality: persona.personality,
      style: persona.style,
      description: `${persona.personality}。说话风格：${persona.style}`
    });
  }

  return players.slice(0, 5);
}

function getUserPlayer() {
  const settingsData = getData('app_settings', {}) || {};
  const user = settingsData.user || getData('app_user', {}) || {};
  return {
    id: 'user',
    type: 'user',
    name: user.name || '我',
    avatar: user.avatar || user.avatarSource || '',
    isRealCharacter: false,
    characterId: null,
    personality: '玩家本人，负责大胆乱猜',
    style: '自由发挥'
  };
}

function normalizeCharacterPlayer(character) {
  return {
    id: `char_${character.id}`,
    type: 'ai',
    name: character.name || '未命名',
    avatar: pickImage(character.avatar) || pickImage(character),
    isRealCharacter: true,
    characterId: character.id,
    personality: character.personality || character.description || character.systemPrompt || '',
    style: character.speakingStyle || character.style || '',
    raw: character
  };
}

async function startNewRound() {
  if (!state.players?.length) {
    state.players = await buildPlayers();
  }

  state.busy = true;
  state.phase = 'playing';
  state.round = (state.round || 0) + 1;
  state.guesses = [];
  state.roasts = [];
  state.strokes = [];
  state.revealCount = 0;

  const aiPlayers = state.players.filter(player => player.type !== 'user');
  const artist = aiPlayers[Math.floor(Math.random() * aiPlayers.length)] || state.players[1] || state.players[0];
  state.artistId = artist.id;
  state.artistName = artist.name;

  render();

  try {
    const wordInfo = await generateWord();
    state.secretWord = wordInfo.word;
    state.category = wordInfo.category;
    state.strokes = await generateStrokes(artist, 1);
    state.revealCount = 1;
    state.busy = false;
    saveState();
    render();
    showToast('第一笔来了，开始乱猜吧');
  } catch (error) {
    console.warn(error);
    const fallback = FALLBACK_WORDS[Math.floor(Math.random() * FALLBACK_WORDS.length)];
    state.secretWord = fallback.word;
    state.category = fallback.category;
    state.strokes = fallbackStrokes(state.secretWord, 1);
    state.revealCount = 1;
    state.busy = false;
    saveState();
    render();
  }
}

async function generateWord() {
  const categories = ['网络梗', '5G冲浪', '抽象词', '赛博日常', '情绪状态', '离谱名场面'];
  const category = categories[Math.floor(Math.random() * categories.length)];

  const prompt = [
    '我正在参加一个轻松搞笑的你画我猜游戏。',
    `我需要现场想一个适合 SVG 抽象线条画的题词，类别偏向：${category}。`,
    '我会让题词像网络热梗、5G冲浪、抽象生活或日常离谱瞬间。',
    '我只返回 JSON，不解释。',
    '格式：{"category":"类别","word":"题词"}',
    '题词 2 到 8 个中文字符最好，也可以是短梗，但不要涉及现实群体攻击。'
  ].join('\n');

  const text = await silentRequest({
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.95
  });

  const parsed = parseJson(text);
  if (parsed?.word) {
    return {
      category: parsed.category || category,
      word: String(parsed.word).slice(0, 18)
    };
  }

  const fallback = FALLBACK_WORDS[Math.floor(Math.random() * FALLBACK_WORDS.length)];
  return fallback;
}

async function generateStrokes(artist, revealLevel) {
  const prompt = [
    '我正在玩你画我猜，我这一轮是画手。',
    `我的名字是：${artist.name}。`,
    artist.personality ? `我的性格状态是：${artist.personality}` : '',
    artist.style ? `我的说话和表达习惯是：${artist.style}` : '',
    `我拿到的秘密题词是：${state.secretWord}。`,
    `题词类别是：${state.category}。`,
    `现在是第 ${revealLevel} 次加笔画。`,
    '我会用很简单、抽象、好笑的 SVG 线条来画，不写出答案文字，不画太复杂。',
    '我只返回 JSON，不解释。',
    '格式：{"strokes":[{"type":"path","d":"M20 20 C80 40,120 90,180 50","width":5},{"type":"circle","cx":120,"cy":90,"r":20,"width":5}],"roast":"我画完后心里会冒出的短吐槽"}',
    '坐标范围 x 20-340，y 20-240。最多返回 4 个 strokes。'
  ].filter(Boolean).join('\n');

  const text = await silentRequest({
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.9
  });

  const parsed = parseJson(text);
  const strokes = Array.isArray(parsed?.strokes) ? parsed.strokes.slice(0, 4) : fallbackStrokes(state.secretWord, revealLevel);
  const roast = parsed?.roast ? String(parsed.roast).slice(0, 80) : '';

  if (roast) {
    state.roasts.push({
      id: generateId('roast'),
      kind: 'roast',
      playerId: artist.id,
      name: artist.name,
      text: roast,
      createdAt: getNow()
    });
  }

  return [...(state.strokes || []), ...strokes];
}

async function addStroke() {
  if (state.busy || state.phase === 'revealed') return;

  const artist = state.players.find(player => player.id === state.artistId);
  if (!artist) return;

  state.busy = true;
  render();

  try {
    state.revealCount = (state.revealCount || 1) + 1;
    state.strokes = await generateStrokes(artist, state.revealCount);
    if (state.revealCount >= 5) {
      state.roasts.push({
        id: generateId('roast'),
        kind: 'roast',
        playerId: 'system',
        name: '小纸条',
        text: '已经加到第五笔了，再猜不出只能说画手和世界都有问题。',
        createdAt: getNow()
      });
    }
    saveState();
  } catch (error) {
    console.warn(error);
    state.strokes = [...state.strokes, ...fallbackStrokes(state.secretWord, state.revealCount + 1)];
  }

  state.busy = false;
  render();
}

async function runAiGuessRound() {
  if (state.busy || state.phase === 'revealed') return;
  state.busy = true;
  render();

  const guessers = state.players.filter(player => player.type !== 'user' && player.id !== state.artistId);

  for (const player of guessers) {
    if (!mounted) return;

    try {
      const result = await generateAiGuess(player);
      const correct = isGuessCorrect(result.guess, state.secretWord);
      state.guesses.push({
        id: generateId('guess'),
        kind: 'guess',
        playerId: player.id,
        name: player.name,
        text: result.text,
        guess: result.guess,
        correct,
        createdAt: getNow()
      });

      if (correct) {
        state.score[player.id] = (state.score[player.id] || 0) + 1;
        state.phase = 'revealed';
        await saveRoundMemory(`${player.name} 在“你画我猜”里猜中了 ${state.artistName} 画的「${state.secretWord}」，现场吐槽是：${result.text}`);
        break;
      }

      if (result.roast) {
        state.roasts.push({
          id: generateId('roast'),
          kind: 'roast',
          playerId: player.id,
          name: player.name,
          text: result.roast,
          createdAt: getNow()
        });
      }
    } catch (error) {
      console.warn(error);
      state.guesses.push({
        id: generateId('guess'),
        kind: 'guess',
        playerId: player.id,
        name: player.name,
        text: `${player.name}盯着画沉默了三秒：这玩意儿有点超纲。`,
        guess: '',
        correct: false,
        createdAt: getNow()
      });
    }

    saveState();
    render();
    await wait(260);
  }

  state.busy = false;
  saveState();
  render();
}

async function generateAiGuess(player) {
  const visibleStrokeSummary = summarizeStrokes(state.strokes);

  const prompt = [
    '我正在参加一个轻松搞笑的你画我猜游戏。',
    `我的名字是：${player.name}。`,
    player.personality ? `我的性格状态是：${player.personality}` : '',
    player.style ? `我的说话方式是：${player.style}` : '',
    `这幅 SVG 抽象画的线索是：${visibleStrokeSummary}`,
    `题词类别提示是：${state.category || '未知'}。`,
    '我不知道正确答案，我只能根据这坨抽象线条猜。',
    '我可以吐槽，可以轻微嘴欠，但不攻击现实群体。',
    '我只返回 JSON，不解释。',
    '格式：{"guess":"我猜的词","text":"我现场会说的一句话","roast":"如果没猜中我可能补的一句吐槽"}'
  ].filter(Boolean).join('\n');

  const text = await silentRequest({
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.92
  });

  const parsed = parseJson(text);
  return {
    guess: String(parsed?.guess || '').slice(0, 24),
    text: String(parsed?.text || `${player.name}：我先盲猜一个，${state.category}。`).slice(0, 100),
    roast: String(parsed?.roast || '').slice(0, 100)
  };
}

function submitUserGuess() {
  const input = hostEl?.querySelector('[data-role="guess-input"]');
  const value = input?.value?.trim();
  if (!value || state.phase === 'revealed') return;

  const correct = isGuessCorrect(value, state.secretWord);
  state.guesses.push({
    id: generateId('guess'),
    kind: 'guess',
    playerId: 'user',
    name: getUserPlayer().name || '我',
    text: `我猜：${value}`,
    guess: value,
    correct,
    createdAt: getNow()
  });

  if (correct) {
    state.score.user = (state.score.user || 0) + 1;
    state.phase = 'revealed';
    saveRoundMemory(`用户在“你画我猜”里猜中了 ${state.artistName} 画的「${state.secretWord}」。`);
    showToast('居然猜中了，太离谱了');
  } else {
    const roast = pickUserFailRoast();
    state.roasts.push({
      id: generateId('roast'),
      kind: 'roast',
      playerId: 'system',
      name: '小纸条',
      text: roast,
      createdAt: getNow()
    });
  }

  if (input) input.value = '';
  saveState();
  render();
}

function revealAnswer() {
  if (state.phase === 'revealed') return;
  state.phase = 'revealed';
  state.roasts.push({
    id: generateId('roast'),
    kind: 'roast',
    playerId: 'system',
    name: '答案卡',
    text: `答案是「${state.secretWord}」。这画能猜出来的都不是一般人。`,
    createdAt: getNow()
  });
  saveRoundMemory(`“你画我猜”本轮答案公开：${state.artistName} 画的是「${state.secretWord}」。大家的猜测很抽象。`);
  saveState();
  render();
}

async function saveRoundMemory(content) {
  const realPlayers = state.players.filter(player => player.isRealCharacter && player.characterId);
  for (const player of realPlayers) {
    await setDB('memories', {
      id: generateId('memory'),
      characterId: player.characterId,
      content,
      source: 'auto',
      createdAt: getNow(),
      updatedAt: getNow()
    }).catch(console.warn);
  }
}

function openRoastSheet() {
  const sheet = document.createElement('div');
  sheet.className = 'draw-sheet';
  sheet.innerHTML = `
    <div class="draw-sheet-head">
      <div>
        <h3>吐槽小纸条</h3>
        <p>本局离谱言论集中地。</p>
      </div>
      <button class="draw-icon-btn" data-close>${createIcon('x', 20)}</button>
    </div>
    <div class="draw-feed is-sheet">
      ${renderGuessFeed()}
    </div>
  `;

  sheet.querySelector('[data-close]')?.addEventListener('click', hideBottomSheet);
  showBottomSheet(sheet);
}

async function openCustomizeSheet() {
  const bg = await getDB('blobs', BG_KEY).catch(() => null);
  const hasBg = !!(bg?.value || bg?.source || bg?.imageBase64 || bg?.image);

  const sheet = document.createElement('div');
  sheet.className = 'draw-sheet';
  sheet.innerHTML = `
    <div class="draw-sheet-head">
      <div>
        <h3>装扮画室</h3>
        <p>给灵魂画板换个小背景。</p>
      </div>
      <button class="draw-icon-btn" data-close>${createIcon('x', 20)}</button>
    </div>

    <div class="draw-custom-card">
      <label class="draw-upload">
        ${createIcon('image', 18)}
        <span>${hasBg ? '重新上传背景' : '上传背景'}</span>
        <input type="file" accept="image/*" data-role="bg-file" />
      </label>

      <label class="draw-range-row">
        <span>背景透明度</span>
        <input type="range" min="0" max="0.55" step="0.01" value="${settings.bgOpacity ?? 0.2}" data-role="bg-opacity" />
      </label>

      <button class="draw-soft-btn" data-action="clear-bg" ${hasBg ? '' : 'disabled'}>
        ${createIcon('trash-2', 17)}清除背景
      </button>
    </div>
  `;

  sheet.querySelector('[data-close]')?.addEventListener('click', hideBottomSheet);

  sheet.querySelector('[data-role="bg-file"]')?.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const dataUrl = await compressImage(file, 1600, 0.86);
    await setDB('blobs', {
      key: BG_KEY,
      value: dataUrl,
      source: dataUrl,
      opacity: settings.bgOpacity,
      updatedAt: getNow()
    });
    await hydrateBackground();
    showToast('画室背景换好啦');
    hideBottomSheet();
  });

  sheet.querySelector('[data-role="bg-opacity"]')?.addEventListener('input', async event => {
    settings.bgOpacity = Number(event.target.value);
    await saveSettings();
    await hydrateBackground();
  });

  sheet.querySelector('[data-action="clear-bg"]')?.addEventListener('click', async () => {
    await deleteDB('blobs', BG_KEY).catch(() => {});
    await hydrateBackground();
    showToast('背景已经清掉啦');
    hideBottomSheet();
  });

  showBottomSheet(sheet);
}

function renderAvatar(player) {
  const image = pickImage(player.avatar || player);
  if (image) return `<img src="${escapeAttr(image)}" alt="" />`;
  const name = player.name || '?';
  return `<span>${escapeHtml(name.slice(0, 1))}</span>`;
}

function pickImage(input) {
  if (!input) return '';
  if (typeof input === 'string') return input;
  return input.value || input.source || input.image || input.imageBase64 || input.avatar || input.avatarUrl || input.iconImage || input.url || input.src || '';
}

function fallbackStrokes(word, level = 1) {
  const seed = [...String(word || '抽象')].reduce((sum, char) => sum + char.charCodeAt(0), 0) + level * 17;
  const x = n => 30 + ((seed * n) % 290);
  const y = n => 35 + ((seed * n) % 190);

  const pack = [
    { type: 'path', d: `M${x(2)} ${y(3)} C${x(4)} ${y(5)}, ${x(6)} ${y(7)}, ${x(8)} ${y(9)}`, width: 5 },
    { type: 'circle', cx: x(5), cy: y(6), r: 14 + (seed % 18), width: 5 },
    { type: 'path', d: `M${x(9)} ${y(2)} Q${x(3)} ${y(8)}, ${x(7)} ${y(4)}`, width: 4 },
    { type: 'line', x1: x(6), y1: y(1), x2: x(2), y2: y(9), width: 4 }
  ];

  return pack.slice(0, Math.min(4, Math.max(1, level)));
}

function summarizeStrokes(strokes) {
  if (!strokes?.length) return '画板上几乎什么都没有，只有一点可疑线条。';
  return strokes.slice(-8).map((stroke, index) => {
    if (typeof stroke === 'string') return `第${index + 1}笔是一段SVG线条`;
    if (stroke.type === 'circle') return `第${index + 1}笔是圆形，位置大概在(${stroke.cx},${stroke.cy})`;
    if (stroke.type === 'line') return `第${index + 1}笔是一条线`;
    return `第${index + 1}笔是弯曲路径`;
  }).join('；');
}

function isGuessCorrect(guess, answer) {
  const a = normalizeText(guess);
  const b = normalizeText(answer);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[\s，。！？、,.!?~·\-—_「」『』【】（）()]/g, '');
}

function pickUserFailRoast() {
  const list = [
    '这个答案不能说错，只能说和画一样自由。',
    '猜得很好，下次别猜了。开玩笑的，再来。',
    '画手沉默，观众沉默，答案也沉默。',
    '这波属于题目和脑回路擦肩而过。',
    '离答案有距离，但离抽象艺术很近。'
  ];
  return list[Math.floor(Math.random() * list.length)];
}

function parseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    const match = String(text).match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (error) {
        return null;
      }
    }
  }
  return null;
}

function num(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(-999, Math.min(999, n));
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[char]);
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#096;');
}

function styleText() {
  return `
    .draw-guess-page {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: var(--bg-primary);
      color: var(--text-primary);
      font-family: var(--font-main);
      font-size: var(--font-size-base);
    }

    .draw-bg-layer {
      position: absolute;
      inset: 0;
      background-image: var(--draw-bg-image);
      background-size: cover;
      background-position: center;
      opacity: var(--draw-bg-opacity);
      pointer-events: none;
    }

    .draw-guess-page::after {
      content: "";
      position: absolute;
      inset: 0;
      background:
        radial-gradient(circle at 12% 12%, var(--accent-light), transparent 24%),
        radial-gradient(circle at 88% 20%, var(--bg-card), transparent 22%);
      opacity: 0.28;
      pointer-events: none;
    }

    .draw-topbar,
    .draw-lobby,
    .draw-game {
      position: relative;
      z-index: 1;
    }

    .draw-topbar {
      height: 72px;
      padding: 14px 20px 8px;
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .draw-title-wrap {
      flex: 1;
      min-width: 0;
    }

    .draw-kicker {
      color: var(--text-hint);
      font-size: var(--font-size-small);
      line-height: 1.2;
    }

    .draw-title-wrap h1 {
      margin: 2px 0 0;
      font-size: 22px;
      line-height: 1.2;
      font-weight: 650;
      letter-spacing: -0.02em;
    }

    .draw-icon-btn,
    .draw-soft-btn,
    .draw-danger-btn,
    .draw-start-btn,
    .draw-send-btn,
    .draw-character-row,
    .draw-upload {
      appearance: none;
      outline: none;
      border-color: transparent;
      color: var(--text-primary);
      font-family: inherit;
      transition: all 200ms ease;
      touch-action: manipulation;
    }

    .draw-icon-btn:active,
    .draw-soft-btn:active,
    .draw-danger-btn:active,
    .draw-start-btn:active,
    .draw-send-btn:active,
    .draw-character-row:active,
    .draw-upload:active {
      transform: scale(0.96);
    }

    .draw-icon-btn {
      width: 44px;
      height: 44px;
      border-radius: 18px;
      display: grid;
      place-items: center;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      flex: 0 0 auto;
    }

    .draw-lobby,
    .draw-game {
      height: calc(100% - 72px);
      overflow-y: auto;
      overscroll-behavior: contain;
      padding: 8px 20px 24px;
      -webkit-overflow-scrolling: touch;
    }

    .draw-hero-card,
    .draw-panel,
    .draw-board-card,
    .draw-guess-box {
      background: color-mix(in srgb, var(--bg-card) 88%, transparent);
      border-radius: 28px;
      box-shadow: var(--shadow-sm);
    }

    .draw-hero-card {
      padding: 20px;
      display: grid;
      gap: 16px;
      overflow: hidden;
    }

    .draw-hero-doodle {
      height: 136px;
      border-radius: 24px;
      background: color-mix(in srgb, var(--accent-light) 18%, var(--bg-secondary));
      display: grid;
      place-items: center;
    }

    .draw-hero-doodle svg {
      width: 88%;
      height: 88%;
      fill: none;
      stroke: var(--accent);
      stroke-width: 5;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .draw-pill {
      display: inline-flex;
      margin: 0 0 10px;
      padding: 8px 12px;
      border-radius: 999px;
      background: var(--accent-light);
      color: var(--accent-dark);
      font-size: var(--font-size-small);
      line-height: 1;
    }

    .draw-hero-card h2 {
      margin: 0;
      font-size: 24px;
      line-height: 1.25;
      font-weight: 680;
      letter-spacing: -0.03em;
    }

    .draw-desc,
    .draw-section-head p,
    .draw-player-chip span,
    .draw-game-player span,
    .draw-board-head p {
      margin: 0;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.6;
    }

    .draw-panel {
      margin-top: 14px;
      padding: 18px;
    }

    .draw-section-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 14px;
      margin-bottom: 14px;
    }

    .draw-section-head h3 {
      margin: 0 0 3px;
      font-size: 17px;
      font-weight: 620;
    }

    .draw-soft-btn,
    .draw-danger-btn {
      min-height: 42px;
      padding: 0 14px;
      border-radius: 18px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      background: var(--bg-secondary);
      box-shadow: var(--shadow-sm);
      font-size: var(--font-size-small);
      white-space: nowrap;
    }

    .draw-danger-btn {
      background: var(--accent);
      color: var(--bubble-user-text);
    }

    .draw-soft-btn:disabled,
    .draw-danger-btn:disabled {
      opacity: 0.45;
      transform: none;
    }

    .draw-player-strip {
      display: grid;
      gap: 10px;
    }

    .draw-player-chip,
    .draw-game-player {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px;
      border-radius: 22px;
      background: var(--bg-secondary);
    }

    .draw-avatar {
      width: 42px;
      height: 42px;
      border-radius: 17px;
      overflow: hidden;
      display: grid;
      place-items: center;
      background: var(--accent-light);
      color: var(--accent-dark);
      flex: 0 0 auto;
      font-weight: 650;
    }

    .draw-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .draw-player-chip strong,
    .draw-game-player strong {
      display: block;
      font-size: 15px;
      line-height: 1.3;
      font-weight: 600;
    }

    .draw-rule-grid {
      display: grid;
      gap: 10px;
    }

    .draw-rule-grid div {
      display: flex;
      align-items: center;
      gap: 11px;
      padding: 12px;
      border-radius: 20px;
      background: var(--bg-secondary);
    }

    .draw-rule-grid b {
      width: 28px;
      height: 28px;
      border-radius: 12px;
      display: grid;
      place-items: center;
      background: var(--accent-light);
      color: var(--accent-dark);
      font-weight: 650;
      flex: 0 0 auto;
    }

    .draw-rule-grid span {
      color: var(--text-secondary);
      font-size: 15px;
      line-height: 1.5;
    }

    .draw-start-btn {
      width: 100%;
      margin-top: 16px;
      min-height: 56px;
      border-radius: 24px;
      background: var(--accent);
      color: var(--bubble-user-text);
      font-size: 16px;
      font-weight: 650;
      box-shadow: var(--shadow-md);
    }

    .draw-score-row {
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;
    }

    .draw-round-card {
      min-height: 48px;
      border-radius: 20px;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      display: grid;
      place-items: center;
      line-height: 1.2;
    }

    .draw-round-card span {
      color: var(--text-hint);
      font-size: 12px;
    }

    .draw-round-card strong {
      font-size: 15px;
      font-weight: 620;
    }

    .draw-board-card {
      padding: 16px;
    }

    .draw-board-head {
      display: flex;
      align-items: stretch;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 14px;
    }

    .draw-board-head h2 {
      margin: 3px 0 0;
      font-size: 20px;
      line-height: 1.2;
      font-weight: 650;
    }

    .draw-secret-card {
      min-width: 116px;
      padding: 10px 12px;
      border-radius: 20px;
      background: var(--bg-secondary);
      display: grid;
      align-content: center;
      text-align: right;
    }

    .draw-secret-card span {
      color: var(--text-hint);
      font-size: 12px;
    }

    .draw-secret-card strong {
      font-size: 15px;
      line-height: 1.3;
      font-weight: 650;
    }

    .draw-secret-card:not(.is-open) strong {
      filter: blur(3px);
      user-select: none;
    }

    .draw-canvas-wrap {
      position: relative;
      padding-top: 12px;
    }

    .draw-paper-tape {
      position: absolute;
      top: 0;
      left: 50%;
      width: 90px;
      height: 24px;
      transform: translateX(-50%) rotate(-2deg);
      border-radius: 8px;
      background: var(--accent-light);
      opacity: 0.78;
      z-index: 2;
    }

    .draw-svg-board {
      position: relative;
      min-height: 258px;
      border-radius: 26px;
      background: var(--bg-primary);
      box-shadow: inset 0 0 0 999px color-mix(in srgb, var(--bg-card) 18%, transparent), var(--shadow-sm);
      display: grid;
      place-items: center;
      overflow: hidden;
    }

    .draw-svg-board::before {
      content: "";
      position: absolute;
      inset: 14px;
      border-radius: 22px;
      background:
        linear-gradient(90deg, color-mix(in srgb, var(--text-hint) 12%, transparent) 1px, transparent 1px),
        linear-gradient(color-mix(in srgb, var(--text-hint) 12%, transparent) 1px, transparent 1px);
      background-size: 28px 28px;
      opacity: 0.35;
      pointer-events: none;
    }

    .draw-svg {
      position: relative;
      z-index: 1;
      width: 100%;
      height: 258px;
      fill: none;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .draw-empty-note {
      position: absolute;
      z-index: 2;
      bottom: 18px;
      padding: 8px 12px;
      border-radius: 999px;
      background: var(--bg-card);
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      box-shadow: var(--shadow-sm);
    }

    .draw-action-row {
      display: grid;
      grid-template-columns: 1fr 1fr auto;
      gap: 10px;
      margin-top: 14px;
    }

    .draw-guess-box {
      margin-top: 12px;
      padding: 10px;
    }

    .draw-input-wrap {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
      align-items: center;
    }

    .draw-guess-input {
      width: 100%;
      min-height: 46px;
      border-radius: 18px;
      padding: 0 14px;
      background: var(--bg-secondary);
      color: var(--text-primary);
      outline: none;
      border-color: transparent;
      font-size: 16px;
      font-family: inherit;
    }

    .draw-send-btn {
      min-height: 46px;
      padding: 0 18px;
      border-radius: 18px;
      background: var(--accent);
      color: var(--bubble-user-text);
      font-weight: 650;
    }

    .draw-live-grid {
      display: grid;
      gap: 0;
    }

    .draw-player-list {
      display: grid;
      gap: 10px;
    }

    .draw-game-player {
      position: relative;
    }

    .draw-game-player.is-artist {
      background: var(--accent-light);
    }

    .draw-game-player-main {
      flex: 1;
      min-width: 0;
    }

    .draw-game-player em {
      min-width: 32px;
      height: 32px;
      border-radius: 14px;
      display: grid;
      place-items: center;
      background: var(--bg-card);
      color: var(--accent-dark);
      font-style: normal;
      font-weight: 650;
    }

    .draw-feed {
      display: grid;
      gap: 10px;
      max-height: 360px;
      overflow-y: auto;
      overscroll-behavior: contain;
      padding-right: 2px;
    }

    .draw-feed.is-sheet {
      max-height: 62vh;
    }

    .draw-feed-item {
      padding: 12px 13px;
      border-radius: 20px 20px 20px 8px;
      background: var(--bg-secondary);
      box-shadow: var(--shadow-sm);
    }

    .draw-feed-item.is-roast {
      transform: rotate(-0.5deg);
      background: var(--accent-light);
    }

    .draw-feed-item.is-correct {
      background: var(--accent);
      color: var(--bubble-user-text);
    }

    .draw-feed-item strong {
      display: block;
      margin-bottom: 4px;
      font-size: 13px;
      font-weight: 650;
    }

    .draw-feed-item p {
      margin: 0;
      font-size: 15px;
      line-height: 1.6;
    }

    .draw-empty-feed {
      padding: 20px;
      border-radius: 22px;
      background: var(--bg-secondary);
      color: var(--text-secondary);
      font-size: 15px;
      line-height: 1.6;
      text-align: center;
    }

    .draw-sheet {
      padding: 4px 0 10px;
      color: var(--text-primary);
      font-family: var(--font-main);
    }

    .draw-sheet-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 14px;
      margin-bottom: 14px;
    }

    .draw-sheet-head h3 {
      margin: 0 0 4px;
      font-size: 18px;
      font-weight: 650;
    }

    .draw-sheet-head p {
      margin: 0;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.6;
    }

    .draw-character-list {
      display: grid;
      gap: 10px;
      max-height: 56vh;
      overflow-y: auto;
      overscroll-behavior: contain;
    }

    .draw-character-row {
      width: 100%;
      padding: 10px;
      border-radius: 22px;
      display: flex;
      align-items: center;
      gap: 12px;
      background: var(--bg-secondary);
      text-align: left;
    }

    .draw-character-row.is-on {
      background: var(--accent-light);
    }

    .draw-character-row div:nth-child(2) {
      flex: 1;
      min-width: 0;
    }

    .draw-character-row strong,
    .draw-character-row span {
      display: block;
    }

    .draw-character-row strong {
      font-size: 15px;
      font-weight: 620;
    }

    .draw-character-row span {
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1.4;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .draw-character-row i {
      color: var(--accent-dark);
      font-style: normal;
      font-size: 12px;
      font-weight: 650;
    }

    .draw-custom-card {
      display: grid;
      gap: 12px;
    }

    .draw-upload {
      min-height: 50px;
      border-radius: 20px;
      background: var(--bg-secondary);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      box-shadow: var(--shadow-sm);
      cursor: pointer;
    }

    .draw-upload input {
      display: none;
    }

    .draw-range-row {
      padding: 14px;
      border-radius: 20px;
      background: var(--bg-secondary);
      display: grid;
      gap: 10px;
    }

    .draw-range-row span {
      color: var(--text-secondary);
      font-size: var(--font-size-small);
    }

    .draw-range-row input {
      width: 100%;
      accent-color: var(--accent);
    }

    @media (min-width: 720px) {
      .draw-lobby,
      .draw-game {
        max-width: 760px;
        margin: 0 auto;
      }

      .draw-live-grid {
        grid-template-columns: 0.92fr 1.08fr;
        gap: 14px;
      }

      .draw-live-grid .draw-panel {
        min-height: 320px;
      }
    }
  `;
}

// 依赖：../../core/storage.js(getData,setData,getAllDB,getDB,setDB,deleteDB,generateId,getNow,compressImage)；../../core/ui.js(createIcon,showToast,showBottomSheet,hideBottomSheet,showConfirm)；../../core/api.js(silentRequest)
```
