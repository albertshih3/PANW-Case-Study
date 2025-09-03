import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import './index.css'
import App from './App.tsx'

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined

if (!clerkPublishableKey) {
  // Soft warn in dev; app still renders so developer can see the message
  console.warn('VITE_CLERK_PUBLISHABLE_KEY is not set. Auth UI will not function.');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {clerkPublishableKey ? (
      <ClerkProvider publishableKey={clerkPublishableKey}>
        <App />
      </ClerkProvider>
    ) : (
      <App />
    )}
  </StrictMode>,
)
