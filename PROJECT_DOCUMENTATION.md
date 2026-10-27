# Free Store — Project Documentation

## 1. Overview

Free Store is a secure file storage dashboard built around one design principle: GitHub is the only storage backend. Files are encrypted before they are sent to GitHub, and GitHub stores only ciphertext and metadata required for retrieval. The application includes user authentication, workspace and sharing features, API-key access, GitHub OAuth setup, and resumable chunked uploads for large files.

The product is structured as two main pieces:

- Frontend: React + Vite + Tailwind dashboard
- Backend: Node.js + TypeScript + Express + mysql2 + MySQL

The backend uses GitHub as the external object storage provider and MySQL for metadata, user accounts, file records, and access control.

---

## 2. Core Features

### Security-first storage
- Files are encrypted with AES-256-GCM before upload.
- Each file gets a random encrypted storage filename.
- Original filenames are kept in database metadata rather than in the storage backend.
- GitHub receives encrypted payloads only.
- Encryption keys are wrapped and stored in a controlled way.

### GitHub-only backend
- No S3 provider is used.
- GitHub is the sole storage backend for file blobs.
- Storage uses repository-based metadata and GitHub API uploads.

### Large-file support
- Files larger than the configured threshold are handled as chunked uploads.
- Upload sessions and chunk metadata are persisted in MySQL through parameterized mysql2 queries.
- Clients can resume interrupted uploads.
- Chunk-level checksums and status tracking support integrity validation.
- Resumes verify already-uploaded chunk checksums against the reselected local file before sending remaining chunks.
- Chunk downloads verify AEAD authentication, chunk length, and manifest checksum before writing plaintext.
- Range downloads fetch only overlapping chunk indexes.
- Upload cancellation and expiry cleanup remain retryable when GitHub deletion fails.
- Application file/upload services use a provider-neutral encrypted-object interface; the initial adapter is GitHub.

### PDF support
- PDFs can be viewed inline in the dashboard.
- File previews use the authenticated API endpoints when a file is a PDF or image.

### Access and collaboration
- User authentication via GitHub OAuth.
- Workspaces and workspace members.
- File sharing between users.
- Restricted recipient sharing and revocable anyone-with-the-link sharing with optional expiry.
- Role-based access patterns and per-file access control metadata.
- Nested, database-backed personal folders, file moves, and saved manual ordering.
- A per-user activity feed for uploads, renames, moves, deletes, and sharing.
- Shared recipients can download both standard and chunked files using their recipient-wrapped file keys.

### API access
- Users can generate API keys for programmatic access.
- Request authentication can be performed with API keys or session auth depending on route.

---

## 3. High-Level Architecture

```text
Browser / Dashboard
        |
        v
React Frontend (Vite + Tailwind)
        |
        v
Express Backend (Node + TypeScript)
        |-- Auth & sessions
        |-- File management
        |-- Upload pipeline
        |-- GitHub storage integration
        |-- MySQL metadata via mysql2
        |
        +--> GitHub repository (encrypted blobs only)
        +--> MySQL (users, files, folders, activity, shares, workspace records)
```

### Runtime responsibilities

#### Frontend
- Serves the dashboard and file management UI.
- Authenticates with backend.
- Requests file metadata, previews, downloads, and upload status updates.
- Handles large-file chunk upload orchestration.

#### Backend
- Validates session/API auth.
- Retrieves and stores metadata using parameterized SQL repositories.
- Performs file encryption and key management.
- Stores encrypted file chunks or encrypted file blobs in GitHub.
- Serves decrypted file data to authorized clients.

#### GitHub storage provider
- Stores ciphertext blobs and repository references.
- Receives a random encrypted storage path and content.
- Tracks object metadata needed for retrieval and cleanup.

#### Database (MySQL + mysql2)
- Stores users, files, shares, workspaces, API keys, upload sessions, and chunk records.
- Maintains file ownership and permission state.

---

## 4. Technology Stack

### Frontend
- React 18
- Vite
- TypeScript
- Tailwind CSS
- React Router
- React Query
- Axios
- react-dropzone
- Lucide icons

### Backend
- Node.js
- TypeScript
- Express
- mysql2 promise driver
- MySQL
- Passport.js
- GitHub OAuth
- @octokit/rest
- JWT-like signed upload tokens
- Node crypto for AES-GCM encryption

### Security technologies
- AES-256-GCM for file encryption
- HKDF / key wrapping patterns for envelope encryption
- Secure session handling
- Hashing for API key storage

---

## 5. Project Structure

```text
free-store/
├── README.md
├── PROJECT_DOCUMENTATION.md
├── DASHBOARD_SPEC.md
├── package.json
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── jest.config.js
│   ├── database/
│   │   └── schema.sql
│   └── src/
│       ├── app.ts
│       ├── __tests__/
│       ├── api-keys/
│       ├── auth/
│       ├── config/
│       ├── encryption/
│       ├── files/
│       ├── github/
│       ├── images/
│       ├── lib/
│       ├── middleware/
│       ├── rbac/
│       ├── shares/
│       ├── storage/
│       ├── uploads/
│       ├── users/
│       ├── workspaces/
│       └── ...
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── index.html
│   └── src/
│       ├── App.tsx
│       ├── config.ts
│       ├── main.tsx
│       ├── api/
│       ├── components/
│       ├── hooks/
│       ├── pages/
│       └── utils/
└── ...
```

---

## 6. Authentication and User Model

### GitHub OAuth
Users sign in through GitHub OAuth. The backend configures Passport with GitHub strategy and stores OAuth-related metadata against the user record.

### User record contents
The MySQL `users` table stores:
- GitHub user ID
- username
- email
- encrypted GitHub access token
- encrypted master key
- primary repository owner/name
- account metadata timestamps

The `storage_repositories` table tracks each GitHub storage shard, its estimated committed bytes, target size, and status. Each `files` row and `file_chunks` row records its repository ID; null IDs remain supported for files created before sharding was introduced.

### Session security
- Cookie-based session handling
- HTTP-only session cookie defaults
- Secure flag enabled in production
- CORS restricted to configured frontend URL
- Cross-origin developer API requests use Bearer API keys with wildcard CORS and no credentialed cookies

---

## 7. File and Storage Model

### File model
The MySQL `files` table stores file metadata including:
- unique file ID
- owner ID
- original filename
- encrypted storage filename
- storage path
- storage repository ID
- MIME type
- file size
- encrypted file key
- checksum
- storage type
- chunk info fields
- status

### Storage type values
```text
StorageType {
  GITHUB_SINGLE
  GITHUB_CHUNKED
}
```

### File statuses
```text
FileStatus {
  PENDING
  UPLOADING
  ACTIVE
  DELETING
  DELETED
  FAILED
}
```

### Large upload metadata
The schema includes `folderId`, `sortOrder`, `Folder`, and `FileActivity`, along with `chunkSize`, `totalChunks`, `UploadSession`, and `FileChunk` for Drive organization and resumable upload operations.

Encrypted objects are distributed across GitHub repositories. A new repository is allocated when the current shard would cross the 9 GiB target. This is best-effort expansion, not unlimited storage: GitHub account policies and service limits still apply, and deleted objects remain part of Git history.

---

## 8. Encryption Model

The encrypted storage design centers on per-file symmetric encryption and wrapped keys.

### High-level model
1. The file is encrypted client-side or server-side before upload.
2. A random encryption key is created for the file.
3. The key is wrapped for storage and access control.
4. GitHub keeps only ciphertext and metadata.
5. Decryption requires the correct wrapped key plus the user’s secrets.

### Why it matters
This ensures that the storage provider does not see plaintext data, even though it hosts the files.

### Important implementation traits
- Randomized storage names
- Authenticated encryption using AES-GCM patterns
- Checksums and metadata binding to detect tampering
- Per-chunk encryption for large uploads

---

## 9. Upload System

### Standard upload flow
The backend supports a tokenized file upload flow:
- Initiate upload
- Validate file metadata
- Create a pending file record
- Upload file bytes with signed upload token
- Verify size and ownership
- Encrypt and write to GitHub
- Mark file ACTIVE

### Resumable upload flow
The project also implements a resumable upload model for large files.

#### Entities
- `UploadSession`: per upload lifecycle session
- `FileChunk`: metadata for individual chunks

#### Typical lifecycle
```text
POST /api/v1/uploads
  -> create upload session

PUT /api/v1/uploads/:uploadId/chunks/:chunkIndex
  -> upload chunk bytes

GET /api/v1/uploads/:uploadId/status
  -> inspect upload progress

POST /api/v1/uploads/:uploadId/complete
  -> finalize and create file record

DELETE /api/v1/uploads/:uploadId
  -> cancel session
```

### Why this matters
This allows large files to survive interrupted connections, partial failures, and slow networks without requiring a complete retransmit.

---

## 10. Frontend App Structure

The frontend is organized as a dashboard app with route-based pages.

### Main routes
- `/` — landing page
- `/login` — login screen
- `/dashboard` — protected layout
  - `/dashboard` — overview
  - `/dashboard/files` — file listing and actions
  - `/dashboard/upload` — upload UI
  - `/dashboard/shared` — shared files
  - `/dashboard/workspaces` — workspace dashboard
  - `/dashboard/api` — API key management
  - `/dashboard/repository` — GitHub repository status
  - `/dashboard/storage` — storage backend status page
  - `/dashboard/settings` — settings

### File view behavior
- Files can be listed, filtered, and previewed.
- PDFs render inline or in a browser-style viewer.
- Image assets are previewed directly when supported.
- Download endpoints are available for authorized access.

---

## 11. Backend API Overview

### Auth routes
- `GET /auth/github` — begin GitHub OAuth login
- `GET /auth/github/callback` — OAuth callback
- `GET /auth/logout` — log out
- `GET /auth/me` — current authenticated user

### User routes
- `GET /api/v1/user` — current user info
- `GET /api/v1/user/:id` — specific user data, permission dependent

### File routes
- `GET /api/v1/files` — list files
- `GET /api/v1/files/:id` — file metadata and data access
- `POST /api/v1/files` — create or upload file metadata flow
- `PATCH /api/v1/files/:id` — rename a file
- `PATCH /api/v1/files/:id/move` — move a file into a folder or My Drive root
- `PUT /api/v1/files/reorder` — persist manual order for all active files in a folder
- `DELETE /api/v1/files/:id` — remove file

### Drive organization routes
- `GET /api/v1/folders` — list the authenticated user's folders
- `POST /api/v1/folders` — create a root or nested folder
- `PATCH /api/v1/folders/:id` — rename, move, or order a folder
- `DELETE /api/v1/folders/:id` — delete a folder while preserving its contents
- `GET /api/v1/activity?limit=20` — list the authenticated user's recent file activity

### Image routes
- `GET /api/v1/images/:fileKey` — serve decrypted image content with auth enforcement

### Upload routes
- `POST /api/v1/uploads`
- `GET /api/v1/uploads/:uploadId/status`
- `PUT /api/v1/uploads/:uploadId/chunks/:chunkIndex`
- `POST /api/v1/uploads/:uploadId/complete`
- `DELETE /api/v1/uploads/:uploadId`

### Workspaces routes
- `GET /api/v1/workspaces`
- `POST /api/v1/workspaces`
- `GET /api/v1/workspaces/:id`
- `POST /api/v1/workspaces/:id/members`

### Shares routes
- `POST /api/v1/shares/file/:fileId`
- `GET /api/v1/shares/with-me` — list active files shared with the authenticated user
- `GET /api/v1/shares/by-me` — list active shares created by the authenticated user
- `DELETE /api/v1/shares/:shareId`
- `GET /api/v1/shares/file/:fileId/link` — inspect the owner's public-link settings
- `POST /api/v1/shares/file/:fileId/link` — create or rotate a public view link; optional `expiresAt`
- `DELETE /api/v1/shares/file/:fileId/link` — revoke the public link
- `GET /api/v1/public-links/:token` — retrieve public file metadata
- `GET /api/v1/public-links/:token/content` — preview or download content without sign-in

### API key routes
- Create, list, revoke, and validate API keys

---

## 12. Environment Configuration

The backend reads environment values from `.env` at the project root via the config loader.

### Required variables
```env
DATABASE_URL=mysql://user:password@localhost:3306/free_store
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
GITHUB_CALLBACK_URL=http://localhost:5173/auth/github/callback
SESSION_SECRET=strong_random_string
MASTER_KEY_ENCRYPTION_SECRET=strong_random_string
UPLOAD_TOKEN_SECRET=strong_random_string
FRONTEND_URL=http://localhost:5173
```

### Upload and size settings
```env
MAX_FILE_SIZE_MB=1024
LARGE_FILE_THRESHOLD_MB=20
CHUNK_SIZE_MB=5
UPLOAD_EXPIRATION_HOURS=24
UPLOAD_CONCURRENCY=3
UPLOAD_MAX_RETRIES=3
CLEANUP_INTERVAL_MINUTES=30
GITHUB_CONTENTS_MAX_OBJECT_MB=100
GITHUB_CONTENT_WRITE_INTERVAL_MS=10000
```

The GitHub defaults reflect its documented Contents API 100 MB enforced object limit, 10 GB recommended repository size, and six content pushes per minute per repository. Writes are serialized in-process at 10 seconds each and retries honor rate-limit headers. A distributed write limiter is required for multi-instance deployments. The GitHub Contents API creates commits; deleting files does not necessarily remove their historical data.

Set `VITE_API_BASE_URL` to the full backend API base URL, including `/api/v1` (for example, `https://api.yourdomain.com/api/v1`). On Vercel, add it as a project environment variable and redeploy. For local same-origin proxying, the default is `/api/v1`. See `frontend/.env.example` for local settings. Frontend upload settings can be aligned using `VITE_MAX_FILE_SIZE_MB`, `VITE_LARGE_FILE_THRESHOLD_MB`, `VITE_CHUNK_SIZE_MB`, `VITE_UPLOAD_CONCURRENCY`, and `VITE_UPLOAD_MAX_RETRIES`.

### Notes
- `MAX_FILE_SIZE_MB` should be high enough for normal large-file workflows.
- `LARGE_FILE_THRESHOLD_MB` controls when the app switches to chunked uploads.
- `CHUNK_SIZE_MB` impacts the size of each uploaded chunk.

---

## 13. Database Schema Summary

### Main models
- `User`
- `Workspace`
- `WorkspaceMember`
- `File`
- `FileChunk`
- `UploadSession`
- `FileShare`
- `PublicFileLink`
- `ApiKey`

The concrete MySQL DDL is maintained in `backend/database/schema.sql` and can be imported via phpMyAdmin. Backend persistence uses parameterized mysql2 queries; no ORM code generation or migration CLI is required.

### Relationship summary
- A user has many files.
- A user has many upload sessions.
- A file belongs to a user and may belong to a workspace.
- A file can have many shares and chunks.
- Workspaces have members and owned files.

---

## 14. Security Considerations

### Strengths
- GitHub stores only encrypted payloads.
- Files are not stored in plaintext.
- File metadata remains in a controlled database layer.
- Sessions and API keys are enforced through middleware.
- Share and RBAC patterns add access boundaries.
- Public links use a high-entropy bearer token; only a SHA-256 hash and authenticated-encrypted token are persisted. Public links grant view/download only, can expire, and can be revoked by the owner.

### Additional recommendations
- Keep `.env` out of version control.
- Use strong random secrets in production.
- Use HTTPS in deployment.
- Set production GitHub OAuth callback URLs correctly.
- Rotate secrets periodically.
- Use database SSL in production.

---

## 15. Development Workflow

### Install dependencies
```bash
cd backend && npm install
cd ../frontend && npm install
```

### Database setup
Create a MySQL database, then import `backend/database/schema.sql` from phpMyAdmin. This avoids database CLI access and does not drop existing tables/data.

### Start backend
```bash
cd backend
npm run dev
```

### Start frontend
```bash
cd frontend
npm run dev
```

### Build checks
```bash
cd frontend && npm run build
cd backend && npm run build
```

### Test suite
```bash
cd backend
npm test
```

---

## 16. Production Deployment Notes

### Backend deployment
- Run the built Node app with the production environment variables.
- Ensure the database is reachable and has the tables from `backend/database/schema.sql`.
- Ensure the MySQL schema from `backend/database/schema.sql` exists before starting the backend.
- Keep `VITE_LARGE_FILE_THRESHOLD_MB` aligned with backend `LARGE_FILE_THRESHOLD_MB` so both sides route files to the same upload protocol.
- Set `NODE_ENV=production`.
- Use HTTPS and secure cookie settings.

### Frontend deployment
- Build the frontend for static hosting or a CDN.
- Point frontend API requests at the production backend domain.
- Use environment config with production values.

### GitHub repository setup
- Create or configure a repository for encrypted storage data.
- Ensure the GitHub app or token permissions match the storage usage.
- Keep credentials in the deployed environment, not in source control.

---

## 17. Operational Health and Validation

Recommended validation commands in a working project:

```bash
cd frontend
npx vite build

cd ../backend
npm run build
npx jest src/__tests__/encryption.test.ts --runInBand
```

These checks validate the front-end bundle, backend TypeScript build, and encryption-related backend behavior.

---

## 18. Known Product Positioning

This project is not a generic cloud file host. It is a secure encrypted file repository where:
- GitHub is used as the backing storage layer,
- encryption is treated as a first-class requirement,
- protection is built around metadata control and access management,
- large files are supported via resumable upload sessions,
- the UI focuses on a simple dashboard workflow rather than a full enterprise file portal.

---

## 19. Summary

Free Store is a GitHub-backed encrypted file storage application with a dashboard UI, OAuth login, file sharing, workspace structure, API-key access, and resumable upload support. The project’s defining trait is that GitHub stores only ciphertext, while MySQL preserves the metadata and security context needed to manage and retrieve files safely.

The codebase is organized to keep security concerns centralized, storage backend interactions isolated, and frontend flows consistent with the backend API design.
