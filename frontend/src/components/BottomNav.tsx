import { NavLink } from 'react-router-dom';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { useIsPlatformAdmin } from '@/hooks/useCurrentUser';
import { cn } from '@/lib/utils';
import { AlertCircle, Calendar, User, Workflow, BarChart3, FileText, Settings } from 'lucide-react';

const baseNavItems = [
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
    to: '/postmortems',
    icon: FileText,
    label: 'Postmortems',
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

const adminNavItem = {
  to: '/integrations',
  icon: Settings,
  label: 'Admin',
  adminOnly: true
};

export function BottomNav() {
  const isMobile = useIsMobile();
  const isPlatformAdmin = useIsPlatformAdmin();

  // Only show on mobile (per user decision)
  if (!isMobile) return null;

  // Add admin item if user is platform admin
  const navItems = isPlatformAdmin
    ? [...baseNavItems.slice(0, 5), adminNavItem, baseNavItems[5]]
    : baseNavItems;

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
