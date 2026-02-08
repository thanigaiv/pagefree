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

- **Node.js** >= 20
- **PostgreSQL** 16 (or use the provided Docker Compose)
- **Redis** (for background job queues)
- **Okta** account (for authentication) or use break-glass local accounts for development

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd pd

# Install backend dependencies
npm install

# Install frontend dependencies
cd frontend && npm install && cd ..

# Copy environment configuration
cp .env.example .env
# Edit .env with your Okta, AWS, Twilio, and database credentials
```

## Database Setup

```bash
# Start PostgreSQL with Docker (optional)
docker compose up -d

# Push the database schema
npm run db:push

# Generate the Prisma client
npm run db:generate
```

## Running the Application

### Development

```bash
# Start the backend (port 3000)
npm run dev

# In a separate terminal, start the frontend (port 3001)
cd frontend
npm run dev
```

Open `http://localhost:3001` in your browser. The frontend proxies API requests to the backend automatically.

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
├── docker-compose.yml      # PostgreSQL dev setup
└── .env.example            # Environment template
```

## Documentation

- **[User Guide](docs/USER_GUIDE.md)** -- Detailed guide covering all features, workflows, and administration

## License

ISC
