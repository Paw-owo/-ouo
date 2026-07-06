// apps/chat/chat-settings/prefs-group.js
// 「聊天偏好」分组——字号、模式、自动滚底、回车发送、显示思维链、自动播语音、
// 显示打字提示、显示流式光标、双击点赞等阅读/交互偏好。
// 红线：图标只准 SVG 线稿，禁止任何 emoji 字符。
// 依赖：core/ui.js, ./widgets.js

import { createCollapsibleCard, showToast } from '../../../core/ui.js';
import {
  makeToggle, makeSegmented, makeSlider, makeHintBar, makeBadge,
  makeSection, makeSectionTitle, makeButton,
  saveChatPrefs, getChatPrefs,
  FONT_SIZE_OPTIONS, CHAT_MODE_OPTIONS
} from './widgets.js';

/**
 * 构建「聊天偏好」分组。
 * @param {object} ctx { character, prefs, scope, groupId }
 * @returns {HTMLElement}
 */
export function buildPrefsGroup(ctx) {
  const { character, prefs, scope = 'chat', groupId } = ctx;
  const ownerId = scope === 'group' ? groupId : character?.id;
  const section = makeSection();
  section.appendChild(makeSectionTitle('聊天偏好'));

  if (!ownerId) {
    section.appendChild(makeHintBar('还没有可配置的对象，先选个角色或群吧'));
    return section;
  }

  const p = prefs || getChatPrefs(ownerId);
  const cur = () => getChatPrefs(ownerId);

  const content = document.createElement('div');

  // 字号
  content.appendChild(makeSegmented({
    label: '字号',
    value: p.fontSize || 'medium',
    options: FONT_SIZE_OPTIONS,
    helper: '影响消息文字大小',
    onChange: (v) => {
      saveChatPrefs(ownerId, { fontSize: v });
      applyFontSize(v);
      showToast('字号已切换', 'default', 1000);
    }
  }));

  // 聊天模式（per-character：只影响当前角色，不动全局 chat_mode key）
  content.appendChild(makeSegmented({
    label: '显示模式',
    value: p.chatMode || 'bubble',
    options: CHAT_MODE_OPTIONS,
    helper: '气泡像微信，对话像剧本（只对当前角色生效）',
    onChange: (v) => {
      saveChatPrefs(ownerId, { chatMode: v });
      showToast(v === 'bubble' ? '已切到气泡模式' : '已切到对话模式', 'default', 1200);
    }
  }));

  // 自动滚到底部
  content.appendChild(makeToggle({
    label: '进入聊天自动滚到底部',
    value: p.autoScroll !== false,
    helper: '关闭后停在最后看到的位置',
    onChange: (v) => saveChatPrefs(ownerId, { autoScroll: v })
  }));

  // 回车发送
  content.appendChild(makeToggle({
    label: '按回车发送',
    value: p.enterToSend !== false,
    helper: '关闭后回车换行，发送需点按钮',
    onChange: (v) => saveChatPrefs(ownerId, { enterToSend: v })
  }));

  // 显示思维链
  content.appendChild(makeToggle({
    label: '显示 AI 思维链',
    value: p.showThinking !== false,
    helper: 'AI 思考过程的折叠区域',
    onChange: (v) => saveChatPrefs(ownerId, { showThinking: v })
  }));

  // 显示打字提示
  content.appendChild(makeToggle({
    label: '显示"正在输入"提示',
    value: p.showTyping !== false,
    helper: 'AI 回复前的呼吸气泡',
    onChange: (v) => saveChatPrefs(ownerId, { showTyping: v })
  }));

  // 显示流式光标
  content.appendChild(makeToggle({
    label: '显示流式光标',
    value: p.showCursor !== false,
    helper: 'AI 边说边显示的小光标',
    onChange: (v) => saveChatPrefs(ownerId, { showCursor: v })
  }));

  // 自动播放对方语音
  content.appendChild(makeToggle({
    label: '自动播放对方语音',
    value: !!p.autoPlayVoice,
    helper: '收到语音消息自动播放',
    onChange: (v) => saveChatPrefs(ownerId, { autoPlayVoice: v })
  }));

  // 双击点赞
  content.appendChild(makeToggle({
    label: '双击消息点赞',
    value: p.quickLike !== false,
    helper: '双击气泡增加好感度',
    onChange: (v) => saveChatPrefs(ownerId, { quickLike: v })
  }));

  // 恢复默认
  content.appendChild(makeButton({
    label: '恢复默认偏好', icon: 'refresh', variant: 'ghost', block: true,
    onClick: () => {
      saveChatPrefs(ownerId, {
        fontSize: 'medium', chatMode: 'bubble',
        autoScroll: true, enterToSend: true, showThinking: true,
        showTyping: true, showCursor: true, autoPlayVoice: false, quickLike: true
      });
      applyFontSize('medium');
      showToast('偏好已恢复默认', 'default', 1200);
    }
  }));

  const card = createCollapsibleCard('聊天偏好', content, {
    collapsed: true,
    icon: 'sliders',
    subtitle: `${p.fontSize || '中'} · ${p.chatMode === 'dialog' ? '对话' : '气泡'}`
  });
  section.appendChild(card);
  return section;
}

// 把字号应用到消息列表（通过 CSS 变量）
function applyFontSize(size) {
  try {
    const el = document.querySelector('.chat-messages');
    if (el) {
      const map = { small: '14px', medium: '16px', large: '18px' };
      el.style.setProperty('--chat-font-size', map[size] || '16px');
    }
  } catch (e) {}
}
