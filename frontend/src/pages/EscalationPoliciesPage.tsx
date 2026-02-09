import { useState } from 'react';
import { useTeams, useTeamWithMembers } from '@/hooks/useTeams';
import {
  useEscalationPoliciesByTeam,
  useCreateEscalationPolicy,
  useDeleteEscalationPolicy,
  useEscalationPolicy,
  useCreateEscalationLevel,
  useDeleteEscalationLevel,
  useUpdateEscalationLevel,
  useSchedulesByTeam,
} from '@/hooks/useEscalationPolicies';
import type { EscalationLevel } from '@/hooks/useEscalationPolicies';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Bell, Plus, MoreVertical, Edit, Trash2, Loader2, Clock, ArrowRight, Users, Calendar, User } from 'lucide-react';
import { toast } from 'sonner';

type TargetType = 'user' | 'schedule' | 'entire_team';

interface LevelFormData {
  levelNumber: number;
  targetType: TargetType;
  targetId: string;
  timeoutMinutes: number;
}

const defaultLevelForm: LevelFormData = {
  levelNumber: 1,
  targetType: 'user',
  targetId: '',
  timeoutMinutes: 30,
};

export default function EscalationPoliciesPage() {
  const { data: teams } = useTeams();
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const { data: policies, isLoading } = useEscalationPoliciesByTeam(selectedTeamId);
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null);
  const { data: selectedPolicy, refetch: refetchPolicy } = useEscalationPolicy(selectedPolicyId || undefined);

  // Get team members and schedules for the selected policy's team
  const policyTeamId = selectedPolicy?.teamId;
  const { data: teamWithMembers } = useTeamWithMembers(policyTeamId);
  const { data: schedules } = useSchedulesByTeam(policyTeamId);

  const createMutation = useCreateEscalationPolicy();
  const deleteMutation = useDeleteEscalationPolicy();
  const createLevelMutation = useCreateEscalationLevel();
  const deleteLevelMutation = useDeleteEscalationLevel();
  const updateLevelMutation = useUpdateEscalationLevel();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [policyToDelete, setPolicyToDelete] = useState<any>(null);

  // Level management state
  const [levelForm, setLevelForm] = useState<LevelFormData>(defaultLevelForm);
  const [editingLevel, setEditingLevel] = useState<EscalationLevel | null>(null);
  const [levelToDelete, setLevelToDelete] = useState<EscalationLevel | null>(null);
  const [isDeleteLevelOpen, setIsDeleteLevelOpen] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    teamId: '',
    repeatCount: 3,
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim() || !formData.teamId) {
      toast.error('Name and team are required');
      return;
    }

    try {
      await createMutation.mutateAsync({
        name: formData.name,
        description: formData.description || undefined,
        teamId: formData.teamId,
        repeatCount: formData.repeatCount,
      });
      toast.success('Escalation policy created - Click on it to add escalation levels');
      setIsCreateOpen(false);
      setFormData({ name: '', description: '', teamId: '', repeatCount: 3 });
      // Auto-select the team if it was just created
      setSelectedTeamId(formData.teamId);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to create escalation policy');
    }
  };

  const handleDelete = async () => {
    if (!policyToDelete) return;

    try {
      await deleteMutation.mutateAsync(policyToDelete.id);
      toast.success('Escalation policy deleted');
      setIsDeleteOpen(false);
      setPolicyToDelete(null);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete escalation policy');
    }
  };

  const openDeleteDialog = (policy: any) => {
    setPolicyToDelete(policy);
    setIsDeleteOpen(true);
  };

  const viewPolicy = (policyId: string) => {
    setSelectedPolicyId(policyId);
    setIsViewOpen(true);
    resetLevelForm();
  };

  // Level management handlers
  const resetLevelForm = () => {
    setLevelForm(defaultLevelForm);
    setEditingLevel(null);
  };

  const getNextLevelNumber = () => {
    if (!selectedPolicy?.levels.length) return 1;
    const maxLevel = Math.max(...selectedPolicy.levels.map(l => l.levelNumber));
    return maxLevel + 1;
  };

  const handleAddLevel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPolicyId) return;

    // Validate targetId is set for user/schedule types
    if ((levelForm.targetType === 'user' || levelForm.targetType === 'schedule') && !levelForm.targetId) {
      toast.error(`Please select a ${levelForm.targetType === 'user' ? 'user' : 'schedule'}`);
      return;
    }

    // Validate timeout
    const minTimeout = levelForm.targetType === 'entire_team' ? 3 : 1;
    if (levelForm.timeoutMinutes < minTimeout) {
      toast.error(`Minimum timeout is ${minTimeout} minute${minTimeout > 1 ? 's' : ''} for ${levelForm.targetType === 'entire_team' ? 'entire team' : 'this target type'}`);
      return;
    }

    try {
      await createLevelMutation.mutateAsync({
        policyId: selectedPolicyId,
        data: {
          levelNumber: levelForm.levelNumber,
          targetType: levelForm.targetType,
          targetId: levelForm.targetType === 'entire_team' ? undefined : levelForm.targetId,
          timeoutMinutes: levelForm.timeoutMinutes,
        },
      });
      toast.success('Escalation level added');
      resetLevelForm();
      // Set next level number
      setLevelForm(prev => ({ ...prev, levelNumber: getNextLevelNumber() + 1 }));
      refetchPolicy();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to add escalation level');
    }
  };

  const handleStartEditLevel = (level: EscalationLevel) => {
    setEditingLevel(level);
    setLevelForm({
      levelNumber: level.levelNumber,
      targetType: level.targetType,
      targetId: level.targetId || '',
      timeoutMinutes: level.timeoutMinutes,
    });
  };

  const handleUpdateLevel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLevel) return;

    // Validate targetId is set for user/schedule types
    if ((levelForm.targetType === 'user' || levelForm.targetType === 'schedule') && !levelForm.targetId) {
      toast.error(`Please select a ${levelForm.targetType === 'user' ? 'user' : 'schedule'}`);
      return;
    }

    // Validate timeout
    const minTimeout = levelForm.targetType === 'entire_team' ? 3 : 1;
    if (levelForm.timeoutMinutes < minTimeout) {
      toast.error(`Minimum timeout is ${minTimeout} minute${minTimeout > 1 ? 's' : ''} for ${levelForm.targetType === 'entire_team' ? 'entire team' : 'this target type'}`);
      return;
    }

    try {
      await updateLevelMutation.mutateAsync({
        levelId: editingLevel.id,
        data: {
          targetType: levelForm.targetType,
          targetId: levelForm.targetType === 'entire_team' ? undefined : levelForm.targetId,
          timeoutMinutes: levelForm.timeoutMinutes,
        },
      });
      toast.success('Escalation level updated');
      resetLevelForm();
      refetchPolicy();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update escalation level');
    }
  };

  const handleDeleteLevel = async () => {
    if (!levelToDelete) return;

    try {
      await deleteLevelMutation.mutateAsync(levelToDelete.id);
      toast.success('Escalation level deleted');
      setIsDeleteLevelOpen(false);
      setLevelToDelete(null);
      refetchPolicy();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete escalation level');
    }
  };

  const openDeleteLevelDialog = (level: EscalationLevel) => {
    setLevelToDelete(level);
    setIsDeleteLevelOpen(true);
  };

  const getTargetName = (level: EscalationLevel) => {
    if (level.targetType === 'entire_team') {
      return 'Entire Team';
    }
    if (level.targetType === 'user' && level.targetId) {
      const member = teamWithMembers?.members.find(m => m.userId === level.targetId);
      if (member) {
        return `${member.user.firstName} ${member.user.lastName}`;
      }
      return 'Unknown User';
    }
    if (level.targetType === 'schedule' && level.targetId) {
      const schedule = schedules?.find(s => s.id === level.targetId);
      if (schedule) {
        return schedule.name;
      }
      return 'Unknown Schedule';
    }
    return 'Unknown';
  };

  const getTargetIcon = (targetType: TargetType) => {
    switch (targetType) {
      case 'user':
        return <User className="h-4 w-4" />;
      case 'schedule':
        return <Calendar className="h-4 w-4" />;
      case 'entire_team':
        return <Users className="h-4 w-4" />;
    }
  };

  // Update level number when policy changes
  const handleViewDialogChange = (open: boolean) => {
    setIsViewOpen(open);
    if (open && selectedPolicy) {
      setLevelForm(prev => ({
        ...prev,
        levelNumber: getNextLevelNumber(),
      }));
    } else {
      resetLevelForm();
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Escalation Policies</h1>
          <p className="text-muted-foreground mt-1">
            Configure on-call schedules and escalation rules for teams
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Create Policy
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Escalation Policy</DialogTitle>
              <DialogDescription>
                Create a policy first, then add escalation levels to define how incidents should be escalated to on-call responders.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label htmlFor="name">Policy Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Primary Escalation"
                  required
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Escalation policy for..."
                  rows={2}
                />
              </div>
              <div>
                <Label htmlFor="team">Team *</Label>
                <Select
                  value={formData.teamId}
                  onValueChange={(v) => setFormData({ ...formData, teamId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select team" />
                  </SelectTrigger>
                  <SelectContent>
                    {teams?.map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="repeatCount">Repeat Count</Label>
                <Input
                  id="repeatCount"
                  type="number"
                  min={1}
                  max={10}
                  value={formData.repeatCount}
                  onChange={(e) =>
                    setFormData({ ...formData, repeatCount: parseInt(e.target.value) || 3 })
                  }
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Number of times to repeat escalation levels before stopping
                </p>
              </div>
              <Button type="submit" disabled={createMutation.isPending} className="w-full">
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Policy
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Team Filter */}
      <div className="mb-6">
        <Label htmlFor="team-filter">Filter by Team</Label>
        <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Select team" />
          </SelectTrigger>
          <SelectContent>
            {teams?.map((team) => (
              <SelectItem key={team.id} value={team.id}>
                {team.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Delete Policy Dialog */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Escalation Policy</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{policyToDelete?.name}"? This action cannot be
              undone and may affect active incidents using this policy.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Policy
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Level Dialog */}
      <AlertDialog open={isDeleteLevelOpen} onOpenChange={setIsDeleteLevelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Escalation Level</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete Level {levelToDelete?.levelNumber}? This will remove the escalation target from the policy.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteLevel}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Level
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* View Policy Dialog */}
      <Dialog open={isViewOpen} onOpenChange={handleViewDialogChange}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedPolicy?.name}</DialogTitle>
            <DialogDescription>{selectedPolicy?.description}</DialogDescription>
          </DialogHeader>
          {selectedPolicy && (
            <div className="space-y-6">
              {/* Policy Info */}
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  <ArrowRight className="h-3 w-3 mr-1" />
                  Repeat {selectedPolicy.repeatCount}x
                </Badge>
              </div>

              {/* Existing Levels */}
              <div>
                <Label className="text-base font-semibold">Escalation Levels</Label>
                {selectedPolicy.levels.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center border rounded-md mt-2">
                    No escalation levels configured yet. Add your first level below.
                  </p>
                ) : (
                  <div className="space-y-2 mt-2">
                    {selectedPolicy.levels
                      .sort((a, b) => a.levelNumber - b.levelNumber)
                      .map((level) => (
                        <div
                          key={level.id}
                          className={`border rounded-md p-3 ${editingLevel?.id === level.id ? 'border-primary bg-primary/5' : ''}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <Badge variant="secondary" className="font-mono">
                                L{level.levelNumber}
                              </Badge>
                              <div className="flex items-center gap-2 text-sm">
                                {getTargetIcon(level.targetType)}
                                <span className="font-medium">{getTargetName(level)}</span>
                              </div>
                              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                <span>{level.timeoutMinutes} min</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleStartEditLevel(level)}
                                disabled={editingLevel?.id === level.id}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openDeleteLevelDialog(level)}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {/* Add/Edit Level Form */}
              <div className="border-t pt-4">
                <Label className="text-base font-semibold">
                  {editingLevel ? `Edit Level ${editingLevel.levelNumber}` : 'Add Escalation Level'}
                </Label>
                <form
                  onSubmit={editingLevel ? handleUpdateLevel : handleAddLevel}
                  className="space-y-4 mt-3"
                >
                  <div className="grid grid-cols-2 gap-4">
                    {/* Level Number (only for new levels) */}
                    {!editingLevel && (
                      <div>
                        <Label htmlFor="levelNumber">Level Number</Label>
                        <Input
                          id="levelNumber"
                          type="number"
                          min={1}
                          max={10}
                          value={levelForm.levelNumber}
                          onChange={(e) =>
                            setLevelForm({ ...levelForm, levelNumber: parseInt(e.target.value) || 1 })
                          }
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Order in escalation chain (1 = first)
                        </p>
                      </div>
                    )}

                    {/* Timeout */}
                    <div>
                      <Label htmlFor="timeoutMinutes">Timeout (minutes)</Label>
                      <Input
                        id="timeoutMinutes"
                        type="number"
                        min={levelForm.targetType === 'entire_team' ? 3 : 1}
                        value={levelForm.timeoutMinutes}
                        onChange={(e) =>
                          setLevelForm({ ...levelForm, timeoutMinutes: parseInt(e.target.value) || 30 })
                        }
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Wait time before escalating to next level
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {/* Target Type */}
                    <div>
                      <Label htmlFor="targetType">Target Type</Label>
                      <Select
                        value={levelForm.targetType}
                        onValueChange={(v: TargetType) =>
                          setLevelForm({ ...levelForm, targetType: v, targetId: '' })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4" />
                              User
                            </div>
                          </SelectItem>
                          <SelectItem value="schedule">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4" />
                              Schedule
                            </div>
                          </SelectItem>
                          <SelectItem value="entire_team">
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4" />
                              Entire Team
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Target Selector */}
                    {levelForm.targetType !== 'entire_team' && (
                      <div>
                        <Label htmlFor="targetId">
                          {levelForm.targetType === 'user' ? 'Select User' : 'Select Schedule'}
                        </Label>
                        <Select
                          value={levelForm.targetId}
                          onValueChange={(v) => setLevelForm({ ...levelForm, targetId: v })}
                        >
                          <SelectTrigger>
                            <SelectValue
                              placeholder={`Select ${levelForm.targetType === 'user' ? 'user' : 'schedule'}`}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {levelForm.targetType === 'user' ? (
                              teamWithMembers?.members.map((member) => (
                                <SelectItem key={member.userId} value={member.userId}>
                                  {member.user.firstName} {member.user.lastName}
                                </SelectItem>
                              ))
                            ) : (
                              schedules?.map((schedule) => (
                                <SelectItem key={schedule.id} value={schedule.id}>
                                  {schedule.name}
                                </SelectItem>
                              ))
                            )}
                            {levelForm.targetType === 'user' && !teamWithMembers?.members.length && (
                              <SelectItem value="" disabled>
                                No team members found
                              </SelectItem>
                            )}
                            {levelForm.targetType === 'schedule' && !schedules?.length && (
                              <SelectItem value="" disabled>
                                No schedules found
                              </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  {/* Form Actions */}
                  <div className="flex items-center gap-2">
                    <Button
                      type="submit"
                      disabled={
                        createLevelMutation.isPending ||
                        updateLevelMutation.isPending
                      }
                    >
                      {(createLevelMutation.isPending || updateLevelMutation.isPending) && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      {editingLevel ? 'Update Level' : 'Add Level'}
                    </Button>
                    {editingLevel && (
                      <Button type="button" variant="outline" onClick={resetLevelForm}>
                        Cancel
                      </Button>
                    )}
                  </div>
                </form>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {!selectedTeamId ? (
        <div className="text-center py-16">
          <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium">Select a team</h3>
          <p className="text-muted-foreground mt-1">
            Choose a team from the filter above to view its escalation policies
          </p>
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : !policies || policies.length === 0 ? (
        <div className="text-center py-16">
          <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium">No escalation policies yet</h3>
          <p className="text-muted-foreground mt-1">
            Create an escalation policy to define how incidents are escalated
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {policies.map((policy) => (
            <Card
              key={policy.id}
              className="hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => viewPolicy(policy.id)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{policy.name}</CardTitle>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          openDeleteDialog(policy);
                        }}
                        className="text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {policy.description && <CardDescription>{policy.description}</CardDescription>}
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Bell className="h-4 w-4" />
                    <span>{policy.levels.length} escalation levels</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <ArrowRight className="h-4 w-4" />
                    <span>Repeat {policy.repeatCount}x</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
