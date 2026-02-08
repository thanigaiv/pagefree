import { useState } from 'react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useCreateActionItem,
  useUpdateActionItem,
  useDeleteActionItem,
} from '@/hooks/usePostmortems';
import { useTeamWithMembers } from '@/hooks/useTeams';
import type { ActionItem, ActionItemStatus, ActionItemPriority } from '@/types/postmortem';
import { Plus, Trash2, Calendar, User } from 'lucide-react';

interface ActionItemListProps {
  postmortemId: string;
  teamId: string;
  actionItems: ActionItem[];
  readOnly?: boolean;
}

const priorityColors: Record<ActionItemPriority, string> = {
  HIGH: 'bg-red-100 text-red-700 border-red-200',
  MEDIUM: 'bg-orange-100 text-orange-700 border-orange-200',
  LOW: 'bg-gray-100 text-gray-700 border-gray-200',
};

const statusColors: Record<ActionItemStatus, string> = {
  OPEN: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  IN_PROGRESS: 'bg-blue-100 text-blue-700 border-blue-200',
  COMPLETED: 'bg-green-100 text-green-700 border-green-200',
};

export function ActionItemList({
  postmortemId,
  teamId,
  actionItems,
  readOnly = false,
}: ActionItemListProps) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newItem, setNewItem] = useState({
    title: '',
    description: '',
    priority: 'MEDIUM' as ActionItemPriority,
    assigneeId: '',
    dueDate: '',
  });

  const { data: team } = useTeamWithMembers(teamId);
  const createMutation = useCreateActionItem();
  const updateMutation = useUpdateActionItem();
  const deleteMutation = useDeleteActionItem();

  const openCount = actionItems.filter((item) => item.status !== 'COMPLETED').length;
  const teamMembers = team?.members ?? [];

  const handleAddItem = async () => {
    if (!newItem.title.trim() || !newItem.assigneeId) return;

    await createMutation.mutateAsync({
      postmortemId,
      data: {
        title: newItem.title.trim(),
        description: newItem.description.trim() || undefined,
        priority: newItem.priority,
        assigneeId: newItem.assigneeId,
        dueDate: newItem.dueDate || undefined,
      },
    });

    setNewItem({
      title: '',
      description: '',
      priority: 'MEDIUM',
      assigneeId: '',
      dueDate: '',
    });
    setIsAddDialogOpen(false);
  };

  const handleToggleComplete = async (item: ActionItem) => {
    const newStatus: ActionItemStatus =
      item.status === 'COMPLETED' ? 'OPEN' : 'COMPLETED';
    await updateMutation.mutateAsync({
      postmortemId,
      itemId: item.id,
      data: { status: newStatus },
    });
  };

  const handleStatusChange = async (item: ActionItem, status: ActionItemStatus) => {
    await updateMutation.mutateAsync({
      postmortemId,
      itemId: item.id,
      data: { status },
    });
  };

  const handleDelete = async (itemId: string) => {
    await deleteMutation.mutateAsync({ postmortemId, itemId });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {openCount} open item{openCount !== 1 ? 's' : ''}
        </div>
        {!readOnly && (
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Add Action
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Action Item</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title *</Label>
                  <Input
                    id="title"
                    value={newItem.title}
                    onChange={(e) =>
                      setNewItem((prev) => ({ ...prev, title: e.target.value }))
                    }
                    placeholder="What needs to be done?"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={newItem.description}
                    onChange={(e) =>
                      setNewItem((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                    placeholder="Additional details..."
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Priority</Label>
                    <Select
                      value={newItem.priority}
                      onValueChange={(value: ActionItemPriority) =>
                        setNewItem((prev) => ({ ...prev, priority: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="HIGH">High</SelectItem>
                        <SelectItem value="MEDIUM">Medium</SelectItem>
                        <SelectItem value="LOW">Low</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Assignee *</Label>
                    <Select
                      value={newItem.assigneeId}
                      onValueChange={(value) =>
                        setNewItem((prev) => ({ ...prev, assigneeId: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select assignee" />
                      </SelectTrigger>
                      <SelectContent>
                        {teamMembers.map((member) => (
                          <SelectItem key={member.userId} value={member.userId}>
                            {member.user.firstName} {member.user.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dueDate">Due Date</Label>
                  <Input
                    id="dueDate"
                    type="date"
                    value={newItem.dueDate}
                    onChange={(e) =>
                      setNewItem((prev) => ({ ...prev, dueDate: e.target.value }))
                    }
                  />
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button
                  onClick={handleAddItem}
                  disabled={
                    !newItem.title.trim() ||
                    !newItem.assigneeId ||
                    createMutation.isPending
                  }
                >
                  {createMutation.isPending ? 'Adding...' : 'Add Item'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Action Items List */}
      {actionItems.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p>No action items yet</p>
          {!readOnly && (
            <p className="text-sm">Add action items to track follow-up work</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {actionItems.map((item) => {
            const isCompleted = item.status === 'COMPLETED';
            const assigneeName = item.assignee
              ? `${item.assignee.firstName} ${item.assignee.lastName}`
              : 'Unassigned';

            return (
              <div
                key={item.id}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-lg border bg-white',
                  isCompleted && 'bg-gray-50'
                )}
              >
                {/* Completion checkbox */}
                <Checkbox
                  checked={isCompleted}
                  onCheckedChange={() => handleToggleComplete(item)}
                  disabled={readOnly && !isCompleted}
                  className="mt-0.5"
                />

                {/* Item content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={cn(
                        'font-medium text-sm',
                        isCompleted && 'line-through text-muted-foreground'
                      )}
                    >
                      {item.title}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn('text-xs', priorityColors[item.priority])}
                    >
                      {item.priority}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={cn('text-xs', statusColors[item.status])}
                    >
                      {item.status.replace('_', ' ')}
                    </Badge>
                  </div>

                  {item.description && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {item.description}
                    </p>
                  )}

                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {assigneeName}
                    </span>
                    {item.dueDate && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Due {format(new Date(item.dueDate), 'MMM d, yyyy')}
                      </span>
                    )}
                    {item.completedAt && (
                      <span className="text-green-600">
                        Completed {format(new Date(item.completedAt), 'MMM d, yyyy')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {/* Status dropdown (hidden when completed or readOnly) */}
                  {!isCompleted && !readOnly && (
                    <Select
                      value={item.status}
                      onValueChange={(value: ActionItemStatus) =>
                        handleStatusChange(item, value)
                      }
                    >
                      <SelectTrigger className="w-[130px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="OPEN">Open</SelectItem>
                        <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                        <SelectItem value="COMPLETED">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                  )}

                  {/* Delete button */}
                  {!readOnly && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Action Item</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete "{item.title}"? This
                            action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(item.id)}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
