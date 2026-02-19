# Energy IDSS Frontend

React 19 + TypeScript 5.9 SPA for the Household Energy Cost & Usage Dashboard.

## Stack

- **Framework:** React 19, Vite 7, TypeScript 5.9 (strict)
- **Styling:** Tailwind CSS 4, shadcn/ui, tw-animate-css
- **State:** Zustand (7 stores with localStorage persistence)
- **Data fetching:** TanStack Query v5, Axios
- **Charts:** Recharts 3, D3.js 7
- **Animations:** Framer Motion 12
- **Validation:** Zod 4
- **Testing:** Vitest 4, Testing Library

## Setup

```bash
npm install
```

## Environment

Vite reads env vars from the **project root** `.env` file (configured via `envDir` in vite.config.ts).
The key variable is `VITE_API_URL` (default: `http://localhost:8000`).

## Development

```bash
# Start dev server (port 5173, proxies /api to FastAPI :8000)
npm run dev

# The FastAPI backend must be running separately:
cd ../backend && uvicorn server.main:app --reload --port 8000
```

## Testing

```bash
npm test            # Run all 100 tests
npm run test:watch  # Watch mode
```

## Production Build

```bash
npm run build    # Output to dist/
npm run preview  # Preview production build
```

## Directory Structure

```
src/
├── api/          Axios client + TanStack Query hooks
├── components/
│   ├── ui/       shadcn/ui primitives (5)
│   ├── charts/   Recharts + D3 visualisations (12)
│   ├── controls/ Input controls (8)
│   ├── cards/    Metric + info cards (4)
│   ├── chat/     LLM chat drawer components (10)
│   └── layout/   Sidebar, TopBar, AppLayout (7)
├── pages/        6 pages (Dashboard, Forecast, Simulate, Analytics, Actions, Settings)
├── stores/       7 Zustand slices
├── hooks/        Custom hooks (media query, keyboard shortcuts, chat stream, URL state, prefetch)
├── lib/          Utility functions
├── types/        TypeScript types + Zod schemas
└── theme/        Chart colour theme
```
