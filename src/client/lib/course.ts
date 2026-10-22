// The selected course: prefs.courseId from /me, else the last one this device
// used, else the first course. Switching saves it to prefs (optimistically).
import { useCallback, useMemo } from "react";
import type { CoursesResponse } from "@shared/api-schemas";
import { useCourses, useMe, useUpdatePrefs } from "./queries";
import { COURSE_KEY, readLocal, writeLocal } from "./local-prefs";

export type Course = CoursesResponse["courses"][number];

export function sortedCourses(courses: Course[] | undefined): Course[] {
  return [...(courses ?? [])].sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title));
}

export function pickCourse(courses: Course[], preferred: (string | null | undefined)[]): Course | null {
  for (const id of preferred) {
    const hit = id ? courses.find((c) => c.id === id) : undefined;
    if (hit) return hit;
  }
  return courses[0] ?? null;
}

export function useCurrentCourse() {
  const me = useMe();
  const coursesQuery = useCourses();
  const update = useUpdatePrefs();
  const courses = useMemo(() => sortedCourses(coursesQuery.data?.courses), [coursesQuery.data]);
  const prefCourse = me.data?.prefs.courseId ?? null;
  const course = useMemo(() => pickCourse(courses, [prefCourse, readLocal(COURSE_KEY)]), [courses, prefCourse]);

  const setCourse = useCallback(
    (id: string) => {
      writeLocal(COURSE_KEY, id);
      if (me.data && me.data.prefs.courseId !== id) update.mutate({ courseId: id });
    },
    [me.data, update],
  );

  return {
    course,
    courseId: course?.id ?? null,
    courses,
    /** True once the user has picked a course on their account. */
    hasPicked: prefCourse !== null,
    setCourse,
    isLoading: coursesQuery.isLoading,
    error: coursesQuery.error,
    refetch: coursesQuery.refetch,
  };
}
