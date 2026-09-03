# Dashboard responsive audit and implementation plan

Audited on 3 September 2026 against the authenticated tenant dashboard at:

- Mobile: 390 × 844
- Tablet: 820 × 1180
- Desktop behavior retained as the regression baseline

The audit combined rendered-page checks with source inspection so closed dialogs, expanded panels, empty states, and forms were included even when they were not visible in the tenant's current data state.

## Shared acceptance criteria

- No document-level horizontal scrolling at 320–1023px.
- Intentional horizontal regions must be visibly scrollable, keyboard accessible, and not hide the selected item.
- Primary controls have at least a 40px mobile hit area.
- Page headers preserve title hierarchy while actions wrap without clipping.
- Forms use one column on mobile and only add columns when fields remain readable.
- Data tables use stacked records through tablet widths; desktop tables begin at 1024px.
- Dialogs fit within `100dvh`, keep their close/action controls visible, and scroll internally.
- Fixed help UI must not cover primary content or form actions.
- Empty, loading, error, expanded, and populated states are tested at all three breakpoints.

## Route-by-route plan

### Phase 0 — Shared dashboard shell

- Increase mobile header/navigation hit areas.
- Prevent the help prompt from covering content on narrow screens.
- Move reusable tables to card mode through tablet widths.
- Verify sidebar drawer, account menu, global loading, notifications, and dialogs.

### Phase 1 — Dashboard (`/dashboard`)

- Keep header actions readable when wrapping.
- Constrain the customization popover to the viewport.
- Improve narrow-screen heading, quick-action, KPI, recent-call, and chart spacing.
- Check Overview and Analytics tabs, including empty and populated states.

### Phase 2 — Agents (`/dashboard/agents`, `/dashboard/agents/:id`)

- Replace clipped status filters with a wrapped mobile control group.
- Keep card titles, readiness information, and primary/secondary actions from competing.
- Stack editor navigation, form fields, voice/model pickers, test controls, and sticky actions.

### Phase 3 — Testing Lab (`/dashboard/testing`)

- Stack scenario and run panels through tablet widths.
- Make scenario chips, transcript/results, score cards, and action rows touch friendly.
- Constrain long generated text and loading/error states.

### Phase 4 — Voices (`/dashboard/voices`)

- Stack search, language, gender, and tier controls on mobile.
- Protect voice names/badges from preview and selection controls.
- Verify upgrade prompts and preview playback states.

### Phase 5 — Knowledge Base (`/dashboard/knowledge`)

- Remove narrow-screen minimum widths from URL/search inputs.
- Stack create/import actions and document metadata.
- Constrain extraction-review and document dialogs to the mobile viewport.

### Phase 6 — Inbound (`/dashboard/inbound`)

- Stack routing and schedule fields consistently.
- Wrap active-day controls and separate destructive actions.
- Reflow route status, number, agent, schedule, and edit controls on mobile.

### Phase 7 — Outbound (`/dashboard/outbound`)

- Make status filters wrap or expose an intentional scroll affordance.
- Recheck the three-step campaign builder, review summary, and bottom actions.
- Stack campaign controls and expanded contact outcomes cleanly.

### Phase 8 — Call history (`/dashboard/calls`, `/dashboard/calls/:id`)

- Use stacked call records through tablet width rather than a 1053px table.
- Reflow channel/search/direction/sort controls.
- Verify inline recording playback and make the detail modal full-screen on mobile.
- Keep transcript, diagnostics timeline, and related calls readable without horizontal clipping.

### Phase 9 — Contacts (`/dashboard/contacts`, `/dashboard/contacts/:id`)

- Replace the remaining raw mobile table behavior with stacked contact records.
- Stack filters/import/create controls and preserve whole-row navigation.
- Reflow detail summary, activity history, notes, and call links.

### Phase 10 — Appointments (`/dashboard/appointments`)

- Use an agenda/list presentation on mobile; retain the month grid when cells are readable.
- Convert side filters to compact wrapped controls.
- Stack creation fields and keep availability slots usable.
- Make appointment detail actions full-width on narrow screens.

### Phase 11 — Integrations (`/dashboard/integrations`)

- Reflow KPI cards and integration headers.
- Keep webhook URLs contained with accessible copy/reveal actions.
- Stack credentials, test, connect, and disconnect controls.

### Phase 12 — Website Widget (`/dashboard/website-widget`)

- Remove minimum-width field overflow and stack site actions.
- Reflow appearance, lead-capture, page-route, and install-code sections.
- Ensure code blocks scroll internally and preview controls remain visible.

### Phase 13 — Phone Numbers (`/dashboard/numbers`)

- Replace the clipped provider strip with a responsive provider selector/grid.
- Stack provider credentials, number creation, assignment, and test-call controls.
- Keep provider availability labels visible without forcing overflow.

### Phase 14 — Compliance (`/dashboard/compliance`)

- Stack rule summaries, calling windows, consent controls, and DNC creation fields.
- Reflow DNC records and their actions as mobile cards.
- Verify warning, blocked, and empty states.

### Phase 15 — Billing (`/dashboard/billing`)

- Stack balance, plan, usage, and invoice sections in decision order.
- Keep plan comparison and usage breakdowns readable on tablet.
- Constrain top-up and subscription dialogs to the viewport.

### Phase 16 — Settings (`/dashboard/settings`)

- Replace the overflowing horizontal tab rail with a wrapped mobile/tablet navigation grid.
- Stack profile, security, preferences, devices, team, availability, and privacy actions.
- Verify avatar controls, destructive confirmations, and device sign-out states.

## Verification for every phase

1. Run the production TypeScript/Vite build.
2. Run the frontend linter.
3. Check 390px, 820px, and desktop widths in the authenticated dashboard.
4. Exercise non-destructive interactive states for the page.
5. Confirm no new console errors and no document-level horizontal overflow.

