import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IncidentFilters } from '@/components/IncidentFilters';

describe('IncidentFilters', () => {
  it('renders filter button', () => {
    render(
      <IncidentFilters
        filters={{}}
        onUpdateFilters={vi.fn()}
        onClearFilters={vi.fn()}
      />
    );

    expect(screen.getByText('Filters')).toBeInTheDocument();
  });

  it('shows active filter count badge', () => {
    render(
      <IncidentFilters
        filters={{ status: ['OPEN', 'ACKNOWLEDGED'], priority: ['HIGH'] }}
        onUpdateFilters={vi.fn()}
        onClearFilters={vi.fn()}
      />
    );

    // Badge should show count of active filters (2 status + 1 priority = 3)
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows clear button when filters are active', () => {
    render(
      <IncidentFilters
        filters={{ status: ['OPEN'] }}
        onUpdateFilters={vi.fn()}
        onClearFilters={vi.fn()}
      />
    );

    expect(screen.getByText('Clear')).toBeInTheDocument();
  });

  it('calls onClearFilters when clear button clicked', () => {
    const onClearFilters = vi.fn();

    render(
      <IncidentFilters
        filters={{ status: ['OPEN'] }}
        onUpdateFilters={vi.fn()}
        onClearFilters={onClearFilters}
      />
    );

    fireEvent.click(screen.getByText('Clear'));
    expect(onClearFilters).toHaveBeenCalled();
  });

  it('does not show clear button when no filters active', () => {
    render(
      <IncidentFilters
        filters={{}}
        onUpdateFilters={vi.fn()}
        onClearFilters={vi.fn()}
      />
    );

    expect(screen.queryByText('Clear')).not.toBeInTheDocument();
  });
});
