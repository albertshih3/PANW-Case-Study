import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@clerk/clerk-react'
import { X, Brain, Heart, TrendingUp, Lightbulb, Target, Sparkles } from 'lucide-react'
import { useAnimate } from 'motion/react'

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

interface InsightsModalProps {
  entryId: number
  entryTitle: string
  entryDate: string
  isOpen: boolean
  onClose: () => void
}

export function InsightsModal({ entryId, entryTitle, entryDate, isOpen, onClose }: InsightsModalProps) {
  const { getToken } = useAuth()
  const [insights, setInsights] = useState<Insights | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scope, animate] = useAnimate()
  
  const jwtTemplate = (import.meta.env.VITE_CLERK_JWT_TEMPLATE as string | undefined) || 'default'
  const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

  useEffect(() => {
    if (isOpen && entryId) {
      fetchInsights()
    }
  }, [isOpen, entryId])

  const fetchInsights = async () => {
    setIsLoading(true)
    setError(null)
    
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
        
        // Animate content in
        if (scope.current) {
          await animate(scope.current.querySelectorAll('[data-animate]'),
            { opacity: 0, y: 20 },
            { duration: 0 }
          )
          await animate(scope.current.querySelectorAll('[data-animate]'),
            { opacity: 1, y: 0 },
            { duration: 0.5, delay: (i: number) => i * 0.1 }
          )
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

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-4xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Brain className="w-5 h-5 text-indigo-500" />
              Entry Insights
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {entryTitle} • {new Date(entryDate).toLocaleDateString()}
            </p>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onClose}
            className="rounded-full p-2"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-80px)]">
          {isLoading ? (
            <div className="p-6 space-y-6">
              <div>
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-16 w-full" />
              </div>
              <div className="grid md:grid-cols-2 gap-6">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
              <div>
                <Skeleton className="h-4 w-28 mb-2" />
                <div className="flex gap-2">
                  <Skeleton className="h-8 w-20 rounded-full" />
                  <Skeleton className="h-8 w-24 rounded-full" />
                  <Skeleton className="h-8 w-28 rounded-full" />
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
              {/* Summary */}
              <div data-animate className="space-y-3">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-500" />
                  Summary
                </h3>
                <p className="text-slate-700 dark:text-slate-300 bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-xl border border-indigo-100 dark:border-indigo-800">
                  {insights.summary}
                </p>
              </div>

              {/* Sentiment & Emotions */}
              <div className="grid md:grid-cols-2 gap-6">
                {/* Sentiment */}
                <div data-animate className="space-y-3">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-indigo-500" />
                    Overall Sentiment
                  </h3>
                  <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`text-lg font-medium ${getSentimentColor(insights.sentiment_score)}`}>
                        {getSentimentLabel(insights.sentiment_score)}
                      </span>
                      <span className="text-sm text-slate-500">
                        ({Math.round(insights.sentiment_score * 100)}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                      <div 
                        className="h-2 rounded-full transition-all duration-300"
                        style={{ 
                          width: `${insights.sentiment_score * 100}%`,
                          backgroundColor: insights.sentiment_score >= 0.7 ? '#22c55e' : 
                                           insights.sentiment_score >= 0.4 ? '#eab308' : '#ef4444'
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Emotions */}
                <div data-animate className="space-y-3">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Heart className="w-4 h-4 text-indigo-500" />
                    Key Emotions
                  </h3>
                  <div className="space-y-2">
                    {insights.emotions.slice(0, 3).map((emotion, index) => (
                      <div key={index} className="bg-slate-50 dark:bg-slate-800 p-3 rounded-lg">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-slate-900 dark:text-slate-100 capitalize">
                            {emotion.emotion}
                          </span>
                          <span className="text-sm text-slate-500">
                            {Math.round(emotion.intensity * 100)}%
                          </span>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-400">{emotion.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Themes */}
              <div data-animate className="space-y-3">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Target className="w-4 h-4 text-indigo-500" />
                  Main Themes
                </h3>
                <div className="flex flex-wrap gap-2">
                  {insights.themes.map((theme, index) => (
                    <div 
                      key={index}
                      className="bg-gradient-to-r from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 px-3 py-2 rounded-full border border-indigo-200 dark:border-indigo-800"
                    >
                      <span className="text-sm font-medium text-indigo-800 dark:text-indigo-200 capitalize">
                        {theme.theme}
                      </span>
                      <span className="text-xs text-indigo-600 dark:text-indigo-400 ml-1">
                        ({Math.round(theme.relevance * 100)}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Key Insights */}
              <div data-animate className="space-y-3">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-indigo-500" />
                  Key Insights
                </h3>
                <div className="space-y-2">
                  {insights.key_insights.map((insight, index) => (
                    <div key={index} className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                      <Lightbulb className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-slate-700 dark:text-slate-300">{insight}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Growth Areas & Suggestions */}
              <div className="grid md:grid-cols-2 gap-6">
                {/* Growth Areas */}
                {insights.growth_areas.length > 0 && (
                  <div data-animate className="space-y-3">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      Growth Areas
                    </h3>
                    <div className="space-y-2">
                      {insights.growth_areas.map((area, index) => (
                        <div key={index} className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                          <p className="text-sm text-green-800 dark:text-green-200">{area}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Support Suggestions */}
                {insights.support_suggestions.length > 0 && (
                  <div data-animate className="space-y-3">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      Suggestions
                    </h3>
                    <div className="space-y-2">
                      {insights.support_suggestions.map((suggestion, index) => (
                        <div key={index} className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                          <p className="text-sm text-blue-800 dark:text-blue-200">{suggestion}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default InsightsModal