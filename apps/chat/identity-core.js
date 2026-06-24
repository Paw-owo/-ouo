// apps/chat/identity-core.js
// imports: none

export function getIdentityCore(callName, options = {}) {
  const fullMode = options.fullMode === true;

  if (!fullMode) {
    return [];
  }

  return [
    // 你把亲密关系文案贴在这里。
    // 格式示例：
    // '',
    // '关于亲密：',
    // `这里可以使用 ${callName} 这个称呼。`
  ];
}

// 依赖：无

