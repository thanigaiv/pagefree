import { ZodError, ZodIssue } from 'zod';

/**
 * RFC 7807 Problem Details interface.
 * https://www.rfc-editor.org/rfc/rfc7807
 */
export interface ProblemDetails {
  type: string;         // URI identifying error type
  title: string;        // Human-readable summary
  status: number;       // HTTP status code
  detail?: string;      // Specific explanation
  instance?: string;    // URI identifying this occurrence
  // Extension fields
  [key: string]: any;
}

export interface ValidationError {
  field: string;
  code: string;
  message: string;
  received?: any;
}

const BASE_TYPE_URI = 'https://api.oncall.com/errors';

/**
 * Creates a Problem Details response.
 */
export function createProblemDetails(
  type: string,
  title: string,
  status: number,
  options: {
    detail?: string;
    instance?: string;
    extensions?: Record<string, any>;
  } = {}
): ProblemDetails {
  const problem: ProblemDetails = {
    type: `${BASE_TYPE_URI}/${type}`,
    title,
    status
  };

  if (options.detail) problem.detail = options.detail;
  if (options.instance) problem.instance = options.instance;

  // Add extension fields
  if (options.extensions) {
    Object.assign(problem, options.extensions);
  }

  return problem;
}

/**
 * Formats a Zod validation error into Problem Details.
 */
export function formatValidationError(
  error: ZodError,
  instance?: string
): ProblemDetails {
  const validationErrors: ValidationError[] = error.issues.map(formatZodIssue);

  return createProblemDetails(
    'validation-failed',
    'Webhook payload validation failed',
    400,
    {
      detail: 'One or more required fields are missing or invalid',
      instance,
      extensions: {
        validation_errors: validationErrors
      }
    }
  );
}

/**
 * Formats a single Zod issue into a validation error.
 */
function formatZodIssue(issue: ZodIssue): ValidationError {
  const error: ValidationError = {
    field: issue.path.join('.') || '(root)',
    code: issue.code,
    message: issue.message
  };

  // Include received value for type errors (helpful for debugging)
  if ('received' in issue && issue.received !== undefined) {
    error.received = issue.received;
  }

  return error;
}

// Pre-defined error factories for common webhook errors

export const webhookErrors = {
  missingSignature: (header: string, instance?: string) =>
    createProblemDetails('missing-signature', 'Missing signature header', 401, {
      detail: `${header} header is required`,
      instance
    }),

  invalidSignature: (instance?: string) =>
    createProblemDetails('invalid-signature', 'Invalid signature', 401, {
      detail: 'Webhook signature verification failed',
      instance
    }),

  integrationNotFound: (instance?: string) =>
    createProblemDetails('integration-not-found', 'Integration not found', 404, {
      detail: 'The specified integration does not exist or is inactive',
      instance
    }),

  processingFailed: (instance?: string) =>
    createProblemDetails('processing-failed', 'Internal processing error', 500, {
      detail: 'An unexpected error occurred while processing the webhook',
      instance
    }),

  rateLimited: (retryAfter: number, instance?: string) =>
    createProblemDetails('rate-limited', 'Rate limit exceeded', 429, {
      detail: `Too many requests. Please retry after ${retryAfter} seconds.`,
      instance,
      extensions: {
        retry_after: retryAfter
      }
    })
};
