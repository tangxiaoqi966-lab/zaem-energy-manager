# ZHIRAI Apartment Energy Manager

ZAEM is an apartment energy management system for monitoring Xiaomi smart power devices, tracking real electricity usage, and managing room-level limits from a responsive web dashboard.

## Stack

- React + TypeScript + Vite
- Node.js + Express + Prisma
- PostgreSQL
- Redis
- Docker Compose

## Features

- Xiaomi smart device login and sync
- Real cumulative energy based statistics
- Europe/Vienna business-time calculation
- Daily limits and automatic power cutoff
- Dashboard, charts, alarms, and operation logs
- Mobile-friendly responsive UI

## Project Structure

- `client/` frontend application
- `server/` backend API and sync logic
- `shared/` shared package
- `deploy/remote/` remote deployment configuration

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Copy the backend env template and fill your own values:

```bash
cp server/.env.example server/.env
```

3. Start development:

```bash
npm run dev
```

Frontend runs on `http://localhost:3000` and backend runs on `http://localhost:3001`.

## Docker

Start the full stack:

```bash
docker compose up -d
```

## Notes

- Do not commit real `.env` files or Xiaomi account credentials.
- Energy statistics are designed around real cumulative meter values instead of local estimated accumulation.
