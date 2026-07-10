from playwright.sync_api import sync_playwright

errors = []
warnings = []
pageerrors = []

def on_console(msg):
    if msg.type == 'error':
        errors.append(msg.text)
    elif msg.type == 'warning':
        warnings.append(msg.text)

def on_pageerror(err):
    pageerrors.append(str(err))

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.on('console', on_console)
    page.on('pageerror', on_pageerror)

    page.goto('http://localhost:8770/index.html', wait_until='networkidle', timeout=30000)
    page.wait_for_timeout(5000)

    body_text = page.evaluate('() => document.body ? document.body.innerText.slice(0,300) : "NO BODY"')
    print("=== Body text (first 300) ===")
    print(body_text)

    db_info = page.evaluate('''async () => {
        return new Promise((resolve) => {
            const req = indexedDB.open('ai_phone_db');
            req.onsuccess = (e) => {
                const db = e.target.result;
                resolve({ version: db.version, stores: Array.from(db.objectStoreNames) });
            };
            req.onerror = (e) => resolve({ error: String(e.target.error) });
        });
    }''')
    print("=== IndexedDB ===")
    print(f"version: {db_info.get('version')}")
    stores = db_info.get('stores') or []
    print(f"stores ({len(stores)}): {stores}")
    for s in ['songs','playlists','albums','memories_album','api_pool','characters','messages','moments','memories']:
        print(f"  {s}: {'OK' if s in stores else 'MISSING'}")

    bus = page.evaluate('''() => ({
        AppBus: !!window.AppBus,
        AppEvents: !!window.AppEvents,
        refreshDesktopBadges: typeof window.refreshDesktopBadges
    })''')
    print("=== Bus ===")
    print(bus)

    print("=== PageErrors ===")
    for e in pageerrors:
        print(f"  {e}")
    print(f"Total: {len(pageerrors)}")
    print("=== Console Errors ===")
    for e in errors:
        print(f"  {e}")
    print(f"Total: {len(errors)}")
    print("=== Warnings (first 5) ===")
    for w in warnings[:5]:
        print(f"  {w}")

    browser.close()
