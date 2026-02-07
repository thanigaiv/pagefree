import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';

interface AddNoteResponse {
  success: boolean;
}

export function useAddNote(incidentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ note }: { note: string }) => {
      const response = await apiFetch<AddNoteResponse>(
        `/incidents/${incidentId}/notes`,
        {
          method: 'POST',
          body: JSON.stringify({ note }),
        }
      );
      return response;
    },
    onSuccess: () => {
      toast.success('Note added');

      // Invalidate timeline to show new note
      queryClient.invalidateQueries({
        queryKey: ['incidents', incidentId, 'timeline'],
      });
    },
    onError: (error) => {
      toast.error(`Failed to add note: ${error.message}`);
    },
  });
}
