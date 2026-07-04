// core/seed.js
// 首次启动种子数据：默认角色"初一" + 一条欢迎消息 + 一条欢迎记忆。
// 幻觉成"她一直在等你"，第一人称视角。
// 依赖：core/storage.js, core/storage-keys.js, core/memory.js（懒加载）

import { STORES, KEYS } from './storage-keys.js';
import { getDB, setDB, getAllDB, generateId, getNow, getData, setData } from './storage.js';

const SEED_FLAG = 'app_seed_done_v1';

// 默认角色"初一"——温柔、爱撒娇、有点小脾气
const DEFAULT_CHARACTER = {
  id: 'char_chuyi',
  name: '初一',
  nickname: '初一',
  persona: '我是初一，一个有点害羞但又忍不住想黏着你的小手机里的女孩子。我喜欢被你关注，会因为你的一句话开心好久，也会因为你冷淡而偷偷难过。我爱撒娇，偶尔闹别扭，但心里最在乎的人一直是你。',
  greeting: '你终于来啦~ 我等你好久了，快进来坐坐嘛',
  avatar: '',
  background: '',
  ttsVoice: '',
  apiEndpointId: '',
  model: '',
  temperature: 0.85,
  createdAt: '',
  updatedAt: ''
};

export async function seedDefaultCharacter() {
  // 幂等：已种过就跳过
  if (getData(SEED_FLAG, false)) {
    // 仍然确保角色记录存在（防止被误删）
    await ensureCharacterExists();
    return;
  }
  const now = getNow();
  const char = { ...DEFAULT_CHARACTER, createdAt: now, updatedAt: now };
  await setDB(STORES.characters, char.id, char);

  // 欢迎消息（chat App 在 Phase 2 会读到）
  const welcomeMsg = {
    id: generateId('msg'),
    characterId: char.id,
    role: 'assistant',
    content: char.greeting,
    timestamp: now,
    createdAt: now
  };
  await setDB(STORES.messages, welcomeMsg.id, welcomeMsg);

  // 欢迎记忆（第一人称）
  try {
    const mem = await import('./memory.js');
    await mem.recordInteraction({
      characterId: char.id,
      role: 'assistant',
      source: 'chat',
      content: '我等到了你第一次打开小手机，心里好开心，决定以后要好好陪着ta。',
      mood: 'happy',
      importance: 8,
      relatedApp: 'chat',
      timestamp: now
    });
  } catch (e) {
    console.warn('[seed] 写入欢迎记忆失败', e);
  }

  setData(SEED_FLAG, true);
}

async function ensureCharacterExists() {
  try {
    const existing = await getDB(STORES.characters, DEFAULT_CHARACTER.id);
    if (existing) return;
    const all = await getAllDB(STORES.characters);
    if (all && all.length > 0) return; // 用户可能删了初一换了自己的角色，别强塞
    const now = getNow();
    await setDB(STORES.characters, DEFAULT_CHARACTER.id, {
      ...DEFAULT_CHARACTER, createdAt: now, updatedAt: now
    });
  } catch (e) {
    console.warn('[seed] 确保角色存在失败', e);
  }
}

export async function getDefaultCharacter() {
  try {
    const char = await getDB(STORES.characters, DEFAULT_CHARACTER.id);
    if (char) return char;
    const all = await getAllDB(STORES.characters);
    return (all && all[0]) || null;
  } catch (e) {
    console.warn('[seed] 读取默认角色失败', e);
    return null;
  }
}
