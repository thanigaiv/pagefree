import type { ReactNode } from 'react';
import { BottomNav } from './BottomNav';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';

interface MobileLayoutProps {
  children: ReactNode;
}

export function MobileLayout({ children }: MobileLayoutProps) {
  const isMobile = useIsMobile();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 bg-background border-b">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between max-w-7xl">
          <Link to="/incidents" className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            <span className="text-lg font-bold tracking-tight">PageFree</span>
          </Link>
        </div>
      </header>
      <main className={isMobile ? 'pb-20' : ''}>
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
