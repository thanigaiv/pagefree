import { Router } from 'express';
import { scimAuth } from '../../middleware/scimAuth.js';
import { scimUserService } from './users.js';
import { scimGroupService } from './groups.js';
import { SCIM_SCHEMAS } from './schemas.js';

export const scimRouter = Router();

// Apply SCIM authentication to all routes
scimRouter.use(scimAuth);

// SCIM error helper
function scimError(res: any, status: number, detail: string) {
  return res.status(status).json({
    schemas: [SCIM_SCHEMAS.ERROR],
    status: String(status),
    detail
  });
}

// ============ USERS ============

// GET /scim/v2/Users
scimRouter.get('/Users', async (req, res) => {
  try {
    const result = await scimUserService.list({
      filter: req.query.filter as string,
      startIndex: parseInt(req.query.startIndex as string) || 1,
      count: parseInt(req.query.count as string) || 100
    });
    res.json(result);
  } catch (error) {
    scimError(res, 500, 'Internal server error');
  }
});

// GET /scim/v2/Users/:id
scimRouter.get('/Users/:id', async (req, res) => {
  try {
    const user = await scimUserService.get(req.params.id);
    if (!user) {
      return scimError(res, 404, 'User not found');
    }
    res.json(user);
  } catch (error) {
    scimError(res, 500, 'Internal server error');
  }
});

// POST /scim/v2/Users
scimRouter.post('/Users', async (req, res) => {
  try {
    const { user, created } = await scimUserService.create(req.body);
    res.status(created ? 201 : 200).json(user);
  } catch (error) {
    if ((error as any).name === 'ZodError') {
      return scimError(res, 400, 'Invalid user data');
    }
    scimError(res, 500, 'Internal server error');
  }
});

// PUT /scim/v2/Users/:id
scimRouter.put('/Users/:id', async (req, res) => {
  try {
    const user = await scimUserService.update(req.params.id, req.body);
    if (!user) {
      return scimError(res, 404, 'User not found');
    }
    res.json(user);
  } catch (error) {
    scimError(res, 500, 'Internal server error');
  }
});

// PATCH /scim/v2/Users/:id
scimRouter.patch('/Users/:id', async (req, res) => {
  try {
    const user = await scimUserService.patch(req.params.id, req.body.Operations);
    if (!user) {
      return scimError(res, 404, 'User not found');
    }
    res.json(user);
  } catch (error) {
    scimError(res, 500, 'Internal server error');
  }
});

// ============ GROUPS ============

// GET /scim/v2/Groups
scimRouter.get('/Groups', async (req, res) => {
  try {
    const result = await scimGroupService.list({
      filter: req.query.filter as string,
      startIndex: parseInt(req.query.startIndex as string) || 1,
      count: parseInt(req.query.count as string) || 100
    });
    res.json(result);
  } catch (error) {
    scimError(res, 500, 'Internal server error');
  }
});

// GET /scim/v2/Groups/:id
scimRouter.get('/Groups/:id', async (req, res) => {
  try {
    const group = await scimGroupService.get(req.params.id);
    if (!group) {
      return scimError(res, 404, 'Group not found');
    }
    res.json(group);
  } catch (error) {
    scimError(res, 500, 'Internal server error');
  }
});

// POST /scim/v2/Groups
scimRouter.post('/Groups', async (req, res) => {
  try {
    const { team, created } = await scimGroupService.create(req.body);
    res.status(created ? 201 : 200).json(team);
  } catch (error) {
    if ((error as any).name === 'ZodError') {
      return scimError(res, 400, 'Invalid group data');
    }
    scimError(res, 500, 'Internal server error');
  }
});

// PATCH /scim/v2/Groups/:id
scimRouter.patch('/Groups/:id', async (req, res) => {
  try {
    const group = await scimGroupService.patch(req.params.id, req.body.Operations);
    if (!group) {
      return scimError(res, 404, 'Group not found');
    }
    res.json(group);
  } catch (error) {
    scimError(res, 500, 'Internal server error');
  }
});

// DELETE /scim/v2/Groups/:id
scimRouter.delete('/Groups/:id', async (req, res) => {
  try {
    const deleted = await scimGroupService.delete(req.params.id);
    if (!deleted) {
      return scimError(res, 404, 'Group not found');
    }
    res.status(204).send();
  } catch (error) {
    scimError(res, 500, 'Internal server error');
  }
});
