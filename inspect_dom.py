from playwright.sync_api import sync_playwright
import json

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 375, 'height': 667})
    page.goto('http://localhost:8080')
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(2500)

    # Get layout info
    info = page.evaluate('''() => {
        const desktop = document.getElementById('desktop');
        const content = desktop.querySelector('.desktop-content');
        const widgets = content.querySelector('.widgets-area');
        const appGridArea = content.querySelector('.app-grid-area');
        const appGrid = appGridArea.querySelector('.app-grid');
        const dock = content.querySelector('.dock-area');
        const statusBar = desktop.querySelector('.status-bar');

        function rect(el) {
            const r = el.getBoundingClientRect();
            return { width: r.width, height: r.height, top: r.top, bottom: r.bottom };
        }

        function widgetInfo(w) {
            const icon = w.querySelector('.weather-icon, .tip-icon, .vinyl-disc');
            const svg = icon ? icon.querySelector('svg') : null;
            return {
                classes: w.className,
                rect: rect(w),
                iconRect: icon ? rect(icon) : null,
                svgRect: svg ? rect(svg) : null,
                svgWidthAttr: svg ? svg.getAttribute('width') : null,
                svgHeightAttr: svg ? svg.getAttribute('height') : null,
                svgComputed: svg ? { width: getComputedStyle(svg).width, height: getComputedStyle(svg).height } : null
            };
        }

        return {
            desktop: rect(desktop),
            content: rect(content),
            widgets: rect(widgets),
            widgetCards: Array.from(widgets.querySelectorAll('.widget-card')).map(widgetInfo),
            appGridArea: rect(appGridArea),
            appGrid: rect(appGrid),
            dock: rect(dock),
            statusBar: rect(statusBar)
        };
    }''')

    print(json.dumps(info, indent=2, ensure_ascii=False))
    browser.close()
