# 🔐 Vault — Secure File Sharing

A self-hosted file sharing app with expiring links, download limits, and a beautiful dashboard.

---

## Features

- Upload any file type (configurable size limit)
- Generate shareable direct-download links
- Set expiry timers (1h → 30d) or keep files forever
- Limit max downloads per file
- Auto-delete expired files
- Single-user login via environment variables
- Professional dark UI

---

## Quick Start (Docker Compose)

### 1. Clone and configure

```bash
cp .env.example .env
```

Edit `.env`:
```env
VAULT_USERNAME=admin
VAULT_PASSWORD=your-secure-password
SESSION_SECRET=a-long-random-string
BASE_URL=http://localhost:3000
MAX_FILE_SIZE_MB=500
```

### 2. Run

```bash
docker compose up -d
```

Visit `http://localhost:3000` — done.

---

## Deploy on Railway

1. Push this repo to GitHub
2. Create a new Railway project → **Deploy from GitHub**
3. Add a **Volume** and mount it at `/data` (for the database)
4. Add another Volume mounted at `/uploads` (for files)
5. Set environment variables in Railway dashboard:

| Variable | Value |
|---|---|
| `VAULT_USERNAME` | your username |
| `VAULT_PASSWORD` | your password |
| `SESSION_SECRET` | random string (32+ chars) |
| `BASE_URL` | `https://your-app.up.railway.app` |
| `MAX_FILE_SIZE_MB` | `500` |
| `DB_PATH` | `/data/vault.db` |
| `UPLOADS_DIR` | `/uploads` |

6. Deploy — Railway auto-detects the Dockerfile.

---

## Deploy on Render

1. Push this repo to GitHub
2. New Render service → **Web Service** → connect repo
3. Runtime: **Docker**
4. Add a **Disk** in Render: mount path `/data` (for DB)
   - Note: Render free tier doesn't support persistent disks for uploads. Use a paid plan or swap to S3/R2 storage.
5. Set environment variables (same as Railway table above)
6. Deploy

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `VAULT_USERNAME` | `admin` | Login username |
| `VAULT_PASSWORD` | `changeme123` | Login password |
| `SESSION_SECRET` | random | Cookie signing secret |
| `BASE_URL` | `http://localhost:3000` | Used for share link generation |
| `MAX_FILE_SIZE_MB` | `500` | Max upload size in MB |
| `PORT` | `3000` | Server port |
| `DB_PATH` | `/data/vault.db` | SQLite database path |
| `UPLOADS_DIR` | `/uploads` | File storage directory |

---

## Architecture

```
vault/
├── src/
│   ├── server.js          # Express app, cron jobs
│   ├── db.js              # SQLite (better-sqlite3)
│   ├── middleware/
│   │   └── auth.js        # Session auth guard
│   ├── routes/
│   │   ├── auth.js        # POST /auth/login, /auth/logout
│   │   ├── files.js       # GET/POST/DELETE /api/files
│   │   └── download.js    # GET /d/:token
│   └── public/
│       ├── login.html
│       ├── dashboard.html
│       ├── css/dashboard.css
│       └── js/dashboard.js
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

---

## Security Notes

- All upload/management routes are session-protected
- Rate limiting on login (10 attempts / 15 min)
- Files are stored with random UUIDs, not original names
- Share tokens are random 32-char hex strings
- Sessions expire after 24 hours
