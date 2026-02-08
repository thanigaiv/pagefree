import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';

interface ExternalLinksProps {
  service?: string;
  metadata?: Record<string, unknown> | null;
}

// Map services to external tool URLs
// In production, this would come from configuration
function getExternalLinks(service: string | undefined, metadata?: Record<string, unknown> | null) {
  const links: Array<{ name: string; url: string }> = [];

  // Guard against null/undefined metadata
  if (!metadata) {
    return links;
  }

  // DataDog dashboard
  if (metadata.datadog_dashboard_url || service) {
    const ddUrl = metadata.datadog_dashboard_url as string ||
      `https://app.datadoghq.com/apm/services/${service}`;
    links.push({ name: 'DataDog', url: ddUrl });
  }

  // Grafana
  if (metadata.grafana_url || service) {
    const grafanaUrl = metadata.grafana_url as string ||
      `https://grafana.example.com/d/service-dashboard?var-service=${service}`;
    links.push({ name: 'Grafana', url: grafanaUrl });
  }

  // Runbook
  if (metadata.runbook_url) {
    links.push({ name: 'Runbook', url: metadata.runbook_url as string });
  }

  // AWS CloudWatch
  if (metadata.cloudwatch_url) {
    links.push({ name: 'CloudWatch', url: metadata.cloudwatch_url as string });
  }

  return links;
}

export function ExternalLinks({ service, metadata }: ExternalLinksProps) {
  const links = getExternalLinks(service, metadata);

  if (links.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {links.map((link) => (
        <Button
          key={link.name}
          variant="outline"
          size="sm"
          asChild
        >
          <a href={link.url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4 mr-1" />
            {link.name}
          </a>
        </Button>
      ))}
    </div>
  );
}
