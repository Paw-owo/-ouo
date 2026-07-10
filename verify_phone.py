from playwright.sync_api import sync_playwright

errors = []
warnings = []
logs = []

def on_console(msg):
    if msg.type == 'error':
        errors.append(msg.text)
    elif msg.type == 'warning':
        warnings.append(msg.text)
    else:
        logs.append(f"[{msg.type}] {msg.text}")

def on_pageerror(err):
    errors.append(f"PAGEERROR: {err}")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.on('console', on_console)
    page.on('pageerror', on_pageerror)

    page.goto('http://localhost:8765/index.html%202.txt', wait_until='networkidle', timeout=30000)
    page.wait_for_timeout(3000)

    db_info = page.evaluate('''async () => {
        return new Promise((resolve) => {
            const req = indexedDB.open('ai_phone_db');
            req.onsuccess = (e) => {
                const db = e.target.result;
                const stores = Array.from(db.objectStoreNames);
                resolve({ version: db.version, stores });
            };
            req.onerror = () => resolve({ error: 'open failed' });
        });
    }''')
    print("=== IndexedDB ===")
    print(f"version: {db_info.get('version')}")
    print(f"stores: {db_info.get('stores')}")
    new_stores = ['songs','playlists','albums','memories_album']
    for s in new_stores:
        present = s in (db_info.get('stores') or [])
        print(f"  {s}: {'OK' if present else 'MISSING'}")

    ls = page.evaluate('''() => {
        const keys = ['chat_unread_counts','chat_group_unread_counts','moments_unread_count','games_unread_count','app_badges','chat_unread_count'];
        const result = {};
        keys.forEach(k => { result[k] = localStorage.getItem(k); });
        return result;
    }''')
    print("=== localStorage keys ===")
    for k,v in ls.items():
        print(f"  {k}: {v}")

    bus_ok = page.evaluate('''() => ({
        AppBus: !!window.AppBus,
        AppEvents: !!window.AppEvents,
        refreshDesktopBadges: typeof window.refreshDesktopBadges
    })''')
    print("=== Bus ===")
    print(f"  {bus_ok}")

    print("=== Console Errors ===")
    for e in errors:
        print(f"  {e}")
    print(f"Total errors: {len(errors)}")
    print("=== Console Warnings (first 10) ===")
    for w in warnings[:10]:
        print(f"  {w}")

    page.screenshot(path='/tmp/desktop.png', full_page=False)
    print("=== Screenshot saved ===")

    browser.close()
