# Landing redesign — conversion-focused product page

**Unit:** torviello-landing
**Role:** engineer (ticket [0041](../../../torviello-roles/tickets/0041-rebuild-the-landing-page-as-a-conversion-focused-product-pag.md))
**Owner authority:** repository owner, 2026-11-03 — "this template and ux and
structure is so bad"; chose a full redesign toward a conventional
high-conversion developer-tool page with honest pending placeholders for
absent metrics (GOV-07.05 recorded change)
**Supersedes:** the *layout* requirements of
[`landing-board-composition.md`](landing-board-composition.md) (BC-01, BC-02,
BC-05, BC-07) — the board's panel-grid composition is retired as page
structure; the board remains the brand source (colors, type, photography)
**Carried forward unchanged:** BC-04 (no design-standard brand sheet on the
site), BC-06 (the pip/serve example stays visibly ILLUSTRATIVE), AC-BC-7
(the documented engine session is the only transcript presented as verified
behavior), the M4 audience destinations, and the house accessibility rules
(one primary action per view region, 44px targets, focus rings, landmark
structure, `prefers-reduced-motion`)
**Functional design:** [`torviello-design/specifications/landing-functional-design.md`](../../../torviello-design/specifications/landing-functional-design.md)
**Tokens:** [`torviello-design/contracts/design-tokens.json`](../../../torviello-design/contracts/design-tokens.json) — components consume semantic tokens only

## Amendment — 2026-11-03, second round (owner direction, GOV-07.05)

Owner authority (recorded on ticket 0041): "the design still need some
references, touches from the best website", "why i still see the card
overflow", "the header need to be better design not the documented engine
session", "footer also bad". Deltas to the requirements above:

- **LP-01 (amended):** the sticky nav renders as a floating glass pill
  (rounded container, brand hairline, blur) rather than a full-width bar; the
  menu-button behavior below 768px is unchanged.
- **LP-02 (amended):** the hero composes centered — badge chip, display
  h1, centered body, the inline rail, centered actions, trust line — and its
  visual anchor is a **decorative aria-hidden inference artwork** (abstract
  stream-and-nodes composition, no data, no claimed behavior), not the engine
  session. The hero renders no terminal.
- **LP-10 (new):** a dedicated **"A real session"** band renders the
  documented engine session (the only verified transcript on the page) in a
  centered terminal window with the caption naming it as such, between the
  proof band and the use-cases row.
- **LP-06 (amended):** the illustrative terminal's chrome gains a **Copy
  affordance** for the install command — a labeled chip that writes to the
  clipboard only on success and confirms with a "Copied" state; it presents no
  new behavior claims.
- **LP-08 (amended):** the footer composes as brand block + four link
  columns (Product, Resources, Community, plus the legal row), all resolving
  to the designated placeholder hosts, above an oversized decorative aria
  -hidden wordmark and a hairline legal bar.
- **LP-09 (amended):** section order is nav → hero → values → proof → real
  session → use cases → terminal band → CTA → footer; decorative artwork is
  `aria-hidden`; reveal animations sit behind `prefers-reduced-motion` and an
  IntersectionObserver with a forced-reveal fallback, so content is never
  permanently hidden.
- **Defect (all widths ≥1280):** audience-card content overflowed its card by
  ~47px (the action button crossed the card's bottom border) — `height: 100%`
  inside a `min-height` grid item resolves circularly; the card becomes a
  stretch container so the content fills and the card grows.

## Amendment — 2026-11-10, third round (owner direction, GOV-07.05)

Owner authority (recorded on ticket 0049): "please fix and improve the landing
page". A link audit (curl + GitHub API, 2026-11-10) found destinations that do
not resolve, and the 1440/390 screenshots show rhythm defects. Deltas:

- **LP-11 (new) — link reachability.** Every outbound link targets the public
  repository `https://github.com/Evintkoo/torch-inference` or a path inside
  it. The nonexistent `github.com/torviello` organization (HTTP 404) is never
  linked; the footer's Discussions entry (Discussions is disabled on the
  repository) is replaced by **Issues**; **API Reference** resolves to the
  published OpenAPI contract `torviello-engine/contracts/openapi.yaml`, not
  the generic docs tree. Supersedes the "designated placeholder hosts"
  wording in LP-08.
- **LP-12 (new) — content rail.** Every canvas section shares the nav's
  1200px centered content rail (the floating pill and the content start on
  the same left edge at ≥1280px), and every section title keeps a fixed
  `--tv-space-8` gap above the section content (the use-cases heading no
  longer touches the cards).
- **LP-02 (amended):** the rail stages use three visually distinct glyphs —
  DEVELOP `sliders`, DEPLOY `package`, INFER `zap` (the `box` and `package`
  glyphs are near-identical at chip size and read as a duplicate).
- **Defect (≤767px):** audience-card copy sat over the brightest parts of
  the photography; the phone scrim darkens the text region.

## Amendment — 2026-11-12, fourth round (owner direction, GOV-07.05)

Owner authority (recorded on ticket 0052): "the design still not met" and "the
landing page still not working intentionally so please redo". The page is
redesigned around one idea, **the path of a request**: an inference engine is
a pipeline (request, admission, model, result), so the page is composed as
that pipeline and every section answers one question a visitor asks of an
engine. Decision recorded: this amendment **supersedes LP-02, LP-03, LP-05,
LP-07, LP-09 (section order, reveal), LP-10 and the AC rows that test them**;
LP-01, LP-04, LP-06, LP-08, LP-11, LP-12, BC-04, BC-06 and AC-BC-7 are carried
unchanged. Brand tokens (midnight navy, Torviello orange, signal teal, Inter,
JetBrains Mono) and the logo are unchanged. Every fact on the page is drawn
from the engine contract (`torviello-engine/contracts/openapi.yaml`) or the
engine README; nothing is invented.

- **LP-02 (superseded) — Hero, the request path.** Asymmetric: a left-aligned
  display h1 "Built to infer." (one h1, no brand-name line, the final period
  is the only accent), a right-hand column with the approved-fact body copy,
  the Get Started primary and View on GitHub ghost actions and a two-item
  trust list (MIT licensed; Runs on your machine). Beneath, full width, the
  **request path**: an ordered list of four stages — Request, Admission,
  Model, Result — each with a one-line fact from the contract (loopback
  `127.0.0.1:8000`; bearer token required; single-flight load and
  reference-aware unload; result envelope or RFC 9457 problem document). The
  path is labeled as the contract's path, not a transcript. A single signal
  dot travels the path under `prefers-reduced-motion: no-preference`; with
  reduced motion the path is static and complete. Vertical below 1024px,
  horizontal from 1024px. No decorative artwork, no rail of icon chips.
- **LP-10 (superseded) — Documented session as proof.** Directly under the
  hero. A window with the documented engine session (the only verified
  transcript, labeled "Documented engine session") beside an annotated field
  list of the startup event (event, version, correlation_id, message) taken
  from that same event. Heading "A real session."
- **LP-03 (superseded) — Capability ledger (`#product`).** The four equal
  glass cards are replaced by a ledger: one row per engine route group with
  the HTTP route in mono, a plain-language purpose, and a status — Implemented
  (runs in today's non-production scaffold: catalog, acquisition, load
  lifecycle, classify, health, metrics) or In the contract (speech synthesis,
  speech transcription, detection, assistant proxy). A legend defines both
  statuses and a link opens the OpenAPI contract. No performance claims.
- **LP-13 (new) — Guarantees.** A section "Local by default." stating four
  contract facts as large typographic statements with their evidence in mono:
  loopback bind, authentication on and not disableable in the shipped
  configuration, RFC 9457 failures, no account or control plane.
- **LP-05 (superseded) — Audiences.** Three audience rows (builders, AI teams,
  real-world AI) as a typographic list, one action each with the M4
  destinations unchanged; no photography on the page (the media unit's photos
  stay available but unused). Anchor `#use-cases` is kept.
- **LP-04 (restyled, requirement unchanged).** The pending-benchmark band
  renders each slot as an empty measurement scale; values stay em-dash,
  pending, digit-free.
- **LP-07 (superseded) — Closing.** The orange gradient band is replaced by a
  midnight closing section with a hairline orange rule; same copy, inverse
  primary and ghost actions.
- **LP-09 (superseded):** section order is nav → hero → session → capability
  ledger (`#product`) → guarantees → proof → audiences (`#use-cases`) →
  terminal band → closing → footer. One h1, no h3. The scroll-reveal
  fade-in is retired (it was a generic template effect); the only
  non-user-triggered motion is the request-path signal dot, behind
  `prefers-reduced-motion: no-preference`.

| ID | Given | When | Then |
|---|---|---|---|
| AC-LP-10 | the hero | read | one h1; the path lists Request, Admission, Model, Result in order with a fact each; both actions keep their destinations; no icon-chip rail, no artwork |
| AC-LP-11 | the session band | read | the documented session and its four startup-event fields render; no illustrative label |
| AC-LP-12 | the ledger | read | every row has route, purpose and status; Implemented and In the contract rows both present; legend and contract link present; no digits-as-metrics |
| AC-LP-13 | the guarantees | read | four statements with mono evidence |
| AC-LP-14 | the audiences | read | exactly three rows, destinations as before, no images |
| AC-LP-15 | any width 320…1536 | rendered | 0px overflow, one h1, path signal animation declared only behind no-preference |

## Amendment — 2026-11-12, fifth round: code structure (owner direction, GOV-07.05)

Owner authority (recorded on ticket 0053): "landing page componentnya kok masih
ga best practices ya". This amendment is structural: it changes how the page
is built and **not what it renders** (the 8-width screenshots are the
characterization baseline). LP-01…LP-13 and every AC row are unchanged.

- **LP-14 (new) — Structure.** (a) The page composes only; every string,
  list and destination lives in `web/src/content/` as typed, readonly data
  (`landing.ts` with `satisfies`, `site.ts` for URLs, `types.ts` for the
  shared domain interfaces). (b) Components live in exactly three layers:
  `components/ui/` (primitives and small composites that carry no page copy:
  Button, Icon, Logo, NavLink, SectionLabel, TerminalLine, TerminalWindow,
  TerminalCard), `components/layout/` (the shell: LandingTemplate, NavBar,
  SiteFooter) and `components/sections/` (one landing section each). (c)
  Components take typed `Props` interfaces built from the domain types, not
  per-field strings; lists are keyed. (d) External-link attributes are written
  once (`lib/link.ts`, used by Button, NavLink and the footer). (e) Component
  styles are scoped `<style>` blocks beside the component; only tokens
  (`styles/tokens.css`) and the document base plus the shared section heading
  (`styles/base.css`) are global. Motion stays behind
  `prefers-reduced-motion: no-preference`. (f) One test file per component and
  per content/lib module.

## Amendment — 2026-11-12, sixth round: imagery (owner direction, GOV-07.05)

Owner authority (recorded on ticket 0054): "banyak image, kok ga ada image sama
sekali" — the fourth-round redesign removed all imagery and the page reads as a
text wall. Decision recorded: this amendment **supersedes the "no decorative
artwork" clause of LP-02 and the "no photography" clause of LP-05**; every other
requirement is unchanged.

- **LP-15 (new) — Imagery.** (a) The hero carries one real visual centerpiece
  between the promise and the request path: an illustration of the path itself
  (a line of light passing through four stages). It is the only eager image
  (`loading=eager`, `fetchpriority=high`). (b) Each audience row has a photo
  slot beside its text. (c) The closing band carries one image above its copy.
  (d) Every `<img>` has intrinsic `width` and `height`, a CSS aspect-ratio
  slot (no layout shift), meaningful alt text, `loading=lazy` unless it is the
  hero visual, and a focal point for its crop; photos ship as `<picture>` with
  webp sources and a jpg fallback. (e) No scrim is drawn where text does not
  overlap an image. (f) No fabricated product screenshots and no benchmark
  visuals; imagery lives in `torviello-media/assets/landing` with provenance in
  its README and is imported through the `@torviello/media` alias.

Owner direction (recorded on ticket 0055): "kenapa ga pake free dan opensource
images yang license-nya aman dipakai" — the hand-drawn plates are thin and the
middle sections carry no imagery. **LP-16 supersedes LP-15(a) and (c) only**
(the hero and closing visuals become licensed photographs); LP-15(b), (d),
(e) and (f) stand.

- **LP-16 (new) — Licensed photography.** (a) Real photographs replace the
  hand-drawn hero plates and the closing image, and three more fill the middle:
  one beside the ledger, one over the guarantees, one over the proof band. All
  are server-room, silicon, circuitry or light-path subjects, graded once to the
  brand duotone (midnight to orange) so they read as one set. (b) Every file
  under `torviello-media/assets/landing` has an entry in
  `provenance.json` carrying source URL, author, license id and license URL,
  retrieval date, original dimensions and the processing applied; the only
  license ids allowed for third-party files are `CC0-1.0`, `Unsplash`, `Pexels`
  and `Pixabay`, and the unit's own files use `LicenseRef-project-original`.
  Creative-Commons attribution/share-alike/non-commercial/no-derivatives
  licenses, editorial-only files, recognizable people and third-party marks are
  not allowed. (c) Each license is verified on the individual file page, not
  assumed from the site. (d) The footer carries an "Image credits" line
  naming the authors, although CC0 requires none. (e) Only the hero photograph
  is eager; every other image is lazy with `width`, `height` and a reserved
  aspect-ratio slot; photos ship as webp at two widths with a jpg fallback.
  (f) No fabricated screenshots or benchmark visuals.

## Use cases

- UC-LP-1 — A first-time visitor lands on the page, reads a one-line promise
  as the h1, and sees the documented engine session in a real terminal window
  beside the copy as immediate proof the product runs.
- UC-LP-2 — A evaluating visitor scans a headed "why" section of four value
  cards, then a proof band whose metric slots are explicitly marked pending
  until the first benchmark publishes.
- UC-LP-3 — A visitor comparing audiences scans the three use-case cards and
  reaches the docs, install, and GitHub destinations from their actions.
- UC-LP-4 — A visitor weighing installation reads the illustrative pip/serve
  example beside explanatory copy in a two-column band, with the visible
  illustrative label intact.
- UC-LP-5 — A convinced visitor reaches a dedicated call-to-action band and a
  structured footer with Product and Community link columns.
- UC-LP-6 — A visitor at any viewport from 320px to the 1536px reference gets
  the full page with no horizontal overflow, a sticky nav that collapses to
  the accessible menu below 768px, and no animation under reduced motion.

## Functional requirements

- LP-01 — **Sticky nav.** The navigation renders once at the template level,
  above all sections, and stays pinned (CSS sticky) while the page scrolls.
  Content: brand anchor, four fixed-order links (Product, Use Cases, Docs,
  Community), GitHub ghost action, Get Started primary action. Below 768px
  the links collapse behind the menu button with `aria-expanded`/`aria-controls`
  (unchanged behavior). The hero renders no nested nav.
- LP-02 — **Hero.** An unboxed full-width section on the canvas: eyebrow, a
  single-promise h1 ("Built to **infer.**" — the brand name is not an h1
  line; it lives in the nav), the approved body copy, the primary Get Started
  and ghost View on GitHub actions, a factual trust line under the actions
  (open source, runs on the visitor's machine), and a compact inline
  DEVELOP → DEPLOY → INFER rail between copy and actions (flow-connected,
  in normal flow — no absolutely-positioned chips, nothing clips). The right
  half renders the documented engine session (`torviello-engine --help`,
  `TORCH_PORT=8000 torviello-engine`, the real startup JSON event) in a
  terminal window labeled "Documented engine session" — the only transcript
  presented as verified behavior.
- LP-03 — **Value section (`#product`).** A headed section ("Why Torviello")
  rendering the four approved value props (High Performance, Flexible
  Deployment, Developer & AI Native Friendly, Built for Real Teams) as equal
  glass cards in a four-column desktop grid, two-column below 1024px,
  single-column below 640px.
- LP-04 — **Proof band.** A headed section ("Numbers, not claims.") with
  three metric slots (p99 latency, throughput, cold start). Each slot shows
  an em-dash placeholder value and a visible "first benchmark pending" state;
  a section footnote states no performance number is claimed until the first
  benchmark run publishes. The band MUST NOT render invented figures.
- LP-05 — **Use-cases row (`#use-cases`).** A headed section rendering
  exactly three equal-height audience cards with the approved eyebrows,
  headings, bodies, M4 actions, and torviello-media photography. All three
  cards share one scrim system (left-weighted gradient + bottom fade) so the
  photography is visible behind and beside the copy with consistent contrast,
  and each action aligns to the card bottom.
- LP-06 — **Terminal band.** A two-column band between the use-cases row and
  the CTA: left column carries an h2 ("Up and running in minutes."), body
  copy, and a Read-the-docs link; right column carries the pip/serve example
  terminal with the visible ILLUSTRATIVE label, prompt lines, and four-step
  status rail (unchanged M8 content). One column below 1024px.
- LP-07 — **CTA band.** A full-width closing band with an orange brand
  gradient: h2 ("Start building today."), one line of supporting copy, and
  the Get Started primary plus View on GitHub ghost actions.
- LP-08 — **Footer (`#community`).** A structured footer: brand column
  (wordmark, tagline), a Product column (Install, Docs), a Community column
  (GitHub, Discussions — both resolve to the designated placeholder hosts),
  and a bottom bar with the copyright. All footer links are real anchors with
  safe external attributes; no invented destinations.
- LP-09 — **Invariants.** Exactly one h1 and no h3 on the page; every action
  pairs an icon with its label; section order is nav → hero → values → proof
  → use cases → terminal band → CTA → footer; no breakpoint from 320 to 1536
  produces horizontal overflow; all decorative artwork is `aria-hidden`;
  animation only under `prefers-reduced-motion: no-preference`.

## Edge cases

- Reduced motion: no drift, glow, or rail animations; the page is static and
  complete.
- Missing photos: cards keep the glass surface and scrim so text stays
  readable without imagery.
- Very narrow viewports (320–375px): the hero rail wraps instead of
  overflowing; the terminal transcript scrolls inside its window rather than
  pushing the page wider.
- No benchmark data: the proof band renders pending states indefinitely —
  slots are filled only when real evidence exists (ED rule: no claimed
  numbers).
- Keyboard-only: sticky nav links, both hero actions, the terminal-band docs
  link, card actions, CTA actions, and footer links are reachable in DOM
  order; the skip link still targets `#main`; focus rings survive the
  gradients and photography.
- Ultra-wide (above 1600px): the canvas caps at 1600px and centers.

## Acceptance criteria

| ID | Given | When | Then |
|---|---|---|---|
| AC-LP-1 | the rendered page | the top of the DOM is inspected | the nav renders exactly once at template level inside a sticky wrapper, the hero section contains no nav, and the menu button collapses the links below 768px |
| AC-LP-2 | the hero section | its content is read | one h1 promising "Built to infer." with no brand-name line, the approved body copy, both actions, the trust line, the inline DEVELOP → DEPLOY → INFER rail in normal flow, and the documented engine session terminal with its startup JSON event |
| AC-LP-3 | the value section | its grid is inspected | the heading and all four value cards render; the grid is 4 columns ≥1024px, 2 columns below, 1 column below 640px |
| AC-LP-4 | the proof band | its slots are read | three metric slots each show a pending state and the footnote states no number is claimed before the first benchmark; no digits render as metric values |
| AC-LP-5 | the use-cases row | its cards are inspected | exactly three equal-height cards in one desktop row, one shared scrim system, actions at the card bottoms, destinations unchanged (install docs, docs, GitHub) |
| AC-LP-6 | the terminal band | its content is read | the h2, body, and docs link render left of the pip/serve terminal; the visible illustrative label, both prompt lines, and the four status steps are intact; one column below 1024px |
| AC-LP-7 | the CTA band and footer | their content is read | the CTA h2, supporting line, and both actions render on the brand gradient; the footer renders brand, Product, and Community columns plus the copyright bar |
| AC-LP-8 | the whole page | its landmarks and order are inspected | one h1, no h3, section order nav → hero → values → proof → use cases → terminal → CTA → footer, skip link to `#main` |
| AC-LP-9 | any width in 320…1536 | the page renders | scrollWidth − clientWidth ≤ 0, decorative artwork aria-hidden, animation declarations sit behind no-preference motion queries |

## Verification plan (GOV-07.04)

| Requirement | Check | Mode |
|---|---|---|
| LP-01, LP-09 | `LandingPage.test.ts`, `interaction.test.ts` (sticky wrapper, single nav, menu toggle) | automatic |
| LP-02 | `LandingPage.test.ts`, `HeroPanel.test.ts` (promise h1, trust line, rail order, documented session, no brand-name line, no clipped artwork) | automatic |
| LP-03 | `LandingPage.test.ts`, `FeatureStrip.test.ts` | automatic |
| LP-04 | `ProofBand.test.ts`, `LandingPage.test.ts` (pending states, no metric digits, footnote) | automatic |
| LP-05 | `LandingPage.test.ts`, `AudienceCard.test.ts`, visual QA card heights | automatic |
| LP-06 | `LandingPage.test.ts`, `interaction.test.ts` (illustrative label, prompts, rail) | automatic |
| LP-07 | `CtaBand.test.ts`, `LandingPage.test.ts` | automatic |
| LP-08 | `SiteFooter.test.ts` (columns, anchors, safe rel) | automatic |
| LP-11 | `LandingPage.test.ts` (every outbound href inside the public repository, no org or Discussions link), `SiteFooter.test.ts` (Issues, OpenAPI reference) | automatic |
| LP-12 | visual QA rail and title-gap probes at 8 widths (`web/scripts/visual-qa.ts`) | automatic + manual review |
| LP-09 | `bun run typecheck`, `bun run build`, visual QA overflow probe at 8 widths with screenshots | automatic + manual review |
| LP-14 | `content/landing.test.ts`, `lib/link.test.ts`, one test per component; build (scoped-style warnings), byte-near-identical screenshots at 8 widths against the pre-refactor baseline | automatic + manual review |
| LP-15 | `Picture.test.ts`, `HeroPanel.test.ts`, `AudienceList.test.ts`, `CtaBand.test.ts`, `LandingPage.test.ts` (sizes, alt, lazy/eager); visual QA overflow at 8 widths with viewed screenshots | automatic + manual review |
| LP-16 | `torviello-media/tests/unit/landing-provenance.test.ts` (manifest covers every file, allowed license ids, https URLs, dimensions, dates), `Picture.test.ts`, `HeroPanel.test.ts`, `CapabilityLedger.test.ts`, `Guarantees.test.ts`, `ProofBand.test.ts`, `CtaBand.test.ts`, `SiteFooter.test.ts`, `LandingPage.test.ts` (one eager image, lazy rest, sizes, alt, credits); visual QA at 8 widths with viewed screenshots | automatic + manual review |
| Repo health | `uv run --locked pytest …`, `uv run ruff check .` (5 pre-existing only), `torviello_roles check` | automatic |

Screenshots archive as evaluation evidence under
`torviello-landing/evaluations/reports/` on the ticket's report.
