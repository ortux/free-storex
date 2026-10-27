# Free Store — GitHub Encrypted File Storage

Secure file storage platform that uses GitHub as a public encrypted storage backend.
Every file is encrypted with **AES-256-GCM** before upload. GitHub stores only ciphertext.

Large files use resumable GitHub-backed chunk uploads. The backend encrypts each
chunk independently with a unique nonce and authenticated file/chunk metadata;
the frontend resumes only chunks confirmed by the server.

---

## Architecture

```
User → Frontend → Backend → GitHub (*.enc ciphertext)
                          ↕
                        MySQL (metadata, encrypted keys)
```

**Security model:**
- Keys wrapped with user master key (AES-256-GCM)
- Master key encrypted with server secret (HKDF + AES-256-GCM)
- Random filenames — original names stored only in DB
- GitHub tokens encrypted at rest
- API keys stored as SHA-256 hashes only

---

## Stack

| Layer      | Technology                          |
|------------|-------------------------------------|
| Backend    | Node.js 26, TypeScript, Express.js  |
| Database   | MySQL via `mysql2`                  |
| Auth       | GitHub OAuth 2.0 + Passport.js      |
| Storage    | GitHub REST API (@octokit/rest)     |
| Encryption | Node.js `crypto` (AES-256-GCM)      |
| Frontend   | React 18, Vite, Tailwind CSS        |

---

## Setup

### 1. Create a GitHub OAuth App

Go to [GitHub Settings → OAuth Apps → New OAuth App](https://github.com/settings/applications/new):

```
Application name: Free Store (dev)
Homepage URL: http://localhost:5173
Authorization callback URL: http://localhost:5173/auth/github/callback
```

Copy the **Client ID** and **Client Secret**.

### 2. Set up MySQL

```sql
CREATE DATABASE free_store CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 3. Configure environment

```bash
cd backend
cp .env.example .env
```

Edit `.env`:

```env
DATABASE_URL=mysql://root:yourpassword@localhost:3306/free_store
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
SESSION_SECRET=<run: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
MASTER_KEY_ENCRYPTION_SECRET=<run: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
UPLOAD_TOKEN_SECRET=<run: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
LARGE_FILE_THRESHOLD_MB=20
CHUNK_SIZE_MB=5
MAX_FILE_SIZE_MB=1024
UPLOAD_EXPIRATION_HOURS=24
UPLOAD_CONCURRENCY=3
UPLOAD_MAX_RETRIES=3
CLEANUP_INTERVAL_MINUTES=30
GITHUB_CONTENTS_MAX_OBJECT_MB=100
GITHUB_CONTENT_WRITE_INTERVAL_MS=10000
PROXY_SHARED_SECRET=<same random secret configured on the frontend proxy>
UPLOAD_PUBLIC_ORIGIN=https://api.yourdomain.com
```

### 4. Install dependencies

```bash
# From the root of the project
npm install --workspace=backend
npm install --workspace=frontend
```

The backend no longer uses Prisma or Prisma Client generation. Its only database driver is `mysql2`.

Or separately:

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 5. Create database tables

In cPanel, create a MySQL database and database user, grant that user access, then open phpMyAdmin for the database. For a new installation, import `backend/database/schema.sql`. For an existing installation, apply each unapplied SQL migration in `backend/prisma/migrations/` in timestamp order; the GitHub repository-sharding feature requires `20261022110000_add_github_storage_shards/migration.sql` before deploying the updated backend. These scripts do not drop existing file data. The backend uses `mysql2`; no Prisma setup, generation, or migration commands are needed.

### GitHub storage repository sharding

Encrypted objects are automatically allocated across GitHub repositories. The backend records each storage repository in `storage_repositories` and stores the repository ID alongside each file or chunk, so downloads and deletes continue to use the original location. A repository is rotated out at an estimated 9 GiB and a new repository is created on the next object write. Existing users' original repository is registered on first use; existing files with no repository ID continue to resolve to that original repository.

This increases the available space across repositories but is **not unlimited storage**: GitHub account policies, API rate limits, repository creation limits, and service availability still apply. GitHub repository size is estimated from its reported size plus bytes written by the app, and Git history means deleting a file does not necessarily reclaim repository storage. Storage repository contents remain public, as in the current GitHub storage implementation; only encrypted file bytes are uploaded.

### 6. Start development servers

**Backend:**
```bash
cd backend
npm run dev
```

**Frontend (separate terminal):**
```bash
cd frontend
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

The frontend always calls `/api/v1` on its own origin. Local Vite proxying forwards those requests to the backend and adds `PROXY_SHARED_SECRET` from the frontend's local `.env.local`; use the same random value in `backend/.env` and `frontend/.env.local`. In Vercel, set `BACKEND_ORIGIN` and `PROXY_SHARED_SECRET` as server-side environment variables, and set the same secret on the backend. Set backend `UPLOAD_PUBLIC_ORIGIN` to the public backend origin for large transfers. Set both the GitHub OAuth app's callback URL and backend `GITHUB_CALLBACK_URL` to the frontend domain's `/auth/github/callback` path (for production, e.g. `https://your-app.vercel.app/auth/github/callback`). The callback must pass through the frontend domain so the login session cookie belongs to that same domain as dashboard API requests. Keep `FRONTEND_URL` set to the exact frontend origin. Do not configure a `VITE_` backend URL or expose the proxy secret to browser code. Keep `VITE_LARGE_FILE_THRESHOLD_MB` aligned with backend `LARGE_FILE_THRESHOLD_MB`.

The dashboard uses the secret-authenticated same-origin proxy. Developer API-key requests can also call core API endpoints directly over HTTPS. Cross-origin API-key requests use `Authorization: Bearer <api-key>` and CORS without cookies; browser-session credentials remain restricted to configured frontend origins. File bytes use dedicated direct endpoints: single uploads use a short-lived single-use upload token, and resumable chunks use short-lived upload-scoped tokens issued after session ownership checks. This lets large request bodies bypass Vercel's serverless function body limit without exposing the proxy secret to developers.

Generate a strong shared proxy secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Set the resulting value on both the backend and proxy; keep it out of `VITE_` variables.

### Local API sandbox

The sandbox is an isolated, in-memory mock API. It does not connect to MySQL or GitHub, and its data resets whenever the process stops.

```text
Terminal 1: cd javascript/frontend && npm run sandbox
Terminal 2: cd javascript/frontend; set VITE_API_SANDBOX=true in .env.local; npm run dev
```

It listens only on `127.0.0.1:4174`. Use the test key `sk_test_sandbox` with `Authorization: Bearer sk_test_sandbox`. It supports the profile and file list/read/delete endpoints plus in-memory API-key create/list/delete; unsupported routes return `501 SANDBOX_UNSUPPORTED`. The test key is not valid in production.

---

## Production

### Build

```bash
cd backend && npm run build
cd frontend && npm run build
```

### Deploy backend

```bash
cd backend
npm start
```

Set environment variables via your hosting provider (never commit `.env`).

### Production checklist

- [ ] `NODE_ENV=production`
- [ ] HTTPS enabled
- [ ] `SESSION_SECRET` is a strong random value (32+ bytes)
- [ ] `MASTER_KEY_ENCRYPTION_SECRET` is a strong random value (32+ bytes)
- [ ] Database connection uses SSL
- [ ] Apply the GitHub storage-sharding SQL migration before deploying the sharding backend
- [ ] GitHub OAuth callback URL updated to production domain
- [ ] `FRONTEND_URL` set to production URL

---

## API

See [/docs](http://localhost:5173/docs) or the [DocsPage](frontend/src/pages/DocsPage.tsx).

### Quick example

```bash
# Upload a file
curl -X POST http://localhost:5173/api/v1/files \
  -H "Authorization: Bearer sk_live_xxxx" \
  -F "file=@photo.png"

# Get image (use in <img> tag)
curl http://localhost:5173/api/v1/images/f_8f92kd71 \
  -H "Authorization: Bearer sk_live_xxxx" \
  -o decrypted.png
```

### Resumable uploads

```text
POST /api/v1/uploads
PUT  /api/v1/uploads/:uploadId/chunks/:chunkIndex
GET  /api/v1/uploads/:uploadId/status
POST /api/v1/uploads/:uploadId/complete
DELETE /api/v1/uploads/:uploadId
```

The client sends raw `application/octet-stream` chunks. The server validates
ownership, index, and size, encrypts the chunk before sending it to GitHub, and
returns the confirmed chunk in the status response. Completed files are exposed
through the same `GET /api/v1/files/:id` endpoint, including authenticated byte
range requests for chunked files.

After a browser refresh, the backend lists active upload sessions. The user must reselect the original file; the client compares hashes for confirmed chunks before sending missing chunks. No file bytes or encryption keys are stored in local storage. Reselecting the source file is also required on another device.

### GitHub limits

The GitHub Contents API documents an enforced 100 MB per-file limit. GitHub recommends individual repository objects at or below 1 MB, repositories below 10 GB, and no more than six pushes per minute per repository. The provider defaults to a configurable 100 MB object ceiling, preflights the 10 GB repository guidance, and serializes writes at 10-second intervals. These write controls are in-process only; multi-instance deployments need a shared limiter. Contents writes create commits, so large files can take substantial time and continue using repository history after deletion.

Official references: [GitHub repository limits](https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits), [Contents API](https://docs.github.com/en/rest/repos/contents), [REST API rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api).

---

## Tests

```bash
cd backend
npm test
```

Covers:
- Encryption round-trip, tamper detection, key wrapping
- Chunk encryption, authenticated metadata binding, and resumable upload flow
- API key creation and validation
- Authorization (User A cannot access User B's files)
- GitHub service upload/delete (mocked)

---

## What GitHub sees

| Visible to GitHub       | Notes                              |
|-------------------------|------------------------------------|
| Repository owner        | Your GitHub username               |
| Repository name         | `encrypted-store-XXXXXXXX`         |
| File names              | Random hex, e.g. `7f91a8b2.enc`    |
| File sizes              | Size of encrypted data             |
| Commit timestamps       | When files were uploaded/deleted   |
| File contents           | AES-256-GCM ciphertext only        |

**Not visible to GitHub:** original filenames, file types, plaintext content, encryption keys.

---

## Project structure

```
free-store/
├── backend/
│   ├── database/schema.sql
│   ├── src/
│   │   ├── app.ts
│   │   ├── config/
│   │   ├── auth/
│   │   ├── encryption/
│   │   ├── github/
│   │   ├── files/
│   │   ├── users/
│   │   ├── api-keys/
│   │   ├── images/
│   │   ├── middleware/
│   │   ├── lib/
│   │   └── __tests__/
│   └── package.json
└── frontend/
    ├── src/
    │   ├── api/
    │   ├── hooks/
    │   ├── pages/
    │   │   └── dashboard/
    │   └── utils/
    └── package.json
```
