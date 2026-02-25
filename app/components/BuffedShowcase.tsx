'use client'

import { useEffect, useState, useRef, useCallback } from 'react'

interface ShowcaseImage {
  url: string
  username: string
  score: number
  label: string
  quote: string | null
}

interface FloatingPic {
  key: string
  url: string
  username: string
  score: number
  label: string
  quote: string | null
  x: number
  y: number
  delay: number
}

const BATCH_SIZE_DESKTOP = 5
const BATCH_SIZE_MOBILE = 1
const CYCLE_DURATION = 7000
const STAGGER_STEP = 400

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

const SLOTS = [
  { x: 10, y: 24 },
  { x: 45, y: 24 },
  { x: 80, y: 24 },
  { x: 25, y: 72 },
  { x: 65, y: 72 },
]

function generatePositions(count: number): { x: number; y: number }[] {
  const picked = shuffleArray(SLOTS).slice(0, count)
  return picked.map((s) => ({
    x: s.x + (Math.random() - 0.5) * 6,
    y: s.y + (Math.random() - 0.5) * 6,
  }))
}

function useIsMobile() {
  const [mobile, setMobile] = useState(false)
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return mobile
}

export default function BuffedShowcase() {
  const [allImages, setAllImages] = useState<ShowcaseImage[]>([])
  const [floatingPics, setFloatingPics] = useState<FloatingPic[]>([])
  const [phase, setPhase] = useState<'in' | 'out'>('in')
  const batchIndex = useRef(0)
  const cycleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMobile = useIsMobile()

  useEffect(() => {
    fetch('/api/buffed-showcase')
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.images?.length) {
          setAllImages(shuffleArray(data.images))
        }
      })
      .catch(() => {})
  }, [])

  const batchSize = isMobile ? BATCH_SIZE_MOBILE : BATCH_SIZE_DESKTOP

  const showBatch = useCallback(() => {
    if (allImages.length === 0) return

    const start = batchIndex.current * batchSize
    let batch = allImages.slice(start, start + batchSize)

    if (batch.length === 0) {
      batchIndex.current = 0
      batch = allImages.slice(0, batchSize)
    }

    const positions = isMobile
      ? [{ x: 50, y: 50 }]
      : generatePositions(batch.length)

    const pics: FloatingPic[] = batch.map((img, i) => ({
      key: `${batchIndex.current}-${i}-${Date.now()}`,
      url: img.url,
      username: img.username,
      score: img.score,
      label: img.label,
      quote: img.quote,
      x: positions[i].x,
      y: positions[i].y,
      delay: i * STAGGER_STEP,
    }))

    setFloatingPics(pics)
    setPhase('in')

    cycleTimer.current = setTimeout(() => {
      setPhase('out')

      cycleTimer.current = setTimeout(() => {
        batchIndex.current += 1
        showBatch()
      }, 1000)
    }, CYCLE_DURATION)
  }, [allImages, batchSize, isMobile])

  useEffect(() => {
    if (allImages.length === 0) return
    showBatch()
    return () => {
      if (cycleTimer.current) clearTimeout(cycleTimer.current)
    }
  }, [allImages, showBatch])

  if (allImages.length === 0) return null

  if (isMobile) {
    return (
      <section className="relative mb-8 flex items-center justify-center" style={{ minHeight: 360 }}>
        {floatingPics.map((pic) => (
          <div
            key={pic.key}
            className="w-64 rounded-2xl border border-k-border bg-surface overflow-hidden shadow-lg shadow-accent/10"
            style={{
              animation: `${phase === 'in' ? 'showcaseFadeIn' : 'showcaseFadeOut'} 0.8s ease forwards`,
              opacity: 0,
            }}
          >
            <div className="relative w-full bg-zinc-900">
              <img
                src={pic.url}
                alt={pic.username}
                className="w-full object-contain"
                loading="eager"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 px-4 pb-3 flex items-end justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <img src="/Klout.png" alt="Klout" className="h-7" />
                    <p className="text-2xl font-black text-white leading-none">
                      {pic.score.toLocaleString()}
                    </p>
                  </div>
                  <p className="mt-0.5 text-xs font-semibold text-accent">
                    {pic.label}
                  </p>
                </div>
                <img
                  src="/enhanced.svg"
                  alt="Enhanced"
                  className="h-4 opacity-70 mb-0.5"
                />
              </div>
            </div>
            {pic.quote && (
              <div className="px-4 py-3">
                <p className="text-center text-xs italic text-zinc-400">
                  &ldquo;{pic.quote}&rdquo;
                </p>
              </div>
            )}
          </div>
        ))}

        <style jsx>{`
          @keyframes showcaseFadeIn {
            0% { opacity: 0; transform: scale(0.85); }
            60% { opacity: 1; transform: scale(1.02); }
            100% { opacity: 1; transform: scale(1); }
          }
          @keyframes showcaseFadeOut {
            0% { opacity: 1; transform: scale(1); }
            100% { opacity: 0; transform: scale(0.85); }
          }
        `}</style>
      </section>
    )
  }

  return (
    <section className="relative mb-8 sm:mb-12" style={{ height: 380 }}>
      {floatingPics.map((pic) => (
        <div
          key={pic.key}
          className="absolute flex flex-col items-center"
          style={{
            left: `${pic.x}%`,
            top: `${pic.y}%`,
            transform: 'translate(-50%, -50%)',
            animation: `${phase === 'in' ? 'showcaseIn' : 'showcaseOut'} 0.8s ease forwards`,
            animationDelay: `${pic.delay}ms`,
            opacity: 0,
          }}
        >
          <img
            src={pic.url}
            alt={pic.username}
            className="h-40 w-40 rounded-full object-cover shadow-lg shadow-accent/20"
            loading="eager"
          />
          <img
            src="/enhanced.svg"
            alt="Enhanced"
            className="mt-2 w-24 opacity-80"
          />
        </div>
      ))}

      <style jsx>{`
        @keyframes showcaseIn {
          0% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.3);
          }
          60% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1.08);
          }
          100% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }
        }
        @keyframes showcaseOut {
          0% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.3);
          }
        }
      `}</style>
    </section>
  )
}
