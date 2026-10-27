-- ============================================================
-- Free Store — Full Database Initialization Script
-- XAMPP / MySQL 8.0+  |  Host: localhost  |  User: root  |  Password: (none)
--
-- How to run:
--   phpMyAdmin → SQL tab → paste → Go
--   OR: mysql -u root < init.sql
--
-- This script is idempotent (safe to re-run).
-- ============================================================

CREATE DATABASE IF NOT EXISTS free_store
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE free_store;

-- ============================================================
-- TABLE: users
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id                              VARCHAR(36)   NOT NULL,
  github_id                       VARCHAR(64)   NOT NULL,
  github_username                 VARCHAR(255)  NOT NULL,
  email                           VARCHAR(255)  NULL,
  github_access_token_encrypted   TEXT          NOT NULL,
  encrypted_master_key            TEXT          NOT NULL,

  -- GitHub storage
  repository_name                 VARCHAR(255)  NULL,
  repository_owner                VARCHAR(255)  NULL,

  created_at                      DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at                      DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                    ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),
  UNIQUE KEY uq_users_github_id (github_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- TABLE: workspaces
-- ============================================================
CREATE TABLE IF NOT EXISTS workspaces (
  id                              VARCHAR(36)   NOT NULL,
  name                            VARCHAR(255)  NOT NULL,
  slug                            VARCHAR(255)  NOT NULL,
  description                     VARCHAR(500)  NULL,
  owner_id                        VARCHAR(36)   NOT NULL,

  created_at                      DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at                      DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                    ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),
  UNIQUE KEY uq_workspaces_slug (slug),
  KEY idx_workspaces_owner_id (owner_id),
  CONSTRAINT fk_workspaces_owner
    FOREIGN KEY (owner_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- TABLE: workspace_members
-- Role hierarchy: OWNER > ADMIN > MEMBER > VIEWER
-- ============================================================
CREATE TABLE IF NOT EXISTS workspace_members (
  id            VARCHAR(36)   NOT NULL,
  workspace_id  VARCHAR(36)   NOT NULL,
  user_id       VARCHAR(36)   NOT NULL,
  role          ENUM('OWNER','ADMIN','MEMBER','VIEWER') NOT NULL DEFAULT 'MEMBER',
  invited_by_id VARCHAR(36)   NULL,
  created_at    DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                  ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),
  UNIQUE KEY uq_workspace_members (workspace_id, user_id),
  KEY idx_workspace_members_user_id (user_id),
  CONSTRAINT fk_wm_workspace
    FOREIGN KEY (workspace_id) REFERENCES workspaces (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_wm_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- TABLE: files
-- storage_path / provider_ref identify the encrypted file in GitHub.
-- ============================================================
CREATE TABLE IF NOT EXISTS files (
  id                  VARCHAR(32)   NOT NULL,
  user_id             VARCHAR(36)   NOT NULL,
  workspace_id        VARCHAR(36)   NULL,
  folder_id           VARCHAR(36)   NULL,
  sort_order          INT           NOT NULL DEFAULT 0,
  original_filename   VARCHAR(255)  NOT NULL,
  stored_filename     VARCHAR(255)  NOT NULL,

  -- GitHub storage location
  storage_path        VARCHAR(512)  NOT NULL,
  provider_ref        VARCHAR(256)  NULL,        -- GitHub blob SHA
  storage_type        ENUM('GITHUB_SINGLE','GITHUB_CHUNKED') NOT NULL DEFAULT 'GITHUB_SINGLE',
  chunk_size          INT           NULL,
  total_chunks        INT           NULL,

  mime_type           VARCHAR(127)  NOT NULL,
  file_size           INT           NOT NULL,
  encrypted_file_key  TEXT          NOT NULL,
  encryption_version  INT           NOT NULL DEFAULT 1,
  checksum            VARCHAR(64)   NOT NULL DEFAULT '',
  status              ENUM('PENDING','UPLOADING','ACTIVE','DELETING','DELETED','FAILED')
                        NOT NULL DEFAULT 'PENDING',

  created_at          DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at          DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                        ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),
  KEY idx_files_user_id (user_id),
  KEY idx_files_workspace_id (workspace_id),
  KEY idx_files_folder_order (folder_id, sort_order),
  CONSTRAINT fk_files_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_files_workspace
    FOREIGN KEY (workspace_id) REFERENCES workspaces (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: folders (nested per-user hierarchy)
-- ============================================================
CREATE TABLE IF NOT EXISTS folders (
  id          VARCHAR(36)  NOT NULL,
  user_id     VARCHAR(36)  NOT NULL,
  parent_id   VARCHAR(36)  NULL,
  name        VARCHAR(255) NOT NULL,
  sort_order  INT          NOT NULL DEFAULT 0,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                          ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_folders_user_parent_order (user_id, parent_id, sort_order),
  CONSTRAINT fk_folders_user FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_folders_parent FOREIGN KEY (parent_id) REFERENCES folders (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @files_folder_fk_exists = (
  SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_files_folder'
);
SET @files_folder_fk_sql = IF(
  @files_folder_fk_exists = 0,
  'ALTER TABLE files ADD CONSTRAINT fk_files_folder FOREIGN KEY (folder_id) REFERENCES folders (id) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE files_folder_fk_stmt FROM @files_folder_fk_sql;
EXECUTE files_folder_fk_stmt;
DEALLOCATE PREPARE files_folder_fk_stmt;

-- ============================================================
-- TABLE: file_activities (per-user audit/activity feed)
-- ============================================================
CREATE TABLE IF NOT EXISTS file_activities (
  id          VARCHAR(36)  NOT NULL,
  user_id     VARCHAR(36)  NOT NULL,
  file_id     VARCHAR(32)  NULL,
  action      VARCHAR(32)  NOT NULL,
  file_name   VARCHAR(255) NOT NULL,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_file_activities_user_created (user_id, created_at),
  KEY idx_file_activities_file (file_id),
  CONSTRAINT fk_file_activities_user FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_file_activities_file FOREIGN KEY (file_id) REFERENCES files (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: public_file_links (revocable view-only bearer links)
-- ============================================================
CREATE TABLE IF NOT EXISTS public_file_links (
  id                VARCHAR(36) NOT NULL,
  file_id           VARCHAR(32) NOT NULL,
  token_hash        CHAR(64) NOT NULL,
  token_ciphertext  TEXT NOT NULL,
  expires_at        DATETIME(3) NULL,
  created_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_public_file_links_file (file_id),
  UNIQUE KEY uq_public_file_links_token_hash (token_hash),
  KEY idx_public_file_links_expires_at (expires_at),
  CONSTRAINT fk_public_file_links_file FOREIGN KEY (file_id) REFERENCES files (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: file_chunks
-- ============================================================
CREATE TABLE IF NOT EXISTS file_chunks (
  id              VARCHAR(36)  NOT NULL,
  file_id         VARCHAR(32)  NOT NULL,
  chunk_index     INT          NOT NULL,
  github_path     VARCHAR(512) NOT NULL,
  github_sha      VARCHAR(256) NULL,
  encrypted_size  INT          NOT NULL,
  original_size   INT          NOT NULL,
  nonce           VARCHAR(64)  NOT NULL,
  checksum        VARCHAR(64)  NOT NULL,
  status          ENUM('UPLOADED','FAILED','DELETED') NOT NULL DEFAULT 'UPLOADED',
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                  ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_file_chunks (file_id, chunk_index),
  KEY idx_file_chunks_file_id (file_id),
  CONSTRAINT fk_file_chunks_file
    FOREIGN KEY (file_id) REFERENCES files (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: upload_sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS upload_sessions (
  id                VARCHAR(36)  NOT NULL,
  user_id           VARCHAR(36)  NOT NULL,
  file_id           VARCHAR(32)  NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  mime_type         VARCHAR(127) NOT NULL,
  file_size         INT          NOT NULL,
  chunk_size        INT          NOT NULL,
  total_chunks      INT          NOT NULL,
  status            ENUM('INITIALIZED','UPLOADING','PAUSED','COMPLETED','FAILED','CANCELLED','EXPIRED') NOT NULL DEFAULT 'INITIALIZED',
  expires_at        DATETIME(3)  NOT NULL,
  created_at        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                  ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_upload_sessions_user_status (user_id, status),
  KEY idx_upload_sessions_expires_at (expires_at),
  CONSTRAINT fk_upload_sessions_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_upload_sessions_file
    FOREIGN KEY (file_id) REFERENCES files (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- TABLE: user_sessions (Express/Passport sessions)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_sessions (
  session_id  VARCHAR(128) NOT NULL,
  expires_at  BIGINT UNSIGNED NOT NULL,
  session_data MEDIUMTEXT NOT NULL,
  PRIMARY KEY (session_id),
  KEY idx_user_sessions_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- TABLE: file_shares
-- Each row holds the file key re-wrapped with the RECIPIENT's
-- master key — the owner's encrypted_file_key is NOT used here.
-- Deleting this row immediately revokes decryption access.
-- ============================================================
CREATE TABLE IF NOT EXISTS file_shares (
  id                          VARCHAR(36)   NOT NULL,
  file_id                     VARCHAR(32)   NOT NULL,
  shared_with_id              VARCHAR(36)   NOT NULL,
  shared_by_id                VARCHAR(36)   NOT NULL,
  permission                  ENUM('VIEW','EDIT','MANAGE') NOT NULL DEFAULT 'VIEW',

  -- File key wrapped with recipient's master key (NOT the owner's key)
  recipient_encrypted_file_key TEXT         NOT NULL,

  expires_at                  DATETIME(3)   NULL,
  created_at                  DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at                  DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),
  UNIQUE KEY uq_file_shares (file_id, shared_with_id),
  KEY idx_file_shares_shared_with (shared_with_id),
  CONSTRAINT fk_fs_file
    FOREIGN KEY (file_id) REFERENCES files (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_fs_shared_with
    FOREIGN KEY (shared_with_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_fs_shared_by
    FOREIGN KEY (shared_by_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- TABLE: api_keys
-- Raw keys are NEVER stored — only SHA-256 hash (key_hash).
-- ============================================================
CREATE TABLE IF NOT EXISTS api_keys (
  id          VARCHAR(36)   NOT NULL,
  user_id     VARCHAR(36)   NOT NULL,
  name        VARCHAR(255)  NOT NULL,
  key_hash    VARCHAR(64)   NOT NULL,
  prefix      VARCHAR(32)   NOT NULL,
  last_used   DATETIME(3)   NULL,
  created_at  DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at  DATETIME(3)   NULL,

  PRIMARY KEY (id),
  UNIQUE KEY uq_api_keys_key_hash (key_hash),
  KEY idx_api_keys_user_id (user_id),
  CONSTRAINT fk_api_keys_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- Prisma migration tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS _prisma_migrations (
  id                  VARCHAR(36)     NOT NULL,
  checksum            VARCHAR(64)     NOT NULL,
  finished_at         DATETIME(3)     NULL,
  migration_name      VARCHAR(255)    NOT NULL,
  logs                TEXT            NULL,
  rolled_back_at      DATETIME(3)     NULL,
  started_at          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  applied_steps_count INT UNSIGNED    NOT NULL DEFAULT 0,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- Verify
-- ============================================================
SELECT 'free_store initialized successfully' AS status;
SHOW TABLES;
