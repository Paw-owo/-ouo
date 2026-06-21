// ================================
// UI组件模块
// 提供抽屉、弹窗、Toast、图标等公共组件
// ================================

class UI {
  constructor() {
    this.activeDrawer = null;
    this.activeOverlay = null;
    this.activeLoading = null;
    this.toastQueue = [];
  }

  // === 遮罩层 ===

  showOverlay(onClick = null) {
    if (this.activeOverlay) return this.activeOverlay;

    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    document.body.appendChild(overlay);

    // 触发动画
    setTimeout(() => overlay.classList.add('active'), 10);

    if (onClick) {
      overlay.addEventListener('click', onClick);
    }

    this.activeOverlay = overlay;
    return overlay;
  }

  hideOverlay() {
    if (!this.activeOverlay) return;

    this.activeOverlay.classList.remove('active');
    setTimeout(() => {
      if (this.activeOverlay && this.activeOverlay.parentNode) {
        this.activeOverlay.parentNode.removeChild(this.activeOverlay);
      }
      this.activeOverlay = null;
    }, 300);
  }

  // === 抽屉 ===

  showDrawer(content, options = {}) {
    return new Promise((resolve) => {
      // 关闭已有抽屉
      if (this.activeDrawer) {
        this.hideDrawer();
      }

      // 创建遮罩
      const overlay = this.showOverlay(() => {
        this.hideDrawer();
        resolve(null);
      });

      // 创建抽屉
      const drawer = document.createElement('div');
      drawer.className = 'drawer';

      // 拖动手柄
      const handle = document.createElement('div');
      handle.className = 'drawer-handle';

      // 内容容器
      const contentEl = document.createElement('div');
      contentEl.className = 'drawer-content';

      if (typeof content === 'string') {
        contentEl.innerHTML = content;
      } else if (content instanceof HTMLElement) {
        contentEl.appendChild(content);
      }

      drawer.appendChild(handle);
      drawer.appendChild(contentEl);
      document.body.appendChild(drawer);

      // 触发动画
      setTimeout(() => drawer.classList.add('active'), 10);

      // 保存引用
      this.activeDrawer = drawer;

      // 提供关闭方法
      drawer.close = (result) => {
        this.hideDrawer();
        resolve(result);
      };
    });
  }

  hideDrawer() {
    if (!this.activeDrawer) return;

    this.activeDrawer.classList.remove('active');
    this.hideOverlay();

    setTimeout(() => {
      if (this.activeDrawer && this.activeDrawer.parentNode) {
        this.activeDrawer.parentNode.removeChild(this.activeDrawer);
      }
      this.activeDrawer = null;
    }, 300);
  }

  // === Toast提示 ===

  showToast(message, type = 'info', duration = 2000) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.cssText = `
      position: fixed;
      top: 80px;
      left: 50%;
      transform: translateX(-50%) translateY(-20px);
      padding: 12px 24px;
      background: var(--glass-bg-dark);
      backdrop-filter: var(--glass-blur);
      -webkit-backdrop-filter: var(--glass-blur);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-lg);
      color: var(--text-primary);
      font-size: var(--font-size-base);
      z-index: 3000;
      opacity: 0;
      transition: all var(--transition-base);
      max-width: 80%;
      text-align: center;
    `;

    // 根据类型设置颜色
    if (type === 'success') {
      toast.style.background = 'rgba(76, 217, 100, 0.9)';
      toast.style.color = '#FFFFFF';
    } else if (type === 'error') {
      toast.style.background = 'rgba(255, 59, 48, 0.9)';
      toast.style.color = '#FFFFFF';
    } else if (type === 'warning') {
      toast.style.background = 'rgba(255, 204, 0, 0.9)';
      toast.style.color = '#1A1A1A';
    }

    toast.textContent = message;
    document.body.appendChild(toast);

    // 触发动画
    setTimeout(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(-50%) translateY(0)';
    }, 10);

    // 自动消失
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(-20px)';
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 200);
    }, duration);
  }

  // === 确认对话框 ===

  showConfirm(message, options = {}) {
    return new Promise((resolve) => {
      const {
        title = '确认',
        confirmText = '确定',
        cancelText = '取消',
        danger = false
      } = options;

      const overlay = this.showOverlay(() => {
        cleanup();
        resolve(false);
      });

      const dialog = document.createElement('div');
      dialog.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) scale(0.9);
        width: 80%;
        max-width: 320px;
        background: var(--bg-card);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-lg);
        z-index: 2001;
        opacity: 0;
        transition: all var(--transition-base);
      `;

      const titleEl = document.createElement('div');
      titleEl.style.cssText = `
        padding: var(--spacing-lg) var(--spacing-lg) var(--spacing-md);
        font-size: var(--font-size-title);
        font-weight: 600;
        color: var(--text-primary);
        text-align: center;
      `;
      titleEl.textContent = title;

      const messageEl = document.createElement('div');
      messageEl.style.cssText = `
        padding: 0 var(--spacing-lg) var(--spacing-lg);
        font-size: var(--font-size-base);
        color: var(--text-secondary);
        text-align: center;
        line-height: var(--line-height);
      `;
      messageEl.textContent = message;

      const actions = document.createElement('div');
      actions.style.cssText = `
        display: flex;
        gap: var(--spacing-sm);
        padding: 0 var(--spacing-lg) var(--spacing-lg);
      `;

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn btn-secondary';
      cancelBtn.style.flex = '1';
      cancelBtn.textContent = cancelText;

      const confirmBtn = document.createElement('button');
      confirmBtn.className = 'btn btn-primary';
      confirmBtn.style.flex = '1';
      if (danger) {
        confirmBtn.style.background = '#FF3B30';
      }
      confirmBtn.textContent = confirmText;

      const cleanup = () => {
        dialog.style.opacity = '0';
        dialog.style.transform = 'translate(-50%, -50%) scale(0.9)';
        this.hideOverlay();
        setTimeout(() => {
          if (dialog.parentNode) {
            dialog.parentNode.removeChild(dialog);
          }
        }, 200);
      };

      cancelBtn.onclick = () => {
        cleanup();
        resolve(false);
      };

      confirmBtn.onclick = () => {
        cleanup();
        resolve(true);
      };

      actions.appendChild(cancelBtn);
      actions.appendChild(confirmBtn);

      dialog.appendChild(titleEl);
      dialog.appendChild(messageEl);
      dialog.appendChild(actions);
      document.body.appendChild(dialog);

      setTimeout(() => {
        dialog.style.opacity = '1';
        dialog.style.transform = 'translate(-50%, -50%) scale(1)';
      }, 10);
    });
  }

  // === 加载指示器 ===

  showLoading(message = '加载中') {
    if (this.activeLoading) return;

    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.4);
      z-index: 3000;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    const box = document.createElement('div');
    box.style.cssText = `
      background: var(--bg-card);
      border-radius: var(--radius-lg);
      padding: var(--spacing-lg);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--spacing-md);
      box-shadow: var(--shadow-lg);
    `;

    const spinner = document.createElement('div');
    spinner.style.cssText = `
      width: 32px;
      height: 32px;
      border: 3px solid var(--bg-secondary);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    `;

    const text = document.createElement('div');
    text.style.cssText = `
      font-size: var(--font-size-base);
      color: var(--text-primary);
    `;
    text.textContent = message;

    box.appendChild(spinner);
    box.appendChild(text);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    // 添加旋转动画
    if (!document.getElementById('spin-keyframes')) {
      const style = document.createElement('style');
      style.id = 'spin-keyframes';
      style.textContent = `
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }

    this.activeLoading = overlay;
  }

  hideLoading() {
    if (!this.activeLoading) return;

    if (this.activeLoading.parentNode) {
      this.activeLoading.parentNode.removeChild(this.activeLoading);
    }
    this.activeLoading = null;
  }

  // === SVG图标生成器 ===

  createIcon(type, className = '') {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', `icon ${className}`);
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.5');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');

    let path = '';

    switch (type) {
      case 'back':
        path = '<path d="M19 12H5M12 19l-7-7 7-7"/>';
        break;
      case 'close':
        path = '<path d="M18 6L6 18M6 6l12 12"/>';
        break;
      case 'more':
        path = '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>';
        break;
      case 'search':
        path = '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>';
        break;
      case 'add':
        path = '<path d="M12 5v14M5 12h14"/>';
        break;
      case 'delete':
        path = '<path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>';
        break;
      case 'edit':
        path = '<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>';
        break;
      case 'check':
        path = '<path d="M20 6L9 17l-5-5"/>';
        break;
      case 'phone':
        path = '<path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/>';
        break;
      case 'mic':
        path = '<path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/>';
        break;
      case 'send':
        path = '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>';
        break;
      case 'image':
        path = '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>';
        break;
      case 'emoji':
        path = '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/>';
        break;
      case 'settings':
        path = '<circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 6v6M4.22 4.22l4.24 4.24m5.08 5.08l4.24 4.24M1 12h6m6 0h6M4.22 19.78l4.24-4.24m5.08-5.08l4.24-4.24"/>';
        break;
      case 'user':
        path = '<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>';
        break;
      case 'heart':
        path = '<path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>';
        break;
      case 'star':
        path = '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>';
        break;
      case 'menu':
        path = '<path d="M3 12h18M3 6h18M3 18h18"/>';
        break;
      case 'download':
        path = '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>';
        break;
      case 'upload':
        path = '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>';
        break;
      case 'refresh':
        path = '<path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0118.8-4.3M22 12.5a10 10 0 01-18.8 4.2"/>';
        break;
      case 'copy':
        path = '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>';
        break;
      case 'eye':
        path = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
        break;
      case 'eye-off':
        path = '<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22"/>';
        break;
      default:
        path = '<circle cx="12" cy="12" r="10"/>';
    }

    svg.innerHTML = path;
    return svg;
  }

  // === 工具方法 ===

  // 创建简单的输入框对话框
  showPrompt(title, placeholder = '', defaultValue = '') {
    return new Promise((resolve) => {
      const content = document.createElement('div');
      content.style.padding = 'var(--spacing-lg)';

      const titleEl = document.createElement('div');
      titleEl.style.cssText = `
        font-size: var(--font-size-title);
        font-weight: 600;
        margin-bottom: var(--spacing-md);
        color: var(--text-primary);
      `;
      titleEl.textContent = title;

      const input = document.createElement('input');
      input.className = 'input';
      input.placeholder = placeholder;
      input.value = defaultValue;

      const actions = document.createElement('div');
      actions.style.cssText = `
        display: flex;
        gap: var(--spacing-sm);
        margin-top: var(--spacing-md);
      `;

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn btn-secondary';
      cancelBtn.style.flex = '1';
      cancelBtn.textContent = '取消';

      const confirmBtn = document.createElement('button');
      confirmBtn.className = 'btn btn-primary';
      confirmBtn.style.flex = '1';
      confirmBtn.textContent = '确定';

      cancelBtn.onclick = () => {
        this.hideDrawer();
        resolve(null);
      };

      confirmBtn.onclick = () => {
        this.hideDrawer();
        resolve(input.value);
      };

      actions.appendChild(cancelBtn);
      actions.appendChild(confirmBtn);

      content.appendChild(titleEl);
      content.appendChild(input);
      content.appendChild(actions);

      this.showDrawer(content);

      setTimeout(() => input.focus(), 300);
    });
  }
}

// 创建全局实例
const ui = new UI();

export default ui;
