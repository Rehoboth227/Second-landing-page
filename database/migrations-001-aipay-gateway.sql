-- Run once on a database created before the AiPay app (November 2026).
-- Adds the AiPay "payment system" role (product aipay, role gateway).
-- In phpMyAdmin: choose the Rehohub database, open the SQL tab, paste this, press Go.
ALTER TABLE memberships
  MODIFY role ENUM('customer','rider','merchant','gateway','employee','trainer','admin') NOT NULL;
