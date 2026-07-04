// apps/games/tavern.js
// 骗子酒馆 —— 我和初一对戏，她可能在骗我，我要识破她的小把戏。
// 流程：3 个场景串成一条线，每个场景选一个选项 -> 收集 mood -> 最后给结局。
// 数据：STORES.liarsTavern {id, scenes, choices, ending, createdAt}
// 事件：每局结束 bus.emit('games:result', {game:'骗子酒馆', result})
// 红线：图标只用 SVG 线稿，禁止任何 emoji 字符；视觉值走 CSS 变量。

import { STORES } from '../../core/storage-keys.js';
import { getAllDB, setDB, deleteDB, generateId, getNow } from '../../core/storage.js';
import { createIcon } from '../../core/ui.js';
import bus from '../../core/events.js';
import { pick } from '../../core/util.js';
import { TAVERN_SCENES, TAVERN_ENDINGS, TAVERN_FLAVORS } from './data.js';
import { escapeHTML, escapeAttr, aiText, renderHistoryList, historyCardHTML } from './shared.js';

// 一局状态
let game = null;
// game = {
//   sceneIdx,            // 当前场景索引
//   history: [{sceneId, opening, choiceId, choiceLabel, reply, flavor}],
//   moods: ['seen'|'fooled', ...],
//   phase: 'scene' | 'ending',
//   ending
// }

// ════════════════════════════════════════
// 渲染入口
// ════════════════════════════════════════

export function renderTavern(content) {
  content.innerHTML = `
    <div class="games-info">
      <div class="games-info-icon">${createIcon('heart', 18).outerHTML}</div>
      <div class="games-info-text">酒馆里，初一凑过来和你搭话，她可能在骗你哦。三个场景，看你能识破几回。有 AI 时她的回应会更自然。</div>
    </div>
    <div class="games-btn-row">
      <button class="btn primary" id="tv-start">${createIcon('heart', 16).outerHTML}${game ? '重新开局' : '开始一局'}</button>
    </div>
    <div id="tv-stage"></div>
    <div class="games-history-title">酒馆记录</div>
    <div id="tv-history"></div>
  `;
  content.querySelector('#tv-start').addEventListener('click', () => startGame(content));
  if (game) renderStage(content);
  renderTavernHistory(content.querySelector('#tv-history'));
}

// ════════════════════════════════════════
// 开局
// ════════════════════════════════════════

function startGame(content) {
  game = {
    sceneIdx: 0,
    history: [],
    moods: [],
    phase: 'scene',
    ending: null
  };
  renderStage(content);
}

// ════════════════════════════════════════
// 阶段渲染
// ════════════════════════════════════════

function renderStage(content) {
  const stage = content.querySelector('#tv-stage');
  if (!stage || !game) return;
  if (game.phase === 'scene') renderSceneStage(stage);
  else if (game.phase === 'ending') renderEndingStage(stage);
}

// 场景阶段：渲染已发生的对话 + 当前场景的开场白 + 选项
function renderSceneStage(stage) {
  const scene = TAVERN_SCENES[game.sceneIdx];
  if (!scene) {
    // 没有下一个场景了 -> 进入结算
    finishGame(stage);
    return;
  }
  // 已发生的对话
  const pastHTML = game.history.map((h, i) => `
    <div class="tavern-scene">
      <div class="tavern-scene-num">${createIcon('heart', 14).outerHTML}第 ${i + 1} 幕</div>
      <div class="tavern-line">${escapeHTML(h.opening)}</div>
      <div class="tavern-line narration">你选了「${escapeHTML(h.choiceLabel)}」</div>
      <div class="tavern-line">${escapeHTML(h.reply)}</div>
      ${h.flavor ? `<div class="tavern-line narration">${escapeHTML(h.flavor)}</div>` : ''}
    </div>
  `).join('');
  // 当前场景
  const sceneHTML = `
    <div class="tavern-scene">
      <div class="tavern-scene-num">${createIcon('heart', 14).outerHTML}第 ${game.sceneIdx + 1} 幕</div>
      <div class="tavern-line">${escapeHTML(scene.opening)}</div>
      <div class="tavern-choices" id="tv-choices">
        ${scene.choices.map((c) => `
          <button class="tavern-choice" data-choice="${escapeAttr(c.id)}">${escapeHTML(c.label)}</button>
        `).join('')}
      </div>
    </div>
  `;
  stage.innerHTML = pastHTML + sceneHTML;
  stage.querySelectorAll('[data-choice]').forEach((btn) => {
    btn.addEventListener('click', () => pickChoice(stage, btn.dataset.choice));
  });
}

// 选了一个选项
async function pickChoice(stage, choiceId) {
  const scene = TAVERN_SCENES[game.sceneIdx];
  if (!scene) return;
  const choice = scene.choices.find((c) => c.id === choiceId);
  if (!choice) return;
  // 收集这一幕
  const entry = {
    sceneId: scene.id,
    opening: scene.opening,
    choiceId: choice.id,
    choiceLabel: choice.label,
    reply: choice.reply,
    flavor: pick(TAVERN_FLAVORS) || ''
  };
  game.history.push(entry);
  game.moods.push(choice.mood);
  // 有 AI 时，让 AI 给一句更自然的额外点缀（不替换 reply，加在 flavor 位置）
  if (entry.flavor) {
    const sys = '你是软萌少女初一在酒馆里的旁白，第一人称，温柔，20-40 字，不要用 emoji，只描写氛围或心情。';
    const user = `场景：${scene.opening}\n对方选了「${choice.label}」，我回应：「${choice.reply}」。请补一句旁白点缀气氛。`;
    const aiFlavor = await aiText(sys, user, entry.flavor);
    entry.flavor = aiFlavor || entry.flavor;
  }
  // 下一幕
  game.sceneIdx += 1;
  renderStage(stage);
}

// 三幕演完 -> 结算
async function finishGame(stage) {
  // 统计 mood
  const seenCount = game.moods.filter((m) => m === 'seen').length;
  const fooledCount = game.moods.filter((m) => m === 'fooled').length;
  let endingKey;
  if (seenCount > fooledCount) endingKey = 'seen';
  else if (fooledCount > seenCount) endingKey = 'fooled';
  else endingKey = 'peace';
  game.ending = endingKey;
  game.phase = 'ending';
  // 存记录
  const record = {
    id: generateId('tv'),
    scenes: game.history.map((h) => ({ sceneId: h.sceneId, choiceId: h.choiceId, choiceLabel: h.choiceLabel })),
    choices: game.history.map((h) => h.choiceLabel),
    moods: game.moods,
    ending: endingKey,
    createdAt: getNow()
  };
  try {
    await setDB(STORES.liarsTavern, record.id, record);
    const content = stage.closest('#games-content') || stage.parentElement;
    const histEl = content?.querySelector('#tv-history');
    if (histEl) renderTavernHistory(histEl);
  } catch (e) {
    console.warn('[games] 骗子酒馆历史写入失败', e);
  }
  // 事件注入
  bus.emit('games:result', { game: '骗子酒馆', result: TAVERN_ENDINGS[endingKey] });
  renderStage(stage);
}

// 结局阶段
function renderEndingStage(stage) {
  const endingText = TAVERN_ENDINGS[game.ending] || TAVERN_ENDINGS.peace;
  const pastHTML = game.history.map((h, i) => `
    <div class="tavern-scene">
      <div class="tavern-scene-num">${createIcon('heart', 14).outerHTML}第 ${i + 1} 幕</div>
      <div class="tavern-line">${escapeHTML(h.opening)}</div>
      <div class="tavern-line narration">你选了「${escapeHTML(h.choiceLabel)}」</div>
      <div class="tavern-line">${escapeHTML(h.reply)}</div>
      ${h.flavor ? `<div class="tavern-line narration">${escapeHTML(h.flavor)}</div>` : ''}
    </div>
  `).join('');
  stage.innerHTML = `
    ${pastHTML}
    <div class="tavern-ending">
      <div class="tavern-ending-label">${createIcon('star', 14).outerHTML}本局结局</div>
      <div class="tavern-ending-text">${escapeHTML(endingText)}</div>
    </div>
    <div class="games-btn-row">
      <button class="btn primary" id="tv-again">${createIcon('heart', 16).outerHTML}再来一局</button>
    </div>
  `;
  stage.querySelector('#tv-again').addEventListener('click', () => {
    const content = stage.closest('#games-content') || stage.parentElement;
    startGame(content);
  });
}

// ════════════════════════════════════════
// 历史记录
// ════════════════════════════════════════

async function renderTavernHistory(el) {
  let list = [];
  try {
    list = await getAllDB(STORES.liarsTavern);
  } catch (e) {
    console.warn('[games] 读取骗子酒馆历史失败', e);
  }
  const endingLabels = { seen: '识破', fooled: '被骗', peace: '和平收场' };
  renderHistoryList(
    el,
    list,
    (r) => {
      const choicesText = (r.choices || []).map((c, i) => `第${i + 1}幕：${c}`).join('；');
      const inner = `
        <div class="games-history-text">结局：${escapeHTML(endingLabels[r.ending] || '未知')}</div>
        <div class="games-history-sub">${escapeHTML(choicesText)}</div>
      `;
      return historyCardHTML(r, inner, `<span class="games-history-tag tavern">骗子酒馆</span>`);
    },
    async (id) => {
      await deleteDB(STORES.liarsTavern, id);
      renderTavernHistory(el);
    },
    { icon: 'heart', text: '还没有去过酒馆，点上面开一局嘛' }
  );
}

// 切换 tab 时清空当前局
export function resetTavernState() {
  game = null;
}
