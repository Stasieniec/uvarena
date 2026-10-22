// The course switch: one pill per course. Everything below it is for that course.
import { useCurrentCourse } from "../lib/course";
import { Pills, Skeleton } from "./ui";

export function CourseSwitch({ tone = "you" }: { tone?: "you" | "ranked" | "bot" }) {
  const { courses, courseId, setCourse, isLoading } = useCurrentCourse();
  if (isLoading) return <Skeleton className="h-14" />;
  if (courses.length < 2) return null;
  return <Pills label="Course" tone={tone} options={courses.map((c) => ({ value: c.id, label: c.shortTitle }))} value={courseId} onChange={setCourse} />;
}
