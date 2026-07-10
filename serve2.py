import http.server
import socketserver
import os
import urllib.parse

WORKSPACE = '/workspace'

# 目录结构 → 扁平文件的映射
# 线上结构是 core/ + apps/ + apps/chat/，但工作区文件全部平铺在根。
# 另有两个同名冲突：core/memory.js = "memory 2.js"，core/ui.js = "ui 2.js"。
# apps/chat/memory.js = "memory.js"（聊天记忆 UI）。

def resolve_file(path):
    """把请求路径映射到工作区里的真实文件，返回绝对路径或 None。"""
    path = urllib.parse.unquote(path)
    # 去掉 query
    path = path.split('?')[0]

    # 入口
    if path in ('/', '/index.html'):
        return os.path.join(WORKSPACE, 'index.html 2.txt')

    # 同名冲突：core/memory.js = "memory 2.js"，core/ui.js = "ui 2.js"
    # apps/chat/memory.js = "memory.js"（聊天记忆 UI），用 basename 即可
    if path == '/core/memory.js':
        return os.path.join(WORKSPACE, 'memory 2.js')
    if path == '/core/ui.js':
        return os.path.join(WORKSPACE, 'ui 2.js')

    # 其余一律取 basename（文件全部平铺在根，嵌套路径也能命中）
    name = os.path.basename(path)

    # .txt 后缀的资源
    if name == 'style.css':
        return os.path.join(WORKSPACE, 'style.css.txt')
    if name == 'manifest.json':
        return os.path.join(WORKSPACE, 'manifest.json.txt')
    if name == 'thread-style.css':
        return os.path.join(WORKSPACE, 'thread-style.css.txt')

    return os.path.join(WORKSPACE, name)


class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        resolved = resolve_file(self.path)
        if resolved and os.path.isfile(resolved):
            return resolved
        return resolved  # 即使不存在也返回，让 send 报 404

    def guess_type(self, path):
        full = self.translate_path(self.path)
        base = os.path.basename(full or '')
        if base.endswith('.js'):
            return 'application/javascript; charset=utf-8'
        if base.endswith('.css'):
            return 'text/css; charset=utf-8'
        if base.endswith('.json') or 'manifest' in base:
            return 'application/json; charset=utf-8'
        if 'index.html' in (full or '') or base.endswith('.html') or base.endswith('.txt'):
            return 'text/html; charset=utf-8'
        return super().guess_type(path)

    def end_headers(self):
        # 允许本地模块加载
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()


PORT = 8780
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Serving on {PORT}", flush=True)
    httpd.serve_forever()
