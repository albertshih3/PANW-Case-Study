import type React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { SignedIn, SignedOut, useAuth, UserButton, SignInButton } from '@clerk/clerk-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import './index.css'

interface Message {
  id: string
  text: string
  sender: 'user' | 'ai'
  timestamp: Date
}

function App() {
  const { getToken, userId } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [journal, setJournal] = useState<Array<{id:number; title:string|null; content:string; created_at:string}>>([])
  const [inputText, setInputText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const apiBase = useMemo(() => import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000', [])
  const jwtTemplate = useMemo(() => (import.meta.env.VITE_CLERK_JWT_TEMPLATE as string | undefined) || 'default', [])

  useEffect(() => {
    // Clear chat when user changes
    setMessages([])
  setJournal([])
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
          // eslint-disable-next-line no-console
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

        // Load recent conversations and render into chat
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
          if (!ignore) setMessages(restored)
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('Failed to fetch journal list', e)
      }
    }
    if (!ignore) load()
    return () => { ignore = true }
  }, [userId, getToken, apiBase, jwtTemplate])

  const handleSendMessage = async () => {
    if (!inputText.trim()) return

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputText,
      sender: 'user',
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInputText('')
    setIsLoading(true)

    try {
      let token: string | null | undefined = null
      try {
        token = await getToken?.({ template: jwtTemplate })
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn(`Clerk getToken failed for template "${jwtTemplate}". Check your Clerk JWT template configuration.`, e)
      }
      const response = await fetch(`${apiBase}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: inputText }),
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

      setMessages(prev => [...prev, aiMessage])
    } catch (error) {
      console.error('Error sending message:', error)
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: 'Sorry, I encountered an error. Please try again.',
        sender: 'ai',
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  return (
    <div className="flex min-h-screen w-full flex-col">
      <header className="sticky top-0 z-10 w-full border-b bg-background/80 backdrop-blur">
        <div className="flex h-14 items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <span className="text-xl">📝</span>
            <h1 className="text-base font-semibold tracking-tight">Loom</h1>
          </div>
          <nav className="flex items-center gap-2">
            <SignedIn>
              <Button variant="ghost" className="hidden sm:inline-flex">Journal</Button>
              <Button variant="ghost" className="hidden sm:inline-flex">Insights</Button>
              <UserButton afterSignOutUrl="/" />
            </SignedIn>
            <SignedOut>
              <SignInButton mode="modal">
                <Button>Sign In</Button>
              </SignInButton>
            </SignedOut>
          </nav>
        </div>
      </header>

      <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-6">
        <section className="mb-6">
          <h2 className="text-2xl font-bold leading-tight">weaving conversations into meaningful reflection</h2>
        </section>

        <SignedIn>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Today’s Reflection</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[50vh] w-full rounded-md border p-4">
                  {messages.length === 0 && (
                    <div className="text-center text-muted-foreground italic py-6">
                      Welcome back. What’s on your mind today?
                    </div>
                  )}
                  <div className="space-y-3">
                    {messages.map((message) => (
                      <div key={message.id} className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[70%] rounded-xl border px-3 py-2 ${message.sender === 'user' ? 'bg-primary text-primary-foreground' : 'bg-card'}`}>
                          <p className="whitespace-pre-line text-sm">{message.text}</p>
                          <span className="mt-1 block text-[10px] opacity-70">{message.timestamp.toLocaleTimeString()}</span>
                        </div>
                      </div>
                    ))}
                    {isLoading && (
                      <div className="flex justify-start">
                        <div className="max-w-[70%] rounded-xl border bg-card px-3 py-2">
                          <p className="text-sm">Thinking...</p>
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>
                <div className="mt-4 flex items-end gap-2">
                  <Textarea
                    value={inputText}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Share what's on your mind..."
                    rows={3}
                    disabled={isLoading}
                  />
                  <Button onClick={handleSendMessage} disabled={!inputText.trim() || isLoading}>Send</Button>
                </div>
              </CardContent>
            </Card>

            <Card className="col-span-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Your Journal</CardTitle>
              </CardHeader>
              <CardContent>
                {journal.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No entries yet. Your reflections will appear here.</div>
                ) : (
                  <div className="space-y-2">
                    {journal.slice(0,8).map(j => (
                      <div key={j.id} className="rounded border p-2">
                        <div className="text-xs opacity-70">{new Date(j.created_at).toLocaleString()}</div>
                        <div className="text-sm font-medium">{j.title || 'Untitled'}</div>
                        <div className="text-sm line-clamp-2 opacity-80">{j.content}</div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </SignedIn>

        <SignedOut>
          <Card className="mx-auto max-w-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Sign in to start journaling</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">Your entries are private and tied to your account.</p>
              <SignInButton mode="modal">
                <Button>Get Started</Button>
              </SignInButton>
            </CardContent>
          </Card>
        </SignedOut>
      </main>

      <footer className="w-full border-t py-4 text-center text-sm text-muted-foreground">
        Built for thoughtful reflection. Your data, your control.
      </footer>
    </div>
  )
}

export default App
