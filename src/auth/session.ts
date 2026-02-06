import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { Pool } from 'pg';
import { env } from '../config/env.js';

const PgSession = connectPgSimple(session);

// Create dedicated pool for sessions (separate from Prisma)
const sessionPool = new Pool({
  connectionString: env.DATABASE_URL
});

export const sessionMiddleware = session({
  store: new PgSession({
    pool: sessionPool,
    tableName: 'Session', // Matches Prisma schema
    createTableIfMissing: false // Table created by Prisma migration
  }),
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax'
  },
  name: 'oncall.sid'
});
