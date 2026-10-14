import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: '蒹葭｜一段关于等待的互动故事',
    template: '%s｜蒹葭互动故事',
  },
  description: '在西安九月的雨里，做出你的选择，听完一段关于相遇、等待与告别的故事。一个可以重新游玩、收藏与分享的中文互动叙事游戏。',
  keywords: ['蒹葭', '互动故事', '文字游戏', '叙事游戏', '选择游戏', '中文游戏', '遗憾与成长'],
  authors: [{ name: '蒹葭互动故事' }],
  creator: '蒹葭互动故事',
  publisher: '蒹葭互动故事',
  applicationName: '蒹葭互动故事',
  metadataBase: new URL('https://jiangjia.story'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'zh_CN',
    url: '/',
    siteName: '蒹葭互动故事',
    title: '蒹葭｜一段关于等待的互动故事',
    description: '在雨、旧书店与城墙之间，做出你的选择，走完一段关于相遇、等待与自我成长的故事。',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: '蒹葭互动故事封面' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '蒹葭｜一段关于等待的互动故事',
    description: '一个关于相遇、遗憾与重新出发的中文互动叙事游戏。',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: 'black' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
