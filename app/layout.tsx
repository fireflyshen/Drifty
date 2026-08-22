import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? 'http://localhost:3000'),
  title: 'Drifty · Schema registry',
  description: 'Manage reusable database capabilities, project composition and schema changes.',
  openGraph: {
    title: 'Drifty',
    description: 'Schema registry for database product lines',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Drifty schema registry' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Drifty',
    description: 'Schema registry for database product lines',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
