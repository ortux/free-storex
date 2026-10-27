CREATE TABLE `storage_repositories` (
  `id` VARCHAR(36) NOT NULL,
  `user_id` VARCHAR(36) NOT NULL,
  `repository_owner` VARCHAR(255) NOT NULL,
  `repository_name` VARCHAR(255) NOT NULL,
  `used_bytes` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `max_bytes` BIGINT UNSIGNED NOT NULL,
  `is_primary` TINYINT(1) NOT NULL DEFAULT 0,
  `status` ENUM('ACTIVE','FULL') NOT NULL DEFAULT 'ACTIVE',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_storage_repositories_user_repo` (`user_id`,`repository_owner`,`repository_name`),
  KEY `idx_storage_repositories_user_status` (`user_id`,`status`,`created_at`),
  CONSTRAINT `fk_storage_repositories_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `files`
  ADD COLUMN `storage_repository_id` VARCHAR(36) NULL,
  ADD KEY `idx_files_storage_repository_id` (`storage_repository_id`),
  ADD CONSTRAINT `fk_files_storage_repository` FOREIGN KEY (`storage_repository_id`) REFERENCES `storage_repositories` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `file_chunks`
  ADD COLUMN `storage_repository_id` VARCHAR(36) NULL,
  ADD KEY `idx_file_chunks_storage_repository_id` (`storage_repository_id`),
  ADD CONSTRAINT `fk_file_chunks_storage_repository` FOREIGN KEY (`storage_repository_id`) REFERENCES `storage_repositories` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
