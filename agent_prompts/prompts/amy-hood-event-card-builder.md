Build one decision-event card using only the supplied validated evidence spans.

Return JSON with title, decisionQuestion, situation, objectives, conditions,
constraints, options, chosenAction, rejectedBenefit, observations, and inferences.
Provide at least two concrete options and mark exactly one selected. Observations
must be directly supported by evidence. Put interpretation only in `inferences`.
Do not mention later success, failure, or outcomes. Do not create citations or
facts that are absent from the supplied spans. Return JSON only.
