import { NavLink } from 'react-router-dom';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/utils';
import { AlertCircle, Calendar, User, Workflow, BarChart3 } from 'lucide-react';

const navItems = [
  {
    to: '/incidents',
    icon: AlertCircle,
    label: 'Incidents',
  },
  {
    to: '/workflows',
    icon: Workflow,
    label: 'Workflows',
  },
  {
    to: '/status-pages',
    icon: BarChart3,
    label: 'Status',
  },
  {
    to: '/schedule',
    icon: Calendar,
    label: 'Schedule',
  },
  {
    to: '/profile',
    icon: User,
    label: 'Profile',
  },
];

export function BottomNav() {
  const isMobile = useIsMobile();

  // Only show on mobile (per user decision)
  if (!isMobile) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background border-t z-40 pb-safe">
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center justify-center flex-1 h-full',
                'text-muted-foreground transition-colors',
                isActive && 'text-primary'
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon
                  className={cn(
                    'h-6 w-6',
                    isActive && 'text-primary'
                  )}
                />
                <span className="text-xs mt-1">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
