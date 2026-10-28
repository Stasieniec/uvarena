# uvarena round 2: design research and directions (2026-10-28)

Screenshots (kept in the design workspace, not in this repo): design-research/shots/ (references: hud-street-fighter-v-*, hud-dragon-ball-fighterz-*, hud-valorant-*, hud-the-finals-*, hud-rocket-league-*, hud-hades-*, lichess-storm-*, lichess-tv-*, chesscom-*, duolingo-*, tetrio-*, monkeytype-*, linear-*; our four round-1 explorations rendered as explore-*.png). Contact sheet: design-research/reference-sheet.png.

## Why round 1 looked vibe coded
- Tailwind defaults used verbatim (you teal-400 #2dd4bf, opponent orange-400 #fb923c, correct green-500, wrong red-500, muted slate-400) on navy with blue-grey cards. 44 rounded-2xl, 51 rounded-xl, 28 uppercase, 55 text-xs in the current code.
- Same visual weight everywhere, no focal point. In Lab terminal the pink power-ups outweigh the question.
- Rounded cards and pills everywhere, cards inside cards; small uppercase grey micro-labels on every section.
- HP drawn as a loading bar (or 30 tiny cells).
- An empty band between the question and the answers on every duel screen.
- Green means both "you" and "correct".
- Damage numbers float over other text ("-900" covers "Round 2 x1"; the red edge flash draws as a box round the opponent strip).
- Template landing: centred wordmark, a drawing of the app, two stacked buttons.

## Rules for every direction
- HUD fixed through arming, banner, question and reveal. Both players in ONE mirrored strip at the top (Street Fighter V, DBFZ, Valorant, Rocket League): about 140 px of bar each, a 72 px clock between. Bottom of the screen is answers and power-ups.
- Question sits directly above the options as one bottom-aligned block; spare height goes under the HUD. No empty band.
- Colour marks a player only. Correct = light filled block with a check; wrong = red with strikethrough; whose pick = small coloured tag.
- Monospace for numbers only. Labels sentence case, body size, muted; drop any label the adjacent number explains. Keep only "Select all that apply".
- Event words (round callout, "10 seconds", K.O.) big for 400 to 900 ms, then gone. Nothing glows at rest.
- Game feel from timing: hitstop freeze 80 to 100 ms on a hit, then the red chunk, then the drain. Shake only for hits >= 2,000 (6 px horizontal, 180 ms). Reduced motion keeps freeze and colour change, drops shake and slides.
- One primary action per screen. Corners 2 to 4 px; only avatars round. Every readout has a reserved slot, nothing floats over text.
- Phone first: 16 px side margins, 8 px spacing scale (4, 8, 12, 16, 24, 40), answer buttons >= 56 px. Google Fonts only.
- Keep: the copy, the reveal score line "You 900 · Them 0 · x1 = 900", power-up banners as the one loud place, 50:50's empty frames, the true/false layout.

## Direction 1: Instrument panel (Lab terminal tightened)  [researcher's pick]
References: Street Fighter V, The Finals (6 big health cells), Lichess Puzzle Storm (clock "-10"), Valorant combat report, Monkeytype.
- Palette: ground #0B0D0C, panel #141816, line #232826, text #E6EAE7, muted #8A938E, faint #5B635E (empty cells only), you #6EF0A0, opponent #F2B04A, damage/wrong/low time #FF5F56, correct = text-colour fill with dark text, power-up #FF8AD8 (only when armable/armed/firing), multiplier #F2E86D.
- Type: JetBrains Mono 500/700 for numbers only (clock 44/44 700 tabular; HP, damage line, round/multiplier 15/20 to 15/22). IBM Plex Sans 400/500/600: question 22/30 500 (24/32 true/false), options 17/24 400, names 15/20 600, secondary 13/18 muted, buttons 17/24 600.
- HUD strip 88 px, panel colour, flush top. Row 1: your name (green), "R6 x2" centre, their name (amber). Row 2: your 6 cells growing left from centre, a 72x40 clock block, their 6 cells growing right; HP numbers under each bar. Sound and surrender in a thin row above or a long-press on the clock.
- Below HUD: 40 px, question, 16 px, options. Options: panel fill, radius 4, faint "1" to "4" key hint, drop 2 px on press. Power-up row 48 px: panel tiles, grey name, 2 px pink left bar; spent struck through; during arming blind power-ups fill pink (text #120712) and pulse once.
- HP: 6 cells of 1,000 HP each, 20x14 px, 3 px gaps, partial cell partly filled. On a hit: HUD freeze 90 ms; lost part red 450 ms; drains toward centre 300 ms ease-in; cell outline flashes white one frame. Under the clock the line types in "900 − 0 × 2 = 1,800", then "−1,800" settles in red under the hit bar. Hits >= 2,000: HUD shakes 6 px 180 ms and a 4 px red line at the screen edge for 250 ms. Both right, speed only: muted line, grey chunk.
- Timer: clock block "14" at 44 px; under 5 s it fills red with dark digits and ticks. When the opponent answers: your digits snap to 10, "−4 s" in amber beside the clock for 900 ms, their name gets a filled square ("done"). 2 px drain line under the HUD as a second cue.
- Power-up picker: Hades-style 64 px rows: 32 px icon, name, one effect line with the number in text colour; selected row gets a pink left bar and a check; once three are picked the fourth dims. Banners cover only the centre zone so the HUD stays visible.
- Versus intro: diagonal hairline across the screen; you bottom-left in green (name, rating, three power-up names), them top-right in amber; "vs" on the seam in 15 px mono; names slide in 240 ms ease-out, cells fill 40 ms each, then "Round 1" replaces "vs".
- End screen: "6,000 · WIN · 0" in 52 px JetBrains Mono 700 (LOSS in red); "1540? → 1702?" with "+162" counting up 600 ms; stats as a plain table (grey label left, mono number right, hairlines); one primary button, the rest text buttons.
- Motion: hit freeze 90; chunk then drain 450 + 300; round callout in 120 hold 600 out 150; "−4 s" 900; button press 60; correct row lights 150; rating count 600 (ms).
- Do not: mono on sentences, names, nav or buttons; pink at rest; 30-cell or rounded bars; uppercase letterspaced labels; terminal costume (cursors, prompts, scanlines); green for correct.

## Direction 2: Broadcast (esports overlay)
References: Valorant score strip and end screen, Rocket League "30 SECONDS REMAINING!", Dragon Ball FighterZ versus split, The Finals summary, Riot button frame.
- Palette: ground #0E1013, plate #1A1E24, line #2A2F37, text #F2F4F7, muted #8C939E, you #3CE0C8 (dark text on it), opponent #FF4F5E (dark text only; white fails), event/power-up #FFD23F, correct = text-colour fill dark text, wrong = red outline with strike.
- Type: Barlow Condensed 600/700/700 italic (clock 48, HP 22, names 17 uppercase only on name plates and callouts, callouts 64 italic, WIN/LOSS 88 italic); Barlow 400/500/600 (question 22/30 500, options 17/24 500, secondary 14/20). Tabular numerals everywhere.
- HUD strip 64 px: teal plate left, clock plate centre, red plate right; inner ends of the side plates cut at 12 degrees (the only angled shapes in the app). 8 px square-ended bar under each plate, filling outward from the clock, tick every 1,000. Small yellow "x2" plate under the clock when > 1.
- Options: plate colour with a 3 px darker bottom edge (0 3px 0 #08090B), drop 3 px on press.
- Hit: freeze 100 ms; lost part white 60 ms, red 400 ms, drain 350 ms; >= 2,000 the hit plate shakes 8 px 200 ms. Damage readout: a yellow plate drops from the clock with "−1,800" at 32 px and "900 vs 0 · x2" under it; twice the size on a Bibi hit.
- Timer: clock plate red under 5 s; when the opponent answers "10 SECONDS" as a 40 px italic outline callout for 700 ms and the clock snaps to 10.
- Power-ups: three plates at the bottom; armable = yellow 1 px frame offset 3 px outside; armed = solid yellow. Picker: Hades rows with a yellow diamond icon.
- Versus intro: DBFZ diagonal split, teal and red halves at 20% opacity, "VS" 96 px italic on the seam; halves slide in 300 ms; "VS" lands from 1.3x to 1.0x in 180 ms with a 90 ms freeze; loadouts as plates.
- End: "6,000 VICTORY 0" in player colours (or DEFEAT); rating change as one big number with a rank bar under it; condensed stats table; primary button a yellow plate with the offset frame.
- Do not: angled shapes outside the strip and the versus seam; uppercase on questions, options or buttons; glow, flares, gradient plates; white on red; more than one yellow element at rest.

## Direction 3: Chess clock (Lichess flat)
References: Lichess TV and home, Puzzle Storm, Linear, the Chess.com button.
- Palette: ground #161512, panel #262421, raised #302E2B, line #3A3733, text #E8E6E3, muted #9A968F, you #58C98A, opponent #E8A33D, low time/wrong #E0524A, correct = text-colour fill, power-up #C792EA (only armable/armed).
- Type: IBM Plex Sans (question 22/30 500, options 17/24, names 16/20 600, secondary 14/20); IBM Plex Mono (clocks 36 600, HP 15, damage 20 600).
- Two 56 px player rows Lichess TV style, opponent on top, you below, both above the question: dot, name, rating, HP bar in the middle, an 88x40 clock block on the right. Question and options bottom-aligned as one block. Home: two big tiles (Ranked with your rating, Bot with the next bot), then flat rows, no section labels.
- HP: flat 10 px bar per row, gap every 1,000. Hit: freeze 80 ms; lost part lighter tint 500 ms; drain 300 ms. "−1,800" red inside that row before the clock; "900 − 0, x2" grey under the question. No shake; >= 2,000 the row flashes red at 20% for 200 ms.
- Timer: both clocks run, both lit. When the opponent answers their block goes dark and says "done"; your clock snaps to 10 with "−4" beside it for 900 ms. Under 5 s your block fills red.
- Power-ups: flat buttons, grey icon and name; armable = 2 px violet outline; armed = violet fill.
- Versus intro: the two duel rows appear with "Rated · Agentic AI · Round 1 in 3" between them, rows fade in 200 ms apart, bars fill 400 ms; the rows then become the HUD (no cut).
- End: rows stay on top; "You won"/"You lost" at 32 px; rating change in mono; Linear-style stats list with hairlines; one green primary button with a 3 px darker bottom edge.
- Do not: shake or callouts over 32 px outside banners; shadows or nested panels; decorative icons; chess imagery.

## Avoid in every direction
Tailwind default colours; rounded-xl/2xl/full except avatars; cards in cards; uppercase micro-labels; glow, shadows, gradients outside the power-up banners; floating numbers over text; one colour for both a player and a result; an empty band between question and options; sentences explaining the UI where a state change would do; a drawing of the app on the landing page (use the live HUD strip trading real hits instead); emoji icons.

## Recommendation (researcher)
Build direction 1, with the "answered" clock state from direction 3 and the diagonal versus screen from direction 2. Direction 2 is the most game-like but risks a Valorant copy; direction 3 is the clearest but the least game-like at rest.

## Sources
Fagerholt and Lorentzon, Beyond the HUD (Chalmers 2009); Jan Willem Nijman, The Art of Screenshake (2013); Jonasson and Purho, Juice It or Lose It (2012); Sakurai on hitstop (Famitsu col. 490); Street Fighter and Tekken health meter docs; interfaceingame.com game pages.
