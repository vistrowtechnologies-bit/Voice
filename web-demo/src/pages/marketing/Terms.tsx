import { Link } from 'react-router-dom'
import { LegalLayout, LegalSection } from '../../components/LegalLayout'
import { BRAND } from '../../lib/brand'

const CONTACT_EMAIL = 'vistrowai@gmail.com'

export function Terms() {
  return (
    <LegalLayout
      eyebrow="Legal"
      title="Terms of Service"
      updated="13 July 2026"
      intro={`These terms govern your use of ${BRAND.name}, the AI voice-agent platform operated by Vistrow Technologies ("we", "us"). By creating an account or using the service, you agree to them.`}
    >
      <LegalSection title="1. The service">
        <p>{BRAND.name} lets businesses ("Customers") build AI voice agents that answer inbound calls, place outbound calls, and take calls from a website widget, in 30+ Indian languages. Customers configure agents, connect phone numbers and integrations, and manage calls through the dashboard.</p>
      </LegalSection>

      <LegalSection title="2. Accounts">
        <ul>
          <li>You must provide accurate information when signing up and keep your login credentials secure.</li>
          <li>You're responsible for activity under your account, including actions taken by teammates you invite.</li>
          <li>Account roles (Owner, Admin, Member, Viewer) determine what a teammate can do — set them appropriately.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Acceptable use">
        <p>You agree not to use {BRAND.name} to:</p>
        <ul>
          <li>Place calls in violation of applicable telecom regulations, including TRAI's Do-Not-Disturb/commercial-communication rules in India or equivalent rules elsewhere.</li>
          <li>Call numbers on a Do-Not-Call registry, including any list you've configured in your own Compliance settings — you are responsible for honoring it.</li>
          <li>Impersonate a person or business, or use the platform for fraud, harassment, or deceptive robocalling.</li>
          <li>Attempt to break, reverse-engineer, or overload the platform's infrastructure.</li>
          <li>Upload unlawful content to a knowledge base, or configure an agent to give unlawful, harmful, or deliberately false information to callers.</li>
        </ul>
        <p>We may suspend or terminate accounts that violate this section, with or without notice depending on severity.</p>
      </LegalSection>

      <LegalSection title="4. Compliance is your responsibility">
        <p>
          {BRAND.name} provides tools — a Do-Not-Call registry, calling-window enforcement, consent
          and recording toggles — to help you run outbound calling legally. Using these tools does
          not, by itself, guarantee legal compliance in your jurisdiction or industry. You remain
          responsible for obtaining any consent required before calling someone, disclosing AI
          use where required by law, and complying with telecom, data-protection, and
          consumer-protection regulations that apply to your business.
        </p>
      </LegalSection>

      <LegalSection title="5. Third-party integrations">
        <p>
          Connecting Google Calendar, Slack, WhatsApp, or any other integration is optional and
          governed by that provider's own terms in addition to ours. You authorize {BRAND.name} to
          access those services only for the purpose you connected them for (e.g. booking a
          calendar event, sending a notification), as described in our{' '}
          <Link to="/privacy">Privacy Policy</Link>. You can disconnect an integration at any time
          from the dashboard.
        </p>
      </LegalSection>

      <LegalSection title="6. Fees & billing">
        <p>{BRAND.name} runs on a credit-based plan: each plan includes a monthly credit allowance, and calls consume credits based on channel and duration. Fees are billed in advance and are non-refundable except where required by law. We may change pricing with notice; continued use after a price change constitutes acceptance.</p>
      </LegalSection>

      <LegalSection title="7. Your content & data">
        <p>You retain ownership of the content you upload (knowledge bases, prompts, contact lists) and the call data your agents generate. You grant us a license to process that content solely to provide the service to you. See our <Link to="/privacy">Privacy Policy</Link> for how we handle it.</p>
      </LegalSection>

      <LegalSection title="8. Intellectual property">
        <p>{BRAND.name}, its logo, and the underlying software are owned by Vistrow Technologies. These terms don't grant you any rights to our trademarks or source code beyond what's needed to use the service as intended.</p>
      </LegalSection>

      <LegalSection title="9. Disclaimers">
        <p>{BRAND.name} is provided "as is." AI-generated responses can be wrong — we do not guarantee an agent's answers are error-free, and you should not rely on it for advice where a mistake would cause serious harm (e.g. medical, legal, or financial advice) without human review. We don't guarantee uninterrupted or error-free service.</p>
      </LegalSection>

      <LegalSection title="10. Limitation of liability">
        <p>To the maximum extent permitted by law, {BRAND.name} and Vistrow Technologies are not liable for indirect, incidental, or consequential damages arising from your use of the service, including lost revenue or lost data. Our total liability for any claim is limited to the fees you paid us in the 3 months before the claim arose.</p>
      </LegalSection>

      <LegalSection title="11. Termination">
        <p>You may cancel your account at any time from Settings. We may suspend or terminate accounts for violating these terms, non-payment, or extended inactivity. On termination, your data is retained per our <Link to="/privacy">Privacy Policy</Link> and then deleted or anonymized, except where we're required to keep it longer by law.</p>
      </LegalSection>

      <LegalSection title="12. Governing law">
        <p>These terms are governed by the laws of India. Disputes will be subject to the exclusive jurisdiction of the courts of India, unless otherwise required by applicable law.</p>
      </LegalSection>

      <LegalSection title="13. Changes to these terms">
        <p>We'll update the date at the top of this page when we make changes, and for material changes we'll notify active Customers by email before they take effect.</p>
      </LegalSection>

      <LegalSection title="14. Contact us">
        <p>Questions about these terms: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
      </LegalSection>
    </LegalLayout>
  )
}
