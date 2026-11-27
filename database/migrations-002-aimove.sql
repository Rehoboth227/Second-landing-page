-- AiMove tables (deliveries, escrow ledger, messages, notifications, rider and customer profiles).
-- New installs: these are already in schema.sql. A site that is already live: run this once in
-- cPanel > phpMyAdmin > (your Rehohub database) > SQL. It only adds new tables; nothing else changes.

SET NAMES utf8mb4;

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
