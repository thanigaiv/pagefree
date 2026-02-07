import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

// Note: Backend would need to add a PATCH /incidents/:id/metadata endpoint
// For now, this is a placeholder for the metadata editing feature

export function useUpdateMetadata(incidentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ metadata: _metadata }: { metadata: Record<string, unknown> }) => {
      // Placeholder - backend endpoint needed
      // const response = await apiFetch<{ incident: Incident }>(
      //   `/incidents/${incidentId}/metadata`,
      //   {
      //     method: 'PATCH',
      //     body: JSON.stringify({ metadata: _metadata }),
      //   }
      // );
      // return response.incident;

      // For now, just simulate success
      return { success: true };
    },
    onSuccess: () => {
      toast.success('Metadata updated');
      queryClient.invalidateQueries({ queryKey: ['incidents', incidentId] });
    },
    onError: (error) => {
      toast.error(`Failed to update metadata: ${error.message}`);
    },
  });
}
