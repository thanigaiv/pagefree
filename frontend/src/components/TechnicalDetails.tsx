import { useState } from 'react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { ChevronDown, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TechnicalDetailsProps {
  metadata?: Record<string, unknown> | null;
  alerts?: Array<{
    id: string;
    title: string;
    severity: string;
    triggeredAt: string;
    externalId?: string;
  }>;
}

export function TechnicalDetails({ metadata, alerts }: TechnicalDetailsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const jsonContent = JSON.stringify({ metadata: metadata || {}, alerts }, null, 2);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(jsonContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="w-full justify-between">
          <span className="text-sm font-medium">Technical Details</span>
          <ChevronDown
            className={cn(
              'h-4 w-4 transition-transform',
              isOpen && 'rotate-180'
            )}
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 p-4 bg-muted rounded-lg">
          <div className="flex justify-end mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="h-8"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-1" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-1" />
                  Copy JSON
                </>
              )}
            </Button>
          </div>
          <pre className="text-xs overflow-x-auto whitespace-pre-wrap font-mono">
            {jsonContent}
          </pre>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
