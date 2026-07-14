# Phase 2 Task 5 — Evidence Association Remediation Report

Date: 2026-07-14
Status: **BLOCKED**

## Outcome

The prior padded source matrix was removed and replaced with 30 event-based candidates and 30 manually reviewed, event-specific official URLs. Collection produced 29 locator-matched documents. This does not meet the Task 5 minimums, and no candidate has a verified event-specific Amy Hood passage, so Phase 3 remains blocked for all candidates.

| Measure | Current | Required | Gap |
|---|---:|---:|---:|
| Reviewed event-specific core URLs | 30 | 100–150 | 70 |
| Locator-matched collected documents | 29 | 50–80 | 21 |
| Post-outcome URLs | 0 | capped at 25 | 0 |
| Candidates with two collected source types | 0/30 | 30/30 | 30 |
| Verified direct Amy Hood candidates | 0/30 | candidate-specific | 30 reviewed gaps |

The 2019 OpenAI partnership page returned `invalid_content`; it is retained as an explicit failed registry record rather than counted as evidence.

## Contract and gate changes

- Every candidate now carries a reviewer-approved event fingerprint with three controlled fields: `primaryEntity`, `decisionAction`, and `eventSpecificIdentifier`. Every cited fingerprint URL must have a reviewed association at that exact canonical URL and must also be part of the decision-window basis.
- Every structured association must repeat exactly that candidate fingerprint as the immutable discriminator set (`named_entity`, `decision_action`, `event_specific`). An association cannot substitute its own event identity.
- Event relevance requires one verbatim, bounded `exactRelevancePassage` (20–1,200 characters) containing the primary entity, action, and event-specific identifier together. The same passage must exist in the collected artifact; a broad nearby-text window is not accepted.
- A direct Amy association is accepted only when its entire exact quote is contained in the same bounded event-specific relevance passage and that entire passage is contained inside one Amy Hood speaker segment. A generic Amy quote cannot borrow a separate event passage elsewhere in the document.
- Candidates without that evidence carry a reviewed `directEvidenceGap` and `phase3Status: evidence_gap`.
- Discovery coverage counts only reviewed, non-rejected, event-specific associations present in the registry. Post-outcome associations are counted separately and capped.
- Valid-document coverage requires an eligible association whose URL, candidate, source type, publication date, temporal relation, exact quote, and reviewer-approved fingerprint match the same exact relevance passage in the collected artifact.
- These checks provide deterministic identity and passage containment, not automatic semantic understanding. Human review remains mandatory (`reviewStatus: reviewed`), and the reviewer note records the semantic judgment that the controlled fields describe the same public decision event.
- New raw artifacts and registry records preserve the requested canonical URL, final URL, and complete bounded redirect chain separately. The gate rejects partial provenance and invented same-host final paths; a fully legacy redirect is accepted only when all new fields are absent and the captured final URL equals the HTML document's declared canonical URL.
- Manual reviewed imports fail closed when the candidate matrix is absent or the URL lacks a reviewed association for every candidate ID.
- Existing path-integrity, symlink, immutable-version, pinned-transport, redirect, and TLS protections remain covered by the regression suite.

## Candidate-to-primary-source audit

All rows below still need a different second collected source type.

| Candidate | Primary reviewed association | Direct evidence |
|---|---|---|
| Nokia acquisition 2013 | `news.microsoft.com/.../microsoft-to-acquire-nokias-devices-services-business...` | reviewed gap |
| Mojang acquisition 2014 | `news.microsoft.com/es-xl/minecraft-se-une-a-microsoft/` | reviewed gap |
| LinkedIn acquisition 2016 | `news.microsoft.com/.../microsoft-to-acquire-linkedin/` | reviewed gap |
| GitHub acquisition 2018 | `news.microsoft.com/.../microsoft-to-acquire-github-for-7-5-billion/` | reviewed gap |
| Nuance acquisition 2021 | `news.microsoft.com/.../acquisition-of-nuance/` | reviewed gap |
| Activision acquisition 2022 | `news.microsoft.com/.../microsoft-to-acquire-activision-blizzard...` | reviewed gap |
| OpenAI partnership 2019 | `blogs.microsoft.com/.../openai-forms-exclusive-computing-partnership...` | reviewed gap; collection failed |
| GPT-3 license 2020 | `blogs.microsoft.com/.../exclusively-license-gpt-3-language-model/` | reviewed gap |
| OpenAI expansion 2023 | `blogs.microsoft.com/.../microsoftandopenaiextendpartnership/` | reviewed gap |
| AI datacenter plan 2025 | `blogs.microsoft.com/on-the-issues/.../golden-opportunity-for-american-ai/` | reviewed gap |
| Fairwater expansion 2025 | `blogs.microsoft.com/on-the-issues/.../made-in-wisconsin.../` | reviewed gap |
| Pecos datacenter 2026 | `blogs.microsoft.com/.../new-datacenter-in-pecos/` | reviewed gap |
| Microsoft 365 price 2021 | `news.microsoft.com/es-xl/nuevo-precio-para-microsoft-365/` | reviewed gap |
| Office 2021 price | `microsoft.com/.../office-2021/` | reviewed gap |
| Copilot price 2023 | `microsoft.com/.../microsoft-365-copilot-pricing.../` | reviewed gap |
| Teams EEA unbundle 2023 | `blogs.microsoft.com/eupolicy/.../teams-office-microsoft-365/` | reviewed gap |
| Copilot GA price 2023 | `microsoft.com/.../copilot-general-availability.../` | reviewed gap |
| Copilot Pro price 2024 | `blogs.microsoft.com/.../full-power-of-copilot.../` | reviewed gap |
| One Microsoft 2013 | `news.microsoft.com/.../one-microsoft-company-realigns.../` | reviewed gap |
| Nokia workforce 2014 | `news.microsoft.com/.../starting-to-evolve-our-organization-and-culture/` | reviewed gap |
| Phone restructuring 2015 | `news.microsoft.com/.../restructuring-of-phone-hardware-business/` | reviewed gap |
| Phone streamlining 2016 | `news.microsoft.com/ru-ru/...smartphone-hardware-business/` | reviewed gap |
| Workforce reset 2023 | `blogs.microsoft.com/.../focusing-on-our-short-and-long-term-opportunity/` | reviewed gap |
| Transformation 2026 | `blogs.microsoft.com/.../latest-in-our-company-transformation/` | reviewed gap |
| Buyback 2008 | `news.microsoft.com/.../share-repurchase-program.../` | reviewed gap |
| Buyback 2013 | `news.microsoft.com/.../share-repurchase-program-3/` | reviewed gap; Amy quote is separate from the board authorization passage |
| Buyback 2016 | `news.microsoft.com/.../share-repurchase-program-2/` | reviewed gap |
| Buyback 2019 | `news.microsoft.com/.../new-share-repurchase-program/` | reviewed gap |
| Buyback 2021 | `news.microsoft.com/.../new-share-repurchase-program-2/` | reviewed gap |
| Buyback 2024 | `news.microsoft.com/.../new-share-repurchase-program-3/` | reviewed gap |

The authoritative full URLs, exact passages, window bases, and reviewer notes are in `data/b-track/amy-hood/advisor/event-candidates.json`; this table is only a compact audit index.

## TDD evidence

RED tests demonstrated that the previous implementation accepted:

- candidates without structured associations or a sourced decision-window basis;
- a direct reviewed import when the candidate matrix was missing;
- unrelated earnings and SEC artifacts as GitHub acquisition coverage;
- a generic Amy Hood mention as candidate-specific direct evidence.
- another speaker's quote merely because Amy Hood's name appeared nearby;
- a casual GitHub mention beside an unrelated acquisition;
- ambiguous grammar such as `Amy Hood disagreed with Satya Nadella, who said: ...` as if the quote belonged to Amy Hood;
- association-level discriminators that replaced the candidate's reviewed fingerprint with another event;
- an unreviewed fingerprint-source association masked by a reviewed association at another URL;
- an overly broad passage used in place of a strict event-specific passage;
- a generic Amy quote that borrowed a distant event-specific passage in the same document;
- an invented same-host final URL absent from the recorded redirect chain.

After the minimum implementation, `npx tsx --test tests/amyHoodAdvisorSourceCollection.test.ts` passes all 103 tests.

## Gate result

`npm run advisor:sources:check` exits nonzero by design and reports:

- 30 reviewed discovered URLs;
- 29 valid documents;
- one missing primary event artifact;
- all 30 candidates missing a different second collected source type;
- 70 URLs and 21 documents below the minimum.

No source padding, generic filing association, same-quarter substitution, or uncollected URL is counted toward completion.
