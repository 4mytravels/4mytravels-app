// Custom HTML root for Expo Router web (plan Task 6): injects the PWA
// manifest, theme color, iOS Add-to-Home-Screen metas and a strict CSP
// (scope §2.2: the in-memory key requires zero third-party JS — the CSP
// enforces it at the browser level; 'wasm-unsafe-eval' is required for the
// sqlite3mc WASM engine and does NOT allow JS eval).
import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

export const unstable_settings = {
  // Anchor the rendered HTML at the root so all routes share this shell.
  root: true,
};

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' blob:",
  "worker-src 'self' blob:",
  "connect-src 'self' https://api.frankfurter.dev",
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta httpEquiv="Content-Security-Policy" content={CSP} />
        <meta name="theme-color" content="#0A0A1A" />
        <meta name="description" content="Privacy-first travel expense tracker. Encrypted local storage, no account, no tracking." />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="4MyTravels" />
        <title>4MyTravels</title>
      </head>
      <body style={{ backgroundColor: '#0A0A1A' }}>
        {children}
        <ScrollViewStyleReset />
      </body>
    </html>
  );
}
