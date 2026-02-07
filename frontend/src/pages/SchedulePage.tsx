import { Calendar } from 'lucide-react';

export default function SchedulePage() {
  return (
    <div className="container mx-auto py-6 px-4 max-w-4xl">
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Calendar className="h-16 w-16 text-muted-foreground mb-4" />
        <h1 className="text-2xl font-bold mb-2">Schedule</h1>
        <p className="text-muted-foreground max-w-md">
          View on-call schedules and rotations. This feature connects to the
          schedule management system built in Phase 3.
        </p>
        <p className="text-sm text-muted-foreground mt-4">
          Coming soon: View who's on-call, manage overrides, and swap shifts.
        </p>
      </div>
    </div>
  );
}
