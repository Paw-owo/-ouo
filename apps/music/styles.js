// apps/music/styles.js
// 音乐播放器的全部样式 —— 集中在这里，方便统一调风格。
// 所有颜色 / 圆角 / 阴影都走 CSS 变量，6 套主题下都能看。
// 红线：图标只用 SVG 线稿，禁止任何 emoji 字符；视觉值走 CSS 变量。

import { injectStyle } from '../../core/util.js';

export function injectMusicStyles() {
  injectStyle('app-music-style', `
  /* ── 播放器卡片：黑胶氛围 ── */
  .music-player-card{
    position:relative;overflow:hidden;
    border-radius:var(--radius-card);
    padding:22px 18px 18px;
    box-shadow:var(--shadow-md);
    margin-bottom:16px;
    background:var(--bg-card);
  }
  /* 背景层：封面模糊做氛围，没有封面时用主题色渐变 */
  .music-bg{
    position:absolute;inset:0;z-index:0;pointer-events:none;
    background-size:cover;background-position:center;
    filter:blur(28px) saturate(1.2);
    transform:scale(1.2);opacity:.55;
    transition:background-image var(--motion);
  }
  .music-bg-mask{
    position:absolute;inset:0;z-index:0;pointer-events:none;
    background:linear-gradient(180deg,color-mix(in srgb,var(--bg-card) 55%,transparent) 0%,color-mix(in srgb,var(--bg-card) 82%,transparent) 100%);
  }
  .music-player-inner{
    position:relative;z-index:1;
    display:flex;flex-direction:column;align-items:center;gap:14px;
  }
  /* 黑胶大封面 */
  .music-disc-wrap{
    position:relative;width:160px;height:160px;
    display:flex;align-items:center;justify-content:center;
  }
  .music-disc{
    position:absolute;inset:0;border-radius:50%;
    background:conic-gradient(from 0deg,#1a1a1a,#333 12.5%,#1a1a1a 25%,#333 37.5%,#1a1a1a 50%,#333 62.5%,#1a1a1a 75%,#333 87.5%,#1a1a1a);
    box-shadow:0 8px 24px rgba(0,0,0,.28),inset 0 0 0 6px rgba(255,255,255,.04);
  }
  .music-disc::before{
    content:"";position:absolute;inset:14px;border-radius:50%;
    background:radial-gradient(circle,#2a2a2a 0%,#1a1a1a 70%);
  }
  .music-cover{
    position:relative;z-index:1;width:108px;height:108px;border-radius:50%;
    background-size:cover;background-position:center;background-color:var(--bg-secondary);
    box-shadow:0 4px 12px rgba(0,0,0,.3),inset 0 0 0 4px rgba(255,255,255,.06);
    display:flex;align-items:center;justify-content:center;color:var(--text-hint);
  }
  .music-cover.placeholder{color:var(--text-hint);}
  .music-disc-wrap.spinning .music-disc,
  .music-disc-wrap.spinning .music-cover{
    animation:musicSpin 12s linear infinite;
  }
  @keyframes musicSpin{to{transform:rotate(360deg)}}
  /* 中心小圆点 */
  .music-disc-wrap::after{
    content:"";position:absolute;left:50%;top:50%;width:14px;height:14px;
    transform:translate(-50%,-50%);border-radius:50%;z-index:2;
    background:var(--bg-card);box-shadow:0 0 0 2px rgba(0,0,0,.2);
  }
  .music-meta{text-align:center;width:100%;min-width:0;}
  .music-title{
    font-size:var(--font-size-title);font-weight:700;line-height:1.3;
    word-break:break-word;color:var(--text-primary);
  }
  .music-artist{font-size:var(--font-size-small);color:var(--text-secondary);margin-top:2px;}

  /* 进度条：用 input range，可拖可点 */
  .music-progress-row{width:100%;display:flex;flex-direction:column;gap:6px;}
  .music-progress{
    -webkit-appearance:none;appearance:none;width:100%;height:6px;
    border-radius:999px;cursor:pointer;outline:none;
    background:color-mix(in srgb,var(--text-hint) 30%,transparent);
  }
  .music-progress::-webkit-slider-runnable-track{
    height:6px;border-radius:999px;
    background:linear-gradient(to right,var(--accent) 0%,var(--accent) var(--pct,0%),color-mix(in srgb,var(--text-hint) 30%,transparent) var(--pct,0%),color-mix(in srgb,var(--text-hint) 30%,transparent) 100%);
  }
  .music-progress::-webkit-slider-thumb{
    -webkit-appearance:none;appearance:none;width:14px;height:14px;border-radius:50%;
    background:var(--accent);margin-top:-4px;cursor:pointer;box-shadow:var(--shadow-sm);
    border:2px solid var(--bg-card);
  }
  .music-progress::-moz-range-track{
    height:6px;border-radius:999px;
    background:color-mix(in srgb,var(--text-hint) 30%,transparent);
  }
  .music-progress::-moz-range-progress{
    height:6px;border-radius:999px;background:var(--accent);
  }
  .music-progress::-moz-range-thumb{
    width:14px;height:14px;border-radius:50%;background:var(--accent);
    cursor:pointer;box-shadow:var(--shadow-sm);border:2px solid var(--bg-card);
  }
  .music-time{
    width:100%;display:flex;justify-content:space-between;
    font-size:var(--font-size-small);color:var(--text-secondary);font-variant-numeric:tabular-nums;
  }

  /* 控制按钮 */
  .music-controls{display:flex;align-items:center;gap:16px;}
  .music-ctrl-btn{
    width:42px;height:42px;border-radius:50%;
    background:color-mix(in srgb,var(--accent) 14%,transparent);color:var(--accent-dark);
    border:none;display:flex;align-items:center;justify-content:center;
    transition:var(--motion);cursor:pointer;
  }
  .music-ctrl-btn:active{transform:scale(var(--press-scale));}
  .music-ctrl-btn.primary{
    width:58px;height:58px;background:var(--accent);color:var(--bubble-user-text);
    box-shadow:var(--shadow-md);
  }

  /* 副控制行：音量 / 模式 / 分享 */
  .music-sub-controls{
    width:100%;display:flex;align-items:center;justify-content:space-between;
    gap:10px;flex-wrap:wrap;
  }
  .music-vol-group{display:flex;align-items:center;gap:8px;flex:1;min-width:120px;}
  .music-vol-btn{
    width:34px;height:34px;border-radius:50%;border:none;cursor:pointer;
    background:transparent;color:var(--text-secondary);
    display:flex;align-items:center;justify-content:center;transition:var(--motion);
  }
  .music-vol-btn:active{transform:scale(var(--press-scale));}
  .music-vol-slider{
    -webkit-appearance:none;appearance:none;width:90px;height:4px;border-radius:999px;
    background:color-mix(in srgb,var(--text-hint) 30%,transparent);outline:none;cursor:pointer;
  }
  .music-vol-slider::-webkit-slider-thumb{
    -webkit-appearance:none;appearance:none;width:12px;height:12px;border-radius:50%;
    background:var(--accent);cursor:pointer;
  }
  .music-vol-slider::-moz-range-thumb{
    width:12px;height:12px;border-radius:50%;background:var(--accent);cursor:pointer;border:none;
  }
  .music-sub-right{display:flex;align-items:center;gap:4px;}
  .music-mode-btn,.music-share-btn{
    width:34px;height:34px;border-radius:50%;border:none;cursor:pointer;
    background:transparent;color:var(--text-secondary);
    display:flex;align-items:center;justify-content:center;transition:var(--motion);
  }
  .music-mode-btn:active,.music-share-btn:active{transform:scale(var(--press-scale));}
  .music-mode-btn.active{color:var(--accent-dark);background:color-mix(in srgb,var(--accent) 14%,transparent);}

  /* ── 歌单区 ── */
  .music-section-title{
    font-size:var(--font-size-small);color:var(--text-secondary);
    margin:6px 2px 10px;font-weight:600;display:flex;align-items:center;justify-content:space-between;
  }
  .music-section-title .music-add-text{color:var(--accent-dark);font-weight:500;display:inline-flex;align-items:center;gap:3px;}
  .music-playlist-row{
    display:flex;gap:10px;overflow-x:auto;-webkit-overflow-scrolling:touch;
    padding-bottom:6px;scrollbar-width:none;margin-bottom:6px;
  }
  .music-playlist-row::-webkit-scrollbar{display:none;}
  .music-playlist-card{
    flex-shrink:0;width:120px;background:var(--bg-card);border-radius:var(--radius-card);
    padding:12px;box-shadow:var(--shadow-sm);cursor:pointer;
    border:1px solid color-mix(in srgb,var(--text-hint) 10%,transparent);
    transition:var(--motion);display:flex;flex-direction:column;gap:6px;
  }
  .music-playlist-card:active{transform:scale(var(--press-scale));}
  .music-playlist-card.active{border-color:var(--accent);background:color-mix(in srgb,var(--accent-light) 30%,var(--bg-card));}
  .music-playlist-cover{
    width:100%;aspect-ratio:1;border-radius:var(--radius-sm);
    background:linear-gradient(135deg,var(--accent) 0%,var(--accent-dark) 100%);
    color:var(--bubble-user-text);display:flex;align-items:center;justify-content:center;
  }
  .music-playlist-name{
    font-size:var(--font-size-small);font-weight:600;color:var(--text-primary);
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  }
  .music-playlist-count{font-size:var(--font-size-small);color:var(--text-hint);}
  .music-playlist-all{
    flex-shrink:0;width:120px;background:var(--bg-card);border-radius:var(--radius-card);
    padding:12px;box-shadow:var(--shadow-sm);cursor:pointer;
    border:1px solid color-mix(in srgb,var(--text-hint) 10%,transparent);
    transition:var(--motion);display:flex;flex-direction:column;gap:6px;
  }
  .music-playlist-all:active{transform:scale(var(--press-scale));}
  .music-playlist-all.active{border-color:var(--accent);background:color-mix(in srgb,var(--accent-light) 30%,var(--bg-card));}

  /* ── 歌曲列表 ── */
  .music-item{
    display:flex;align-items:center;gap:10px;
    background:var(--bg-card);border-radius:var(--radius-card);
    padding:10px 12px;margin-bottom:10px;box-shadow:var(--shadow-sm);
    border:1px solid transparent;transition:var(--motion);
  }
  .music-item:active{transform:scale(var(--press-scale));}
  .music-item.active{border-color:var(--accent);}
  .music-item-cover{
    width:44px;height:44px;border-radius:var(--radius-sm);flex-shrink:0;
    background-size:cover;background-position:center;background-color:var(--bg-secondary);
    display:flex;align-items:center;justify-content:center;color:var(--text-hint);
  }
  .music-item-main{flex:1;min-width:0;cursor:pointer;user-select:none;}
  .music-item-title{
    font-size:var(--font-size-base);font-weight:600;color:var(--text-primary);
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
    display:flex;align-items:center;gap:6px;
  }
  .music-item-sub{
    font-size:var(--font-size-small);color:var(--text-hint);
    margin-top:3px;display:flex;align-items:center;gap:5px;flex-wrap:wrap;
  }
  .music-item-hint{
    color:var(--accent-dark);font-size:var(--font-size-small);
    background:color-mix(in srgb,var(--accent-light) 60%,transparent);
    padding:1px 8px;border-radius:999px;
  }
  .music-playing-dot{
    width:7px;height:7px;border-radius:50%;background:var(--accent);
    display:inline-block;animation:musicPulse 1s ease-in-out infinite;
    flex-shrink:0;
  }
  @keyframes musicPulse{0%,100%{transform:scale(.7);opacity:.6}50%{transform:scale(1.1);opacity:1}}
  .music-item-actions{display:flex;align-items:center;gap:2px;flex-shrink:0;}
  .music-icon-btn{
    width:32px;height:32px;border-radius:50%;
    background:transparent;color:var(--text-hint);border:none;
    display:flex;align-items:center;justify-content:center;
    transition:var(--motion);cursor:pointer;
  }
  .music-icon-btn:active{transform:scale(var(--press-scale));}
  .music-empty-icon{opacity:.5;margin-bottom:12px;color:var(--text-hint);}
  .music-back-bar{
    display:flex;align-items:center;gap:8px;margin-bottom:10px;
  }
  .music-back-bar button{
    background:transparent;border:none;cursor:pointer;color:var(--text-secondary);
    display:flex;align-items:center;gap:4px;font-size:var(--font-size-small);
  }

  /* ── 歌单表单 sheet ── */
  .music-form-row{margin-bottom:14px;}
  .music-form-label{
    font-size:var(--font-size-small);color:var(--text-secondary);
    margin-bottom:6px;display:block;
  }
  .music-form-input{
    width:100%;padding:10px 12px;border-radius:var(--radius-sm);
    background:var(--bg-secondary);color:var(--text-primary);
    border:1px solid color-mix(in srgb,var(--text-hint) 20%,transparent);
    font-size:var(--font-size-base);font-family:inherit;
  }
  .music-pick-list{display:flex;flex-direction:column;gap:8px;}
  .music-pick-item{
    display:flex;align-items:center;gap:10px;padding:10px 12px;
    background:var(--bg-secondary);border-radius:var(--radius-sm);cursor:pointer;
    border:1px solid transparent;transition:var(--motion);
  }
  .music-pick-item:active{transform:scale(var(--press-scale));}
  .music-pick-item.added{opacity:.5;}
  .music-pick-item-name{flex:1;min-width:0;font-size:var(--font-size-base);color:var(--text-primary);
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .music-pick-item-count{font-size:var(--font-size-small);color:var(--text-hint);}

  @media (prefers-reduced-motion:reduce){
    .music-disc-wrap.spinning .music-disc,
    .music-disc-wrap.spinning .music-cover,
    .music-playing-dot{animation:none!important;}
  }

  /* ── 歌词面板 ── */
  .music-lyrics-card{
    position:relative;overflow:hidden;
    border-radius:var(--radius-card);
    padding:14px 16px;
    box-shadow:var(--shadow-sm);
    margin-bottom:16px;
    background:var(--bg-card);
  }
  .music-lyrics-head{
    display:flex;align-items:center;justify-content:space-between;
    margin-bottom:8px;
  }
  .music-lyrics-title{
    font-size:var(--font-size-small);color:var(--text-secondary);
    display:flex;align-items:center;gap:6px;font-weight:600;
  }
  .music-lyrics-title .popo-icon-svg{color:var(--accent)}
  .music-lyrics-upload{
    width:30px;height:30px;border-radius:50%;border:none;cursor:pointer;
    background:color-mix(in srgb,var(--accent) 14%,transparent);color:var(--accent-dark);
    display:flex;align-items:center;justify-content:center;transition:var(--motion);
  }
  .music-lyrics-upload:active{transform:scale(var(--press-scale))}
  .music-lyrics-body{
    max-height:220px;overflow-y:auto;-webkit-overflow-scrolling:touch;
    padding:8px 4px;mask-image:linear-gradient(to bottom,transparent 0%,#000 14%,#000 86%,transparent 100%);
    -webkit-mask-image:linear-gradient(to bottom,transparent 0%,#000 14%,#000 86%,transparent 100%);
    scrollbar-width:none;
  }
  .music-lyrics-body::-webkit-scrollbar{display:none;}
  .music-lyric-line{
    text-align:center;padding:8px 12px;font-size:var(--font-size-base);
    color:var(--text-hint);line-height:1.5;transition:color var(--motion),transform var(--motion);
    border-radius:var(--radius-sm);
  }
  .music-lyric-line.active{
    color:var(--accent-dark);font-weight:600;transform:scale(1.04);
  }
  .music-lyric-empty{
    text-align:center;padding:32px 12px;font-size:var(--font-size-small);
    color:var(--text-hint);
  }

  /* ── 视图切换 Tab ── */
  .music-tabs{
    display:flex;gap:6px;margin-bottom:10px;overflow-x:auto;
    -webkit-overflow-scrolling:touch;scrollbar-width:none;padding:2px;
  }
  .music-tabs::-webkit-scrollbar{display:none;}
  .music-tab{
    flex-shrink:0;padding:7px 14px;border-radius:999px;border:none;cursor:pointer;
    background:color-mix(in srgb,var(--bg-secondary) 70%,transparent);
    color:var(--text-secondary);font-size:var(--font-size-small);font-weight:500;
    transition:var(--motion);display:inline-flex;align-items:center;gap:4px;
  }
  .music-tab:active{transform:scale(var(--press-scale));}
  .music-tab.active{
    background:var(--accent);color:var(--bubble-user-text);
  }
  .music-tab .popo-icon-svg{color:inherit;}

  /* ── 队列项 ── */
  .music-queue-item{
    display:flex;align-items:center;gap:8px;
    background:var(--bg-card);border-radius:var(--radius-card);
    padding:8px 10px;margin-bottom:8px;box-shadow:var(--shadow-sm);
    border:1px solid transparent;transition:var(--motion);
  }
  .music-queue-item:active{transform:scale(var(--press-scale));}
  .music-queue-item.current{border-color:var(--accent);background:color-mix(in srgb,var(--accent-light) 24%,var(--bg-card));}
  .music-queue-index{
    width:22px;height:22px;border-radius:50%;flex-shrink:0;
    background:color-mix(in srgb,var(--text-hint) 30%,transparent);
    color:var(--text-secondary);font-size:11px;font-weight:600;
    display:flex;align-items:center;justify-content:center;
  }
  .music-queue-item.current .music-queue-index{
    background:var(--accent);color:var(--bubble-user-text);
  }
  .music-queue-info{flex:1;min-width:0;cursor:pointer;}
  .music-queue-title{
    font-size:var(--font-size-base);font-weight:600;color:var(--text-primary);
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  }
  .music-queue-sub{font-size:var(--font-size-small);color:var(--text-hint);margin-top:2px;}
  .music-queue-actions{display:flex;align-items:center;gap:2px;flex-shrink:0;}
  .music-queue-btn{
    width:28px;height:28px;border-radius:50%;border:none;cursor:pointer;
    background:transparent;color:var(--text-hint);
    display:flex;align-items:center;justify-content:center;transition:var(--motion);
  }
  .music-queue-btn:active{transform:scale(var(--press-scale));}
  .music-queue-btn.danger{color:var(--danger);}
  .music-queue-toolbar{
    display:flex;align-items:center;justify-content:space-between;
    margin-bottom:8px;
  }
  .music-queue-count{font-size:var(--font-size-small);color:var(--text-secondary);}
  .music-queue-clear{
    padding:5px 12px;border-radius:999px;border:none;cursor:pointer;
    background:color-mix(in srgb,var(--danger) 14%,transparent);color:var(--danger);
    font-size:var(--font-size-small);transition:var(--motion);
    display:inline-flex;align-items:center;gap:4px;
  }
  .music-queue-clear:active{transform:scale(var(--press-scale));}

  /* 收藏心心按钮：未收藏是灰，收藏后是软萌粉红 */
  .music-fav-btn{
    width:32px;height:32px;border-radius:50%;border:none;cursor:pointer;
    background:transparent;color:var(--text-hint);
    display:flex;align-items:center;justify-content:center;transition:var(--motion);
  }
  .music-fav-btn:active{transform:scale(var(--press-scale));}
  .music-fav-btn.on{color:var(--danger);}
  `);
}
