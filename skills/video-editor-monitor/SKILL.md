---
name: marketing-factory-video-monitor
description: Report an owner-requested run of the existing personal video editing pipeline to Marketing Factory and register its final Railway render for monitored Google Drive delivery. Does not replace the video-edit-pipeline skill.
---

# Factory Video Editor adapter

Use the existing `video-edit-pipeline` skill for all editorial and media work. Its engine is `~/.local/share/video-edit-pipeline`; its launcher is `~/.local/bin/video-edit`. Do not replace its code, change unrelated services or introduce different caption/render defaults.

Reporter: `node /Users/pyaesoneaung/Ideas/marketing-factory/scripts/factory.mjs`.

1. Register the owner-requested Video Editor task, or use its supplied task ID. Start its factory run with `start --task TASK_ID`.
2. Report actual editorial stages through `event --run RUN_ID --type step.started --step STEP --message "..."`, then `step.completed` when observed. Never infer stages from elapsed time.
3. Use an approved script revision where the task links one. The owner supplies narration and requested footage; preserve the recording contract and current editing instructions.
4. Obtain the task's explicit media-processing budget before any billed submission. A previous job's allowance does not authorize this job.
5. Use the existing engine's claims, private storage namespace and Railway workers. Keep heavy media processing remote. Submit previews and render through the existing workflow.
6. Attach the **final render** engine ID with `attach-video --run FACTORY_RUN_ID --engine-run-id ENGINE_RUN_ID`. Do not attach an inspection, speech or preview run as the final render. The factory worker reads status and artifacts; it does not launch or retry a render.
7. Keep required media checks, visual inspection and human listening status distinct. The factory validates the artifact manifest and measured QA; it does not certify Burmese word timing or human listening.
8. After attachment, remote engine status owns completion; do not send a local `run.completed` or `run.failed` to override it. A successful render becomes reviewable, and the separate delivery worker saves verified artifacts privately to Google Drive.

Rendering, owner review and Drive delivery are separate states. Transfer failure means delivery needs attention, not that rendering failed. Never rerender solely to retry Drive. Do not claim finished delivery until the verified Drive link exists. Stop only the exact dedicated media deployments through the original workflow after collecting results; the factory adapter has no Railway control permissions.
