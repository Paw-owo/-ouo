// apps/games/styles.js
// 小游戏合集的全部样式 —— 集中在这里，方便统一调风格。
// 所有颜色 / 圆角 / 阴影都走 CSS 变量，6 套主题下都能看。
// 红线：图标只用 SVG 线稿，禁止任何 emoji 字符；视觉值走 CSS 变量。

import { injectStyle } from '../../core/util.js';

export function injectGameStyles() {
  injectStyle('app-games-style', `
  /* ── 顶部 Tab 选择条 ── */
  .games-tabs{
    display:flex;gap:8px;margin-bottom:16px;
    overflow-x:auto;-webkit-overflow-scrolling:touch;
    padding-bottom:2px;scrollbar-width:none;
  }
  .games-tabs::-webkit-scrollbar{display:none;}
  .games-tab{
    flex-shrink:0;padding:9px 18px;border-radius:999px;
    background:color-mix(in srgb,var(--bg-secondary) 70%,transparent);
    color:var(--text-secondary);font-size:var(--font-size-base);
    font-weight:500;border:none;cursor:pointer;transition:var(--motion);
    display:inline-flex;align-items:center;gap:6px;
  }
  .games-tab:active{transform:scale(var(--press-scale));}
  .games-tab.active{
    background:var(--accent);color:var(--bubble-user-text);
    box-shadow:var(--shadow-sm);
  }
  .games-tab .popo-icon{display:inline-flex;}

  /* ── 游戏说明卡片 ── */
  .games-info{
    background:color-mix(in srgb,var(--accent-light) 35%,var(--bg-card));
    border-radius:var(--radius-card);padding:12px 14px;margin-bottom:14px;
    display:flex;gap:10px;align-items:flex-start;
    border:1px solid color-mix(in srgb,var(--accent) 18%,transparent);
  }
  .games-info-icon{color:var(--accent-dark);display:flex;flex-shrink:0;margin-top:1px;}
  .games-info-text{
    font-size:var(--font-size-small);color:var(--text-secondary);
    line-height:1.55;flex:1;min-width:0;
  }

  /* ── 塔罗 ── */
  .tarot-action{margin-bottom:14px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;}
  .tarot-spread-row{
    display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;
  }
  .tarot-cards{display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap;}
  .tarot-card{
    flex:1;min-width:90px;background:var(--bg-card);
    border-radius:var(--radius-card);padding:14px 8px;
    box-shadow:var(--shadow-sm);text-align:center;
    border:1px solid color-mix(in srgb,var(--text-hint) 14%,transparent);
    transition:var(--motion);position:relative;
  }
  .tarot-card.reversed{
    background:color-mix(in srgb,var(--accent-light) 35%,var(--bg-card));
  }
  .tarot-card.reversed .tarot-card-icon{transform:rotate(180deg);}
  .tarot-card-icon{
    color:var(--accent-dark);display:flex;justify-content:center;
    margin-bottom:6px;line-height:1;transition:transform var(--motion);
  }
  .tarot-card-name{font-size:var(--font-size-base);font-weight:600;color:var(--text-primary);}
  .tarot-card-pos{
    font-size:var(--font-size-small);color:var(--accent-dark);
    margin-top:2px;font-weight:500;
  }
  .tarot-card-keyword{
    font-size:var(--font-size-small);color:var(--text-hint);margin-top:2px;
  }
  .tarot-card-slot{
    font-size:var(--font-size-small);color:var(--accent-dark);
    margin-bottom:4px;font-weight:600;
  }
  .tarot-meaning{
    background:var(--bg-card);border-radius:var(--radius-card);
    padding:14px 16px;margin-bottom:10px;box-shadow:var(--shadow-sm);
  }
  .tarot-meaning-title{
    font-size:var(--font-size-small);color:var(--text-secondary);
    font-weight:600;margin-bottom:4px;
  }
  .tarot-meaning-text{font-size:var(--font-size-base);color:var(--text-primary);line-height:1.55;}
  .tarot-reading{
    background:linear-gradient(135deg,var(--accent) 0%,var(--accent-dark) 100%);
    color:var(--bubble-user-text);border-radius:var(--radius-card);
    padding:16px 18px;margin-bottom:18px;box-shadow:var(--shadow-md);
    font-size:var(--font-size-base);line-height:1.6;
  }
  .tarot-reading-label{font-size:var(--font-size-small);opacity:.85;margin-bottom:4px;display:flex;align-items:center;gap:6px;}
  .tarot-loading{
    background:var(--bg-card);border-radius:var(--radius-card);
    padding:14px 16px;margin-bottom:10px;color:var(--text-secondary);
    font-size:var(--font-size-small);display:flex;align-items:center;gap:8px;
  }

  /* ── 真心话 / 大冒险 ── */
  .truth-actions{display:flex;gap:10px;margin-bottom:16px;}
  .truth-btn{
    flex:1;padding:14px 12px;border-radius:var(--radius-card);
    background:var(--bg-card);border:1px solid color-mix(in srgb,var(--text-hint) 18%,transparent);
    color:var(--text-primary);font-size:var(--font-size-base);font-weight:600;
    cursor:pointer;transition:var(--motion);
    display:flex;flex-direction:column;align-items:center;gap:6px;
  }
  .truth-btn:active{transform:scale(var(--press-scale));}
  .truth-btn.truth{color:var(--accent-dark);}
  .truth-btn.dare{color:#E8888C;}
  .truth-btn .popo-icon{display:flex;}
  .truth-card{
    background:var(--bg-card);border-radius:var(--radius-card);
    padding:22px 18px;margin-bottom:14px;box-shadow:var(--shadow-sm);
    text-align:center;
  }
  .truth-card-label{
    font-size:var(--font-size-small);color:var(--text-hint);
    margin-bottom:8px;display:flex;align-items:center;justify-content:center;gap:6px;
  }
  .truth-card-q{font-size:var(--font-size-title);font-weight:600;color:var(--text-primary);line-height:1.5;}
  .truth-card-actions{margin-top:14px;display:flex;justify-content:center;gap:8px;flex-wrap:wrap;}
  .truth-answer{
    margin-top:14px;display:flex;flex-direction:column;gap:8px;
  }
  .truth-answer textarea{
    width:100%;min-height:64px;resize:vertical;
    background:var(--bg-secondary);color:var(--text-primary);
    border:1px solid color-mix(in srgb,var(--text-hint) 20%,transparent);
    border-radius:var(--radius-sm);padding:10px 12px;
    font-size:var(--font-size-base);font-family:inherit;line-height:1.5;
  }
  .truth-comment{
    background:color-mix(in srgb,var(--accent-light) 30%,var(--bg-card));
    border-radius:var(--radius-card);padding:12px 14px;margin-top:10px;
    font-size:var(--font-size-base);color:var(--text-primary);line-height:1.55;
    display:flex;gap:8px;align-items:flex-start;
  }
  .truth-comment-icon{color:var(--accent-dark);display:flex;flex-shrink:0;margin-top:1px;}

  /* ── 谁是卧底 ── */
  .uc-phase{
    font-size:var(--font-size-small);color:var(--accent-dark);
    font-weight:600;margin-bottom:10px;display:flex;align-items:center;gap:6px;
  }
  .uc-word-card{
    background:linear-gradient(135deg,var(--accent) 0%,var(--accent-dark) 100%);
    color:var(--bubble-user-text);border-radius:var(--radius-card);
    padding:24px 18px;text-align:center;box-shadow:var(--shadow-md);
    margin-bottom:14px;
  }
  .uc-word-label{font-size:var(--font-size-small);opacity:.85;margin-bottom:6px;}
  .uc-word-text{font-size:28px;font-weight:700;letter-spacing:2px;}
  .uc-word-hint{font-size:var(--font-size-small);opacity:.85;margin-top:8px;}
  .uc-speeches{display:flex;flex-direction:column;gap:10px;margin-bottom:14px;}
  .uc-speech{
    background:var(--bg-card);border-radius:var(--radius-card);
    padding:12px 14px;box-shadow:var(--shadow-sm);
    display:flex;gap:10px;align-items:flex-start;
  }
  .uc-speech.me{
    background:color-mix(in srgb,var(--accent-light) 35%,var(--bg-card));
  }
  .uc-speech-avatar{
    width:32px;height:32px;border-radius:50%;flex-shrink:0;
    background:color-mix(in srgb,var(--accent) 18%,transparent);
    color:var(--accent-dark);display:flex;align-items:center;justify-content:center;
    font-size:var(--font-size-small);font-weight:600;
  }
  .uc-speech-avatar.me{background:var(--accent);color:var(--bubble-user-text);}
  .uc-speech-main{flex:1;min-width:0;}
  .uc-speech-name{font-size:var(--font-size-small);color:var(--text-hint);margin-bottom:2px;}
  .uc-speech-text{font-size:var(--font-size-base);color:var(--text-primary);line-height:1.5;}
  .uc-input-row{display:flex;gap:8px;margin-bottom:14px;}
  .uc-input-row textarea{
    flex:1;min-height:48px;resize:vertical;
    background:var(--bg-secondary);color:var(--text-primary);
    border:1px solid color-mix(in srgb,var(--text-hint) 20%,transparent);
    border-radius:var(--radius-sm);padding:10px 12px;
    font-size:var(--font-size-base);font-family:inherit;line-height:1.5;
  }
  .uc-vote-row{display:flex;flex-direction:column;gap:8px;margin-bottom:14px;}
  .uc-vote-btn{
    background:var(--bg-card);border-radius:var(--radius-card);
    padding:12px 14px;box-shadow:var(--shadow-sm);cursor:pointer;
    display:flex;align-items:center;gap:10px;
    border:1px solid color-mix(in srgb,var(--text-hint) 14%,transparent);
    transition:var(--motion);
  }
  .uc-vote-btn:active{transform:scale(var(--press-scale));}
  .uc-vote-btn .uc-speech-avatar{width:28px;height:28px;}
  .uc-result{
    background:linear-gradient(135deg,var(--accent) 0%,var(--accent-dark) 100%);
    color:var(--bubble-user-text);border-radius:var(--radius-card);
    padding:18px;text-align:center;box-shadow:var(--shadow-md);
    margin-bottom:14px;
  }
  .uc-result-tag{font-size:var(--font-size-small);opacity:.85;margin-bottom:6px;}
  .uc-result-text{font-size:var(--font-size-title);font-weight:700;line-height:1.5;}
  .uc-result-words{
    margin-top:10px;font-size:var(--font-size-small);opacity:.9;
    display:flex;gap:8px;justify-content:center;flex-wrap:wrap;
  }
  .uc-result-words span{
    background:rgba(255,255,255,.18);padding:2px 10px;border-radius:999px;
  }

  /* ── 骗子酒馆 ── */
  .tavern-scene{
    background:var(--bg-card);border-radius:var(--radius-card);
    padding:16px;margin-bottom:12px;box-shadow:var(--shadow-sm);
  }
  .tavern-scene-num{
    font-size:var(--font-size-small);color:var(--accent-dark);
    font-weight:600;margin-bottom:8px;display:flex;align-items:center;gap:6px;
  }
  .tavern-line{
    font-size:var(--font-size-base);color:var(--text-primary);line-height:1.65;
    margin-bottom:6px;
  }
  .tavern-line.narration{color:var(--text-secondary);font-style:italic;}
  .tavern-choices{display:flex;flex-direction:column;gap:8px;margin-top:12px;}
  .tavern-choice{
    background:var(--bg-secondary);border:1px solid color-mix(in srgb,var(--text-hint) 16%,transparent);
    border-radius:var(--radius-sm);padding:11px 14px;cursor:pointer;
    text-align:left;color:var(--text-primary);font-size:var(--font-size-base);
    transition:var(--motion);
  }
  .tavern-choice:active{transform:scale(var(--press-scale));}
  .tavern-choice:hover{border-color:var(--accent);}
  .tavern-ending{
    background:linear-gradient(135deg,var(--accent) 0%,var(--accent-dark) 100%);
    color:var(--bubble-user-text);border-radius:var(--radius-card);
    padding:18px;text-align:center;box-shadow:var(--shadow-md);
    margin-bottom:14px;
  }
  .tavern-ending-label{font-size:var(--font-size-small);opacity:.85;margin-bottom:6px;}
  .tavern-ending-text{font-size:var(--font-size-title);font-weight:700;line-height:1.5;}

  /* ── 骰子（保留原有玩法）── */
  .dice-area{
    background:var(--bg-card);border-radius:var(--radius-card);
    padding:28px 18px;margin-bottom:14px;box-shadow:var(--shadow-sm);
    text-align:center;
  }
  .dice-row{display:flex;justify-content:center;gap:18px;flex-wrap:wrap;}
  .dice-block{display:flex;flex-direction:column;align-items:center;gap:8px;}
  .dice-icon-wrap{
    width:84px;height:84px;border-radius:var(--radius-card);
    background:color-mix(in srgb,var(--accent-light) 40%,transparent);
    display:flex;align-items:center;justify-content:center;
    color:var(--accent-dark);
  }
  .dice-icon-wrap.rolling{animation:diceShake .4s ease-in-out infinite;}
  @keyframes diceShake{
    0%,100%{transform:rotate(0) translateY(0);}
    25%{transform:rotate(-12deg) translateY(-4px);}
    75%{transform:rotate(12deg) translateY(-2px);}
  }
  .dice-number{font-size:36px;font-weight:700;color:var(--text-primary);line-height:1;font-variant-numeric:tabular-nums;}
  .dice-label{font-size:var(--font-size-small);color:var(--text-hint);}
  .dice-sum{margin-top:18px;font-size:var(--font-size-base);color:var(--text-secondary);}
  .dice-sum b{color:var(--accent-dark);font-size:var(--font-size-title);}
  .dice-controls{display:flex;justify-content:center;gap:10px;margin-top:18px;flex-wrap:wrap;align-items:center;}

  /* ── 通用历史列表 ── */
  .games-history-title{
    font-size:var(--font-size-small);color:var(--text-secondary);
    margin:6px 2px 10px;font-weight:600;
  }
  .games-history-item{
    background:var(--bg-card);border-radius:var(--radius-card);
    padding:12px 14px;margin-bottom:10px;box-shadow:var(--shadow-sm);
    display:flex;align-items:flex-start;gap:10px;
  }
  .games-history-main{flex:1;min-width:0;}
  .games-history-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
  .games-history-tag{
    font-size:var(--font-size-small);color:var(--accent-dark);
    background:color-mix(in srgb,var(--accent-light) 50%,transparent);
    padding:1px 8px;border-radius:999px;font-weight:500;
  }
  .games-history-tag.dare{color:#E8888C;background:color-mix(in srgb,#E8888C 18%,transparent);}
  .games-history-tag.undercover{color:#7A9BE0;background:color-mix(in srgb,#7A9BE0 18%,transparent);}
  .games-history-tag.tavern{color:#B07AE0;background:color-mix(in srgb,#B07AE0 18%,transparent);}
  .games-history-time{font-size:var(--font-size-small);color:var(--text-hint);}
  .games-history-text{font-size:var(--font-size-base);color:var(--text-primary);margin-top:4px;line-height:1.5;}
  .games-history-sub{font-size:var(--font-size-small);color:var(--text-secondary);margin-top:3px;line-height:1.45;}
  .games-history-cards{
    display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;
    font-size:var(--font-size-small);color:var(--text-secondary);
  }
  .games-history-cards span{
    background:color-mix(in srgb,var(--bg-secondary) 70%,transparent);
    padding:2px 8px;border-radius:999px;
  }
  .games-history-del{
    width:30px;height:30px;border-radius:50%;flex-shrink:0;
    background:transparent;color:var(--text-hint);border:none;
    display:flex;align-items:center;justify-content:center;transition:var(--motion);
  }
  .games-history-del:active{transform:scale(var(--press-scale));}
  .games-empty-icon{opacity:.5;margin-bottom:12px;color:var(--text-hint);}

  /* ── 通用按钮组 ── */
  .games-btn-row{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;}
  .games-mini-tabs{display:flex;gap:6px;}
  .games-mini-tabs .games-tab{padding:6px 14px;font-size:var(--font-size-small);}

  @media (prefers-reduced-motion:reduce){
    .dice-icon-wrap.rolling{animation:none!important;}
    .tarot-card.reversed .tarot-card-icon{transform:none!important;}
  }
  `);
}
