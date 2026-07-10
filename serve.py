import http.server
import socketserver
import os

class Handler(http.server.SimpleHTTPRequestHandler):
    def guess_type(self, path):
        # 强制 .txt 中带 html 的也当 html，并允许带空格文件名
        if 'index.html' in path:
            return 'text/html; charset=utf-8'
        if path.endswith('.js') or path.endswith('.txt') and ('.js' in path):
            return 'application/javascript; charset=utf-8'
        return super().guess_type(path)

PORT = 8765
os.chdir('/workspace')
with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Serving on {PORT}")
    httpd.serve_forever()
