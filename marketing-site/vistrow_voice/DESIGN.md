---
name: Vistrow Voice
colors:
  surface: '#14121b'
  surface-dim: '#14121b'
  surface-bright: '#3b3842'
  surface-container-lowest: '#0f0d16'
  surface-container-low: '#1d1a24'
  surface-container: '#211e28'
  surface-container-high: '#2b2833'
  surface-container-highest: '#36333e'
  on-surface: '#e6e0ee'
  on-surface-variant: '#cfc2d6'
  inverse-surface: '#e6e0ee'
  inverse-on-surface: '#322f39'
  outline: '#988d9f'
  outline-variant: '#4d4354'
  surface-tint: '#ddb7ff'
  primary: '#ddb7ff'
  on-primary: '#490080'
  primary-container: '#b76dff'
  on-primary-container: '#400071'
  inverse-primary: '#842bd2'
  secondary: '#5de6ff'
  on-secondary: '#00363e'
  secondary-container: '#00cbe6'
  on-secondary-container: '#00515d'
  tertiary: '#ffb0cb'
  on-tertiary: '#640036'
  tertiary-container: '#ff479c'
  on-tertiary-container: '#58002f'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#f0dbff'
  primary-fixed-dim: '#ddb7ff'
  on-primary-fixed: '#2c0051'
  on-primary-fixed-variant: '#6900b3'
  secondary-fixed: '#a2eeff'
  secondary-fixed-dim: '#2fd9f4'
  on-secondary-fixed: '#001f25'
  on-secondary-fixed-variant: '#004e5a'
  tertiary-fixed: '#ffd9e3'
  tertiary-fixed-dim: '#ffb0cb'
  on-tertiary-fixed: '#3e001f'
  on-tertiary-fixed-variant: '#8d004f'
  background: '#14121b'
  on-background: '#e6e0ee'
  surface-variant: '#36333e'
typography:
  h1:
    fontFamily: Space Grotesk
    fontSize: 64px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  h1-mobile:
    fontFamily: Space Grotesk
    fontSize: 40px
    fontWeight: '700'
    lineHeight: '1.2'
  h2:
    fontFamily: Space Grotesk
    fontSize: 48px
    fontWeight: '600'
    lineHeight: '1.2'
  h3:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  label-caps:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1.0'
    letterSpacing: 0.1em
  mono-metric:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '500'
    lineHeight: '1.0'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 8px
  container-max: 1280px
  gutter: 24px
  margin-mobile: 20px
  margin-desktop: 64px
  section-gap: 120px
---

## Brand & Style

The design system is built on a "Dark Neon" aesthetic, blending the technical precision of a high-performance voice-agent SaaS with the warmth and vibrancy of Indian culture. It targets enterprise leaders and developers looking for a sophisticated, future-forward AI partner that feels local yet globally competitive.

The design style utilizes **Glassmorphism** and **High-Contrast Neon** accents against a deep, structural void. It evokes an emotional response of "Intelligence in the Dark"—where the UI acts as a subtle, premium stage for the vibrant, pulsing "voice orb" that represents the AI's life force. The interface is intentionally cinematic, using deep purples and high-saturation highlights to create a sense of depth and energy.

## Colors

The palette is anchored in a deep, layered dark theme. The background uses a near-black violet to maintain softness while providing maximum contrast for neon elements.

- **Primary (Violet/Purple):** Used for main actions, active states, and the core identity of the voice agent. 
- **Cyan (Accent):** Reserved for technical indicators, "live" status dots, eyebrows, and hyperlinks to represent clarity and connectivity.
- **Magenta (Highlight):** Used sparingly for high-attention callouts and premium feature tags.
- **Amber (Stats):** Dedicated to data visualization, currency symbols (₹), and performance metrics to ensure readability and warmth.
- **Surface Strategy:** Surfaces follow a "raised" logic—the more interactive or focused an element, the lighter and more violet-tinted the background becomes.

## Typography

This design system employs a high-contrast typographic pair. **Space Grotesk** is used for all headlines and numeric displays to give the product a technical, geometric edge. **Inter** handles all body copy and UI labels to ensure maximum legibility at small sizes, especially for multi-lingual content.

- **Headlines:** Should always be bold and tight. Use the negative letter spacing on larger sizes to create a "locked-in" editorial feel.
- **Eyebrows:** Use the `label-caps` style in Cyan (#22D3EE) above section headers to categorize information.
- **Metrics:** Financial data and voice-latency stats should use `mono-metric` to emphasize the precision of the AI.

## Layout & Spacing

The layout philosophy follows a **Fluid Grid** model with generous white (dark) space to allow the neon elements to "breathe" and glow.

- **Grid:** 12-column desktop grid with a 24px gutter. 
- **Padding:** Containers should use a minimum internal padding of 32px to maintain a premium feel.
- **Rhythm:** Spacing follows an 8px base unit. Component gaps should prioritize 16px, 24px, and 48px increments.
- **Mobile:** Content reflows to a single column with 20px side margins. Typography scales down significantly to ensure headings do not break awkwardly.

## Elevation & Depth

Hierarchy is established through **Tonal Layering** and **Luminous Accents** rather than traditional drop shadows.

1.  **Level 0 (Base):** #0B0912. The deep void.
2.  **Level 1 (Cards):** #17121F. Subtle 1px border (#2A2440).
3.  **Level 2 (Active/Hover):** #201B3B. Increased border opacity or a subtle violet glow.
4.  **The Voice Orb:** Uses a multi-layered radial gradient blur (violet) behind the element to simulate a light source that casts "ambient" light on nearby surfaces.

Avoid hard shadows. Use soft, high-spread blurs with low opacity (10-15%) in primary colors to simulate glowing light.

## Shapes

The design system utilizes a "Hybrid Radius" approach to balance structure and approachability.

- **Containers/Cards:** Fixed at 16px (`rounded-lg`) to create a professional frame.
- **Interactive Elements:** Buttons and tags use a full **pill-shape** (32px+), communicating a soft, "touchable" interface that mirrors the fluidity of human speech.
- **Inputs:** Use the `rounded-lg` (16px) standard to match card containers.

## Components

- **Buttons:** Primary buttons must use the 135° Violet Gradient. Text is white, bold. Secondary buttons use a #2A2440 ghost background with a Cyan border. All buttons are pill-shaped.
- **Voice Orb:** A 200px centered element using a #A855F7 to #7C3AED radial gradient. It should be surrounded by 2-3 concentric rings with 10% opacity, slightly pulsing.
- **Cards:** Background #17121F, Border #2A2440 (1px solid). No shadow on rest; on hover, the border changes to #A855F7 with a subtle outer glow.
- **Inputs:** Darker background than the card they sit on. Active state uses a Cyan glow for the cursor and a Violet border.
- **Chips/Tags:** Small, pill-shaped, using low-opacity versions of Cyan (for status) or Magenta (for highlights) with high-contrast text.
- **Status Dots:** "Live" agents should use a Cyan dot with a "ping" animation (an expanding, fading ring).
- **In-App Navigation:** Sidebars use #17121F with a blurred backdrop (Glassmorphism) if overlaid on the main content.