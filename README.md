# 📝 Notes

**Version:** `1.3.0`

Notes is a local-first Markdown knowledge base that runs entirely in the
browser. Documents live in the Origin Private File System (OPFS), the app works
offline as a PWA, and an optional Google Drive integration keeps devices in
sync.

## ✨ What It Does

- 📝 Create and manage Markdown notes with tags.
- 🔎 Search notes by title, headings (`#`), and tags.
- 📦 Export a single note or the whole vault to ZIP.
- ☁️ Sync notes with Google Drive through Apps Script.
- 📲 Work offline as an installable PWA.

## 🚀 Run with GitHub Pages

The app is designed for a project page at:

```text
https://<username>.github.io/notes/
```

1. Push the repository to GitHub. For the default path, name the repository
   `notes`.
2. Open **Settings → Pages → Build and deployment** and set **Source** to
   **GitHub Actions**.
3. Push to `main`, or run **Actions → Deploy GitHub Pages → Run workflow**.
4. Wait for the workflow in
   [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)
   to finish. The site will be available at the URL above.

The workflow builds with `BASE_PATH=/notes/`, creates `dist/404.html` for SPA
deep links, and publishes `dist` through GitHub Pages.

If the repository has a different name, update `BASE_PATH` in the workflow to
`/<repository-name>/`.

## 💻 Run Locally

### Requirements

- Node.js 22 LTS (Vite 8 requires Node.js 20.19+ or 22.12+)
- npm

### Development

```bash
git clone https://github.com/<username>/notes.git
cd notes
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

OPFS requires a secure context. `localhost` works; for a custom host use HTTPS.

### Local Production Build

```bash
npm run build
npm run preview
```

`preview` serves the production build locally, including the service worker and
PWA manifest. For a custom subpath:

```bash
BASE_PATH=/notes/ npm run build
BASE_PATH=/notes/ npm run preview
```

When hosting `dist/` on another static server, configure an SPA fallback to
`index.html` (or copy `index.html` to `404.html`) so direct document URLs work.
