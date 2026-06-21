/* core/ui.js - 公共 UI 组件层
   所有弹窗、抽屉、提示、图标、折叠面板都从这里走
   保证视觉和 style.css 的奶油手绘主题一致，不让各应用割裂 */

import { getImage, uploadImage } from './storage.js';

/* ============ DOM 工具 ============ */

export function $(selector, root = document) {
  return root.querySelector(selector);
}

export function $$(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);

  Object.entries(attrs).forEach(([key, value]) => {
    if (value === null || value === undefined || value === false) return;

    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else {
      node.setAttribute(key, value);
    }
  });

  const list = Array.isArray(children) ? children : [children];
  list.forEach((child) => {
    if (child === null || child === undefined || child === false) return;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  });

  return node;
}

export function clear(node) {
  if (node) node.innerHTML = '';
}

export function mount(root, content) {
  clear(root);
  root.appendChild(content);
}

export function escapeHTML(str = '') {
  return String(str).replace(/[&<>"']/g, (s) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[s]));
}

/* ============ Toast ============ */

let toastTimer = null;

export function toast(message, duration = 1800) {
  let box = $('#app-toast');
  if (!box) {
    box = el('div', { id: 'app-toast', class: 'app-toast' });
    document.body.appendChild(box);
  }

  box.textContent = message;
  box.classList.add('show');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove('show'), duration);
}

/* ============ 遮罩 ============ */

function getOverlay() {
  let overlay = $('#global-overlay');
  if (!overlay) {
    overlay = el('div', { id: 'global-overlay', class: 'overlay' });
    document.body.appendChild(overlay);
  }
  return overlay;
}

function showOverlay(onClick) {
  const overlay = getOverlay();
  overlay.classList.add('active');
  overlay.onclick = onClick || null;
  return overlay;
}

function hideOverlay() {
  const overlay = getOverlay();
  overlay.classList.remove('active');
  overlay.onclick = null;
}

/* ============ 底部抽屉 ============ */

let activeDrawer = null;

export function openDrawer({
  title = '',
  content = '',
  height = '',
  closeOnOverlay = true,
  onClose = null,
} = {}) {
  closeDrawer();

  const drawer = el('section', {
    class: 'drawer active',
    style: height ? { maxHeight: height } : {},
  });

  const handle = el('div', { class: 'drawer-handle' });

  const head = el('div', { class: 'drawer-head' }, [
    el('div', { class: 'drawer-title', text: title }),
    el('button', {
      class: 'drawer-close',
      type: 'button',
      html: icon('close'),
      onclick: () => closeDrawer(),
      'aria-label': '关闭',
    }),
  ]);

  const body = el('div', { class: 'drawer-content' });
  if (typeof content === 'string') body.innerHTML = content;
  else body.appendChild(content);

  drawer.append(handle, head, body);
  document.body.appendChild(drawer);

  activeDrawer = { node: drawer, onClose };
  showOverlay(closeOnOverlay ? () => closeDrawer() : null);

  requestAnimationFrame(() => drawer.classList.add('active'));
  return drawer;
}

export function closeDrawer() {
  if (!activeDrawer) return;

  const { node, onClose } = activeDrawer;
  node.classList.remove('active');
  hideOverlay();

  setTimeout(() => {
    node.remove();
    onClose?.();
  }, 260);

  activeDrawer = null;
}

/* ============ 半屏浮层 ============ */

let activeSheet = null;

export function openSheet({
  title = '',
  content = '',
  closeOnOverlay = true,
  onClose = null,
} = {}) {
  closeSheet();

  const sheet = el('section', { class: 'sheet-panel glass' });

  const head = el('div', { class: 'sheet-head' }, [
    el('button', {
      class: 'sheet-back',
      type: 'button',
      html: icon('back'),
      onclick: () => closeSheet(),
      'aria-label': '返回',
    }),
    el('div', { class: 'sheet-title', text: title }),
    el('div', { class: 'sheet-spacer' }),
  ]);

  const body = el('div', { class: 'sheet-content' });
  if (typeof content === 'string') body.innerHTML = content;
  else body.appendChild(content);

  sheet.append(head, body);
  document.body.appendChild(sheet);

  activeSheet = { node: sheet, onClose };
  showOverlay(closeOnOverlay ? () => closeSheet() : null);

  requestAnimationFrame(() => sheet.classList.add('active'));
  return sheet;
}

export function closeSheet() {
  if (!activeSheet) return;

  const { node, onClose } = activeSheet;
  node.classList.remove('active');
  hideOverlay();

  setTimeout(() => {
    node.remove();
    onClose?.();
  }, 260);

  activeSheet = null;
}

/* ============ 模态弹窗 / 确认框 ============ */

let activeModal = null;

export function openModal({
  title = '',
  content = '',
  actions = [],
  closeOnOverlay = true,
  onClose = null,
} = {}) {
  closeModal();

  const modal = el('section', { class: 'modal active' });

  if (title) modal.appendChild(el('div', { class: 'modal-header', text: title }));

  const body = el('div', { class: 'modal-body' });
  if (typeof content === 'string') body.innerHTML = content;
  else body.appendChild(content);
  modal.appendChild(body);

  if (actions.length) {
    const footer = el('div', { class: 'modal-footer' });
    actions.forEach((action) => {
      footer.appendChild(el('button', {
        class: action.primary ? 'btn btn-primary' : 'btn btn-secondary',
        type: 'button',
        text: action.text,
        onclick: () => {
          const keep = action.onClick?.();
          if (!keep) closeModal();
        },
      }));
    });
    modal.appendChild(footer);
  }

  document.body.appendChild(modal);
  activeModal = { node: modal, onClose };
  showOverlay(closeOnOverlay ? () => closeModal() : null);

  requestAnimationFrame(() => modal.classList.add('active'));
  return modal;
}

export function closeModal() {
  if (!activeModal) return;

  const { node, onClose } = activeModal;
  node.classList.remove('active');
  hideOverlay();

  setTimeout(() => {
    node.remove();
    onClose?.();
  }, 220);

  activeModal = null;
}

export function confirmBox(message, title = '确认') {
  return new Promise((resolve) => {
    openModal({
      title,
      content: el('p', { text: message }),
      actions: [
        { text: '取消', onClick: () => resolve(false) },
        { text: '确认', primary: true, onClick: () => resolve(true) },
      ],
      onClose: () => resolve(false),
    });
  });
}

/* ============ 文件选择 ============ */

export function pickFile({ accept = '*/*', multiple = false } = {}) {
  return new Promise((resolve) => {
    const input = el('input', {
      type: 'file',
      accept,
      multiple: multiple ? 'multiple' : null,
      style: { display: 'none' },
    });

    input.onchange = () => {
      const files = Array.from(input.files || []);
      input.remove();
      resolve(multiple ? files : files[0] || null);
    };

    document.body.appendChild(input);
    input.click();
  });
}

export async function pickAndUploadImage() {
  const file = await pickFile({ accept: 'image/*' });
  if (!file) return '';
  return await uploadImage(file);
}

/* ============ 图片节点 ============ */

export async function imageNode(imageId, className = '') {
  const img = el('img', { class: className, alt: '' });
  const data = await getImage(imageId);
  if (data) img.src = data;
  return img;
}

/* ============ 导入 / 导出 ============ */

export function downloadFile(filename, content, type = 'application/json;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

/* ============ 折叠面板 ============ */

export function accordionItem({
  title,
  subtitle = '',
  content,
  open = false,
  singleGroup = null,
} = {}) {
  const body = el('div', { class: 'accordion-body' });
  if (typeof content === 'string') body.innerHTML = content;
  else if (content) body.appendChild(content);

  const item = el('section', { class: open ? 'accordion-item open' : 'accordion-item' });

  const head = el('button', {
    class: 'accordion-head',
    type: 'button',
    onclick: () => {
      if (singleGroup) {
        $$('.accordion-item.open', singleGroup).forEach((node) => {
          if (node !== item) node.classList.remove('open');
        });
      }
      item.classList.toggle('open');
    },
  }, [
    el('div', { class: 'accordion-text' }, [
      el('div', { class: 'accordion-title', text: title }),
      subtitle ? el('div', { class: 'accordion-subtitle', text: subtitle }) : null,
    ]),
    el('span', { class: 'accordion-arrow', html: icon('chevron') }),
  ]);

  item.append(head, body);
  return item;
}

/* ============ 表单组件 ============ */

export function field(label, input, hint = '') {
  return el('label', { class: 'form-field' }, [
    el('span', { class: 'form-label', text: label }),
    input,
    hint ? el('small', { class: 'form-hint', text: hint }) : null,
  ]);
}

export function textInput({
  value = '',
  placeholder = '',
  type = 'text',
  onInput = null,
} = {}) {
  return el('input', {
    type,
    value,
    placeholder,
    oninput: (e) => onInput?.(e.target.value, e),
  });
}

export function textArea({
  value = '',
  placeholder = '',
  rows = 4,
  onInput = null,
} = {}) {
  return el('textarea', {
    rows,
    placeholder,
    text: value,
    oninput: (e) => onInput?.(e.target.value, e),
  });
}

export function selectInput({
  value = '',
  options = [],
  onChange = null,
} = {}) {
  const select = el('select', {
    class: 'select-input',
    onchange: (e) => onChange?.(e.target.value, e),
  });

  options.forEach((opt) => {
    const item = typeof opt === 'string' ? { label: opt, value: opt } : opt;
    select.appendChild(el('option', {
      value: item.value,
      text: item.label,
      selected: item.value === value,
    }));
  });

  return select;
}

export function switchInput(checked = false, onChange = null) {
  const input = el('input', { type: 'checkbox', checked: checked ? 'checked' : null });
  const wrap = el('label', { class: 'switch' }, [
    input,
    el('span', { class: 'switch-slider' }),
  ]);

  input.addEventListener('change', () => onChange?.(input.checked));
  return wrap;
}

/* ============ 应用图标 SVG ============ */

export function icon(name, size = 24) {
  const paths = ICONS[name] || ICONS.star;
  return `
    <svg class="svg-icon svg-icon-${name}" width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" aria-hidden="true">
      ${paths}
    </svg>
  `;
}

export function appIcon(appId, size = 72) {
  const iconName = APP_ICON_MAP[appId] || 'star';
  return `
    <svg class="app-svg app-svg-${appId}" width="${size}" height="${size}" viewBox="0 0 96 96" fill="none" aria-hidden="true">
      ${APP_ICONS[iconName] || APP_ICONS.star}
    </svg>
  `;
}

export function createAppIconNode(app, {
  unread = 0,
  draggable = true,
  onClick = null,
} = {}) {
  const node = el('button', {
    class: 'desktop-icon',
    type: 'button',
    'data-app-id': app.id,
    onclick: onClick,
  });

  node.innerHTML = `
    <span class="desktop-icon-art">${appIcon(app.id)}</span>
    <span class="desktop-icon-name">${escapeHTML(app.name)}</span>
    ${unread > 0 ? `<span class="badge">${unread > 99 ? '99+' : unread}</span>` : ''}
  `;

  if (draggable) node.dataset.draggable = 'true';
  return node;
}

/* ============ 应用名称 ============ */

export const APP_NAMES = {
  chat: '消息',
  moments: '朋友圈',
  characters: '角色管理',
  worldbook: '世界书',
  games: '小游戏',
  shop: '商店',
  wallet: '钱包',
  memo: '备忘录',
  anniversary: '纪念日',
  settings: '设置',
};

/* ============ 小图标（线条风格） ============ */

const ICONS = {
  back: `
    <path d="M40 14L22 32L40 50" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
  `,
  close: `
    <path d="M20 20L44 44M44 20L20 44" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
  `,
  chevron: `
    <path d="M24 20L40 32L24 44" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  `,
  plus: `
    <path d="M32 16V48M16 32H48" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
  `,
  search: `
    <circle cx="28" cy="28" r="14" stroke="currentColor" stroke-width="4"/>
    <path d="M39 39L50 50" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
  `,
  more: `
    <circle cx="20" cy="32" r="3.5" fill="currentColor"/>
    <circle cx="32" cy="32" r="3.5" fill="currentColor"/>
    <circle cx="44" cy="32" r="3.5" fill="currentColor"/>
  `,
  send: `
    <path d="M14 34L50 16L42 50L32 38L14 34Z" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M32 38L50 16" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>
  `,
  mic: `
    <rect x="24" y="12" width="16" height="28" rx="8" stroke="currentColor" stroke-width="4"/>
    <path d="M16 30C16 39 23 46 32 46C41 46 48 39 48 30" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
    <path d="M32 46V54" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
  `,
  phone: `
    <path d="M22 14L30 24L25 30C28 36 33 41 40 44L46 39L56 47C57 48 57 50 56 52C53 56 49 58 45 57C25 52 11 38 7 19C6 15 8 11 12 8C14 7 16 7 17 9L22 14Z" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round"/>
  `,
  star: `
    <path d="M32 10L38 25L54 26L42 37L46 53L32 44L18 53L22 37L10 26L26 25L32 10Z" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round"/>
  `,
};

/* ============ 桌面应用手绘 SVG ============ */

const APP_ICON_MAP = {
  chat: 'chat',
  moments: 'moments',
  characters: 'characters',
  worldbook: 'worldbook',
  games: 'games',
  shop: 'shop',
  wallet: 'wallet',
  memo: 'memo',
  anniversary: 'anniversary',
  settings: 'settings',
};

const APP_ICONS = {
  chat: `
    <path d="M22 28C22 18 31 12 44 12C57 12 66 19 66 29C66 39 57 46 44 46C41 46 38 46 35 45L23 52L27 42C24 38 22 34 22 28Z" fill="#FFF9F0"/>
    <path d="M22 28C22 18 31 12 44 12C57 12 66 19 66 29C66 39 57 46 44 46C41 46 38 46 35 45L23 52L27 42C24 38 22 34 22 28Z" stroke="#B8937A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M34 29H54M35 36H48" stroke="#D9A7A0" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M24 58C17 55 12 49 12 41C12 35 15 30 20 27" stroke="#E6C7A8" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M66 45C70 42 72 38 72 33" stroke="#E6C7A8" stroke-width="2.2" stroke-linecap="round"/>
  `,
  moments: `
    <rect x="18" y="22" width="60" height="44" rx="14" fill="#FFF9F0"/>
    <rect x="18" y="22" width="60" height="44" rx="14" stroke="#B8937A" stroke-width="2.2"/>
    <path d="M31 22L36 15H51L56 22" stroke="#B8937A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="48" cy="44" r="12" fill="#F8DED3" stroke="#B8937A" stroke-width="2.2"/>
    <circle cx="68" cy="31" r="3" fill="#D9A7A0"/>
    <path d="M39 44C42 39 48 37 53 40" stroke="#FFF9F0" stroke-width="2.2" stroke-linecap="round"/>
  `,
  characters: `
    <path d="M48 15C58 15 66 23 66 33C66 43 58 51 48 51C38 51 30 43 30 33C30 23 38 15 48 15Z" fill="#FFF9F0" stroke="#B8937A" stroke-width="2.2"/>
    <path d="M25 72C29 61 38 56 48 56C58 56 67 61 71 72" stroke="#B8937A" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M39 34C41 36 43 36 45 34M51 34C53 36 55 36 57 34" stroke="#D9A7A0" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M43 41C46 44 50 44 53 41" stroke="#B8937A" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M30 29C26 26 24 22 26 18C31 20 34 22 36 25" stroke="#E6C7A8" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M66 29C70 26 72 22 70 18C65 20 62 22 60 25" stroke="#E6C7A8" stroke-width="2.2" stroke-linecap="round"/>
  `,
  worldbook: `
    <path d="M25 18H46C51 18 55 22 55 27V73H31C27 73 23 70 23 66V20C23 19 24 18 25 18Z" fill="#FFF9F0" stroke="#B8937A" stroke-width="2.2"/>
    <path d="M55 27C55 22 59 18 64 18H71C72 18 73 19 73 20V66C73 70 69 73 65 73H55V27Z" fill="#FFF4E6" stroke="#B8937A" stroke-width="2.2"/>
    <path d="M34 31H45M34 40H47M34 49H43" stroke="#D9A7A0" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M62 31H68M62 40H68M62 49H66" stroke="#D9A7A0" stroke-width="2.2" stroke-linecap="round"/>
  `,
  games: `
    <path d="M25 37C28 29 35 27 43 31H53C61 27 68 29 71 37L76 54C78 61 74 67 68 67C63 67 60 63 57 59H39C36 63 33 67 28 67C22 67 18 61 20 54L25 37Z" fill="#FFF9F0" stroke="#B8937A" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M35 41V53M29 47H41" stroke="#D9A7A0" stroke-width="2.2" stroke-linecap="round"/>
    <circle cx="60" cy="43" r="3" fill="#D9A7A0"/>
    <circle cx="67" cy="51" r="3" fill="#E6C7A8"/>
    <path d="M45 31C45 27 51 27 51 31" stroke="#B8937A" stroke-width="2.2" stroke-linecap="round"/>
  `,
  shop: `
    <path d="M25 31H71L67 75H29L25 31Z" fill="#FFF9F0" stroke="#B8937A" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M36 31C36 21 60 21 60 31" stroke="#B8937A" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M39 47C42 51 45 53 48 53C51 53 54 51 57 47" stroke="#D9A7A0" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M31 40H65" stroke="#E6C7A8" stroke-width="2.2" stroke-linecap="round"/>
  `,
  wallet: `
    <rect x="20" y="28" width="56" height="38" rx="12" fill="#FFF9F0" stroke="#B8937A" stroke-width="2.2"/>
    <path d="M24 31L58 20C62 19 66 21 67 25L68 28" stroke="#B8937A" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M58 43H76V56H58C54 56 51 53 51 49.5C51 46 54 43 58 43Z" fill="#F8DED3" stroke="#B8937A" stroke-width="2.2"/>
    <circle cx="60" cy="49.5" r="2.5" fill="#B8937A"/>
  `,
  memo: `
    <rect x="27" y="17" width="44" height="60" rx="10" fill="#FFF9F0" stroke="#B8937A" stroke-width="2.2"/>
    <path d="M37 31H60M37 42H59M37 53H54" stroke="#D9A7A0" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M23 30H31M23 42H31M23 54H31" stroke="#B8937A" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M61 17V27H71" stroke="#E6C7A8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  `,
  anniversary: `
    <rect x="22" y="22" width="52" height="50" rx="12" fill="#FFF9F0" stroke="#B8937A" stroke-width="2.2"/>
    <path d="M22 36H74" stroke="#E6C7A8" stroke-width="2.2"/>
    <path d="M35 17V27M61 17V27" stroke="#B8937A" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M48 48C51 43 60 45 60 52C60 60 48 65 48 65C48 65 36 60 36 52C36 45 45 43 48 48Z" fill="#F8DED3" stroke="#D9A7A0" stroke-width="2.2" stroke-linejoin="round"/>
  `,
  settings: `
    <circle cx="48" cy="48" r="10" fill="#FFF9F0" stroke="#B8937A" stroke-width="2.2"/>
    <path d="M48 18L54 23L62 21L66 29L63 36L69 42V54L63 60L66 67L62 75L54 73L48 78L42 73L34 75L30 67L33 60L27 54V42L33 36L30 29L34 21L42 23L48 18Z" stroke="#B8937A" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M48 38C53 38 58 43 58 48" stroke="#D9A7A0" stroke-width="2.2" stroke-linecap="round"/>
  `,
  star: `
    <path d="M48 18L56 38L77 39L61 53L66 74L48 62L30 74L35 53L19 39L40 38L48 18Z" fill="#FFF9F0" stroke="#B8937A" stroke-width="2.2" stroke-linejoin="round"/>
  `,
};

/* ============ 需要配套的动态样式 ============ */

const UI_STYLE_ID = 'core-ui-style';

export function injectUIStyles() {
  if ($(`#${UI_STYLE_ID}`)) return;

  const style = el('style', { id: UI_STYLE_ID });
  style.textContent = `
    .app-toast {
      position: fixed;
      left: 50%;
      bottom: 110px;
      transform: translateX(-50%) translateY(10px);
      max-width: 78vw;
      padding: 10px 16px;
      border-radius: 999px;
      background: var(--glass-bg);
      backdrop-filter: var(--glass-blur);
      -webkit-backdrop-filter: var(--glass-blur);
      color: var(--text-primary);
      box-shadow: var(--shadow-md);
      font-size: var(--font-size-small);
      opacity: 0;
      pointer-events: none;
      transition: all 200ms ease;
      z-index: 2000;
      white-space: nowrap;
    }
    .app-toast.show {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
    .drawer-head,
    .sheet-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px 20px 12px;
      flex-shrink: 0;
    }
    .drawer-title,
    .sheet-title {
      font-size: var(--font-size-title);
      font-weight: 600;
      color: var(--text-primary);
    }
    .drawer-close,
    .sheet-back {
      width: 36px;
      height: 36px;
      border: none;
      background: transparent;
      color: var(--text-primary);
      border-radius: 50%;
      display: grid;
      place-items: center;
      transition: all 200ms ease;
    }
    .drawer-close:active,
    .sheet-back:active {
      transform: scale(0.96);
      background: var(--bg-secondary);
    }
    .sheet-panel {
      position: fixed;
      left: 12px;
      right: 12px;
      bottom: 12px;
      height: 72vh;
      border-radius: var(--radius-xl);
      box-shadow: var(--shadow-lg);
      transform: translateY(105%);
      opacity: 0;
      transition: all 280ms cubic-bezier(0.4, 0, 0.2, 1);
      z-index: 1000;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .sheet-panel.active {
      transform: translateY(0);
      opacity: 1;
    }
    .sheet-content {
      flex: 1;
      overflow-y: auto;
      padding: 0 20px 20px;
    }
    .sheet-spacer {
      width: 36px;
    }
    .accordion-item {
      background: var(--bg-card);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-sm);
      margin-bottom: 12px;
      overflow: hidden;
    }
    .accordion-head {
      width: 100%;
      min-height: 60px;
      padding: 14px 16px;
      border: none;
      background: transparent;
      color: var(--text-primary);
      display: flex;
      align-items: center;
      justify-content: space-between;
      text-align: left;
      transition: all 200ms ease;
    }
    .accordion-head:active {
      transform: scale(0.98);
    }
    .accordion-title {
      font-size: var(--font-size-base);
      font-weight: 600;
    }
    .accordion-subtitle {
      margin-top: 2px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.4;
    }
    .accordion-arrow {
      color: var(--text-secondary);
      transition: transform 200ms ease;
    }
    .accordion-item.open .accordion-arrow {
      transform: rotate(90deg);
    }
    .accordion-body {
      display: none;
      padding: 0 16px 16px;
    }
    .accordion-item.open .accordion-body {
      display: block;
      animation: uiFadeIn 180ms ease;
    }
    .form-field {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 16px;
    }
    .form-label {
      font-size: var(--font-size-small);
      color: var(--text-secondary);
      padding-left: 4px;
    }
    .form-hint {
      font-size: 12px;
      color: var(--text-hint);
      line-height: 1.5;
      padding-left: 4px;
    }
    .select-input {
      width: 100%;
      height: 44px;
      border: none;
      border-radius: var(--radius-md);
      padding: 0 14px;
      background: var(--bg-secondary);
      color: var(--text-primary);
      font-family: var(--font-main);
      font-size: var(--font-size-base);
      outline: none;
    }
    .switch {
      position: relative;
      width: 48px;
      height: 28px;
      display: inline-block;
      flex-shrink: 0;
    }
    .switch input {
      display: none;
    }
    .switch-slider {
      position: absolute;
      inset: 0;
      border-radius: 999px;
      background: var(--bg-secondary);
      box-shadow: var(--shadow-sm);
      transition: all 200ms ease;
    }
    .switch-slider::after {
      content: '';
      position: absolute;
      width: 22px;
      height: 22px;
      left: 3px;
      top: 3px;
      border-radius: 50%;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      transition: all 200ms ease;
    }
    .switch input:checked + .switch-slider {
      background: var(--accent-light);
    }
    .switch input:checked + .switch-slider::after {
      transform: translateX(20px);
      background: var(--accent);
    }
    .svg-icon {
      display: block;
      color: currentColor;
    }
    .desktop-icon {
      position: absolute;
      width: 86px;
      min-height: 102px;
      border: none;
      background: transparent;
      color: var(--text-primary);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      gap: 4px;
      transition: transform 200ms ease;
      touch-action: none;
    }
    .desktop-icon:active {
      transform: scale(0.96);
    }
    .desktop-icon-art {
      width: 76px;
      height: 76px;
      display: grid;
      place-items: center;
      filter: drop-shadow(0 5px 10px rgba(139,115,85,0.08));
    }
    .app-svg {
      overflow: visible;
    }
    .desktop-icon-name {
      max-width: 86px;
      color: var(--text-primary);
      font-size: 14px;
      font-weight: 600;
      line-height: 1.25;
      text-align: center;
      text-shadow: 0 1px 8px rgba(255, 251, 245, 0.95);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .badge {
      position: absolute;
      top: 2px;
      right: 5px;
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      border-radius: 999px;
      background: #D96B5F;
      color: #FFF9F0;
      font-size: 11px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: var(--shadow-sm);
    }
    @keyframes uiFadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;
  document.head.appendChild(style);
}

injectUIStyles();
