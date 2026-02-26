import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import WalletProvider from './components/WalletProvider'
import Navbar from './components/Navbar'
import { Suspense } from 'react'
import ReferralCapture from './components/ReferralCapture'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Klout - Monetize your Klout',
  description: 'Monetize your Klout.',
  icons: {
    icon: '/Klout1.svg',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground overflow-x-hidden`}>
        <WalletProvider>
          <Suspense><ReferralCapture /></Suspense>
          <Navbar />
          <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-12">{children}</main>
          <footer className="border-t border-zinc-800 px-4 py-6 mt-12 text-center text-xs text-zinc-500">
            <a href="/docs" className="hover:text-zinc-300 transition-colors">Docs</a>
            <span className="mx-2">·</span>
            <a href="/skills" className="hover:text-zinc-300 transition-colors">Skills</a>
            <span className="mx-2">·</span>
            <a href="/api/skills" className="hover:text-zinc-300 transition-colors">API Docs</a>
            <span className="mx-2">·</span>
            <a href="/privacy" className="hover:text-zinc-300 transition-colors">Privacy</a>
            <span className="mx-2">·</span>
            <a href="/terms" className="hover:text-zinc-300 transition-colors">Terms</a>
            <span className="mx-2">·</span>
            <span>Klout</span>
          </footer>
        </WalletProvider>
      </body>
    </html>
  )
}
