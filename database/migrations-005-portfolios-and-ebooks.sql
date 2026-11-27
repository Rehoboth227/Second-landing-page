-- AiRise learner portfolios and employers; AiPay digital products (e-books and audiobooks).
-- New installs: these are already in schema.sql. A site that is already live: run this once in
-- cPanel > phpMyAdmin > (your Rehohub database) > SQL. It adds new tables and two new values to
-- existing lists; running it again changes nothing.

SET NAMES utf8mb4;

-- "employer" is a new AiRise role (needs approval). "digital" is a new kind of AiPay order (nothing to deliver).
ALTER TABLE memberships MODIFY role ENUM('customer','rider','merchant','employee','trainer','employer','admin') NOT NULL;
ALTER TABLE aipay_orders MODIFY delivery ENUM('pickup','delivery','digital') NOT NULL;

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
