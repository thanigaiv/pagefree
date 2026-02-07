import type { ReactNode } from 'react';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/utils';
import { Check, MoreHorizontal } from 'lucide-react';

interface SwipeableRowProps {
  children: ReactNode;
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  rightLabel?: string;
  leftLabel?: string;
  disabled?: boolean;
}

export function SwipeableRow({
  children,
  onSwipeRight,
  onSwipeLeft,
  rightLabel = 'Acknowledge',
  leftLabel = 'Options',
  disabled = false,
}: SwipeableRowProps) {
  const isMobile = useIsMobile();

  const { swipeHandlers, swipeOffset, isSwipingRight, isSwipingLeft } = useSwipeGesture({
    onSwipeRight: disabled ? undefined : onSwipeRight,
    onSwipeLeft: disabled ? undefined : onSwipeLeft,
  });

  // Don't enable swipe on desktop
  if (!isMobile) {
    return <>{children}</>;
  }

  return (
    <div className="relative overflow-hidden">
      {/* Background actions revealed by swipe */}
      <div className="absolute inset-0 flex">
        {/* Right swipe background (acknowledge) */}
        <div
          className={cn(
            'flex-1 flex items-center justify-start px-4 transition-colors',
            isSwipingRight ? 'bg-green-500' : 'bg-green-400'
          )}
        >
          <div className="flex items-center gap-2 text-white font-medium">
            <Check className="h-5 w-5" />
            <span>{rightLabel}</span>
          </div>
        </div>

        {/* Left swipe background (options) */}
        <div
          className={cn(
            'flex-1 flex items-center justify-end px-4 transition-colors',
            isSwipingLeft ? 'bg-gray-600' : 'bg-gray-500'
          )}
        >
          <div className="flex items-center gap-2 text-white font-medium">
            <span>{leftLabel}</span>
            <MoreHorizontal className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Swipeable content */}
      <div
        {...swipeHandlers}
        className="relative bg-background transition-transform"
        style={{
          transform: `translateX(${swipeOffset}px)`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
