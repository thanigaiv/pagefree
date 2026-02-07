import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, X, Pencil, Check } from 'lucide-react';

interface MetadataEditorProps {
  metadata: Record<string, unknown>;
  onSave: (metadata: Record<string, unknown>) => void;
  disabled?: boolean;
}

export function MetadataEditor({ metadata, onSave, disabled }: MetadataEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedMetadata, setEditedMetadata] = useState<Record<string, string>>({});
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  // Filter to only show editable string/number values
  const editableEntries = Object.entries(metadata).filter(
    ([_, value]) => typeof value === 'string' || typeof value === 'number'
  );

  const startEditing = () => {
    setEditedMetadata(
      Object.fromEntries(
        editableEntries.map(([k, v]) => [k, String(v)])
      )
    );
    setIsEditing(true);
  };

  const handleSave = () => {
    // Merge edited values back, preserving non-editable fields
    const updated = {
      ...metadata,
      ...editedMetadata,
    };

    // Add new key-value if provided
    if (newKey.trim() && newValue.trim()) {
      updated[newKey.trim()] = newValue.trim();
    }

    onSave(updated);
    setIsEditing(false);
    setNewKey('');
    setNewValue('');
  };

  const handleCancel = () => {
    setIsEditing(false);
    setNewKey('');
    setNewValue('');
  };

  const removeKey = (key: string) => {
    const { [key]: _, ...rest } = editedMetadata;
    setEditedMetadata(rest);
  };

  if (!isEditing) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Tags & Metadata</Label>
          <Button
            variant="ghost"
            size="sm"
            onClick={startEditing}
            disabled={disabled}
          >
            <Pencil className="h-4 w-4 mr-1" />
            Edit
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {editableEntries.length === 0 ? (
            <span className="text-sm text-muted-foreground">No metadata</span>
          ) : (
            editableEntries.map(([key, value]) => (
              <Badge key={key} variant="secondary">
                {key}: {String(value)}
              </Badge>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-3 border rounded-lg bg-muted/50">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Edit Metadata</Label>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={handleCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave}>
            <Check className="h-4 w-4 mr-1" />
            Save
          </Button>
        </div>
      </div>

      {/* Existing entries */}
      <div className="space-y-2">
        {Object.entries(editedMetadata).map(([key, value]) => (
          <div key={key} className="flex items-center gap-2">
            <Label className="w-24 text-sm">{key}</Label>
            <Input
              value={value}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setEditedMetadata((prev) => ({ ...prev, [key]: e.target.value }))
              }
              className="flex-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeKey(key)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      {/* Add new entry */}
      <div className="flex items-center gap-2 pt-2 border-t">
        <Input
          placeholder="Key"
          value={newKey}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewKey(e.target.value)}
          className="w-24"
        />
        <Input
          placeholder="Value"
          value={newValue}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewValue(e.target.value)}
          className="flex-1"
        />
        <Plus className="h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  );
}
