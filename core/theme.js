// ================================
// 主题系统模块
// 支持预设主题、导入导出、实时预览
// ================================

import storage from './storage.js';

// 预设主题配置
const PRESET_THEMES = {
  cream: {
    name: '奶油白',
    variables: {
      '--bg-primary': '#FAFAFA',
      '--bg-secondary': '#F3F3F3',
      '--bg-card': '#FFFFFF',
      '--bg-overlay': 'rgba(0, 0, 0, 0.28)',
      '--glass-bg': 'rgba(255, 255, 255, 0.72)',
      '--glass-bg-dark': 'rgba(255, 255, 255, 0.85)',
      '--accent': '#FFB3C6',
      '--accent-light': '#FFE4EC',
      '--accent-dark': '#E8899A',
      '--text-primary': '#1A1A1A',
      '--text-secondary': '#888888',
      '--text-hint': '#CCCCCC',
      '--text-white': '#FFFFFF',
      '--bubble-user-bg': '#FFB3C6',
      '--bubble-user-text': '#FFFFFF',
      '--bubble-ai-bg': '#FFFFFF',
      '--bubble-ai-text': '#1A1A1A'
    }
  },

  sakura: {
    name: '樱花粉',
    variables: {
      '--bg-primary': '#FFF5F7',
      '--bg-secondary': '#FFE4E9',
      '--bg-card': '#FFFFFF',
      '--bg-overlay': 'rgba(0, 0, 0, 0.28)',
      '--glass-bg': 'rgba(255, 245, 247, 0.72)',
      '--glass-bg-dark': 'rgba(255, 245, 247, 0.85)',
      '--accent': '#FF9EB5',
      '--accent-light': '#FFD4E0',
      '--accent-dark': '#E8899A',
      '--text-primary': '#2A1A1F',
      '--text-secondary': '#9B7882',
      '--text-hint': '#D4B8BE',
      '--text-white': '#FFFFFF',
      '--bubble-user-bg': '#FF9EB5',
      '--bubble-user-text': '#FFFFFF',
      '--bubble-ai-bg': '#FFFFFF',
      '--bubble-ai-text': '#2A1A1F'
    }
  },

  sky: {
    name: '天空蓝',
    variables: {
      '--bg-primary': '#F5F9FF',
      '--bg-secondary': '#E8F2FF',
      '--bg-card': '#FFFFFF',
      '--bg-overlay': 'rgba(0, 0, 0, 0.28)',
      '--glass-bg': 'rgba(245, 249, 255, 0.72)',
      '--glass-bg-dark': 'rgba(245, 249, 255, 0.85)',
      '--accent': '#74B9FF',
      '--accent-light': '#A8D5FF',
      '--accent-dark': '#4A9EE8',
      '--text-primary': '#1A1F2A',
      '--text-secondary': '#788099',
      '--text-hint': '#B8C4D4',
      '--text-white': '#FFFFFF',
      '--bubble-user-bg': '#74B9FF',
      '--bubble-user-text': '#FFFFFF',
      '--bubble-ai-bg': '#FFFFFF',
      '--bubble-ai-text': '#1A1F2A'
    }
  },

  dark: {
    name: '夜间模式',
    variables: {
      '--bg-primary': '#1A1A1A',
      '--bg-secondary': '#2A2A2A',
      '--bg-card': '#242424',
      '--bg-overlay': 'rgba(0, 0, 0, 0.6)',
      '--glass-bg': 'rgba(36, 36, 36, 0.72)',
      '--glass-bg-dark': 'rgba(36, 36, 36, 0.85)',
      '--accent': '#FFB3C6',
      '--accent-light': '#FF8FA8',
      '--accent-dark': '#E8899A',
      '--text-primary': '#FAFAFA',
      '--text-secondary': '#999999',
      '--text-hint': '#666666',
      '--text-white': '#FFFFFF',
      '--bubble-user-bg': '#FFB3C6',
      '--bubble-user-text': '#FFFFFF',
      '--bubble-ai-bg': '#2A2A2A',
      '--bubble-ai-text': '#FAFAFA'
    }
  }
};

class ThemeManager {
  constructor() {
    this.currentTheme = 'cream';
    this.customVariables = {};
  }

  // 初始化主题系统
  init() {
    // 从storage恢复上次主题
    const savedTheme = storage.getTheme();
    const customVars = storage.get('theme_custom_variables', {});
    
    if (savedTheme) {
      this.currentTheme = savedTheme;
      this.customVariables = customVars;
    }

    // 应用主题
    this.applyTheme(this.currentTheme);
    
    // 应用自定义变量（覆盖预设）
    if (Object.keys(customVars).length > 0) {
      this.applyCustomVariables(customVars);
    }
  }

  // 应用主题
  applyTheme(themeId) {
    const theme = PRESET_THEMES[themeId];
    if (!theme) {
      console.error('主题不存在:', themeId);
      return false;
    }

    const root = document.documentElement;

    // 批量设置CSS变量
    Object.entries(theme.variables).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });

    // 保存当前主题
    this.currentTheme = themeId;
    storage.saveTheme(themeId);

    return true;
  }

  // 应用自定义变量
  applyCustomVariables(variables) {
    const root = document.documentElement;

    Object.entries(variables).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });

    this.customVariables = { ...this.customVariables, ...variables };
    storage.set('theme_custom_variables', this.customVariables);
  }

  // 设置单个变量（实时预览）
  setVariable(key, value) {
    document.documentElement.style.setProperty(key, value);
    this.customVariables[key] = value;
    storage.set('theme_custom_variables', this.customVariables);
  }

  // 获取当前变量值
  getVariable(key) {
    return getComputedStyle(document.documentElement).getPropertyValue(key).trim();
  }

  // 重置自定义变量
  resetCustomVariables() {
    this.customVariables = {};
    storage.remove('theme_custom_variables');
    this.applyTheme(this.currentTheme);
  }

  // 获取所有预设主题
  getPresetThemes() {
    return Object.entries(PRESET_THEMES).map(([id, theme]) => ({
      id,
      name: theme.name
    }));
  }

  // 获取当前主题ID
  getCurrentTheme() {
    return this.currentTheme;
  }

  // 导出当前主题为JSON
  exportTheme(themeName = '自定义主题') {
    const root = document.documentElement;
    const computedStyle = getComputedStyle(root);

    // 读取所有CSS变量
    const variables = {};
    const variableNames = [
      '--bg-primary', '--bg-secondary', '--bg-card', '--bg-overlay',
      '--glass-bg', '--glass-bg-dark',
      '--accent', '--accent-light', '--accent-dark',
      '--text-primary', '--text-secondary', '--text-hint', '--text-white',
      '--bubble-user-bg', '--bubble-user-text', '--bubble-ai-bg', '--bubble-ai-text',
      '--bubble-radius', '--bubble-radius-tail'
    ];

    variableNames.forEach(varName => {
      const value = computedStyle.getPropertyValue(varName).trim();
      if (value) {
        variables[varName] = value;
      }
    });

    const themeData = {
      name: themeName,
      version: '1.0',
      exportTime: Date.now(),
      variables
    };

    // 生成JSON文件下载
    const blob = new Blob([JSON.stringify(themeData, null, 2)], { 
      type: 'application/json' 
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `theme_${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);

    return themeData;
  }

  // 导入主题JSON
  async importTheme(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const themeData = JSON.parse(e.target.result);
          
          // 验证数据格式
          if (!themeData.variables || typeof themeData.variables !== 'object') {
            throw new Error('无效的主题文件格式');
          }

          // 应用主题
          this.applyCustomVariables(themeData.variables);
          
          resolve({
            success: true,
            name: themeData.name || '导入的主题'
          });
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsText(file);
    });
  }

  // 从JSON对象导入主题
  importThemeFromObject(themeData) {
    if (!themeData.variables || typeof themeData.variables !== 'object') {
      throw new Error('无效的主题数据格式');
    }

    this.applyCustomVariables(themeData.variables);
    
    return {
      success: true,
      name: themeData.name || '导入的主题'
    };
  }

  // 获取当前完整主题配置
  getCurrentThemeConfig() {
    const root = document.documentElement;
    const computedStyle = getComputedStyle(root);

    const variables = {};
    const variableNames = [
      '--bg-primary', '--bg-secondary', '--bg-card', '--bg-overlay',
      '--glass-bg', '--glass-bg-dark',
      '--accent', '--accent-light', '--accent-dark',
      '--text-primary', '--text-secondary', '--text-hint', '--text-white',
      '--bubble-user-bg', '--bubble-user-text', '--bubble-ai-bg', '--bubble-ai-text',
      '--bubble-radius', '--bubble-radius-tail',
      '--font-main', '--font-size-base', '--font-size-small', '--font-size-title',
      '--spacing-xs', '--spacing-sm', '--spacing-md', '--spacing-lg',
      '--radius-sm', '--radius-md', '--radius-lg',
      '--shadow-sm', '--shadow-md', '--shadow-lg'
    ];

    variableNames.forEach(varName => {
      const value = computedStyle.getPropertyValue(varName).trim();
      if (value) {
        variables[varName] = value;
      }
    });

    return variables;
  }

  // 批量修改变量（用于设置页面的自定义编辑）
  batchSetVariables(variables) {
    Object.entries(variables).forEach(([key, value]) => {
      this.setVariable(key, value);
    });
  }

  // 预览主题（不保存）
  previewTheme(themeId) {
    const theme = PRESET_THEMES[themeId];
    if (!theme) return false;

    const root = document.documentElement;
    Object.entries(theme.variables).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });

    return true;
  }

  // 取消预览，恢复原主题
  cancelPreview() {
    this.applyTheme(this.currentTheme);
    if (Object.keys(this.customVariables).length > 0) {
      this.applyCustomVariables(this.customVariables);
    }
  }
}

// 创建全局实例
const themeManager = new ThemeManager();

export default themeManager;
export { PRESET_THEMES };
