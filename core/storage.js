/* core/storage.js - 数据存储层
   图片存 IndexedDB（容量大），其余配置/文本存 localStorage
   所有应用共用这一套数据结构和读写接口，字段名全程统一 */

/* ============ IndexedDB 图片存储 ============ */

const DB_NAME = 'AiPhoneDB';
const DB_VERSION = 1;
const IMG_STORE = 'images';

let _db = null;

// 初始化数据库
export function initDB() {
  return new Promise((resolve, reject) => {
    if (_db) return resolve(_db);
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IMG_STORE)) {
        db.createObjectStore(IMG_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = (e) => {
      _db = e.target.result;
      resolve(_db);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

// 保存图片（base64），返回 imageId
export async function saveImage(base64) {
  const db = await initDB();
  const id = 'img_' + uuid();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMG_STORE, 'readwrite');
    tx.objectStore(IMG_STORE).put({ id, data: base64 });
    tx.oncomplete = () => resolve(id);
    tx.onerror = (e) => reject(e.target.error);
  });
}

// 读取图片，返回 base64（找不到返回 null）
export async function getImage(imageId) {
  if (!imageId) return null;
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMG_STORE, 'readonly');
    const req = tx.objectStore(IMG_STORE).get(imageId);
    req.onsuccess = () => resolve(req.result ? req.result.data : null);
    req.onerror = (e) => reject(e.target.error);
  });
}

// 删除图片
export async function deleteImage(imageId) {
  if (!imageId) return;
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IMG_STORE, 'readwrite');
    tx.objectStore(IMG_STORE).delete(imageId);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

// 文件转 base64（供上传用）
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// 上传文件直接存入 IndexedDB，返回 imageId
export async function uploadImage(file) {
  const base64 = await fileToBase64(file);
  return await saveImage(base64);
}

/* ============ localStorage 封装 ============ */

const PREFIX = 'aiphone_';

export function getData(key, fallback = null) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function setData(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch (e) {
    // 容量满
    console.warn('存储失败，可能容量已满', e);
    return false;
  }
}

export function removeData(key) {
  localStorage.removeItem(PREFIX + key);
}

/* ============ 工具函数 ============ */

export function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function now() {
  return Date.now();
}

/* ============ 存储键名常量 ============ */

export const KEYS = {
  CHARACTERS: 'characters',     // 角色列表
  PERSONAS: 'personas',         // 用户人设列表
  SETTINGS: 'settings',         // 全局设置
  WORLDBOOK: 'worldbook',       // 世界书条目
  MOMENTS: 'moments',           // 朋友圈
  MEMOS: 'memos',               // 备忘录
  ANNIVERSARIES: 'anniversaries', // 纪念日
  WALLET: 'wallet',             // 钱包
  SHOP: 'shop',                 // 商店商品
  INVENTORY: 'inventory',       // 背包
  STICKERS: 'stickers',         // 表情包库
  DESKTOP: 'desktop',           // 桌面布局
  THEME: 'theme',               // 当前主题变量
  GAMES: 'games',               // 游戏数据/主题
};

/* ============ 角色卡 CRUD ============ */
/* 角色数据结构（全程统一）：
{
  id, name,
  avatar,              // imageId
  chatBackground,      // imageId
  chatBackgroundType,  // 'none' | 'color' | 'image'
  chatBackgroundColor, // '#xxxxxx'
  systemPrompt,
  ttsConfig: { provider, voice, apiKey, endpoint, enabled },
  apiConfigId,         // 绑定的API配置ID（空=用默认）
  model,               // 绑定的模型（空=用配置默认）
  memoryTriggerCount,  // 默认100
  memories: [],        // 记忆条目 [{id, content, createdAt}]
  chatHistory: [],     // 消息 [见下方消息结构]
  mood,                // 'neutral' 等，受商店道具影响
  worldbookIds: [],    // 绑定的世界书条目ID
  quickReplies: [],    // 快捷回复，最多8条字符串
  isUser,              // 是否用户自己创建的角色
  boundPersonaId,      // 绑定的人设ID（仅用户角色）
  lastActiveTime,      // 最后活跃时间戳
  unreadCount,         // 未读数
  createdAt
}
消息结构：
{
  id, role: 'user'|'assistant'|'system',
  content,
  images: [],          // imageId数组
  sticker,             // imageId（表情包）
  type,                // 'text'|'voice'|'transfer'|'sticker'
  transferAmount,      // 转账金额（type=transfer时）
  thinking,            // 思维链内容
  senderId,            // 群聊中发送者角色ID
  senderName,          // 群聊中发送者名字
  timestamp
}
*/

export function getCharacters() {
  return getData(KEYS.CHARACTERS, []);
}

export function getCharacter(id) {
  return getCharacters().find((c) => c.id === id) || null;
}

export function saveCharacter(char) {
  const list = getCharacters();
  const idx = list.findIndex((c) => c.id === char.id);
  if (idx >= 0) list[idx] = char;
  else list.push(char);
  setData(KEYS.CHARACTERS, list);
  return char;
}

export function deleteCharacter(id) {
  setData(KEYS.CHARACTERS, getCharacters().filter((c) => c.id !== id));
}

// 创建一个空角色（带默认字段）
export function createCharacter(partial = {}) {
  return {
    id: uuid(),
    name: '新角色',
    avatar: '',
    chatBackground: '',
    chatBackgroundType: 'none',
    chatBackgroundColor: '',
    systemPrompt: '',
    ttsConfig: { provider: 'openai', voice: 'nova', apiKey: '', endpoint: '', enabled: false },
    apiConfigId: '',
    model: '',
    memoryTriggerCount: 100,
    memories: [],
    chatHistory: [],
    mood: 'neutral',
    worldbookIds: [],
    quickReplies: [],
    isUser: false,
    boundPersonaId: '',
    lastActiveTime: now(),
    unreadCount: 0,
    createdAt: now(),
    ...partial,
  };
}

/* ============ 用户人设 CRUD ============ */
/* 人设结构：{ id, name, avatar, description, createdAt } */

export function getPersonas() {
  return getData(KEYS.PERSONAS, []);
}

export function getPersona(id) {
  return getPersonas().find((p) => p.id === id) || null;
}

export function savePersona(persona) {
  const list = getPersonas();
  const idx = list.findIndex((p) => p.id === persona.id);
  if (idx >= 0) list[idx] = persona;
  else list.push(persona);
  setData(KEYS.PERSONAS, list);
  return persona;
}

export function deletePersona(id) {
  setData(KEYS.PERSONAS, getPersonas().filter((p) => p.id !== id));
}

export function createPersona(partial = {}) {
  return { id: uuid(), name: '新人设', avatar: '', description: '', createdAt: now(), ...partial };
}

/* ============ 全局设置 ============ */
/* settings结构：
{
  apiConfigs: [{ id, name, endpoint, apiKey, models:[], selectedModel }],
  defaultApiConfigId,
  ttsConfigs: [{ id, name, provider, endpoint, apiKey, voice, enabled }],
  mcpServers: [{ id, name, url, group, enabled }],
  bubbleMode: 'bubble' | 'chat',
  streamOutput: true,
  memoryInject: true,
  autoMoments: false,
  weather: { city: '温州', cityCode: '', adcode: '' },
  widgets: { time: true, weather: true, anniversary: true },
  userProfile: { name: '我', avatar: '' },
  wallpaper: '',          // imageId，第一页壁纸
  wallpaper2: '',         // 第二页壁纸（空=同第一页）
  fontSize: 15,
  appThemes: {},          // 各应用独立主题 { appId: { vars, bg, ... } }
  visionModel: ''         // 用于表情包识别的视觉模型
}
*/

export function getSettings() {
  return getData(KEYS.SETTINGS, defaultSettings());
}

export function saveSettings(settings) {
  setData(KEYS.SETTINGS, settings);
  return settings;
}

export function updateSettings(partial) {
  const s = { ...getSettings(), ...partial };
  saveSettings(s);
  return s;
}

export function defaultSettings() {
  return {
    apiConfigs: [],
    defaultApiConfigId: '',
    ttsConfigs: [],
    mcpServers: [],
    bubbleMode: 'bubble',
    streamOutput: true,
    memoryInject: true,
    autoMoments: false,
    weather: { city: '温州', cityCode: '', adcode: '' },
    widgets: { time: true, weather: true, anniversary: true },
    userProfile: { name: '我', avatar: '' },
    wallpaper: '',
    wallpaper2: '',
    fontSize: 15,
    appThemes: {},
    visionModel: '',
  };
}

/* ============ API配置 快捷读取 ============ */

export function getApiConfigs() {
  return getSettings().apiConfigs || [];
}

export function getApiConfig(id) {
  return getApiConfigs().find((c) => c.id === id) || null;
}

// 获取角色实际使用的API配置（角色绑定优先，否则用默认）
export function resolveApiConfig(character) {
  const settings = getSettings();
  if (character && character.apiConfigId) {
    const c = settings.apiConfigs.find((x) => x.id === character.apiConfigId);
    if (c) return c;
  }
  return settings.apiConfigs.find((x) => x.id === settings.defaultApiConfigId)
    || settings.apiConfigs[0]
    || null;
}

/* ============ 世界书 CRUD ============ */
/* 条目结构：
{ id, type:'A'|'B', name, content,
  bindType:'all'|'specific',  // 仅A类型用
  characterIds: [] }          // 绑定的角色（A类型specific时）
*/

export function getWorldbook() {
  return getData(KEYS.WORLDBOOK, []);
}

export function saveWorldbookEntry(entry) {
  const list = getWorldbook();
  const idx = list.findIndex((e) => e.id === entry.id);
  if (idx >= 0) list[idx] = entry;
  else list.push(entry);
  setData(KEYS.WORLDBOOK, list);
  return entry;
}

export function deleteWorldbookEntry(id) {
  setData(KEYS.WORLDBOOK, getWorldbook().filter((e) => e.id !== id));
}

export function createWorldbookEntry(partial = {}) {
  return { id: uuid(), type: 'A', name: '新条目', content: '', bindType: 'all', characterIds: [], ...partial };
}

/* ============ 朋友圈 CRUD ============ */
/* 结构：
{ id, authorId, authorName, content, images:[imageId],
  timestamp, likes:[authorId], comments:[{authorId, authorName, content, timestamp}],
  read }   // 用户是否已读（用于红点）
*/

export function getMoments() {
  return getData(KEYS.MOMENTS, []);
}

export function saveMoment(moment) {
  const list = getMoments();
  const idx = list.findIndex((m) => m.id === moment.id);
  if (idx >= 0) list[idx] = moment;
  else list.unshift(moment);
  setData(KEYS.MOMENTS, list);
  return moment;
}

export function deleteMoment(id) {
  setData(KEYS.MOMENTS, getMoments().filter((m) => m.id !== id));
}

export function createMoment(partial = {}) {
  return { id: uuid(), authorId: '', authorName: '', content: '', images: [], timestamp: now(), likes: [], comments: [], read: true, ...partial };
}

/* ============ 备忘录 CRUD ============ */
/* 结构：{ id, content, createdAt, updatedAt } */

export function getMemos() {
  return getData(KEYS.MEMOS, []);
}

export function saveMemo(memo) {
  const list = getMemos();
  const idx = list.findIndex((m) => m.id === memo.id);
  if (idx >= 0) list[idx] = memo;
  else list.unshift(memo);
  setData(KEYS.MEMOS, list);
  return memo;
}

export function deleteMemo(id) {
  setData(KEYS.MEMOS, getMemos().filter((m) => m.id !== id));
}

export function createMemo(partial = {}) {
  return { id: uuid(), content: '', createdAt: now(), updatedAt: now(), ...partial };
}

/* ============ 纪念日 CRUD ============ */
/* 结构：{ id, name, date:'YYYY-MM-DD', remind:bool, createdAt } */

export function getAnniversaries() {
  return getData(KEYS.ANNIVERSARIES, []);
}

export function saveAnniversary(item) {
  const list = getAnniversaries();
  const idx = list.findIndex((a) => a.id === item.id);
  if (idx >= 0) list[idx] = item;
  else list.push(item);
  setData(KEYS.ANNIVERSARIES, list);
  return item;
}

export function deleteAnniversary(id) {
  setData(KEYS.ANNIVERSARIES, getAnniversaries().filter((a) => a.id !== id));
}

export function createAnniversary(partial = {}) {
  return { id: uuid(), name: '新纪念日', date: '', remind: false, createdAt: now(), ...partial };
}

/* ============ 钱包 ============ */
/* 结构：{ balance, records:[{ id, type:'income'|'expense', amount, desc, timestamp }] } */

export function getWallet() {
  return getData(KEYS.WALLET, { balance: 0, records: [] });
}

export function saveWallet(wallet) {
  setData(KEYS.WALLET, wallet);
  return wallet;
}

// 充值/扣款，返回新余额（余额不足返回 false）
export function walletChange(amount, type, desc) {
  const wallet = getWallet();
  if (type === 'expense' && wallet.balance < amount) return false;
  wallet.balance += type === 'income' ? amount : -amount;
  wallet.records.unshift({ id: uuid(), type, amount, desc, timestamp: now() });
  saveWallet(wallet);
  return wallet.balance;
}

/* ============ 商店 / 背包 ============ */
/* 商品结构：{ id, name, desc, price, effect, image }  // effect注入system prompt
   背包结构：[{ itemId, count }] */

export function getShopItems() {
  return getData(KEYS.SHOP, defaultShopItems());
}

export function saveShopItems(items) {
  setData(KEYS.SHOP, items);
}

export function getInventory() {
  return getData(KEYS.INVENTORY, []);
}

export function saveInventory(inv) {
  setData(KEYS.INVENTORY, inv);
}

// 购买商品（扣钱 + 入背包）
export function buyItem(item) {
  const ok = walletChange(item.price, 'expense', `购买 ${item.name}`);
  if (ok === false) return false;
  const inv = getInventory();
  const existing = inv.find((i) => i.itemId === item.id);
  if (existing) existing.count += 1;
  else inv.push({ itemId: item.id, count: 1 });
  saveInventory(inv);
  return true;
}

function defaultShopItems() {
  return [
    { id: 'rose', name: '玫瑰花束', desc: '送上一束玫瑰，对方心情会变好', price: 50, effect: '用户送了你一束玫瑰花，你心情很好，回复更温柔体贴。', image: '' },
    { id: 'cake', name: '生日蛋糕', desc: '甜甜的蛋糕，分享快乐', price: 30, effect: '用户送了你一个蛋糕，你感到很开心。', image: '' },
    { id: 'coffee', name: '热咖啡', desc: '暖暖的一杯，提神醒脑', price: 20, effect: '用户请你喝了杯热咖啡，你感到温暖。', image: '' },
  ];
}

/* ============ 表情包库 ============ */
/* 结构：[{ id, imageId, description }] */

export function getStickers() {
  return getData(KEYS.STICKERS, []);
}

export function saveSticker(sticker) {
  const list = getStickers();
  const idx = list.findIndex((s) => s.id === sticker.id);
  if (idx >= 0) list[idx] = sticker;
  else list.push(sticker);
  setData(KEYS.STICKERS, list);
  return sticker;
}

export function deleteSticker(id) {
  setData(KEYS.STICKERS, getStickers().filter((s) => s.id !== id));
}

export function createSticker(partial = {}) {
  return { id: uuid(), imageId: '', description: '', ...partial };
}

/* ============ 桌面布局 ============ */
/* 结构：
{
  pages: [
    {
      icons:   [{ appId, x, y }],   // 自由定位坐标
      widgets: [{ id, type, size, x, y, ... }]  // 见小组件结构
    },
    { icons:[], widgets:[] }   // 第二页
  ],
  dock: [appId, appId, appId, appId]
}
小组件结构：
{
  id, type:'time'|'weather'|'anniversary'|'custom',
  size:'1x1'|'2x1'|'1x2'|'2x2',
  x, y,
  customImage,   // imageId（custom用）
  customText,    // 文字（custom用）
  customBg,      // 背景色（custom用）
  customTextColor
}
*/

export function getDesktop() {
  return getData(KEYS.DESKTOP, defaultDesktop());
}

export function saveDesktop(desktop) {
  setData(KEYS.DESKTOP, desktop);
  return desktop;
}

export function defaultDesktop() {
  // 第一页图标按顺序排，坐标在 index.html 初始化时按网格自动计算并写回
  return {
    pages: [
      {
        icons: [
          { appId: 'chat', x: null, y: null },
          { appId: 'moments', x: null, y: null },
          { appId: 'characters', x: null, y: null },
          { appId: 'worldbook', x: null, y: null },
          { appId: 'games', x: null, y: null },
          { appId: 'shop', x: null, y: null },
          { appId: 'wallet', x: null, y: null },
          { appId: 'memo', x: null, y: null },
          { appId: 'anniversary', x: null, y: null },
          { appId: 'settings', x: null, y: null },
        ],
        widgets: [
          { id: 'w_time', type: 'time', size: '2x1', x: null, y: null },
        ],
      },
      { icons: [], widgets: [] },
    ],
    dock: ['chat', 'characters', 'settings'],
  };
}

/* ============ 全量数据 导入/导出 ============ */

export function exportAllData() {
  const data = {};
  Object.values(KEYS).forEach((k) => {
    data[k] = getData(k, null);
  });
  return JSON.stringify({ version: '2.0', exportedAt: now(), data }, null, 2);
}

export function importAllData(jsonStr) {
  try {
    const parsed = JSON.parse(jsonStr);
    const data = parsed.data || parsed;
    Object.keys(data).forEach((k) => {
      if (data[k] !== null) setData(k, data[k]);
    });
    return true;
  } catch (e) {
    console.warn('导入失败', e);
    return false;
  }
}

export function clearAllData() {
  Object.values(KEYS).forEach((k) => removeData(k));
  // 清空图片库
  return initDB().then((db) => {
    const tx = db.transaction(IMG_STORE, 'readwrite');
    tx.objectStore(IMG_STORE).clear();
  });
}

/* ============ 红点/未读 辅助 ============ */

// 所有角色未读总数
export function getTotalUnread() {
  return getCharacters().reduce((sum, c) => sum + (c.unreadCount || 0), 0);
}

// 朋友圈未读数（被点赞/评论且未读）
export function getMomentsUnread() {
  return getMoments().filter((m) => m.read === false).length;
}
