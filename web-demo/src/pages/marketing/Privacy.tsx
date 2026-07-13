import { Link } from 'react-router-dom'
import { LegalLayout, LegalSection } from '../../components/LegalLayout'
import { BRAND } from '../../lib/brand'

const CONTACT_EMAIL = 'vistrowai@gmail.com'

export function Privacy() {
  return (
    <LegalLayout
      eyebrow="Legal"
      title="Privacy Policy"
      updated="13 July 2026"
      intro={`${BRAND.name} ("we", "us", "${BRAND.short}") builds AI voice agents that businesses use to answer and place phone calls. This policy explains what we collect, why, and the choices you have — whether you're a business running ${BRAND.name} or someone who spoke with an AI agent powered by it.`}
    >
      <LegalSection title="1. Who this policy covers">
        <p>
          <b>If you run a business on {BRAND.name}</b> ("Customer"), this covers your account,
          workspace, and team data.
        </p>
        <p>
          <b>If you called, or were called by, a {BRAND.name}-powered AI agent</b> ("Caller"), this
          covers the call recording, transcript, and any details the agent captured during that
          call. Our Customers, not {BRAND.name}, decide when and why to call you — for questions
          about a specific call, contact that business directly. We act as their data processor for
          this data, and as a controller only for the platform-level data described below.
        </p>
      </LegalSection>

      <LegalSection title="2. What we collect">
        <p><b>Account data</b> — name, email, phone, password hash (or OAuth identity if you sign in with Google/GitHub), workspace/company name, and role.</p>
        <p><b>Call data</b> — audio, live transcripts, call metadata (duration, timestamps, channel), and any structured fields your AI agent is configured to extract (e.g. name, budget, appointment time).</p>
        <p><b>Connected-integration data</b> — if you connect Google Calendar, Slack, WhatsApp, or a CRM webhook, we store the minimum needed to operate that connection (an OAuth token, a webhook URL) and the data your agent sends through it (e.g. a calendar event, a lead notification).</p>
        <p><b>Usage data</b> — pages visited in the dashboard, API requests, and error logs, used to keep the product working and secure.</p>
        <p><b>Payment data</b> — handled by our payment processor; we do not store full card numbers.</p>
      </LegalSection>

      <LegalSection title="3. How we use Google user data">
        <p>
          When you connect Google Calendar, {BRAND.name} requests the{' '}
          <code className="rounded bg-surface-high px-1.5 py-0.5 text-sm">calendar.events</code>{' '}
          scope solely to let your AI agent check real appointment availability and create calendar
          events on your behalf during a call — and for nothing else. We do not read, analyze, or
          share the content of your calendar beyond what's needed for that booking function.
        </p>
        <p>
          <b>
            {BRAND.name}'s use and transfer of information received from Google APIs to any other
            app will adhere to the{' '}
            <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </b>
        </p>
        <p>
          You can revoke {BRAND.name}'s access to your Google Calendar at any time from the
          Integrations page in your dashboard, or directly from your{' '}
          <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
            Google Account permissions
          </a>
          . Revoking access stops future bookings; it does not delete events already created.
        </p>
      </LegalSection>

      <LegalSection title="4. Why we process this data">
        <ul>
          <li>To operate the service — answering calls, running your AI agents, showing your dashboard.</li>
          <li>To improve reliability — debugging, monitoring, and analytics on how the platform is used.</li>
          <li>To communicate — service emails (password resets, invites, billing), and, if you opt in, product updates.</li>
          <li>To comply with law — tax records, responding to lawful requests, and enforcing our Terms.</li>
        </ul>
        <p>We do not sell personal data, and we do not use call recordings or transcripts to train third-party AI models beyond what's needed to generate that call's own response.</p>
      </LegalSection>

      <LegalSection title="5. Who we share data with">
        <p>We share data only with service providers who process it on our behalf, under contract, to run the platform:</p>
        <ul>
          <li><b>Speech &amp; language models</b> — OpenAI (conversation intelligence, extraction) and Sarvam AI (Indian-language speech-to-text/text-to-speech).</li>
          <li><b>Call infrastructure</b> — LiveKit (real-time voice transport) and EnableX (telephony/SIP).</li>
          <li><b>Hosting &amp; database</b> — Railway (application servers, Postgres database) and Vercel (web app).</li>
          <li><b>Email delivery</b> — Resend, to send account and notification emails.</li>
          <li><b>Integrations you connect</b> — Google Calendar, Slack, WhatsApp providers, or a CRM you configure — only the data needed for that specific integration to work, and only while it's connected.</li>
        </ul>
        <p>Each of these processes data under its own privacy commitments; we choose providers that meet industry-standard security practices.</p>
      </LegalSection>

      <LegalSection title="6. Data retention & deletion">
        <p>
          Call recordings and transcripts are kept until a Customer configures a retention period in
          their Compliance settings (default: indefinite, but a Customer can set an automatic
          purge window in days). Account data is kept for as long as the account is active, plus a
          reasonable period after closure for legal and accounting purposes.
        </p>
        <p>
          To request deletion of your data — as a Customer closing your account, or as a Caller
          asking about a specific call — email{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. We'll act on Customer-account
          deletion requests within 30 days; Caller requests about a specific business's calls are
          forwarded to that business, since they control that data.
        </p>
      </LegalSection>

      <LegalSection title="7. Your rights">
        <p>Depending on where you're located, you may have the right to access, correct, export, or delete your personal data, and to object to certain processing. Indian residents have these rights under the Digital Personal Data Protection Act, 2023; residents of other regions may have equivalent rights under local law (e.g. GDPR). To exercise any of these, contact us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
      </LegalSection>

      <LegalSection title="8. Cookies & similar technologies">
        <p>We use a single essential, httpOnly session cookie to keep you signed in — no third-party advertising or tracking cookies. Disabling this cookie will sign you out.</p>
      </LegalSection>

      <LegalSection title="9. Security">
        <p>Passwords are hashed, not stored in plain text. Session tokens are signed and httpOnly. Data in transit is encrypted (HTTPS/TLS). No system is perfectly secure, but we take reasonable, industry-standard measures to protect your data and will notify affected Customers of any breach as required by law.</p>
      </LegalSection>

      <LegalSection title="10. Children's privacy">
        <p>{BRAND.name} is a business tool and is not directed at children. We do not knowingly collect personal data from anyone under 18.</p>
      </LegalSection>

      <LegalSection title="11. Changes to this policy">
        <p>We'll update the date at the top of this page when we make changes, and for material changes we'll notify active Customers by email.</p>
      </LegalSection>

      <LegalSection title="12. Contact us">
        <p>
          {BRAND.name} (operated by Vistrow Technologies). Questions or requests about this policy:{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. See also our{' '}
          <Link to="/terms">Terms of Service</Link>.
        </p>
      </LegalSection>
    </LegalLayout>
  )
}
