---
phase: 06-incident-management-dashboard
plan: 04
subsystem: frontend-ui
status: complete
created: 2026-02-07
completed: 2026-02-07
duration: 3.1 min
tags: [react, typescript, virtualization, timeline, ui]
requires:
  - 06-01-frontend-foundation
  - 06-02-websocket-updates
provides:
  - incident-detail-view
  - timeline-virtualization
  - technical-details-collapsible
  - external-tool-links
affects:
  - 06-05-incident-actions
  - 06-06-mobile-web-pwa
tech-stack:
  added:
    - "@tanstack/react-virtual"
  patterns:
    - virtualized-list-rendering
    - component-composition
    - collapsible-sections
key-files:
  created:
    - frontend/src/hooks/useTimeline.ts
    - frontend/src/components/TimelineEvent.tsx
    - frontend/src/components/IncidentTimeline.tsx
    - frontend/src/components/TechnicalDetails.tsx
    - frontend/src/components/ExternalLinks.tsx
    - frontend/src/components/IncidentDetail.tsx
  modified:
    - frontend/src/pages/IncidentDetailPage.tsx
    - frontend/src/types/incident.ts
decisions:
  - decision: "Timeline virtualization threshold at 20+ events"
    context: "Per user decision in RESEARCH.md - 50+ events need virtualization"
    rationale: "Performance optimization for long timelines without unnecessary overhead for short lists"
  - decision: "User notes visually distinct with blue background"
    context: "Per user decision - notes should stand out from system events"
    rationale: "Clear visual hierarchy helps responders quickly find human context"
  - decision: "Technical details in collapsible section"
    context: "Per user decision - raw payload available but not cluttering main view"
    rationale: "Progressive disclosure - show clean UI by default, technical details on demand"
  - decision: "External tool links based on service metadata"
    context: "Per user decision - quick-links to DataDog, Grafana, Runbook"
    rationale: "Reduce context switching - incident responders can jump to monitoring tools directly"
---

# Phase 06 Plan 04: Incident Detail View with Timeline and Technical Details Summary

Incident detail view with virtualized timeline, collapsible technical details, and external tool quick-links.

## One-Liner

Comprehensive incident detail UI with virtualized timeline (newest first), distinct user notes styling, collapsible JSON payload viewer, and DataDog/Grafana quick-links.

## What Was Built

### Timeline System
- **useTimeline hook**: Fetches incident timeline via `/api/incidents/:id/timeline`, sorts reverse chronologically (newest first)
- **TimelineEvent component**: Category-based icons (note/status/assignment/system), color coding, relative timestamps
- **IncidentTimeline component**: Virtualized scrolling for 20+ events using @tanstack/react-virtual
- **User note distinction**: Blue background (bg-blue-50/50) per user decision for visual hierarchy

### Technical Details
- **TechnicalDetails component**: Collapsible section with raw JSON (metadata + alerts)
- **Copy to clipboard**: Button to copy full technical payload
- **ExternalLinks component**: Quick-links to DataDog, Grafana, Runbook, CloudWatch based on incident metadata

### Detail View
- **IncidentDetail component**: Composite view combining external links, incident info grid, timeline, and technical details
- **IncidentDetailPage**: Full page view with header, priority badge, status badge, back navigation
- **Dual usage pattern**: Component supports both inline (expanded row) and standalone page rendering

### Type Extensions
- Extended `Incident` type to include `alerts` array for technical details display

## Task Commits

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Install TanStack Virtual and create timeline hook | 1dda102 | package.json, useTimeline.ts, incident.ts |
| 2 | Create TimelineEvent and virtualized timeline components | 8ea962e | TimelineEvent.tsx, IncidentTimeline.tsx, ui/avatar.tsx, ui/collapsible.tsx |
| 3 | Create TechnicalDetails, ExternalLinks, IncidentDetail, update page | 837c3c5 | TechnicalDetails.tsx, ExternalLinks.tsx, IncidentDetail.tsx, IncidentDetailPage.tsx |

## Key Learnings

### Timeline Virtualization Strategy
- **Threshold-based approach**: Don't virtualize lists < 20 items - simpler rendering, no performance penalty
- **Virtualize 20+ items**: TanStack Virtual with 100px estimated row height, 5-item overscan
- **Per user decision alignment**: Handles 50+ events smoothly while keeping simple cases simple

### Visual Hierarchy
- **User notes distinct**: Blue background instantly identifies human-added context vs system events
- **Category-based styling**: Note (blue), status (green), assignment (purple), system (gray)
- **Iconography**: MessageSquare, CheckCircle, UserPlus, AlertCircle for quick scanning

### Progressive Disclosure
- **Technical details hidden by default**: Collapsed section prevents UI clutter
- **One-click access**: Expand to see full JSON payload for debugging
- **Copy functionality**: Navigator.clipboard API for quick payload sharing

### External Tool Integration
- **Metadata-driven links**: Service field enables smart defaults (e.g., DataDog APM URL)
- **Explicit URL override**: Metadata can provide exact URLs (runbook_url, grafana_url)
- **Conditional rendering**: Only show links section when links exist

## Deviations from Plan

None - plan executed exactly as written.

## Testing Notes

### Manual Verification Needed
1. Navigate to /incidents/:id - verify full page detail loads
2. Expand incident row (when list view exists) - verify inline detail works
3. Check timeline events sorted newest first
4. Verify user notes have blue background
5. Click "Technical Details" - verify JSON displays and copy works
6. Test with incident containing service metadata - verify external links appear
7. Create test incident with 50+ timeline events - verify virtualization performs smoothly

### Build Verification
- TypeScript compilation: PASSED
- All components type-safe
- No linting errors
- Bundle size: 469KB (acceptable with React Query + Virtual)

## Component API Patterns

### Timeline Hook
```typescript
const { data: timeline, isLoading } = useTimeline(incidentId);
// Returns TimelineEvent[] sorted newest first
```

### Incident Detail
```typescript
<IncidentDetail incident={incident} isInline={false} />
// isInline: true for expanded row, false for full page
```

### External Links
```typescript
<ExternalLinks service="auth-service" metadata={{ runbook_url: "..." }} />
// Generates links based on service + metadata
```

## Integration Points

### API Endpoints
- GET `/api/incidents/:id/timeline` - Returns timeline events
- GET `/api/incidents/:id` - Returns full incident with alerts

### Real-time Updates
- Timeline hook uses React Query with 30s stale time
- Future: Subscribe to Socket.io incident timeline events (from 06-02)

### Mobile Compatibility
- Timeline components responsive (grid-cols-2 md:grid-cols-4)
- Touch-friendly buttons and collapsibles
- Ready for PWA wrapper (06-06)

## Next Phase Readiness

### For 06-05 (Incident Actions)
- Detail view provides context for acknowledge/resolve/close actions
- Timeline will show action results (new events)
- Note form can be added to detail view

### For 06-06 (Mobile PWA)
- All components responsive
- Timeline virtualization helps mobile performance
- External links open in new tabs (mobile-friendly)

### Future Enhancements
- Markdown rendering for note content (currently plaintext)
- Timeline filtering by event type
- Collapsible incident description for long text
- Timeline event search
- Attachments in timeline events

## Metrics

- **Duration**: 3.1 minutes
- **Tasks**: 3/3 completed
- **Commits**: 3
- **Files created**: 6
- **Files modified**: 2
- **Dependencies added**: 1 (@tanstack/react-virtual)
- **Lines of code**: ~600

---

**Status**: Complete and ready for 06-05 (Incident Actions)

## Self-Check: PASSED

All created files verified:
- frontend/src/hooks/useTimeline.ts
- frontend/src/components/TimelineEvent.tsx
- frontend/src/components/IncidentTimeline.tsx
- frontend/src/components/TechnicalDetails.tsx
- frontend/src/components/ExternalLinks.tsx
- frontend/src/components/IncidentDetail.tsx

All commits verified:
- 1dda102
- 8ea962e
- 837c3c5
