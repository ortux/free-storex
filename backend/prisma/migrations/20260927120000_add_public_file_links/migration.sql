CREATE TABLE IF NOT EXISTS `public_file_links` (
  `id` VARCHAR(36) NOT NULL,
  `file_id` VARCHAR(32) NOT NULL,
  `token_hash` CHAR(64) NOT NULL,
  `token_ciphertext` TEXT NOT NULL,
  `expires_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `public_file_links_file_id_key` (`file_id`),
  UNIQUE INDEX `public_file_links_token_hash_key` (`token_hash`),
  INDEX `public_file_links_expires_at_idx` (`expires_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `public_file_links_file_id_fkey` FOREIGN KEY (`file_id`) REFERENCES `files` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;