const OWNER_AND_REPOSITORY = /[:/]([^/:]+\/[^/]+?)(?:\.git)?\/?$/u;

/** `git@host:owner/repo.git` or `https://host/owner/repo` as `owner/repo`; anything else is shown as given. */
export function shortOriginOf(gitOrigin: string): string {
  return OWNER_AND_REPOSITORY.exec(gitOrigin)?.[1] ?? gitOrigin;
}
