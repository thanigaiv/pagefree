import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { useUrlState } from '@/hooks/useUrlState';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
);

describe('useUrlState', () => {
  it('returns default filters when URL is empty', () => {
    const { result } = renderHook(() => useUrlState(), { wrapper });

    expect(result.current.filters.sort).toBe('newest');
    expect(result.current.filters.page).toBe(1);
    expect(result.current.filters.status).toBeUndefined();
  });

  it('updates URL when filters change', () => {
    const { result } = renderHook(() => useUrlState(), { wrapper });

    act(() => {
      result.current.updateFilters({ status: ['OPEN'] });
    });

    expect(result.current.filters.status).toEqual(['OPEN']);
  });

  it('supports multiple filter values', () => {
    const { result } = renderHook(() => useUrlState(), { wrapper });

    act(() => {
      result.current.updateFilters({
        status: ['OPEN', 'ACKNOWLEDGED'],
        priority: ['HIGH', 'CRITICAL'],
      });
    });

    expect(result.current.filters.status).toEqual(['OPEN', 'ACKNOWLEDGED']);
    expect(result.current.filters.priority).toEqual(['HIGH', 'CRITICAL']);
  });

  it('clears filters when clearFilters called', () => {
    const { result } = renderHook(() => useUrlState(), { wrapper });

    act(() => {
      result.current.updateFilters({ status: ['OPEN'] });
    });

    act(() => {
      result.current.clearFilters();
    });

    expect(result.current.filters.status).toBeUndefined();
  });

  it('resets page to 1 when filters change', () => {
    const { result } = renderHook(() => useUrlState(), { wrapper });

    act(() => {
      result.current.updateFilters({ page: 5 });
    });

    expect(result.current.filters.page).toBe(5);

    act(() => {
      result.current.updateFilters({ status: ['OPEN'], page: 1 });
    });

    expect(result.current.filters.page).toBe(1);
  });
});
