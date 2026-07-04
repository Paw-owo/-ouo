// apps/games/score.js
// 小游戏合集的统一积分 & 成就系统 —— 我把每个小游戏的分数都收进同一个罐子里。
// 数据：localStorage KEYS.gamesProgress
//   { totalScore, totalPlays, games: { tarot/truth/undercover/tavern/dice: {highScore, plays} }, achievements: {key:bool} }
// 红线：图标只用 SVG 线稿，禁止 emoji；视觉值走 CSS 变量。

import { KEYS } from '../../core/storage-keys.js';
import { getData, setData } from '../../core/storage.js';
import { showToast, createIcon } from '../../core/ui.js';
import bus from '../../core/events.js';

// 5 个游戏 id（顺序固定，用于展示）
export const GAME_IDS = ['tarot', 'truth', 'undercover', 'tavern', 'dice'];

// 游戏显示名
export const GAME_LABELS = {
  tarot: '塔罗牌',
  truth: '真心话',
  undercover: '谁是卧底',
  tavern: '骗子酒馆',
  dice: '骰子'
};

// 成就定义
export const ACHIEVEMENTS = [
  { key: 'firstGame', label: '初出茅庐', desc: '玩过 1 个游戏', icon: 'star' },
  { key: 'allGames',  label: '游戏达人', desc: '玩过所有 5 个游戏', icon: 'gift' },
  { key: 'plays50',   label: '百战不殆', desc: '总共玩 50 局', icon: 'games' },
  { key: 'lucky',     label: '幸运儿',   desc: '骰子掷出豹子', icon: 'dice' }
];

function defaultProgress() {
  return {
    totalScore: 0,
    totalPlays: 0,
    games: GAME_IDS.reduce((acc, id) => {
      acc[id] = { highScore: 0, plays: 0 };
      return acc;
    }, {}),
    achievements: {}
  };
}

// 读取进度（合并默认值，兼容老数据）
export function getProgress() {
  const raw = getData(KEYS.gamesProgress, null);
  if (!raw) return defaultProgress();
  const def = defaultProgress();
  return {
    totalScore: raw.totalScore || 0,
    totalPlays: raw.totalPlays || 0,
    games: GAME_IDS.reduce((acc, id) => {
      const g = (raw.games && raw.games[id]) || {};
      acc[id] = { highScore: g.highScore || 0, plays: g.plays || 0 };
      return acc;
    }, {}),
    achievements: raw.achievements || {}
  };
}

function saveProgress(p) {
  setData(KEYS.gamesProgress, p);
}

/**
 * 上报一局分数：自动更新总分、最高分、对局数，并检查成就。
 * @param {string} gameId
 * @param {number} score 本局得分（负值按 0 处理）
 * @param {object} opts { achievement } 额外成就触发，目前支持 'lucky'
 * @returns {Array<string>} 新达成的成就 key 列表
 */
export function reportScore(gameId, score, opts = {}) {
  if (!GAME_IDS.includes(gameId)) return [];
  const p = getProgress();
  const safeScore = Math.max(0, Math.round(score || 0));
  p.totalScore += safeScore;
  p.totalPlays += 1;
  const g = p.games[gameId];
  g.plays += 1;
  if (safeScore > g.highScore) g.highScore = safeScore;

  const newly = [];
  // 初出茅庐：玩过 1 个游戏
  if (!p.achievements.firstGame && p.totalPlays >= 1) {
    p.achievements.firstGame = true;
    newly.push('firstGame');
  }
  // 游戏达人：玩过所有 5 个游戏
  if (!p.achievements.allGames && GAME_IDS.every((id) => p.games[id].plays > 0)) {
    p.achievements.allGames = true;
    newly.push('allGames');
  }
  // 百战不殆：总共玩 50 局
  if (!p.achievements.plays50 && p.totalPlays >= 50) {
    p.achievements.plays50 = true;
    newly.push('plays50');
  }
  // 幸运儿：骰子掷出豹子（外部触发）
  if (opts.achievement === 'lucky' && !p.achievements.lucky) {
    p.achievements.lucky = true;
    newly.push('lucky');
  }
  saveProgress(p);

  // toast 提示新成就
  newly.forEach((k) => {
    const a = ACHIEVEMENTS.find((x) => x.key === k);
    if (a) showToast(`成就达成：${a.label}！${a.desc}`, 'success', 2400);
  });
  // 通知外面刷新积分卡（games/index.js 会监听）
  bus.emit('games:score-updated', { gameId, score: safeScore, newly });
  return newly;
}

/**
 * 渲染"我的游戏积分"卡片到 mountEl。
 * @param {HTMLElement} mountEl 挂载点
 */
export function renderScoreCard(mountEl) {
  if (!mountEl) return;
  const p = getProgress();
  const achievedCount = Object.values(p.achievements).filter(Boolean).length;
  mountEl.innerHTML = `
    <div class="games-score-card">
      <div class="games-score-top">
        <div class="games-score-icon">${createIcon('star', 18).outerHTML}</div>
        <div class="games-score-title">我是游戏小达人</div>
        <div class="games-score-total">${p.totalScore}</div>
        <div class="games-score-total-label">总积分</div>
      </div>
      <div class="games-score-games">
        ${GAME_IDS.map((id) => `
          <div class="games-score-game">
            <div class="games-score-game-name">${GAME_LABELS[id]}</div>
            <div class="games-score-game-val">${p.games[id].highScore}</div>
            <div class="games-score-game-label">最高分</div>
          </div>
        `).join('')}
      </div>
      <div class="games-score-achv">
        <div class="games-score-achv-title">${createIcon('gift', 14).outerHTML}成就 ${achievedCount}/${ACHIEVEMENTS.length}</div>
        <div class="games-score-achv-row">
          ${ACHIEVEMENTS.map((a) => `
            <div class="games-score-achv-item ${p.achievements[a.key] ? 'on' : ''}" title="${escapeAttr(a.desc)}">
              <div class="games-score-achv-icon">${createIcon(a.icon, 18).outerHTML}</div>
              <div class="games-score-achv-name">${escapeHTML(a.label)}</div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

// ════════════════════════════════════════
// 小工具
// ════════════════════════════════════════

function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function escapeAttr(s) { return escapeHTML(s); }
