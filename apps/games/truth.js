// apps/games/truth.js
// 真心话大冒险 —— 我和初一互相出题，回答完她还会偷偷回应你一句。
// 流程：选真心话/大冒险 -> 出题（AI 或预设）-> 用户回答 -> AI 评价/追问（或预设回应）-> 存记录。
// 数据：STORES.truthGame {id, type, question, answer, comment, createdAt}
// 事件：每局结束 bus.emit('games:result', {game:'真心话大冒险', result})
// 红线：图标只用 SVG 线稿，禁止任何 emoji 字符；视觉值走 CSS 变量。

import { STORES } from '../../core/storage-keys.js';
import { getAllDB, setDB, deleteDB, generateId, getNow } from '../../core/storage.js';
import { createIcon } from '../../core/ui.js';
import bus from '../../core/events.js';
import { pick } from '../../core/util.js';
import { recordInteraction } from '../../core/memory.js';
import { TRUTH_QUESTIONS, DARE_QUESTIONS, TRUTH_COMMENTS, DARE_COMMENTS } from './data.js';
import { escapeHTML, aiText, renderHistoryList, historyCardHTML } from './shared.js';
import { reportScore } from './score.js';

// 当前题目状态
let currentType = 'truth';   // 'truth' | 'dare'
let currentQuestion = '';

// ════════════════════════════════════════
// 渲染入口
// ════════════════════════════════════════

export function renderTruth(content) {
  content.innerHTML = `
    <div class="games-info">
      <div class="games-info-icon">${createIcon('chat', 18).outerHTML}</div>
      <div class="games-info-text">选真心话还是大冒险？回答完，初一会偷偷回应你一句哦。有 AI 时题目和回应都是专属生成的。</div>
    </div>
    <div class="truth-actions">
      <button class="truth-btn truth ${currentType === 'truth' ? 'active' : ''}" id="truth-truth">
        ${createIcon('chat', 24).outerHTML}
        <span>真心话</span>
      </button>
      <button class="truth-btn dare ${currentType === 'dare' ? 'active' : ''}" id="truth-dare">
        ${createIcon('gift', 24).outerHTML}
        <span>大冒险</span>
      </button>
    </div>
    <div id="truth-card"></div>
    <div class="games-history-title">游戏记录</div>
    <div id="truth-history"></div>
  `;
  content.querySelector('#truth-truth').addEventListener('click', () => {
    currentType = 'truth';
    drawQuestion(content);
  });
  content.querySelector('#truth-dare').addEventListener('click', () => {
    currentType = 'dare';
    drawQuestion(content);
  });
  // 已有题目时复用
  if (currentQuestion) renderQuestionCard(content);
  renderTruthHistory(content.querySelector('#truth-history'));
}

// ════════════════════════════════════════
// 出题
// ════════════════════════════════════════

async function drawQuestion(content) {
  const cardEl = content.querySelector('#truth-card');
  if (!cardEl) return;
  const pool = currentType === 'dare' ? DARE_QUESTIONS : TRUTH_QUESTIONS;
  const fallback = pick(pool) || pool[0];
  // 有 AI 时让 AI 出一道题；无 AI 走预设
  const sys = '你是软萌少女，第一人称，温柔可爱。只输出一道题的题目文本，不要加任何前缀、解释或 emoji。';
  const user = currentType === 'dare'
    ? '请出一道大冒险的题目，要好玩、有点小挑战，但不要太过分，30 字以内。'
    : '请出一道真心话的题目，关心对方的内心，温柔一点，30 字以内。';
  // 先放 loading
  currentQuestion = fallback;
  renderQuestionCard(content, true);
  const q = await aiText(sys, user, fallback);
  currentQuestion = (q || fallback).slice(0, 60);
  renderQuestionCard(content);
}

function renderQuestionCard(content, loading = false) {
  const cardEl = content.querySelector('#truth-card');
  if (!cardEl || !currentQuestion) return;
  const label = currentType === 'dare' ? '大冒险' : '真心话';
  const icon = currentType === 'dare' ? 'gift' : 'chat';
  cardEl.innerHTML = `
    <div class="truth-card">
      <div class="truth-card-label">
        ${createIcon(icon, 16).outerHTML}
        <span>${label}</span>
      </div>
      <div class="truth-card-q">${escapeHTML(currentQuestion)}</div>
      <div class="truth-card-actions">
        <button class="btn ghost" id="truth-change">${createIcon('next', 16).outerHTML}换一题</button>
      </div>
      <div class="truth-answer">
        <textarea id="truth-answer-input" placeholder="${currentType === 'dare' ? '做完啦？说说你做了什么呀' : '写下来嘛，初一不会告诉别人的'}"></textarea>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn primary" id="truth-submit" ${loading ? 'disabled' : ''}>${loading ? '出题中...' : '交出来'}</button>
        </div>
      </div>
    </div>
    <div id="truth-comment"></div>
  `;
  cardEl.querySelector('#truth-change').addEventListener('click', () => drawQuestion(content));
  if (!loading) {
    cardEl.querySelector('#truth-submit').addEventListener('click', () => submitAnswer(content));
  }
}

// ════════════════════════════════════════
// 提交回答 -> AI 评价/追问（或预设回应）-> 存记录
// ════════════════════════════════════════

async function submitAnswer(content) {
  const input = content.querySelector('#truth-answer-input');
  if (!input) return;
  const answer = input.value.trim();
  if (!answer) {
    // 大冒险允许不写，但真心话鼓励写
    if (currentType === 'truth') {
      const commentEl = content.querySelector('#truth-comment');
      if (commentEl) {
        commentEl.innerHTML = `<div class="truth-comment"><div class="truth-comment-icon">${createIcon('chat', 18).outerHTML}</div><div>不说也没关系啦，但我等着你愿意告诉我的那天</div></div>`;
      }
      return;
    }
  }
  // 渲染 loading 回应
  const commentEl = content.querySelector('#truth-comment');
  if (commentEl) {
    commentEl.innerHTML = `<div class="truth-comment"><div class="truth-comment-icon">${createIcon('chat', 18).outerHTML}</div><div>初一正在偷偷想怎么回应你...</div></div>`;
  }
  // 生成回应
  const fallbackPool = currentType === 'dare' ? DARE_COMMENTS : TRUTH_COMMENTS;
  const fallback = pick(fallbackPool) || fallbackPool[0];
  const sys = '你是软萌少女初一，第一人称，温柔可爱，回复简短（30-60字），不要用 emoji，可以追问或评价，不要复述对方的话。';
  const user = currentType === 'dare'
    ? `我抽到大冒险：「${currentQuestion}」，我做了这些：${answer || '（没做呢）'}。回应我一下嘛。`
    : `我抽到真心话：「${currentQuestion}」，我的回答是：${answer}。回应我一下嘛。`;
  const comment = await aiText(sys, user, fallback);
  if (commentEl) {
    commentEl.innerHTML = `<div class="truth-comment"><div class="truth-comment-icon">${createIcon('chat', 18).outerHTML}</div><div>${escapeHTML(comment)}</div></div>`;
  }
  // 存历史
  const record = {
    id: generateId('truth'),
    type: currentType,
    question: currentQuestion,
    answer,
    comment,
    createdAt: getNow()
  };
  try {
    await setDB(STORES.truthGame, record.id, record);
    const histEl = content.querySelector('#truth-history');
    if (histEl) renderTruthHistory(histEl);
  } catch (e) {
    console.warn('[games] 真心话历史写入失败', e);
  }
  // 事件注入
  bus.emit('games:result', {
    game: '真心话大冒险',
    result: `${label(currentType)}：${currentQuestion}`
  });
  // 上报积分：完成一局 +10 分
  try { reportScore('truth', 10); } catch (e) { console.warn('[games] 真心话积分上报失败', e); }
  // 写入长期记忆，让 AI 知道主人玩过真心话大冒险
  try {
    await recordInteraction({
      characterId: 'global',
      role: 'user',
      source: 'game',
      content: `玩了真心话大冒险：${label(currentType)}：${currentQuestion}`,
      importance: 3,
      relatedApp: 'games'
    });
  } catch (e) {
    console.warn('[games] 真心话记忆写入失败', e);
  }
}

function label(type) {
  return type === 'dare' ? '大冒险' : '真心话';
}

// ════════════════════════════════════════
// 历史记录
// ════════════════════════════════════════

async function renderTruthHistory(el) {
  let list = [];
  try {
    list = await getAllDB(STORES.truthGame);
  } catch (e) {
    console.warn('[games] 读取真心话历史失败', e);
  }
  renderHistoryList(
    el,
    list,
    (r) => {
      const isDare = r.type === 'dare';
      const tag = isDare ? '大冒险' : '真心话';
      const inner = `
        <div class="games-history-text">${escapeHTML(r.question || '')}</div>
        ${r.answer ? `<div class="games-history-sub">我：${escapeHTML(r.answer)}</div>` : ''}
        ${r.comment ? `<div class="games-history-sub">初一：${escapeHTML(r.comment)}</div>` : ''}
      `;
      return historyCardHTML(r, inner, `<span class="games-history-tag ${isDare ? 'dare' : ''}">${tag}</span>`);
    },
    async (id) => {
      await deleteDB(STORES.truthGame, id);
      renderTruthHistory(el);
    },
    { icon: 'chat', text: '还没有玩过，点上面挑一个嘛' }
  );
}

// 切换 tab 时清空当前局
export function resetTruthState() {
  currentType = 'truth';
  currentQuestion = '';
}
