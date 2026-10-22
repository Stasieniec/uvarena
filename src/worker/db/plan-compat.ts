// Compile-time check, no runtime code: the finalization plan row types in
// src/shared/game/types.ts must stay assignable to the Drizzle insert types,
// so finalize-writer.ts can pass them to insert().values() unchanged. If this
// file stops compiling, the schema and the plan types have drifted apart.

import type {
  AnswerRow,
  MatchRoundRow,
  MatchRowUpdate,
  PlayerCourseRow,
  RatingRow,
} from "../../shared/game/types";
import type { answers, matches, matchRounds, playerCourse, ratings } from "./schema";

type Assignable<T, U> = [T] extends [U] ? true : false;
type Expect<T extends true> = T;

export type PlanCompatChecks = [
  Expect<Assignable<RatingRow, typeof ratings.$inferInsert>>,
  Expect<Assignable<PlayerCourseRow, typeof playerCourse.$inferInsert>>,
  Expect<Assignable<MatchRoundRow, typeof matchRounds.$inferInsert>>,
  Expect<Assignable<AnswerRow, typeof answers.$inferInsert>>,
  Expect<Assignable<MatchRowUpdate, Partial<typeof matches.$inferInsert>>>,
];
