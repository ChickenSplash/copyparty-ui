# copyparty-ui

A minimal, modern web frontend for [copyparty](https://github.com/9001/copyparty).
Plain HTML, CSS and JavaScript with no build step, talking to copyparty's own HTTP API.

## How it fits together

- The UI owns `/`. copyparty runs with `rp-loc: /api` and is reverse-proxied at `/api/`,
  so every folder URL in the UI maps 1:1 to the same path under `/api`.
- `ui/` is served as static files. Any path that isn't under `/_ui/` or `/api/` gets `index.html`.
- `deploy/nginx.conf` is the production nginx config (security headers, strict CSP, the proxy).
- `deploy/plugins/du.py` is a copyparty plugin (loaded with `on404: /path/to/du.py`) that
  serves `GET /api/_du.json`: every readable folder's recursive size and file count in one
  request, read from copyparty's own index. Folders only, no file names, dot-folders left
  out. Without it, `core/usage.js` crawls `?ls` instead, so the UI works on a stock copyparty.

## Code layout

Native ES modules and plain CSS files, loaded directly by the browser.

```
ui/index.html          page shell and the icon sprite
ui/_ui/app.js          entry point: runs each feature's init
ui/_ui/core/           no DOM wiring
  api.js               every copyparty URL and request lives here
  up2k.js              copyparty's chunked upload protocol
  state.js             shared state and the event bus (events are listed at the top)
  cache.js             folder listings shared by the main view and the tree
  usage.js             folder sizes for the whole store as a tree (du plugin, or a crawl)
  dom.js format.js kinds.js paths.js
ui/_ui/ui/             generic widgets: toast, dialog, menu, resizer (drag handle for side panels)
ui/_ui/views/          pure markup: each listing view (list, grid), and preview.js, how each
                       file type previews (shared by the viewer and the preview pane)
ui/_ui/features/       one module per part of the app, each exporting init*()
ui/_ui/css/            tokens.css (theme variables), base.css, then one file per area
```

Conventions:

- Features talk to each other through the event bus in `core/state.js` (for example, a
  rename emits `"changed"` and navigation reloads), not by reaching into each other's DOM.
- No inline scripts, `on*=` attributes or `style=` attributes: the CSP forbids them.
  Use event listeners, and set styles from JS or in CSS.
- Colours, radii and fonts come from `css/tokens.css`, so both themes stay in step.
  File-kind colours are tokens too (`--k-image` and so on).
- Read folders through `core/cache.js` (`getDir`), not `listDir` directly, so every panel
  shares one fetch. The cache drops whatever a `"changed"` event names.
- Anything that opens a file goes through `features/actions.js`, so there's one place that
  decides how files open: `clickItem` for a single click (previews in the pane when it's
  showing), `openItem` to open, `setActive` to change what the pane shows.

## Development

1. Download `copyparty-sfx.py` from the [copyparty releases](https://github.com/9001/copyparty/releases) into `dev/`.
2. Put some test files in `dev/data/`, and some in `dev/data-backups/` (mounted read-only at
   `/Backups`, like the live site's backups), including a dot-folder somewhere.
3. Start copyparty and the dev server:
   ```sh
   cd dev
   python3 copyparty-sfx.py -c cp.conf   # copyparty on 127.0.0.1:3923, password "test"
   python3 serve.py 8090                 # UI on http://127.0.0.1:8090, proxies /api
   ```

`serve.py` sends the same Content-Security-Policy as `deploy/nginx.conf`, so CSP problems show up locally.

## Tests

An end-to-end Playwright run against the dev servers: sign in, browse, views, viewer,
selection, upload, rename, new folder, delete, search, theme, size bars, the tree (expand,
open, follow, keyboard, menu), sidebar hide and resize, the preview pane (folder summary,
click/double-click, keyboard, images, selection, rename, switching off, narrow windows),
keyboard, folder sizes (du plugin vs the crawl fallback), sign out, mobile drawer.
It expects a `Photos/Holiday 2026/` folder of images and a `Docs/` folder with a `notes.txt` in `dev/data/`.

```sh
cd tests
npm install
npx playwright install chromium   # or set CHROME=/path/to/chrome
npm run e2e                       # screenshots land in tests/shots/
```
