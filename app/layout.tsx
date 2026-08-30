import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { TooltipProvider } from '@/components/ui/tooltip';
import { PWARegister } from './pwa-register';

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  applicationName: 'Drifty',
  title: 'Drifty · 数据库结构流转',
  description: '看清平台、项目、版本与环境之间的字段差异。See schema changes before they drift.',
  manifest: '/manifest.webmanifest',
  icons: { icon:'/favicon.svg',shortcut:'/favicon.svg',apple:'/apple-touch-icon.png' },
  appleWebApp: { capable:true, statusBarStyle:'default', title:'Drifty' },
  formatDetection: { telephone:false },
  openGraph: {
    title: 'Drifty',
    description: 'Schema, in sync.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Drifty · Schema, in sync.' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Drifty',
    description: 'Schema, in sync.',
    images: ['/og.png'],
  },
};

export const viewport: Viewport = {
  themeColor: [
    {media:'(prefers-color-scheme: light)',color:'#fafafa'},
    {media:'(prefers-color-scheme: dark)',color:'#252525'},
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN" className={cn("font-sans", geist.variable)}><body><PWARegister/><TooltipProvider>{children}</TooltipProvider></body></html>;
}
