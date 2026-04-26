ALTER TABLE users
  ADD COLUMN reset_token_hash VARCHAR(128) NULL,
  ADD COLUMN reset_token_expires_at DATETIME NULL,
  ADD COLUMN reset_token_used_at DATETIME NULL,
  ADD INDEX idx_users_reset_token_hash (reset_token_hash),
  ADD INDEX idx_users_reset_token_expires_at (reset_token_expires_at);
