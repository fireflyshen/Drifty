import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://drifty-schema.sure-charm-1845.chatgpt.site'),
  title: 'Drifty · 数据库模型注册表 / Schema Registry',
  description: '管理可复用数据库能力、项目组成和结构变更。Manage reusable database capabilities, project composition and schema changes.',
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
  return <html lang="zh-CN"><body>{children}</body></html>;
}
