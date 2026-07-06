from playwright.sync_api import sync_playwright
import json

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 375, 'height': 812})
    page.goto('http://localhost:8080')
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(2500)

    info = page.evaluate('''() => {
        const widgets = document.querySelector('.widgets-area');
        const cards = Array.from(widgets.querySelectorAll('.widget-card')).map(card => ({
            classes: card.className,
            childElementCount: card.childElementCount,
            children: Array.from(card.children).map(c => c.className),
            hasNestedCard: !!card.querySelector('.widget-card')
        }));
        return { cards };
    }''')

    print(json.dumps(info, indent=2, ensure_ascii=False))
    browser.close()
