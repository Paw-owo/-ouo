# 开发路线图

## 阶段1：底座（顺序不可变）

- [ ] `css/theme.css` — CSS变量槽位 + 主题切换机制 + 通用类（不存具体色值）
- [ ] `css/base.css` — 字体、重置、通用布局
- [ ] `css/animations.css` — 公用动画
- [ ] `css/app-surfaces.css` — APP页面容器/表面层/背景适配
- [ ] `data/theme-presets.js` — 6套主题色值（3日间+3夜间）
- [ ] `core/storage-keys.js` — 所有存储键常量
- [ ] `core/storage.js` / `core/storage-manager.js` — 存储统一封装 + 角色隔离
- [ ] `core/events.js` — 事件中心（pub/sub）
- [ ] `data/apps-registry.js` — APP静态注册信息
- [ ] `data/default-settings.js` — 全局设置默认值
- [ ] `core/config.js` — 设置统一出口（默认值+用户覆盖值合并）
- [ ] `core/theme.js` — 主题切换（从 theme-presets.js 取色值写入 theme.css 变量槽位）
- [ ] `core/notifications.js` — 通知判断层
- [ ] `core/inbox.js` — 消息/事件汇聚数据层
- [ ] `core/router.js` — APP路由
- [ ] `core/ui.js` — 公用UI组件行为与结构
- [ ] `index.html` — 入口文件

## 阶段2：桌面外壳

- [ ] `desktop/boot.js` — 启动页
- [ ] `desktop/lockscreen.js` — 锁屏
- [ ] `desktop/status-bar.js` — 顶部状态胶囊
- [ ] `core/app-bg.js` — 背景系统（桌面/锁屏/APP单独背景）
- [ ] `desktop/widgets.js` — 小组件
- [ ] `desktop/app-grid.js` — APP图标网格
- [ ] `desktop/dock.js` — Dock栏
- [ ] `desktop/desktop.js` — 桌面主控

## 阶段3：核心系统

- [ ] `apps/settings/` — 设置中心
- [ ] `js/ai/ai-client.js` — API客户端
- [ ] `js/ai/ai-events.js` — 事件监听筛选（不另建存储）
- [ ] `js/ai/ai-context.js` — 上下文拼装（事件走inbox入口）
- [ ] `apps/chat/` — 消息中心UI层（数据走inbox）
- [ ] `js/ai/ai-memory.js` — 记忆系统
- [ ] `js/ai/ai-fallback.js` — AI降级
- [ ] `js/ai/ai-spec.js` — APP行为指令注册

## 阶段4：扩展能力

- [ ] 通知流转（横幅/桌面提示/通知中心UI）
- [ ] 感官功能（眼睛/耳朵）
- [ ] TTS语音合成
- [ ] 思维链展示
- [ ] 其他APP（记仇本/朋友圈/钱包/商店/纪念日/世界书等）

## 工作流

每阶段：改一个模块 → 自检 → 确认联动没断 → 确认没牵连其他APP → 下一模块

## 主题清单

日间：奶黄（默认）、粉色、蓝色
夜间：对应三套夜间主题