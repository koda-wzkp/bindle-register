import type { Metadata } from 'next';
import Link from 'next/link';

// IBM Plex across the app: continuity with the Pleco brand (its mark is set
// in Plex Serif), and Plex Mono gives hashes and BUIDs a ledger register.
// Self-hosted so builds are deterministic and offline-safe.
import '@fontsource/ibm-plex-serif/400.css';
import '@fontsource/ibm-plex-serif/400-italic.css';
import '@fontsource/ibm-plex-serif/500.css';
import '@fontsource/ibm-plex-serif/600.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Bindle Register',
  description:
    'Register creative works, sign the splits, freeze the record. Content-addressed production registration.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto flex min-h-screen max-w-4xl flex-col px-5 sm:px-8">
          <header className="no-print flex items-baseline justify-between py-6">
            <Link href="/" className="font-display text-lg font-medium tracking-tight">
              Bindle <span className="text-ink-soft">Register</span>
            </Link>
            <span className="eyebrow hidden sm:inline">terms → signatures → frozen record</span>
          </header>
          <div className="rule no-print" />
          <main className="flex-1 py-10">{children}</main>
          <footer className="no-print rule py-6">
            <p className="font-mono text-[11px] text-ink-soft">
              Append-only. Every record verifies offline: npx bindle-verify
            </p>
          </footer>
        </div>
      </body>
    </html>
  );
}
