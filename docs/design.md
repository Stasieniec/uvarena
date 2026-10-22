# Ragequiz: game design

Working name Ragequiz, pending your pick below. Written 2026-10-22 for you to approve or change before anything is built.

## What it is

Two players get the same question at the same moment. Answer right and faster than the other person and they lose HP. First to zero loses, and ratings move like in chess.

Bot matches are the same duel against a bot, with their own rating. Every question you miss goes into a list you can review later, with the explanation and a link to the lecture note.

Launch courses: Agentic AI and Engineering Production-Ready ML/AI Systems. Each course has its own ratings and its own leaderboard. The game lives on its own subdomain, and notes.swasilewski.com carries on as it is.

A match takes about 3 to 5 minutes.

## Name

Each name was checked with a web search on 2026-10-22.

**Ragequiz** (ragequiz.swasilewski.com, repo `ragequiz`). Rage-quitting costs you rating here, so the name doubles as the warning label. No product found with this name.

**Olympass** (olympass.swasilewski.com, repo `olympass`). Mount Olympus, where Zeus lives, plus this year's actual goal: passing. No product found.

**Cram Royale** (cram.swasilewski.com, repo `cram-royale`). Clash Royale for people who open the slides the night before. No product found; it is a parody of Supercell's title, which is fine for a class game.

**uvarena** (uvarena.swasilewski.com, repo `uvarena`). UvA plus arena. Clear and local, but it reads a little like an official UvA product, and the closest search hit was a UV-filter company.

**Duelingo** (duel.swasilewski.com, repo `duelingo`). The joke lands instantly. No product found, but it is one letter off a large company's trademark: the only name here with real legal risk if the game ever leaves the class.

**ExamGuessr** (examguessr.swasilewski.com, repo `examguessr`). GeoGuessr for exams. No product found. It slightly advertises guessing, which is the one thing the game punishes.

**Elo Hell** (elohell.swasilewski.com, repo `elo-hell`). Where you end up when the class learns faster than you. A small 2019 indie game on Steam already uses the name.

**My pick: Ragequiz.** Short, says "competitive" in one word, no collision found. Olympass is the runner-up if you want the Greek theme to run through the name too.

## First visit and sign-up

The landing page is one screen: the name, one line ("Ranked duels on your course material"), a short looping animation of a Zeus strike, and two buttons: **Sign up** and **Log in**.

Sign-up asks for email, password (at least 8 characters), username, first name and surname. **Continue with Google** skips the email and password, and then asks only for a username, with first name and surname filled in from Google.

Verification: you get a verification email, and you can play straight away. A small banner asks you to verify until you do. (Decision below.)

A profile picture is optional. Until you add one you get your initials on a coloured circle. You can upload one later: pick a photo, crop it square, done.

After sign-up you land on Home with the course picker open, so you choose Agentic AI or Engineering first.

## Home

From top to bottom on a phone:

- **Your avatar and username**, a sound toggle, and a course switch: two pills, Agentic AI and Engineering. Everything below is for the selected course.
- **Ranked** card: your ranked rating (for example "1500?", the question mark means provisional), with two buttons: **Find a duel** and **Duel a friend**. Below them, how many people are searching right now.
- **Bot match** card: your bot rating and the next bot on your ladder, with a **Play** button.
- **Power-ups**: your three picked power-ups as icons. Tap to change them.
- **Missed questions**: "14 to review". Tap to open the list.
- **Recent matches**: the last three, with result and rating change.

A bottom bar has Home, Leaderboard, Missed and Profile.

If you have a match running (you refreshed, or switched phones), Home shows a red **Back to your match** bar at the top.

## Modes

Ranked play (against people) and bot matches are separate modes with separate ratings. Ranked looks red and gold, bot matches look blue, so you always know which one you are in.

### Bot match

1. Tap **Play** on the Bot match card. You see the bot ladder.
2. At the top is **Echo**, who always plays at your level ("repeats your level back to you"). Below are eight named bots, weakest first. Each is unlocked by beating the one before it.
3. Optional: a **Lectures** chip lets you limit questions to some lectures, for example only the ones taught so far.
4. Tap a bot. The match intro shows both players and both power-up loadouts for 4 seconds, then round 1 starts.

| Bot | Rating | Line |
|---|---|---|
| Icarus | 1050 | Flies at every answer. Lands in most of them. |
| Narcissus | 1200 | Admires his own wrong answers. |
| Sisyphus | 1350 | Almost there. Every time. |
| Pandora | 1500 | Opens every option to see what happens. |
| Odysseus | 1650 | Takes the long way, gets there. |
| Cassandra | 1800 | Always right. Nobody believes her. |
| Athena | 1950 | Did the reading. |
| Prometheus | 2100 | Stole the answer key. |

Stronger bots answer more correctly and faster. They get wrong the questions that people at their level get wrong, so they fall for the same tempting wrong options a classmate would.

### Ranked queue

1. Tap **Find a duel**. A searching screen shows the course, a timer, and how many others are searching.
2. The game pairs you with someone near your rating, and widens the allowed gap the longer you wait. After 45 seconds it takes anyone in the queue.
3. At 20 seconds with nobody else searching, it says so plainly and offers two buttons: **Send a friend a link** and **Play a bot instead**. You can also keep waiting.
4. When a match is found: "Opponent found", their card for 2 seconds, then the same match intro as above.

Ranked always uses all questions of the course, and always counts for the ranked rating.

### Private match with a friend

1. Tap **Duel a friend**, then **Create**. Settings: lectures (all by default), power-ups on or off, rated on or off.
2. You get a 6-character code in large letters (no 0, O, 1 or I, so nobody misreads it) and a **Share** button that sends a link, for example `ragequiz.swasilewski.com/join/K7Q4MX`.
3. Your friend opens the link or taps **Duel a friend**, then **Join**, and types the code. Not signed in yet? They sign in and land back in the lobby.
4. Both players see each other in the lobby and tap **Ready**. Then the match intro.
5. A lobby nobody joins expires after 15 minutes.

Rated by default: a private match with standard settings counts for both players' ranked rating, and the lobby says "Rated" at the top. Any custom setting (a lecture filter, power-ups off) makes it unrated. Only the first 5 rated games between the same two people per day count, so two friends cannot farm each other. (Decision below.)

## A duel, round by round

### The screen

Portrait phone, top to bottom:

- **Opponent strip**: their avatar, name and HP bar (orange).
- **Round line**: "Round 6 · x2" with the multiplier.
- **Question card** with the timer: a bar that drains across the top of the card, plus the seconds left.
- **Answer area** in the bottom half, where your thumb is.
- **Your strip**: your HP bar (teal) and your three power-up buttons.

Both players start at **6,000 HP**.

### One round

1. **Arming (3 seconds).** "Round 6" appears with the multiplier. Your blind power-ups (Zeus, Aegis, Nemesis) glow. Tap one to arm it before you know the question. Your opponent cannot see what you armed.
2. **Banners (1.5 seconds, only if someone armed something).** Armed power-ups are revealed with their full-screen line, to both players.
3. **Question.** The question appears and the timer starts: 15 seconds for true/false, 20 for single choice, 30 for multiple select, plus up to 10 seconds of reading time for long questions.
4. **Answering.** Tap an option and it is locked in. When either player answers, the other sees "Opponent answered" and their timer drops to **5 seconds** (or less if less was left). Someone who knows the answer barely notices. Someone searching their notes is in trouble.
5. **Reveal (5 seconds).** Both answers flip. The right option turns green, a wrong pick turns red, and your opponent's pick is marked with a small dot of their colour. Damage flies across, then one line of explanation. If you got it wrong, a small tag says "Saved to missed questions".

Running out the timer counts as a wrong answer.

### Score and damage

Each player scores the round:

- Right: 1,000 points for an instant answer, falling evenly to 500 at the buzzer.
- Wrong or timed out: 0.

The lower scorer takes the difference as damage, times the round multiplier:

| Case | Damage before multiplier |
|---|---|
| One right, one wrong | 500 to 1,000, by how fast the right answer was |
| Both right | 0 to 500, for being faster |
| Both wrong | none |

**Multiplier:** x1 for rounds 1 to 4, then up by 0.5 every round: x1.5 in round 5, x2 in round 6, x2.5 in round 7, and so on.

**Cap:** one round deals at most **3,000** damage (half your starting HP), or **4,500** in a Zeus round. So no single answer ends a match from full HP.

Example: round 6 (x2). You answer right after 4 of 20 seconds: 900 points. Your opponent answers wrong: 0. They take (900 - 0) x 2 = 1,800.

### Damage on screen

The HP bar loses a chunk that breaks off and fades, and the number ("-1,800") floats up from it. Hits over 2,000 also shake the screen and flash a red edge. A tiny "speed" hit (both right) shows as a small grey chip.

### End of match

A match ends when someone reaches 0 HP, someone surrenders, or someone leaves. If 20 rounds pass first (rare: most matches end in 9 to 14), more HP wins.

The end screen shows:

- **WIN**, **LOSS** or **DRAW** in large letters.
- Rating change, counting up or down: "1500? → 1662? (+162)" for ranked, or your bot rating for bot matches.
- A short summary: questions right, fastest correct answer, biggest hit, power-ups used.
- Buttons: **Rematch** (private and bot matches; both players must tap within 20 seconds), **Play again** (ranked: back into the queue), **Review missed (3)**, **Home**.

## Power-ups

Before a match you pick **3 of 6** power-ups. Each can be used once per match, and at most one per round (Phoenix, which is passive, does not count). Both loadouts are shown at the start of the match, so you know what your opponent could throw at you.

Everyone has all six from day one, in every mode, ranked included. Nothing is bought or unlocked.

Blind power-ups are armed in the 3 seconds before the question. Quick ones are used after you see the question, before you answer.

### Zeus (blind)

On screen: lightning down the middle, white flash, thunder, then **"ZEUS, STRIKE THEM DOWN!"** in giant gold capitals.

Effect: damage you deal this round is doubled, and the round's cap rises from 3,000 to 4,500.

If you deal no damage (you are wrong, or slower), it fizzles: "Zeus is unimpressed." It is spent either way.

Counterplay: Aegis halves it, Nemesis cancels it, and answering right yourself makes it hit for little.

### Aegis (blind)

On screen: a bronze shield slams into place. **"THE AEGIS HOLDS."** Smaller underneath: "Athena sends her regards."

Effect: damage you take this round is halved (after the cap).

Counterplay: it is a guess. If your opponent saved Zeus for later, you spent your shield on nothing.

### Nemesis (blind)

On screen: the opponent's banner cracks and shatters. **"NEMESIS HAS READ YOUR PLANS."**

Effect: cancels whatever your opponent armed this round, and their power-up is spent. It also stops their Phoenix this round.

If they armed nothing, Nemesis only stops their Phoenix this round, if they have one: "NEMESIS IS WATCHING." Without a Phoenix to stop, it is wasted.

Counterplay: arm nothing in the round you expect it. Two Nemeses cancel each other.

### Oracle (quick)

On screen, for you: wrong options crumble away. **"THE ORACLE HAS SPOKEN."** Your opponent sees a small banner: "They asked the Oracle."

Effect: removes wrong options. On a four-option question, two of the three wrong ones go. On multiple select, one wrong option goes. Not usable on true/false.

Counterplay: the banner tells your opponent you are unsure, and the seconds you spend on it count.

### Hermes (quick)

On screen: a streak of wind. **"HERMES IS ALREADY THERE."**

Effect: if you answer first this round, your opponent gets 2 seconds instead of 5.

Counterplay: answer before them. If you answer second, Hermes did nothing.

### Phoenix (passive)

On screen, when it triggers: flames rise from your empty HP bar. **"FROM THE ASHES!"** Underneath: "1 HP. Do not get excited."

Effect: the first hit that would knock you out leaves you at 1 HP instead. Once per match.

Counterplay: it is visible in your loadout, so your opponent knows they need one more hit. Nemesis in the same round stops it.

### Bots and power-ups

Bots pick a loadout too and play it simply: Zeus on a random round from 5 onwards, Aegis when they drop under half HP, Oracle on questions they are unsure of. Weak bots play power-ups badly on purpose.

## Ratings

There are two ratings per course, and they never mix.

### Ranked rating

- Everyone starts at **1500**.
- It moves only on rated matches against people: the queue and rated private matches.
- Win, loss or draw is what counts. How much you won by does not.
- Beating someone rated higher earns more than beating someone rated lower.
- **Provisional** at first, shown with a question mark ("1540?"). The first game moves it about 160 points. After about 10 to 15 games the question mark goes away, and a game moves it about 15 to 30.
- If you stop playing for weeks, it becomes a little less certain, so your next games move it more.
- Surrendering or leaving counts as a loss, with the full rating loss. Your profile also shows how many matches you left early.

### Bot rating

- Starts at **1500**.
- Moves after **every answer** in a bot match, by how hard the question was. A right answer on a hard question earns more than a right answer on an easy one, and missing an easy question costs more than missing a hard one.
- That means it measures how much of the course you know, and it settles within a few matches. It is provisional ("?") for your first 30 answers.
- The end screen shows the total change for the match. Your profile also shows the strongest bot you have beaten.

### Questions have ratings too

Every question starts at 1300 (easy), 1500 (medium) or 1700 (hard) and adjusts as people answer it. The game picks questions a little below the players' level, so you get roughly three out of four right when evenly matched.

## Missed questions

The duel never stops to teach. The reveal lasts 5 seconds. Everything you got wrong or let time out goes into **Missed questions**, which you open from Home, the bottom bar, the end screen or your profile.

### The list

- At the top: the course switch, a **Lecture** chip ("All lectures" by default), and a toggle between **To review** and **Learned**.
- A line like "14 to review" and a **Retry these** button.
- One card per question: the lecture, "missed 2x · 3 days ago", and the question, cut to three lines.

### One question

Tap a card. You see the full question and its options, with nothing marked yet, and two buttons:

- **Retry**: answer it again, untimed. Nothing about it touches any rating.
- **Just show me**: skip straight to the answer.

Then the answer view:

- Your answer from the match, in red. The right answer, in green.
- The explanation.
- Why the option you picked is wrong (every wrong option in the bank has its own reason).
- **Read in the notes**: opens the lecture note on notes.swasilewski.com at the right section, when that note exists.
- **Mark as learned**.

Getting a retry right marks the question as learned, with an **Undo** for 5 seconds. Missing it again in a later match moves it back to To review.

**Retry these** runs through the filtered list one question at a time, untimed, with the answer view after each.

## Profile, stats, history, leaderboards

### Profile

Your profile shows your avatar, username, first name and surname, then per course:

- Ranked rating and bot rating.
- Matches played, won, lost, drawn.
- Surrendered, and left early.
- Best win streak.
- Strongest bot beaten.
- Accuracy per lecture, as small bars: your weak lectures at a glance.

Other signed-in players can open your profile. On someone else's profile you also see your record against them ("You 7 · 4 Filip").

You can edit your username, names and picture from your own profile.

### Match history

A list of your matches: opponent (or bot), mode, result, rating change, date. Tap one to see it round by round: each question, both answers, both times, the damage, and which power-ups fired.

### Leaderboards

One per course, by ranked rating. Players who have finished their provisional games are listed first. Provisional players follow in a second section, "Still provisional", so the board is not empty in week one.

Bot ratings have no leaderboard. They measure what you know, and ranking them invites grinding.

## Disconnects, surrender, ties

- **Disconnect.** The match does not pause. Rounds keep going, and an unanswered round counts as wrong. Your opponent sees "Opponent disconnected · 0:38". If you come back within **45 seconds** you pick up exactly where the match is. Away for longer, you lose, with the full rating loss.
- **Phone locked.** Same rule. Checking a notification for 10 seconds costs you that round at most.
- **Both disconnected for 45 seconds.** The match is void: no rating change for anyone.
- **Never showed up.** If a matched player never connects within 30 seconds, the match is cancelled with no rating change.
- **Surrender.** A white flag button in the corner. Hold it for 1 second to confirm. It is an immediate loss with the full rating change.
- **Ties.** Only one player can take damage per round, so both cannot hit zero at once. After 20 rounds, more HP wins. Exactly equal HP: sudden-death rounds at the current multiplier until someone takes damage, up to 5 rounds, then a draw.
- **Second device.** Opening the match on another phone moves you there. The old tab says "Playing on another device".

## Question types on screen

All questions are closed form, and nothing needs computing by hand. Options are shuffled separately for each player, so "it's B" from across the room does not help.

**True/false.** The statement in large text. Two big buttons side by side: **True** and **False**.

**Single choice.** The question, then 3 or 4 full-width buttons stacked in the bottom half. One tap answers. There is no confirm step, because speed matters.

**Multiple select.** Labelled "Select all that apply". Options toggle on and off, then **Lock in**. The game does not say how many are right. You score only if your selection is exactly right.

**Fill the blank.** A sentence with a highlighted gap, and 3 or 4 options to fill it. Plays like single choice.

**Code options.** Options shown as short monospace blocks, at most 8 lines and narrow enough that nothing scrolls sideways.

**"Which is NOT"** questions show the **NOT** in bold red capitals, because under a timer it is easy to misread.

Ordering (put steps in sequence) and matching (sort items into categories) come after the first release.

Explanations come in two sizes: one line during the reveal, and the full explanation plus the reason for each wrong option in Missed questions.

A small flag on the reveal lets you report a question that looks wrong. Reports go to a list for whoever writes the next batch.

## Tone and look

- **Dark arcade.** Deep navy background, bright teal for you, orange for the opponent, gold for anything Zeus touches. Ranked screens carry red and gold, bot screens blue.
- **Type.** A carved Roman-capitals display font (Cinzel) for power-up lines and WIN/LOSS, a plain sans-serif for questions and buttons. Questions must read fast.
- **Theatrical, briefly.** Power-up banners are huge and loud, and gone in 1.5 seconds. The question is never covered while the timer runs.
- **Sound.** Short synthesised effects: thunder, shield clang, a tick in the last 5 seconds, a hit thud, a win fanfare. On by default, with a mute button on the match screen that the phone remembers.
- **Vibration** on hits, on Android phones that support it.
- **Reduced motion.** If your phone asks for less motion, shakes and flashes become fades.
- **Phone first.** Answer buttons in the thumb zone, at least 48 pixels tall, no hover-only controls, and the screen stays awake during a match. It works on a laptop too, with the same layout in a centred column.
- **Copy.** Dry and short. "Zeus is unimpressed." "Nobody else is searching." No exclamation-mark confetti outside the power-up lines.

## Not in the first release

Built later, in rough order of value:

- Ordering and matching question types.
- Points and a weekly points board, and daily streaks.
- Playing a bot while staying in the ranked queue.
- "Who is online", and a notification when a friend starts searching.
- Three more power-ups: Second Wind (a second try at half score), Kraken Ink (hides the opponent's options for 4 seconds), Ambrosia (heal 1,200 when below half HP). Also a casual-only Pandora's Box.
- Rating graphs on profiles.
- Cooldowns for people who keep leaving matches.
- Asynchronous challenges (answer the same 10 questions in your own time).
- Password reset if email sending is not set up by launch (see below).

## Decisions for you

**Name.** Ragequiz, Olympass, Cram Royale, uvarena, Duelingo, ExamGuessr or Elo Hell. My pick: **Ragequiz**.

**Private matches: rated or unrated?** (a) Rated by default with standard settings, unrated with any custom setting, at most 5 rated games per pair per day. (b) Unrated by default with a "rated" switch. My pick: **(a)**. Most games in a class this size will be friends challenging friends; with (b) almost everyone stays provisional all course.

**Damage cap and Zeus.** (a) Cap 3,000 per round, and Zeus doubles damage but cannot exceed it, so Zeus is useless from about round 8. (b) Zeus doubles the cap too (6,000), so a late Zeus can end a match from full HP in one blind guess. (c) Cap 3,000, and Zeus lifts that round's cap to 4,500. My pick: **(c)**. Zeus always matters, and never decides a match on its own.

**Do 2x2 payoff matrix questions count as computing?** For example: "Here is a 2x2 game with small whole-number payoffs. Which profile is the pure Nash equilibrium?" It is comparison at a glance, and probably what the exam tests. My pick: **allow them**, 2x2 only, pure strategies only, payoffs under 10, at most about 1 in 10 of the game theory questions. No mixed equilibria.

**Email verification.** (a) Send a verification email but let people play unverified, with a banner. (b) Block play until verified. My pick: **(a)**. Cloudflare's email service is in beta with an unpublished daily limit, and a lecture hall of sign-ups at once should not lock anyone out. Switching to (b) later is one setting.

**One rating per course, or one overall?** My pick: **per course**. They are different skills, and the queue is per course anyway.

**How the bot rating moves.** (a) After every answer, by question difficulty. (b) After every match, by win or loss against the bot's rating. My pick: **(a)**. It settles in a few matches instead of dozens, and multiplier luck does not leak into it. "Strongest bot beaten" gives (b)'s bragging right.

**Multiple-select scoring.** (a) All or nothing, without saying how many are right. (b) Partial credit per option. My pick: **(a)**. Under a timer, partial credit pays about half marks for tapping at random.

**Countdown after the first answer.** 3, 5 or 8 seconds. My pick: **5**. It is the main thing that makes looking answers up during a match a losing move.

**Where questions live in the vault.** (a) `docs/quiz/<course>/`, which the notes site already does not publish. (b) Next to the notes in `Courses/<course>/Quiz/`, which needs a change to the site so the answer files are not published. My pick: **(a)**. Nothing on notes.swasilewski.com changes, and a published answer file would let people look answers up mid-match.

**Full names on profiles.** Visible to other signed-in players, or username only. My pick: **visible to signed-in players**. It is a class game, and people want to know who "zeus_main_99" is.

**Starter questions.** Before lecture questions exist, the game ships with about 60 starter questions per course, written from the course descriptions and the Engineering slides already on Canvas. Keep them once real lecture questions arrive, or retire them. My pick: **keep them, and retire any that a lecture question duplicates**.
