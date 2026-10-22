import type { ProjectActivity } from './ProjectActivity.ts';

interface ProjectDotProperties {
  activity:           ProjectActivity;
  isQuestionWaiting?: boolean;
}

/** Waiting borrows the in-progress fill, so every status colour stays a `[data-state]` token; a waiting question rings the dot. */
export function ProjectDot({ activity, isQuestionWaiting = false }: ProjectDotProperties) {
  return (
    <span
      className="ap-project-dot"
      data-activity={activity}
      data-question-waiting={isQuestionWaiting}
      {...(activity === 'waiting' ? { 'data-state': 'in-progress' } : {})}
      aria-hidden="true"
    />
  );
}
