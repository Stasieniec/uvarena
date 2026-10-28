PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_user_prefs` (
	`user_id` text PRIMARY KEY NOT NULL,
	`loadout_json` text DEFAULT '["bibi","shield","fifty"]' NOT NULL,
	`sound` integer DEFAULT true NOT NULL,
	`course_id` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_user_prefs`("user_id", "loadout_json", "sound", "course_id") SELECT "user_id", "loadout_json", "sound", "course_id" FROM `user_prefs`;--> statement-breakpoint
DROP TABLE `user_prefs`;--> statement-breakpoint
ALTER TABLE `__new_user_prefs` RENAME TO `user_prefs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
-- Hand-added below the generated rebuild; data only, so drizzle-kit's
-- snapshot is unaffected.
--
-- Power-ups: Zeus, Aegis, Oracle and Hermes became Bibi, Shield, 50:50
-- (fifty) and Gotta Go Fast (fast); Nemesis and Phoenix are gone. Saved
-- loadouts are mapped to the new ids; one that held a removed power-up goes
-- back to the default. (The app also falls back to the default for any
-- loadout it does not recognise.)
UPDATE `user_prefs` SET `loadout_json` =
	replace(replace(replace(replace(`loadout_json`, '"zeus"', '"bibi"'), '"aegis"', '"shield"'), '"oracle"', '"fifty"'), '"hermes"', '"fast"');--> statement-breakpoint
UPDATE `user_prefs` SET `loadout_json` = '["bibi","shield","fifty"]'
	WHERE `loadout_json` LIKE '%"nemesis"%' OR `loadout_json` LIKE '%"phoenix"%';--> statement-breakpoint
--
-- Courses: only Agentic AI has an exam this period, so Engineering (eprm)
-- leaves the app. It is switched off first, then removed with its lectures
-- and questions if no match was ever played in it (production had none). A
-- course is re-added by a migration that inserts its row, then a bank import.
UPDATE `courses` SET `active` = 0 WHERE `id` = 'eprm';--> statement-breakpoint
UPDATE `questions` SET `status` = 'retired' WHERE `course_id` = 'eprm';--> statement-breakpoint
UPDATE `user_prefs` SET `course_id` = NULL WHERE `course_id` = 'eprm';--> statement-breakpoint
DELETE FROM `missed_questions` WHERE `course_id` = 'eprm'
	AND NOT EXISTS (SELECT 1 FROM `matches` WHERE `course_id` = 'eprm');--> statement-breakpoint
DELETE FROM `question_reports` WHERE `question_id` IN (SELECT `id` FROM `questions` WHERE `course_id` = 'eprm')
	AND NOT EXISTS (SELECT 1 FROM `matches` WHERE `course_id` = 'eprm');--> statement-breakpoint
DELETE FROM `player_course` WHERE `course_id` = 'eprm'
	AND NOT EXISTS (SELECT 1 FROM `matches` WHERE `course_id` = 'eprm');--> statement-breakpoint
DELETE FROM `ratings` WHERE `course_id` = 'eprm'
	AND NOT EXISTS (SELECT 1 FROM `matches` WHERE `course_id` = 'eprm');--> statement-breakpoint
DELETE FROM `questions` WHERE `course_id` = 'eprm'
	AND NOT EXISTS (SELECT 1 FROM `matches` WHERE `course_id` = 'eprm');--> statement-breakpoint
DELETE FROM `lectures` WHERE `course_id` = 'eprm'
	AND NOT EXISTS (SELECT 1 FROM `questions` WHERE `course_id` = 'eprm');--> statement-breakpoint
DELETE FROM `courses` WHERE `id` = 'eprm'
	AND NOT EXISTS (SELECT 1 FROM `lectures` WHERE `course_id` = 'eprm')
	AND NOT EXISTS (SELECT 1 FROM `ratings` WHERE `course_id` = 'eprm')
	AND NOT EXISTS (SELECT 1 FROM `player_course` WHERE `course_id` = 'eprm')
	AND NOT EXISTS (SELECT 1 FROM `matches` WHERE `course_id` = 'eprm');
