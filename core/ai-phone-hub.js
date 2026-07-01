// core/ai-phone-hub.js
// imports:
//   from './storage.js': getData, setData, removeData, getDB, setDB, deleteDB, getAllDB, getByIndexDB, generateId, getNow

import {
  getData,
  setData,
  removeData,
  getDB,
  setDB,
  deleteDB,
  getAllDB,
  getByIndexDB,
  generateId,
  getNow
} from './storage.js';

const AI_PHONE_BINDING_KEY = 'app_ai_phone_binding';
const AI_PHONE_SETTINGS_KEY = 'app_ai_phone_settings';
const APP_BADGES_KEY = 'app_badges';

const STORE_DIARIES = 'ai_phone_diaries';
const STORE_VISITS = 'ai_phone_visits';
const STORE_CHAT_ARCHIVES = 'ai_phone_chat_archives';
const STORE_MEMOS = 'ai_phone_memos';
const STORE_MAILBOX = 'ai_phone_mailbox';
const STORE_APP_LOCKS = 'ai_phone_app_locks';
const STORE_ACTION_LOGS = 'ai_phone_action_logs';
const STORE_DREAMS = 'dreams';

const CHAT_ARCHIVE_MAX_COUNT = 1000;

function safeWarn(label, error) {
  try {
    console.warn(`[AI个人手机] ${label}`, error);
  } catch {}
}

function normalizeId(value) {
  return String(value || '').trim();
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeList(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function sortByCreatedAtDesc(list) {
  return normalizeList(list).slice().sort((a, b) => {
    const left = String(a?.createdAt || '');
    const right = String(b?.createdAt || '');
    return right.localeCompare(left);
  });
}

function sortByCreatedAtAsc(list) {
  return normalizeList(list).slice().sort((a, b) => {
    const left = String(a?.createdAt || '');
    const right = String(b?.createdAt || '');
    return left.localeCompare(right);
  });
}

function sortByUpdatedAtDesc(list) {
  return normalizeList(list).slice().sort((a, b) => {
    const left = String(a?.updatedAt || a?.createdAt || '');
    const right = String(b?.updatedAt || b?.createdAt || '');
    return right.localeCompare(left);
  });
}

function buildRecord(base = {}, patch = {}) {
  const now = getNow();
  const safeBase = normalizeObject(base);
  const safePatch = normalizeObject(patch);
  const id = safeBase.id || safePatch.id || generateId('ai_phone');
  const characterId = safeBase.characterId || safePatch.characterId || '';
  const createdAt = safeBase.createdAt || safePatch.createdAt || now;

  return {
    ...safeBase,
    ...safePatch,
    id,
    characterId,
    createdAt,
    updatedAt: now
  };
}

async function safeGetByCharacter(storeName, characterId) {
  const id = normalizeId(characterId);
  if (!id) return [];

  try {
    return sortByCreatedAtDesc(await getByIndexDB(storeName, 'characterId', id));
  } catch (error) {
    safeWarn(`读取 ${storeName} 失败`, error);
    return [];
  }
}

async function safeDeleteRecords(records, storeName) {
  const list = normalizeList(records);
  let ok = true;

  for (const record of list) {
    if (!record?.id) continue;

    try {
      const deleted = await deleteDB(storeName, record.id);
      if (!deleted) ok = false;
    } catch (error) {
      ok = false;
      safeWarn(`删除 ${storeName} 失败`, error);
    }
  }

  return ok;
}

function getAIPhoneSettings() {
  return normalizeObject(getData(AI_PHONE_SETTINGS_KEY));
}

function setAIPhoneSettings(settings) {
  return setData(AI_PHONE_SETTINGS_KEY, normalizeObject(settings));
}

function getAIPhoneRuntimeSettings(characterId) {
  const settings = getAIPhoneSettings();
  const id = normalizeId(characterId);
  const runtime = normalizeObject(settings.runtime);
  const current = id ? normalizeObject(runtime[id]) : {};

  return {
    settings,
    runtime,
    current,
    characterId: id
  };
}

function setAIPhoneRuntimeSettings(characterId, patch = {}) {
  const id = normalizeId(characterId);
  if (!id) return null;

  const current = getAIPhoneSettings();
  const runtime = normalizeObject(current.runtime);
  const nextCurrent = {
    ...normalizeObject(runtime[id]),
    ...normalizeObject(patch),
    characterId: id,
    updatedAt: getNow()
  };

  const saved = setAIPhoneSettings({
    ...current,
    runtime: {
      ...runtime,
      [id]: nextCurrent
    },
    updatedAt: getNow()
  });

  return saved ? nextCurrent : null;
}

function emitBadgesRefresh() {
  try {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('app-refresh-badges'));
    window.dispatchEvent(new CustomEvent('desktop:refresh'));
  } catch (error) {
    safeWarn('通知角标刷新失败', error);
  }
}

function getRelationState(characterId) {
  const id = normalizeId(characterId);
  if (!id) {
    return {
      characterId: '',
      bound: false,
      enabled: false,
      relationText: '',
      cached: null
    };
  }

  const binding = getAIPhoneBinding();
  const runtime = getAIPhoneRuntimeSettings(id);
  const enabled = runtime.current?.enabled === true && binding.characterId === id;
  const relationText = normalizeText(
    runtime.current?.relationText ||
    (binding.characterId === id ? '这是当前绑定的人设。' : '')
  );

  return {
    characterId: id,
    bound: binding.characterId === id,
    enabled,
    relationText,
    cached: runtime.current || null
  };
}

export function getAIPhoneBinding() {
  try {
    const binding = normalizeObject(getData(AI_PHONE_BINDING_KEY));
    return {
      characterId: normalizeId(binding.characterId),
      updatedAt: binding.updatedAt || ''
    };
  } catch (error) {
    safeWarn('读取绑定失败', error);
    return {
      characterId: '',
      updatedAt: ''
    };
  }
}

export function setAIPhoneBinding(characterId) {
  const id = normalizeId(characterId);
  if (!id) return null;

  try {
    const binding = {
      characterId: id,
      updatedAt: getNow()
    };

    const ok = setData(AI_PHONE_BINDING_KEY, binding);
    return ok ? binding : null;
  } catch (error) {
    safeWarn('保存绑定失败', error);
    return null;
  }
}

export function clearAIPhoneBinding() {
  try {
    return removeData(AI_PHONE_BINDING_KEY);
  } catch (error) {
    safeWarn('清除绑定失败', error);
    return false;
  }
}

export function getBoundAICharacterId() {
  try {
    return normalizeId(getAIPhoneBinding().characterId);
  } catch (error) {
    safeWarn('读取绑定角色失败', error);
    return '';
  }
}

export function resolveAIPhoneCharacterId(inputCharacterId) {
  const id = normalizeId(inputCharacterId);
  if (id) return id;
  return getBoundAICharacterId();
}

export function isAIPhoneEnabledForCharacter(characterId) {
  try {
    return getRelationState(characterId).enabled === true;
  } catch (error) {
    safeWarn('判断启用状态失败', error);
    return false;
  }
}

export function getAIPhoneRelationText(characterId) {
  try {
    return getRelationState(characterId).relationText || '';
  } catch (error) {
    safeWarn('读取关系文案失败', error);
    return '';
  }
}

export function setAIPhoneRelationText(characterId, text) {
  const id = normalizeId(characterId);
  if (!id) return null;

  try {
    return setAIPhoneRuntimeSettings(id, {
      relationText: normalizeText(text)
    });
  } catch (error) {
    safeWarn('设置关系文案失败', error);
    return null;
  }
}

export function enableAIPhoneForCharacter(characterId, patch = {}) {
  const id = normalizeId(characterId);
  if (!id) return null;
  if (getBoundAICharacterId() !== id) return null;

  try {
    const safePatch = normalizeObject(patch);
    return setAIPhoneRuntimeSettings(id, {
      ...safePatch,
      enabled: true,
      relationText: normalizeText(safePatch.relationText || getAIPhoneRelationText(id) || '这是当前绑定的人设。'),
      enabledAt: getNow()
    });
  } catch (error) {
    safeWarn('启用AI手机失败', error);
    return null;
  }
}

export function disableAIPhoneForCharacter(characterId) {
  const id = normalizeId(characterId);
  if (!id) return null;

  try {
    return setAIPhoneRuntimeSettings(id, {
      enabled: false,
      disabledAt: getNow()
    });
  } catch (error) {
    safeWarn('关闭AI手机失败', error);
    return null;
  }
}

export function getAIPhonePermissions(characterId) {
  try {
    const state = getRelationState(characterId);
    const active = state.enabled && state.bound;

    return {
      characterId: state.characterId,
      enabled: state.enabled,
      bound: state.bound,
      relationText: state.relationText,
      powers: {
        diaryWrite: active,
        memoWrite: active,
        mailboxSend: active,
        mailboxRead: active,
        lockApp: active,
        unlockApp: active,
        readOtherChats: active,
        sendAsMe: active,
        proactiveMessage: active,
        makeCall: active,
        dreamAccess: active,
        chatArchiveAccess: active,
        actionLogAccess: active,
        visitLogAccess: active
      }
    };
  } catch (error) {
    safeWarn('读取关系清单失败', error);
    return {
      characterId: normalizeId(characterId),
      enabled: false,
      bound: false,
      relationText: '',
      powers: {
        diaryWrite: false,
        memoWrite: false,
        mailboxSend: false,
        mailboxRead: false,
        lockApp: false,
        unlockApp: false,
        readOtherChats: false,
        sendAsMe: false,
        proactiveMessage: false,
        makeCall: false,
        dreamAccess: false,
        chatArchiveAccess: false,
        actionLogAccess: false,
        visitLogAccess: false
      }
    };
  }
}

export function canAIUsePhonePower(characterId, powerName) {
  try {
    const permissions = getAIPhonePermissions(characterId);
    const power = normalizeId(powerName);
    if (!power) return false;
    return permissions.enabled === true && permissions.bound === true && permissions.powers?.[power] === true;
  } catch (error) {
    safeWarn('判断关系动作失败', error);
    return false;
  }
}

export async function getDiaries(characterId) {
  return safeGetByCharacter(STORE_DIARIES, characterId);
}

export async function addDiary(characterId, data = {}) {
  const id = normalizeId(characterId);
  if (!id) return null;

  try {
    const payload = normalizeObject(data);
    const record = buildRecord({
      id: payload.id || generateId('diary'),
      characterId: id,
      title: normalizeText(payload.title),
      content: normalizeText(payload.content),
      passwordHint: normalizeText(payload.passwordHint),
      locked: payload.locked === true
    }, payload);

    record.characterId = id;

    return await setDB(STORE_DIARIES, record);
  } catch (error) {
    safeWarn('新增日记失败', error);
    return null;
  }
}

export async function editDiary(diaryId, patch = {}) {
  const id = normalizeId(diaryId);
  if (!id) return null;

  try {
    const oldRecord = await getDB(STORE_DIARIES, id);
    if (!oldRecord) return null;

    const safePatch = normalizeObject(patch);
    const record = {
      ...oldRecord,
      ...safePatch,
      id: oldRecord.id,
      characterId: oldRecord.characterId,
      updatedAt: getNow()
    };

    return await setDB(STORE_DIARIES, record);
  } catch (error) {
    safeWarn('编辑日记失败', error);
    return null;
  }
}

export async function deleteDiary(diaryId) {
  const id = normalizeId(diaryId);
  if (!id) return false;

  try {
    return await deleteDB(STORE_DIARIES, id);
  } catch (error) {
    safeWarn('删除日记失败', error);
    return false;
  }
}

export function getDiaryLock(characterId) {
  const id = normalizeId(characterId);
  if (!id) return null;

  try {
    const settings = getAIPhoneSettings();
    const locks = normalizeObject(settings.diaryLocks);
    const lock = normalizeObject(locks[id]);

    return {
      characterId: id,
      locked: lock.locked === true,
      password: String(lock.password || ''),
      passwordHint: String(lock.passwordHint || ''),
      updatedAt: lock.updatedAt || ''
    };
  } catch (error) {
    safeWarn('读取日记锁失败', error);
    return null;
  }
}

export function setDiaryPassword(characterId, password, options = {}) {
  const id = normalizeId(characterId);
  if (!id) return null;

  try {
    const settings = getAIPhoneSettings();
    const locks = normalizeObject(settings.diaryLocks);
    const safeOptions = normalizeObject(options);
    const next = {
      characterId: id,
      locked: Boolean(String(password || '')),
      password: String(password || ''),
      passwordHint: normalizeText(safeOptions.passwordHint),
      updatedAt: getNow()
    };

    const ok = setAIPhoneSettings({
      ...settings,
      diaryLocks: {
        ...locks,
        [id]: next
      },
      updatedAt: getNow()
    });

    return ok ? next : null;
  } catch (error) {
    safeWarn('设置日记密码失败', error);
    return null;
  }
}

export async function recordAIVisit(characterId, data = {}) {
  const id = normalizeId(characterId);
  if (!id) return null;

  try {
    const payload = normalizeObject(data);
    const record = buildRecord({
      id: payload.id || generateId('visit'),
      characterId: id,
      actionType: normalizeText(payload.actionType || 'visit'),
      appId: normalizeText(payload.appId),
      target: normalizeText(payload.target),
      summary: normalizeText(payload.summary),
      detail: payload.detail || '',
      status: normalizeText(payload.status || 'done')
    }, payload);

    record.characterId = id;

    return await setDB(STORE_VISITS, record);
  } catch (error) {
    safeWarn('记录访问失败', error);
    return null;
  }
}

export async function getAIVisits(characterId) {
  return safeGetByCharacter(STORE_VISITS, characterId);
}

export async function recordAIAction(characterId, action = {}) {
  const id = normalizeId(characterId);
  if (!id) return null;

  try {
    const payload = normalizeObject(action);
    const record = buildRecord({
      id: payload.id || generateId('action'),
      characterId: id,
      actionType: normalizeText(payload.actionType || payload.type || 'action'),
      appId: normalizeText(payload.appId),
      target: normalizeText(payload.target),
      summary: normalizeText(payload.summary),
      detail: payload.detail || '',
      status: normalizeText(payload.status || 'done')
    }, payload);

    record.characterId = id;

    return await setDB(STORE_ACTION_LOGS, record);
  } catch (error) {
    safeWarn('记录行为失败', error);
    return null;
  }
}

export async function getAIActionLogs(characterId) {
  return safeGetByCharacter(STORE_ACTION_LOGS, characterId);
}

export async function archiveChatMessage(characterId, message = {}) {
  const id = normalizeId(characterId);
  const payload = normalizeObject(message);

  if (!id || payload.groupId || payload.group === true || payload.isGroup === true) {
    return null;
  }

  try {
    const record = buildRecord({
      id: payload.id ? `archive_${payload.id}` : generateId('chat_archive'),
      characterId: id,
      messageId: payload.id || '',
      role: normalizeText(payload.role),
      type: normalizeText(payload.type || 'text'),
      content: String(payload.content || ''),
      senderId: normalizeText(payload.senderId),
      createdAt: payload.createdAt || getNow()
    }, payload);

    record.characterId = id;

    const saved = await setDB(STORE_CHAT_ARCHIVES, record);
    await trimChatArchive(id, CHAT_ARCHIVE_MAX_COUNT);
    return saved;
  } catch (error) {
    safeWarn('存档聊天失败', error);
    return null;
  }
}

export async function getChatArchive(characterId, limit = CHAT_ARCHIVE_MAX_COUNT) {
  const id = normalizeId(characterId);
  if (!id) return [];

  try {
    const count = Math.max(0, Number(limit) || CHAT_ARCHIVE_MAX_COUNT);
    const list = sortByCreatedAtDesc(await getByIndexDB(STORE_CHAT_ARCHIVES, 'characterId', id));
    return count ? list.slice(0, count) : list;
  } catch (error) {
    safeWarn('读取聊天存档失败', error);
    return [];
  }
}

export async function trimChatArchive(characterId, maxCount = CHAT_ARCHIVE_MAX_COUNT) {
  const id = normalizeId(characterId);
  if (!id) return false;

  try {
    const count = Math.max(1, Number(maxCount) || CHAT_ARCHIVE_MAX_COUNT);
    const list = sortByCreatedAtAsc(await getByIndexDB(STORE_CHAT_ARCHIVES, 'characterId', id));
    const overflow = list.length > count ? list.slice(0, list.length - count) : [];
    return await safeDeleteRecords(overflow, STORE_CHAT_ARCHIVES);
  } catch (error) {
    safeWarn('裁剪聊天存档失败', error);
    return false;
  }
}

export async function getAIMemos(characterId) {
  return safeGetByCharacter(STORE_MEMOS, characterId);
}

export async function addAIMemo(characterId, data = {}) {
  const id = normalizeId(characterId);
  if (!id) return null;

  try {
    const payload = normalizeObject(data);
    const record = buildRecord({
      id: payload.id || generateId('memo'),
      characterId: id,
      content: normalizeText(payload.content),
      tags: normalizeList(payload.tags)
    }, payload);

    record.characterId = id;

    return await setDB(STORE_MEMOS, record);
  } catch (error) {
    safeWarn('新增备忘录失败', error);
    return null;
  }
}

export async function editAIMemo(memoId, patch = {}) {
  const id = normalizeId(memoId);
  if (!id) return null;

  try {
    const oldRecord = await getDB(STORE_MEMOS, id);
    if (!oldRecord) return null;

    const safePatch = normalizeObject(patch);
    const record = {
      ...oldRecord,
      ...safePatch,
      id: oldRecord.id,
      characterId: oldRecord.characterId,
      tags: Array.isArray(safePatch.tags) ? safePatch.tags : normalizeList(oldRecord.tags),
      updatedAt: getNow()
    };

    return await setDB(STORE_MEMOS, record);
  } catch (error) {
    safeWarn('编辑备忘录失败', error);
    return null;
  }
}

export async function deleteAIMemo(memoId) {
  const id = normalizeId(memoId);
  if (!id) return false;

  try {
    return await deleteDB(STORE_MEMOS, id);
  } catch (error) {
    safeWarn('删除备忘录失败', error);
    return false;
  }
}

export async function getAIDreams(characterId) {
  return safeGetByCharacter(STORE_DREAMS, characterId);
}

export async function addAIDream(characterId, data = {}) {
  const id = normalizeId(characterId);
  if (!id) return null;

  try {
    const payload = normalizeObject(data);
    const record = buildRecord({
      id: payload.id || generateId('dream'),
      characterId: id,
      content: normalizeText(payload.content),
      summary: normalizeText(payload.summary),
      mood: normalizeText(payload.mood),
      tags: normalizeList(payload.tags)
    }, payload);

    record.characterId = id;

    return await setDB(STORE_DREAMS, record);
  } catch (error) {
    safeWarn('新增梦境失败', error);
    return null;
  }
}

export async function getMailboxItems(characterId) {
  return safeGetByCharacter(STORE_MAILBOX, characterId);
}

export async function addMailboxItem(characterId, data = {}) {
  const id = normalizeId(characterId);
  if (!id) return null;

  try {
    const payload = normalizeObject(data);
    const record = buildRecord({
      id: payload.id || generateId('mail'),
      characterId: id,
      title: normalizeText(payload.title),
      content: normalizeText(payload.content),
      type: normalizeText(payload.type || 'text'),
      payload: payload.payload || null,
      readAt: payload.readAt || ''
    }, payload);

    record.characterId = id;

    const saved = await setDB(STORE_MAILBOX, record);
    await refreshAIPhoneBadges();
    return saved;
  } catch (error) {
    safeWarn('新增信件失败', error);
    return null;
  }
}

export async function markMailboxItemRead(mailId) {
  const id = normalizeId(mailId);
  if (!id) return null;

  try {
    const oldRecord = await getDB(STORE_MAILBOX, id);
    if (!oldRecord) return null;

    const record = {
      ...oldRecord,
      readAt: oldRecord.readAt || getNow(),
      updatedAt: getNow()
    };

    const saved = await setDB(STORE_MAILBOX, record);
    await refreshAIPhoneBadges();
    return saved;
  } catch (error) {
    safeWarn('标记信件已读失败', error);
    return null;
  }
}

export async function getUnreadMailboxCount(characterId) {
  const id = normalizeId(characterId);
  if (!id) return 0;

  try {
    const list = await getByIndexDB(STORE_MAILBOX, 'characterId', id);
    return normalizeList(list).filter((item) => !item?.readAt).length;
  } catch (error) {
    safeWarn('读取未读信件数失败', error);
    return 0;
  }
}

export async function getAllUnreadMailboxCount() {
  try {
    const list = await getAllDB(STORE_MAILBOX);
    return normalizeList(list).filter((item) => !item?.readAt).length;
  } catch (error) {
    safeWarn('读取全部未读信件数失败', error);
    return 0;
  }
}

export async function refreshAIPhoneBadges() {
  try {
    const badges = normalizeObject(getData(APP_BADGES_KEY));
    const mailboxUnread = await getAllUnreadMailboxCount();
    const next = {
      ...badges,
      mailbox: mailboxUnread
    };
    const ok = setData(APP_BADGES_KEY, next);
    if (!ok) return null;
    emitBadgesRefresh();
    return next;
  } catch (error) {
    safeWarn('刷新角标失败', error);
    return null;
  }
}

export async function lockUserApp(characterId, appId, data = {}) {
  const id = normalizeId(characterId);
  const app = normalizeId(appId);

  if (!id || !app) return null;
  if (!isAIPhoneEnabledForCharacter(id)) return null;

  try {
    const payload = normalizeObject(data);
    const locks = await getByIndexDB(STORE_APP_LOCKS, 'appId', app);
    const sameLock = normalizeList(locks).find((item) => item?.characterId === id && item?.appId === app && item?.status === 'active');

    if (sameLock?.id) {
      const updated = {
        ...sameLock,
        ...payload,
        id: sameLock.id,
        characterId: id,
        appId: app,
        status: 'active',
        unlockedAt: '',
        updatedAt: getNow()
      };
      return await setDB(STORE_APP_LOCKS, updated);
    }

    const activeLock = await getActiveAppLock(app);
    if (activeLock?.id) {
      await unlockUserApp(activeLock.characterId, app);
    }

    const record = buildRecord({
      id: payload.id || generateId('app_lock'),
      characterId: id,
      appId: app,
      appName: normalizeText(payload.appName),
      message: normalizeText(payload.message),
      status: 'active',
      unlockedAt: ''
    }, payload);

    record.characterId = id;
    record.appId = app;
    record.status = 'active';
    record.unlockedAt = '';

    return await setDB(STORE_APP_LOCKS, record);
  } catch (error) {
    safeWarn('锁定应用失败', error);
    return null;
  }
}

export async function unlockUserApp(characterId, appId) {
  const id = normalizeId(characterId);
  const app = normalizeId(appId);

  if (!id || !app) return false;
  if (!isAIPhoneEnabledForCharacter(id)) return false;

  try {
    const locks = await getByIndexDB(STORE_APP_LOCKS, 'appId', app);
    const activeLocks = normalizeList(locks).filter((item) => item?.characterId === id && item?.status === 'active');
    let ok = true;

    for (const lock of activeLocks) {
      const saved = await setDB(STORE_APP_LOCKS, {
        ...lock,
        status: 'unlocked',
        unlockedAt: getNow(),
        updatedAt: getNow()
      });

      if (!saved) ok = false;
    }

    return ok;
  } catch (error) {
    safeWarn('解除应用锁失败', error);
    return false;
  }
}

export async function getActiveAppLock(appId) {
  const app = normalizeId(appId);
  if (!app) return null;

  try {
    const locks = await getByIndexDB(STORE_APP_LOCKS, 'appId', app);
    const activeLocks = sortByUpdatedAtDesc(normalizeList(locks).filter((item) => item?.status === 'active'));
    return activeLocks[0] || null;
  } catch (error) {
    safeWarn('读取应用锁失败', error);
    return null;
  }
}

export async function getAppLocks(characterId) {
  return safeGetByCharacter(STORE_APP_LOCKS, characterId);
}

export async function isAppLocked(appId) {
  const lock = await getActiveAppLock(appId);
  return Boolean(lock?.id);
}

export function buildDelegateMessagePayload(character, targetCharacterId, content, extra = {}) {
  const ai = normalizeObject(character);
  const safeExtra = normalizeObject(extra);
  const sourceCharacterId = normalizeId(ai.id || ai.characterId);
  const delegatedTargetCharacterId = normalizeId(targetCharacterId);
  const text = normalizeText(content);

  if (!sourceCharacterId || !delegatedTargetCharacterId || !text) return null;
  if (!isAIPhoneEnabledForCharacter(sourceCharacterId)) return null;

  try {
    return {
      ...safeExtra,
      role: 'assistant',
      type: 'text',
      content: text,
      characterId: sourceCharacterId,
      characterName: normalizeText(safeExtra.characterName || ai.name || ''),
      characterAvatar: safeExtra.characterAvatar || ai.avatar || ai.characterAvatar || '',
      delegatedByCharacterId: sourceCharacterId,
      delegatedByName: normalizeText(ai.name || ai.nickname || ''),
      delegatedByLabel: normalizeText(ai.name || ai.nickname || ''),
      delegatedByAvatar: safeExtra.delegatedByAvatar || ai.avatar || ai.characterAvatar || '',
      delegatedByCharacterAvatar: safeExtra.delegatedByCharacterAvatar || ai.characterAvatar || ai.avatar || '',
      delegatedTargetCharacterId,
      sourceCharacterId,
      targetCharacterId: delegatedTargetCharacterId,
      createdAt: safeExtra.createdAt || getNow()
    };
  } catch (error) {
    safeWarn('构建代聊消息失败', error);
    return null;
  }
}

export async function deleteAIPhoneDataByCharacter(characterId) {
  const id = normalizeId(characterId);
  if (!id) return false;

  try {
    const storeNames = [
      STORE_DIARIES,
      STORE_VISITS,
      STORE_CHAT_ARCHIVES,
      STORE_MEMOS,
      STORE_MAILBOX,
      STORE_APP_LOCKS,
      STORE_ACTION_LOGS
    ];

    let ok = true;

    for (const storeName of storeNames) {
      const records = await getByIndexDB(storeName, 'characterId', id);
      const deleted = await safeDeleteRecords(records, storeName);
      if (!deleted) ok = false;
    }

    if (getBoundAICharacterId() === id) {
      const cleared = clearAIPhoneBinding();
      if (!cleared) ok = false;
    }

    const settings = getAIPhoneSettings();
    const diaryLocks = normalizeObject(settings.diaryLocks);
    const runtime = normalizeObject(settings.runtime);
    const hasDiaryLock = Boolean(diaryLocks[id]);
    const hasRuntime = Boolean(runtime[id]);

    if (hasDiaryLock) {
      delete diaryLocks[id];
    }

    if (hasRuntime) {
      delete runtime[id];
    }

    if (hasDiaryLock || hasRuntime) {
      const saved = setAIPhoneSettings({
        ...settings,
        diaryLocks,
        runtime,
        updatedAt: getNow()
      });
      if (!saved) ok = false;
    }

    await refreshAIPhoneBadges();

    return ok;
  } catch (error) {
    safeWarn('清理角色AI手机数据失败', error);
    return null;
  }
}
