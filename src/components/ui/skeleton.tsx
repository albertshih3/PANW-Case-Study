import * as React from 'react'

import { cn } from '@/lib/utils'

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-md bg-muted/50',
        'before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.5s_infinite]',
        'before:bg-gradient-to-r before:from-transparent before:via-white/40 before:to-transparent dark:before:via-white/10',
        className
      )}
      {...props}
    />
  )
}

export default Skeleton

/*
Add this keyframes to your global CSS if not present:
@keyframes shimmer { 100% { transform: translateX(100%); } }
*/