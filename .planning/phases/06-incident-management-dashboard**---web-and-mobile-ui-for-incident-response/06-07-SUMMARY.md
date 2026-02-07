---
phase: 06-incident-management-dashboard
plan: 07
subsystem: frontend-pwa
tags: [pwa, service-worker, offline, workbox, vite-plugin-pwa, install-prompt]

requires:
  - 06-03  # Incident list UI
  - 06-04  # Incident detail view
  - 06-05  # Real-time incident actions

provides:
  - PWA infrastructure with service worker
  - Offline caching for incidents and API responses
  - Install prompt after first acknowledgment
  - Offline status indicator

affects:
  - Future mobile-first features will leverage PWA foundation
  - Service worker enables background sync capabilities

tech-stack:
  added:
    - vite-plugin-pwa: ^1.2.0
    - workbox-window: ^7.4.0
  patterns:
    - NetworkFirst caching strategy for API responses
    - BeforeInstallPrompt event capture for install timing control
    - Online/offline event listeners for connectivity awareness

key-files:
  created:
    - frontend/vite.config.ts (PWA plugin configuration)
    - frontend/src/lib/pwa.ts (PWA utilities)
    - frontend/src/hooks/usePWA.ts (PWA reactive hook)
    - frontend/src/components/InstallPrompt.tsx (Install button)
    - frontend/src/components/OfflineIndicator.tsx (Offline banner)
    - frontend/src/vite-env.d.ts (PWA type definitions)
    - frontend/public/icons/ (PWA icons)
  modified:
    - frontend/src/App.tsx (Offline indicator integration)
    - frontend/src/pages/DashboardPage.tsx (Install prompt button)
    - frontend/src/pages/IncidentDetailPage.tsx (PWA prompt integration)
    - frontend/src/hooks/useIncidentMutations.ts (onSuccess callback support)
    - frontend/src/components/IncidentActions.tsx (PWA prompt callback)
    - frontend/src/components/IncidentDetail.tsx (PWA prompt callback)
    - frontend/src/components/IncidentRow.tsx (PWA prompt integration)
    - frontend/src/tests/setup.ts (TypeScript global fix)

decisions:
  - decision: "PWA install prompt after first acknowledgment"
    phase-plan: "06-07"
    rationale: "Non-intrusive timing - users see value before install prompt"
  - decision: "NetworkFirst caching strategy for incidents"
    phase-plan: "06-07"
    rationale: "Fresh data when online, cached data when offline with 3s timeout"
  - decision: "StaleWhileRevalidate for users/teams"
    phase-plan: "06-07"
    rationale: "Less frequently changing data can use cached version while revalidating"
  - decision: "5-minute cache expiration for incidents"
    phase-plan: "06-07"
    rationale: "Balance between offline availability and data freshness"
  - decision: "globalThis instead of global for test mocks"
    phase-plan: "06-07"
    rationale: "Modern TypeScript standard, avoids TS2304 errors"

metrics:
  duration: "6.8 min"
  completed: "2026-02-07"
---

# Phase 6 Plan 7: PWA Setup Summary

**One-liner:** Progressive Web App with Workbox service worker, NetworkFirst caching for offline incidents, install prompt after first acknowledgment

## What Was Built

### Task 1: PWA Plugin Configuration (Partially Pre-existing)
- Configured vite-plugin-pwa with Workbox
- Created PWA manifest (name, icons, display mode)
- Set up placeholder PWA icons (SVG + PNG)
- Configured runtime caching strategies:
  - **Incidents list:** NetworkFirst with 3s timeout, 5min expiration, 50 entries
  - **Incident detail:** NetworkFirst with 3s timeout, 5min expiration, 100 entries
  - **Timeline:** NetworkFirst with 5min expiration, 50 entries
  - **Users/Teams:** StaleWhileRevalidate with 30min expiration, 100 entries
- Fixed TypeScript error in test setup (global → globalThis)

### Task 2: PWA Utilities and Hooks
- Created `frontend/src/lib/pwa.ts`:
  - `initPWAInstallCapture()` - Capture beforeinstallprompt event
  - `canInstallPWA()` - Check if install prompt available
  - `promptPWAInstall()` - Show install prompt
  - `isInstalledPWA()` - Check if running as installed PWA
  - `isOffline()` - Check network status
  - `onOnlineStatusChange()` - Listen for connectivity changes
- Created `frontend/src/hooks/usePWA.ts`:
  - Reactive state for install availability, online status
  - `promptAfterAcknowledge()` - Delayed install prompt after first ack
  - Toast notifications for offline/online transitions
- Created `InstallPrompt` component - Install button in dashboard header
- Created `OfflineIndicator` component - Fixed banner when offline

### Task 3: App Integration
- Updated `App.tsx` to show offline indicator globally
- Added install button to `DashboardPage` header
- Updated `useAcknowledgeIncident` to accept `onSuccess` callback
- Integrated `promptAfterAcknowledge` through component hierarchy:
  - `IncidentActions` → accepts and uses callback
  - `IncidentDetail` → passes callback to actions
  - `IncidentDetailPage` → provides PWA prompt
  - `IncidentRow` → swipe acknowledge triggers prompt
- Created `vite-env.d.ts` for PWA type definitions

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript global reference error**
- **Found during:** Task 1 build verification
- **Issue:** TypeScript TS2304 error on `global.fetch`, `global.IntersectionObserver`, `global.ResizeObserver` in test setup
- **Fix:** Changed to `globalThis.fetch`, `globalThis.IntersectionObserver`, `globalThis.ResizeObserver` with `as any` type assertion
- **Files modified:** `frontend/src/tests/setup.ts`
- **Commit:** Part of Task 2 commit (3315bcb)
- **Rationale:** `globalThis` is the modern TypeScript standard for accessing global scope

**2. [Deviation - Pre-existing Work] Task 1 PWA configuration already completed**
- **Found during:** Task 1 execution
- **Pre-existing work:** vite.config.ts PWA plugin setup and icons were added in commit 96efbf6 (plan 06-11 test setup)
- **Action taken:** Verified configuration, proceeded to Task 2
- **Impact:** Task 1 effectively complete, no additional work needed for PWA plugin setup

## Technical Implementation

### Service Worker Caching Strategy

**NetworkFirst for Incidents:**
```typescript
urlPattern: /\/api\/incidents(\?.*)?$/,
handler: 'NetworkFirst',
options: {
  cacheName: 'incidents-list-cache',
  networkTimeoutSeconds: 3,  // Fall back to cache if network slow
  expiration: {
    maxEntries: 50,
    maxAgeSeconds: 5 * 60,  // 5 minutes
  },
}
```

**StaleWhileRevalidate for Users/Teams:**
```typescript
urlPattern: /\/api\/(users|teams)/,
handler: 'StaleWhileRevalidate',  // Less frequently changing data
options: {
  cacheName: 'users-teams-cache',
  expiration: {
    maxEntries: 100,
    maxAgeSeconds: 30 * 60,  // 30 minutes
  },
}
```

### Install Prompt Flow

1. **Capture:** `beforeinstallprompt` event captured and deferred
2. **User Action:** User acknowledges first incident
3. **Delay:** 1.5s delay so user sees acknowledgment success
4. **Prompt:** Install prompt shown automatically
5. **Toast:** "App installed! Access from your home screen"

### Offline Detection

- Listen to `online` and `offline` events
- Show toast warning when going offline
- Show fixed banner "Offline - viewing cached data"
- Toast success when back online
- usePWA hook provides reactive `isOnline` state

## Verification Steps

1. ✅ Build completes without errors
2. ✅ Service worker registered in production build
3. ✅ Manifest generated with correct app info
4. ✅ PWA utilities and hooks created
5. ✅ Install button appears in dashboard (when installable)
6. ✅ Offline indicator hidden when online
7. ✅ Install prompt integrated into acknowledge flow
8. ✅ Type definitions for PWA client

## Task Commits

| Task | Commit  | Description                                |
|------|---------|---------------------------------------------|
| 1    | 96efbf6 | PWA plugin configuration (pre-existing)     |
| 1    | 3315bcb | Fixed TypeScript global error (deviation)   |
| 2    | 3315bcb | Created PWA utilities and install prompt    |
| 3    | eab1fe3 | Integrated PWA features into app            |

## Next Phase Readiness

**Phase 6 Progress:** 7/11 plans complete

**Blockers:** None

**Concerns:**
- Install prompt availability varies by browser (Chrome/Edge support, Safari limited)
- Service worker only active in production build or with `devOptions.enabled: true`
- Icon placeholders (SVG) should be converted to proper PNG for production
- Cache invalidation on new deployments handled by Workbox automatically

**Follow-up Tasks:**
- Convert icon.svg to proper 192x192 and 512x512 PNG icons
- Test PWA install flow on mobile devices (Android Chrome, iOS Safari)
- Monitor service worker cache sizes in production
- Consider adding background sync for offline actions

**Ready for:** 06-08 - Mobile Swipe Gestures and Bottom Navigation (already complete per git log)

## Self-Check: PASSED

All key files verified to exist:
- frontend/src/lib/pwa.ts ✓
- frontend/src/hooks/usePWA.ts ✓
- frontend/src/components/InstallPrompt.tsx ✓
- frontend/src/components/OfflineIndicator.tsx ✓
- frontend/vite.config.ts ✓
- frontend/public/icons/ ✓

All commits verified:
- 96efbf6 (Task 1 pre-existing) ✓
- 3315bcb (Task 2) ✓
- eab1fe3 (Task 3) ✓
