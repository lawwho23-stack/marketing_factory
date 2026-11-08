# Weekly package contract

The canonical validator is `src/lib/domain.ts` in the Marketing Factory project. JSON uses `schema_version: 1` and these fields:

- `campaign_name`, `target_audience`, `week`: nonempty strings.
- `overview`, `research`, `review_notes`: strings. Preserve evidence gaps and review limitations.
- `scripts`: 1–14 scripts. Default seven, four `educational` and three `demo_or_proof`.

Every script contains:

```json
{
  "script_id": "w1-day-01",
  "day": 1,
  "category": "educational",
  "title": "A specific agency operations problem",
  "target_audience": "Myanmar study-abroad agency owners",
  "language": "my",
  "estimated_duration_seconds": 45,
  "hook_options": ["Hook A", "Hook B", "Hook C"],
  "selected_hook": "Hook A",
  "body_sections": [
    {
      "type": "problem",
      "voiceover": "Actual spoken Burmese text",
      "visual_direction": "What to show"
    },
    {
      "type": "insight",
      "voiceover": "Useful explanation or real demo",
      "visual_direction": "What to show"
    }
  ],
  "cta": "One clear next action",
  "overlay_text": [],
  "editor_notes": "Recording notes, privacy masks, pacing and actual assets",
  "claim_sources": []
}
```

IDs and day numbers must be unique. All scripts use exactly the package's audience string. The selected hook must match one of its three options. A source entry has `claim`, an HTTPS source `url`, and `checked_at` as YYYY-MM-DD. Add sources only after checking the page; avoid unsupported claims instead of filling the list with fictional URLs.

Markdown exports should preserve all hooks, selected hook, narration, visual direction, CTA, editor notes, overlays and sources. Approximate duration is an estimate until the owner records narration. Do not silently cut or speed up the later recording to match it.
