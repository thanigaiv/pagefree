import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { Pool } from 'pg';
import { env } from '../config/env.js';

const PgSession = connectPgSimple(session);

// Create dedicated pool for partner sessions (separate from internal sessions)
const partnerSessionPool = new Pool({
  connectionString: env.DATABASE_URL
});

export const partnerSessionMiddleware = session({
  store: new PgSession({
    pool: partnerSessionPool,
    tableName: 'PartnerSession',  // Different table from 'Session'
    createTableIfMissing: false   // Table created by Prisma migration
  }),
  secret: env.SESSION_SECRET,     // Can reuse same secret
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,  // 24 hours per PARTNER-02
    sameSite: 'lax'
  },
  name: 'partner.sid'             // Different cookie name from 'oncall.sid'
});
