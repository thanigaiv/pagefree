# PageFree

PageFree is an incident management and on-call platform designed to ensure critical alerts reach the right engineer within seconds. It provides end-to-end incident response orchestration -- from alert ingestion and intelligent routing, through multi-channel notifications, to postmortem documentation.

Built as a mobile-first Progressive Web App (PWA), PageFree can be installed on any device and works offline, making it ideal for on-call engineers who need reliable access to incident management tools wherever they are.

## Key Features

- **Incident Management Dashboard** -- Real-time incident tracking with status filtering, priority levels, bulk actions, and expandable detail views
- **Alert Ingestion & Webhooks** -- Receive alerts from monitoring tools like DataDog and New Relic via configurable webhook integrations
- **On-Call Scheduling** -- Manage on-call rotations with calendar sync (Google Calendar, Microsoft Outlook) and schedule overrides
- **Alert Routing & Escalation** -- Route alerts to the right team with escalation policies that ensure no critical alert goes unnoticed
- **Multi-Channel Notifications** -- Deliver alerts via email (AWS SES), SMS (Twilio), push notifications, voice calls, Slack, and Microsoft Teams
- **Workflow Automation** -- Visual workflow builder with drag-and-drop canvas for automating incident response (auto-acknowledge, ticket creation, notifications)
- **Status Pages** -- Public and private status pages to communicate system health to stakeholders and customers
- **Postmortems** -- Document incidents with markdown-based postmortem reports, timelines, and tracked action items
- **External Integrations** -- Connect with Slack, Linear, and other tools for seamless incident response workflows
- **Progressive Web App** -- Installable on mobile and desktop with offline support and push notifications

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, Radix UI / shadcn/ui |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL 16, Prisma ORM |
| Cache / Queue | Redis, BullMQ |
| Real-time | Socket.io |
| Auth | Passport.js (Okta OAuth, local, magic links), SCIM provisioning |
| Notifications | AWS SES, Twilio, Slack, Microsoft Teams |
| PWA | Vite Plugin PWA, Workbox |

## Prerequisites

### Required
- **Node.js** >= 20 - [Download](https://nodejs.org/)
- **Docker** and **Docker Compose** - [Download](https://www.docker.com/get-started) (recommended for PostgreSQL and Redis)
- **PostgreSQL** 16 - Included in Docker Compose or [install locally](https://www.postgresql.org/download/)
- **Redis** 7+ - Included in Docker Compose or [install locally](https://redis.io/download)

### Optional
- **Okta** account - For production authentication (break-glass accounts work for development)
- **AWS SES** - For email notifications
- **Twilio** - For SMS and voice call notifications
- **Slack/Teams** - For chat notifications

## Quick Start (Development)

Get up and running in minutes:

```bash
# Clone the repository
git clone <repository-url> pagefree
cd pagefree

# Install all dependencies
npm install
cd frontend && npm install && cd ..

# Copy environment configuration
cp .env.example .env
# Note: Default .env works for local development with Docker

# Start PostgreSQL and Redis with Docker
docker compose up -d

# Push database schema and generate Prisma client
npm run db:push
npm run db:generate

# Create admin accounts (non-interactive)
npx tsx src/scripts/createAdminNonInteractive.ts

# Start the backend (in one terminal)
npm run dev

# Start the frontend (in another terminal)
cd frontend && npm run dev
```

Visit **http://localhost:3001/auth/emergency** and use the admin credentials displayed during account creation.

## Detailed Installation

### 1. Install Dependencies

```bash
# Clone the repository
git clone <repository-url> pagefree
cd pagefree

# Install backend dependencies
npm install

# Install frontend dependencies
cd frontend && npm install && cd ..
```

### 2. Environment Configuration

```bash
# Copy environment template
cp .env.example .env
```

Edit `.env` with your configuration. For local development, the default values work with Docker Compose:

```env
# Database (default values for Docker Compose)
DATABASE_URL="postgresql://oncall:oncall@localhost:5432/oncall"

# Redis (default for Docker Compose)
REDIS_HOST=localhost
REDIS_PORT=6379

# Session secret (generate a random string)
SESSION_SECRET=your-secret-here

# Optional: Production services
# OKTA_ISSUER=https://your-domain.okta.com
# AWS_SES_REGION=us-east-1
# TWILIO_ACCOUNT_SID=your-sid
```

### 3. Database and Redis Setup

#### Option A: Using Docker (Recommended)

```bash
# Start PostgreSQL and Redis containers
docker compose up -d

# Verify containers are running
docker ps

# You should see:
# - pagefree-postgres (port 5432)
# - pagefree-redis (port 6379)
```

#### Option B: Local Installation

**PostgreSQL:**
```bash
# macOS (via Homebrew)
brew install postgresql@16
brew services start postgresql@16

# Ubuntu/Debian
sudo apt-get install postgresql-16
sudo systemctl start postgresql

# Create database
createdb oncall
createuser -P oncall  # password: oncall
```

**Redis:**
```bash
# macOS (via Homebrew)
brew install redis
brew services start redis

# Ubuntu/Debian
sudo apt-get install redis-server
sudo systemctl start redis-server
```

### 4. Initialize Database

```bash
# Push the database schema to PostgreSQL
npm run db:push

# Generate the Prisma client
npm run db:generate
```

## Creating Admin Accounts

PageFree uses Okta for production authentication, but provides break-glass local admin accounts for development and emergency access.

### Option A: Non-Interactive (Recommended for Development)

Creates multiple admin accounts automatically:

```bash
npx tsx src/scripts/createAdminNonInteractive.ts
```

This creates 2 admin accounts with randomly generated passwords:
- `admin1@pagefree.local`
- `admin2@pagefree.local`

Credentials are displayed in the terminal. Save them securely!

### Option B: Interactive

Create a single admin account with custom details:

```bash
npm run create-breakglass
```

The script will prompt you for:
- **Email** -- Admin email address (e.g., `admin@pagefree.local`)
- **First Name** and **Last Name**
- **Password** -- Choose to generate a random 20-character password, or enter your own (minimum 12 characters)

### Login

All break-glass accounts have the `PLATFORM_ADMIN` role with full access to all features.

**To log in:**
1. Start the application (both backend and frontend)
2. Navigate to **http://localhost:3001/auth/emergency**
3. Enter your break-glass email and password
4. Click "Sign In"

You'll see an emergency login page with:
- Email and password fields
- A warning that all break-glass logins are logged
- A link to use Okta for normal authentication

Upon successful login, you'll be redirected to the incidents dashboard.

> **Security Note:**
> - Store credentials securely (1Password, LastPass, etc.)
> - Passwords cannot be recovered
> - All break-glass logins are logged with HIGH severity
> - Maximum of 3 break-glass accounts is recommended per deployment

## Running the Application

### Development

Start the backend and frontend in separate terminals:

```bash
# Terminal 1: Start the backend (port 3000)
npm run dev

# Terminal 2: Start the frontend (port 3001)
cd frontend
npm run dev
```

Open **http://localhost:3001** in your browser. The frontend proxies API requests to the backend automatically.

**Services:**
- Frontend: http://localhost:3001
- Backend API: http://localhost:3000
- Health Check: http://localhost:3000/health
- Emergency Login: http://localhost:3001/auth/emergency

### Production Build

```bash
# Build backend
npm run build

# Build frontend
cd frontend && npm run build

# Start the server
npm start
```

The frontend production build is output to `frontend/dist/`.

## Running Tests

```bash
# Backend tests
npm test

# Frontend tests
cd frontend && npm test

# Frontend tests with coverage
cd frontend && npm run test:coverage
```

## Project Structure

```
.
├── src/                    # Backend source
│   ├── auth/               # Authentication strategies & SCIM
│   ├── config/             # Database, Redis, environment config
│   ├── middleware/          # Auth, audit, rate limiting
│   ├── routes/             # API route handlers
│   ├── services/           # Business logic
│   ├── workers/            # Background job processors
│   ├── webhooks/           # Webhook receivers
│   └── index.ts            # Express app entry point
├── frontend/               # Frontend source
│   ├── src/
│   │   ├── pages/          # Page components
│   │   ├── components/     # UI components
│   │   ├── hooks/          # Custom React hooks
│   │   ├── lib/            # Utilities & API client
│   │   └── App.tsx         # Router & layout
│   └── index.html
├── prisma/                 # Database schema
├── docker-compose.yml      # PostgreSQL & Redis dev setup
└── .env.example            # Environment template
```

## Troubleshooting

### Redis Connection Errors

If you see Redis reconnection warnings in the backend logs:

```bash
# Check if Redis is running
docker ps | grep redis

# If not running, start it
docker compose up -d redis

# Or install and start Redis locally
brew install redis && brew services start redis  # macOS
```

Without Redis, background jobs (notifications, escalations, workflows) won't process, but the core application will work.

### Database Connection Errors

```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# View PostgreSQL logs
docker logs pagefree-postgres

# Reset database (WARNING: destroys all data)
docker compose down -v
docker compose up -d
npm run db:push
```

### Port Already in Use

If ports 3000, 3001, 5432, or 6379 are already in use:

```bash
# Find process using port
lsof -i :3000  # Replace with the port number

# Kill process
kill -9 <PID>

# Or change ports in .env and vite.config.ts
```

### Module Import Errors

If you encounter module import errors after installation:

```bash
# Regenerate Prisma client
npm run db:generate

# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

cd frontend
rm -rf node_modules package-lock.json
npm install
```

## Documentation

- **[User Guide](docs/USER_GUIDE.md)** -- Detailed guide covering all features, workflows, and administration

## License

ISC
