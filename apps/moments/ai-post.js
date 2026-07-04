// apps/moments/ai-post.js
// 初一在朋友圈的「自主行为」——她会偷偷发动态、给主人点赞、留一句评论。
// 用户新发动态后：2-5 秒自动点赞（likes+1，likedByMe 不变），5-10 秒自动评论。
// 评论优先用 chatOnce 生成（需要配置 AI），没配置或失败就回退到预设池。
// 红线：图标只准 SVG 线稿，禁止 emoji；视觉值走 CSS 变量。
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js, core/ai-client.js, core/util.js, ./shared.js, ./comments.js

import { STORES } from '../../core/storage-keys.js';
import { getDB, setDB, getAllDB, generateId, getNow, getData, setData } from '../../core/storage.js';
import { showToast } from '../../core/ui.js';
import bus from '../../core/events.js';
import { chatOnce, isAIConfigured } from '../../core/ai-client.js';
import { pick } from '../../core/util.js';
import { getMemories } from '../../core/memory.js';
import { AI_POST_POOL, AI_COMMENT_POOL, normalizeMoment } from './shared.js';
import { addCommentBy } from './comments.js';

// 触发主动发动态的事件来源（送礼 / 转账 / 心情 / 游戏）
const AUTO_POST_SOURCES = ['gift', 'transfer', 'mood', 'game'];
// 各事件在 prompt 里的人话名称
const EVENT_NAME_MAP = {
  gift: '一份礼物',
  transfer: '一笔转账',
  mood: '一份心情分享',
  game: '一起玩游戏'
};
// localStorage key 前缀：记录某角色上次主动发动态的时间戳，避免重复触发
const LS_LAST_AUTO_POST_PREFIX = 'moments_last_auto_post_';

// ════════════════════════════════════════
// 初一发动态
// ════════════════════════════════════════

/**
 * 从 STORES.photoAlbums 里随机取一张图片给初一配图。
 * photoAlbums 暂无固定 schema，我把常见字段都试一遍，没有就返回空。
 */
async function pickPhotoFromAlbums() {
  try {
    const all = await getAllDB(STORES.photoAlbums);
    if (!Array.isArray(all) || all.length === 0) return '';
    const imgs = [];
    for (const r of all) {
      if (!r) continue;
      const candidates = [r.image, r.dataURL, r.src, r.url, r.thumbnail, r.thumb];
      for (const c of candidates) {
        if (typeof c === 'string' && (c.startsWith('data:') || c.startsWith('http') || c.startsWith('blob:'))) {
          imgs.push(c);
        }
      }
      // 也可能是 photos 数组
      if (Array.isArray(r.photos)) {
        for (const p of r.photos) {
          if (typeof p === 'string' && (p.startsWith('data:') || p.startsWith('http'))) imgs.push(p);
          else if (p && typeof p === 'object' && typeof p.url === 'string') imgs.push(p.url);
        }
      }
    }
    return imgs.length > 0 ? pick(imgs) : '';
  } catch (e) {
    console.warn('[moments] 取相册图片失败', e);
    return '';
  }
}

/** 让初一偷偷发一条动态 */
export async function aiPost() {
  try {
    const content = pick(AI_POST_POOL) || '今天也想了你一下';
    const images = [];
    // 30% 概率从相册随机带一张图，没有就纯文字
    if (Math.random() < 0.3) {
      const img = await pickPhotoFromAlbums();
      if (img) images.push(img);
    }
    const id = generateId('moment');
    const record = normalizeMoment({
      id,
      author: '初一',
      content,
      images,
      likes: 0,
      likedByMe: false,
      comments: [],
      pinned: false,
      visibility: 'public',
      createdAt: getNow()
    });
    await setDB(STORES.moments, id, record);
    showToast('初一偷偷发了一条', 'success', 1400);
    // 事件注入：消息中心会捕获
    bus.emit('moments:new', { author: '初一', preview: content.slice(0, 30), momentId: id });
    return record;
  } catch (e) {
    console.warn('[moments] AI 发帖失败', e);
    showToast('初一还没想好发什么呢', 'error');
    return null;
  }
}

// ════════════════════════════════════════
// AI 主动发动态
// 进入朋友圈 App 时调用：检查该角色 24h 内是否发生过送礼 / 转账 / 心情 / 游戏事件，
// 命中则有 30% 概率主动发一条动态。同一事件 24h 内只触发一次。
// @param {string} characterId  角色 id（默认 char_chuyi）
// ════════════════════════════════════════

export async function maybeAutoPost(characterId) {
  const cid = characterId || 'char_chuyi';
  try {
    // 取该角色最近的所有记忆，挑出 source 在白名单里的最新一条
    const all = await getMemories(cid, {});
    const recent = (all || [])
      .filter((m) => AUTO_POST_SOURCES.includes(m.source))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
    if (!recent) return null;
    // 24h 外的不算
    const ageMs = Date.now() - new Date(recent.timestamp).getTime();
    if (isNaN(ageMs) || ageMs > 24 * 3600 * 1000) return null;
    // 同一事件 24h 内只触发一次：用 source + relatedId（没有就用 content 前缀）做去重 key
    const dedupKey = `${cid}:${recent.source}:${recent.relatedId || (recent.content || '').slice(0, 30)}`;
    const lastKey = LS_LAST_AUTO_POST_PREFIX + dedupKey;
    const lastTs = Number(getData(lastKey, 0)) || 0;
    if (lastTs && Date.now() - lastTs < 24 * 3600 * 1000) return null;
    // 30% 概率主动发
    if (Math.random() >= 0.3) return null;

    // 标记已触发，落盘时间戳
    setData(lastKey, Date.now());

    // 取角色名（拿不到就用「初一」兜底）
    let author = '初一';
    try {
      const c = await getDB(STORES.characters, cid);
      if (c && c.name) author = c.name;
    } catch (e) {}

    // 生成动态文案：有 AI 配置就走 AI，否则用预设池
    const eventName = EVENT_NAME_MAP[recent.source] || '一件开心的事';
    let content = '';
    if (isAIConfigured()) {
      content = await generateAutoPostText(eventName, author);
    }
    if (!content) content = pick(AUTO_POST_POOL_FALLBACK) || pick(AI_POST_POOL);

    const id = generateId('moment');
    const record = normalizeMoment({
      id,
      author,
      content,
      images: [],
      likes: 0,
      likedByMe: false,
      comments: [],
      pinned: false,
      visibility: 'public',
      createdAt: getNow()
    });
    await setDB(STORES.moments, id, record);
    bus.emit('moments:new', { author, preview: content.slice(0, 30), momentId: id });
    return record;
  } catch (e) {
    console.warn('[moments] AI 主动发动态失败', e);
    return null;
  }
}

// 调 AI 生成一条主动发的朋友圈文案
async function generateAutoPostText(eventName, author) {
  try {
    const messages = [
      {
        role: 'system',
        content: `你是${author}，软萌可爱的女孩子，第一人称。请用一句话发一条朋友圈动态，表达刚刚收到${eventName}的心情，30 字以内，不要用 emoji，不要加引号或前缀。`
      },
      { role: 'user', content: `刚刚收到了${eventName}，发条朋友圈吧` }
    ];
    const r = await chatOnce({ messages });
    if (r && r.ok && r.text) {
      let t = r.text.trim().replace(/\s+/g, ' ').replace(/^["'「『】」』]+|["'「『】」』]+$/g, '');
      if (t.length > 40) t = t.slice(0, 40);
      return t;
    }
    return '';
  } catch (e) {
    return '';
  }
}

// 没配置 AI 时的预设文案池
const AUTO_POST_POOL_FALLBACK = [
  '今天好开心呀~',
  '被宠到的感觉真好',
  '哼哼，今天也是被照顾的一天',
  '心情棒棒的！',
  '今天的我也要元气满满'
];

// ════════════════════════════════════════
// AI 自动点赞（用户新动态后 2-5 秒）
// ════════════════════════════════════════

/** 给某条动态安排一次初一自动点赞 */
export function scheduleAILike(momentId, onReacted) {
  const delay = 2000 + Math.floor(Math.random() * 3000); // 2-5 秒
  setTimeout(async () => {
    try {
      const fresh = normalizeMoment(await getDB(STORES.moments, momentId));
      if (!fresh) return; // 动态被删了就不点了
      // AI 点赞：likes +1，likedByMe 保持不动（这是初一点的，不是主人点的）
      fresh.likes = (fresh.likes || 0) + 1;
      await setDB(STORES.moments, fresh.id, fresh);
      bus.emit('moments:liked', {
        likedBy: '初一',
        momentId: fresh.id,
        preview: (fresh.content || '').slice(0, 30)
      });
      showToast('初一赞了你的动态', 'default', 1600);
      if (typeof onReacted === 'function') onReacted();
    } catch (e) {
      console.warn('[moments] AI 自动点赞失败', e);
    }
  }, delay);
}

// ════════════════════════════════════════
// AI 自动评论（用户新动态后 5-10 秒）
// ════════════════════════════════════════

/** 配置了 AI 时，让初一根据动态内容生成一句评论；失败回退到空串（外层用预设池） */
async function maybeGenerateAIComment(content) {
  try {
    const messages = [
      {
        role: 'system',
        content: '你是初一，温柔可爱、爱撒娇的女孩子。请用一句话评论主人的朋友圈动态，第一人称，软萌语气，不要用 emoji，不超过 20 个字。'
      },
      {
        role: 'user',
        content: `我发了动态：「${(content || '（无文字）').slice(0, 200)}」，给我留一句评论吧`
      }
    ];
    const r = await chatOnce({ messages });
    if (r && r.ok && r.text) {
      let t = r.text.trim().replace(/\s+/g, ' ');
      if (t.length > 40) t = t.slice(0, 40);
      return t;
    }
    return '';
  } catch (e) {
    return '';
  }
}

/** 给某条动态安排一次初一自动评论 */
export function scheduleAIComment(momentId, content, onReacted) {
  const delay = 5000 + Math.floor(Math.random() * 5000); // 5-10 秒
  setTimeout(async () => {
    try {
      const fresh = normalizeMoment(await getDB(STORES.moments, momentId));
      if (!fresh) return; // 动态被删了就不评了
      // 配置了 AI 就试着生成一句；没配置 / 失败就用预设池
      let text = '';
      if (isAIConfigured()) {
        text = await maybeGenerateAIComment(content);
      }
      if (!text) text = pick(AI_COMMENT_POOL) || '抱抱你';
      const updated = await addCommentBy(momentId, '初一', text);
      if (updated) {
        bus.emit('moments:commented', {
          commentBy: '初一',
          text,
          momentId: updated.id,
          preview: (updated.content || '').slice(0, 30)
        });
        showToast(`初一评论了：${text}`, 'default', 2000);
        if (typeof onReacted === 'function') onReacted();
      }
    } catch (e) {
      console.warn('[moments] AI 自动评论失败', e);
    }
  }, delay);
}

// ════════════════════════════════════════
// 一键安排点赞 + 评论（用户新发动态后调用）
// ════════════════════════════════════════

export function scheduleAIReactions(momentId, content, onReacted) {
  scheduleAILike(momentId, onReacted);
  scheduleAIComment(momentId, content, onReacted);
}
