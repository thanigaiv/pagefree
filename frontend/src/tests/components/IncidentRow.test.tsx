import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { IncidentRow } from '@/components/IncidentRow';
import type { Incident } from '@/types/incident';

const mockIncident: Incident = {
  id: 'inc-123',
  fingerprint: 'test-fingerprint',
  status: 'OPEN',
  priority: 'HIGH',
  title: 'Test Incident',
  description: 'Test description',
  metadata: { service: 'payment-api' },
  teamId: 'team-1',
  team: { id: 'team-1', name: 'Platform Team' },
  assignedUserId: 'user-1',
  assignedUser: { id: 'user-1', firstName: 'John', lastName: 'Doe', email: 'john@test.com' },
  currentLevel: 0,
  currentRepeat: 0,
  createdAt: new Date().toISOString(),
};

const renderWithProviders = (ui: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{ui}</BrowserRouter>
    </QueryClientProvider>
  );
};

describe('IncidentRow', () => {
  it('renders incident title and priority', () => {
    renderWithProviders(
      <IncidentRow
        incident={mockIncident}
        isSelected={false}
        isExpanded={false}
        onSelect={vi.fn()}
        onToggleExpand={vi.fn()}
      />
    );

    expect(screen.getByText('Test Incident')).toBeInTheDocument();
    expect(screen.getByText('HIGH')).toBeInTheDocument();
  });

  it('renders service from metadata', () => {
    renderWithProviders(
      <IncidentRow
        incident={mockIncident}
        isSelected={false}
        isExpanded={false}
        onSelect={vi.fn()}
        onToggleExpand={vi.fn()}
      />
    );

    expect(screen.getByText('payment-api')).toBeInTheDocument();
  });

  it('renders assignee name', () => {
    renderWithProviders(
      <IncidentRow
        incident={mockIncident}
        isSelected={false}
        isExpanded={false}
        onSelect={vi.fn()}
        onToggleExpand={vi.fn()}
      />
    );

    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  it('shows Unassigned when no assignee', () => {
    const unassignedIncident = { ...mockIncident, assignedUser: undefined };

    renderWithProviders(
      <IncidentRow
        incident={unassignedIncident}
        isSelected={false}
        isExpanded={false}
        onSelect={vi.fn()}
        onToggleExpand={vi.fn()}
      />
    );

    expect(screen.getByText('Unassigned')).toBeInTheDocument();
  });

  it('calls onToggleExpand when clicked', () => {
    const onToggleExpand = vi.fn();

    renderWithProviders(
      <IncidentRow
        incident={mockIncident}
        isSelected={false}
        isExpanded={false}
        onSelect={vi.fn()}
        onToggleExpand={onToggleExpand}
      />
    );

    fireEvent.click(screen.getByText('Test Incident').closest('[class*="Card"]')!);
    expect(onToggleExpand).toHaveBeenCalled();
  });

  it('checkbox calls onSelect when clicked', () => {
    const onSelect = vi.fn();

    renderWithProviders(
      <IncidentRow
        incident={mockIncident}
        isSelected={false}
        isExpanded={false}
        onSelect={onSelect}
        onToggleExpand={vi.fn()}
      />
    );

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(onSelect).toHaveBeenCalledWith(true);
  });

  it('displays correct status badge colors', () => {
    const { rerender } = renderWithProviders(
      <IncidentRow
        incident={mockIncident}
        isSelected={false}
        isExpanded={false}
        onSelect={vi.fn()}
        onToggleExpand={vi.fn()}
      />
    );

    expect(screen.getByText('OPEN')).toHaveClass('bg-red-100');

    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <BrowserRouter>
          <IncidentRow
            incident={{ ...mockIncident, status: 'ACKNOWLEDGED' }}
            isSelected={false}
            isExpanded={false}
            onSelect={vi.fn()}
            onToggleExpand={vi.fn()}
          />
        </BrowserRouter>
      </QueryClientProvider>
    );

    expect(screen.getByText('ACKNOWLEDGED')).toHaveClass('bg-yellow-100');
  });
});
