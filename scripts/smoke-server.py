#!/usr/bin/env python3
"""Static server for the sqlite3mc smoke test with OPFS-required headers."""
import http.server
import os
import socketserver
import sys

ROOT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', 'public'))
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8765


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def guess_type(self, path):
        p = str(path)
        if p.endswith('.wasm'):
            return 'application/wasm'
        if p.endswith('.js'):
            return 'text/javascript'
        return super().guess_type(path)

    def log_message(self, format, *args):  # noqa: A002 - stdlib signature
        print('[smoke] ' + (format % args), flush=True)


if __name__ == '__main__':
    with socketserver.TCPServer(('', PORT), Handler) as httpd:
        print(f'[smoke] serving {ROOT} on http://localhost:{PORT}', flush=True)
        httpd.serve_forever()
