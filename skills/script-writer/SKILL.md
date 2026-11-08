---
name: marketing-factory-script-writer
description: Create and revise weekly short-form marketing script packages for Marketing Factory, reporting real stages to its dashboard. Use for the owner's factory writing tasks; default audience is Myanmar study-abroad agency owners buying AI or software services.
---

# Factory Script Writer

Work in the current Codex conversation. The factory is a monitoring and review interface, not another agent launcher.

Reporter: `node /Users/pyaesoneaung/Ideas/marketing-factory/scripts/factory.mjs`.
Read [the output contract](references/output-contract.md) before exporting. Server/bridge credentials are loaded privately from the project's environment; never display them.

## Start from the real brief

Use the task ID supplied by Laww. Otherwise register a task with `create --title "..." --worker script_writer --description "..."`. Run `start --task TASK_ID` and retain the returned run ID. Register only work the owner actually requested.

Defaults: Myanmar study-abroad **agency owners**, the owner's AI/software services, seven posts, Burmese narration with English metadata, four education + three demos, approximately 30–60 seconds each. Keep these configurable when the owner changes the campaign. Do not drift into marketing study-abroad services to students.

Read the user's brief, real offer, previous feedback and any supplied product evidence. Ask only for missing facts that materially change the content. Do not invent product features, business results, prices, clients, testimonials or urgency. A demo needs actual software or supplied prototype evidence. Source factual claims and record the checked date; distinguish personal advice from verified facts.

## Report and write

Before each actual stage use:

`event --run RUN_ID --type step.started --step STAGE --message "Short factual activity"`

After finishing it use `step.completed`. The stages are:

1. `audience`: agency-owner pains, objections, existing workflow, desired outcome and evidence gaps.
2. `strategy`: a week alternating education and demonstrations, with four education and three demos by default. Each post has one specific useful idea.
3. `hooks`: three truthful spoken hooks per post, one recommended choice.
4. `drafting`: hook → concrete problem → useful explanation or actual demo → CTA. Include narration, visual notes and captions/overlay guidance.
5. `quality_review`: review audience fit, repeated ideas, pacing, awkward Burmese, claims, product accuracy and CTA alignment. Use a fresh specialist subagent with [the review prompt](references/reviewer.md) when available and valuable; give it the brief and draft package, then resolve its substantive findings. Never confuse its review with owner approval.
6. `export`: write an immutable package revision and individual Markdown scripts under a task-specific output folder. Do not overwrite a revision already shown to the owner.

Import the draft with `package --task TASK_ID --run RUN_ID --file /absolute/package.json`, then report `review.requested` and `run.completed`. Generation is finished; approval is still pending. The dashboard stores the validated draft durably in Neon for remote review and export.

Show Laww the package link and unresolved evidence gaps. Owner approval applies to the exact artifact hash. Revisions create a new artifact and need new approval. Approved scripts become available for manual recording; never launch the editor, publish, or schedule automatically.

If reporting temporarily fails, the CLI buffers event metadata; use `flush` when connected. Do not claim the dashboard received an event merely because it was buffered. On actual task failure, report `run.failed` with a safe summary. Do not report heartbeat, reasoning, progress percentage or completion based on guesses.
