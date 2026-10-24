// Premium marketing design kit. Data-driven sections that any marketing page
// template composes: split hero, proof tiles, bento, violet trust band,
// numbered timeline, text + visual rows, dashboard callouts, objection cards
// and the mobile sticky CTA. First used by /product/* (ProductShowcase.tsx),
// then /solutions/*.

export { Reveal } from '../Reveal'
export { SplitHero, HeroFacts, type HeroChip, type SplitHeroProps } from './SplitHero'
export { ProofStrip, type ProofTile } from './ProofStrip'
export { Bento, type BentoItem } from './Bento'
export { TrustBand, DEFAULT_TRUST, type TrustFact } from './TrustBand'
export { Timeline, type TimelineStep } from './Timeline'
export { FeatureRows, FeatureCards, FeatureList, SplitRow, type FeatureItem } from './FeatureRows'
export { DashboardCallouts, type Callout } from './DashboardCallouts'
export { CALLS_CALLOUTS, AGENT_CALLOUTS, CALL_DETAIL_CALLOUTS, CALLOUTS_BY_VIEW } from './callouts'
export { ObjectionCards, DEFAULT_OBJECTIONS, type Objection } from './ObjectionCards'
export { StickyCta, useStickyRefs } from './StickyCta'
export { WorksWithRow } from './WorksWithRow'
export {
  BookDemoLink,
  FigureCard,
  FigureStack,
  IconTile,
  ItemLink,
  LiveDot,
  RiskReducers,
  SectionHead,
  SectionNote,
  ShowcaseStyles,
  Shot,
  Waveform,
} from './primitives'
export { BOOK_DEMO_CLASS, TALK_CLASS, isPortrait, READING_PROSE, slugify, srcSetFor, withoutVendorNames } from './utils'
export {
  ArthaCard,
  Breadcrumbs,
  ReadingFeedback,
  ReadingHero,
  ReadingLayout,
  ReadingPrevNext,
  ReadingRelated,
  type Crumb,
  type ReadingLink,
  type TocItem,
} from './ReadingLayout'
