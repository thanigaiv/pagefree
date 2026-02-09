/**
 * SchedulePage - Schedule list and override management
 *
 * Features:
 * - Grid of ScheduleCards with responsive layout
 * - Team filter dropdown
 * - Override list panel for each schedule
 * - Create override dialog
 * - Create swap dialog
 * - Delete override confirmation
 */

import { useState } from 'react';
import {
  Calendar,
  Plus,
  Filter,
  Loader2,
  Clock,
  User,
  Users,
  MoreVertical,
  Eye,
  Trash2,
  ArrowLeftRight,
  Globe,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import {
  useSchedules,
  useScheduleOverrides,
  useCreateOverride,
  useCreateSwap,
  useDeleteOverride,
  type Schedule,
  type ScheduleOverride,
  type CreateOverrideInput,
  type CreateSwapInput,
} from '@/hooks/useSchedules';
import { useTeams, useTeamWithMembers } from '@/hooks/useTeams';
import { formatDistanceToNow, format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

// =============================================================================
// TIMEZONE HELPERS
// =============================================================================

function formatTimezone(tz: string): string {
  // Convert IANA timezone to short format
  const shortMap: Record<string, string> = {
    'America/New_York': 'EST',
    'America/Chicago': 'CST',
    'America/Denver': 'MST',
    'America/Los_Angeles': 'PST',
    'Europe/London': 'GMT',
    'Europe/Paris': 'CET',
    'Asia/Tokyo': 'JST',
    'Asia/Singapore': 'SGT',
    'Australia/Sydney': 'AEST',
    UTC: 'UTC',
  };
  return shortMap[tz] || tz.split('/').pop()?.replace('_', ' ') || tz;
}

function formatHandoffTime(time: string): string {
  // Convert HH:MM to 12-hour format
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

// =============================================================================
// SCHEDULE CARD
// =============================================================================

interface ScheduleCardProps {
  schedule: Schedule;
  onViewOverrides: () => void;
  onCreateOverride: () => void;
  onCreateSwap: () => void;
  onViewDetails: () => void;
}

function ScheduleCard({
  schedule,
  onViewOverrides,
  onCreateOverride,
  onCreateSwap,
  onViewDetails,
}: ScheduleCardProps) {
  const rotationColors: Record<string, string> = {
    daily: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
    weekly: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
    custom: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  };

  const currentOnCallUserId = schedule.rotationUserIds[0];

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base font-medium truncate">
              {schedule.name}
            </CardTitle>
            <CardDescription className="line-clamp-2 mt-1">
              {schedule.description || 'No description'}
            </CardDescription>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onViewOverrides}>
                <Eye className="h-4 w-4 mr-2" />
                View Overrides
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onCreateOverride}>
                <Plus className="h-4 w-4 mr-2" />
                Create Override
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onCreateSwap}>
                <ArrowLeftRight className="h-4 w-4 mr-2" />
                Create Swap
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onViewDetails}>
                <Calendar className="h-4 w-4 mr-2" />
                View Details
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Badge variant="secondary" className="text-xs">
            <Users className="h-3 w-3 mr-1" />
            {schedule.team.name}
          </Badge>
          {schedule.isActive ? (
            <Badge
              variant="outline"
              className="text-xs bg-green-500/10 text-green-600 border-green-500/20"
            >
              Active
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="text-xs bg-gray-500/10 text-gray-600 border-gray-500/20"
            >
              Archived
            </Badge>
          )}
          <Badge
            variant="outline"
            className={cn('text-xs capitalize', rotationColors[schedule.rotationType])}
          >
            {schedule.rotationType}
          </Badge>
        </div>

        {/* Current On-Call Indicator */}
        {currentOnCallUserId && (
          <div className="flex items-center gap-2 mb-3 p-2 bg-muted rounded-md">
            <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-3 w-3 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium">Current On-Call</p>
              <p
                className="text-xs text-muted-foreground truncate"
                title="Based on rotation order"
              >
                {currentOnCallUserId.slice(0, 8)}...
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
          <div className="flex items-center gap-1">
            <Globe className="h-3 w-3" />
            {formatTimezone(schedule.timezone)}
          </div>
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Handoff: {formatHandoffTime(schedule.handoffTime)}
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t">
          <span className="text-xs text-muted-foreground">
            {schedule._count?.overrides || 0} override
            {(schedule._count?.overrides || 0) !== 1 ? 's' : ''}
          </span>
          <Button size="sm" variant="outline" onClick={onViewDetails}>
            View Details
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// LOADING SKELETON
// =============================================================================

function ScheduleCardSkeleton() {
  return (
    <div className="p-4 border rounded-lg space-y-3">
      <div className="flex items-start justify-between">
        <div className="space-y-2 flex-1">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-full" />
        </div>
        <Skeleton className="h-8 w-8 rounded" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-5 w-14 rounded-full" />
      </div>
      <Skeleton className="h-16 w-full rounded" />
      <div className="flex justify-between pt-2 border-t">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-24 rounded" />
      </div>
    </div>
  );
}

// =============================================================================
// SCHEDULE DETAILS DIALOG
// =============================================================================

interface ScheduleDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule: Schedule | null;
}

function ScheduleDetailsDialog({
  open,
  onOpenChange,
  schedule,
}: ScheduleDetailsDialogProps) {
  if (!schedule) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{schedule.name}</DialogTitle>
          <DialogDescription>
            {schedule.description || 'No description provided'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Team and Status */}
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">
              <Users className="h-3 w-3 mr-1" />
              {schedule.team.name}
            </Badge>
            {schedule.isActive ? (
              <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                Active
              </Badge>
            ) : (
              <Badge variant="secondary">Archived</Badge>
            )}
          </div>

          {/* Schedule Info */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-medium">Timezone</p>
              <p className="text-muted-foreground">{schedule.timezone}</p>
            </div>
            <div>
              <p className="font-medium">Handoff Time</p>
              <p className="text-muted-foreground">
                {formatHandoffTime(schedule.handoffTime)}
              </p>
            </div>
            <div>
              <p className="font-medium">Rotation Type</p>
              <p className="text-muted-foreground capitalize">
                {schedule.rotationType}
                {schedule.rotationType === 'custom' &&
                  ` (${schedule.rotationIntervalDays} days)`}
              </p>
            </div>
            <div>
              <p className="font-medium">Start Date</p>
              <p className="text-muted-foreground">
                {format(parseISO(schedule.startDate), 'MMM d, yyyy')}
              </p>
            </div>
          </div>

          {/* Rotation Order */}
          <div>
            <p className="font-medium mb-2">Rotation Order</p>
            <div className="space-y-2">
              {schedule.rotationUserIds.map((userId, index) => (
                <div
                  key={userId}
                  className="flex items-center gap-2 p-2 bg-muted rounded"
                >
                  <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
                    {index + 1}
                  </div>
                  <span className="text-sm text-muted-foreground truncate">
                    {userId}
                  </span>
                  {index === 0 && (
                    <Badge variant="secondary" className="text-xs ml-auto">
                      Current
                    </Badge>
                  )}
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Note: Full on-call computation requires RRULE evaluation. Showing
              rotation order.
            </p>
          </div>

          {/* Layers */}
          {schedule.layers && schedule.layers.length > 0 && (
            <div>
              <p className="font-medium mb-2">Layers</p>
              <div className="space-y-2">
                {schedule.layers
                  .sort((a, b) => a.priority - b.priority)
                  .map((layer) => (
                    <div
                      key={layer.id}
                      className="flex items-center justify-between p-2 bg-muted rounded"
                    >
                      <div>
                        <p className="text-sm font-medium">{layer.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Priority: {layer.priority}
                        </p>
                      </div>
                      {layer.isActive ? (
                        <Badge variant="secondary" className="text-xs">
                          Active
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-xs text-muted-foreground"
                        >
                          Inactive
                        </Badge>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// OVERRIDES PANEL
// =============================================================================

interface OverridesPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule: Schedule | null;
  onDeleteOverride: (override: ScheduleOverride) => void;
}

function OverridesPanel({
  open,
  onOpenChange,
  schedule,
  onDeleteOverride,
}: OverridesPanelProps) {
  const { data: overrides, isLoading } = useScheduleOverrides(schedule?.id);

  if (!schedule) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Overrides</DialogTitle>
          <DialogDescription>
            {schedule.name} - Current and upcoming overrides
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isLoading && (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          )}

          {!isLoading && (!overrides || overrides.length === 0) && (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">No overrides</p>
              <p className="text-sm mt-1">
                Create an override to temporarily change on-call coverage.
              </p>
            </div>
          )}

          {!isLoading && overrides && overrides.length > 0 && (
            <div className="space-y-3">
              {overrides.map((override) => (
                <Card key={override.id} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-xs',
                            override.overrideType === 'SWAP'
                              ? 'bg-purple-500/10 text-purple-600'
                              : 'bg-blue-500/10 text-blue-600'
                          )}
                        >
                          {override.overrideType}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(parseISO(override.startTime), {
                            addSuffix: true,
                          })}
                        </span>
                      </div>

                      <div className="text-sm">
                        <p className="font-medium">
                          {override.user.firstName} {override.user.lastName}
                        </p>
                        {override.originalUser && (
                          <p className="text-xs text-muted-foreground">
                            Replacing: {override.originalUser.firstName}{' '}
                            {override.originalUser.lastName}
                          </p>
                        )}
                      </div>

                      <div className="text-xs text-muted-foreground mt-1">
                        {format(parseISO(override.startTime), 'MMM d, h:mm a')} -{' '}
                        {format(parseISO(override.endTime), 'MMM d, h:mm a')}
                      </div>

                      {override.reason && (
                        <p className="text-xs text-muted-foreground mt-1 italic">
                          "{override.reason}"
                        </p>
                      )}
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => onDeleteOverride(override)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// CREATE OVERRIDE DIALOG
// =============================================================================

interface CreateOverrideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule: Schedule | null;
  onSubmit: (input: CreateOverrideInput) => void;
  isSubmitting: boolean;
}

function CreateOverrideDialog({
  open,
  onOpenChange,
  schedule,
  onSubmit,
  isSubmitting,
}: CreateOverrideDialogProps) {
  const [userId, setUserId] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const { data: teamData } = useTeamWithMembers(schedule?.teamId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!userId) {
      setError('Please select a user');
      return;
    }
    if (!startTime || !endTime) {
      setError('Please specify start and end times');
      return;
    }
    if (new Date(endTime) <= new Date(startTime)) {
      setError('End time must be after start time');
      return;
    }

    onSubmit({
      userId,
      startTime: new Date(startTime).toISOString(),
      endTime: new Date(endTime).toISOString(),
      reason: reason || undefined,
    });
  };

  // Reset form when dialog closes
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setUserId('');
      setStartTime('');
      setEndTime('');
      setReason('');
      setError('');
    }
    onOpenChange(newOpen);
  };

  if (!schedule) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Override</DialogTitle>
          <DialogDescription>
            Create a temporary override for {schedule.name}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="override-user">Covering User *</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger id="override-user">
                <SelectValue placeholder="Select user" />
              </SelectTrigger>
              <SelectContent>
                {teamData?.members?.map((member) => (
                  <SelectItem key={member.userId} value={member.userId}>
                    {member.user.firstName} {member.user.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="override-start">Start Time *</Label>
              <Input
                id="override-start"
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="override-end">End Time *</Label>
              <Input
                id="override-end"
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="override-reason">Reason (optional)</Label>
            <Textarea
              id="override-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Covering for vacation"
              rows={2}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Override
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// CREATE SWAP DIALOG
// =============================================================================

interface CreateSwapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule: Schedule | null;
  onSubmit: (input: CreateSwapInput) => void;
  isSubmitting: boolean;
}

function CreateSwapDialog({
  open,
  onOpenChange,
  schedule,
  onSubmit,
  isSubmitting,
}: CreateSwapDialogProps) {
  const [originalUserId, setOriginalUserId] = useState('');
  const [newUserId, setNewUserId] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const { data: teamData } = useTeamWithMembers(schedule?.teamId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!originalUserId || !newUserId) {
      setError('Please select both users');
      return;
    }
    if (originalUserId === newUserId) {
      setError('Users must be different');
      return;
    }
    if (!startTime || !endTime) {
      setError('Please specify start and end times');
      return;
    }
    if (new Date(endTime) <= new Date(startTime)) {
      setError('End time must be after start time');
      return;
    }

    onSubmit({
      originalUserId,
      newUserId,
      startTime: new Date(startTime).toISOString(),
      endTime: new Date(endTime).toISOString(),
      reason: reason || undefined,
    });
  };

  // Reset form when dialog closes
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setOriginalUserId('');
      setNewUserId('');
      setStartTime('');
      setEndTime('');
      setReason('');
      setError('');
    }
    onOpenChange(newOpen);
  };

  if (!schedule) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Shift Swap</DialogTitle>
          <DialogDescription>
            Swap shifts between two users on {schedule.name}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="swap-original">Original User *</Label>
            <Select value={originalUserId} onValueChange={setOriginalUserId}>
              <SelectTrigger id="swap-original">
                <SelectValue placeholder="Who has the original shift?" />
              </SelectTrigger>
              <SelectContent>
                {teamData?.members?.map((member) => (
                  <SelectItem key={member.userId} value={member.userId}>
                    {member.user.firstName} {member.user.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="swap-new">New User *</Label>
            <Select value={newUserId} onValueChange={setNewUserId}>
              <SelectTrigger id="swap-new">
                <SelectValue placeholder="Who is taking over?" />
              </SelectTrigger>
              <SelectContent>
                {teamData?.members?.map((member) => (
                  <SelectItem
                    key={member.userId}
                    value={member.userId}
                    disabled={member.userId === originalUserId}
                  >
                    {member.user.firstName} {member.user.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="swap-start">Start Time *</Label>
              <Input
                id="swap-start"
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="swap-end">End Time *</Label>
              <Input
                id="swap-end"
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="swap-reason">Reason (optional)</Label>
            <Textarea
              id="swap-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Personal appointment"
              rows={2}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Swap
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function SchedulePage() {
  const { toast } = useToast();

  // Filters
  const [teamFilter, setTeamFilter] = useState<string>('all');

  // Dialog states
  const [detailsSchedule, setDetailsSchedule] = useState<Schedule | null>(null);
  const [overridesSchedule, setOverridesSchedule] = useState<Schedule | null>(null);
  const [createOverrideSchedule, setCreateOverrideSchedule] = useState<Schedule | null>(
    null
  );
  const [createSwapSchedule, setCreateSwapSchedule] = useState<Schedule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    schedule: Schedule;
    override: ScheduleOverride;
  } | null>(null);

  // Data fetching
  const {
    data: schedules,
    isLoading,
    error,
  } = useSchedules({
    teamId: teamFilter === 'all' ? undefined : teamFilter,
  });

  const { data: teams } = useTeams();

  // Mutations - need to get scheduleId dynamically
  const createOverrideMutation = useCreateOverride(createOverrideSchedule?.id || '');
  const createSwapMutation = useCreateSwap(createSwapSchedule?.id || '');
  const deleteOverrideMutation = useDeleteOverride(deleteTarget?.schedule.id || '');

  // Handlers
  const handleCreateOverride = async (input: CreateOverrideInput) => {
    try {
      await createOverrideMutation.mutateAsync(input);
      setCreateOverrideSchedule(null);
      toast({
        title: 'Override created',
        description: 'The override has been created successfully.',
      });
    } catch (err) {
      toast({
        title: 'Failed to create override',
        description: err instanceof Error ? err.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  const handleCreateSwap = async (input: CreateSwapInput) => {
    try {
      await createSwapMutation.mutateAsync(input);
      setCreateSwapSchedule(null);
      toast({
        title: 'Swap created',
        description: 'The shift swap has been created successfully.',
      });
    } catch (err) {
      toast({
        title: 'Failed to create swap',
        description: err instanceof Error ? err.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteOverride = async () => {
    if (!deleteTarget) return;
    try {
      await deleteOverrideMutation.mutateAsync(deleteTarget.override.id);
      setDeleteTarget(null);
      toast({
        title: 'Override deleted',
        description: 'The override has been deleted.',
      });
    } catch (err) {
      toast({
        title: 'Failed to delete override',
        description: err instanceof Error ? err.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="container mx-auto py-6 px-4 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Calendar className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Schedules</h1>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* Team filter */}
        <Select
          value={teamFilter}
          onValueChange={(v) => setTeamFilter(v)}
        >
          <SelectTrigger className="w-[200px]">
            <Filter className="h-4 w-4 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="Filter by team" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Teams</SelectItem>
            {teams?.map((team) => (
              <SelectItem key={team.id} value={team.id}>
                {team.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <ScheduleCardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Error state */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            Failed to load schedules. Please try again.
          </AlertDescription>
        </Alert>
      )}

      {/* Empty state */}
      {!isLoading && (!schedules || schedules.length === 0) && (
        <div className="text-center py-12 text-muted-foreground">
          <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="font-medium">No schedules found</p>
          <p className="text-sm mt-1">
            {teamFilter !== 'all'
              ? 'Try selecting a different team or create schedules via the admin panel.'
              : 'Create schedules via the admin panel to manage on-call rotations.'}
          </p>
        </div>
      )}

      {/* Schedule grid */}
      {!isLoading && schedules && schedules.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {schedules.map((schedule) => (
            <ScheduleCard
              key={schedule.id}
              schedule={schedule}
              onViewDetails={() => setDetailsSchedule(schedule)}
              onViewOverrides={() => setOverridesSchedule(schedule)}
              onCreateOverride={() => setCreateOverrideSchedule(schedule)}
              onCreateSwap={() => setCreateSwapSchedule(schedule)}
            />
          ))}
        </div>
      )}

      {/* Schedule Details Dialog */}
      <ScheduleDetailsDialog
        open={!!detailsSchedule}
        onOpenChange={(open) => !open && setDetailsSchedule(null)}
        schedule={detailsSchedule}
      />

      {/* Overrides Panel */}
      <OverridesPanel
        open={!!overridesSchedule}
        onOpenChange={(open) => !open && setOverridesSchedule(null)}
        schedule={overridesSchedule}
        onDeleteOverride={(override) =>
          setDeleteTarget({ schedule: overridesSchedule!, override })
        }
      />

      {/* Create Override Dialog */}
      <CreateOverrideDialog
        open={!!createOverrideSchedule}
        onOpenChange={(open) => !open && setCreateOverrideSchedule(null)}
        schedule={createOverrideSchedule}
        onSubmit={handleCreateOverride}
        isSubmitting={createOverrideMutation.isPending}
      />

      {/* Create Swap Dialog */}
      <CreateSwapDialog
        open={!!createSwapSchedule}
        onOpenChange={(open) => !open && setCreateSwapSchedule(null)}
        schedule={createSwapSchedule}
        onSubmit={handleCreateSwap}
        isSubmitting={createSwapMutation.isPending}
      />

      {/* Delete Override Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Override</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this override? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteOverride}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
