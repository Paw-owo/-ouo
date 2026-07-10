import json
from playwright.sync_api import sync_playwright

URL = 'http://localhost:8780/'
DB_NAME = 'ai_phone_db'

errors = []
pageerrors = []

def on_console(msg):
    if msg.type == 'error':
        errors.append(msg.text)

def on_pageerror(err):
    pageerrors.append(str(err))

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    # 全新 context，模拟首次启动（DB 从 0 升到 7）
    context = browser.new_context()
    page = context.new_page()
    page.on('console', on_console)
    page.on('pageerror', on_pageerror)

    page.goto(URL, wait_until='networkidle')
    page.wait_for_timeout(2500)

    # 用正确库名读 DB
    db_info = page.evaluate('''async (name) => {
        return new Promise((resolve) => {
            const req = indexedDB.open(name);
            req.onsuccess = (e) => {
                const db = e.target.result;
                resolve({ version: db.version, stores: Array.from(db.objectStoreNames) });
            };
            req.onerror = () => resolve({ error: String(req.error) });
        });
    }''', DB_NAME)
    print('DB_INFO:', json.dumps(db_info, ensure_ascii=False))
    stores = db_info.get('stores', [])
    print('version:', db_info.get('version'))
    print('stores count:', len(stores))
    print('stores:', stores)
    need = ['songs', 'playlists', 'albums', 'memories_album']
    print('新增 stores:')
    for s in need:
        print(f'  {s}: {"OK" if s in stores else "MISSING"}')

    print(f'\ninit 期间 console.error: {len(errors)}')
    for e in errors[:10]:
        print(f'  {e[:200]}')
    print(f'init 期间 pageerror: {len(pageerrors)}')
    for e in pageerrors[:10]:
        print(f'  {e[:200]}')

    browser.close()
