import { z } from 'zod';
import { IANAZone } from 'luxon';
import { Schedule, ScheduleLayer, ScheduleOverride } from '@prisma/client';

// Custom timezone validator using IANAZone
const timezoneValidator = z.string().refine(
  (tz) => IANAZone.isValidZone(tz),
  { message: 'Must be a valid IANA timezone (e.g., America/New_York)' }
);

// Custom time validator (HH:MM format)
const timeFormatRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

// ============================================================================
// CREATE SCHEDULE INPUT
// ============================================================================

export const CreateScheduleInputSchema = z.object({
  teamId: z.string().cuid(),
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  timezone: timezoneValidator,
  startDate: z.string().datetime(), // ISO format
  endDate: z.string().datetime().optional(),
  handoffTime: z.string().regex(timeFormatRegex, 'Must be in HH:MM format (e.g., 09:00)'),
  rotationType: z.enum(['daily', 'weekly', 'custom']),
  rotationIntervalDays: z.number().int().min(1).max(365).optional(), // Required for custom
  rotationUserIds: z.array(z.string().cuid()).min(1, 'At least one user required in rotation')
}).refine(
  (data) => {
    // If rotationType is custom, rotationIntervalDays must be provided
    if (data.rotationType === 'custom' && !data.rotationIntervalDays) {
      return false;
    }
    return true;
  },
  {
    message: 'rotationIntervalDays is required when rotationType is custom',
    path: ['rotationIntervalDays']
  }
);

export type CreateScheduleInput = z.infer<typeof CreateScheduleInputSchema>;

// ============================================================================
// UPDATE SCHEDULE INPUT
// ============================================================================

export const UpdateScheduleInputSchema = z.object({
  id: z.string().cuid(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  timezone: timezoneValidator.optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  handoffTime: z.string().regex(timeFormatRegex, 'Must be in HH:MM format (e.g., 09:00)').optional(),
  rotationType: z.enum(['daily', 'weekly', 'custom']).optional(),
  rotationIntervalDays: z.number().int().min(1).max(365).optional(),
  rotationUserIds: z.array(z.string().cuid()).min(1).optional()
}).refine(
  (data) => {
    // If rotationType is custom, rotationIntervalDays must be provided
    if (data.rotationType === 'custom' && !data.rotationIntervalDays) {
      return false;
    }
    return true;
  },
  {
    message: 'rotationIntervalDays is required when rotationType is custom',
    path: ['rotationIntervalDays']
  }
);

export type UpdateScheduleInput = z.infer<typeof UpdateScheduleInputSchema>;

// ============================================================================
// SCHEDULE LIST QUERY
// ============================================================================

export const ScheduleListQuerySchema = z.object({
  teamId: z.string().cuid().optional(),
  isActive: z.coerce.boolean().optional()
});

export type ScheduleListQuery = z.infer<typeof ScheduleListQuerySchema>;

// ============================================================================
// LAYER TYPES (Phase 3 Plan 03)
// ============================================================================

export const DayOfWeek = z.enum(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']);
export type DayOfWeek = z.infer<typeof DayOfWeek>;

export const LayerRestrictionsSchema = z.object({
  daysOfWeek: z.array(DayOfWeek).optional(),
  // Future: startHour, endHour for time-of-day restrictions
}).optional();

export type LayerRestrictions = z.infer<typeof LayerRestrictionsSchema>;

export const CreateLayerInputSchema = z.object({
  scheduleId: z.string().cuid(),
  name: z.string().min(1).max(50),
  priority: z.number().int().min(1).max(100),
  timezone: timezoneValidator,
  startDate: z.string().datetime(),
  endDate: z.string().datetime().optional(),
  handoffTime: z.string().regex(timeFormatRegex),
  rotationType: z.enum(['daily', 'weekly', 'custom']),
  rotationIntervalDays: z.number().int().min(1).max(365).optional(),
  rotationUserIds: z.array(z.string().cuid()).min(1),
  restrictions: LayerRestrictionsSchema,
});

export const UpdateLayerInputSchema = CreateLayerInputSchema
  .omit({ scheduleId: true })
  .partial();

export type CreateLayerInput = z.infer<typeof CreateLayerInputSchema>;
export type UpdateLayerInput = z.infer<typeof UpdateLayerInputSchema>;

// ============================================================================
// RESPONSE TYPES
// ============================================================================

export interface ScheduleWithDetails extends Schedule {
  team: {
    id: string;
    name: string;
  };
  layers?: ScheduleLayer[];
  overrides?: ScheduleOverride[];
  _count?: {
    overrides: number;
  };
}

export interface LayerWithSchedule {
  id: string;
  scheduleId: string;
  name: string;
  priority: number;
  timezone: string;
  startDate: Date;
  endDate: Date | null;
  handoffTime: string;
  recurrenceRule: string;
  rotationUserIds: string[];
  restrictions: LayerRestrictions | null;
  isActive: boolean;
  schedule?: {
    id: string;
    name: string;
    teamId: string;
  };
}
