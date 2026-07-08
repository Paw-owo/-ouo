// ============================================
// theme-presets.js — 6套主题色值，唯一来源
// 日间3套 + 夜间3套，由 core/theme.js 读取写入 CSS 变量槽位
//
// 日间：
//   1. berry-cloud        莓莓云顶奶   (默认)
//   2. taro-coconut       芋泥椰奶冻
//   3. coconut-americano  椰青冰美式
//
// 夜间：
//   4. night-milk-brown   夜奶棕
//   5. night-black-pink   夜黑粉
//   6. night-coffee       夜咖色
// ============================================

const THEME_PRESETS = {

  // ==========================================
  // 1. 莓莓云顶奶 — 默认主题
  // 蓝粉奶油糖纸，最梦幻、最软、最讨喜
  // 参考：蓝=#D1E3FF 粉白底=#FFF4F5 雾蓝=#E2F3FF 糖霜粉=#FAC7DA
  // ==========================================
  'berry-cloud': {
    label: '莓莓云顶奶',
    mode: 'light',
    swatch: 'linear-gradient(135deg, #FAC7DA, #D1E3FF)',
    colors: {
      // 背景
      '--bg-base':                 '#FFF4F5',
      '--bg-surface':              '#F9EEF0',
      '--bg-hover':                '#F3E6E9',
      '--bg-glass':                'rgba(255,244,245,0.88)',
      '--bg-mask':                 'rgba(100,80,85,0.25)',

      // 主色系（糖霜粉 = 重点、按钮、小装饰）
      '--color-primary':           '#FAC7DA',
      '--color-primary-light':     '#FCDEE9',
      '--color-primary-ultralight':'#FDE8F0',
      '--color-primary-deep':      '#E8A8C0',

      // 辅色（雾蓝 = 气氛、卡片、胶囊浅层）
      '--color-accent':            '#E2F3FF',
      '--color-accent-light':      '#F0F8FF',

      // 文字（柔粉棕，不纯黑）
      '--text-primary':            '#6B5A60',
      '--text-secondary':          '#9B8A90',
      '--text-placeholder':        '#C8B8BC',

      // 阴影（粉系半透明）
      '--shadow-soft':             '0 2px 8px rgba(210,180,190,0.10)',
      '--shadow-card':             '0 4px 16px rgba(210,180,190,0.12)',
      '--shadow-float':            '0 8px 24px rgba(210,180,190,0.15)',
      '--shadow-neu-out':          '4px 4px 10px rgba(210,180,190,0.10), -4px -4px 10px rgba(255,244,245,0.9)',
      '--shadow-neu-in':           'inset 2px 2px 6px rgba(210,180,190,0.08), inset -2px -2px 6px rgba(255,244,245,0.8)',

      // 功能色
      '--color-success':           '#8CB88A',
      '--color-warning':           '#D8C898',
      '--color-error':             '#D8A0A8',
      '--color-info':              '#A0B8D8',

      // 图标（蓝底 + 粉线稿，蓝粉都带出来）
      '--icon-stroke':             '#C49DB0',
      '--icon-tile-bg':            '#D1E3FF',
      '--icon-tile-pattern':       '#C0D8F8',
      '--icon-stitch':             '#C49DB0',
      '--icon-inner':              '#FFFDFD',
      '--icon-shadow':             '0 3px 10px rgba(190,170,200,0.12)',
      '--icon-shadow-near':        '0 1px 3px rgba(190,170,200,0.08)',
      '--icon-shadow-inset-top':   'inset 0 1px 0 rgba(255,253,253,0.95)',
      '--icon-shadow-inset-btm':   'inset 0 -1px 0 rgba(190,170,200,0.06)',
      '--icon-deco':               '#FAC7DA',

      // 装饰
      '--deco-primary':            '#FAC7DA',
      '--deco-secondary':          '#D1E3FF',
      '--texture-dot':             'rgba(210,180,195,0.06)',

      // dock / 状态胶囊
      '--dock-bg':                 'rgba(255,244,245,0.88)',
      '--capsule-bg':              'rgba(255,244,245,0.85)',

      // 边框
      '--border-color':            'rgba(220,195,200,0.15)',
    }
  },

  // ==========================================
  // 2. 芋泥椰奶冻 — 紫色系
  // 紫雾感、奶甜、轻盈
  // 参考：主色=#D5CFEC 辅助浅紫=#EDECFA 页面浅底=#F8F6FB 强调紫=#CAB7E3
  // ==========================================
  'taro-coconut': {
    label: '芋泥椰奶冻',
    mode: 'light',
    swatch: 'linear-gradient(135deg, #D5CFEC, #CAB7E3)',
    colors: {
      '--bg-base':                 '#F8F6FB',
      '--bg-surface':              '#F2EFF7',
      '--bg-hover':                '#EBE7F2',
      '--bg-glass':                'rgba(248,246,251,0.88)',
      '--bg-mask':                 'rgba(80,70,95,0.25)',

      '--color-primary':           '#D5CFEC',
      '--color-primary-light':     '#E5E0F4',
      '--color-primary-ultralight':'#F2EFF7',
      '--color-primary-deep':      '#BEB5D8',

      '--color-accent':            '#CAB7E3',
      '--color-accent-light':      '#E0D8F0',

      '--text-primary':            '#5B4E6B',
      '--text-secondary':          '#8B7E9B',
      '--text-placeholder':        '#B8AEC8',

      '--shadow-soft':             '0 2px 8px rgba(180,170,200,0.10)',
      '--shadow-card':             '0 4px 16px rgba(180,170,200,0.12)',
      '--shadow-float':            '0 8px 24px rgba(180,170,200,0.15)',
      '--shadow-neu-out':          '4px 4px 10px rgba(180,170,200,0.10), -4px -4px 10px rgba(248,246,251,0.9)',
      '--shadow-neu-in':           'inset 2px 2px 6px rgba(180,170,200,0.08), inset -2px -2px 6px rgba(248,246,251,0.8)',

      '--color-success':           '#8CB88A',
      '--color-warning':           '#D8C898',
      '--color-error':             '#D8A0A8',
      '--color-info':              '#A0B8D8',

      // 图标（浅紫底 + 强调紫线稿）
      '--icon-stroke':             '#CAB7E3',
      '--icon-tile-bg':            '#EDECFA',
      '--icon-tile-pattern':       '#E0DCF0',
      '--icon-stitch':             '#CAB7E3',
      '--icon-inner':              '#FFFCFD',
      '--icon-shadow':             '0 3px 10px rgba(180,170,200,0.12)',
      '--icon-shadow-near':        '0 1px 3px rgba(180,170,200,0.08)',
      '--icon-shadow-inset-top':   'inset 0 1px 0 rgba(255,252,253,0.95)',
      '--icon-shadow-inset-btm':   'inset 0 -1px 0 rgba(180,170,200,0.06)',
      '--icon-deco':               '#CAB7E3',

      '--deco-primary':            '#D5CFEC',
      '--deco-secondary':          '#CAB7E3',
      '--texture-dot':             'rgba(190,180,210,0.06)',

      '--dock-bg':                 'rgba(248,246,251,0.88)',
      '--capsule-bg':              'rgba(248,246,251,0.85)',

      '--border-color':            'rgba(200,190,215,0.15)',
    }
  },

  // ==========================================
  // 3. 椰青冰美式 — 蓝棕系
  // 浅蓝空气感 + 奶咖平衡，蓝只做气氛
  // 参考：天空浅蓝=#E1EFF4 冷棕=#9D7C6D 奶咖底=#EDDFD4 深色文字=#512128
  // ==========================================
  'coconut-americano': {
    label: '椰青冰美式',
    mode: 'light',
    swatch: 'linear-gradient(135deg, #9D7C6D, #E1EFF4)',
    colors: {
      '--bg-base':                 '#EDDFD4',
      '--bg-surface':              '#E7D8CB',
      '--bg-hover':                '#E0CFC0',
      '--bg-glass':                'rgba(237,223,212,0.88)',
      '--bg-mask':                 'rgba(70,30,40,0.25)',

      '--color-primary':           '#9D7C6D',
      '--color-primary-light':     '#B8A094',
      '--color-primary-ultralight':'#DDD3CC',
      '--color-primary-deep':      '#8A6B5C',

      '--color-accent':            '#E1EFF4',
      '--color-accent-light':      '#F0F6FA',

      '--text-primary':            '#512128',
      '--text-secondary':          '#8B5B5E',
      '--text-placeholder':        '#B8A49B',

      '--shadow-soft':             '0 2px 8px rgba(140,108,94,0.10)',
      '--shadow-card':             '0 4px 16px rgba(140,108,94,0.12)',
      '--shadow-float':            '0 8px 24px rgba(140,108,94,0.15)',
      '--shadow-neu-out':          '4px 4px 10px rgba(140,108,94,0.10), -4px -4px 10px rgba(237,223,212,0.9)',
      '--shadow-neu-in':           'inset 2px 2px 6px rgba(140,108,94,0.08), inset -2px -2px 6px rgba(237,223,212,0.8)',

      '--color-success':           '#8CB88A',
      '--color-warning':           '#D8C898',
      '--color-error':             '#D8A0A8',
      '--color-info':              '#A0B8D8',

      // 图标（浅蓝底 + 冷棕线稿）
      '--icon-stroke':             '#9D7C6D',
      '--icon-tile-bg':            '#E1EFF4',
      '--icon-tile-pattern':       '#D0E2EC',
      '--icon-stitch':             '#9D7C6D',
      '--icon-inner':              '#FFFCFA',
      '--icon-shadow':             '0 3px 10px rgba(140,108,94,0.12)',
      '--icon-shadow-near':        '0 1px 3px rgba(140,108,94,0.08)',
      '--icon-shadow-inset-top':   'inset 0 1px 0 rgba(255,252,250,0.95)',
      '--icon-shadow-inset-btm':   'inset 0 -1px 0 rgba(140,108,94,0.06)',
      '--icon-deco':               '#9D7C6D',

      '--deco-primary':            '#9D7C6D',
      '--deco-secondary':          '#E1EFF4',
      '--texture-dot':             'rgba(140,108,94,0.05)',

      '--dock-bg':                 'rgba(237,223,212,0.88)',
      '--capsule-bg':              'rgba(237,223,212,0.85)',

      '--border-color':            'rgba(150,120,105,0.15)',
    }
  },

  // ==========================================
  // 4. 夜奶棕 — 暗奶感，不做死黑
  // 参考：主色=#CDB8AB 辅助深棕=#8E6F63 深底=#2B2321 奶白强调=#F3E3D8
  // ==========================================
  'night-milk-brown': {
    label: '夜奶棕',
    mode: 'dark',
    swatch: 'linear-gradient(135deg, #CDB8AB, #2B2321)',
    colors: {
      '--bg-base':                 '#2B2321',
      '--bg-surface':              '#352D2A',
      '--bg-hover':                '#403732',
      '--bg-glass':                'rgba(43,35,33,0.92)',
      '--bg-mask':                 'rgba(10,8,5,0.40)',

      '--color-primary':           '#CDB8AB',
      '--color-primary-light':     '#8E6F63',
      '--color-primary-ultralight':'#4A3D38',
      '--color-primary-deep':      '#E8D8CC',

      '--color-accent':            '#F3E3D8',
      '--color-accent-light':      '#FAF0E8',

      '--text-primary':            '#E8D8C8',
      '--text-secondary':          '#B8A898',
      '--text-placeholder':        '#7A6C60',

      '--shadow-soft':             '0 2px 8px rgba(10,8,5,0.30)',
      '--shadow-card':             '0 4px 16px rgba(10,8,5,0.40)',
      '--shadow-float':            '0 8px 24px rgba(10,8,5,0.50)',
      '--shadow-neu-out':          '4px 4px 10px rgba(10,8,5,0.35), -4px -4px 10px rgba(53,45,42,0.5)',
      '--shadow-neu-in':           'inset 2px 2px 6px rgba(10,8,5,0.30), inset -2px -2px 6px rgba(53,45,42,0.4)',

      '--color-success':           '#7AAC78',
      '--color-warning':           '#C8B878',
      '--color-error':             '#C89090',
      '--color-info':              '#90A8C8',

      // 图标（深底 + 奶棕线稿）
      '--icon-stroke':             '#CDB8AB',
      '--icon-tile-bg':            '#4A3D38',
      '--icon-tile-pattern':       '#5A4D48',
      '--icon-stitch':             '#CDB8AB',
      '--icon-inner':              '#3D3530',
      '--icon-shadow':             '0 3px 10px rgba(10,8,5,0.35)',
      '--icon-shadow-near':        '0 1px 3px rgba(10,8,5,0.25)',
      '--icon-shadow-inset-top':   'inset 0 1px 0 rgba(74,64,56,0.6)',
      '--icon-shadow-inset-btm':   'inset 0 -1px 0 rgba(10,8,5,0.20)',
      '--icon-deco':               '#CDB8AB',

      '--deco-primary':            '#CDB8AB',
      '--deco-secondary':          '#8E6F63',
      '--texture-dot':             'rgba(205,184,171,0.04)',

      '--dock-bg':                 'rgba(43,35,33,0.92)',
      '--capsule-bg':              'rgba(43,35,33,0.88)',

      '--border-color':            'rgba(205,184,171,0.08)',
    }
  },

  // ==========================================
  // 5. 夜黑粉 — 暗粉感，不做死黑
  // 参考：主色=#F0B7CC 辅助莓粉棕=#8C6475 深底=#1F1A1D 粉白强调=#F8E7EE
  // ==========================================
  'night-black-pink': {
    label: '夜黑粉',
    mode: 'dark',
    swatch: 'linear-gradient(135deg, #F0B7CC, #1F1A1D)',
    colors: {
      '--bg-base':                 '#1F1A1D',
      '--bg-surface':              '#2A2428',
      '--bg-hover':                '#352E33',
      '--bg-glass':                'rgba(31,26,29,0.92)',
      '--bg-mask':                 'rgba(8,6,7,0.40)',

      '--color-primary':           '#F0B7CC',
      '--color-primary-light':     '#8C6475',
      '--color-primary-ultralight':'#3D2A32',
      '--color-primary-deep':      '#F8D0DE',

      '--color-accent':            '#F8E7EE',
      '--color-accent-light':      '#FCF4F7',

      '--text-primary':            '#E8D0D8',
      '--text-secondary':          '#B898A0',
      '--text-placeholder':        '#7A6068',

      '--shadow-soft':             '0 2px 8px rgba(8,6,7,0.30)',
      '--shadow-card':             '0 4px 16px rgba(8,6,7,0.40)',
      '--shadow-float':            '0 8px 24px rgba(8,6,7,0.50)',
      '--shadow-neu-out':          '4px 4px 10px rgba(8,6,7,0.35), -4px -4px 10px rgba(42,36,40,0.5)',
      '--shadow-neu-in':           'inset 2px 2px 6px rgba(8,6,7,0.30), inset -2px -2px 6px rgba(42,36,40,0.4)',

      '--color-success':           '#7AAC78',
      '--color-warning':           '#C8B878',
      '--color-error':             '#C89090',
      '--color-info':              '#90A8C8',

      // 图标（深紫棕底 + 柔雾粉线稿）
      '--icon-stroke':             '#F0B7CC',
      '--icon-tile-bg':            '#3D2A32',
      '--icon-tile-pattern':       '#4D3A42',
      '--icon-stitch':             '#F0B7CC',
      '--icon-inner':              '#352A30',
      '--icon-shadow':             '0 3px 10px rgba(8,6,7,0.35)',
      '--icon-shadow-near':        '0 1px 3px rgba(8,6,7,0.25)',
      '--icon-shadow-inset-top':   'inset 0 1px 0 rgba(61,42,50,0.6)',
      '--icon-shadow-inset-btm':   'inset 0 -1px 0 rgba(8,6,7,0.20)',
      '--icon-deco':               '#F0B7CC',

      '--deco-primary':            '#F0B7CC',
      '--deco-secondary':          '#8C6475',
      '--texture-dot':             'rgba(240,183,204,0.04)',

      '--dock-bg':                 'rgba(31,26,29,0.92)',
      '--capsule-bg':              'rgba(31,26,29,0.88)',

      '--border-color':            'rgba(240,183,204,0.08)',
    }
  },

  // ==========================================
  // 6. 夜咖色 — 深咖夜底，不做死黑
  // 参考：主色=#B7927C 辅助深咖=#6E5146 深底=#241C19 奶咖强调=#EED8C8
  // ==========================================
  'night-coffee': {
    label: '夜咖色',
    mode: 'dark',
    swatch: 'linear-gradient(135deg, #B7927C, #241C19)',
    colors: {
      '--bg-base':                 '#241C19',
      '--bg-surface':              '#2E2521',
      '--bg-hover':                '#38302A',
      '--bg-glass':                'rgba(36,28,25,0.92)',
      '--bg-mask':                 'rgba(8,6,4,0.40)',

      '--color-primary':           '#B7927C',
      '--color-primary-light':     '#6E5146',
      '--color-primary-ultralight':'#3D2E28',
      '--color-primary-deep':      '#D4B098',

      '--color-accent':            '#EED8C8',
      '--color-accent-light':      '#F5E8DE',

      '--text-primary':            '#E8D8C8',
      '--text-secondary':          '#B8A898',
      '--text-placeholder':        '#7A6C58',

      '--shadow-soft':             '0 2px 8px rgba(8,6,4,0.30)',
      '--shadow-card':             '0 4px 16px rgba(8,6,4,0.40)',
      '--shadow-float':            '0 8px 24px rgba(8,6,4,0.50)',
      '--shadow-neu-out':          '4px 4px 10px rgba(8,6,4,0.35), -4px -4px 10px rgba(46,37,33,0.5)',
      '--shadow-neu-in':           'inset 2px 2px 6px rgba(8,6,4,0.30), inset -2px -2px 6px rgba(46,37,33,0.4)',

      '--color-success':           '#7AAC78',
      '--color-warning':           '#C8B878',
      '--color-error':             '#C89090',
      '--color-info':              '#90A8C8',

      // 图标（深咖底 + 焦糖咖线稿）
      '--icon-stroke':             '#B7927C',
      '--icon-tile-bg':            '#3D2E28',
      '--icon-tile-pattern':       '#4D3E38',
      '--icon-stitch':             '#B7927C',
      '--icon-inner':              '#352A25',
      '--icon-shadow':             '0 3px 10px rgba(8,6,4,0.35)',
      '--icon-shadow-near':        '0 1px 3px rgba(8,6,4,0.25)',
      '--icon-shadow-inset-top':   'inset 0 1px 0 rgba(61,46,40,0.6)',
      '--icon-shadow-inset-btm':   'inset 0 -1px 0 rgba(8,6,4,0.20)',
      '--icon-deco':               '#B7927C',

      '--deco-primary':            '#B7927C',
      '--deco-secondary':          '#6E5146',
      '--texture-dot':             'rgba(183,146,124,0.04)',

      '--dock-bg':                 'rgba(36,28,25,0.92)',
      '--capsule-bg':              'rgba(36,28,25,0.88)',

      '--border-color':            'rgba(183,146,124,0.08)',
    }
  }

};

export default THEME_PRESETS;