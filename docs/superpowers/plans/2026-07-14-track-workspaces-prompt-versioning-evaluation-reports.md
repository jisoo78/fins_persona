# A/B Track 워크스페이스, Main Prompt 버전 관리 및 평가 리포트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A/B Track을 별도 작업 공간으로 분리하고, Amy Hood Main Prompt의 불변 버전 관리와 재현 가능한 평가 실행, 단일·비교 리포트 및 실행 ID 복사를 제공한다.

**Architecture:** 파일 기반 `promptVersionStore`가 프롬프트 버전 manifest와 Markdown을 관리하고, 평가 실행은 생성 시 활성 버전 ID와 해시를 고정한다. React 앱은 공통 사이드바에서 A/B Track 진입만 제공하고 각 Track 내부 메뉴가 기존 화면과 새 Main Prompt·리포트 화면을 조합한다. 리포트는 기존 `evaluation/runs/*.json`에서 읽을 때 계산하며 별도 결과 복제 파일을 만들지 않는다.

**Tech Stack:** TypeScript 5.8, Node.js test runner via `tsx --test`, Express 4, React 19, Vite 6, Tailwind CSS 4, Lucide React, Node `fs/promises`·`crypto`

## Global Constraints

- 현재 브랜치에서 Inline Execution하며 별도 worktree를 만들지 않는다.
- 새 테스트 파일 맨 위에는 Happy Path 1개, 현실적인 Edge Case 정확히 3개, 필요한 Failure Path를 명시한 Test Plan 주석을 먼저 작성한다.
- A Track의 `PreInterviewContext`, 사전 질문, 심층 인터뷰와 최종 렌더링 책임은 변경하지 않는다.
- B Track의 H1-H5와 S1-S3에는 RAG 근거를 주입하지 않는 기존 홀드아웃 안전 규칙을 유지한다.
- Main Prompt 저장은 불변 버전을 추가할 뿐 자동 활성화하지 않는다.
- 평가 실행은 생성 시점의 `promptVersionId`, `promptHash`, `questionSetVersion`, `provider`, `model`을 고정한다.
- 기존 `promptVersionId` 없는 실행 JSON은 수정하거나 삭제하지 않고 레거시 실행으로 읽는다.
- 실행 ID 복사는 항상 축약값이 아닌 전체 `runId`를 사용한다.
- 자동 외부 Judge API, PDF/CSV 내보내기, DB 이전, Amy Hood 이외 인물 CMS는 구현하지 않는다.
- 사용자 데이터인 `evaluation/amy_hood_eval_question_reviews.json`과 `evaluation/runs/`는 명시된 마이그레이션 없이 stage하거나 덮어쓰지 않는다.

---

## File Structure

### Shared contracts

- Create: `shared/amyHoodPromptVersion.ts` — 프롬프트 버전 manifest와 API 응답 타입
- Modify: `shared/amyHoodEvaluation.ts` — `EvaluationRun.promptVersionId?: string` 추가

### Server

- Create: `server/promptVersions/store.ts` — 초기 이관, 불변 저장, 조회, 활성화, 호환 파일 복구
- Create: `server/personaPipeline/promptValidation.ts` — Main Prompt 필수 heading 검증
- Create: `server/promptVersions/routes.ts` — `/api/b-track/amy-hood/prompt-versions` 라우터
- Modify: `server/evaluation/runner.ts` — 평가 생성 시 활성 버전 고정, 실행 시 불변 버전 읽기
- Modify: `server/evaluation/routes.ts` — 기존 평가 API 계약 유지
- Modify: `server/index.ts` — 프롬프트 버전 라우터 mount
- Modify: `server/personaPipeline/promptBuilder.ts` — 검증 helper 사용 및 local 생성 결과 버전 등록

### Client state and API

- Create: `src/services/promptVersionApi.ts` — 프롬프트 버전 조회·저장·활성화
- Modify: `src/services/evaluationApi.ts` — 빈 본문, 비 JSON, 네트워크 실패를 안전한 오류로 변환
- Create: `src/navigation/trackNavigation.ts` — 최상위/Track 내부 상태 검증과 레거시 탭 이관
- Modify: `src/types.ts` — `TabType`, `ATrackSection`, `BTrackSection`

### React UI

- Create: `src/components/tracks/TrackWorkspaceView.tsx` — 공통 Track 제목과 내부 탭
- Create: `src/components/tracks/ATrackView.tsx` — 기존 A Track 화면 조합
- Create: `src/components/tracks/BTrackView.tsx` — B Track 화면 조합
- Create: `src/components/MainPromptView.tsx` — 버전 목록·편집·비교·활성화
- Create: `src/components/evaluation/CopyRunIdButton.tsx` — 복사 피드백 버튼
- Create: `src/utils/clipboard.ts` — Clipboard API와 폴백
- Create: `src/components/EvaluationReportView.tsx` — 단일/비교 리포트 컨테이너
- Create: `src/components/evaluation/SingleRunReport.tsx` — 단일 실행 상세
- Create: `src/components/evaluation/ComparisonRunReport.tsx` — 두 실행 비교
- Create: `src/components/evaluation/evaluationReportViewModel.ts` — 리포트 계산과 비교 검증
- Modify: `src/components/EvaluationView.tsx` — 실행 화면 역할만 유지
- Modify: `src/components/evaluation/EvaluationRunSummary.tsx` — 현재 실행 ID 복사
- Modify: `src/components/evaluation/EvaluationRunHistory.tsx` — 좌·우 선택 ID 복사, 상세 비교는 리포트로 이동
- Modify: `src/components/Sidebar.tsx` — 공통 네 개 진입점만 표시
- Modify: `src/components/DashboardView.tsx` — A Track 내부 목적지로 이동
- Modify: `src/components/DeepInterviewView.tsx` — `onBackToPreInterview` 콜백 사용
- Modify: `src/App.tsx` — Track 상태와 기존 화면 연결

### Tests and docs

- Create: `tests/amyHoodPromptVersions.test.ts`
- Create: `tests/trackNavigation.test.ts`
- Create: `tests/clipboard.test.ts`
- Create: `tests/evaluationReport.test.ts`
- Modify: `tests/amyHoodEvaluation.test.ts`
- Modify: `tests/amyHoodEvaluationUi.test.ts`
- Modify: `package.json`
- Modify: `docs/b-track-amy-hood-poc/phase-5-create-persona-prompt.md`
- Modify: `docs/b-track-amy-hood-poc/phase-6-evaluate-persona.md`

---

### Task 1: Main Prompt 불변 버전 저장소

**Files:**
- Create: `shared/amyHoodPromptVersion.ts`
- Create: `server/promptVersions/store.ts`
- Create: `server/personaPipeline/promptValidation.ts`
- Modify: `server/personaPipeline/promptBuilder.ts:241-250`
- Create: `tests/amyHoodPromptVersions.test.ts`
- Modify: `tests/amyHoodPersonaPipeline.test.ts`

**Interfaces:**
- Consumes: 기존 `data/b-track/amy-hood/AMY_HOOD_PERSONA.gemma4.md`와 필수 heading 목록
- Produces: `ensurePromptVersionStore(root, deps?)`, `listPromptVersions(root)`, `readPromptVersion(root, versionId)`, `createPromptVersion(root, input, deps?)`, `activatePromptVersion(root, versionId, deps?)`, `readActivePromptVersion(root)`

- [ ] **Step 1: 프롬프트 버전 저장소 실패 테스트 작성**

`tests/amyHoodPromptVersions.test.ts`를 다음 계약으로 만든다. 테스트 helper는 임시 root에 `data/b-track/amy-hood/AMY_HOOD_PERSONA.gemma4.md`를 작성하고 `validPrompt`는 현재 필수 heading 8개를 모두 포함한다.

```ts
/**
 * Test Plan:
 * 1. Happy Path:
 *    - 기존 Main Prompt를 초기 버전으로 이관하고 새 버전을 저장·활성화한다.
 * 2. Edge Cases:
 *    - 동일 본문도 서로 다른 버전 ID로 저장한다.
 *    - 과거 버전을 재활성화하면 호환 파일을 되돌린다.
 *    - 호환 파일이 manifest와 다르면 활성 버전 본문으로 복구한다.
 * 3. Failure Path:
 *    - 빈 본문, 필수 heading 누락, 알 수 없는 ID와 원자적 쓰기 실패는 활성 manifest를 바꾸지 않는다.
 */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import test from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  activatePromptVersion,
  createPromptVersion,
  ensurePromptVersionStore,
  readActivePromptVersion,
} from '../server/promptVersions/store';

const validPrompt = '# Amy Hood\n## Role\n## Identity\n## Decision Principles\n## Cross-Dimension Rules\n## Red Lines\n## Communication Style\n## Unknown Policy\n## Response Format\n';

const fixture = async () => {
  const root = await mkdtemp(join(tmpdir(), 'prompt-version-'));
  const dir = join(root, 'data/b-track/amy-hood');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'AMY_HOOD_PERSONA.gemma4.md'), validPrompt);
  return root;
};

test('happy: migrates, saves and explicitly activates an immutable prompt version', async () => {
  const root = await fixture();
  const initial = await ensurePromptVersionStore(root, { now: () => '2026-07-14T00:00:00.000Z', createId: () => 'v1' });
  const saved = await createPromptVersion(root, { content: `${validPrompt}\nNew rule`, basedOnVersionId: 'v1' }, { now: () => '2026-07-14T01:00:00.000Z', createId: () => 'v2' });
  assert.equal(initial.activeVersionId, 'v1');
  assert.equal(saved.versionId, 'v2');
  assert.equal((await readActivePromptVersion(root)).versionId, 'v1');
  await activatePromptVersion(root, 'v2');
  assert.equal((await readActivePromptVersion(root)).versionId, 'v2');
});

test('edge: identical content creates distinct immutable IDs', async () => {
  const root = await fixture();
  await ensurePromptVersionStore(root, { createId: () => 'v1' });
  const v2 = await createPromptVersion(root, { content: validPrompt }, { createId: () => 'v2' });
  const v3 = await createPromptVersion(root, { content: validPrompt }, { createId: () => 'v3' });
  assert.notEqual(v2.versionId, v3.versionId);
  assert.equal(v2.sha256, v3.sha256);
});

test('edge: reactivating an old version restores compatibility content', async () => {
  const root = await fixture();
  await ensurePromptVersionStore(root, { createId: () => 'v1' });
  await createPromptVersion(root, { content: `${validPrompt}\nSecond` }, { createId: () => 'v2' });
  await activatePromptVersion(root, 'v2');
  await activatePromptVersion(root, 'v1');
  assert.equal(await readFile(join(root, 'data/b-track/amy-hood/AMY_HOOD_PERSONA.gemma4.md'), 'utf8'), validPrompt);
});

test('edge: active read repairs a stale compatibility mirror', async () => {
  const root = await fixture();
  await ensurePromptVersionStore(root, { createId: () => 'v1' });
  await writeFile(join(root, 'data/b-track/amy-hood/AMY_HOOD_PERSONA.gemma4.md'), 'stale');
  assert.equal((await readActivePromptVersion(root)).content, validPrompt);
  assert.equal(await readFile(join(root, 'data/b-track/amy-hood/AMY_HOOD_PERSONA.gemma4.md'), 'utf8'), validPrompt);
});

test('failure: invalid content and failed writes preserve activeVersionId', async () => {
  const root = await fixture();
  await ensurePromptVersionStore(root, { createId: () => 'v1' });
  await assert.rejects(createPromptVersion(root, { content: '' }), /content is required/);
  await assert.rejects(createPromptVersion(root, { content: '## Role' }), /missing headings/);
  await assert.rejects(activatePromptVersion(root, 'missing'), /unknown prompt version/);
  await assert.rejects(
    createPromptVersion(root, { content: validPrompt }, {
      createId: () => 'v2',
      atomicWrite: async () => { throw new Error('disk full'); },
    }),
    /disk full/,
  );
  assert.equal((await readActivePromptVersion(root)).versionId, 'v1');
});
```

- [ ] **Step 2: 테스트를 실행해 RED 확인**

Run: `npx tsx --test tests/amyHoodPromptVersions.test.ts`

Expected: FAIL with `Cannot find module '../server/promptVersions/store'`.

- [ ] **Step 3: 공유 타입과 저장소 최소 구현**

`shared/amyHoodPromptVersion.ts`에 다음 타입을 정의한다.

```ts
export type PromptVersionRecord = {
  versionId: string;
  createdAt: string;
  sha256: string;
  basedOnVersionId: string | null;
};

export type PromptVersionManifest = {
  activeVersionId: string;
  versions: PromptVersionRecord[];
};

export type PromptVersionDetail = PromptVersionRecord & {
  content: string;
  active: boolean;
};
```

순환 import를 피하기 위해 `server/personaPipeline/promptValidation.ts`에 heading과 검증을 둔다.

```ts
export const assertValidPersonaPrompt = (content: string) => {
  if (!content.trim()) throw new Error('persona prompt content is required');
  const missing = REQUIRED_PERSONA_PROMPT_HEADINGS.filter((heading) => !content.includes(heading));
  if (missing.length) throw new Error(`persona prompt missing headings: ${missing.join(', ')}`);
};
```

`server/promptVersions/store.ts`의 공개 계약을 다음과 같이 구현한다.

```ts
export type PromptStoreDeps = {
  now(): string;
  createId(): string;
  atomicWrite(path: string, text: string): Promise<void>;
};

export declare const ensurePromptVersionStore: (
  root: string,
  deps?: Partial<PromptStoreDeps>,
) => Promise<PromptVersionManifest>;

export declare const createPromptVersion: (
  root: string,
  input: { content: string; basedOnVersionId?: string | null },
  deps?: Partial<PromptStoreDeps>,
) => Promise<PromptVersionDetail>;

export declare const activatePromptVersion: (
  root: string,
  versionId: string,
  deps?: Partial<PromptStoreDeps>,
) => Promise<PromptVersionDetail>;
```

`readActivePromptVersion`은 manifest가 가리키는 본문을 읽고 해시를 검증한 뒤 호환 파일이 다르면 복구한다. 모든 경로 ID는 `/^[a-zA-Z0-9-]+$/`로 제한한다.

`buildMasterPrompt`는 `provider === 'local'`일 때 생성 결과를 버전 저장소와 동기화한다. manifest가 없으면 기존처럼 호환 파일을 원자적으로 쓴 뒤 `ensurePromptVersionStore`로 초기 활성 버전을 만든다. manifest가 있으면 `createPromptVersion` 후 `activatePromptVersion`을 호출한다. 이 자동 활성화는 사용자가 명시적으로 실행한 persona 생성 명령의 기존 의미를 보존하기 위한 것이며, Web UI의 `새 버전 저장`은 계속 비활성 상태로 남는다. `amyHoodPersonaPipeline.test.ts`의 happy test에 다음 검증을 추가한다.

```ts
const manifest = JSON.parse(
  readFileSync(join(fixture.root, 'data/b-track/amy-hood/prompt-versions.json'), 'utf8'),
) as { activeVersionId: string; versions: Array<{ versionId: string }> };
assert.equal(manifest.versions.length, 1);
assert.equal(manifest.activeVersionId, manifest.versions[0].versionId);
```

- [ ] **Step 4: 프롬프트 버전 테스트 GREEN 확인**

Run: `npx tsx --test tests/amyHoodPromptVersions.test.ts && npm run persona:test`

Expected: 새 테스트 전부 PASS, 기존 persona 테스트 14개 PASS.

- [ ] **Step 5: Task 1 커밋**

```bash
git add shared/amyHoodPromptVersion.ts server/promptVersions/store.ts server/personaPipeline/promptValidation.ts server/personaPipeline/promptBuilder.ts tests/amyHoodPromptVersions.test.ts tests/amyHoodPersonaPipeline.test.ts
git commit -m "feat: version Amy Hood main prompts"
```

### Task 2: 프롬프트 버전 API와 안전한 JSON 응답 처리

**Files:**
- Create: `server/promptVersions/routes.ts`
- Modify: `server/index.ts:1-200`
- Create: `src/services/promptVersionApi.ts`
- Modify: `src/services/evaluationApi.ts:18-29`
- Modify: `tests/amyHoodPromptVersions.test.ts`
- Modify: `tests/amyHoodEvaluationUi.test.ts`

**Interfaces:**
- Consumes: Task 1의 prompt store 함수
- Produces: 네 개의 prompt version HTTP endpoint와 `listPromptVersions`, `getPromptVersion`, `savePromptVersion`, `activatePromptVersion` client 함수

- [ ] **Step 1: 라우터와 비정상 응답 실패 테스트 추가**

`amyHoodPromptVersions.test.ts`에 Express 임시 서버 테스트를 추가해 GET 목록, GET 상세, POST 저장, POST 활성화를 순서대로 호출하고 status `200, 200, 201, 200`을 검증한다. 알 수 없는 ID는 404, 빈 content는 400이어야 한다.

`amyHoodEvaluationUi.test.ts`에 다음 현실적인 실패 경로를 추가한다.

```ts
test('failure: empty proxy response reports API availability instead of JSON parse syntax', async () => {
  const fetchImpl: typeof fetch = async () => new Response('', { status: 500 });
  await assert.rejects(
    fetchEvaluationQuestions(fetchImpl),
    /API request failed with 500 and an empty response/,
  );
});

test('edge: non-JSON gateway response keeps status in the error', async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response('Bad Gateway', { status: 502, headers: { 'content-type': 'text/plain' } });
  await assert.rejects(fetchEvaluationQuestions(fetchImpl), /502.*Bad Gateway/);
});
```

- [ ] **Step 2: API 테스트 RED 확인**

Run: `npx tsx --test tests/amyHoodPromptVersions.test.ts tests/amyHoodEvaluationUi.test.ts`

Expected: FAIL because prompt router/client exports are missing and empty response still throws `Unexpected end of JSON input`.

- [ ] **Step 3: 서버 라우터와 client 구현**

`server/promptVersions/routes.ts`는 의존성 주입 가능한 다음 계약을 사용한다.

```ts
export type PromptVersionRouteDependencies = {
  list(): Promise<{ manifest: PromptVersionManifest; active: PromptVersionDetail }>;
  read(versionId: string): Promise<PromptVersionDetail>;
  create(input: { content: string; basedOnVersionId?: string | null }): Promise<PromptVersionDetail>;
  activate(versionId: string): Promise<PromptVersionDetail>;
};

const asyncHandler = (
  handler: (request: Request, response: Response, next: NextFunction) => Promise<void>,
) => (request: Request, response: Response, next: NextFunction) => {
  void handler(request, response, next).catch(next);
};

export const createPromptVersionRouter = (deps: PromptVersionRouteDependencies) => {
  const router = Router();
  router.get('/', asyncHandler(async (_req, res) => res.json({ ok: true, ...(await deps.list()) })));
  router.get('/:id', asyncHandler(async (req, res) => res.json({ ok: true, version: await deps.read(req.params.id) })));
  router.post('/', asyncHandler(async (req, res) => res.status(201).json({ ok: true, version: await deps.create(req.body) })));
  router.post('/:id/activate', asyncHandler(async (req, res) => res.json({ ok: true, version: await deps.activate(req.params.id) })));
  router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = error instanceof Error ? error.message : 'Unknown prompt version error';
    const status = /unknown prompt version|ENOENT/.test(message) ? 404 : 400;
    res.status(status).json({ ok: false, message });
  });
  return router;
};

export const createPromptVersionRouteDependencies = (root: string): PromptVersionRouteDependencies => ({
  list: async () => {
    const manifest = await listPromptVersions(root);
    return { manifest, active: await readActivePromptVersion(root) };
  },
  read: (versionId) => readPromptVersion(root, versionId),
  create: (input) => createPromptVersion(root, input),
  activate: (versionId) => activatePromptVersion(root, versionId),
});
```

`server/index.ts`에 다음 mount를 추가한다.

```ts
app.use(
  '/api/b-track/amy-hood/prompt-versions',
  createPromptVersionRouter(createPromptVersionRouteDependencies(process.cwd())),
);
```

`evaluationApi.request`는 `response.text()`를 한 번만 읽고 다음 구현으로 빈 응답·JSON parse 실패·fetch rejection을 구분한다. `promptVersionApi.ts`는 이 공용 `request`를 import해 네 endpoint를 호출한다.

```ts
export const request = async <T>(input: RequestInfo | URL, init: RequestInit = {}, fetchImpl: typeof fetch = fetch): Promise<T> => {
  let response: Response;
  try {
    response = await fetchImpl(input, init);
  } catch (error) {
    throw new Error(`API request failed: ${error instanceof Error ? error.message : 'network unavailable'}`);
  }
  const text = await response.text();
  if (!text) throw new Error(`API request failed with ${response.status} and an empty response`);
  let payload: T & { message?: string };
  try {
    payload = JSON.parse(text) as T & { message?: string };
  } catch {
    throw new Error(`API request failed with ${response.status}: ${text.slice(0, 200)}`);
  }
  if (!response.ok) throw new Error(payload.message ?? `API request failed with ${response.status}`);
  return payload;
};
```

- [ ] **Step 4: API와 client 테스트 GREEN 확인**

Run: `npx tsx --test tests/amyHoodPromptVersions.test.ts tests/amyHoodEvaluationUi.test.ts && npm run lint`

Expected: 관련 테스트 PASS, TypeScript 오류 0개.

- [ ] **Step 5: Task 2 커밋**

```bash
git add server/promptVersions/routes.ts server/index.ts src/services/promptVersionApi.ts src/services/evaluationApi.ts tests/amyHoodPromptVersions.test.ts tests/amyHoodEvaluationUi.test.ts
git commit -m "feat: expose main prompt version API"
```

### Task 3: 평가 실행에 활성 프롬프트 버전 고정

**Files:**
- Modify: `shared/amyHoodEvaluation.ts:88-105`
- Modify: `server/evaluation/runner.ts:100-165`
- Modify: `tests/amyHoodEvaluation.test.ts`

**Interfaces:**
- Consumes: `readActivePromptVersion`, `readPromptVersion`
- Produces: 새 실행의 필수 `promptVersionId`; 레거시 JSON 호환을 위한 optional shared field

- [ ] **Step 1: 고정 버전과 레거시 실행 테스트 추가**

`createRunnerFixture`가 Task 1의 초기 manifest를 만들도록 수정하고 다음 테스트를 추가한다.

```ts
test('happy: evaluation pins the active prompt version and executes immutable content', async () => {
  const root = await createRunnerFixture();
  const first = await readActivePromptVersion(root);
  const prompts: string[] = [];
  const runner = createEvaluationRunner({ root, createModel: () => fakeModel(async (prompt) => {
    prompts.push(prompt);
    return validModelResult(prompt);
  }) });
  const queued = await runner.createEvaluationRun({ provider: 'local' });
  const second = await createPromptVersion(root, { content: `${first.content}\nNew inactive version` });
  await activatePromptVersion(root, second.versionId);
  const completed = await runner.executeEvaluationRun(queued.runId);
  assert.equal(completed.promptVersionId, first.versionId);
  assert.equal(prompts.every((prompt) => prompt.includes('New inactive version') === false), true);
});

test('edge: legacy run without promptVersionId remains readable', async () => {
  const root = await createRunnerFixture();
  const queued = await createEvaluationRunner({
    root,
    createModel: () => fakeModel(async (prompt) => validModelResult(prompt)),
  }).createEvaluationRun({ provider: 'local' });
  const legacy = { ...queued };
  delete legacy.promptVersionId;
  await writeRun(root, legacy);
  assert.equal((await readRun(root, legacy.runId)).promptVersionId, undefined);
});
```

- [ ] **Step 2: 평가 고정 테스트 RED 확인**

Run: `npx tsx --test --test-name-pattern "pins the active|legacy run" tests/amyHoodEvaluation.test.ts`

Expected: FAIL because `promptVersionId` and prompt store reads are not wired into the runner.

- [ ] **Step 3: runner 최소 변경**

`EvaluationRun`에 `promptVersionId?: string`를 추가한다. `createEvaluationRun`은 `readActivePromptVersion(root)`에서 content, versionId, sha256를 받아 run에 기록한다. `executeEvaluationRun`은 다음 helper를 사용한다.

```ts
const readRunPersona = async (root: string, run: EvaluationRun) => {
  if (!run.promptVersionId) {
    return readFile(personaPromptPath(root, run.provider), 'utf8');
  }
  const version = await readPromptVersion(root, run.promptVersionId);
  if (version.sha256 !== run.promptHash) throw new Error('run prompt version hash is stale');
  return version.content;
};
```

OpenAI와 local provider 모두 같은 활성 Main Prompt 버전을 사용해 모델 비교 시 프롬프트 변수를 통제한다. 기존 완료 실행은 수정하지 않는다.

- [ ] **Step 4: 전체 평가 테스트 GREEN 확인**

Run: `npm run evaluation:test && npm run persona:test`

Expected: evaluation 테스트와 persona 테스트 전부 PASS.

- [ ] **Step 5: Task 3 커밋**

```bash
git add shared/amyHoodEvaluation.ts server/evaluation/runner.ts tests/amyHoodEvaluation.test.ts
git commit -m "feat: pin prompt versions to evaluation runs"
```

### Task 4: A/B Track 내비게이션과 작업 공간

**Files:**
- Create: `src/navigation/trackNavigation.ts`
- Create: `tests/trackNavigation.test.ts`
- Modify: `src/types.ts:1-9`
- Create: `src/components/tracks/TrackWorkspaceView.tsx`
- Create: `src/components/tracks/ATrackView.tsx`
- Create: `src/components/tracks/BTrackView.tsx`
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/components/DashboardView.tsx`
- Modify: `src/components/DeepInterviewView.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: 기존 A Track 화면과 B Track 화면
- Produces: `TabType`, `ATrackSection`, `BTrackSection`, `normalizeTrackNavigation(value)`, `migrateLegacyTab(value)`

- [ ] **Step 1: Track 상태 RED 테스트 작성**

`tests/trackNavigation.test.ts`를 다음으로 시작한다.

```ts
/**
 * Test Plan:
 * 1. Happy Path:
 *    - 공통 진입점과 A/B Track 내부 메뉴를 독립적으로 저장·복원한다.
 * 2. Edge Cases:
 *    - 새로고침 시 마지막 Track과 내부 메뉴를 복원한다.
 *    - 알 수 없는 내부 메뉴는 Track 기본 화면으로 복구한다.
 *    - 기존 세부 탭 값은 대응 Track과 내부 메뉴로 이관한다.
 * 3. Failure Path:
 *    - 손상된 저장값이 있어도 대시보드와 기본 내부 메뉴를 반환한다.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { migrateLegacyTab, normalizeTrackNavigation } from '../src/navigation/trackNavigation';

test('happy: keeps A and B section state independently', () => {
  assert.deepEqual(normalizeTrackNavigation({ activeTab: 'b-track', aTrack: 'personas', bTrack: 'reports' }), {
    activeTab: 'b-track', aTrack: 'personas', bTrack: 'reports',
  });
});
test('edge: valid stored state survives refresh normalization', () => {
  const saved = { activeTab: 'a-track', aTrack: 'deep-interview', bTrack: 'evaluation-run' };
  assert.deepEqual(normalizeTrackNavigation(saved), saved);
});
test('edge: unknown sections fall back to pre-interview and main-prompt', () => {
  assert.deepEqual(
    normalizeTrackNavigation({ activeTab: 'b-track', aTrack: 'wrong', bTrack: 'wrong' }),
    { activeTab: 'b-track', aTrack: 'pre-interview', bTrack: 'main-prompt' },
  );
});
test('edge: legacy evaluation-review migrates to b-track question-review', () => { assert.deepEqual(migrateLegacyTab('evaluation-review'), { activeTab: 'b-track', bTrack: 'question-review' }); });
test('failure: malformed storage returns safe defaults', () => {
  const defaults = { activeTab: 'dashboard', aTrack: 'pre-interview', bTrack: 'main-prompt' };
  assert.deepEqual(normalizeTrackNavigation(null), defaults);
  assert.deepEqual(normalizeTrackNavigation([]), defaults);
  assert.deepEqual(normalizeTrackNavigation('not-an-object'), defaults);
});
```

- [ ] **Step 2: 내비게이션 테스트 RED 확인**

Run: `npx tsx --test tests/trackNavigation.test.ts`

Expected: FAIL with missing `trackNavigation` module.

- [ ] **Step 3: 타입·상태·공통 Track shell 구현**

타입은 다음 값으로 고정한다.

```ts
export type TabType = 'dashboard' | 'a-track' | 'b-track' | 'settings';
export type ATrackSection = 'pre-interview' | 'deep-interview' | 'personas';
export type BTrackSection = 'main-prompt' | 'question-review' | 'evaluation-run' | 'reports';
```

`TrackWorkspaceView`는 `title`, `description`, `items`, `activeItem`, `onChange`, `children`를 받아 상단 Track 제목과 내부 탭을 렌더링한다. `Sidebar`는 `대시보드`, `A Track`, `B Track`, `설정` 네 항목만 표시한다.

`ATrackView`는 section에 따라 기존 `InterviewView`, `DeepInterviewView`, `PersonasView`를 렌더링한다. `DeepInterviewView`의 `setActiveTab('pre-interview')` 두 곳은 `onBackToPreInterview()`로 바꾼다. `DashboardView`의 세부 목적지는 `onOpenATrack(section)` 콜백으로 바꾼다.

`BTrackView`는 우선 `main-prompt`, `question-review`, `evaluation-run`, `reports` 내부 키를 받고 준비된 화면을 렌더링한다. Task 5와 7이 새 화면을 채우기 전에는 실제 import가 존재하도록 최소 컴포넌트 shell을 함께 생성한다.

- [ ] **Step 4: 내비게이션 테스트와 빌드 GREEN 확인**

Run: `npx tsx --test tests/trackNavigation.test.ts && npm run lint && npm run build`

Expected: Track 테스트 PASS, TypeScript 오류 0개, Vite build 성공.

- [ ] **Step 5: Task 4 커밋**

```bash
git add src/navigation/trackNavigation.ts tests/trackNavigation.test.ts src/types.ts src/components/tracks src/components/Sidebar.tsx src/components/DashboardView.tsx src/components/DeepInterviewView.tsx src/App.tsx
git commit -m "feat: separate A and B Track workspaces"
```

### Task 5: Main Prompt 조회·편집·비교 화면

**Files:**
- Create: `src/services/promptVersionApi.ts`
- Create: `src/components/MainPromptView.tsx`
- Modify: `src/components/tracks/BTrackView.tsx`
- Modify: `tests/amyHoodEvaluationUi.test.ts`

**Interfaces:**
- Consumes: Task 2 prompt API와 Task 4 B Track shell
- Produces: 현재 활성 본문, 새 버전 저장, 두 버전 비교, 명시적 활성화 UI

- [ ] **Step 1: Main Prompt view model/client 계약 테스트 추가**

`promptVersionApi.ts`에 pure helper `buildPromptVersionOptions(manifest)`를 export하고 다음 테스트를 추가한다.

```ts
test('happy: prompt versions keep active marker and newest-first ordering', () => {
  const options = buildPromptVersionOptions({
    activeVersionId: 'v1',
    versions: [
      { versionId: 'v1', createdAt: '2026-07-14T00:00:00.000Z', sha256: 'a', basedOnVersionId: null },
      { versionId: 'v2', createdAt: '2026-07-14T01:00:00.000Z', sha256: 'b', basedOnVersionId: 'v1' },
    ],
  });
  assert.deepEqual(options.map((item) => [item.versionId, item.active]), [['v2', false], ['v1', true]]);
});
```

- [ ] **Step 2: Main Prompt UI 테스트 RED 확인**

Run: `npx tsx --test --test-name-pattern "prompt versions" tests/amyHoodEvaluationUi.test.ts`

Expected: FAIL because `buildPromptVersionOptions` is missing.

- [ ] **Step 3: MainPromptView 구현**

화면 상태는 `manifest`, `active`, `editor`, `leftVersionId`, `rightVersionId`, `busy`, `error`, `notice`로 제한한다. 최초 로드 시 목록과 활성 본문을 가져와 editor에 채운다.

버튼 동작은 다음처럼 분리한다.

```ts
const saveVersion = async () => {
  const response = await savePromptVersion({
    content: editor,
    basedOnVersionId: active.versionId,
  });
  setNotice(`새 버전 ${response.version.versionId}을 저장했습니다. 활성 버전은 변경되지 않았습니다.`);
  await refresh();
};

const activateVersion = async (versionId: string) => {
  await activatePromptVersion(versionId);
  setNotice(`${versionId}을 활성화했습니다.`);
  await refresh();
};
```

본문 편집기는 monospace `textarea`, 비교 영역은 선택한 두 버전의 read-only `pre`를 2열로 표시한다. 저장과 활성화 버튼은 별도이며 저장 직후 자동 활성화하지 않는다. 오류는 화면 상단 alert에 표시한다.

- [ ] **Step 4: Main Prompt UI 검증**

Run: `npx tsx --test tests/amyHoodEvaluationUi.test.ts && npm run lint && npm run build`

Expected: UI helper 테스트 PASS, TypeScript 오류 0개, build 성공.

- [ ] **Step 5: Task 5 커밋**

```bash
git add src/services/promptVersionApi.ts src/components/MainPromptView.tsx src/components/tracks/BTrackView.tsx tests/amyHoodEvaluationUi.test.ts
git commit -m "feat: add main prompt version editor"
```

### Task 6: 전체 실행 ID 복사

**Files:**
- Create: `src/utils/clipboard.ts`
- Create: `src/components/evaluation/CopyRunIdButton.tsx`
- Create: `tests/clipboard.test.ts`
- Modify: `src/components/evaluation/EvaluationRunSummary.tsx`
- Modify: `src/components/evaluation/EvaluationRunHistory.tsx`

**Interfaces:**
- Consumes: 전체 `EvaluationRun.runId`
- Produces: `copyTextToClipboard(text, adapters?) => Promise<boolean>`와 재사용 가능한 `CopyRunIdButton`

- [ ] **Step 1: Clipboard RED 테스트 작성**

```ts
/**
 * Test Plan:
 * 1. Happy Path:
 *    - 전체 UUID를 Clipboard API에 그대로 전달한다.
 * 2. Edge Cases:
 *    - Clipboard API가 없으면 fallback을 사용한다.
 *    - Clipboard API가 거부되면 fallback을 사용한다.
 *    - 빈 실행 ID는 어떤 복사 경로도 호출하지 않는다.
 * 3. Failure Path:
 *    - 기본 경로와 fallback이 모두 실패하면 예외 없이 false를 반환한다.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { copyTextToClipboard } from '../src/utils/clipboard';

test('happy: copies the complete run UUID', async () => {
  const copied: string[] = [];
  assert.equal(await copyTextToClipboard('33d7c552-5427-42c1-9d0c-89985473929b', {
    writeText: async (text) => { copied.push(text); }, fallbackCopy: () => false,
  }), true);
  assert.deepEqual(copied, ['33d7c552-5427-42c1-9d0c-89985473929b']);
});
test('edge: missing clipboard uses fallback', async () => {
  const copied: string[] = [];
  const result = await copyTextToClipboard('run-full-id', {
    fallbackCopy: (text) => { copied.push(text); return true; },
  });
  assert.equal(result, true);
  assert.deepEqual(copied, ['run-full-id']);
});
test('edge: rejected clipboard uses fallback', async () => {
  const result = await copyTextToClipboard('run-full-id', {
    writeText: async () => { throw new Error('denied'); },
    fallbackCopy: () => true,
  });
  assert.equal(result, true);
});
test('edge: empty ID invokes neither adapter', async () => {
  let calls = 0;
  const result = await copyTextToClipboard('', {
    writeText: async () => { calls += 1; },
    fallbackCopy: () => { calls += 1; return true; },
  });
  assert.equal(result, false);
  assert.equal(calls, 0);
});
test('failure: both copy paths fail safely', async () => {
  const result = await copyTextToClipboard('run-full-id', {
    writeText: async () => { throw new Error('denied'); },
    fallbackCopy: () => { throw new Error('blocked'); },
  });
  assert.equal(result, false);
});
```

- [ ] **Step 2: Clipboard 테스트 RED 확인**

Run: `npx tsx --test tests/clipboard.test.ts`

Expected: FAIL with missing clipboard module.

- [ ] **Step 3: 복사 utility와 버튼 구현**

```ts
export type ClipboardAdapters = {
  writeText?: (text: string) => Promise<void>;
  fallbackCopy?: (text: string) => boolean;
};

const fallbackCopy = (text: string) => {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  try {
    return document.execCommand('copy');
  } finally {
    document.body.removeChild(area);
  }
};

const browserClipboardAdapters = (): ClipboardAdapters => ({
  writeText: navigator.clipboard?.writeText.bind(navigator.clipboard),
  fallbackCopy,
});

export const copyTextToClipboard = async (
  text: string,
  adapters: ClipboardAdapters = browserClipboardAdapters(),
) => {
  if (!text) return false;
  try {
    if (adapters.writeText) {
      await adapters.writeText(text);
      return true;
    }
  } catch {}
  try { return adapters.fallbackCopy?.(text) ?? false; } catch { return false; }
};
```

`CopyRunIdButton`은 `runId`, `disabled?`를 받고 `idle | copied | failed` 상태와 timer ref 하나만 가진다. 클릭마다 기존 timer를 clear하고 2초 후 `idle`로 되돌린다. unmount 시 timer를 정리한다.

현재 실행 ID 옆과 `EvaluationRunHistory` 좌·우 select 아래에 버튼을 배치한다. 선택이 없으면 disabled를 전달한다.

- [ ] **Step 4: 복사 테스트와 UI build GREEN 확인**

Run: `npx tsx --test tests/clipboard.test.ts && npm run lint && npm run build`

Expected: Clipboard 테스트 전부 PASS, build 성공.

- [ ] **Step 5: Task 6 커밋**

```bash
git add src/utils/clipboard.ts src/components/evaluation/CopyRunIdButton.tsx tests/clipboard.test.ts src/components/evaluation/EvaluationRunSummary.tsx src/components/evaluation/EvaluationRunHistory.tsx
git commit -m "feat: copy complete evaluation run IDs"
```

### Task 7: 단일 실행 및 비교 평가 리포트

**Files:**
- Create: `src/components/evaluation/evaluationReportViewModel.ts`
- Create: `src/components/evaluation/SingleRunReport.tsx`
- Create: `src/components/evaluation/ComparisonRunReport.tsx`
- Create: `src/components/EvaluationReportView.tsx`
- Create: `tests/evaluationReport.test.ts`
- Modify: `src/components/tracks/BTrackView.tsx`
- Modify: `src/components/EvaluationView.tsx`
- Modify: `src/components/evaluation/EvaluationRunHistory.tsx`

**Interfaces:**
- Consumes: `EvaluationRun[]`, `EvaluationQuestion[]`, Task 6 `CopyRunIdButton`
- Produces: `buildSingleRunReport(run, questions)`, `buildComparisonReport(left, right, questions)`와 B Track 리포트 화면

- [ ] **Step 1: 리포트 view model RED 테스트 작성**

```ts
/**
 * Test Plan:
 * 1. Happy Path:
 *    - 채점 완료 실행의 단일 리포트와 같은 질문 세트 두 실행의 비교 리포트를 만든다.
 * 2. Edge Cases:
 *    - promptVersionId 없는 실행은 해시 기반 레거시 프롬프트로 표시한다.
 *    - 주관식 미채점 실행은 0점이 아닌 채점 대기로 표시한다.
 *    - 미완료 실행은 완료 답변과 실패 문항을 모두 보존한다.
 * 3. Failure Path:
 *    - 같은 실행, 다른 질문 세트와 누락 답변 비교는 명시적 오류로 차단한다.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildComparisonReport, buildSingleRunReport } from '../src/components/evaluation/evaluationReportViewModel';
import type { EvaluationQuestion, EvaluationRun } from '../shared/amyHoodEvaluation';

const questions: EvaluationQuestion[] = Array.from({ length: 15 }, (_, index) => ({
  id: index < 7 ? `P${index + 1}` : index < 12 ? `H${index - 6}` : `S${index - 11}`,
  kpi: index < 7 ? 'past_memory_restoration' : index < 12 ? 'github_holdout' : 'hypothetical_scenario',
  type: index < 12 ? 'multiple_choice' : 'subjective',
  prompt: `Question ${index + 1}`,
}));

const gradedRun = (
  runId: string,
  scoreOverrides: Partial<EvaluationRun['scores']> = {},
): EvaluationRun => ({
  runId,
  status: 'complete',
  gradingStatus: 'complete',
  provider: 'local',
  model: 'test-model',
  promptVersionId: 'prompt-v1',
  promptHash: 'abcdef123456',
  ragSnapshotId: 'rag-v1',
  questionSetVersion: '1.0.0',
  answers: questions.map((question) => ({
    questionId: question.id,
    status: 'complete',
    choice: question.type === 'multiple_choice' ? 1 : undefined,
    text: question.type === 'subjective' ? 'Subjective answer' : undefined,
    objectiveScore: question.type === 'multiple_choice' ? 1 : undefined,
    elapsedMs: 1,
  })),
  scores: { pastMemory: 7, githubHoldout: 5, subjective: 21, ...scoreOverrides },
  startedAt: '2026-07-14T00:00:00.000Z',
  completedAt: '2026-07-14T00:01:00.000Z',
});

test('happy: builds single and comparison reports with score deltas', () => {
  const single = buildSingleRunReport(gradedRun('left'), questions);
  const comparison = buildComparisonReport(gradedRun('left'), gradedRun('right', { pastMemory: 6 }), questions);
  assert.equal(single.rows.length, 15);
  assert.equal(comparison.scoreDeltas.pastMemory, -1);
});
test('edge: legacy run shows prompt hash label', () => {
  const legacy = gradedRun('legacy');
  delete legacy.promptVersionId;
  assert.equal(buildSingleRunReport(legacy, questions).promptLabel, '레거시 프롬프트 · abcdef123456');
});
test('edge: pending subjective grade stays null', () => {
  const pending = gradedRun('pending', { subjective: null });
  pending.gradingStatus = 'pending';
  assert.equal(buildSingleRunReport(pending, questions).scores.subjective, null);
});
test('edge: incomplete run retains complete and failed rows', () => {
  const incomplete = gradedRun('incomplete');
  incomplete.status = 'incomplete';
  incomplete.completedAt = null;
  incomplete.answers[1] = { questionId: 'P2', status: 'failed', elapsedMs: 0, error: 'model unavailable' };
  const report = buildSingleRunReport(incomplete, questions);
  assert.equal(report.rows.some((row) => row.answer?.status === 'complete'), true);
  assert.equal(report.rows.some((row) => row.answer?.status === 'failed'), true);
});
test('failure: invalid comparisons explain exact contract violation', () => {
  const left = gradedRun('same');
  assert.throws(() => buildComparisonReport(left, left, questions), /different evaluation runs/);
  const otherVersion = gradedRun('other');
  otherVersion.questionSetVersion = '2.0.0';
  assert.throws(() => buildComparisonReport(left, otherVersion, questions), /same question-set version/);
  const missing = gradedRun('missing');
  missing.answers.pop();
  assert.throws(() => buildComparisonReport(left, missing, questions), /15 answers/);
});
```

- [ ] **Step 2: 리포트 테스트 RED 확인**

Run: `npx tsx --test tests/evaluationReport.test.ts`

Expected: FAIL with missing report view model.

- [ ] **Step 3: 리포트 모델과 화면 구현**

단일 report shape를 다음으로 고정한다.

```ts
export type SingleRunReportModel = {
  runId: string;
  status: EvaluationRun['status'];
  gradingStatus: EvaluationRun['gradingStatus'];
  provider: EvaluationRun['provider'];
  model: string;
  promptLabel: string;
  questionSetVersion: string;
  scores: EvaluationRun['scores'];
  rows: Array<{ question: EvaluationQuestion; answer: EvaluationRunAnswer | null }>;
};
```

비교 report는 좌·우 single model, `scoreDeltas`와 질문별 좌·우 answer를 가진다. `subjective`가 한쪽이라도 null이면 delta도 null이다. 같은 run ID, 다른 question set, 15개 답변이 맞지 않는 완료 실행은 구체적 Error를 던진다.

`EvaluationReportView`는 runs와 questions를 한 번 불러오고 `단일 실행`, `두 실행 비교` 내부 탭을 제공한다. `SingleRunReport`는 메타데이터, 7/5/24 점수, 실패·객관식·주관식 상세와 재개 버튼을 렌더링한다. `ComparisonRunReport`는 좌·우 선택, ID 복사, 점수 증감, 답변과 주관식 차원을 2열로 표시한다.

`EvaluationRunHistory`에서는 중복된 상세 답변 비교를 제거하고 최근 실행 목록, 주관식 수동 채점과 `리포트에서 비교` 안내만 유지한다.

- [ ] **Step 4: 리포트 테스트와 전체 UI GREEN 확인**

Run: `npx tsx --test tests/evaluationReport.test.ts tests/amyHoodEvaluationUi.test.ts && npm run lint && npm run build`

Expected: 리포트·UI 테스트 PASS, TypeScript 오류 0개, build 성공.

- [ ] **Step 5: Task 7 커밋**

```bash
git add src/components/evaluation/evaluationReportViewModel.ts src/components/evaluation/SingleRunReport.tsx src/components/evaluation/ComparisonRunReport.tsx src/components/EvaluationReportView.tsx tests/evaluationReport.test.ts src/components/tracks/BTrackView.tsx src/components/EvaluationView.tsx src/components/evaluation/EvaluationRunHistory.tsx
git commit -m "feat: add evaluation result reports"
```

### Task 8: 문서, 스크립트 및 전체 회귀 검증

**Files:**
- Modify: `package.json`
- Modify: `docs/b-track-amy-hood-poc/phase-5-create-persona-prompt.md`
- Modify: `docs/b-track-amy-hood-poc/phase-6-evaluate-persona.md`
- Verify: all implementation and test files from Tasks 1-7

**Interfaces:**
- Consumes: 완성된 Track, prompt version, evaluation report workflow
- Produces: 한 명령으로 실행되는 B Track 테스트와 사용자 운영 가이드

- [ ] **Step 1: 통합 테스트 스크립트 계약 추가**

`package.json`의 `evaluation:test`를 다음으로 확장한다.

```json
"evaluation:test": "tsx --test tests/amyHoodPromptVersions.test.ts tests/amyHoodEvaluation.test.ts tests/amyHoodEvaluationUi.test.ts tests/trackNavigation.test.ts tests/clipboard.test.ts tests/evaluationReport.test.ts"
```

- [ ] **Step 2: Phase 5·6 문서를 실제 UI 흐름으로 갱신**

Phase 5에는 `B Track → Main Prompt → 새 버전 저장 → 비교 → 활성화` 순서와 저장 경로를 기록한다. Phase 6에는 `문항 검토 → 평가 실행 → Codex 채점 → 단일 리포트 → 비교 리포트` 순서, 전체 실행 ID 복사, 레거시 prompt hash 표시와 미채점 상태를 기록한다.

문서의 실행 명령은 다음으로 고정한다.

```bash
npm run api
npm run dev
npm run evaluation:test
```

- [ ] **Step 3: 전체 자동 검증 실행**

Run:

```bash
npm run inventory:test
npm run persona:test
npm run evaluation:test
npm run lint
npm run build
git diff --check
```

Expected: inventory 7개 PASS, persona 기존 14개 이상 PASS, 새 평가 관련 테스트 전부 PASS, TypeScript 오류 0개, Vite build 성공, whitespace 오류 0개.

- [ ] **Step 4: API 스모크 테스트**

API 서버를 임시 포트에서 실행한다.

```bash
API_PORT=4011 npm run api
```

다른 터미널에서 다음을 확인한다.

```bash
curl -sS http://127.0.0.1:4011/api/b-track/amy-hood/prompt-versions | jq '.ok, .manifest.activeVersionId'
curl -sS http://127.0.0.1:4011/api/evaluation/runs | jq '.ok, (.runs | length)'
```

Expected: 두 요청 모두 `.ok`가 `true`; 첫 요청은 비어 있지 않은 active version ID, 두 번째 요청은 현재 실행 개수를 출력한다. 이 단계에서는 모델을 호출하지 않는다.

- [ ] **Step 5: 수동 UI 스모크 체크**

`http://localhost:3000`에서 다음만 확인하고 사용자 데이터는 변경하지 않는다.

1. 사이드바가 대시보드/A Track/B Track/설정만 표시한다.
2. A Track 내부 세 화면과 B Track 내부 네 화면이 전환된다.
3. Main Prompt 활성 본문과 버전 목록을 조회할 수 있다.
4. 기존 실행의 단일 리포트와 `33d7c552-5427-42c1-9d0c-89985473929b` 전체 ID 복사가 동작한다.
5. API 서버를 중단했을 때 빈 JSON parse 오류 대신 연결 실패 메시지가 표시된다.

- [ ] **Step 6: Task 8 커밋**

```bash
git add package.json docs/b-track-amy-hood-poc/phase-5-create-persona-prompt.md docs/b-track-amy-hood-poc/phase-6-evaluate-persona.md
git commit -m "docs: explain B Track prompt and report workflow"
```

## Final Review Checklist

- [ ] `git status --short`에서 사용자 데이터 외 구현 변경이 모두 커밋되었는지 확인한다.
- [ ] `evaluation/amy_hood_eval_question_reviews.json`과 `evaluation/runs/`를 커밋하지 않았는지 확인한다.
- [ ] 새 실행 JSON에는 `promptVersionId`가 있고 기존 실행 JSON은 그대로 열리는지 확인한다.
- [ ] H1-H5와 S1-S3 prompt에 RAG evidence가 없다는 기존 테스트가 계속 통과하는지 확인한다.
- [ ] Main Prompt 저장이 활성 버전을 자동 변경하지 않는지 확인한다.
- [ ] 단일·비교 리포트에서 생성 model은 보이지만 Codex 채점 payload에는 포함되지 않는지 확인한다.
- [ ] 복사되는 값이 항상 전체 UUID인지 확인한다.
