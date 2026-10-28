// The course switch: one segment per course, shown only when there is more
// than one. Everything below it is for that course.
import { useCurrentCourse } from "../lib/course";
import { Pills, cx } from "./ui";

export function CourseSwitch({ tone = "you", className }: { tone?: "you" | "ranked" | "bot"; className?: string }) {
  const { courses, courseId, setCourse, isLoading } = useCurrentCourse();
  if (isLoading || courses.length < 2) return null;
  return (
    <div className={cx("mt-3", className)}>
      <Pills label="Course" tone={tone} options={courses.map((c) => ({ value: c.id, label: c.shortTitle }))} value={courseId} onChange={setCourse} />
    </div>
  );
}
