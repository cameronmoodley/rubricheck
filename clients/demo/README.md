# Demo RubriCheck

Dokploy deployment for RubriCheck.

## Quick Start

```bash
docker network create dokploy-network
cp .env.example .env
# Set DOKPLOY_DOMAIN in .env
docker compose up -d
```

- Frontend: http://localhost:3005
- Backend: http://localhost:8004

## Seed Data

The backend runs `prisma db seed` on startup. Default admin:

- **Email:** admin@rubricheck.com
- **Password:** admin123

Seed file: `backend/prisma/seed.js`
