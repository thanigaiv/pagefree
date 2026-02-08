import crypto from 'crypto';
import { prisma } from '../config/database.js';
import { logger } from '../config/logger.js';

interface CreateStatusPageData {
  name: string;
  description?: string;
  teamId: string;
  createdById: string;
  isPublic?: boolean;
}

interface UpdateStatusPageData {
  name?: string;
  description?: string;
  isPublic?: boolean;
}

/**
 * Generate URL-friendly slug from name.
 * Converts to lowercase, replaces spaces with hyphens, removes non-alphanumeric except hyphens.
 * Appends short random suffix to ensure uniqueness.
 */
function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  // Append short random suffix for uniqueness
  const suffix = crypto.randomBytes(4).toString('hex');
  return `${base}-${suffix}`;
}

class StatusPageService {
  /**
   * Create a new status page.
   * Generates unique slug from name and accessToken if not public.
   */
  async create(data: CreateStatusPageData): Promise<{
    id: string;
    name: string;
    slug: string;
    description: string | null;
    isPublic: boolean;
    accessToken: string | null;
    teamId: string;
    createdAt: Date;
  }> {
    const slug = slugify(data.name);
    const isPublic = data.isPublic ?? false;

    // Generate access token for private pages
    const accessToken = isPublic ? null : crypto.randomBytes(32).toString('hex');

    const statusPage = await prisma.statusPage.create({
      data: {
        name: data.name,
        description: data.description,
        slug,
        isPublic,
        accessToken,
        teamId: data.teamId,
        createdById: data.createdById,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        isPublic: true,
        accessToken: true,
        teamId: true,
        createdAt: true,
      },
    });

    logger.info(
      { statusPageId: statusPage.id, slug, isPublic },
      'Status page created'
    );

    return statusPage;
  }

  /**
   * Get status page by ID with components.
   */
  async getById(id: string): Promise<any | null> {
    return prisma.statusPage.findUnique({
      where: { id },
      include: {
        components: {
          orderBy: { displayOrder: 'asc' },
        },
        team: {
          select: { id: true, name: true },
        },
        _count: {
          select: {
            subscribers: true,
            maintenanceWindows: true,
          },
        },
      },
    });
  }

  /**
   * Get status page by slug with access token verification.
   * Returns null if not public and access token doesn't match.
   * Does not return accessToken in response for security.
   */
  async getBySlug(slug: string, accessToken?: string): Promise<any | null> {
    const statusPage = await prisma.statusPage.findUnique({
      where: { slug },
      include: {
        components: {
          orderBy: { displayOrder: 'asc' },
          select: {
            id: true,
            name: true,
            description: true,
            displayOrder: true,
            currentStatus: true,
            statusUpdatedAt: true,
          },
        },
      },
    });

    if (!statusPage) {
      return null;
    }

    // Check access for non-public pages
    if (!statusPage.isPublic && statusPage.accessToken !== accessToken) {
      return null;
    }

    // Return without accessToken
    const { accessToken: _, ...pageWithoutToken } = statusPage;
    return pageWithoutToken;
  }

  /**
   * List all status pages for a team.
   */
  async listByTeam(teamId: string): Promise<any[]> {
    return prisma.statusPage.findMany({
      where: { teamId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        isPublic: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { components: true },
        },
      },
    });
  }

  /**
   * Update status page.
   * If changing isPublic from true to false and no accessToken exists, generate one.
   */
  async update(id: string, data: UpdateStatusPageData): Promise<any> {
    const existing = await prisma.statusPage.findUnique({
      where: { id },
      select: { isPublic: true, accessToken: true },
    });

    if (!existing) {
      throw new Error('Status page not found');
    }

    const updateData: any = { ...data };

    // Generate access token if making private and none exists
    if (data.isPublic === false && existing.isPublic === true && !existing.accessToken) {
      updateData.accessToken = crypto.randomBytes(32).toString('hex');
    }

    const updated = await prisma.statusPage.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        isPublic: true,
        updatedAt: true,
      },
    });

    logger.info({ statusPageId: id }, 'Status page updated');

    return updated;
  }

  /**
   * Delete status page.
   * Cascades to components, subscribers, etc.
   */
  async delete(id: string): Promise<void> {
    await prisma.statusPage.delete({
      where: { id },
    });

    logger.info({ statusPageId: id }, 'Status page deleted');
  }

  /**
   * Regenerate access token for a status page.
   * Returns the new token (only time token is returned after creation).
   */
  async regenerateAccessToken(id: string): Promise<string> {
    const newToken = crypto.randomBytes(32).toString('hex');

    await prisma.statusPage.update({
      where: { id },
      data: { accessToken: newToken },
    });

    logger.info({ statusPageId: id }, 'Status page access token regenerated');

    return newToken;
  }
}

export const statusPageService = new StatusPageService();
