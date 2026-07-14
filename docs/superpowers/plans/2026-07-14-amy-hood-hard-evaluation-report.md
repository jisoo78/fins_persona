# Amy Hood Hard Evaluation HTML Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a developer-focused standalone HTML report that objectively explains the Amy Hood evaluation hardening, Before/After results, three-arm ablation hypotheses, implementation findings, and next acceptance criteria.

**Architecture:** Read all scores and provenance from the four existing evaluation run JSON files, then render them into one self-contained semantic HTML document with embedded CSS. Separate observed Before/After changes from controlled version-2.0.0 ablation results, and verify both numeric consistency and responsive layout before delivery.

**Tech Stack:** HTML5, embedded CSS, JSON/JQ verification, Python standard-library HTML parser, local browser visual inspection.

## Global Constraints

- Create only `docs/reports/2026-07-14-amy-hood-hard-evaluation-ablation-report.html` as the report artifact.
- Use Korean prose with important technical terms glossed in English parentheses.
- Use no external fonts, scripts, images, CDNs, or network dependencies.
- Treat Before v1 versus After v2 as an observed change, not a causal estimate.
- Treat the question-set-2.0.0 three-arm comparison as the primary ablation evidence.
- Report per-arm sample size `n=1` and do not claim statistical significance.
- Preserve all execution IDs, prompt hashes, snapshot hashes, question versions, and score denominators exactly.
- Do not stage the user's prompt-version data or generated evaluation run JSON files.

---

### Task 1: Author the Evidence-Backed Standalone Report

**Files:**
- Create: `docs/reports/2026-07-14-amy-hood-hard-evaluation-ablation-report.html`
- Consume: `evaluation/runs/4eb16444-dc9f-423d-a892-68c1a72fb9c8.json`
- Consume: `evaluation/runs/a472cc65-d6d6-46a4-9098-736588d39d39.json`
- Consume: `evaluation/runs/8fe0e6f1-e2c8-4355-b231-51ba462a9d98.json`
- Consume: `evaluation/runs/3350df82-c43b-4902-b179-688746ac4dc7.json`

**Interfaces:**
- Consumes: immutable run scores, question-set versions, prompt hashes, RAG snapshot ID, objective answers, and subjective grades.
- Produces: one browser-readable HTML file with semantic sections and no runtime dependencies.

- [ ] **Step 1: Recalculate the report metrics from run JSON**

Run:

```bash
jq -s '[.[] | {runId,experimentArm,questionSetVersion,scores}]' \
  evaluation/runs/4eb16444-dc9f-423d-a892-68c1a72fb9c8.json \
  evaluation/runs/a472cc65-d6d6-46a4-9098-736588d39d39.json \
  evaluation/runs/8fe0e6f1-e2c8-4355-b231-51ba462a9d98.json \
  evaluation/runs/3350df82-c43b-4902-b179-688746ac4dc7.json
```

Expected: Before `7/7, 5/5, 22/24`; After arms `4/7, 3/5, 23/24`, `7/7, 3/5, 22/24`, and `7/7, 5/5, 24/24`.

- [ ] **Step 2: Write the HTML with the approved report sections**

Use `apply_patch` to create a complete HTML5 document containing these exact top-level sections:

```html
<section id="executive-summary">최종 요약</section>
<section id="evaluation-design">평가 설계와 비교 가능성</section>
<section id="before-after">Before vs After</section>
<section id="ablation">질문지 2.0.0 3조건 절제 실험</section>
<section id="hypotheses">가설 판정</section>
<section id="failure-analysis">문항별 실패 분석</section>
<section id="implementation">구현 구조와 RAG 주입 형식</section>
<section id="verification">검증 결과</section>
<section id="limitations">한계와 위협 요인</section>
<section id="next-actions">개선 우선순위와 합격 기준</section>
<section id="appendix">재현 정보</section>
```

The report must explicitly include:

```text
Observed Before/After delta: past memory -3, holdout -2, subjective +1
Controlled RAG lift: -3
Controlled Persona lift: -2
Generic CFO objective score: 12/12
Persona-no-RAG traps: H3 option 1, H5 option 1
Persona-RAG traps: P3 option 1, P4 option 1, P7 option 1, H3 option 1, H5 option 1
P4 reason-choice mismatch: reason matched the correct decision but choice was 1
```

- [ ] **Step 3: Parse the HTML and assert required sections and metrics**

Run:

```bash
python3 -c 'from html.parser import HTMLParser; from pathlib import Path; p=Path("docs/reports/2026-07-14-amy-hood-hard-evaluation-ablation-report.html"); text=p.read_text(); parser=HTMLParser(); parser.feed(text); required=["executive-summary","evaluation-design","before-after","ablation","hypotheses","failure-analysis","implementation","verification","limitations","next-actions","appendix"]; assert all(f"id=\"{item}\"" in text for item in required); assert "RAG lift" in text and "-3" in text and "Persona lift" in text and "12 / 12" in text; print("HTML structure and metrics verified")'
```

Expected: `HTML structure and metrics verified`.

- [ ] **Step 4: Check source-tree integrity**

Run:

```bash
rg -n 'TBD|TODO|통계적으로 유의|RAG 일반의 실패' docs/reports/2026-07-14-amy-hood-hard-evaluation-ablation-report.html
git diff --check -- docs/reports/2026-07-14-amy-hood-hard-evaluation-ablation-report.html
```

Expected: the placeholder/overclaim search returns no matches and `git diff --check` exits successfully.

---

### Task 2: Visually Verify and Deliver the Report

**Files:**
- Verify: `docs/reports/2026-07-14-amy-hood-hard-evaluation-ablation-report.html`

**Interfaces:**
- Consumes: the complete standalone HTML from Task 1.
- Produces: a visually reviewed developer report suitable for desktop, narrow viewport, and print/PDF use.

- [ ] **Step 1: Open the local report in the in-app browser**

Open this exact URL:

```text
file:///Users/hestory/Desktop/fins_persona/docs/reports/2026-07-14-amy-hood-hard-evaluation-ablation-report.html
```

Expected: header, score cards, Before/After table, ablation comparison, hypotheses, implementation flow, and appendix render without missing assets.

- [ ] **Step 2: Inspect desktop and narrow layouts**

Verify at a desktop-width view and a narrow/mobile-width view:

```text
- tables remain horizontally readable or scroll within their containers
- score cards collapse to one column on narrow screens
- long UUID and SHA-256 values wrap without expanding the page
- status colors are not the only carrier of meaning
- print styles remove decorative shadows and preserve table borders
```

Expected: no clipped text, overlapping cards, or horizontal page overflow.

- [ ] **Step 3: Re-run numeric and Git verification**

Run:

```bash
python3 -c 'import json; from pathlib import Path; root=Path("evaluation/runs"); ids=["4eb16444-dc9f-423d-a892-68c1a72fb9c8","a472cc65-d6d6-46a4-9098-736588d39d39","8fe0e6f1-e2c8-4355-b231-51ba462a9d98","3350df82-c43b-4902-b179-688746ac4dc7"]; scores=[json.loads((root/f"{i}.json").read_text())["scores"] for i in ids]; assert scores==[{"pastMemory":7,"githubHoldout":5,"subjective":22},{"pastMemory":4,"githubHoldout":3,"subjective":23},{"pastMemory":7,"githubHoldout":3,"subjective":22},{"pastMemory":7,"githubHoldout":5,"subjective":24}]; print("run scores verified")'
git diff --check
git status --short
```

Expected: `run scores verified`, no whitespace errors, and only the report plus pre-existing user/runtime files are uncommitted.

- [ ] **Step 4: Commit only the report artifact**

Run:

```bash
git add docs/reports/2026-07-14-amy-hood-hard-evaluation-ablation-report.html
git commit -m "docs: report hard persona evaluation findings"
```

Expected: the report is committed while prompt-version and evaluation-run files remain unstaged.
