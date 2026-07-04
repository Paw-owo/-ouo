// apps-registry.js
// 所有 App 的注册表。新增 App 只需两步：
//   1. 在 apps/<name>/ 下建 index.js（导出 mount/unmount）
//   2. 在此处加一行
// 红线：只注册真实可用的 App，不允许占位、空壳、"planned"。
// 依赖：无（loader 是动态 import，懒加载）

export const APPS = [
  {
    id: 'settings',
    name: '设置',
    icon: 'settings',
    iconColor: '#7AA2D6',
    dock: true,
    page: 0,
    loader: () => import('./apps/settings/index.js')
  },
  {
    id: 'calculator',
    name: '计算器',
    icon: 'edit',
    iconColor: '#E8A04A',
    dock: false,
    page: 0,
    loader: () => import('./apps/calculator/index.js')
  }
  // 后续 Phase 会追加：chat / characters / worldbook / wallet / shop / moments /
  // memo / anniversary / gallery / games / music / dream / mood / avatar /
  // countdown / collections / weather / health / widget-store / photos /
  // pomodoro / flashcard / astro / alarm
];
