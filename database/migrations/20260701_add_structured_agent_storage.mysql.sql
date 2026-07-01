USE decision;

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

CREATE INDEX idx_pre_interview_contexts_session_id ON pre_interview_contexts(interview_session_id);
CREATE INDEX idx_deep_interview_results_session_id ON deep_interview_results(interview_session_id);
CREATE INDEX idx_persona_prompts_persona_id ON persona_prompts(advisor_persona_id);
CREATE INDEX idx_persona_prompts_session_id ON persona_prompts(interview_session_id);
CREATE INDEX idx_persona_chat_sessions_persona_id ON persona_chat_sessions(advisor_persona_id);
CREATE INDEX idx_persona_chat_messages_session_id ON persona_chat_messages(chat_session_id);
