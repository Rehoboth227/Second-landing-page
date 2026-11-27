-- AiRise tables (learner progress, certificates, quizzes, trainer courses and their files).
-- New installs: these are already in schema.sql. A site that is already live: run this once in
-- cPanel > phpMyAdmin > (your Rehohub database) > SQL. It only adds new tables.

SET NAMES utf8mb4;

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
