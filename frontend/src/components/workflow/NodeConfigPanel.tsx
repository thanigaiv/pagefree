/**
 * NodeConfigPanel - Configuration panel for selected workflow node
 *
 * Renders different forms based on node type:
 * - TriggerConfig: trigger type dropdown, conditions editor
 * - ActionConfig: webhook URL/headers/body, Jira/Linear fields
 * - ConditionConfig: field/value inputs
 * - DelayConfig: duration input with presets
 *
 * Per user decisions:
 * - Simple field matching for conditions (no AND/OR)
 * - {{variable}} template syntax visible
 * - Real-time validation feedback
 */

import { useState, useCallback } from 'react';
import {
  Zap,
  RefreshCw,
  ArrowUp,
  Hand,
  Clock,
  Globe,
  Ticket,
  ListTodo,
  GitBranch,
  Timer,
  Plus,
  X,
  AlertCircle,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import type { Node } from '@xyflow/react';
import type {
  TriggerData,
  TriggerType,
  TriggerCondition,
  ActionData,
  ActionType,
  ConditionData,
  DelayData,
  WebhookAuth,
  WebhookMethod,
} from '@/types/workflow';

// =============================================================================
// TYPES
// =============================================================================

interface NodeConfigPanelProps {
  selectedNode: Node | null;
  onChange: (nodeId: string, data: Record<string, unknown>) => void;
}

// =============================================================================
// TEMPLATE VARIABLES HELPER
// =============================================================================

const TEMPLATE_VARIABLES = [
  { label: 'Incident ID', value: '{{incident.id}}' },
  { label: 'Incident Title', value: '{{incident.title}}' },
  { label: 'Priority', value: '{{incident.priority}}' },
  { label: 'Status', value: '{{incident.status}}' },
  { label: 'Team Name', value: '{{team.name}}' },
  { label: 'Assignee Email', value: '{{assignee.email}}' },
  { label: 'Assignee Name', value: '{{assignee.firstName}} {{assignee.lastName}}' },
  { label: 'Workflow Name', value: '{{workflow.name}}' },
];

function TemplateVariablesHelper({ onInsert }: { onInsert: (value: string) => void }) {
  return (
    <Collapsible>
      <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <Info className="h-3 w-3" />
        Available variables
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">
        <div className="flex flex-wrap gap-1">
          {TEMPLATE_VARIABLES.map((v) => (
            <Badge
              key={v.value}
              variant="secondary"
              className="cursor-pointer hover:bg-primary/20 text-xs"
              onClick={() => onInsert(v.value)}
            >
              {v.label}
            </Badge>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// =============================================================================
// TRIGGER CONFIG
// =============================================================================

interface TriggerConfigProps {
  data: TriggerData;
  onChange: (data: Partial<TriggerData>) => void;
}

function TriggerConfig({ data, onChange }: TriggerConfigProps) {
  const [newConditionField, setNewConditionField] = useState('');
  const [newConditionValue, setNewConditionValue] = useState('');

  const handleAddCondition = () => {
    if (!newConditionField || !newConditionValue) return;

    const newCondition: TriggerCondition = {
      field: newConditionField,
      value: newConditionValue,
    };

    onChange({
      conditions: [...(data.conditions || []), newCondition],
    });

    setNewConditionField('');
    setNewConditionValue('');
  };

  const handleRemoveCondition = (index: number) => {
    const newConditions = [...(data.conditions || [])];
    newConditions.splice(index, 1);
    onChange({ conditions: newConditions });
  };

  return (
    <div className="space-y-4">
      {/* Name */}
      <div className="space-y-2">
        <Label htmlFor="trigger-name">
          Name <span className="text-red-500">*</span>
        </Label>
        <Input
          id="trigger-name"
          value={data.name || ''}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="e.g., High Priority Alert"
          className={cn(!data.name && 'border-red-300')}
        />
        {!data.name && (
          <p className="text-xs text-red-500">Name is required</p>
        )}
      </div>

      {/* Trigger Type */}
      <div className="space-y-2">
        <Label htmlFor="trigger-type">Trigger Type</Label>
        <Select
          value={data.triggerType}
          onValueChange={(value: TriggerType) => onChange({ triggerType: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select trigger type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="incident_created">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-purple-500" />
                Incident Created
              </div>
            </SelectItem>
            <SelectItem value="state_changed">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-purple-500" />
                State Changed
              </div>
            </SelectItem>
            <SelectItem value="escalation">
              <div className="flex items-center gap-2">
                <ArrowUp className="h-4 w-4 text-purple-500" />
                Escalation
              </div>
            </SelectItem>
            <SelectItem value="manual">
              <div className="flex items-center gap-2">
                <Hand className="h-4 w-4 text-purple-500" />
                Manual Trigger
              </div>
            </SelectItem>
            <SelectItem value="age">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-purple-500" />
                Incident Age
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Age threshold for age trigger */}
      {data.triggerType === 'age' && (
        <div className="space-y-2">
          <Label htmlFor="age-threshold">Age Threshold (minutes)</Label>
          <Input
            id="age-threshold"
            type="number"
            min={1}
            value={data.ageThresholdMinutes || ''}
            onChange={(e) =>
              onChange({ ageThresholdMinutes: parseInt(e.target.value) || undefined })
            }
            placeholder="e.g., 60"
          />
        </div>
      )}

      {/* State transition for state_changed trigger */}
      {data.triggerType === 'state_changed' && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-2">
            <Label htmlFor="state-from">From State (optional)</Label>
            <Select
              value={data.stateTransition?.from || ''}
              onValueChange={(value) =>
                onChange({
                  stateTransition: {
                    ...data.stateTransition,
                    from: value || undefined,
                    to: data.stateTransition?.to || '',
                  },
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Any" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OPEN">Open</SelectItem>
                <SelectItem value="ACKNOWLEDGED">Acknowledged</SelectItem>
                <SelectItem value="RESOLVED">Resolved</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="state-to">
              To State <span className="text-red-500">*</span>
            </Label>
            <Select
              value={data.stateTransition?.to || ''}
              onValueChange={(value) =>
                onChange({
                  stateTransition: {
                    ...data.stateTransition,
                    to: value,
                  },
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select state" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACKNOWLEDGED">Acknowledged</SelectItem>
                <SelectItem value="RESOLVED">Resolved</SelectItem>
                <SelectItem value="CLOSED">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Conditions editor (simple field matching per user decision) */}
      <div className="space-y-2">
        <Label>Conditions (optional)</Label>
        <p className="text-xs text-muted-foreground">
          Simple field matching - all conditions must be true
        </p>

        {/* Existing conditions */}
        {data.conditions && data.conditions.length > 0 && (
          <div className="space-y-2">
            {data.conditions.map((condition, idx) => (
              <div key={idx} className="flex items-center gap-2 bg-muted/50 rounded p-2">
                <code className="text-sm flex-1">
                  {condition.field} = {condition.value}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveCondition(idx)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Add new condition */}
        <div className="flex items-center gap-2">
          <Select value={newConditionField} onValueChange={setNewConditionField}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Field" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="priority">priority</SelectItem>
              <SelectItem value="status">status</SelectItem>
              <SelectItem value="metadata.service">service</SelectItem>
            </SelectContent>
          </Select>
          <span>=</span>
          <Input
            value={newConditionValue}
            onChange={(e) => setNewConditionValue(e.target.value)}
            placeholder="Value"
            className="flex-1"
          />
          <Button variant="outline" size="sm" onClick={handleAddCondition}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// WEBHOOK ACTION CONFIG
// =============================================================================

interface WebhookConfigProps {
  data: ActionData & { actionType: 'webhook' };
  onChange: (data: Partial<ActionData>) => void;
}

function WebhookConfig({ data, onChange }: WebhookConfigProps) {
  const config = data.config;
  const [headerKey, setHeaderKey] = useState('');
  const [headerValue, setHeaderValue] = useState('');

  const updateConfig = (updates: Partial<typeof config>) => {
    onChange({
      ...data,
      config: { ...config, ...updates },
    });
  };

  const handleAddHeader = () => {
    if (!headerKey) return;
    updateConfig({
      headers: { ...config.headers, [headerKey]: headerValue },
    });
    setHeaderKey('');
    setHeaderValue('');
  };

  const handleRemoveHeader = (key: string) => {
    const newHeaders = { ...config.headers };
    delete newHeaders[key];
    updateConfig({ headers: newHeaders });
  };

  return (
    <div className="space-y-4">
      {/* Name */}
      <div className="space-y-2">
        <Label htmlFor="action-name">
          Name <span className="text-red-500">*</span>
        </Label>
        <Input
          id="action-name"
          value={data.name || ''}
          onChange={(e) => onChange({ ...data, name: e.target.value })}
          placeholder="e.g., Notify Slack"
          className={cn(!data.name && 'border-red-300')}
        />
      </div>

      {/* URL with template preview */}
      <div className="space-y-2">
        <Label htmlFor="webhook-url">
          URL <span className="text-red-500">*</span>
        </Label>
        <Input
          id="webhook-url"
          value={config.url || ''}
          onChange={(e) => updateConfig({ url: e.target.value })}
          placeholder="https://api.example.com/{{incident.id}}"
          className={cn(!config.url && 'border-red-300')}
        />
        <TemplateVariablesHelper
          onInsert={(v) => updateConfig({ url: (config.url || '') + v })}
        />
      </div>

      {/* Method */}
      <div className="space-y-2">
        <Label htmlFor="webhook-method">Method</Label>
        <Select
          value={config.method}
          onValueChange={(value: WebhookMethod) => updateConfig({ method: value })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="POST">POST</SelectItem>
            <SelectItem value="PUT">PUT</SelectItem>
            <SelectItem value="PATCH">PATCH</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Headers */}
      <div className="space-y-2">
        <Label>Headers</Label>
        {Object.entries(config.headers || {}).map(([key, value]) => (
          <div key={key} className="flex items-center gap-2 bg-muted/50 rounded p-2">
            <code className="text-sm flex-1">
              {key}: {value}
            </code>
            <Button variant="ghost" size="sm" onClick={() => handleRemoveHeader(key)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <Input
            value={headerKey}
            onChange={(e) => setHeaderKey(e.target.value)}
            placeholder="Header name"
            className="flex-1"
          />
          <Input
            value={headerValue}
            onChange={(e) => setHeaderValue(e.target.value)}
            placeholder="Value"
            className="flex-1"
          />
          <Button variant="outline" size="sm" onClick={handleAddHeader}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="space-y-2">
        <Label htmlFor="webhook-body">Body (JSON)</Label>
        <Textarea
          id="webhook-body"
          value={config.body || ''}
          onChange={(e) => updateConfig({ body: e.target.value })}
          placeholder='{"incident": "{{incident.id}}", "title": "{{incident.title}}"}'
          rows={4}
          className="font-mono text-sm"
        />
        <TemplateVariablesHelper
          onInsert={(v) => updateConfig({ body: (config.body || '') + v })}
        />
      </div>

      {/* Auth type */}
      <div className="space-y-2">
        <Label>Authentication</Label>
        <Select
          value={config.auth?.type || 'none'}
          onValueChange={(value) =>
            updateConfig({
              auth: { type: value as WebhookAuth['type'] } as WebhookAuth,
            })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            <SelectItem value="bearer">Bearer Token</SelectItem>
            <SelectItem value="basic">Basic Auth</SelectItem>
            <SelectItem value="oauth2">OAuth 2.0</SelectItem>
            <SelectItem value="custom">Custom Headers</SelectItem>
          </SelectContent>
        </Select>

        {/* Conditional auth fields */}
        {config.auth?.type === 'bearer' && (
          <Input
            placeholder="Bearer token"
            value={(config.auth as { type: 'bearer'; token?: string }).token || ''}
            onChange={(e) =>
              updateConfig({
                auth: { type: 'bearer', token: e.target.value },
              })
            }
          />
        )}

        {config.auth?.type === 'basic' && (
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="Username"
              value={(config.auth as { type: 'basic'; username?: string }).username || ''}
              onChange={(e) =>
                updateConfig({
                  auth: {
                    type: 'basic',
                    username: e.target.value,
                    password: (config.auth as { type: 'basic'; password?: string }).password || '',
                  },
                })
              }
            />
            <Input
              type="password"
              placeholder="Password"
              value={(config.auth as { type: 'basic'; password?: string }).password || ''}
              onChange={(e) =>
                updateConfig({
                  auth: {
                    type: 'basic',
                    username: (config.auth as { type: 'basic'; username?: string }).username || '',
                    password: e.target.value,
                  },
                })
              }
            />
          </div>
        )}

        {config.auth?.type === 'oauth2' && (
          <div className="space-y-2">
            <Input
              placeholder="Token URL"
              value={(config.auth as { type: 'oauth2'; tokenUrl?: string }).tokenUrl || ''}
              onChange={(e) =>
                updateConfig({
                  auth: {
                    type: 'oauth2',
                    tokenUrl: e.target.value,
                    clientId: (config.auth as { type: 'oauth2'; clientId?: string }).clientId || '',
                    clientSecret: (config.auth as { type: 'oauth2'; clientSecret?: string }).clientSecret || '',
                  },
                })
              }
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="Client ID"
                value={(config.auth as { type: 'oauth2'; clientId?: string }).clientId || ''}
                onChange={(e) =>
                  updateConfig({
                    auth: {
                      ...(config.auth as { type: 'oauth2'; tokenUrl?: string; clientId?: string; clientSecret?: string }),
                      clientId: e.target.value,
                    },
                  })
                }
              />
              <Input
                type="password"
                placeholder="Client Secret"
                value={(config.auth as { type: 'oauth2'; clientSecret?: string }).clientSecret || ''}
                onChange={(e) =>
                  updateConfig({
                    auth: {
                      ...(config.auth as { type: 'oauth2'; tokenUrl?: string; clientId?: string; clientSecret?: string }),
                      clientSecret: e.target.value,
                    },
                  })
                }
              />
            </div>
          </div>
        )}
      </div>

      {/* Retry config */}
      <div className="space-y-2">
        <Label>Retry Configuration</Label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Attempts</Label>
            <Input
              type="number"
              min={1}
              max={5}
              value={data.retry?.attempts || 1}
              onChange={(e) =>
                onChange({
                  ...data,
                  retry: {
                    ...data.retry,
                    attempts: parseInt(e.target.value) || 1,
                    backoff: 'exponential',
                    initialDelayMs: data.retry?.initialDelayMs || 1000,
                  },
                })
              }
            />
          </div>
          <div>
            <Label className="text-xs">Initial Delay (ms)</Label>
            <Input
              type="number"
              min={100}
              value={data.retry?.initialDelayMs || 1000}
              onChange={(e) =>
                onChange({
                  ...data,
                  retry: {
                    ...data.retry,
                    attempts: data.retry?.attempts || 1,
                    backoff: 'exponential',
                    initialDelayMs: parseInt(e.target.value) || 1000,
                  },
                })
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// JIRA ACTION CONFIG
// =============================================================================

interface JiraConfigProps {
  data: ActionData & { actionType: 'jira' };
  onChange: (data: Partial<ActionData>) => void;
}

function JiraConfig({ data, onChange }: JiraConfigProps) {
  const config = data.config;

  const updateConfig = (updates: Partial<typeof config>) => {
    onChange({
      ...data,
      config: { ...config, ...updates },
    });
  };

  return (
    <div className="space-y-4">
      {/* Name */}
      <div className="space-y-2">
        <Label htmlFor="jira-name">
          Name <span className="text-red-500">*</span>
        </Label>
        <Input
          id="jira-name"
          value={data.name || ''}
          onChange={(e) => onChange({ ...data, name: e.target.value })}
          placeholder="e.g., Create Incident Ticket"
        />
      </div>

      {/* Project Key */}
      <div className="space-y-2">
        <Label htmlFor="jira-project">
          Project Key <span className="text-red-500">*</span>
        </Label>
        <Input
          id="jira-project"
          value={config.projectKey || ''}
          onChange={(e) => updateConfig({ projectKey: e.target.value })}
          placeholder="e.g., ONCALL"
        />
      </div>

      {/* Issue Type */}
      <div className="space-y-2">
        <Label htmlFor="jira-type">Issue Type</Label>
        <Select
          value={config.issueType || 'Bug'}
          onValueChange={(value) => updateConfig({ issueType: value })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Bug">Bug</SelectItem>
            <SelectItem value="Task">Task</SelectItem>
            <SelectItem value="Incident">Incident</SelectItem>
            <SelectItem value="Story">Story</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary (template) */}
      <div className="space-y-2">
        <Label htmlFor="jira-summary">
          Summary <span className="text-red-500">*</span>
        </Label>
        <Input
          id="jira-summary"
          value={config.summary || ''}
          onChange={(e) => updateConfig({ summary: e.target.value })}
          placeholder="[OnCall] {{incident.title}}"
        />
        <TemplateVariablesHelper
          onInsert={(v) => updateConfig({ summary: (config.summary || '') + v })}
        />
      </div>

      {/* Description (template) */}
      <div className="space-y-2">
        <Label htmlFor="jira-description">Description</Label>
        <Textarea
          id="jira-description"
          value={config.description || ''}
          onChange={(e) => updateConfig({ description: e.target.value })}
          placeholder="Incident: {{incident.title}}\nPriority: {{incident.priority}}\nTeam: {{team.name}}"
          rows={4}
        />
        <TemplateVariablesHelper
          onInsert={(v) => updateConfig({ description: (config.description || '') + v })}
        />
      </div>

      {/* Priority */}
      <div className="space-y-2">
        <Label htmlFor="jira-priority">Priority</Label>
        <Select
          value={config.priority || ''}
          onValueChange={(value) => updateConfig({ priority: value || undefined })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Highest">Highest</SelectItem>
            <SelectItem value="High">High</SelectItem>
            <SelectItem value="Medium">Medium</SelectItem>
            <SelectItem value="Low">Low</SelectItem>
            <SelectItem value="Lowest">Lowest</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Labels */}
      <div className="space-y-2">
        <Label htmlFor="jira-labels">Labels (comma-separated)</Label>
        <Input
          id="jira-labels"
          value={config.labels?.join(', ') || ''}
          onChange={(e) =>
            updateConfig({
              labels: e.target.value
                ? e.target.value.split(',').map((l) => l.trim())
                : undefined,
            })
          }
          placeholder="oncall, incident, auto-created"
        />
      </div>
    </div>
  );
}

// =============================================================================
// LINEAR ACTION CONFIG
// =============================================================================

interface LinearConfigProps {
  data: ActionData & { actionType: 'linear' };
  onChange: (data: Partial<ActionData>) => void;
}

function LinearConfig({ data, onChange }: LinearConfigProps) {
  const config = data.config;

  const updateConfig = (updates: Partial<typeof config>) => {
    onChange({
      ...data,
      config: { ...config, ...updates },
    });
  };

  return (
    <div className="space-y-4">
      {/* Name */}
      <div className="space-y-2">
        <Label htmlFor="linear-name">
          Name <span className="text-red-500">*</span>
        </Label>
        <Input
          id="linear-name"
          value={data.name || ''}
          onChange={(e) => onChange({ ...data, name: e.target.value })}
          placeholder="e.g., Create Linear Issue"
        />
      </div>

      {/* Team ID */}
      <div className="space-y-2">
        <Label htmlFor="linear-team">
          Team ID <span className="text-red-500">*</span>
        </Label>
        <Input
          id="linear-team"
          value={config.teamId || ''}
          onChange={(e) => updateConfig({ teamId: e.target.value })}
          placeholder="Linear team ID"
        />
      </div>

      {/* Title (template) */}
      <div className="space-y-2">
        <Label htmlFor="linear-title">
          Title <span className="text-red-500">*</span>
        </Label>
        <Input
          id="linear-title"
          value={config.title || ''}
          onChange={(e) => updateConfig({ title: e.target.value })}
          placeholder="[OnCall] {{incident.title}}"
        />
        <TemplateVariablesHelper
          onInsert={(v) => updateConfig({ title: (config.title || '') + v })}
        />
      </div>

      {/* Description (template) */}
      <div className="space-y-2">
        <Label htmlFor="linear-description">Description</Label>
        <Textarea
          id="linear-description"
          value={config.description || ''}
          onChange={(e) => updateConfig({ description: e.target.value })}
          placeholder="Incident: {{incident.title}}\nPriority: {{incident.priority}}"
          rows={4}
        />
        <TemplateVariablesHelper
          onInsert={(v) => updateConfig({ description: (config.description || '') + v })}
        />
      </div>

      {/* Priority (0-4) */}
      <div className="space-y-2">
        <Label htmlFor="linear-priority">Priority</Label>
        <Select
          value={String(config.priority ?? '')}
          onValueChange={(value) =>
            updateConfig({ priority: value ? parseInt(value) : undefined })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Select priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">No priority</SelectItem>
            <SelectItem value="1">Urgent</SelectItem>
            <SelectItem value="2">High</SelectItem>
            <SelectItem value="3">Normal</SelectItem>
            <SelectItem value="4">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// =============================================================================
// CONDITION CONFIG
// =============================================================================

interface ConditionConfigProps {
  data: ConditionData;
  onChange: (data: Partial<ConditionData>) => void;
}

function ConditionConfig({ data, onChange }: ConditionConfigProps) {
  return (
    <div className="space-y-4">
      {/* Name */}
      <div className="space-y-2">
        <Label htmlFor="condition-name">
          Name <span className="text-red-500">*</span>
        </Label>
        <Input
          id="condition-name"
          value={data.name || ''}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="e.g., Check Priority"
        />
      </div>

      {/* Field */}
      <div className="space-y-2">
        <Label htmlFor="condition-field">
          Field <span className="text-red-500">*</span>
        </Label>
        <Select
          value={data.field || ''}
          onValueChange={(value) => onChange({ field: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select field" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="priority">priority</SelectItem>
            <SelectItem value="status">status</SelectItem>
            <SelectItem value="metadata.service">service</SelectItem>
            <SelectItem value="team.name">team name</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Value */}
      <div className="space-y-2">
        <Label htmlFor="condition-value">
          Value <span className="text-red-500">*</span>
        </Label>
        <Input
          id="condition-value"
          value={data.value || ''}
          onChange={(e) => onChange({ value: e.target.value })}
          placeholder="e.g., CRITICAL"
        />
      </div>

      {/* Preview */}
      <div className="bg-muted/50 rounded-lg p-3">
        <Label className="text-xs text-muted-foreground">Condition Preview</Label>
        <div className="mt-1 font-mono text-sm">
          if ({data.field || 'field'} = "{data.value || 'value'}") then...
        </div>
        <div className="mt-2 flex gap-4 text-xs">
          <span className="text-green-600">True path: right handle</span>
          <span className="text-red-600">False path: left handle</span>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// DELAY CONFIG
// =============================================================================

interface DelayConfigProps {
  data: DelayData;
  onChange: (data: Partial<DelayData>) => void;
}

const DELAY_PRESETS = [
  { label: '1 min', value: 1 },
  { label: '5 min', value: 5 },
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '1 hour', value: 60 },
];

function DelayConfig({ data, onChange }: DelayConfigProps) {
  return (
    <div className="space-y-4">
      {/* Name */}
      <div className="space-y-2">
        <Label htmlFor="delay-name">
          Name <span className="text-red-500">*</span>
        </Label>
        <Input
          id="delay-name"
          value={data.name || ''}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="e.g., Wait before retry"
        />
      </div>

      {/* Duration */}
      <div className="space-y-2">
        <Label htmlFor="delay-duration">
          Duration (minutes) <span className="text-red-500">*</span>
        </Label>
        <Input
          id="delay-duration"
          type="number"
          min={1}
          value={data.durationMinutes || ''}
          onChange={(e) =>
            onChange({ durationMinutes: parseInt(e.target.value) || undefined })
          }
          placeholder="Enter duration"
          className={cn(!data.durationMinutes && 'border-red-300')}
        />
      </div>

      {/* Presets */}
      <div className="space-y-2">
        <Label>Quick presets</Label>
        <div className="flex flex-wrap gap-2">
          {DELAY_PRESETS.map((preset) => (
            <Badge
              key={preset.value}
              variant={data.durationMinutes === preset.value ? 'default' : 'secondary'}
              className="cursor-pointer"
              onClick={() => onChange({ durationMinutes: preset.value })}
            >
              {preset.label}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function NodeConfigPanel({ selectedNode, onChange }: NodeConfigPanelProps) {
  if (!selectedNode) {
    return (
      <div className="w-80 border-l bg-background p-4">
        <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
          <AlertCircle className="h-8 w-8 mb-2" />
          <p className="text-sm">Select a node to configure</p>
        </div>
      </div>
    );
  }

  const handleChange = useCallback(
    (updates: Record<string, unknown>) => {
      onChange(selectedNode.id, { ...selectedNode.data, ...updates });
    },
    [selectedNode.id, selectedNode.data, onChange]
  );

  const nodeType = selectedNode.type as string;
  const nodeData = selectedNode.data as Record<string, unknown>;

  // Determine icon and title based on node type
  let Icon = Zap;
  let title = 'Configure Node';
  let color = 'text-gray-600';

  if (nodeType === 'trigger') {
    Icon = Zap;
    title = 'Configure Trigger';
    color = 'text-purple-600';
  } else if (nodeType === 'action') {
    const actionType = (nodeData as ActionData).actionType;
    if (actionType === 'webhook') {
      Icon = Globe;
      title = 'Configure Webhook';
      color = 'text-blue-600';
    } else if (actionType === 'jira') {
      Icon = Ticket;
      title = 'Configure Jira';
      color = 'text-blue-600';
    } else if (actionType === 'linear') {
      Icon = ListTodo;
      title = 'Configure Linear';
      color = 'text-violet-600';
    }
  } else if (nodeType === 'condition') {
    Icon = GitBranch;
    title = 'Configure Condition';
    color = 'text-amber-600';
  } else if (nodeType === 'delay') {
    Icon = Timer;
    title = 'Configure Delay';
    color = 'text-gray-600';
  }

  return (
    <div className="w-80 border-l bg-background flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center gap-2">
          <Icon className={cn('h-5 w-5', color)} />
          <h2 className="font-semibold">{title}</h2>
        </div>
      </div>

      {/* Config form - scrollable */}
      <div className="flex-1 overflow-y-auto p-4">
        {nodeType === 'trigger' && (
          <TriggerConfig data={nodeData as TriggerData} onChange={handleChange} />
        )}

        {nodeType === 'action' && (nodeData as ActionData).actionType === 'webhook' && (
          <WebhookConfig
            data={nodeData as ActionData & { actionType: 'webhook' }}
            onChange={handleChange}
          />
        )}

        {nodeType === 'action' && (nodeData as ActionData).actionType === 'jira' && (
          <JiraConfig
            data={nodeData as ActionData & { actionType: 'jira' }}
            onChange={handleChange}
          />
        )}

        {nodeType === 'action' && (nodeData as ActionData).actionType === 'linear' && (
          <LinearConfig
            data={nodeData as ActionData & { actionType: 'linear' }}
            onChange={handleChange}
          />
        )}

        {nodeType === 'condition' && (
          <ConditionConfig data={nodeData as ConditionData} onChange={handleChange} />
        )}

        {nodeType === 'delay' && (
          <DelayConfig data={nodeData as DelayData} onChange={handleChange} />
        )}
      </div>
    </div>
  );
}

export default NodeConfigPanel;
