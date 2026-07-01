import express from 'express';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { db, toJson } from './db';
import {
  generateAdvisorPrompt,
  generateDeepInterviewQuestions,
  generateFinalOutput,
  generatePersonaChatReply,
} from './agentService';
import {
  listPreInterviewContexts,
  loadPreInterviewContext,
  savePreInterviewContext,
} from './preInterviewContextStore';

const execFileAsync = promisify(execFile);

interface IdRow extends RowDataPacket {
  id: string;
}

interface UserProfilePayload {
  name: string;
  title: string;
  industry: string;
  companySize: string;
  companyName: string;
  snsId: string;
  financeScope: string;
}

interface PublicDataSnapshot {
  status: 'idle' | 'collected';
  accounts: {
    platform: string;
    handle: string;
    url: string;
    confidence: number;
  }[];
  signals: string[];
  posts: {
    platform: string;
    text: string;
    inferredSignal: string;
  }[];
}

interface SnsDiscoveryRequest {
  snsId: string;
  profile?: Partial<UserProfilePayload>;
}

interface ProfileIntakeRequest {
  profile: UserProfilePayload;
  publicData: PublicDataSnapshot;
  questionCount: number;
  brainstormerSystemPrompt: string;
}

interface HistoryRecordRequest {
  userProfileId: string;
  interviewSessionId?: string | null;
  finalOutput?: AgentFinalOutputPayload | null;
  deepInterviewAnswers?: string[];
  record: {
    id: string;
    date: string;
    question: string;
    category: string;
    finalConclusion: string;
    recommendation: string;
    impactScore: string;
    [key: string]: unknown;
  };
}

interface AgentFinalOutputPayload {
  fiveLayerSummary: {
    role: string;
    values: string;
    redLines: string;
    priorities: string;
    communicationFormat: string;
  };
  oneSentenceSystem: string;
  coreInstructions: string[];
  needsConfirmation: string[];
  personaPromptMarkdown?: string;
}

interface HistoryRecordRow extends RowDataPacket {
  id: string;
  user_profile_id: string;
  title: string;
  category: string | null;
  decision_date: string | Date | null;
  final_conclusion: string | null;
  recommendation: string | null;
  impact_score: 'High' | 'Medium' | 'Critical' | null;
  raw_record: unknown;
  created_at: string | Date;
}

interface HistorySnsAccountRow extends RowDataPacket {
  user_profile_id: string;
  platform: string;
  handle: string;
  profile_url: string;
  confidence: number | string;
}

interface HistorySnsPostRow extends RowDataPacket {
  user_profile_id: string;
  platform: string;
  content: string;
  raw_content: unknown;
}

interface HistorySnsSignalRow extends RowDataPacket {
  user_profile_id: string;
  signal_text: string;
}

interface PersonaPayload {
  id?: string;
  name: string;
  role: string;
  iconName?: string;
  badge?: string;
  description?: string;
  status?: 'active' | 'inactive' | 'training';
  createdAt?: string;
  updatedAt?: string;
  decisionStyle?: string;
  coreValues?: string[];
  strengths?: string[];
  weaknesses?: string[];
  communicationStyle?: string;
  sampleConversations?: {
    question: string;
    answer: string;
  }[];
  decisionPrompt?: string;
  colorClass?: string;
  bgClass?: string;
}

interface PersonaRow extends RowDataPacket {
  id: string;
  name: string;
  role: string;
  badge: string | null;
  description: string | null;
  decision_style: string | null;
  advisor_prompt: string | null;
  status: 'active' | 'inactive' | 'training';
  core_values: unknown;
  strengths: unknown;
  weaknesses: unknown;
  created_at: string | Date;
  updated_at: string | Date;
}

const app = express();
const port = Number(process.env.API_PORT ?? 4000);
const sherlockCliTimeoutSeconds = Number(process.env.SHERLOCK_SITE_TIMEOUT_SECONDS ?? 5);
const sherlockProcessTimeoutMs = Number(process.env.SHERLOCK_PROCESS_TIMEOUT_MS ?? 20000);
const preInterviewContextStorageDir = path.resolve(process.cwd(), 'local-data/preinterview-contexts');

const referenceTargetPlatformLabels = ['LinkedIn', 'X', 'Threads', 'Naver Blog', 'Tistory'];
const sherlockSupportedTargetSites = ['LinkedIn', 'Twitter', 'threads', 'Naver'];
const sherlockTargetArgs = sherlockSupportedTargetSites.flatMap((site) => ['--site', site]);
const fallbackSherlockCommand = '/Users/choijisoo/.local/bin/sherlock';

const normalizeSnsId = (value: string) => value.trim().replace(/^@+/, '');

const parseJsonValue = <T>(value: unknown, fallback: T): T => {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
};

const formatDateValue = (value: string | Date) => {
  if (value instanceof Date) return value.toISOString().slice(0, 10).replace(/-/g, '.');
  return String(value).slice(0, 10).replace(/-/g, '.');
};

const buildAdvisorPrompt = (persona: PersonaPayload) => `You are ${persona.name}, an AI advisor persona.

Role: ${persona.role}
Badge: ${persona.badge || '신규 참모'}
Decision style: ${persona.decisionStyle || '확인 필요'}
Description: ${persona.description || '확인 필요'}
Core values: ${(persona.coreValues ?? []).join(', ') || '확인 필요'}

Always respond with a clear recommendation, decision criteria, risk, and next action.`;

const buildDeepInterviewResult = (answers: string[], record: HistoryRecordRequest['record']) => {
  const timeline = Array.isArray(record.timeline) ? record.timeline : [];
  const entries = answers.map((answer, index) => {
    const timelineEntry = timeline[index] as { content?: string } | undefined;
    const content = timelineEntry?.content ?? '';
    const [questionLine = `심층 인터뷰 질문 ${index + 1}`] = content.split('\n');

    return {
      question: questionLine.replace(/^.*?·\s*/, '').trim(),
      answer,
      derived_rule: 'prototype_unclassified',
      evidence: {
        source: 'deep_interview_answer',
        index: index + 1,
      },
    };
  });

  return {
    identity: entries.filter((_, index) => index % 2 === 0),
    cross_dimension: entries.filter((_, index) => index % 2 === 1),
    status: 'prototype_structured_from_transcript',
  };
};

const saveStructuredInterviewArtifacts = async ({
  interviewSessionId,
  finalOutput,
  deepInterviewAnswers,
  record,
}: {
  interviewSessionId: string;
  finalOutput: AgentFinalOutputPayload;
  deepInterviewAnswers: string[];
  record: HistoryRecordRequest['record'];
}) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    await connection.execute(
      `
        UPDATE interview_sessions
        SET status = 'completed',
            completed_at = COALESCE(completed_at, NOW())
        WHERE id = :interviewSessionId
      `,
      { interviewSessionId },
    );

    if (record.preInterviewContext) {
      const context = record.preInterviewContext as {
        meta?: { schema_version?: string; target_role?: string };
        communication_style?: unknown;
      };

      await connection.execute(
        `
          INSERT INTO pre_interview_contexts (
            interview_session_id,
            schema_version,
            target_role,
            communication_style,
            context_json
          )
          VALUES (
            :interviewSessionId,
            :schemaVersion,
            :targetRole,
            CAST(:communicationStyle AS JSON),
            CAST(:contextJson AS JSON)
          )
          ON DUPLICATE KEY UPDATE
            schema_version = VALUES(schema_version),
            target_role = VALUES(target_role),
            communication_style = VALUES(communication_style),
            context_json = VALUES(context_json),
            updated_at = NOW()
        `,
        {
          interviewSessionId,
          schemaVersion: context.meta?.schema_version ?? 'pre_interview_context.v2',
          targetRole: context.meta?.target_role ?? 'CFO',
          communicationStyle: toJson(context.communication_style ?? {}),
          contextJson: toJson(record.preInterviewContext),
        },
      );
    }

    const deepResult = buildDeepInterviewResult(deepInterviewAnswers, record);
    await connection.execute(
      `
        INSERT INTO deep_interview_results (
          interview_session_id,
          question_axes,
          answers_json,
          result_json,
          raw_result
        )
        VALUES (
          :interviewSessionId,
          CAST(:questionAxes AS JSON),
          CAST(:answersJson AS JSON),
          CAST(:resultJson AS JSON),
          CAST(:rawResult AS JSON)
        )
        ON DUPLICATE KEY UPDATE
          question_axes = VALUES(question_axes),
          answers_json = VALUES(answers_json),
          result_json = VALUES(result_json),
          raw_result = VALUES(raw_result),
          updated_at = NOW()
      `,
      {
        interviewSessionId,
        questionAxes: toJson(['identity', 'cross_dimension']),
        answersJson: toJson(deepInterviewAnswers),
        resultJson: toJson(deepResult),
        rawResult: toJson({ answers: deepInterviewAnswers, timeline: record.timeline ?? [] }),
      },
    );

    await connection.execute(
      `
        INSERT INTO decision_criteria_summaries (
          interview_session_id,
          role_summary,
          value_summary,
          redline_summary,
          priority_summary,
          communication_summary,
          one_sentence_system,
          needs_confirmation,
          raw_summary
        )
        VALUES (
          :interviewSessionId,
          :roleSummary,
          :valueSummary,
          :redlineSummary,
          :prioritySummary,
          :communicationSummary,
          :oneSentenceSystem,
          CAST(:needsConfirmation AS JSON),
          CAST(:rawSummary AS JSON)
        )
        ON DUPLICATE KEY UPDATE
          role_summary = VALUES(role_summary),
          value_summary = VALUES(value_summary),
          redline_summary = VALUES(redline_summary),
          priority_summary = VALUES(priority_summary),
          communication_summary = VALUES(communication_summary),
          one_sentence_system = VALUES(one_sentence_system),
          needs_confirmation = VALUES(needs_confirmation),
          raw_summary = VALUES(raw_summary),
          updated_at = NOW()
      `,
      {
        interviewSessionId,
        roleSummary: finalOutput.fiveLayerSummary.role,
        valueSummary: finalOutput.fiveLayerSummary.values,
        redlineSummary: finalOutput.fiveLayerSummary.redLines,
        prioritySummary: finalOutput.fiveLayerSummary.priorities,
        communicationSummary: finalOutput.fiveLayerSummary.communicationFormat,
        oneSentenceSystem: finalOutput.oneSentenceSystem,
        needsConfirmation: toJson(finalOutput.needsConfirmation ?? []),
        rawSummary: toJson(finalOutput),
      },
    );

    const [summaryRows] = await connection.execute<IdRow[]>(
      `
        SELECT id
        FROM decision_criteria_summaries
        WHERE interview_session_id = :interviewSessionId
        LIMIT 1
      `,
      { interviewSessionId },
    );
    const summaryId = summaryRows[0]?.id;

    if (summaryId) {
      await connection.execute(
        `
          DELETE FROM advisor_core_instructions
          WHERE summary_id = :summaryId
        `,
        { summaryId },
      );

      for (const [index, instruction] of (finalOutput.coreInstructions ?? []).entries()) {
        await connection.execute(
          `
            INSERT INTO advisor_core_instructions (
              summary_id,
              instruction_order,
              instruction_text
            )
            VALUES (
              :summaryId,
              :instructionOrder,
              :instructionText
            )
          `,
          {
            summaryId,
            instructionOrder: index + 1,
            instructionText: instruction,
          },
        );
      }
    }

    if (finalOutput.personaPromptMarkdown?.trim()) {
      await connection.execute(
        `
          INSERT INTO persona_prompts (
            advisor_persona_id,
            interview_session_id,
            role,
            title,
            format,
            markdown_content,
            raw_wrapper
          )
          VALUES (
            NULL,
            :interviewSessionId,
            '재무',
            'CFO Decision Persona Prompt',
            'markdown',
            :markdownContent,
            CAST(:rawWrapper AS JSON)
          )
        `,
        {
          interviewSessionId,
          markdownContent: finalOutput.personaPromptMarkdown,
          rawWrapper: toJson({
            title: 'CFO Decision Persona Prompt',
            format: 'markdown',
            markdown: finalOutput.personaPromptMarkdown,
            source: {
              interview_session_id: interviewSessionId,
            },
          }),
        },
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const personaRowToPayload = (row: PersonaRow): PersonaPayload => ({
  id: row.id,
  name: row.name,
  role: row.role,
  iconName: 'Sparkles',
  badge: row.badge ?? '신규 참모',
  description: row.description ?? '',
  status: row.status ?? 'active',
  createdAt: formatDateValue(row.created_at),
  updatedAt: formatDateValue(row.updated_at),
  decisionStyle: row.decision_style ?? '',
  coreValues: parseJsonValue<string[]>(row.core_values, []),
  strengths: parseJsonValue<string[]>(row.strengths, []),
  weaknesses: parseJsonValue<string[]>(row.weaknesses, []),
  communicationStyle: '결론을 먼저 간결하게 제시하며 정량적 가이드라인을 동반합니다.',
  sampleConversations: [
    {
      question: '이 안건의 핵심 판단 기준은 무엇인가요?',
      answer: `${row.name} 관점에서는 ${row.decision_style || '정의된 의사결정 스타일'}을 기준으로 리스크와 다음 액션을 먼저 확인해야 합니다.`,
    },
  ],
  decisionPrompt: row.advisor_prompt ?? '',
  colorClass: 'text-violet-600 dark:text-violet-400',
  bgClass: 'bg-violet-50 dark:bg-violet-950/40 border-violet-200 dark:border-violet-800',
});

const ensureManualPersonaProfile = async () => {
  const [existingProfileRows] = await db.execute<IdRow[]>(
    `
      SELECT profiles.id
      FROM user_profiles profiles
      JOIN users ON users.id = profiles.user_id
      WHERE users.email = 'manual-persona@local'
      ORDER BY profiles.created_at ASC
      LIMIT 1
    `,
  );

  if (existingProfileRows[0]?.id) return existingProfileRows[0].id;

  await db.execute(
    `
      INSERT INTO users (name, email)
      VALUES ('Manual Persona User', 'manual-persona@local')
      ON DUPLICATE KEY UPDATE updated_at = NOW()
    `,
  );

  const [userRows] = await db.execute<IdRow[]>(
    `
      SELECT id
      FROM users
      WHERE email = 'manual-persona@local'
      LIMIT 1
    `,
  );
  const userId = userRows[0]?.id;
  if (!userId) throw new Error('Failed to create manual persona user');

  await db.execute(
    `
      INSERT INTO user_profiles (
        user_id,
        title,
        industry,
        company_name,
        company_size,
        finance_scope,
        raw_profile
      )
      VALUES (
        :userId,
        'Manual Persona',
        'Prototype',
        'Manual',
        'N/A',
        '페르소나 직접 생성',
        CAST(:rawProfile AS JSON)
      )
    `,
    {
      userId,
      rawProfile: toJson({ source: 'manual_persona' }),
    },
  );

  const [profileRows] = await db.execute<IdRow[]>(
    `
      SELECT id
      FROM user_profiles
      WHERE user_id = :userId
      ORDER BY created_at DESC
      LIMIT 1
    `,
    { userId },
  );

  if (!profileRows[0]?.id) throw new Error('Failed to create manual persona profile');
  return profileRows[0].id;
};

const inferPlatformFromUrl = (url: string, fallback: string) => {
  const lowerUrl = url.toLowerCase();
  const lowerFallback = fallback.toLowerCase();

  if (lowerUrl.includes('linkedin.com') || lowerFallback.includes('linkedin')) return 'LinkedIn';
  if (lowerUrl.includes('twitter.com') || lowerUrl.includes('x.com') || lowerFallback === 'x') return 'X';
  if (lowerUrl.includes('threads.net') || lowerFallback.includes('thread')) return 'Threads';
  if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be') || lowerFallback.includes('youtube')) return 'YouTube';
  if (lowerUrl.includes('blog.naver.com') || lowerFallback.includes('naver')) return 'Naver Blog';
  if (lowerUrl.includes('tistory.com') || lowerFallback.includes('tistory')) return 'Tistory';
  return fallback;
};

const parseSherlockOutput = (stdout: string, username: string) => {
  const accounts: PublicDataSnapshot['accounts'] = [];
  const lines = stdout.split(/\r?\n/);

  for (const line of lines) {
    const match = line.match(/\[\+\]\s*([^:]+):\s*(https?:\/\/\S+)/);
    if (!match) continue;

    const platform = inferPlatformFromUrl(match[2], match[1].trim());

    accounts.push({
      platform,
      handle: `@${username}`,
      url: match[2].trim(),
      confidence: 0.72,
    });
  }

  const unique = new Map(accounts.map((account) => [`${account.platform}:${account.url}`, account]));
  return Array.from(unique.values());
};

const runSherlockDiscovery = async (username: string) => {
  const args = [
    username,
    ...sherlockTargetArgs,
    '--print-found',
    '--no-color',
    '--no-txt',
    '--timeout',
    String(sherlockCliTimeoutSeconds),
  ];
  const configuredCommand = process.env.SHERLOCK_COMMAND ?? fallbackSherlockCommand;
  const commandCandidates = Array.from(new Set([configuredCommand, fallbackSherlockCommand, 'sherlock']));

  try {
    let lastError: unknown = null;

    for (const command of commandCandidates) {
      try {
        const { stdout } = await execFileAsync(command, args, {
          cwd: tmpdir(),
          timeout: sherlockProcessTimeoutMs,
          maxBuffer: 1024 * 1024,
        });

        return parseSherlockOutput(stdout, username);
      } catch (error) {
        const code = (error as { code?: unknown }).code;
        lastError = error;

        if (code !== 'ENOENT') {
          throw error;
        }
      }
    }

    throw lastError;
  } catch (error) {
    const stdout = typeof (error as { stdout?: unknown }).stdout === 'string'
      ? (error as { stdout: string }).stdout
      : '';
    const partialAccounts = stdout ? parseSherlockOutput(stdout, username) : [];

    if (partialAccounts.length) {
      return partialAccounts;
    }

    throw error;
  }
};

const buildDiscoveryFallback = (username: string, reason: string): PublicDataSnapshot => ({
  status: 'collected',
  accounts: [],
  signals: [
    `Sherlock 실행 결과를 확인하지 못했습니다: ${reason}`,
    `SNS ID @${username} 기준 공개 계정 탐색은 확인 필요 상태입니다.`,
    '이 신호는 분석 AI에 사실이 아닌 결측/확인 필요 데이터로 전달됩니다.',
  ],
  posts: [],
});

const buildNormalizedSignals = (
  username: string,
  accounts: PublicDataSnapshot['accounts'],
  profile?: Partial<UserProfilePayload>,
) => {
  if (!accounts.length) {
    return [
      `@${username}와 일치하는 타겟 SNS 계정 후보는 아직 확인되지 않았습니다.`,
      `탐색 대상: ${referenceTargetPlatformLabels.join(', ')}`,
      'Tistory는 Sherlock 기본 사이트 목록에 없어 FireCrawl/Crawl4AI 단계에서 별도 확인이 필요합니다.',
      '계정 소유 여부와 공개 게시글 수집 가능성은 확인 필요입니다.',
    ];
  }

  return [
    `Sherlock이 @${username} 기준 타겟 SNS 계정 후보 ${accounts.length}개를 찾았습니다.`,
    `발견 플랫폼: ${accounts.map((account) => account.platform).join(', ')}`,
    `탐색 대상: ${referenceTargetPlatformLabels.join(', ')}`,
    'Tistory는 Sherlock 기본 사이트 목록에 없어 FireCrawl/Crawl4AI 단계에서 별도 확인이 필요합니다.',
    `${profile?.industry || '업종 미입력'} 맥락에서 공개 글 수집 후 재무/리스크 언어를 분석해야 합니다.`,
    'Sherlock 결과는 계정 존재 후보이며 본인 소유는 별도 검증이 필요합니다.',
  ];
};

const buildCrawlerDocuments = (
  username: string,
  accounts: PublicDataSnapshot['accounts'],
): PublicDataSnapshot['posts'] => {
  if (!accounts.length) return [];

  return accounts.slice(0, 5).map((account) => ({
    platform: account.platform,
    text: `${account.platform} 계정 후보 ${account.url} 발견. 게시글 본문 수집은 FireCrawl 또는 Crawl4AI 연동 후 수행됩니다.`,
    inferredSignal: `account_candidate:${username}`,
  }));
};

app.use(express.json({ limit: '2mb' }));

app.use((_, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  next();
});

app.options('*', (_, res) => {
  res.sendStatus(204);
});

app.get('/api/health', async (_, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ ok: true, database: 'connected' });
  } catch (error) {
    res.status(500).json({
      ok: false,
      database: 'disconnected',
      message: error instanceof Error ? error.message : 'Unknown database error',
    });
  }
});

app.get('/api/preinterview-contexts', async (_, res) => {
  try {
    const contexts = await listPreInterviewContexts(preInterviewContextStorageDir);
    res.json({ ok: true, contexts });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Failed to list pre-interview contexts',
    });
  }
});

app.post('/api/preinterview-contexts', async (req, res) => {
  const { context, profileName } = req.body as {
    context?: unknown;
    profileName?: string;
  };

  if (!context || typeof context !== 'object') {
    res.status(400).json({ ok: false, message: 'context is required' });
    return;
  }

  try {
    const saved = await savePreInterviewContext({
      context: context as Parameters<typeof savePreInterviewContext>[0]['context'],
      profileName,
      storageDir: preInterviewContextStorageDir,
    });

    res.status(201).json({ ok: true, context: saved });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Failed to save pre-interview context',
    });
  }
});

app.get('/api/preinterview-contexts/:id', async (req, res) => {
  try {
    const stored = await loadPreInterviewContext(req.params.id, preInterviewContextStorageDir);
    res.json({ ok: true, context: stored });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load pre-interview context';
    const status = message.includes('Invalid pre-interview context id') ? 400 : 404;
    res.status(status).json({ ok: false, message });
  }
});

app.get('/api/personas', async (_, res) => {
  try {
    const [rows] = await db.execute<PersonaRow[]>(
      `
        SELECT
          id,
          name,
          role,
          badge,
          description,
          decision_style,
          advisor_prompt,
          status,
          core_values,
          strengths,
          weaknesses,
          created_at,
          updated_at
        FROM advisor_personas
        ORDER BY created_at DESC
        LIMIT 100
      `,
    );

    res.json({
      ok: true,
      personas: rows.map(personaRowToPayload),
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown personas fetch error',
    });
  }
});

app.post('/api/personas', async (req, res) => {
  const persona = req.body as PersonaPayload;

  if (!persona?.name?.trim()) {
    res.status(400).json({ ok: false, message: 'name is required' });
    return;
  }

  try {
    const userProfileId = await ensureManualPersonaProfile();
    const advisorPrompt = persona.decisionPrompt || await generateAdvisorPrompt({
      name: persona.name,
      role: persona.role,
      badge: persona.badge,
      description: persona.description,
      decisionStyle: persona.decisionStyle,
      coreValues: persona.coreValues,
    });

    await db.execute(
      `
        INSERT INTO advisor_personas (
          user_profile_id,
          interview_session_id,
          name,
          role,
          badge,
          description,
          decision_style,
          advisor_prompt,
          status,
          core_values,
          strengths,
          weaknesses
        )
        VALUES (
          :userProfileId,
          NULL,
          :name,
          :role,
          :badge,
          :description,
          :decisionStyle,
          :advisorPrompt,
          :status,
          CAST(:coreValues AS JSON),
          CAST(:strengths AS JSON),
          CAST(:weaknesses AS JSON)
        )
      `,
      {
        userProfileId,
        name: persona.name.trim(),
        role: persona.role || '재무',
        badge: persona.badge || '신규 참모',
        description: persona.description || '',
        decisionStyle: persona.decisionStyle || '',
        advisorPrompt,
        status: persona.status || 'active',
        coreValues: toJson(persona.coreValues ?? []),
        strengths: toJson(persona.strengths ?? []),
        weaknesses: toJson(persona.weaknesses ?? []),
      },
    );

    const [rows] = await db.execute<PersonaRow[]>(
      `
        SELECT
          id,
          name,
          role,
          badge,
          description,
          decision_style,
          advisor_prompt,
          status,
          core_values,
          strengths,
          weaknesses,
          created_at,
          updated_at
        FROM advisor_personas
        WHERE user_profile_id = :userProfileId
        ORDER BY created_at DESC
        LIMIT 1
      `,
      { userProfileId },
    );

    if (!rows[0]) throw new Error('Failed to create persona');

    if (advisorPrompt.trim()) {
      await db.execute(
        `
          INSERT INTO persona_prompts (
            advisor_persona_id,
            interview_session_id,
            role,
            title,
            format,
            markdown_content,
            raw_wrapper
          )
          VALUES (
            :advisorPersonaId,
            NULL,
            :role,
            :title,
            'markdown',
            :markdownContent,
            CAST(:rawWrapper AS JSON)
          )
        `,
        {
          advisorPersonaId: rows[0].id,
          role: persona.role || '재무',
          title: `${persona.name.trim()} Persona Prompt`,
          markdownContent: advisorPrompt,
          rawWrapper: toJson({
            title: `${persona.name.trim()} Persona Prompt`,
            format: 'markdown',
            markdown: advisorPrompt,
            source: {
              advisor_persona_id: rows[0].id,
              origin: 'persona_create_api',
            },
          }),
        },
      );
    }

    res.status(201).json({
      ok: true,
      persona: personaRowToPayload(rows[0]),
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown persona save error',
    });
  }
});

app.delete('/api/personas/:id', async (req, res) => {
  try {
    const [result] = await db.execute<ResultSetHeader>(
      `
        DELETE FROM advisor_personas
        WHERE id = :id
      `,
      { id: req.params.id },
    );

    res.json({ ok: true, deleted: result.affectedRows });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown persona delete error',
    });
  }
});

app.post('/api/agent/deep-questions', async (req, res) => {
  const { profile, publicData, preInterviewContext } = req.body as {
    profile: UserProfilePayload;
    publicData: PublicDataSnapshot;
    preInterviewContext: Record<string, Record<string, { question: string; answer: string }>>;
  };

  if (!preInterviewContext || !Object.keys(preInterviewContext).length) {
    res.status(400).json({ ok: false, message: 'preInterviewContext is required' });
    return;
  }

  try {
    const questions = await generateDeepInterviewQuestions(profile, publicData, preInterviewContext);
    res.json({ ok: true, questions });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown agent deep question error',
    });
  }
});

app.post('/api/agent/final-output', async (req, res) => {
  const { profile, answers, publicData, preInterviewContext } = req.body as {
    profile: UserProfilePayload;
    answers: string[];
    publicData: PublicDataSnapshot;
    preInterviewContext: Record<string, Record<string, { question: string; answer: string }>> | null;
  };

  if (!Array.isArray(answers)) {
    res.status(400).json({ ok: false, message: 'answers are required' });
    return;
  }

  try {
    const finalOutput = await generateFinalOutput(profile, answers, publicData, preInterviewContext);
    res.json({ ok: true, finalOutput });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown agent final output error',
    });
  }
});

app.post('/api/agent/persona-chat', async (req, res) => {
  const { persona, message, recentMessages, chatSessionId } = req.body as {
    persona?: PersonaPayload;
    message?: string;
    chatSessionId?: string | null;
    recentMessages?: {
      sender: 'ai' | 'user';
      text: string;
    }[];
  };

  if (!persona?.name?.trim() || !message?.trim()) {
    res.status(400).json({ ok: false, message: 'persona.name and message are required' });
    return;
  }

  try {
    let activeChatSessionId = chatSessionId ?? null;

    if (!activeChatSessionId) {
      await db.execute(
        `
          INSERT INTO persona_chat_sessions (
            advisor_persona_id,
            persona_name,
            status
          )
          VALUES (
            :advisorPersonaId,
            :personaName,
            'active'
          )
        `,
        {
          advisorPersonaId: persona.id && !persona.id.startsWith('p-') ? persona.id : null,
          personaName: persona.name,
        },
      );

      const [sessionRows] = await db.execute<IdRow[]>(
        `
          SELECT id
          FROM persona_chat_sessions
          WHERE persona_name = :personaName
          ORDER BY created_at DESC
          LIMIT 1
        `,
        { personaName: persona.name },
      );
      activeChatSessionId = sessionRows[0]?.id ?? null;
    }

    const reply = await generatePersonaChatReply({
      name: persona.name,
      role: persona.role,
      badge: persona.badge,
      description: persona.description,
      decisionStyle: persona.decisionStyle,
      coreValues: persona.coreValues,
      strengths: persona.strengths,
      weaknesses: persona.weaknesses,
      communicationStyle: persona.communicationStyle,
      decisionPrompt: persona.decisionPrompt,
      userMessage: message,
      recentMessages,
    });

    if (activeChatSessionId) {
      await db.execute(
        `
          INSERT INTO persona_chat_messages (
            chat_session_id,
            sender,
            message_text,
            raw_message
          )
          VALUES
            (
              :chatSessionId,
              'user',
              :userMessage,
              CAST(:rawUserMessage AS JSON)
            ),
            (
              :chatSessionId,
              'ai',
              :replyMessage,
              CAST(:rawReplyMessage AS JSON)
            )
        `,
        {
          chatSessionId: activeChatSessionId,
          userMessage: message,
          rawUserMessage: toJson({ sender: 'user', text: message }),
          replyMessage: reply,
          rawReplyMessage: toJson({ sender: 'ai', text: reply, personaId: persona.id ?? null }),
        },
      );

      await db.execute(
        `
          UPDATE persona_chat_sessions
          SET updated_at = NOW()
          WHERE id = :chatSessionId
        `,
        { chatSessionId: activeChatSessionId },
      );
    }

    res.json({ ok: true, reply, chatSessionId: activeChatSessionId });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown persona chat error',
    });
  }
});

app.post('/api/sns-discovery', async (req, res) => {
  const { snsId, profile } = req.body as SnsDiscoveryRequest;
  const username = normalizeSnsId(snsId ?? '');

  if (!username) {
    res.status(400).json({ ok: false, message: 'snsId is required' });
    return;
  }

  try {
    const accounts = await runSherlockDiscovery(username);
    const snapshot: PublicDataSnapshot = {
      status: 'collected',
      accounts,
      signals: buildNormalizedSignals(username, accounts, profile),
      posts: buildCrawlerDocuments(username, accounts),
    };

    res.json({
      ok: true,
      input: {
        userId: username,
        platformScope: 'targeted_sns_sites',
        referenceTargetPlatforms: referenceTargetPlatformLabels,
        sherlockSites: sherlockSupportedTargetSites,
      },
      discovery: {
        tool: 'Sherlock',
        mode: 'cli',
        accounts,
      },
      crawl: {
        tool: process.env.FIRECRAWL_API_KEY ? 'FireCrawl' : 'FireCrawl/Crawl4AI pending',
        status: process.env.FIRECRAWL_API_KEY ? 'ready' : 'not_configured',
        documents: snapshot.posts,
      },
      normalizedSignals: snapshot.signals,
      analysisInput: {
        summary: snapshot.signals.join(' '),
        evidence: snapshot.posts.map((post) => ({
          source: post.platform,
          quote: post.text,
          signal: post.inferredSignal,
        })),
      },
      publicData: snapshot,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown Sherlock execution error';
    const snapshot = buildDiscoveryFallback(username, reason);

    res.json({
      ok: true,
      warning: 'sherlock_unavailable',
      input: {
        userId: username,
        platformScope: 'targeted_sns_sites',
        referenceTargetPlatforms: referenceTargetPlatformLabels,
        sherlockSites: sherlockSupportedTargetSites,
      },
      discovery: {
        tool: 'Sherlock',
        mode: 'cli',
        accounts: [],
        error: reason,
      },
      crawl: {
        tool: 'FireCrawl/Crawl4AI pending',
        status: 'skipped',
        documents: [],
      },
      normalizedSignals: snapshot.signals,
      analysisInput: {
        summary: snapshot.signals.join(' '),
        evidence: [],
      },
      publicData: snapshot,
    });
  }
});

app.post('/api/profile-intake', async (req, res) => {
  const { profile, publicData, questionCount, brainstormerSystemPrompt } = req.body as ProfileIntakeRequest;

  if (!profile?.name?.trim()) {
    res.status(400).json({ ok: false, message: 'name is required' });
    return;
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [userResult] = await connection.execute<ResultSetHeader>(
      `
        INSERT INTO users (name, email)
        VALUES (:name, NULL)
      `,
      { name: profile.name.trim() },
    );

    const [userRow] = await connection.execute<IdRow[]>(
      `
        SELECT id
        FROM users
        WHERE name = :name
        ORDER BY created_at DESC
        LIMIT 1
      `,
      { name: profile.name.trim() },
    );
    const userId = userRow[0]?.id;

    if (!userId || userResult.affectedRows !== 1) {
      throw new Error('Failed to create user');
    }

    await connection.execute(
      `
        INSERT INTO user_profiles (
          user_id,
          title,
          industry,
          company_name,
          company_size,
          finance_scope,
          raw_profile
        )
        VALUES (
          :userId,
          :title,
          :industry,
          :companyName,
          :companySize,
          :financeScope,
          CAST(:rawProfile AS JSON)
        )
      `,
      {
        userId,
        title: profile.title,
        industry: profile.industry,
        companyName: profile.companyName || null,
        companySize: profile.companySize || null,
        financeScope: profile.financeScope,
        rawProfile: toJson(profile),
      },
    );

    const [profileRow] = await connection.execute<IdRow[]>(
      `
        SELECT id
        FROM user_profiles
        WHERE user_id = :userId
        ORDER BY created_at DESC
        LIMIT 1
      `,
      { userId },
    );
    const userProfileId = profileRow[0]?.id;

    if (!userProfileId) {
      throw new Error('Failed to create user profile');
    }

    await connection.execute(
      `
        INSERT INTO sns_collection_jobs (
          user_profile_id,
          input_sns_id,
          status,
          discovery_tool,
          crawler_tool,
          target_platforms,
          started_at,
          completed_at
        )
        VALUES (
          :userProfileId,
          :snsId,
          'completed',
          'Sherlock',
          'mock_public_data_snapshot',
          CAST(:targetPlatforms AS JSON),
          NOW(),
          NOW()
        )
      `,
      {
        userProfileId,
        snsId: profile.snsId || '@unknown',
        targetPlatforms: toJson({
          scope: 'targeted_sns_sites',
          referenceTargets: referenceTargetPlatformLabels,
          sherlockSites: sherlockSupportedTargetSites,
        }),
      },
    );

    const [jobRow] = await connection.execute<IdRow[]>(
      `
        SELECT id
        FROM sns_collection_jobs
        WHERE user_profile_id = :userProfileId
        ORDER BY created_at DESC
        LIMIT 1
      `,
      { userProfileId },
    );
    const collectionJobId = jobRow[0]?.id;

    if (!collectionJobId) {
      throw new Error('Failed to create SNS collection job');
    }

    const accountIdsByPlatform = new Map<string, string>();

    for (const account of publicData.accounts ?? []) {
      await connection.execute(
        `
          INSERT INTO sns_accounts (
            collection_job_id,
            platform,
            handle,
            profile_url,
            confidence,
            raw_result
          )
          VALUES (
            :collectionJobId,
            :platform,
            :handle,
            :profileUrl,
            :confidence,
            CAST(:rawResult AS JSON)
          )
        `,
        {
          collectionJobId,
          platform: account.platform,
          handle: account.handle,
          profileUrl: account.url,
          confidence: account.confidence,
          rawResult: toJson(account),
        },
      );

      const [accountRow] = await connection.execute<IdRow[]>(
        `
          SELECT id
          FROM sns_accounts
          WHERE collection_job_id = :collectionJobId
            AND platform = :platform
            AND profile_url = :profileUrl
          ORDER BY created_at DESC
          LIMIT 1
        `,
        {
          collectionJobId,
          platform: account.platform,
          profileUrl: account.url,
        },
      );

      if (accountRow[0]?.id) {
        accountIdsByPlatform.set(account.platform, accountRow[0].id);
      }
    }

    for (const post of publicData.posts ?? []) {
      const snsAccountId = accountIdsByPlatform.get(post.platform);
      if (!snsAccountId) continue;

      await connection.execute(
        `
          INSERT INTO sns_posts (
            sns_account_id,
            post_url,
            content,
            published_at,
            engagement,
            raw_content
          )
          VALUES (
            :snsAccountId,
            NULL,
            :content,
            NULL,
            CAST(:engagement AS JSON),
            CAST(:rawContent AS JSON)
          )
        `,
        {
          snsAccountId,
          content: post.text,
          engagement: toJson({}),
          rawContent: toJson(post),
        },
      );
    }

    for (const signal of publicData.signals ?? []) {
      await connection.execute(
        `
          INSERT INTO public_data_signals (
            collection_job_id,
            signal_type,
            signal_text,
            confidence
          )
          VALUES (
            :collectionJobId,
            'profile_context',
            :signalText,
            0.65
          )
        `,
        { collectionJobId, signalText: signal },
      );
    }

    await connection.execute(
      `
        INSERT INTO interview_sessions (
          user_profile_id,
          collection_job_id,
          domain,
          status,
          question_count,
          brainstormer_system_prompt
        )
        VALUES (
          :userProfileId,
          :collectionJobId,
          'finance_decision',
          'in_progress',
          :questionCount,
          :brainstormerSystemPrompt
        )
      `,
      {
        userProfileId,
        collectionJobId,
        questionCount,
        brainstormerSystemPrompt,
      },
    );

    const [sessionRow] = await connection.execute<IdRow[]>(
      `
        SELECT id
        FROM interview_sessions
        WHERE user_profile_id = :userProfileId
        ORDER BY created_at DESC
        LIMIT 1
      `,
      { userProfileId },
    );

    await connection.commit();

    res.json({
      ok: true,
      ids: {
        userId,
        userProfileId,
        collectionJobId,
        interviewSessionId: sessionRow[0]?.id ?? null,
      },
    });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown profile intake error',
    });
  } finally {
    connection.release();
  }
});

app.post('/api/history-records', async (req, res) => {
  const { userProfileId, interviewSessionId, finalOutput, deepInterviewAnswers = [], record } = req.body as HistoryRecordRequest;

  if (!userProfileId || !record?.question) {
    res.status(400).json({ ok: false, message: 'userProfileId and record.question are required' });
    return;
  }

  try {
    await db.execute(
      `
        INSERT INTO past_decision_records (
          user_profile_id,
          title,
          category,
          decision_date,
          final_conclusion,
          recommendation,
          impact_score,
          raw_record
        )
        VALUES (
          :userProfileId,
          :title,
          :category,
          :decisionDate,
          :finalConclusion,
          :recommendation,
          :impactScore,
          CAST(:rawRecord AS JSON)
        )
      `,
      {
        userProfileId,
        title: record.question,
        category: record.category ?? null,
        decisionDate: record.date?.replace(/\./g, '-') || null,
        finalConclusion: record.finalConclusion ?? null,
        recommendation: record.recommendation ?? null,
        impactScore: record.impactScore ?? null,
        rawRecord: toJson(record),
      },
    );

    if (interviewSessionId && finalOutput) {
      await saveStructuredInterviewArtifacts({
        interviewSessionId,
        finalOutput,
        deepInterviewAnswers,
        record,
      });
    }

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown history record error',
    });
  }
});

app.get('/api/history-records', async (_, res) => {
  try {
    const [rows] = await db.execute<HistoryRecordRow[]>(
      `
        SELECT
          id,
          user_profile_id,
          title,
          category,
          decision_date,
          final_conclusion,
          recommendation,
          impact_score,
          raw_record,
          created_at
        FROM past_decision_records
        ORDER BY created_at DESC
        LIMIT 100
      `,
    );

    const profileIds = Array.from(new Set(rows.map((row) => row.user_profile_id).filter(Boolean)));
    const profileParams = Object.fromEntries(profileIds.map((id, index) => [`profileId${index}`, id]));
    const profilePlaceholders = profileIds.map((_, index) => `:profileId${index}`).join(', ');
    const accountsByProfile = new Map<string, PublicDataSnapshot['accounts']>();
    const postsByProfile = new Map<string, PublicDataSnapshot['posts']>();
    const signalsByProfile = new Map<string, string[]>();

    if (profileIds.length) {
      const [accountRows] = await db.execute<HistorySnsAccountRow[]>(
        `
          SELECT
            jobs.user_profile_id,
            accounts.platform,
            accounts.handle,
            accounts.profile_url,
            accounts.confidence
          FROM sns_collection_jobs jobs
          JOIN sns_accounts accounts
            ON accounts.collection_job_id = jobs.id
          WHERE jobs.user_profile_id IN (${profilePlaceholders})
          ORDER BY accounts.created_at DESC
        `,
        profileParams,
      );

      for (const account of accountRows) {
        const existing = accountsByProfile.get(account.user_profile_id) ?? [];
        existing.push({
          platform: account.platform,
          handle: account.handle,
          url: account.profile_url,
          confidence: Number(account.confidence),
        });
        accountsByProfile.set(account.user_profile_id, existing);
      }

      const [postRows] = await db.execute<HistorySnsPostRow[]>(
        `
          SELECT
            jobs.user_profile_id,
            accounts.platform,
            posts.content,
            posts.raw_content
          FROM sns_collection_jobs jobs
          JOIN sns_accounts accounts
            ON accounts.collection_job_id = jobs.id
          JOIN sns_posts posts
            ON posts.sns_account_id = accounts.id
          WHERE jobs.user_profile_id IN (${profilePlaceholders})
          ORDER BY posts.created_at DESC
        `,
        profileParams,
      );

      for (const post of postRows) {
        const rawContent =
          typeof post.raw_content === 'string'
            ? JSON.parse(post.raw_content)
            : post.raw_content;
        const existing = postsByProfile.get(post.user_profile_id) ?? [];
        existing.push({
          platform: post.platform,
          text: post.content,
          inferredSignal: rawContent?.inferredSignal ?? 'account_candidate',
        });
        postsByProfile.set(post.user_profile_id, existing);
      }

      const [signalRows] = await db.execute<HistorySnsSignalRow[]>(
        `
          SELECT
            jobs.user_profile_id,
            signals.signal_text
          FROM sns_collection_jobs jobs
          JOIN public_data_signals signals
            ON signals.collection_job_id = jobs.id
          WHERE jobs.user_profile_id IN (${profilePlaceholders})
          ORDER BY signals.created_at DESC
        `,
        profileParams,
      );

      for (const signal of signalRows) {
        const existing = signalsByProfile.get(signal.user_profile_id) ?? [];
        existing.push(signal.signal_text);
        signalsByProfile.set(signal.user_profile_id, existing);
      }
    }

    const records = rows.map((row) => {
      const rawRecord =
        typeof row.raw_record === 'string'
          ? JSON.parse(row.raw_record)
          : row.raw_record;
      const dbPublicData: PublicDataSnapshot = {
        status: 'collected',
        accounts: accountsByProfile.get(row.user_profile_id) ?? [],
        signals: signalsByProfile.get(row.user_profile_id) ?? [],
        posts: postsByProfile.get(row.user_profile_id) ?? [],
      };
      const publicData =
        rawRecord?.publicData?.accounts?.length || dbPublicData.accounts.length
          ? {
              status: rawRecord?.publicData?.status ?? dbPublicData.status,
              accounts: rawRecord?.publicData?.accounts?.length ? rawRecord.publicData.accounts : dbPublicData.accounts,
              signals: rawRecord?.publicData?.signals?.length ? rawRecord.publicData.signals : dbPublicData.signals,
              posts: rawRecord?.publicData?.posts?.length ? rawRecord.publicData.posts : dbPublicData.posts,
            }
          : undefined;

      return {
        id: rawRecord?.id ?? row.id,
        date:
          rawRecord?.date ??
          (row.decision_date instanceof Date
            ? row.decision_date.toISOString().slice(0, 10).replace(/-/g, '.')
            : String(row.decision_date ?? '').replace(/-/g, '.')),
        question: rawRecord?.question ?? row.title,
        category: rawRecord?.category ?? row.category ?? '히스토리',
        participants: rawRecord?.participants ?? ['브레인스토머'],
        timeline: rawRecord?.timeline ?? [],
        agreementPoints: rawRecord?.agreementPoints ?? [],
        disagreements: rawRecord?.disagreements ?? [],
        finalConclusion: rawRecord?.finalConclusion ?? row.final_conclusion ?? '',
        recommendation: rawRecord?.recommendation ?? row.recommendation ?? '',
        impactScore: rawRecord?.impactScore ?? row.impact_score ?? 'Medium',
        preInterviewAnswers: rawRecord?.preInterviewAnswers ?? [],
        preInterviewContext: rawRecord?.preInterviewContext ?? null,
        publicData,
      };
    });

    res.json({ ok: true, records });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown history fetch error',
    });
  }
});

app.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`);
});
