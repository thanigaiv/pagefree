import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Bell, Workflow, Settings, Shield, BarChart3, Server } from 'lucide-react';

export default function AdminPage() {
  const adminSections = [
    {
      title: 'Teams',
      description: 'Manage teams, members, and permissions',
      icon: Users,
      link: '/admin/teams',
      color: 'text-blue-500',
      bgColor: 'bg-blue-50',
    },
    {
      title: 'Escalation Policies',
      description: 'Configure on-call schedules and escalation rules',
      icon: Bell,
      link: '/admin/escalation-policies',
      color: 'text-orange-500',
      bgColor: 'bg-orange-50',
    },
    {
      title: 'Services',
      description: 'Manage service catalog and alert routing keys',
      icon: Server,
      link: '/admin/services',
      color: 'text-cyan-500',
      bgColor: 'bg-cyan-50',
    },
    {
      title: 'Integrations',
      description: 'Configure webhook integrations and API keys',
      icon: Workflow,
      link: '/integrations',
      color: 'text-purple-500',
      bgColor: 'bg-purple-50',
    },
    {
      title: 'Status Pages',
      description: 'Manage public status pages and components',
      icon: BarChart3,
      link: '/status-pages',
      color: 'text-green-500',
      bgColor: 'bg-green-50',
    },
    {
      title: 'Users',
      description: 'Manage platform users and access',
      icon: Shield,
      link: '/admin/users',
      color: 'text-red-500',
      bgColor: 'bg-red-50',
      comingSoon: true,
    },
    {
      title: 'Settings',
      description: 'Platform configuration and preferences',
      icon: Settings,
      link: '/admin/settings',
      color: 'text-gray-500',
      bgColor: 'bg-gray-50',
      comingSoon: true,
    },
  ];

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Admin Dashboard</h1>
        <p className="text-muted-foreground">
          Manage teams, escalation policies, integrations, and platform settings
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {adminSections.map((section) => (
          <Link
            key={section.title}
            to={section.link}
            className={`block transition-transform hover:scale-105 ${
              section.comingSoon ? 'pointer-events-none opacity-60' : ''
            }`}
          >
            <Card className="h-full hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-lg ${section.bgColor}`}>
                    <section.icon className={`h-6 w-6 ${section.color}`} />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-lg flex items-center gap-2">
                      {section.title}
                      {section.comingSoon && (
                        <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded">
                          Coming Soon
                        </span>
                      )}
                    </CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription>{section.description}</CardDescription>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
