// apps/games/index.js
// 小游戏合集 App —— 软萌少女风 PWA「泡泡」。
// 我把四个软乎乎的小玩具收在一起：真心话大冒险 / 谁是卧底 / 骗子酒馆 / 塔罗牌占卜。
// 另外保留了原来的骰子小玩具。
// 数据：
//   1) 塔罗占卜历史存 STORES.tarotGame：{id, spread, cards:[{name, icon, reversed}], reading, createdAt}
//   2) 真心话大冒险历史存 STORES.truthGame：{id, type, question, answer, comment, createdAt}
//   3) 谁是卧底历史存 STORES.drawGuess：{id, wordPair, userWord, userRole, result, players, createdAt}
//   4) 骗子酒馆历史存 STORES.liarsTavern：{id, scenes, choices, ending, createdAt}
//   5) 骰子不存 DB，纯即时玩法
// 每局结束 bus.emit('games:result', {game, result})，消息中心会捕获。
// 红线：图标只用 SVG 线稿（createIcon），禁止任何 emoji 字符；视觉值走 CSS 变量。
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js, core/util.js,
//       core/app-bg.js, core/ai-client.js, ./data.js, ./shared.js, ./styles.js,
//       ./tarot.js, ./truth.js, ./undercover.js, ./tavern.js, ./dice.js

import { createIcon } from '../../core/ui.js';
import bus from '../../core/events.js';
import { openApp } from '../../core/router.js';
import { applyAppBg } from '../../core/app-bg.js';
import { injectGameStyles } from './styles.js';
import { renderTarot, resetTarotState } from './tarot.js';
import { renderTruth, resetTruthState } from './truth.js';
import { renderUndercover, resetUndercoverState } from './undercover.js';
import { renderTavern, resetTavernState } from './tavern.js';
import { renderDice, resetDiceState } from './dice.js';
import { renderScoreCard } from './score.js';

let containerEl = null;
// 当前选中的小游戏 tab
let currentTab = 'tarot';
// 积分更新事件回调（unmount 时解绑用）
let onScoreHandler = null;

// 顶部 tab 配置（顺序就是横向显示顺序）
const TABS = [
  { id: 'truth', label: '真心话', icon: 'chat' },
  { id: 'undercover', label: '谁是卧底', icon: 'games' },
  { id: 'tavern', label: '骗子酒馆', icon: 'heart' },
  { id: 'tarot', label: '塔罗牌', icon: 'dream' },
  { id: 'dice', label: '骰子', icon: 'dice' }
];

// 注入样式（只注入一次，injectStyle 内部会先删旧 ID）
injectGameStyles();

// ════════════════════════════════════════
// mount / unmount
// ════════════════════════════════════════

export async function mount(container, context) {
  containerEl = container;
  container.innerHTML = `
    <div class="app-header">
      <button class="app-back" id="games-back" aria-label="返回桌面">${createIcon('back', 20).outerHTML}</button>
      <div class="app-header-title">小游戏</div>
      <button class="app-header-gear" id="games-settings" aria-label="游戏设置">${createIcon('settings', 18).outerHTML}</button>
    </div>
    <div class="app-body" id="games-body"></div>
  `;
  container.querySelector('#games-back').addEventListener('click', () => bus.emit('router:home'));
  // 齿轮跳到设置「AI 与陪伴」分组
  container.querySelector('#games-settings').addEventListener('click', () => openApp('settings', { deepLink: { tab: 'ai' } }));
  // 监听积分更新，刷新顶部积分卡
  onScoreHandler = () => {
    if (!containerEl) return;
    const card = containerEl.querySelector('#games-score-card');
    if (card) renderScoreCard(card);
  };
  bus.on('games:score-updated', onScoreHandler);
  render();
  applyAppBg(container, 'games');
}

export function unmount() {
  if (onScoreHandler) {
    bus.off('games:score-updated', onScoreHandler);
    onScoreHandler = null;
  }
  containerEl = null;
}

// ════════════════════════════════════════
// 主体渲染
// ════════════════════════════════════════

function render() {
  if (!containerEl) return;
  const body = containerEl.querySelector('#games-body');
  if (!body) return;
  body.innerHTML = `
    <div id="games-score-card"></div>
    <div class="games-tabs" id="games-tabs">
      ${TABS.map((t) => `
        <button class="games-tab ${currentTab === t.id ? 'active' : ''}" data-tab="${t.id}">
          ${createIcon(t.icon, 16).outerHTML}${t.label}
        </button>
      `).join('')}
    </div>
    <div id="games-content"></div>
  `;
  // 渲染顶部「我的游戏积分」卡片
  renderScoreCard(body.querySelector('#games-score-card'));
  body.querySelectorAll('.games-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.tab;
      if (currentTab === next) return;
      // 切走前清掉当前 tab 的临时状态，避免回来时残留半截局
      resetTabState(currentTab);
      currentTab = next;
      render();
    });
  });
  const content = body.querySelector('#games-content');
  if (currentTab === 'tarot') renderTarot(content);
  else if (currentTab === 'truth') renderTruth(content);
  else if (currentTab === 'undercover') renderUndercover(content);
  else if (currentTab === 'tavern') renderTavern(content);
  else if (currentTab === 'dice') renderDice(content);
  else renderTarot(content);
}

// 切换 tab 时调用对应游戏的 reset 函数，清掉临时状态
// dice 没有需要清的状态，也保留调用以保持一致
function resetTabState(tab) {
  try {
    if (tab === 'tarot') resetTarotState();
    else if (tab === 'truth') resetTruthState();
    else if (tab === 'undercover') resetUndercoverState();
    else if (tab === 'tavern') resetTavernState();
    else if (tab === 'dice') resetDiceState();
  } catch (e) {
    console.warn('[games] reset 状态失败', tab, e);
  }
}
