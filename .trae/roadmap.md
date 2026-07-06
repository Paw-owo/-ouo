# 开发路线图

## 阶段1：底座（顺序不可变）

- [ ] `css/theme.css` — 4套主题CSS变量（粉/蓝/奶棕/黑粉）
- [ ] `css/base.css` — 字体、重置、通用布局
- [ ] `css/animations.css` — 公用动画
- [ ] `data/theme-presets.js` — 4套主题色值
- [ ] `core/storage-keys.js` — 所有存储键常量
- [ ] `core/storage.js` / `core/storage-manager.js` — 存储统一封装
- [ ] `core/events.js` — 事件中心
- [ ] `data/apps-registry.js` — APP注册表
- [ ] `data/default-settings.js` — 设置默认值
- [ ] `core/config.js` — 设置统一出口
- [ ] `core/theme.js` — 主题切换
- [ ] `core/router.js` — 路由
- [ ] `core/ui.js` — 公用UI组件
- [ ] `index.html` — 入口文件

## 阶段2：桌面外壳

- [ ] `desktop/boot.js` — 启动页
- [ ] `desktop/lockscreen.js` — 锁屏
- [ ] `desktop/status-bar.js` — 顶部状态胶囊
- [ ] `core/app-bg.js` — 背景系统
- [ ] `desktop/widgets.js` — 小组件
- [ ] `desktop/app-grid.js` — APP图标网格
- [ ] `desktop/dock.js` — Dock栏
- [ ] `desktop/desktop.js` — 桌面主控

## 阶段3：核心系统

- [ ] `apps/settings/` — 设置中心
- [ ] `js/ai/ai-client.js` — API客户端
- [ ] `js/ai/ai-context.js` — 上下文拼装
- [ ] `apps/chat/` — 消息APP
- [ ] `js/ai/ai-memory.js` — 记忆系统
- [ ] `js/ai/ai-events.js` — AI事件监听
- [ ] `js/ai/ai-fallback.js` — AI降级
- [ ] `js/ai/ai-spec.js` — APP行为指令注册

## 阶段4：扩展能力

- [ ] `core/inbox.js` — 消息汇聚层
- [ ] 通知流转（横幅/桌面提示/通知中心）
- [ ] 感官功能（眼睛/耳朵）
- [ ] TTS语音合成
- [ ] 思维链展示
- [ ] 其他APP（记仇本/朋友圈/钱包/商店/纪念日/世界书等）

## 工作流

每阶段：改一个模块 → 自检 → 确认联动没断 → 确认没牵连其他APP → 下一模块