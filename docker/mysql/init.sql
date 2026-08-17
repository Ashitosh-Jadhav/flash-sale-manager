-- ============================================
-- Flash Sale Manager — Database Initialization
-- ============================================
-- This script runs ONCE when the MySQL container starts for the first time.
-- MySQL's Docker image executes all .sql files in /docker-entrypoint-initdb.d/
-- in alphabetical order during initialization.
--
-- IMPORTANT: This only runs if the data volume is EMPTY (first start).
-- On subsequent container restarts, MySQL uses existing data from the volume.
-- This prevents duplicate table creation errors.

-- Products table
CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  stock INT NOT NULL DEFAULT 0,
  flash_sale BOOLEAN DEFAULT FALSE,
  sale_start DATETIME,
  sale_end DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  product_id INT NOT NULL,
  customer_name VARCHAR(255) NOT NULL,
  customer_email VARCHAR(255) NOT NULL,
  quantity INT NOT NULL,
  total_price DECIMAL(10,2) NOT NULL,
  status ENUM('pending', 'confirmed', 'cancelled', 'shipped', 'delivered', 'queued', 'processing', 'failed') DEFAULT 'pending',
  idempotency_key VARCHAR(255) UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_product_id (product_id),
  INDEX idx_customer_email (customer_email),
  INDEX idx_status (status),
  INDEX idx_user_id (user_id),
  CONSTRAINT fk_product FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('customer', 'admin') NOT NULL DEFAULT 'customer',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX idx_email (email)
) ENGINE=InnoDB;

-- Add foreign key for orders.user_id → users.id (if not exists)
-- Using a procedure to handle the "already exists" case gracefully
DELIMITER //
CREATE PROCEDURE add_user_fk_if_not_exists()
BEGIN
  DECLARE fk_count INT;
  SELECT COUNT(*) INTO fk_count
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'orders'
    AND CONSTRAINT_NAME = 'fk_orders_user';
  IF fk_count = 0 THEN
    ALTER TABLE orders ADD CONSTRAINT fk_orders_user
      FOREIGN KEY (user_id) REFERENCES users(id);
  END IF;
END //
DELIMITER ;
CALL add_user_fk_if_not_exists();
DROP PROCEDURE add_user_fk_if_not_exists;

-- Seed a default flash sale product for testing
INSERT INTO products (name, description, price, stock, flash_sale, sale_start, sale_end)
VALUES ('Docker Test Product', 'Seeded via Docker init', 99.99, 100, TRUE, NOW(), DATE_ADD(NOW(), INTERVAL 30 DAY))
ON DUPLICATE KEY UPDATE name = name;
