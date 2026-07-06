// ============================================
// schemas.js — 数据校验规则
// ============================================

const SCHEMAS = {
  // 记忆记录
  memory: {
    required: ['id', 'characterId', 'type', 'content'],
    fields: {
      id:            { type: 'string' },
      characterId:   { type: 'string' },
      type:          { type: 'string', enum: ['episodic', 'semantic', 'procedural'] },
      content:       { type: 'string' },
      source:        { type: 'string', optional: true },
      timestamp:     { type: 'number', optional: true },
      tags:          { type: 'array',  optional: true },
      importance:    { type: 'number', optional: true, min: 1, max: 10 },
      lastAccessed:  { type: 'number', optional: true }
    }
  },

  // 聊天消息
  chatMessage: {
    required: ['id', 'characterId', 'conversationId', 'role', 'content'],
    fields: {
      id:             { type: 'string' },
      characterId:    { type: 'string' },
      conversationId: { type: 'string' },
      role:           { type: 'string', enum: ['user', 'assistant', 'system'] },
      content:        { type: 'string' },
      timestamp:      { type: 'number', optional: true },
      hidden:         { type: 'boolean', optional: true },
      metadata:       { type: 'object', optional: true }
    }
  },

  // 通知记录
  notification: {
    required: ['id', 'appId', 'type', 'content'],
    fields: {
      id:        { type: 'string' },
      appId:     { type: 'string' },
      type:      { type: 'string' },
      content:   { type: 'string' },
      title:     { type: 'string', optional: true },
      timestamp: { type: 'number', optional: true },
      read:      { type: 'boolean', optional: true },
      data:      { type: 'object', optional: true }
    }
  },

  // 角色资料
  character: {
    required: ['id', 'name'],
    fields: {
      id:          { type: 'string' },
      name:        { type: 'string' },
      avatar:      { type: 'string', optional: true },
      personality: { type: 'string', optional: true },
      description: { type: 'string', optional: true },
      metadata:    { type: 'object', optional: true }
    }
  },

  // API配置
  apiConfig: {
    required: ['id', 'name', 'baseURL'],
    fields: {
      id:       { type: 'string' },
      name:     { type: 'string' },
      baseURL:  { type: 'string' },
      apiKey:   { type: 'string', optional: true },
      models:   { type: 'array',  optional: true },
      enabled:  { type: 'boolean', optional: true },
      group:    { type: 'string', optional: true },
      notes:    { type: 'string', optional: true }
    }
  }
};

export default SCHEMAS;