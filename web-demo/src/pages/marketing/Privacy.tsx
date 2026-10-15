import { Link } from 'react-router-dom'
import { LegalLayout, LegalSection } from '../../components/LegalLayout'
import { BRAND } from '../../lib/brand'

const CONTACT_EMAIL = 'vistrowai@gmail.com'

// Every row names a provider the code actually calls (see
// docs/PRIVACY-AUDIT-2026-10-12.md). Rows marked optional only apply when the
// Customer turns that voice, model, tool or integration on.
const SUBPROCESSORS: { name: string; purpose: string; data: string }[] = [
  { name: 'LiveKit Cloud', purpose: 'Real-time voice transport, SIP, and hosting of the voice agent worker', data: 'Live call audio, call metadata' },
  { name: 'EnableX', purpose: 'Telephony / SIP for phone calls', data: 'Caller and callee phone numbers, call audio' },
  { name: 'Sarvam AI', purpose: 'Speech recognition, language model and voice generation', data: 'Call audio, transcripts, prompt text' },
  { name: 'OpenAI', purpose: 'Language model for agents, post-call analysis, knowledge-base extraction, the in-app assistant and the agent builder', data: 'Transcripts, knowledge-base and prompt text, assistant questions' },
  { name: 'Google (Gemini, Google Cloud Speech and Text-to-Speech)', purpose: 'Language model, speech recognition and voice generation for agents configured to use them', data: 'Call audio, transcripts, reply text' },
  { name: 'ElevenLabs', purpose: 'Voice generation for agents that use an ElevenLabs voice (optional)', data: 'Text the agent speaks' },
  { name: 'Tavily', purpose: 'Web search tool when a Customer enables it on an agent (optional)', data: 'Search queries written by the AI, which may include words from the call' },
  { name: 'Railway', purpose: 'Application servers and Postgres database', data: 'All platform data described in section 3' },
  { name: 'Backblaze B2', purpose: 'Call recordings, database backups, profile photos and support attachments', data: 'Recordings, backups, uploaded files' },
  { name: 'Vercel', purpose: 'Hosting of the website and dashboard; Vercel Web Analytics', data: 'Page requests, page paths' },
  { name: 'Razorpay', purpose: 'Payment processing; card details are entered with Razorpay, not with us', data: 'Name, email, amount, payment and invoice identifiers' },
  { name: 'Resend', purpose: 'Sending service emails and receiving replies to support tickets', data: 'Email addresses, email content' },
  { name: 'Google Analytics, Microsoft Clarity', purpose: 'Website and dashboard analytics, masked session replay', data: 'Pages viewed, clicks, scrolling, device and browser details' },
  { name: 'Tools a Customer connects: Google Sheets, Zoho CRM, Slack, ArthaLeads, webhooks', purpose: 'Deliver leads and notifications to the Customer’s own tools (optional)', data: 'The lead fields, summaries and, for some, transcripts and recording links the Customer chooses to send' },
]

const th = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-text'
const td = 'px-3 py-2 align-top text-sm'
const code = 'rounded bg-surface-high px-1.5 py-0.5 text-sm'

export function Privacy() {
  return (
    <LegalLayout
      eyebrow="Legal"
      title="Privacy Policy"
      updated="14 October 2026"
      path="/privacy"
      description="How Vistrow Voice collects, uses, shares, retains, and protects account, call, and integration data."
      intro={`${BRAND.name} (operated by Vistrow Technologies Pvt. Ltd.; "we", "us", "${BRAND.short}") builds AI voice agents that businesses use to answer and place phone calls. This policy explains what we collect, why, who else handles it, and the choices you have, whether you run a business on ${BRAND.name} or you spoke with an AI agent powered by it.`}
    >
      <LegalSection title="1. Who we are and who this policy covers">
        <p>
          <b>Customers</b> are businesses and people who sign up for {BRAND.name}. For their account,
          team and billing data we decide why and how the data is used (in DPDP Act terms, we are the
          data fiduciary).
        </p>
        <p>
          <b>Callers</b> are people who speak or chat with an AI agent that a Customer set up, by phone
          or through a website widget. The Customer decides who is called, what the agent asks, what is
          captured, whether the call is recorded, and how long it is kept. For that call data we act as
          the Customer's processor and follow their configuration. If you are a Caller and have a
          question about a specific call, contact that business first.
        </p>
        <p>
          Our contact details are in section 15. This policy does not cover other tools a Customer
          connects to {BRAND.name}; those have their own policies.
        </p>
      </LegalSection>

      <LegalSection title="2. AI processing">
        <p>
          Calls handled by {BRAND.name} are conducted by AI. To do that, call audio and text are sent to
          AI model and speech providers (section 6) that turn speech into text, generate the agent's
          replies, and turn replies back into speech. After a call, the transcript can also be sent to
          a language model to produce a summary, sentiment, outcome and follow-up suggestions.
        </p>
        <p>
          AI responses can be wrong. Our <Link to="/terms">Terms</Link> make Customers responsible for
          telling callers they are speaking to an AI where the law requires it. We do not sell call
          content or use it to advertise. What each provider may do with data it receives is governed by
          our agreement with it and its own terms.
        </p>
      </LegalSection>

      <LegalSection title="3. What we collect">
        <p><b>As controller (Customers and visitors to our own site)</b></p>
        <ul>
          <li><b>Account data</b> - name, email, optional phone number, password (stored only as a salted hash), role, workspace name, and how you heard about us. If you sign in with Google, GitHub or Slack we receive your verified email and name from them.</li>
          <li><b>Team data</b> - names, emails and roles of teammates you invite.</li>
          <li><b>Acceptance records</b> - which version of the Terms and Privacy Policy you accepted, and when.</li>
          <li><b>Sign-in and security data</b> - the devices and browsers signed in to your account (browser user agent, last-seen time) and security events such as sign-ins and sign-outs. We use IP addresses to rate-limit sign-in and sign-up requests. When you accept the Terms and this policy at sign-up, we record the time, the version you accepted, your IP address and browser user agent, and your confirmation that you are 18 or older and authorised to act for the business, as evidence of that acceptance.</li>
          <li><b>Billing data</b> - legal name, GSTIN, billing address and email, invoices, and payment and subscription identifiers from Razorpay. Card details are entered with Razorpay and are not stored by us.</li>
          <li><b>Support data</b> - tickets and messages you send, the page you were on, and attachments, which we delete 14 days after a ticket is resolved.</li>
          <li><b>Usage and error data</b> - API requests, error logs, and the actions the in-app AI assistant proposes and you approve.</li>
          <li><b>API keys</b> - only a one-way hash and a short prefix; the full key is shown once.</li>
          <li><b>Demo and contact requests</b> - details you submit on our website forms, which we email to our team.</li>
        </ul>
        <p><b>As processor (on behalf of a Customer)</b></p>
        <ul>
          <li><b>Call data</b> - call audio (only if the Customer turns recording on), live transcripts, call details (time, duration, channel, language), and the caller's phone number for phone calls.</li>
          <li><b>Details captured in the call</b> - fields the Customer's agent is set up to collect, such as name, phone, email, company, budget, location, timeline and appointment details.</li>
          <li><b>Call intelligence</b> - an AI-generated summary, sentiment, outcome, quality score and action items for a call.</li>
          <li><b>Caller memory</b> - if a Customer turns it on for a phone agent, a short summary kept against the caller's phone number so the agent can recognise a returning caller.</li>
          <li><b>Contacts and campaigns</b> - contact lists the Customer uploads or enters (including extra CSV columns), tags, notes, Do-Not-Call entries and outbound campaign progress.</li>
          <li><b>Website widget visitors</b> - the name, phone and email the visitor types, chat messages or voice, the page path (not the full address), and a record that the visitor accepted the voice-call notice.</li>
          <li><b>Knowledge bases</b> - documents, text and web pages the Customer gives the agent.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. How we use data">
        <ul>
          <li>To run the service: answer and place calls, run agents, show your dashboard, deliver leads to your connected tools, and book appointments in your {BRAND.name} calendar.</li>
          <li>To keep it secure and reliable: sign-in checks, abuse prevention, debugging, monitoring, and measuring how the product is used.</li>
          <li>To bill: invoices, tax records and payment reconciliation.</li>
          <li>To support you: answer tickets and, where needed, open a support session in your workspace (section 10).</li>
          <li>To communicate: service emails (verification, password reset, invites, receipts, alerts) and, only if you switch them on in your preferences, product updates.</li>
          <li>To comply with law and enforce our Terms.</li>
        </ul>
        <p>We do not sell personal data and we do not use it for third-party advertising.</p>
      </LegalSection>

      <LegalSection title="5. Recordings and transcripts">
        <p>
          Call recording is <b>off by default</b>. A Customer must turn on "Record calls" in their
          Compliance settings. Transcripts are produced for calls so the agent can respond and the
          Customer can review them in the dashboard. Recordings are stored in private object storage and
          played back in the dashboard through short-lived links. Links a Customer shares with a
          connected tool (such as a CRM or spreadsheet) last longer and work for anyone who holds them,
          until they expire (90 days after the call by default; the Customer can choose 7, 30 or 90 days
          or no expiry), the Customer revokes them, or the recording or call is deleted. Links sent
          before link expiry was introduced in October 2026 do not expire until the Customer revokes them.
        </p>
        <p>
          Customers are responsible for telling callers that a call is with an AI, recorded or
          transcribed, and for having a lawful basis for calling them. When a Customer records calls, the
          agent's opening line says by default that the call is recorded and that the caller is speaking
          with an AI assistant; the Customer can change that wording or turn it off. {BRAND.name} also
          offers a setting that makes the agent ask for spoken consent at the start of a call, and a notice
          and consent screen in the website widget before the microphone is used, which says the call is
          recorded only when the Customer records calls. The Customer decides which settings to use.
        </p>
      </LegalSection>

      <LegalSection title="6. Who else handles your data (sub-processors)">
        <p>
          We use the providers below to run the service. Some apply only when a Customer chooses a
          particular voice, model, tool or integration. Each handles data under its own contract or terms
          and our instructions.
        </p>
        <div className="w-full max-w-full overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[640px] border-collapse">
            <thead className="bg-surface-high">
              <tr>
                <th className={th}>Provider</th>
                <th className={th}>Purpose</th>
                <th className={th}>Data involved</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {SUBPROCESSORS.map((s) => (
                <tr key={s.name}>
                  <td className={`${td} font-semibold text-text`}>{s.name}</td>
                  <td className={td}>{s.purpose}</td>
                  <td className={td}>{s.data}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          We may also disclose data when the law requires it, or to protect rights, safety or the
          security of the service. The list changes as the product does; we update this page when it
          does.
        </p>
      </LegalSection>

      <LegalSection title="7. Google user data">
        <p>We use Google in two ways, and request only these permissions:</p>
        <ul>
          <li>
            <b>Sign in with Google</b> - scopes <code className={code}>openid</code>,{' '}
            <code className={code}>email</code> and <code className={code}>profile</code>. We read your
            verified email address and name to find or create your {BRAND.name} account. We do not keep a
            Google access token from sign-in.
          </li>
          <li>
            <b>Google Sheets integration (optional)</b> - scope{' '}
            <code className={code}>https://www.googleapis.com/auth/drive.file</code> (plus{' '}
            <code className={code}>openid email</code>, to show which Google account is connected). This
            scope only lets {BRAND.name} see files it created itself, never the rest of your Drive. We
            create one spreadsheet called "Vistrow Voice - Leads" in your Drive, format it, and add a row
            for each lead your agent captures (date and time, name, phone, email, company, channel,
            agent, language, duration, details, page, a recording link and call ID). We store the access
            and refresh tokens Google gives us so we can keep adding rows. We do not read your other
            spreadsheets, files, contacts or calendar.
          </li>
        </ul>
        <p>
          {BRAND.name} does not connect to Google Calendar. Appointments booked by your agents are kept
          in the calendar inside {BRAND.name}.
        </p>
        <p>
          <b>
            {BRAND.name}'s use and transfer to any other app of information received from Google APIs
            will adhere to the{' '}
            <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </b>
        </p>
        <p>In particular, for information received from Google APIs:</p>
        <ul>
          <li>We use it only to provide the user-facing features you asked for: signing you in and writing your leads to your own spreadsheet.</li>
          <li>We do not use it for advertising, including retargeting or interest-based ads, and we do not sell it.</li>
          <li>We do not allow people to read it, except with your consent for specific data, where needed for security (for example investigating abuse), to comply with law, or when it is aggregated and anonymised for internal operations.</li>
          <li>We do not transfer it to others except to provide these features, to follow the law, or as part of a merger or sale where you are notified. Leads written to your sheet go to your own Google account.</li>
          <li>We do not use it to develop, improve or train generalised AI or machine-learning models.</li>
        </ul>
        <p>
          To disconnect, use the Integrations page in your dashboard: we ask Google to revoke our access
          and delete the stored tokens. You can also remove access in your{' '}
          <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">Google Account permissions</a>.
          Disconnecting does not delete the spreadsheet or rows already in your Drive; you can delete
          them yourself.
        </p>
      </LegalSection>

      <LegalSection title="8. Where data is stored and international transfers">
        <p>
          {BRAND.name} is built for Indian businesses, but our providers process data in several
          countries. Our application database and hosting (Railway) and our recording and backup storage
          (Backblaze B2) are in the United States, and voice, speech and language providers process data
          in their own regions. This means account data, transcripts and recordings can be transferred
          outside India. The DPDP Act permits transfers except to countries the Government of India
          restricts, and we require each provider to protect data under its contract or terms. We do not
          currently offer India-only data residency.
        </p>
      </LegalSection>

      <LegalSection title="9. How long we keep data">
        <ul>
          <li><b>Calls (recordings, transcripts, captured details, call intelligence)</b> - kept until deleted. A Customer can set a retention period in days under Compliance settings; calls older than that are deleted automatically each day, together with their recordings, the integration delivery log entries for them, and any caller memory not refreshed by a call within that period. By default no period is set. A Customer can also delete a call's recording at any time.</li>
          <li><b>Contacts, notes, appointments and campaigns</b> - kept until the Customer deletes them or the account is deleted. The retention setting above does not remove these.</li>
          <li><b>Account data</b> - kept while the account is active and, after closure, for as long as needed to meet legal, tax and accounting obligations.</li>
          <li><b>Billing records</b> - kept as long as tax and accounting law requires.</li>
          <li><b>Support attachments</b> - deleted 14 days after the ticket is resolved. Ticket text is kept.</li>
          <li><b>Backups</b> - we take a daily database backup and keep each for 30 days, so deleted data can remain in a backup for up to that long.</li>
        </ul>
      </LegalSection>

      <LegalSection title="10. Security and support access">
        <p>What we do today:</p>
        <ul>
          <li>Data in transit is encrypted with HTTPS/TLS, and our responses tell browsers to use HTTPS only.</li>
          <li>Passwords are stored as salted hashes. Sessions use signed tokens in HTTP-only cookies and expire. You can see the devices signed in to your account and sign out the others.</li>
          <li>Workspace data is scoped to the signed-in workspace, with owner, admin, member and viewer roles.</li>
          <li>API keys are stored hashed.</li>
          <li>Actions proposed by the in-app AI assistant need your approval before they run, and are logged.</li>
          <li>
            <b>Support access:</b> authorised {BRAND.name} staff can open a time-limited support session
            ("view as") in your workspace to investigate a problem. It lasts at most two hours, shows a
            banner, appears in your list of signed-in devices where you can end it, is recorded in an
            audit log, and cannot delete data or change billing, team or API keys.
          </li>
        </ul>
        <p>
          No system is perfectly secure, and we do not currently claim any third-party security
          certification. See our <Link to="/security">Security page</Link> for the controls and the gaps.
          If a personal data breach affects data we hold, we will notify affected Customers without undue
          delay and as the law requires. To report a vulnerability, email{' '}
          <a href={`mailto:${CONTACT_EMAIL}?subject=Security%20report`}>{CONTACT_EMAIL}</a>.
        </p>
      </LegalSection>

      <LegalSection title="11. Your rights and how to use them">
        <p>
          Under the Digital Personal Data Protection Act, 2023, and similar laws elsewhere, you may have
          the right to access your data, correct it, have it erased, nominate someone to act for you, and
          have your grievances addressed. Customers can:
        </p>
        <ul>
          <li><b>Export data</b> - Settings has a data export that downloads your profile and, for owners and admins, workspace data (agents, calls, contacts, appointments, knowledge bases, billing summary).</li>
          <li><b>Correct data</b> - edit your profile, contacts and agents in the dashboard.</li>
          <li><b>Request account deletion</b> - Settings has a deletion request. We verify it is you, then review it within 2 business days of receiving it. You can cancel until we start processing it. We may keep what the law requires us to keep (section 9).</li>
          <li><b>Withdraw consent</b> - turn off optional emails in your preferences, disconnect integrations, or stop using the service.</li>
        </ul>
        <p>
          If you are a Caller, the business that called you or that runs the agent decides what happens
          to your call data. Ask that business first. If you contact us, we will pass the request to that
          business and help them act on it.
        </p>
        <p>
          <b>Grievances:</b> if you have a concern about how we handle personal data, write to{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> with "Privacy" in the subject and enough
          detail for us to find your data. If we cannot resolve it, you may complain to the Data
          Protection Board of India once it is operational.
        </p>
      </LegalSection>

      <LegalSection title="12. Cookies and similar technologies">
        <p><b>Essential.</b> When you sign in we set HTTP-only cookies to keep you signed in (up to 30 days) and to recognise your device in your list of signed-in devices (up to a year), plus short-lived cookies while you connect Google, Slack or similar services. The dashboard also stores display preferences (theme, sidebar, table widths, time zone) in your browser's local storage. Without these the dashboard will not work properly.</p>
        <p><b>Analytics.</b> On our website and app we use Google Analytics, Microsoft Clarity and Vercel Web Analytics to understand how the product is used: pages viewed, clicks, scrolling and, on our public website, session replays and heatmaps. Text typed into form fields and the live demo's transcript are masked. Inside the app all on-screen text is masked, so call transcripts, contacts and leads are not captured; sessions are tagged only with a workspace ID. Microsoft processes Clarity data under the{' '}
          <a href="https://privacy.microsoft.com/privacystatement" target="_blank" rel="noopener noreferrer">Microsoft Privacy Statement</a>. Google Analytics and Microsoft Clarity load only after you press Accept on our cookie banner; if you press Reject or do not answer, they are not loaded. We remember your choice in your browser's local storage; to change it, clear this site's data in your browser and choose again. Vercel Web Analytics does not use cookies or store anything in your browser, so it runs without that choice. We do not use advertising cookies.</p>
        <p><b>Website widget.</b> The widget on a Customer's site stores a note in your browser that you accepted the voice-call notice, and a flag that you dismissed its greeting for that tab. It sets no cookies. It sends the Customer's system the details you type into it. The Customer's own site can see the widget's events (for example that a call started or a form was submitted), but not the name, phone number or email you typed.</p>
      </LegalSection>

      <LegalSection title="13. Children">
        <p>{BRAND.name} is a business tool and is not directed at children. We do not knowingly collect personal data from anyone under 18. If you think a child's data has reached us, contact us and we will delete it.</p>
      </LegalSection>

      <LegalSection title="14. Changes to this policy">
        <p>We update the date at the top of this page when we make changes, and for material changes we notify active Customers by email.</p>
      </LegalSection>

      <LegalSection title="15. Contact us">
        <p>
          {BRAND.name} is operated by Vistrow Technologies Pvt. Ltd. Questions, requests and grievances
          about this policy: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. See also our{' '}
          <Link to="/terms">Terms of Service</Link> and <Link to="/security">Security page</Link>.
        </p>
      </LegalSection>
    </LegalLayout>
  )
}
