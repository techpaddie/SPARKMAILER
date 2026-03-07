# SparkMailer

A private, license-based bulk email marketing and SMTP sender platform. Access is strictly controlled using admin-generated license keys. No public registration.

## Tech Stack

- **Backend:** Node.js, TypeScript, Express, PostgreSQL, Prisma, Redis, BullMQ, Nodemailer, Mailgun, Zod, JWT
- **Frontend:** React (Vite), TypeScript, Tailwind CSS, React Query, Zustand
- **Deployment:** Docker, Docker Compose, Nginx

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 16+
- Redis 7+
- Docker (optional)

### Local Development

1. **Clone and install dependencies**

```bash
cd SPARKMAILER
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
```

2. **Configure environment**

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` and set:

- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection (default: `redis://localhost:6379`)
- `JWT_SECRET` - At least 32 characters
- `JWT_REFRESH_SECRET` - At least 32 characters
- `ENCRYPTION_KEY` - 64 hex characters (32 bytes) for AES-256 SMTP credentials

Generate a key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

3. **Database setup**

```bash
cd backend
npx prisma generate
npx prisma migrate dev
```

4. **Create admin user and seed (manual)**

Create an admin via Prisma Studio or SQL:

```sql
INSERT INTO "User" (id, email, "passwordHash", role, status)
VALUES (
  gen_random_uuid(),
  'admin@example.com',
  '$2a$12$...',  -- bcrypt hash of your password
  'ADMIN',
  'ACTIVE'
);
```

Or use Prisma Studio: `npx prisma studio`

5. **Run services**

```bash
# Terminal 1: API
cd backend && npm run dev

# Terminal 2: Worker
cd backend && npm run worker

# Terminal 3: Frontend
cd frontend && npm run dev
```

6. **Access**

- Frontend: http://localhost:5173
- API: http://localhost:4000
- Login with admin credentials

### Docker Deployment

```bash
# Build and run
docker compose up -d

# With nginx (production profile)
docker compose --profile production up -d
```

Set environment variables in `.env`:

```
JWT_SECRET=your-secret
JWT_REFRESH_SECRET=your-refresh-secret
ENCRYPTION_KEY=64-char-hex-string
CORS_ORIGIN=https://your-domain.com
```

Run migrations before first start:

```bash
docker compose run api npx prisma migrate deploy
```

## Project Structure

```
SPARKMAILER/
├── backend/
│   ├── prisma/schema.prisma    # Database schema
│   ├── src/
│   │   ├── config/             # Env, constants
│   │   ├── middleware/         # Auth, license, quota
│   │   ├── modules/            # Auth, admin, campaigns, webhooks
│   │   ├── queue/              # BullMQ email queue
│   │   ├── services/           # License, SMTP rotation
│   │   ├── utils/              # Crypto, Prisma
│   │   ├── workers/            # Email worker
│   │   └── index.ts
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── context/            # Auth store
│   │   ├── layouts/            # Dashboard, Admin
│   │   ├── pages/              # Login, Dashboard, Campaigns
│   │   ├── services/           # API client
│   │   └── main.tsx
│   └── Dockerfile
├── nginx/
├── docker-compose.yml
└── README.md
```

## Features

- **License system:** Admin creates keys; users activate accounts. Quotas, expiry, IP and machine binding.
- **Admin panel:** License management, usage stats, campaign list, SMTP health.
- **Campaigns:** Create, schedule, send via BullMQ worker. SMTP rotation and health scoring.
- **Analytics:** Sent, delivered, opened, clicked, bounced tracking.

## API Endpoints

### Auth (public)
- `POST /api/auth/activate` - Activate account with license key
- `POST /api/auth/login` - Login
- `POST /api/auth/refresh` - Refresh token

### Auth (protected)
- `GET /api/auth/me` - Current user + quota

### Campaigns (protected)
- `GET /api/campaigns` - List campaigns
- `POST /api/campaigns` - Create campaign
- `POST /api/campaigns/:id/start` - Start sending

### Admin (admin only)
- `POST /api/admin/licenses` - Create license
- `GET /api/admin/licenses` - List licenses
- `POST /api/admin/licenses/:id/revoke` - Revoke license
- `GET /api/admin/usage` - Usage statistics
- `GET /api/admin/campaigns` - All campaigns
- `GET /api/admin/smtp-health` - SMTP health
- `POST /api/admin/users/:id/suspend` - Suspend user

### Webhooks
- `POST /webhooks/mailgun/bounce` - Mailgun bounce webhook

## License

Private. All rights reserved.
