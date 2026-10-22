# Quiz questions for the period 2 courses

Research for the ranked quiz game: what is known about Agentic AI and Engineering Production-Ready ML/AI Systems, what the item-writing literature says about closed-form questions, and a concrete authoring format for the university vault. Written 2026-10-22.

## The short version

- **Agentic AI (5204AGAI6Y)** is a new course this year (no 2024-25 or 2025-26 catalogue entry). The catalogue confirms **assignments plus written exam(s)**. It does not say whether the exam is multiple choice. The Canvas course is not visible yet.
- **Engineering Production-Ready ML/AI Systems (5204EPRM6Y)** has **no written exam**. The catalogue lists report, lab/project assignments and presentation, and Canvas shows five weekly assignments, a course project with presentations in week 8, and one graded quiz on the two guest lectures. Stas's guess that it is practice heavy is confirmed. A quiz bank for this course serves understanding and the guest-lecture quiz, since no exam exists for it to prepare for.
- **Format:** one YAML file per lecture in `Courses/<COURSE>/Quiz/`, ids assigned by a script (never by the writer), correctness stored on each option, per-option explanations, a `rev` number that is bumped only when the meaning changes, and a validator plus exporter that produces the game's JSON bank. Keep the bank off the published site.
- **Scoring multiple select in duels:** all-or-nothing. Per-option partial credit pays about 50% for random tapping, which a timer encourages.
- **Size:** about 25 to 35 reviewed items per Agentic AI lecture and 35 to 45 per Engineering week. The ratings need answers per item to calibrate, and a class-sized player base spreads thin over a big bank, so a smaller reviewed bank beats a large unreviewed one.

## The two courses

### Agentic Artificial Intelligence (5204AGAI6Y)

| | | source |
|---|---|---|
| EC, level | 6 EC, master, period 2, English | catalogue 2026-27 |
| Coordinator | dr. F.P. Pascoal Dos Santos (Fernando P. Santos), f.p.santos@uva.nl. Assistant professor at the Informatics Institute, works on cooperation and reputation in multi-agent reinforcement learning | catalogue; UvA profile |
| Other lecturers | none listed | catalogue |
| Teaching | lectures and computer lab sessions | catalogue |
| Assessment | "Assignment(s)" and "Written exam(s)". No weights, no exam format | catalogue |
| Schedule | lectures Tue and Thu 15:00-16:45; lab Wed 11:00-12:45, SP B0.202 (Group 3) | life-ops `40-areas/university/university.md`, from MyTimetable |
| Capacity | 80 students, MSc AI priority | catalogue |
| Canvas | not in his active courses on 2026-10-22, so no modules, slides or announcements yet | Canvas MCP |

**Learning objectives (catalogue, verbatim in substance):**
- Understand classic definitions of rational agent and evaluate dynamics of multi-agent systems.
- Apply mathematical tools to identify solution concepts in normal form, repeated and stochastic games.
- Design learning agents based on (deep) reinforcement learning that adapt while interacting with an environment and other agents.
- Understand the foundations of agentic AI: planning, reasoning and acting with LLM agents.
- Apply programming frameworks for building AI agents and for cooperation between multiple agents.
- Critically reflect on risks and miscoordination in deployed multi-agent systems, and on mitigation techniques.

**Topic order (catalogue description):** rational agents, then game-theoretic solution concepts, then multi-agent reinforcement learning, as the classical half. Then LLM-based agent architectures and workflows, interaction protocols, agent frameworks (LangChain, LangGraph, AutoGen named as examples), and risks of deploying agentic systems.

**Readings (catalogue):**
- Shoham and Leyton-Brown, *Multiagent Systems: Algorithmic, Game-Theoretic, and Logical Foundations* (2008), selected chapters.
- Albrecht, Christianos and Schäfer, *Multi-Agent Reinforcement Learning: Foundations and Modern Approaches* (MIT Press, 2024), selected chapters.
- Papers via Canvas, including Yao et al., ReAct (the catalogue says ICLR 2022; it appeared at ICLR 2023, arXiv 2022); Park et al., Generative Agents (UIST 2023); Wu et al., AutoGen (COLM 2024); Schroeder et al., "How malicious AI swarms can threaten democracy" (Science, 2026); Evans, Bratton and Agüera y Arcas, "Agentic AI and the next intelligence explosion" (Science, 2026).
- From memory, not checked today: both books have free PDFs on their authors' sites (masfoundations.org, marl-book.com).

**Not known yet:** exam format (multiple choice like MNLP, or open questions), exam date, assignment count and weights, lecture-by-lecture schedule, whether the lab is graded. These should appear once the Canvas course is published, likely by Tue 27 Oct.

**What this means for questions.** The second objective ("apply mathematical tools to identify solution concepts") suggests the exam will ask him to find equilibria in small games. The game's no-computation rule rules those out as-is. The quiz can still cover the concepts behind them (what makes a profile a Nash equilibrium, what a dominant strategy is, why the one-shot prisoner's dilemma ends in mutual defection). One decision for him: whether reading a 2x2 payoff matrix with small integers and spotting the pure equilibrium counts as "computing". It is comparison at a glance, and it is probably what the exam tests. I would allow it for 2x2 games only, tagged `level: apply`.

### Engineering Production-Ready ML/AI Systems (5204EPRM6Y)

| | | source |
|---|---|---|
| EC, level | 6 EC, master, period 2, English | catalogue 2026-27 |
| Coordinator and lecturer | Kemal T. Yesilbek, k.t.yesilbek@uva.nl | catalogue; intro deck |
| Course director | Prof. Dr. Evangelos Kanoulas | intro deck |
| TAs | Lev Hulsbergen, Christoforos Kalavasis, Chris Feltner, Vaibhav Guglani, Ignat Salnikov, Michael Fasching | intro deck |
| Teaching | lecture, computer lab sessions, independent project work | catalogue |
| Assessment | Report; Lab/project assignments; Presentation. Same list in 2025-26. **No written exam** | catalogue 2025-26 and 2026-27 |
| Schedule | Wed 15:00-17:45 SP H0.08; lab Thu 09:00-10:45 SP L1.01 | life-ops `university.md` |
| GenAI | "No (Gen)AI usage is allowed." TAs will ask about your work | intro deck |
| Code | `github.com/kemalty/uva-mlprod-code`, branch `v4` (could not be read from this session) | intro deck |
| Cloud | Google Cloud vouchers, $50 per person for 70 students | intro deck |

**Graded work on Canvas (as of 2026-10-22):**

| item | due (Amsterdam time) | Canvas points |
|---|---|---|
| Assignment 0: setting up your environment | none | 0 |
| Assignment 1: roles, ML lifecycle, coding and unit testing | Tue 3 Nov, 23:59 | 10 |
| Assignment 2: distributed data processing | Tue 10 Nov, 23:59 | 10 |
| Assignment 4: deployment | Tue 24 Nov, 23:59 | 10 |
| Assignment 3: containerization | Fri 27 Nov, 23:59 | 10 |
| Assignment 5: telemetry | Tue 1 Dec, 23:59 | 10 |
| Quiz: guest lectures | Thu 10 Dec, 23:59 | 10 |
| Course project | Tue 15 Dec, 06:00 | 10 |

Assignment 3 is due after Assignment 4; that is how Canvas has it. Each assignment unlocks the Wednesday of its week at 12:00. Canvas points are not weights, and the weights are not published. The MCP reports some of these as "graded, submitted", which cannot be true for locked assignments; probably leftovers from a copied course shell, so ignore that field.

**Course project (intro deck):** a partly free end-to-end ML/AI system, built production-ready using the course's concepts, to be started after week 4, presented in exam week (week 8).

**Guest lectures (intro deck):** Basak Tugce Eskili (Senior ML Engineer, Booking.com), "From AI Demo to Production"; Mohamed Osama el Nagdy (Engineering Manager, Uber), "AI Security". Attendance required, and the graded quiz is about these two lectures. Dates not given; weeks 6 and 7 have no modules yet, so they probably land there.

**Weekly topics (Canvas modules and the decks already uploaded):**

| week | topic | what the deck covers |
|---|---|---|
| 1 | Data-driven roles, ML lifecycle, coding, unit testing | data engineer, analyst, scientist, ML engineer, platform teams; dev/acceptance/production environments; clean code (naming, small functions, comments explain why, keep it simple); unit tests, mocks, the FIRST properties |
| 2 | Distributed data processing | single core to multiprocessing to distributed; essential against accidental complexity; OLTP against OLAP; row against columnar storage, Parquet; Spark narrow and wide operations, lazy evaluation |
| 3 | Containerization and software engineering processes | containers against VMs; MLflow; unit, integration and end-to-end tests, Docker Compose; dev/acceptance/production; GitFlow; pull requests; technical debt |
| 4 | Deployment patterns | batch, API, streaming, edge; batch workflows as DAGs with triggers (schedule, file arrival, change data capture); HTTP APIs (methods, endpoints, status codes) |
| 5 | Telemetry and CI/CD | reactive against proactive monitoring; logs and log levels; Prometheus metric types (counter, gauge, histogram); dashboards; alerts and alert fatigue; system, data and business monitoring; CI and CD pipelines |
| 6 | (no module yet) | the week 3 deck says Kubernetes comes in week 6 |
| 8 | Course project submission | presentations |

**Readings:** Kästner, *Machine Learning in Production*; Huyen, *Designing Machine Learning Systems*; Lakshmanan et al., *Machine Learning Design Patterns* (catalogue). Weekly reading lists: week 1 has Seiden's *Outcomes Over Output*, the MIT Sloan article on returns from AI projects, Kästner's "Process and Teams" chapter and Martin's *Clean Code*; week 4 has Huyen chapter 6 (deployment), Kästner chapter 10 (deploying a model) and the Flask quickstart.

**Learning objectives (catalogue):** explain ML/AI challenges in companies; analyse ML code for simplicity, clarity and readability; implement automated tests at unit and system-interaction level; understand distributed data processing; build and inspect containerized ML applications; differentiate deployment strategies and build batch jobs and HTTP APIs; design telemetry for ML systems.

**What this means for questions.** The objectives are mostly practical, but each week has a conceptual layer that suits closed questions well: which role owns what, which test type catches which failure, OLTP against OLAP, narrow against wide operations, which metric type fits which measurement, which monitoring layer catches silent drift. The "analyse code for readability" objective makes code-reading items a natural fit. With no exam, the bank does not need to mirror an exam format.

## Writing closed-form questions

### Item-writing guidelines

Haladyna, Downing and Rodriguez (2002) reviewed 27 measurement textbooks and 27 studies and reduced an earlier set of 43 rules to 31 guidelines in five groups: content, formatting, style, writing the stem, writing the choices. The ones that matter most for a quiz bank written by an LLM:

- **Content.** One specific idea and one mental behaviour per item (1). Important content, nothing trivial (2). Use novel material and paraphrase instead of lifting the source's wording, so the item tests understanding instead of recognition (3). Items independent of each other (4). No opinion items (6), no trick items (7), simple vocabulary (8).
- **Formats.** Single best answer, alternate choice, true/false, multiple true/false, matching and context-dependent item sets are all endorsed. The "complex" type K format ("A and C only", "all except B") is to be avoided (9).
- **Stem.** Minimal reading (13), clear directions (14), the central idea in the stem (15), no window dressing (16). Word stems positively; if NOT or EXCEPT is used, capitalise and bold it (17).
- **Choices.** "Develop as many effective choices as you can, but research suggests three is adequate" (18). Exactly one right answer (19). Vary the key's position (20), or put choices in logical order (21). Choices independent and non-overlapping (22), homogeneous in content and grammar (23), about equal length (24). Use "none of the above" carefully (25) and avoid "all of the above" (26). Avoid clues: absolute words such as always and never, words that echo the stem, grammatical mismatches, a conspicuous key, pairs of options that point to the key, absurd options (28). All distractors plausible (29), built from typical student errors (30).

The list is a consensus of experts more than the product of experiments, and later critics say so. It is still the reference standard, and every flaw it names is one LLM-written items are known to show.

### Distractors

- **Fewer, better options.** Rodriguez's (2005) meta-analysis of 80 years of research concluded three options (one key, two distractors) are optimal in most settings: reliability holds up when weak distractors are removed, and items get shorter to read. Tarrant, Ware and Mohammed (2009) counted functioning distractors (chosen by at least 5% of examinees) in 514 nursing exam items with four options: only 13.8% had all three distractors working. A fourth option written to fill the slot is usually dead weight. For a phone, 3 or 4 options is right; use 4 only when the third distractor is a real error.
- **Where good distractors come from:** a neighbouring concept that students confuse with the key (data drift against concept drift, gauge against counter); the right answer to a different question (self-consistency offered as what ReAct adds); a true statement that does not answer the stem; an overgeneralisation with one word changed ("continuously improves", "on every benchmark"), which is exactly how the MNLP exam built its false statements; a typical misconception (the model runs the tool itself).
- **Plausible distractors teach.** Little, Bjork, Bjork and Angello (2012) found that multiple-choice practice with competitive incorrect alternatives improved later recall of information about the alternatives too, because learners retrieve why each wrong option is wrong. Cued recall did not do that. This is the argument for writing a reason for every distractor.
- **And feedback removes the cost.** Marsh, Roediger, Bjork and Bjork (2007) showed multiple-choice testing helps later recall overall, but some lures get learned as facts. Butler and Roediger (2008) showed that feedback after the test increased correct answers and reduced lure intrusions. The game should always show the explanation, and when the player picked a distractor, the reason that distractor is wrong.
- **LLM-written items.** Studies of LLM-generated multiple-choice questions consistently report implausible distractors and item-writing flaws (length cues, absolute terms) as the most common problems, and conclude human review is still needed (for example Arif, Asthana and Collins-Thompson, 2024, from the abstract). The validator below catches the mechanical flaws; an independent reviewer has to catch the rest.

### Multiple select, and how to score it in a timed duel

Multiple select (choose every true option) is the same thing as a multiple true/false item answered all at once. Couch, Hubbard and Brassil (2018) found that nearly half of students who pick the right answer to a single-choice item still hold wrong ideas about the other options, which the multiple true/false version exposes. So the format earns its place: it checks every option instead of just the best one.

Scoring methods vary and there is no consensus; Schmidt, Raupach, Wiegand, Herrmann and Kanzow (2021) catalogue them and their expected chance scores. The ones worth considering, with what a player who taps at random scores on a 4-option item:

| method | rule | random tapping earns |
|---|---|---|
| All-or-nothing | 1 only if the selected set is exactly right | 1/15 (any non-empty subset) |
| Half-point | 1 if right, 0.5 with one wrong decision, else 0 | about 0.19 |
| Per-option partial | share of the 4 options judged correctly | 0.5 |
| Pick-N (count shown) | "choose 2", all-or-nothing | 1/6 |

**Recommendation.** In duels, all-or-nothing, without showing how many options are correct (the MNLP exam did not show it either). A timer pushes players toward fast guessing, and per-option partial credit pays half marks for exactly that, while all-or-nothing keeps a lucky guess rare. It also gives a clean win or loss for the rating update. In untimed singleplayer, the half-point rule is a fair compromise that rewards nearly-right answers without paying much for guessing; Elo-style updates accept fractional results (Pelánek, 2016). Whatever the rule, the item's expected score must include its chance floor (below), or the rating will treat true/false items as easier than they are.

Authoring rule: allow 1 to k-1 correct options, never all, and vary the count across the bank. If every multiple-select item has two correct answers, players learn that and the format turns into Pick-N.

### True/false

True/false has a 50% guessing floor, and textbook advice (Frisbie and Becker, 1991, reviewed 17 measurement textbooks) is full of rules that exist because the format is easy to write badly: statements that are only partly true, absolute words that give the answer away, true statements copied verbatim from the source while false ones are paraphrased. Burton (2005) shows how much guessing lowers the reliability of short tests. Used carefully it still has a place: quick to read on a phone, good for the one-word-off misconceptions that the MNLP exam targets, and good for fast duel rounds.

Rules for this bank: one idea per statement; false statements made by changing one word that matters, never by adding a negation; no absolute words unless the statement is about an absolute; about as many false as true across the bank; keep true/false to about one item in six, and prefer multiple select when several statements share a stem.

### Other formats that work on a phone

- **Ordering.** Tap or drag 3 to 6 steps into sequence: a pipeline, a protocol round trip, the environments a change passes through. Score all-or-nothing; the chance floor is 1/n! (1/24 for four steps). Only order things whose order is fixed by the material; if two steps could swap, the item is ambiguous.
- **Matching or sorting.** Assign 3 to 5 items to 2 to 4 categories (metric types, drift types, roles), with categories reusable. Classic advice is to keep the premises homogeneous and to make sure the last pair cannot be found by elimination; reusable categories do that automatically. Haladyna's list endorses matching.
- **Which is NOT.** Allowed by the guidelines with the negative capitalised and bolded. Under a timer the NOT gets misread, so use it rarely and render it bold. It works well when three true properties are easy to list and the one false property is the point.
- **Odd one out.** Little research on it as a format, and its weakness is that a clever player can defend a different odd one. Write it with the criterion in the stem ("three are data monitoring checks; which is a system metric?"). At that point it is a single-choice item, which is fine.
- **Cloze with options.** A sentence with one blank and 3 or 4 terms. Good for one-term recall at easy level. Watch the grammar around the blank: "an ___" with only one vowel-initial option gives the answer away (guideline 28c). Put the article inside the options.
- **Choose the right code snippet.** Single choice where the options are short snippets: which test is a real unit test, which Dockerfile ordering reuses the cache, which log call leaks sensitive data. Keep snippets to 3 to 8 lines and under about 45 characters per line so nothing scrolls sideways on a phone. Parsons problems (ordering lines of code) are a related, well-studied format: Denny, Luxton-Reilly and Simon (2008) found exam scores on them correlated strongly with code-writing scores. They are worth adding later for Engineering, as an ordering item whose steps are code lines.
- **Scenario items.** A three-line situation and a single-choice question about it (which drift is this, which test type would have caught it, which deployment option fits this latency requirement). This is the main way to reach application and analysis level without computation.

### Targeting difficulty

The revised Bloom taxonomy (Anderson and Krathwohl, 2001) runs remember, understand, apply, analyze, evaluate, create. Scully (2017) argues and shows with examples that well-built multiple-choice items can test up to the analyze level, mainly by presenting novel material: a new scenario, a trace, a snippet the learner has not seen. Without computation, the levels look like this:

- **Remember:** recognise a definition or term ("which metric type only increases?").
- **Understand:** explain or contrast ("what does ReAct add to chain-of-thought?").
- **Apply:** classify an unseen case ("the fraud model's inputs are unchanged but precision fell: what drift is this?").
- **Analyze:** diagnose from a trace, a log excerpt or a code snippet; pick the cause among plausible ones.

Difficulty should come from how close the distractors are and how many reasoning steps are needed. It should never come from obscurity (a year, a benchmark number, an author's first name); guideline 2 rules that out, and the vault's flashcard rules already ban it. A hard item is one that a student who half-understands gets wrong because the distractor matches their half-understanding.

Author-assigned difficulty is a rough prior. Teachers and experts estimate item difficulty poorly (Impara and Plake, 1998), and adaptive practice systems recalibrate item difficulty from answers: the Elo approach treats each answer as a match between player and item and updates both ratings (Pelánek, 2016). Math Garden, built at UvA, does the same at scale and selects items for about 75% expected success (Klinkenberg, Straatemeier and van der Maas, 2011). Its scoring rule also folds response time into the score (Maris and van der Maas, 2012), which is directly relevant to a timed duel.

**Starting ratings.** On a 1500-centred Elo scale (400 points per factor of 10 in odds): easy 1300, medium 1500, hard 1700. Combine with the chance floor per type, P(correct) = c + (1 - c) / (1 + 10^((d - r)/400)), where c is 1/k for single choice and cloze, 1/2 for true/false, 1/(2^k - 1) for all-or-nothing multiple select, 1/n! for ordering. This is Pelánek's shifted logistic, written in Elo units. Use a larger update step for an item's first answers so the prior washes out after roughly 20 to 30 answers (Pelánek describes a decreasing uncertainty function, U(n) = a/(1 + bn), for this).

## The authoring format

### Options considered

| option | for | against |
|---|---|---|
| `## Quiz` callouts in each lecture note | next to the content; one file | answers published on the site; callout syntax for options and per-option reasons is fiddly to parse; makes notes longer |
| A Markdown quiz file per lecture with callouts | separate from notes | same parsing problem; Quartz publishes it by default |
| **A YAML file per lecture** | easy for an LLM to write; strict schema; code blocks fit as block scalars; ids are plain fields; parses in one line of Python | Obsidian hides it unless "detect all file extensions" is on; Quartz copies non-Markdown files to the site unless told not to |
| A JSON file per lecture | the game reads it directly | miserable to write: escaped newlines in code, no comments, one missing comma breaks the file |

**Recommendation: one YAML file per lecture**, at `Courses/<COURSE>/Quiz/<COURSE>-L01.quiz.yaml` (for Engineering, one file per week, `EPRM-W01.quiz.yaml`, plus `EPRM-Guest-Booking.quiz.yaml` and `EPRM-Guest-Uber.quiz.yaml`). Folder names for the two courses are his choice; the letters in the official codes (AGAI, EPRM) are the obvious candidates, and the examples below use them. JSON is the export format, generated, never written by hand.

### Keep it off the published site

Keep the bank game-only. Published answers would let duel players look items up mid-match, and players who have read the items before playing make the item ratings meaningless. The explanations already live in the lecture notes, and the site keeps its flashcards.

Two things to change when the bank is created, both outside the vault files themselves:
- **Quartz.** Quartz's asset emitter copies every non-Markdown file under `content/` into `public/`, so a YAML bank synced into `content/` would be served with all answers. Add `"**/Quiz/**"` to `ignorePatterns` in `quartz.config.ts`, or have the site's `sync.sh` skip `Quiz/` folders, then check that `public/` has no `.quiz.yaml`. I could not see `university-vault-site` from this session, so this needs checking there.
- **`course_pages.py`.** Add `"Quiz"` to `SKIP_DIRS`. It would already list nothing (the folder has no `.md` files), but it should be explicit. The course home could later show "N quiz questions, play them in the game" with a link and no answers.

### Schema

File level:

| field | required | meaning |
|---|---|---|
| `course` | yes | course folder name, e.g. `AGAI` |
| `note` | yes | filename stem of the source lecture note; must exist |
| `questions` | yes | list of items |

Item fields:

| field | required | meaning |
|---|---|---|
| `id` | yes | stable id. Writers put `id: new`; `quiz_bank.py assign-ids` replaces it once with `<course>-<6 random base32 chars>`, e.g. `agai-3f9k2m`. Never edited, never reused |
| `rev` | no, default 1 | bump only when the meaning changes (a different key, a different question). The game resets the item's rating on a new rev. Typo and wording fixes keep the rev |
| `status` | no, default `active` | `active`, `draft` (not exported) or `retired` (exported as hidden, so the id stays reserved). Items are retired, never deleted |
| `type` | yes | `single`, `multi`, `truefalse`, `order`, `match`, `cloze`. Type means the interaction; code and "which is NOT" items are `single` or `multi` |
| `difficulty` | yes | `easy`, `medium`, `hard`; starting rating 1300, 1500, 1700 |
| `level` | yes | Bloom level: `remember`, `understand`, `apply`, `analyze` |
| `topics` | yes | concept names, matching vault concept notes or headings, for per-topic stats |
| `section` | yes | heading in the source note that teaches this, for a "read more" deep link; must exist |
| `prompt` | yes, except `truefalse` | the question, Markdown; fenced code and `$...$` math allowed |
| `code` | no | language of code in the prompt or options, for highlighting |
| `options` | `single`, `multi`, `cloze` | list of `{id, text, correct, why}`; `correct` defaults to false; `why` is required on every wrong option and says why it is wrong |
| `shuffle` | no, default true | set false when options are in a logical order |
| `statement`, `answer` | `truefalse` | the statement and `true` or `false` |
| `items` | `order` | steps written in the correct order, each `{id, text}`; the game shuffles |
| `targets`, `pairs` | `match` | category names, and items each `{id, text, target}` |
| `why` | yes | explanation shown after answering, at most about 60 words, consistent with the note |
| `time` | no | seconds override for the duel timer (long code items); otherwise the game derives it from length |

Why it is shaped this way:
- **Correctness lives on the option.** A separate `answer: [b, d]` list drifts out of sync when options are reordered or edited; a flag on the option cannot.
- **Option ids are stable letters.** The game can log which option each player chose, which is what item analysis needs (non-functioning distractors, miskeyed items). Display order is shuffled at runtime, so writers never think about key position (guideline 20), and LLM writers' habit of putting the key first or second does not leak.
- **The writer never invents ids.** LLMs writing in bulk produce collisions and sequence gaps. The script assigns ids in place with a plain text substitution of `id: new` lines, so comments and formatting survive.
- **`rev` keeps ratings attached through edits.** The exporter keeps a fingerprint per item (type, option ids, correct set, ordering or targets). If the fingerprint changes and `rev` did not, `check` fails and asks whether this was a meaning change. If an id from the last export vanished, `check` fails and asks for `status: retired`.

### Full examples

All examples are real content: ReAct and tool calling (Agentic AI readings), and Engineering weeks 1, 2 and 5.

```yaml
# Courses/AGAI/Quiz/AGAI-L05.quiz.yaml
course: AGAI
note: "AGAI-L05 - LLM Agents and ReAct"
questions:

  # single: the standard best-answer item
  - id: agai-3f9k2m
    type: single
    difficulty: medium
    level: understand
    topics: [ReAct, Chain-of-Thought Prompting]
    section: "Reasoning and acting in one loop"
    prompt: What does ReAct add to chain-of-thought prompting?
    options:
      - id: a
        text: The model interleaves reasoning steps with actions, and each action's result is fed back into its context.
        correct: true
      - id: b
        text: The model is fine-tuned with reinforcement learning on the outcomes of its tool calls.
        why: ReAct works with few-shot prompting. No reinforcement learning is involved.
      - id: c
        text: A separate planner writes the complete plan before the first tool call is made.
        why: That describes plan-then-execute agents. ReAct decides each next step after seeing the last observation.
      - id: d
        text: Several reasoning chains are sampled and the most common final answer is kept.
        why: That is self-consistency, a decoding method that takes no actions at all.
    why: >-
      ReAct alternates thought, action and observation. Thoughts plan and track
      progress, actions query the outside world, and the observations ground the
      next thought in real information.

  # multi: choose every true statement, scored all-or-nothing in duels
  - id: agai-7w2p5c
    type: multi
    difficulty: hard
    level: understand
    topics: [ReAct]
    section: "What the experiments showed"
    prompt: Which statements about ReAct (Yao et al.) are true?
    options:
      - id: a
        text: Chain-of-thought alone can hallucinate facts because it has no access to outside information.
        correct: true
      - id: b
        text: ReAct beat chain-of-thought on every benchmark in the paper.
        why: On HotpotQA, ReAct alone scored slightly below chain-of-thought. Combining the two did best.
      - id: c
        text: A thought in a ReAct trace does not change the environment; only actions do.
        correct: true
      - id: d
        text: ReAct only works after fine-tuning the model on ReAct trajectories.
        why: The main results use few-shot prompting of a frozen model. Fine-tuning was an extra experiment.
    why: >-
      Grounding through actions fixes chain-of-thought's hallucination problem,
      but ReAct pays for it with less flexible reasoning, which is why it trailed
      chain-of-thought on HotpotQA and why the paper combines the two.

  # order: steps written in the right order, shuffled by the game
  - id: agai-q7m1x9
    type: order
    difficulty: medium
    level: understand
    topics: [Tool Use, Function Calling]
    section: "How a tool call works"
    prompt: Put one tool-calling round trip in order, from the user's message to the final answer.
    items:
      - id: a
        text: The application sends the user's message and the tool schemas to the model.
      - id: b
        text: The model replies with a tool name and JSON arguments instead of an answer.
      - id: c
        text: The application runs the tool with those arguments.
      - id: d
        text: The application sends the tool's result back to the model.
      - id: e
        text: The model writes the final answer using that result.
    why: >-
      The model never runs anything itself. It proposes a call, the application
      executes it, and the result goes back into the conversation as a new message.
```

```yaml
# Courses/AGAI/Quiz/AGAI-L02.quiz.yaml
course: AGAI
note: "AGAI-L02 - Normal Form Games"
questions:

  # "which is NOT": the negative is bold and capitalised
  - id: agai-k8r3d6
    type: single
    difficulty: easy
    level: understand
    topics: [Prisoner's Dilemma, Nash Equilibrium, Dominant Strategy]
    section: "The prisoner's dilemma"
    prompt: In the one-shot prisoner's dilemma, which statement is **NOT** true?
    options:
      - id: a
        text: Defecting is a dominant strategy for each player.
        why: True. Whatever the other player does, defecting pays more.
      - id: b
        text: Mutual defection is the only Nash equilibrium.
        why: True. Each player defects whatever the other does, so no other profile is stable.
      - id: c
        text: Both players are better off under mutual cooperation than under mutual defection.
        why: True. That gap is what makes it a dilemma.
      - id: d
        text: Mutual cooperation is a Nash equilibrium.
        correct: true
    why: >-
      In a Nash equilibrium no player gains by deviating alone. From mutual
      cooperation, either player gains by switching to defect, so it is not
      an equilibrium, even though both prefer it to mutual defection.
```

```yaml
# Courses/EPRM/Quiz/EPRM-W05.quiz.yaml
course: EPRM
note: "EPRM-W05 - Telemetry and CI-CD"
questions:

  # truefalse: one idea, made false by one word that matters
  - id: eprm-8d2r4t
    type: truefalse
    difficulty: easy
    level: remember
    topics: [Telemetry, Prometheus]
    section: "Metrics"
    statement: A Prometheus counter is the right metric type for current CPU utilisation.
    answer: false
    why: >-
      A counter only goes up, like requests served or rows processed. CPU
      utilisation goes up and down, so it is a gauge.

  # match: sort items into reusable categories
  - id: eprm-k3v8n2
    type: match
    difficulty: medium
    level: apply
    topics: [Telemetry, Prometheus]
    section: "Metrics"
    prompt: Pick the Prometheus metric type for each measurement.
    targets: [Counter, Gauge, Histogram]
    pairs:
      - id: a
        text: Prediction requests served since the service started
        target: Counter
      - id: b
        text: Population stability index of one feature over the last hour
        target: Gauge
      - id: c
        text: Spread of the model's predicted probabilities
        target: Histogram
      - id: d
        text: Memory the model server is using right now
        target: Gauge
    why: >-
      Counters only increase, gauges move both ways, and histograms bin many
      observed values so you can see their distribution.

  # odd one out, written with the criterion in the stem
  - id: eprm-t6h9q4
    type: single
    difficulty: medium
    level: apply
    topics: [Model Monitoring]
    section: "What to monitor"
    prompt: Three of these are data monitoring checks. Which one is system monitoring?
    options:
      - id: a
        text: 95th percentile request latency
        correct: true
      - id: b
        text: Number of rows in each incoming batch
        why: Input volume is a property of the data, so it belongs to data monitoring.
      - id: c
        text: Shift in one feature's distribution
        why: Feature drift is the core of data monitoring, where silent failures show up.
      - id: d
        text: Shift in the distribution of predicted probabilities
        why: Output drift is also data monitoring. It covers the model's inputs and outputs.
    why: >-
      System monitoring watches infrastructure and the application (CPU, memory,
      latency, error codes) without any data logic. Data monitoring watches what
      goes into and comes out of the model.

  # scenario at application and analysis level
  - id: eprm-m2c5z8
    type: single
    difficulty: hard
    level: analyze
    topics: [Data Drift, Concept Drift]
    section: "Why ML fails silently"
    prompt: >-
      A fraud model has run for six months. Monitoring shows the input feature
      distributions have not changed, but precision has dropped since fraudsters
      changed tactics. What has most likely happened?
    options:
      - id: a
        text: Concept drift, a change in how the inputs relate to the label
        correct: true
      - id: b
        text: Data drift, a change in the distribution of the inputs
        why: The stem says the input distributions are unchanged.
      - id: c
        text: Label shift, a change in how common fraud is
        why: With fraud patterns fixed, a change in the fraud rate would also move the input distribution.
      - id: d
        text: Training-serving skew, features computed differently in production
        why: Skew would have hurt the model from launch, not after a change in the world.
    why: >-
      The same inputs now mean something different: transactions that used to
      look legitimate are fraud. P(y|x) changed while P(x) did not, which is
      concept drift, and only monitoring of outcomes or labels catches it.
```

```yaml
# Courses/EPRM/Quiz/EPRM-W02.quiz.yaml
course: EPRM
note: "EPRM-W02 - Distributed Data Processing"
questions:

  # cloze: the article sits inside each option so the grammar gives nothing away
  - id: eprm-p5c7w1
    type: cloze
    difficulty: easy
    level: remember
    topics: [Apache Spark, Lazy Evaluation]
    section: "Spark evaluates lazily"
    prompt: Spark records transformations without running them, and starts computing only when ___ asks for a result.
    options:
      - id: a
        text: an action
        correct: true
      - id: b
        text: a transformation
        why: Transformations are exactly what Spark postpones.
      - id: c
        text: a shuffle
        why: A shuffle is data movement inside a wide operation. It is not what triggers execution.
      - id: d
        text: a repartition
        why: Repartitioning is itself a transformation and is postponed too.
    why: >-
      Waiting until an action such as count or write lets Spark see the whole
      job and optimise it, for example by filtering before a join.
```

```yaml
# Courses/EPRM/Quiz/EPRM-W01.quiz.yaml
course: EPRM
note: "EPRM-W01 - Roles, ML Lifecycle, Coding and Unit Testing"
questions:

  # code: options are snippets; keep them short and narrow for a phone
  - id: eprm-v4n8b2
    type: single
    code: python
    difficulty: medium
    level: apply
    topics: [Unit Testing, Mocking]
    section: "Anatomy of a unit test"
    prompt: >-
      In module `rates`, `convert(amount, src, dst)` calls `get_rate(src, dst)`,
      which queries an external currency API. Which test is a fast, repeatable
      unit test of `convert`?
    options:
      - id: a
        text: |
          def test_convert():
              assert convert(10, "EUR", "USD") > 0
        why: It calls the real API, so it is slow and fails when the API is down. The assertion also checks almost nothing.
      - id: b
        text: |
          def test_convert(monkeypatch):
              monkeypatch.setattr(
                  rates, "get_rate",
                  lambda src, dst: 2.0)
              assert convert(10, "EUR", "USD") == 20.0
        correct: true
      - id: c
        text: |
          def test_convert():
              rate = get_rate("EUR", "USD")
              expected = 10 * rate
              assert convert(10, "EUR", "USD") == expected
        why: It calls the real API twice. The rate can change between the calls, so the test is not repeatable.
    why: >-
      Replacing the external dependency with a fixed fake makes the test isolated,
      fast and repeatable (the F, I and R in FIRST), and the expected value is
      known exactly.
```

### What the export looks like

`python3 docs/superpowers/tools/quiz_bank.py export` would write one JSON bank (into the game repo or a build step, outside the published site). One item:

```json
{
  "id": "eprm-8d2r4t",
  "rev": 1,
  "course": "EPRM",
  "note": "EPRM-W05 - Telemetry and CI-CD",
  "url": "https://notes.swasilewski.com/Courses/EPRM/Lectures/EPRM-W05---Telemetry-and-CI-CD#metrics",
  "type": "truefalse",
  "difficulty": "easy",
  "start_rating": 1300,
  "chance": 0.5,
  "level": "remember",
  "topics": ["Telemetry", "Prometheus"],
  "statement": "A Prometheus counter is the right metric type for current CPU utilisation.",
  "answer": false,
  "why": "A counter only goes up, like requests served or rows processed. CPU utilisation goes up and down, so it is a gauge.",
  "fingerprint": "sha256 of type, answer and option ids",
  "status": "active"
}
```

The URL slug rule should be copied from the site's existing links (Quartz turns spaces and " - " into hyphens; the live MNLP and PhilSci URLs show the pattern).

### The tool

One script next to the existing ones, `docs/superpowers/tools/quiz_bank.py`, with three commands:
- `assign-ids`: replaces each `id: new` with a fresh unique id, in place.
- `check`: the automated half of the checklist below; exits non-zero on errors, prints warnings. Run it in the same place `vault_audit.py` runs.
- `export`: validates, then writes the JSON bank and the fingerprint file used for the next `check`.

PyYAML 6 and jsonschema are installed in this environment. Load with `yaml.safe_load` and validate types strictly, so YAML's habit of reading `no` or `on` as booleans is caught as a type error.

## How many questions, and which kinds

**Per lecture.** Agentic AI has about two lectures a week for seven weeks; Engineering has one long lecture a week for five or six weeks plus two guest lectures.

| | per unit | course total |
|---|---|---|
| Agentic AI lecture | 25 to 35 | roughly 350 to 450 |
| Engineering week | 35 to 45 (one lecture covers what Agentic AI spreads over two) | roughly 200 to 250 |
| Engineering guest lecture | 10 to 15, written only from what was actually said (no slides on Canvas yet) | 20 to 30 |

The reasoning: a duel or a singleplayer session draws 10 to 15 items, and with fewer than about 20 per lecture a player sees repeats within days. Against that, each item needs roughly 20 to 30 answers before its rating means anything, and the player base is one cohort. If 20 players answer 30 items a day, a 450-item bank gets about 1.3 answers per item per day, so calibration takes two to three weeks. A bigger bank calibrates more slowly and costs more review time. Start in that range and add items where the data shows gaps.

**Mix of types**, as targets across a lecture, adjusted to what the content supports:

| type | Agentic AI | Engineering |
|---|---|---|
| single (including scenario, NOT, odd one out) | about 45% | about 35% |
| single or multi with code options | rare | about 15% |
| multi | about 20% | about 15% |
| truefalse | about 15% | about 15% |
| order | about 5 to 10%, where a real sequence exists | about 10% |
| match | about 5 to 10% | about 10% |
| cloze | a few, easy only | a few, easy only |

**Difficulty:** about 30% easy, 45% medium, 25% hard. **Level:** at least half above remember, and every hard item at apply or analyze. A lecture's easy items should cover its core terms, so a newcomer can play it the week it is taught.

**Relation to flashcards.** The friends' feedback was about cards that are already quizzes in disguise: MNLP has 92 "True or false" and 36 "Multiple selection" cards out of 354, written as flip cards. For the new courses, a clean split: flashcards stay one-fact recall (vault CLAUDE.md section 3.8), and true/false and multiple-selection practice moves into the quiz bank. Section 3.8 would need one line saying so. The MNLP and PhilSci exams are done (PhilSci on 19 Oct, MNLP today), so converting their cards matters only if he wants a demo bank before the new lectures start, and the 128 MNLP cards would make a decent one.

## Validation checklist

### Checked by the script

Errors (the file does not export):
- Schema: required fields present, enums valid, no unknown fields, every `id` assigned and unique across the vault, `rev` an integer.
- The source note exists and `section` matches one of its headings; every topic resolves to a concept note or a heading in the source note.
- `single` and `cloze`: 3 to 5 options, exactly one correct. `multi`: 4 to 6 options, between 1 and k-1 correct. `order`: 3 to 6 items. `match`: 3 to 5 pairs, 2 to 4 targets, every target used at least once.
- Every wrong option has a `why`; every item has a `why`.
- No option reads "all of the above", "none of the above", "both", "neither", or names other options ("A and C").
- NOT, EXCEPT or LEAST in a prompt must be capitalised and bold.
- An id present in the last export is missing (use `status: retired`), or the fingerprint changed without a `rev` bump.
- House writing rules: no em-dashes, no emoji; no "the lecture", "the slides", "this note", "above" or "below" (items are played mixed across the course, same as flashcards).

Warnings (exports, but listed for review):
- The key is the longest option by more than about 25% (the classic length cue).
- Absolute words (always, never, only, all, none, completely) in distractors but not in the key, or the reverse.
- The key repeats a distinctive word from the stem that no distractor shares (clang association).
- Prompt over about 50 words, option over about 25 words, code over 8 lines or 45 characters per line.
- A cloze blank preceded by "a" or "an".
- Near-duplicate prompts in the bank (normalised text similarity).
- Per-lecture balance: true/false share, how many correct options multi items have, key-position habits before shuffling, difficulty and level mix outside the targets above.

### Checked by an independent reviewer

The vault already requires independent review before a lecture note is `complete`; the quiz file should get the same. A reviewer agent with only the lecture note:
- **Answers every item cold** before seeing the key, then compares. Any disagreement is either a miskey or an ambiguity; both get fixed.
- **Covers the options** for single-choice items: could someone who knows the material answer from the stem alone? If not, the stem is missing its central idea (guideline 15).
- **Checks each distractor**: wrong according to the note, beyond argument; plausible to someone who half-knows the topic; built from a real confusion. A distractor nobody would pick is replaced or removed (three options are fine).
- **Checks the key** against the note, and that the item does not depend on facts outside the note. Anything from outside the course material is either removed or the source is cited in `why`.
- **Checks for trivia**: no years, author first names, benchmark numbers or page facts unless the material treats them as the point. Numbers become directions ("which gained more?").
- **Checks no computation is needed** (the 2x2 game exception aside, if he accepts it).
- **Checks the difficulty and level labels** are believable, and that hard items are hard because of reasoning.
- **Checks the explanation** agrees with the note, says why the key is right, and is short enough to read between duel rounds.

### Checked by the players, after launch

Once an item has about 30 answers, the game's own data does the item analysis that test developers do:
- **Proportion correct** far from what its rating predicts: the difficulty label was off (the rating fixes this by itself).
- **A distractor chosen by under 5% of players** (Tarrant et al.'s threshold): it is not doing anything; rewrite it.
- **Higher-rated players miss it more often than lower-rated ones** (negative discrimination): almost always a miskey or an ambiguous stem. Pull it for review.
- **A "report this question" button**, feeding a list the next writing session reads.

## Sources

Course information
- UvA course catalogue entries for 5204AGAI6Y (course 59756) and 5204EPRM6Y (course 58532), academic year 2026-27, read through the catalogue's own API (`api.studiegids.uva.nl/graphql`) on 2026-10-22; 5204EPRM6Y 2025-26 (course 54669) for comparison. Public page format: https://coursecatalogue.uva.nl/en/courses/2026/1/59712
- Canvas course 59626 (5204EPRM6Y): modules, assignments, intro deck and the decks for weeks 1 to 5, via the Canvas MCP, 2026-10-22.
- life-ops `40-areas/university/university.md`, `key-dates.csv`, `30-projects/ranked-quiz-game/project.md`.
- Fernando P. Santos, UvA profile: https://www.uva.nl/en/profile/p/a/f.p.pascoaldossantos/f.p.pascoal-dos-santos.html

Question design
- Haladyna, T. M., Downing, S. M., and Rodriguez, M. C. (2002). A review of multiple-choice item-writing guidelines for classroom assessment. *Applied Measurement in Education*, 15(3), 309-333. Guideline list as summarised at https://bookdown.org/stefanmosjos/manualesitems/_book/haladyna-2002.html
- Rodriguez, M. C. (2005). Three options are optimal for multiple-choice items: a meta-analysis of 80 years of research. *Educational Measurement: Issues and Practice*, 24(2), 3-13.
- Tarrant, M., Ware, J., and Mohammed, A. M. (2009). An assessment of functioning and non-functioning distractors in multiple-choice questions: a descriptive analysis. *BMC Medical Education*, 9, 40.
- Gierl, M. J., Bulut, O., Guo, Q., and Zhang, X. (2017). Developing, analyzing, and using distractors for multiple-choice tests in education: a comprehensive review. *Review of Educational Research*, 87(6), 1082-1116.
- Little, J. L., Bjork, E. L., Bjork, R. A., and Angello, G. (2012). Multiple-choice tests exonerated, at least of some charges. *Psychological Science*, 23(11), 1337-1344.
- Marsh, E. J., Roediger, H. L., Bjork, R. A., and Bjork, E. L. (2007). The memorial consequences of multiple-choice testing. *Psychonomic Bulletin and Review*, 14(2), 194-199.
- Butler, A. C., and Roediger, H. L. (2008). Feedback enhances the positive effects and reduces the negative effects of multiple-choice testing. *Memory and Cognition*, 36(3), 604-616.
- Couch, B. A., Hubbard, J. K., and Brassil, C. E. (2018). Multiple-true-false questions reveal the limits of the multiple-choice format for detecting students with incomplete understandings. *BioScience*, 68(6), 455-463.
- Schmidt, D., Raupach, T., Wiegand, A., Herrmann, M., and Kanzow, P. (2021). Relation between examinees' true knowledge and examination scores: systematic review and exemplary calculations on multiple-true-false items. *Educational Research Review*, 34, 100409.
- Frisbie, D. A., and Becker, D. F. (1991). An analysis of textbook advice about true-false tests. *Applied Measurement in Education*, 4(1), 67-83.
- Burton, R. F. (2005). Multiple-choice and true/false tests: myths and misapprehensions. *Assessment and Evaluation in Higher Education*, 30(1), 65-72.
- Denny, P., Luxton-Reilly, A., and Simon, B. (2008). Evaluating a new exam question: Parsons problems. *ICER 2008*, 113-124.
- Anderson, L. W., and Krathwohl, D. R. (Eds.) (2001). *A Taxonomy for Learning, Teaching, and Assessing: A Revision of Bloom's Taxonomy of Educational Objectives*. Longman.
- Scully, D. (2017). Constructing multiple-choice items to measure higher-order thinking. *Practical Assessment, Research and Evaluation*, 22, article 4.
- Impara, J. C., and Plake, B. S. (1998). Teachers' ability to estimate item difficulty: a test of the assumptions in the Angoff standard setting method. *Journal of Educational Measurement*, 35(1), 69-81.
- Pelánek, R. (2016). Applications of the Elo rating system in adaptive educational systems. *Computers and Education*, 98, 169-179. Shifted logistic for multiple choice and the uncertainty function read from the accepted manuscript: https://www.fi.muni.cz/~xpelanek/publications/CAE-elo.pdf
- Klinkenberg, S., Straatemeier, M., and van der Maas, H. L. J. (2011). Computer adaptive practice of maths ability using a new item response model for on the fly ability and difficulty estimation. *Computers and Education*, 57(2), 1813-1824.
- Maris, G., and van der Maas, H. (2012). Speed-accuracy response models: scoring rules based on response time and accuracy. *Psychometrika*, 77(4), 615-633.
- Arif, Asthana and Collins-Thompson (2024), work-in-progress paper on LLM-generated questions from video transcripts, read from the abstract only: https://public.websites.umich.edu/~kevynct/pubs/L_S_2024_WorkInProgress_Question_Generation_CRFinal2.pdf

Content of the examples
- Yao, S., et al. ReAct: synergizing reasoning and acting in language models. ICLR 2023 (arXiv 2210.03629). The HotpotQA comparison (ReAct alone slightly below chain-of-thought, the combination best) and the few-shot setup are from the paper as I know it; check against the PDF when the course posts it.
- Engineering decks for weeks 1, 2 and 5 (FIRST properties, Spark lazy evaluation, Prometheus metric types with PSI as a gauge example, system, data and business monitoring).
