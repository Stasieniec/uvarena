CREATE TABLE `answers` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`match_id` text NOT NULL,
	`round_no` integer NOT NULL,
	`question_id` text NOT NULL,
	`course_id` text NOT NULL,
	`lecture_id` text NOT NULL,
	`mode` text NOT NULL,
	`correct` integer NOT NULL,
	`timed_out` integer NOT NULL,
	`ms` integer,
	`helped` integer NOT NULL,
	`answer_json` text,
	`answered_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `answers_user_time_idx` ON `answers` (`user_id`,`answered_at`);--> statement-breakpoint
CREATE INDEX `answers_user_question_idx` ON `answers` (`user_id`,`question_id`);--> statement-breakpoint
CREATE INDEX `answers_user_lecture_idx` ON `answers` (`user_id`,`course_id`,`lecture_id`);--> statement-breakpoint
CREATE TABLE `courses` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`title` text NOT NULL,
	`short_title` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `courses_code_unique` ON `courses` (`code`);--> statement-breakpoint
CREATE TABLE `lectures` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`title` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`note_url` text,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `lectures_course_sort_idx` ON `lectures` (`course_id`,`sort`);--> statement-breakpoint
CREATE TABLE `match_finalizations` (
	`match_id` text PRIMARY KEY NOT NULL,
	`finalized_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `match_rounds` (
	`match_id` text NOT NULL,
	`round_no` integer NOT NULL,
	`question_id` text NOT NULL,
	`question_rev` integer NOT NULL,
	`multiplier` real NOT NULL,
	`answer_a_json` text,
	`answer_b_json` text,
	`correct_a` integer NOT NULL,
	`correct_b` integer NOT NULL,
	`ms_a` integer,
	`ms_b` integer,
	`score_a` integer NOT NULL,
	`score_b` integer NOT NULL,
	`damage_to_a` integer NOT NULL,
	`damage_to_b` integer NOT NULL,
	`hp_a_after` integer NOT NULL,
	`hp_b_after` integer NOT NULL,
	`powerups_json` text NOT NULL,
	PRIMARY KEY(`match_id`, `round_no`)
);
--> statement-breakpoint
CREATE TABLE `matches` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`mode` text NOT NULL,
	`rated` integer NOT NULL,
	`join_code` text,
	`status` text NOT NULL,
	`player_a` text NOT NULL,
	`player_b` text,
	`bot_level` integer,
	`bot_rating` real,
	`settings_json` text NOT NULL,
	`loadout_a_json` text,
	`loadout_b_json` text,
	`winner` text,
	`end_reason` text,
	`rounds_played` integer,
	`hp_a` integer,
	`hp_b` integer,
	`rating_a_before` real,
	`rating_a_after` real,
	`rating_b_before` real,
	`rating_b_after` real,
	`bot_rating_before` real,
	`bot_rating_after` real,
	`pair_capped` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`ended_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `matches_join_code_idx` ON `matches` (`join_code`);--> statement-breakpoint
CREATE INDEX `matches_player_a_idx` ON `matches` (`player_a`,`ended_at`);--> statement-breakpoint
CREATE INDEX `matches_player_b_idx` ON `matches` (`player_b`,`ended_at`);--> statement-breakpoint
CREATE INDEX `matches_status_idx` ON `matches` (`status`);--> statement-breakpoint
CREATE INDEX `matches_course_mode_idx` ON `matches` (`course_id`,`mode`,`ended_at`);--> statement-breakpoint
CREATE TABLE `missed_questions` (
	`user_id` text NOT NULL,
	`question_id` text NOT NULL,
	`course_id` text NOT NULL,
	`lecture_id` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`times_missed` integer DEFAULT 1 NOT NULL,
	`first_missed_at` integer NOT NULL,
	`last_missed_at` integer NOT NULL,
	`last_answer_json` text,
	`last_match_id` text,
	`learned_at` integer,
	`retries` integer DEFAULT 0 NOT NULL,
	`retry_correct` integer DEFAULT 0 NOT NULL,
	`last_retry_at` integer,
	PRIMARY KEY(`user_id`, `question_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `missed_list_idx` ON `missed_questions` (`user_id`,`status`,`course_id`,`lecture_id`,"last_missed_at" DESC);--> statement-breakpoint
CREATE TABLE `player_course` (
	`user_id` text NOT NULL,
	`course_id` text NOT NULL,
	`answers` integer DEFAULT 0 NOT NULL,
	`correct` integer DEFAULT 0 NOT NULL,
	`last_answer_at` integer,
	PRIMARY KEY(`user_id`, `course_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `question_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`vault_commit` text,
	`added` integer NOT NULL,
	`changed` integer NOT NULL,
	`rev_bumped` integer NOT NULL,
	`retired` integer NOT NULL,
	`unchanged` integer NOT NULL,
	`imported_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `question_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`question_id` text NOT NULL,
	`question_rev` integer NOT NULL,
	`reason` text NOT NULL,
	`note` text,
	`match_id` text,
	`created_at` integer NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `question_reports_question_idx` ON `question_reports` (`question_id`);--> statement-breakpoint
CREATE INDEX `question_reports_open_idx` ON `question_reports` (`resolved_at`,`created_at`);--> statement-breakpoint
CREATE TABLE `questions` (
	`id` text PRIMARY KEY NOT NULL,
	`rev` integer DEFAULT 1 NOT NULL,
	`course_id` text NOT NULL,
	`lecture_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`type` text NOT NULL,
	`prompt_md` text,
	`statement_md` text,
	`code_lang` text,
	`options_json` text DEFAULT '[]' NOT NULL,
	`targets_json` text,
	`key_json` text NOT NULL,
	`shuffle` integer DEFAULT true NOT NULL,
	`why_md` text NOT NULL,
	`why_short` text NOT NULL,
	`option_why_json` text DEFAULT '{}' NOT NULL,
	`note_url` text,
	`difficulty` text NOT NULL,
	`level` text NOT NULL,
	`topics_json` text DEFAULT '[]' NOT NULL,
	`time_s` integer,
	`words` integer DEFAULT 0 NOT NULL,
	`chance` real NOT NULL,
	`start_rating` real NOT NULL,
	`rating` real NOT NULL,
	`rating_n` integer DEFAULT 0 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`correct` integer DEFAULT 0 NOT NULL,
	`fingerprint` text NOT NULL,
	`content_hash` text NOT NULL,
	`source_path` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lecture_id`) REFERENCES `lectures`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `questions_course_status_rating_idx` ON `questions` (`course_id`,`status`,`rating`);--> statement-breakpoint
CREATE INDEX `questions_lecture_idx` ON `questions` (`lecture_id`);--> statement-breakpoint
CREATE TABLE `ratings` (
	`user_id` text NOT NULL,
	`course_id` text NOT NULL,
	`kind` text NOT NULL,
	`rating` real,
	`rd` real,
	`vol` real,
	`n` integer DEFAULT 0 NOT NULL,
	`played` integer DEFAULT 0 NOT NULL,
	`won` integer DEFAULT 0 NOT NULL,
	`lost` integer DEFAULT 0 NOT NULL,
	`drawn` integer DEFAULT 0 NOT NULL,
	`surrendered` integer DEFAULT 0 NOT NULL,
	`abandoned` integer DEFAULT 0 NOT NULL,
	`cur_streak` integer DEFAULT 0 NOT NULL,
	`best_streak` integer DEFAULT 0 NOT NULL,
	`highest_bot_level` integer DEFAULT 0 NOT NULL,
	`last_played_at` integer,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `course_id`, `kind`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ratings_leaderboard_idx` ON `ratings` (`course_id`,`kind`,"rating" DESC);--> statement-breakpoint
CREATE TABLE `user_prefs` (
	`user_id` text PRIMARY KEY NOT NULL,
	`loadout_json` text DEFAULT '["zeus","aegis","oracle"]' NOT NULL,
	`sound` integer DEFAULT true NOT NULL,
	`course_id` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`username` text,
	`display_username` text,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`role` text DEFAULT 'user'
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_username_unique` ON `user` (`username`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
-- Seed: the launch courses. Hand-added below the generated schema; data only,
-- so drizzle-kit's snapshot is unaffected.
INSERT INTO `courses` (`id`, `code`, `title`, `short_title`, `active`, `sort`) VALUES
	('agai', 'AGAI', 'Agentic Artificial Intelligence', 'Agentic AI', 1, 1),
	('eprm', 'EPRM', 'Engineering Production-Ready ML/AI Systems', 'Engineering', 1, 2);
