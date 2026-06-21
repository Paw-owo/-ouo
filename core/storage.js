// ================================
// 数据存储模块
// IndexedDB存图片，localStorage存配置
// ================================

const DB_NAME = 'AIMobileDB';
const DB_VERSION = 1;
const STORES = {
  IMAGES: 'images',      // 存储所有图片
  WALLPAPERS: 'wallpapers', // 壁纸
  AVATARS: 'avatars',    // 头像
  EMOJIS: 'emojis'       // 表情包
};

class Storage {
  constructor() {
    this.db = null;
    this.initialized = false;
  }

  // 初始化IndexedDB
  async init() {
    if (this.initialized) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      
      request.onsuccess = () => {
        this.db = request.result;
        this.initialized = true;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // 创建对象存储空间
        Object.values(STORES).forEach(storeName => {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName, { keyPath: 'id' });
          }
        });
      };
    });
  }

  // === IndexedDB图片操作 ===

  // 保存图片到IndexedDB
  async saveImage(storeName, id, blob, metadata = {}) {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      
      const data = {
        id,
        blob,
        metadata,
        timestamp: Date.now()
      };

      const request = store.put(data);
      request.onsuccess = () => resolve(id);
      request.onerror = () => reject(request.error);
    });
  }

  // 从IndexedDB读取图片
  async getImage(storeName, id) {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(id);

      request.onsuccess = () => {
        if (request.result) {
          const url = URL.createObjectURL(request.result.blob);
          resolve({ url, metadata: request.result.metadata });
        } else {
          resolve(null);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  // 删除图片
  async deleteImage(storeName, id) {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // 获取所有图片ID
  async getAllImageIds(storeName) {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAllKeys();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // 从文件上传并保存图片
  async uploadImage(storeName, file, id = null) {
    if (!file || !file.type.startsWith('image/')) {
      throw new Error('请选择图片文件');
    }

    // 图片压缩（如果超过500KB）
    const blob = await this.compressImage(file);
    const imageId = id || `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await this.saveImage(storeName, imageId, blob, {
      name: file.name,
      type: file.type,
      size: blob.size
    });

    return imageId;
  }

  // 图片压缩
  async compressImage(file, maxSize = 500 * 1024) {
    if (file.size <= maxSize) return file;

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // 按比例缩小
          const maxDimension = 1200;
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = (height / width) * maxDimension;
              width = maxDimension;
            } else {
              width = (width / height) * maxDimension;
              height = maxDimension;
            }
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob((blob) => {
            resolve(blob);
          }, 'image/jpeg', 0.85);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // === localStorage配置操作 ===

  // 保存配置
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('localStorage存储失败:', e);
      return false;
    }
  }

  // 读取配置
  get(key, defaultValue = null) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : defaultValue;
    } catch (e) {
      console.error('localStorage读取失败:', e);
      return defaultValue;
    }
  }

  // 删除配置
  remove(key) {
    localStorage.removeItem(key);
  }

  // 清空所有配置
  clear() {
    localStorage.clear();
  }

  // === 角色数据操作 ===

  // 保存角色
  saveCharacter(character) {
    const characters = this.get('characters', []);
    const index = characters.findIndex(c => c.id === character.id);
    
    if (index > -1) {
      characters[index] = character;
    } else {
      characters.push(character);
    }
    
    this.set('characters', characters);
    return character;
  }

  // 获取所有角色
  getCharacters() {
    return this.get('characters', []);
  }

  // 获取单个角色
  getCharacter(id) {
    const characters = this.getCharacters();
    return characters.find(c => c.id === id);
  }

  // 删除角色
  deleteCharacter(id) {
    const characters = this.getCharacters();
    const filtered = characters.filter(c => c.id !== id);
    this.set('characters', filtered);
  }

  // === 聊天记录操作 ===

  // 保存聊天记录
  saveChatHistory(characterId, messages) {
    this.set(`chat_${characterId}`, messages);
  }

  // 获取聊天记录
  getChatHistory(characterId) {
    return this.get(`chat_${characterId}`, []);
  }

  // 清空聊天记录
  clearChatHistory(characterId) {
    this.remove(`chat_${characterId}`);
  }

  // === 记忆操作 ===

  // 保存记忆
  saveMemories(characterId, memories) {
    this.set(`memory_${characterId}`, memories);
  }

  // 获取记忆
  getMemories(characterId) {
    return this.get(`memory_${characterId}`, []);
  }

  // 添加单条记忆
  addMemory(characterId, memory) {
    const memories = this.getMemories(characterId);
    memories.push({
      id: `mem_${Date.now()}`,
      content: memory,
      timestamp: Date.now()
    });
    this.saveMemories(characterId, memories);
  }

  // === 世界书操作 ===

  // 保存世界书条目
  saveWorldbook(entries) {
    this.set('worldbook', entries);
  }

  // 获取世界书
  getWorldbook() {
    return this.get('worldbook', []);
  }

  // === API配置操作 ===

  // 保存API配置
  saveAPIConfigs(configs) {
    this.set('api_configs', configs);
  }

  // 获取API配置
  getAPIConfigs() {
    return this.get('api_configs', []);
  }

  // === 桌面布局操作 ===

  // 保存桌面图标位置
  saveDesktopLayout(layout) {
    this.set('desktop_layout', layout);
  }

  // 获取桌面布局
  getDesktopLayout() {
    return this.get('desktop_layout', {
      icons: [],
      widgets: []
    });
  }

  // === 主题配置 ===

  // 保存当前主题
  saveTheme(theme) {
    this.set('current_theme', theme);
  }

  // 获取当前主题
  getTheme() {
    return this.get('current_theme', 'cream');
  }

  // === 设置配置 ===

  // 保存设置
  saveSettings(settings) {
    this.set('settings', settings);
  }

  // 获取设置
  getSettings() {
    return this.get('settings', {
      bubbleMode: 'bubble', // bubble 或 dialogue
      autoTTS: false,
      streamMode: true,
      memoryEnabled: true,
      weatherCity: '温州',
      desktopWidgets: {
        time: true,
        weather: true,
        anniversary: true
      }
    });
  }

  // === 钱包操作 ===

  // 保存余额
  saveBalance(balance) {
    this.set('wallet_balance', balance);
  }

  // 获取余额
  getBalance() {
    return this.get('wallet_balance', 0);
  }

  // 添加交易记录
  addTransaction(transaction) {
    const transactions = this.get('transactions', []);
    transactions.unshift({
      id: `tx_${Date.now()}`,
      ...transaction,
      timestamp: Date.now()
    });
    this.set('transactions', transactions);
  }

  // === 数据导出导入 ===

  // 导出所有数据
  async exportAllData() {
    const data = {
      version: '1.0',
      exportTime: Date.now(),
      characters: this.getCharacters(),
      worldbook: this.getWorldbook(),
      apiConfigs: this.getAPIConfigs(),
      settings: this.getSettings(),
      desktopLayout: this.getDesktopLayout(),
      theme: this.getTheme()
    };

    // 导出聊天记录
    const characters = this.getCharacters();
    data.chatHistories = {};
    characters.forEach(char => {
      data.chatHistories[char.id] = this.getChatHistory(char.id);
    });

    return data;
  }

  // 导入数据
  async importAllData(data) {
    if (!data || !data.version) {
      throw new Error('无效的数据格式');
    }

    // 导入配置
    if (data.characters) this.set('characters', data.characters);
    if (data.worldbook) this.saveWorldbook(data.worldbook);
    if (data.apiConfigs) this.saveAPIConfigs(data.apiConfigs);
    if (data.settings) this.saveSettings(data.settings);
    if (data.desktopLayout) this.saveDesktopLayout(data.desktopLayout);
    if (data.theme) this.saveTheme(data.theme);

    // 导入聊天记录
    if (data.chatHistories) {
      Object.keys(data.chatHistories).forEach(charId => {
        this.saveChatHistory(charId, data.chatHistories[charId]);
      });
    }

    return true;
  }

  // 清空所有数据（危险操作）
  async clearAllData() {
    // 清空localStorage
    this.clear();

    // 清空IndexedDB
    await this.init();
    const storeNames = Object.values(STORES);
    
    for (const storeName of storeNames) {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      await new Promise((resolve, reject) => {
        const request = store.clear();
        request.onsuccess = resolve;
        request.onerror = () => reject(request.error);
      });
    }
  }

  // === 表情包操作 ===

  // 保存表情包
  async saveEmoji(file, description) {
    const emojiId = await this.uploadImage(STORES.EMOJIS, file);
    
    // 保存描述到localStorage
    const emojis = this.get('emoji_list', []);
    emojis.push({
      id: emojiId,
      description,
      timestamp: Date.now()
    });
    this.set('emoji_list', emojis);
    
    return emojiId;
  }

  // 获取表情包列表
  getEmojiList() {
    return this.get('emoji_list', []);
  }

  // 删除表情包
  async deleteEmoji(emojiId) {
    await this.deleteImage(STORES.EMOJIS, emojiId);
    
    const emojis = this.getEmojiList();
    const filtered = emojis.filter(e => e.id !== emojiId);
    this.set('emoji_list', filtered);
  }
}

// 创建全局实例
const storage = new Storage();

export default storage;
export { STORES };
