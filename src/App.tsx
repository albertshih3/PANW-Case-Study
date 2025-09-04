import type React from 'react'
import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import { SignedIn, SignedOut, useAuth, UserButton, SignInButton, useUser } from '@clerk/clerk-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useAnimate } from 'motion/react'
import './index.css'
import KeoIntro from '@/components/KeoIntro'
import EntryInsightsPanel from '@/components/EntryInsightsPanel'
import InsightsDashboard from '@/components/InsightsDashboard'
import { Skeleton } from '@/components/ui/skeleton'
import { Calendar, Sparkles, Target, X, BarChart3 } from 'lucide-react'
import { Tooltip } from '@/components/ui/tooltip'
import { GuidedTour, type TourStep } from '@/components/GuidedTour'

// Removed Message interface as we no longer use chat messages
// Instead we use currentPrompt (string) and journalText (string)

// Removed a corrupted/unused FadeUpText component

function App() {
  const { getToken, userId } = useAuth()
  const { user } = useUser()
  const [currentPrompt, setCurrentPrompt] = useState<string>('')
  const [journal, setJournal] = useState<Array<{id:number; title:string|null; content:string; created_at:string; updated_at?: string}>>([])
  const [journalTotal, setJournalTotal] = useState<number>(0)
  const [journalPage, setJournalPage] = useState<number>(0)
  const PAGE_SIZE = 10
  const [journalText, setJournalText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [initialLoaded, setInitialLoaded] = useState(false)
  const [isJournaling, setIsJournaling] = useState(false)
  const [currentJournalId, setCurrentJournalId] = useState<number | null>(null)
  const [scope, animate] = useAnimate()
  const journalTextareaRef = useRef<HTMLTextAreaElement>(null)
  const [selectedEntry, setSelectedEntry] = useState<{id: number; title: string; date: string} | null>(null)
  const [goals, setGoals] = useState<string[]>([])
  const [newGoal, setNewGoal] = useState('')
  const [mobileView, setMobileView] = useState<'journal' | 'insights'>('journal')
  // Guided tour
  const [tourOpen, setTourOpen] = useState(false)
  const [tourSteps, setTourSteps] = useState<TourStep[]>([])
  // Filter: single search bar (title/content)
  const [searchTitle, setSearchTitle] = useState('')
  const apiBase = useMemo(() => import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000', [])
  const jwtTemplate = useMemo(() => (import.meta.env.VITE_CLERK_JWT_TEMPLATE as string | undefined) || 'default', [])

  useEffect(() => {
    // Clear journal state when user changes
    setCurrentPrompt('')
    setJournalText('')
    setCurrentJournalId(null)
  setJournal([])
  setJournalTotal(0)
  setJournalPage(0)
    setInitialLoaded(false)
    setIsJournaling(false)
  setGoals([])
    setIsSending(false)
    setIsLoading(false)
  }, [userId])

  // Animate prompt entrance when currentPrompt changes
  useEffect(() => {
    if (currentPrompt && scope.current && isJournaling) {
      const animatePrompt = async () => {
        // Find elements to animate
        const promptBox = scope.current?.querySelector('[data-prompt]')
        
        if (promptBox) {
          // Set initial state
          await animate(promptBox, { opacity: 0, y: 12 }, { duration: 0 })
          // Animate to final state
          await animate(promptBox, { opacity: 1, y: 0 }, { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] })
        }
      }
      
      // Small delay to ensure DOM is updated
      setTimeout(animatePrompt, 50)
    }
  }, [currentPrompt, animate, scope, isJournaling])

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

  const updateJournalPrompt = useCallback(async () => {
    if (!journalText.trim()) return

    setIsLoading(true)
    setIsSending(true)

    try {
      let token: string | null | undefined = null
      try {
        token = await getToken?.({ template: jwtTemplate })
      } catch (e) {
        console.warn(`Clerk getToken failed for template "${jwtTemplate}". Check your Clerk JWT template configuration.`, e)
      }

      // Send current journal text to get an updated prompt
      const response = await fetch(`${apiBase}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ 
          message: journalText,
          instructions: "Provide a short, focused response (one paragraph maximum). Ask only ONE specific question or prompt to help deepen their reflection. Keep it concise and encouraging."
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to get updated prompt')
      }

      const data = await response.json()
      
      // Update the prompt with AI guidance
      setCurrentPrompt(data.response)

      // Update the journal entry in the database if we have an ID
      if (currentJournalId) {
        await updateJournalEntry(currentJournalId, { content: journalText })
      } else {
        // Create a new journal entry if this is the first save
        const title = `Journal Entry - ${new Date().toLocaleDateString()}`
        const res = await fetch(`${apiBase}/journal`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ title, content: journalText }),
        })
        if (res.ok) {
          const item = await res.json()
          setCurrentJournalId(item.id)
          setJournal(prev => [item, ...prev])
        }
      }
      
      // Focus text area after updating
      if (journalTextareaRef.current) {
        journalTextareaRef.current.focus()
      }
    } catch (error) {
      console.error('Error updating journal prompt:', error)
      setCurrentPrompt('I encountered an error processing your entry. Please continue writing and try again.')
    } finally {
      setIsLoading(false)
      setIsSending(false)
    }
  }, [journalText, getToken, jwtTemplate, apiBase, currentJournalId, updateJournalEntry])

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

  const handleContinueWriting = useCallback(async () => {
    if (!journalText.trim()) return
    
    setIsSending(true)
    
    try {
      await updateJournalPrompt()
      
      // Focus text area after processing
      if (journalTextareaRef.current) {
        journalTextareaRef.current.focus()
      }
    } finally {
      setIsSending(false)
    }
  }, [updateJournalPrompt])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault()
      handleContinueWriting()
    }
  }

  const shouldShowIntro = Boolean(
    userId && initialLoaded && journal.length === 0
  )

  // Insights dashboard fetches its own data inside the component.

  // Start a guided tour with available steps only
  const startTour = useCallback(() => {
    const candidates: TourStep[] = [
      {
        selector: '[data-tour="brand"]',
        title: 'Welcome to Loom',
        content: 'This is your personal journal. Let’s take a quick tour of the main areas.',
        placement: 'bottom'
      },
      {
        selector: '[data-tour="start-journaling"]',
        title: 'Start Journaling',
        content: 'Begin a guided conversation with Keo to reflect on your day.',
        placement: 'right'
      },
      {
        selector: '[data-tour="search-input"]',
        title: 'Search Entries',
        content: 'Quickly find entries by title or content using the search bar.',
        placement: 'bottom'
      },
      {
        selector: '[data-tour="journal-list"]',
        title: 'Your Entries',
        content: 'Browse your recent journal entries and open one to see insights.',
        placement: 'right'
      },
      {
        selector: '[data-tour="insights-dashboard"]',
        title: 'Insights',
        content: 'See patterns, sentiment trends, and highlights extracted from your entries.',
        placement: 'left'
      }
    ]
    const available = candidates.filter(s => !!document.querySelector(s.selector))
    if (available.length === 0) return
    setTourSteps(available)
    setTourOpen(true)
  }, [])

  // Auto-run the tour when exactly one entry exists; run only once per user/session
  useEffect(() => {
    if (journal.length === 1 && !tourOpen) {
      const ran = localStorage.getItem('loom_tour_ran')
      if (!ran) {
        // Defer to allow layout to settle
        const id = window.setTimeout(() => {
          startTour()
          localStorage.setItem('loom_tour_ran', '1')
        }, 300)
        return () => window.clearTimeout(id)
      }
    }
  }, [journal.length, tourOpen, startTour])

  // Removed unused dashboard helpers from App

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
    setJournalText('')
    setCurrentJournalId(null)
    
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
        setCurrentPrompt(data.message)
      } else {
        // Fallback to a default message if API fails
        setCurrentPrompt("What's on your mind today? Take your time to reflect and write about whatever feels important right now.")
      }
    } catch (error) {
      console.error('Error fetching opening prompt:', error)
      // Fallback to a default message
      setCurrentPrompt("How are you feeling today? Let your thoughts flow freely as you write.")
    } finally {
      setIsLoading(false)
    }
  }

  const finishJournaling = async () => {
    // Save final journal entry if we have content
    if (journalText.trim()) {
      if (currentJournalId) {
        // Update existing entry
        await updateJournalEntry(currentJournalId, { content: journalText })
      } else {
        // Create new entry if not already created
        const title = `Journal Entry - ${new Date().toLocaleDateString()}`
        try {
          let token: string | null | undefined = null
          try {
            token = await getToken?.({ template: jwtTemplate })
          } catch {
            // Ignore token errors
          }
          const res = await fetch(`${apiBase}/journal`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ title, content: journalText }),
          })
          if (res.ok) {
            const item = await res.json()
            setJournal(prev => [item, ...prev])
          }
        } catch (e) {
          console.warn('Failed to create journal entry', e)
        }
      }
    }
    
    // Reset journaling state
    setIsJournaling(false)
    setCurrentPrompt('')
    setJournalText('')
    setCurrentJournalId(null)
  }

  return (
    <div className="min-h-screen w-full">
      {shouldShowIntro && (
        <KeoIntro
          name={user?.firstName || user?.fullName || undefined}
          onSubmit={async (text) => {
            await startJournaling()
            // Set the initial journal text to what the user entered
            setJournalText(text)
          }}
        />
      )}

      <SignedIn>
  {isJournaling ? (
          // Fullscreen Journal Entry Experience
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 via-white to-cyan-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900" />
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-100/30 via-transparent to-cyan-100/30 dark:from-indigo-900/20 dark:to-cyan-900/20" />
            <div className="absolute inset-0 backdrop-blur-[120px]" />
            <div className="relative min-h-screen text-slate-900 dark:text-slate-100">
              <div className="mx-auto w-full max-w-5xl px-6 py-8 min-h-screen overflow-y-auto">
                <div className="space-y-8 flex flex-col min-h-full">
                  
                  {/* AI Prompt Display */}
                  <div ref={scope} className="flex-shrink-0">
                    {currentPrompt && !isLoading && (
                      <div className="text-center space-y-4">
                        <p className="text-sm uppercase tracking-widest text-slate-500 dark:text-slate-400">Keo suggests</p>
                        <div 
                          data-prompt
                          className="text-lg leading-relaxed text-slate-700 dark:text-slate-300 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-2xl p-6 border border-white/20 shadow-lg mx-auto max-w-3xl"
                          style={{ opacity: 1, transform: 'translateY(0px)' }}
                        >
                          <div className="whitespace-pre-wrap leading-relaxed">
                            {currentPrompt}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Loading State */}
                  {isLoading && (
                    <div className="text-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 flex-shrink-0">
                      <p className="text-sm uppercase tracking-widest text-slate-500 dark:text-slate-400">Keo is thinking</p>
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
                      <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-2xl p-6 border border-white/20 shadow-lg max-w-3xl mx-auto">
                        <div className="space-y-3">
                          <Skeleton className="h-4 w-5/6 animate-pulse" />
                          <Skeleton className="h-4 w-2/3 animate-pulse" style={{ animationDelay: '0.1s' }} />
                          <Skeleton className="h-4 w-4/6 animate-pulse" style={{ animationDelay: '0.2s' }} />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Large Text Area for Journal Entry - flex-grow to take available space */}
                  <div className="flex flex-col space-y-6 flex-1 min-h-0">
                    {!isLoading && (
                      <div className="text-center flex-shrink-0">
                        <label className="block text-sm text-slate-500 dark:text-slate-400 mb-3">
                          {journalText.trim() ? "Continue writing your thoughts..." : "Start writing your journal entry..."}
                        </label>
                      </div>
                    )}
                    
                    <div className="w-full flex-1 min-h-0">
                      <Textarea
                        ref={journalTextareaRef}
                        value={journalText}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setJournalText(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="What's on your mind? Let your thoughts flow freely here. You can use **markdown** formatting like *italics* and **bold**."
                        disabled={isLoading || isSending}
                        className="w-full h-full min-h-[300px] text-base bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-white/20 dark:border-slate-700/50 rounded-2xl p-6 shadow-lg resize-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                      />
                    </div>
                  </div>
                    
                  {/* Action Buttons - Always visible at bottom */}
                  <div className="flex-shrink-0 space-y-4">
                    <div className="flex items-center justify-center gap-4">
                      <Button 
                        onClick={handleContinueWriting} 
                        disabled={!journalText.trim() || isLoading || isSending}
                        className={`transition-all duration-200 ${(isSending || isLoading) ? 'opacity-75' : ''} bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-xl px-6 py-2`}
                      >
                        {isSending ? 'Getting guidance...' : isLoading ? 'Processing...' : 'Continue with AI guidance'}
                        <span className="text-xs ml-2 opacity-75">(Ctrl+Enter)</span>
                      </Button>
                      <Button 
                        onClick={finishJournaling}
                        variant="outline" 
                        className="rounded-xl px-6 py-2 border-slate-300 dark:border-slate-600"
                      >
                        Finish & Save
                      </Button>
                    </div>

                    {/* Character count and writing tips */}
                    <div className="text-center text-xs text-slate-400 dark:text-slate-500 space-y-1">
                      <p>{journalText.length} characters written</p>
                      <p>💡 Tip: Use Ctrl+Enter to get AI guidance while keeping your text editable</p>
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
                <div className="flex items-center gap-3" data-tour="brand">
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
                  <Button variant="outline" size="sm" onClick={startTour} className="border-slate-200 dark:border-slate-700">
                    Guide
                  </Button>
                  <UserButton />
                </nav>
              </div>
            </header>

            <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-8">
              {/* Guided Tour overlay */}
              <GuidedTour open={tourOpen} steps={tourSteps} onClose={() => setTourOpen(false)} />
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
                  {journal.length === 1 ? (
                    <Tooltip 
                      content="View and manage your journal entries"
                      position="bottom"
                    >
                      <Button 
                        variant={mobileView === 'journal' ? 'default' : 'ghost'} 
                        size="sm" 
                        onClick={() => setMobileView('journal')}
                        className={`flex-1 rounded-xl ${mobileView === 'journal' ? 'bg-white dark:bg-slate-700 shadow-sm' : 'hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                      >
                        📝 Journal
                      </Button>
                    </Tooltip>
                  ) : (
                    <Button 
                      variant={mobileView === 'journal' ? 'default' : 'ghost'} 
                      size="sm" 
                      onClick={() => setMobileView('journal')}
                      className={`flex-1 rounded-xl ${mobileView === 'journal' ? 'bg-white dark:bg-slate-700 shadow-sm' : 'hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                    >
                      📝 Journal
                    </Button>
                  )}
                  {journal.length === 1 ? (
                    <Tooltip 
                      content="View emotional insights and patterns from your entries"
                      position="bottom"
                    >
                      <Button 
                        variant={mobileView === 'insights' ? 'default' : 'ghost'} 
                        size="sm" 
                        onClick={() => setMobileView('insights')}
                        className={`flex-1 rounded-xl ${mobileView === 'insights' ? 'bg-white dark:bg-slate-700 shadow-sm' : 'hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                      >
                        📊 Insights
                      </Button>
                    </Tooltip>
                  ) : (
                    <Button 
                      variant={mobileView === 'insights' ? 'default' : 'ghost'} 
                      size="sm" 
                      onClick={() => setMobileView('insights')}
                      className={`flex-1 rounded-xl ${mobileView === 'insights' ? 'bg-white dark:bg-slate-700 shadow-sm' : 'hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                    >
                      📊 Insights
                    </Button>
                  )}
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
                        {journal.length === 1 ? (
                          <Tooltip 
                            content="Set topics you want to focus on - Keo will provide personalized insights based on these areas"
                            position="right"
                          >
                            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 cursor-help">Focus Areas</h3>
                          </Tooltip>
                        ) : (
                          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Focus Areas</h3>
                        )}
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
                    <div className="mb-6" data-tour="start-journaling">
                      {journal.length === 1 ? (
                        <Tooltip 
                          content="Start a new conversational journal session with Keo"
                          position="bottom"
                          fullWidth
                        >
                          <Button 
                            onClick={startJournaling}
                            className="w-full h-12 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-600 hover:from-indigo-600 hover:via-purple-600 hover:to-indigo-700 text-white rounded-2xl shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-[1.02] font-medium"
                          >
                            <Sparkles className="w-4 h-4 mr-2" />
                            Start Journaling
                          </Button>
                        </Tooltip>
                      ) : (
                        <Button 
                          onClick={startJournaling}
                          className="w-full h-12 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-600 hover:from-indigo-600 hover:via-purple-600 hover:to-indigo-700 text-white rounded-2xl shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-[1.02] font-medium"
                        >
                          <Sparkles className="w-4 h-4 mr-2" />
                          Start Journaling
                        </Button>
                      )}
                      {journal.length === 0 && (
                        <p className="text-xs text-center text-slate-500 dark:text-slate-400 mt-2">
                          Begin your journey of self-reflection
                        </p>
                      )}
                    </div>

                    {/* Enhanced Search */}
                    <div className="mb-4 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm rounded-2xl p-4 border border-slate-200/50 dark:border-slate-700/50 shadow-sm">
                      <div className="relative">
                        {journal.length === 1 ? (
                          <Tooltip 
                            content="Search through your journal entries by title or content"
                            position="top"
                            fullWidth
                          >
                            <input
                              data-tour="search-input"
                              value={searchTitle}
                              onChange={(e) => setSearchTitle(e.target.value)}
                              placeholder="Search your entries..."
                              className="w-full text-sm px-4 py-3 pl-10 rounded-xl border border-slate-200 dark:border-slate-600 bg-white/80 dark:bg-slate-700/80 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                            />
                          </Tooltip>
                        ) : (
                          <input
                            data-tour="search-input"
                            value={searchTitle}
                            onChange={(e) => setSearchTitle(e.target.value)}
                            placeholder="Search your entries..."
                            className="w-full text-sm px-4 py-3 pl-10 rounded-xl border border-slate-200 dark:border-slate-600 bg-white/80 dark:bg-slate-700/80 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                          />
                        )}
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
                      <div className="space-y-4 max-h-[calc(100vh-400px)] overflow-y-auto pr-1" data-tour="journal-list">
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
                            journal.length === 1 ? (
                              <Tooltip 
                                key={j.id}
                                content="Click to view detailed insights for this journal entry"
                                position="right"
                                delay={500}
                              >
                                <div
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
                              </Tooltip>
                            ) : (
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

                {/* Right: Entry Insights or Full Insights Dashboard */}
                <section className={`${mobileView === 'journal' ? 'hidden' : 'block'} md:block`}>
                  {selectedEntry ? (
                    <EntryInsightsPanel
                      entryId={selectedEntry.id}
                      entryTitle={selectedEntry.title}
                      entryDate={selectedEntry.date}
                      onBack={() => setSelectedEntry(null)}
                    />
                  ) : (
                    <div data-tour="insights-dashboard">
                      {journal.length >= 3 ? (
                        <InsightsDashboard />
                      ) : (
                        <div className="w-full p-6">
                          <div className="mx-auto max-w-xl text-center">
                            <div className="relative mx-auto mb-6 h-40 w-40">
                              <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-indigo-500/20 via-purple-500/20 to-cyan-500/20 blur-2xl" />
                              <div className="absolute inset-4 rounded-3xl bg-white/40 dark:bg-slate-800/40 backdrop-blur-md border border-slate-200/60 dark:border-slate-700/60 shadow-sm flex items-center justify-center">
                                <BarChart3 className="w-12 h-12 text-indigo-500" />
                              </div>
                            </div>
                            <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">Insights unlock after 3 entries</h3>
                            <p className="text-slate-600 dark:text-slate-400 mb-4">Write a few reflections to help Keo discover patterns, themes, and trends tailored to you.</p>
                            <div className="flex items-center justify-center gap-2 text-slate-500 dark:text-slate-400 text-sm">
                              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-300" /> 1</span>
                              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-300" /> 2</span>
                              <span className="flex items-center gap-1 font-medium text-indigo-600 dark:text-indigo-400"><span className="h-2 w-2 rounded-full bg-indigo-500" /> 3</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
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