#!/usr/bin/env npx tsx

/**
 * Create Break-Glass Admin Account (Non-Interactive)
 * This script creates admin accounts without requiring user interaction
 */

import { prisma } from '../config/database.js';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { auditService } from '../services/audit.service.js';

async function main() {
  console.log('\n=== Creating Break-Glass Admin Accounts ===\n');

  // Define admin accounts to create
  const admins = [
    {
      email: 'admin1@pagefree.local',
      firstName: 'Admin',
      lastName: 'One',
    },
    {
      email: 'admin2@pagefree.local',
      firstName: 'Admin',
      lastName: 'Two',
    },
  ];

  for (const admin of admins) {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: admin.email.toLowerCase() }
    });

    if (existingUser) {
      console.log(`⚠️  User ${admin.email} already exists. Skipping...`);
      continue;
    }

    // Generate secure random password
    const password = crypto.randomBytes(16).toString('base64').slice(0, 20);
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: admin.email.toLowerCase(),
        firstName: admin.firstName,
        lastName: admin.lastName,
        passwordHash,
        isBreakGlassAccount: true,
        platformRole: 'PLATFORM_ADMIN',
        isActive: true,
        syncedFromOkta: false
      }
    });

    // Log creation
    await auditService.log({
      action: 'user.breakglass.created',
      userId: user.id,
      severity: 'HIGH',
      metadata: {
        email: user.email,
        createdBy: 'CLI script (non-interactive)'
      }
    });

    console.log(`\n✅ Break-Glass Account Created`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Password: ${password}`);
    console.log(`   Name: ${user.firstName} ${user.lastName}`);
    console.log(`   Role: PLATFORM_ADMIN`);
    console.log(`   Login URL: http://localhost:3001/auth/emergency`);
    console.log('\n   ⚠️  SAVE THIS PASSWORD SECURELY - it cannot be recovered!\n');
  }

  console.log('=== Complete ===');
  console.log('Remember: Store these credentials securely!');

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
