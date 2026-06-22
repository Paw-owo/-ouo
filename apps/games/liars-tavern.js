// imports:
// from ../../core/storage.js import getData, setData, generateId, getNow, getAllDB
// from ../../core/api.js import silentRequest
// from ../../core/ui.js import showToast, showBottomSheet, hideBottomSheet, showConfirm

import {
  getData,
  setData,
  generateId,
  getNow,
  getAllDB
} from '../../core/storage.js';

import { silentRequest } from '../../core/api.js';

import {
  showToast,
  showBottomSheet,
  hideBottomSheet,
  showConfirm
} from '../../core/ui.js';

const STYLE_ID = 'liars-tavern-styles';
const SAVE_KEY = 'app_game_liars_tavern_state';
const SETTINGS_KEY = 'app_game_liars_tavern_settings';
const MAX_LOG = 90;

const CLAIMS = ['A', 'K', 'Q', 'J', '10', '9'];
const MARKS = ['黑桃', '红心', '梅花', '方片'];
const NPC_NAMES = ['旧牌手', '夜班店主', '沉默赌客', '黑杯侍者', '灰绒旅人'];

const DEFAULT_SETTINGS = {
  difficulty: 'normal',
  dealerStyle: 'calm',
  autoNpc: true
};

let containerEl = null;
let options = {};
let state = null;
let settings = { ...DEFAULT_SETTINGS };
let characters = [];
let mounted = false;
let thinking = false;

export async function mount(container, mountOptions = {}) {
  containerEl = container;
  options = mountOptions;
  mounted = true;
  thinking = false;

  injectStyles();

  settings = normalizeSettings(getData(SETTINGS_KEY));
  characters = await safeGetCharacters();
  state = normalizeState(getData(SAVE_KEY));

  if (!state.players.length) {
    state.players = createPlayers();
  }

  if (!state.tavern.playerHand.length || !state.tavern.tableCards.length || !state.tavern.dice.length) {
    dealRound();
    appendLog('system', '酒馆开门了。牌、骰子和筹码被推到旧绒布中央。');
    saveState();
  }

  render();
}

export function unmount() {
  mounted = false;
  hideBottomSheet();
  thinking = false;

  if (containerEl) {
    containerEl.innerHTML = '';
  }

  containerEl = null;
  options = {};
  state = null;
  characters = [];
}

async function safeGetCharacters() {
  try {
    const list = await getAllDB('characters');
    return Array.isArray(list) ? list : [];
  } catch (_) {
    return [];
  }
}

function normalizeSettings(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};

  return {
    difficulty: ['easy', 'normal', 'hard'].includes(source.difficulty) ? source.difficulty : DEFAULT_SETTINGS.difficulty,
    dealerStyle: ['calm', 'sharp', 'soft'].includes(source.dealerStyle) ? source.dealerStyle : DEFAULT_SETTINGS.dealerStyle,
    autoNpc: typeof source.autoNpc === 'boolean' ? source.autoNpc : DEFAULT_SETTINGS.autoNpc
  };
}

function saveSettings() {
  setData(SETTINGS_KEY, settings);
}

function normalizeState(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const tavern = source.tavern && typeof source.tavern === 'object' ? source.tavern : {};

  return {
    id: source.id || generateId(),
    round: Number(source.round || 1),
    phase: source.phase || 'deal',
    players: Array.isArray(source.players) ? source.players : [],
    logs: Array.isArray(source.logs) ? source.logs.slice(-MAX_LOG) : [],
    createdAt: source.createdAt || getNow(),
    updatedAt: source.updatedAt || getNow(),
    result: source.result && typeof source.result === 'object' ? source.result : null,
    tavern: {
      deck: Array.isArray(tavern.deck) ? tavern.deck : [],
      playerHand: Array.isArray(tavern.playerHand) ? tavern.playerHand : [],
      tableCards: Array.isArray(tavern.tableCards) ? tavern.tableCards : [],
      dice: Array.isArray(tavern.dice) ? tavern.dice : [],
      claimRank: tavern.claimRank || '',
      claimCount: Number(tavern.claimCount || 0),
      lastClaimById: tavern.lastClaimById || '',
      pot: Number(tavern.pot || 1),
      trust: clamp(Number(tavern.trust ?? 52), 0, 100),
      heat: clamp(Number(tavern.heat ?? 18), 0, 100),
      revealed: Boolean(tavern.revealed),
      spotlightId: tavern.spotlightId || 'user',
      lastAction: tavern.lastAction || '还没有人出声。',
      whisper: tavern.whisper || '桌边很安静，只有杯底轻轻碰到木面。'
    }
  };
}

function createPlayers() {
  const picked = characters.slice(0, 4).map((character, index) => ({
    id: character.id || `character-${index}`,
    name: character.name || `旅人 ${index + 1}`,
    avatar: character.avatar || '',
    kind: 'character',
    chips: 6,
    suspicion: 28 + index * 9
  }));

  const fallback = NPC_NAMES.slice(0, Math.max(0, 4 - picked.length)).map((name, index) => ({
    id: `npc-${index + 1}`,
    name,
    avatar: '',
    kind: 'npc',
    chips: 6,
    suspicion: 34 + index * 7
  }));

  return [
    {
      id: 'user',
      name: getUserName(),
      avatar: getUserAvatar(),
      kind: 'user',
      chips: 8,
      suspicion: 22
    },
    ...picked,
    ...fallback
  ].slice(0, 6);
}

function getUserName() {
  const appSettings = getData('app_settings') || {};
  return appSettings.user?.name || appSettings.profile?.name || '你';
}

function getUserAvatar() {
  const appSettings = getData('app_settings') || {};
  return appSettings.user?.avatar || appSettings.profile?.avatar || '';
}

function saveState() {
  if (!state) return;
  state.updatedAt = getNow();
  setData(SAVE_KEY, state);
}

function render() {
  if (!mounted || !containerEl || !state) return;

  containerEl.innerHTML = `
    <section class="tavern-app">
      <div class="tavern-bg"></div>
      <div class="tavern-light tavern-light-one"></div>
      <div class="tavern-light tavern-light-two"></div>

      <header class="tavern-nav">
        <button class="tavern-icon-btn" data-action="back" aria-label="返回游戏厅"></button>
        <div class="tavern-nav-copy">
          <div class="tavern-title">骗子酒馆</div>
          <div class="tavern-subtitle">第 ${state.round} 轮 · ${escapeHtml(getPhaseText())}</div>
        </div>
        <button class="tavern-icon-btn" data-action="menu" aria-label="牌桌菜单"></button>
      </header>

      <main class="tavern-main">
        <section class="tavern-table-card">
          <div class="tavern-top">
            <div>
              <div class="tavern-kicker">PRIVATE TABLE</div>
              <div class="tavern-headline">${escapeHtml(getTableTitle())}</div>
              <div class="tavern-whisper">${escapeHtml(state.tavern.whisper)}</div>
            </div>
            <div class="tavern-pot">
              <span>底池</span>
              <strong>${state.tavern.pot}</strong>
            </div>
          </div>

          <div class="tavern-table">
            <div class="tavern-seats"></div>

            <div class="tavern-center">
              <div class="tavern-center-label">当前宣称</div>
              <div class="tavern-claim">${escapeHtml(getClaimText())}</div>
              <div class="tavern-card-stack"></div>
              <div class="tavern-meter-list">
                <div class="tavern-meter-row">
                  <span>信任</span>
                  <i><b style="width:${state.tavern.trust}%"></b></i>
                </div>
                <div class="tavern-meter-row">
                  <span>热度</span>
                  <i><b style="width:${state.tavern.heat}%"></b></i>
                </div>
              </div>
            </div>
          </div>

          <div class="tavern-hand">
            <div class="tavern-hand-head">
              <div>
                <div class="tavern-hand-title">你的暗面</div>
                <div class="tavern-hand-note">${state.tavern.revealed ? '牌和骰子已经摊开。' : '只有你知道手里到底有什么。'}</div>
              </div>
              <button class="tavern-mini-btn" data-action="peek">${state.tavern.revealed ? '收起' : '查看'}</button>
            </div>
            <div class="tavern-hand-body">
              <div class="tavern-player-cards"></div>
              <div class="tavern-player-dice"></div>
            </div>
          </div>
        </section>

        <section class="tavern-control">
          <div class="tavern-last">${escapeHtml(state.tavern.lastAction)}</div>

          <div class="tavern-actions">
            <button class="tavern-action primary" data-action="claim"></button>
            <button class="tavern-action" data-action="believe"></button>
            <button class="tavern-action" data-action="challenge"></button>
            <button class="tavern-action" data-action="next"></button>
          </div>

          ${state.result ? createResultHtml() : ''}

          <details class="tavern-record">
            <summary>
              <span>本局记录</span>
              <i>${state.logs.length}</i>
            </summary>
            <div class="tavern-log"></div>
          </details>

          <form class="tavern-chat">
            <textarea class="tavern-input" rows="1" placeholder="低声说一句"></textarea>
            <button class="tavern-send" type="submit" aria-label="发送"></button>
          </form>
        </section>
      </main>
    </section>
  `;

  containerEl.querySelector('[data-action="back"]').appendChild(localIcon('back', 19));
  containerEl.querySelector('[data-action="menu"]').appendChild(localIcon('settings', 19));
  containerEl.querySelector('.tavern-send').appendChild(localIcon('send', 18));

  renderSeats();
  renderCenterCards();
  renderHand();
  renderLogs();
  renderActions();
  bindEvents();
}

function createResultHtml() {
  if (!state?.result) return '';

  return `
    <section class="tavern-result">
      <div class="tavern-result-title">${escapeHtml(state.result.title || '本轮结算')}</div>
      <div class="tavern-result-text">${escapeHtml(state.result.text || '')}</div>
    </section>
  `;
}

function bindEvents() {
  if (!containerEl || !state) return;

  containerEl.querySelector('[data-action="back"]')?.addEventListener('click', () => {
    options.onBack?.();
  });

  containerEl.querySelector('[data-action="menu"]')?.addEventListener('click', openMenuSheet);

  containerEl.querySelector('[data-action="peek"]')?.addEventListener('click', () => {
    if (!state) return;

    state.tavern.revealed = !state.tavern.revealed;
    state.tavern.lastAction = state.tavern.revealed ? '你把牌和骰子压低给自己看。' : '你把牌和骰子重新扣回阴影里。';
    saveState();
    render();
  });

  containerEl.querySelector('[data-action="claim"]')?.addEventListener('click', openClaimSheet);
  containerEl.querySelector('[data-action="believe"]')?.addEventListener('click', believeClaim);
  containerEl.querySelector('[data-action="challenge"]')?.addEventListener('click', challengeClaim);
  containerEl.querySelector('[data-action="next"]')?.addEventListener('click', startNextRound);

  containerEl.querySelector('.tavern-chat')?.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!state || thinking) return;

    const input = containerEl.querySelector('.tavern-input');
    const text = input.value.trim();

    if (!text) return;

    input.value = '';
    input.style.height = 'auto';

    appendLog('user', text, '你');
    state.tavern.lastAction = `你说：“${text}”`;
    state.tavern.heat = clamp(state.tavern.heat + 5, 0, 100);
    state.result = null;
    saveState();
    render();

    await askDealer(`玩家对牌桌说：${text}`);
  });

  const input = containerEl.querySelector('.tavern-input');
  input?.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(116, input.scrollHeight)}px`;
  });
}

function renderSeats() {
  const wrap = containerEl?.querySelector('.tavern-seats');
  if (!wrap || !state) return;

  wrap.innerHTML = '';

  state.players.forEach((player, index) => {
    const seat = document.createElement('button');
    seat.type = 'button';
    seat.className = `tavern-seat tavern-seat-${index} ${player.id === state.tavern.spotlightId ? 'active' : ''} ${player.chips <= 0 ? 'empty' : ''}`;
    seat.innerHTML = `
      <div class="tavern-avatar"></div>
      <div class="tavern-seat-name">${escapeHtml(player.name)}</div>
      <div class="tavern-seat-meta">${player.chips} 筹码 · 疑心 ${player.suspicion}</div>
    `;

    const avatar = seat.querySelector('.tavern-avatar');

    if (player.avatar) {
      const img = document.createElement('img');
      img.src = player.avatar;
      img.alt = '';
      avatar.appendChild(img);
    } else {
      avatar.appendChild(createPlayerGlyph(player.kind));
    }

    seat.addEventListener('click', () => {
      if (!state) return;
      state.tavern.spotlightId = player.id;
      state.tavern.whisper = `${player.name} 的目光停在桌面上，像是在等一个破绽。`;
      saveState();
      render();
    });

    wrap.appendChild(seat);
  });
}

function renderCenterCards() {
  const stack = containerEl?.querySelector('.tavern-card-stack');
  if (!stack || !state) return;

  stack.innerHTML = '';

  const cards = state.tavern.tableCards.length ? state.tavern.tableCards : createBackCards(5);

  cards.slice(0, 5).forEach((card, index) => {
    const node = document.createElement('div');
    node.className = `tavern-table-mini ${state.tavern.revealed ? 'revealed' : ''}`;
    node.style.setProperty('--tilt', `${(index - 2) * 5}deg`);
    node.innerHTML = state.tavern.revealed && card.rank
      ? `<strong>${escapeHtml(card.rank)}</strong><span>${escapeHtml(card.mark)}</span>`
      : `<strong>LIAR</strong><span>hidden</span>`;
    stack.appendChild(node);
  });
}

function renderHand() {
  const cards = containerEl?.querySelector('.tavern-player-cards');
  const dice = containerEl?.querySelector('.tavern-player-dice');
  if (!cards || !dice || !state) return;

  cards.innerHTML = '';
  dice.innerHTML = '';

  state.tavern.playerHand.forEach((card, index) => {
    const node = document.createElement('div');
    node.className = `tavern-hand-card ${state.tavern.revealed ? 'revealed' : ''}`;
    node.style.setProperty('--delay', `${index * 42}ms`);
    node.innerHTML = state.tavern.revealed
      ? `<strong>${escapeHtml(card.rank)}</strong><span>${escapeHtml(card.mark)}</span>`
      : `<strong>?</strong><span>card</span>`;
    cards.appendChild(node);
  });

  state.tavern.dice.forEach((value, index) => {
    const node = document.createElement('div');
    node.className = `tavern-die ${state.tavern.revealed ? 'revealed' : ''}`;
    node.style.setProperty('--delay', `${index * 48}ms`);
    node.appendChild(createDieFace(state.tavern.revealed ? value : 0));
    dice.appendChild(node);
  });
}

function renderLogs() {
  const log = containerEl?.querySelector('.tavern-log');
  if (!log || !state) return;

  log.innerHTML = '';

  if (!state.logs.length) {
    const empty = document.createElement('div');
    empty.className = 'tavern-empty';
    empty.textContent = '还没有记录。';
    log.appendChild(empty);
    return;
  }

  state.logs.slice(-MAX_LOG).forEach((item) => {
    const row = document.createElement('article');
    row.className = `tavern-log-item ${item.role || 'system'}`;
    row.innerHTML = `
      <div class="tavern-log-name">${escapeHtml(item.name || getRoleName(item.role))}</div>
      <div class="tavern-log-paper">${escapeHtml(item.content || '')}</div>
    `;
    log.appendChild(row);
  });

  log.scrollTop = log.scrollHeight;
}

function renderActions() {
  const actions = [
    ['claim', 'cards', '宣称'],
    ['believe', 'check', '相信并跟注'],
    ['challenge', 'search', '质疑'],
    ['next', 'refresh', '下一轮']
  ];

  actions.forEach(([action, icon, text]) => {
    const button = containerEl?.querySelector(`[data-action="${action}"]`);
    if (!button) return;
    button.disabled = thinking;
    button.append(localIcon(icon, 17), document.createTextNode(text));
  });
}

function openClaimSheet() {
  if (!state || thinking) return;

  const sheet = document.createElement('div');
  sheet.className = 'tavern-sheet';
  sheet.innerHTML = `
    <div class="sheet-title">做出宣称</div>
    <div class="sheet-description">你不需要真的有这些牌。酒馆只在乎你说得像不像。</div>

    <div class="tavern-claim-grid">
      <label class="form-row">
        <span>数量</span>
        <input class="input-card" data-field="count" type="number" min="1" max="6" value="${Math.max(1, state.tavern.claimCount || 2)}" />
      </label>

      <label class="form-row">
        <span>牌面</span>
        <select class="input-card" data-field="rank"></select>
      </label>
    </div>

    <div class="tavern-preset-list"></div>

    <button class="btn-primary" data-action="submit">把话放到桌上</button>
  `;

  const select = sheet.querySelector('[data-field="rank"]');

  CLAIMS.forEach((rank) => {
    const option = document.createElement('option');
    option.value = rank;
    option.textContent = rank;
    option.selected = rank === (state.tavern.claimRank || 'A');
    select.appendChild(option);
  });

  const presets = sheet.querySelector('.tavern-preset-list');

  [
    [2, 'A'],
    [3, 'K'],
    [2, 'Q'],
    [4, 'J']
  ].forEach(([count, rank]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tavern-preset';
    button.textContent = `${count} 张 ${rank}`;
    button.addEventListener('click', () => {
      sheet.querySelector('[data-field="count"]').value = count;
      select.value = rank;
    });
    presets.appendChild(button);
  });

  sheet.querySelector('[data-action="submit"]').addEventListener('click', async () => {
    if (!state) return;
    const count = clamp(Number(sheet.querySelector('[data-field="count"]').value || 1), 1, 6);
    const rank = select.value || 'A';
    hideBottomSheet();
    await makeClaim(count, rank);
  });

  showBottomSheet(sheet);
}

async function makeClaim(count, rank) {
  if (!state || thinking) return;

  ensureRoundReady();

  state.tavern.claimCount = count;
  state.tavern.claimRank = rank;
  state.tavern.lastClaimById = 'user';
  state.tavern.pot += 1;
  state.tavern.trust = clamp(state.tavern.trust + 8, 0, 100);
  state.tavern.heat = clamp(state.tavern.heat + 12, 0, 100);
  state.tavern.revealed = false;
  state.tavern.spotlightId = 'user';
  state.tavern.lastAction = `你宣称桌上至少有 ${count} 张 ${rank}。`;
  state.tavern.whisper = '几双眼睛同时抬起，有人相信，有人只是把笑意藏进杯沿。';
  state.phase = 'claim';
  state.result = null;

  spendChip('user', 1);
  appendLog('user', `我宣称至少有 ${count} 张 ${rank}。`, '你');

  if (settings.autoNpc) {
    npcAutoStep('afterUserClaim');
  }

  saveState();
  render();

  await askDealer(`玩家宣称至少有 ${count} 张 ${rank}。${settings.autoNpc ? '一位对手随后做出了回应。' : ''}`);
}

async function believeClaim() {
  if (!state || thinking) return;

  if (!state.tavern.claimRank) {
    showToast('先做一次宣称');
    return;
  }

  state.tavern.pot += 1;
  state.tavern.trust = clamp(state.tavern.trust + 12, 0, 100);
  state.tavern.heat = clamp(state.tavern.heat + 4, 0, 100);
  state.tavern.lastAction = `你选择相信 ${getClaimText()}，并往底池里推了一枚筹码。`;
  state.tavern.whisper = '桌面短暂松了一口气，但每个人都知道这不是结束。';
  state.phase = 'believe';
  state.result = null;

  spendChip('user', 1);
  appendLog('user', '我相信这个宣称，跟注。', '你');

  if (settings.autoNpc) {
    npcAutoStep('afterUserBelieve');
  }

  saveState();
  render();

  await askDealer(`玩家相信并跟注当前宣称：${getClaimText()}。${settings.autoNpc ? '一位对手随后继续推进牌局。' : ''}`);
}

async function challengeClaim() {
  if (!state || thinking) return;

  if (!state.tavern.claimRank) {
    showToast('还没有可质疑的宣称');
    return;
  }

  resolveChallenge('user');
  saveState();
  render();

  await askDealer(`玩家质疑。${state.result?.text || ''}`);
}

async function startNextRound() {
  if (!state || thinking) return;

  state.round += 1;
  state.phase = 'deal';
  state.result = null;
  state.tavern.claimRank = '';
  state.tavern.claimCount = 0;
  state.tavern.lastClaimById = '';
  state.tavern.pot = 1;
  state.tavern.trust = clamp(44 + Math.round(Math.random() * 16), 0, 100);
  state.tavern.heat = clamp(15 + Math.round(Math.random() * 18), 0, 100);
  state.tavern.revealed = false;
  state.tavern.lastAction = `第 ${state.round} 轮开始。新牌被推到每个人面前。`;
  state.tavern.whisper = '洗牌声像一阵短雨，落在旧绒布上。';
  state.tavern.spotlightId = pickRandomOpponent()?.id || 'user';

  dealRound();
  appendLog('system', state.tavern.lastAction);
  saveState();
  render();

  await askDealer(`第 ${state.round} 轮开始。`);
}

function ensureRoundReady() {
  if (!state) return;
  if (state.tavern.playerHand.length && state.tavern.tableCards.length && state.tavern.dice.length) return;
  dealRound();
}

function npcAutoStep(reason) {
  if (!state) return;

  const npc = pickRandomOpponent();
  if (!npc || npc.chips <= 0) return;

  const doubtChance = getNpcDoubtChance();
  const shouldDoubt = state.tavern.claimRank && Math.random() < doubtChance;

  if (reason === 'afterUserClaim' && shouldDoubt) {
    resolveChallenge(npc.id);
    return;
  }

  if (state.tavern.claimRank && Math.random() < 0.52) {
    npc.chips = Math.max(0, npc.chips - 1);
    state.tavern.pot += 1;
    state.tavern.trust = clamp(state.tavern.trust + 5, 0, 100);
    state.tavern.heat = clamp(state.tavern.heat + 6, 0, 100);
    state.tavern.spotlightId = npc.id;
    state.tavern.lastAction = `${npc.name} 选择跟注，没有立刻拆穿你。`;
    state.tavern.whisper = `${npc.name} 把一枚筹码推到桌心，指尖停得很稳。`;
    appendLog('assistant', `${npc.name} 跟注。`, npc.name);
    return;
  }

  const currentCount = state.tavern.claimCount || 1;
  const currentRank = state.tavern.claimRank || CLAIMS[Math.floor(Math.random() * CLAIMS.length)];
  const nextCount = clamp(currentCount + 1, 1, 6);
  const nextRank = Math.random() < 0.58 ? currentRank : CLAIMS[Math.floor(Math.random() * CLAIMS.length)];

  npc.chips = Math.max(0, npc.chips - 1);
  state.tavern.claimCount = nextCount;
  state.tavern.claimRank = nextRank;
  state.tavern.lastClaimById = npc.id;
  state.tavern.pot += 1;
  state.tavern.trust = clamp(state.tavern.trust - 4, 0, 100);
  state.tavern.heat = clamp(state.tavern.heat + 12, 0, 100);
  state.tavern.spotlightId = npc.id;
  state.phase = 'claim';
  state.tavern.lastAction = `${npc.name} 加码宣称：至少有 ${nextCount} 张 ${nextRank}。`;
  state.tavern.whisper = `${npc.name} 的声音不高，却把桌边所有人的注意力都拉了过去。`;
  appendLog('assistant', `我宣称至少有 ${nextCount} 张 ${nextRank}。`, npc.name);
}

function getNpcDoubtChance() {
  if (!state) return 0.28;

  const base = settings.difficulty === 'hard' ? 0.44 : settings.difficulty === 'easy' ? 0.18 : 0.3;
  const heatBonus = state.tavern.heat > 70 ? 0.14 : state.tavern.heat > 45 ? 0.07 : 0;
  const trustPenalty = state.tavern.trust > 70 ? -0.08 : state.tavern.trust < 35 ? 0.12 : 0;

  return clamp(base + heatBonus + trustPenalty, 0.08, 0.72);
}

function resolveChallenge(challengerId) {
  if (!state) return;

  const challenger = getPlayer(challengerId);
  const claimant = getPlayer(state.tavern.lastClaimById || 'user');
  const total = countRankOnTable(state.tavern.claimRank);
  const challengeSuccess = total < state.tavern.claimCount;

  state.tavern.revealed = true;
  state.tavern.heat = clamp(state.tavern.heat + 24, 0, 100);

  if (challengeSuccess) {
    if (claimant) claimant.chips = Math.max(0, claimant.chips - 1);
    if (challenger) challenger.chips += 1;
  } else {
    if (challenger) challenger.chips = Math.max(0, challenger.chips - 1);
    if (claimant) claimant.chips += 1;
  }

  const actorName = challenger?.name || '有人';
  const targetName = claimant?.name || '宣称者';

  state.tavern.trust = clamp(state.tavern.trust + (challengeSuccess ? -18 : 10), 0, 100);
  state.phase = 'challenge';
  state.tavern.spotlightId = challengerId;
  state.tavern.lastAction = challengeSuccess
    ? `${actorName} 质疑成功。桌上一共只有 ${total} 张 ${state.tavern.claimRank}。`
    : `${actorName} 质疑失败。桌上一共确实有 ${total} 张 ${state.tavern.claimRank}。`;

  state.tavern.whisper = challengeSuccess
    ? '谎言被翻开的声音比酒杯更响。'
    : '牌面摊开的瞬间，桌边安静得像有人屏住了呼吸。';

  state.result = {
    title: challengeSuccess ? '质疑成功' : '质疑失败',
    text: challengeSuccess
      ? `${targetName} 的宣称没有站住脚，${actorName} 收下一枚筹码。`
      : `${targetName} 的宣称成立，${actorName} 付出一枚筹码。`
  };

  appendLog(challengerId === 'user' ? 'user' : 'assistant', '我质疑。', challenger?.name || '你');
  appendLog('system', state.tavern.lastAction);
}

function dealRound() {
  if (!state) return;

  const deck = createDeck();
  shuffle(deck);

  state.tavern.deck = deck;
  state.tavern.playerHand = deck.splice(0, 4);
  state.tavern.tableCards = deck.splice(0, 5);
  state.tavern.dice = Array.from({ length: 5 }, () => 1 + Math.floor(Math.random() * 6));
}

async function askDealer(context) {
  if (!mounted || !state || thinking) return;

  thinking = true;
  appendLog('assistant', '酒馆里的声音压低了。', '酒馆主持');
  saveState();
  render();

  const snapshot = createPromptSnapshot(context);

  try {
    const text = await silentRequest({
      prompt: snapshot,
      temperature: settings.dealerStyle === 'sharp' ? 0.9 : 0.78,
      maxTokens: 190
    });

    if (!mounted || !state) return;

    const finalText = text || fallbackDealerText();
    replaceLastAssistant(finalText);
    await recordToChat(finalText);
  } catch (_) {
    if (!mounted || !state) return;
    replaceLastAssistant(fallbackDealerText());
  } finally {
    if (!mounted || !state) return;
    thinking = false;
    saveState();
    render();
  }
}

function createPromptSnapshot(context) {
  if (!state) return '';

  const styleText = {
    calm: '克制、精致、留白，不要夸张。',
    sharp: '更锋利一点，有试探和压迫感，但不要失控。',
    soft: '柔和一点，更像低声讲述。'
  }[settings.dealerStyle] || '克制、精致、留白。';

  return [
    '你是沉浸式小游戏“骗子酒馆”的主持人。',
    `风格：${styleText}`,
    '禁止使用 emoji。不要解释规则。不要说自己是 AI。',
    '输出 80 字以内的主持描述，可以让一位对手说一句话。',
    `玩家：${getUserName()}`,
    `轮数：${state.round}`,
    `当前宣称：${getClaimText()}`,
    `底池：${state.tavern.pot}`,
    `信任：${state.tavern.trust}`,
    `热度：${state.tavern.heat}`,
    `玩家手牌：${state.tavern.playerHand.map((card) => card.rank).join('、')}`,
    `桌面暗牌：${state.tavern.tableCards.map((card) => card.rank).join('、')}`,
    `骰子：${state.tavern.dice.join('、')}`,
    `对手：${state.players.filter((player) => player.id !== 'user').map((player) => `${player.name}(${player.chips}筹码)`).join('、')}`,
    `最近事件：${context}`
  ].join('\n');
}

async function recordToChat(content) {
  if (!content) return;

  try {
    const chat = await import('../chat.js');
    if (typeof chat.recordExternalInteraction === 'function') {
      await chat.recordExternalInteraction({
        source: 'games',
        title: '骗子酒馆',
        content,
        createdAt: getNow()
      });
    }
  } catch (_) {
    /* silent */
  }
}

function openMenuSheet() {
  if (!state) return;

  const sheet = document.createElement('div');
  sheet.className = 'tavern-sheet';
  sheet.innerHTML = `
    <div class="sheet-title">牌桌菜单</div>
    <div class="sheet-description">这里不会离开酒馆，只会整理当前牌局。</div>

    <label class="form-row">
      <span>难度</span>
      <select class="input-card" data-field="difficulty">
        <option value="easy">轻松</option>
        <option value="normal">标准</option>
        <option value="hard">狡猾</option>
      </select>
    </label>

    <label class="form-row">
      <span>主持风格</span>
      <select class="input-card" data-field="dealerStyle">
        <option value="calm">克制</option>
        <option value="sharp">锋利</option>
        <option value="soft">柔和</option>
      </select>
    </label>

    <label class="tavern-switch-row">
      <span>对手自动行动</span>
      <button type="button" class="tavern-switch ${settings.autoNpc ? 'active' : ''}" data-action="auto"></button>
    </label>

    <button class="btn-ghost" data-action="new"></button>
    <button class="btn-ghost" data-action="hide"></button>
  `;

  const difficulty = sheet.querySelector('[data-field="difficulty"]');
  const dealerStyle = sheet.querySelector('[data-field="dealerStyle"]');
  const autoBtn = sheet.querySelector('[data-action="auto"]');

  difficulty.value = settings.difficulty;
  dealerStyle.value = settings.dealerStyle;
  autoBtn.appendChild(document.createElement('span'));

  difficulty.addEventListener('change', () => {
    settings.difficulty = difficulty.value;
    saveSettings();
  });

  dealerStyle.addEventListener('change', () => {
    settings.dealerStyle = dealerStyle.value;
    saveSettings();
  });

  autoBtn.addEventListener('click', () => {
    settings.autoNpc = !settings.autoNpc;
    autoBtn.classList.toggle('active', settings.autoNpc);
    saveSettings();
  });

  const newBtn = sheet.querySelector('[data-action="new"]');
  newBtn.append(localIcon('refresh', 17), document.createTextNode('重开一桌'));

  const hideBtn = sheet.querySelector('[data-action="hide"]');
  hideBtn.append(localIcon('back', 17), document.createTextNode('回到游戏厅'));

  newBtn.addEventListener('click', async () => {
    const ok = await showConfirm('要重开骗子酒馆吗？当前牌局会清空。');
    if (!ok) return;

    state = normalizeState(null);
    state.players = createPlayers();
    dealRound();
    appendLog('system', '新的一桌开始了。');
    saveState();
    hideBottomSheet();
    render();
  });

  hideBtn.addEventListener('click', () => {
    hideBottomSheet();
    options.onBack?.();
  });

  showBottomSheet(sheet);
}

function spendChip(playerId, amount) {
  const player = getPlayer(playerId);
  if (!player) return;
  player.chips = Math.max(0, Number(player.chips || 0) - amount);
}

function getPlayer(playerId) {
  return state?.players.find((player) => player.id === playerId) || null;
}

function appendLog(role, content, name = '') {
  if (!state) return;

  state.logs.push({
    id: generateId(),
    role,
    name,
    content,
    createdAt: getNow()
  });

  state.logs = state.logs.slice(-MAX_LOG);
}

function replaceLastAssistant(content) {
  if (!state) return;

  for (let index = state.logs.length - 1; index >= 0; index -= 1) {
    if (state.logs[index].role === 'assistant') {
      state.logs[index].content = content;
      state.logs[index].createdAt = getNow();
      return;
    }
  }

  appendLog('assistant', content, '酒馆主持');
}

function createDeck() {
  const deck = [];

  CLAIMS.forEach((rank) => {
    MARKS.forEach((mark) => {
      deck.push({ id: generateId(), rank, mark });
    });
  });

  return deck;
}

function shuffle(list) {
  for (let index = list.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [list[index], list[target]] = [list[target], list[index]];
  }

  return list;
}

function countRankOnTable(rank) {
  if (!state) return 0;

  return [
    ...state.tavern.playerHand,
    ...state.tavern.tableCards
  ].filter((card) => card.rank === rank).length;
}

function createBackCards(count) {
  return Array.from({ length: count }, () => ({ rank: '', mark: '' }));
}

function pickRandomOpponent() {
  const opponents = (state?.players || []).filter((player) => player.id !== 'user' && player.chips > 0);
  return opponents[Math.floor(Math.random() * opponents.length)] || null;
}

function getClaimText() {
  if (!state?.tavern.claimRank || !state?.tavern.claimCount) return '还没有宣称';
  return `${state.tavern.claimCount} 张 ${state.tavern.claimRank}`;
}

function getTableTitle() {
  if (!state) return '牌局刚刚落座';
  if (state.phase === 'challenge') return '真相已经翻面';
  if (state.phase === 'claim') return '一句话压在桌心';
  if (state.phase === 'believe') return '有人选择继续相信';
  return '牌局刚刚落座';
}

function getPhaseText() {
  if (thinking) return '主持思考中';
  if (!state) return '发牌';
  if (state.phase === 'challenge') return '摊牌';
  if (state.phase === 'claim') return '宣称';
  if (state.phase === 'believe') return '跟注';
  return '发牌';
}

function getRoleName(role) {
  if (role === 'user') return '你';
  if (role === 'assistant') return '酒馆主持';
  return '牌桌';
}

function fallbackDealerText() {
  const opponent = pickRandomOpponent();
  if (!opponent) return '酒馆安静了一秒，旧绒布上的牌像什么都没发生过。';
  return `${opponent.name} 没急着说话，只把筹码往前推了一点，像是在试探你的呼吸。`;
}

function createDieFace(value) {
  const face = document.createElement('div');
  face.className = 'die-face';

  const map = {
    0: [],
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8]
  };

  for (let index = 0; index < 9; index += 1) {
    const dot = document.createElement('span');
    if ((map[value] || []).includes(index)) dot.className = 'active';
    face.appendChild(dot);
  }

  return face;
}

function createPlayerGlyph(kind) {
  const svg = createSvg('0 0 48 48', 28);

  if (kind === 'user') {
    svg.append(
      svgEl('path', { d: 'M24 24c6 0 10-4 10-10S30 4 24 4 14 8 14 14s4 10 10 10z' }),
      svgEl('path', { d: 'M9 43c2-9 8-14 15-14s13 5 15 14' })
    );
    return svg;
  }

  svg.append(
    svgEl('path', { d: 'M13 18c2-8 7-12 11-12s9 4 11 12' }),
    svgEl('path', { d: 'M12 21h24v7c0 8-5 14-12 14s-12-6-12-14v-7z' }),
    svgEl('path', { d: 'M18 29h.2M30 29h.2M20 36c3 2 5 2 8 0' })
  );

  return svg;
}

function localIcon(name, size = 18) {
  const svg = createSvg('0 0 24 24', size);

  if (name === 'back') {
    svg.append(svgEl('path', { d: 'M15 18l-6-6 6-6' }));
    return svg;
  }

  if (name === 'settings') {
    svg.append(
      svgEl('circle', { cx: '12', cy: '12', r: '3' }),
      svgEl('path', { d: 'M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.4 1a7.5 7.5 0 0 0-2-1.1L12 3H8l-.5 2.8a7.5 7.5 0 0 0-2 1.1l-2.4-1-2 3.4 2 1.5A7 7 0 0 0 3 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.4-1a7.5 7.5 0 0 0 2 1.1L8 21h4l.5-2.8a7.5 7.5 0 0 0 2-1.1l2.4 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z' })
    );
    return svg;
  }

  if (name === 'send') {
    svg.append(svgEl('path', { d: 'M4 12l16-8-5 16-3-6-8-2zM12 14l3-4' }));
    return svg;
  }

  if (name === 'cards') {
    svg.append(
      svgEl('rect', { x: '5', y: '4', width: '10', height: '15', rx: '3', transform: 'rotate(-8 10 11.5)' }),
      svgEl('rect', { x: '9', y: '5', width: '10', height: '15', rx: '3', transform: 'rotate(7 14 12.5)' })
    );
    return svg;
  }

  if (name === 'check') {
    svg.append(svgEl('path', { d: 'M5 12l4 4L19 6' }));
    return svg;
  }

  if (name === 'search') {
    svg.append(
      svgEl('circle', { cx: '10', cy: '10', r: '5' }),
      svgEl('path', { d: 'M14 14l5 5' })
    );
    return svg;
  }

  if (name === 'refresh') {
    svg.append(
      svgEl('path', { d: 'M18 8a7 7 0 1 0 1 6' }),
      svgEl('path', { d: 'M18 4v4h-4' })
    );
    return svg;
  }

  svg.append(svgEl('circle', { cx: '12', cy: '12', r: '8' }));
  return svg;
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

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function clamp(value, min, max) {
  const number = Number(value);
  if (Number.isNaN(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .tavern-app {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: var(--bg-primary);
      color: var(--text-primary);
      font-family: var(--font-main);
      isolation: isolate;
    }

    .tavern-bg {
      position: absolute;
      inset: 0;
      z-index: 0;
      background: color-mix(in srgb, var(--bg-primary) 72%, var(--accent-light));
      pointer-events: none;
    }

    .tavern-light {
      position: absolute;
      z-index: 0;
      width: 180px;
      height: 180px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--accent-light) 56%, transparent);
      filter: blur(36px);
      opacity: .58;
      pointer-events: none;
    }

    .tavern-light-one {
      left: -64px;
      top: 92px;
    }

    .tavern-light-two {
      right: -54px;
      bottom: 160px;
      background: color-mix(in srgb, var(--bg-card) 76%, transparent);
      opacity: .78;
    }

    .tavern-nav {
      position: relative;
      z-index: 2;
      height: 68px;
      display: grid;
      grid-template-columns: 42px minmax(0, 1fr) 42px;
      align-items: center;
      gap: 12px;
      padding: 14px 20px 10px;
    }

    .tavern-icon-btn,
    .tavern-mini-btn,
    .tavern-send {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 18px;
      background: color-mix(in srgb, var(--bg-card) 88%, transparent);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      transition: all 200ms ease;
    }

    .tavern-icon-btn {
      width: 42px;
      height: 42px;
    }

    .tavern-nav-copy {
      min-width: 0;
      text-align: center;
    }

    .tavern-title {
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.3;
      color: var(--text-primary);
    }

    .tavern-subtitle {
      margin-top: 2px;
      font-size: 12px;
      line-height: 1.35;
      color: var(--text-secondary);
    }

    .tavern-main {
      position: relative;
      z-index: 1;
      height: calc(100% - 68px);
      min-height: 0;
      display: grid;
      grid-template-rows: minmax(0, 1fr) auto;
      gap: 12px;
      padding: 8px 20px 20px;
      overflow: hidden;
    }

    .tavern-table-card,
    .tavern-control {
      min-height: 0;
      border-radius: 34px;
      background: color-mix(in srgb, var(--bg-card) 86%, transparent);
      box-shadow: var(--shadow-md);
      backdrop-filter: blur(22px);
      -webkit-backdrop-filter: blur(22px);
    }

    .tavern-table-card {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      gap: 12px;
      padding: 16px;
      overflow: hidden;
    }

    .tavern-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 14px;
    }

    .tavern-kicker {
      color: var(--accent-dark);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: .14em;
      line-height: 1.2;
    }

    .tavern-headline {
      margin-top: 7px;
      font-size: 21px;
      font-weight: 600;
      line-height: 1.2;
      letter-spacing: -0.02em;
      color: var(--text-primary);
    }

    .tavern-whisper {
      margin-top: 7px;
      max-width: 30em;
      font-size: var(--font-size-small);
      line-height: 1.55;
      color: var(--text-secondary);
    }

    .tavern-pot {
      width: 62px;
      height: 62px;
      flex: 0 0 62px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      border-radius: 22px;
      background: var(--accent-light);
      color: var(--accent-dark);
      box-shadow: var(--shadow-sm);
    }

    .tavern-pot span {
      font-size: 11px;
      line-height: 1.2;
    }

    .tavern-pot strong {
      margin-top: 2px;
      font-size: 22px;
      font-weight: 600;
      line-height: 1;
    }

    .tavern-table {
      position: relative;
      min-height: 0;
      overflow: hidden;
      border-radius: 32px;
      background: var(--surface-muted);
      box-shadow: var(--shadow-sm);
    }

    .tavern-seats {
      position: absolute;
      inset: 0;
      z-index: 2;
    }

    .tavern-seat {
      position: absolute;
      width: 86px;
      min-height: 86px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: 8px;
      border-radius: 24px;
      background: color-mix(in srgb, var(--bg-card) 92%, transparent);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      transition: all 200ms ease;
    }

    .tavern-seat.active {
      background: var(--accent-light);
      color: var(--accent-dark);
    }

    .tavern-seat.empty {
      opacity: .52;
    }

    .tavern-seat-0 {
      left: 50%;
      bottom: 10px;
      transform: translateX(-50%);
    }

    .tavern-seat-1 {
      left: 12px;
      bottom: 50px;
    }

    .tavern-seat-2 {
      left: 16px;
      top: 42px;
    }

    .tavern-seat-3 {
      left: 50%;
      top: 10px;
      transform: translateX(-50%);
    }

    .tavern-seat-4 {
      right: 16px;
      top: 42px;
    }

    .tavern-seat-5 {
      right: 12px;
      bottom: 50px;
    }

    .tavern-avatar {
      width: 34px;
      height: 34px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border-radius: 14px;
      background: var(--bg-card);
      color: var(--accent-dark);
      box-shadow: var(--shadow-sm);
    }

    .tavern-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .tavern-seat-name {
      max-width: 100%;
      font-size: 12px;
      font-weight: 600;
      line-height: 1.25;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .tavern-seat-meta {
      max-width: 100%;
      font-size: 10px;
      line-height: 1.2;
      color: currentColor;
      opacity: .68;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .tavern-center {
      position: absolute;
      left: 50%;
      top: 50%;
      z-index: 1;
      width: 150px;
      min-height: 162px;
      transform: translate(-50%, -50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      border-radius: 34px;
      background: color-mix(in srgb, var(--bg-card) 94%, transparent);
      box-shadow: var(--shadow-md);
      padding: 14px;
      text-align: center;
    }

    .tavern-center-label {
      color: var(--text-hint);
      font-size: 10px;
      line-height: 1.2;
    }

    .tavern-claim {
      margin-top: 4px;
      color: var(--text-primary);
      font-size: 15px;
      font-weight: 600;
      line-height: 1.25;
    }

    .tavern-card-stack {
      display: flex;
      justify-content: center;
      gap: 0;
      margin-top: 10px;
      height: 48px;
    }

    .tavern-table-mini {
      width: 32px;
      height: 46px;
      margin-left: -9px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      border-radius: 10px;
      background: var(--accent-light);
      color: var(--accent-dark);
      box-shadow: var(--shadow-sm);
      transform: rotate(var(--tilt));
    }

    .tavern-table-mini:first-child {
      margin-left: 0;
    }

    .tavern-table-mini.revealed {
      background: var(--bg-card);
      color: var(--text-primary);
    }

    .tavern-table-mini strong {
      font-size: 11px;
      line-height: 1.1;
    }

    .tavern-table-mini span {
      margin-top: 2px;
      font-size: 8px;
      opacity: .7;
    }

    .tavern-meter-list {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: 12px;
    }

    .tavern-meter-row {
      display: grid;
      grid-template-columns: 30px minmax(0, 1fr);
      align-items: center;
      gap: 6px;
      font-size: 10px;
      color: var(--text-secondary);
    }

    .tavern-meter-row i {
      height: 6px;
      overflow: hidden;
      border-radius: 999px;
      background: var(--surface-muted);
      box-shadow: var(--shadow-sm);
    }

    .tavern-meter-row b {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: var(--accent);
      transition: all 200ms ease;
    }

    .tavern-hand {
      padding: 12px;
      border-radius: 26px;
      background: var(--surface-muted);
      box-shadow: var(--shadow-sm);
    }

    .tavern-hand-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .tavern-hand-title {
      font-size: var(--font-size-base);
      font-weight: 600;
      line-height: 1.35;
      color: var(--text-primary);
    }

    .tavern-hand-note {
      margin-top: 2px;
      font-size: 12px;
      line-height: 1.35;
      color: var(--text-secondary);
    }

    .tavern-mini-btn {
      min-height: 34px;
      padding: 0 12px;
      font-size: 12px;
    }

    .tavern-hand-body {
      display: grid;
      grid-template-columns: minmax(0, 1.3fr) minmax(0, .9fr);
      gap: 10px;
      margin-top: 10px;
    }

    .tavern-player-cards,
    .tavern-player-dice {
      min-width: 0;
      display: flex;
      gap: 8px;
      overflow-x: auto;
      padding-bottom: 2px;
    }

    .tavern-player-cards::-webkit-scrollbar,
    .tavern-player-dice::-webkit-scrollbar,
    .tavern-log::-webkit-scrollbar {
      display: none;
    }

    .tavern-hand-card {
      width: 46px;
      height: 66px;
      flex: 0 0 46px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      border-radius: 16px;
      background: var(--accent-light);
      color: var(--accent-dark);
      box-shadow: var(--shadow-sm);
      animation: tavern-rise 360ms ease both;
      animation-delay: var(--delay);
    }

    .tavern-hand-card.revealed {
      background: var(--bg-card);
      color: var(--text-primary);
    }

    .tavern-hand-card strong {
      font-size: 17px;
      line-height: 1.2;
    }

    .tavern-hand-card span {
      margin-top: 4px;
      font-size: 10px;
      opacity: .68;
    }

    .tavern-die {
      width: 42px;
      height: 42px;
      flex: 0 0 42px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 14px;
      background: var(--accent-light);
      color: var(--accent-dark);
      box-shadow: var(--shadow-sm);
      animation: tavern-rise 360ms ease both;
      animation-delay: var(--delay);
    }

    .tavern-die.revealed {
      background: var(--bg-card);
      color: var(--text-primary);
    }

    .die-face {
      width: 25px;
      height: 25px;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 3px;
    }

    .die-face span {
      border-radius: 999px;
    }

    .die-face span.active {
      background: currentColor;
    }

    @keyframes tavern-rise {
      from {
        transform: translateY(8px);
        opacity: .2;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }

    .tavern-control {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 12px;
    }

    .tavern-last,
    .tavern-result {
      padding: 11px 13px;
      border-radius: 20px;
      background: var(--surface-muted);
      color: var(--text-secondary);
      box-shadow: var(--shadow-sm);
      font-size: var(--font-size-small);
      line-height: 1.55;
      text-align: center;
    }

    .tavern-result-title {
      color: var(--text-primary);
      font-size: var(--font-size-base);
      font-weight: 600;
      line-height: 1.35;
    }

    .tavern-result-text {
      margin-top: 4px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.55;
    }

    .tavern-actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .tavern-action {
      min-height: 42px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      border-radius: 18px;
      background: var(--surface-muted);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      transition: all 200ms ease;
    }

    .tavern-action.primary {
      grid-column: 1 / -1;
      background: var(--accent);
      color: var(--bubble-user-text);
    }

    .tavern-action:disabled {
      opacity: .55;
    }

    .tavern-record {
      overflow: hidden;
      border-radius: 20px;
      background: var(--surface-muted);
      box-shadow: var(--shadow-sm);
    }

    .tavern-record summary {
      cursor: pointer;
      list-style: none;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      padding: 11px 13px;
      color: var(--text-primary);
      font-size: var(--font-size-base);
      font-weight: 600;
    }

    .tavern-record summary::-webkit-details-marker {
      display: none;
    }

    .tavern-record summary i {
      font-style: normal;
      color: var(--text-hint);
      font-size: 12px;
      font-weight: 400;
    }

    .tavern-log {
      max-height: 25vh;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 0 10px 12px;
      scrollbar-width: none;
    }

    .tavern-log-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .tavern-log-item.user {
      align-items: flex-end;
    }

    .tavern-log-name {
      padding: 0 4px;
      color: var(--text-secondary);
      font-size: 11px;
      line-height: 1.3;
    }

    .tavern-log-paper {
      max-width: 82%;
      padding: 9px 12px;
      border-radius: 18px;
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      font-size: var(--font-size-small);
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .tavern-log-item.user .tavern-log-paper {
      background: var(--accent);
      color: var(--bubble-user-text);
    }

    .tavern-empty {
      padding: 10px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      text-align: center;
    }

    .tavern-chat {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 42px;
      align-items: end;
      gap: 10px;
    }

    .tavern-input {
      width: 100%;
      min-height: 42px;
      max-height: 116px;
      padding: 10px 13px;
      border-radius: 18px;
      background: var(--surface-muted);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      resize: none;
      line-height: 1.5;
    }

    .tavern-send {
      width: 42px;
      height: 42px;
      color: var(--bubble-user-text);
      background: var(--accent);
    }

    .tavern-icon-btn:active,
    .tavern-mini-btn:active,
    .tavern-action:active,
    .tavern-send:active,
    .tavern-seat:active,
    .tavern-preset:active,
    .tavern-switch:active {
      transform: scale(0.96);
    }

    .tavern-sheet {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .tavern-claim-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    .tavern-preset-list {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .tavern-preset {
      min-height: 42px;
      border-radius: 18px;
      background: var(--surface-muted);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      transition: all 200ms ease;
    }

    .tavern-switch-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 14px;
      border-radius: 18px;
      background: var(--surface-muted);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      font-size: var(--font-size-small);
      line-height: 1.45;
    }

    .tavern-switch {
      width: 48px;
      height: 28px;
      padding: 3px;
      border-radius: 999px;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      transition: all 200ms ease;
    }

    .tavern-switch span {
      width: 22px;
      height: 22px;
      display: block;
      border-radius: 999px;
      background: var(--surface-muted);
      box-shadow: var(--shadow-sm);
      transition: all 200ms ease;
    }

    .tavern-switch.active {
      background: var(--accent-light);
    }

    .tavern-switch.active span {
      transform: translateX(20px);
      background: var(--accent);
    }

    @media (min-width: 720px) {
      .tavern-main {
        grid-template-columns: minmax(0, 1fr) 340px;
        grid-template-rows: minmax(0, 1fr);
      }

      .tavern-control {
        min-height: 0;
      }

      .tavern-log {
        max-height: none;
        flex: 1;
      }
    }

    @media (max-width: 390px) {
      .tavern-seat {
        width: 78px;
      }

      .tavern-center {
        width: 138px;
      }

      .tavern-hand-body {
        grid-template-columns: 1fr;
      }
    }
  `;

  document.head.appendChild(style);
}

// 依赖：../../core/storage.js 的 getData/setData/generateId/getNow/getAllDB；../../core/api.js 的 silentRequest；../../core/ui.js 的 showToast/showBottomSheet/hideBottomSheet/showConfirm；动态依赖 ../chat.js 的 recordExternalInteraction
