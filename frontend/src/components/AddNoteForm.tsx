import { useState } from 'react';
import { useAddNote } from '@/hooks/useAddNote';
import { MarkdownEditor } from './MarkdownEditor';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { MessageSquarePlus, Loader2, X } from 'lucide-react';

interface AddNoteFormProps {
  incidentId: string;
}

export function AddNoteForm({ incidentId }: AddNoteFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [note, setNote] = useState('');

  const addNoteMutation = useAddNote(incidentId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!note.trim()) {
      return;
    }

    addNoteMutation.mutate(
      { note: note.trim() },
      {
        onSuccess: () => {
          setNote('');
          setIsOpen(false);
        },
      }
    );
  };

  const handleCancel = () => {
    setNote('');
    setIsOpen(false);
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" size="sm" className="w-full justify-start">
          <MessageSquarePlus className="h-4 w-4 mr-2" />
          Add Note
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <form onSubmit={handleSubmit} className="mt-3 space-y-3">
          <MarkdownEditor
            value={note}
            onChange={setNote}
            placeholder="Add a note to this incident..."
            minRows={3}
            disabled={addNoteMutation.isPending}
            autoFocus
          />

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              disabled={addNoteMutation.isPending}
            >
              <X className="h-4 w-4 mr-1" />
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!note.trim() || addNoteMutation.isPending}
            >
              {addNoteMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Note'
              )}
            </Button>
          </div>
        </form>
      </CollapsibleContent>
    </Collapsible>
  );
}
