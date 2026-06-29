-- PostgreSQL schema for the C-Level finance decision interview prototype.
-- Run once per database:
--   psql "$DATABASE_URL" -f database/schema.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(120) NOT NULL,
  industry VARCHAR(120) NOT NULL,
  company_name VARCHAR(160),
  company_size VARCHAR(80),
  finance_scope TEXT NOT NULL,
  raw_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sns_collection_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  input_sns_id VARCHAR(160) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'pending',
  discovery_tool VARCHAR(80) NOT NULL DEFAULT 'Sherlock',
  crawler_tool VARCHAR(80),
  target_platforms JSONB NOT NULL DEFAULT '[]'::jsonb,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sns_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_job_id UUID NOT NULL REFERENCES sns_collection_jobs(id) ON DELETE CASCADE,
  platform VARCHAR(80) NOT NULL,
  handle VARCHAR(160) NOT NULL,
  profile_url TEXT NOT NULL,
  confidence NUMERIC(5, 4) NOT NULL DEFAULT 0,
  raw_result JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sns_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sns_account_id UUID NOT NULL REFERENCES sns_accounts(id) ON DELETE CASCADE,
  post_url TEXT,
  content TEXT NOT NULL,
  published_at TIMESTAMPTZ,
  engagement JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_content JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public_data_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_job_id UUID NOT NULL REFERENCES sns_collection_jobs(id) ON DELETE CASCADE,
  signal_type VARCHAR(80) NOT NULL,
  signal_text TEXT NOT NULL,
  confidence NUMERIC(5, 4) NOT NULL DEFAULT 0,
  source_post_id UUID REFERENCES sns_posts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS interview_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  collection_job_id UUID REFERENCES sns_collection_jobs(id) ON DELETE SET NULL,
  domain VARCHAR(120) NOT NULL DEFAULT 'finance_decision',
  status VARCHAR(40) NOT NULL DEFAULT 'in_progress',
  question_count INTEGER NOT NULL CHECK (question_count BETWEEN 1 AND 50),
  brainstormer_system_prompt TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS interview_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_session_id UUID NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
  question_order INTEGER NOT NULL,
  question_type VARCHAR(40) NOT NULL,
  category VARCHAR(120) NOT NULL,
  question_text TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (interview_session_id, question_order)
);

CREATE TABLE IF NOT EXISTS interview_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_question_id UUID NOT NULL REFERENCES interview_questions(id) ON DELETE CASCADE,
  answer_text TEXT NOT NULL,
  selected_option_key VARCHAR(10),
  selected_option_text TEXT,
  is_other_answer BOOLEAN NOT NULL DEFAULT FALSE,
  needs_follow_up BOOLEAN NOT NULL DEFAULT FALSE,
  answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS decision_criteria_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_session_id UUID NOT NULL UNIQUE REFERENCES interview_sessions(id) ON DELETE CASCADE,
  role_summary TEXT NOT NULL,
  value_summary TEXT NOT NULL,
  redline_summary TEXT NOT NULL,
  priority_summary TEXT NOT NULL,
  communication_summary TEXT NOT NULL,
  one_sentence_system TEXT NOT NULL,
  needs_confirmation JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS advisor_core_instructions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  summary_id UUID NOT NULL REFERENCES decision_criteria_summaries(id) ON DELETE CASCADE,
  instruction_order INTEGER NOT NULL CHECK (instruction_order BETWEEN 1 AND 10),
  instruction_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (summary_id, instruction_order)
);

CREATE TABLE IF NOT EXISTS decision_tree_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_session_id UUID REFERENCES interview_sessions(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  mermaid_source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS advisor_personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  interview_session_id UUID REFERENCES interview_sessions(id) ON DELETE SET NULL,
  name VARCHAR(160) NOT NULL,
  role VARCHAR(80) NOT NULL DEFAULT '재무',
  badge VARCHAR(120),
  description TEXT,
  decision_style TEXT,
  advisor_prompt TEXT NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'training',
  core_values JSONB NOT NULL DEFAULT '[]'::jsonb,
  strengths JSONB NOT NULL DEFAULT '[]'::jsonb,
  weaknesses JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS past_decision_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category VARCHAR(120),
  decision_date DATE,
  final_conclusion TEXT,
  recommendation TEXT,
  impact_score VARCHAR(40),
  raw_record JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_sns_collection_jobs_profile_id ON sns_collection_jobs(user_profile_id);
CREATE INDEX IF NOT EXISTS idx_sns_accounts_job_id ON sns_accounts(collection_job_id);
CREATE INDEX IF NOT EXISTS idx_sns_posts_account_id ON sns_posts(sns_account_id);
CREATE INDEX IF NOT EXISTS idx_public_data_signals_job_id ON public_data_signals(collection_job_id);
CREATE INDEX IF NOT EXISTS idx_interview_sessions_profile_id ON interview_sessions(user_profile_id);
CREATE INDEX IF NOT EXISTS idx_interview_questions_session_id ON interview_questions(interview_session_id);
CREATE INDEX IF NOT EXISTS idx_interview_answers_question_id ON interview_answers(interview_question_id);
CREATE INDEX IF NOT EXISTS idx_advisor_personas_profile_id ON advisor_personas(user_profile_id);
CREATE INDEX IF NOT EXISTS idx_past_decision_records_profile_id ON past_decision_records(user_profile_id);
