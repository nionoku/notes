# 📝 Notes

**Version:** `1.1.0`

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

## 🧰 Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview the production build |
| `npm run typecheck` | Run `vue-tsc` |
| `npm run lint` | ESLint, including Prettier checks |
| `npm run lint:css` | Stylelint |
| `npm run format` | Format source files with Prettier |
| `npm run format:check` | Check formatting without changing files |

## 💾 Data and Sync

- Documents and assets are stored in OPFS, scoped to the app's origin.
- Markdown uses YAML frontmatter for tags, dates, archive state, and due dates.
- Export to ZIP regularly if you need an external backup.
- Google Drive sync is optional; setup instructions are in
  [`.sync-services/drive/README.md`](.sync-services/drive/README.md).
- Sync runs automatically when the app starts and after a note is saved.

## 🏗️ Tech Stack

- Vue 3 with `<script setup>` and TypeScript
- Vite, Pinia, Vue Router, `vue-i18n`
- `marked` + DOMPurify for Markdown rendering
- JSZip for import/export and YAML for frontmatter
- `vite-plugin-pwa` for offline install and updates
- ESLint, Stylelint, Prettier, and `vue-tsc`

The source follows Feature-Sliced Design under [`src/`](src/).

## 🌐 Browser Support

Current Chrome, Edge, Firefox, and Safari. OPFS and service workers are
required. Light and dark themes follow the operating-system preference.

## 🎨 Code Style

Project conventions are documented in
[`../.agents/skills/code-style/SKILL.md`](../.agents/skills/code-style/SKILL.md).
