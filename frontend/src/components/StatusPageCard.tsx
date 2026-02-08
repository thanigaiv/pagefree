import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { ComponentStatusBadge } from './ComponentStatusBadge';
import { Globe, Lock, MoreVertical, Edit, Trash2 } from 'lucide-react';
import { useDeleteStatusPage } from '@/hooks/useStatusPages';
import { toast } from 'sonner';

interface StatusPageCardProps {
  statusPage: {
    id: string;
    name: string;
    description: string | null;
    slug: string;
    isPublic: boolean;
    team: { id: string; name: string };
    components: Array<{ id: string; name: string; currentStatus: string }>;
  };
}

export function StatusPageCard({ statusPage }: StatusPageCardProps) {
  const navigate = useNavigate();
  const deleteMutation = useDeleteStatusPage();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  // Compute overall status (worst component status)
  const STATUS_ORDER = ['MAJOR_OUTAGE', 'PARTIAL_OUTAGE', 'DEGRADED_PERFORMANCE', 'UNDER_MAINTENANCE', 'OPERATIONAL'];
  const overallStatus = statusPage.components.reduce((worst, comp) => {
    const currentIdx = STATUS_ORDER.indexOf(comp.currentStatus);
    const worstIdx = STATUS_ORDER.indexOf(worst);
    return currentIdx < worstIdx ? comp.currentStatus : worst;
  }, 'OPERATIONAL');

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(statusPage.id);
      toast.success('Status page deleted');
      setShowDeleteDialog(false);
    } catch (error) {
      toast.error('Failed to delete status page');
    }
  };

  const handleEdit = () => {
    navigate(`/status-pages/${statusPage.id}/edit`);
  };

  return (
    <>
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Status Page</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{statusPage.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">
            <Link to={`/status-pages/${statusPage.id}`} className="hover:underline">
              {statusPage.name}
            </Link>
          </CardTitle>
          <div className="flex items-center gap-2">
            {statusPage.isPublic ? (
              <Globe className="h-4 w-4 text-green-600" />
            ) : (
              <Lock className="h-4 w-4 text-gray-500" />
            )}
            <ComponentStatusBadge status={overallStatus} size="sm" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleEdit}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowDeleteDialog(true)} className="text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {statusPage.description && (
          <CardDescription>{statusPage.description}</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Team: {statusPage.team.name}</span>
          <span>{statusPage.components.length} components</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {statusPage.components.slice(0, 3).map(comp => (
            <Badge key={comp.id} variant="outline" className="text-xs">
              {comp.name}
            </Badge>
          ))}
          {statusPage.components.length > 3 && (
            <Badge variant="outline" className="text-xs">
              +{statusPage.components.length - 3} more
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
    </>
  );
}
