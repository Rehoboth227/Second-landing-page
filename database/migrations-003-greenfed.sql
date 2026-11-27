-- GreenFed tables (households, health records, meal plans, grocery orders, staff work, communities).
-- New installs: these are already in schema.sql. A site that is already live: run this once in
-- cPanel > phpMyAdmin > (your Rehohub database) > SQL. It only adds new tables and starter data.

SET NAMES utf8mb4;

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
