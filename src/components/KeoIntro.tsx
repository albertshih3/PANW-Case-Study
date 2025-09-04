import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useAnimate } from 'motion/react'

interface KeoIntroProps {
  name?: string | null
  onSubmit: (text: string) => void
}

export function KeoIntro({ name, onSubmit }: KeoIntroProps) {
  const [scope, animate] = useAnimate()
  const [showPrompt, setShowPrompt] = useState(false)
  const [text, setText] = useState('')

  // Word-by-word fade-up with blur for the headline
  const [headlineRef, headlineAnimate] = useAnimate()
  const headlineText = useMemo(() => `Hi, it’s really nice to meet you${name ? `, ${name}` : ''}.`, [name])

  useEffect(() => {
    // Sequence: Welcome -> Headline Words -> Description -> Prompt
    const run = async () => {
      // 1) Welcome appears first
      await animate('[data-welcome]', { opacity: [0, 1], transform: ['translateY(8px)', 'translateY(0px)'] }, { duration: 0.6 })

      // 2) Headline word-by-word
      if (headlineRef.current) {
        const words = Array.from(headlineRef.current.children)
        await headlineAnimate(
          words,
          { opacity: 1, y: 0, filter: 'blur(0px)', scale: 1 },
          { duration: 0.35, delay: (i: number) => i * 0.05, ease: [0.25, 0.46, 0.45, 0.94] }
        )
      }

      // 3) Description fade in
      await animate('[data-description]', { opacity: [0, 1], transform: ['translateY(8px)', 'translateY(0px)'] }, { duration: 0.5 })

      // 4) Prompt reveal
      setShowPrompt(true)
      await animate('[data-prompt]', { opacity: [0, 1], transform: ['translateY(6px)', 'translateY(0)'] }, { duration: 0.4 })
    }
    run()
  }, [animate, scope, headlineAnimate, headlineRef])

  const handleSubmit = () => {
    const value = text.trim()
    if (!value) return
    onSubmit(value)
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 via-white to-cyan-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900" />
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-100/30 via-transparent to-cyan-100/30 dark:from-indigo-900/20 dark:to-cyan-900/20" />
      <div className="absolute inset-0 backdrop-blur-[120px]" />
      <div className="relative flex min-h-screen items-center justify-center text-slate-900 dark:text-slate-100">
        <div ref={scope} className="mx-auto w-full max-w-2xl px-6">
          <div className="text-center">
            <p data-welcome className="text-sm uppercase tracking-widest text-slate-500" style={{ opacity: 0, transform: 'translateY(8px)' }}>Welcome</p>
            <h1 className="mt-2 text-3xl sm:text-4xl font-semibold leading-snug">
              <span ref={headlineRef}>
                {headlineText.split(' ').map((w, i) => (
                  <span
                    key={`${i}-${w.slice(0, 3)}`}
                    className="inline-block mr-1 will-change-transform"
                    style={{ opacity: 0, transform: 'translateY(12px) scale(0.98)', filter: 'blur(2px)' }}
                  >
                    {w}
                  </span>
                ))}
              </span>
            </h1>
            <p data-description className="mt-3 text-base sm:text-lg text-slate-600 dark:text-slate-300" style={{ opacity: 0, transform: 'translateY(8px)' }}>
              I'm Keo, your AI journaling companion. I'll help you explore your thoughts through natural conversation, 
              analyze patterns in your emotions, and provide personalized insights to support your mental wellness journey.
            </p>
          </div>

          <div data-prompt className={`mt-10 ${showPrompt ? '' : 'opacity-0'}`}>
            <label className="block text-center text-sm text-slate-500 dark:text-slate-400 mb-3">
              What’s on your mind?
            </label>
            <div className="flex flex-col items-center gap-3">
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Share what's on your mind and I'll guide you through a thoughtful conversation..."
                rows={3}
                className="w-full max-w-xl text-base"
              />
              <div className="flex items-center gap-2">
                <Button onClick={handleSubmit} disabled={!text.trim()}>Start Journal</Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default KeoIntro
