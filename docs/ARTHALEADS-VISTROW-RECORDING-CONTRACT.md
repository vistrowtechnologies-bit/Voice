# ArthaLeads changes for Vistrow Voice calls

Vistrow now sends one JSON webhook per completed call to
`POST /webhook/lead`. The receiver should treat `call_id` as an idempotency
key within the ArthaLeads organization identified by `token`.

## Incoming JSON

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
  "recording_url": "https://api.vistrowvoice.com/public/calls/947/recording?token=...",
  "recording_mime_type": "audio/wav",
  "extracted_data": {}
}
```

Unknown future fields should be ignored rather than rejecting the request.

## Backend/database changes

1. Add these fields to the ArthaLeads call/import table:

   - `external_call_id` (string or bigint)
   - `recording_url` (text, nullable)
   - `recording_mime_type` (varchar, nullable)
   - `page_path` (text, nullable)
   - `channel`, `language`, `agent_name`, `sentiment`
   - `duration_seconds`
   - `transcript_json` (JSON/JSONB)
   - `extracted_data_json` (JSON/JSONB)

2. Add a unique constraint such as
   `(organization_id, source, external_call_id)`. Re-sends must update the
   existing imported call instead of creating a duplicate lead or call.

3. Resolve/upsert the lead by normalized phone, then upsert its call row in
   the same transaction. Return a 2xx response only after both records are
   committed. A non-2xx response lets Vistrow mark the delivery as failed.

4. Store `recording_url`; do not try to store the private B2 key. The Vistrow
   URL is a stable bearer link that redirects to a fresh, one-hour B2 URL on
   every playback. If the receiver validates/fetches it immediately, retry a
   404 for up to 60 seconds because the recording upload completes just after
   the call webhook begins.

5. For SSRF safety, accept recording links only when HTTPS and host equals
   `api.vistrowvoice.com`. Never fetch an arbitrary URL supplied to the
   public webhook.

6. Do not invent property values when `extracted_data` is empty. Leave
   purpose/property type nullable or show `Not captured`; call #947 displayed
   `Buy` and `Apartment` even though Vistrow sent no such values.

## Field mapping

- Lead requirements/notes: `message`
- Transcript tab: `transcript`
- Calls tab duration: `duration_seconds`
- Calls tab audio player: `recording_url`
- Source page: site domain already associated with the connection plus
  `page_path`
- Agent/language/sentiment badges: matching top-level fields
- Property/purpose/budget/location: map only recognized keys from
  `extracted_data`; retain the full JSON for future fields

The Calls/Transcript modal should render an HTML audio player using
`recording_url`, show a useful unavailable/processing state for 404, and retry
once before declaring the recording missing.
