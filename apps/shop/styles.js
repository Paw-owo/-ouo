// apps/shop/styles.js
// 商店 App 的样式——我都收在这啦，方便 index 单独维护结构。
// 红线：视觉值全部走 CSS 变量；负数/警示色 var(--danger)；图标只走 SVG 线稿；无 emoji。
// 依赖：core/util.js

import { injectStyle } from '../../core/util.js';

export function injectShopStyles() {
  injectStyle('app-shop-style', `
    .shop-balance{
      display:flex; align-items:center; gap:12px;
      background:linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%);
      color:var(--bubble-user-text);
      border-radius:var(--radius-card);
      padding:16px 18px;
      box-shadow:var(--shadow-md);
      margin-bottom:14px;
    }
    .shop-balance-icon{
      width:40px; height:40px; border-radius:50%;
      background:color-mix(in srgb, var(--bubble-user-text) 22%, transparent);
      display:flex; align-items:center; justify-content:center;
      flex-shrink:0;
    }
    .shop-balance-main{ flex:1; min-width:0; }
    .shop-balance-label{
      font-size:var(--font-size-small);
      color:color-mix(in srgb, var(--bubble-user-text) 78%, transparent);
    }
    .shop-balance-value{
      font-size:var(--font-size-title);
      font-weight:700;
      line-height:1.1;
      margin-top:2px;
      word-break:break-all;
    }
    .shop-recharge{
      padding:8px 14px;
      border-radius:var(--radius-md);
      background:color-mix(in srgb, var(--bubble-user-text) 24%, transparent);
      color:var(--bubble-user-text);
      font-size:var(--font-size-small);
      font-weight:600;
      display:flex; align-items:center; gap:4px;
      transition:var(--motion);
      flex-shrink:0;
    }
    .shop-recharge:active{ transform:scale(var(--press-scale)); }

    .shop-filters{
      display:flex; gap:8px; margin-bottom:14px;
      overflow-x:auto; -webkit-overflow-scrolling:touch;
      padding-bottom:2px;
    }
    .shop-filters::-webkit-scrollbar{ display:none; }
    .shop-filter{
      padding:7px 14px;
      border-radius:var(--radius-md);
      background:color-mix(in srgb, var(--bg-secondary) 70%, transparent);
      color:var(--text-secondary);
      font-size:var(--font-size-small);
      border:1px solid transparent;
      white-space:nowrap;
      transition:var(--motion);
      flex-shrink:0;
    }
    .shop-filter:active{ transform:scale(var(--press-scale)); }
    .shop-filter.active{
      background:color-mix(in srgb, var(--accent) 18%, transparent);
      color:var(--accent);
      border-color:var(--accent);
      font-weight:600;
    }

    .shop-grid{
      display:grid;
      grid-template-columns:repeat(2, 1fr);
      gap:12px;
      margin-bottom:16px;
    }
    .shop-card{
      background:var(--bg-card);
      border-radius:var(--radius-card);
      padding:14px;
      box-shadow:var(--shadow-sm);
      display:flex; flex-direction:column;
      transition:var(--motion);
      position:relative;
      border:1px solid color-mix(in srgb, var(--text-hint) 8%, transparent);
    }
    .shop-card:active{ transform:scale(var(--press-scale)); }
    .shop-card.custom::after{
      content:'自';
      position:absolute; top:8px; right:8px;
      font-size:10px; line-height:1;
      padding:3px 6px; border-radius:999px;
      background:color-mix(in srgb, var(--accent-light) 60%, transparent);
      color:var(--accent-dark);
      font-weight:600;
    }
    .shop-card-icon{
      width:48px; height:48px; border-radius:var(--radius-md);
      background:color-mix(in srgb, var(--accent) 14%, transparent);
      color:var(--accent);
      display:flex; align-items:center; justify-content:center;
      margin-bottom:10px;
    }
    .shop-card-name{
      font-size:var(--font-size-base);
      font-weight:600;
      color:var(--text-primary);
      line-height:1.3;
      margin-bottom:4px;
      overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    }
    .shop-card-desc{
      font-size:var(--font-size-small);
      color:var(--text-secondary);
      line-height:1.4;
      flex:1;
      margin-bottom:10px;
      display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;
      overflow:hidden;
    }
    .shop-card-foot{
      display:flex; align-items:center; justify-content:space-between; gap:8px;
    }
    .shop-card-price{
      font-size:var(--font-size-base);
      font-weight:700;
      color:var(--accent);
    }
    .shop-buy{
      padding:6px 12px;
      border-radius:var(--radius-sm);
      background:var(--accent);
      color:var(--bubble-user-text);
      font-size:var(--font-size-small);
      font-weight:600;
      display:flex; align-items:center; gap:3px;
      transition:var(--motion);
    }
    .shop-buy:active{ transform:scale(var(--press-scale)); }

    .shop-entries{ display:flex; flex-direction:column; gap:10px; }
    .shop-bag-entry{
      width:100%;
      padding:14px;
      border-radius:var(--radius-card);
      background:var(--bg-card);
      box-shadow:var(--shadow-sm);
      color:var(--text-primary);
      font-size:var(--font-size-base);
      font-weight:500;
      display:flex; align-items:center; justify-content:center; gap:8px;
      transition:var(--motion);
    }
    .shop-bag-entry .popo-icon-svg{ color:var(--accent); }
    .shop-bag-entry:active{ transform:scale(var(--press-scale)); }

    .shop-empty-icon{ color:var(--text-hint); opacity:0.5; margin-bottom:10px; }

    /* 背包列表 */
    .shop-bag-item{
      display:flex; align-items:center; gap:12px;
      padding:12px 0;
      border-bottom:1px solid color-mix(in srgb, var(--text-hint) 14%, transparent);
    }
    .shop-bag-item:last-child{ border-bottom:0; }
    .shop-bag-icon{
      width:38px; height:38px; border-radius:var(--radius-sm);
      background:color-mix(in srgb, var(--accent) 14%, transparent);
      color:var(--accent);
      display:flex; align-items:center; justify-content:center;
      flex-shrink:0;
    }
    .shop-bag-main{ flex:1; min-width:0; }
    .shop-bag-name{
      font-size:var(--font-size-base);
      font-weight:500;
      color:var(--text-primary);
      overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    }
    .shop-bag-time{
      font-size:var(--font-size-small);
      color:var(--text-hint);
      margin-top:2px;
    }
    .shop-bag-actions{ display:flex; gap:6px; flex-shrink:0; }
    .shop-bag-btn{
      padding:6px 10px;
      border-radius:var(--radius-sm);
      font-size:var(--font-size-small);
      font-weight:500;
      display:flex; align-items:center; gap:3px;
      transition:var(--motion);
    }
    .shop-bag-btn:active{ transform:scale(var(--press-scale)); }
    .shop-bag-btn.gift{ background:var(--accent); color:var(--bubble-user-text); }
    .shop-bag-btn.drop{ background:color-mix(in srgb, var(--text-hint) 22%, transparent); color:var(--text-secondary); }

    /* 表单通用 */
    .shop-form-row{ margin-bottom:14px; }
    .shop-form-label{
      font-size:var(--font-size-small);
      color:var(--text-secondary);
      margin-bottom:6px; display:block;
    }
    .shop-toggle-row{
      display:flex; align-items:center; justify-content:space-between; gap:10px;
      padding:10px 12px;
      border-radius:var(--radius-md);
      background:color-mix(in srgb, var(--bg-secondary) 60%, transparent);
    }
    .shop-toggle-text{
      font-size:var(--font-size-base); color:var(--text-primary);
    }
    .shop-toggle-hint{
      font-size:var(--font-size-small); color:var(--text-hint); margin-top:2px;
    }
    .shop-switch{
      width:42px; height:24px; border-radius:999px;
      background:color-mix(in srgb, var(--text-hint) 40%, transparent);
      position:relative; transition:var(--motion); flex-shrink:0;
    }
    .shop-switch::after{
      content:''; position:absolute; top:2px; left:2px;
      width:20px; height:20px; border-radius:50%;
      background:var(--bg-card); box-shadow:var(--shadow-sm);
      transition:var(--motion);
    }
    .shop-switch.on{ background:var(--accent); }
    .shop-switch.on::after{ left:20px; }
    .shop-form-actions{ display:flex; gap:8px; }
    .shop-form-actions .btn{ flex:1; }
    .shop-form-actions .btn.danger{
      background:var(--danger); color:var(--bubble-user-text);
    }

    /* 管理列表 */
    .shop-mgmt-item{
      display:flex; align-items:center; gap:10px;
      padding:12px 4px;
      border-bottom:1px solid color-mix(in srgb, var(--text-hint) 12%, transparent);
    }
    .shop-mgmt-item:last-child{ border-bottom:0; }
    .shop-mgmt-icon{
      width:34px; height:34px; border-radius:var(--radius-sm);
      background:color-mix(in srgb, var(--accent) 14%, transparent);
      color:var(--accent);
      display:flex; align-items:center; justify-content:center;
      flex-shrink:0;
    }
    .shop-mgmt-main{ flex:1; min-width:0; }
    .shop-mgmt-name{
      font-size:var(--font-size-base); font-weight:500;
      color:var(--text-primary);
      overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    }
    .shop-mgmt-sub{
      font-size:var(--font-size-small); color:var(--text-hint);
      margin-top:2px;
    }
    .shop-mgmt-actions{ display:flex; gap:6px; flex-shrink:0; }
    .shop-mgmt-btn{
      width:32px; height:32px; border-radius:50%;
      display:flex; align-items:center; justify-content:center;
      transition:var(--motion);
    }
    .shop-mgmt-btn:active{ transform:scale(var(--press-scale)); }
    .shop-mgmt-btn.hide{ background:color-mix(in srgb, var(--text-hint) 22%, transparent); color:var(--text-secondary); }
    .shop-mgmt-btn.show{ background:color-mix(in srgb, var(--accent) 18%, transparent); color:var(--accent); }
    .shop-mgmt-btn.edit{ background:color-mix(in srgb, var(--accent) 18%, transparent); color:var(--accent); }
    .shop-mgmt-btn.del{ background:color-mix(in srgb, var(--danger) 22%, transparent); color:var(--danger); }

    /* 角色选择列表（送给她） */
    .shop-pick-item{
      display:flex; align-items:center; gap:12px;
      width:100%; text-align:left;
      padding:12px 4px;
      border-bottom:1px solid color-mix(in srgb, var(--text-hint) 12%, transparent);
      transition:var(--motion);
    }
    .shop-pick-item:last-child{ border-bottom:0; }
    .shop-pick-item:active{ transform:scale(var(--press-scale)); }
    .shop-pick-avatar{
      width:40px; height:40px; border-radius:50%;
      flex-shrink:0;
      background:color-mix(in srgb, var(--accent-light) 55%, transparent);
      background-size:cover; background-position:center;
      display:flex; align-items:center; justify-content:center;
      color:var(--accent-dark); overflow:hidden;
    }
    .shop-pick-main{ flex:1; min-width:0; }
    .shop-pick-name{
      font-size:var(--font-size-base); font-weight:600;
      color:var(--text-primary);
      overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    }
    .shop-pick-sub{
      font-size:var(--font-size-small);
      color:var(--text-hint);
      margin-top:2px;
    }
  `);
}
