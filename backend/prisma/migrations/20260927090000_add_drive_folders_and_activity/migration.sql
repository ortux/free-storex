SET @has_folder_id = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'files' AND COLUMN_NAME = 'folder_id'
);
SET @ddl = IF(@has_folder_id = 0,
  'ALTER TABLE `files` ADD COLUMN `folder_id` VARCHAR(36) NULL',
  'SELECT 1');
PREPARE drive_stmt FROM @ddl;
EXECUTE drive_stmt;
DEALLOCATE PREPARE drive_stmt;

SET @has_sort_order = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'files' AND COLUMN_NAME = 'sort_order'
);
SET @ddl = IF(@has_sort_order = 0,
  'ALTER TABLE `files` ADD COLUMN `sort_order` INTEGER NOT NULL DEFAULT 0',
  'SELECT 1');
PREPARE drive_stmt FROM @ddl;
EXECUTE drive_stmt;
DEALLOCATE PREPARE drive_stmt;

SET @has_folder_order_index = (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS AS first_column
  JOIN information_schema.STATISTICS AS second_column
    ON second_column.TABLE_SCHEMA = first_column.TABLE_SCHEMA
    AND second_column.TABLE_NAME = first_column.TABLE_NAME
    AND second_column.INDEX_NAME = first_column.INDEX_NAME
  WHERE first_column.TABLE_SCHEMA = DATABASE() AND first_column.TABLE_NAME = 'files'
    AND first_column.COLUMN_NAME = 'folder_id' AND first_column.SEQ_IN_INDEX = 1
    AND second_column.COLUMN_NAME = 'sort_order' AND second_column.SEQ_IN_INDEX = 2
);
SET @ddl = IF(@has_folder_order_index = 0,
  'CREATE INDEX `files_folder_id_sort_order_idx` ON `files` (`folder_id`, `sort_order`)',
  'SELECT 1');
PREPARE drive_stmt FROM @ddl;
EXECUTE drive_stmt;
DEALLOCATE PREPARE drive_stmt;

CREATE TABLE IF NOT EXISTS `folders` (
  `id` VARCHAR(36) NOT NULL,
  `user_id` VARCHAR(36) NOT NULL,
  `parent_id` VARCHAR(36) NULL,
  `name` VARCHAR(255) NOT NULL,
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `folders_user_id_parent_id_sort_order_idx` (`user_id`, `parent_id`, `sort_order`),
  PRIMARY KEY (`id`),
  CONSTRAINT `folders_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `folders_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `folders` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @has_files_folder_fk = (
  SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'files' AND COLUMN_NAME = 'folder_id'
    AND REFERENCED_TABLE_NAME = 'folders' AND REFERENCED_COLUMN_NAME = 'id'
);
SET @ddl = IF(@has_files_folder_fk = 0,
  'ALTER TABLE `files` ADD CONSTRAINT `files_folder_id_fkey` FOREIGN KEY (`folder_id`) REFERENCES `folders` (`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1');
PREPARE drive_stmt FROM @ddl;
EXECUTE drive_stmt;
DEALLOCATE PREPARE drive_stmt;

CREATE TABLE IF NOT EXISTS `file_activities` (
  `id` VARCHAR(36) NOT NULL,
  `user_id` VARCHAR(36) NOT NULL,
  `file_id` VARCHAR(32) NULL,
  `action` VARCHAR(32) NOT NULL,
  `file_name` VARCHAR(255) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `file_activities_user_id_created_at_idx` (`user_id`, `created_at`),
  INDEX `file_activities_file_id_idx` (`file_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `file_activities_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `file_activities_file_id_fkey` FOREIGN KEY (`file_id`) REFERENCES `files` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;