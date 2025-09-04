# Loom – weaving conversations into meaningful reflection

Private journaling with an empathetic AI companion. Clerk handles auth, FastAPI powers the backend, and PostgreSQL + pgvector store memories and journal entries.

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
- GET /export (add ?download=true to prompt a file download)

### Privacy

- No embeddings are sent to third parties; trend analysis uses lexical/keyword heuristics locally.
- Conversations and journals are stored in your own Postgres (Supabase) database.
- You can export all your data at any time from the app (Export Data button) or via GET /export.

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

## Notes
- Auth: Frontend obtains a Clerk JWT; backend verifies via JWKS and associates data by clerk_user_id.
- Database: tables users, conversations (with optional embeddings), and journal_entries are created automatically.
- UI: Modern hero + chat card and a journal panel; more to come.

## Clerk configuration

Create a JWT template in your Clerk dashboard and name it to match `VITE_CLERK_JWT_TEMPLATE` (default is `default`).
Grant appropriate claims (at minimum `sub`, and optionally `email`, etc.).
In the backend environment, set one of:

- CLERK_ISSUER=https://YOUR_SUBDOMAIN.clerk.accounts.dev
  - Backend will derive JWKS from `${ISSUER}/.well-known/jwks.json`
- or CLERK_JWKS_URL=https://YOUR_SUBDOMAIN.clerk.accounts.dev/.well-known/jwks.json

Common error: `No JWT template exists with name: default`
- Fix by creating a template named `default` in Clerk, or set `VITE_CLERK_JWT_TEMPLATE` to your existing template name.
