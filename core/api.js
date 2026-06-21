// ================================
// AI API调用模块
// 支持OpenAI格式、流式输出、多配置切换
// ================================

import storage from './storage.js';

class APIManager {
  constructor() {
    this.currentConfig = null;
    this.abortController = null;
  }

  // 获取API配置列表
  getConfigs() {
    return storage.getAPIConfigs();
  }

  // 设置当前使用的配置
  setCurrentConfig(configId) {
    const configs = this.getConfigs();
    const config = configs.find(c => c.id === configId);
    
    if (config) {
      this.currentConfig = config;
      return true;
    }
    return false;
  }

  // 获取当前配置
  getCurrentConfig() {
    if (!this.currentConfig) {
      const configs = this.getConfigs();
      if (configs.length > 0) {
        this.currentConfig = configs[0];
      }
    }
    return this.currentConfig;
  }

  // 拉取模型列表
  async fetchModels(configId) {
    const configs = this.getConfigs();
    const config = configs.find(c => c.id === configId);

    if (!config) {
      throw new Error('API配置不存在');
    }

    try {
      const response = await fetch(`${config.endpoint}/v1/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      
      // 解析模型列表
      if (data.data && Array.isArray(data.data)) {
        return data.data.map(model => ({
          id: model.id,
          name: model.id,
          created: model.created
        }));
      }

      return [];
    } catch (error) {
      console.error('拉取模型列表失败:', error);
      throw new Error('拉取模型列表失败，请检查endpoint和apiKey');
    }
  }

  // 构建完整的消息数组
  buildMessages(character, userMessage, chatHistory = []) {
    const messages = [];

    // 1. 构建system prompt
    let systemPrompt = character.systemPrompt || '';

    // 2. 注入世界书（绑定该角色的条目）
    const worldbook = storage.getWorldbook();
    const characterWorldbook = worldbook.filter(entry => {
      if (entry.type === 'thinking') return true; // 思维方式全局通用
      if (entry.type === 'background') {
        return entry.characterIds?.includes(character.id) || entry.isGlobal;
      }
      return false;
    });

    if (characterWorldbook.length > 0) {
      const worldbookText = characterWorldbook.map(entry => entry.content).join('\n\n');
      systemPrompt += `\n\n## 世界设定\n${worldbookText}`;
    }

    // 3. 注入记忆
    const memories = storage.getMemories(character.id);
    if (memories.length > 0) {
      const memoryText = memories.map(m => m.content).join('\n');
      systemPrompt += `\n\n## 记忆\n${memoryText}`;
    }

    // 4. 注入心情状态（如果有道具影响）
    if (character.mood && character.mood !== 'neutral') {
      systemPrompt += `\n\n## 当前心情\n你现在的心情是：${character.mood}`;
    }

    messages.push({
      role: 'system',
      content: systemPrompt
    });

    // 5. 添加历史对话（保留最近20条）
    const recentHistory = chatHistory.slice(-20);
    messages.push(...recentHistory);

    // 6. 添加用户当前消息
    messages.push({
      role: 'user',
      content: userMessage
    });

    return messages;
  }

  // 发送消息（非流式）
  async sendMessage(character, userMessage, chatHistory = [], options = {}) {
    const config = options.config || this.getCurrentConfig();
    const model = options.model || character.apiConfig?.model || 'gpt-3.5-turbo';

    if (!config) {
      throw new Error('未配置API');
    }

    const messages = this.buildMessages(character, userMessage, chatHistory);

    // 构建请求体
    const requestBody = {
      model,
      messages,
      temperature: options.temperature || 0.8,
      max_tokens: options.maxTokens || 2000,
      stream: false
    };

    // 如果启用了MCP工具
    if (options.mcpTools && options.mcpTools.length > 0) {
      requestBody.tools = options.mcpTools;
      requestBody.tool_choice = 'auto';
    }

    try {
      const response = await fetch(`${config.endpoint}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`API错误: ${response.status} - ${error}`);
      }

      const data = await response.json();
      
      return {
        content: data.choices[0].message.content,
        role: 'assistant',
        toolCalls: data.choices[0].message.tool_calls,
        usage: data.usage
      };
    } catch (error) {
      console.error('API调用失败:', error);
      throw error;
    }
  }

  // 发送消息（流式）
  async sendMessageStream(character, userMessage, chatHistory = [], options = {}, onChunk) {
    const config = options.config || this.getCurrentConfig();
    const model = options.model || character.apiConfig?.model || 'gpt-3.5-turbo';

    if (!config) {
      throw new Error('未配置API');
    }

    const messages = this.buildMessages(character, userMessage, chatHistory);

    // 构建请求体
    const requestBody = {
      model,
      messages,
      temperature: options.temperature || 0.8,
      max_tokens: options.maxTokens || 2000,
      stream: true
    };

    // 如果启用了MCP工具
    if (options.mcpTools && options.mcpTools.length > 0) {
      requestBody.tools = options.mcpTools;
      requestBody.tool_choice = 'auto';
    }

    // 创建可中止的请求
    this.abortController = new AbortController();

    try {
      const response = await fetch(`${config.endpoint}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal: this.abortController.signal
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`API错误: ${response.status} - ${error}`);
      }

      // 处理SSE流
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          
          if (trimmed.startsWith('data: ')) {
            try {
              const jsonStr = trimmed.slice(6);
              const data = JSON.parse(jsonStr);
              
              const delta = data.choices[0]?.delta;
              if (delta?.content) {
                fullContent += delta.content;
                
                // 回调每个chunk
                if (onChunk) {
                  onChunk({
                    type: 'content',
                    content: delta.content,
                    fullContent
                  });
                }
              }

              // 处理工具调用
              if (delta?.tool_calls) {
                if (onChunk) {
                  onChunk({
                    type: 'tool_call',
                    toolCalls: delta.tool_calls
                  });
                }
              }
            } catch (e) {
              console.error('解析SSE数据失败:', e);
            }
          }
        }
      }

      return {
        content: fullContent,
        role: 'assistant'
      };
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('请求已取消');
      }
      console.error('流式API调用失败:', error);
      throw error;
    } finally {
      this.abortController = null;
    }
  }

  // 取消当前请求
  abort() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  // 检查是否正在请求中
  isRequesting() {
    return this.abortController !== null;
  }

  // 调用记忆总结
  async summarizeMemory(character, messages) {
    const summaryPrompt = `请总结以下对话中的重要信息，提取关键记忆点：

${messages.map(m => `${m.role}: ${m.content}`).join('\n')}

请用简洁的语言总结，每条记忆一行，只保留重要信息。`;

    try {
      const result = await this.sendMessage(
        character,
        summaryPrompt,
        [],
        { temperature: 0.3, maxTokens: 500 }
      );

      return result.content;
    } catch (error) {
      console.error('记忆总结失败:', error);
      return null;
    }
  }

  // 判断是否需要记忆（主动记忆检测）
  async shouldRemember(character, userMessage, aiResponse) {
    const checkPrompt = `判断以下对话是否包含需要长期记忆的重要信息（如用户的个人信息、重要事件、偏好等）。只回复"是"或"否"。

用户: ${userMessage}
AI: ${aiResponse}`;

    try {
      const result = await this.sendMessage(
        character,
        checkPrompt,
        [],
        { temperature: 0.1, maxTokens: 10 }
      );

      return result.content.trim().includes('是');
    } catch (error) {
      console.error('记忆判断失败:', error);
      return false;
    }
  }

  // 提取记忆内容
  async extractMemory(character, userMessage, aiResponse) {
    const extractPrompt = `从以下对话中提取需要记住的关键信息，用一句话概括：

用户: ${userMessage}
AI: ${aiResponse}

只输出提取的信息，不要其他内容。`;

    try {
      const result = await this.sendMessage(
        character,
        extractPrompt,
        [],
        { temperature: 0.3, maxTokens: 100 }
      );

      return result.content.trim();
    } catch (error) {
      console.error('记忆提取失败:', error);
      return null;
    }
  }

  // 图片识别（用于表情包描述生成）
  async analyzeImage(imageUrl, prompt = '请描述这张图片的内容和情绪') {
    const config = this.getCurrentConfig();
    
    if (!config) {
      throw new Error('未配置API');
    }

    try {
      const response = await fetch(`${config.endpoint}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: imageUrl } }
              ]
            }
          ],
          max_tokens: 100
        })
      });

      if (!response.ok) {
        throw new Error('图片识别失败');
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      console.error('图片识别失败:', error);
      throw error;
    }
  }
}

// 创建全局实例
const apiManager = new APIManager();

export default apiManager;
