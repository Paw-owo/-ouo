// core/lock.js
// 锁屏密码哈希共享模块。desktop.js 与 apps/settings/index.js 共用，
// 避免两处重复实现导致的不一致风险（若一处改盐另一处不改，密码校验全线崩溃）。
// 依赖：无

// 盐值常量：修改时务必同步两端（现在抽到这里，只需改一处）
export const LOCK_SALT = 'popo-salt-2024';
export const DEFAULT_LOCK_PASSWORD = '0326';
export const LOCK_MAX_FAILS = 5;
export const LOCK_LOCKOUT_MS = 30000;

/**
 * 用 SHA-256 + 盐哈希密码，返回 64 位 hex。
 * @param {string} pwd
 * @returns {Promise<string>}
 */
export async function hashPassword(pwd) {
  const data = new TextEncoder().encode(String(pwd) + LOCK_SALT);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 解析存储的密码字符串。支持三种格式：
 *   - sha256:<长度>:<hex>（推荐格式，记录了密码长度用于锁屏点数还原）
 *   - 纯 hex（64 位，旧版兼容）
 *   - 明文（更早的旧版兼容，boot 时会迁移成哈希）
 * @param {string|null|undefined} raw
 * @returns {{hash: string|null, plain: string|null, length: number}}
 */
export function parseLockStored(raw) {
  if (raw == null) return { hash: null, plain: null, length: 4 };
  if (typeof raw === 'string') {
    const m = /^sha256:(\d+):([0-9a-f]{64})$/.exec(raw);
    if (m) return { hash: m[2], plain: null, length: Number(m[1]) || 4 };
    if (/^[0-9a-f]{64}$/.test(raw)) return { hash: raw, plain: null, length: 4 };
    return { hash: null, plain: raw, length: raw.length };
  }
  return { hash: null, plain: null, length: 4 };
}

/**
 * 把哈希结果组装成存储格式字符串。
 * @param {string} hash 64 位 hex
 * @param {number} length 密码长度（锁屏点数）
 * @returns {string}
 */
export function formatLockStored(hash, length) {
  return `sha256:${length}:${hash}`;
}
