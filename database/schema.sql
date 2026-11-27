-- Rehohub shared account system: database schema (MySQL 5.7+ / MariaDB 10.3+).
-- Import this once in cPanel > phpMyAdmin > (your database) > Import.
-- It creates empty tables only. It contains no users, passwords or default accounts.

SET NAMES utf8mb4;

-- One row per person. The same login works for AiPay, AiMove, GreenFed and AiRise.
CREATE TABLE IF NOT EXISTS users (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  email             VARCHAR(190) NOT NULL,
  full_name         VARCHAR(120) NOT NULL,
  phone             VARCHAR(30)  NULL,
  password_hash     VARCHAR(255) NOT NULL,
  email_verified_at DATETIME     NULL,
  -- pending_verification: signed up, email not confirmed yet (cannot log in)
  -- active / warning: can log in (warning is a flag admins can see)
  -- suspended / banned / deactivated: cannot log in; existing sessions are ended
  status            ENUM('pending_verification','active','warning','suspended','banned','deactivated')
                    NOT NULL DEFAULT 'pending_verification',
  session_version   INT UNSIGNED NOT NULL DEFAULT 1,  -- raised to sign the user out everywhere
  failed_logins     INT UNSIGNED NOT NULL DEFAULT 0,
  locked_until      DATETIME     NULL,
  last_login_at     DATETIME     NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- What each person may do in each product. One person can hold several memberships,
-- e.g. AiMove customer + GreenFed employee. Product "rehohub" + role "admin" is a
-- super administrator; product X + role "admin" administers product X only.
CREATE TABLE IF NOT EXISTS memberships (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      INT UNSIGNED NOT NULL,
  product      ENUM('rehohub','aipay','aimove','greenfed','airise') NOT NULL,
  role         ENUM('customer','rider','merchant','employee','trainer','admin') NOT NULL,
  -- customers are approved automatically; riders, merchants, employees and trainers wait
  -- for an administrator; admins are created by invitation only
  status       ENUM('pending','approved','rejected','suspended') NOT NULL DEFAULT 'pending',
  details      TEXT NULL,             -- JSON: application details (business name, vehicle, …)
  review_note  VARCHAR(500) NULL,
  reviewed_by  INT UNSIGNED NULL,
  reviewed_at  DATETIME NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_membership (user_id, product, role),
  KEY ix_membership_status (status, product),
  CONSTRAINT fk_membership_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_membership_reviewer FOREIGN KEY (reviewed_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Single-use links sent by email. Only a SHA-256 hash of each token is stored,
-- so a copy of the database cannot be used to verify, reset or accept anything.
CREATE TABLE IF NOT EXISTS tokens (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  purpose     ENUM('verify_email','reset_password','invite') NOT NULL,
  token_hash  CHAR(64) NOT NULL,
  user_id     INT UNSIGNED NULL,
  email       VARCHAR(190) NOT NULL,
  data        TEXT NULL,               -- JSON: for invites, the product, role and details
  created_by  INT UNSIGNED NULL,
  expires_at  DATETIME NOT NULL,
  used_at     DATETIME NULL,
  revoked_at  DATETIME NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_token_hash (token_hash),
  KEY ix_token_email (email, purpose),
  CONSTRAINT fk_token_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_token_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Counters that slow down password guessing and sign-up spam.
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket        VARCHAR(190) NOT NULL,
  hits          INT UNSIGNED NOT NULL DEFAULT 0,
  window_start  DATETIME NOT NULL,
  PRIMARY KEY (bucket)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Every sign-up, login, approval, status change and invitation is recorded here.
CREATE TABLE IF NOT EXISTS audit_log (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_id        INT UNSIGNED NULL,
  action          VARCHAR(60) NOT NULL,
  target_user_id  INT UNSIGNED NULL,
  details         TEXT NULL,
  ip              VARCHAR(45) NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_audit_created (created_at),
  KEY ix_audit_target (target_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------ AiPay store

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

-- ------------------------------------------------------------------ AiMove

-- One row per AiMove user: business details (customers), vehicle and payout account (riders), settings.
CREATE TABLE IF NOT EXISTS aimove_profiles (
  user_id     INT UNSIGNED NOT NULL,
  business    VARCHAR(120) NULL,
  rc          VARCHAR(30)  NULL,
  address     VARCHAR(200) NULL,
  vehicle     VARCHAR(40)  NULL,
  plate       VARCHAR(20)  NULL,
  licence     VARCHAR(30)  NULL,
  bank_name   VARCHAR(80)  NULL,
  bank_acct   VARCHAR(10)  NULL,
  bank_holder VARCHAR(120) NULL,
  online      TINYINT(1)   NOT NULL DEFAULT 0,
  last_seen   DATETIME     NULL,
  lat         DECIMAL(9,6) NULL,              -- rider's last shared location (while online)
  lng         DECIMAL(9,6) NULL,
  loc_at      DATETIME     NULL,
  prefs       TEXT         NULL,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_amprof_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS aimove_deliveries (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tracking      CHAR(21)     NOT NULL,          -- R-1234-5678-9012-3456
  customer_id   INT UNSIGNED NOT NULL,
  rider_id      INT UNSIGNED NULL,
  preferred_rider_id INT UNSIGNED NULL,          -- "Book this rider"
  status        ENUM('SCHEDULED','REQUESTED','ASSIGNED','PICKED_UP','IN_TRANSIT','DELIVERED','CANCELLED') NOT NULL,
  service       VARCHAR(12)  NOT NULL,
  vehicle       VARCHAR(8)   NOT NULL,
  items         VARCHAR(160) NOT NULL,
  kg            DECIMAL(8,2) NOT NULL,
  worth         INT UNSIGNED NOT NULL DEFAULT 0,
  km            DECIMAL(8,1) NOT NULL,
  sched_date    DATE         NULL,
  sched_slot    VARCHAR(20)  NULL,
  origin        TEXT         NOT NULL,          -- JSON: addr, state, phone, note
  dest          TEXT         NOT NULL,          -- JSON: addr, state, phone, name
  fare          TEXT         NOT NULL,          -- JSON: the price worked out by the server
  total         INT UNSIGNED NOT NULL,          -- naira paid into escrow
  rider_share   INT UNSIGNED NOT NULL,
  pin           CHAR(4)      NOT NULL,          -- shown to the customer only; the rider types it in
  pin_tries     TINYINT UNSIGNED NOT NULL DEFAULT 0,
  escrow        ENUM('HELD','RELEASED','REFUNDED') NOT NULL DEFAULT 'HELD',
  rating        TINYINT UNSIGNED NULL,
  rating_tags   VARCHAR(200) NULL,
  rating_note   VARCHAR(500) NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_am_tracking (tracking),
  KEY ix_am_customer (customer_id, created_at),
  KEY ix_am_rider (rider_id, status),
  KEY ix_am_status (status),
  CONSTRAINT fk_am_customer FOREIGN KEY (customer_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_am_rider FOREIGN KEY (rider_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS aimove_events (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  delivery_id  INT UNSIGNED NOT NULL,
  status       VARCHAR(12)  NOT NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_amev_delivery (delivery_id),
  CONSTRAINT fk_amev_delivery FOREIGN KEY (delivery_id) REFERENCES aimove_deliveries (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Every naira in and out. Balance = confirmed entries + pending withdrawals (which are held back).
-- wallet: customer money (top-ups, payments into escrow, refunds); earnings: rider money (released
-- escrow, withdrawals). Top-ups and withdrawals stay 'pending' until operations confirms them.
CREATE TABLE IF NOT EXISTS aimove_ledger (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      INT UNSIGNED NOT NULL,
  account      ENUM('wallet','earnings') NOT NULL,
  kind         ENUM('topup','payment','refund','earning','payout') NOT NULL,
  amount       INT          NOT NULL,          -- naira; negative takes money out
  status       ENUM('pending','done','rejected') NOT NULL DEFAULT 'done',
  title        VARCHAR(120) NOT NULL,
  ref          VARCHAR(60)  NULL,
  meta         TEXT         NULL,              -- JSON: sender name and bank, payout account, notes
  reviewed_by  INT UNSIGNED NULL,
  reviewed_at  DATETIME     NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_amled_user (user_id, account, status),
  KEY ix_amled_pending (status, kind),
  CONSTRAINT fk_amled_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Messages between the customer and the rider of one delivery.
CREATE TABLE IF NOT EXISTS aimove_messages (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  delivery_id  INT UNSIGNED NOT NULL,
  sender_id    INT UNSIGNED NOT NULL,
  text         VARCHAR(1000) NOT NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_ammsg_delivery (delivery_id, id),
  CONSTRAINT fk_ammsg_delivery FOREIGN KEY (delivery_id) REFERENCES aimove_deliveries (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS aimove_notes (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  title       VARCHAR(120) NOT NULL,
  body        VARCHAR(300) NOT NULL,
  link        VARCHAR(60)  NULL,
  read_at     DATETIME     NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_amnote_user (user_id, id),
  CONSTRAINT fk_amnote_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
