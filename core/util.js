// core/util.js
// 公共工具函数。修复原项目共性 bug：Fisher-Yates 洗牌、图片选择 append、循环引用检测、样式注入统一。
// 依赖：无

/** Fisher-Yates 均匀洗牌（原项目实现非均匀，必须替换） */
export function shuffle(arr) {
  const a = Array.isArray(arr) ? arr.slice() : Array.from(arr);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pick(arr) {
  if (!arr || !arr.length) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
}

export function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function clampPosition(pos, size, container) {
  return {
    x: clamp(pos.x, 0, Math.max(0, container.w - size.w)),
    y: clamp(pos.y, 0, Math.max(0, container.h - size.h))
  };
}

export function debounce(fn, wait = 200) {
  let timer = null;
  const debounced = (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, wait);
  };
  debounced.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return debounced;
}

export function throttle(fn, wait = 100) {
  let last = 0;
  let timer = null;
  return (...args) => {
    const now = Date.now();
    const remain = wait - (now - last);
    if (remain <= 0) {
      if (timer) { clearTimeout(timer); timer = null; }
      last = now;
      fn(...args);
    } else if (!timer) {
      timer = setTimeout(() => {
        last = Date.now();
        timer = null;
        fn(...args);
      }, remain);
    }
  };
}

const WEEK_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function formatTime(input) {
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function formatDate(input, opts = {}) {
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  if (opts.withWeek) return `${mm}月${dd}日 ${WEEK_LABELS[d.getDay()]}`;
  if (opts.full) return `${d.getFullYear()}-${mm}-${dd}`;
  return `${mm}-${dd}`;
}

export function formatRelative(input) {
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return '';
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}小时前`;
  if (diff < 7 * 86400_000) return `${Math.floor(diff / 86400_000)}天前`;
  return formatDate(d, { full: true });
}

export function daysBetween(a, b = new Date()) {
  const da = a instanceof Date ? a : new Date(a);
  const db = b instanceof Date ? b : new Date(b);
  const ms = db.setHours(0, 0, 0, 0) - da.setHours(0, 0, 0, 0);
  return Math.round(ms / 86400_000);
}

/** 弱引用循环检测的 cleanForDB */
export function cleanForDB(obj, seen = new WeakSet()) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (seen.has(obj)) return null;
  seen.add(obj);
  if (Array.isArray(obj)) {
    return obj.map((v) => cleanForDB(v, seen));
  }
  const out = {};
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === 'function') continue;
    if (obj[key] === undefined) continue;
    out[key] = cleanForDB(obj[key], seen);
  }
  return out;
}

/** 统一的样式注入：先删旧 ID 再创建新 */
export function injectStyle(id, css) {
  if (!id || !css) return;
  const old = document.getElementById(id);
  if (old) old.remove();
  const el = document.createElement('style');
  el.id = id;
  el.textContent = css;
  document.head.appendChild(el);
}

export function cssUrl(blobOrUrl) {
  if (!blobOrUrl) return '';
  if (typeof blobOrUrl === 'string') return `url("${blobOrUrl}")`;
  if (blobOrUrl instanceof Blob) return `url("${URL.createObjectURL(blobOrUrl)}")`;
  return '';
}

export function isUsableImage(value) {
  if (!value) return false;
  if (typeof value === 'string') return value.startsWith('data:') || value.startsWith('http') || value.startsWith('blob:');
  if (value instanceof Blob) return value.type.startsWith('image/');
  return false;
}

/**
 * 统一图片选择：append 到 DOM（修复原 chooseImage 未 append 的 bug），返回 Promise<File>。
 * 调用方拿到 File 后用 compressImage 处理。
 */
export function pickImageFile(accept = 'image/*') {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    input.style.top = '-9999px';
    input.style.opacity = '0';
    document.body.appendChild(input);
    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      input.remove();
      input.value = '';
    };
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      cleanup();
      if (file) resolve(file);
      else reject(new Error('没有选图片嘛'));
    });
    // 失焦兜底（用户取消）
    input.addEventListener('blur', () => {
      setTimeout(() => {
        if (!done && (!input.files || !input.files.length)) {
          cleanup();
          reject(new Error('取消了啦'));
        }
      }, 400);
    });
    input.click();
  });
}

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function tryJSON(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch (e) {
    console.warn('[util] JSON 解析失败', e);
    return fallback;
  }
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeRun(fn, ...args) {
  try {
    const r = fn(...args);
    if (r && typeof r.then === 'function') {
      return r.catch((e) => console.warn('[util] async 失败', e));
    }
    return r;
  } catch (e) {
    console.warn('[util] 同步失败', e);
    return undefined;
  }
}
