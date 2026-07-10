import sys
import json
from playwright.sync_api import sync_playwright

URL = 'http://localhost:8780/'

errors = []      # console.error
pageerrors = []  # uncaught exceptions
warnings = []    # console.warning
all_logs = []    # 全部日志（含 404 等）

def on_console(msg):
    t = msg.type
    text = msg.text
    all_logs.append((t, text))
    if t == 'error':
        errors.append(text)
    elif t == 'warning':
        warnings.append(text)

def on_pageerror(err):
    pageerrors.append(str(err))

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()
    page.on('console', on_console)
    page.on('pageerror', on_pageerror)

    print('=== 1. 打开页面 ===')
    page.goto(URL, wait_until='networkidle')
    page.wait_for_timeout(1500)

    # 检查是否在锁屏
    lock_visible = page.locator('#lock-screen').is_visible()
    print(f'锁屏可见: {lock_visible}')

    if lock_visible:
        print('=== 2. 解锁 (输入 0326) ===')
        for key in ['0', '3', '2', '6']:
            page.locator(f'#lock-pad button[data-key="{key}"]').click()
            page.wait_for_timeout(150)
        page.wait_for_timeout(800)
        lock_still = page.locator('#lock-screen').is_visible()
        print(f'解锁后锁屏仍可见: {lock_still}')

    print('=== 3. 等待桌面加载 ===')
    page.wait_for_timeout(2000)

    # 检查 AppBus / AppEvents / refreshDesktopBadges
    bus_ok = page.evaluate('typeof window.AppBus === "object" && window.AppBus !== null')
    events_ok = page.evaluate('typeof window.AppEvents === "object" && window.AppEvents !== null')
    badge_fn = page.evaluate('typeof window.refreshDesktopBadges')
    print(f'AppBus: {bus_ok}, AppEvents: {events_ok}, refreshDesktopBadges: {badge_fn}')

    print('=== 4. IndexedDB 版本与 stores ===')
    db_info = page.evaluate('''async () => {
        return new Promise((resolve) => {
            const req = indexedDB.open('phone-db');
            req.onsuccess = (e) => {
                const db = e.target.result;
                const stores = Array.from(db.objectStoreNames);
                resolve({ version: db.version, stores });
            };
            req.onerror = () => resolve({ error: 'open failed' });
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                const stores = Array.from(db.objectStoreNames);
                resolve({ version: db.version, stores, note: 'upgrade' });
            };
        });
    }''')
    print(f'DB: {json.dumps(db_info, ensure_ascii=False)}')
    need = ['songs', 'playlists', 'albums', 'memories_album']
    have = db_info.get('stores', [])
    print(f'新增 stores 检查: {[(s, s in have) for s in need]}')

    print('=== 5. localStorage 关键键 ===')
    ls = page.evaluate('''() => {
        const keys = ['chat_unread_counts','chat_group_unread_counts','moments_unread_count','games_unread_count','app_lock_unlocked'];
        const out = {};
        keys.forEach(k => { out[k] = localStorage.getItem(k); });
        return out;
    }''')
    print(f'localStorage: {json.dumps(ls, ensure_ascii=False)}')

    print('=== 6. 逐个打开 APP，记录控制台红错 ===')
    apps = ['chat', 'moments', 'settings', 'gallery', 'characters', 'shop', 'games', 'dream', 'music']
    before_err = len(errors)
    before_pe = len(pageerrors)
    for app in apps:
        n0 = len(errors)
        pe0 = len(pageerrors)
        # 点击 app 图标
        clicked = page.evaluate('''(id) => {
            const items = document.querySelectorAll('[data-app-id]');
            for (const it of items) {
                if (it.getAttribute('data-app-id') === id) { it.click(); return true; }
            }
            // 退回桌面再找
            return false;
        }''', app)
        if not clicked:
            # 尝试通过 dock/grid 点击
            page.evaluate('''(id) => {
                const els = document.querySelectorAll('.app-icon, .dock-item, [class*="app"]');
                for (const el of els) {
                    if (el.textContent && el.textContent.includes(id)) { el.click(); return; }
                }
            }''', app)
        page.wait_for_timeout(1500)
        n1 = len(errors)
        pe1 = len(pageerrors)
        new_err = errors[n0:n1]
        new_pe = pageerrors[pe0:pe1]
        status = 'OK' if (not new_err and not new_pe) else 'ERR'
        print(f'  [{status}] {app}: err+{len(new_err)} pageerr+{len(new_pe)}')
        for e in new_err[:3]:
            print(f'        console.error: {e[:200]}')
        for e in new_pe[:3]:
            print(f'        pageerror: {e[:200]}')
        # 回桌面
        page.keyboard.press('Escape')
        page.wait_for_timeout(400)
        # 尝试点返回按钮
        page.evaluate('''() => {
            const backs = document.querySelectorAll('[class*="back"], button[aria-label*="返回"]');
            backs.forEach(b => { try { b.click(); } catch(e){} });
        }''')
        page.wait_for_timeout(400)

    print('\n=== 汇总 ===')
    print(f'总 console.error: {len(errors)}')
    print(f'总 pageerror: {len(pageerrors)}')
    print(f'总 warning: {len(warnings)}')

    # 打印所有 error（去重前 20）
    print('\n--- console.error 列表（前 20，去重）---')
    seen = set()
    cnt = 0
    for e in errors:
        key = e[:160]
        if key in seen:
            continue
        seen.add(key)
        print(f'  {e[:240]}')
        cnt += 1
        if cnt >= 20:
            break

    print('\n--- pageerror 列表（前 20，去重）---')
    seen = set()
    cnt = 0
    for e in pageerrors:
        key = e[:160]
        if key in seen:
            continue
        seen.add(key)
        print(f'  {e[:240]}')
        cnt += 1
        if cnt >= 20:
            break

    # 截图
    page.screenshot(path='/tmp/desktop.png', full_page=False)
    browser.close()

print('\n验证脚本结束。')
