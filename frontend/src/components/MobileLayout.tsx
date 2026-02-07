import type { ReactNode } from 'react';
import { BottomNav } from './BottomNav';
import { useIsMobile } from '@/hooks/useMediaQuery';

interface MobileLayoutProps {
  children: ReactNode;
}

export function MobileLayout({ children }: MobileLayoutProps) {
  const isMobile = useIsMobile();

  return (
    <div className="min-h-screen">
      <main className={isMobile ? 'pb-20' : ''}>
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
