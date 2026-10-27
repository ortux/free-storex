CREATE TABLE IF NOT EXISTS `oauth_handoff_tokens` (
  `token_hash` CHAR(64) NOT NULL,
  `user_id` VARCHAR(36) NOT NULL,
  `expires_at` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`token_hash`),
  KEY `idx_oauth_handoff_tokens_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;