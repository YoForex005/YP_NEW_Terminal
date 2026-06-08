# Forex CRM — Frontend

> **This repository is for Frontend Developers only.**
> You do **not** need to install C++, Rust, Go, or PostgreSQL.
> The backend runs separately on a shared dev server — just point your `.env.local` to it.

## Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State**: Zustand + TanStack Query
- **Realtime**: WebSocket (connects to Rust Gateway)

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Create `.env.local` in this directory (already gitignored):

```env
# Point to the shared backend dev server (get this URL from the backend dev)
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3000
NEXT_PUBLIC_WS_URL=ws://127.0.0.1:3000/ws

# Auth (leave false for local dev)
DEV_AUTO_AUTH=false
```

> **Ask your backend developer** for the correct `NEXT_PUBLIC_API_BASE_URL` URL
> if they are running the backend on a remote dev/staging server.

### 3. Run Dev Server

```bash
npm run dev
```

Frontend starts at **http://localhost:3001**

## Project Structure

```
frontend/
├── app/              ← Next.js App Router pages and layouts
│   ├── (auth)/       ← Login / register pages
│   ├── dashboard/    ← CRM dashboard pages
│   └── api/          ← Next.js API routes (proxy to backend)
├── components/       ← Reusable React components
│   ├── ui/           ← Base UI primitives
│   ├── charts/       ← Trading charts
│   └── tables/       ← Data tables
├── lib/              ← Utilities, API clients, WebSocket helpers
├── store/            ← Zustand global state stores
├── types/            ← TypeScript type definitions
├── public/           ← Static assets (images, icons)
├── data/             ← Static/mock data
├── tests/            ← Frontend tests
└── middleware.ts     ← Auth middleware (JWT validation)
```

## API Communication

The frontend **never talks directly to C++ or MT5**.
All requests go through the **Rust Gateway** (`NEXT_PUBLIC_API_BASE_URL`):

```
Frontend (Next.js :3001)
    │  HTTP/WebSocket
    ▼
Rust Gateway (:3000)       ← your NEXT_PUBLIC_API_BASE_URL
    │
    ▼
C++ Backend (:3002/:3003)  ← backend dev's concern only
```

### Key API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/login` | Authenticate user |
| `GET` | `/api/accounts` | List CRM accounts |
| `GET` | `/api/accounts/:id/positions` | Open positions |
| `POST` | `/api/commands/deposit` | Deposit command |
| `POST` | `/api/commands/withdraw` | Withdraw command |
| `WS` | `/ws` | Realtime price/trade updates |

Full API docs: **http://\<backend-server\>:3000/swagger-ui**

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_API_BASE_URL` | ✅ | Backend Rust Gateway URL |
| `NEXT_PUBLIC_WS_URL` | ✅ | WebSocket URL (ws:// or wss://) |
| `DEV_AUTO_AUTH` | ❌ | Set `true` to skip login in local dev |
| `WEBTRADER_TOKEN_SECRET` | ❌ | Only needed if running token scripts locally |

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server on `:3001` |
| `npm run build` | Production build |
| `npm run lint` | Run ESLint |
| `npm test` | Run frontend tests |

## Working with the Backend Dev

When you need a **new API endpoint**:
1. Check the Swagger UI (`http://<backend-server>:3000/swagger-ui`) first — it may already exist.
2. If it doesn't exist, open a ticket / issue for the backend developer describing the data shape you need.
3. The backend dev adds the route in `rust-gateway/src/api.rs` or `backend c++/src/controllers/`.
4. They update the Swagger spec so you can see the new endpoint.

## Common Issues

| Issue | Fix |
|-------|-----|
| `ECONNREFUSED` on API calls | Backend server is not running — check with backend dev |
| WebSocket not connecting | Check `NEXT_PUBLIC_WS_URL` — should be `ws://` not `http://` |
| Login fails with 401 | Backend may need DB seeded — ask backend dev |
| `npm run dev` crashes | Run `npm install` first |

## Further Reading

- [Full Frontend Docs](README-FRONTEND.md)
- [Backend API Swagger](http://localhost:3000/swagger-ui) (requires backend running)
