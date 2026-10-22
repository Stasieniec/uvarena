# Game mechanics for a ranked course quiz

Research and a design proposal for a quiz game on the UvA MSc AI courses "Agentic AI" and "Engineering Production-Ready ML/AI Systems". Both modes use the same duel, and each has its own rating:
- **Bot matches** (singleplayer): the duel against a bot. They have a bot rating and points.
- **Multiplayer:** GeoGuessr-style 1v1 duels against humans, through a matchmaking queue or a private match joined by code. They have a ranked rating.

Power-ups, inspired by the special weapons in PC Battleship games, are allowed in both modes, ranked included.

Written 2026-10-22. Sources are numbered and listed at the end. Where a source is weak (fan wiki, forum, third-party guide) the text says so.

Some numbers below come from a Monte Carlo simulation of the proposed duel: 10,000 to 20,000 games per setting, with answer times drawn as a Beta(2,3) fraction of the timer. The scripts are in `/tmp/claude-0/-home-user/fbce0390-f277-57c7-88e2-6f106eb756ae/scratchpad/sim/` (`duel.py`, `duel2.py`, `bot.py`). They are a sizing aid, and real matches will differ.

---

## Part 1: Research

### GeoGuessr Duels

**Core loop.** Both players see the same location each round and get one guess each. The closer guess wins the round, and the loser's health drops by the difference between the two round scores. Round scores run from 0 to 5,000 [6].
- At launch in 2021 each player had 6,000 HP, and a pin left on the map counted as a guess when time ran out, even if "Guess" was never pressed [1].
- Wikipedia's description of World Championship duels uses 5,000 HP [6], so starting HP depends on the format.

**Timer after the first guess.** A round has no short timer at the start. The countdown begins once either player locks in: 15 seconds at launch [1]. World Championship matches in 2023 and 2024 were 10 rounds of 60 seconds each [6]. Players have pointed out that the shrinking countdown hurts whoever guesses second [7]. The design rewards confident early guesses and forces the slower player to commit.

**Multipliers, as they evolved.**
- *Launch, November 2021:* a health round at round 5 healed the player instead of dealing damage, and damage multipliers doubled after it (2, 4, 8, 16, 32). Within days GeoGuessr cut the health round to "50% impact instead of 100%" and changed the ramp to 2, 3, 4, 5, 6 [1][2].
- *Until April 2026:* ranked duels used "mutual" multipliers that rose for both players as the match went on. I could not find an official per-round schedule for this period. A third-party guide claims a 1.5x multiplier on round 5 only (unverified), so treat the exact pre-2026 numbers as unknown.
- *February 2026:* Party Duels got an optional individual multiplier, where "only the player/team winning the round will see their damage multiplier increase to next round" [3].
- *April 2026:* GeoGuessr announced individual multipliers for ranked play from 1 April, with a better guess raising your own multiplier by +0.5x [5]. The 17 April patch notes confirm "individual Multipliers has now replaced Mutual Multipliers in Solo and Team Duels" [4]. Wikipedia's championship article gives the same 0.5x per round won for the 2026 season [6].
- *Healing rounds:* present at launch [1]. I found no official confirmation of whether ranked duels still have one, and third-party guides disagree.

**Round modifiers.** GeoGuessr's only modifiers are movement restrictions: Move, No Move (pan and zoom only) and NMPZ (no move, pan or zoom). Best-of-three World Championship matches play Move, then No Move, then NMPZ [6]. Ranked has no power-ups. Team Duels are a 2v2 variant [13], and they switched to individual multipliers in April 2026 along with solo duels [4].

**Solo play.** The official game's solo modes are classic maps, country streaks and Explorer mode [13]. I found no bot or AI opponent for duels in the official game. A third-party clone, GeoGuess.com, advertises duels against bots [58] (weak source).

**Ranked structure.**
- Ranked play has divisions (Bronze, Silver, Gold and higher) and an overall rating. Points gained or lost depend on the opponent's overall rating [8].
- The rating is hidden in Bronze and Silver and visible from Gold [8].
- Above Gold, separate Moving, No Move and NMPZ ratings exist "for statistics only": they affect neither matchmaking nor promotion [8].
- In 2024 Master and Champion moved to Elo thresholds: 900 for Master II, 1050 for Master I, 1300 for Champion, and Champions are not demoted [9]. A January 2026 change made Champion more exclusive [9].
- Players complain that the top tiers are far too wide (Champion runs from roughly 1200 to 2300) and that ranks only update at period boundaries [10][11].
- I found no official description of placement matches. A player comment says new accounts have to play a number of games before their rank rises, which cut down on alt accounts [10].
- Tournament play does not affect rating [12].

**Leaving a game.** I found no official statement on how a ranked duel is scored when a player leaves or disconnects.

**What players like and dislike.** The clearest record is the feature request "No multipliers in competitive duels". It got 58 votes and was closed by staff in November 2025: "We do not currently plan on removing Multipliers in Ranked Duels" [7].
- *Against multipliers:* they "turn the whole thing into a game of luck"; strong early rounds count for little; single rounds can deal huge damage. Proposals included a per-round damage cap and a slower ramp.
- *For multipliers:* late rounds stay meaningful and tense, and "Multis incentivise players to learn smaller countries".
- *Elsewhere:* the top tiers are too wide, there are smurfs and cheaters at high ratings, and climbing brings little reward [10][11].

### Chess rating: Lichess and chess.com

**Lichess** uses Glicko-2. The values below come from the Lichess source code [15][16], which is more reliable than forum lore.
- **Defaults:** a new player starts at rating 1500, deviation (RD) 500, volatility 0.09. The FAQ phrases this as "1500 ± 1000", a 95% interval [14][15]. Tau, the Glicko-2 system constant, is 0.75 [16].
- **Provisional:** a rating shows "?" while RD is 110 or more [16]. RD can return to provisional after roughly a year without games [14]; the code tunes RD growth so that "a typical player's RD goes from 60 -> 110 in 1 year" [15].
- **Limits:** RD between 45 and 500; rating between 400 and 4000; at most 700 points change in one game [15].
- **Leaderboards:** at least 30 rated games in that rating, a rated game in the last week, RD below 75 (65 for variants), and top 10 [14][15].
- **Special defaults:** a new player's first pairing uses a virtual 1450, so the expected score is 50% without changing the real rating. Students in a Lichess class start at 800 with RD 400. Bot accounts default to 3000 [15].
- **Separate ratings** exist for each time control and variant [14].
- **Disconnects:** rating lost to lag or disconnection is not refunded. A game is aborted if Lichess itself restarts. Frequent aborters get temporary play bans [14].
- **Cheater refunds:** when an account is marked, opponents who lost rating to it in its 40 most recent rated games from the last 5 days get points back, capped at 150 [14].
- **Behaviour tracking** (the playban module [18]) records outcomes per player:
  - rage-quit;
  - "sitting", meaning letting the clock run instead of resigning: triggered after one tenth of the estimated game length, clamped between 30 seconds and 3 minutes of inactivity;
  - no-start and abort;
  - "quick resign", logged as a `Sandbag` outcome when a game is resigned before roughly a third of its expected length (at most 60 seconds).

  Temporary bans follow when bad outcomes exceed a tolerance, which is stricter for new and untrusted accounts.

**Lichess puzzles.** Each attempt is rated as a game between the player and the puzzle: solving is a win for the player, failing a win for the puzzle, and both Glicko-2 ratings move [17][19]. Details from the code [17]:
- The puzzle's rating only updates when the solver is not "dubious", and updates are rate-limited to 300 per user per day.
- A "clueless" player (RD 230 or more) does not move puzzle ratings, so new accounts cannot drag them around [16][17].
- Updates are damped: themed puzzles that hint at the solution move ratings less, and obvious ones (mate in 1) much less. When the puzzle itself is provisional, the player's update shrinks further (by 0.2 on a win, 0.7 on a loss).
- A puzzle's rating changes by at most 700 per attempt.

**chess.com.**
- Uses Glicko. Rating change depends on the rating gap, the confidence in your own rating and the confidence in your opponent's, and confidence falls when you have not played for a while [20].
- Bullet, blitz and rapid have separate ratings by estimated game length, and daily and puzzles are separate too [21].
- New accounts pick a self-declared level that maps to a starting rating. Forum posts quoting the help centre give 400, 800, 1200, 1600 and 2000 [25] (not confirmed on an official page).
- A dropped connection that is not restored in time ends the game as abandoned, and a clock running out while disconnected is a loss on time [22].
- A game where a player misses the first move is aborted without rating change, except that accounts with a pattern of disconnections, aborts or stalling can have it recorded as a loss [23].
- The fair play policy bans artificially manipulating "ratings, matches, or game outcomes" and can close accounts for it [24].

**Elo and its K factor.** Classic Elo has no uncertainty term, so new players get a bigger K. FIDE uses K = 40 until a player has 30 rated games, K = 20 below 2400, and K = 10 once 2400 has been reached [27].

**Glicko-2 guidance from its author** [26]:
- Unrated players start at 1500 with RD 350 and volatility 0.06 ("this value depends on the particular application").
- Reasonable tau is 0.3 to 1.2; a smaller tau stops very improbable results from causing big rating changes.
- The system "works best when the number of games in a rating period is moderate to large, say an average of at least 10-15 games per player".

Lichess avoids rating periods by updating after every game and growing RD with elapsed time [15].

### Bot opponents in chess and elsewhere

- **chess.com:** games against bot personalities or the engine "are always unrated", whatever the outcome. Bots range from about 250 to 2450, grouped as beginner 250 to 850, intermediate 1000 to 1400, advanced 1500 to 2100, and master 2200 to 2450 [53].
- **Lichess "play with the computer":** Stockfish levels 1 to 8, unrated. There is no official rating for each level, and community tables disagree [54].
- **Lichess bot accounts:** these run through the Bot API and can play casual and rated games, but only by challenge. They cannot join pools, tournaments or leaderboards [55]. Forum users worry that rated bot games distort human ratings [55].
- **Human-like play:** engines weakened by adding random blunders to near-perfect play feel artificial. That claim comes from a competitor's comparison page [56], so it is not neutral. Maia (McIlroy-Young et al., KDD 2020) trained one network per Lichess rating level from 1100 to 1900 on human games. It predicts human moves far better than Stockfish or Leela (reported peak accuracy above 52%, against 41% and 46%), and each model is most accurate at its own rating [57]. The lesson for a quiz bot: it should get wrong the questions that humans at its level get wrong, rather than blunder at random.
- **Response times:** van der Linden's lognormal model treats log response time as normal, with a time intensity per item and a speed per person. His 2007 hierarchical framework links this to accuracy at a second level. Within one person speed trades off against accuracy, but across a population faster people also tend to be more accurate [59].

### Item rating in adaptive learning

**Math Garden (Rekentuin, Oefenweb, UvA).** Klinkenberg, Straatemeier and van der Maas (2011) treat every answer as a match between a child and an item. Child ability and item difficulty both update after each answer with an Elo-style rule, giving "on the fly" item calibration. Items are chosen for an expected success rate of about 0.75. In ten months 3,648 children answered over 3.5 million problems [28].

The update, as summarised by Pelánek [29]:

$$\theta_s \leftarrow \theta_s + K\,(x_{si} - P_{si}), \qquad d_i \leftarrow d_i + K\,(P_{si} - x_{si}), \qquad P_{si} = \frac{1}{1+e^{-(\theta_s - d_i)}}$$

Here $\theta_s$ is the student's ability, $d_i$ the item's difficulty, $x_{si}$ is 1 if the answer was correct and 0 otherwise, and $P_{si}$ is the predicted chance of a correct answer.

**The "high speed, high stakes" scoring rule** (signed residual time), used in Math Garden [29][30][31]:

$$S = (2x - 1)(a\,d - a\,t)$$

Here $x$ is 1 if correct and 0 if wrong, $t$ is the response time, $d$ the deadline and $a$ a discrimination weight.
- A fast correct answer scores near the maximum and a fast wrong answer near the minimum. Both shrink towards zero as the deadline approaches.
- Children see coins that drain as time passes, and the deadline was 20 seconds [31].
- Maris and van der Maas (2012) derived the response model that has this rule as its sufficient statistic. Its accuracy part reduces to a two-parameter logistic model in which the time limit sets item discrimination [30].
- Pelánek's caveat: the rule fits interfaces that show the deadline and tell players time matters. Where response time is measured silently, a different rule is needed [29].

**Uncertainty in place of a fixed K** [29]:
- A fixed K = 0.4 (logit scale) was used in earlier student-modelling work.
- Papoušek et al. and Nižnan et al. use $K = U(n) = a/(1+bn)$, where $n$ is the number of answers so far, fitted at a = 1, b = 0.05.
- Klinkenberg et al. start uncertainty at $U = 1$ and update it after each answer as $U \leftarrow U - \tfrac{1}{40} + \tfrac{1}{30}D$, where $D$ is the days since the previous attempt. Uncertainty grows again with inactivity.
- Pelánek reports that principled Bayesian uncertainty "actually do[es] not bring significant advantages" for student modelling. He suggests different uncertainty functions for items and students, because items collect far more answers.

**Other findings from Pelánek** [29]:
- **Guessing on multiple choice:** shift the logistic curve. For $k$ options, $P = 1/k + (1-1/k)/(1+e^{-(\theta-d)})$.
- **New students:** in simulation, once item difficulties are known, about 10 answers give a skill estimate that correlates 0.8 with the true skill.
- **Adaptive selection:** when items are chosen adaptively, plain proportion-correct difficulty estimates are poor and do not improve with more students. Elo matches joint maximum likelihood.
- **Sample size:** Wauters et al. found data-driven difficulty estimates reliable with about 200 students.

**Duolingo.**
- Its Birdbrain model "is continuously studying both how much our learners know as well as the difficulty level" of material, and predicts whether a learner will get an exercise right [33]. The post does not say whether it is Elo or IRT.
- An earlier model, half-life regression, predicts word recall for spaced repetition [34].
- For the Duolingo English Test, Settles et al. (2020) used machine learning to estimate item difficulty directly from item content. This "alleviates the need for expensive pilot testing with human subjects" [35] and is the relevant precedent for giving new questions a starting difficulty.

### Duolingo engagement mechanics

- **Leagues** came from Zynga's FarmVille 2: weekly leaderboards of about 30 users matched by recent engagement, with top finishers promoted [36][39].
  - Duolingo's former CPO reports overall learning time up 17% after launch, and "highly engaged" learners (an hour a day, five days a week) tripling. The earlier friends leaderboard "wasn't particularly effective" [36].
  - There are ten tiers, and promotion counts shrink from 20 of 30 in Bronze to 5 in Obsidian and none in Diamond, one tier per week at most [39] (third-party page).
- **Streaks** [37]:
  - learners who reach a 7-day streak are 3.6 times more likely to finish their course;
  - letting learners equip up to two Streak Freezes raised daily active learners by 0.38%;
  - a new streak animation raised day-7 retention of brand-new learners by 1.7%.

  The share of daily users on a streak of 7 days or more roughly tripled after the streak work [36].
- **What goes wrong.** Mogavi et al. (2022) studied nine years of Duolingo forum posts plus 15 interviews. They found "gamification misuse": users fixated on points, badges and leaderboards at the cost of learning, driven by competitiveness, playfulness and herding [40]. Streak design deliberately uses loss aversion [37], which is where most of the "manipulative" criticism lands.

### Classroom quiz games

- **Kahoot scoring.** A correct answer scores $\text{round}\big(1000 \times (1 - \tfrac{t/T}{2})\big)$, where $t$ is the response time and $T$ the timer. An instant answer gets close to 1000 and one at the buzzer 500. Multi-select gives up to 500 per correct option. The speed reduction cannot be turned off in live games, but "accuracy mode" scores correctness only [41].
- **Effect on learners.** A review of 93 studies found Kahoot generally helps learning and classroom dynamics. Students also report "stressful time-pressure for giving answers, not enough time to answer, afraid of losing" [42].
- **Quizizz** (now Wayground) has optional power-ups that teachers can switch off, including Double Jeopardy (double or nothing), Streak Saver, Time Freeze and Immunity [43]. I found no official scoring formula.
- **Trivia Crack.** Classic mode is asynchronous: 20 seconds per question, 36 hours to take your turn, and a win for collecting all six characters or having more after 25 rounds [44]. Its power-ups are extra time, bomb, double chance and skip. They cost coins, which come from winning or from in-app purchases [62]. Older coverage describes the bomb as removing wrong answers and double chance as a second guess [62] (dated source).
- **Who Wants to Be a Millionaire** has lifelines usable once each. 50:50 removes two wrong answers [63]. A fan wiki says Phone a Friend was dropped in the US version in 2009 because it had turned into phoning someone to google the answer [63] (fan source, unverified). This is the same open-notes problem this game has.
- **Blooket:** I found no reliable source on its mechanics or effects.

### Power-up precedents

- **Hasbro's Battleship, Commanders mode (Steam):** each of six commanders has a secret weapon [60]:
  - an airstrike hitting a whole row or column;
  - a torpedo that runs along a row or column until it hits;
  - a 3x3 bombardment;
  - six shots at random cells;
  - a five-cell cannon;
  - a "surgical strike" that sinks a ship in one hit.

  The store page does not say how often they can be used. The 1996 Hasbro Battleship had cruise missiles, torpedoes and surveillance in its "Ultimate" mode [61]. These weapons are big, legible and theatrical, and each one changes one turn.
- **Mario Kart:** items are weighted by race position, so trailing players get stronger catch-up items. The blue shell targets whoever is in first.
  - Its designer added it because "we wanted to create a race where everyone was in it until the end".
  - Being hit by it late in a race is widely resented.
  - Nintendo later added counters such as the Super Horn [64].

  The lesson: catch-up mechanics keep games close, but a late, unanswerable swing feels unfair unless the victim has some answer to it.
- **Counterplay:** game design writing treats counterplay, the ability to respond to an opponent's move, as what keeps a mechanic fair [65]. Telegraphing an attack gives the other side that chance.

### Cheating with open notes

The realistic threats, roughly from easiest to hardest:
1. Ctrl+F in the course notes or slides on the same screen.
2. A second device, or a friend in the room.
3. An LLM. Browser extensions now let LLMs "answer questions presented in online exams" within seconds, from page text or screenshots [47][49].
4. Reading the answer from the client. Kahoot answer bots work by reverse-engineering client-server traffic [49].
5. Memorising the question bank, and sharing questions between friends.

What the evidence supports:
- **Randomised question pools.** In an asynchronous exam with 425 students, the advantage from seeing questions in advance fell from 13 points to 2 to 3 points when each student drew one of two to four variants [45].
- **Short time limits, one question per page, shuffled options, and feedback that cannot be copied:** standard institutional advice, backed more by guidance documents than controlled studies [46].
- **Tab-leave logs prove little.** A second device leaves no trace, and unrelated events produce the same log entries [48].
- **Server authority** fully fixes threat 4 and costs nothing: never send the correct option, or whether an answer was correct, to a client until the round is over.

Nothing technical stops threats 1 to 3 against a determined player. The most a design can do is make the timer short enough that looking things up costs real points.

### Small populations

- **Queues.** Matchmakers trade wait time against skill spread and widen the allowed gap as population falls. Apex Legends does this continuously, with caps on both [51]. With 20 to 150 players over two courses and perhaps a handful online at once, a skill-restricted queue will usually be empty.
- **Rating drift.** In a zero-sum Elo pool the average stays at the starting rating.
  - New players who are better than their starting rating pull points out of the pool, causing deflation.
  - Overrated players sitting just above a floor donate points, causing inflation [50].
  - Glicko-2 is not exactly zero-sum, because a high-RD player moves more than their opponent, so a small pool will drift a little.
- **What a rating means here.** A ranked rating is relative to classmates. If the whole class learns together, ratings stay put while everyone improves. Only a rating measured against item difficulties can show absolute progress, and only if item ratings are anchored.
- **Libraries.** Glicko-2 implementations exist in every common language. OpenSkill (Weng-Lin) is an openly licensed Bayesian alternative to TrueSkill, mainly useful for teams and free-for-all [52].

---

## Part 2: Recommendations

### (a) Duel format (the same in bot matches and multiplayer)

**Round score.** Each player's score for a question uses the Kahoot formula [41]:

$$s = \begin{cases} \text{round}\big(1000\,(1 - \tfrac{t}{2T})\big) & \text{if correct} \\ 0 & \text{if wrong or timed out} \end{cases}$$

A correct answer is worth 500 to 1000, and running out the timer counts as wrong, as specified.

**Damage.** As in GeoGuessr, the higher scorer deals $(s_\text{high} - s_\text{low}) \times m$ to the other player, where $m$ is the round multiplier.
- *One right, one wrong:* 500 to 1000 base damage, depending on how fast the right answer came.
- *Both right:* 0 to 500 for being faster. This keeps speed relevant and punishes slow lookups, which is the main anti-cheat lever.
- *Both wrong:* no damage.

**HP: 6,000 each.** This matches GeoGuessr's launch value [1]. In simulation it gives about 11 rounds between evenly matched players (90th percentile 14), which is 4 to 6 minutes with the timers below.

**Multiplier: mutual and ramping.** x1 for rounds 1 to 4, then +0.5 per round: x1.5 in round 5, x2 in round 6, x2.5 in round 7, and so on. Reasons:
- With no multiplier at all, evenly matched players need about 21 rounds and often hit the round cap.
- GeoGuessr's individual multiplier (+0.5 per round won) [4][5] suits a game where every round produces a graded score. Quiz rounds are mostly right or wrong. In simulation, individual multipliers cut comebacks (wins after trailing by 1,500 HP) from about 16% of games to about 11%. Without speed damage, they also stretched the 90th-percentile match to 21 rounds. Mutual ramping keeps matches short and comebacks possible.
- **Judgement call:** a damage cap per round. With 6,000 HP the median biggest single hit in a match is about 3,500, which is the spike GeoGuessr players complain about [7]. Capping a round at 3,000 (half the starting HP) barely changes match length. It also bounds power-ups such as Zeus (see (e)).
- **No healing round.** It was nerfed within days of GeoGuessr's launch [2], and healing works better as an optional power-up.

**Timer.**
- **Base timer by type:** true/false 15 s, single choice 20 s, multiple select 30 s. **Judgement call:** extra reading time for long questions, for example +1 s per 15 words beyond 40.
- **The GeoGuessr rule:** once one side answers, the other has whatever time is left, capped at 5 seconds [1]. This is the strongest anti-lookup mechanic available. Someone who knows the answer is unaffected; someone searching their notes is not. **Judgement call:** 3 s is harsher, 8 s gentler.
- **No information leak:** the countdown starts on any answer, right or wrong. A blind instant guess to rush the opponent is a bad bet: on a four-option question it is wrong 75% of the time and then takes full damage.
- **Teaching moment:** between rounds, show the correct answer and its explanation for about 4 seconds. This is where the game teaches.

**Question choice.**
- Both sides get the same question, with options shuffled separately for each player, so "it's B" said over a shoulder is useless.
- Draw from the chosen course (and lecture filter, in unrated lobbies) at an item rating about 150 below the two players' average bot rating. A player with no bot matches yet counts as 1500 here. In simulation that gives each side about 75 to 78% success at equal strength, which is the Math Garden target [28].
- Keep provisional items (fewer than about 20 answers) out of rated duels.
- Exclude anything either player saw in a duel in the past 7 days.

**Round limit and ties.** Both players cannot hit 0 in the same round, because only one side deals damage per round. Cap the match at 20 rounds and give it to whoever has more HP. If HP is exactly equal, play sudden-death questions at the current multiplier until one round deals damage.

**Leaving, disconnecting, surrendering.**
- **Surrender:** an immediate loss with the full rating change, like resigning in chess.
- **Disconnect:** the game does not pause. Timers keep running and unanswered questions count as wrong, which already follows from the timeout rule. After 45 seconds away in total, the match ends as a loss. This matches chess.com's abandonment rule [22] and Lichess's policy of not refunding disconnection losses [14].
- **No-start:** if a player never answers question 1 and does not return, the match is aborted with no rating change, as chess.com and Lichess do for a missed first move [23]. The no-start is recorded against the player.
- **Patterns:** like Lichess's playban counters [18], track rage-quits, no-starts and surrenders in the first two rounds. Three of these in 24 hours bring a 15-minute ranked cooldown. **Judgement call** on the numbers. Among friends, "left 4 of the last 10 games" on the profile may be enough.

**Rematch.** A rematch button stays up for 20 seconds after the match. If both accept, the same settings and rated status apply. **Judgement call:** only the first 5 rated games between the same pair each day count for rating, so two friends cannot farm or trade rating in marathon sessions. Later games still count for stats.

**Multiplayer: the matchmaking queue and private matches.**

Ranked play against humans and bot matches are separate modes with separate ratings: the ranked rating in (b) and the bot rating in (c). Multiplayer has two entry points.

- **Matchmaking queue.** A random opponent who is also searching, in the same course. Always rated. Players can tick both courses, and the match uses a course both of them picked, which roughly doubles the chance of finding someone.
- **Private match by code.** Create a lobby, share the code or a link in the group chat, and a friend joins.

**Should private matches be rated? My pick: rated by default, with standard settings.**
- A private match is rated when it uses the standard rules (HP, timers, the normal power-up loadout) and a single course. The invite says "Rated" up front and the joiner accepts that by joining.
- Any custom setting makes the match casual and unrated: custom HP or timers, a lecture filter, mixed courses, or the accuracy-only toggle (Kahoot's accuracy mode [41], for people who find speed pressure stressful [42]).
- The host can also switch rated off.
- **Why rated:** with 20 to 150 players, most games will be friends challenging friends. If those games were unrated, ranked ratings would rest on a handful of queue games and most players would stay provisional all course. Lichess makes the same choice: direct challenges there can be rated [55].
- **The risk** is two friends trading wins or farming a weaker friend. The pair cap above (only the first 5 rated games between the same two players per day count) handles most of it. Unlike the queue, a private match lets you choose your opponent, so the cap matters more here.
- **Judgement call:** the alternative is unrated by default with a "rated" toggle. That is safer against farming but probably leaves the ranked board thin.

**How the queue widens its rating window.** The pool is small, so the window has to open fast:

| Time in queue | Allowed rating gap | Expected score of the stronger player at that gap |
|---|---|---|
| 0 to 5 s | ±100 | about 64% |
| each further 5 s | +50 | |
| 30 s | ±350 | about 88% |
| 45 s | anyone in the queue | |

- Expected scores come from the Elo formula $1/(1 + 10^{-\Delta/400})$.
- A provisional player (RD 110 or more) starts at ±350, because their rating is not yet reliable.
- When more than one opponent fits the window, prefer someone other than the last opponent.
- This is the widen-over-time pattern big matchmakers use to trade wait time against fairness [51]. With only a few people searching at once, the window will rarely be what blocks a match. It matters in the busy week before an exam.

**When to offer a bot.**
- From the moment a player joins the queue, show how many others are searching and how many are online. Waiting with no information is the worst version.
- **At 20 s with nobody else searching**, offer: "Nobody else is searching. Play a bot at your level while you wait?" This is an offer only: the player can keep waiting or send a challenge link to friends.
- **If they accept,** they play a normal bot match, which counts for the bot rating and not the ranked rating, and they stay in the queue. When a human match is found, they get 15 seconds to take it. Taking it ends the bot match with no penalty and no bot-rating change for the unfinished match. Answers already given still update the bot rating, because each answer is rated on its own (see (c)).
- **Never put a bot into the ranked queue disguised as a human.** Some games fill empty queues that way. Here it would break the ranked rating and, among friends who compare notes, would be found out quickly.
- **Optional:** players can opt in to a push notification when a friend starts searching ("Filip is looking for a duel in Agentic AI"). In a group this size, that will probably start more ranked games than any queue tuning.

**Later additions.**
- *Asynchronous challenge:* Trivia Crack style [44]. Both answer the same 10 questions in their own time, with the per-question timer enforced by the server, and HP is resolved afterwards. The 5-second countdown cannot apply, so looking things up is easier. Keep it unrated.
- *Team duels:* GeoGuessr has them [13], but a population of 20 to 150 does not need them at launch.

### (b) Ranked rating (against humans)

**Glicko-2, one rating per course, updated after every human-vs-human rated game.** It handles provisional players, inactivity and opponent uncertainty without extra rules. Students play in bursts around exams, which makes the inactivity handling matter.

| Parameter | Value | Reason |
|---|---|---|
| Starting rating | 1500 | Same base for everyone, as specified; Glicko-2 default [26] |
| Starting RD | 350 | Glickman's default [26]. Lichess's 500 [15] swings several hundred points per early game, which is too wild for a friend group |
| Starting volatility | 0.06 | Glickman's default [26] |
| Tau | 0.5 | Inside Glickman's 0.3 to 1.2 range [26]; between his worked example (0.5) and Lichess (0.75) [16] |
| RD growth when inactive | One Glicko-2 rating period per day | With volatility 0.06, RD rises from 60 to 110 after about 11 idle weeks (Glicko-2 step 6). That is roughly one teaching period. Lichess tunes the same rise to a year [15] |
| Provisional | RD of 110 or more, shown as "1540?" | Lichess threshold [16] |
| RD bounds | 45 to 350 | Lichess minimum [15]; the maximum is the starting value |
| Rating floor | 400 | Lichess [15]. In a pool this size it will almost never bind, so its inflationary effect [50] is negligible |
| Maximum change per game | 700 | Lichess safety cap [15] |
| Outcome | Win 1, loss 0 | Margin of victory stays out of the rating, as in chess |
| Leaderboard eligibility | At least 10 rated games in the course, one in the last 14 days, RD below 90 | Lichess's rule (30 games, 1 week, RD below 75) [14] scaled down for a smaller, burstier population |

**Placement.** No separate placement matches: the provisional period is the placement, as on Lichess and chess.com. **Judgement call:** the ranked rating could start from the player's bot rating with RD 350. Lichess starts class students at 800 [15], and chess.com lets players declare a level [25]. You specified a common base rating, so the default is plain 1500.

**Bot games never count.** chess.com keeps bot games unrated [53]. Lichess allows rated bot games only by challenge, keeps bots off leaderboards [55], and users still complain about distortion. With bots of known strength available all day, counting them would let anyone farm rating, so they stay out.

**Sandbagging and boosting.** Surrender counts as a loss, so deliberate losing works. The real risks in a friend group are win trading between two accounts and a strong player on a fresh account. Mitigations:
- the pair cap from (a);
- one account per university email;
- logging very early surrenders as suspicious, the way Lichess does [18];
- if an account is caught boosting, refunding its opponents' losses, as Lichess does for cheaters [14].

**Unrated games.** Casual private matches (any custom setting), mixed-course games and the asynchronous mode are unrated. Power-ups are part of ranked (see (e)), so a ranked rating measures skill at the whole game: knowing the material, answering fast, and timing power-ups well.

### (c) Bot matches and the bot rating

Bot matches use the same duel as (a), played against a bot, and have their own bot rating, separate from the ranked rating. Three things need designing: how the bot answers, how the bot rating works, and where points fit.

**How the bot decides whether it is right.** Each bot has a rating $R_b$ on the same scale as the item ratings. For a question with item rating $\beta$:

$$P_\text{correct} = c + (1-c)\,\frac{1}{1 + 10^{(\beta - R_b)/400}}$$

Here $c$ is the guessing floor from Pelánek's shifted logistic [29]: $1/k$ for single choice with $k$ options, 0.5 for true/false, and $1/(2^k - 1)$ for all-or-nothing multiple select.
- This is the same model the item ratings are fitted with. A bot rated 1600 therefore misses roughly the questions that a 1600-rated student misses, which is the Maia lesson [57]: error on the hard items, no random blunders on easy ones.
- Model the bot as either knowing or guessing. It "knows" with probability $P_\text{know} = (P_\text{correct} - c)/(1 - c)$ and then answers correctly. Otherwise it guesses: correct with probability $c$, and otherwise picking a wrong option in proportion to how often humans picked it on that item (uniformly until the item has data). Wrong answers then look human, because the bot falls for the same distractors.

**How long the bot takes.** Use van der Linden's lognormal model [59], with time measured from when the question appears:
- **Knowing:** $\log t \sim \mathcal{N}(\mu_i - \tau_b,\ 0.35^2)$.
  - $\mu_i$ is the item's time intensity: the mean log time of correct human answers on that item. Before data exists, use a default by type and length, for example log(6 s) for true/false, log(8 s) for single choice and log(12 s) for multiple select, plus reading time.
  - $\tau_b$ is the bot's speed, rising with bot level.
  - The 0.35 spread is a starting guess; fit it to real answer logs once they exist.
- **Guessing:** answer late, uniformly between 60% and 95% of the base timer. Hesitation is what a guess looks like.
- **Floor:** never answer before 1.5 s plus 0.25 s per 10 words of question and options. No human reads that fast, and an instant bot answer would trigger the 5-second countdown on the player unfairly.
- **Under the countdown:** if the player answers first and the bot's drawn time falls after the 5-second window, the bot submits a guess at a random point inside the window 80% of the time and times out otherwise.

**Bot levels.**
- Fixed bots every 150 rating points from 1050 to 2100: eight levels, each with a speed $\tau_b$ that rises with level. Strong bots answer quickly as well as correctly, which is what makes them strong in a speed-scored duel.
- Unlock a level by beating the one below it, chess.com's ladder of personalities [53] made into progression.
- Add a **matched bot** that always plays at the player's current bot rating.
- **Judgement call:** give bots names and one-line personalities (chess.com does). A Greek-pantheon set would match Zeus. The names here are placeholders for you to pick.

In simulation, each 100 rating points of gap is worth about 18 percentage points of win probability under the (a) rules. A player wins about 69% against a bot 100 below them, 50% at equal rating and 32% against a bot 100 above. **Judgement call:** default the matched bot to 75 below the player, for a win rate near 63%. Learners keep going when they mostly succeed (Math Garden targets 0.75 [28]), but a bot that loses on purpose is no fun either.

**Bots and power-ups.** In power-up games the bot gets the same loadout rules as a human. Give it a simple, readable policy:
- arm Zeus on a random round from 5 onwards;
- arm the shield when its HP is under half;
- use 50:50 when its $P_\text{know}$ is below 0.5.

Weak bots should play power-ups badly too.

**The bot rating.** Do not rate bot duels on win or loss. Rate every answer instead, as a match between the player and the item, Math Garden style [28][29]:

$$\theta_s \mathrel{+}= K_s(x - P), \qquad \beta_i \mathrel{-}= K_i(x - P), \qquad P = c + (1-c)\,\frac{1}{1 + 10^{(\beta_i - \theta_s)/400}}$$

Rating per answer is better here for three reasons:
- A match yields about 11 data points instead of 1, so the rating settles in a few sessions.
- It does not depend on the luck of the multiplier.
- It keeps the bot rating on the item scale, which is what question selection and bot strength use.

The win or loss against a bot counts for stats, unlocks and points.

**Judgement call: rating bot matches on win or loss.** The alternative treats each bot as an opponent with a fixed rating and updates a Glicko-2 bot rating on the result, the way Lichess rates a puzzle attempt as a game [17]. That number is easier to explain ("I beat the 1800 bot"), but it needs about ten times as many games to settle, and power-ups and multiplier luck feed into it. I would keep the per-answer rating and show "highest bot beaten" next to it, which gives the same bragging right.

Parameters:
- **Player K:** $K_s(n) = 174/(1 + 0.05n)$, floored at 24. 174 Elo points is 1 logit, so this is Pelánek's fitted a = 1, b = 0.05 [29] in Elo units: 116 after 10 answers, 58 after 50, 29 after 100. The floor keeps the rating moving, because students genuinely learn during a course.
- **Inactivity:** add uncertainty back for time away, after Klinkenberg's $+D/30$ per day [29]. The simplest form is to reduce $n$ by 1 for every 3 days since the last session.
- **Accuracy only.** Speed already drives damage and points. Leaving it out of the rating means slower readers, including non-native English speakers, are not marked down on knowledge. **Judgement call:** the high speed, high stakes rule [29][30] is the principled way to put speed into the rating. It fits once the timer is visible, which it now is.
- **Display:** start at 1500, and show the rating with "?" for the first 30 answers in a course.
- **Answers that do not update ratings:** answers given under a power-up that changes the question (50:50, second chance, ink; see (e)) update neither the player nor the item. Timeouts caused by the 5-second countdown update the player but not the item.

**Question ratings and new questions.**
- **Item K:** $K_i(m) = 174/(1 + 0.05m)$, with $m$ the item's answer count, floored at 8.
- **Noise guards, from Lichess's puzzle rules [17]:**
  - an answer only moves the item if the player has at least 10 answers in that course (the "clueless" rule);
  - item updates per user per day are capped;
  - a repeat of an item the player saw in the last 30 days updates the player but not the item, because a repeat measures memory of the item rather than its difficulty.
- **Answers from both modes:** human answers in multiplayer duels update item ratings exactly like answers in bot matches. Both are timed duels now, so the conditions match.
- **Anchor the scale.** Once an item has 50 or more answers, freeze its rating except for a monthly batch re-fit. Otherwise, as the class learns, items drift easier and ratings stop showing progress. **Judgement call** on 50.
- **Cold start:**
  - Initial rating from the author's difficulty tag: easy 1250, medium 1500, hard 1750, with the answer count at 0 so the rating moves fast.
  - Better still, if questions are generated or reviewed by an LLM, have it predict difficulty from the question text and initialise from that. Duolingo did this for its English test [35]. Check later how well the predictions correlate with the fitted ratings.
  - Items stay provisional until they have 20 answers. Provisional items appear only in bot duels, and their answers move the player at half weight, following Lichess's damping for provisional puzzles [17].
  - Have item authors answer a few of their own items during development.
- **Expect noisy calibration.** 500 items per course, 60 active students and 200 answers each gives about 24 answers per item. Reliable data-driven estimates need about 200 students [29], so the author or LLM priors will matter all course long.
- **Quality checks:** flag an item when stronger players do worse on it than weaker ones (correctness correlates negatively with player rating), or when players press the report button. These are usually a wrong answer key or ambiguous wording.

**Points still fit.** Points measure volume of work and should favour hard material; the rating measures skill. In bot duels, each correct answer earns points by the item's rating at the time:

| Item rating | Difficulty shown | Points if correct |
|---|---|---|
| below 1250 | 1 | 5 |
| 1250 to 1449 | 2 | 10 |
| 1450 to 1649 | 3 | 15 |
| 1650 to 1849 | 4 | 25 |
| 1850 and above | 5 | 40 |

- **Win bonus:** beating a bot adds a bonus that grows with the bot's level, for example 10 points per level. Stronger bots also bring harder questions, and harder questions pay more, so playing up pays twice.
- **Wrong answers** give 0 points and no deduction.
- **Repeats:** full points the first time an item is answered correctly, 25% on later correct answers, and nothing for a repeat within 24 hours. This blocks the farming Duolingo had to rebalance against [40]. **Judgement call** on the percentages.
- **Power-up help:** answers helped by 50:50 or second chance earn half points.
- **Multiplayer duels:** human games earn the same per-answer points. **Judgement call:** leave them out if you want points to mean study volume only.

### (d) Progression and social features

**Leaderboards per course, no leagues.**
- With 20 to 150 people per course, the whole course is one Duolingo-sized league, which holds about 30 [36][39]. Tiers with promotion and demotion need far more players.
- Two boards per course:
  - **ranked rating** (eligible players only, see (b));
  - **points this week**, resetting Monday 00:00 Amsterdam time, with each week's top three kept in a visible history.
- The bot rating goes on profiles, with no leaderboard. It is the "how much do I know" number, and ranking it invites farming.
- Duolingo's evidence that leaderboards drive volume is strong [36]. So is the evidence that they push some users to chase points at the cost of learning [40]. Points weighted by difficulty and the repeat decay are the counterweight.

**Rating badges in place of divisions.** Fixed rating thresholds give cosmetic titles on the profile, like GeoGuessr's Elo thresholds for Master and Champion [9] but without weekly promotion cycles, which a small pool cannot fill. Keep it to four or five levels. GeoGuessr players complain when one tier spans 1,100 points [11].

**Profiles.**
- **Per course:**
  - ranked rating with a graph, and bot rating;
  - games played, won and lost, plus surrenders and disconnects;
  - best win streak;
  - highest bot level beaten;
  - points.
- **Accuracy per lecture or topic.** This is the most useful stat for studying and doubles as a list of weak spots. Show it as stats only, the way GeoGuessr treats its per-mode ratings [8].
- **Head-to-head record against each friend.** In a group that knows each other this is likely the most motivating feature, and it costs one query.
- **Recent duels with replays:** the questions, both answers and both times.

**Separate ratings per course.** The courses are different skills, just as chess separates time controls [14][21]. Show no combined rating, and make mixed-course lobbies casual only.

**Streaks, kept gentle.**
- One bot duel or one human duel a day keeps the streak.
- Two freezes, earned by keeping a 7-day streak. Duolingo's data supports two freezes [37], and the slack reduces the "lost my streak, quitting" effect.
- No guilt notifications and no paid streak repair. Streaks pause automatically between the exam and the next course block.
- Loss aversion drives streaks [37] and draws most of the "manipulative" criticism. Among friends playing to pass an exam, the streak should stay a light nudge.

**Ranked play with a small population.** Queue widening, the bot fallback and rated private matches are covered in (a). On the social side: show who is online and who is searching, and let anyone challenge them directly. Expect most ranked games to come from friends challenging friends, and bots to fill the hours when nobody is around.

**Seasons.** A course run is the natural season. Ratings carry over within it. At the end, archive the boards (for example "Agentic AI, 2026 to 2027") and start the next run at 1500. Inflation and deflation will not matter over one run.

**Cheating stance.** Assume notes are open and design for it:
- server-authoritative rounds;
- options shuffled per player;
- the 5-second countdown;
- a large question pool with recently seen questions excluded;
- conceptual questions that need understanding across lectures, where Ctrl+F finds nothing useful.

Log tab visibility and show "left the tab 3 times" on the match summary as a social signal, but punish nothing on it [48]. Accept that an LLM on a second device can beat any timer for a determined cheater [47]. Among friends, replays that everyone can see are the deterrent.

### (e) Power-ups

**How power-ups are used.**

- **Loadout before the match.** Each player picks 3 different power-ups. Each can be used once per match, the Millionaire rule of one use per lifeline [63]. Both loadouts are shown to both players at the start, so each side knows what the other could do and can plan for it. A fixed loadout keeps the game about knowledge and choices. Earning power-ups during the match tends to snowball, and charges you buy or grind for turn into pay-to-win, as with Trivia Crack's coins [62].
- **One catch-up charge.** The first time a player's HP falls below 2,000, they get one extra charge of a random power-up from their own loadout. This is Mario Kart's principle that trailing players get help [64], kept small so it cannot decide the match on its own. **Judgement call:** drop it if comebacks already feel common enough.
- **Two timing windows each round:**
  - **Arming window** (3 seconds before the question appears): power-ups armed here are chosen blind, without knowing the question. Both players arm at the same time and neither sees the other's choice until the question appears. Then the banners fire.
  - **In-question:** power-ups used after reading the question. Using one shows a banner to the opponent straight away.
- **One power-up per player per round.**
- **Theatrical by default.** Each power-up has a full-screen line and a sound, shown to both players at the moment it resolves. That is the Battleship Commanders feel [60]: one big, legible event per turn.
- **Closed-form only.** No power-up asks anyone to compute anything. Each one changes damage, time, HP or the visible options.

**The set.** Nine power-ups. The Greek naming follows Zeus. Names and lines are suggestions.

| Power-up | When | Effect | Counterplay | Line on screen |
|---|---|---|---|---|
| **Zeus** (your first one) | Arming window, blind | Damage you deal this round x2. Wasted if you deal no damage | Aegis halves it; Nemesis cancels it; the per-round cap limits it | "ZEUS, STRIKE THEM DOWN!" |
| **Aegis** | Arming window, blind | Damage you take this round is halved | Being read: if the opponent holds Zeus or Hermes for later, Aegis is wasted | "The shield of Athena holds" |
| **Nemesis** | Arming window, blind | Cancels whatever the opponent armed this round, and their charge is spent | Arm nothing when you expect it; a Nemesis that meets nothing is wasted | "Nemesis denies you" |
| **Oracle** (50:50) | In-question | Removes half of the wrong options (2 of 3 on a four-option question; one false option on multiple select). Not usable on true/false | Hermes punishes the extra seconds spent; the banner tells the opponent you are unsure | "The Oracle has spoken" |
| **Second Wind** | In-question, before answering | If your first answer is wrong, you get one more answer before your time runs out. A second answer scores half | Answering first and fast leaves them little time for the second try | "Not like this" |
| **Hermes** | In-question, before answering | If you answer first, the opponent's countdown is 2 s instead of 5 | Answer before them, or do not need the time | "Hermes is already there" |
| **Kraken Ink** | Arming window, blind | The opponent's answer options are hidden for the first 4 seconds; the question text stays visible | Read the question and decide before the options appear; Nemesis cancels it | "Release the Kraken" |
| **Ambrosia** | Arming window, blind | Heal 1,200 HP, applied at the end of the round. Only while below 50% HP | Win the round hard enough that the heal does not matter; Nemesis cancels it | "Food of the gods" |
| **Phoenix** | Passive, in loadout | Once per match, a hit that would knock you out leaves you at 1 HP instead | Visible in the loadout, so the opponent knows they need a second hit; Nemesis in the same round cancels it | "From the ashes!" |

Nine is at the top of the 6 to 10 range. Launch with Zeus, Aegis, Nemesis, Oracle, Hermes and Phoenix, and add the others if the first six get stale. **Judgement call:** a Pandora's Box that draws one random power-up, sometimes cursed (x2 damage taken this round). It echoes Battleship's random-salvo commander [60] and suits friends who like chaos, but it adds luck to a game already criticised for luck [7].

**Balance notes.**
- **Zeus versus the multiplier.** Zeus armed blind in round 8 (x3) on a 1,000-point difference deals 6,000 and ends the match. Pick one of two fixes: apply the 3,000 per-round cap from (a) after Zeus, or let Zeus double the base damage before the multiplier but never the multiplier itself. The cap is simpler to explain.
- **Zeus only works blind.** If it could be armed after reading the question, it would be a free double on every question you know. In the arming window it is a bet on your knowledge of the course, which is the intended feel. **Judgement call:** allow it in-question at x1.5 if you prefer.
- **The blind mind game.** Zeus, Aegis and Nemesis all resolve in the same blind window, so they work like rock-paper-scissors. Shown loadouts give enough information to make the guess interesting.
- **Help power-ups and ratings.** Oracle, Second Wind and Kraken Ink change the question, so answers given under them update neither player nor item ratings ((c) above).
- **Anti-cheat.** Nothing in the set adds time to look something up. Hermes takes time away. Avoid "extra time" power-ups such as Trivia Crack's [62] and Quizizz's Time Freeze [43]: here they would mainly buy Ctrl+F time.

**Power-ups in ranked (decided: allowed).** GeoGuessr's ranked play has no power-ups and neither does chess, so there is no direct precedent. These rules keep ranked fair with them:
- **Equal access.** Every power-up is available to every player from day one in ranked. Nothing is unlocked, bought or ground for, which avoids the pay-to-win problem of coin-bought power-ups [62]. Bot-ladder progress can unlock cosmetics, never power-ups.
- **The same loadout rules for everyone:** 3 picks, one use each, loadouts shown at match start, and the catch-up charge if you keep it.
- **Leave chance-based ones out of ranked.** Pandora's Box, if you add it, stays casual-only. Ranked already carries the luck complaints GeoGuessr's multipliers attract [7].
- **Keep the per-round damage cap in ranked.** It stops Zeus on a late multiplier from ending a match in one blind guess.
- **Ratings stay clean.** The ranked rating is win or loss, so it absorbs power-ups without change. Answers helped by Oracle, Second Wind or Kraken Ink still do not update item ratings or the bot rating.
- **Watch the balance.** Log, per power-up, how often it is picked and how often the player who picked it wins. A power-up that nearly everyone takes, or that wins well above its share, needs a nerf. Start ranked with the six launch power-ups, so there is less to balance.
- **Bot matches** use power-ups by default too, with the bot policy in (c), so practice against bots is practice for ranked.
- **Casual private matches** can switch power-ups off entirely, for people who want a straight knowledge duel.

### Choices for the user

**Duel rules**
- Per-round damage cap of 3,000, or no cap. With power-ups the cap stops Zeus ending a match.
- The countdown after the first answer: 3, 5 or 8 seconds.
- Reading-time allowance for long questions.

**Ratings**
- Seeding the ranked rating from the bot rating.
- The 5-games-per-pair-per-day rating cap.
- Ranked cooldown thresholds for leaving.
- Whether the bot rating uses accuracy only or the high speed, high stakes rule.
- Freezing item ratings after 50 answers.

**Bots**
- The default matched-bot offset of 75 below the player.
- Bot names and personalities.

**Points**
- Repeat-point percentages, and whether human duels earn points.

**Power-ups**
- The in-match catch-up charge.
- Whether Zeus can be used in-question at x1.5.
- Pandora's Box (casual only, if at all).

**Multiplayer**
- Private matches: rated by default with standard settings (my pick), or unrated by default with a toggle.
- The queue widening schedule, and offering the bot after 20 s.

**Modes**
- Whether to build the asynchronous challenge mode.

---

## Sources

1. GeoGuessr developer post "Duels live now", r/geoguessr, 18 Nov 2021 (mirror): https://lr.eu.psf.lt/r/geoguessr/comments/qwop2o/duels_live_now
2. GeoGuessr on X, Nov 2021, health round 50% and multipliers 2-3-4-5-6: https://twitter.com/geoguessr/status/1463155185656729612
3. GeoGuessr patch notes, 13 Feb 2026: https://geoguessr.canny.io/changelog/patch-notes-13th-of-february-2026
4. GeoGuessr patch notes, 17 Apr 2026: https://geoguessr.canny.io/changelog/patch-notes-17th-april-2026
5. GeoGuessr on X, 30 Mar 2026, individual multipliers (+0.5x) from 1 April: https://x.com/geoguessr/status/2038619816861237534
6. Wikipedia, GeoGuessr World Championship: https://en.wikipedia.org/wiki/GeoGuessr_World_Championship
7. GeoGuessr feature request "No multipliers in competitive duels!": https://geoguessr.canny.io/feature-requests/p/no-multipliers-in-competitive-duels
8. GeoGuessr support, "A Guide to GeoGuessr's Ranked Play": https://www.geoguessr.support/support/solutions/articles/206000056733-a-guide-to-geoguessr-s-ranked-play
9. GeoGuessr on X, 2024, Elo-based Master and Champion thresholds: https://x.com/geoguessr/status/1787393033689760152 ; January 2026 Champion change: https://x.com/geoguessr/status/2013212539996242355
10. GeoGuessr feature request "Ranked System Rework": https://geoguessr.canny.io/feature-requests/p/ranked-system-rework
11. GeoGuessr feature request "New ranks": https://geoguessr.canny.io/feature-requests/p/new-ranks
12. GeoGuessr, How It Works: Tournaments: https://www.geoguessr.com/multiplayer/how-it-works-tournaments
13. Wikipedia, GeoGuessr: https://en.wikipedia.org/wiki/GeoGuessr
14. Lichess FAQ: https://lichess.org/faq
15. Lichess source, `modules/rating/src/main/Glicko.scala`: https://github.com/lichess-org/lila/blob/master/modules/rating/src/main/Glicko.scala
16. scalachess source, `rating/src/main/scala/glicko/model.scala`: https://github.com/lichess-org/scalachess/blob/master/rating/src/main/scala/glicko/model.scala
17. Lichess source, `modules/puzzle/src/main/PuzzleFinisher.scala`: https://github.com/lichess-org/lila/blob/master/modules/puzzle/src/main/PuzzleFinisher.scala
18. Lichess source, playban module (`PlaybanApi.scala`, `model.scala`): https://github.com/lichess-org/lila/blob/master/modules/playban/src/main/PlaybanApi.scala
19. Lichess forum, puzzle rating question: https://lichess.org/forum/general-chess-discussion/puzzle-rating-question
20. chess.com, How do ratings work: https://support.chess.com/en/articles/8566476-how-do-ratings-work-on-chess-com
21. chess.com, Why are there different ratings in Live Chess: https://support.chess.com/article/330-why-are-there-different-ratings-in-live-chess
22. chess.com, Abandonment: https://support.chess.com/en/articles/8593801-how-does-game-abandonment-work
23. chess.com, Aborted games: https://support.chess.com/en/articles/8609759-what-does-it-mean-to-abort-a-game-how-do-i-do-it
24. chess.com Fair Play Policy: https://www.chess.com/legal/fair-play
25. chess.com forum, initial ratings by declared level: https://chess.com/forum/view/community/how-does-chess-com-decide-initial-ratings
26. Glickman, "Example of the Glicko-2 system": http://www.glicko.net/glicko/glicko2.pdf
27. FIDE Rating Regulations (K factors): https://doc.fide.com/docs/DOC/2FC2022/Annex%206.5.1.pdf and https://schack.se/wp-content/uploads/2021/11/FIDE-Rating-Regulations-2022.pdf
28. Klinkenberg, Straatemeier & van der Maas (2011), Computer adaptive practice of Maths ability using a new item response model for on the fly ability and difficulty estimation, Computers & Education 57(2): https://doi.org/10.1016/j.compedu.2011.02.003
29. Pelánek (2016), Applications of the Elo rating system in adaptive educational systems, Computers & Education: https://www.fi.muni.cz/~xpelanek/publications/CAE-elo.pdf
30. Maris & van der Maas (2012), Speed-accuracy response models: scoring rules based on response time and accuracy, Psychometrika 77(4): https://dare.uva.nl/id/257c9569-e69c-466b-b813-c48c1e65942c
31. Discretized signed residual time model, with Math Garden data and its 20 s deadline: https://pmc.ncbi.nlm.nih.gov/articles/PMC8359328/
32. Klinkenberg (2014), High speed high stakes scoring rule, CAA 2014 (listed on the author's page): https://independent.academia.edu/SKlinkenberg
33. Duolingo blog, Introducing Birdbrain: https://blog.duolingo.com/learning-how-to-help-you-learn-introducing-birdbrain
34. Settles & Meeder (2016), A Trainable Spaced Repetition Model for Language Learning, ACL: https://aclanthology.org/P16-1174/
35. Settles, LaFlair & Hagiwara (2020), Machine Learning-Driven Language Assessment, TACL: https://aclanthology.org/2020.tacl-1.17
36. Jorge Mazal, How Duolingo reignited user growth, Lenny's Newsletter: https://lennysnewsletter.com/p/how-duolingo-reignited-user-growth
37. Duolingo blog, How the Duolingo streak builds habit: https://blog.duolingo.com/how-duolingo-streak-builds-habit
38. Duolingo blog, streak research: https://blog.duolingo.com/duolingo-streak-research/
39. Deconstructor of Fun, Duolingo leagues teardown (third-party): https://duolingo.deconstructoroffun.com/mechanics/leagues
40. Mogavi et al. (2022), When Gamification Spoils Your Learning, L@S '22: https://arxiv.org/abs/2203.16175
41. Kahoot support, How points work: https://support.kahoot.com/hc/articles/115002303908
42. Wang & Tahir (2020), The effect of using Kahoot! for learning: a literature review, Computers & Education 149: https://research.gold.ac.uk/id/eprint/39435
43. Quizizz, game features page: https://quizizz.com/home/solutions/make-learning-fun-with-quizizz
44. Trivia Crack help centre, Classic Mode: https://triviacrack.help.etermax.com/hc/en-us/articles/360024774573-Classic-Mode
45. Chen, West & Zilles (2018), How much randomization is needed to deter collaborative cheating on asynchronous exams?: https://zilles.web.engr.illinois.edu/papers/chen_paper_async_randomization_las_2018.pdf
46. Sacramento State, Best practices to reduce cheating in online assessments: https://www.csus.edu/academic-affairs/center-teaching-learning/_internal/_documents/best_practices_to_reduce_cheating_in_online_assessments.pdf
47. arXiv:2510.18881 (2025), behaviour analytics for detecting LLM-assisted cheating in online exams: https://arxiv.org/abs/2510.18881
48. Canvas community, quiz log reliability: https://community.canvaslms.com/t5/Canvas-Question-Forum/View-Log/m-p/650504
49. Examples of answer tools: QuizGPT browser add-on https://addons.mozilla.org/addon/quizgpt/ ; Kahoot bot projects https://repos.ecosyste.ms/topics/kahoot-hack
50. Sonas, Repairing the FIDE Standard Elo Rating System (deflation mechanism): https://fide.com/docs/presentations/Sonas%20Proposal%20-%20Repairing%20the%20FIDE%20Standard%20Elo%20Rating%20System.pdf ; inflation above a floor: https://talkchess.com/viewtopic.php?p=282912
51. Apex Legends matchmaking update (queue time against skill spread): https://www.ea.com/games/apex-legends/news/matchmaking-update-0924
52. OpenSkill (Weng-Lin) Python package: https://pypi.org/project/openskill/
53. chess.com, Play bots (always unrated; bot strength ranges): https://support.chess.com/en/articles/8614091-how-can-i-play-against-the-chess-com-bots and https://support.chess.com/en/articles/8614310-the-game-ended-and-my-rating-didn-t-change-at-all-why
54. Lichess forum, ratings of Stockfish levels: https://lichess.org/forum/general-chess-discussion/what-are-the-elo-ratings-for-stockfish-levels-4-5-6-7-and-8
55. Lichess blog, Welcome Lichess Bots: https://lichess.org/blog/WvDNticAAMu_mHKP/welcome-lichess-bots ; forum discussion of drawbacks: https://lichess.org/forum/lichess-feedback/drawbacks-of-bot-accounts
56. Chessiverse, Chess bot rating accuracy (a competitor's comparison): https://chessiverse.com/compare/chess-bot-rating-accuracy
57. McIlroy-Young, Sen, Kleinberg & Anderson (2020), Aligning Superhuman AI with Human Behavior: Chess as a Model System, KDD: https://arxiv.org/abs/2006.01855 ; https://maiachess.com/blog/introducing_maia
58. AlternativeTo listing for GeoGuess.com (bot duels): https://alternativeto.net/software/geoguess-com
59. van der Linden (2006), A lognormal model for response times on test items: https://research.utwente.nl/en/publications/a-lognormal-model-for-response-times-on-test-items/ ; van der Linden (2007), A hierarchical framework for modeling speed and accuracy on test items: https://ris.utwente.nl/ws/files/5129699/Linden05hierarchical.pdf
60. Hasbro's BATTLESHIP on Steam (Commanders mode): https://store.steampowered.com/app/893050/Hasbros_BATTLESHIP/
61. Wikipedia, Battleship (1996 video game): https://en.wikipedia.org/wiki/Battleship_(1996_video_game)
62. AppleVis review of Trivia Crack (power-ups and coins; dated): https://applevis.com/comment/20587
63. Millionaire fan wiki, Lifeline: https://millionaire.fandom.com/wiki/Lifeline
64. Wikipedia, Blue shell: https://en.wikipedia.org/wiki/Blue_shell
65. Bugnet, How to design counterplay in competitive games: https://bugnet.io/blog/how-to-design-counterplay-in-competitive-games
