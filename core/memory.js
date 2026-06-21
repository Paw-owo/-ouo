// ================================
// 记忆系统模块
// 支持自动总结、主动记忆、手动管理
// ================================

import storage from './storage.js';
import apiManager from './api.js';

class MemoryManager {
  constructor() {
    this.memoryCache = {}; // 缓存每个角色的记忆
  }

  // 获取角色记忆
  getMemories(characterId) {
    if (!this.memoryCache[characterId]) {
      this.memoryCache[characterId] = storage.getMemories(characterId);
    }
    return this.memoryCache[characterId];
  }

  // 保存角色记忆
  saveMemories(characterId, memories) {
    this.memoryCache[characterId] = memories;
    storage.saveMemories(characterId, memories);
  }

  // 添加单条记忆
  addMemory(characterId, content, source = 'manual') {
    const memories = this.getMemories(characterId);
    
    const memory = {
      id: `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      content,
      source, // manual / auto / extracted
      timestamp: Date.now(),
      createdAt: new Date().toLocaleString('zh-CN')
    };

    memories.push(memory);
    this.saveMemories(characterId, memories);

    return memory;
  }

  // 删除记忆
  deleteMemory(characterId, memoryId) {
    const memories = this.getMemories(characterId);
    const filtered = memories.filter(m => m.id !== memoryId);
    this.saveMemories(characterId, filtered);
  }

  // 清空角色所有记忆
  clearMemories(characterId) {
    this.memoryCache[characterId] = [];
    storage.saveMemories(characterId, []);
  }

  // 检查是否需要自动总结
  async checkAutoSummarize(character, chatHistory) {
    const settings = storage.getSettings();
    if (!settings.memoryEnabled) return;

    const triggerCount = character.memoryTriggerCount || 100;
    
    // 获取上次总结后的新消息数量
    const lastSummaryTime = character.lastMemorySummaryTime || 0;
    const newMessages = chatHistory.filter(msg => {
      return msg.timestamp > lastSummaryTime;
    });

    if (newMessages.length >= triggerCount) {
      await this.autoSummarize(character, newMessages);
      
      // 更新总结时间
      character.lastMemorySummaryTime = Date.now();
      storage.saveCharacter(character);
    }
  }

  // 自动总结记忆
  async autoSummarize(character, messages) {
    if (messages.length === 0) return;

    try {
      const summary = await apiManager.summarizeMemory(character, messages);
      
      if (summary) {
        // 将总结拆分成多条记忆
        const summaryLines = summary.split('\n').filter(line => line.trim());
        
        summaryLines.forEach(line => {
          const cleaned = line.replace(/^[-•\d.]\s*/, '').trim();
          if (cleaned.length > 10) {
            this.addMemory(character.id, cleaned, 'auto');
          }
        });

        console.log(`自动总结完成，添加 ${summaryLines.length} 条记忆`);
      }
    } catch (error) {
      console.error('自动总结失败:', error);
    }
  }

  // 主动记忆检测
  async checkActiveMemory(character, userMessage, aiResponse) {
    const settings = storage.getSettings();
    if (!settings.memoryEnabled) return;

    try {
      // 判断是否需要记忆
      const shouldRemember = await apiManager.shouldRemember(
        character,
        userMessage,
        aiResponse
      );

      if (shouldRemember) {
        // 提取记忆内容
        const memoryContent = await apiManager.extractMemory(
          character,
          userMessage,
          aiResponse
        );

        if (memoryContent && memoryContent.length > 10) {
          this.addMemory(character.id, memoryContent, 'extracted');
          console.log('主动记忆已添加:', memoryContent);
        }
      }
    } catch (error) {
      console.error('主动记忆检测失败:', error);
    }
  }

  // 搜索记忆
  searchMemories(characterId, keyword) {
    const memories = this.getMemories(characterId);
    
    if (!keyword || keyword.trim() === '') {
      return memories;
    }

    const lowerKeyword = keyword.toLowerCase();
    return memories.filter(memory => {
      return memory.content.toLowerCase().includes(lowerKeyword);
    });
  }

  // 获取最近的N条记忆
  getRecentMemories(characterId, count = 10) {
    const memories = this.getMemories(characterId);
    return memories.slice(-count).reverse();
  }

  // 格式化记忆用于注入
  formatMemoriesForInjection(characterId, maxCount = 20) {
    const memories = this.getMemories(characterId);
    
    if (memories.length === 0) {
      return '';
    }

    // 取最近的记忆
    const recentMemories = memories.slice(-maxCount);
    
    return recentMemories
      .map(m => `- ${m.content}`)
      .join('\n');
  }

  // 导出角色记忆
  exportMemories(characterId) {
    const character = storage.getCharacter(characterId);
    const memories = this.getMemories(characterId);

    const data = {
      characterId,
      characterName: character?.name || '未知角色',
      exportTime: Date.now(),
      exportDate: new Date().toLocaleString('zh-CN'),
      totalCount: memories.length,
      memories
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `memories_${character?.name || characterId}_${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);

    return data;
  }

  // 导入记忆
  async importMemories(characterId, file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          
          if (!data.memories || !Array.isArray(data.memories)) {
            throw new Error('无效的记忆文件格式');
          }

          // 合并记忆（避免重复）
          const existingMemories = this.getMemories(characterId);
          const existingContents = new Set(existingMemories.map(m => m.content));
          
          let addedCount = 0;
          data.memories.forEach(memory => {
            if (!existingContents.has(memory.content)) {
              this.addMemory(characterId, memory.content, 'imported');
              addedCount++;
            }
          });

          resolve({
            success: true,
            total: data.memories.length,
            added: addedCount
          });
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsText(file);
    });
  }

  // 获取记忆统计
  getMemoryStats(characterId) {
    const memories = this.getMemories(characterId);
    
    const stats = {
      total: memories.length,
      manual: 0,
      auto: 0,
      extracted: 0,
      oldest: null,
      newest: null
    };

    if (memories.length > 0) {
      memories.forEach(m => {
        if (m.source === 'manual') stats.manual++;
        else if (m.source === 'auto') stats.auto++;
        else if (m.source === 'extracted') stats.extracted++;
      });

      stats.oldest = memories[0];
      stats.newest = memories[memories.length - 1];
    }

    return stats;
  }

  // 整理记忆（合并相似、删除重复）
  async organizeMemories(characterId) {
    const memories = this.getMemories(characterId);
    
    if (memories.length < 2) return;

    // 简单去重：删除内容完全相同的记忆
    const uniqueMemories = [];
    const seenContents = new Set();

    memories.forEach(memory => {
      const normalized = memory.content.trim().toLowerCase();
      if (!seenContents.has(normalized)) {
        seenContents.add(normalized);
        uniqueMemories.push(memory);
      }
    });

    if (uniqueMemories.length < memories.length) {
      this.saveMemories(characterId, uniqueMemories);
      console.log(`记忆整理完成：删除了 ${memories.length - uniqueMemories.length} 条重复记忆`);
    }
  }

  // 批量添加记忆
  batchAddMemories(characterId, contents, source = 'manual') {
    const added = [];
    
    contents.forEach(content => {
      if (content && content.trim().length > 0) {
        const memory = this.addMemory(characterId, content.trim(), source);
        added.push(memory);
      }
    });

    return added;
  }

  // 更新记忆内容
  updateMemory(characterId, memoryId, newContent) {
    const memories = this.getMemories(characterId);
    const memory = memories.find(m => m.id === memoryId);
    
    if (memory) {
      memory.content = newContent;
      memory.updatedAt = new Date().toLocaleString('zh-CN');
      this.saveMemories(characterId, memories);
      return true;
    }
    
    return false;
  }
}

// 创建全局实例
const memoryManager = new MemoryManager();

export default memoryManager;
