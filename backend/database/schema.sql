-- Free Store MySQL schema, no Prisma CLI required.
-- Select the target database in phpMyAdmin, then import/paste this script.
-- Tables use IF NOT EXISTS so this also works for most existing installations.

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  github_id VARCHAR(64) NOT NULL UNIQUE,
  github_username VARCHAR(255) NOT NULL,
  email VARCHAR(255) NULL,
  github_access_token_encrypted TEXT NOT NULL,
  encrypted_master_key TEXT NOT NULL,
  repository_name VARCHAR(255) NULL,
  repository_owner VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS storage_repositories (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  repository_owner VARCHAR(255) NOT NULL,
  repository_name VARCHAR(255) NOT NULL,
  used_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
  max_bytes BIGINT UNSIGNED NOT NULL,
  is_primary TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('ACTIVE','FULL') NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_storage_repositories_user_repo (user_id,repository_owner,repository_name),
  KEY idx_storage_repositories_user_status (user_id,status,created_at),
  CONSTRAINT fk_storage_repositories_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workspaces (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  description VARCHAR(500) NULL,
  owner_id VARCHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_workspaces_owner_id (owner_id),
  CONSTRAINT fk_workspaces_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workspace_members (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  workspace_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  role ENUM('OWNER','ADMIN','MEMBER','VIEWER') NOT NULL DEFAULT 'MEMBER',
  invited_by_id VARCHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_workspace_members (workspace_id,user_id),
  KEY idx_workspace_members_user_id (user_id),
  CONSTRAINT fk_wm_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_wm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS folders (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  parent_id VARCHAR(36) NULL,
  name VARCHAR(255) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_folders_user_parent_order (user_id,parent_id,sort_order),
  CONSTRAINT fk_folders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_folders_parent FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS files (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  workspace_id VARCHAR(36) NULL,
  folder_id VARCHAR(36) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  original_filename VARCHAR(255) NOT NULL,
  stored_filename VARCHAR(255) NOT NULL,
  storage_path VARCHAR(512) NOT NULL,
  storage_repository_id VARCHAR(36) NULL,
  provider_ref VARCHAR(256) NULL,
  mime_type VARCHAR(127) NOT NULL,
  file_size INT NOT NULL,
  encrypted_file_key TEXT NOT NULL,
  encryption_version INT NOT NULL DEFAULT 1,
  storage_type ENUM('GITHUB_SINGLE','GITHUB_CHUNKED') NOT NULL DEFAULT 'GITHUB_SINGLE',
  chunk_size INT NULL,
  total_chunks INT NULL,
  checksum VARCHAR(64) NOT NULL DEFAULT '',
  status ENUM('PENDING','UPLOADING','ACTIVE','DELETING','DELETED','FAILED') NOT NULL DEFAULT 'PENDING',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_files_user_id (user_id),
  KEY idx_files_storage_repository_id (storage_repository_id),
  KEY idx_files_workspace_id (workspace_id),
  KEY idx_files_folder_order (folder_id,sort_order),
  CONSTRAINT fk_files_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_files_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_files_folder FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_files_storage_repository FOREIGN KEY (storage_repository_id) REFERENCES storage_repositories(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS file_chunks (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  file_id VARCHAR(32) NOT NULL,
  chunk_index INT NOT NULL,
  github_path VARCHAR(512) NOT NULL,
  github_sha VARCHAR(256) NULL,
  storage_repository_id VARCHAR(36) NULL,
  encrypted_size INT NOT NULL,
  original_size INT NOT NULL,
  nonce VARCHAR(64) NOT NULL,
  checksum VARCHAR(64) NOT NULL,
  status ENUM('UPLOADED','FAILED','DELETED') NOT NULL DEFAULT 'UPLOADED',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_file_chunks (file_id,chunk_index),
  KEY idx_file_chunks_file_id (file_id),
  KEY idx_file_chunks_storage_repository_id (storage_repository_id),
  CONSTRAINT fk_file_chunks_file FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_file_chunks_storage_repository FOREIGN KEY (storage_repository_id) REFERENCES storage_repositories(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS upload_sessions (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  file_id VARCHAR(32) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(127) NOT NULL,
  file_size INT NOT NULL,
  chunk_size INT NOT NULL,
  total_chunks INT NOT NULL,
  status ENUM('INITIALIZED','UPLOADING','PAUSED','COMPLETED','FAILED','CANCELLED','EXPIRED') NOT NULL DEFAULT 'INITIALIZED',
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_upload_sessions_user_status (user_id,status),
  KEY idx_upload_sessions_expires_at (expires_at),
  CONSTRAINT fk_upload_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_upload_sessions_file FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_sessions (
  session_id VARCHAR(128) NOT NULL PRIMARY KEY,
  expires_at BIGINT UNSIGNED NOT NULL,
  session_data MEDIUMTEXT NOT NULL,
  KEY idx_user_sessions_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS file_shares (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  file_id VARCHAR(32) NOT NULL,
  shared_with_id VARCHAR(36) NOT NULL,
  shared_by_id VARCHAR(36) NOT NULL,
  permission ENUM('VIEW','EDIT','MANAGE') NOT NULL DEFAULT 'VIEW',
  recipient_encrypted_file_key TEXT NOT NULL,
  expires_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_file_shares (file_id,shared_with_id),
  KEY idx_file_shares_shared_with (shared_with_id),
  CONSTRAINT fk_fs_file FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_fs_shared_with FOREIGN KEY (shared_with_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_fs_shared_by FOREIGN KEY (shared_by_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS public_file_links (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  file_id VARCHAR(32) NOT NULL UNIQUE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  token_ciphertext TEXT NOT NULL,
  expires_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_public_file_links_expires_at (expires_at),
  CONSTRAINT fk_public_file_links_file FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS file_activities (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  file_id VARCHAR(32) NULL,
  action VARCHAR(32) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_file_activities_user_created (user_id,created_at),
  KEY idx_file_activities_file (file_id),
  CONSTRAINT fk_file_activities_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_file_activities_file FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS api_keys (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  key_hash VARCHAR(64) NOT NULL UNIQUE,
  prefix VARCHAR(32) NOT NULL,
  last_used DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at DATETIME(3) NULL,
  KEY idx_api_keys_user_id (user_id),
  CONSTRAINT fk_api_keys_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
