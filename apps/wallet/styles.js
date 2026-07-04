// apps/wallet/styles.js
// 钱包 App 的样式——我都收在这啦，方便 index 单独维护结构。
// 红线：视觉值全部走 CSS 变量；负数色 var(--danger) 与 .btn.danger 一致的红粉警示色；图标只走 SVG 线稿。
// 依赖：core/util.js

import { injectStyle } from '../../core/util.js';

// 把样式注入到 head（先删旧 ID 再创建，避免重复）
export function injectWalletStyles() {
  injectStyle('app-wallet-style', `
    .wallet-hero{
      background:linear-gradient(135deg, var(--bg-card) 0%, color-mix(in srgb, var(--accent) 12%, var(--bg-card)) 100%);
      border:1px solid color-mix(in srgb, var(--accent) 22%, transparent);
      border-radius:var(--radius-card);
      padding:22px 20px 18px;
      box-shadow:var(--shadow-sm);
      margin-bottom:16px;
    }
    .wallet-hero-label{
      font-size:var(--font-size-small);
      color:var(--text-secondary);
      margin-bottom:6px;
    }
    .wallet-hero-row{
      display:flex; align-items:flex-end; gap:10px;
      flex-wrap:wrap;
    }
    .wallet-hero-balance{
      font-size:var(--font-size-huge);
      font-weight:700;
      line-height:1.15;
      letter-spacing:0.5px;
      color:var(--accent);
      word-break:break-all;
      flex:1; min-width:0;
    }
    .wallet-hero-balance.neg{ color:var(--danger); }
    .wallet-hero-edit{
      width:34px; height:34px; border-radius:50%;
      background:color-mix(in srgb, var(--accent) 14%, transparent);
      color:var(--accent);
      display:flex; align-items:center; justify-content:center;
      flex-shrink:0;
      transition:var(--motion);
    }
    .wallet-hero-edit:active{ transform:scale(var(--press-scale)); }
    .wallet-hero-stats{
      display:flex; gap:18px; margin-top:14px;
      padding-top:12px;
      border-top:1px solid color-mix(in srgb, var(--text-hint) 16%, transparent);
    }
    .wallet-stat{ flex:1; min-width:0; }
    .wallet-stat-label{
      font-size:var(--font-size-small);
      color:var(--text-hint);
    }
    .wallet-stat-value{
      font-size:var(--font-size-title);
      font-weight:600;
      margin-top:2px;
      color:var(--text-primary);
    }
    .wallet-stat-value.income{ color:var(--accent); }
    .wallet-stat-value.expense{ color:var(--danger); }
    .wallet-section-title{
      font-size:var(--font-size-base);
      color:var(--text-secondary);
      margin:6px 2px 10px;
      display:flex; align-items:center; gap:6px;
    }
    .wallet-section-title .popo-icon-svg{ color:var(--accent); }

    /* 她的零钱包 —— 角色卡片 */
    .wallet-char{
      display:flex; align-items:center; gap:12px;
      background:var(--bg-card);
      border-radius:var(--radius-card);
      padding:12px 14px;
      box-shadow:var(--shadow-sm);
      margin-bottom:10px;
      transition:var(--motion);
      border:1px solid color-mix(in srgb, var(--text-hint) 10%, transparent);
    }
    .wallet-char:active{ transform:scale(var(--press-scale)); }
    .wallet-char-avatar{
      width:42px; height:42px; border-radius:50%;
      flex-shrink:0;
      background:color-mix(in srgb, var(--accent-light) 55%, transparent);
      background-size:cover; background-position:center;
      display:flex; align-items:center; justify-content:center;
      color:var(--accent-dark);
      overflow:hidden;
      box-shadow:var(--shadow-sm);
    }
    .wallet-char-avatar .popo-icon-svg{ color:var(--accent-dark); }
    .wallet-char-main{ flex:1; min-width:0; }
    .wallet-char-name{
      font-size:var(--font-size-base);
      font-weight:600;
      color:var(--text-primary);
      overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    }
    .wallet-char-balance{
      font-size:var(--font-size-small);
      color:var(--text-secondary);
      margin-top:3px;
    }
    .wallet-char-balance b{
      font-weight:600;
      color:var(--accent);
    }
    .wallet-char-transfer{
      padding:8px 14px;
      border-radius:var(--radius-md);
      background:var(--accent);
      color:var(--bubble-user-text);
      font-size:var(--font-size-small);
      font-weight:600;
      display:flex; align-items:center; gap:4px;
      flex-shrink:0;
      transition:var(--motion);
    }
    .wallet-char-transfer:active{ transform:scale(var(--press-scale)); }
    .wallet-char-empty{
      background:var(--bg-card);
      border:1px dashed color-mix(in srgb, var(--text-hint) 30%, transparent);
      border-radius:var(--radius-card);
      padding:18px 14px;
      text-align:center;
      color:var(--text-hint);
      font-size:var(--font-size-small);
      margin-bottom:10px;
    }

    /* 筛选条 */
    .wallet-filters{
      display:flex; gap:8px; margin-bottom:12px;
      overflow-x:auto; -webkit-overflow-scrolling:touch;
      padding-bottom:2px;
    }
    .wallet-filters::-webkit-scrollbar{ display:none; }
    .wallet-filter{
      padding:6px 14px;
      border-radius:var(--radius-md);
      background:color-mix(in srgb, var(--bg-secondary) 70%, transparent);
      color:var(--text-secondary);
      font-size:var(--font-size-small);
      border:1px solid transparent;
      white-space:nowrap;
      transition:var(--motion);
      flex-shrink:0;
    }
    .wallet-filter:active{ transform:scale(var(--press-scale)); }
    .wallet-filter.active{
      background:color-mix(in srgb, var(--accent) 18%, transparent);
      color:var(--accent);
      border-color:var(--accent);
      font-weight:600;
    }
    .wallet-filter.char{
      background:color-mix(in srgb, var(--accent-light) 40%, transparent);
      color:var(--accent-dark);
    }
    .wallet-filter.char.active{
      background:color-mix(in srgb, var(--accent) 24%, transparent);
      border-color:var(--accent);
    }
    .wallet-filter-sep{
      flex-shrink:0;
      width:1px; align-self:center; height:18px;
      background:color-mix(in srgb, var(--text-hint) 30%, transparent);
    }

    /* 交易卡片 */
    .wallet-tx{
      display:flex; align-items:center; gap:12px;
      background:var(--bg-card);
      border-radius:var(--radius-card);
      padding:12px 14px;
      box-shadow:var(--shadow-sm);
      margin-bottom:10px;
      transition:var(--motion);
    }
    .wallet-tx:active{ transform:scale(var(--press-scale)); }
    .wallet-tx-icon{
      width:38px; height:38px; border-radius:50%;
      display:flex; align-items:center; justify-content:center;
      flex-shrink:0;
    }
    .wallet-tx-icon.income{
      background:color-mix(in srgb, var(--accent) 18%, transparent);
      color:var(--accent);
    }
    .wallet-tx-icon.expense{
      background:color-mix(in srgb, var(--danger) 18%, transparent);
      color:var(--danger);
    }
    .wallet-tx-icon.transfer{
      background:color-mix(in srgb, var(--accent-light) 50%, transparent);
      color:var(--accent-dark);
    }
    .wallet-tx-main{ flex:1; min-width:0; }
    .wallet-tx-note{
      font-size:var(--font-size-base);
      color:var(--text-primary);
      font-weight:500;
      overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    }
    .wallet-tx-meta{
      font-size:var(--font-size-small);
      color:var(--text-hint);
      margin-top:3px;
      display:flex; align-items:center; gap:8px;
      flex-wrap:wrap;
    }
    .wallet-tx-meta span + span::before{
      content:''; display:inline-block;
      width:3px; height:3px; border-radius:50%;
      background:var(--text-hint);
      margin-right:8px; vertical-align:middle;
      opacity:0.7;
    }
    .wallet-tx-amount{
      font-size:var(--font-size-title);
      font-weight:600;
      flex-shrink:0;
    }
    .wallet-tx-amount.income{ color:var(--accent); }
    .wallet-tx-amount.expense{ color:var(--danger); }
    .wallet-tx-del{
      width:30px; height:30px; border-radius:50%;
      background:transparent; color:var(--text-hint);
      display:flex; align-items:center; justify-content:center;
      transition:var(--motion);
      flex-shrink:0;
    }
    .wallet-tx-del:active{ transform:scale(var(--press-scale)); }

    /* 表单通用 */
    .wallet-form-row{ margin-bottom:14px; }
    .wallet-form-label{
      font-size:var(--font-size-small);
      color:var(--text-secondary);
      margin-bottom:6px; display:block;
    }
    .wallet-type-toggle{ display:flex; gap:8px; }
    .wallet-type-btn{
      flex:1; padding:10px;
      border-radius:var(--radius-md);
      background:color-mix(in srgb, var(--bg-secondary) 70%, transparent);
      color:var(--text-secondary);
      font-size:var(--font-size-base);
      border:1px solid transparent;
      display:flex; align-items:center; justify-content:center; gap:6px;
      transition:var(--motion);
    }
    .wallet-type-btn:active{ transform:scale(var(--press-scale)); }
    .wallet-type-btn.active.income{
      background:color-mix(in srgb, var(--accent) 18%, transparent);
      color:var(--accent); border-color:var(--accent);
    }
    .wallet-type-btn.active.expense{
      background:color-mix(in srgb, var(--danger) 18%, transparent);
      color:var(--danger); border-color:var(--danger);
    }
    .wallet-empty-icon{ color:var(--text-hint); opacity:0.5; margin-bottom:12px; }

    /* 转账方向预览 */
    .wallet-transfer-preview{
      background:color-mix(in srgb, var(--accent-light) 35%, transparent);
      border-radius:var(--radius-md);
      padding:10px 12px;
      font-size:var(--font-size-small);
      color:var(--accent-dark);
      margin-bottom:14px;
      line-height:1.5;
    }
    .wallet-transfer-preview b{ color:var(--accent); font-weight:700; }

    /* 角色选择列表（赠礼/转账时复用） */
    .wallet-pick-item{
      display:flex; align-items:center; gap:12px;
      width:100%; text-align:left;
      padding:12px 4px;
      border-bottom:1px solid color-mix(in srgb, var(--text-hint) 12%, transparent);
      transition:var(--motion);
    }
    .wallet-pick-item:last-child{ border-bottom:0; }
    .wallet-pick-item:active{ transform:scale(var(--press-scale)); }
    .wallet-pick-avatar{
      width:40px; height:40px; border-radius:50%;
      flex-shrink:0;
      background:color-mix(in srgb, var(--accent-light) 55%, transparent);
      background-size:cover; background-position:center;
      display:flex; align-items:center; justify-content:center;
      color:var(--accent-dark); overflow:hidden;
    }
    .wallet-pick-main{ flex:1; min-width:0; }
    .wallet-pick-name{
      font-size:var(--font-size-base); font-weight:600;
      color:var(--text-primary);
      overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    }
    .wallet-pick-sub{
      font-size:var(--font-size-small);
      color:var(--text-hint);
      margin-top:2px;
    }
  `);
}
