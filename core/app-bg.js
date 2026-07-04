// core/app-bg.js
// APP 背景自定义统一层。每个 App 在 mount 末尾调用 applyAppBg(container, appId)，
// 即可应用用户在设置里为该 App 配置的背景。
// 职责：
//   1) 读写每个 App 的背景配置 {url, opacity}
//   2) applyAppBg 在容器内插入/更新背景层 + 遮罩层
//   3) 清除背景
// 依赖：core/storage-keys.js, core/storage.js, core/util.js
// 红线：不硬编码颜色，遮罩用 var(--bg-primary)。

import { KEYS } from './storage-keys.js';
import { getData, setData } from './storage.js';
import { isUsableImage, cssUrl } from './util.js';

const BG_LAYER_CLASS = 'app-bg-layer';
const BG_OVERLAY_CLASS = 'app-bg-overlay';

/**
 * 取某 App 的背景配置
 * @param {string} appId
 * @returns {{url:string, opacity:number}|null}
 */
export function getAppBg(appId) {
  const all = getData(KEYS.appAppBackgrounds, {});
  const cfg = all?.[appId];
  if (!cfg || !cfg.url) return null;
  return { url: cfg.url, opacity: Number(cfg.opacity ?? 60) };
}

/**
 * 保存某 App 的背景配置
 * @param {string} appId
 * @param {{url:string, opacity:number}} cfg
 */
export function saveAppBg(appId, cfg) {
  const all = getData(KEYS.appAppBackgrounds, {});
  all[appId] = { url: cfg.url || '', opacity: Number(cfg.opacity ?? 60) };
  setData(KEYS.appAppBackgrounds, all);
}

/** 清除某 App 背景 */
export function clearAppBg(appId) {
  const all = getData(KEYS.appAppBackgrounds, {});
  delete all[appId];
  setData(KEYS.appAppBackgrounds, all);
}

/** 列出所有已配置背景的 App */
export function listAppBgs() {
  const all = getData(KEYS.appAppBackgrounds, {});
  return Object.keys(all).map((id) => ({ appId: id, ...all[id] }));
}

/**
 * 在容器内应用背景。在 App mount 渲染完内容后调用。
 * 会插入两个绝对定位层：背景图 + 遮罩，并把内容层提到 z-index:1。
 * @param {HTMLElement} container
 * @param {string} appId
 */
export function applyAppBg(container, appId) {
  if (!container) return;
  // 先清旧层
  container.querySelectorAll(`.${BG_LAYER_CLASS}, .${BG_OVERLAY_CLASS}`).forEach((el) => el.remove());
  const cfg = getAppBg(appId);
  if (!cfg || !isUsableImage(cfg.url)) {
    container.style.background = '';
    return;
  }
  const userOpacity = Math.max(0, Math.min(100, cfg.opacity));
  const maskOpacity = (100 - userOpacity) / 100; // 0=壁纸全显，1=壁纸被完全遮住

  // 背景图层
  const bg = document.createElement('div');
  bg.className = BG_LAYER_CLASS;
  bg.setAttribute('aria-hidden', 'true');
  bg.style.cssText = `position:absolute;inset:0;background-image:url("${cssUrl(cfg.url)}");background-size:cover;background-position:center;z-index:0;pointer-events:none;`;
  // 遮罩层（用主题背景色，保证文字可读）
  const overlay = document.createElement('div');
  overlay.className = BG_OVERLAY_CLASS;
  overlay.setAttribute('aria-hidden', 'true');
  overlay.style.cssText = `position:absolute;inset:0;background:var(--bg-primary);opacity:${maskOpacity};z-index:0;pointer-events:none;`;

  container.style.position = container.style.position || 'relative';
  container.insertBefore(overlay, container.firstChild);
  container.insertBefore(bg, overlay);

  // 把直接子元素提到 z-index:1（不动 App 内部结构）
  Array.from(container.children).forEach((child) => {
    if (child !== bg && child !== overlay) {
      const cur = getComputedStyle(child).position;
      if (cur === 'static') child.style.position = 'relative';
      child.style.zIndex = '1';
    }
  });
}
