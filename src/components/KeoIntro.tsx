import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useAnimate, stagger } from 'motion/react'

interface KeoIntroProps {
  name?: string | null
  onSubmit: (text: string) => void
  onSkip?: () => void
}

export function KeoIntro({ name, onSubmit, onSkip }: KeoIntroProps) {
  const [scope, animate] = useAnimate()
  const [showPrompt, setShowPrompt] = useState(false)
  const [text, setText] = useState('')

  useEffect(() => {
    // Intro sequence: fade + float up lines, then reveal prompt
    const run = async () => {
      await animate(
        scope.current?.querySelectorAll('[data-line]') || [],
        { opacity: [0, 1], transform: ['translateY(8px)', 'translateY(0px)'] },
        { duration: 0.6, delay: stagger(0.15) }
      )
      // Subtle drift up
      await animate(
        scope.current?.querySelectorAll('[data-line]') || [],
        { transform: ['translateY(0px)', 'translateY(-4px)'], opacity: [1, 1] },
        { duration: 0.8, delay: stagger(0.05) }
      )
      setShowPrompt(true)
      // Reveal input
      await animate('[data-prompt]', { opacity: [0, 1], transform: ['translateY(6px)', 'translateY(0)'] }, { duration: 0.4 })
    }
    run()
  }, [animate, scope])

  const handleSubmit = () => {
    const value = text.trim()
    if (!value) return
    onSubmit(value)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-b from-white to-slate-50 text-slate-900">
      <div ref={scope} className="mx-auto w-full max-w-2xl px-6">
        <div className="text-center">
          <p data-line className="text-sm uppercase tracking-widest text-slate-500">Welcome</p>
          <h1 data-line className="mt-2 text-3xl sm:text-4xl font-semibold">
            Hi, it’s really nice to meet you{name ? `, ${name}` : ''}.
          </h1>
          <p data-line className="mt-3 text-base sm:text-lg text-slate-600">
            My name is Keo. I’m your reflective companion—here to listen, ask thoughtful questions,
            and gently help you turn what you’re feeling into clarity.
          </p>
        </div>

        <div data-prompt className={`mt-10 ${showPrompt ? '' : 'opacity-0'}`}>
          <label className="block text-center text-sm text-slate-500 mb-3">
            What’s on your mind?
          </label>
          <div className="flex flex-col items-center gap-3">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Share a few thoughts to begin your first journal entry…"
              rows={3}
              className="w-full max-w-xl text-base"
            />
            <div className="flex items-center gap-2">
              <Button onClick={handleSubmit} disabled={!text.trim()}>Start Journal</Button>
              {onSkip && (
                <Button variant="ghost" onClick={onSkip}>Skip for now</Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default KeoIntro
