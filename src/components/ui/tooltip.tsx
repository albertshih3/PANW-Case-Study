import React, { useState, useRef } from 'react'
import { useAnimate } from 'motion/react'

interface TooltipProps {
  children: React.ReactNode
  content: string
  position?: 'top' | 'bottom' | 'left' | 'right'
  delay?: number
  className?: string
  fullWidth?: boolean
}

export function Tooltip({ 
  children, 
  content, 
  position = 'top', 
  delay = 300, 
  className = '',
  fullWidth = false
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false)
  // Animate only the inner bubble to avoid overriding outer positioning transforms
  const [scope, animate] = useAnimate()
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const showTooltip = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true)
      if (scope.current) {
        animate(scope.current, 
          { opacity: 1, scale: 1, y: 0 }, 
          { duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }
        )
      }
    }, delay)
  }

  const hideTooltip = async () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    if (scope.current) {
      await animate(scope.current, 
        { opacity: 0, scale: 0.95, y: -4 }, 
        { duration: 0.15 }
      )
      setIsVisible(false)
    } else {
      setIsVisible(false)
    }
  }

  const getPositionClasses = () => {
    switch (position) {
      case 'top':
        return 'bottom-full left-1/2 transform -translate-x-1/2 mb-2'
      case 'bottom':
        return 'top-full left-1/2 transform -translate-x-1/2 mt-2'
      case 'left':
        return 'right-full top-1/2 transform -translate-y-1/2 mr-2'
      case 'right':
        return 'left-full top-1/2 transform -translate-y-1/2 ml-2'
      default:
        return 'bottom-full left-1/2 transform -translate-x-1/2 mb-2'
    }
  }

  const getArrowClasses = () => {
    switch (position) {
      case 'top':
        return 'top-full left-1/2 transform -translate-x-1/2 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-900 dark:border-t-slate-100'
      case 'bottom':
        return 'bottom-full left-1/2 transform -translate-x-1/2 border-l-4 border-r-4 border-b-4 border-transparent border-b-slate-900 dark:border-b-slate-100'
      case 'left':
        return 'left-full top-1/2 transform -translate-y-1/2 border-t-4 border-b-4 border-l-4 border-transparent border-l-slate-900 dark:border-l-slate-100'
      case 'right':
        return 'right-full top-1/2 transform -translate-y-1/2 border-t-4 border-b-4 border-r-4 border-transparent border-r-slate-900 dark:border-r-slate-100'
      default:
        return 'top-full left-1/2 transform -translate-x-1/2 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-900 dark:border-t-slate-100'
    }
  }

  return (
    <div 
      className={`relative ${fullWidth ? 'block w-full' : 'inline-block'}`}
  onMouseEnter={showTooltip}
  onMouseLeave={hideTooltip}
  onPointerEnter={showTooltip}
  onPointerLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
    >
      {children}
      {isVisible && (
        <div
          className={`absolute z-50 ${getPositionClasses()} ${className}`}
          role="tooltip"
        >
          {/* Inner animated wrapper to keep outer transform-based positioning intact */}
          <div
            ref={scope}
            style={{ opacity: 0, transform: 'translateY(-4px) scale(0.95)' }}
          >
            <div className="relative">
              <div className="bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-lg border border-slate-200 dark:border-slate-700 max-w-xs">
                {content}
              </div>
              <div className={`absolute ${getArrowClasses()}`} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}