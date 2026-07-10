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

    page.goto('http://localhost:8765/index.html%202.txt', wait_until='networkidle', timeout=30000)
    page.wait_for_timeout(5000)

    # 页面 body 文本前 500 字
    body_text = page.evaluate('() => document.body ? document.body.innerText.slice(0,500) : "NO BODY"')
    print("=== Body text (first 500) ===")
    print(body_text)

    # script 标签数和类型
    scripts = page.evaluate('''() => {
        return Array.from(document.querySelectorAll('script')).map(s => ({
            type: s.type,
            src: s.src,
            inlineLen: s.textContent.length
        }));
    }''')
    print("=== Scripts ===")
    for s in scripts:
        print(f"  {s}")

    # 重试 IndexedDB（等待更久）
    db_info = page.evaluate('''async () => {
        return new Promise((resolve) => {
            const req = indexedDB.open('ai_phone_db');
            req.onsuccess = (e) => {
                const db = e.target.result;
                resolve({ version: db.version, stores: Array.from(db.objectStoreNames) });
            };
            req.onerror = (e) => resolve({ error: String(e.target.error) });
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                resolve({ version: db.version, stores: Array.from(db.objectStoreNames), event: 'upgradeneeded' });
            };
        });
    }''')
    print("=== IndexedDB (retry) ===")
    print(db_info)

    print("=== PageErrors ===")
    for e in pageerrors:
        print(f"  {e}")
    print(f"Total pageerrors: {len(pageerrors)}")
    print("=== Console Errors ===")
    for e in errors:
        print(f"  {e}")
    print(f"Total errors: {len(errors)}")

    browser.close()
