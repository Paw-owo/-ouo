from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 375, 'height': 812})
    page.goto('http://localhost:8080')
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(2500)

    logs = []
    page.on('console', lambda msg: logs.append(f'{msg.type}: {msg.text}'))

    # Trigger theme change via UI or direct JS
    page.evaluate('''() => {
        const theme = document.documentElement.getAttribute('data-theme') || 'berry-cloud';
        const next = theme === 'berry-cloud' ? 'taro-coconut' : 'berry-cloud';
        document.documentElement.setAttribute('data-theme', next);
        window.dispatchEvent(new Event('theme:changed'));
    }''')
    page.wait_for_timeout(500)

    print('Console logs:')
    for log in logs:
        print(log)
    browser.close()
