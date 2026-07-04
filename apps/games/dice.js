// apps/games/dice.js
// 骰子 —— 我把原有玩法搬过来，1 颗或 2 颗，点一下摇一摇看小点点怎么落。
// 这是纯即时玩法，不存 DB。保留原有功能，不删不动。
// 红线：图标只用 SVG 线稿，禁止任何 emoji 字符；视觉值走 CSS 变量。

import { createIcon, showToast } from '../../core/ui.js';
import { sleep } from './shared.js';
import { reportScore } from './score.js';

let diceCount = 1;       // 1 或 2 颗
let diceValues = [1];    // 当前点数
let diceRolling = false;

// ════════════════════════════════════════
// 渲染入口
// ════════════════════════════════════════

export function renderDice(content) {
  content.innerHTML = `
    <div class="games-info">
      <div class="games-info-icon">${createIcon('dice', 18).outerHTML}</div>
      <div class="games-info-text">点掷骰子，看小点点怎么落。可以选 1 颗或 2 颗，2 颗会显示点数和。</div>
    </div>
    <div class="dice-area">
      <div class="dice-row" id="dice-row">${renderDiceBlocks()}</div>
      ${diceCount === 2 ? `
        <div class="dice-sum">点数和：<b>${diceValues.reduce((a, b) => a + b, 0)}</b></div>
      ` : ''}
      <div class="dice-controls">
        <div class="games-mini-tabs">
          <button class="games-tab ${diceCount === 1 ? 'active' : ''}" id="dice-c1">1 颗</button>
          <button class="games-tab ${diceCount === 2 ? 'active' : ''}" id="dice-c2">2 颗</button>
        </div>
        <button class="btn primary" id="dice-roll">${createIcon('dice', 18).outerHTML}掷骰子</button>
      </div>
    </div>
    <div class="games-history-title">说明</div>
    <div class="card">
      <div class="card-row">
        <span class="card-row-label">玩法</span>
        <span class="card-row-value">点掷骰子，看小点点怎么落</span>
      </div>
      <div class="card-row">
        <span class="card-row-label">2 颗</span>
        <span class="card-row-value">显示两颗点数和</span>
      </div>
    </div>
  `;
  content.querySelector('#dice-c1').addEventListener('click', () => {
    if (diceCount === 1) return;
    diceCount = 1;
    diceValues = [1];
    renderDice(content);
  });
  content.querySelector('#dice-c2').addEventListener('click', () => {
    if (diceCount === 2) return;
    diceCount = 2;
    diceValues = [1, 1];
    renderDice(content);
  });
  content.querySelector('#dice-roll').addEventListener('click', () => rollDice(content));
}

function renderDiceBlocks(rolling = false) {
  return diceValues.map((v, i) => `
    <div class="dice-block">
      <div class="dice-icon-wrap ${rolling ? 'rolling' : ''}">${createIcon('dice', 60).outerHTML}</div>
      <div class="dice-number">${rolling ? '?' : v}</div>
      <div class="dice-label">${diceCount === 2 ? `第 ${i + 1} 颗` : '点数'}</div>
    </div>
  `).join('');
}

async function rollDice(content) {
  if (diceRolling) return;
  diceRolling = true;
  const row = content.querySelector('#dice-row');
  // 摇晃阶段：先转一会儿显示问号
  if (row) row.innerHTML = renderDiceBlocks(true);
  // 摇 5 下，每下随机一个假点数，制造跳动效果
  const ticks = 5;
  for (let i = 0; i < ticks; i++) {
    await sleep(90);
    diceValues = diceValues.map(() => Math.floor(Math.random() * 6) + 1);
    if (row) row.innerHTML = renderDiceBlocks(true);
  }
  // 最终落点
  diceValues = diceValues.map(() => Math.floor(Math.random() * 6) + 1);
  diceRolling = false;
  // 重新渲染整块（含点数和）
  renderDice(content);
  const sum = diceValues.reduce((a, b) => a + b, 0);
  // 豹子判定：2 颗骰子点数相同即为豹子，+30 分并触发「幸运儿」成就
  const isLeopard = diceCount === 2 && diceValues.length === 2 && diceValues[0] === diceValues[1];
  try {
    if (isLeopard) {
      reportScore('dice', 30, { achievement: 'lucky' });
      showToast(`豹子！${diceValues[0]} - ${diceValues[1]}，+30 分`, 'success', 1600);
    } else {
      // 普通掷骰也算一次游戏，但不得分
      reportScore('dice', 0);
      showToast(`掷出 ${diceCount === 2 ? `点数和 ${sum}` : sum}`, 'default', 1000);
    }
  } catch (e) {
    console.warn('[games] 骰子积分上报失败', e);
    showToast(`掷出 ${diceCount === 2 ? `点数和 ${sum}` : sum}`, 'default', 1000);
  }
}

// 切换 tab 时不需要特殊清空，状态保留也无所谓（回来还能看到上次点数）
export function resetDiceState() {
  // 保留默认状态，不强制清空
}
