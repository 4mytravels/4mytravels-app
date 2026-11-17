// M11 — layout widths (one source for AppFrame, Statistics and the tests).
export const CONTENT_MAX_WIDTH = 560;
/** From this window width the Stats screens use the wide layout. */
export const WIDE_BREAKPOINT = 900;
export const WIDE_MAX_WIDTH = 1040;

/** Routes that get the wide Stats layout (Statistics tab + /stats/*). */
export function isWideRoute(pathname: string): boolean {
  return pathname === '/statistics' || pathname.startsWith('/stats');
}

/** The column width AppFrame applies for a window width + route. */
export function frameMaxWidth(windowWidth: number, pathname: string): number {
  return windowWidth >= WIDE_BREAKPOINT && isWideRoute(pathname) ? WIDE_MAX_WIDTH : CONTENT_MAX_WIDTH;
}
