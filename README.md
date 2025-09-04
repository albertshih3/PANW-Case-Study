# Loom – weaving conversations into meaningful reflection

Demo Video: https://youtu.be/aczQI2OvxwY
Try it out: https://loomjournal.albertshih.org

Private journaling with an empathetic AI companion. Clerk handles auth, FastAPI powers the backend, and PostgreSQL + pgvector store memories and journal entries.

## Design & Tech Overview

### Problem we’re solving
- People want the benefits of journaling but face “blank page” anxiety and struggle to see patterns across entries.
- Traditional journals become event logs rather than tools for growth and reflection.

### Solution concept: Conversational journaling with Keo
- Chat-first journaling that feels like texting a supportive companion; each chat is a journal entry.
- Empathetic, concise prompts: one gentle follow-up at a time to keep momentum without overwhelm.
- Memory and continuity: retrieve relevant past entries (via vector search) to personalize and maintain context.
- Insights: sentiment and themes surfaced in dashboards and periodic summaries (weekly/monthly) to help connect dots.

### Key design choices
- Privacy-first: data and embeddings stay in your Postgres (e.g., Supabase) with pgvector.
- Guardrails: non-clinical tone, clear crisis protocol, and basic PII scrubbing before prompts.
- Streaming UX: token streaming for natural, “typing” responses.
- Maintainable stack: React + FastAPI, typed contracts, minimal dependencies.

### Technical stack (languages, libraries, AI models)
- Frontend
  - React + TypeScript (Vite)
  - Tailwind CSS + lightweight UI primitives (shadcn-style components)
  - Clerk for auth (JWT) integrated with backend via JWKS

- Backend
  - Python (FastAPI), httpx for AI calls
  - PostgreSQL + pgvector for conversational memory; SQLAlchemy ORM
  - Supabase (managed Postgres), psycopg2, pydantic, cryptography utils

- AI layer
  - Model: Anthropic Claude 3.5 Sonnet (Messages API; streaming and non-streaming)
  - Embeddings/memory: similarity search over pgvector; short-term context lives in prompt
  - Safety: empathetic system prompt, crisis escalation protocol, PII pattern masking

### Potential future enhancements
- Voice journaling (speech-to-text and optional text-to-speech)
- On-device/private inference with smaller local models for sensitive sessions
- Deeper insights: topic clustering, correlations (e.g., mood vs. activities), richer timelines
- Multimodal entries (photos/sketches) with private/local analysis options
- Proactive check-ins and digest emails for weekly/monthly reflections
- Advanced moderation/guardrails (e.g., Llama Guard, custom policies)

## Phase 1 updates

- User goals (focus areas) stored privately and used to personalize AI prompts
- Journal edit and delete endpoints with basic UI wiring
- Weekly/Monthly reflection summary on the Insights panel
- Export your data (journals, conversations, goals) as JSON

### Key Endpoints

- POST /chat
- GET /opening-prompt
- GET /journal, POST /journal, PATCH /journal/{id}, DELETE /journal/{id}
- GET /conversations
- GET /insights/trends, GET /insights/dashboard
- GET /insights/summary?period=week|month
- GET /user/goals, PUT /user/goals

## Setup

Backend (Python 3.9+)
- Create a .env at repo root with at least:
  - ANTHROPIC_API_KEY=...
  - DATABASE_URL=postgresql://user:pass@localhost:5432/journaling_app
  - ANTHROPIC_API_KEY=...  # required (Claude)
  - CLERK_ISSUER=https://YOUR_SUBDOMAIN.clerk.accounts.dev
    or CLERK_JWKS_URL=https://YOUR_SUBDOMAIN.clerk.accounts.dev/.well-known/jwks.json
- Optionally also create backend/.env; both are loaded.
- Install deps and run:
  - pip install -r backend/requirements.txt
  - python backend/start.py

Frontend (Node 18+)
- Create .env.local with:
  - VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
  - VITE_CLERK_JWT_TEMPLATE=default   # or your template name
  - VITE_API_BASE_URL=http://localhost:8000
- Install and run:
  - npm i
  - npm run dev

## Clerk configuration

Create a JWT template in your Clerk dashboard and name it to match `VITE_CLERK_JWT_TEMPLATE` (default is `default`).
Grant appropriate claims (at minimum `sub`, and optionally `email`, etc.).
In the backend environment, set one of:

- CLERK_ISSUER=https://YOUR_SUBDOMAIN.clerk.accounts.dev
  - Backend will derive JWKS from `${ISSUER}/.well-known/jwks.json`
- or CLERK_JWKS_URL=https://YOUR_SUBDOMAIN.clerk.accounts.dev/.well-known/jwks.json

Common error: `No JWT template exists with name: default`
- Fix by creating a template named `default` in Clerk, or set `VITE_CLERK_JWT_TEMPLATE` to your existing template name.
