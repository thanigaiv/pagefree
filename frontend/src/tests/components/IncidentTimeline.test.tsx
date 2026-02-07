import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IncidentTimeline } from '@/components/IncidentTimeline';
import type { TimelineEvent } from '@/types/incident';

const mockEvents: TimelineEvent[] = [
  {
    id: '1',
    action: 'incident.created',
    timestamp: new Date().toISOString(),
    userId: 'system',
  },
  {
    id: '2',
    action: 'incident.acknowledged',
    timestamp: new Date().toISOString(),
    userId: 'user-1',
    user: { id: 'user-1', firstName: 'Jane', lastName: 'Smith' },
  },
  {
    id: '3',
    action: 'incident.note.added',
    timestamp: new Date().toISOString(),
    userId: 'user-2',
    user: { id: 'user-2', firstName: 'Bob', lastName: 'Jones' },
    metadata: { note: 'This is a test note' },
  },
];

describe('IncidentTimeline', () => {
  it('renders loading skeleton when loading', () => {
    render(<IncidentTimeline events={[]} isLoading={true} />);

    // Should render skeleton elements (checking for animate-pulse class from Skeleton component)
    const skeletons = document.querySelectorAll('[class*="animate-pulse"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders empty state when no events', () => {
    render(<IncidentTimeline events={[]} isLoading={false} />);

    expect(screen.getByText('No timeline events yet')).toBeInTheDocument();
  });

  it('renders timeline events', () => {
    render(<IncidentTimeline events={mockEvents} isLoading={false} />);

    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('This is a test note')).toBeInTheDocument();
  });

  it('distinguishes note events with different styling', () => {
    render(<IncidentTimeline events={mockEvents} isLoading={false} />);

    // Note events should have blue background
    const noteContent = screen.getByText('This is a test note');
    const noteCard = noteContent.closest('[class*="bg-blue"]');
    expect(noteCard).toBeInTheDocument();
  });

  it('renders without virtualization for short lists', () => {
    const shortList = mockEvents.slice(0, 2);
    render(<IncidentTimeline events={shortList} isLoading={false} />);

    // Should render directly without virtualization container
    const virtualContainer = document.querySelector('[style*="height"]');
    expect(virtualContainer).toBeNull();
  });
});
