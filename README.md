# 📝 Notes

**Version:** `1.11.0`

Notes is a local-first Markdown knowledge base that runs entirely in the
browser. Documents live in the Origin Private File System (OPFS), the app works
offline as a PWA, and an optional Google Drive integration keeps devices in
sync.

## ✨ What It Does

- 📝 Create and manage Markdown notes with tags.
- 🔎 Search notes by title, headings (`#`), and tags.
- 📦 Export the whole vault to ZIP.
- ☁️ Sync notes with Google Drive through Apps Script.
- 📲 Work offline as an installable PWA.

## 🚀 App and Google Drive Sync

The app is deployed at:

**<https://nionoku.github.io/notes/>**

### Google Drive sync

1. Create a Google Apps Script Web App using the files in
   [`.sync-services/drive/`](.sync-services/drive/). Detailed deployment steps
   are in [`.sync-services/drive/README.md`](.sync-services/drive/README.md).
2. Deploy it with **Execute as: Me** and **Who has access: Anyone**, then copy
   the Web App URL ending in `/exec`.
3. In the app open the **⋯** menu → **Enter access token**, and paste the Web App
   URL and the `SYNC_TOKEN` from the Apps Script project.
4. Run sync from the same menu. Notes are stored in the `Notes Sync` folder on
   Google Drive.

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
