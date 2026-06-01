# Web Portals

A basic alternative to Ferdium

## Project Setup

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Test

```bash
$ npm run test:source
$ npm run test:e2e
```

### Manual smoke pass

Before shipping changes around overlays, service webviews, downloads, focus, or profiles:

- Start with `npm run dev` and confirm the dev profile still has services/data after restart.
- Drag and reorder items inside a service webview that uses pragmatic drag and drop.
- Open Add Service, Permissions, and Screen Picker overlays several times and confirm they open every time without freeze, double blink, fade, or zoom.
- While an overlay is open, confirm the app is still clickable after closing it and service webviews are not frozen.
- Trigger a download from a service page and confirm the download manager appears immediately, has no fade-in, and its expand/cancel/close buttons work.
- Press Ctrl+F in a service webview and confirm find-in-page opens and the input is focused.
- Switch services/tabs after using find or overlays and confirm focus returns to the expected service page.
- Build with `npm run build:win`, install, and repeat the drag/drop, overlays, download manager, and Ctrl+F checks.

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```
