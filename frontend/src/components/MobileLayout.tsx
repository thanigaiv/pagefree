import type { ReactNode } from 'react';
import { BottomNav } from './BottomNav';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { useIsPlatformAdmin } from '@/hooks/useCurrentUser';
import { Link, NavLink } from 'react-router-dom';
import { Bell, Settings, AlertCircle, Workflow, BarChart3, FileText, Calendar, User } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MobileLayoutProps {
  children: ReactNode;
}

export function MobileLayout({ children }: MobileLayoutProps) {
  const isMobile = useIsMobile();
  const isPlatformAdmin = useIsPlatformAdmin();

  const desktopNavItems = [
    { to: '/incidents', icon: AlertCircle, label: 'Incidents' },
    { to: '/workflows', icon: Workflow, label: 'Workflows' },
    { to: '/status-pages', icon: BarChart3, label: 'Status' },
    { to: '/postmortems', icon: FileText, label: 'Postmortems' },
    { to: '/schedule', icon: Calendar, label: 'Schedule' },
    ...(isPlatformAdmin ? [{ to: '/integrations', icon: Settings, label: 'Admin' }] : []),
    { to: '/profile', icon: User, label: 'Profile' },
  ];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 bg-background border-b">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between max-w-7xl">
          <Link to="/incidents" className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            <span className="text-lg font-bold tracking-tight">PageFree</span>
          </Link>

          {/* Desktop Navigation */}
          {!isMobile && (
            <nav className="flex items-center gap-1">
              {desktopNavItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                      'hover:bg-accent hover:text-accent-foreground',
                      isActive
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground'
                    )
                  }
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </nav>
          )}
        </div>
      </header>
      <main className={isMobile ? 'pb-20' : ''}>
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
