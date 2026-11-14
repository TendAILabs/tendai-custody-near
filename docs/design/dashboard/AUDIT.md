# Dashboard audit: why design C reads as "generic AI dashboard", and the C2 fix

Date: 2026-11-10 (Asia/Bangkok). Design only, nothing built.
Compared: the built dashboard (stills `01M724...` consent, de-id, hospital, verification), mockup `mockups/C.html`, the locked landing (`../landing/A-indisea-like.html`) and the indisea.com study notes (`shots/key/`).
Note: the built stills still show the pre-restyle look (Inter-like face, teal Approve, pill-ish chips). The tells below apply to both the built app and C, except where marked.

## What the references actually do

| Area | indisea / our landing | The dashboard today |
|---|---|---|
| Type | IBM Plex Sans 600 at huge display sizes (124px hero, line-height .92, tracking -0.035em) against 15 to 17px body. Plex Mono for every label. | 28px H1 at most, everything else 14 to 16px. No contrast in scale. |
| Grid and rules | 12 col grid, 1200px wrap, 4px spacing steps, hairline rules, numbered eyebrows (`05 / HOW IT WORKS`). Structure comes from rules and whitespace. | Boxes. Every block is a white rounded card with the same border and padding. |
| Color | One signal green plus four fixed hues (teal, blue, violet, amber) that mean a role in the diagram. Navy blocks for weight. Colors are flat, never gradients. | Teal accent everywhere (buttons, logo, active tab), plus five pastel badge colors that mean nothing consistent. |
| Labels | 11px mono or semibold caps with numbering. Highlight marker on one phrase per screen. | Sentence-case sans labels, plus colored badges used as labels. |
| Density | Generous but ordered. A few big things, many tiny mono details. | Medium everywhere. Nothing is big and nothing is small. |
| Motion | Mask-rise headlines, a scroll spine that draws, line-draw on the diagram. Transform only. | None. |
| Signature | The spine, the routed diagram with hued branches, the highlight marker. | None of these appear. |

## Findings (tell, why it reads generic, fix)

1. **Default left sidebar, icon plus label, black active pill.**
   Why: this is the stock SaaS shell, and the icons (Lucide style) carry no information. The black filled active row is the same one every template ships.
   Fix: numbered mono index rail (`01 Clinic A`), a 8px role-colored square instead of an icon, and a live state word on the right (`SENT`, `OPEN`, `REVOKED`). Active row is white with a 4px signal-green bar on the left edge. The rail becomes a status board, not navigation chrome.

2. **Cards inside cards, one radius, one padding, everywhere.**
   Why: nothing is ranked. De-id screen is four boxes in a box. The eye has no entry point.
   Fix: three surface levels only. (a) Ruled sections: 1px ink rule on top plus a mono index label (`A  SHARED SECTIONS`), no box. (b) White panel with a 1px neutral border and 2px radius, only for editable content. (c) One navy panel per screen for the thing that matters (TEE summary, attestation, log). Radius 2px on panels, 4px on controls.

3. **Uniform type scale with nothing large.**
   Why: 28px H1 over 16px body is a 1.75 ratio. Landing uses about 8 to 1.
   Fix: 54px / 0.98 / -0.035em Plex Sans 600 page titles with one highlight-marker word (landing signature). 112px numeral for the latency. 11px mono caps for all labels. Body 15px, summary text 19px. Only five sizes: 11, 13.5, 15, 19, 54 (plus the 112 numeral).

4. **Generic teal as the only accent.**
   Why: teal on white is the default "health SaaS" accent, and it was also used for Approve, the logo, tabs and meters, so it meant nothing.
   Fix: green is reserved for one meaning, "verified / signal". Primary buttons are ink with a signal-green arrow (as on the landing). Teal survives only as the Clinic role hue. Role hues (teal clinic, blue hospital, violet second opinion, amber app) follow the landing diagram exactly. Red only for revoked and tamper.

5. **Badge soup.**
   Why: the clinic screen had SENT, EXAMPLE, WIRED LATER, DEMO KEY, plus a header badge, all outlined or tinted at the same weight. When everything is a badge nothing is a status. Strokes on small chips look heavy.
   Fix: (a) one persistent mono status strip at the top (`NEAR TESTNET · rr6c9910d7.testnet · FICTIONAL DATA · DEMO KEY`) replaces the per-screen EXAMPLE and DEMO KEY chips. (b) Status tags are flat, no stroke, 2px radius, 10.5px mono caps with a 6px square. (c) Hierarchy: only one solid-fill tag per screen (VERIFIED, REVOKED, BLOCKED). All the rest are quiet, text plus square, no fill (`■ PASS`, `■ SENT`).

6. **Default Tailwind greys.**
   Why: slate-500 text on slate-200 borders is the tell for generated UI.
   Fix: neutrals derived from the landing navy: `--mut #4A556B`, `--faint #626C80`, `--line #C9D0DB`, `--hair #DFE4EB`, `--sunk #EBEEF3`. Add real navy surfaces (`#1A2744`) with a 14px dot grid at 7% for the top strip, the summary, the attestation and the log.

7. **Centered or empty space, no grid discipline.**
   Why: C leaves a large blank right gutter on most screens, with content floating in a 1100px column. Spacing is eyeballed (14, 16, 18, 20, 22).
   Fix: 12 col grid, 40px page padding, 20px gutter, content fills the width. Header is 8 cols of type plus 4 cols of relay map. Spacing on a 4px base only (4, 8, 12, 14, 20, 24, 26, 40).

8. **Nothing borrowed from the landing.**
   Why: the landing has a signature. The dashboard has none, so it feels like a different product, which is the "template" feeling.
   Fix: (a) **Relay map** in every page header: the landing diagram shrunk to a live status board (Clinic, Maya, then three hued branches). Lines draw in, the active node pulses, revoked turns red, tamper breaks the line with an X. (b) Numbered mono eyebrows (`03 ── HOSPITAL B`). (c) Highlight marker on one title word. (d) Hairline rules plus a 72px signal-green stub under the header (the landing's 72x4 bar). (e) Navy top and bottom strips frame the canvas. (f) Custody log gets a green spine with ringed nodes in role hues.

9. **Icon-library glyphs and rounded everything.**
   Why: Lucide icons in the sidebar, checks and buttons, plus round dots and 8 to 16px radii, is the default kit.
   Fix: no icon font. Checks are a square-cap tick, arrows are square-cap 14px strokes in signal green, nodes are ringed circles only inside diagrams and the log spine. Toggles are square checkboxes. Buttons are rectangles (4px).

10. **Long disclaimer bar repeated on every screen.**
    Why: C's footer repeats two long sentences at 12px on every screen, which fights the content.
    Fix: one navy foot strip in mono: `Fictional data. Designed around HIPAA principles, not certified. De-identification is best effort, with a preview. Revoking cannot erase a copy already saved.`

## Screen by screen tells (built vs C)

| Screen | Tells in the build | C2 fix |
|---|---|---|
| Consent | Dark chips plus a yellow chip plus a green VERIFIED chip plus PENDING plus DEMO KEY on one card. Teal Approve. Summary in a grey box. | Square checkboxes (left-out one is hatched and struck). Summary is the one navy panel, 19px text, a mono proof bar (signature, model, round trip, signer). Ink Approve with green arrow. |
| De-id | Four equal cards in two rows, tiny icons, thick-outlined pills. | Redactions are inline black blocks with mono labels. After panel has an ink border. "What left the device" becomes a routed 4-node line like the landing diagram. |
| Hospital | Mosaic of six equal cards, some empty, task column of mini cards. | Navy verified summary on top, then ruled numbered sections in two columns. Tasks are a ruled list. |
| Verification | Mono dump inside a card, tiny 28px latency, PASS badges all solid green. | Navy attestation table, 112px latency numeral with a ruler, four checks as quiet numbered rows. |
| Timeline | Rows with 5 chip colors. | Green spine, ringed nodes in role hues, mono timestamps, on-chain tx as underlined links, quiet role tags. |
| Revoked | Three identical cards. | Table-like ruled holder rows with a 4px role bar, red tint and struck scope for the revoked row, a navy log showing the blocked open, plus what revoke does and does not do. |
| Tamper (new) | Not designed. | Red band, hash diff in red, checks 04 and 05 fail, relay line breaks. |

## What to keep from C
Calm light canvas (`#F4F6F8`), IBM Plex Sans plus Plex Mono, honest copy, signal green meaning "verified", all the content and flow. No font change: the landing and indisea both use Plex, so a different pairing would break the family. The character comes from scale, mono labels, rules, navy blocks and the relay map.
