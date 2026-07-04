#!/usr/bin/env python3
# 泡泡 Phase 1 冒烟测试：验证解锁 / 桌面 / 计算器 / 主题切换 / 离线。
import sys
from playwright.sync_api import sync_playwright

URL = "http://localhost:8000/"
errors = []
logs = []

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 390, "height": 844})
        page = context.new_page()
        page.on("console", lambda msg: logs.append(f"[{msg.type}] {msg.text}"))
        page.on("pageerror", lambda exc: errors.append(str(exc)))

        print("==> 1. 加载页面")
        page.goto(URL, wait_until="networkidle", timeout=15000)
        page.wait_for_timeout(800)

        boot = page.query_selector("#boot-screen")
        boot_hidden = boot.get_attribute("class") if boot else None
        print(f"   boot-screen class: {boot_hidden!r}")
        page.wait_for_timeout(500)

        print("==> 2. 截图锁屏")
        page.screenshot(path="tests/popo_01_lock.png")

        print("==> 3. 输入密码 0326")
        for k in ["0", "3", "2", "6"]:
            page.click(f'.lock-key[data-key="{k}"]')
            page.wait_for_timeout(120)

        page.wait_for_timeout(900)
        lock = page.query_selector("#lock-screen")
        lock_class = lock.get_attribute("class") if lock else None
        print(f"   lock-screen class after password: {lock_class!r}")
        page.screenshot(path="tests/popo_02_unlocked.png")

        if lock_class and "unlocked" in lock_class:
            print("   [PASS] 锁屏已解锁")
        else:
            print("   [FAIL] 锁屏未解锁")

        print("==> 4. 桌面渲染检查")
        dock_count = page.locator(".dock .desktop-icon").count()
        grid_count = page.locator(".icon-grid .desktop-icon").count()
        widget_count = page.locator(".widget-area .widget").count()
        status_icons = page.locator(".status-bar-icon").count()
        print(f"   dock 图标数: {dock_count}")
        print(f"   桌面图标数: {grid_count}")
        print(f"   widget 数: {widget_count}")
        print(f"   状态栏图标数: {status_icons}")
        page.screenshot(path="tests/popo_03_desktop.png")

        print("==> 5. 打开计算器")
        calc_icon = page.locator(".icon-grid .desktop-icon", has_text="计算器").first
        calc_icon.click()
        page.wait_for_timeout(800)
        app_root_classes = page.query_selector("#app-root").get_attribute("class")
        print(f"   #app-root class: {app_root_classes!r}")
        page.screenshot(path="tests/popo_04_calc.png")

        print("==> 6. 计算 5 + 3")
        page.click('.calc-key:has-text("5")')
        page.click('.calc-key:has-text("+")')
        page.click('.calc-key:has-text("3")')
        page.click('.calc-key:has-text("=")')
        page.wait_for_timeout(300)
        display = page.query_selector("#calc-display")
        display_text = display.inner_text() if display else "?"
        print(f"   显示结果: {display_text!r} (期望 '8')")
        page.screenshot(path="tests/popo_05_calc_result.png")
        if display_text.strip() == "8":
            print("   [PASS] 计算器正确")
        else:
            print("   [FAIL] 计算器结果不对")

        page.click("#calc-back")
        page.wait_for_timeout(500)

        print("==> 7. 打开设置切换主题")
        settings_icon = page.locator(".dock .dock-icon", has_text="设置").first
        settings_icon.click()
        page.wait_for_timeout(800)
        page.screenshot(path="tests/popo_06_settings.png")

        sakura = page.locator(".theme-card", has_text="樱花粉").first
        sakura.click()
        page.wait_for_timeout(500)
        bg = page.evaluate("getComputedStyle(document.body).backgroundColor")
        print(f"   body bg after 樱花粉: {bg}")
        page.screenshot(path="tests/popo_07_theme_sakura.png")

        dark = page.locator(".theme-card", has_text="深夜蓝").first
        if dark.count() > 0:
            dark.click()
            page.wait_for_timeout(500)
            bg2 = page.evaluate("getComputedStyle(document.body).backgroundColor")
            print(f"   body bg after 深夜蓝: {bg2}")
            page.screenshot(path="tests/popo_08_theme_dark.png")
        else:
            print("   [WARN] 没找到深夜蓝主题卡片")

        print("==> 8. 测试离线")
        context.set_offline(True)
        page.reload(wait_until="networkidle", timeout=15000)
        page.wait_for_timeout(800)
        boot2 = page.query_selector("#boot-screen")
        boot2_class = boot2.get_attribute("class") if boot2 else None
        print(f"   离线 reload 后 boot-screen class: {boot2_class!r}")
        page.screenshot(path="tests/popo_09_offline.png")
        if boot2_class and "hide" in boot2_class:
            print("   [PASS] 离线可用")
        else:
            print("   [FAIL] 离线启动卡住")
        context.set_offline(False)

        browser.close()

    print("\n==> 控制台错误汇总")
    if errors:
        for e in errors:
            print(f"   [PAGEERROR] {e}")
    else:
        print("   无 pageerror")

    errs_in_logs = [l for l in logs if l.startswith("[error]")]
    warns = [l for l in logs if l.startswith("[warning]")]
    print(f"   console.error 数: {len(errs_in_logs)}")
    print(f"   console.warning 数: {len(warns)}")
    for l in errs_in_logs[:10]:
        print(f"   {l}")

    if errors:
        sys.exit(1)

if __name__ == "__main__":
    main()
