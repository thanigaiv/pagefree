import { z } from 'zod';

// SCIM User schema (per RFC 7643)
export const ScimUserSchema = z.object({
  schemas: z.array(z.string()),
  externalId: z.string().optional(),
  userName: z.string(),
  name: z.object({
    givenName: z.string(),
    familyName: z.string(),
    formatted: z.string().optional()
  }).optional(),
  emails: z.array(z.object({
    value: z.string().email(),
    primary: z.boolean().optional(),
    type: z.string().optional()
  })).optional(),
  phoneNumbers: z.array(z.object({
    value: z.string(),
    type: z.string().optional()
  })).optional(),
  active: z.boolean().optional()
});

// SCIM Group schema
export const ScimGroupSchema = z.object({
  schemas: z.array(z.string()),
  externalId: z.string().optional(),
  displayName: z.string(),
  members: z.array(z.object({
    value: z.string(),
    display: z.string().optional()
  })).optional()
});

// SCIM Patch operation
export const ScimPatchSchema = z.object({
  schemas: z.array(z.string()),
  Operations: z.array(z.object({
    op: z.enum(['add', 'remove', 'replace']),
    path: z.string().optional(),
    value: z.any().optional()
  }))
});

// SCIM List response
export interface ScimListResponse<T> {
  schemas: string[];
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  Resources: T[];
}

// SCIM error response
export interface ScimError {
  schemas: string[];
  status: string;
  detail: string;
}

export const SCIM_SCHEMAS = {
  USER: 'urn:ietf:params:scim:schemas:core:2.0:User',
  GROUP: 'urn:ietf:params:scim:schemas:core:2.0:Group',
  LIST_RESPONSE: 'urn:ietf:params:scim:api:messages:2.0:ListResponse',
  PATCH: 'urn:ietf:params:scim:api:messages:2.0:PatchOp',
  ERROR: 'urn:ietf:params:scim:api:messages:2.0:Error'
};
