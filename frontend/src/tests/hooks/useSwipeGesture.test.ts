import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';

describe('useSwipeGesture', () => {
  const createTouchEvent = (clientX: number, clientY: number) => ({
    targetTouches: [{ clientX, clientY }],
  } as unknown as React.TouchEvent);

  it('returns initial state with no swipe', () => {
    const { result } = renderHook(() =>
      useSwipeGesture({
        onSwipeRight: vi.fn(),
        onSwipeLeft: vi.fn(),
      })
    );

    expect(result.current.swipeOffset).toBe(0);
    expect(result.current.isSwipingRight).toBe(false);
    expect(result.current.isSwipingLeft).toBe(false);
    expect(result.current.swipeDirection).toBe(null);
  });

  it('detects right swipe when moving > 80px right', async () => {
    const onSwipeRight = vi.fn();
    const { result } = renderHook(() =>
      useSwipeGesture({
        onSwipeRight,
        onSwipeLeft: vi.fn(),
      })
    );

    await act(async () => {
      result.current.swipeHandlers.onTouchStart(createTouchEvent(0, 100));
    });

    await act(async () => {
      result.current.swipeHandlers.onTouchMove(createTouchEvent(100, 100));
    });

    await act(async () => {
      result.current.swipeHandlers.onTouchEnd();
    });

    expect(onSwipeRight).toHaveBeenCalled();
  });

  it('detects left swipe when moving > 80px left', async () => {
    const onSwipeLeft = vi.fn();
    const { result } = renderHook(() =>
      useSwipeGesture({
        onSwipeRight: vi.fn(),
        onSwipeLeft,
      })
    );

    await act(async () => {
      result.current.swipeHandlers.onTouchStart(createTouchEvent(100, 100));
    });

    await act(async () => {
      result.current.swipeHandlers.onTouchMove(createTouchEvent(0, 100));
    });

    await act(async () => {
      result.current.swipeHandlers.onTouchEnd();
    });

    expect(onSwipeLeft).toHaveBeenCalled();
  });

  it('does not trigger swipe on small movements', () => {
    const onSwipeRight = vi.fn();
    const { result } = renderHook(() =>
      useSwipeGesture({
        onSwipeRight,
        onSwipeLeft: vi.fn(),
      })
    );

    act(() => {
      result.current.swipeHandlers.onTouchStart(createTouchEvent(0, 100));
      result.current.swipeHandlers.onTouchMove(createTouchEvent(30, 100));
      result.current.swipeHandlers.onTouchEnd();
    });

    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it('ignores vertical swipes', () => {
    const onSwipeRight = vi.fn();
    const { result } = renderHook(() =>
      useSwipeGesture({
        onSwipeRight,
        onSwipeLeft: vi.fn(),
      })
    );

    // Move mostly vertical
    act(() => {
      result.current.swipeHandlers.onTouchStart(createTouchEvent(100, 0));
      result.current.swipeHandlers.onTouchMove(createTouchEvent(110, 100));
      result.current.swipeHandlers.onTouchEnd();
    });

    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it('shows preview state during swipe', async () => {
    const { result } = renderHook(() =>
      useSwipeGesture({
        onSwipeRight: vi.fn(),
        onSwipeLeft: vi.fn(),
      })
    );

    await act(async () => {
      result.current.swipeHandlers.onTouchStart(createTouchEvent(0, 100));
    });

    await act(async () => {
      result.current.swipeHandlers.onTouchMove(createTouchEvent(50, 100));
    });

    expect(result.current.swipeOffset).toBeGreaterThan(0);
    expect(result.current.isSwipingRight).toBe(true);
  });

  it('resets state after swipe completes', () => {
    const { result } = renderHook(() =>
      useSwipeGesture({
        onSwipeRight: vi.fn(),
        onSwipeLeft: vi.fn(),
      })
    );

    act(() => {
      result.current.swipeHandlers.onTouchStart(createTouchEvent(0, 100));
      result.current.swipeHandlers.onTouchMove(createTouchEvent(100, 100));
      result.current.swipeHandlers.onTouchEnd();
    });

    expect(result.current.swipeOffset).toBe(0);
    expect(result.current.isSwipingRight).toBe(false);
  });
});
