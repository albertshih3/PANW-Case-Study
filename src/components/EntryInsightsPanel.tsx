import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@clerk/clerk-react'
import { ArrowLeft, Brain, Heart, TrendingUp, Lightbulb, Target, Sparkles, MessageCircle } from 'lucide-react'
import { useAnimate } from 'motion/react'
import { Skeleton } from '@/components/ui/skeleton'

interface Emotion {
  emotion: string
  intensity: number
  description: string
}

interface Theme {
  theme: string
  relevance: number
  description: string
}

interface Insights {
  summary: string
  emotions: Emotion[]
  themes: Theme[]
  sentiment_score: number
  sentiment_trend: 'positive' | 'neutral' | 'negative'
  key_insights: string[]
  growth_areas: string[]
  support_suggestions: string[]
}

export interface EntryInsightsPanelProps {
  entryId: number
  entryTitle: string
  entryDate: string
  onBack: () => void
}

export default function EntryInsightsPanel({ entryId, entryTitle, entryDate, onBack }: EntryInsightsPanelProps) {
  const { getToken } = useAuth()
  const [insights, setInsights] = useState<Insights | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scope, animate] = useAnimate()
  
  // Journal entry viewing state
  const [showEntry, setShowEntry] = useState(false)
  const [entryContent, setEntryContent] = useState<string>('')
  const [isEntryLoading, setIsEntryLoading] = useState(false)

  const jwtTemplate = (import.meta.env.VITE_CLERK_JWT_TEMPLATE as string | undefined) || 'default'
  const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

  useEffect(() => {
    fetchInsights()
    // Clear entry state when switching entries
    setShowEntry(false)
    setEntryContent('')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId])

  const fetchInsights = async () => {
    setIsLoading(true)
    setError(null)
    setInsights(null)
    try {
      let token: string | null | undefined = null
      try {
        token = await getToken?.({ template: jwtTemplate })
      } catch (e) {
        console.warn(`Clerk getToken failed for template "${jwtTemplate}".`, e)
      }

      const response = await fetch(`${apiBase}/journal/${entryId}/insights`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })

      if (response.ok) {
        const data = await response.json()
        setInsights(data.insights)
        if (scope.current) {
          await animate(scope.current.querySelectorAll('[data-animate]'), { opacity: 0, y: 12 }, { duration: 0 })
          await animate(scope.current.querySelectorAll('[data-animate]'), { opacity: 1, y: 0 }, { duration: 0.4, delay: (i: number) => i * 0.06 })
        }
      } else {
        setError('Failed to load insights. Please try again.')
      }
    } catch (err) {
      console.error('Error fetching insights:', err)
      setError('Failed to load insights. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const getSentimentColor = (score: number) => {
    if (score >= 0.7) return 'text-green-600 dark:text-green-400'
    if (score >= 0.4) return 'text-yellow-600 dark:text-yellow-400'
    return 'text-red-600 dark:text-red-400'
  }

  const getSentimentLabel = (score: number) => {
    if (score >= 0.7) return 'Positive'
    if (score >= 0.4) return 'Neutral'
    return 'Challenging'
  }

  const loadJournalEntry = async () => {
    setIsEntryLoading(true)
    try {
      let token: string | null | undefined = null
      try {
        token = await getToken?.({ template: jwtTemplate })
      } catch (e) {
        console.warn(`Clerk getToken failed for template "${jwtTemplate}".`, e)
      }

      // Get the specific journal entry
      const journalResponse = await fetch(`${apiBase}/journal?limit=100&offset=0`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
      
      if (!journalResponse.ok) {
        console.error('Failed to load journal entries')
        return
      }
      
      const entries = await journalResponse.json()
      const entry = entries.find((e: any) => e.id === entryId)
      
      if (!entry) {
        console.error('Journal entry not found')
        setEntryContent('Entry not found')
        return
      }

      setEntryContent(entry.content || 'No content available')
      
    } catch (err) {
      console.error('Error loading journal entry:', err)
      setEntryContent('Error loading entry content')
    } finally {
      setIsEntryLoading(false)
    }
  }

  const handleEntryToggle = () => {
    setShowEntry(!showEntry)
    if (!showEntry && !entryContent) {
      loadJournalEntry()
    }
  }

  return (
    <div className="min-h-[60vh]">
      <div className="flex items-center justify-between mb-4">
        <Button onClick={onBack} variant="ghost" size="sm" className="text-slate-600 dark:text-slate-300">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Insights
        </Button>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 truncate">
            <Brain className="w-5 h-5 text-indigo-500" />
            <div className="truncate">
              <div className="text-sm font-semibold truncate">{entryTitle}</div>
              <div className="text-xs text-slate-500">{new Date(entryDate).toLocaleString()}</div>
            </div>
          </div>
          <Button
            onClick={handleEntryToggle}
            variant={showEntry ? "default" : "outline"}
            size="sm"
            className={showEntry ? "bg-indigo-500 hover:bg-indigo-600 text-white" : "border-indigo-200 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"}
          >
            <MessageCircle className="w-4 h-4 mr-1" />
            {showEntry ? 'Hide Entry' : 'View Entry'}
          </Button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
        {isLoading ? (
          <div className="p-6 space-y-6">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-16 w-full" />
            <div className="grid md:grid-cols-2 gap-6">
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
            <div>
              <Skeleton className="h-5 w-28 mb-2" />
              <div className="flex gap-2">
                <Skeleton className="h-8 w-20 rounded-full" />
                <Skeleton className="h-8 w-24 rounded-full" />
              </div>
            </div>
          </div>
        ) : error ? (
          <div className="p-6 text-center">
            <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
            <Button onClick={fetchInsights}>Try Again</Button>
          </div>
        ) : insights ? (
          <div ref={scope} className="p-6 space-y-8">
            <div data-animate className="space-y-3">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-500" />
                Summary
              </h3>
              <p className="text-slate-700 dark:text-slate-300 bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-xl border border-indigo-100 dark:border-indigo-800">
                {insights.summary
                  .replace(/You\s+started\s+by\s+mentioning:\s*\"[\s\S]*?\"\.?/gi, '')
                  .replace(/\bKeo:\s*[\s\S]*/gi, '')
                  .trim()}
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div data-animate className="space-y-3">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-indigo-500" />
                  Overall Sentiment
                </h3>
                <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`text-lg font-medium ${getSentimentColor(insights.sentiment_score)}`}>
                      {getSentimentLabel(insights.sentiment_score)}
                    </span>
                    <span className="text-sm text-slate-500">({Math.round(insights.sentiment_score * 100)}%)</span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                    <div
                      className="h-2 rounded-full transition-all duration-300"
                      style={{
                        width: `${insights.sentiment_score * 100}%`,
                        backgroundColor: insights.sentiment_score >= 0.7 ? '#22c55e' : insights.sentiment_score >= 0.4 ? '#eab308' : '#ef4444'
                      }}
                    />
                  </div>
                </div>
              </div>
              <div data-animate className="space-y-3">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Heart className="w-4 h-4 text-indigo-500" />
                  Key Emotions
                </h3>
                <div className="space-y-2">
                  {insights.emotions.slice(0, 3).map((emotion, index) => (
                    <div key={index} className="bg-slate-50 dark:bg-slate-800 p-3 rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium capitalize">{emotion.emotion}</span>
                        <span className="text-sm text-slate-500">{Math.round(emotion.intensity * 100)}%</span>
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-400">{emotion.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div data-animate className="space-y-3">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Target className="w-4 h-4 text-indigo-500" />
                Main Themes
              </h3>
              <div className="flex flex-wrap gap-2">
                {insights.themes.map((theme, index) => (
                  <div key={index} className="bg-gradient-to-r from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 px-3 py-2 rounded-full border border-indigo-200 dark:border-indigo-800">
                    <span className="text-sm font-medium text-indigo-800 dark:text-indigo-200 capitalize">{theme.theme}</span>
                    <span className="text-xs text-indigo-600 dark:text-indigo-400 ml-1">({Math.round(theme.relevance * 100)}%)</span>
                  </div>
                ))}
              </div>
            </div>

            <div data-animate className="space-y-3">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-indigo-500" />
                Key Insights
              </h3>
              <div className="space-y-2">
                {insights.key_insights.map((item, index) => (
                  <div key={index} className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                    <Lightbulb className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                    <p className="text-sm">{item}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {insights.growth_areas.length > 0 && (
                <div data-animate className="space-y-3">
                  <h3 className="text-lg font-semibold">Growth Areas</h3>
                  <div className="space-y-2">
                    {insights.growth_areas.map((area, index) => (
                      <div key={index} className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                        <p className="text-sm text-green-800 dark:text-green-200">{area}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {insights.support_suggestions.length > 0 && (
                <div data-animate className="space-y-3">
                  <h3 className="text-lg font-semibold">Suggestions</h3>
                  <div className="space-y-2">
                    {insights.support_suggestions.map((area, index) => (
                      <div key={index} className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                        <p className="text-sm text-blue-800 dark:text-blue-200">{area}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* Journal Entry Content */}
      {showEntry && (
        <div className="mt-6 bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 dark:from-slate-800 dark:via-slate-900 dark:to-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="border-b border-slate-200 dark:border-slate-700 p-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-indigo-500" />
              Journal Entry Content
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              View your complete journal entry
            </p>
          </div>

          {isEntryLoading ? (
            <div className="p-6 space-y-4">
              <div className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </div>
          ) : (
            <div className="p-6">
              {!entryContent.trim() ? (
                <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                  <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No content available for this entry.</p>
                </div>
              ) : (
                <div className="bg-white dark:bg-slate-700 rounded-xl p-6 border border-slate-200 dark:border-slate-600">
                  <div className="prose prose-slate dark:prose-invert max-w-none">
                    <div className="whitespace-pre-wrap leading-relaxed text-slate-700 dark:text-slate-300">
                      {entryContent}
                    </div>
                  </div>
                  <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-600">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Entry created on {new Date(entryDate).toLocaleDateString()} at {new Date(entryDate).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}