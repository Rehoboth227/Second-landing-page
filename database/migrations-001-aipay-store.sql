-- AiPay store tables (stores, products, orders, notifications, images).
-- New installs: these are already in schema.sql. A site that is already live: run this once in
-- cPanel > phpMyAdmin > (your Rehohub database) > SQL. It only adds new tables; nothing else changes.

SET NAMES utf8mb4;

-- One row per merchant: their store profile and the account review fee.
CREATE TABLE IF NOT EXISTS aipay_stores (
  user_id          INT UNSIGNED NOT NULL,
  business_name    VARCHAR(120) NOT NULL,
  category         VARCHAR(60)  NULL,
  reg_number       VARCHAR(30)  NULL,             -- CAC or ID number (optional)
  social           VARCHAR(120) NULL,             -- social media handle (optional)
  email            VARCHAR(190) NULL,
  phone            VARCHAR(30)  NULL,
  street           VARCHAR(200) NULL,
  city             VARCHAR(80)  NULL,
  state            VARCHAR(80)  NULL,
  about            VARCHAR(600) NULL,
  logo_id          INT UNSIGNED NULL,
  bank_name        VARCHAR(80)  NULL,
  account_name     VARCHAR(120) NULL,
  account_number   VARCHAR(10)  NULL,
  -- unpaid -> submitted (merchant says they transferred) -> confirmed / rejected (by an admin)
  fee_status       ENUM('unpaid','submitted','confirmed','rejected') NOT NULL DEFAULT 'unpaid',
  fee_sender       VARCHAR(120) NULL,
  fee_bank         VARCHAR(80)  NULL,
  fee_submitted_at DATETIME     NULL,
  fee_reviewed_by  INT UNSIGNED NULL,
  fee_reviewed_at  DATETIME     NULL,
  fee_note         VARCHAR(300) NULL,
  live_seen        TINYINT(1)   NOT NULL DEFAULT 0,
  views            INT UNSIGNED NOT NULL DEFAULT 0,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  KEY ix_store_fee (fee_status),
  CONSTRAINT fk_store_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Product photos and store logos, kept in the database (checked and size-limited by the API).
CREATE TABLE IF NOT EXISTS aipay_images (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  owner_id    INT UNSIGNED NOT NULL,
  mime        VARCHAR(20)  NOT NULL,
  data        MEDIUMBLOB   NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_image_owner (owner_id),
  CONSTRAINT fk_image_owner FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS aipay_products (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  merchant_id  INT UNSIGNED NOT NULL,
  name         VARCHAR(80)  NOT NULL,
  category     VARCHAR(40)  NOT NULL,
  price        INT UNSIGNED NOT NULL,            -- naira
  stock        INT UNSIGNED NOT NULL DEFAULT 0,
  sold         INT UNSIGNED NOT NULL DEFAULT 0,
  description  VARCHAR(600) NULL,
  image_id     INT UNSIGNED NULL,
  active       TINYINT(1)   NOT NULL DEFAULT 1,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_product_merchant (merchant_id),
  KEY ix_product_list (active, category),
  CONSTRAINT fk_product_merchant FOREIGN KEY (merchant_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One order = one buyer buying from one store. Payment is a bank transfer to the store's account:
-- the buyer says they've sent it, the merchant confirms it arrived.
CREATE TABLE IF NOT EXISTS aipay_orders (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code          CHAR(10)     NOT NULL,
  buyer_id      INT UNSIGNED NOT NULL,
  merchant_id   INT UNSIGNED NOT NULL,
  status        ENUM('awaiting_payment','payment_sent','processing','ready','shipped','delivered','cancelled') NOT NULL DEFAULT 'awaiting_payment',
  delivery      ENUM('pickup','delivery') NOT NULL,
  address       TEXT         NULL,               -- JSON: street, city, state, phone
  subtotal      INT UNSIGNED NOT NULL,
  delivery_fee  INT UNSIGNED NOT NULL DEFAULT 0,
  total         INT UNSIGNED NOT NULL,
  pay_sender    VARCHAR(120) NULL,
  pay_bank      VARCHAR(80)  NULL,
  paid_at       DATETIME     NULL,
  cancel_note   VARCHAR(300) NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_order_code (code),
  KEY ix_order_buyer (buyer_id, created_at),
  KEY ix_order_merchant (merchant_id, status),
  CONSTRAINT fk_order_buyer FOREIGN KEY (buyer_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_order_merchant FOREIGN KEY (merchant_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS aipay_order_items (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id    INT UNSIGNED NOT NULL,
  product_id  INT UNSIGNED NULL,
  name        VARCHAR(80)  NOT NULL,
  price       INT UNSIGNED NOT NULL,
  qty         INT UNSIGNED NOT NULL,
  image_id    INT UNSIGNED NULL,
  PRIMARY KEY (id),
  KEY ix_item_order (order_id),
  CONSTRAINT fk_item_order FOREIGN KEY (order_id) REFERENCES aipay_orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS aipay_notes (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  text        VARCHAR(300) NOT NULL,
  kind        VARCHAR(20)  NOT NULL DEFAULT 'info',
  read_at     DATETIME     NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_note_user (user_id, created_at),
  CONSTRAINT fk_note_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Each person's AiPay settings and saved delivery address.
CREATE TABLE IF NOT EXISTS aipay_prefs (
  user_id     INT UNSIGNED NOT NULL,
  settings    TEXT NULL,
  address     TEXT NULL,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_prefs_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
