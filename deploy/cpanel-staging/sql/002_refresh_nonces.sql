SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS device_refresh_nonces (
    nonce_hash VARBINARY(32) NOT NULL,
    device_id INT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    PRIMARY KEY (nonce_hash),
    KEY idx_device_refresh_nonces_device (device_id),
    KEY idx_device_refresh_nonces_expires (expires_at),
    CONSTRAINT fk_device_refresh_nonces_device
        FOREIGN KEY (device_id) REFERENCES license_devices (id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO schema_migrations (version)
VALUES ('002_refresh_nonces');
