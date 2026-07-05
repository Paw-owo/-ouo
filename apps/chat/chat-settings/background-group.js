// apps/chat/chat-settings/background-group.js
// 「聊天背景」分组——为当前会话设置背景图与透明度，或恢复默认。
// 红线：图标只准 SVG 线稿，禁止任何 emoji 字符。
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, ./widgets.js, ../index.js

import { STORES } from '../../core/storage-keys.js';
import { getDB, setDB, compressImage } from '../../core/storage.js';
import { createCollapsibleCard, showToast, showConfirm } from '../../core/ui.js';
import { pickImageFile, isUsableImage, cssUrl } from '../../core/util.js';
import bus from '../../core/events.js';
import {
  makeField, makeButton, makeSlider, makeHintBar, makeBadge,
  makeSection, makeSectionTitle
} from './widgets.js';

/**
 * 构建「聊天背景」分组。
 * @param {object} ctx { session, scope, groupId, onBackgroundChange }
 * @returns {HTMLElement}
 */
export function buildBackgroundGroup(ctx) {
  const { session, onBackgroundChange } = ctx;
  const section = makeSection();
  section.appendChild(makeSectionTitle('聊天背景'));

  if (!session) {
    section.appendChild(makeHintBar('还没有打开会话呢'));
    return section;
  }

  const wp = session.wallpaper || { url: '', opacity: 60 };
  const content = document.createElement('div');

  // 预览
  const previewWrap = document.createElement('div');
  previewWrap.style.cssText = 'position:relative;width:100%;height:120px;border-radius:12px;overflow:hidden;background:var(--bg-base,#e5e5ea);margin-bottom:8px;';
  const previewInner = document.createElement('div');
  previewInner.style.cssText = 'position:absolute;inset:0;background:#fff;';
  previewWrap.appendChild(previewInner);
  const previewBg = document.createElement('div');
  previewBg.style.cssText = 'position:absolute;inset:0;background-size:cover;background-position:center;';
  previewWrap.appendChild(previewBg);
  const applyPreview = (url, opacity) => {
    if (url && isUsableImage(url)) {
      previewBg.style.backgroundImage = cssUrl(url);
      previewBg.style.opacity = String(clamp01((opacity ?? 60) / 100));
      previewInner.style.display = 'none';
    } else {
      previewBg.style.backgroundImage = '';
      previewInner.style.display = '';
      previewInner.style.background = 'linear-gradient(135deg, var(--bg-base,#e5e5ea), var(--bg-card,#fff))';
    }
  };
  applyPreview(wp.url, wp.opacity);
  content.appendChild(previewWrap);

  // 选图按钮行
  const btnRow = document.createElement('div');
  btnRow.className = 'cs-btn-row';
  btnRow.appendChild(makeButton({
    label: '从相册选', icon: 'image',
    onClick: async () => {
      try {
        const file = await pickImageFile('image/*');
        const dataUrl = await compressImage(file, { quality: 0.82, maxWidth: 1620, maxHeight: 1620 });
        await saveWallpaper(session, { url: dataUrl });
        applyPreview(dataUrl, wp.opacity);
        onBackgroundChange?.();
        showToast('背景换好啦', 'success', 1200);
      } catch (e) {
        if (e && e.message && /cancel|abort/i.test(e.message)) return;
        console.warn('[chat-settings] 选背景失败', e);
        showToast('图片没选好嘛，再试一下', 'error');
      }
    }
  }));
  btnRow.appendChild(makeButton({
    label: '恢复默认', icon: 'refresh', variant: 'ghost',
    onClick: async () => {
      showConfirm({
        title: '恢复默认背景吗？',
        body: '当前的背景图会被清掉哦',
        confirmText: '恢复吧',
        cancelText: '不要',
        onConfirm: async () => {
          await saveWallpaper(session, { url: '' });
          applyPreview('', 60);
          onBackgroundChange?.();
          showToast('已恢复默认', 'default', 1200);
        }
      });
    }
  }));
  content.appendChild(btnRow);

  // 透明度滑块
  content.appendChild(makeSlider({
    label: '背景透明度',
    value: wp.opacity ?? 60,
    min: 0, max: 100, step: 5,
    helper: '越小越淡，越大越显眼',
    format: (v) => `${v}%`,
    onChange: async (v) => {
      applyPreview(wp.url, v);
      await saveWallpaper(session, { opacity: v });
      onBackgroundChange?.();
    }
  }));

  // 状态徽标
  const badgeRow = document.createElement('div');
  badgeRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;padding:4px 0;';
  badgeRow.appendChild(makeBadge(wp.url ? '已设背景' : '默认背景', wp.url ? 'success' : 'default'));
  if (wp.url) {
    badgeRow.appendChild(makeBadge(`透明度 ${wp.opacity ?? 60}%`));
  }
  content.appendChild(badgeRow);

  const card = createCollapsibleCard('聊天背景', content, {
    collapsed: true,
    icon: 'palette',
    subtitle: wp.url ? '自定义' : '默认'
  });
  section.appendChild(card);
  return section;
}

// 写回 session.wallpaper
async function saveWallpaper(session, patch) {
  try {
    const cur = await getDB(STORES.chatSessions, session.id) || session;
    const nextWp = { ...(cur.wallpaper || {}), ...patch };
    await setDB(STORES.chatSessions, session.id, { ...cur, wallpaper: nextWp });
    // 通知聊天页重新应用壁纸
    bus.emit('chat:wallpaper-changed', { sessionId: session.id, wallpaper: nextWp });
  } catch (e) {
    console.warn('[chat-settings] 保存背景失败', e);
    showToast('背景没存上，再试一下嘛', 'error');
  }
}

function clamp01(v) {
  if (isNaN(v)) return 0.6;
  return Math.max(0, Math.min(1, v));
}
