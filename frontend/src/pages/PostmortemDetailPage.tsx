import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { MarkdownEditor } from '@/components/MarkdownEditor';
import { PostmortemTimeline } from '@/components/PostmortemTimeline';
import { ActionItemList } from '@/components/ActionItemList';
import {
  usePostmortem,
  usePostmortemTimeline,
  useUpdatePostmortem,
} from '@/hooks/usePostmortems';
import {
  ArrowLeft,
  AlertCircle,
  Edit2,
  Save,
  Send,
  FileText,
  Clock,
  CheckSquare,
} from 'lucide-react';

const CONTENT_TEMPLATE = `## Summary

Brief description of what happened.

## Root Cause

What caused the incident?

## Resolution

How was the incident resolved?

## Lessons Learned

What can we do to prevent this in the future?
`;

export default function PostmortemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: postmortem, isLoading, error } = usePostmortem(id);
  const { data: timeline, isLoading: isTimelineLoading } = usePostmortemTimeline(id);
  const updateMutation = useUpdatePostmortem();

  // Local state for editing
  const [isEditing, setIsEditing] = useState(false);
  const [localTitle, setLocalTitle] = useState('');
  const [localContent, setLocalContent] = useState('');

  // Sync local state with server data
  useEffect(() => {
    if (postmortem) {
      setLocalTitle(postmortem.title);
      setLocalContent(postmortem.content || '');
    }
  }, [postmortem]);

  // Track unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    if (!postmortem) return false;
    return (
      localTitle !== postmortem.title ||
      localContent !== (postmortem.content || '')
    );
  }, [postmortem, localTitle, localContent]);

  const isPublished = postmortem?.status === 'PUBLISHED';

  const handleSave = async () => {
    if (!id || !hasUnsavedChanges) return;

    await updateMutation.mutateAsync({
      id,
      data: {
        title: localTitle,
        content: localContent,
      },
    });
    setIsEditing(false);
  };

  const handlePublish = async () => {
    if (!id) return;

    // Save any pending changes first
    await updateMutation.mutateAsync({
      id,
      data: {
        title: localTitle,
        content: localContent,
        status: 'PUBLISHED',
      },
    });
    setIsEditing(false);
  };

  const handleStartEditing = () => {
    // Reset content to template if empty when starting to edit
    if (!localContent.trim()) {
      setLocalContent(CONTENT_TEMPLATE);
    }
    setIsEditing(true);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 px-4 max-w-4xl">
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !postmortem) {
    return (
      <div className="container mx-auto py-6 px-4 max-w-4xl">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
          <h3 className="text-lg font-medium">Postmortem not found</h3>
          <p className="text-muted-foreground mb-4">
            {error?.message || 'The postmortem could not be loaded'}
          </p>
          <Button asChild>
            <Link to="/postmortems">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Postmortems
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const actionItems = postmortem.actionItems ?? [];
  const timelineEvents = timeline ?? [];

  return (
    <div className="container mx-auto py-6 px-4 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <Link
          to="/postmortems"
          className="text-sm text-muted-foreground hover:text-foreground mb-2 inline-flex items-center"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Postmortems
        </Link>

        <div className="flex items-center gap-3 mt-2">
          {/* Title - editable in edit mode */}
          {isEditing && !isPublished ? (
            <Input
              value={localTitle}
              onChange={(e) => setLocalTitle(e.target.value)}
              className="text-xl font-bold flex-1"
              placeholder="Postmortem title"
            />
          ) : (
            <h1 className="text-xl font-bold flex-1">{localTitle}</h1>
          )}

          {/* Status badge */}
          <Badge
            variant="outline"
            className={cn(
              isPublished
                ? 'bg-green-100 text-green-700 border-green-200'
                : 'bg-yellow-100 text-yellow-700 border-yellow-200'
            )}
          >
            {isPublished ? 'Published' : 'Draft'}
          </Badge>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {!isPublished && !isEditing && (
              <Button variant="outline" onClick={handleStartEditing}>
                <Edit2 className="h-4 w-4 mr-1" />
                Edit
              </Button>
            )}

            {isEditing && !isPublished && (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setLocalTitle(postmortem.title);
                    setLocalContent(postmortem.content || '');
                    setIsEditing(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={!hasUnsavedChanges || updateMutation.isPending}
                >
                  <Save className="h-4 w-4 mr-1" />
                  {updateMutation.isPending ? 'Saving...' : 'Save'}
                </Button>
              </>
            )}

            {!isPublished && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="default">
                    <Send className="h-4 w-4 mr-1" />
                    Publish
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Publish Postmortem</AlertDialogTitle>
                    <AlertDialogDescription>
                      Publishing will make this postmortem read-only. You will
                      not be able to edit the content after publishing.
                      <br />
                      <br />
                      Action items can still be updated after publishing.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handlePublish}
                      disabled={updateMutation.isPending}
                    >
                      {updateMutation.isPending ? 'Publishing...' : 'Publish'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>

        {/* Metadata */}
        <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
          {postmortem.team && <span>Team: {postmortem.team.name}</span>}
          <span>Created {format(new Date(postmortem.createdAt), 'MMM d, yyyy')}</span>
          {postmortem.publishedAt && (
            <span>
              Published {format(new Date(postmortem.publishedAt), 'MMM d, yyyy')}
            </span>
          )}
          <span>{postmortem.incidentIds.length} linked incident{postmortem.incidentIds.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Unsaved changes indicator */}
        {hasUnsavedChanges && !isPublished && (
          <div className="mt-2 text-sm text-orange-600">
            You have unsaved changes
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="content" className="space-y-4">
        <TabsList>
          <TabsTrigger value="content" className="flex items-center gap-1">
            <FileText className="h-4 w-4" />
            Content
          </TabsTrigger>
          <TabsTrigger value="timeline" className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            Timeline
            {timelineEvents.length > 0 && (
              <span className="ml-1 text-xs text-muted-foreground">
                ({timelineEvents.length})
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="actions" className="flex items-center gap-1">
            <CheckSquare className="h-4 w-4" />
            Action Items
            {actionItems.length > 0 && (
              <span className="ml-1 text-xs text-muted-foreground">
                ({actionItems.length})
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Content Tab */}
        <TabsContent value="content" className="space-y-4">
          {isEditing && !isPublished ? (
            <MarkdownEditor
              value={localContent}
              onChange={setLocalContent}
              placeholder="Write your postmortem content using Markdown..."
              minRows={20}
              autoFocus
            />
          ) : localContent ? (
            <div className="border rounded-lg p-6">
              <MarkdownEditor
                value={localContent}
                onChange={() => {}}
                disabled
                minRows={10}
              />
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground border rounded-lg">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No content yet</p>
              {!isPublished && (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={handleStartEditing}
                >
                  <Edit2 className="h-4 w-4 mr-1" />
                  Start Writing
                </Button>
              )}
            </div>
          )}
        </TabsContent>

        {/* Timeline Tab */}
        <TabsContent value="timeline">
          <div className="border rounded-lg p-6">
            <PostmortemTimeline
              events={timelineEvents}
              isLoading={isTimelineLoading}
            />
          </div>
        </TabsContent>

        {/* Action Items Tab */}
        <TabsContent value="actions">
          <div className="border rounded-lg p-6">
            <ActionItemList
              postmortemId={postmortem.id}
              teamId={postmortem.teamId}
              actionItems={actionItems}
              readOnly={false}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
