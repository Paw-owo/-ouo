import json
from playwright.sync_api import sync_playwright

URL = 'http://localhost:8780/'

errors = []
pageerrors = []
warnings = []

def on_console(msg):
    t = msg.type
    text = msg.text
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

    page.goto(URL, wait_until='networkidle')
    page.wait_for_timeout(1500)

    # 解锁
    if page.locator('#lock-screen').is_visible():
        for key in ['0', '3', '2', '6']:
            page.locator(f'#lock-pad button[data-key="{key}"]').click()
            page.wait_for_timeout(120)
        page.wait_for_timeout(600)

    # 打开 games
    print('=== 打开 games ===')
    n0 = len(errors); pe0 = len(pageerrors)
    page.evaluate('''() => {
        const items = document.querySelectorAll('[data-app-id]');
        for (const it of items) {
            if (it.getAttribute('data-app-id') === 'games') { it.click(); return true; }
        }
    }''')
    page.wait_for_timeout(1500)
    print(f'games 打开: err+{len(errors)-n0} pageerr+{len(pageerrors)-pe0}')

    # 点击 tarot 卡片
    print('=== 进入 tarot ===')
    n0 = len(errors); pe0 = len(pageerrors)
    tarot_card = page.locator('.hub-game-card[data-game="tarot"]')
    count = tarot_card.count()
    print(f'tarot 卡片数量: {count}')
    if count > 0:
        tarot_card.first.click()
        page.wait_for_timeout(2000)
        print(f'tarot 进入后: err+{len(errors)-n0} pageerr+{len(pageerrors)-pe0}')
        # 确认 tarot 界面渲染
        tarot_visible = page.evaluate('''() => !!document.querySelector('.tarot-game')''')
        print(f'tarot 界面已渲染: {tarot_visible}')
    else:
        print('未找到 tarot 卡片，跳过')

    # 测试 characters:updated 监听不重复注册
    print('=== 测试 characters:updated 监听 ===')
    listener_test = page.evaluate('''async () => {
        try {
            if (!window.AppBus || !window.AppBus.emit) return { ok: false, reason: 'no AppBus' };
            // 多次 emit，不应报错；监听器内部应幂等
            for (let i = 0; i < 3; i++) {
                window.AppBus.emit('characters:updated', {});
            }
            await new Promise(r => setTimeout(r, 300));
            return { ok: true };
        } catch (e) {
            return { ok: false, error: String(e) };
        }
    }''')
    print(f'characters:updated 连发3次: {json.dumps(listener_test, ensure_ascii=False)}')

    print(f'\n=== 汇总 ===')
    print(f'总 console.error: {len(errors)}')
    print(f'总 pageerror: {len(pageerrors)}')
    print(f'总 warning: {len(warnings)}')
    seen = set()
    for e in errors:
        k = e[:160]
        if k in seen: continue
        seen.add(k)
        print(f'  ERR: {e[:240]}')
    for e in pageerrors:
        k = e[:160]
        if k in seen: continue
        seen.add(k)
        print(f'  PE: {e[:240]}')

    page.screenshot(path='/tmp/tarot.png', full_page=False)
    browser.close()
