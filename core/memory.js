// core/memory.js
// imports:
//   from './storage.js': getConfig, setConfig, getDB, setDB, deleteDB, getByIndexDB, generateId, getNow
//   from './api.js': silentRequest

import {
  getConfig, setConfig,
  getDB, setDB, deleteDB, getByIndexDB,
  generateId, getNow
} from './storage.js';

import { silentRequest } from './api.js';

/* ============================================================
   常量
   ============================================================ */

const MAX_INJECT = 25;            // buildMemoryPrompt 最多注入条数
const SUMMARY_BATCH = 60;         // 每次总结取多少条消息
const SUMMARY_TIMEOUT = 30000;
const IMPORTANT_TIMEOUT = 15000;
const RECENT_TURNS = 8;           // checkImportantInfo 看最近几轮

/* ============================================================
   公开 API
   ============================================================ */

/**
 * 获取角色的所有记忆（按时间降序）
 */
export async function getMemories(characterId) {
  try {
    const list = await getByIndexDB('memories', 'characterId', characterId);
    if (!list || list.length === 0) return [];
    list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return list;
  } catch {
    return [];
  }
}

/**
 * 添加一条记忆（skipDedup=true 跳过去重，手动添加时使用）
 */
export async function addMemory(characterId, content, source = 'manual', skipDedup = false) {
  if (!characterId || !content || !content.trim()) return null;

  const trimmed = content.trim();

  // 自动/总结来源需要去重
  if (!skipDedup && (source === 'auto' || source === 'summary')) {
    const existing = await getMemories(characterId);
    const isDuplicate = existing.some(m => similarity(m.content, trimmed) > 0.7);
    if (isDuplicate) return null;
  }

  const memory = {
    id: generateId(),
    characterId,
    content: trimmed,
    source,
    createdAt: getNow()
  };
  await setDB('memories', memory.id, memory);
  return memory;
}

/**
 * 删除一条记忆
 */
export async function deleteMemory(characterId, memoryId) {
  if (!memoryId) return;
  await deleteDB('memories', memoryId);
}

/**
 * 检查是否达到总结阈值，达到则自动总结并存为 summary 记忆
 * 用时间戳做标记，不受消息删除影响
 */
export async function checkAndSummarize(characterId) {
  try {
    const character = await getDB('characters', characterId);
    if (!character) return;

    const triggerCount = character.memoryTriggerCount || 100;
    const configKey = `mem_sum_${characterId}`;

    // 上次总结标记的时间戳（之后的消息算"新消息"）
    const lastTimestamp = getConfig(configKey, '');

    // 取该角色全部消息
    const allMessages = await getByIndexDB('messages', 'characterId', characterId);
    if (!allMessages || allMessages.length === 0) return;

    // 按时间正序
    allMessages.sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));

    // 筛出上次总结之后的新消息
    const newMessages = lastTimestamp
      ? allMessages.filter(m => m.timestamp > lastTimestamp)
      : allMessages;

    if (newMessages.length < triggerCount) return;

    // 取前 SUMMARY_BATCH 条做总结
    const batch = newMessages.slice(0, SUMMARY_BATCH);
    if (batch.length === 0) return;

    const charName = character.name || 'AI';
    const chatLog = batch
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => `${m.role === 'user' ? '用户' : charName}: ${truncate(m.content, 200)}`)
      .join('\n');

    if (!chatLog) return;

    // 注入已有记忆做去重参考
    const existingMemories = await getMemories(characterId);
    let existingStr = '';
    if (existingMemories.length > 0) {
      existingStr = '\n\n【已记录的信息，不要重复】\n' +
        existingMemories.slice(0, 20).map(m => `- ${m.content}`).join('\n');
    }

    const { endpointId, model } = resolveApiConfig(character);

    const result = await silentRequest({
      prompt: SUMMARY_PROMPT + existingStr + '\n\n【对话记录】\n' + chatLog,
      endpointId,
      model,
      timeout: SUMMARY_TIMEOUT,
      temperature: 0.3
    });

    if (result && result.trim() && result.trim() !== '无') {
      // 按行拆分，每行存一条独立记忆（方便后续单条删除）
      const lines = result.trim().split('\n')
        .map(l => l.replace(/^[-•]\s*/, '').trim())
        .filter(l => l.length > 0 && l !== '无');

      for (const line of lines) {
        await addMemory(characterId, line, 'summary');
      }

      // 更新标记为这批最后一条消息的时间戳
      const lastMsg = batch[batch.length - 1];
      setConfig(configKey, lastMsg.timestamp || getNow());
    }
  } catch (e) {
    console.warn('[memory] checkAndSummarize:', e);
  }
}

/**
 * 每轮回复后调用，判断最近对话是否包含值得长期记忆的重要信息
 */
export async function checkImportantInfo(characterId, messages) {
  try {
    if (!messages || messages.length < 2) return;

    const character = await getDB('characters', characterId);
    if (!character) return;

    const charName = character.name || 'AI';

    // 取最近几轮
    const recent = messages
      .slice(-RECENT_TURNS)
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => `${m.role === 'user' ? '用户' : charName}: ${truncate(m.content, 300)}`)
      .join('\n');

    if (!recent) return;

    const { endpointId, model } = resolveApiConfig(character);

    const result = await silentRequest({
      prompt: IMPORTANT_PROMPT + '\n\n' + recent,
      endpointId,
      model,
      timeout: IMPORTANT_TIMEOUT,
      temperature: 0.2,
      json: true
    });

    // silentRequest json:true 返回对象
    if (result && typeof result === 'object' && result.remember) {
      // addMemory 内部会做 similarity 去重
      await addMemory(characterId, result.remember, 'auto');
    }
  } catch (e) {
    console.warn('[memory] checkImportantInfo:', e);
  }
}

/**
 * 将角色记忆拼接为可注入 system prompt 的字符串
 */
export async function buildMemoryPrompt(characterId) {
  const memories = await getMemories(characterId);
  if (!memories || memories.length === 0) return '';

  const items = memories
    .slice(0, MAX_INJECT)
    .map(m => `- ${m.content}`)
    .join('\n');

  return `\n\n[长期记忆]\n${items}`;
}

/* ============================================================
   内部工具
   ============================================================ */

/**
 * 根据角色配置解析应使用的 API 端点和模型
 * 返回 undefined 时 silentRequest 会回退到全局默认
 */
function resolveApiConfig(character) {
  if (character.apiConfig && !character.apiConfig.useGlobal) {
    return {
      endpointId: character.apiConfig.endpointId || undefined,
      model: character.apiConfig.model || undefined
    };
  }
  return { endpointId: undefined, model: undefined };
}

/** 截断文本 */
function truncate(text, maxLen) {
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '…';
}

/**
 * 文本相似度（Jaccard bigram）
 * 用于记忆去重，> 0.7 判定重复
 */
function similarity(a, b) {
  if (!a || !b) return 0;
  const bigramsA = toBigrams(a);
  const bigramsB = toBigrams(b);
  if (bigramsA.size === 0 && bigramsB.size === 0) return 1;
  let intersection = 0;
  for (const g of bigramsA) {
    if (bigramsB.has(g)) intersection++;
  }
  const union = bigramsA.size + bigramsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function toBigrams(str) {
  const s = new Set();
  const t = str.replace(/\s+/g, '');
  for (let i = 0; i < t.length - 1; i++) {
    s.add(t.slice(i, i + 2));
  }
  return s;
}

/* ============================================================
   Prompt 模板
   ============================================================ */

const SUMMARY_PROMPT = `你是一个记忆助手。请阅读以下对话记录，提取其中值得长期记住的关键信息。

提取规则：
1. 用户提到的个人信息（姓名、生日、喜好、习惯、家人朋友等）
2. 重要事件和经历
3. 双方做出的约定或承诺
4. 情感变化和关系发展
5. 用户明确表达的偏好或厌恶

输出格式：
- 每条信息一行，以"- "开头
- 每条不超过30字，简洁准确
- 只输出提取的信息，不要开头语和总结语
- 如果没有值得记住的信息，只输出"无"`;

const IMPORTANT_PROMPT = `分析以下最近的对话，判断是否包含需要长期记住的重要信息。

重要信息包括：
- 用户的个人信息（生日、姓名、职业、喜好等）
- 重要事件或计划
- 情感表达和关系里程碑
- 用户明确要求记住的事情
- 约定和承诺

仅返回JSON格式，不要其他内容：
- 如果有重要信息：{"remember":"一句话概括要记住的内容"}
- 如果没有：{"remember":null}`;

// 依赖：./storage.js 的 getConfig/setConfig/getDB/setDB/deleteDB/getByIndexDB/generateId/getNow, ./api.js 的 silentRequest
