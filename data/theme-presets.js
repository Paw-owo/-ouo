// ============================================
// theme-presets.js — 6套主题色值，唯一来源
// 全部日间温柔主题，由 core/theme.js 读取并写入 CSS 变量槽位
//
// 1. vanilla-milk    雪山香草酪   (默认)
// 2. rice-pudding    香草米布丁
// 3. almond-tofu     杏仁豆花露
// 4. coconut-blue    椰青冰美式
// 5. coconut-pink    椰乳四季春
// 6. berry-cloud     莓莓云顶奶
// ============================================

const THEME_PRESETS = {

  // ==========================================
  // 1. 雪山香草酪 — 默认主题
  // 气质：奶油、香草、轻甜、柔和
  // 参考：text=#5B3F41  neutral=#CBB4A7  bg=#F9F8F4  accent=#FEF6DF
  // ==========================================
  'vanilla-milk': {
    label: '雪山香草酪',
    mode: 'light',
    colors: {
      // 背景
      '--bg-base':                 '#F9F8F4',
      '--bg-surface':              '#F3F1EC',
      '--bg-hover':                '#EDEAE3',
      '--bg-glass':                'rgba(249,248,244,0.88)',
      '--bg-mask':                 'rgba(80,65,60,0.25)',

      // 主色系（暖中性 = 图标线条、小装饰、按钮重点）
      '--color-primary':           '#CBB4A7',
      '--color-primary-light':     '#DDD2C8',
      '--color-primary-ultralight':'#F5EFE8',
      '--color-primary-deep':      '#B5A095',

      // 辅色（奶黄强调）
      '--color-accent':            '#FEF6DF',
      '--color-accent-light':      '#FFFBF0',

      // 文字（深棕柔棕，禁止纯黑）
      '--text-primary':            '#5B3F41',
      '--text-secondary':          '#8B7A7B',
      '--text-placeholder':        '#BBAEAA',

      // 阴影（同色系半透明，不发灰黑）
      '--shadow-soft':             '0 2px 8px rgba(180,158,145,0.10)',
      '--shadow-card':             '0 4px 16px rgba(180,158,145,0.12)',
      '--shadow-float':            '0 8px 24px rgba(180,158,145,0.15)',
      '--shadow-neu-out':          '4px 4px 10px rgba(180,158,145,0.10), -4px -4px 10px rgba(249,248,244,0.9)',
      '--shadow-neu-in':           'inset 2px 2px 6px rgba(180,158,145,0.08), inset -2px -2px 6px rgba(249,248,244,0.8)',

      // 功能色
      '--color-success':           '#8CB88A',
      '--color-warning':           '#E0D8A0',
      '--color-error':             '#E0A8A8',
      '--color-info':              '#A8BCD8',

      // 图标（图标线条、底盘、底纹）
      '--icon-stroke':             '#CBB4A7',
      '--icon-tile-bg':            '#F5EFE8',
      '--icon-tile-pattern':       '#E8DDD3',
      '--icon-stitch':             '#CBB4A7',
      '--icon-inner':              '#FFFEFC',
      '--icon-shadow':             '0 3px 10px rgba(180,158,145,0.12)',
      '--icon-shadow-near':        '0 1px 3px rgba(180,158,145,0.08)',
      '--icon-shadow-inset-top':   'inset 0 1px 0 rgba(255,254,252,0.95)',
      '--icon-shadow-inset-btm':   'inset 0 -1px 0 rgba(180,158,145,0.06)',
      '--icon-deco':               '#CBB4A7',

      // 装饰
      '--deco-primary':            '#CBB4A7',
      '--deco-secondary':          '#DDD2C8',
      '--texture-dot':             'rgba(180,158,145,0.06)',

      // dock / 状态胶囊
      '--dock-bg':                 'rgba(249,248,244,0.88)',
      '--capsule-bg':              'rgba(249,248,244,0.85)',

      // 边框
      '--border-color':            'rgba(180,165,155,0.12)',
    }
  },

  // ==========================================
  // 2. 香草米布丁 — 比奶黄更安静、更糯
  // 适合做第二套温柔中性色，不要做成灰脏奶茶
  // 参考：text=#594027  neutral=#C3AB99  bg=#FBF8F7  accent=#F3EEE9
  // ==========================================
  'rice-pudding': {
    label: '香草米布丁',
    mode: 'light',
    colors: {
      '--bg-base':                 '#FBF8F7',
      '--bg-surface':              '#F5F1EF',
      '--bg-hover':                '#EFEAE7',
      '--bg-glass':                'rgba(251,248,247,0.88)',
      '--bg-mask':                 'rgba(75,55,40,0.25)',

      '--color-primary':           '#C3AB99',
      '--color-primary-light':     '#D8C5B8',
      '--color-primary-ultralight':'#F2EBE6',
      '--color-primary-deep':      '#AD9583',

      '--color-accent':            '#F3EEE9',
      '--color-accent-light':      '#FAF6F3',

      '--text-primary':            '#594027',
      '--text-secondary':          '#8B7A6B',
      '--text-placeholder':        '#B8ACA6',

      '--shadow-soft':             '0 2px 8px rgba(172,150,132,0.10)',
      '--shadow-card':             '0 4px 16px rgba(172,150,132,0.12)',
      '--shadow-float':            '0 8px 24px rgba(172,150,132,0.15)',
      '--shadow-neu-out':          '4px 4px 10px rgba(172,150,132,0.10), -4px -4px 10px rgba(251,248,247,0.9)',
      '--shadow-neu-in':           'inset 2px 2px 6px rgba(172,150,132,0.08), inset -2px -2px 6px rgba(251,248,247,0.8)',

      '--color-success':           '#8CB88A',
      '--color-warning':           '#E0D8A0',
      '--color-error':             '#E0A8A8',
      '--color-info':              '#A8BCD8',

      '--icon-stroke':             '#C3AB99',
      '--icon-tile-bg':            '#F2EBE6',
      '--icon-tile-pattern':       '#E5DCD5',
      '--icon-stitch':             '#C3AB99',
      '--icon-inner':              '#FFFDFB',
      '--icon-shadow':             '0 3px 10px rgba(172,150,132,0.12)',
      '--icon-shadow-near':        '0 1px 3px rgba(172,150,132,0.08)',
      '--icon-shadow-inset-top':   'inset 0 1px 0 rgba(255,253,251,0.95)',
      '--icon-shadow-inset-btm':   'inset 0 -1px 0 rgba(172,150,132,0.06)',
      '--icon-deco':               '#C3AB99',

      '--deco-primary':            '#C3AB99',
      '--deco-secondary':          '#D8C5B8',
      '--texture-dot':             'rgba(172,150,132,0.06)',

      '--dock-bg':                 'rgba(251,248,247,0.88)',
      '--capsule-bg':              'rgba(251,248,247,0.85)',

      '--border-color':            'rgba(175,160,148,0.12)',
    }
  },

  // ==========================================
  // 3. 杏仁豆花露 — 更轻、更软、更淡
  // 低对比护眼主题，不要偏紫灰过头
  // 参考：text=#A58F8B  neutral=#D6C8B9  bg=#FAF7F5  accent=#FAF1E7
  // ==========================================
  'almond-tofu': {
    label: '杏仁豆花露',
    mode: 'light',
    colors: {
      '--bg-base':                 '#FAF7F5',
      '--bg-surface':              '#F4F0ED',
      '--bg-hover':                '#EEE8E3',
      '--bg-glass':                'rgba(250,247,245,0.88)',
      '--bg-mask':                 'rgba(140,120,115,0.25)',

      '--color-primary':           '#D6C8B9',
      '--color-primary-light':     '#E6DCD0',
      '--color-primary-ultralight':'#F5F0EB',
      '--color-primary-deep':      '#C0B2A3',

      '--color-accent':            '#FAF1E7',
      '--color-accent-light':      '#FDF8F2',

      '--text-primary':            '#A58F8B',
      '--text-secondary':          '#C0B0AB',
      '--text-placeholder':        '#D8D0CC',

      '--shadow-soft':             '0 2px 8px rgba(190,176,162,0.10)',
      '--shadow-card':             '0 4px 16px rgba(190,176,162,0.12)',
      '--shadow-float':            '0 8px 24px rgba(190,176,162,0.15)',
      '--shadow-neu-out':          '4px 4px 10px rgba(190,176,162,0.10), -4px -4px 10px rgba(250,247,245,0.9)',
      '--shadow-neu-in':           'inset 2px 2px 6px rgba(190,176,162,0.08), inset -2px -2px 6px rgba(250,247,245,0.8)',

      '--color-success':           '#8CB88A',
      '--color-warning':           '#E0D8A0',
      '--color-error':             '#E0A8A8',
      '--color-info':              '#A8BCD8',

      '--icon-stroke':             '#D6C8B9',
      '--icon-tile-bg':            '#F5F0EB',
      '--icon-tile-pattern':       '#E9E2D9',
      '--icon-stitch':             '#D6C8B9',
      '--icon-inner':              '#FFFDFB',
      '--icon-shadow':             '0 3px 10px rgba(190,176,162,0.12)',
      '--icon-shadow-near':        '0 1px 3px rgba(190,176,162,0.08)',
      '--icon-shadow-inset-top':   'inset 0 1px 0 rgba(255,253,251,0.95)',
      '--icon-shadow-inset-btm':   'inset 0 -1px 0 rgba(190,176,162,0.06)',
      '--icon-deco':               '#D6C8B9',

      '--deco-primary':            '#D6C8B9',
      '--deco-secondary':          '#E6DCD0',
      '--texture-dot':             'rgba(190,176,162,0.06)',

      '--dock-bg':                 'rgba(250,247,245,0.88)',
      '--capsule-bg':              'rgba(250,247,245,0.85)',

      '--border-color':            'rgba(195,182,170,0.12)',
    }
  },

  // ==========================================
  // 4. 椰青冰美式 — 浅蓝空气感 + 奶咖平衡
  // 不是纯蓝系统，蓝只做气氛，不要冷硬科技风
  // 参考：text=#512128  neutral=#9D7C6D  bg=#EDDFD4  accent=#E1EFF4
  // ==========================================
  'coconut-blue': {
    label: '椰青冰美式',
    mode: 'light',
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
      '--color-warning':           '#E0D8A0',
      '--color-error':             '#E0A8A8',
      '--color-info':              '#A8BCD8',

      '--icon-stroke':             '#9D7C6D',
      '--icon-tile-bg':            '#DDD3CC',
      '--icon-tile-pattern':       '#CEC2B8',
      '--icon-stitch':             '#9D7C6D',
      '--icon-inner':              '#FFFCFA',
      '--icon-shadow':             '0 3px 10px rgba(140,108,94,0.12)',
      '--icon-shadow-near':        '0 1px 3px rgba(140,108,94,0.08)',
      '--icon-shadow-inset-top':   'inset 0 1px 0 rgba(255,252,250,0.95)',
      '--icon-shadow-inset-btm':   'inset 0 -1px 0 rgba(140,108,94,0.06)',
      '--icon-deco':               '#9D7C6D',

      '--deco-primary':            '#9D7C6D',
      '--deco-secondary':          '#B8A094',
      '--texture-dot':             'rgba(140,108,94,0.06)',

      '--dock-bg':                 'rgba(237,223,212,0.88)',
      '--capsule-bg':              'rgba(237,223,212,0.85)',

      '--border-color':            'rgba(150,120,105,0.12)',
    }
  },

  // ==========================================
  // 5. 椰乳四季春 — 粉要嫩，不要荧光，不要桃红
  // 保持奶感和呼吸感
  // 参考：text=#8B736C  pink=#FFE7E8  bg=#FBF8EA  purple=#ECC7D6
  // ==========================================
  'coconut-pink': {
    label: '椰乳四季春',
    mode: 'light',
    colors: {
      '--bg-base':                 '#FBF8EA',
      '--bg-surface':              '#F5F1E0',
      '--bg-hover':                '#EFEAD6',
      '--bg-glass':                'rgba(251,248,234,0.88)',
      '--bg-mask':                 'rgba(120,100,95,0.25)',

      '--color-primary':           '#ECC7D6',
      '--color-primary-light':     '#F5DEE7',
      '--color-primary-ultralight':'#FBF0F4',
      '--color-primary-deep':      '#D4A8BC',

      '--color-accent':            '#FFE7E8',
      '--color-accent-light':      '#FFF5F6',

      '--text-primary':            '#8B736C',
      '--text-secondary':          '#B09D97',
      '--text-placeholder':        '#C8B8B2',

      '--shadow-soft':             '0 2px 8px rgba(210,175,190,0.10)',
      '--shadow-card':             '0 4px 16px rgba(210,175,190,0.12)',
      '--shadow-float':            '0 8px 24px rgba(210,175,190,0.15)',
      '--shadow-neu-out':          '4px 4px 10px rgba(210,175,190,0.10), -4px -4px 10px rgba(251,248,234,0.9)',
      '--shadow-neu-in':           'inset 2px 2px 6px rgba(210,175,190,0.08), inset -2px -2px 6px rgba(251,248,234,0.8)',

      '--color-success':           '#8CB88A',
      '--color-warning':           '#E0D8A0',
      '--color-error':             '#E0A8A8',
      '--color-info':              '#A8BCD8',

      '--icon-stroke':             '#ECC7D6',
      '--icon-tile-bg':            '#FBF0F4',
      '--icon-tile-pattern':       '#EFE0E8',
      '--icon-stitch':             '#ECC7D6',
      '--icon-inner':              '#FFFEFB',
      '--icon-shadow':             '0 3px 10px rgba(210,175,190,0.12)',
      '--icon-shadow-near':        '0 1px 3px rgba(210,175,190,0.08)',
      '--icon-shadow-inset-top':   'inset 0 1px 0 rgba(255,254,251,0.95)',
      '--icon-shadow-inset-btm':   'inset 0 -1px 0 rgba(210,175,190,0.06)',
      '--icon-deco':               '#ECC7D6',

      '--deco-primary':            '#ECC7D6',
      '--deco-secondary':          '#F5DEE7',
      '--texture-dot':             'rgba(210,175,190,0.06)',

      '--dock-bg':                 'rgba(251,248,234,0.88)',
      '--capsule-bg':              'rgba(251,248,234,0.85)',

      '--border-color':            'rgba(215,185,195,0.12)',
    }
  },

  // ==========================================
  // 6. 莓莓云顶奶 — 更梦幻、更轻盈
  // 蓝粉都要低饱和、像奶油糖纸，不要儿童玩具色
  // 参考：blue=#D1E3FF  pink-bg=#FFF4F5  mist=#E2F3FF  frosting=#FAC7DA
  // ==========================================
  'berry-cloud': {
    label: '莓莓云顶奶',
    mode: 'light',
    colors: {
      '--bg-base':                 '#FFF4F5',
      '--bg-surface':              '#F9EDEE',
      '--bg-hover':                '#F3E5E7',
      '--bg-glass':                'rgba(255,244,245,0.88)',
      '--bg-mask':                 'rgba(120,95,100,0.25)',

      '--color-primary':           '#FAC7DA',
      '--color-primary-light':     '#FCDEE9',
      '--color-primary-ultralight':'#FDE8F0',
      '--color-primary-deep':      '#E8A8C0',

      '--color-accent':            '#E2F3FF',
      '--color-accent-light':      '#F0F8FF',

      '--text-primary':            '#8B6B72',
      '--text-secondary':          '#B0959A',
      '--text-placeholder':        '#D0C0C4',

      '--shadow-soft':             '0 2px 8px rgba(220,175,192,0.10)',
      '--shadow-card':             '0 4px 16px rgba(220,175,192,0.12)',
      '--shadow-float':            '0 8px 24px rgba(220,175,192,0.15)',
      '--shadow-neu-out':          '4px 4px 10px rgba(220,175,192,0.10), -4px -4px 10px rgba(255,244,245,0.9)',
      '--shadow-neu-in':           'inset 2px 2px 6px rgba(220,175,192,0.08), inset -2px -2px 6px rgba(255,244,245,0.8)',

      '--color-success':           '#8CB88A',
      '--color-warning':           '#E0D8A0',
      '--color-error':             '#E0A8A8',
      '--color-info':              '#A8BCD8',

      '--icon-stroke':             '#FAC7DA',
      '--icon-tile-bg':            '#FDE8F0',
      '--icon-tile-pattern':       '#F2D8E4',
      '--icon-stitch':             '#FAC7DA',
      '--icon-inner':              '#FFFDFD',
      '--icon-shadow':             '0 3px 10px rgba(220,175,192,0.12)',
      '--icon-shadow-near':        '0 1px 3px rgba(220,175,192,0.08)',
      '--icon-shadow-inset-top':   'inset 0 1px 0 rgba(255,253,253,0.95)',
      '--icon-shadow-inset-btm':   'inset 0 -1px 0 rgba(220,175,192,0.06)',
      '--icon-deco':               '#FAC7DA',

      '--deco-primary':            '#FAC7DA',
      '--deco-secondary':          '#FCDEE9',
      '--texture-dot':             'rgba(220,175,192,0.06)',

      '--dock-bg':                 'rgba(255,244,245,0.88)',
      '--capsule-bg':              'rgba(255,244,245,0.85)',

      '--border-color':            'rgba(225,185,195,0.12)',
    }
  }

};

export default THEME_PRESETS;