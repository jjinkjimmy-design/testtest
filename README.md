# 🔐 Vault v2 — Secure File Sharing

A self-hosted file vault with folders, versioning, pastes, analytics, QR codes, and Discord webhooks.

---

## What's New in v2

| Feature | Details |
|---|---|
| **Folders** | Organise files into collections from the sidebar |
| **Bulk delete** | Select multiple files and delete at once |
| **Rename files** | Rename without re-uploading |
| **File versioning** | Upload a new version — same share link, old file replaced |
| **Duplicate detection** | SHA-256 hash check on every upload, warns before re-uploading |
| **Pastebin** | Create text/code pastes with syntax highlighting, burn-after-read, expiry |
| **Analytics** | Upload/download charts (last 30 days), most-downloaded files, storage stats |
| **QR Codes** | Auto-generated for every share link and paste |
| **Discord Webhook** | Notified on every file download with file name, size, download count |

---

## Quick Start (Docker Compose)

```bash
cp .env.example .env   # fill in username, password, SESSION_SECRET
docker compose up -d
# → http://localhost:3000
```

---

## Deploy on Railway

1. Push repo to GitHub
2. New project → Deploy from GitHub repo
3. Add two Volumes: mount at `/data` and `/uploads`
4. Set environment variables:

| Variable | Value |
|---|---|
| `VAULT_USERNAME` | your username |
| `VAULT_PASSWORD` | your password |
| `SESSION_SECRET` | long random string |
| `BASE_URL` | `https://your-app.up.railway.app` |
| `MAX_FILE_SIZE_MB` | `500` |
| `DB_PATH` | `/data/vault.db` |
| `UPLOADS_DIR` | `/uploads` |
| `DISCORD_WEBHOOK_URL` | *(optional)* Discord webhook URL |

---

## Deploy on Render

Same env vars as Railway. Add a **Disk** mounted at `/data` for the database.
For uploads persistence on Render you need a paid plan (disk at `/uploads`), or swap storage to S3/R2.

---

## Discord Webhook Setup

1. Open your Discord server → channel settings → **Integrations** → **Webhooks**
2. Create a new webhook, copy the URL
3. Set `DISCORD_WEBHOOK_URL` in your `.env` or hosting dashboard
4. Every file download will post a notification to that channel

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `VAULT_USERNAME` | `admin` | Login username |
| `VAULT_PASSWORD` | `changeme123` | Login password |
| `SESSION_SECRET` | fallback | Cookie signing secret |
| `BASE_URL` | `http://localhost:3000` | Used for share link generation |
| `MAX_FILE_SIZE_MB` | `500` | Max upload size in MB |
| `PORT` | `3000` | Server port |
| `DB_PATH` | `/data/vault.db` | SQLite database path |
| `UPLOADS_DIR` | `/uploads` | File storage path |
| `DISCORD_WEBHOOK_URL` | *(empty)* | Discord webhook for download alerts |

---

## Project Structure

```
src/
├── server.js
├── db.js                    # SQLite schema + all queries
├── middleware/auth.js
├── routes/
│   ├── auth.js              # Login / logout
│   ├── files.js             # Upload, rename, version, bulk delete
│   ├── folders.js           # Folder CRUD
│   ├── pastes.js            # Paste CRUD
│   ├── stats.js             # Analytics data
│   ├── qr.js                # QR code generation
│   ├── download.js          # Public file download + Discord webhook
│   └── pasteview.js         # Public paste view with syntax highlighting
└── public/
    ├── login.html
    ├── dashboard.html
    ├── css/dashboard.css
    └── js/dashboard.js
```
