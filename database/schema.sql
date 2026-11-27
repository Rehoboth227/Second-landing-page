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
  role         ENUM('customer','rider','merchant','employee','trainer','employer','admin') NOT NULL,
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
  delivery      ENUM('pickup','delivery','digital') NOT NULL,
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

-- ------------------------------------------------------------------ GreenFed

-- Prices, staff rate and the bank account customers pay into. Change them in GreenFed > Settings.
CREATE TABLE IF NOT EXISTS gf_settings (
  k  VARCHAR(40)  NOT NULL,
  v  VARCHAR(500) NOT NULL,
  PRIMARY KEY (k)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO gf_settings (k, v) VALUES
  ('plan_price', '25000'),            -- naira per person per week (placeholder)
  ('nutritionist_rate', '3000'),      -- naira paid to a nutritionist per delivered meal plan (placeholder)
  ('bank_name', 'Access Bank'),
  ('account_name', 'GreenFed'),
  ('account_number', '0790145581');

-- The grocery store. Prices are placeholders in naira: change them in GreenFed > Settings.
CREATE TABLE IF NOT EXISTS gf_items (
  slug       VARCHAR(30)  NOT NULL,
  name       VARCHAR(80)  NOT NULL,
  cat        VARCHAR(20)  NOT NULL,
  price      INT UNSIGNED NOT NULL,
  unit       VARCHAR(30)  NOT NULL,
  allergens  VARCHAR(100) NULL,             -- comma separated: Milk, Egg, Wheat, Peanuts, Fish, Soy
  discount   TINYINT UNSIGNED NOT NULL DEFAULT 0,  -- percent off
  popular    TINYINT(1)   NOT NULL DEFAULT 0,
  is_new     TINYINT(1)   NOT NULL DEFAULT 0,
  active     TINYINT(1)   NOT NULL DEFAULT 1,
  sort       SMALLINT     NOT NULL DEFAULT 0,
  PRIMARY KEY (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO gf_items (slug, name, cat, price, unit, allergens, discount, popular, is_new, sort) VALUES
  ('spinach','Spinach','Veges',1000,'1 bunch',NULL,0,1,0,1),
  ('tomatoes','Tomatoes','Veges',2500,'1 kg',NULL,0,1,0,2),
  ('cucumber','Cucumber','Veges',1200,'2 pcs',NULL,0,0,0,3),
  ('carrots','Carrots','Veges',1800,'1 kg',NULL,0,0,0,4),
  ('okra','Okra','Veges',1500,'500 g',NULL,20,0,0,5),
  ('sweetpotato','Sweet potato','Veges',2000,'1 kg',NULL,0,0,0,6),
  ('berries','Mixed berries','Fruits',6500,'250 g',NULL,0,1,0,7),
  ('bananas','Bananas','Fruits',1500,'1 bunch',NULL,0,0,0,8),
  ('apples','Apples','Fruits',4500,'6 pcs',NULL,20,0,0,9),
  ('avocado','Avocado','Fruits',2500,'2 pcs',NULL,0,0,1,10),
  ('groundnuts','Roasted groundnuts','Snacks',1500,'200 g','Peanuts',0,0,0,11),
  ('hummus','Hummus','Snacks',4000,'250 g',NULL,0,0,1,12),
  ('popcorn','Popcorn kernels','Snacks',2000,'500 g',NULL,0,0,0,13),
  ('oats','Oatmeal','Breads',5500,'1 kg',NULL,0,1,0,14),
  ('wwbread','Whole-wheat bread','Breads',2500,'1 loaf','Wheat',0,0,0,15),
  ('granola','Granola','Breads',5000,'500 g','Wheat',20,0,0,16),
  ('almondmilk','Almond milk','Drinks',6000,'1 L',NULL,0,1,0,17),
  ('tigernut','Tiger nut drink','Drinks',1500,'500 ml',NULL,0,0,1,18),
  ('honey','Honey','Drinks',7000,'500 g',NULL,0,1,0,19),
  ('yoghurt','Greek yoghurt','Drinks',4500,'500 g','Milk',0,0,0,20),
  ('chicken','Chicken breast','Proteins',8500,'1 kg',NULL,0,0,0,21),
  ('salmon','Salmon fillet','Proteins',15000,'500 g','Fish',0,0,0,22),
  ('eggs','Eggs','Proteins',4000,'12 pcs','Egg',0,0,0,23),
  ('tofu','Tofu','Proteins',3500,'400 g','Soy',0,0,0,24),
  ('beans','Brown beans','Proteins',3000,'1 kg',NULL,0,0,0,25),
  ('turkey','Turkey','Proteins',9500,'1 kg',NULL,20,0,0,26),
  ('brownrice','Brown rice','Grains',6000,'2 kg',NULL,0,0,0,27),
  ('quinoa','Quinoa','Grains',8000,'500 g',NULL,0,0,1,28),
  ('yam','Yam','Grains',4000,'1 tuber',NULL,0,0,0,29),
  ('plantain','Plantain','Grains',2500,'4 pcs',NULL,0,0,0,30),
  ('feta','Feta cheese','Grains',6000,'200 g','Milk',0,0,0,31);

-- Each customer's details used for meal planning (height, weight, goal, settings).
CREATE TABLE IF NOT EXISTS gf_profiles (
  user_id     INT UNSIGNED NOT NULL,
  address     VARCHAR(200) NULL,
  occupation  VARCHAR(80)  NULL,
  marital     VARCHAR(30)  NULL,
  height      SMALLINT UNSIGNED NULL,
  weight      SMALLINT UNSIGNED NULL,
  goal        VARCHAR(120) NULL,
  goal_note   VARCHAR(300) NULL,
  prefs       TEXT NULL,
  setup_done  TINYINT(1)   NOT NULL DEFAULT 0,
  leader_at   DATETIME     NULL,              -- applied to become a community leader
  bank_name   VARCHAR(80)  NULL,              -- nutritionists: where per-task pay goes
  bank_acct   VARCHAR(10)  NULL,
  bank_holder VARCHAR(120) NULL,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_gfprof_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Household members (the account holder is the member with rel = 'You').
CREATE TABLE IF NOT EXISTS gf_members (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  name        VARCHAR(80)  NOT NULL,
  rel         VARCHAR(20)  NOT NULL,
  age         TINYINT UNSIGNED NULL,
  sex         VARCHAR(10)  NULL,
  allergies   VARCHAR(100) NULL,
  conditions  VARCHAR(300) NULL,
  PRIMARY KEY (id),
  KEY ix_gfmem_user (user_id),
  CONSTRAINT fk_gfmem_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Health records: private to the account holder.
CREATE TABLE IF NOT EXISTS gf_records (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  member_id   INT UNSIGNED NULL,
  type        VARCHAR(20)  NOT NULL,
  name        VARCHAR(120) NOT NULL,
  sev         VARCHAR(10)  NOT NULL,
  recorded_by VARCHAR(80)  NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_gfrec_user (user_id),
  CONSTRAINT fk_gfrec_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gf_favs (
  user_id  INT UNSIGNED NOT NULL,
  slug     VARCHAR(30)  NOT NULL,
  PRIMARY KEY (user_id, slug),
  CONSTRAINT fk_gffav_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Meal plans and grocery orders. Customers pay by bank transfer to GreenFed; an administrator
-- confirms the money arrived (PAID), then staff take the order through its stages.
CREATE TABLE IF NOT EXISTS gf_orders (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  kind        ENUM('plan','grocery') NOT NULL,
  status      ENUM('AWAITING_PAYMENT','PAYMENT_SENT','PAID','PICKED','IN_PROGRESS','GATHERING','QA','PACKAGED','EN_ROUTE','DELIVERED','CANCELLED') NOT NULL DEFAULT 'AWAITING_PAYMENT',
  name        VARCHAR(80)  NULL,
  members     TEXT NULL,                       -- JSON: member ids and names the plan is for
  persons     TINYINT UNSIGNED NOT NULL DEFAULT 1,
  weeks       TINYINT UNSIGNED NOT NULL DEFAULT 1,
  meals       VARCHAR(100) NULL,
  allergies   VARCHAR(100) NULL,
  info        VARCHAR(600) NULL,
  items       TEXT NULL,                       -- JSON: [slug, qty, unit price, name]
  total       INT UNSIGNED NOT NULL,           -- naira
  address     VARCHAR(200) NULL,
  slot        VARCHAR(40)  NULL,
  weekly      TINYINT(1)   NOT NULL DEFAULT 0,
  pay_sender  VARCHAR(120) NULL,
  pay_bank    VARCHAR(80)  NULL,
  paid_at     DATETIME     NULL,
  staff       TEXT NULL,                       -- JSON: {nutritionist|supply|qa|delivery|supplier: {id, name}}
  gathered    TINYINT(1)   NOT NULL DEFAULT 0,
  passed      TINYINT(1)   NOT NULL DEFAULT 0,
  supplied    TINYINT(1)   NOT NULL DEFAULT 0,
  days        MEDIUMTEXT NULL,                 -- JSON: the delivered 7-day plan
  review      TEXT NULL,                       -- JSON: {stars, note}
  stage_rates TEXT NULL,                       -- JSON: {stage: stars}
  fav         TINYINT(1)   NOT NULL DEFAULT 0,
  note        VARCHAR(300) NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_gford_user (user_id, created_at),
  KEY ix_gford_status (kind, status),
  CONSTRAINT fk_gford_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gf_events (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id    INT UNSIGNED NOT NULL,
  status      VARCHAR(20)  NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_gfev_order (order_id),
  CONSTRAINT fk_gfev_order FOREIGN KEY (order_id) REFERENCES gf_orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Staff work meter: one row per completed task. Nutritionist tasks are paid per task
-- (gf_payouts); other staff are salaried or paid per contract outside GreenFed.
CREATE TABLE IF NOT EXISTS gf_tasks (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  emp_type    VARCHAR(20)  NOT NULL,
  order_id    INT UNSIGNED NULL,
  what        VARCHAR(40)  NOT NULL,
  payout_id   INT UNSIGNED NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_gftask_user (user_id, payout_id),
  CONSTRAINT fk_gftask_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gf_payouts (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  tasks       INT UNSIGNED NOT NULL,
  amount      INT UNSIGNED NOT NULL,
  paid_by     INT UNSIGNED NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_gfpay_user (user_id),
  CONSTRAINT fk_gfpay_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gf_complaints (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  type        VARCHAR(40)  NOT NULL,
  body        VARCHAR(1000) NOT NULL,
  status      ENUM('OPEN','RESOLVED') NOT NULL DEFAULT 'OPEN',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_gfcomp_user (user_id),
  CONSTRAINT fk_gfcomp_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Customer reports about an order (late delivery, poor quality).
CREATE TABLE IF NOT EXISTS gf_conflicts (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id    INT UNSIGNED NOT NULL,
  user_id     INT UNSIGNED NOT NULL,
  type        VARCHAR(30)  NOT NULL,
  status      ENUM('OPEN','RESOLVED') NOT NULL DEFAULT 'OPEN',
  resolution  VARCHAR(300) NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_gfconf_order FOREIGN KEY (order_id) REFERENCES gf_orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Communities: official starter groups (created_by NULL) and groups made by customers or
-- health specialists. Private groups need the creator or an admin to approve each member.
CREATE TABLE IF NOT EXISTS gf_communities (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(60)  NOT NULL,
  cat         VARCHAR(30)  NOT NULL,
  descr       VARCHAR(300) NOT NULL,
  pub         TINYINT(1)   NOT NULL DEFAULT 1,
  perms       ENUM('anyone','admins') NOT NULL DEFAULT 'anyone',
  created_by  INT UNSIGNED NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO gf_communities (name, cat, descr, pub, perms)
SELECT * FROM (SELECT 'Allergies' n, 'Allergies' c, 'Living well with food allergies: swaps, labels and recipes.' d, 1 p, 'anyone' pe UNION ALL
  SELECT 'Balanced diet', 'Nutrition', 'Simple, balanced meals for busy families.', 1, 'anyone' UNION ALL
  SELECT 'Weight', 'Health issues', 'Support for healthy weight goals, without crash diets.', 1, 'anyone' UNION ALL
  SELECT 'Diet and diabetes', 'Health issues', 'Eating well with diabetes, guided by our health specialists.', 1, 'admins' UNION ALL
  SELECT 'Food & craft', 'Food & craft', 'Cook, preserve and plate: share what you make.', 1, 'anyone' UNION ALL
  SELECT 'Recovery kitchen', 'Rehabilitation', 'Private support for people in addiction recovery and their families.', 0, 'admins') s
WHERE NOT EXISTS (SELECT 1 FROM gf_communities);

CREATE TABLE IF NOT EXISTS gf_comm_members (
  community_id INT UNSIGNED NOT NULL,
  user_id      INT UNSIGNED NOT NULL,
  status       ENUM('member','pending') NOT NULL DEFAULT 'member',
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (community_id, user_id),
  CONSTRAINT fk_gfcm_comm FOREIGN KEY (community_id) REFERENCES gf_communities (id) ON DELETE CASCADE,
  CONSTRAINT fk_gfcm_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gf_posts (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  community_id INT UNSIGNED NOT NULL,
  user_id      INT UNSIGNED NOT NULL,
  title        VARCHAR(140) NOT NULL,
  body         VARCHAR(3000) NOT NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_gfpost_comm (community_id, id),
  CONSTRAINT fk_gfpost_comm FOREIGN KEY (community_id) REFERENCES gf_communities (id) ON DELETE CASCADE,
  CONSTRAINT fk_gfpost_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gf_replies (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  post_id      INT UNSIGNED NOT NULL,
  parent_id    INT UNSIGNED NULL,
  user_id      INT UNSIGNED NOT NULL,
  specialist   TINYINT(1)   NOT NULL DEFAULT 0,
  body         VARCHAR(2000) NOT NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_gfrep_post (post_id),
  CONSTRAINT fk_gfrep_post FOREIGN KEY (post_id) REFERENCES gf_posts (id) ON DELETE CASCADE,
  CONSTRAINT fk_gfrep_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gf_likes (
  post_id  INT UNSIGNED NOT NULL,
  user_id  INT UNSIGNED NOT NULL,
  PRIMARY KEY (post_id, user_id),
  CONSTRAINT fk_gflike_post FOREIGN KEY (post_id) REFERENCES gf_posts (id) ON DELETE CASCADE,
  CONSTRAINT fk_gflike_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gf_notes (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  cat         VARCHAR(20)  NOT NULL,
  title       VARCHAR(120) NOT NULL,
  body        VARCHAR(300) NOT NULL,
  link        VARCHAR(60)  NULL,
  read_at     DATETIME     NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_gfnote_user (user_id, id),
  CONSTRAINT fk_gfnote_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------ AiRise (also in migrations-004-airise.sql)

-- Courses written by approved AiRise trainers. Quiz answers stay on the server.
-- status: draft (trainer only), review (waiting for an administrator), changes (sent back with a note),
-- published (learners can take it).
CREATE TABLE IF NOT EXISTS airise_courses (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  trainer_id    INT UNSIGNED NOT NULL,
  title         VARCHAR(120) NOT NULL,
  data          MEDIUMTEXT   NOT NULL,          -- JSON: track, level, hours, summary, outcomes, skills, cover, modules, questions, scenario, pass
  status        VARCHAR(10)  NOT NULL DEFAULT 'draft',
  review_note   VARCHAR(500) NULL,
  reviewed_by   INT UNSIGNED NULL,
  submitted_at  DATETIME     NULL,
  published_at  DATETIME     NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY airise_courses_trainer (trainer_id),
  KEY airise_courses_status (status),
  CONSTRAINT fk_aircourse_user FOREIGN KEY (trainer_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Files trainers upload (cover pictures, lesson videos, PDFs, slides, audio). The file itself is kept
-- in the private storage folder (see DEPLOY.md), never in a public web folder.
CREATE TABLE IF NOT EXISTS airise_files (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  owner_id    INT UNSIGNED NOT NULL,
  name        VARCHAR(160) NOT NULL,
  mime        VARCHAR(100) NOT NULL,
  size        BIGINT UNSIGNED NOT NULL,
  received    BIGINT UNSIGNED NOT NULL DEFAULT 0,
  stored_as   VARCHAR(64)  NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY airise_files_owner (owner_id),
  CONSTRAINT fk_airfile_user FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Lessons a learner has finished. course is a series slug (e.g. "adaptability") or "t" + a trainer course id.
CREATE TABLE IF NOT EXISTS airise_progress (
  user_id   INT UNSIGNED NOT NULL,
  course    VARCHAR(40)  NOT NULL,
  lesson    SMALLINT UNSIGNED NOT NULL,
  minutes   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  kind      VARCHAR(10)  NOT NULL DEFAULT 'video',
  done_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, course, lesson),
  KEY airise_progress_done (user_id, done_at),
  CONSTRAINT fk_airprog_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Quiz attempts on trainer courses, marked by the server.
CREATE TABLE IF NOT EXISTS airise_attempts (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED NOT NULL,
  course     VARCHAR(40)  NOT NULL,
  score      SMALLINT UNSIGNED NOT NULL,
  total      SMALLINT UNSIGNED NOT NULL,
  passed     TINYINT(1)   NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY airise_attempts_user (user_id, course),
  CONSTRAINT fk_airatt_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Certificates, issued by the server when every lesson of a course is finished.
-- Numbers: AIR-C3-2026-001 (series course 3), AIR-H-2026-001 (The Hack), AIR-T12-2026-001 (trainer course 12).
CREATE TABLE IF NOT EXISTS airise_certs (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED NOT NULL,
  course     VARCHAR(40)  NOT NULL,
  title      VARCHAR(160) NOT NULL,
  number     VARCHAR(30)  NOT NULL,
  issued_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY airise_certs_number (number),
  UNIQUE KEY airise_certs_once (user_id, course),
  CONSTRAINT fk_aircert_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- (also in migrations-005-portfolios-and-ebooks.sql)
-- ------------------------------------------------------------------ AiRise portfolios
-- A learner's profile for employers. visible = 1 means approved employers can find it.
CREATE TABLE IF NOT EXISTS airise_profiles (
  user_id          INT UNSIGNED NOT NULL,
  course_of_study  VARCHAR(120) NULL,
  institution      VARCHAR(120) NULL,
  level            VARCHAR(40)  NULL,            -- e.g. Final year, Graduate
  grade            VARCHAR(60)  NULL,            -- e.g. Second Class Upper
  cgpa             DECIMAL(4,2) NULL,
  cgpa_scale       TINYINT UNSIGNED NOT NULL DEFAULT 5,
  career           VARCHAR(20)  NULL,            -- a key from AIR_CAREERS in api/lib/airise.php
  about            VARCHAR(600) NULL,
  visible          TINYINT(1)   NOT NULL DEFAULT 0,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  KEY airise_profiles_career (career, visible),
  CONSTRAINT fk_airprof_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Documents in a learner's portfolio folders (results, certificates, projects, references).
-- AiRise administrators verify them; verified documents count fully in the portfolio score.
CREATE TABLE IF NOT EXISTS airise_docs (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      INT UNSIGNED NOT NULL,
  folder       VARCHAR(20)  NOT NULL,
  title        VARCHAR(120) NOT NULL,
  file_id      INT UNSIGNED NOT NULL,           -- airise_files
  status       ENUM('pending','verified','rejected') NOT NULL DEFAULT 'pending',
  note         VARCHAR(300) NULL,
  reviewed_by  INT UNSIGNED NULL,
  reviewed_at  DATETIME     NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY airise_docs_user (user_id, folder),
  KEY airise_docs_status (status),
  CONSTRAINT fk_airdoc_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------ AiPay digital products
-- Files sellers upload (kept in the private storage folder, never in a public web folder).
CREATE TABLE IF NOT EXISTS aipay_files (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  owner_id    INT UNSIGNED NOT NULL,
  name        VARCHAR(160) NOT NULL,
  mime        VARCHAR(100) NOT NULL,
  size        BIGINT UNSIGNED NOT NULL,
  received    BIGINT UNSIGNED NOT NULL DEFAULT 0,
  stored_as   VARCHAR(64)  NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY aipay_files_owner (owner_id),
  CONSTRAINT fk_apfile_user FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A product with a row here is a digital download.
CREATE TABLE IF NOT EXISTS aipay_downloads (
  product_id  INT UNSIGNED NOT NULL,
  file_id     INT UNSIGNED NOT NULL,
  PRIMARY KEY (product_id),
  CONSTRAINT fk_apdl_product FOREIGN KEY (product_id) REFERENCES aipay_products (id) ON DELETE CASCADE,
  CONSTRAINT fk_apdl_file FOREIGN KEY (file_id) REFERENCES aipay_files (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The file each buyer bought, kept even if the seller later changes the product.
CREATE TABLE IF NOT EXISTS aipay_order_files (
  order_id    INT UNSIGNED NOT NULL,
  product_id  INT UNSIGNED NOT NULL,
  file_id     INT UNSIGNED NOT NULL,
  PRIMARY KEY (order_id, product_id),
  CONSTRAINT fk_apof_order FOREIGN KEY (order_id) REFERENCES aipay_orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_apof_file FOREIGN KEY (file_id) REFERENCES aipay_files (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
