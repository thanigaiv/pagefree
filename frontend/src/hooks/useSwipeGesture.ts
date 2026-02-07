import { useState, useCallback, useRef } from 'react';

interface SwipeGestureOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number; // Minimum distance to trigger swipe (default 80px)
}

interface SwipeState {
  swipeOffset: number;
  isSwipingLeft: boolean;
  isSwipingRight: boolean;
  swipeDirection: 'left' | 'right' | null;
}

interface SwipeHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
}

export function useSwipeGesture(options: SwipeGestureOptions): SwipeState & { swipeHandlers: SwipeHandlers } {
  const { onSwipeLeft, onSwipeRight, threshold = 80 } = options;

  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwipingLeft, setIsSwipingLeft] = useState(false);
  const [isSwipingRight, setIsSwipingRight] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);

  // Use ref to track current offset for touchEnd handler
  const swipeOffsetRef = useRef(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.targetTouches[0];
    setTouchStart({ x: touch.clientX, y: touch.clientY });
    setSwipeOffset(0);
    swipeOffsetRef.current = 0;
    setIsSwipingLeft(false);
    setIsSwipingRight(false);
    setSwipeDirection(null);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStart) return;

    const touch = e.targetTouches[0];
    const deltaX = touch.clientX - touchStart.x;
    const deltaY = touch.clientY - touchStart.y;

    // Only track horizontal swipes (ignore mostly vertical movements)
    if (Math.abs(deltaY) > Math.abs(deltaX)) {
      return;
    }

    setSwipeOffset(deltaX);
    swipeOffsetRef.current = deltaX;

    if (deltaX > 0) {
      setIsSwipingRight(true);
      setIsSwipingLeft(false);
      setSwipeDirection('right');
    } else if (deltaX < 0) {
      setIsSwipingLeft(true);
      setIsSwipingRight(false);
      setSwipeDirection('left');
    }
  }, [touchStart]);

  const handleTouchEnd = useCallback(() => {
    if (!touchStart) return;

    // Check if swipe threshold was met using ref value
    const currentOffset = swipeOffsetRef.current;
    if (Math.abs(currentOffset) >= threshold) {
      if (currentOffset > 0 && onSwipeRight) {
        onSwipeRight();
      } else if (currentOffset < 0 && onSwipeLeft) {
        onSwipeLeft();
      }
    }

    // Reset state
    setTouchStart(null);
    setSwipeOffset(0);
    swipeOffsetRef.current = 0;
    setIsSwipingLeft(false);
    setIsSwipingRight(false);
    setSwipeDirection(null);
  }, [touchStart, threshold, onSwipeLeft, onSwipeRight]);

  return {
    swipeOffset,
    isSwipingLeft,
    isSwipingRight,
    swipeDirection,
    swipeHandlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
  };
}
