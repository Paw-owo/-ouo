import { fileToBase64, downloadText } from "./storage.js";

export const ICONS = {
  back: `<svg viewBox="0 0 24 24"><path d="M15 5 8 12l7 7"/></svg>`,
  close: `<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
  plus: `<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>`,
  more: `<svg viewBox="0 0 24 24"><path d="M6 12h.01M12 12h.01M18 12h.01"/></svg>`,
  search: `<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg>`,
  edit: `<svg viewBox="0 0 24 24"><path d="M4 20h4l11-11a2.6 2.6 0 0 0-4-4L4 16v4Z"/><path d="m13 6 5 5"/></svg>`,
  trash: `<svg viewBox="0 0 24 24"><path d="M5 7h14M10 11v6M14 11v6M8 7l1-3h6l1 3M7 7l1 13h8l1-13"/></svg>`,
  upload: `<svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M5 17v3h14v-3"/></svg>`,
  download: `<svg viewBox="0 0 24 24"><path d="M12 4v12M7 11l5 5 5-5"/><path d="M5 20h14"/></svg>`,
  chevron: `<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>`,
  send: `<svg viewBox="0 0 24 24"><path d="M4 12 20 5l-5 15-3-7-8-1Z"/><path d="m12 13 8-8"/></svg>`,
  phone: `<svg viewBox="0 0 24 24"><path d="M8 5 6 7c0 6 5 11 11 11l2-2-4-4-2 2c-2-1-4-3-5-5l2-2-2-2Z"/></svg>`,
  mic: `<svg viewBox="0 0 24 24"><path d="M12 14a4 4 0 0 0 4-4V6a4 4 0 0 0-8 0v4a4 4 0 0 0 4 4Z"/><path d="M5 10a7 7 0 0 0 14 0M12 17v4"/></svg>`,
  image: `<svg viewBox="0 0 24 24"><path d="M5 6h14v12H5z"/><path d="m7 16 4-4 3 3 2-2 3 3"/><circle cx="9" cy="9" r="1.2"/></svg>`,
  settings: `<svg viewBox="0 0 24 24"><path d="M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z"/><path d="M4 12h2M18 12h2M12 4v2M12 18v2M6.5 6.5l1.4 1.4M16.1 16.1l1.4 1.4M17.5 6.5l-1.4 1.4M7.9 16.1l-1.4 1.4"/></svg>`,
  palette: `<svg viewBox="0 0 24 24"><path d="M12 4a8 8 0 0 0 0 16h1.5a1.8 1.8 0 0 0 1.3-3c-.5-.5-.2-1.5.6-1.5H17a5 5 0 0 0 0-10.5 10 10 0 0 0-5-1Z"/><circle cx="8.5" cy="11" r="1"/><circle cx="11" cy="8" r="1"/><circle cx="14.5" cy="10" r="1"/></svg>`,
  chat: `<svg viewBox="0 0 64 64"><path d="M13 20c0-7 7-12 18-12s20 6 20 16-8 16-19 16h-4L15 51l3-13c-3-3-5-8-5-18Z"/><path d="M24 24h16M24 31h10"/></svg>`,
  moments: `<svg viewBox="0 0 64 64"><path d="M20 16h24a8 8 0 0 1 8 8v16a8 8 0 0 1-8 8H20a8 8 0 0 1-8-8V24a8 8 0 0 1 8-8Z"/><path d="m17 41 10-10 7 7 5-5 9 9"/><circle cx="42" cy="25" r="4"/></svg>`,
  characters: `<svg viewBox="0 0 64 64"><path d="M20 50c1-9 6-14 12-14s11 5 12 14"/><circle cx="32" cy="24" r="10"/><path d="M16 24c2-10 9-16 16-16s14 6 16 16"/></svg>`,
  worldbook: `<svg viewBox="0 0 64 64"><path d="M14 12h28a8 8 0 0 1 8 8v32H22a8 8 0 0 1-8-8V12Z"/><path d="M22 12v32a8 8 0 0 0 8 8M25 24h14M25 32h18"/></svg>`,
  games: `<svg viewBox="0 0 64 64"><path d="M18 28h28a10 10 0 0 1 10 10v2a10 10 0 0 1-10 10H18A10 10 0 0 1 8 40v-2a10 10 0 0 1 10-10Z"/><path d="M22 22v6M42 22v6M19 39h10M24 34v10M43 36h.01M49 42h.01"/></svg>`,
  shop: `<svg viewBox="0 0 64 64"><path d="M16 26h32l-3 26H19l-3-26Z"/><path d="M24 26c0-9 3-14 8-14s8 5 8 14"/><path d="M18 26 22 14h20l4 12"/></svg>`,
  wallet: `<svg viewBox="0 0 64 64"><path d="M12 20h38a6 6 0 0 1 6 6v22a6 6 0 0 1-6 6H12V20Z"/><path d="M12 20 44 10v10"/><path d="M42 34h14v12H42a6 6 0 0 1 0-12Z"/><path d="M48 40h.01"/></svg>`,
  memo: `<svg viewBox="0 0 64 64"><path d="M18 10h28a6 6 0 0 1 6 6v38H18a6 6 0 0 1-6-6V16a6 6 0 0 1 6-6Z"/><path d="M24 24h16M24 32h20M24 40h12"/></svg>`,
  anniversary: `<svg viewBox="0 0 64 64"><path d="M16 16h32a6 6 0 0 1 6 6v28a6 6 0 0 1-6 6H16a6 6 0 0 1-6-6V22a6 6 0 0 1 6-6Z"/><path d="M20 10v10M44 10v10M10 28h44"/><path d="M25 39c0-3 2-5 5-5 2 0 4 1 5 3 1-2 3-3 5-3 3 0 5 2 5 5 0 5-10 10-10 10S25 44 25 39Z"/></svg>`,
};

export function qs(selector, root = document) {
  return root.querySelector(selector);
}

export function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

export function clear(node) {
  if (node) node.replaceChildren();
  return node;
}

export function createElement(tag, options = {}) {
  const element = document.createElement(tag);
  const {
    className,
    text,
    html,
    attrs = {},
    dataset = {},
    style = {},
    children = [],
    on = {},
  } = options;

  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  if (html !== undefined) element.innerHTML = html;

  Object.entries(attrs).forEach(([key, value]) => {
    if (value === false || value === null || value === undefined) return;
    if (value === true) element.setAttribute(key, "");
    else element.setAttribute(key, value);
  });

  Object.entries(dataset).forEach(([key, value]) => {
    element.dataset[key] = value;
  });

  Object.entries(style).forEach(([key, value]) => {
    element.style[key] = value;
  });

  Object.entries(on).forEach(([event, handler]) => {
    element.addEventListener(event, handler);
  });

  children.filter(Boolean).forEach((child) => {
    element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  });

  return element;
}

export function icon(name) {
  return ICONS[name] || ICONS.settings;
}

export function iconButton(name, label, onClick, className = "") {
  return createElement("button", {
    className: `icon-button ${className}`.trim(),
    html: icon(name),
    attrs: { "aria-label": label, title: label },
    on: onClick ? { click: onClick } : {},
  });
}

export function button(text, onClick, variant = "primary", extraClass = "") {
  return createElement("button", {
    className: `${variant}-button ${extraClass}`.trim(),
    text,
    on: onClick ? { click: onClick } : {},
  });
}

export function renderAppShell({ title, onBack, actions = [], contentClass = "" } = {}) {
  const content = createElement("main", {
    className: `app-content scroll-area ${contentClass}`.trim(),
  });

  const shell = createElement("div", {
    className: "app-shell",
    children: [
      createElement("header", {
        className: "app-nav",
        children: [
          iconButton("back", "返回", onBack || (() => window.dispatchEvent(new CustomEvent("app:close")))),
          createElement("div", { className: "app-nav-title", text: title || "" }),
          createElement("div", { className: "status-cluster", children: actions }),
        ],
      }),
      content,
    ],
  });

  return { shell, content };
}

export function card(children = [], className = "") {
  return createElement("section", {
    className: `card card-padding ${className}`.trim(),
    children: Array.isArray(children) ? children : [children],
  });
}

export function listItem({ avatar = "", title = "", subtitle = "", meta = "", onClick, actions = [] } = {}) {
  const avatarNode = createElement("div", {
    className: "avatar",
    children: avatar ? [createElement("img", { attrs: { src: avatar, alt: title } })] : [document.createTextNode(title.slice(0, 1) || "")],
  });

  return createElement("button", {
    className: "list-item",
    on: onClick ? { click: onClick } : {},
    children: [
      avatarNode,
      createElement("div", {
        className: "list-main",
        children: [
          createElement("div", { className: "list-title", text: title }),
          createElement("div", { className: "list-subtitle", text: subtitle }),
        ],
      }),
      actions.length
        ? createElement("div", { className: "status-cluster", children: actions })
        : createElement("div", { className: "list-meta", text: meta }),
    ],
  });
}

export function createSearchBox(placeholder, onInput) {
  const input = createElement("input", {
    attrs: { type: "search", placeholder },
    on: {
      input: (event) => onInput?.(event.target.value, event),
    },
  });

  return createElement("div", {
    className: "search-box",
    children: [
      createElement("div", { html: ICONS.search }),
      input,
    ],
  });
}

export function createTabs(tabs, activeId, onChange) {
  const wrapper = createElement("div", { className: "tabs" });
  const render = (nextActiveId) => {
    clear(wrapper);
    tabs.forEach((tab) => {
      wrapper.append(
        createElement("button", {
          className: `tab-button ${tab.id === nextActiveId ? "active" : ""}`,
          text: tab.label,
          on: {
            click: () => {
              render(tab.id);
              onChange?.(tab.id);
            },
          },
        }),
      );
    });
  };
  render(activeId);
  return wrapper;
}

export function createSwitch(checked = false, onChange) {
  const node = createElement("button", {
    className: `switch ${checked ? "on" : ""}`,
    attrs: { role: "switch", "aria-checked": String(Boolean(checked)) },
    on: {
      click: () => {
        const next = !node.classList.contains("on");
        node.classList.toggle("on", next);
        node.setAttribute("aria-checked", String(next));
        onChange?.(next);
      },
    },
  });
  return node;
}

export function createAccordion(items = [], activeId = "") {
  const wrapper = createElement("div", { className: "accordion" });
  let currentId = activeId;

  const render = () => {
    clear(wrapper);
    items.forEach((item) => {
      const isOpen = item.id === currentId;
      const body = createElement("div", {
        className: "accordion-body",
        children: typeof item.render === "function" ? [item.render()] : item.children || [],
      });

      const row = createElement("section", {
        className: `accordion-item ${isOpen ? "open" : ""}`,
        children: [
          createElement("button", {
            className: "accordion-head",
            children: [
              createElement("span", { className: "accordion-title", text: item.title }),
              createElement("span", { className: "accordion-arrow", html: ICONS.chevron }),
            ],
            on: {
              click: () => {
                currentId = isOpen ? "" : item.id;
                render();
                item.onToggle?.(currentId === item.id);
              },
            },
          }),
          body,
        ],
      });

      wrapper.append(row);
    });
  };

  render();
  return wrapper;
}

export function openDrawer({ title = "", content, actions = [] } = {}) {
  closeLayer(".bottom-drawer");
  closeLayer(".drawer-backdrop");

  const backdrop = createElement("div", {
    className: "drawer-backdrop",
    on: { click: closeDrawer },
  });

  const drawer = createElement("section", {
    className: "bottom-drawer",
    children: [
      createElement("div", { className: "drawer-handle" }),
      title ? createElement("h2", { className: "drawer-title", text: title }) : null,
      createElement("div", {
        className: "scroll-area stack",
        children: [typeof content === "function" ? content() : content].filter(Boolean),
      }),
      actions.length ? createElement("div", { className: "status-cluster", children: actions }) : null,
    ].filter(Boolean),
  });

  document.body.append(backdrop, drawer);
  requestAnimationFrame(() => {
    backdrop.classList.add("open");
    drawer.classList.add("open");
  });

  return { drawer, backdrop, close: closeDrawer };
}

export function closeDrawer() {
  closeLayer(".bottom-drawer");
  closeLayer(".drawer-backdrop");
}

export function openModal({ title = "", content, actions = [] } = {}) {
  closeLayer(".half-modal");
  closeLayer(".modal-backdrop");

  const backdrop = createElement("div", {
    className: "modal-backdrop",
    on: { click: closeModal },
  });

  const modal = createElement("section", {
    className: "half-modal",
    children: [
      title ? createElement("h2", { className: "section-title", text: title }) : null,
      createElement("div", {
        className: "scroll-area stack",
        children: [typeof content === "function" ? content() : content].filter(Boolean),
      }),
      actions.length ? createElement("div", { className: "status-cluster", children: actions }) : null,
    ].filter(Boolean),
  });

  document.body.append(backdrop, modal);
  requestAnimationFrame(() => {
    backdrop.classList.add("open");
    modal.classList.add("open");
  });

  return { modal, backdrop, close: closeModal };
}

export function closeModal() {
  closeLayer(".half-modal");
  closeLayer(".modal-backdrop");
}

function closeLayer(selector) {
  qsa(selector).forEach((node) => {
    node.classList.remove("open");
    setTimeout(() => node.remove(), 220);
  });
}

export function confirmAction({ title = "确认操作", message = "", confirmText = "确认", cancelText = "取消" } = {}) {
  return new Promise((resolve) => {
    const messageNode = createElement("p", { className: "muted", text: message });
    openModal({
      title,
      content: messageNode,
      actions: [
        button(cancelText, () => {
          closeModal();
          resolve(false);
        }, "secondary"),
        button(confirmText, () => {
          closeModal();
          resolve(true);
        }, "primary"),
      ],
    });
  });
}

export function toast(message, duration = 1800) {
  qsa(".toast").forEach((node) => node.remove());
  const node = createElement("div", { className: "toast", text: message });
  document.body.append(node);
  requestAnimationFrame(() => node.classList.add("show"));
  setTimeout(() => {
    node.classList.remove("show");
    setTimeout(() => node.remove(), 220);
  }, duration);
}

export function formField({ label, value = "", type = "text", placeholder = "", name = "", textarea = false, options = [] } = {}) {
  let input;

  if (textarea) {
    input = createElement("textarea", {
      attrs: { name, placeholder },
      text: value,
    });
  } else if (options.length) {
    input = createElement("select", {
      attrs: { name },
      children: options.map((option) => createElement("option", {
        text: option.label,
        attrs: { value: option.value, selected: option.value === value },
      })),
    });
  } else {
    input = createElement("input", {
      attrs: { type, name, placeholder, value },
    });
  }

  return createElement("label", {
    className: "form-row",
    children: [
      createElement("span", { className: "form-label", text: label }),
      input,
    ],
  });
}

export function getFormValues(root) {
  return Array.from(root.querySelectorAll("input[name], textarea[name], select[name]")).reduce((values, input) => {
    values[input.name] = input.type === "checkbox" ? input.checked : input.value;
    return values;
  }, {});
}

export function pickFile({ accept = "*/*", multiple = false, as = "base64" } = {}) {
  return new Promise((resolve, reject) => {
    const input = createElement("input", {
      attrs: { type: "file", accept, multiple },
      style: { display: "none" },
    });

    input.addEventListener("change", async () => {
      try {
        const files = Array.from(input.files || []);
        if (as === "file") resolve(multiple ? files : files[0] || null);
        else {
          const values = await Promise.all(files.map((file) => fileToBase64(file)));
          resolve(multiple ? values : values[0] || "");
        }
      } catch (error) {
        reject(error);
      } finally {
        input.remove();
      }
    });

    document.body.append(input);
    input.click();
  });
}

export async function importJsonFile() {
  const file = await pickFile({ accept: "application/json,.json", as: "file" });
  if (!file) return null;
  return JSON.parse(await file.text());
}

export function exportJsonFile(filename, data) {
  downloadText(filename, JSON.stringify(data, null, 2));
}

export function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();

  if (sameDay) {
    return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }

  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

export function formatOnlineStatus(value) {
  if (!value) return "还没有聊天";
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(diff / 60000));

  if (minutes < 1) return "刚刚活跃";
  if (minutes < 60) return `${minutes}分钟前`;
  if (minutes < 24 * 60 && new Date(value).toDateString() === new Date().toDateString()) return "今天在线";
  if (minutes < 48 * 60) return "昨天在线";
  return "最近在线";
}

export function longPress(node, callback, delay = 520) {
  let timer = 0;
  let startX = 0;
  let startY = 0;

  const start = (event) => {
    const point = getPoint(event);
    startX = point.clientX;
    startY = point.clientY;
    timer = window.setTimeout(() => callback(event), delay);
  };

  const move = (event) => {
    const point = getPoint(event);
    if (Math.abs(point.clientX - startX) > 8 || Math.abs(point.clientY - startY) > 8) {
      clearTimeout(timer);
    }
  };

  const end = () => clearTimeout(timer);

  node.addEventListener("touchstart", start, { passive: true });
  node.addEventListener("mousedown", start);
  node.addEventListener("touchmove", move, { passive: true });
  node.addEventListener("mousemove", move);
  node.addEventListener("touchend", end);
  node.addEventListener("mouseup", end);
  node.addEventListener("mouseleave", end);

  return () => {
    node.removeEventListener("touchstart", start);
    node.removeEventListener("mousedown", start);
    node.removeEventListener("touchmove", move);
    node.removeEventListener("mousemove", move);
    node.removeEventListener("touchend", end);
    node.removeEventListener("mouseup", end);
    node.removeEventListener("mouseleave", end);
  };
}

export function makeFreeDraggable(node, { container, onStart, onMove, onEnd } = {}) {
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;
  let activePointerId = null;

  const handleDown = (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    const point = getPoint(event);
    const rect = node.getBoundingClientRect();
    dragging = true;
    activePointerId = event.pointerId;
    offsetX = point.clientX - rect.left;
    offsetY = point.clientY - rect.top;
    node.classList.add("dragging");
    node.setPointerCapture?.(activePointerId);
    onStart?.(event);
  };

  const handleMove = (event) => {
    if (!dragging) return;
    event.preventDefault();
    const point = getPoint(event);
    const bounds = (container || node.offsetParent || document.body).getBoundingClientRect();
    const x = clamp(point.clientX - bounds.left - offsetX, 0, bounds.width - node.offsetWidth);
    const y = clamp(point.clientY - bounds.top - offsetY, 0, bounds.height - node.offsetHeight);
    node.style.left = `${x}px`;
    node.style.top = `${y}px`;
    onMove?.({ x, y, event, bounds });
  };

  const handleUp = (event) => {
    if (!dragging) return;
    dragging = false;
    node.classList.remove("dragging");
    node.releasePointerCapture?.(activePointerId);
    const x = parseFloat(node.style.left) || 0;
    const y = parseFloat(node.style.top) || 0;
    onEnd?.({ x, y, event });
  };

  node.addEventListener("pointerdown", handleDown);
  node.addEventListener("pointermove", handleMove);
  node.addEventListener("pointerup", handleUp);
  node.addEventListener("pointercancel", handleUp);

  return () => {
    node.removeEventListener("pointerdown", handleDown);
    node.removeEventListener("pointermove", handleMove);
    node.removeEventListener("pointerup", handleUp);
    node.removeEventListener("pointercancel", handleUp);
  };
}

export function renderThemeQuickSettings(appId, currentTheme, onChange) {
  const accentField = formField({
    label: "主题色",
    name: "accent",
    value: currentTheme.accent || "",
    type: "color",
  });

  const radiusField = formField({
    label: "圆角大小",
    name: "radius",
    value: currentTheme.radius || 24,
    type: "number",
  });

  const fontField = formField({
    label: "字体大小",
    name: "fontSize",
    value: currentTheme.fontSize || 15,
    type: "number",
  });

  const root = createElement("div", {
    className: "stack",
    children: [
      accentField,
      radiusField,
      fontField,
      button("更换背景图", async () => {
        const image = await pickFile({ accept: "image/*" });
        onChange?.({ backgroundImage: image });
      }, "secondary"),
      createElement("div", {
        className: "status-cluster",
        children: [
          button("导入主题", async () => {
            const data = await importJsonFile();
            if (data) onChange?.(data);
          }, "secondary"),
          button("导出主题", () => {
            exportJsonFile(`${appId}-theme.json`, currentTheme);
          }, "secondary"),
        ],
      }),
    ],
  });

  root.addEventListener("input", () => {
    onChange?.(getFormValues(root));
  });

  return root;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getPoint(event) {
  return event.touches?.[0] || event.changedTouches?.[0] || event;
}

/* 待后续文件对齐：index.html 使用 ICONS 与 makeFreeDraggable，所有 app 使用 renderAppShell、openDrawer、createAccordion。 */
