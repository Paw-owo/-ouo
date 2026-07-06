// ============================================
// ai-context.js — AI请求上下文组装
// 把角色信息、记忆、近期事件、各APP能力说明
// 组装成一次AI请求需要的完整上下文
// 输出 { system, messages, temperature, stream, timeout }
// ============================================

import { get } from '../../core/config.js';
import { getCurrentCharacter, getCharacter } from '../../core/storage.js';
import { getAIReadableEvents } from '../../core/inbox.js';
import { getRelevantMemories } from './ai-memory.js';
import { buildSpecSummary, getSpec, loadAppSpec } from './ai-spec.js';
import { emitContextAssembled } from './ai-events.js';

// creativity 设置 → temperature 映射
const CREATIVITY_MAP = Object.freeze({
  stable:   0.4,
  balanced: 0.7,
  creative: 0.95
});

// 默认记忆检索数量
const DEFAULT_MEMORY_LIMIT = 8;
const DEFAULT_EVENT_LIMIT = 12;

// 组装完整请求上下文
// options:
//   characterId: 指定角色（不传则用当前活跃角色）
//   conversationId: 会话ID
//   appId: 当前打开的APP（注入该APP的spec）
//   userMessage: 用户输入（用于记忆检索关键词）
//   history: 已有对话历史 [{role, content}]
//   memoryLimit: 记忆检索数量
//   eventLimit: 事件注入数量
async function assembleContext(options = {}) {
  const {
    characterId,
    conversationId = null,
    appId = null,
    userMessage = '',
    history = [],
    memoryLimit = DEFAULT_MEMORY_LIMIT,
    eventLimit = DEFAULT_EVENT_LIMIT
  } = options;

  const charId = characterId || getCurrentCharacter();
  const stream = get('streamEnabled');
  const timeout = get('timeout') || 30000;
  const creativity = get('creativity') || 'balanced';
  const temperature = CREATIVITY_MAP[creativity] ?? CREATIVITY_MAP.balanced;

  // 1. 角色信息
  const characterBlock = await _buildCharacterBlock(charId);

  // 2. 记忆
  const memoryBlock = await _buildMemoryBlock(charId, userMessage, memoryLimit);

  // 3. 近期事件
  const eventBlock = _buildEventBlock(eventLimit);

  // 4. APP能力说明
  const specBlock = await _buildSpecBlock(appId);

  // 5. 拼装system prompt（第一人称）
  const system = _buildSystemPrompt({
    character: characterBlock,
    memories: memoryBlock,
    events: eventBlock,
    specs: specBlock,
    appId
  });

  // 6. 组装消息列表
  const messages = _buildMessages(system, history, userMessage);

  const context = {
    system,
    messages,
    temperature,
    stream,
    timeout,
    characterId: charId,
    conversationId,
    appId,
    meta: {
      memoryCount: memoryBlock.count,
      eventCount: eventBlock.count,
      specCount: specBlock.count
    }
  };

  emitContextAssembled(context);
  return context;
}

// ========== 内部组装 ==========

async function _buildCharacterBlock(characterId) {
  if (!characterId) {
    return { text: '', info: null };
  }

  // 从存储层获取角色信息
  try {
    const character = await getCharacter(characterId);
    if (!character) {
      return { text: '', info: null };
    }

    // 第一人称组装角色描述
    const parts = [];
    if (character.name) parts.push(`我叫${character.name}。`);
    if (character.persona) parts.push(character.persona);
    if (character.greeting) parts.push(`我习惯这样打招呼：${character.greeting}`);
    if (character.tone) parts.push(`我的说话风格：${character.tone}`);

    return {
      text: parts.join(''),
      info: character
    };
  } catch {
    return { text: '', info: null };
  }
}

async function _buildMemoryBlock(characterId, query, limit) {
  if (!characterId || !query) {
    return { text: '', count: 0 };
  }

  try {
    const memories = await getRelevantMemories(characterId, query, limit);
    if (!memories || memories.length === 0) {
      return { text: '', count: 0 };
    }

    const lines = memories.map(m => {
      const tag = m.type ? `[${m.type}]` : '';
      return `${tag} ${m.summary || m.content}`;
    });

    return {
      text: `我记得这些：\n${lines.join('\n')}`,
      count: memories.length
    };
  } catch (err) {
    console.warn('[AI-Context] 记忆检索失败:', err?.message || err);
    return { text: '', count: 0 };
  }
}

function _buildEventBlock(limit) {
  try {
    const events = getAIReadableEvents({ limit });
    if (!events || events.length === 0) {
      return { text: '', count: 0 };
    }

    const lines = events.map(e => {
      const time = _formatTime(e.timestamp);
      const app = e.appId || '系统';
      return `${time} ${app}：${e.summary || e.title || e.content || ''}`;
    });

    return {
      text: `最近发生的事：\n${lines.join('\n')}`,
      count: events.length
    };
  } catch {
    return { text: '', count: 0 };
  }
}

async function _buildSpecBlock(activeAppId) {
  // 如果指定了当前APP，确保它的spec已加载
  if (activeAppId) {
    await loadAppSpec(activeAppId);
  }

  const summary = buildSpecSummary();
  if (!summary) {
    return { text: '', count: 0 };
  }

  let text = `我了解这些能力：\n${summary}`;

  // 如果有当前APP，额外强调它的spec
  if (activeAppId) {
    const spec = getSpec(activeAppId);
    if (spec && spec.persona) {
      text += `\n现在用户正在用【${activeAppId}】，${spec.persona}`;
    }
  }

  return {
    text,
    count: 1
  };
}

function _buildSystemPrompt({ character, memories, events, specs, appId }) {
  const sections = [];

  // 角色身份（第一人称）
  if (character.text) {
    sections.push(character.text);
  } else {
    sections.push('我是用户的手机助手。');
  }

  // APP能力
  if (specs.text) {
    sections.push(specs.text);
  }

  // 记忆
  if (memories.text) {
    sections.push(memories.text);
  }

  // 近期事件
  if (events.text) {
    sections.push(events.text);
  }

  return sections.join('\n\n');
}

function _buildMessages(system, history, userMessage) {
  const messages = [];

  // system 消息
  if (system) {
    messages.push({ role: 'system', content: system });
  }

  // 历史对话
  if (Array.isArray(history)) {
    for (const msg of history) {
      if (msg && msg.role && msg.content) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
  }

  // 当前用户输入
  if (userMessage) {
    messages.push({ role: 'user', content: userMessage });
  }

  return messages;
}

function _formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export {
  assembleContext,
  CREATIVITY_MAP
};
