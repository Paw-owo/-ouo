// ============================================
// storage.js — 存储统一入口
// 轻量转发，实际逻辑在 storage-manager.js
// 所有模块通过此文件访问存储，不直接调 storage-manager
// ============================================

export {
  setCurrentCharacter,
  getCurrentCharacter,
  lsGet,
  lsSet,
  lsRemove,
  openDB,
  getMessages,
  saveMessage,
  deleteMessages,
  getMemories,
  saveMemory,
  deleteMemory,
  clearMemories,
  getNotifications,
  saveNotification,
  deleteNotification,
  clearNotifications,
  markNotificationRead,
  getCharacter,
  getAllCharacters,
  saveCharacter,
  deleteCharacter,
  getSetting,
  setSetting
} from './storage-manager.js';