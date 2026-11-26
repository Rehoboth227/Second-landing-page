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
  role         ENUM('customer','rider','merchant','gateway','employee','trainer','admin') NOT NULL,
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
