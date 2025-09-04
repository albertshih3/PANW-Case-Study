import { useEffect, useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@clerk/clerk-react'
import { ArrowLeft, Brain, Heart, TrendingUp, Lightbulb, Target, Sparkles, MessageCircle, Send } from 'lucide-react'
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

interface ChatMessage {
  id: string
  text: string
  sender: 'user' | 'ai'
  timestamp: Date
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
  
  // Chat functionality state
  const [showChat, setShowChat] = useState(false)
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([])
  const [isChatLoading, setIsChatLoading] = useState(false)
  const [newMessage, setNewMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const jwtTemplate = (import.meta.env.VITE_CLERK_JWT_TEMPLATE as string | undefined) || 'default'
  const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

  useEffect(() => {
    fetchInsights()
    // Clear chat state when switching entries
    setChatHistory([])
    setShowChat(false)
    setNewMessage('')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId])

  // Scroll to bottom of chat when new messages are added
  useEffect(() => {
    if (showChat && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [chatHistory, showChat])

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

  const loadChatHistory = async () => {
    setIsChatLoading(true)
    try {
      let token: string | null | undefined = null
      try {
        token = await getToken?.({ template: jwtTemplate })
      } catch (e) {
        console.warn(`Clerk getToken failed for template "${jwtTemplate}".`, e)
      }

      // First get the specific journal entry
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
        return
      }

      // Get conversations from the conversations endpoint
      const conversationsResponse = await fetch(`${apiBase}/conversations?limit=100`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })

      if (!conversationsResponse.ok) {
        console.error('Failed to load conversations')
        return
      }
      
      const allConversations = await conversationsResponse.json()
      
      // Extract user messages from journal entry content
      const journalContent = entry.content || ''
      const journalUserMessages = journalContent.split('\n\n').filter((msg: string) => msg.trim())
      
      if (journalUserMessages.length === 0) {
        // If no content in journal, show empty state
        setChatHistory([])
        return
      }
      
      // Find conversations that match the user messages in this journal entry
      const relevantConversations: any[] = []
      
      // For each user message in the journal entry, find the corresponding conversation
      for (const journalMsg of journalUserMessages) {
        // Clean the journal message for comparison
        const cleanJournalMsg = journalMsg.trim().toLowerCase()
        
        // Find conversations where user_message matches this journal message
        for (const conv of allConversations) {
          const cleanConvMsg = (conv.user_message || '').trim().toLowerCase()
          
          // Check if this conversation matches the journal message
          // We'll use a fuzzy match - if messages are very similar or one contains the other
          const isMatch = cleanConvMsg === cleanJournalMsg || 
                          cleanConvMsg.includes(cleanJournalMsg) || 
                          cleanJournalMsg.includes(cleanConvMsg) ||
                          // Also check with some similarity threshold for longer messages
                          (cleanJournalMsg.length > 50 && cleanConvMsg.length > 50 && 
                           getStringSimilarity(cleanJournalMsg, cleanConvMsg) > 0.8)
          
          if (isMatch && !relevantConversations.some(rc => rc.id === conv.id)) {
            relevantConversations.push(conv)
            break // Found match for this journal message, move to next
          }
        }
      }
      
      // Sort by timestamp to maintain chronological order
      relevantConversations.sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      
      // Convert to chat messages format
      const messages: ChatMessage[] = []
      let messageId = 1
      
      for (const conv of relevantConversations) {
        // Add user message
        messages.push({
          id: `${messageId++}-user`,
          text: conv.user_message,
          sender: 'user',
          timestamp: new Date(conv.timestamp)
        })
        
        // Add AI response
        messages.push({
          id: `${messageId++}-ai`,
          text: conv.ai_response,
          sender: 'ai',
          timestamp: new Date(conv.timestamp)
        })
      }
      
      setChatHistory(messages)
      
    } catch (err) {
      console.error('Error loading chat history:', err)
    } finally {
      setIsChatLoading(false)
    }
  }

  // Helper function to calculate string similarity
  const getStringSimilarity = (str1: string, str2: string): number => {
    const longer = str1.length > str2.length ? str1 : str2
    const shorter = str1.length > str2.length ? str2 : str1
    
    if (longer.length === 0) return 1.0
    
    const editDistance = getLevenshteinDistance(longer, shorter)
    return (longer.length - editDistance) / longer.length
  }

  // Simple Levenshtein distance calculation
  const getLevenshteinDistance = (str1: string, str2: string): number => {
    const matrix = []
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i]
    }
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j
    }
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1]
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          )
        }
      }
    }
    return matrix[str2.length][str1.length]
  }

  const sendMessage = async () => {
    if (!newMessage.trim() || isSending) return
    
    setIsSending(true)
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      text: newMessage.trim(),
      sender: 'user',
      timestamp: new Date()
    }

    // Add user message immediately
    setChatHistory(prev => [...prev, userMessage])
    setNewMessage('')

    try {
      let token: string | null | undefined = null
      try {
        token = await getToken?.({ template: jwtTemplate })
      } catch (e) {
        console.warn(`Clerk getToken failed for template "${jwtTemplate}".`, e)
      }

      const response = await fetch(`${apiBase}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: userMessage.text }),
      })

      if (response.ok) {
        const data = await response.json()
        const aiMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          text: data.response,
          sender: 'ai',
          timestamp: new Date(data.timestamp)
        }
        
        setChatHistory(prev => [...prev, aiMessage])
      } else {
        throw new Error('Failed to send message')
      }
    } catch (error) {
      console.error('Error sending message:', error)
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        text: 'Sorry, I encountered an error. Please try again.',
        sender: 'ai',
        timestamp: new Date()
      }
      setChatHistory(prev => [...prev, errorMessage])
    } finally {
      setIsSending(false)
    }
  }

  const handleChatToggle = () => {
    setShowChat(!showChat)
    if (!showChat && chatHistory.length === 0) {
      loadChatHistory()
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
            onClick={handleChatToggle}
            variant={showChat ? "default" : "outline"}
            size="sm"
            className={showChat ? "bg-indigo-500 hover:bg-indigo-600 text-white" : "border-indigo-200 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"}
          >
            <MessageCircle className="w-4 h-4 mr-1" />
            {showChat ? 'Hide Chat' : 'View Chat'}
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

      {/* Chat Interface */}
      {showChat && (
        <div className="mt-6 bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 dark:from-slate-800 dark:via-slate-900 dark:to-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="border-b border-slate-200 dark:border-slate-700 p-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-indigo-500" />
              Full Conversation
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              View and continue your journaling conversation
            </p>
          </div>

          {isChatLoading ? (
            <div className="p-6 space-y-4">
              <div className="space-y-3">
                <Skeleton className="h-4 w-3/4 ml-auto" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-4/5 ml-auto" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </div>
          ) : (
            <div className="flex flex-col max-h-[60vh]">
              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-96">
                {chatHistory.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                    <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No conversation history found for this entry.</p>
                  </div>
                ) : (
                  chatHistory.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] p-3 rounded-2xl ${
                          message.sender === 'user'
                            ? 'bg-indigo-500 text-white ml-auto'
                            : 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-600'
                        }`}
                      >
                        <div className="text-sm whitespace-pre-wrap leading-relaxed">
                          {message.text}
                        </div>
                        <div
                          className={`text-xs mt-1 ${
                            message.sender === 'user'
                              ? 'text-indigo-100'
                              : 'text-slate-400 dark:text-slate-500'
                          }`}
                        >
                          {message.timestamp.toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Message Input */}
              <div className="border-t border-slate-200 dark:border-slate-700 p-4 bg-white/50 dark:bg-slate-800/50">
                <div className="flex gap-3">
                  <Textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Continue the conversation..."
                    className="flex-1 min-h-[80px] resize-none border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        sendMessage()
                      }
                    }}
                  />
                  <Button
                    onClick={sendMessage}
                    disabled={!newMessage.trim() || isSending}
                    className="self-end bg-indigo-500 hover:bg-indigo-600 text-white h-[80px] px-6"
                  >
                    {isSending ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                  Press Enter to send, Shift + Enter for new line
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}