import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'

type Placement = 'top' | 'bottom' | 'left' | 'right'

export interface TourStep {
  selector: string
  title: string
  content: string
  placement?: Placement
}

interface GuidedTourProps {
  open: boolean
  steps: TourStep[]
  initialStep?: number
  onClose: () => void
}

interface Pos {
  top: number
  left: number
}

export function GuidedTour({ open, steps, initialStep = 0, onClose }: GuidedTourProps) {
  const [index, setIndex] = useState(initialStep)
  const [pos, setPos] = useState<Pos | null>(null)
  const [placement, setPlacement] = useState<Placement>('bottom')
  const highlightRef = useRef<HTMLDivElement | null>(null)
  const popRef = useRef<HTMLDivElement | null>(null)

  const target = useMemo(() => {
    if (!open || !steps[index]) return null
    return document.querySelector<HTMLElement>(steps[index].selector)
  }, [open, steps, index])

  const computePosition = () => {
    if (!target) return
    const rect = target.getBoundingClientRect()
    const gap = 12
    const preferred = steps[index]?.placement || 'bottom'
    let nextPlacement: Placement = preferred
    let top = 0
    let left = 0

    // Viewport and popover metrics
    const vw = window.innerWidth
    const vh = window.innerHeight
    const pad = 12
    const w = popRef.current?.offsetWidth ?? 280
    const h = popRef.current?.offsetHeight ?? 140
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2

    const canTop = rect.top >= h + gap + pad
    const canBottom = rect.bottom + gap + h + pad <= vh
    const canLeft = rect.left >= w + gap + pad
    const canRight = rect.right + gap + w + pad <= vw

    // Choose based on preferred with fallbacks
    switch (preferred) {
      case 'top':
        nextPlacement = canTop ? 'top' : canBottom ? 'bottom' : (canRight ? 'right' : 'left')
        break
      case 'left':
        nextPlacement = canLeft ? 'left' : canRight ? 'right' : (canBottom ? 'bottom' : 'top')
        break
      case 'right':
        nextPlacement = canRight ? 'right' : canLeft ? 'left' : (canBottom ? 'bottom' : 'top')
        break
      default:
        nextPlacement = canBottom ? 'bottom' : canTop ? 'top' : (canRight ? 'right' : 'left')
    }

    if (nextPlacement === 'bottom') {
      top = rect.bottom + gap
      // Clamp so after translateX(-50%), the box stays within viewport
      left = Math.min(Math.max(centerX, pad + w / 2), vw - pad - w / 2)
    } else if (nextPlacement === 'top') {
      top = rect.top - gap - h
      left = Math.min(Math.max(centerX, pad + w / 2), vw - pad - w / 2)
    } else if (nextPlacement === 'left') {
      top = Math.min(Math.max(centerY, pad + h / 2), vh - pad - h / 2)
      left = rect.left - gap - w
    } else {
      // right
      top = Math.min(Math.max(centerY, pad + h / 2), vh - pad - h / 2)
      left = rect.right + gap
    }

    setPlacement(nextPlacement)
    setPos({ top, left })
  }

  // Scroll target into view and compute positions
  useLayoutEffect(() => {
    if (!open || !target) return
    target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
    const id = window.setTimeout(() => {
      computePosition()
      // Recompute once the popover measures are available
      const id2 = window.setTimeout(computePosition, 50)
      return () => window.clearTimeout(id2)
    }, 250)
    return () => window.clearTimeout(id)
  }, [open, target, index])

  useEffect(() => {
    if (!open) return
    const onResize = () => computePosition()
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, true)
    }
  }, [open, target, index])

  if (!open) return null

  const step = steps[index]
  const total = steps.length

  return createPortal(
    <div className="fixed inset-0 z-[1000]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Highlight box */}
      {target && (
        <div
          ref={highlightRef}
          className="absolute pointer-events-none rounded-xl ring-2 ring-indigo-400/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]"
          style={{
            top: target.getBoundingClientRect().top - 8,
            left: target.getBoundingClientRect().left - 8,
            width: target.getBoundingClientRect().width + 16,
            height: target.getBoundingClientRect().height + 16,
            transition: 'all 0.2s ease'
          }}
        />
      )}

  {/* Popover */}
  {pos && (
        <div
          ref={popRef}
          className="absolute max-w-sm"
          style={{
            top: pos.top,
            left: pos.left,
            transform:
              placement === 'bottom' || placement === 'top'
                ? 'translateX(-50%)'
                : 'translateY(-50%)'
          }}
        >
          <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 p-4">
            <div className="font-semibold mb-1">{step.title}</div>
            <div className="text-sm text-slate-600 dark:text-slate-300 mb-3">{step.content}</div>
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-slate-500">Step {index + 1} of {total}</div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={onClose}>Skip</Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIndex(i => Math.max(0, i - 1))}
                  disabled={index === 0}
                >
                  Previous
                </Button>
                {index < total - 1 ? (
                  <Button size="sm" onClick={() => setIndex(i => Math.min(total - 1, i + 1))}>Next</Button>
                ) : (
                  <Button size="sm" onClick={onClose}>Finish</Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  )
}

export default GuidedTour
