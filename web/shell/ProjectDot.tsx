import type { ProjectActivity } from './ProjectActivity.ts';

interface ProjectDotProperties {
  activity: ProjectActivity;
}

/** Waiting borrows the in-progress fill, so every status colour stays a `[data-state]` token. */
export function ProjectDot({ activity }: ProjectDotProperties) {
  return <span className="ap-project-dot" data-activity={activity} {...(activity === 'waiting' ? { 'data-state': 'in-progress' } : {})} aria-hidden="true" />;
}
