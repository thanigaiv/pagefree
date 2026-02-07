import { useRef, useState, useCallback } from 'react';

interface SwipeHandlers {
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
}

interface SwipeGestureResult {
  swipeHandlers: {
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: () => void;
  };
  swipeOffset: number;
  isSwipingRight: boolean;
  isSwipingLeft: boolean;
  swipeDirection: 'left' | 'right' | null;
}

const MIN_SWIPE_DISTANCE = 80; // Minimum distance to trigger action
const PREVIEW_THRESHOLD = 30; // Show preview after 30px
const MAX_OFFSET = 100; // Maximum visual offset
const MIN_ANGLE = 30; // Minimum angle from horizontal (degrees)

export function useSwipeGesture(handlers: SwipeHandlers): SwipeGestureResult {
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const touchEndY = useRef<number | null>(null);
  const isHorizontalSwipe = useRef<boolean | null>(null);

  const [swipeOffset, setSwipeOffset] = useState(0);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchEndX.current = null;
    touchEndY.current = null;
    isHorizontalSwipe.current = null;
    touchStartX.current = e.targetTouches[0].clientX;
    touchStartY.current = e.targetTouches[0].clientY;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
    touchEndY.current = e.targetTouches[0].clientY;

    if (
      touchStartX.current === null ||
      touchStartY.current === null ||
      touchEndX.current === null ||
      touchEndY.current === null
    ) {
      return;
    }

    const deltaX = touchEndX.current - touchStartX.current;
    const deltaY = touchEndY.current - touchStartY.current;

    // Determine if this is a horizontal swipe on first significant movement
    if (isHorizontalSwipe.current === null && (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10)) {
      // Calculate angle from horizontal
      const angle = Math.abs(Math.atan2(deltaY, deltaX) * (180 / Math.PI));

      // If angle is within MIN_ANGLE degrees of horizontal (0 or 180), it's a horizontal swipe
      isHorizontalSwipe.current = angle < MIN_ANGLE || angle > (180 - MIN_ANGLE);

      // If it's a vertical scroll, don't interfere
      if (!isHorizontalSwipe.current) {
        return;
      }
    }

    // Only track horizontal swipes
    if (isHorizontalSwipe.current) {
      // Prevent scroll while swiping (per RESEARCH.md pitfall #6)
      e.preventDefault();

      // Clamp offset for visual preview
      const clampedOffset = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, deltaX));
      setSwipeOffset(clampedOffset);
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    if (
      touchStartX.current === null ||
      touchEndX.current === null ||
      !isHorizontalSwipe.current
    ) {
      setSwipeOffset(0);
      touchStartX.current = null;
      touchStartY.current = null;
      isHorizontalSwipe.current = null;
      return;
    }

    const distance = touchEndX.current - touchStartX.current;

    // Trigger action if swipe was long enough
    if (distance > MIN_SWIPE_DISTANCE && handlers.onSwipeRight) {
      handlers.onSwipeRight();
    } else if (distance < -MIN_SWIPE_DISTANCE && handlers.onSwipeLeft) {
      handlers.onSwipeLeft();
    }

    // Reset
    setSwipeOffset(0);
    touchStartX.current = null;
    touchStartY.current = null;
    isHorizontalSwipe.current = null;
  }, [handlers]);

  const isSwipingRight = swipeOffset > PREVIEW_THRESHOLD;
  const isSwipingLeft = swipeOffset < -PREVIEW_THRESHOLD;
  const swipeDirection = isSwipingRight ? 'right' : isSwipingLeft ? 'left' : null;

  return {
    swipeHandlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
    },
    swipeOffset,
    isSwipingRight,
    isSwipingLeft,
    swipeDirection,
  };
}
