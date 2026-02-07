# Phase 6: Incident Management Dashboard - Context

**Gathered:** 2026-02-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Web and mobile interfaces for viewing, acknowledging, and managing incidents in real-time. Backend systems (routing, escalation, notifications) are complete from Phases 1-5. This phase delivers the UI layer that lets on-call engineers interact with incidents from desktop and mobile devices.

</domain>

<decisions>
## Implementation Decisions

### Dashboard Layout & Information Density

- **Layout style**: Hybrid list with expandable rows
  - Compact rows that expand inline to show full details when clicked
  - Balances density (scan many incidents) with detail (see timeline without navigation)

- **Collapsed row content**: Priority, service, description, time, assignee
  - Core triage info visible without expanding
  - Shows who owns incident and what's wrong
  - Action buttons appear in expanded view

- **High-volume handling**: Pagination (10-20 incidents per page)
  - Traditional pagination for performance and focus
  - Keeps UI responsive during large incident volumes (50+ during outages)

- **Filtering & sorting**: Advanced multi-select filters for status, priority, service, assignee
  - Power-user filters - combine multiple criteria
  - Support for large teams with many services

- **Expanded view content**: Full timeline embedded inline
  - Complete incident history in the expanded row
  - No need to navigate to separate detail page

- **Summary metrics**: Yes - count cards at top (X open, Y acked, Z critical)
  - At-a-glance stats showing incident distribution by state

- **Default sort order**: Most recent first (newest at top)
  - New incidents appear immediately at top of list

- **Empty state**: Positive message - "All clear! No active incidents"
  - Celebrate the quiet - reassuring when nothing is broken

- **URL state**: Yes, filters in URL query params
  - Shareable URLs - send filtered view links to teammates
  - Bookmarkable searches

- **Keyboard navigation**: Basic - arrow keys to navigate, enter to expand
  - Simple keyboard support without learning curve

- **Bulk actions**: Checkbox selection + bulk acknowledge/resolve
  - Select multiple incidents, act on all at once
  - Useful during recovery from widespread outages

- **User preferences**: Yes, save to user profile
  - Remember last filters/sort order - dashboard loads with user preferences

### Real-time Updates & Interactivity

- **Update mechanism**: WebSockets (bidirectional, instant)
  - True real-time - server pushes updates immediately
  - Best UX for incident response scenarios

- **Acknowledge behavior**: Optimistic update (instant, undo if fails)
  - Update UI immediately, show success
  - Rollback if server rejects - best perceived performance

- **Multi-user updates**: Update in place with toast notification
  - "Alice acknowledged this incident" - change reflects immediately with alert

- **Confirmation dialogs**: Confirm resolve/close only (ack is safe)
  - Prevent accidental resolution
  - Acknowledge is reversible, resolve matters more

- **Loading states**: Skeleton screen (content placeholders)
  - Modern loading UX - show layout structure while data loads

### Timeline & Incident Details View

- **Timeline layout**: Chronological list (newest first)
  - Simple reverse-chrono - most recent event at top
  - Easy to scan for latest activity

- **Notes vs events**: Yes - different background/icon for user notes
  - User notes stand out from system events
  - Easy to find human commentary vs automated actions

- **Long timelines**: Show all events (virtualized scrolling)
  - Complete history visible
  - Fast rendering with virtualization for 50+ events

- **Note formatting**: Yes - markdown support with preview
  - Rich notes - headings, lists, code blocks, links
  - Good for detailed runbooks and context

- **Raw alert payload**: Yes, in collapsible "Technical Details" section
  - Available for debugging - see original webhook data when needed

- **Metadata editing**: Yes, inline editing
  - Add/edit tags, labels directly
  - Useful for classification during incident response

- **External tool links**: Yes, quick-links section in incident view
  - Jump to DataDog, Grafana, runbook from incident
  - metadata.service determines which links to show

### Mobile PWA Experience

- **Design approach**: Mobile-first (optimize for phone)
  - Design for mobile, scale up to desktop
  - On-call engineers respond from phones

- **Push notification tap**: Directly to incident detail view
  - Deep link to specific incident - fastest path to act

- **Offline mode**: View cached incidents only
  - Read-only offline - see last-loaded incidents
  - Can't act until connection returns

- **Mobile navigation**: Bottom nav bar (Incidents, Schedule, Profile)
  - Thumb-friendly navigation - key sections always accessible

- **PWA install prompt**: Yes, prompt after first incident acknowledgment
  - Non-intrusive timing - user sees value before install prompt

- **Mobile navigation flow**: Full-screen transitions (list → detail)
  - Modal-style - detail view takes over screen
  - Back button returns to list

- **Gesture controls**: Yes - swipe right to ack, left for options
  - Fast triage - Gmail-style swipe actions
  - Common workflows accessible via gesture

- **Biometric authentication**: Yes, optional biometric unlock
  - Quick access - unlock PWA with Face ID/fingerprint after first login

### Claude's Discretion

- View modes (single unified vs tabs) - choose what makes most sense for UX
- Visual priority/severity design (color coding, icons) - effective visual system
- Quick-action hover buttons vs expand-to-act - balance speed vs safety
- New incident appearance animation - balance visibility vs distraction
- WebSocket disconnection handling - resilient connection with auto-reconnect or fallback
- Note-adding UI (inline vs modal) - best note-taking UX
- Timeline event detail level - balance completeness vs readability

</decisions>

<specifics>
## Specific Ideas

- Expandable rows should feel smooth - no jarring page shifts when expanding
- WebSocket updates should be instant but not disruptive during active incident work
- Mobile gestures should have visual feedback (swipe preview) before committing action
- Quick-links section should intelligently map services to monitoring tools (e.g., "payment-api" → DataDog dashboard + Grafana metrics + Runbook URL)
- Bulk actions should have clear confirmation ("Acknowledge 5 incidents?") to prevent mistakes
- Offline PWA should show clear indicator when cached data may be stale

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope

</deferred>

---

*Phase: 06-incident-management-dashboard*
*Context gathered: 2026-02-06*
