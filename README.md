# OverTrack

**Overland travel route planner — from Tokyo to Antarctica, no flights required.**

OverTrack computes feasible multi-country overland routes using trains, buses, ferries, and cruise ships. Enter any two cities and receive a complete journey plan with operators, durations, border crossing notes, and CO₂ comparisons.

---

## Features

- **Dijkstra pathfinding** across a graph of 191 cities, 254 connections, and 103 transport operators
- **Interactive Leaflet map** with CartoDB tiles (light/dark) and color-coded transport types
- **Itinerary builder** with adjustable rest days, departure dates, and pace settings
- **Carbon footprint comparison** — overland vs. flying
- **Operator directory** — searchable, filterable, with booking links
- **Dark mode** with automatic system preference detection

## Design

Visual identity inspired by the MIT Media Lab — designed by [Pentagram](https://www.pentagram.com/work/mit-media-lab):

| Principle | Implementation |
|---|---|
| Color | `#000` / `#FFF` / `#FF0066` — nothing else |
| Typography | Inter, weight hierarchy only |
| Geometry | `border-radius: 0` everywhere |
| Elevation | 1px borders, zero shadows |
| Navbar | Always black, regardless of theme |

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Tailwind CSS 3, shadcn/ui, Leaflet |
| Backend | Express, Drizzle ORM, in-memory storage |
| Routing | Wouter (hash-based) |
| Data | TanStack React Query v5 |
| Build | Vite 7, TypeScript |

## Getting Started

```bash
npm install --legacy-peer-deps
npm run dev
```

Server starts at `http://localhost:5000`.

## Project Structure

```
client/src/
  components/    Navbar, RouteMap, LegsList, RouteStats
  pages/         route-planner, operators, itinerary
  lib/           theme, queryClient
server/
  routes.ts      API endpoints
  storage.ts     Graph + Dijkstra pathfinding
shared/
  schema.ts      Drizzle schema + Zod validation
```

## Route Data

The database contains overland connections spanning:

- **Asia** — Japan, South Korea, China, Mongolia, Russia, Southeast Asia, Central Asia, Middle East
- **Europe** — Trans-Siberian corridor, Western Europe rail network
- **Africa** — East Africa bus routes, Southern Africa rail
- **South America** — Andean bus corridors, Patagonia to Ushuaia

Each connection includes operator, duration, distance, confidence level, and border crossing notes.

## License

MIT
