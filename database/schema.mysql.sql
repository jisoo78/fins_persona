-- MySQL 8 schema for the C-Level finance decision interview prototype.
-- Run once per database:
--   mysql -u root -p decision < database/schema.mysql.sql

CREATE DATABASE IF NOT EXISTS decision
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE decision;

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_profiles (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id CHAR(36) NOT NULL,
  title VARCHAR(120) NOT NULL,
  industry VARCHAR(120) NOT NULL,
  company_name VARCHAR(160),
  company_size VARCHAR(80),
  finance_scope TEXT NOT NULL,
  raw_profile JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_profiles_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sns_collection_jobs (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_profile_id CHAR(36) NOT NULL,
  input_sns_id VARCHAR(160) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'pending',
  discovery_tool VARCHAR(80) NOT NULL DEFAULT 'Sherlock',
  crawler_tool VARCHAR(80),
  target_platforms JSON NOT NULL,
  error_message TEXT,
  started_at DATETIME,
  completed_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sns_jobs_profile
    FOREIGN KEY (user_profile_id) REFERENCES user_profiles(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sns_accounts (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  collection_job_id CHAR(36) NOT NULL,
  platform VARCHAR(80) NOT NULL,
  handle VARCHAR(160) NOT NULL,
  profile_url TEXT NOT NULL,
  confidence DECIMAL(5, 4) NOT NULL DEFAULT 0,
  raw_result JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sns_accounts_job
    FOREIGN KEY (collection_job_id) REFERENCES sns_collection_jobs(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sns_posts (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  sns_account_id CHAR(36) NOT NULL,
  post_url TEXT,
  content TEXT NOT NULL,
  published_at DATETIME,
  engagement JSON NOT NULL,
  raw_content JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sns_posts_account
    FOREIGN KEY (sns_account_id) REFERENCES sns_accounts(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS public_data_signals (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  collection_job_id CHAR(36) NOT NULL,
  signal_type VARCHAR(80) NOT NULL,
  signal_text TEXT NOT NULL,
  confidence DECIMAL(5, 4) NOT NULL DEFAULT 0,
  source_post_id CHAR(36),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_public_signals_job
    FOREIGN KEY (collection_job_id) REFERENCES sns_collection_jobs(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_public_signals_post
    FOREIGN KEY (source_post_id) REFERENCES sns_posts(id)
    ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS interview_sessions (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_profile_id CHAR(36) NOT NULL,
  collection_job_id CHAR(36),
  domain VARCHAR(120) NOT NULL DEFAULT 'finance_decision',
  status VARCHAR(40) NOT NULL DEFAULT 'in_progress',
  question_count INT NOT NULL,
  brainstormer_system_prompt TEXT NOT NULL,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_interview_question_count CHECK (question_count BETWEEN 1 AND 50),
  CONSTRAINT fk_interview_sessions_profile
    FOREIGN KEY (user_profile_id) REFERENCES user_profiles(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_interview_sessions_job
    FOREIGN KEY (collection_job_id) REFERENCES sns_collection_jobs(id)
    ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS interview_questions (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  interview_session_id CHAR(36) NOT NULL,
  question_order INT NOT NULL,
  question_type VARCHAR(40) NOT NULL,
  category VARCHAR(120) NOT NULL,
  question_text TEXT NOT NULL,
  options JSON NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_interview_question_order (interview_session_id, question_order),
  CONSTRAINT fk_interview_questions_session
    FOREIGN KEY (interview_session_id) REFERENCES interview_sessions(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS interview_answers (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  interview_question_id CHAR(36) NOT NULL,
  answer_text TEXT NOT NULL,
  selected_option_key VARCHAR(10),
  selected_option_text TEXT,
  is_other_answer BOOLEAN NOT NULL DEFAULT FALSE,
  needs_follow_up BOOLEAN NOT NULL DEFAULT FALSE,
  answered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_interview_answers_question
    FOREIGN KEY (interview_question_id) REFERENCES interview_questions(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS decision_criteria_summaries (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  interview_session_id CHAR(36) NOT NULL UNIQUE,
  role_summary TEXT NOT NULL,
  value_summary TEXT NOT NULL,
  redline_summary TEXT NOT NULL,
  priority_summary TEXT NOT NULL,
  communication_summary TEXT NOT NULL,
  one_sentence_system TEXT NOT NULL,
  needs_confirmation JSON NOT NULL,
  raw_summary JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_summaries_session
    FOREIGN KEY (interview_session_id) REFERENCES interview_sessions(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS pre_interview_contexts (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  interview_session_id CHAR(36) NOT NULL UNIQUE,
  schema_version VARCHAR(80) NOT NULL DEFAULT 'pre_interview_context.v2',
  target_role VARCHAR(80) NOT NULL DEFAULT 'CFO',
  communication_style JSON NOT NULL,
  context_json JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_pre_contexts_session
    FOREIGN KEY (interview_session_id) REFERENCES interview_sessions(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS deep_interview_results (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  interview_session_id CHAR(36) NOT NULL UNIQUE,
  question_axes JSON NOT NULL,
  answers_json JSON NOT NULL,
  result_json JSON NOT NULL,
  raw_result JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_deep_results_session
    FOREIGN KEY (interview_session_id) REFERENCES interview_sessions(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS advisor_core_instructions (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  summary_id CHAR(36) NOT NULL,
  instruction_order INT NOT NULL,
  instruction_text TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_core_instruction_order (summary_id, instruction_order),
  CONSTRAINT chk_instruction_order CHECK (instruction_order BETWEEN 1 AND 10),
  CONSTRAINT fk_core_instructions_summary
    FOREIGN KEY (summary_id) REFERENCES decision_criteria_summaries(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS decision_tree_templates (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  interview_session_id CHAR(36),
  name VARCHAR(160) NOT NULL,
  mermaid_source TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_tree_templates_session
    FOREIGN KEY (interview_session_id) REFERENCES interview_sessions(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS advisor_personas (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_profile_id CHAR(36) NOT NULL,
  interview_session_id CHAR(36),
  name VARCHAR(160) NOT NULL,
  role VARCHAR(80) NOT NULL DEFAULT '재무',
  badge VARCHAR(120),
  description TEXT,
  decision_style TEXT,
  advisor_prompt TEXT NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'training',
  core_values JSON NOT NULL,
  strengths JSON NOT NULL,
  weaknesses JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_advisor_personas_profile
    FOREIGN KEY (user_profile_id) REFERENCES user_profiles(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_advisor_personas_session
    FOREIGN KEY (interview_session_id) REFERENCES interview_sessions(id)
    ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS persona_prompts (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  advisor_persona_id CHAR(36),
  interview_session_id CHAR(36),
  role VARCHAR(80) NOT NULL DEFAULT '재무',
  title VARCHAR(180) NOT NULL,
  format VARCHAR(40) NOT NULL DEFAULT 'markdown',
  markdown_content LONGTEXT NOT NULL,
  raw_wrapper JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_persona_prompts_persona
    FOREIGN KEY (advisor_persona_id) REFERENCES advisor_personas(id)
    ON DELETE SET NULL,
  CONSTRAINT fk_persona_prompts_session
    FOREIGN KEY (interview_session_id) REFERENCES interview_sessions(id)
    ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS persona_chat_sessions (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  advisor_persona_id CHAR(36),
  persona_name VARCHAR(160) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_chat_sessions_persona
    FOREIGN KEY (advisor_persona_id) REFERENCES advisor_personas(id)
    ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS persona_chat_messages (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  chat_session_id CHAR(36) NOT NULL,
  sender VARCHAR(20) NOT NULL,
  message_text LONGTEXT NOT NULL,
  raw_message JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_chat_messages_session
    FOREIGN KEY (chat_session_id) REFERENCES persona_chat_sessions(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS past_decision_records (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_profile_id CHAR(36) NOT NULL,
  title TEXT NOT NULL,
  category VARCHAR(120),
  decision_date DATE,
  final_conclusion TEXT,
  recommendation TEXT,
  impact_score VARCHAR(40),
  raw_record JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_past_decisions_profile
    FOREIGN KEY (user_profile_id) REFERENCES user_profiles(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_user_profiles_user_id ON user_profiles(user_id);
CREATE INDEX idx_sns_collection_jobs_profile_id ON sns_collection_jobs(user_profile_id);
CREATE INDEX idx_sns_accounts_job_id ON sns_accounts(collection_job_id);
CREATE INDEX idx_sns_posts_account_id ON sns_posts(sns_account_id);
CREATE INDEX idx_public_data_signals_job_id ON public_data_signals(collection_job_id);
CREATE INDEX idx_interview_sessions_profile_id ON interview_sessions(user_profile_id);
CREATE INDEX idx_interview_questions_session_id ON interview_questions(interview_session_id);
CREATE INDEX idx_interview_answers_question_id ON interview_answers(interview_question_id);
CREATE INDEX idx_pre_interview_contexts_session_id ON pre_interview_contexts(interview_session_id);
CREATE INDEX idx_deep_interview_results_session_id ON deep_interview_results(interview_session_id);
CREATE INDEX idx_advisor_personas_profile_id ON advisor_personas(user_profile_id);
CREATE INDEX idx_persona_prompts_persona_id ON persona_prompts(advisor_persona_id);
CREATE INDEX idx_persona_prompts_session_id ON persona_prompts(interview_session_id);
CREATE INDEX idx_persona_chat_sessions_persona_id ON persona_chat_sessions(advisor_persona_id);
CREATE INDEX idx_persona_chat_messages_session_id ON persona_chat_messages(chat_session_id);
CREATE INDEX idx_past_decision_records_profile_id ON past_decision_records(user_profile_id);
