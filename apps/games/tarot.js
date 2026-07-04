// apps/games/tarot.js
// 塔罗牌占卜 —— 我把 22 张大阿卡那洗一洗，让牌面偷偷告诉你今天的事。
// 流程：选牌阵（单张/三张）-> 抽牌 -> 看牌义 -> AI 综合解读（无 AI 走预设）-> 存记录。
// 数据：STORES.tarotGame {id, spread, cards:[{name, icon, reversed}], reading, createdAt}
// 事件：每局结束 bus.emit('games:result', {game:'塔罗牌占卜', result})
// 红线：图标只用 SVG 线稿，禁止任何 emoji 字符；视觉值走 CSS 变量。

import { STORES } from '../../core/storage-keys.js';
import { getAllDB, setDB, deleteDB, generateId, getNow } from '../../core/storage.js';
import { createIcon } from '../../core/ui.js';
import bus from '../../core/events.js';
import { shuffle, pick } from '../../core/util.js';
import { recordInteraction } from '../../core/memory.js';
import { TAROT_DECK, TAROT_READINGS, TAROT_SPREADS } from './data.js';
import { escapeHTML, escapeAttr, aiText, renderHistoryList, historyCardHTML } from './shared.js';
import { reportScore } from './score.js';

// 模块内状态：当前选中的牌阵 + 当前抽到的牌
let currentSpread = TAROT_SPREADS[1]; // 默认三张
let drawnCards = [];                  // 当前抽到的牌（含 isReversed）

// ════════════════════════════════════════
// 渲染入口
// ════════════════════════════════════════

export function renderTarot(content) {
  content.innerHTML = `
    <div class="games-info">
      <div class="games-info-icon">${createIcon('dream', 18).outerHTML}</div>
      <div class="games-info-text">选一个牌阵，洗牌抽牌，让塔罗偷偷告诉你今天的事。有 AI 时会给你一段专属解读哦。</div>
    </div>
    <div class="tarot-spread-row" id="tarot-spread-row"></div>
    <div class="tarot-action">
      <button class="btn primary" id="tarot-draw">${createIcon('dice', 18).outerHTML}洗牌抽牌</button>
    </div>
    <div id="tarot-result"></div>
    <div class="games-history-title">占卜记录</div>
    <div id="tarot-history"></div>
  `;
  // 牌阵选择
  const spreadRow = content.querySelector('#tarot-spread-row');
  spreadRow.innerHTML = TAROT_SPREADS.map((s) => `
    <button class="games-tab ${s.id === currentSpread.id ? 'active' : ''}" data-spread="${escapeAttr(s.id)}">${escapeHTML(s.label)}</button>
  `).join('');
  spreadRow.querySelectorAll('[data-spread]').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentSpread = TAROT_SPREADS.find((s) => s.id === btn.dataset.spread) || TAROT_SPREADS[1];
      renderTarot(content);
    });
  });
  content.querySelector('#tarot-draw').addEventListener('click', () => drawTarot(content));
  // 如果已经有抽到的牌，先渲染一次（切换牌阵时保留）
  if (drawnCards.length > 0) renderTarotResult(content.querySelector('#tarot-result'), drawnCards, currentSpread);
  renderTarotHistory(content.querySelector('#tarot-history'));
}

// ════════════════════════════════════════
// 抽牌
// ════════════════════════════════════════

async function drawTarot(content) {
  const resultEl = content.querySelector('#tarot-result');
  if (!resultEl) return;
  // 洗牌后按牌阵张数抽，每张 50% 逆位
  const count = currentSpread.count;
  drawnCards = shuffle(TAROT_DECK).slice(0, count).map((card) => ({
    name: card.name,
    icon: card.icon,
    keyword: card.keyword,
    upright: card.upright,
    reversedText: card.reversedText,
    isReversed: Math.random() < 0.5
  }));
  // 先渲染牌面（不含解读），再异步拿 AI 解读
  renderTarotResult(resultEl, drawnCards, currentSpread, true);
  // 异步生成综合解读
  const reading = await buildReading(drawnCards, resultEl);
  // 把解读填进去
  const readingEl = resultEl.querySelector('#tarot-reading-block');
  if (readingEl) {
    readingEl.innerHTML = `
      <div class="tarot-reading-label">${createIcon('star', 14).outerHTML}综合解读</div>
      ${escapeHTML(reading)}
    `;
  }
  // 存历史
  const record = {
    id: generateId('tarot'),
    spread: currentSpread.id,
    cards: drawnCards.map((c) => ({ name: c.name, icon: c.icon, reversed: !!c.isReversed })),
    reading,
    createdAt: getNow()
  };
  try {
    await setDB(STORES.tarotGame, record.id, record);
    const histEl = content.querySelector('#tarot-history');
    if (histEl) renderTarotHistory(histEl);
  } catch (e) {
    console.warn('[games] 塔罗历史写入失败', e);
  }
  // 事件注入
  const summary = drawnCards.map((c) => `${c.name}${c.isReversed ? '·逆' : '·正'}`).join('、');
  bus.emit('games:result', { game: '塔罗牌占卜', result: summary });
  // 上报积分：正位牌 +8，逆位牌 +4，作为本局运势评分
  const fortuneScore = drawnCards.reduce((s, c) => s + (c.isReversed ? 4 : 8), 0);
  try { reportScore('tarot', fortuneScore); } catch (e) { console.warn('[games] 塔罗积分上报失败', e); }
  // 写入长期记忆，让 AI 知道主人玩过塔罗
  try {
    await recordInteraction({
      characterId: 'global',
      role: 'user',
      source: 'game',
      content: `玩了塔罗牌占卜：${summary}`,
      importance: 3,
      relatedApp: 'games'
    });
  } catch (e) {
    console.warn('[games] 塔罗记忆写入失败', e);
  }
}

// 渲染牌面 + 牌义（loading=true 时综合解读显示加载中）
function renderTarotResult(el, cards, spread, loading = false) {
  el.innerHTML = `
    <div class="tarot-cards">
      ${cards.map((c, i) => `
        <div class="tarot-card ${c.isReversed ? 'reversed' : ''}">
          ${spread.slots[i] ? `<div class="tarot-card-slot">${escapeHTML(spread.slots[i])}</div>` : ''}
          <div class="tarot-card-icon">${createIcon(c.icon, 30).outerHTML}</div>
          <div class="tarot-card-name">${escapeHTML(c.name)}</div>
          <div class="tarot-card-pos">${c.isReversed ? '逆位' : '正位'}</div>
          <div class="tarot-card-keyword">${escapeHTML(c.keyword)}</div>
        </div>
      `).join('')}
    </div>
    ${cards.map((c) => `
      <div class="tarot-meaning">
        <div class="tarot-meaning-title">${escapeHTML(c.name)} · ${c.isReversed ? '逆位' : '正位'}</div>
        <div class="tarot-meaning-text">${escapeHTML(c.isReversed ? c.reversedText : c.upright)}</div>
      </div>
    `).join('')}
    <div class="tarot-reading" id="tarot-reading-block">
      ${loading
        ? `<div class="tarot-loading">${createIcon('star', 16).outerHTML}<span>正在为你拼一段解读...</span></div>`
        : `<div class="tarot-reading-label">${createIcon('star', 14).outerHTML}综合解读</div>${escapeHTML(pick(TAROT_READINGS))}`
      }
    </div>
  `;
}

// 生成综合解读：有 AI 调 chatOnce，无则 pick 预设
async function buildReading(cards, resultEl) {
  const fallback = pick(TAROT_READINGS) || TAROT_READINGS[0];
  const cardDesc = cards.map((c, i) => {
    const slot = currentSpread.slots[i] ? `[${currentSpread.slots[i]}]` : '';
    return `${slot}${c.name}（${c.isReversed ? '逆位' : '正位'}）：${c.isReversed ? c.reversedText : c.upright}`;
  }).join('\n');
  const sys = '你是软萌少女风塔罗师，第一人称，温柔可爱，回复简短（60-120字），不要用 emoji，不要复述牌面。';
  const user = `我抽到的牌是：\n${cardDesc}\n请综合解读一下，给我一个温柔的提示。`;
  const text = await aiText(sys, user, fallback);
  return text || fallback;
}

// ════════════════════════════════════════
// 历史记录
// ════════════════════════════════════════

async function renderTarotHistory(el) {
  let list = [];
  try {
    list = await getAllDB(STORES.tarotGame);
  } catch (e) {
    console.warn('[games] 读取塔罗历史失败', e);
  }
  renderHistoryList(
    el,
    list,
    (r) => {
      const cardsHTML = (r.cards || []).map((c) =>
        `<span>${escapeHTML(c.name)}${c.reversed ? '·逆' : '·正'}</span>`
      ).join('');
      const spreadLabel = r.spread === 'single' ? '单张牌' : '过去·现在·未来';
      return historyCardHTML(
        r,
        `<div class="games-history-cards">${cardsHTML}</div>
         <div class="games-history-text">${escapeHTML(r.reading || '')}</div>
         <div class="games-history-sub">牌阵：${escapeHTML(spreadLabel)}</div>`,
        `<span class="games-history-tag">塔罗</span>`
      );
    },
    async (id) => {
      await deleteDB(STORES.tarotGame, id);
      renderTarotHistory(el);
    },
    { icon: 'dream', text: '让塔罗牌偷偷告诉你今天的事' }
  );
}

// 切换 tab 时清空当前局（避免回到塔罗 tab 还看到上一局）
export function resetTarotState() {
  drawnCards = [];
}
