# Free Store — Dashboard Build Specification

## Project Overview

Free Store is a secure encrypted file storage platform where GitHub acts as the
storage backend. Every file is encrypted with AES-256-GCM before upload.
GitHub only ever stores ciphertext — never plaintext files.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 + TypeScript |
| Routing | React Router v6 |
| Styling | Tailwind CSS (dark theme) |
| Icons | Lucide React |
| HTTP | Axios (via `api` client instance) |
| State | React Query (@tanstack/react-query) |
| Toasts | react-hot-toast |

**No external component libraries.** No shadcn, no MUI, no Chakra, no Radix.
Pure Tailwind + custom components only.

---

## Design System

### Colors
```
Background:  bg-slate-950   (#020617)
Surface:     bg-slate-900   (#0f172a)
Border:      border-slate-800
Muted text:  text-slate-400
Body text:   text-slate-100
Accent:      #0ea5e9  (brand-500, sky blue)
```

### Pre-defined CSS classes (already in index.css — use these)
```
.card          bg-slate-900 border border-slate-800 rounded-xl
.btn-primary   sky blue filled button with hover + focus states
.btn-secondary slate outlined button
.btn-danger    red filled button
.input         dark styled form input
.badge         small inline pill label
.badge-green   emerald-500/20 bg, emerald-400 text
.badge-yellow  amber-500/20 bg, amber-400 text
.badge-blue    sky-500/20 bg, sky-400 text
.badge-red     red-500/20 bg, red-400 text
```

### Typography
- Body: `font-sans` (Inter)
- Code / keys / tokens: `font-mono` (JetBrains Mono)

### Spacing
- Page padding: `px-4 lg:px-8 py-8`
- Card padding: `p-5` or `p-6`
- Section gaps: `space-y-6`

---

## Utility Functions

Create `src/utils/format.ts`:

```typescript
export function formatBytes(bytes: number): string
// 0 → "0 B", 1536 → "1.5 KB", 1048576 → "1.0 MB"

export function formatDate(date: string | Date): string
// → "Sep 24, 2026"

export function isImage(mimeType: string): boolean
// mimeType.startsWith('image/')

export function getImageUrl(id: string): string
// returns `/api/v1/images/${id}`

export function getDownloadUrl(id: string): string
// returns `/api/v1/files/${id}`
```

---

## Data Interfaces

Create `src/types/index.ts` with all of these:

```typescript
export type Role = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
export type SharePermission = 'VIEW' | 'EDIT' | 'MANAGE';
export type FileStatus = 'PENDING' | 'UPLOADING' | 'ACTIVE' | 'DELETING' | 'DELETED' | 'FAILED';

export interface UserProfile {
  id: string;
  githubUsername: string;
  email: string | null;
  repositoryName: string | null;
  repositoryOwner: string | null;
  createdAt: string;
  stats: { fileCount: number; totalBytes: number };
}

export interface Repository {
  name: string;
  owner: string;
  url: string;
  size?: number;
  visibility: string;
  encryption: string;
}

export interface FileRecord {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  status: FileStatus;
  checksum: string;
  createdAt: string;
  updatedAt: string;
  url?: string;
}

export interface FilesResponse {
  files: FileRecord[];
  total: number;
  limit: number;
  offset: number;
}

export interface FileShare {
  id: string;
  fileId: string;
  sharedWithId: string;
  sharedById: string;
  permission: SharePermission;
  expiresAt: string | null;
  createdAt: string;
  file?: {
    id: string;
    originalFilename: string;
    mimeType: string;
    fileSize: number;
    createdAt: string;
  };
  sharedWith?: { id: string; githubUsername: string; email: string | null };
  sharedBy?: { id: string; githubUsername: string; email: string | null };
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description?: string;
  role?: Role;
  createdAt: string;
}

export interface WorkspaceMember {
  id: string;
  role: Role;
  createdAt: string;
  user: { id: string; githubUsername: string; email: string | null };
}

export interface ApiKeyRecord {
  id: string;
  name: string;
  prefix: string;
  lastUsed: string | null;
  createdAt: string;
  expiresAt: string | null;
}

export interface NewApiKeyResponse {
  key: string;
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  expiresAt: string | null;
}

export interface InitiateUploadResponse {
  uploadId: string;
  uploadUrl: string;
  token: string;
  expiresAt: string;
  expiresInSeconds: number;
  filename: string;
  mimeType: string;
  fileSize: number;
}

export interface UploadStatus {
  uploadId: string;
  status: 'waiting' | 'in_progress' | 'complete' | 'failed' | 'deleted';
  rawStatus: string;
  filename: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
  updatedAt: string;
  url?: string;
}
```

---

## API Integration

All API calls go through an `axios` instance already configured at
`src/api/client.ts` as `api` with `baseURL = '/api/v1'` and
`withCredentials: true`.

### API modules to create

#### `src/api/user.ts`
```
GET  /user                → UserProfile
GET  /user/repository     → Repository
```

#### `src/api/files.ts`
```
GET    /files             → FilesResponse
  params: search?, mimeType?, limit?, offset?, sortBy?, sortOrder?

POST   /uploads/initiate  → InitiateUploadResponse
  body: { filename, mimeType, fileSize, workspaceId? }

PUT    /uploads/:uploadId → { file: FileRecord, url: string }
  header: Authorization: Bearer <token>
  body: raw file bytes (axios PUT with File object)
  note: withCredentials: false on this request

GET    /uploads/:id/status → UploadStatus

DELETE /uploads/:id        → { success: true }

GET    /files/:id          → binary download (use as href, not fetch)

DELETE /files/:id          → { success: true }

GET    /images/:id         → binary image (use as <img src="/api/v1/images/:id">)
```

#### `src/api/shares.ts`
```
GET    /shares/by-me           → FileShare[]
GET    /shares/with-me         → FileShare[]
GET    /shares/file/:fileId    → FileShare[]
POST   /shares/file/:fileId    → FileShare
  body: { recipientId, permission: 'VIEW'|'EDIT'|'MANAGE', expiresAt? }
PATCH  /shares/:shareId        → FileShare
  body: { permission?, expiresAt? }
DELETE /shares/:shareId        → { success: true }
```

#### `src/api/workspaces.ts`
```
GET    /workspaces             → Workspace[]
POST   /workspaces             → Workspace
  body: { name, description? }
GET    /workspaces/:id         → Workspace
PATCH  /workspaces/:id         → Workspace
  body: { name?, description? }
DELETE /workspaces/:id         → { success: true }

GET    /workspaces/:id/members              → WorkspaceMember[]
POST   /workspaces/:id/members              → WorkspaceMember
  body: { githubUsername?, userId?, role }
PATCH  /workspaces/:id/members/:userId      → WorkspaceMember
  body: { role }
DELETE /workspaces/:id/members/:userId      → { success: true }
DELETE /workspaces/:id/members/me           → { success: true }
```

#### `src/api/apiKeys.ts`
```
GET    /api-keys          → ApiKeyRecord[]
POST   /api-keys          → NewApiKeyResponse
  body: { name, expiresAt? }
DELETE /api-keys/:id      → { success: true }
```

#### `src/api/auth.ts`
```
POST /auth/logout         → { success: true }
GET  /auth/me             → UserProfile
```

---

## Pages Required

All pages live in `src/pages/dashboard/`. Each is a default export.

---

### `DashboardLayout.tsx`

Persistent shell wrapping all dashboard pages via `<Outlet />`.

**Sidebar (desktop, w-60):**
- Logo: Shield icon + "Free Store" text
- Navigation links (NavLink with active state highlight):
  - Overview → `/dashboard`
  - Files → `/dashboard/files`
  - Upload → `/dashboard/upload`
  - Shared → `/dashboard/shared`
  - Workspaces → `/dashboard/workspaces`
  - API Keys → `/dashboard/api`
  - Repository → `/dashboard/repository`
  - Storage → `/dashboard/storage`
  - Settings → `/dashboard/settings`
- Bottom: user avatar (first letter), username, email, Sign out button

**Mobile:** hamburger menu, slide-in sidebar overlay with backdrop.

**Sign out:** calls `POST /auth/logout`, clears React Query cache, redirects to `/login`.

---

### `OverviewPage.tsx`

**Stats row (4 cards):**
- Total Files (Files icon, blue)
- Storage Used in MB/GB (HardDrive icon, green)
- Repository: "Connected" or "Pending" (Github icon, purple)
- API Status: "Active" (Key icon, amber)

**Recent uploads table (last 5 files):**
- Columns: thumbnail (9×9 rounded, image or file icon), filename, size, date, status badge
- "View all →" link to `/dashboard/files`
- Empty state if no files

**Quick actions:**
- Upload File button → navigate to `/dashboard/upload`
- View Files button → navigate to `/dashboard/files`

---

### `FilesPage.tsx`

**Toolbar:**
- Search input with Search icon (filters by filename)
- Type filter dropdown: All Types / Images / PDF
- Sort dropdown: Newest / Oldest / Largest / Smallest / Name A→Z

**File table:**
| Col | Content |
|-----|---------|
| Thumbnail | 9×9 rounded square. Images: `<img src="/api/v1/images/:id">`. Others: file icon |
| File | filename (bold) + mimeType (muted, small) |
| Size | formatted bytes |
| Uploaded | formatted date |
| Actions | Preview · Download · Copy URL · Share · Delete |

**Action behaviours:**
- Preview: opens image modal (images only)
- Download: `<a href="/api/v1/files/:id" download>`
- Copy URL: copies `/api/v1/images/:id` to clipboard, toast "Copied"
- Share: opens share modal for that file
- Delete: opens delete confirmation modal

**Image preview modal:**
- Dark overlay, centred image, filename header, size/type/date footer
- Close on backdrop click or ✕ button

**Share modal:**
- Title: "Share [filename]"
- Existing shares list (if any): recipient @username + permission + revoke ✕
- New share form: Recipient User ID input + permission select (VIEW/EDIT/MANAGE)
- Encryption note: "The file key is re-encrypted specifically for this recipient."
- Cancel / Share buttons

**Delete confirmation modal:**
- "Delete file?" heading
- Warning: permanent, removes from GitHub
- Cancel / Delete (red) buttons

**Empty state:** large file icon, "No files found", sub-text

---

### `UploadPage.tsx`

**Drag-and-drop zone:**
- Large dashed border area, Upload icon, "Drag & drop files here" text
- "or click to browse · 10MB max · images & PDFs"
- Accepted: image/jpeg, image/png, image/webp, image/gif, image/avif, application/pdf
- Highlight border on drag-over

**Upload queue (appears after files are dropped):**

Header row: `X files  |  Y uploading  |  Z done  |  [Upload X files] button`

Per-file row:
- File icon (9×9 rounded)
- Filename + size
- Progress bar (brand-500, animates 0→100%)
- Phase label with color:
  - `waiting` → slate "Waiting"
  - `initiating` → blue "Getting upload token…"
  - `uploading` → blue "Uploading… 45%"
  - `encrypting` → amber "Encrypting & pushing to GitHub…"
  - `done` → emerald "Complete"
  - `error` → red "Failed: [error message]"
  - `aborted` → slate "Cancelled"
- Phase icon: spinner (active), CheckCircle (done), AlertCircle (error), XCircle (aborted)
- Action buttons:
  - Active: Cancel (X icon)
  - Error: Retry (RefreshCw icon)
  - Done/Aborted: Remove (X icon)
  - Waiting: Remove (X icon)

**Upload flow (4 steps, shown in info box at bottom):**
1. Get upload token — POST /uploads/initiate
2. PUT raw bytes — PUT /uploads/:uploadId with Bearer token
3. Backend encrypts with AES-256-GCM + pushes to GitHub
4. Token is single-use — second PUT returns 409

**"Clear done/failed" button** when any terminal items exist.

---

### `SharedPage.tsx`

**Two tabs:** "Shared with me" (default) | "Shared by me"

**Table columns:**
- Thumbnail (image or share icon)
- Filename + size
- Shared with / Shared by (@username)
- Permission badge: VIEW (slate) / EDIT (amber) / MANAGE (blue)
- Expires (Clock icon + date, or "Never")
- Actions: Download link + Revoke (trash icon)

**Expired shares:** reduced opacity row, "Expired" in red with clock icon.

**Empty state per tab:** Share2 icon + contextual message.

---

### `WorkspacesPage.tsx`

**Role legend card at top** (4 columns):
- OWNER: Crown icon, blue badge, "Full control…"
- ADMIN: Shield icon, green badge, "Upload/delete/invite…"
- MEMBER: UserCheck icon, amber badge, "Upload and share…"
- VIEWER: Eye icon, slate badge, "Read-only…"

**Workspace list:** expandable cards

Each card (collapsed):
- Users icon (brand tint square)
- Workspace name + role badge
- Description (if set)
- Created date
- Delete button (OWNER only) → confirm modal
- Chevron rotate on expand

Each card (expanded, border-top separator):
- Members sub-section header + "Invite" button (ADMIN/OWNER only)
- Invite form (slide-in): GitHub username input + role select + Invite button
- Members list:
  - Avatar (first letter circle), @username
  - Role: dropdown (ADMIN/OWNER can change), or just badge (others)
  - Remove button (ADMIN/OWNER, not for OWNER member)

**Create workspace modal:**
- Name input (required)
- Description input (optional)
- Storage provider: GitHub only
- Cancel / Create buttons

**Delete workspace confirm modal:**
- Warning: permanent, removes members, files remain in storage

---

### `ApiPage.tsx`

**API keys table:**
| Name | Prefix | Created | Last Used | Actions |
|------|--------|---------|-----------|---------|
| Production | `sk_live_ab12••••` | Sep 24 | Never | 🗑 |

**New key revealed banner (amber, shows once):**
- "⚠️ Copy this key now — it won't be shown again"
- Monospace key display + Copy button
- "I've saved it — dismiss" link

**Create key modal:**
- Name input + Enter to submit
- Cancel / Create buttons

**Usage example code block** (dark bg, monospace):
```
curl -X POST https://your-domain.com/api/v1/files \
  -H "Authorization: Bearer sk_live_xxxx" \
  -F "file=@photo.png"
```

---

### `RepositoryPage.tsx`

**Header card:**
- Github icon square + repo name + owner
- "Open on GitHub" external link button (ExternalLink icon)

**Info grid (4 tiles):** Owner / Visibility / Encryption / Size

**Privacy model card:**
- ✓ green: All files encrypted before commit
- ✓ green: Random filenames — originals only in database
- ⚠ amber: GitHub can see: owner, repo name, file sizes, timestamps, ciphertext

**Repository structure card:**
```
encrypted-store-XXXXXXXX/
├── README.md
└── files/
    ├── 7f91a8b2.enc   ← encrypted ciphertext
    ├── 91ab32cd.enc   ← encrypted ciphertext
    └── a182ccef.enc   ← encrypted ciphertext
```

---

### `StoragePage.tsx`

**GitHub storage card:**
- GitHub icon, "Active" badge, encrypted repository description
- Security note: files are encrypted with AES-256-GCM before leaving the application

**Footer:**
- "Current provider: GITHUB" label
- Save button (disabled when not dirty)

---

### `SettingsPage.tsx`

**Profile card:**
- Rows: GitHub username / Email / Repository / Member since
- Each row: icon + label + value

**Security audit card:**
- Rows with green values:
  - Encryption algorithm: AES-256-GCM
  - Key derivation: HKDF-SHA256
  - Master key storage: Encrypted at rest
  - GitHub token storage: Encrypted at rest
  - API key storage: SHA-256 hash only
  - Session cookies: HttpOnly, SameSite

**Danger zone card (red border tint):**
- "Delete account" button — disabled, greyed out, "Not available in this version"

---

## Routing (App.tsx)

```
/                          → LandingPage
/login                     → LoginPage
/dashboard                 → DashboardLayout (protected)
  /dashboard               → OverviewPage (index)
  /dashboard/files         → FilesPage
  /dashboard/upload        → UploadPage
  /dashboard/shared        → SharedPage
  /dashboard/workspaces    → WorkspacesPage
  /dashboard/api           → ApiPage
  /dashboard/repository    → RepositoryPage
  /dashboard/storage       → StoragePage
  /dashboard/settings      → SettingsPage
/docs                      → DocsPage
```

Protected routes: if `GET /api/v1/user` returns 401, redirect to `/login`.

---

## Component Requirements

### Every page must have:
- Loading skeleton or spinner while data fetches
- Empty state with icon + message when lists are empty
- Error state if API call fails
- Fully responsive (mobile-first, lg: breakpoint for sidebar layout)

### Modals must:
- Render in a portal or fixed overlay
- Close on backdrop click
- Close on Escape key
- Trap focus inside
- Have a visible ✕ close button

### Forms must:
- Disable submit button while mutation is pending
- Show inline error messages on failure
- Clear inputs on success

---

## Mock Data for Development

Use this mock data so pages look populated (will be replaced with real API):

```typescript
const MOCK_USER: UserProfile = {
  id: 'user-1',
  githubUsername: 'octocat',
  email: 'octocat@github.com',
  repositoryName: 'encrypted-store-a3f9c2d1',
  repositoryOwner: 'octocat',
  createdAt: '2026-09-24T10:00:00Z',
  stats: { fileCount: 12, totalBytes: 4823040 },
};

const MOCK_FILES: FileRecord[] = [
  { id: 'f_abc123', filename: 'photo.png', mimeType: 'image/png', size: 183920, status: 'ACTIVE', checksum: 'abc', createdAt: '2026-09-24T10:00:00Z', updatedAt: '2026-09-24T10:00:00Z' },
  { id: 'f_def456', filename: 'logo.webp', mimeType: 'image/webp', size: 42000, status: 'ACTIVE', checksum: 'def', createdAt: '2026-09-23T10:00:00Z', updatedAt: '2026-09-23T10:00:00Z' },
  { id: 'f_ghi789', filename: 'document.pdf', mimeType: 'application/pdf', size: 830000, status: 'ACTIVE', checksum: 'ghi', createdAt: '2026-09-21T10:00:00Z', updatedAt: '2026-09-21T10:00:00Z' },
];

const MOCK_WORKSPACES: Workspace[] = [
  { id: 'ws-1', name: 'Design Team', slug: 'design-team-a1b2', role: 'OWNER', createdAt: '2026-09-01T00:00:00Z' },
  { id: 'ws-2', name: 'Dev Ops', slug: 'dev-ops-c3d4', role: 'MEMBER', createdAt: '2026-09-10T00:00:00Z' },
];
```

---

## Output Instructions

Provide each file as a separate clearly labelled code block:

```
=== src/types/index.ts ===
[code]

=== src/utils/format.ts ===
[code]

=== src/pages/dashboard/DashboardLayout.tsx ===
[code]

=== src/pages/dashboard/OverviewPage.tsx ===
[code]

=== src/pages/dashboard/FilesPage.tsx ===
[code]

=== src/pages/dashboard/UploadPage.tsx ===
[code]

=== src/pages/dashboard/SharedPage.tsx ===
[code]

=== src/pages/dashboard/WorkspacesPage.tsx ===
[code]

=== src/pages/dashboard/ApiPage.tsx ===
[code]

=== src/pages/dashboard/RepositoryPage.tsx ===
[code]

=== src/pages/dashboard/StoragePage.tsx ===
[code]

=== src/pages/dashboard/SettingsPage.tsx ===
[code]
```

Use mock data for all data fetching. Do not add real API calls —
the backend integration will be wired up separately.
