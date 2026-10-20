#!/usr/bin/env python3
"""Dev server: serves ../ui like the nginx container does and proxies /api to copyparty."""
import http.client
import http.server
import os
import sys

UI = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "ui")
BACKEND = ("127.0.0.1", 3923)
# Same policy as deploy/nginx.conf, so CSP breakage shows up locally.
CSP = ("default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self'; "
       "frame-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'")
HOP = {"connection", "keep-alive", "transfer-encoding", "te", "upgrade", "proxy-connection"}


class H(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=UI, **kw)

    def _proxy(self):
        n = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(n) if n else None
        hdrs = {k: v for k, v in self.headers.items() if k.lower() not in HOP}
        c = http.client.HTTPConnection(*BACKEND, timeout=300)
        c.request(self.command, self.path, body=body, headers=hdrs)
        r = c.getresponse()
        data = r.read()
        self.send_response(r.status, r.reason)
        for k, v in r.getheaders():
            if k.lower() not in HOP and k.lower() != "content-length":
                self.send_header(k, v)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    def _static(self):
        path = self.path.split("?", 1)[0]
        if path.startswith("/_ui/") and os.path.isfile(os.path.join(UI, path.lstrip("/"))):
            return super().do_GET()
        self.path = "/index.html"
        return super().do_GET()

    def do_GET(self):
        return self._proxy() if self.path.startswith("/api/") or self.path == "/api" else self._static()

    def do_HEAD(self):
        return self.do_GET()

    def do_POST(self):
        return self._proxy()

    do_PUT = do_DELETE = do_POST

    def end_headers(self):
        if not self.path.startswith("/api"):
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Security-Policy", CSP)
        super().end_headers()

    def log_message(self, fmt, *a):
        sys.stderr.write("%s %s\n" % (self.command, self.path))


http.server.ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1]) if len(sys.argv) > 1 else 8090), H).serve_forever()
