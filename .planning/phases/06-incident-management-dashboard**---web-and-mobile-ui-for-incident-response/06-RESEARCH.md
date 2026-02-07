# Phase 6: Incident Management Dashboard - Research

**Researched:** 2026-02-06
**Domain:** React Dashboard + PWA + WebSocket Real-time Updates
**Confidence:** HIGH

## Summary

This phase requires building a complete frontend application from scratch - no frontend infrastructure exists yet. The research focuses on the modern React ecosystem for building a real-time incident management dashboard with mobile PWA support.

The standard approach is **Vite + React + TypeScript** for the build tooling, **Socket.io** for bidirectional WebSocket communication, **shadcn/ui** (Radix UI + Tailwind) for UI components, **TanStack Query** for server state management with real-time sync, **TanStack Virtual** for list virtualization, and **vite-plugin-pwa** with Workbox for Progressive Web App features.

Key decisions from user context are locked: hybrid expandable rows, WebSockets for real-time, pagination (not infinite scroll), optimistic updates, markdown notes, swipe gestures on mobile, and biometric auth support. These constrain our architecture - no exploring alternatives to these choices.

**Primary recommendation:** Use Vite + React 19 + TypeScript + Socket.io-client + shadcn/ui + TanStack Query + vite-plugin-pwa as the core stack. This combination provides type-safe, performant real-time updates with minimal configuration while supporting all required features (WebSockets, PWA, virtualization, markdown).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Dashboard Layout & Information Density:**
- Layout style: Hybrid list with expandable rows (compact rows expand inline to show full details)
- Collapsed row content: Priority, service, description, time, assignee
- High-volume handling: Pagination (10-20 incidents per page) - NOT infinite scroll
- Filtering & sorting: Advanced multi-select filters for status, priority, service, assignee
- Expanded view content: Full timeline embedded inline
- Summary metrics: Yes - count cards at top (X open, Y acked, Z critical)
- Default sort order: Most recent first (newest at top)
- Empty state: Positive message - "All clear! No active incidents"
- URL state: Yes, filters in URL query params (shareable/bookmarkable)
- Keyboard navigation: Basic - arrow keys to navigate, enter to expand
- Bulk actions: Checkbox selection + bulk acknowledge/resolve
- User preferences: Yes, save to user profile (remember filters/sort)

**Real-time Updates & Interactivity:**
- Update mechanism: WebSockets (bidirectional, instant) - NOT polling or SSE
- Acknowledge behavior: Optimistic update (instant, undo if fails)
- Multi-user updates: Update in place with toast notification
- Confirmation dialogs: Confirm resolve/close only (ack is safe)
- Loading states: Skeleton screen (content placeholders)

**Timeline & Incident Details View:**
- Timeline layout: Chronological list (newest first)
- Notes vs events: Yes - different background/icon for user notes
- Long timelines: Show all events (virtualized scrolling)
- Note formatting: Yes - markdown support with preview
- Raw alert payload: Yes, in collapsible "Technical Details" section
- Metadata editing: Yes, inline editing
- External tool links: Yes, quick-links section (DataDog, Grafana, runbook based on metadata.service)

**Mobile PWA Experience:**
- Design approach: Mobile-first (optimize for phone, scale up)
- Push notification tap: Directly to incident detail view (deep link)
- Offline mode: View cached incidents only (read-only)
- Mobile navigation: Bottom nav bar (Incidents, Schedule, Profile)
- PWA install prompt: Yes, prompt after first incident acknowledgment
- Mobile navigation flow: Full-screen transitions (list → detail)
- Gesture controls: Yes - swipe right to ack, left for options
- Biometric authentication: Yes, optional biometric unlock

### Claude's Discretion

Research options and make recommendations for:
- View modes (single unified vs tabs) - choose what makes most sense for UX
- Visual priority/severity design (color coding, icons) - effective visual system
- Quick-action hover buttons vs expand-to-act - balance speed vs safety
- New incident appearance animation - balance visibility vs distraction
- WebSocket disconnection handling - resilient connection with auto-reconnect or fallback
- Note-adding UI (inline vs modal) - best note-taking UX
- Timeline event detail level - balance completeness vs readability

### Deferred Ideas (OUT OF SCOPE)

None - discussion stayed within phase scope

</user_constraints>

## Standard Stack

The established libraries/tools for React real-time dashboards with PWA support:

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| **Vite** | 6.x (latest) | Build tool & dev server | Industry standard for React - fast HMR, native ES modules, optimized production builds. Requires Node.js 20.19+ or 22.12+ |
| **React** | 19.x (latest) | UI framework | Latest stable version with improved TypeScript support and performance |
| **TypeScript** | 5.3+ | Type safety | Already used in backend (package.json), ensures type safety across stack |
| **React Router** | v7 (latest) | Client-side routing | Current version with non-breaking upgrade path, type-safe routes, URL state management |
| **Socket.io-client** | 4.x | WebSocket real-time | Industry standard for bidirectional real-time, 10.4kB gzipped, built-in reconnection, type-safe events |
| **TanStack Query** | v5 (latest) | Server state management | Best-in-class for managing server data with real-time sync, automatic refetching, optimistic updates |
| **shadcn/ui** | Latest | UI component library | Modern, accessible, customizable components built on Radix UI + Tailwind CSS. Copy-paste approach gives full control |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **TanStack Virtual** | v3 (latest) | List virtualization | For timeline views with 50+ events - maintains 60fps with large lists |
| **react-markdown** | Latest | Markdown rendering | For incident notes - safe by default, no XSS, plugin ecosystem for extensions |
| **react-hook-form** | Latest | Form management | For note-adding, metadata editing - minimal re-renders, native HTML validation |
| **Sonner** | Latest | Toast notifications | For multi-user update alerts - opinionated, minimal setup, rich positioning options |
| **query-string** | Latest | URL query param handling | For URL state management (filters, sort) - handles arrays, objects, encoding |
| **vite-plugin-pwa** | Latest | PWA features | Zero-config PWA with Workbox integration - service workers, manifest, offline support |
| **Workbox** | v7 | Service worker utilities | For PWA caching strategies - production-ready SW libraries from Chrome team |
| **Radix UI** | Latest | Headless UI primitives | Foundation for shadcn/ui - accessible, keyboard navigable components |
| **Tailwind CSS** | v3+ | Utility-first CSS | Required by shadcn/ui - rapid styling, design system support |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Socket.io | Native WebSocket API | Socket.io provides reconnection, fallback transports, room support - don't use raw WebSocket |
| TanStack Query | SWR or Redux Toolkit Query | TanStack Query has better TypeScript, more features for real-time (optimistic updates, invalidation) |
| shadcn/ui | Material UI (MUI) or Ant Design | shadcn/ui gives full source control (copy-paste), modern design, smaller bundle |
| Vite | Create React App (CRA) | CRA is deprecated/unmaintained - Vite is current standard |
| React Router | Tanstack Router | React Router v7 is more mature, larger ecosystem, type-safe since v7 |

**Installation:**
```bash
# Create Vite project with React + TypeScript template
npm create vite@latest frontend -- --template react-ts

cd frontend

# Core dependencies
npm install react-router-dom socket.io-client @tanstack/react-query @tanstack/react-virtual react-markdown react-hook-form

# UI components (shadcn/ui requires separate init)
npx shadcn@latest init
# Follow prompts - select Tailwind CSS, configure components.json

# Toast notifications
npm install sonner

# URL state management
npm install query-string

# PWA support
npm install -D vite-plugin-pwa workbox-window

# Development types
npm install -D @types/node
```

## Architecture Patterns

### Recommended Project Structure

```
frontend/
├── public/                     # Static assets
│   ├── manifest.json          # PWA manifest
│   ├── icons/                 # PWA icons (multiple sizes)
│   └── sw.js                  # Service worker (generated by vite-plugin-pwa)
├── src/
│   ├── main.tsx               # App entry point
│   ├── App.tsx                # Root component with Router
│   ├── components/            # Reusable UI components
│   │   ├── ui/               # shadcn/ui components (auto-generated)
│   │   ├── IncidentList.tsx  # Main dashboard list
│   │   ├── IncidentRow.tsx   # Expandable row component
│   │   ├── IncidentTimeline.tsx  # Timeline with virtualization
│   │   ├── IncidentFilters.tsx   # Multi-select filter UI
│   │   ├── MarkdownEditor.tsx    # Note editor with preview
│   │   └── MetricsSummary.tsx    # Count cards at top
│   ├── pages/                # Route-level components
│   │   ├── DashboardPage.tsx
│   │   ├── IncidentDetailPage.tsx
│   │   └── ProfilePage.tsx
│   ├── hooks/                # Custom React hooks
│   │   ├── useWebSocket.ts   # Socket.io connection hook
│   │   ├── useIncidents.ts   # TanStack Query hooks for incidents
│   │   ├── useUrlState.ts    # URL query param sync
│   │   ├── useSwipeGesture.ts    # Mobile swipe detection
│   │   └── useOptimisticUpdate.ts # Optimistic UI pattern
│   ├── lib/                  # Utilities
│   │   ├── api.ts           # API client (fetch wrapper)
│   │   ├── socket.ts        # Socket.io client instance
│   │   ├── queryClient.ts   # TanStack Query configuration
│   │   └── pwa.ts           # PWA utilities (install prompt, registration)
│   ├── types/               # TypeScript types
│   │   ├── incident.ts      # Incident domain types
│   │   ├── socket.ts        # Socket.io event types
│   │   └── api.ts           # API response types
│   └── styles/              # Global styles
│       └── globals.css      # Tailwind imports, custom CSS
├── vite.config.ts           # Vite configuration with PWA plugin
├── tailwind.config.js       # Tailwind configuration
├── components.json          # shadcn/ui configuration
├── tsconfig.json            # TypeScript configuration
└── package.json
```

### Pattern 1: WebSocket Connection Management with React

**What:** Create a singleton Socket.io client that connects once, handles reconnection, and syncs with TanStack Query.

**When to use:** For real-time incident updates pushed from server.

**Example:**
```typescript
// src/lib/socket.ts
// Source: Socket.io v4 official docs + React patterns
import { io, Socket } from 'socket.io-client';

interface ServerToClientEvents {
  'incident:created': (incident: Incident) => void;
  'incident:updated': (incident: Incident) => void;
  'incident:acknowledged': (data: { incidentId: string; userId: string; user: User }) => void;
  'incident:resolved': (data: { incidentId: string; userId: string; user: User }) => void;
}

interface ClientToServerEvents {
  'subscribe:incidents': (filters: { teamId?: string }) => void;
  'unsubscribe:incidents': () => void;
}

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
  import.meta.env.VITE_API_URL || 'http://localhost:3000',
  {
    autoConnect: false, // Connect manually after auth
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity,
    auth: (cb) => {
      // Auth callback - send token from storage
      const token = localStorage.getItem('auth_token');
      cb({ token });
    }
  }
);

// src/hooks/useWebSocket.ts
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { socket } from '../lib/socket';
import { toast } from 'sonner';

export function useWebSocket() {
  const queryClient = useQueryClient();

  useEffect(() => {
    socket.connect();

    // Connection state handlers
    socket.on('connect', () => {
      console.log('WebSocket connected');
      // Subscribe to incident updates for user's teams
      socket.emit('subscribe:incidents', { teamId: undefined }); // All teams
    });

    socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      if (reason === 'io server disconnect') {
        // Server disconnected, manually reconnect
        socket.connect();
      }
    });

    socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      toast.error('Connection lost. Reconnecting...');
    });

    // Real-time incident updates
    socket.on('incident:created', (incident) => {
      // Add to query cache
      queryClient.setQueryData(['incidents'], (old: any) => {
        return {
          ...old,
          items: [incident, ...(old?.items || [])]
        };
      });
      toast.info(`New incident: ${incident.fingerprint}`);
    });

    socket.on('incident:updated', (incident) => {
      // Update in cache
      queryClient.setQueryData(['incidents', incident.id], incident);
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
    });

    socket.on('incident:acknowledged', ({ incidentId, user }) => {
      queryClient.invalidateQueries({ queryKey: ['incidents', incidentId] });
      toast.success(`${user.name} acknowledged incident`);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
      socket.off('incident:created');
      socket.off('incident:updated');
      socket.off('incident:acknowledged');
      socket.disconnect();
    };
  }, [queryClient]);
}
```

### Pattern 2: Optimistic Updates with Rollback

**What:** Update UI immediately on user action, then rollback if server rejects.

**When to use:** For acknowledge action (user decision: optimistic updates for fast feedback).

**Example:**
```typescript
// src/hooks/useIncidents.ts
// Source: TanStack Query optimistic updates pattern
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export function useAcknowledgeIncident() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ incidentId, note }: { incidentId: string; note?: string }) => {
      const response = await fetch(`/api/incidents/${incidentId}/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      return response.json();
    },
    onMutate: async ({ incidentId }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['incidents', incidentId] });

      // Snapshot previous value
      const previous = queryClient.getQueryData(['incidents', incidentId]);

      // Optimistically update
      queryClient.setQueryData(['incidents', incidentId], (old: any) => ({
        ...old,
        status: 'ACKNOWLEDGED',
        acknowledgedAt: new Date().toISOString()
      }));

      toast.success('Incident acknowledged');

      // Return context for rollback
      return { previous, incidentId };
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context?.previous) {
        queryClient.setQueryData(['incidents', context.incidentId], context.previous);
      }
      toast.error(`Failed to acknowledge: ${error.message}`);
    },
    onSettled: (data, error, variables) => {
      // Refetch to sync with server
      queryClient.invalidateQueries({ queryKey: ['incidents', variables.incidentId] });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
    }
  });
}
```

### Pattern 3: URL State Synchronization

**What:** Sync filters/sort state with URL query params for shareable links.

**When to use:** For all dashboard filters (user decision: URL state for shareable/bookmarkable searches).

**Example:**
```typescript
// src/hooks/useUrlState.ts
// Source: React Router v7 + query-string library
import { useSearchParams } from 'react-router-dom';
import { useMemo, useCallback } from 'react';
import queryString from 'query-string';

interface IncidentFilters {
  status?: string[];
  priority?: string[];
  service?: string[];
  assignee?: string[];
  sort?: string;
}

export function useUrlState() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo<IncidentFilters>(() => {
    return {
      status: searchParams.getAll('status'),
      priority: searchParams.getAll('priority'),
      service: searchParams.getAll('service'),
      assignee: searchParams.getAll('assignee'),
      sort: searchParams.get('sort') || 'newest'
    };
  }, [searchParams]);

  const updateFilters = useCallback((newFilters: Partial<IncidentFilters>) => {
    const merged = { ...filters, ...newFilters };

    // Remove empty arrays
    const cleaned = Object.fromEntries(
      Object.entries(merged).filter(([_, v]) =>
        Array.isArray(v) ? v.length > 0 : v !== undefined
      )
    );

    setSearchParams(queryString.stringify(cleaned, { arrayFormat: 'bracket' }));
  }, [filters, setSearchParams]);

  return { filters, updateFilters };
}
```

### Pattern 4: List Virtualization for Long Timelines

**What:** Render only visible timeline events using TanStack Virtual.

**When to use:** For incident timelines with 50+ events (user decision: show all events with virtualized scrolling).

**Example:**
```typescript
// src/components/IncidentTimeline.tsx
// Source: TanStack Virtual official docs
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';

interface TimelineEvent {
  id: string;
  type: 'note' | 'status_change' | 'assignment';
  timestamp: string;
  user?: User;
  content: string;
}

export function IncidentTimeline({ events }: { events: TimelineEvent[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: events.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80, // Estimated row height
    overscan: 5 // Render 5 extra items above/below viewport
  });

  return (
    <div ref={parentRef} className="h-[500px] overflow-auto">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative'
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const event = events[virtualRow.index];

          return (
            <div
              key={virtualRow.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`
              }}
            >
              <TimelineEventCard event={event} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

### Pattern 5: PWA Setup with Vite Plugin

**What:** Configure vite-plugin-pwa for service worker, manifest, offline support.

**When to use:** For Progressive Web App features (user decisions: offline view cached, install prompt, push notifications).

**Example:**
```typescript
// vite.config.ts
// Source: vite-plugin-pwa official docs
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt', 'icons/*.png'],
      manifest: {
        name: 'OnCall Platform',
        short_name: 'OnCall',
        description: 'Incident Management Dashboard',
        theme_color: '#000000',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ],
        display: 'standalone',
        start_url: '/',
        scope: '/'
      },
      workbox: {
        // Cache API responses for offline
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.oncall\.example\.com\/api\/incidents/,
            handler: 'NetworkFirst', // Try network, fallback to cache
            options: {
              cacheName: 'incidents-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 5 * 60 // 5 minutes
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      },
      devOptions: {
        enabled: true // Enable in dev for testing
      }
    })
  ]
});
```

### Pattern 6: Mobile Swipe Gestures

**What:** Implement Gmail-style swipe gestures for mobile (user decision: swipe right to ack, left for options).

**When to use:** On mobile devices for fast triage actions.

**Example:**
```typescript
// src/hooks/useSwipeGesture.ts
import { useRef, useState } from 'react';

interface SwipeHandlers {
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
}

export function useSwipeGesture(handlers: SwipeHandlers) {
  const touchStart = useRef<number | null>(null);
  const touchEnd = useRef<number | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);

  const minSwipeDistance = 80; // Minimum swipe distance
  const previewThreshold = 30; // Show preview after 30px

  const onTouchStart = (e: React.TouchEvent) => {
    touchEnd.current = null;
    touchStart.current = e.targetTouches[0].clientX;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    touchEnd.current = e.targetTouches[0].clientX;

    if (touchStart.current !== null && touchEnd.current !== null) {
      const distance = touchEnd.current - touchStart.current;
      // Clamp offset for preview
      setSwipeOffset(Math.max(-100, Math.min(100, distance)));
    }
  };

  const onTouchEnd = () => {
    if (!touchStart.current || !touchEnd.current) return;

    const distance = touchEnd.current - touchStart.current;

    if (distance > minSwipeDistance && handlers.onSwipeRight) {
      handlers.onSwipeRight();
    } else if (distance < -minSwipeDistance && handlers.onSwipeLeft) {
      handlers.onSwipeLeft();
    }

    // Reset
    setSwipeOffset(0);
    touchStart.current = null;
    touchEnd.current = null;
  };

  return {
    swipeHandlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd
    },
    swipeOffset, // Use for visual feedback
    isSwipingRight: swipeOffset > previewThreshold,
    isSwipingLeft: swipeOffset < -previewThreshold
  };
}
```

### Pattern 7: Biometric Authentication with WebAuthn

**What:** Optional biometric unlock after first login using Web Authentication API.

**When to use:** For quick PWA access on mobile (user decision: optional biometric unlock).

**Example:**
```typescript
// src/lib/webauthn.ts
// Source: MDN Web Authentication API docs

export async function registerBiometric(userId: string, userName: string) {
  // Check if WebAuthn is supported
  if (!window.PublicKeyCredential) {
    throw new Error('WebAuthn not supported');
  }

  // Get challenge from server
  const challengeResponse = await fetch('/api/auth/webauthn/register-challenge', {
    method: 'POST',
    credentials: 'include'
  });
  const { challenge, rpId, rpName } = await challengeResponse.json();

  // Create credential
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: Uint8Array.from(atob(challenge), c => c.charCodeAt(0)),
      rp: { id: rpId, name: rpName },
      user: {
        id: Uint8Array.from(userId, c => c.charCodeAt(0)),
        name: userName,
        displayName: userName
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },  // ES256
        { alg: -257, type: 'public-key' } // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform', // Built-in (Face ID, Touch ID)
        userVerification: 'preferred'
      },
      timeout: 60000
    }
  }) as PublicKeyCredential;

  // Send to server for storage
  await fetch('/api/auth/webauthn/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      credential: {
        id: credential.id,
        rawId: btoa(String.fromCharCode(...new Uint8Array(credential.rawId))),
        response: {
          attestationObject: btoa(String.fromCharCode(...new Uint8Array(
            (credential.response as AuthenticatorAttestationResponse).attestationObject
          ))),
          clientDataJSON: btoa(String.fromCharCode(...new Uint8Array(
            credential.response.clientDataJSON
          )))
        },
        type: credential.type
      }
    }),
    credentials: 'include'
  });
}

export async function authenticateBiometric(): Promise<boolean> {
  if (!window.PublicKeyCredential) {
    return false;
  }

  try {
    // Get challenge from server
    const challengeResponse = await fetch('/api/auth/webauthn/login-challenge', {
      credentials: 'include'
    });
    const { challenge, rpId } = await challengeResponse.json();

    // Get credential
    const credential = await navigator.credentials.get({
      publicKey: {
        challenge: Uint8Array.from(atob(challenge), c => c.charCodeAt(0)),
        rpId,
        timeout: 60000,
        userVerification: 'preferred'
      }
    }) as PublicKeyCredential;

    // Verify with server
    const response = await fetch('/api/auth/webauthn/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        credential: {
          id: credential.id,
          rawId: btoa(String.fromCharCode(...new Uint8Array(credential.rawId))),
          response: {
            authenticatorData: btoa(String.fromCharCode(...new Uint8Array(
              (credential.response as AuthenticatorAssertionResponse).authenticatorData
            ))),
            clientDataJSON: btoa(String.fromCharCode(...new Uint8Array(
              credential.response.clientDataJSON
            ))),
            signature: btoa(String.fromCharCode(...new Uint8Array(
              (credential.response as AuthenticatorAssertionResponse).signature
            )))
          },
          type: credential.type
        }
      }),
      credentials: 'include'
    });

    return response.ok;
  } catch (error) {
    console.error('Biometric auth failed:', error);
    return false;
  }
}
```

### Anti-Patterns to Avoid

- **Polling instead of WebSockets:** User decided WebSockets - don't use polling or SSE
- **Infinite scroll:** User decided pagination - don't implement infinite scroll
- **Rendering all timeline events without virtualization:** Will cause performance issues with 50+ events
- **Using dangerouslySetInnerHTML for markdown:** react-markdown is safe by default - don't use innerHTML
- **Manual reconnection logic:** Socket.io has built-in reconnection - don't reinvent
- **Global state for server data:** Use TanStack Query for server state, not Redux/Zustand
- **Mixing client and server state:** Keep server data in TanStack Query, UI state (expanded rows) in React state

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WebSocket reconnection logic | Custom reconnect with backoff | Socket.io built-in reconnection | Handles edge cases (server restarts, network switches, exponential backoff, randomization to prevent thundering herd) |
| List virtualization | Custom windowing with IntersectionObserver | TanStack Virtual | Handles dynamic heights, scroll restoration, overscan, resize events, 60fps rendering |
| Optimistic updates with rollback | Manual cache manipulation | TanStack Query mutations with onMutate/onError | Manages snapshot, rollback, race conditions, concurrent mutations |
| PWA service worker | Raw service worker API | Workbox via vite-plugin-pwa | Handles cache strategies, precaching, runtime caching, update lifecycle, version management |
| URL query param sync | Manual URLSearchParams parsing | query-string + React Router | Handles encoding, arrays, nested objects, type coercion, edge cases |
| Markdown rendering | Custom parser + sanitizer | react-markdown | XSS prevention, safe URL protocols, AST-based rendering, plugin ecosystem |
| Form validation | Manual field validation | react-hook-form + Zod | Re-render optimization, field-level validation, schema integration, accessibility |
| WebAuthn implementation | Raw Credential Management API | Consider @simplewebauthn/browser | Type-safe wrappers, Base64 encoding helpers, attestation/assertion formatting (but vanilla API is viable for basic use) |

**Key insight:** Real-time dashboards have many subtle race conditions and edge cases. User actions can conflict with server updates, network interruptions require careful state reconciliation, and WebSocket reconnection during mutations needs rollback logic. Use battle-tested libraries that handle these scenarios rather than building custom solutions.

## Common Pitfalls

### Pitfall 1: WebSocket Memory Leaks from Event Listeners

**What goes wrong:** Socket event listeners accumulate on component re-renders, causing duplicate toast notifications and multiple cache updates.

**Why it happens:** React's useEffect runs on every render unless dependencies are stable. Each render adds new Socket.io event listeners without removing old ones.

**How to avoid:**
- Use cleanup function in useEffect to remove listeners
- Keep socket instance as singleton outside React (not in state)
- Don't recreate event handlers on every render - use useCallback if needed

**Warning signs:**
- Multiple toast notifications for same event
- Query cache updates happening multiple times
- Memory usage growing over time
- "Too many listeners" console warnings

### Pitfall 2: Stale Closures in Socket Event Handlers

**What goes wrong:** Socket event handlers reference old state/props values because they were created with stale closure.

**Why it happens:** Socket event handlers are registered once in useEffect, but capture variables from that render. When state updates, handlers still reference old values.

**How to avoid:**
- Don't use state/props directly in socket handlers
- Use queryClient.setQueryData with updater function: `(old) => newValue`
- For actions, emit events instead of calling state setters
- Use refs for values that need to be current

**Warning signs:**
- Updates not reflected in UI even though event fires
- Incorrect data used in socket handlers
- State resets to old values after socket event

### Pitfall 3: Race Conditions Between Optimistic Updates and WebSocket Events

**What goes wrong:** User acknowledges incident (optimistic update), then WebSocket event arrives with different state, causing UI flicker or incorrect state.

**Why it happens:** WebSocket events don't know about optimistic updates. Event arrives while mutation is in-flight, overwriting optimistic state.

**How to avoid:**
- Use mutation timestamps or IDs to track in-flight operations
- Ignore WebSocket events for entities with pending mutations
- Use TanStack Query's `onSettled` to clear tracking after server confirms
- Consider adding `clientMutationId` to requests, echo in WebSocket events

**Warning signs:**
- UI flickers after user action
- Acknowledged incident briefly shows as "OPEN" again
- Actions appear to fail then succeed
- Duplicate timeline events

### Pitfall 4: PWA Cache Serving Stale Data After Updates

**What goes wrong:** User sees old incident data because service worker serves cached responses even though server data changed.

**Why it happens:** Workbox caching strategies can serve cache-first or network-first, but with long max-age. Incidents are mutable, but cache doesn't invalidate on change.

**How to avoid:**
- Use NetworkFirst strategy for API routes (try network, fallback to cache)
- Set short maxAgeSeconds (5 minutes) for incident data
- Show "offline" indicator when serving from cache
- Implement cache invalidation on app activation/focus

**Warning signs:**
- Users see resolved incidents as open
- Changes made on desktop don't appear on mobile
- "Cached data may be stale" warnings don't appear
- Offline indicator doesn't show when actually offline

### Pitfall 5: Pagination Cursor Invalidation After Real-time Updates

**What goes wrong:** User is on page 2, new incident arrives via WebSocket, pagination cursors become invalid or skip items.

**Why it happens:** Cursor-based pagination assumes stable dataset. When items are added/removed, cursors point to wrong positions.

**How to avoid:**
- Invalidate entire incidents list query when WebSocket event arrives
- Use offset pagination for dashboards (simpler but less efficient for large datasets)
- Or: Accept that real-time updates only affect first page, require manual refresh for deep pages
- Show "New incidents available" banner instead of auto-updating deep pages

**Warning signs:**
- Duplicate incidents appear after pagination
- Gaps in incident list after page load
- Page 2 shows incidents that were on page 1
- Cursor errors from API

### Pitfall 6: Mobile Swipe Gestures Conflicting with Scroll

**What goes wrong:** User tries to scroll list vertically, but horizontal swipe gesture activates, causing accidental acknowledgments.

**Why it happens:** Touch events don't distinguish between horizontal and vertical intent. Gesture detection activates on any touch move.

**How to avoid:**
- Calculate swipe angle - only trigger on mostly-horizontal swipes (> 30° from vertical)
- Require minimum horizontal distance before preview shows
- Use CSS `touch-action: pan-y` to prioritize vertical scroll
- Add visual confirmation (preview state) before committing action

**Warning signs:**
- Users complain of accidental acknowledgments
- Scrolling feels "sticky" or unresponsive
- Swipe actions trigger while trying to scroll
- Can't scroll list on mobile

### Pitfall 7: TypeScript Types Diverging from Backend

**What goes wrong:** Frontend types for Incident, Alert, etc. don't match backend Prisma schema, causing runtime errors.

**Why it happens:** Frontend and backend types are maintained separately. Backend schema changes don't automatically update frontend types.

**How to avoid:**
- Generate TypeScript types from Prisma schema using prisma-client generator
- Share types package between frontend and backend (monorepo or npm package)
- Or: Use OpenAPI/GraphQL to generate client types from backend schema
- Add integration test that validates API response shape

**Warning signs:**
- Runtime errors accessing fields that "should exist"
- Optional fields treated as required (or vice versa)
- Date strings not parsed correctly
- Enum values don't match backend

### Pitfall 8: Deep Linking to Incidents Fails in PWA

**What goes wrong:** User taps push notification, PWA opens but shows blank screen or dashboard instead of incident detail.

**Why it happens:** PWA navigation doesn't handle deep links correctly. Service worker intercepts navigation but doesn't route properly.

**How to avoid:**
- Configure PWA `start_url` and `scope` correctly
- Handle notification click in service worker with `clients.openWindow(url)`
- Use React Router's path-based routing (not hash routing)
- Test notification taps with Chrome DevTools → Application → Service Workers

**Warning signs:**
- Notification taps always open dashboard
- Deep links work in browser but not PWA
- URL changes but component doesn't render
- Console errors about navigation handling

## Code Examples

Verified patterns from official sources:

### Socket.io Type-Safe Event Definitions

```typescript
// Source: Socket.io v4 TypeScript documentation
// Defines all events exchanged between client and server

interface ServerToClientEvents {
  // Incident lifecycle events
  'incident:created': (incident: Incident) => void;
  'incident:updated': (incident: Incident) => void;
  'incident:acknowledged': (data: {
    incidentId: string;
    userId: string;
    user: { id: string; name: string; email: string };
    acknowledgedAt: string;
  }) => void;
  'incident:resolved': (data: {
    incidentId: string;
    userId: string;
    user: { id: string; name: string; email: string };
    resolvedAt: string;
    resolutionNote?: string;
  }) => void;
  'incident:reassigned': (data: {
    incidentId: string;
    fromUserId: string | null;
    toUserId: string;
    toUser: { id: string; name: string };
    reason?: string;
  }) => void;

  // Timeline events
  'incident:note_added': (data: {
    incidentId: string;
    note: {
      id: string;
      content: string;
      userId: string;
      user: { name: string };
      createdAt: string;
    };
  }) => void;

  // Connection events
  'authenticated': () => void;
  'auth_error': (message: string) => void;
}

interface ClientToServerEvents {
  // Subscription management
  'subscribe:incidents': (filters: {
    teamId?: string;
    status?: string[];
  }) => void;
  'unsubscribe:incidents': () => void;

  // Heartbeat
  'ping': () => void;
}

// Usage in client code
const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(url);

// Type-safe emit and on
socket.emit('subscribe:incidents', { teamId: 'team123' }); // OK
socket.emit('subscribe:incidents', { invalid: true }); // TypeScript error

socket.on('incident:acknowledged', (data) => {
  // data.incidentId is string (type-safe)
  // data.user.name is string (type-safe)
});
```

### TanStack Query Infinite Queries for Pagination

```typescript
// Source: TanStack Query v5 documentation
// Note: User decided standard pagination (not infinite), but this pattern
// is useful if we need cursor-based pagination for mobile "load more"

import { useInfiniteQuery } from '@tanstack/react-query';

interface IncidentListResponse {
  items: Incident[];
  nextCursor?: string;
  hasMore: boolean;
}

export function useIncidentsPaginated(filters: IncidentFilters) {
  return useInfiniteQuery({
    queryKey: ['incidents', 'paginated', filters],
    queryFn: async ({ pageParam = undefined }) => {
      const params = new URLSearchParams({
        ...filters,
        cursor: pageParam || '',
        limit: '20'
      });

      const response = await fetch(`/api/incidents?${params}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to fetch incidents');
      }

      return response.json() as Promise<IncidentListResponse>;
    },
    getNextPageParam: (lastPage) => {
      return lastPage.hasMore ? lastPage.nextCursor : undefined;
    },
    initialPageParam: undefined,
    refetchInterval: false, // Use WebSocket for updates
    staleTime: 30 * 1000 // Consider stale after 30s
  });
}

// Usage in component
function IncidentList() {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = useIncidentsPaginated({ status: ['OPEN', 'ACKNOWLEDGED'] });

  const allIncidents = data?.pages.flatMap(page => page.items) ?? [];

  return (
    <div>
      {allIncidents.map(incident => (
        <IncidentRow key={incident.id} incident={incident} />
      ))}

      {hasNextPage && (
        <button
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
        >
          {isFetchingNextPage ? 'Loading...' : 'Load More'}
        </button>
      )}
    </div>
  );
}
```

### PWA Install Prompt at Right Time

```typescript
// Source: web.dev PWA patterns + user decision (prompt after first acknowledgment)

let deferredPrompt: BeforeInstallPromptEvent | null = null;

// Capture the install prompt event
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e as BeforeInstallPromptEvent;
  console.log('Install prompt ready');
});

// Show prompt after user's first incident acknowledgment
export async function promptPWAInstall(): Promise<boolean> {
  if (!deferredPrompt) {
    console.log('Install prompt not available');
    return false;
  }

  // Show the install prompt
  deferredPrompt.prompt();

  // Wait for user response
  const { outcome } = await deferredPrompt.userChoice;

  console.log(`User ${outcome} the install prompt`);

  // Clear the deferred prompt
  deferredPrompt = null;

  return outcome === 'accepted';
}

// Usage in component after acknowledge mutation succeeds
function useAcknowledgeWithPrompt() {
  const acknowledgeMutation = useAcknowledgeIncident();
  const hasShownPrompt = useRef(false);

  const acknowledge = async (incidentId: string, note?: string) => {
    const result = await acknowledgeMutation.mutateAsync({ incidentId, note });

    // After first acknowledgment, show install prompt (if available)
    if (!hasShownPrompt.current) {
      hasShownPrompt.current = true;

      setTimeout(async () => {
        const installed = await promptPWAInstall();
        if (installed) {
          toast.success('App installed! Access from home screen.');
        }
      }, 1000); // Delay 1s so user sees acknowledgment success first
    }

    return result;
  };

  return { acknowledge, isLoading: acknowledgeMutation.isPending };
}
```

### Markdown Editor with Preview

```typescript
// Source: react-markdown documentation + react-hook-form

import ReactMarkdown from 'react-markdown';
import { useState } from 'react';
import { useFormContext } from 'react-hook-form';

export function MarkdownEditor({ name }: { name: string }) {
  const { register, watch } = useFormContext();
  const [showPreview, setShowPreview] = useState(false);
  const content = watch(name);

  return (
    <div className="border rounded-lg">
      {/* Tabs */}
      <div className="flex border-b">
        <button
          type="button"
          onClick={() => setShowPreview(false)}
          className={`px-4 py-2 ${!showPreview ? 'border-b-2 border-blue-500' : ''}`}
        >
          Write
        </button>
        <button
          type="button"
          onClick={() => setShowPreview(true)}
          className={`px-4 py-2 ${showPreview ? 'border-b-2 border-blue-500' : ''}`}
        >
          Preview
        </button>
      </div>

      {/* Content */}
      {showPreview ? (
        <div className="p-4 prose prose-sm max-w-none">
          <ReactMarkdown
            allowedElements={[
              'p', 'br', 'strong', 'em', 'u', 'code', 'pre',
              'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
              'ul', 'ol', 'li', 'blockquote', 'a'
            ]}
            // Restrict URLs to safe protocols
            urlTransform={(url) => {
              if (url.startsWith('http://') || url.startsWith('https://')) {
                return url;
              }
              return '#'; // Invalid URLs become no-op
            }}
          >
            {content || '_No content_'}
          </ReactMarkdown>
        </div>
      ) : (
        <textarea
          {...register(name)}
          className="w-full p-4 min-h-[200px] resize-y font-mono text-sm"
          placeholder="Enter note in Markdown format..."
        />
      )}

      {/* Help text */}
      {!showPreview && (
        <div className="px-4 py-2 text-xs text-gray-600 bg-gray-50 border-t">
          Supports: **bold**, *italic*, `code`, [links](url), lists, headers
        </div>
      )}
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Create React App (CRA) | Vite | 2023-2024 | CRA no longer maintained. Vite is 10-20x faster dev server, better tree-shaking |
| Redux for all state | TanStack Query for server state, React Context for UI state | 2020-2022 | Separation of concerns. Server state has different lifecycle (caching, refetching) than UI state |
| CSS-in-JS (styled-components, emotion) | Tailwind CSS utility-first | 2021-2023 | Better performance (no runtime), smaller bundles, faster development |
| Raw WebSocket API | Socket.io or similar wrapper | Always preferred | Reconnection, fallback transports, room support built-in |
| Manual service workers | Workbox | 2018-2020 | Service worker complexity high. Workbox provides battle-tested patterns |
| Component libraries as npm packages (MUI, Ant Design) | Copy-paste components (shadcn/ui) | 2023-2024 | Full source control, no version lock-in, smaller bundles (only include what you use) |
| React Router v5 (Switch, Route render props) | React Router v6/v7 (Routes, element prop) | 2021-2022 | Cleaner API, better TypeScript support, type-safe params in v7 |
| Class components with lifecycle methods | Function components with Hooks | 2019-2020 | Simpler code, better composition, easier testing |

**Deprecated/outdated:**
- **Create React App (CRA):** No longer maintained. Use Vite or framework (Next.js, Remix)
- **React Router v5 API:** Use v7 with new API (Routes instead of Switch, element instead of component/render)
- **styled-components/emotion for new projects:** Tailwind CSS is current standard for styling
- **Redux for server state:** Use TanStack Query. Redux is still valid for complex client state, but overkill for most apps
- **Service Worker without Workbox:** Too complex to hand-roll. Use Workbox or vite-plugin-pwa

## Open Questions

Things that couldn't be fully resolved:

1. **Backend WebSocket Implementation**
   - What we know: User decided bidirectional WebSockets, Socket.io-client is frontend standard
   - What's unclear: Does backend need Socket.io server library, or can it use raw WebSocket API with custom protocol?
   - Recommendation: Use Socket.io server (npm install socket.io) for consistency with client. It provides room support for team-based subscriptions, automatic JSON serialization, and reconnection handling. Research Socket.io server setup in Phase 6 planning.

2. **Push Notification Backend Integration**
   - What we know: Phase 5 implemented AWS SNS for push notifications. Web Push API requires service worker.
   - What's unclear: How does frontend receive push notification credentials (VAPID keys) and register subscription with backend? What's the API contract?
   - Recommendation: Add endpoints POST /api/mobile/push/subscribe (for storing PushSubscription from browser) and GET /api/mobile/push/vapid-public-key. Service worker listens for 'push' events, backend sends via AWS SNS. Coordinate with Phase 5 implementation.

3. **Type Sharing Between Frontend and Backend**
   - What we know: Backend uses TypeScript + Prisma. Frontend needs matching types.
   - What's unclear: Should we generate types from Prisma schema, or manually maintain frontend types?
   - Recommendation: Manual types initially (copy from Prisma schema), then consider prisma-client-js or ts-proto for type generation in future iteration. Don't over-engineer type sharing for Phase 6.

4. **Mobile Navigation "Schedule" and "Profile" Pages**
   - What we know: User decided bottom nav bar with Incidents, Schedule, Profile
   - What's unclear: Phase 6 scope is incident management. Are Schedule and Profile in scope, or just placeholder links?
   - Recommendation: Implement Incidents page fully. Add placeholder pages for Schedule (link to schedule routes from backend) and Profile (basic user info display). Don't build full schedule management in Phase 6 unless explicitly required.

5. **Authentication Flow for Frontend**
   - What we know: Backend has Okta SSO + session middleware. Frontend needs to authenticate.
   - What's unclear: Is frontend served by backend (same domain), or separate origin (CORS)? How does Okta redirect work?
   - Recommendation: If separate origin, use backend's existing auth routes (POST /api/auth/login redirects to Okta, callback sets session cookie). If same origin, serve frontend from Express static middleware. Check req.user in API requests (session-based auth). For PWA, store session cookie (credentials: 'include' in fetch).

## Recommendations for Claude's Discretion Items

User gave freedom to choose implementation for these areas:

### 1. View Modes (Single Unified vs Tabs)

**Recommendation: Single unified list view**

**Rationale:** Tabs add navigation overhead for incident response scenarios where speed matters. User can filter by status (Open, Acknowledged, Resolved) using existing multi-select filters. Tabs would duplicate this functionality. Single list with prominent filters at top is simpler and faster for triage.

**Alternative:** If analytics show users frequently switch between "My Incidents" and "All Incidents," consider tabs for that distinction only.

### 2. Visual Priority/Severity Design

**Recommendation: Color-coded left border + icon system**

- **Critical:** Red left border (4px), flame icon
- **High:** Orange left border (4px), alert triangle icon
- **Medium:** Yellow left border (4px), warning icon
- **Low:** Blue left border (4px), info icon

**Rationale:** Left border is subtle but scannable. Doesn't overwhelm with color. Icons provide visual anchors for quick scanning. Works for colorblind users (icon + color). Tailwind has built-in border utilities.

**Implementation:** `border-l-4 border-red-500` for critical, flame icon from Radix Icons or Lucide.

### 3. Quick-Action Hover Buttons vs Expand-to-Act

**Recommendation: Hybrid approach**

- **Hover/focus:** Show "Acknowledge" button only (safest action)
- **Expanded view:** Show all actions (Resolve, Reassign, Add Note)

**Rationale:** Balance speed (hover for common action) with safety (expand for destructive actions). Acknowledge is reversible and most common, so it's safe to expose on hover. Resolve is final, so require expansion. Works for keyboard navigation too (focus shows Acknowledge button).

**Mobile:** No hover, so swipe gesture for Acknowledge (user decision), expanded view for other actions.

### 4. New Incident Appearance Animation

**Recommendation: Subtle slide-in from top + pulse highlight**

- New incident slides in from top (300ms ease-out)
- Background pulses yellow once (1s)
- Position: Top of list (user decision: newest first)

**Rationale:** Slide-in provides context (incident appears at top). Pulse draws attention without being disruptive. Animation stops after 1s - doesn't distract during active work. Respects `prefers-reduced-motion` media query for accessibility.

**Implementation:** Framer Motion or CSS keyframes. Use `animate-in` utilities from Tailwind.

### 5. WebSocket Disconnection Handling

**Recommendation: Automatic reconnection with UI indicator**

- **Connected:** No indicator (default state)
- **Disconnected:** Show banner at top: "Connection lost. Reconnecting..." (yellow)
- **Reconnecting:** Show countdown "Reconnecting in 3s..." (Socket.io backoff)
- **Reconnected:** Toast notification "Connected" (green, auto-dismiss 2s)

**Rationale:** User doesn't need to act - Socket.io handles reconnection automatically. UI indicator provides awareness. Banner is non-intrusive but visible. Toast confirms when reconnection succeeds.

**Fallback:** After 5 failed reconnection attempts, show "Connection failed. Refresh page?" button.

### 6. Note-Adding UI (Inline vs Modal)

**Recommendation: Inline within expanded row**

- **Unexpanded:** Show "Add Note" button in collapsed row (next to Acknowledge)
- **Click:** Expands row + auto-focuses note textarea
- **Note form:** Appears at bottom of timeline (inline)
- **Submit:** Adds to timeline, collapses form

**Rationale:** Modal requires extra click and context switch. Inline keeps user in context of incident. Markdown editor (with preview tabs) fits naturally at bottom of timeline. Mobile-friendly - no modal overlay.

**Alternative:** If note form is large (many fields), use modal. But user decided markdown notes only, so inline works.

### 7. Timeline Event Detail Level

**Recommendation: Balance completeness with readability**

**Show for each event:**
- **Icon + type** (status change, note, assignment)
- **Timestamp** (relative: "2 minutes ago", absolute on hover)
- **Actor** (user name + avatar)
- **Primary content** (status change: "OPEN → ACKNOWLEDGED", note: markdown content)
- **Secondary metadata** (for notes: edited timestamp, for assignments: reason)

**Collapse/hide:**
- **System metadata** (IP address, user agent) - available in "Technical Details" section
- **Redundant info** (incident ID in every event - obvious from context)

**Rationale:** Include enough detail to understand what happened and why, but avoid noise. Users scan timelines for human notes and status changes, not system metadata. Relative timestamps are easier to parse ("2 min ago" vs "2026-02-06T22:15:00Z").

## Sources

### Primary (HIGH confidence)

- **Vite documentation** (https://vite.dev/guide/) - Build tool features and setup
- **Socket.io v4 documentation** (https://socket.io/docs/v4/) - WebSocket client/server, reconnection, TypeScript support
- **TanStack Query documentation** (https://tanstack.com/query/latest) - Server state management, real-time data patterns
- **TanStack Virtual documentation** (https://tanstack.com/virtual/latest) - List virtualization for long timelines
- **shadcn/ui documentation** (https://ui.shadcn.com/) - Component library, setup requirements
- **React Router v7 documentation** (https://reactrouter.com/) - Current version, routing patterns
- **react-markdown documentation** (https://github.com/remarkjs/react-markdown) - Markdown rendering, security
- **Workbox documentation** (https://developer.chrome.com/docs/workbox/) - Service worker utilities, caching strategies
- **vite-plugin-pwa** (https://vite-pwa-org.netlify.app/) - PWA integration with Vite
- **web.dev PWA guide** (https://web.dev/learn/pwa/) - PWA fundamentals, service workers, manifest, offline
- **MDN Web Authentication API** (https://developer.mozilla.org/en-US/docs/Web/API/Credential_Management_API/Credential_types) - WebAuthn biometric authentication
- **web.dev Push Notifications** (https://web.dev/articles/push-notifications-overview) - Push API architecture, service worker integration

### Secondary (MEDIUM confidence)

- **React Hook Form** (https://github.com/react-hook-form/react-hook-form) - Form management library
- **Sonner** (https://sonner.emilkowal.ski/) - Toast notification library
- **Radix UI** (https://www.radix-ui.com/) - Headless UI primitives (foundation for shadcn/ui)
- **query-string library** (https://github.com/sindresorhus/query-string) - URL query parameter utilities

### Tertiary (LOW confidence)

None - all findings verified with official documentation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries have official documentation, current versions verified
- Architecture patterns: HIGH - Patterns verified with official docs (Socket.io, TanStack Query, vite-plugin-pwa)
- WebSocket real-time: HIGH - Socket.io v4 documentation is authoritative
- PWA setup: HIGH - web.dev and Workbox docs are official Chrome team resources
- Pitfalls: MEDIUM - Based on community patterns and documentation, but not exhaustive testing
- Open questions: MEDIUM - Require coordination with backend implementation

**Research date:** 2026-02-06
**Valid until:** 2026-03-06 (30 days) - React ecosystem is stable, libraries update frequently but not breaking changes

**Note:** This research assumes frontend is new greenfield project. If existing frontend infrastructure exists, recommendations may need adjustment.
