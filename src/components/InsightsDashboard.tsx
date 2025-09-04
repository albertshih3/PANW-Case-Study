import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { 
  Brain, 
  Heart, 
  Calendar, 
  BarChart3, 
  PieChart, 
  Lightbulb,
  ArrowUp,
  ArrowDown,
  ArrowRight,
  Sparkles,
  Leaf
} from 'lucide-react'
import { Tooltip } from '@/components/ui/tooltip'

// This interface should match the data structure returned by your FastAPI backend
interface DashboardData {
  statistics: {
    total_entries: number
    entries_this_week: number
    entries_this_month: number
  }
  trends: {
    overall_sentiment_trend: string
    dominant_themes: Array<{
      theme: string
      frequency: number
    }>
    emotional_patterns: Array<{
      emotion: string
      frequency: number
    }>
    growth_indicators: string[]
    recommendations: string[]
    insights_summary: string
  }
  recent_insights: Array<{
    entry_id: number
    date: string
    title: string
    sentiment_score: number
    dominant_emotion: string
    main_theme: string
  }>
}

interface InsightsDashboardProps {}

// Add type definition for Clerk on the window object to avoid TypeScript errors.
declare global {
  interface Window {
    Clerk?: {
      session?: {
        getToken: (options?: { template?: string }) => Promise<string | null>;
      };
    };
  }
}

export function InsightsDashboard({}: InsightsDashboardProps) {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Use env with safe fallbacks: local dev hits localhost; prod can use Vercel rewrite (/api) or full URL
  const jwtTemplate = (import.meta.env.VITE_CLERK_JWT_TEMPLATE as string | undefined) || 'default'
  const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)
    || (typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'http://localhost:8000' : '/api')

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    setIsLoading(true)
    setError(null)
    
    try {
      let token: string | null = null;
      // Access Clerk token directly from the window object.
      if (window.Clerk && window.Clerk.session) {
        token = await window.Clerk.session.getToken({ template: jwtTemplate });
      } else {
        console.warn("Clerk session not found on window object. Proceeding without auth token.");
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 60000)

      const response = await fetch(`${apiBase}/insights/dashboard`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)

      if (response.ok) {
        const data = await response.json()
        setDashboardData(data)
      } else {
        const errorText = await response.text()
        setError(`Failed to load insights dashboard: ${response.status} - ${errorText}`)
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setError('Request timed out. The analysis is taking longer than expected. Please try again.')
      } else {
        setError('Failed to load insights dashboard. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  // Normalize labels: replace underscores/dashes, trim, and Title Case words
  const formatLabel = (value: string | null | undefined) => {
    if (!value) return ''
    return value
      .toString()
      .replace(/[_-]+/g, ' ')
      .trim()
      .split(/\s+/)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ')
  }

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

  // Build a friendly, highlighted list with tooltips to source entries
  const buildHighlightedList = (items: string[], type: 'theme' | 'emotion') => {
    const parts: React.ReactNode[] = []
    items.forEach((raw, idx) => {
      const item = formatLabel(raw)
      const matches = (dashboardData?.recent_insights || []).filter(ri => {
        if (type === 'theme') return formatLabel(ri.main_theme).toLowerCase() === item.toLowerCase()
        return formatLabel(ri.dominant_emotion).toLowerCase() === item.toLowerCase()
      })
      const tooltip = matches.length
        ? `Seen in: ${matches.slice(0, 3).map(m => `${new Date(m.date).toLocaleDateString()} – ${m.title || 'Untitled'}`).join('; ')}`
        : `No recent entries tagged with ${item}`

      const node = (
        <Tooltip key={`${type}-${raw}-${idx}`} content={tooltip} position="top">
          <span className="underline decoration-dotted decoration-indigo-400 underline-offset-4 rounded px-0.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/30">
            {item}
          </span>
        </Tooltip>
      )

      parts.push(node)
      if (idx < items.length - 2) parts.push(', ')
      else if (idx === items.length - 2) parts.push(', and ')
    })
    return parts
  }
  
  const StatCard = ({ icon, title, value }: { icon: React.ReactNode, title: string, value: string | number }) => (
    <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm transition-all hover:shadow-lg hover:border-indigo-300 dark:hover:border-indigo-600">
      <div className="flex items-center gap-4">
        {icon}
        <div>
          <p className="text-sm text-slate-600 dark:text-slate-400">{title}</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
        </div>
      </div>
    </div>
  )

  if (isLoading) {
    return (
      <div className="w-full min-h-[200px] flex items-center justify-center">
        <style>{`
          @keyframes indeterminateBar {
            0% { left: -40%; width: 40%; }
            50% { left: 20%; width: 60%; }
            100% { left: 100%; width: 40%; }
          }
        `}</style>
        <div className="w-full max-w-md px-6">
          <div className="mb-3 text-center text-slate-600 dark:text-slate-400">Building your insights…</div>
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700 shadow-inner">
            <div
              className="absolute top-0 h-full rounded-full bg-gradient-to-r from-indigo-400 via-indigo-600 to-purple-600"
              style={{ animation: 'indeterminateBar 1.2s ease-in-out infinite' }}
            />
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="w-full p-6">
        <div className="text-center py-8">
          <p className="text-lg text-red-600 dark:text-red-400 mb-4">{error}</p>
          <Button onClick={fetchDashboardData}>Try Again</Button>
        </div>
      </div>
    )
  }

  // If fewer than 3 total entries, show a modern empty-state graphic instead of insights
  if (dashboardData && dashboardData.statistics.total_entries < 3) {
    return (
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
    )
  }

  return (
    <div className="">
      <div className="p-4 md:p-6 max-w-7xl mx-auto">
  <header className="mb-8">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-100 dark:bg-indigo-900/50 rounded-full">
              <Brain className="w-8 h-8 text-indigo-500 dark:text-indigo-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Your Insights Dashboard</h1>
              <p className="text-slate-600 dark:text-slate-400">Understanding your emotional landscape through data.</p>
            </div>
          </div>
        </header>

        {dashboardData && (
          <main className="space-y-8">
            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard icon={<Calendar className="w-7 h-7 text-indigo-500" />} title="Total Entries" value={dashboardData.statistics.total_entries} />
              <StatCard icon={<BarChart3 className="w-7 h-7 text-green-500" />} title="This Week" value={dashboardData.statistics.entries_this_week} />
              <StatCard icon={<PieChart className="w-7 h-7 text-purple-500" />} title="This Month" value={dashboardData.statistics.entries_this_month} />
              <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm transition-all hover:shadow-lg hover:border-indigo-300 dark:hover:border-indigo-600">
                  <div className="flex items-center gap-4">
                      {getTrendIcon(dashboardData.trends.overall_sentiment_trend)}
                      <div>
                          <p className="text-sm text-slate-600 dark:text-slate-400">Sentiment Trend</p>
                          <p className="text-xl font-bold text-slate-900 dark:text-slate-100">
                              {formatLabel(dashboardData.trends.overall_sentiment_trend)}
                          </p>
                      </div>
                  </div>
              </div>
            </section>
            
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-8">
                  {/* Insights Summary */}
                  <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
                      <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                          <Sparkles className="w-5 h-5 text-amber-500" />
                          Your Journey's Narrative
                      </h2>
                      <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                        {`Your recent entries show a ${formatLabel(dashboardData.trends.overall_sentiment_trend).toLowerCase()} emotional trend.`}{' '}
                        The most common themes are{' '}
                        {buildHighlightedList(
                          dashboardData.trends.dominant_themes.slice(0, 3).map(t => t.theme),
                          'theme'
                        )}
                        , with emotions like{' '}
                        {buildHighlightedList(
                          dashboardData.trends.emotional_patterns.slice(0, 3).map(e => e.emotion),
                          'emotion'
                        )}{' '}
                        appearing often.
                      </p>
                  </div>

                  {/* Recent Entry Insights */}
                  <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                      <Heart className="w-5 h-5 text-red-500" />
                      Recent Emotional Snapshots
                    </h2>
                    <div className="space-y-3">
                      {dashboardData.recent_insights.slice(0, 3).map((insight) => (
                        <div key={insight.entry_id} className="p-3 bg-slate-50/80 dark:bg-slate-900/50 rounded-lg border dark:border-slate-700">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate pr-4">{insight.title}</span>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${getSentimentInfo(insight.sentiment_score).color}`}>
                              {formatLabel(insight.dominant_emotion)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                            <span>{new Date(insight.date).toLocaleDateString()}</span>
                            <span className="bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded">{formatLabel(insight.main_theme)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
              </div>

              <div className="space-y-8">
                {/* Dominant Themes */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4">Dominant Themes</h2>
                  <div className="space-y-3">
                    {dashboardData.trends.dominant_themes.slice(0, 5).map((theme) => (
                      <div key={theme.theme}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-slate-700 dark:text-slate-300">{formatLabel(theme.theme)}</span>
                          <span className="text-slate-500 dark:text-slate-400">{Math.round(theme.frequency * 100)}%</span>
                        </div>
                        <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${theme.frequency * 100}%` }}/>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Emotional Patterns */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4">Frequent Emotions</h2>
                    <div className="flex flex-wrap gap-2">
                        {dashboardData.trends.emotional_patterns.map((pattern) => (
                            <div key={pattern.emotion} className="py-1 px-3 bg-slate-100 dark:bg-slate-700 rounded-full">
                                <span className="text-sm text-slate-700 dark:text-slate-300">{formatLabel(pattern.emotion)}</span>
                            </div>
                        ))}
                    </div>
                </div>
              </div>
            </section>
            
            <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Growth Areas */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-3">
                  <Leaf className="w-6 h-6 text-green-500" /> Growth Areas
                </h2>
                <ul className="space-y-3">
                  {dashboardData.trends.growth_indicators.slice(0, 3).map((indicator, index) => (
                    <li key={index} className="flex items-start gap-3 text-slate-600 dark:text-slate-400">
                      <div className="w-1.5 h-1.5 bg-green-500 rounded-full mt-2 shrink-0" />
                      <span>{indicator}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Recommendations */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-3">
                  <Lightbulb className="w-6 h-6 text-blue-500" /> Suggestions For You
                </h2>
                <ul className="space-y-3">
                  {dashboardData.trends.recommendations.slice(0, 3).map((rec, index) => (
                    <li key={index} className="flex items-start gap-3 text-slate-600 dark:text-slate-400">
                      <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 shrink-0" />
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          </main>
        )}
      </div>
    </div>
  )
}

export default InsightsDashboard

