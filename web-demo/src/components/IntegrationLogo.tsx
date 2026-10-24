import { Icon } from './Icon'
import arthaleadsIcon from '../assets/arthaleads-logo.png'
// Official Google Sheets product icon (Google's 2020 product branding),
// shown on a white tile as Google's brand guidelines ask.
import sheetsIcon from '../assets/google-sheets-logo.png'

const ICONS: Record<string, string> = {
  webhook: 'webhook',
  whatsapp: 'chat',
  sheets: 'table_chart',
}

/** The square logo tile for an integration, used on the Integrations list
 * and on each integration's own page. */
export function IntegrationLogo({ integrationKey, size = 'md' }: { integrationKey: string; size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 'h-14 w-14 rounded-xl' : 'h-10 w-10 rounded-lg'
  const tone =
    integrationKey === 'arthaleads'
      ? 'overflow-hidden'
      : ['slack', 'zoho_crm', 'sheets', 'facebook'].includes(integrationKey)
        ? 'bg-white shadow-sm ring-1 ring-border'
        : 'bg-primary/20 text-primary'
  return (
    <div className={`flex shrink-0 items-center justify-center ${box} ${tone}`}>
      {integrationKey === 'arthaleads' ? (
        <img src={arthaleadsIcon} alt="ArthaLeads" className="h-full w-full object-cover" />
      ) : integrationKey === 'slack' ? (
        <SlackLogo className={size === 'lg' ? 'h-8 w-8' : 'h-6 w-6'} />
      ) : integrationKey === 'zoho_crm' ? (
        <ZohoLogo className={size === 'lg' ? 'h-7 w-8' : 'h-5 w-6'} />
      ) : integrationKey === 'facebook' ? (
        <FacebookInstagramLogo size={size} />
      ) : integrationKey === 'sheets' ? (
        <img src={sheetsIcon} alt="Google Sheets" className={size === 'lg' ? 'h-8 w-8' : 'h-6 w-6'} />
      ) : (
        <Icon name={ICONS[integrationKey] ?? 'extension'} className={size === 'lg' ? 'text-[28px]' : 'text-[20px]'} />
      )}
    </div>
  )
}

function SlackLogo({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 122.8 122.8" className={className} aria-label="Slack" role="img">
      <path
        d="M25.8 77.6c0 7.1-5.8 12.9-12.9 12.9S0 84.7 0 77.6s5.8-12.9 12.9-12.9h12.9v12.9Zm6.5 0c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9v32.3c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V77.6Z"
        fill="#E01E5A"
      />
      <path
        d="M45.2 25.8c-7.1 0-12.9-5.8-12.9-12.9S38.1 0 45.2 0s12.9 5.8 12.9 12.9v12.9H45.2Zm0 6.5c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H12.9C5.8 58.1 0 52.3 0 45.2s5.8-12.9 12.9-12.9h32.3Z"
        fill="#36C5F0"
      />
      <path
        d="M97 45.2c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9-5.8 12.9-12.9 12.9H97V45.2Zm-6.5 0c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V12.9C64.7 5.8 70.5 0 77.6 0s12.9 5.8 12.9 12.9v32.3Z"
        fill="#2EB67D"
      />
      <path
        d="M77.6 97c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9-12.9-5.8-12.9-12.9V97h12.9Zm0-6.5c-7.1 0-12.9-5.8-12.9-12.9s5.8-12.9 12.9-12.9h32.3c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H77.6Z"
        fill="#ECB22E"
      />
    </svg>
  )
}

function ZohoLogo({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 70.419 24" className={className} aria-label="Zoho" role="img">
      <g transform="translate(-0.004 0.004)">
        <g transform="translate(16.48 -0.004)">
          <path
            d="M145.954,24a3.8,3.8,0,0,1-1.542-.33L133.055,18.6a3.79,3.79,0,0,1-1.918-5L136.2,2.242a3.794,3.794,0,0,1,5-1.918L152.56,5.386a3.8,3.8,0,0,1,1.918,5l-5.062,11.357A3.8,3.8,0,0,1,145.954,24ZM139.663,2.063a1.724,1.724,0,0,0-1.576,1.021l-5.061,11.357a1.726,1.726,0,0,0,.872,2.275l11.357,5.062h0a1.721,1.721,0,0,0,2.273-.872L152.591,9.55a1.726,1.726,0,0,0-.872-2.275L140.362,2.213A1.708,1.708,0,0,0,139.663,2.063Z"
            transform="translate(-130.808 0.004)"
            fill="#049849"
          />
        </g>
        <g transform="translate(50.411 3.98)">
          <path
            d="M416.423,51.642H403.989a3.793,3.793,0,0,1-3.789-3.789V35.419a3.793,3.793,0,0,1,3.789-3.789h12.434a3.793,3.793,0,0,1,3.789,3.789V47.853a3.793,3.793,0,0,1-3.789,3.789ZM403.989,33.7a1.723,1.723,0,0,0-1.722,1.722V47.852a1.723,1.723,0,0,0,1.722,1.722h12.434a1.723,1.723,0,0,0,1.722-1.722V35.419a1.723,1.723,0,0,0-1.722-1.722H403.989Z"
            transform="translate(-400.2 -31.63)"
            fill="#f6b11b"
          />
        </g>
        <path
          d="M20.593,25.171l-1.537,3.447.7,4.308A1.724,1.724,0,0,1,18.327,34.9L6.051,36.884a1.723,1.723,0,0,1-1.975-1.426L2.094,23.186a1.724,1.724,0,0,1,1.426-1.975l12.276-1.984a1.718,1.718,0,0,1,1.975,1.426l.685,4.241,1.537-3.447-.181-1.124a3.788,3.788,0,0,0-4.345-3.135L3.189,19.17A3.793,3.793,0,0,0,.053,23.516L2.037,35.79a3.791,3.791,0,0,0,3.732,3.187,3.9,3.9,0,0,0,.613-.049l12.274-1.984h0A3.793,3.793,0,0,0,21.793,32.6Z"
          transform="translate(0 -14.983)"
          fill="#e22728"
        />
        <g transform="translate(34.312 2.417)">
          <path
            d="M303.4,48.03h-.024a1.723,1.723,0,0,0-1.722,1.722v.771l1.328,9.755a1.723,1.723,0,0,1-1.475,1.938l-12.321,1.676a1.723,1.723,0,0,1-1.938-1.475l-.561-4.121-1.6,3.586.111.814a3.8,3.8,0,0,0,3.752,3.279,3.737,3.737,0,0,0,.514-.035l12.321-1.676A3.793,3.793,0,0,0,305.031,60Z"
            transform="translate(-283.489 -44.401)"
            fill="#226eb3"
          />
          <path
            d="M274.464,24.914a1.723,1.723,0,0,1,1.475-1.938L288.26,21.3a1.827,1.827,0,0,1,.233-.016,1.722,1.722,0,0,1,1.209.5,3.781,3.781,0,0,1,1.9-.945,3.8,3.8,0,0,0-3.621-1.587l-12.32,1.676a3.789,3.789,0,0,0-3.243,4.266l1.037,7.617,1.6-3.586Z"
            transform="translate(-272.381 -19.216)"
            fill="#226eb3"
          />
        </g>
      </g>
    </svg>
  )
}

// The Facebook "f" and the Instagram glyph, unaltered and in their brand
// colours (Facebook and Instagram brand guidelines). The Meta logo is not used:
// Meta's rules say it must not stand for Facebook and needs approval.
function FacebookInstagramLogo({ size }: { size: 'md' | 'lg' }) {
  const mark = size === 'lg' ? 'h-6 w-6' : 'h-[17px] w-[17px]'
  return (
    <div className="flex items-center gap-0.5" aria-label="Facebook and Instagram" role="img">
      <svg viewBox="0 0 24 24" className={mark} aria-hidden="true">
        <path
          fill="#0866FF"
          d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.69.24 2.69.24v2.97h-1.52c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z"
        />
      </svg>
      <svg viewBox="0 0 24 24" className={mark} aria-hidden="true">
        <defs>
          <radialGradient id="ig-glyph" cx="0.3" cy="1.07" r="1.3">
            <stop offset="0" stopColor="#FFDD55" />
            <stop offset="0.1" stopColor="#FFDD55" />
            <stop offset="0.5" stopColor="#FF543E" />
            <stop offset="1" stopColor="#C837AB" />
          </radialGradient>
        </defs>
        <rect x="1" y="1" width="22" height="22" rx="6.5" fill="url(#ig-glyph)" />
        <rect x="5" y="5" width="14" height="14" rx="4.2" fill="none" stroke="#fff" strokeWidth="1.8" />
        <circle cx="12" cy="12" r="3.4" fill="none" stroke="#fff" strokeWidth="1.8" />
        <circle cx="16.4" cy="7.6" r="1.05" fill="#fff" />
      </svg>
    </div>
  )
}
