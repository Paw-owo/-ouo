// apps/chat/chat-settings/profile-group.js
// 「角色资料」分组——编辑当前角色的名字、昵称、头像、人设、标签。
// 仅私聊设置页使用；群聊设置页用 group-settings-view.js 自己的资料区。
// 红线：图标只准 SVG 线稿，禁止任何 emoji 字符。
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, ./widgets.js

import { STORES } from '../../../core/storage-keys.js';
import { getDB, setDB } from '../../../core/storage.js';
import { showToast, createCollapsibleCard } from '../../../core/ui.js';
import {
  makeField, makeInput, makeTextarea, makeButton, makeAvatarPicker,
  makeHintBar, makeBadge, makeSection, makeSectionTitle
} from './widgets.js';
import { escapeHTML } from '../shared-utils.js';

/**
 * 构建「角色资料」分组。
 * @param {object} ctx
 * @param {object} ctx.character 当前角色对象（已从 DB 读出）
 * @param {object} ctx.session 当前会话
 * @param {(patch:object)=>void} ctx.onCharacterChange 角色字段变更回调
 * @returns {HTMLElement}
 */
export function buildProfileGroup(ctx) {
  const { character, onCharacterChange } = ctx;
  const section = makeSection();
  section.appendChild(makeSectionTitle('角色资料'));

  if (!character) {
    section.appendChild(makeHintBar('还没读到角色资料，先去角色 App 里建一个嘛'));
    return section;
  }

  // 内容容器
  const content = document.createElement('div');

  // 头像
  content.appendChild(makeField({
    label: '头像',
    stacked: true,
    control: makeAvatarPicker(character.avatar || '', (newAvatar) => {
      saveCharacterField(character, { avatar: newAvatar || '' });
      onCharacterChange?.({ avatar: newAvatar || '' });
    })
  }));

  // 名字（主显示名）
  content.appendChild(makeInput({
    label: '名字',
    value: character.name || '',
    placeholder: '给她起个名字吧',
    stacked: true,
    onChange: (v) => {
      saveCharacterField(character, { name: v });
      onCharacterChange?.({ name: v });
    }
  }));

  // 昵称（备选称呼）
  content.appendChild(makeInput({
    label: '昵称',
    value: character.nickname || '',
    placeholder: '小名、爱称都可以',
    stacked: true,
    helper: '你叫她的小名，对话里会更亲切',
    onChange: (v) => {
      saveCharacterField(character, { nickname: v });
      onCharacterChange?.({ nickname: v });
    }
  }));

  // 人设
  content.appendChild(makeTextarea({
    label: '人设',
    value: character.persona || '',
    placeholder: '描写她的性格、背景、说话方式...',
    rows: 5,
    helper: '越细致她越立体，但别写得太长哦',
    onChange: (v) => {
      saveCharacterField(character, { persona: v });
      onCharacterChange?.({ persona: v });
    }
  }));

  // 开场白
  content.appendChild(makeTextarea({
    label: '开场白',
    value: character.greeting || '',
    placeholder: '她见到你说的第一句话',
    rows: 2,
    onChange: (v) => {
      saveCharacterField(character, { greeting: v });
      onCharacterChange?.({ greeting: v });
    }
  }));

  // 标签（tags 数组 -> 逗号分隔输入）
  const tagsStr = Array.isArray(character.tags) ? character.tags.join(', ') : '';
  content.appendChild(makeInput({
    label: '标签',
    value: tagsStr,
    placeholder: '温柔, 傲娇, 学姐...',
    stacked: true,
    helper: '用逗号隔开，方便分类和搜索',
    onChange: (v) => {
      const tags = String(v || '').split(/[,，]/).map((t) => t.trim()).filter(Boolean);
      saveCharacterField(character, { tags });
      onCharacterChange?.({ tags });
    }
  }));

  // 状态徽标
  const badgeRow = document.createElement('div');
  badgeRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;padding:4px 0;';
  badgeRow.appendChild(makeBadge(`ID: ${character.id?.slice(0, 10) || '—'}`));
  if (character.createdAt) {
    const d = new Date(character.createdAt);
    if (!isNaN(d.getTime())) {
      badgeRow.appendChild(makeBadge(`创建于 ${d.toLocaleDateString()}`));
    }
  }
  content.appendChild(badgeRow);

  // 折叠卡片包装（默认展开，因为是核心资料）
  const card = createCollapsibleCard('角色资料', content, {
    collapsed: false,
    icon: 'smile',
    subtitle: character.name || character.nickname || '未命名'
  });
  section.appendChild(card);
  return section;
}

// 写回角色字段到 DB
async function saveCharacterField(character, patch) {
  try {
    const cur = await getDB(STORES.characters, character.id);
    if (!cur) {
      showToast('角色资料没存到，再试一下嘛', 'error');
      return;
    }
    await setDB(STORES.characters, character.id, { ...cur, ...patch, updatedAt: Date.now() });
    // 不 toast，避免每次输入都弹
  } catch (e) {
    console.warn('[chat-settings] 保存角色字段失败', e);
    showToast('保存出错了，再试一下嘛', 'error');
  }
}
