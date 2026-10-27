ALTER TABLE `files`
  ADD COLUMN `storage_type` ENUM('GITHUB_SINGLE', 'GITHUB_CHUNKED') NOT NULL DEFAULT 'GITHUB_SINGLE',
  ADD COLUMN `chunk_size` INT NULL,
  ADD COLUMN `total_chunks` INT NULL;

CREATE TABLE `file_chunks` (
  `id` VARCHAR(36) NOT NULL,
  `file_id` VARCHAR(32) NOT NULL,
  `chunk_index` INT NOT NULL,
  `github_path` VARCHAR(512) NOT NULL,
  `github_sha` VARCHAR(256) NULL,
  `encrypted_size` INT NOT NULL,
  `original_size` INT NOT NULL,
  `nonce` VARCHAR(64) NOT NULL,
  `checksum` VARCHAR(64) NOT NULL,
  `status` ENUM('UPLOADED', 'FAILED', 'DELETED') NOT NULL DEFAULT 'UPLOADED',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `file_chunks_file_id_chunk_index_key` (`file_id`, `chunk_index`),
  KEY `file_chunks_file_id_idx` (`file_id`),
  CONSTRAINT `file_chunks_file_id_fkey` FOREIGN KEY (`file_id`) REFERENCES `files` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `upload_sessions` (
  `id` VARCHAR(36) NOT NULL,
  `user_id` VARCHAR(36) NOT NULL,
  `file_id` VARCHAR(32) NOT NULL,
  `original_filename` VARCHAR(255) NOT NULL,
  `mime_type` VARCHAR(127) NOT NULL,
  `file_size` INT NOT NULL,
  `chunk_size` INT NOT NULL,
  `total_chunks` INT NOT NULL,
  `status` ENUM('INITIALIZED', 'UPLOADING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED') NOT NULL DEFAULT 'INITIALIZED',
  `expires_at` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `upload_sessions_user_id_status_idx` (`user_id`, `status`),
  KEY `upload_sessions_expires_at_idx` (`expires_at`),
  CONSTRAINT `upload_sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `upload_sessions_file_id_fkey` FOREIGN KEY (`file_id`) REFERENCES `files` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;