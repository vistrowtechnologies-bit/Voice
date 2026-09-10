# Claude prompt: receive complete Vistrow Voice calls in ArthaLeads

Paste the following into Claude while it is working inside the ArthaLeads
repository:

---

Implement complete, production-safe ingestion of Vistrow Voice calls in the
ArthaLeads backend and UI. Inspect the existing repository and reuse its
current architecture, database conventions, authorization, API response
format, components, and test framework. Do not invent a parallel subsystem.

Current bug and expected outcome:

- `POST /webhook/lead` creates/updates the lead and transcript, but Vistrow
  recordings are not stored or displayed.
- Re-sending the same Vistrow call must update the same imported call, never
  create duplicate leads or call rows.
- ArthaLeads currently shows invented defaults such as `Apartment` and `Buy`
  when Vistrow sent no property type or purpose. Missing values must remain
  null/unspecified and display as `Not captured` or `—`.
- The lead detail modal must show the correct source page, transcript,
  duration, agent, language, sentiment, extracted lead facts, and a playable
  recording under the existing Calls/Transcript experience.

Vistrow sends this JSON to `POST /webhook/lead`:

```json
{
  "token": "AW-...",
  "name": "Test lead",
  "phone": "+919999999999",
  "email": "lead@example.com",
  "message": "Caller: ...\nAgent: ...",
  "transcript": [
    { "speaker": "Caller", "text": "..." },
    { "speaker": "Agent", "text": "..." }
  ],
  "sentiment": "neutral",
  "duration_seconds": 128,
  "channel": "Website Widget",
  "language": "hi-IN",
  "agent_name": "Siya KHOPOLI",
  "page_path": "/shapoorji-pallonji-plot-khopoli/",
  "call_id": 947,
  "recording_url": "https://api.vistrowvoice.com/public/calls/947/recording?token=OPAQUE_PER_CALL_TOKEN",
  "recording_mime_type": "audio/wav",
  "extracted_data": {}
}
```

Backend requirements:

1. Validate the existing ArthaLeads connection token and resolve its
   organization exactly as the endpoint does today.
2. Normalize the phone number and upsert the lead using the existing lead
   matching behavior.
3. Add/migrate fields on the appropriate imported-call/call table for:
   `external_call_id`, `recording_url`, `recording_mime_type`, `page_path`,
   `channel`, `language`, `agent_name`, `sentiment`, `duration_seconds`,
   `transcript_json`, and `extracted_data_json`.
4. Add an idempotency constraint equivalent to
   `(organization_id, source, external_call_id)`. The source is
   `Vistrow Voice`. Upsert the call by this key in the same transaction as
   the lead update. Preserve one call row per Vistrow `call_id` even when the
   phone number has many calls.
5. Store `recording_url`, not a B2 key and not downloaded audio bytes. It is a
   stable bearer URL which redirects to a fresh short-lived storage URL on
   playback. Treat it as sensitive and do not expose it in logs.
6. For SSRF safety, accept the recording URL only when its protocol is HTTPS,
   hostname is exactly `api.vistrowvoice.com`, and path matches
   `/public/calls/<numeric-id>/recording`. Reject or ignore every other host.
7. Do not synchronously download or HEAD-check the recording during webhook
   ingestion. Vistrow begins CRM delivery while the recording is being
   uploaded, so it can briefly return 404. Store the URL immediately. If the
   UI tries to play it before ready, show `Recording processing` and retry
   once after a short delay.
8. Return 2xx only after the database transaction commits. Return a clear
   non-2xx error for invalid token, validation failure, or persistence error
   so Vistrow records the delivery as failed.
9. Ignore unknown future JSON fields instead of rejecting the webhook.

Mapping rules:

- Lead requirements/notes: `message`
- Transcript tab: `transcript`
- Calls tab: create/upsert one imported call using `call_id`
- Audio player: `recording_url`; MIME fallback is `audio/wav`
- Website/page display: existing connected website/domain plus `page_path`
- Call badges/details: `duration_seconds`, `sentiment`, `channel`, `language`,
  `agent_name`
- Property/purpose/budget/location and similar lead fields: map only explicit,
  recognized values from `extracted_data`. Never use `Apartment`, `Buy`, zero
  budget, or another business default merely because a value is absent.
- Retain the full `extracted_data` JSON so new Vistrow fields are not lost.

Frontend requirements:

- In the lead detail modal’s Calls/Transcript area, show every imported
  Vistrow call separately.
- Add an accessible HTML audio player when `recording_url` exists.
- Show page path, duration, agent, language, sentiment, and call timestamp.
- Preserve the current modal scrolling; the final player/transcript must not
  be cropped at the bottom on common laptop widths/heights.
- Show `Not captured`/`—` for absent property fields instead of fake defaults.

Tests required:

- First webhook creates one lead and one imported call.
- Re-sending the same organization + `call_id` updates it without duplicates.
- Two different `call_id` values for the same phone create two calls on one
  lead.
- Recording URL and all call metadata persist and are returned to the modal.
- Empty `extracted_data` does not create `Apartment`, `Buy`, or `0 - 0`.
- Invalid token is rejected.
- Non-Vistrow recording host is rejected/ignored.
- UI renders the player and the missing/processing states.

Run the repository’s formatter, type checker, migrations, backend tests, and
frontend tests. Review the final diff for secrets and accidental unrelated
changes. Then commit and push the implementation, and report the migration,
API files, UI files, tests, commit hash, and deployment status.

---
