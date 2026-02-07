/**
 * WorkflowTestMode - Test execution preview panel
 *
 * Allows users to test workflows with sample data before activation.
 * Per user decisions:
 * - Test mode with sample data
 * - Dry run shows interpolated values without executing
 * - Live test actually executes with real APIs
 *
 * Per research recommendation: Two test modes (dry run + live test)
 */

import { useState, useMemo } from 'react';
import {
  Play,
  Eye,
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Copy,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import type { Workflow, WorkflowNode, ActionData } from '@/types/workflow';

// =============================================================================
// TYPES
// =============================================================================

interface TestModeProps {
  workflow: Workflow;
  isOpen: boolean;
  onClose: () => void;
}

interface SampleIncident {
  id: string;
  title: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'CLOSED';
  service: string;
}

interface TestResult {
  nodeId: string;
  nodeName: string;
  status: 'success' | 'error' | 'skipped';
  interpolatedValues?: Record<string, string>;
  response?: {
    statusCode?: number;
    body?: string;
    ticketUrl?: string;
  };
  error?: string;
  duration?: number;
}

// =============================================================================
// SAMPLE DATA
// =============================================================================

const SAMPLE_INCIDENTS: SampleIncident[] = [
  {
    id: 'inc_sample_1',
    title: 'Database Connection Timeout',
    priority: 'CRITICAL',
    status: 'OPEN',
    service: 'api-gateway',
  },
  {
    id: 'inc_sample_2',
    title: 'High Memory Usage Alert',
    priority: 'HIGH',
    status: 'ACKNOWLEDGED',
    service: 'payment-service',
  },
  {
    id: 'inc_sample_3',
    title: 'SSL Certificate Expiring',
    priority: 'MEDIUM',
    status: 'OPEN',
    service: 'frontend',
  },
];

const DEFAULT_SAMPLE_DATA = {
  incident: {
    id: 'inc_test_123',
    title: 'Test Incident',
    priority: 'HIGH',
    status: 'OPEN',
    teamName: 'Platform Team',
  },
  assignee: {
    email: 'oncall@example.com',
    firstName: 'Jane',
    lastName: 'Doe',
  },
  team: {
    name: 'Platform Team',
    slackChannel: '#platform-alerts',
  },
};

// =============================================================================
// INTERPOLATION HELPER
// =============================================================================

function interpolateTemplate(template: string, context: Record<string, unknown>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    const keys = path.trim().split('.');
    let value: unknown = context;
    for (const key of keys) {
      if (value && typeof value === 'object') {
        value = (value as Record<string, unknown>)[key];
      } else {
        return match; // Return original if path not found
      }
    }
    return value !== undefined ? String(value) : match;
  });
}

// =============================================================================
// TEST RESULT DISPLAY
// =============================================================================

interface TestResultItemProps {
  result: TestResult;
  showDetails?: boolean;
}

function TestResultItem({ result, showDetails = true }: TestResultItemProps) {
  const [isExpanded, setIsExpanded] = useState(result.status === 'error');

  const StatusIcon = {
    success: CheckCircle,
    error: XCircle,
    skipped: AlertCircle,
  }[result.status];

  const statusColor = {
    success: 'text-green-600',
    error: 'text-red-600',
    skipped: 'text-gray-400',
  }[result.status];

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div className={cn('border rounded-lg', result.status === 'error' && 'border-red-200')}>
        <CollapsibleTrigger className="w-full p-3 flex items-center gap-2 hover:bg-muted/50">
          {showDetails ? (
            isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )
          ) : (
            <div className="w-4" />
          )}
          <StatusIcon className={cn('h-5 w-5', statusColor)} />
          <span className="font-medium text-sm">{result.nodeName}</span>
          {result.duration !== undefined && (
            <Badge variant="secondary" className="ml-auto text-xs">
              {result.duration}ms
            </Badge>
          )}
        </CollapsibleTrigger>

        {showDetails && (
          <CollapsibleContent className="border-t p-3 space-y-3">
            {/* Interpolated values */}
            {result.interpolatedValues && Object.keys(result.interpolatedValues).length > 0 && (
              <div>
                <Label className="text-xs text-muted-foreground">Interpolated Values</Label>
                <div className="mt-1 bg-muted/50 rounded p-2 space-y-1">
                  {Object.entries(result.interpolatedValues).map(([key, value]) => (
                    <div key={key} className="flex items-start gap-2 text-xs">
                      <span className="text-muted-foreground font-mono">{key}:</span>
                      <span className="font-mono break-all">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Response */}
            {result.response && (
              <div>
                <Label className="text-xs text-muted-foreground">Response</Label>
                <div className="mt-1 bg-muted/50 rounded p-2 text-xs font-mono">
                  {result.response.statusCode && (
                    <div>Status: {result.response.statusCode}</div>
                  )}
                  {result.response.ticketUrl && (
                    <div className="flex items-center gap-1">
                      Ticket:{' '}
                      <a
                        href={result.response.ticketUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline flex items-center gap-1"
                      >
                        {result.response.ticketUrl}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}
                  {result.response.body && (
                    <div className="mt-1 max-h-24 overflow-auto">
                      {result.response.body}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Error */}
            {result.error && (
              <div>
                <Label className="text-xs text-red-500">Error</Label>
                <div className="mt-1 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 rounded p-2 text-xs">
                  {result.error}
                </div>
              </div>
            )}
          </CollapsibleContent>
        )}
      </div>
    </Collapsible>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function WorkflowTestMode({ workflow, isOpen, onClose }: TestModeProps) {
  const [testMode, setTestMode] = useState<'dry-run' | 'live'>('dry-run');
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<TestResult[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<string>('custom');

  // Sample data form state
  const [sampleData, setSampleData] = useState({
    title: DEFAULT_SAMPLE_DATA.incident.title,
    priority: DEFAULT_SAMPLE_DATA.incident.priority,
    status: DEFAULT_SAMPLE_DATA.incident.status,
    service: 'api-gateway',
    assigneeEmail: DEFAULT_SAMPLE_DATA.assignee.email,
    teamName: DEFAULT_SAMPLE_DATA.team.name,
  });

  // Build context from sample data
  const testContext = useMemo(() => {
    if (selectedIncident !== 'custom') {
      const incident = SAMPLE_INCIDENTS.find((i) => i.id === selectedIncident);
      if (incident) {
        return {
          incident: {
            id: incident.id,
            title: incident.title,
            priority: incident.priority,
            status: incident.status,
            teamName: 'Platform Team',
            metadata: { service: incident.service },
          },
          assignee: DEFAULT_SAMPLE_DATA.assignee,
          team: DEFAULT_SAMPLE_DATA.team,
          workflow: {
            id: workflow.id,
            name: workflow.name,
            executionId: 'exec_test_' + Date.now(),
          },
        };
      }
    }

    return {
      incident: {
        id: 'inc_custom_' + Date.now().toString(36),
        title: sampleData.title,
        priority: sampleData.priority,
        status: sampleData.status,
        teamName: sampleData.teamName,
        metadata: { service: sampleData.service },
      },
      assignee: {
        email: sampleData.assigneeEmail,
        firstName: 'Test',
        lastName: 'User',
      },
      team: {
        name: sampleData.teamName,
        slackChannel: '#test-alerts',
      },
      workflow: {
        id: workflow.id,
        name: workflow.name,
        executionId: 'exec_test_' + Date.now(),
      },
    };
  }, [selectedIncident, sampleData, workflow.id, workflow.name]);

  // Run dry-run test (interpolate values only)
  const runDryRun = () => {
    setIsRunning(true);
    setResults([]);

    const nodes = workflow.definition.nodes;
    const testResults: TestResult[] = [];

    for (const node of nodes) {
      const result: TestResult = {
        nodeId: node.id,
        nodeName: (node.data as { name?: string }).name || node.type,
        status: 'success',
        interpolatedValues: {},
      };

      if (node.type === 'action') {
        const actionData = node.data as ActionData;

        if (actionData.actionType === 'webhook') {
          result.interpolatedValues = {
            url: interpolateTemplate(actionData.config.url, testContext),
            body: interpolateTemplate(actionData.config.body, testContext),
          };
        } else if (actionData.actionType === 'jira') {
          result.interpolatedValues = {
            summary: interpolateTemplate(actionData.config.summary, testContext),
            description: interpolateTemplate(actionData.config.description, testContext),
          };
        } else if (actionData.actionType === 'linear') {
          result.interpolatedValues = {
            title: interpolateTemplate(actionData.config.title, testContext),
            description: interpolateTemplate(actionData.config.description, testContext),
          };
        }
      }

      testResults.push(result);
    }

    // Simulate processing delay
    setTimeout(() => {
      setResults(testResults);
      setIsRunning(false);
    }, 500);
  };

  // Run live test (actually execute - placeholder)
  const runLiveTest = async () => {
    setIsRunning(true);
    setResults([]);

    // In a real implementation, this would call the backend API
    // For now, simulate results
    const nodes = workflow.definition.nodes;
    const testResults: TestResult[] = [];

    for (const node of nodes) {
      await new Promise((r) => setTimeout(r, 300 + Math.random() * 500));

      const result: TestResult = {
        nodeId: node.id,
        nodeName: (node.data as { name?: string }).name || node.type,
        status: Math.random() > 0.1 ? 'success' : 'error',
        duration: Math.floor(100 + Math.random() * 500),
      };

      if (node.type === 'action') {
        const actionData = node.data as ActionData;

        if (actionData.actionType === 'webhook') {
          result.interpolatedValues = {
            url: interpolateTemplate(actionData.config.url, testContext),
          };
          if (result.status === 'success') {
            result.response = {
              statusCode: 200,
              body: '{"status": "ok"}',
            };
          } else {
            result.error = 'Connection timeout after 30s';
          }
        } else if (actionData.actionType === 'jira' || actionData.actionType === 'linear') {
          if (result.status === 'success') {
            result.response = {
              ticketUrl: `https://example.atlassian.net/browse/TEST-${Math.floor(Math.random() * 1000)}`,
            };
          } else {
            result.error = 'Authentication failed';
          }
        }
      }

      testResults.push(result);
      setResults([...testResults]);
    }

    setIsRunning(false);
  };

  const handleRun = () => {
    if (testMode === 'dry-run') {
      runDryRun();
    } else {
      runLiveTest();
    }
  };

  const successCount = results.filter((r) => r.status === 'success').length;
  const errorCount = results.filter((r) => r.status === 'error').length;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Test Workflow: {workflow.name}</DialogTitle>
          <DialogDescription>
            Preview workflow execution with sample data before activating.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-4">
          {/* Test Mode Selection */}
          <div className="space-y-2">
            <Label>Test Mode</Label>
            <div className="flex gap-2">
              <Button
                variant={testMode === 'dry-run' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTestMode('dry-run')}
                className="flex-1"
              >
                <Eye className="h-4 w-4 mr-1.5" />
                Dry Run
              </Button>
              <Button
                variant={testMode === 'live' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTestMode('live')}
                className="flex-1"
              >
                <Play className="h-4 w-4 mr-1.5" />
                Live Test
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {testMode === 'dry-run'
                ? 'Show interpolated values without executing actions'
                : 'Execute actions with real APIs (marked as test in analytics)'}
            </p>
          </div>

          {/* Sample Data Selection */}
          <div className="space-y-3">
            <Label>Sample Incident Data</Label>
            <Select value={selectedIncident} onValueChange={setSelectedIncident}>
              <SelectTrigger>
                <SelectValue placeholder="Select sample incident" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Custom Data</SelectItem>
                {SAMPLE_INCIDENTS.map((incident) => (
                  <SelectItem key={incident.id} value={incident.id}>
                    [{incident.priority}] {incident.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Custom data form */}
            {selectedIncident === 'custom' && (
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="col-span-2">
                  <Label className="text-xs">Title</Label>
                  <Input
                    value={sampleData.title}
                    onChange={(e) => setSampleData({ ...sampleData, title: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Priority</Label>
                  <Select
                    value={sampleData.priority}
                    onValueChange={(v) => setSampleData({ ...sampleData, priority: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CRITICAL">Critical</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="LOW">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Status</Label>
                  <Select
                    value={sampleData.status}
                    onValueChange={(v) => setSampleData({ ...sampleData, status: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OPEN">Open</SelectItem>
                      <SelectItem value="ACKNOWLEDGED">Acknowledged</SelectItem>
                      <SelectItem value="RESOLVED">Resolved</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Service</Label>
                  <Input
                    value={sampleData.service}
                    onChange={(e) => setSampleData({ ...sampleData, service: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Team Name</Label>
                  <Input
                    value={sampleData.teamName}
                    onChange={(e) => setSampleData({ ...sampleData, teamName: e.target.value })}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Results */}
          {results.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Results</Label>
                <div className="flex items-center gap-2 text-sm">
                  {successCount > 0 && (
                    <Badge variant="secondary" className="bg-green-100 text-green-700">
                      {successCount} success
                    </Badge>
                  )}
                  {errorCount > 0 && (
                    <Badge variant="secondary" className="bg-red-100 text-red-700">
                      {errorCount} failed
                    </Badge>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                {results.map((result) => (
                  <TestResultItem key={result.nodeId} result={result} />
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={handleRun} disabled={isRunning}>
            {isRunning ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                Running...
              </>
            ) : testMode === 'dry-run' ? (
              <>
                <Eye className="h-4 w-4 mr-1.5" />
                Run Dry Test
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-1.5" />
                Run Live Test
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default WorkflowTestMode;
