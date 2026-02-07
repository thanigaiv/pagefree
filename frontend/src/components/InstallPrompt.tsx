import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

interface InstallPromptProps {
  onInstall: () => void;
  canInstall: boolean;
}

export function InstallPrompt({ onInstall, canInstall }: InstallPromptProps) {
  if (!canInstall) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onInstall}
      className="gap-2"
    >
      <Download className="h-4 w-4" />
      Install App
    </Button>
  );
}
