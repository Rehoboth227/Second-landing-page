-- AiRise cohorts (classes, schedules, announcements), opportunities (SIWES, internships, jobs) and learner notifications.
-- New installs: these are already in schema.sql. A site that is already live: run this once in
-- cPanel > phpMyAdmin > (your Rehohub database) > SQL, after migrations 004 and 005. It only adds new tables.

SET NAMES utf8mb4;

-- A trainer's group of learners taking one course together. Learners join with the code or are added by email.
CREATE TABLE IF NOT EXISTS airise_cohorts (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  trainer_id  INT UNSIGNED NOT NULL,
  course      VARCHAR(40)  NOT NULL,           -- series slug or "t" + trainer course id
  name        VARCHAR(100) NOT NULL,
  code        CHAR(8)      NOT NULL,
  starts_on   DATE         NULL,
  about       VARCHAR(600) NULL,
  archived    TINYINT(1)   NOT NULL DEFAULT 0,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY airise_cohorts_code (code),
  KEY airise_cohorts_trainer (trainer_id),
  CONSTRAINT fk_aircoh_user FOREIGN KEY (trainer_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS airise_cohort_members (
  cohort_id  INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  joined_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (cohort_id, user_id),
  KEY airise_cohmem_user (user_id),
  CONSTRAINT fk_aircm_cohort FOREIGN KEY (cohort_id) REFERENCES airise_cohorts (id) ON DELETE CASCADE,
  CONSTRAINT fk_aircm_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Scheduled classes. link: the live meeting (Zoom, Google Meet, Jitsi or another link the trainer gives).
CREATE TABLE IF NOT EXISTS airise_sessions (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  cohort_id   INT UNSIGNED NOT NULL,
  title       VARCHAR(120) NOT NULL,
  starts_at   DATETIME     NOT NULL,           -- Lagos time (WAT)
  minutes     SMALLINT UNSIGNED NOT NULL DEFAULT 60,
  link        VARCHAR(300) NULL,
  notes       VARCHAR(600) NULL,
  cancelled   TINYINT(1)   NOT NULL DEFAULT 0,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY airise_sessions_cohort (cohort_id, starts_at),
  CONSTRAINT fk_airses_cohort FOREIGN KEY (cohort_id) REFERENCES airise_cohorts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS airise_announcements (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  cohort_id   INT UNSIGNED NOT NULL,
  body        VARCHAR(1500) NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY airise_ann_cohort (cohort_id),
  CONSTRAINT fk_airann_cohort FOREIGN KEY (cohort_id) REFERENCES airise_cohorts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- In-app notifications for AiRise users (classes, announcements, applications).
CREATE TABLE IF NOT EXISTS airise_notes (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  title       VARCHAR(140) NOT NULL,
  body        VARCHAR(400) NOT NULL,
  link        VARCHAR(200) NULL,
  read_at     DATETIME     NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY airise_notes_user (user_id, id),
  CONSTRAINT fk_airnote_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Opportunities posted by approved employers: SIWES placements, internships and jobs.
CREATE TABLE IF NOT EXISTS airise_opportunities (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  employer_id   INT UNSIGNED NOT NULL,
  kind          ENUM('siwes','internship','job') NOT NULL,
  title         VARCHAR(120) NOT NULL,
  company       VARCHAR(120) NOT NULL,
  location      VARCHAR(120) NOT NULL,
  mode          ENUM('onsite','remote','hybrid') NOT NULL DEFAULT 'onsite',
  description   TEXT         NOT NULL,
  requirements  TEXT         NULL,
  pay           VARCHAR(80)  NULL,
  career        VARCHAR(20)  NULL,             -- a career path key, for matching learners
  apply_url     VARCHAR(300) NULL,
  deadline      DATE         NULL,
  status        ENUM('open','closed','removed') NOT NULL DEFAULT 'open',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY airise_opp_list (status, kind, created_at),
  KEY airise_opp_employer (employer_id),
  CONSTRAINT fk_airopp_user FOREIGN KEY (employer_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A learner applying with their AiRise portfolio.
CREATE TABLE IF NOT EXISTS airise_applications (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  opportunity_id  INT UNSIGNED NOT NULL,
  user_id         INT UNSIGNED NOT NULL,
  note            VARCHAR(1000) NULL,
  status          ENUM('sent','shortlisted','declined') NOT NULL DEFAULT 'sent',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY airise_app_once (opportunity_id, user_id),
  KEY airise_app_user (user_id),
  CONSTRAINT fk_airapp_opp FOREIGN KEY (opportunity_id) REFERENCES airise_opportunities (id) ON DELETE CASCADE,
  CONSTRAINT fk_airapp_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
