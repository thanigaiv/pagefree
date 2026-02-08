#!/usr/bin/env npx tsx

/**
 * Create Break-Glass Admin Account
 *
 * Usage: npm run create-breakglass
 *
 * This script creates a break-glass admin account for emergency access.
 * Break-glass accounts:
 * - Use email/password authentication (not Okta)
 * - Have PLATFORM_ADMIN role
 * - Are for use ONLY when Okta is unavailable
 * - Should be stored securely (e.g., 1Password, LastPass)
 *
 * Per user decision: "Break-glass accounts are specifically for
 * Okta is down during critical incident scenarios"
 */

import { prisma } from '../config/database.js';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { auditService } from '../services/audit.service.js';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log('\n=== Create Break-Glass Admin Account ===\n');
  console.log('WARNING: This creates an emergency admin account.');
  console.log('Only create 2-3 break-glass accounts for the organization.');
  console.log('Store credentials securely (1Password, LastPass, etc.)\n');

  // Check existing break-glass accounts
  const existing = await prisma.user.count({
    where: { isBreakGlassAccount: true }
  });

  if (existing >= 3) {
    console.log(`WARNING: ${existing} break-glass accounts already exist.`);
    const proceed = await question('Continue anyway? (yes/no): ');
    if (proceed.toLowerCase() !== 'yes') {
      console.log('Aborted.');
      process.exit(0);
    }
  }

  // Gather info
  const email = await question('Email: ');
  if (!email || !email.includes('@')) {
    console.error('Invalid email address');
    process.exit(1);
  }

  // Check if email exists
  const existingUser = await prisma.user.findUnique({
    where: { email: email.toLowerCase() }
  });

  if (existingUser) {
    console.error(`User with email ${email} already exists.`);
    if (!existingUser.isBreakGlassAccount) {
      console.error('This is a regular Okta user, not a break-glass account.');
    }
    process.exit(1);
  }

  const firstName = await question('First Name: ');
  const lastName = await question('Last Name: ');

  // Generate secure password
  const generatePassword = await question('Generate random password? (yes/no): ');
  let password: string;

  if (generatePassword.toLowerCase() === 'yes') {
    password = crypto.randomBytes(16).toString('base64').slice(0, 20);
    console.log(`\nGenerated password: ${password}`);
    console.log('SAVE THIS PASSWORD SECURELY - it cannot be recovered!\n');
  } else {
    password = await question('Password (min 12 chars): ');
    if (password.length < 12) {
      console.error('Password must be at least 12 characters');
      process.exit(1);
    }
    const confirm = await question('Confirm password: ');
    if (password !== confirm) {
      console.error('Passwords do not match');
      process.exit(1);
    }
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, 12);

  // Create user
  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      firstName,
      lastName,
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
      createdBy: 'CLI script'
    }
  });

  console.log('\n=== Break-Glass Account Created ===');
  console.log(`ID: ${user.id}`);
  console.log(`Email: ${user.email}`);
  console.log(`Name: ${user.firstName} ${user.lastName}`);
  console.log(`Role: PLATFORM_ADMIN`);
  console.log('\nLogin URL: /auth/emergency');
  console.log('\nREMEMBER: Store these credentials securely!');

  rl.close();
  await prisma.$disconnect();
  process.exit(0);
}

main().catch(async (error) => {
  console.error('Error:', error);
  rl.close();
  await prisma.$disconnect();
  process.exit(1);
});
