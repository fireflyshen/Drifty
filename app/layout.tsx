import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://drifty-schema.sure-charm-1845.chatgpt.site'),
  title: 'Drifty · 数据库结构流转',
  description: '看清平台、项目、版本与环境之间的字段差异。See schema changes before they drift.',
  openGraph: {
    title: 'Drifty',
    description: 'Schema changes, quietly in place.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Drifty · Schema changes, quietly in place.' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Drifty',
    description: 'Schema changes, quietly in place.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
