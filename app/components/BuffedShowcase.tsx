'use client'

import { useEffect, useState, useRef, useCallback } from 'react'

interface ShowcaseImage {
  url: string
  username: string
}

interface FloatingPic {
  key: string
  url: string
  username: string
  x: number // % from left
  y: number // % from top
  delay: number // stagger delay in ms
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

  return (
    <section
      className="relative mb-8 sm:mb-12"
      style={{ height: isMobile ? 280 : 380 }}
    >
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
            className={`rounded-full object-cover shadow-lg shadow-accent/20 ${isMobile ? 'h-48 w-48' : 'h-40 w-40'}`}
            loading="eager"
          />
          <img
            src="/enhanced.svg"
            alt="Enhanced"
            className={`mt-2 opacity-80 ${isMobile ? 'w-28' : 'w-24'}`}
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
