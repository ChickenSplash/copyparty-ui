# copyparty-ui

A minimal, modern web frontend for [copyparty](https://github.com/9001/copyparty).
Plain HTML, CSS and JavaScript with no build step, talking to copyparty's own HTTP API.

## How it fits together

- The UI owns `/`. copyparty runs with `rp-loc: /api` and is reverse-proxied at `/api/`,
  so every folder URL in the UI maps 1:1 to the same path under `/api`.
- `ui/` is served as static files. Any path that isn't under `/_ui/` or `/api/` gets `index.html`.
- `deploy/nginx.conf` is the production nginx config (security headers, strict CSP, the proxy).

## Development

1. Download `copyparty-sfx.py` from the [copyparty releases](https://github.com/9001/copyparty/releases) into `dev/`.
2. Put some test files in `dev/data/`.
3. Start copyparty and the dev server:
   ```sh
   cd dev
   python3 copyparty-sfx.py -c cp.conf   # copyparty on 127.0.0.1:3923, password "test"
   python3 serve.py 8090                 # UI on http://127.0.0.1:8090, proxies /api
   ```

`serve.py` sends the same Content-Security-Policy as `deploy/nginx.conf`, so CSP problems show up locally.
