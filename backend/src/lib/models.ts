export type Role = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
export type SharePermission = 'VIEW' | 'EDIT' | 'MANAGE';
export type FileStatus = 'PENDING' | 'UPLOADING' | 'ACTIVE' | 'DELETING' | 'DELETED' | 'FAILED';
export type StorageType = 'GITHUB_SINGLE' | 'GITHUB_CHUNKED';
export type UploadSessionStatus = 'INITIALIZED' | 'UPLOADING' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'EXPIRED';
export type ChunkStatus = 'UPLOADED' | 'FAILED' | 'DELETED';

export interface User {
  id: string;
  githubId: string;
  githubUsername: string;
  email: string | null;
  githubAccessTokenEncrypted: string;
  encryptedMasterKey: string;
  repositoryName: string | null;
  repositoryOwner: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  role: Role;
  invitedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FileRecord {
  id: string;
  userId: string;
  workspaceId: string | null;
  folderId: string | null;
  sortOrder: number;
  originalFilename: string;
  storedFilename: string;
  storagePath: string;
  storageRepositoryId: string | null;
  providerRef: string | null;
  mimeType: string;
  fileSize: number;
  encryptedFileKey: string;
  encryptionVersion: number;
  storageType: StorageType;
  chunkSize: number | null;
  totalChunks: number | null;
  checksum: string;
  status: FileStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface FileChunkRecord {
  id: string;
  fileId: string;
  chunkIndex: number;
  githubPath: string;
  githubSha: string | null;
  storageRepositoryId: string | null;
  encryptedSize: number;
  originalSize: number;
  nonce: string;
  checksum: string;
  status: ChunkStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface UploadSessionRecord {
  id: string;
  userId: string;
  fileId: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  chunkSize: number;
  totalChunks: number;
  status: UploadSessionStatus;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface FileShareRecord {
  id: string;
  fileId: string;
  sharedWithId: string;
  sharedById: string;
  permission: SharePermission;
  recipientEncryptedFileKey: string;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiKeyRecord {
  id: string;
  userId: string;
  name: string;
  keyHash: string;
  prefix: string;
  lastUsed: Date | null;
  createdAt: Date;
  expiresAt: Date | null;
}
