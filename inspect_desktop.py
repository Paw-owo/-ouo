from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 375, 'height': 568})
    page.goto('http://localhost:8080')
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(2500)  # wait for boot animation
    page.screenshot(path='/workspace/before-fix.png', full_page=True)
    print('Screenshot saved to /workspace/before-fix.png')
    browser.close()
