// Web: no OS splash exists and the pre-hydration body is already the brand
// background (app/+html.tsx), so no overlay — an RN Animated overlay would also
// hit the rAF trap (bug pattern 40b). Renders nothing.
export function BrandSplash(_props: { booted: boolean }) {
  return null;
}
