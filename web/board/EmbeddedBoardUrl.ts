const EMBEDDED_QUERY_PARAMETER = 'embedded';
const EMBEDDED_IN_DASHBOARD = 'dashboard';

/** The board page as the frame asks for it: the header that repeats the dashboard's command bar left out. */
export function embeddedBoardUrlOf(pageUrl: string): string {
  const embeddedUrl = new URL(pageUrl);
  embeddedUrl.searchParams.set(EMBEDDED_QUERY_PARAMETER, EMBEDDED_IN_DASHBOARD);
  return embeddedUrl.href;
}
