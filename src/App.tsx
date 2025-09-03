import type React from 'react'
import { useEffect, useMemo, useState, useRef, memo, useCallback } from 'react'
import { SignedIn, SignedOut, useAuth, UserButton, SignInButton, useUser } from '@clerk/clerk-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useAnimate } from 'motion/react'
import './index.css'
import KeoIntro from '@/components/KeoIntro'
import InsightsModal from '@/components/InsightsModal'
import InsightsDashboard from '@/components/InsightsDashboard'

interface Message {
  id: string
  text: string
  sender: 'user' | 'ai'
  timestamp: Date
}

interface FadeUpTextProps {
  text: string
  onComplete?: () => void
}

const FadeUpText = memo(({ text, onComplete }: FadeUpTextProps) => {
  const [scope, animate] = useAnimate()
  const [isAnimating, setIsAnimating] = useState(false)
  
  // Memoize words to prevent recalculation on re-renders
  const words = useMemo(() => text.split(' '), [text])
  
  // Limit animation for very long messages to prevent lag
  const shouldAnimate = words.length <= 50 // Skip animation for messages over 50 words
  
  useEffect(() => {
    if (!shouldAnimate) {
      // For long messages, just show immediately without animation
      if (onComplete) {
        onComplete()
      }
      return
    }
    
    let isMounted = true
    setIsAnimating(true)
    
    const animateWords = async () => {
      try {
        if (!scope.current || !isMounted) return
        
        // Use refs instead of querySelectorAll for better performance
        const wordElements = scope.current.children
        
        if (wordElements.length === 0) return
        
        // Set initial state for all words at once
        await animate(
          Array.from(wordElements),
          { 
            opacity: 0, 
            y: 12, 
            filter: 'blur(2px)',
            scale: 0.98
          }, 
          { duration: 0 }
        )
        
        if (!isMounted) return
        
        // Animate words with optimized stagger
        const maxWords = Math.min(words.length, 30) // Limit to 30 words max for performance
        const staggerDelay = Math.max(0.03, 0.08 - (maxWords * 0.001)) // Adaptive delay
        
        await animate(
          Array.from(wordElements).slice(0, maxWords),
          { 
            opacity: 1, 
            y: 0, 
            filter: 'blur(0px)',
            scale: 1
          }, 
          { 
            duration: 0.3, 
            delay: (i: number) => i * staggerDelay,
            ease: [0.25, 0.46, 0.45, 0.94]
          }
        )
        
        // Fade in remaining words instantly if there are more than 30
        if (wordElements.length > maxWords && isMounted) {
          await animate(
            Array.from(wordElements).slice(maxWords),
            { 
              opacity: 1, 
              y: 0, 
              filter: 'blur(0px)',
              scale: 1
            }, 
            { duration: 0.1 }
          )
        }
        
        if (isMounted && onComplete) {
          onComplete()
        }
      } catch (error) {
        console.warn('Animation error:', error)
      } finally {
        if (isMounted) {
          setIsAnimating(false)
        }
      }
    }
    
    // Start animation after a short delay to prevent conflicts
    const timer = setTimeout(animateWords, 100)
    
    return () => {
      isMounted = false
      clearTimeout(timer)
      setIsAnimating(false)
    }
  }, [text, animate, scope, onComplete, words, shouldAnimate])

  if (!shouldAnimate) {
    // Render without animation for long messages
    return (
      <div className="whitespace-pre-wrap leading-relaxed">
        {text}
      </div>
    )
  }

  return (
    <div 
      ref={scope} 
      className="whitespace-pre-wrap leading-relaxed"
      style={{ minHeight: '1.5em' }} // Prevent layout shift
    >
      {words.map((word, index) => (
        <span
          key={`${index}-${word.slice(0, 3)}`} // More stable key
          className="inline-block mr-1"
          style={{
            // Provide stable initial styles to prevent layout shifts
            opacity: isAnimating ? 0 : 1,
            transform: isAnimating ? 'translateY(12px) scale(0.98)' : 'none',
            filter: isAnimating ? 'blur(2px)' : 'none'
          }}
        >
          {word}
        </span>
      ))}
    </div>
  )
})

FadeUpText.displayName = 'FadeUpText'

function App() {
  const { getToken, userId } = useAuth()
  const { user } = useUser()
  const [currentMessage, setCurrentMessage] = useState<Message | null>(null)
  const [journal, setJournal] = useState<Array<{id:number; title:string|null; content:string; created_at:string}>>([])
  const [inputText, setInputText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [initialLoaded, setInitialLoaded] = useState(false)
  const [isJournaling, setIsJournaling] = useState(false)
  const [conversationHistory, setConversationHistory] = useState<Message[]>([])
  const [scope, animate] = useAnimate()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [selectedEntry, setSelectedEntry] = useState<{id: number; title: string; date: string} | null>(null)
  const [showInsightsDashboard, setShowInsightsDashboard] = useState(false)
  const apiBase = useMemo(() => import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000', [])
  const jwtTemplate = useMemo(() => (import.meta.env.VITE_CLERK_JWT_TEMPLATE as string | undefined) || 'default', [])

  useEffect(() => {
    // Clear chat when user changes
    setCurrentMessage(null)
    setConversationHistory([])
    setJournal([])
    setInitialLoaded(false)
    setIsJournaling(false)
  }, [userId])

  // Placeholder to demonstrate journal API wiring; future: manage in state and render list
  useEffect(() => {
    let ignore = false
    const load = async () => {
      if (!userId) return
      try {
        let token: string | null | undefined = null
        try {
          // Try to get a JWT using configured template (default: "default").
          token = await getToken?.({ template: jwtTemplate })
        } catch (e) {
          console.warn(`Clerk getToken failed for template "${jwtTemplate}". Check your Clerk JWT template configuration.`, e)
        }
        // Load journal entries (best-effort)
        const jRes = await fetch(`${apiBase}/journal`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        })
        if (jRes.ok) {
          const jItems = await jRes.json()
          if (!ignore) setJournal(jItems)
        }

        // Load recent conversations for history (but don't display them)
        const cRes = await fetch(`${apiBase}/conversations?limit=50`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        })
        if (cRes.ok) {
          const cItems: Array<{id:number; user_message:string; ai_response:string; timestamp:string}> = await cRes.json()
          const ordered = cItems.sort((a,b)=> new Date(a.timestamp).getTime()-new Date(b.timestamp).getTime())
          const restored: Message[] = []
          for (const item of ordered) {
            restored.push({ id: `${item.id}-u`, text: item.user_message, sender: 'user', timestamp: new Date(item.timestamp) })
            restored.push({ id: `${item.id}-a`, text: item.ai_response, sender: 'ai', timestamp: new Date(item.timestamp) })
          }
          if (!ignore) setConversationHistory(restored)
        }
      } catch (e) {
        console.warn('Failed to fetch journal list', e)
      } finally {
        if (!ignore) setInitialLoaded(true)
      }
    }
    if (!ignore) load()
    return () => { ignore = true }
  }, [userId, getToken, apiBase, jwtTemplate])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return

    const userMessage: Message = {
      id: Date.now().toString(),
      text,
      sender: 'user',
      timestamp: new Date()
    }

    // Store in history and set as current message
    setConversationHistory(prev => [...prev, userMessage])
    setCurrentMessage(userMessage)
    setIsLoading(true)
    setIsJournaling(true)

    try {
      let token: string | null | undefined = null
      try {
        token = await getToken?.({ template: jwtTemplate })
      } catch (e) {
        console.warn(`Clerk getToken failed for template "${jwtTemplate}". Check your Clerk JWT template configuration.`, e)
      }
      const response = await fetch(`${apiBase}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: text }),
      })

      if (!response.ok) {
        throw new Error('Failed to get response')
      }

      const data = await response.json()
      
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: data.response,
        sender: 'ai',
        timestamp: new Date()
      }

      setConversationHistory(prev => [...prev, aiMessage])
      setCurrentMessage(aiMessage)
    } catch (error) {
      console.error('Error sending message:', error)
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: 'Sorry, I encountered an error. Please try again.',
        sender: 'ai',
        timestamp: new Date()
      }
      setConversationHistory(prev => [...prev, errorMessage])
      setCurrentMessage(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }, [getToken, jwtTemplate, apiBase])

  const createJournalEntry = async (content: string, title?: string | null) => {
    try {
      let token: string | null | undefined = null
      try {
        token = await getToken?.({ template: jwtTemplate })
      } catch (e) {
        console.warn(`Clerk getToken failed for template "${jwtTemplate}". Check your Clerk JWT template configuration.`, e)
      }
      const res = await fetch(`${apiBase}/journal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ title: title ?? null, content }),
      })
      if (res.ok) {
        const item = await res.json()
        setJournal(prev => [item, ...prev])
      }
    } catch (e) {
      console.warn('Failed to create journal entry', e)
    }
  }

  const handleSendMessage = useCallback(async () => {
    if (!inputText.trim()) return
    const text = inputText
    setInputText('')
    
    // Animate text area out (but don't await to prevent blocking)
    if (textareaRef.current) {
      animate(textareaRef.current, { opacity: 0, y: 20 }, { duration: 0.3 })
    }
    
    await sendMessage(text)
    
    // Animate text area back in
    if (textareaRef.current) {
      await animate(textareaRef.current, { opacity: 1, y: 0 }, { duration: 0.3 })
      textareaRef.current.focus()
    }
  }, [inputText, animate, sendMessage])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const seenKey = userId ? `seenKeoIntro:${userId}` : 'seenKeoIntro'
  const shouldShowIntro = Boolean(
    userId && initialLoaded && conversationHistory.length === 0 && journal.length === 0 && !localStorage.getItem(seenKey)
  )

  const startJournaling = async () => {
    setIsJournaling(true)
    setIsLoading(true)
    
    try {
      let token: string | null | undefined = null
      try {
        token = await getToken?.({ template: jwtTemplate })
      } catch (e) {
        console.warn(`Clerk getToken failed for template "${jwtTemplate}". Check your Clerk JWT template configuration.`, e)
      }
      
      // Fetch opening prompt from backend
      const response = await fetch(`${apiBase}/opening-prompt`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
      
      if (response.ok) {
        const data = await response.json()
        const openingMessage: Message = {
          id: Date.now().toString(),
          text: data.message,
          sender: 'ai',
          timestamp: new Date()
        }
        setCurrentMessage(openingMessage)
        setConversationHistory([openingMessage])
      } else {
        // Fallback to a default message if API fails
        const fallbackMessage: Message = {
          id: Date.now().toString(),
          text: "What's on your mind today?",
          sender: 'ai',
          timestamp: new Date()
        }
        setCurrentMessage(fallbackMessage)
        setConversationHistory([fallbackMessage])
      }
    } catch (error) {
      console.error('Error fetching opening prompt:', error)
      // Fallback to a default message
      const fallbackMessage: Message = {
        id: Date.now().toString(),
        text: "How are you feeling today?",
        sender: 'ai',
        timestamp: new Date()
      }
      setCurrentMessage(fallbackMessage)
      setConversationHistory([fallbackMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const finishJournaling = () => {
    setIsJournaling(false)
    setCurrentMessage(null)
    // Save all conversation history to journal
    const journalContent = conversationHistory
      .map(msg => `${msg.sender === 'user' ? 'You' : 'Keo'}: ${msg.text}`)
      .join('\n\n')
    
    if (journalContent.trim()) {
      createJournalEntry(journalContent, `Journal Entry - ${new Date().toLocaleDateString()}`)
    }
  }

  return (
    <div className="min-h-screen w-full">
      {shouldShowIntro && (
        <KeoIntro
          name={user?.firstName || user?.fullName || undefined}
          onSubmit={async (text) => {
            localStorage.setItem(seenKey, '1')
            await startJournaling()
            // After starting with AI prompt, send user's message
            setTimeout(() => sendMessage(text), 1000)
            createJournalEntry(text, null)
          }}
          onSkip={() => {
            localStorage.setItem(seenKey, '1')
          }}
        />
      )}

      <SignedIn>
        {showInsightsDashboard ? (
          <InsightsDashboard onBack={() => setShowInsightsDashboard(false)} />
        ) : isJournaling ? (
          // Fullscreen Journaling Experience
          <div className="fixed inset-0 bg-gradient-to-br from-indigo-50 via-white to-cyan-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-100/20 via-transparent to-cyan-100/20 dark:from-indigo-900/20 dark:to-cyan-900/20" />
            <div className="absolute inset-0 backdrop-blur-[120px]" />
            
            {/* Finished Journaling Button */}
            <div className="absolute top-6 right-6 z-10">
              <Button 
                onClick={finishJournaling}
                variant="outline" 
                className="backdrop-blur-md bg-white/80 dark:bg-slate-900/80 border-white/20 hover:bg-white/90 shadow-lg"
              >
                Finished Journaling
              </Button>
            </div>

            <div ref={scope} className="flex min-h-screen items-center justify-center p-6">
              <div className="w-full max-w-2xl mx-auto space-y-8">
                {/* Current Message Display */}
                {currentMessage && (
                  <div className="text-center space-y-6">
                    {currentMessage.sender === 'user' ? (
                      <div className="space-y-4">
                        <p className="text-sm uppercase tracking-widest text-slate-500 dark:text-slate-400">You shared</p>
                        <div className="text-lg leading-relaxed text-slate-700 dark:text-slate-300 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-2xl p-6 border border-white/20 shadow-lg">
                          {currentMessage.text}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <p className="text-sm uppercase tracking-widest text-slate-500 dark:text-slate-400">Keo responds</p>
                        <div className="text-lg leading-relaxed text-slate-700 dark:text-slate-300 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-2xl p-6 border border-white/20 shadow-lg">
                          <FadeUpText 
                            key={currentMessage.id} 
                            text={currentMessage.text} 
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Loading State */}
                {isLoading && (
                  <div className="text-center space-y-4">
                    <p className="text-sm uppercase tracking-widest text-slate-500 dark:text-slate-400">
                      {currentMessage ? 'Keo is thinking' : 'Keo is preparing to greet you'}
                    </p>
                    <div className="flex justify-center items-center space-x-1">
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                    </div>
                  </div>
                )}

                {/* Input Area */}
                <div className="space-y-4">
                  {currentMessage?.sender === 'ai' && !isLoading && (
                    <p className="text-center text-sm text-slate-500 dark:text-slate-400">
                      How does this resonate with you?
                    </p>
                  )}
                  
                  <div className="flex flex-col gap-4">
                    <Textarea
                      ref={textareaRef}
                      value={inputText}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInputText(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={currentMessage ? "Continue the conversation..." : "What's on your mind today?"}
                      rows={4}
                      disabled={isLoading}
                      className="text-base bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm border-white/30 focus:border-indigo-300 dark:focus:border-indigo-600 rounded-2xl p-4 resize-none shadow-lg"
                    />
                    <div className="flex justify-center">
                      <Button 
                        onClick={handleSendMessage} 
                        disabled={!inputText.trim() || isLoading}
                        className="px-8 py-3 text-base bg-indigo-500 hover:bg-indigo-600 text-white rounded-2xl shadow-lg transition-all duration-200 transform hover:scale-105"
                      >
                        {isLoading ? 'Sending...' : 'Share'}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          // Main Dashboard
          <div className="flex min-h-screen w-full flex-col">
            <header className="sticky top-0 z-10 w-full border-b bg-background/80 backdrop-blur">
              <div className="flex h-14 items-center justify-between px-4 sm:px-6 lg:px-8">
                <div className="flex items-center gap-2">
                  <span className="text-xl">📝</span>
                  <h1 className="text-base font-semibold tracking-tight">Loom</h1>
                </div>
                <nav className="flex items-center gap-2">
                  <Button variant="ghost" className="hidden sm:inline-flex">Journal</Button>
                  <Button 
                    variant="ghost" 
                    className="hidden sm:inline-flex"
                    onClick={() => setShowInsightsDashboard(true)}
                  >
                    Insights
                  </Button>
                  <UserButton />
                </nav>
              </div>
            </header>

            <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-6">
              <section className="mb-6">
                <h2 className="text-2xl font-bold leading-tight">weaving conversations into meaningful reflection</h2>
              </section>

              <div className="max-w-2xl mx-auto space-y-6">
                <div className="text-center">
                  <Button 
                    onClick={startJournaling}
                    size="lg"
                    className="px-8 py-4 text-lg bg-indigo-500 hover:bg-indigo-600 text-white rounded-2xl shadow-lg transition-all duration-200 transform hover:scale-105"
                  >
                    Start Journaling
                  </Button>
                </div>

                {/* Recent Journal Entries */}
                {journal.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Recent Entries</h3>
                    <div className="grid gap-4">
                      {journal.slice(0, 4).map(j => (
                        <div 
                          key={j.id} 
                          className="bg-white dark:bg-slate-800 rounded-xl p-4 border shadow-sm cursor-pointer hover:shadow-md hover:border-indigo-200 dark:hover:border-indigo-800 transition-all duration-200 group"
                          onClick={() => setSelectedEntry({
                            id: j.id,
                            title: j.title || 'Untitled Entry',
                            date: j.created_at
                          })}
                        >
                          <div className="text-xs text-slate-500 mb-2">{new Date(j.created_at).toLocaleString()}</div>
                          <div className="text-sm font-medium mb-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                            {j.title || 'Untitled Entry'}
                          </div>
                          <div className="text-sm text-slate-600 dark:text-slate-400 line-clamp-3">{j.content}</div>
                          <div className="text-xs text-indigo-500 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            Click to view insights →
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </main>

            <footer className="w-full border-t py-4 text-center text-sm text-muted-foreground">
              Built for thoughtful reflection. Your data, your control.
            </footer>
          </div>
        )}
      </SignedIn>

      <SignedOut>
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-cyan-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
          <div className="w-full max-w-md mx-auto p-6">
            <div className="text-center space-y-6">
              <div className="space-y-2">
                <span className="text-4xl">📝</span>
                <h1 className="text-2xl font-bold">Loom</h1>
                <p className="text-slate-600 dark:text-slate-400">Your personal journaling companion</p>
              </div>
              <SignInButton mode="modal">
                <Button size="lg" className="w-full">
                  Sign In to Start Journaling
                </Button>
              </SignInButton>
            </div>
          </div>
        </div>
      </SignedOut>

      {/* Insights Modal */}
      {selectedEntry && (
        <InsightsModal
          entryId={selectedEntry.id}
          entryTitle={selectedEntry.title}
          entryDate={selectedEntry.date}
          isOpen={!!selectedEntry}
          onClose={() => setSelectedEntry(null)}
        />
      )}
    </div>
  )
}

export default App