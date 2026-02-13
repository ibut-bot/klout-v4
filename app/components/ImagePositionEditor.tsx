'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

export interface ImageTransform {
  scale: number
  x: number
  y: number
}

interface ImagePositionEditorProps {
  imageUrl: string
  initialTransform?: ImageTransform | null
  onTransformChange: (transform: ImageTransform) => void
  onSave?: () => void
  onCancel?: () => void
  aspectRatio?: string // e.g. "16/9", "1/1", "4/3"
  height?: string // e.g. "h-[460px]", "h-40"
  className?: string
  showControls?: boolean
}

const DEFAULT_TRANSFORM: ImageTransform = { scale: 1, x: 0, y: 0 }

export default function ImagePositionEditor({
  imageUrl,
  initialTransform,
  onTransformChange,
  onSave,
  onCancel,
  height = 'h-[300px]',
  className = '',
  showControls = true,
}: ImagePositionEditorProps) {
  const [transform, setTransform] = useState<ImageTransform>(initialTransform || DEFAULT_TRANSFORM)
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef<{ x: number; y: number; startX: number; startY: number }>({ x: 0, y: 0, startX: 0, startY: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (initialTransform) {
      setTransform(initialTransform)
    }
  }, [initialTransform])

  const updateTransform = useCallback((newTransform: ImageTransform) => {
    // Clamp values
    const clamped = {
      scale: Math.max(1, Math.min(5, newTransform.scale)),
      x: Math.max(-50, Math.min(50, newTransform.x)),
      y: Math.max(-50, Math.min(50, newTransform.y)),
    }
    setTransform(clamped)
    onTransformChange(clamped)
  }, [onTransformChange])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    dragStart.current = { x: e.clientX, y: e.clientY, startX: transform.x, startY: transform.y }
  }, [transform.x, transform.y])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const dx = ((e.clientX - dragStart.current.x) / rect.width) * 100
    const dy = ((e.clientY - dragStart.current.y) / rect.height) * 100
    updateTransform({
      ...transform,
      x: dragStart.current.startX + dx,
      y: dragStart.current.startY + dy,
    })
  }, [isDragging, transform, updateTransform])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // Touch support
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return
    const touch = e.touches[0]
    setIsDragging(true)
    dragStart.current = { x: touch.clientX, y: touch.clientY, startX: transform.x, startY: transform.y }
  }, [transform.x, transform.y])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging || !containerRef.current || e.touches.length !== 1) return
    e.preventDefault()
    const touch = e.touches[0]
    const rect = containerRef.current.getBoundingClientRect()
    const dx = ((touch.clientX - dragStart.current.x) / rect.width) * 100
    const dy = ((touch.clientY - dragStart.current.y) / rect.height) * 100
    updateTransform({
      ...transform,
      x: dragStart.current.startX + dx,
      y: dragStart.current.startY + dy,
    })
  }, [isDragging, transform, updateTransform])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    updateTransform({
      ...transform,
      scale: transform.scale + delta,
    })
  }, [transform, updateTransform])

  const handleReset = useCallback(() => {
    updateTransform(DEFAULT_TRANSFORM)
  }, [updateTransform])

  const imageStyle: React.CSSProperties = {
    transform: `scale(${transform.scale}) translate(${transform.x}%, ${transform.y}%)`,
    transformOrigin: 'center center',
    transition: isDragging ? 'none' : 'transform 0.15s ease-out',
  }

  return (
    <div className={className}>
      <div
        ref={containerRef}
        className={`relative ${height} overflow-hidden rounded-xl border-2 border-dashed border-accent/40 cursor-grab select-none ${isDragging ? 'cursor-grabbing' : ''}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleMouseUp}
        onWheel={handleWheel}
      >
        <img
          src={imageUrl}
          alt="Position editor"
          className="absolute inset-0 h-full w-full object-cover pointer-events-none"
          style={imageStyle}
          draggable={false}
        />

        {/* Overlay hint */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="rounded-lg bg-black/60 px-3 py-2 text-xs text-white backdrop-blur-sm opacity-70">
            Drag to move · Scroll to zoom
          </div>
        </div>
      </div>

      {showControls && (
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Zoom slider */}
            <label className="flex items-center gap-2 text-xs text-zinc-400">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
              </svg>
              <input
                type="range"
                min="1"
                max="3"
                step="0.05"
                value={transform.scale}
                onChange={(e) => updateTransform({ ...transform, scale: parseFloat(e.target.value) })}
                className="h-1.5 w-24 appearance-none rounded-full bg-zinc-700 accent-accent"
              />
              <span className="w-10 text-right font-mono">{(transform.scale * 100).toFixed(0)}%</span>
            </label>
            <button
              type="button"
              onClick={handleReset}
              className="rounded-lg px-2 py-1 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
            >
              Reset
            </button>
          </div>
          {(onSave || onCancel) && (
            <div className="flex items-center gap-2">
              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
                >
                  Cancel
                </button>
              )}
              {onSave && (
                <button
                  type="button"
                  onClick={onSave}
                  className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-black hover:bg-accent-hover"
                >
                  Save Position
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Apply image transform as inline CSS style */
export function getImageTransformStyle(transform?: ImageTransform | null): React.CSSProperties {
  if (!transform) return {}
  return {
    transform: `scale(${transform.scale}) translate(${transform.x}%, ${transform.y}%)`,
    transformOrigin: 'center center',
  }
}
