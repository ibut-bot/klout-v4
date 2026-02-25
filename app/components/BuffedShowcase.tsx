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

const BATCH_SIZE = 5
const CYCLE_DURATION = 4000 // how long each batch is visible (ms)
const STAGGER_STEP = 300 // delay between each pic's entrance

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

export default function BuffedShowcase() {
  const [allImages, setAllImages] = useState<ShowcaseImage[]>([])
  const [floatingPics, setFloatingPics] = useState<FloatingPic[]>([])
  const [phase, setPhase] = useState<'in' | 'out'>('in')
  const batchIndex = useRef(0)
  const cycleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  const showBatch = useCallback(() => {
    if (allImages.length === 0) return

    const start = batchIndex.current * BATCH_SIZE
    let batch = allImages.slice(start, start + BATCH_SIZE)

    if (batch.length === 0) {
      batchIndex.current = 0
      batch = allImages.slice(0, BATCH_SIZE)
    }

    const positions = generatePositions(batch.length)
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
      }, 800)
    }, CYCLE_DURATION)
  }, [allImages])

  useEffect(() => {
    if (allImages.length === 0) return
    showBatch()
    return () => {
      if (cycleTimer.current) clearTimeout(cycleTimer.current)
    }
  }, [allImages, showBatch])

  if (allImages.length === 0) return null

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
