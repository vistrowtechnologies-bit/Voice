# Google Sheets "Sign in with Google": one-time setup

The Integrations page's Google Sheets card connects by signing in with Google.
The server then creates a "Vistrow Voice — Leads" spreadsheet in the tenant's
Drive, and every reachable caller (end of call, with a phone or email) is added
as a row. The card shows "Sign in with Google" only once the steps below are
done. Until then, `/integrations/google_sheets/start` returns 404 "not
configured". The old Apps Script URL option still works.

## 1. Google Cloud project

Use the vistrowai@gmail.com Google Cloud project.

1. **APIs & Services → Library**: enable **Google Sheets API** and **Google Drive API**.
2. **OAuth consent screen**:
   - User type: **External**
   - App name: **Vistrow Voice**. Support email: the support inbox.
   - Authorized domain: **vistrowvoice.com**
   - Scopes: `openid`, `email`, `https://www.googleapis.com/auth/drive.file`
   - **Publish to production.** `drive.file` is a non-sensitive scope (the app sees only files it creates), so no security assessment is needed. Google may still ask for brand verification of the name and logo. Until the app is published, only listed test users can connect.
3. **Credentials → Create credentials → OAuth client ID**:
   - Type: **Web application**
   - Authorized redirect URI (exactly):
     `https://app.vistrowvoice.com/api/auth/oauth/google-sheets/callback`

   This URI uses the app domain on purpose, not `api.vistrowvoice.com`. The
   dashboard reaches the backend through the app domain's `/api` proxy (Vercel
   rewrite). The session cookie and the OAuth state cookie are host-only cookies
   on `app.vistrowvoice.com`, so the callback has to come back through the same
   host. Zoho's `ZOHO_OAUTH_REDIRECT_URI` works the same way.

## 2. Railway (service **Voice**)

| Variable | Value |
| --- | --- |
| `GOOGLE_SHEETS_OAUTH_CLIENT_ID` | the client ID from step 1.3 |
| `GOOGLE_SHEETS_OAUTH_CLIENT_SECRET` | the client secret from step 1.3 |
| `GOOGLE_SHEETS_OAUTH_REDIRECT_URI` | `https://app.vistrowvoice.com/api/auth/oauth/google-sheets/callback` |

## 3. LiveKit agent secrets (BOTH workers)

The live-call agent refreshes the Google access token itself, so it needs the
client ID and secret. Set them on **both** agents: `platform-demo`
(CA_53d8HgBktjZ7, web widget) and the unnamed default-dispatch agent
(CA_TGdpVhSdxDyS, phone calls).

```bash
cd agent
lk agent update-secrets --id CA_53d8HgBktjZ7 --secrets GOOGLE_SHEETS_OAUTH_CLIENT_ID=... --secrets GOOGLE_SHEETS_OAUTH_CLIENT_SECRET=...
lk agent update-secrets --id CA_TGdpVhSdxDyS --secrets GOOGLE_SHEETS_OAUTH_CLIENT_ID=... --secrets GOOGLE_SHEETS_OAUTH_CLIENT_SECRET=...
```

**Never add `--overwrite`.** Without it, `update-secrets` merges the new secrets
into the existing set. With it, the command replaces the whole set. That
happened to the phone worker on 2026-09-09. Check the exact flag syntax with
`lk agent update-secrets --help` before you run it.

The agent code must also be deployed to both workers (`lk agent deploy`).
`git push` only deploys the Railway server.

## What the owner sees

- **Sign in with Google** creates the sheet with a bold, frozen header row, a
  date-time first column (IST), a plain-text Phone column and set column widths.
- **Send test** adds a row named "TEST — safe to delete".
- **Disconnect** revokes the Google grant and forgets the tokens. The
  spreadsheet stays in the owner's Drive.
- Signing in again while connected keeps the same sheet if it still exists.
  If the sheet is gone, the server creates a new one.
- Failures show on the card. If access was revoked, the card says to sign in
  with Google again, and deliveries stop until the owner does. A deleted sheet,
  a missing permission and a disabled API each have their own message.
