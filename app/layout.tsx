import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import WalletProvider from './components/WalletProvider'
import Navbar from './components/Navbar'

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
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}>
        <WalletProvider>
          <Navbar />
          <main className="px-6 py-8 lg:px-12">{children}</main>
        </WalletProvider>
      </body>
    </html>
  )
}
