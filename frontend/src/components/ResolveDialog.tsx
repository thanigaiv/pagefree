import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            This will mark the incident(s) as resolved. You can optionally add a
            resolution note.
          </AlertDialogDescription>
        </AlertDialogHeader>

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

        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setNote('')}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm}>
            Resolve
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
