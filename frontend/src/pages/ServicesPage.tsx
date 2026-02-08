import { useState } from 'react';
import { useServices, useCreateService, useUpdateService, useUpdateServiceStatus } from '@/hooks/useServices';
import { useTeams } from '@/hooks/useTeams';
import {
  useServiceDependencies,
  useServiceDependents,
  useAddDependency,
  useRemoveDependency
} from '@/hooks/useServiceDependencies';
import { DependencyGraph } from '@/components/services/DependencyGraph';
import type { Service, ServiceStatus, CreateServiceInput } from '@/types/service';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Server,
  Plus,
  MoreVertical,
  Edit,
  Archive,
  AlertTriangle,
  RotateCcw,
  Loader2,
  Search,
  Network,
  ArrowUpRight,
  ArrowDownLeft,
  Trash2,
  LayoutGrid
} from 'lucide-react';
import { toast } from 'sonner';

const STATUS_OPTIONS: { value: ServiceStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All Statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'DEPRECATED', label: 'Deprecated' },
  { value: 'ARCHIVED', label: 'Archived' },
];

const STATUS_BADGE_VARIANT: Record<ServiceStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  ACTIVE: 'default',
  DEPRECATED: 'secondary',
  ARCHIVED: 'outline',
};

// =============================================================================
// DEPENDENCIES DIALOG COMPONENT
// =============================================================================

function DependenciesDialog({
  service,
  open,
  onClose,
  allServices
}: {
  service: Service;
  open: boolean;
  onClose: () => void;
  allServices: Service[];
}) {
  const { data: dependencies = [], isLoading: loadingDeps } = useServiceDependencies(service.id);
  const { data: dependents = [], isLoading: loadingDependents } = useServiceDependents(service.id);
  const addDependency = useAddDependency();
  const removeDependency = useRemoveDependency();

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedDependsOn, setSelectedDependsOn] = useState('');

  // Filter out services that are already dependencies or self
  const availableServices = allServices.filter(
    s => s.id !== service.id && !dependencies.some(d => d.id === s.id)
  );

  const handleAddDependency = async () => {
    if (!selectedDependsOn) return;
    try {
      await addDependency.mutateAsync({
        serviceId: service.id,
        dependsOnId: selectedDependsOn
      });
      setAddDialogOpen(false);
      setSelectedDependsOn('');
      toast.success('Dependency added');
    } catch (error: unknown) {
      const err = error as { message?: string };
      // Handle cycle error
      if (err?.message?.includes('cycle')) {
        toast.error('Cannot add dependency: would create a cycle');
      } else {
        toast.error('Failed to add dependency');
      }
    }
  };

  const handleRemoveDependency = async (dependsOnId: string) => {
    try {
      await removeDependency.mutateAsync({
        serviceId: service.id,
        dependsOnId
      });
      toast.success('Dependency removed');
    } catch (error) {
      toast.error('Failed to remove dependency');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Dependencies: {service.name}</DialogTitle>
          <DialogDescription>
            Manage upstream dependencies and downstream dependents for this service
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="upstream">
          <TabsList>
            <TabsTrigger value="upstream">
              <ArrowUpRight className="h-4 w-4 mr-1" />
              Depends On ({dependencies.length})
            </TabsTrigger>
            <TabsTrigger value="downstream">
              <ArrowDownLeft className="h-4 w-4 mr-1" />
              Depended On By ({dependents.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upstream" className="space-y-4">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setAddDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Add Dependency
              </Button>
            </div>

            {loadingDeps ? (
              <div className="text-center py-4">
                <Loader2 className="h-6 w-6 animate-spin mx-auto" />
              </div>
            ) : dependencies.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">
                This service has no dependencies
              </div>
            ) : (
              <div className="space-y-2">
                {dependencies.map(dep => (
                  <div
                    key={dep.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div>
                      <div className="font-medium">{dep.name}</div>
                      <div className="text-sm text-muted-foreground">{dep.team.name}</div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveDependency(dep.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="downstream" className="space-y-4">
            {loadingDependents ? (
              <div className="text-center py-4">
                <Loader2 className="h-6 w-6 animate-spin mx-auto" />
              </div>
            ) : dependents.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">
                No services depend on this service
              </div>
            ) : (
              <div className="space-y-2">
                {dependents.map(dep => (
                  <div
                    key={dep.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div>
                      <div className="font-medium">{dep.name}</div>
                      <div className="text-sm text-muted-foreground">{dep.team.name}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Add Dependency Sub-Dialog */}
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Dependency</DialogTitle>
              <DialogDescription>
                Select a service that {service.name} depends on
              </DialogDescription>
            </DialogHeader>
            <Select value={selectedDependsOn} onValueChange={setSelectedDependsOn}>
              <SelectTrigger>
                <SelectValue placeholder="Select a service" />
              </SelectTrigger>
              <SelectContent>
                {availableServices.map(s => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} ({s.team.name})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleAddDependency}
                disabled={!selectedDependsOn || addDependency.isPending}
              >
                {addDependency.isPending ? 'Adding...' : 'Add'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// MAIN SERVICES PAGE COMPONENT
// =============================================================================

export default function ServicesPage() {
  const { data: teamsData } = useTeams();
  const teams = teamsData || [];

  // Filter state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ServiceStatus | 'ALL'>('ACTIVE');
  const [teamFilter, setTeamFilter] = useState<string>('ALL');

  // View mode and selection state
  const [viewMode, setViewMode] = useState<'grid' | 'graph'>('grid');
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [isDependenciesOpen, setIsDependenciesOpen] = useState(false);

  // Query with filters
  const { data, isLoading, error } = useServices({
    search: search || undefined,
    status: statusFilter === 'ALL' ? undefined : statusFilter,
    teamId: teamFilter === 'ALL' ? undefined : teamFilter,
  });

  // Query all services for dependencies dialog (to show available services to add)
  const { data: allServicesData } = useServices({ status: 'ACTIVE' });
  const allServices = allServicesData?.services || [];

  // Mutations
  const createMutation = useCreateService();
  const updateMutation = useUpdateService();
  const statusMutation = useUpdateServiceStatus();

  // Dialog state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [pendingStatus, setPendingStatus] = useState<ServiceStatus | null>(null);

  // Form state
  const [formData, setFormData] = useState<CreateServiceInput>({
    name: '',
    description: '',
    routingKey: '',
    teamId: '',
    tags: [],
  });
  const [tagsInput, setTagsInput] = useState('');

  const resetForm = () => {
    setFormData({ name: '', description: '', routingKey: '', teamId: '', tags: [] });
    setTagsInput('');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error('Service name is required');
      return;
    }
    if (!formData.routingKey.trim()) {
      toast.error('Routing key is required');
      return;
    }
    if (!formData.teamId) {
      toast.error('Owning team is required');
      return;
    }

    try {
      const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
      await createMutation.mutateAsync({
        ...formData,
        tags: tags.length > 0 ? tags : undefined,
      });
      toast.success('Service created successfully');
      setIsCreateOpen(false);
      resetForm();
    } catch (error: unknown) {
      const err = error as { message?: string };
      if (err?.message?.includes('Routing key already exists')) {
        toast.error('Routing key already exists');
      } else {
        toast.error(err?.message || 'Failed to create service');
      }
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedService) return;

    try {
      const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
      await updateMutation.mutateAsync({
        id: selectedService.id,
        data: {
          name: formData.name,
          description: formData.description || undefined,
          tags: tags.length > 0 ? tags : [],
        },
      });
      toast.success('Service updated successfully');
      setIsEditOpen(false);
      setSelectedService(null);
      resetForm();
    } catch (error: unknown) {
      const err = error as { message?: string };
      toast.error(err?.message || 'Failed to update service');
    }
  };

  const handleStatusChange = async () => {
    if (!selectedService || !pendingStatus) return;

    try {
      await statusMutation.mutateAsync({
        id: selectedService.id,
        data: { status: pendingStatus },
      });
      const action = pendingStatus === 'ARCHIVED' ? 'archived' :
                     pendingStatus === 'DEPRECATED' ? 'deprecated' : 'reactivated';
      toast.success(`Service ${action} successfully`);
      setIsStatusOpen(false);
      setSelectedService(null);
      setPendingStatus(null);
    } catch (error: unknown) {
      const err = error as { message?: string };
      toast.error(err?.message || 'Failed to update service status');
    }
  };

  const openEditDialog = (service: Service) => {
    setSelectedService(service);
    setFormData({
      name: service.name,
      description: service.description || '',
      routingKey: service.routingKey,
      teamId: service.teamId,
      tags: service.tags,
    });
    setTagsInput(service.tags.join(', '));
    setIsEditOpen(true);
  };

  const openStatusDialog = (service: Service, status: ServiceStatus) => {
    setSelectedService(service);
    setPendingStatus(status);
    setIsStatusOpen(true);
  };

  const openDependenciesDialog = (service: Service) => {
    setSelectedService(service);
    setSelectedServiceId(service.id);
    setIsDependenciesOpen(true);
  };

  const handleGraphNodeClick = (serviceId: string) => {
    // Find the service and open its dependencies dialog
    const service = services.find(s => s.id === serviceId) || allServices.find(s => s.id === serviceId);
    if (service) {
      setSelectedServiceId(serviceId);
      setSelectedService(service);
      setIsDependenciesOpen(true);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-red-500">Error loading services</div>
      </div>
    );
  }

  const services = data?.services || [];

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Service Directory</h1>
          <p className="text-muted-foreground mt-1">
            Manage technical services and their routing
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Create Service
        </Button>
      </div>

      {/* Filters and View Toggle */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search services..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ServiceStatus | 'ALL')}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={teamFilter} onValueChange={setTeamFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Team" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Teams</SelectItem>
            {teams.map(team => (
              <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* View Mode Toggle */}
        <div className="flex gap-2 ml-auto">
          <Button
            variant={viewMode === 'grid' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('grid')}
          >
            <LayoutGrid className="h-4 w-4 mr-1" />
            Grid
          </Button>
          <Button
            variant={viewMode === 'graph' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('graph')}
            disabled={!selectedServiceId}
            title={!selectedServiceId ? 'Select a service to view its dependency graph' : ''}
          >
            <Network className="h-4 w-4 mr-1" />
            Graph
          </Button>
        </div>
      </div>

      {/* Graph View */}
      {viewMode === 'graph' && selectedServiceId && (
        <div className="h-[500px] border rounded-lg overflow-hidden mb-6">
          <DependencyGraph
            serviceId={selectedServiceId}
            onNodeClick={handleGraphNodeClick}
          />
        </div>
      )}

      {/* Service Grid (show when grid mode or as fallback) */}
      {viewMode === 'grid' && (
        <>
          {services.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Server className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No services found</h3>
                <p className="text-muted-foreground text-center mb-4">
                  {search || statusFilter !== 'ACTIVE' || teamFilter !== 'ALL'
                    ? 'Try adjusting your filters'
                    : 'Create your first service to get started'}
                </p>
                {!search && statusFilter === 'ACTIVE' && teamFilter === 'ALL' && (
                  <Button onClick={() => setIsCreateOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" /> Create Service
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {services.map(service => (
                <Card
                  key={service.id}
                  className={`${service.status === 'ARCHIVED' ? 'opacity-60' : ''} ${selectedServiceId === service.id ? 'ring-2 ring-primary' : ''} cursor-pointer transition-all hover:shadow-md`}
                  onClick={() => setSelectedServiceId(service.id)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg truncate">{service.name}</CardTitle>
                        <CardDescription className="truncate">
                          {service.team.name}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDependenciesDialog(service);
                          }}
                          title="View Dependencies"
                        >
                          <Network className="h-4 w-4" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditDialog(service)}>
                              <Edit className="mr-2 h-4 w-4" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {service.status === 'ACTIVE' && (
                              <>
                                <DropdownMenuItem onClick={() => openStatusDialog(service, 'DEPRECATED')}>
                                  <AlertTriangle className="mr-2 h-4 w-4" /> Deprecate
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => openStatusDialog(service, 'ARCHIVED')}
                                  className="text-destructive"
                                >
                                  <Archive className="mr-2 h-4 w-4" /> Archive
                                </DropdownMenuItem>
                              </>
                            )}
                            {service.status === 'DEPRECATED' && (
                              <>
                                <DropdownMenuItem onClick={() => openStatusDialog(service, 'ACTIVE')}>
                                  <RotateCcw className="mr-2 h-4 w-4" /> Reactivate
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => openStatusDialog(service, 'ARCHIVED')}
                                  className="text-destructive"
                                >
                                  <Archive className="mr-2 h-4 w-4" /> Archive
                                </DropdownMenuItem>
                              </>
                            )}
                            {service.status === 'ARCHIVED' && (
                              <DropdownMenuItem onClick={() => openStatusDialog(service, 'ACTIVE')}>
                                <RotateCcw className="mr-2 h-4 w-4" /> Reactivate
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={STATUS_BADGE_VARIANT[service.status]}>
                          {service.status}
                        </Badge>
                        {service.escalationPolicy && (
                          <Badge variant="outline" className="truncate max-w-[120px]">
                            {service.escalationPolicy.name}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {service.description || 'No description'}
                      </p>
                      <p className="text-xs font-mono text-muted-foreground truncate">
                        {service.routingKey}
                      </p>
                      {service.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {service.tags.slice(0, 3).map(tag => (
                            <Badge key={tag} variant="secondary" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                          {service.tags.length > 3 && (
                            <Badge variant="secondary" className="text-xs">
                              +{service.tags.length - 3}
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Dependencies Dialog */}
      {selectedService && (
        <DependenciesDialog
          service={selectedService}
          open={isDependenciesOpen}
          onClose={() => {
            setIsDependenciesOpen(false);
            setSelectedService(null);
          }}
          allServices={allServices}
        />
      )}

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Service</DialogTitle>
            <DialogDescription>
              Add a new technical service to the directory
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Payment Gateway"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="routingKey">Routing Key *</Label>
              <Input
                id="routingKey"
                value={formData.routingKey}
                onChange={(e) => setFormData({ ...formData, routingKey: e.target.value })}
                placeholder="payment-gateway"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Alphanumeric, hyphens, and underscores only
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="teamId">Owning Team *</Label>
              <Select
                value={formData.teamId}
                onValueChange={(v) => setFormData({ ...formData, teamId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select team" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map(team => (
                    <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Handles all payment processing..."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tags">Tags</Label>
              <Input
                id="tags"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="payments, critical, tier-1"
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated tags
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => { setIsCreateOpen(false); resetForm(); }}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Service</DialogTitle>
            <DialogDescription>
              Update service metadata
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name *</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Routing Key</Label>
              <Input
                value={selectedService?.routingKey || ''}
                disabled
                className="font-mono opacity-50"
              />
              <p className="text-xs text-muted-foreground">
                Routing key cannot be changed after creation
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-tags">Tags</Label>
              <Input
                id="edit-tags"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="payments, critical, tier-1"
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => { setIsEditOpen(false); setSelectedService(null); resetForm(); }}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Status Change Confirmation Dialog */}
      <AlertDialog open={isStatusOpen} onOpenChange={setIsStatusOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingStatus === 'ARCHIVED' && 'Archive Service'}
              {pendingStatus === 'DEPRECATED' && 'Deprecate Service'}
              {pendingStatus === 'ACTIVE' && 'Reactivate Service'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingStatus === 'ARCHIVED' && (
                <>
                  Are you sure you want to archive <strong>{selectedService?.name}</strong>?
                  Archived services are hidden from default views but can be reactivated later.
                </>
              )}
              {pendingStatus === 'DEPRECATED' && (
                <>
                  Are you sure you want to deprecate <strong>{selectedService?.name}</strong>?
                  Deprecated services remain visible but indicate planned removal.
                </>
              )}
              {pendingStatus === 'ACTIVE' && (
                <>
                  Reactivate <strong>{selectedService?.name}</strong>?
                  The service will be restored to active status.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setSelectedService(null); setPendingStatus(null); }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleStatusChange}
              className={pendingStatus === 'ARCHIVED' ? 'bg-destructive hover:bg-destructive/90' : ''}
            >
              {statusMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {pendingStatus === 'ARCHIVED' && 'Archive'}
              {pendingStatus === 'DEPRECATED' && 'Deprecate'}
              {pendingStatus === 'ACTIVE' && 'Reactivate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
