import express from 'express';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { db, toJson } from './db';

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

interface ProfileIntakeRequest {
  profile: UserProfilePayload;
  publicData: PublicDataSnapshot;
  questionCount: number;
  brainstormerSystemPrompt: string;
}

const app = express();
const port = Number(process.env.API_PORT ?? 4000);

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
        targetPlatforms: toJson(['LinkedIn', 'X', 'Threads', 'YouTube 확인 필요', 'Naver Blog', 'Tstory']),
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

app.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`);
});
