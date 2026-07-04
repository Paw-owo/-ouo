// apps/games/undercover.js
// 谁是卧底 —— 我和两个 AI 玩家一起玩，每人拿到一个词，卧底的词和别人不一样。
// 流程：看词 -> AI 发言 -> 我发言 -> 投票 -> 结算（公布身份 + 胜负）。
// 数据：STORES.drawGuess {id, wordPair, userWord, userRole, result, players, createdAt}
// 事件：每局结束 bus.emit('games:result', {game:'谁是卧底', result})
// 红线：图标只用 SVG 线稿，禁止任何 emoji 字符；视觉值走 CSS 变量。

import { STORES } from '../../core/storage-keys.js';
import { getAllDB, setDB, deleteDB, generateId, getNow } from '../../core/storage.js';
import { createIcon } from '../../core/ui.js';
import bus from '../../core/events.js';
import { pick } from '../../core/util.js';
import { WORD_PAIRS, UNDERCOVER_SPEECHES, AI_PLAYER_NAMES, UNDERCOVER_RESULTS } from './data.js';
import { escapeHTML, escapeAttr, aiText, renderHistoryList, historyCardHTML, sleep } from './shared.js';

// 一局的状态
let game = null;
// game = {
//   pair, userWord, userRole, undercoverWord,
//   players: [{name, isMe, role, word, speech, votedFor}],
//   phase: 'word' | 'speech' | 'vote' | 'result',
//   result
// }

// ════════════════════════════════════════
// 渲染入口
// ════════════════════════════════════════

export function renderUndercover(content) {
  content.innerHTML = `
    <div class="games-info">
      <div class="games-info-icon">${createIcon('games', 18).outerHTML}</div>
      <div class="games-info-text">三人局：你 + 两个 AI 玩家，其中一个拿到了不一样的词。看完词、发言、投票，揪出卧底吧。</div>
    </div>
    <div class="games-btn-row">
      <button class="btn primary" id="uc-start">${createIcon('dice', 18).outerHTML}${game ? '重新开局' : '开始一局'}</button>
    </div>
    <div id="uc-stage"></div>
    <div class="games-history-title">对局记录</div>
    <div id="uc-history"></div>
  `;
  content.querySelector('#uc-start').addEventListener('click', () => startGame(content));
  if (game) renderStage(content);
  renderUndercoverHistory(content.querySelector('#uc-history'));
}

// ════════════════════════════════════════
// 开局：选词对、分配身份
// ════════════════════════════════════════

function startGame(content) {
  const pair = pick(WORD_PAIRS) || WORD_PAIRS[0];
  // 随机决定哪个词是多数词，哪个是卧底词（词对里 majority 是平民词）
  // 50% 概率交换，让用户有时拿平民词有时拿卧底词
  const flip = Math.random() < 0.5;
  const majorityWord = flip ? pair.undercover : pair.majority;
  const undercoverWord = flip ? pair.majority : pair.undercover;
  // 三人：1 卧底 2 平民。用户 50% 是卧底
  const userIsUndercover = Math.random() < 0.5;
  // 玩家顺序：用户放中间，方便看 AI 发言
  const players = [
    { name: AI_PLAYER_NAMES[0], isMe: false, role: 'unknown', word: '', speech: '', votedFor: null },
    { name: '我', isMe: true, role: 'unknown', word: '', speech: '', votedFor: null },
    { name: AI_PLAYER_NAMES[1], isMe: false, role: 'unknown', word: '', speech: '', votedFor: null }
  ];
  // 分配身份：用户是卧底 -> 用户拿 undercoverWord，两个 AI 拿 majorityWord
  //         用户是平民 -> 其中一个 AI 是卧底
  if (userIsUndercover) {
    players[1].role = 'undercover';
    players[1].word = undercoverWord;
    players[0].role = 'civilian';
    players[0].word = majorityWord;
    players[2].role = 'civilian';
    players[2].word = majorityWord;
  } else {
    // 用户是平民 -> 其中一个 AI 是卧底
    players[1].role = 'civilian';
    players[1].word = majorityWord;
    // 随机挑一个 AI 当卧底，另一个 AI 当平民
    const undercoverIdx = Math.random() < 0.5 ? 0 : 2;
    players.forEach((p, i) => {
      if (p.isMe) return;
      if (i === undercoverIdx) {
        p.role = 'undercover';
        p.word = undercoverWord;
      } else {
        p.role = 'civilian';
        p.word = majorityWord;
      }
    });
  }
  game = {
    pair,
    userWord: players[1].word,
    userRole: players[1].role,
    undercoverWord,
    majorityWord,
    players,
    phase: 'word',
    result: null
  };
  renderStage(content);
}

// ════════════════════════════════════════
// 阶段渲染
// ════════════════════════════════════════

function renderStage(content) {
  const stage = content.querySelector('#uc-stage');
  if (!stage || !game) return;
  if (game.phase === 'word') renderWordStage(stage);
  else if (game.phase === 'speech') renderSpeechStage(stage);
  else if (game.phase === 'vote') renderVoteStage(stage);
  else if (game.phase === 'result') renderResultStage(stage);
}

// 阶段 1：看词
function renderWordStage(stage) {
  stage.innerHTML = `
    <div class="uc-phase">${createIcon('memo', 14).outerHTML}你的词</div>
    <div class="uc-word-card">
      <div class="uc-word-label">悄悄记住，别让人看出来</div>
      <div class="uc-word-text">${escapeHTML(game.userWord)}</div>
      <div class="uc-word-hint">你是平民还是卧底？要自己猜哦</div>
    </div>
    <button class="btn primary block" id="uc-to-speech">${createIcon('next', 16).outerHTML}开始发言</button>
  `;
  stage.querySelector('#uc-to-speech').addEventListener('click', async () => {
    game.phase = 'speech';
    renderStage(stage);
    // 异步生成 AI 发言
    await generateAISpeeches(stage);
  });
}

// 阶段 2：发言
function renderSpeechStage(stage, loadingAI = false) {
  // 收集已发言的内容
  const speechesHTML = game.players
    .filter((p) => p.speech)
    .map((p) => speechHTML(p))
    .join('');
  const aiPending = game.players.filter((p) => !p.isMe && !p.speech).length > 0;
  stage.innerHTML = `
    <div class="uc-phase">${createIcon('chat', 14).outerHTML}轮流发言</div>
    <div class="uc-speeches">${speechesHTML}</div>
    ${aiPending
      ? `<div class="tarot-loading">${createIcon('chat', 16).outerHTML}<span>${AI_PLAYER_NAMES[0]} 在想词...</span></div>`
      : (game.players[1].speech
          ? `<div class="games-btn-row"><button class="btn primary" id="uc-to-vote">${createIcon('next', 16).outerHTML}去投票</button></div>`
          : userInputHTML())
    }
  `;
  if (!aiPending && !game.players[1].speech) {
    const btn = stage.querySelector('#uc-submit-speech');
    if (btn) btn.addEventListener('click', () => submitUserSpeech(stage));
  }
  if (!aiPending && game.players[1].speech) {
    const btn = stage.querySelector('#uc-to-vote');
    if (btn) btn.addEventListener('click', () => {
      game.phase = 'vote';
      renderStage(stage);
    });
  }
}

function userInputHTML() {
  return `
    <div class="uc-input-row">
      <textarea id="uc-speech-input" placeholder="描述一下你的词，但别直接说出来..."></textarea>
    </div>
    <button class="btn primary block" id="uc-submit-speech">${createIcon('check', 16).outerHTML}我说完啦</button>
  `;
}

function speechHTML(p) {
  return `
    <div class="uc-speech ${p.isMe ? 'me' : ''}">
      <div class="uc-speech-avatar ${p.isMe ? 'me' : ''}">${escapeHTML(p.name.slice(0, 1))}</div>
      <div class="uc-speech-main">
        <div class="uc-speech-name">${escapeHTML(p.name)}</div>
        <div class="uc-speech-text">${escapeHTML(p.speech)}</div>
      </div>
    </div>
  `;
}

// 异步为两个 AI 玩家生成发言
async function generateAISpeeches(stage) {
  for (const p of game.players) {
    if (p.isMe || p.speech) continue;
    const fallback = pick(UNDERCOVER_SPEECHES) || UNDERCOVER_SPEECHES[0];
    const sys = '你是参与"谁是卧底"游戏的玩家，第一人称，软萌语气，发言 20-40 字，不要用 emoji，不要直接说出自己的词。';
    const user = `你的词是「${p.word}」。请用一句话描述它，让同阵营的人认出你，又不要被对手识破。`;
    const text = await aiText(sys, user, fallback);
    p.speech = text || fallback;
    renderStage(stage);
    await sleep(180); // 让两条发言有点节奏感
  }
}

// 用户发言
function submitUserSpeech(stage) {
  const input = stage.querySelector('#uc-speech-input');
  if (!input) return;
  const text = input.value.trim();
  if (!text) {
    game.players[1].speech = pick(UNDERCOVER_SPEECHES) || UNDERCOVER_SPEECHES[0];
  } else {
    game.players[1].speech = text.slice(0, 80);
  }
  renderStage(stage);
}

// 阶段 3：投票
function renderVoteStage(stage) {
  const candidates = game.players.filter((p) => !p.isMe);
  stage.innerHTML = `
    <div class="uc-phase">${createIcon('check', 14).outerHTML}投票：你觉得谁是卧底？</div>
    <div class="uc-vote-row">
      ${candidates.map((p, i) => `
        <button class="uc-vote-btn" data-vote="${escapeAttr(p.name)}">
          <div class="uc-speech-avatar">${escapeHTML(p.name.slice(0, 1))}</div>
          <div>
            <div style="font-weight:600;font-size:var(--font-size-base);">${escapeHTML(p.name)}</div>
            <div class="uc-speech-text" style="margin-top:2px;">${escapeHTML(p.speech)}</div>
          </div>
        </button>
      `).join('')}
    </div>
    <button class="btn ghost block" id="uc-vote-skip" style="margin-top:8px;">弃票</button>
  `;
  stage.querySelectorAll('[data-vote]').forEach((btn) => {
    btn.addEventListener('click', () => finishVote(stage, btn.dataset.vote));
  });
  stage.querySelector('#uc-vote-skip').addEventListener('click', () => finishVote(stage, null));
}

// 投票后：AI 也投，结算
async function finishVote(stage, userVote) {
  // 用户投票
  game.players[1].votedFor = userVote;
  // AI 投票：平民倾向投"发言可疑"的人，卧底倾向投平民用户
  // 简化：AI 卧底投用户，AI 平民 50% 投用户 50% 投另一个 AI
  for (const p of game.players) {
    if (p.isMe) continue;
    if (p.role === 'undercover') {
      // 卧底投用户
      p.votedFor = '我';
    } else {
      // 平民：50% 投用户，50% 投另一个非己 AI
      const others = game.players.filter((o) => o.name !== p.name);
      if (Math.random() < 0.5) p.votedFor = '我';
      else p.votedFor = others.find((o) => !o.isMe)?.name || '我';
    }
  }
  // 统计票数
  const tally = {};
  game.players.forEach((p) => {
    if (!p.votedFor) return;
    tally[p.votedFor] = (tally[p.votedFor] || 0) + 1;
  });
  // 找最高票
  let maxVotes = 0;
  let topNames = [];
  Object.entries(tally).forEach(([name, v]) => {
    if (v > maxVotes) { maxVotes = v; topNames = [name]; }
    else if (v === maxVotes) topNames.push(name);
  });
  // 结算
  let resultKey;
  let resultText;
  if (topNames.length > 1) {
    // 平票
    resultKey = 'tie';
    resultText = UNDERCOVER_RESULTS.tie;
  } else {
    const outName = topNames[0];
    const outPlayer = game.players.find((p) => p.name === outName);
    const outIsUndercover = outPlayer && outPlayer.role === 'undercover';
    if (game.userRole === 'undercover') {
      // 用户是卧底
      if (outName === '我') {
        // 用户被投出 -> 卧底输
        resultKey = 'userUndercardLose';
        resultText = UNDERCOVER_RESULTS.userUndercardLose;
      } else {
        // 用户没被投出 -> 卧底赢
        resultKey = 'userUndercoverWin';
        resultText = UNDERCOVER_RESULTS.userUndercoverWin;
      }
    } else {
      // 用户是平民
      if (outIsUndercover) {
        resultKey = 'userCivilianWin';
        resultText = UNDERCOVER_RESULTS.userCivilianWin;
      } else {
        resultKey = 'userCivilianLose';
        resultText = UNDERCOVER_RESULTS.userCivilianLose;
      }
    }
  }
  game.result = resultKey;
  game.phase = 'result';
  // 存记录
  const record = {
    id: generateId('uc'),
    wordPair: `${game.pair.majority}/${game.pair.undercover}`,
    userWord: game.userWord,
    userRole: game.userRole,
    result: resultKey,
    players: game.players.map((p) => ({ name: p.name, role: p.role, word: p.word, speech: p.speech, votedFor: p.votedFor })),
    createdAt: getNow()
  };
  try {
    await setDB(STORES.drawGuess, record.id, record);
    // 往上找到 content 容器，再找历史列表
    const content = stage.closest('#games-content') || stage.parentElement;
    const histEl = content?.querySelector('#uc-history');
    if (histEl) renderUndercoverHistory(histEl);
  } catch (e) {
    console.warn('[games] 谁是卧底历史写入失败', e);
  }
  // 事件注入
  bus.emit('games:result', { game: '谁是卧底', result: resultText });
  renderStage(stage);
}

// 阶段 4：结算
function renderResultStage(stage) {
  const words = game.players.map((p) =>
    `<span>${escapeHTML(p.name)}：${escapeHTML(p.word)}（${p.role === 'undercover' ? '卧底' : '平民'}）</span>`
  ).join('');
  stage.innerHTML = `
    <div class="uc-result">
      <div class="uc-result-tag">本局结果</div>
      <div class="uc-result-text">${escapeHTML(UNDERCOVER_RESULTS[game.result] || '本局结束')}</div>
      <div class="uc-result-words">${words}</div>
    </div>
    <div class="games-btn-row">
      <button class="btn primary" id="uc-again">${createIcon('dice', 16).outerHTML}再来一局</button>
    </div>
  `;
  // 再来一局：往上找到 content 容器，重新开局
  stage.querySelector('#uc-again').addEventListener('click', () => {
    const content = stage.closest('#games-content') || stage.parentElement;
    startGame(content);
  });
}

// ════════════════════════════════════════
// 历史记录
// ════════════════════════════════════════

async function renderUndercoverHistory(el) {
  let list = [];
  try {
    list = await getAllDB(STORES.drawGuess);
  } catch (e) {
    console.warn('[games] 读取谁是卧底历史失败', e);
  }
  renderHistoryList(
    el,
    list,
    (r) => {
      const role = r.userRole === 'undercover' ? '卧底' : '平民';
      const win = r.result === 'userUndercoverWin' || r.result === 'userCivilianWin';
      const tie = r.result === 'tie';
      const outcome = tie ? '平局' : (win ? '赢' : '输');
      const inner = `
        <div class="games-history-text">词对：${escapeHTML(r.wordPair || '')}</div>
        <div class="games-history-sub">你的词：${escapeHTML(r.userWord || '')} · 身份：${escapeHTML(role)} · 结果：${escapeHTML(outcome)}</div>
      `;
      return historyCardHTML(r, inner, `<span class="games-history-tag undercover">谁是卧底</span>`);
    },
    async (id) => {
      await deleteDB(STORES.drawGuess, id);
      renderUndercoverHistory(el);
    },
    { icon: 'games', text: '还没有对局，点上面开一局嘛' }
  );
}

// 切换 tab 时清空当前局
export function resetUndercoverState() {
  game = null;
}
