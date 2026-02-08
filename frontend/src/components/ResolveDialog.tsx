import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface ResolveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (resolutionNote?: string) => void;
  incidentCount?: number;
}

export function ResolveDialog({
  open,
  onOpenChange,
  onConfirm,
  incidentCount = 1,
}: ResolveDialogProps) {
  const [note, setNote] = useState('');

  const handleConfirm = () => {
    onConfirm(note || undefined);
    setNote('');
  };

  const title =
    incidentCount > 1
      ? `Resolve ${incidentCount} incidents?`
      : 'Resolve this incident?';

  const handleCancel = () => {
    setNote('');
    onOpenChange(false);
  };

  const handleResolve = () => {
    handleConfirm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            This will mark the incident(s) as resolved. You can optionally add a
            resolution note.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <Label htmlFor="resolution-note">Resolution Note (optional)</Label>
          <Textarea
            id="resolution-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Describe the resolution..."
            className="mt-2"
            rows={3}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleResolve}>
            Resolve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
