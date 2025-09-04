import type React from 'react'
import { useEffect, useMemo, useState, useRef, memo, useCallback } from 'react'
import { SignedIn, SignedOut, useAuth, UserButton, SignInButton, useUser } from '@clerk/clerk-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useAnimate } from 'motion/react'
import './index.css'
import KeoIntro from '@/components/KeoIntro'
import EntryInsightsPanel from '@/components/EntryInsightsPanel'
import { Skeleton } from '@/components/ui/skeleton'
import { 
  Calendar, BarChart3, PieChart, ArrowUp, ArrowDown, ArrowRight, 
  Sparkles, Heart, Leaf, Lightbulb, Flame, Clock, Target, X
} from 'lucide-react'

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
  const [journal, setJournal] = useState<Array<{id:number; title:string|null; content:string; created_at:string; updated_at?: string}>>([])
  const [journalTotal, setJournalTotal] = useState<number>(0)
  const [journalPage, setJournalPage] = useState<number>(0)
  const PAGE_SIZE = 10
  const [inputText, setInputText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [initialLoaded, setInitialLoaded] = useState(false)
  const [isJournaling, setIsJournaling] = useState(false)
  const [conversationHistory, setConversationHistory] = useState<Message[]>([])
  const [scope, animate] = useAnimate()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [selectedEntry, setSelectedEntry] = useState<{id: number; title: string; date: string} | null>(null)
  const [dashboardLoading, setDashboardLoading] = useState(false)
  const [dashboardError, setDashboardError] = useState<string | null>(null)
  const [dashboardData, setDashboardData] = useState<null | {
    statistics: {
      total_entries: number
      total_conversations: number
      entries_this_week: number
      entries_this_month: number
    },
    trends: {
      overall_sentiment_trend: string
      dominant_themes: Array<{ theme: string; frequency: number }>
      emotional_patterns: Array<{ emotion: string; frequency: number }>
      growth_indicators: string[]
      recommendations: string[]
      insights_summary: string
    },
    recent_insights: Array<{
      entry_id: number
      date: string
      title: string
      sentiment_score: number
      dominant_emotion: string
      main_theme: string
    }>
  }>(null)
  const [goals, setGoals] = useState<string[]>([])
  const [newGoal, setNewGoal] = useState('')
  const [weeklySummary, setWeeklySummary] = useState<null | { summary: any }>(null)
  const [mobileView, setMobileView] = useState<'journal' | 'insights'>('journal')
  const [streaks, setStreaks] = useState<null | { current_streak: number; best_streak: number; active_days_last_30: number }>(null)
  const [keywords, setKeywords] = useState<null | Array<{ word: string; count: number; weight: number }>>(null)
  // Filter: single search bar (title/content)
  const [searchTitle, setSearchTitle] = useState('')
  const apiBase = useMemo(() => import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000', [])
  const jwtTemplate = useMemo(() => (import.meta.env.VITE_CLERK_JWT_TEMPLATE as string | undefined) || 'default', [])

  useEffect(() => {
    // Clear chat when user changes
    setCurrentMessage(null)
    setConversationHistory([])
  setJournal([])
  setJournalTotal(0)
  setJournalPage(0)
    setInitialLoaded(false)
    setIsJournaling(false)
  setGoals([])
  setWeeklySummary(null)
    setIsSending(false)
    setIsLoading(false)
    setIsStreaming(false)
  }, [userId])

  // Animate message entrance when currentMessage changes
  useEffect(() => {
    if (currentMessage && scope.current && isJournaling) {
      const animateMessage = async () => {
        // Find elements to animate
        const label = scope.current?.querySelector('[data-label]')
        const messageBox = scope.current?.querySelector('[data-message]')
        
        if (label && messageBox) {
          // Set initial states
          await animate([label, messageBox], { opacity: 0, y: 12 }, { duration: 0 })
          
          // Animate in sequence
          await animate(label, { opacity: 1, y: 0 }, { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] })
          await animate(messageBox, { opacity: 1, y: 0, scale: 1 }, { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] })
        }
      }
      
      // Small delay to ensure DOM is updated
      setTimeout(animateMessage, 50)
    }
  }, [currentMessage, animate, scope, isJournaling])

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
        // Load journal count first
        const countRes = await fetch(`${apiBase}/journal/count`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        })
        if (countRes.ok) {
          const data = await countRes.json()
          if (!ignore) setJournalTotal(Number(data.count || 0))
        }

        // Load first page of journal entries (best-effort)
        const jRes = await fetch(`${apiBase}/journal?limit=${PAGE_SIZE}&offset=0`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        })
        if (jRes.ok) {
          const jItems = await jRes.json()
          if (!ignore) {
            setJournal(jItems)
            setJournalPage(1)
          }
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

        // Load user goals (best-effort)
        try {
          const gRes = await fetch(`${apiBase}/user/goals`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
          if (gRes.ok) {
            const gData = await gRes.json()
            if (!ignore) setGoals(Array.isArray(gData.goals) ? gData.goals : [])
          }
        } catch {}


  // (Optional) Compute streak can be added later
      } catch (e) {
        console.warn('Failed to fetch journal list', e)
      } finally {
        if (!ignore) setInitialLoaded(true)
      }
    }
    if (!ignore) load()
    return () => { ignore = true }
  }, [userId, getToken, apiBase, jwtTemplate])

  const loadMoreJournal = useCallback(async () => {
    if (!userId) return
    const nextOffset = journalPage * PAGE_SIZE
    if (nextOffset >= journalTotal) return
    try {
      const token = await getToken?.({ template: jwtTemplate })
      const res = await fetch(`${apiBase}/journal?limit=${PAGE_SIZE}&offset=${nextOffset}` , {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      })
      if (res.ok) {
        const items = await res.json()
        setJournal(prev => [...prev, ...items])
        setJournalPage(p => p + 1)
      }
    } catch {}
  }, [userId, journalPage, journalTotal, apiBase, getToken, jwtTemplate])

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

      // Try streaming first
      try {
        const streamResponse = await fetch(`${apiBase}/chat/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ message: text }),
        })

        if (streamResponse.ok && streamResponse.body) {
          // Switch to streaming mode
          setIsLoading(false)
          setIsStreaming(true)
          
          // Create AI message placeholder
          const aiMessageId = (Date.now() + 1).toString()
          const aiMessage: Message = {
            id: aiMessageId,
            text: '',
            sender: 'ai',
            timestamp: new Date()
          }
          
          setConversationHistory(prev => [...prev, aiMessage])
          setCurrentMessage(aiMessage)

          const reader = streamResponse.body.getReader()
          const decoder = new TextDecoder()
          let fullText = ''

          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break

              const chunk = decoder.decode(value, { stream: true })
              const lines = chunk.split('\n')
              
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.slice(6)
                  if (data === '[DONE]') continue
                  
                  try {
                    const parsed = JSON.parse(data)
                    if (parsed.content) {
                      fullText += parsed.content
                      
                      // Update the current message with streaming text
                      setCurrentMessage(prev => prev ? { ...prev, text: fullText } : prev)
                    }
                  } catch (e) {
                    // Skip invalid JSON
                  }
                }
              }
            }

            // Final update to conversation history and current message
            setConversationHistory(prev => 
              prev.map(msg => msg.id === aiMessageId ? { ...msg, text: fullText } : msg)
            )
            
            // Ensure current message also has the final text
            setCurrentMessage(prev => prev ? { ...prev, text: fullText } : prev)
          } finally {
            // Small delay to ensure smooth transition from streaming to regular display
            setTimeout(() => {
              setIsStreaming(false)
            }, 200)
          }
          
          return // Success with streaming
        }
      } catch (streamError) {
        // Streaming failed, fall back to regular chat
        setIsStreaming(false)
      }

      // Fallback to regular non-streaming chat
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

      // Add a small delay before showing AI response for better UX
      setTimeout(() => {
        setConversationHistory(prev => [...prev, aiMessage])
        setCurrentMessage(aiMessage)
      }, 300)
    } catch (error) {
      console.error('Error sending message:', error)
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: 'Sorry, I encountered an error. Please try again.',
        sender: 'ai',
        timestamp: new Date()
      }
      setTimeout(() => {
        setConversationHistory(prev => [...prev, errorMessage])
        setCurrentMessage(errorMessage)
      }, 300)
    } finally {
      setIsLoading(false)
      setIsStreaming(false)
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
      // Apply default timestamped title if none provided
      let finalTitle = title ?? null
      if (!finalTitle || !finalTitle.trim()) {
        const d = new Date()
        const pad = (n: number) => n.toString().padStart(2, '0')
        const ts = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
        finalTitle = `Journal Entry - ${ts}`
      }
      const res = await fetch(`${apiBase}/journal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ title: finalTitle, content }),
      })
      if (res.ok) {
        const item = await res.json()
        setJournal(prev => [item, ...prev])
        // After saving a new entry, refresh insights dashboard
        try {
          await refreshDashboard()
        } catch (e) {
          // best-effort; non-blocking
        }
      }
    } catch (e) {
      console.warn('Failed to create journal entry', e)
    }
  }

  const updateJournalEntry = async (id: number, updates: { title?: string; content?: string }) => {
    try {
      let token: string | null | undefined = null
      try { token = await getToken?.({ template: jwtTemplate }) } catch {}
      const res = await fetch(`${apiBase}/journal/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(updates)
      })
      if (res.ok) {
        const updated = await res.json()
        setJournal(prev => prev.map(j => (j.id === id ? updated : j)))
        return true
      }
    } catch {}
    return false
  }

  const deleteJournalEntry = async (id: number) => {
    try {
      let token: string | null | undefined = null
      try { token = await getToken?.({ template: jwtTemplate }) } catch {}
      const res = await fetch(`${apiBase}/journal/${id}`, {
        method: 'DELETE',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      })
      if (res.ok) {
        setJournal(prev => prev.filter(j => j.id !== id))
        if (selectedEntry?.id === id) setSelectedEntry(null)
        return true
      }
    } catch {}
    return false
  }

  const handleSendMessage = useCallback(async () => {
    if (!inputText.trim()) return
    const text = inputText
    setInputText('')
    setIsSending(true)
    
    try {
      // Animate current message out with a smooth transition (only if there's a message)
      if (currentMessage && scope.current) {
        await animate(scope.current, { opacity: 0, y: -20 }, { duration: 0.3 })
      }
      
      await sendMessage(text)
      
      // Animate new message in (only animate the scoped content)
      if (scope.current) {
        // Set initial state for entrance
        await animate(scope.current, { opacity: 0, y: 20 }, { duration: 0 })
        // Animate to final state
        await animate(scope.current, { opacity: 1, y: 0 }, { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] })
      }
      
      // Focus text area after animation
      if (textareaRef.current) {
        textareaRef.current.focus()
      }
    } finally {
      setIsSending(false)
    }
  }, [inputText, animate, sendMessage, scope, currentMessage])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const shouldShowIntro = Boolean(
    userId && initialLoaded && journal.length === 0
  )

  // Reusable loader for insights dashboard
  const refreshDashboard = useCallback(async () => {
    if (!userId || !initialLoaded) return
    setDashboardLoading(true)
    setDashboardError(null)
    try {
      let token: string | null | undefined = null
      try {
        token = await getToken?.({ template: jwtTemplate })
      } catch (e) {
        console.warn(`Clerk getToken failed for template "${jwtTemplate}".`, e)
      }
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 60000)
      const res = await fetch(`${apiBase}/insights/dashboard`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        signal: controller.signal
      })
      clearTimeout(timeout)
      if (res.ok) {
        const data = await res.json()
        setDashboardData(data)
        // Weekly summary (best-effort)
        try {
          let token2: string | null | undefined = null
          try { token2 = await getToken?.({ template: jwtTemplate }) } catch {}
          const sRes = await fetch(`${apiBase}/insights/summary?period=week`, { headers: { ...(token2 ? { Authorization: `Bearer ${token2}` } : {}) } })
          if (sRes.ok) {
            const sData = await sRes.json()
            setWeeklySummary({ summary: sData.summary })
          }
        } catch {}
        // Engagement streaks (best-effort)
        try {
          let token3: string | null | undefined = null
          try { token3 = await getToken?.({ template: jwtTemplate }) } catch {}
          const stRes = await fetch(`${apiBase}/engagement/streaks`, { headers: { ...(token3 ? { Authorization: `Bearer ${token3}` } : {}) } })
          if (stRes.ok) {
            const stData = await stRes.json()
            setStreaks(stData)
          }
        } catch {}
        // Keyword cloud (best-effort)
        try {
          let token4: string | null | undefined = null
          try { token4 = await getToken?.({ template: jwtTemplate }) } catch {}
          const kwRes = await fetch(`${apiBase}/insights/keywords?days=60&top_n=30`, { headers: { ...(token4 ? { Authorization: `Bearer ${token4}` } : {}) } })
          if (kwRes.ok) {
            const kwData = await kwRes.json()
            setKeywords(Array.isArray(kwData.keywords) ? kwData.keywords : [])
          }
        } catch {}
      } else {
        setDashboardError('Failed to load insights')
      }
    } catch (err) {
      setDashboardError('Failed to load insights')
    } finally {
      setDashboardLoading(false)
    }
  }, [userId, initialLoaded, getToken, jwtTemplate, apiBase])

  // Initial load
  useEffect(() => {
    refreshDashboard()
  }, [refreshDashboard])

  // Export data as JSON file
  const exportData = useCallback(async () => {
    try {
      let token: string | null | undefined = null
      try { token = await getToken?.({ template: jwtTemplate }) } catch {}
      const res = await fetch(`${apiBase}/export?download=true`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
      if (!res.ok) return
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `keo-export-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {}
  }, [apiBase, getToken, jwtTemplate])

  const getSentimentInfo = (score: number) => {
    if (score >= 0.7) return { color: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300', label: 'Positive' }
    if (score >= 0.4) return { color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300', label: 'Neutral' }
    return { color: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300', label: 'Negative' }
  }

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving':
        return <ArrowUp className="w-5 h-5 text-green-500" />
      case 'declining':
        return <ArrowDown className="w-5 h-5 text-red-500" />
      case 'stable':
        return <ArrowRight className="w-5 h-5 text-slate-500" />
      default:
        return <BarChart3 className="w-5 h-5 text-slate-500" />
    }
  }

  // Clean preview for journal cards: drop AI lines and boilerplate
  const getEntryPreview = (content: string) => {
    if (!content) return ''
    // Remove any "You started by mentioning: ..." clause
    let cleaned = content.replace(/You\s+started\s+by\s+mentioning:\s*"[\s\S]*?"\??/gi, '').trim()
    // Remove AI lines starting with "Keo:" and strip speaker labels
    cleaned = cleaned
      .split(/\n+/)
      .filter(line => !/^\s*Keo:/i.test(line))
      .map(line => line.replace(/^\s*(You|User):\s*/i, ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    // Limit length for card display
    if (cleaned.length > 220) cleaned = cleaned.slice(0, 220) + '…'
    return cleaned
  }

  // Optimized entry summary cache with batching
  const [entrySummaries, setEntrySummaries] = useState<Record<number, string>>({})
  const [entrySummaryLoading, setEntrySummaryLoading] = useState<Record<number, boolean>>({})
  const [batchLoadingEntries, setBatchLoadingEntries] = useState<Set<number>>(new Set())

  const sanitizeSummary = (s: string) => s
    .replace(/You\s+started\s+by\s+mentioning:\s*"[\s\S]*?"\??/gi, '')
    .replace(/\bKeo:\s*[\s\S]*/gi, '')
    .trim()

  // Batch load multiple entry summaries for visible entries
  const loadEntrySummariesBatch = useCallback(async (entryIds: number[]) => {
    const toLoad = entryIds.filter(id => !entrySummaries[id] && !entrySummaryLoading[id] && !batchLoadingEntries.has(id))
    if (toLoad.length === 0) return
    
    // Mark as batch loading
    setBatchLoadingEntries(prev => new Set([...prev, ...toLoad]))
    toLoad.forEach(id => setEntrySummaryLoading(prev => ({ ...prev, [id]: true })))
    
    try {
      let token: string | null | undefined = null
      try {
        token = await getToken?.({ template: jwtTemplate })
      } catch {}
      
      // Load summaries in parallel with reasonable limit
      const batchSize = 3 // Load 3 at a time to avoid overwhelming the API
      const batches = []
      for (let i = 0; i < toLoad.length; i += batchSize) {
        batches.push(toLoad.slice(i, i + batchSize))
      }
      
      for (const batch of batches) {
        const promises = batch.map(async (entryId) => {
          try {
            const res = await fetch(`${apiBase}/journal/${entryId}/insights`, {
              headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
            })
            if (res.ok) {
              const data = await res.json()
              const sum = sanitizeSummary(data?.insights?.summary || '')
              return { entryId, summary: sum }
            }
          } catch {}
          return { entryId, summary: '' }
        })
        
        const results = await Promise.allSettled(promises)
        const summaries: Record<number, string> = {}
        
        results.forEach(result => {
          if (result.status === 'fulfilled' && result.value) {
            summaries[result.value.entryId] = result.value.summary
          }
        })
        
        setEntrySummaries(prev => ({ ...prev, ...summaries }))
      }
    } catch {}
    finally {
      toLoad.forEach(id => setEntrySummaryLoading(prev => ({ ...prev, [id]: false })))
      setBatchLoadingEntries(prev => {
        const next = new Set(prev)
        toLoad.forEach(id => next.delete(id))
        return next
      })
    }
  }, [apiBase, getToken, jwtTemplate, entrySummaries, entrySummaryLoading, batchLoadingEntries])

  // Note: Removed loadEntrySummary function as it's no longer used
  // All summary loading is now handled by loadEntrySummariesBatch

  // Compute filtered list by title/content substring
  const filteredJournal = useMemo(() => {
    const q = searchTitle.trim().toLowerCase()
    if (!q) return journal
    return journal.filter(j => {
      const title = (j.title || 'untitled').toLowerCase()
      const content = (j.content || '').toLowerCase()
      return title.includes(q) || content.includes(q)
    })
  }, [journal, searchTitle])

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
    // Only include user messages when saving the journal entry
    const journalContent = conversationHistory
      .filter(msg => msg.sender === 'user')
      .map(msg => msg.text)
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
            await startJournaling()
            // After starting with AI prompt, send user's message
            setTimeout(() => sendMessage(text), 1000)
            createJournalEntry(text, null)
          }}
        />
      )}

      <SignedIn>
  {isJournaling ? (
          // Fullscreen Journaling Experience - Matches KeoIntro styling
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 via-white to-cyan-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900" />
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-100/30 via-transparent to-cyan-100/30 dark:from-indigo-900/20 dark:to-cyan-900/20" />
            <div className="absolute inset-0 backdrop-blur-[120px]" />
            <div className="relative flex min-h-screen items-center justify-center text-slate-900 dark:text-slate-100">
              <div className="mx-auto w-full max-w-2xl px-6">
                <div className="text-center">
                  
                  {/* Message Display - Inside Animated Scope */}
                  <div ref={scope}>
                    {currentMessage && !(isStreaming && currentMessage.sender === 'ai') && (
                      <div className="space-y-6" style={{ opacity: 1, transform: 'translateY(0px)' }}>
                        {currentMessage.sender === 'user' ? (
                          <div className="space-y-4">
                            <p data-label className="text-sm uppercase tracking-widest text-slate-500 dark:text-slate-400" style={{ opacity: 0, transform: 'translateY(8px)' }}>You shared</p>
                            <div data-message className="text-lg leading-relaxed text-slate-700 dark:text-slate-300 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-2xl p-6 border border-white/20 shadow-lg max-h-[50vh] overflow-y-auto transform transition-all duration-500 ease-out w-full max-w-4xl mx-auto" style={{ opacity: 0, transform: 'translateY(12px) scale(0.98)' }}>
                              <div className="whitespace-pre-wrap leading-relaxed">
                                {currentMessage.text}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <p data-label className="text-sm uppercase tracking-widest text-slate-500 dark:text-slate-400" style={{ opacity: 0, transform: 'translateY(8px)' }}>Keo responds</p>
                            <div data-message className="text-lg leading-relaxed text-slate-700 dark:text-slate-300 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-2xl p-6 border border-white/20 shadow-lg max-h-[50vh] overflow-y-auto transform transition-all duration-500 ease-out w-full max-w-4xl mx-auto" style={{ opacity: 0, transform: 'translateY(12px) scale(0.98)' }}>
                              <div className="whitespace-pre-wrap leading-relaxed">
                                {currentMessage.text}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Loading States - Outside Animated Scope */}
                  {/* Sending State - Immediate Feedback */}
                  {isSending && !isLoading && (
                    <div className="space-y-4 animate-in fade-in duration-300">
                      <p className="text-sm uppercase tracking-widest text-slate-500 dark:text-slate-400">Sending your message</p>
                      <div className="w-full max-w-xl mx-auto">
                        <div className="h-1 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-indigo-400 to-indigo-600 rounded-full animate-pulse" 
                               style={{
                                 width: '30%',
                                 animation: 'loadingBar 1s ease-in-out infinite'
                               }}>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Loading State with Progress Bar */}
                  {isLoading && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                      <p className="text-sm uppercase tracking-widest text-slate-500 dark:text-slate-400 animate-in fade-in slide-in-from-bottom-2 duration-300 delay-100">Keo is thinking</p>
                      
                      {/* Loading Progress Bar */}
                      <div className="w-full max-w-xl mx-auto">
                        <div className="h-1 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-indigo-400 to-indigo-600 rounded-full animate-pulse" 
                               style={{
                                 width: '100%',
                                 animation: 'loadingBar 2s ease-in-out infinite'
                               }}>
                          </div>
                        </div>
                      </div>

                      <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-2xl p-6 border border-white/20 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-400 delay-200 w-full max-w-4xl mx-auto">
                        <div className="space-y-3">
                          <Skeleton className="h-4 w-5/6 animate-pulse" />
                          <Skeleton className="h-4 w-2/3 animate-pulse" style={{ animationDelay: '0.1s' }} />
                          <Skeleton className="h-4 w-4/6 animate-pulse" style={{ animationDelay: '0.2s' }} />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Streaming State - Show message content while streaming */}
                  {isStreaming && currentMessage && currentMessage.sender === 'ai' && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                      <div className="space-y-4">
                        <p className="text-sm uppercase tracking-widest text-slate-500 dark:text-slate-400">Keo responds</p>
                        
                        {/* Streaming Message Content */}
                        <div className="text-lg leading-relaxed text-slate-700 dark:text-slate-300 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-2xl p-6 border border-white/20 shadow-lg max-h-[50vh] overflow-y-auto w-full max-w-4xl mx-auto">
                          <div className="whitespace-pre-wrap leading-relaxed">
                            {currentMessage.text}
                            <span className="inline-block w-2 h-5 bg-slate-400 dark:bg-slate-300 ml-1 animate-pulse"></span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                </div>

                {/* Input Area */}
                <div className="mt-10">
                  {currentMessage?.sender === 'ai' && !isLoading && (
                    <label className="block text-center text-sm text-slate-500 dark:text-slate-400 mb-3">
                      How does this resonate with you?
                    </label>
                  )}
                  
                  <div className="flex flex-col items-center gap-3">
                    <Textarea
                      ref={textareaRef}
                      value={inputText}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInputText(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={currentMessage ? "Continue the conversation..." : "What's on your mind today?"}
                      rows={3}
                      disabled={isLoading || isSending || isStreaming}
                      className="w-full max-w-4xl text-base"
                    />
                    <div className="flex items-center gap-2">
                      <Button 
                        onClick={handleSendMessage} 
                        disabled={!inputText.trim() || isLoading || isSending || isStreaming}
                        className={`transition-all duration-200 ${(isSending || isLoading || isStreaming) ? 'opacity-75' : ''}`}
                      >
                        {isSending ? 'Sending...' : isLoading ? 'Thinking...' : isStreaming ? 'Responding...' : 'Share'}
                      </Button>
                      <Button 
                        onClick={finishJournaling}
                        variant="outline" 
                      >
                        Finish
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          // Modern Main Dashboard
          <div className="flex min-h-screen w-full flex-col bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
            <header className="sticky top-0 z-10 w-full bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200/50 dark:border-slate-700/50 shadow-sm">
              <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg">
                    <span className="text-white text-lg font-bold">L</span>
                  </div>
                  <div>
                    <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">Loom</h1>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Personal Journal</p>
                  </div>
                </div>
                <nav className="flex items-center gap-3">
                  <Button variant="ghost" className="hidden sm:inline-flex text-slate-600 dark:text-slate-300">
                    <Calendar className="w-4 h-4 mr-2" />
                    Journal
                  </Button>
                  <Button variant="outline" size="sm" onClick={exportData} className="border-slate-200 dark:border-slate-700">
                    Export Data
                  </Button>
                  <UserButton />
                </nav>
              </div>
            </header>

            <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-8">
              {/* Modern Welcome Section */}
              {journal.length > 0 && (
                <div className="mb-8 text-center">
                  <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">
                    Welcome back{user?.firstName ? `, ${user.firstName}` : ''}!
                  </h2>
                  <p className="text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
                    Continue your journey of self-reflection and growth. Your thoughts matter.
                  </p>
                </div>
              )}
              
              {/* Mobile toggle with modern styling */}
              <div className="mb-6 md:hidden">
                <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl p-1 flex">
                  <Button 
                    variant={mobileView === 'journal' ? 'default' : 'ghost'} 
                    size="sm" 
                    onClick={() => setMobileView('journal')}
                    className={`flex-1 rounded-xl ${mobileView === 'journal' ? 'bg-white dark:bg-slate-700 shadow-sm' : 'hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                  >
                    📝 Journal
                  </Button>
                  <Button 
                    variant={mobileView === 'insights' ? 'default' : 'ghost'} 
                    size="sm" 
                    onClick={() => setMobileView('insights')}
                    className={`flex-1 rounded-xl ${mobileView === 'insights' ? 'bg-white dark:bg-slate-700 shadow-sm' : 'hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                  >
                    📊 Insights
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-8">
                {/* Left: Enhanced Journal List */}
                <section className={`${mobileView === 'insights' ? 'hidden' : 'block'} md:block`}>
                  <div className="sticky top-20">
                    {/* Enhanced Goals Section */}
                    <div className="mb-6 bg-gradient-to-br from-white via-indigo-50/30 to-white dark:from-slate-800 dark:via-slate-800/50 dark:to-slate-800 rounded-2xl p-5 border border-indigo-100 dark:border-slate-700 shadow-sm">
                      <div className="flex items-center gap-2 mb-3">
                        <Target className="w-4 h-4 text-indigo-500" />
                        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Focus Areas</h3>
                      </div>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {goals.map((g, idx) => (
                          <div key={idx} className="group flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-full bg-gradient-to-r from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:from-indigo-200 hover:to-purple-200 dark:hover:from-indigo-800/40 dark:hover:to-purple-800/40 transition-all duration-200">
                            <span>{g}</span>
                            <button
                              onClick={async () => {
                                const next = goals.filter((_, i) => i !== idx)
                                setGoals(next)
                                try {
                                  const token = await getToken?.({ template: jwtTemplate })
                                  await fetch(`${apiBase}/user/goals`, {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                                    body: JSON.stringify({ goals: next })
                                  })
                                } catch { /* ignore */ }
                              }}
                              className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-indigo-200/50 dark:hover:bg-indigo-700/50 rounded-full p-0.5 ml-1 -mr-1"
                              title={`Remove ${g}`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                        {goals.length === 0 && (
                          <span className="text-xs text-slate-500 dark:text-slate-400 italic">Add your focus areas to get personalized insights</span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <input
                          value={newGoal}
                          onChange={(e) => setNewGoal(e.target.value)}
                          placeholder="Add a focus area (e.g. work balance)"
                          className="flex-1 text-sm px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white/50 dark:bg-slate-700/50 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                        />
                        <Button
                          onClick={async () => {
                            const candidate = newGoal.trim()
                            if (!candidate) return
                            const next = Array.from(new Set([...goals, candidate])).slice(0, 5)
                            setGoals(next)
                            setNewGoal('')
                            try {
                              const token = await getToken?.({ template: jwtTemplate })
                              await fetch(`${apiBase}/user/goals`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                                body: JSON.stringify({ goals: next })
                              })
                            } catch {}
                          }}
                          size="sm"
                          className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-xl shadow-sm"
                        >
                          <Target className="w-3 h-3 mr-1" />
                          Add
                        </Button>
                      </div>
                    </div>
                    {/* Enhanced Start Journaling Button */}
                    <div className="mb-6">
                      <Button 
                        onClick={startJournaling}
                        className="w-full h-12 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-600 hover:from-indigo-600 hover:via-purple-600 hover:to-indigo-700 text-white rounded-2xl shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-[1.02] font-medium"
                      >
                        <Sparkles className="w-4 h-4 mr-2" />
                        Start Journaling
                      </Button>
                      {journal.length === 0 && (
                        <p className="text-xs text-center text-slate-500 dark:text-slate-400 mt-2">
                          Begin your journey of self-reflection
                        </p>
                      )}
                    </div>

                    {/* Enhanced Search */}
                    <div className="mb-4 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm rounded-2xl p-4 border border-slate-200/50 dark:border-slate-700/50 shadow-sm">
                      <div className="relative">
                        <input
                          value={searchTitle}
                          onChange={(e) => setSearchTitle(e.target.value)}
                          placeholder="Search your entries..."
                          className="w-full text-sm px-4 py-3 pl-10 rounded-xl border border-slate-200 dark:border-slate-600 bg-white/80 dark:bg-slate-700/80 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                        />
                        <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
                          <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                        </div>
                        {!!searchTitle && (
                          <button
                            onClick={() => setSearchTitle('')}
                            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                      {!!searchTitle && (
                        <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                          Searching in {filteredJournal.length} of {journal.length} entries
                        </div>
                      )}
                    </div>

                    {!initialLoaded ? (
                      <div className="space-y-4">
                        <div className="bg-white/50 dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200/50 dark:border-slate-700/50">
                          <Skeleton className="h-6 w-32 mb-3" />
                          <Skeleton className="h-4 w-full mb-2" />
                          <Skeleton className="h-4 w-3/4" />
                        </div>
                        <div className="bg-white/50 dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200/50 dark:border-slate-700/50">
                          <Skeleton className="h-6 w-40 mb-3" />
                          <Skeleton className="h-4 w-full mb-2" />
                          <Skeleton className="h-4 w-2/3" />
                        </div>
                      </div>
                    ) : filteredJournal.length > 0 ? (
                      <div className="space-y-4 max-h-[calc(100vh-400px)] overflow-y-auto pr-1">
                        {filteredJournal.map((j, index) => {
                          // Batch load summaries for visible entries (first 5)
                          if (index < 5 && !entrySummaries[j.id] && !entrySummaryLoading[j.id] && !batchLoadingEntries.has(j.id)) {
                            // Defer loading to avoid blocking render
                            setTimeout(() => {
                              const visibleIds = filteredJournal.slice(0, 5).map(entry => entry.id)
                              loadEntrySummariesBatch(visibleIds)
                            }, 100)
                          }
                          
                          return (
                            <div
                              key={j.id}
                              className="group relative bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm rounded-2xl p-5 border border-slate-200/50 dark:border-slate-700/50 shadow-sm hover:shadow-lg hover:bg-white dark:hover:bg-slate-800 cursor-pointer transition-all duration-300 transform hover:scale-[1.02] hover:border-indigo-200 dark:hover:border-indigo-700"
                              onClick={() => setSelectedEntry({ id: j.id, title: j.title || 'Untitled Entry', date: j.created_at })}
                            >
                              {/* Date Badge */}
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 bg-gradient-to-r from-indigo-400 to-purple-500 rounded-full"></div>
                                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                    {new Date(j.created_at).toLocaleDateString('en-US', { 
                                      month: 'short', 
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}
                                  </span>
                                </div>
                                {/* Action Buttons */}
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200">
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-7 px-2 text-xs hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400"
                                    onClick={async (e) => { 
                                      e.stopPropagation() 
                                      const v = window.prompt('Rename entry', j.title || '') ?? '' 
                                      if (v.trim()) await updateJournalEntry(j.id, { title: v.trim() })
                                    }}
                                  >
                                    Rename
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-7 px-2 text-xs hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-500 hover:text-red-600 dark:hover:text-red-400"
                                    onClick={async (e) => { 
                                      e.stopPropagation() 
                                      if (window.confirm('Delete this entry?')) await deleteJournalEntry(j.id)
                                    }}
                                  >
                                    Delete
                                  </Button>
                                </div>
                              </div>
                              
                              {/* Title */}
                              <h3 className="text-base font-semibold mb-3 text-slate-800 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-1">
                                {j.title || 'Untitled Entry'}
                              </h3>
                              
                              {/* Content Preview */}
                              <div className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                                {entrySummaryLoading[j.id] ? (
                                  <div className="space-y-2">
                                    <Skeleton className="h-4 w-full" />
                                    <Skeleton className="h-4 w-2/3" />
                                  </div>
                                ) : (
                                  entrySummaries[j.id] || getEntryPreview(j.content)
                                )}
                              </div>
                              
                              {/* Hover Indicator */}
                              <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse"></div>
                              </div>
                            </div>
                          )
                        })}
                        {journal.length < journalTotal && (
                          <div className="flex justify-center py-4">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={loadMoreJournal}
                              className="border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl px-6"
                            >
                              Load More Entries
                            </Button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-12 bg-white/30 dark:bg-slate-800/30 backdrop-blur-sm rounded-2xl border border-slate-200/50 dark:border-slate-700/50">
                        <div className="w-16 h-16 bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                          <svg className="w-8 h-8 text-indigo-500 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                          </svg>
                        </div>
                        <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300 mb-2">No entries yet</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Start your first journal entry to begin your reflection journey</p>
                        <Button 
                          onClick={startJournaling}
                          className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-xl"
                        >
                          <Sparkles className="w-4 h-4 mr-2" />
                          Begin Journaling
                        </Button>
                      </div>
                    )}
                  </div>
                </section>

                {/* Right: Insights Full Dashboard or Entry Insights */}
                <section className={`${mobileView === 'journal' ? 'hidden' : 'block'} md:block`}>
                  {selectedEntry ? (
                    <EntryInsightsPanel
                      entryId={selectedEntry.id}
                      entryTitle={selectedEntry.title}
                      entryDate={selectedEntry.date}
                      onBack={() => setSelectedEntry(null)}
                    />
                  ) : dashboardLoading ? (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <Skeleton className="h-24 w-full" />
                        <Skeleton className="h-24 w-full" />
                        <Skeleton className="h-24 w-full" />
                        <Skeleton className="h-24 w-full" />
                      </div>
                      <Skeleton className="h-28 w-full" />
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <Skeleton className="h-64 w-full lg:col-span-2" />
                        <Skeleton className="h-64 w-full" />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Skeleton className="h-40 w-full" />
                        <Skeleton className="h-40 w-full" />
                      </div>
                    </div>
                  ) : dashboardError ? (
                    <div className="text-sm text-slate-500">Insights unavailable right now.</div>
                  ) : dashboardData ? (
                    <div className="space-y-8">
                      {weeklySummary?.summary && (
                        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
                          <h2 className="text-xl font-semibold mb-2 flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-amber-500" />
                            This Week’s Reflection
                          </h2>
                          <p className="text-slate-700 dark:text-slate-300 text-sm">
                            {weeklySummary.summary.highlights?.[0]}
                          </p>
                          <div className="mt-3 text-xs text-slate-600 dark:text-slate-400">
                            Themes: {weeklySummary.summary.top_themes} · Emotions: {weeklySummary.summary.top_emotions}
                          </div>
                        </div>
                      )}
                      {/* Stat cards */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
                          <div className="flex items-center gap-4">
                            <Calendar className="w-7 h-7 text-indigo-500" />
                            <div>
                              <p className="text-sm text-slate-600 dark:text-slate-400">Total Entries</p>
                              <p className="text-2xl font-bold">{dashboardData.statistics.total_entries}</p>
                            </div>
                          </div>
                        </div>
                        <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
                          <div className="flex items-center gap-4">
                            <BarChart3 className="w-7 h-7 text-green-500" />
                            <div>
                              <p className="text-sm text-slate-600 dark:text-slate-400">This Week</p>
                              <p className="text-2xl font-bold">{dashboardData.statistics.entries_this_week}</p>
                            </div>
                          </div>
                        </div>
                        <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
                          <div className="flex items-center gap-4">
                            <PieChart className="w-7 h-7 text-purple-500" />
                            <div>
                              <p className="text-sm text-slate-600 dark:text-slate-400">This Month</p>
                              <p className="text-2xl font-bold">{dashboardData.statistics.entries_this_month}</p>
                            </div>
                          </div>
                        </div>
                        <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
                          <div className="flex items-center gap-4">
                            {getTrendIcon(dashboardData.trends.overall_sentiment_trend)}
                            <div>
                              <p className="text-sm text-slate-600 dark:text-slate-400">Sentiment Trend</p>
                              <p className="text-xl font-bold capitalize">{dashboardData.trends.overall_sentiment_trend}</p>
                            </div>
                          </div>
                        </div>
                      </div>


                      {/* Streaks */}
                      {streaks && (
                        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
                          <h2 className="text-xl font-semibold mb-2 flex items-center gap-2">
                            <Flame className="w-5 h-5 text-orange-500" /> Journaling Streaks
                          </h2>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border dark:border-slate-700">
                              <div className="text-xs text-slate-500 mb-1">Current</div>
                              <div className="text-2xl font-bold">{streaks.current_streak} days</div>
                            </div>
                            <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border dark:border-slate-700">
                              <div className="text-xs text-slate-500 mb-1">Best</div>
                              <div className="text-2xl font-bold">{streaks.best_streak} days</div>
                            </div>
                            <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border dark:border-slate-700">
                              <div className="text-xs text-slate-500 mb-1">Active last 30</div>
                              <div className="text-2xl font-bold">{streaks.active_days_last_30} days</div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Insights narrative */}
                      {dashboardData.trends.insights_summary && (
                        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
                          <h2 className="text-xl font-semibold mb-2 flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-amber-500" />
                            Your Journey's Narrative
                          </h2>
                          <p className="text-slate-700 dark:text-slate-300">{dashboardData.trends.insights_summary}</p>
                        </div>
                      )}

                      {/* Recent insights + side panels */}
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <div className="lg:col-span-2 space-y-8">
                          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
                            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                              <Heart className="w-5 h-5 text-red-500" />
                              Recent Emotional Snapshots
                            </h2>
                            <div className="space-y-3">
                              {dashboardData.recent_insights.slice(0, 3).map((insight) => (
                                <div key={insight.entry_id} className="p-3 bg-slate-50/80 dark:bg-slate-900/50 rounded-lg border dark:border-slate-700">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-medium truncate pr-4">{insight.title}</span>
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${getSentimentInfo(insight.sentiment_score).color}`}>
                                      {insight.dominant_emotion}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                                    <span>{new Date(insight.date).toLocaleDateString()}</span>
                                    <span className="capitalize bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded">{insight.main_theme.replace('_', ' ')}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="space-y-8">
                          {/* Keyword cloud */}
                          {keywords && keywords.length > 0 && (
                            <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
                              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                                <Clock className="w-5 h-5 text-indigo-500" /> Frequent Keywords
                              </h2>
                              <div className="flex flex-wrap gap-2">
                                {keywords.slice(0, 30).map((k) => {
                                  // Map weight [0,1] to text sizes
                                  const w = Math.max(0.4, Math.min(1, k.weight))
                                  const size = w >= 0.9 ? 'text-2xl' : w >= 0.75 ? 'text-xl' : w >= 0.6 ? 'text-lg' : w >= 0.5 ? 'text-base' : 'text-sm'
                                  const opacity = w
                                  return (
                                    <span key={k.word} className={`${size} capitalize`} style={{ opacity }}>
                                      {k.word}
                                    </span>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
                            <h2 className="text-xl font-semibold mb-4">Dominant Themes</h2>
                            <div className="space-y-3">
                              {dashboardData.trends.dominant_themes.slice(0, 5).map((theme) => (
                                <div key={theme.theme}>
                                  <div className="flex items-center justify-between text-sm mb-1">
                                    <span className="capitalize">{theme.theme.replace('_', ' ')}</span>
                                    <span className="text-slate-500 dark:text-slate-400">{Math.round(theme.frequency * 100)}%</span>
                                  </div>
                                  <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${theme.frequency * 100}%` }}/>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
                            <h2 className="text-xl font-semibold mb-4">Frequent Emotions</h2>
                            <div className="flex flex-wrap gap-2">
                              {dashboardData.trends.emotional_patterns.map((pattern) => (
                                <div key={pattern.emotion} className="py-1 px-3 bg-slate-100 dark:bg-slate-700 rounded-full">
                                  <span className="text-sm capitalize">{pattern.emotion}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
                          <h2 className="text-xl font-semibold mb-4 flex items-center gap-3">
                            <Leaf className="w-6 h-6 text-green-500" /> Growth Areas
                          </h2>
                          <ul className="space-y-3">
                            {dashboardData.trends.growth_indicators.slice(0, 3).map((indicator, idx) => (
                              <li key={idx} className="flex items-start gap-3 text-slate-600 dark:text-slate-400">
                                <div className="w-1.5 h-1.5 bg-green-500 rounded-full mt-2 shrink-0" />
                                <span>{indicator}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
                          <h2 className="text-xl font-semibold mb-4 flex items-center gap-3">
                            <Lightbulb className="w-6 h-6 text-blue-500" /> Suggestions For You
                          </h2>
                          <ul className="space-y-3">
                            {dashboardData.trends.recommendations.slice(0, 3).map((rec, idx) => (
                              <li key={idx} className="flex items-start gap-3 text-slate-600 dark:text-slate-400">
                                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 shrink-0" />
                                <span>{rec}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </section>
              </div>
            </main>

            <footer className="w-full border-t py-4 text-center text-sm text-muted-foreground">
              Weaving conversations into meaningful reflection.
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

  {/* Removed modal; insights now inline */}
    </div>
  )
}

export default App