Build one decision-event card using only the supplied validated evidence spans.

Return JSON with title, decisionQuestion, situation, objectives, conditions,
constraints, options, chosenAction, rejectedBenefit, observations, and inferences.

Return exactly two options. Every option must contain id, description,
expectedBenefit, principalRisk, and selected. Mark exactly one option selected.
Use one concise item in each of objectives, conditions, constraints, observations,
and inferences. Keep every string factual and under 35 words. Observations must be
directly supported by evidence. Put interpretation only in inferences.

Do not mention later success, failure, or outcomes. Do not create citations or
facts that are absent from the supplied spans. Return JSON only without a code
fence or explanation.
