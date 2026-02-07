-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."AlertSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO');

-- CreateEnum
CREATE TYPE "public"."AlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "public"."NotificationChannel" AS ENUM ('EMAIL', 'SMS', 'PUSH', 'SLACK', 'VOICE');

-- CreateEnum
CREATE TYPE "public"."PlatformRole" AS ENUM ('PLATFORM_ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "public"."TagType" AS ENUM ('ORGANIZATIONAL', 'TECHNICAL');

-- CreateEnum
CREATE TYPE "public"."TeamRole" AS ENUM ('TEAM_ADMIN', 'RESPONDER', 'OBSERVER');

-- CreateTable
CREATE TABLE "public"."Alert" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "severity" "public"."AlertSeverity" NOT NULL,
    "status" "public"."AlertStatus" NOT NULL DEFAULT 'OPEN',
    "source" TEXT NOT NULL,
    "externalId" TEXT,
    "triggeredAt" TIMESTAMPTZ(6) NOT NULL,
    "acknowledgedAt" TIMESTAMPTZ(6),
    "resolvedAt" TIMESTAMPTZ(6),
    "closedAt" TIMESTAMPTZ(6),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "integrationId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ApiKey" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "description" TEXT,
    "scopes" TEXT[],
    "createdById" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMPTZ(6),
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuditEvent" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "userId" TEXT,
    "teamId" TEXT,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "severity" TEXT NOT NULL,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ContactVerification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "verifiedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Integration" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "webhookSecret" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "signatureHeader" TEXT NOT NULL DEFAULT 'X-Webhook-Signature',
    "signatureAlgorithm" TEXT NOT NULL DEFAULT 'sha256',
    "signatureFormat" TEXT NOT NULL DEFAULT 'hex',
    "signaturePrefix" TEXT,
    "deduplicationWindowMinutes" INTEGER NOT NULL DEFAULT 15,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "public"."NotificationChannel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "deviceInfo" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "lastUsedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Session" (
    "sid" TEXT NOT NULL,
    "sess" JSONB NOT NULL,
    "expire" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("sid")
);

-- CreateTable
CREATE TABLE "public"."Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "syncedFromOkta" BOOLEAN NOT NULL DEFAULT false,
    "oktaGroupId" TEXT,
    "slackChannel" TEXT,
    "notificationDefaults" JSONB,
    "escalationDefaults" JSONB,
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TeamMember" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "role" "public"."TeamRole" NOT NULL,
    "joinedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TeamTag" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "tagType" "public"."TagType" NOT NULL,
    "tagValue" TEXT NOT NULL,

    CONSTRAINT "TeamTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "oktaId" TEXT,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isBreakGlassAccount" BOOLEAN NOT NULL DEFAULT false,
    "passwordHash" TEXT,
    "platformRole" "public"."PlatformRole" NOT NULL DEFAULT 'USER',
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "pushEnabled" BOOLEAN NOT NULL DEFAULT false,
    "syncedFromOkta" BOOLEAN NOT NULL DEFAULT false,
    "deactivatedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "deviceToken" TEXT NOT NULL,
    "deviceName" TEXT,
    "lastSeenAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WebhookDelivery" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "contentFingerprint" TEXT NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "headers" JSONB NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "errorMessage" TEXT,
    "processedAt" TIMESTAMPTZ(6) NOT NULL,
    "integrationId" TEXT NOT NULL,
    "alertId" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Alert_externalId_idx" ON "public"."Alert"("externalId" ASC);

-- CreateIndex
CREATE INDEX "Alert_integrationId_triggeredAt_idx" ON "public"."Alert"("integrationId" ASC, "triggeredAt" ASC);

-- CreateIndex
CREATE INDEX "Alert_severity_triggeredAt_idx" ON "public"."Alert"("severity" ASC, "triggeredAt" ASC);

-- CreateIndex
CREATE INDEX "Alert_status_triggeredAt_idx" ON "public"."Alert"("status" ASC, "triggeredAt" ASC);

-- CreateIndex
CREATE INDEX "ApiKey_keyHash_idx" ON "public"."ApiKey"("keyHash" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "public"."ApiKey"("keyHash" ASC);

-- CreateIndex
CREATE INDEX "ApiKey_keyPrefix_idx" ON "public"."ApiKey"("keyPrefix" ASC);

-- CreateIndex
CREATE INDEX "ApiKey_service_idx" ON "public"."ApiKey"("service" ASC);

-- CreateIndex
CREATE INDEX "AuditEvent_action_timestamp_idx" ON "public"."AuditEvent"("action" ASC, "timestamp" ASC);

-- CreateIndex
CREATE INDEX "AuditEvent_severity_timestamp_idx" ON "public"."AuditEvent"("severity" ASC, "timestamp" ASC);

-- CreateIndex
CREATE INDEX "AuditEvent_teamId_timestamp_idx" ON "public"."AuditEvent"("teamId" ASC, "timestamp" ASC);

-- CreateIndex
CREATE INDEX "AuditEvent_timestamp_idx" ON "public"."AuditEvent"("timestamp" ASC);

-- CreateIndex
CREATE INDEX "AuditEvent_userId_timestamp_idx" ON "public"."AuditEvent"("userId" ASC, "timestamp" ASC);

-- CreateIndex
CREATE INDEX "ContactVerification_expiresAt_idx" ON "public"."ContactVerification"("expiresAt" ASC);

-- CreateIndex
CREATE INDEX "ContactVerification_userId_method_idx" ON "public"."ContactVerification"("userId" ASC, "method" ASC);

-- CreateIndex
CREATE INDEX "Integration_isActive_idx" ON "public"."Integration"("isActive" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Integration_name_key" ON "public"."Integration"("name" ASC);

-- CreateIndex
CREATE INDEX "Integration_type_idx" ON "public"."Integration"("type" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_channel_key" ON "public"."NotificationPreference"("userId" ASC, "channel" ASC);

-- CreateIndex
CREATE INDEX "NotificationPreference_userId_idx" ON "public"."NotificationPreference"("userId" ASC);

-- CreateIndex
CREATE INDEX "NotificationPreference_userId_priority_idx" ON "public"."NotificationPreference"("userId" ASC, "priority" ASC);

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_idx" ON "public"."RefreshToken"("expiresAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "public"."RefreshToken"("token" ASC);

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "public"."RefreshToken"("userId" ASC);

-- CreateIndex
CREATE INDEX "Session_expire_idx" ON "public"."Session"("expire" ASC);

-- CreateIndex
CREATE INDEX "Team_isActive_idx" ON "public"."Team"("isActive" ASC);

-- CreateIndex
CREATE INDEX "Team_name_idx" ON "public"."Team"("name" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Team_name_key" ON "public"."Team"("name" ASC);

-- CreateIndex
CREATE INDEX "Team_oktaGroupId_idx" ON "public"."Team"("oktaGroupId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Team_oktaGroupId_key" ON "public"."Team"("oktaGroupId" ASC);

-- CreateIndex
CREATE INDEX "TeamMember_role_idx" ON "public"."TeamMember"("role" ASC);

-- CreateIndex
CREATE INDEX "TeamMember_teamId_idx" ON "public"."TeamMember"("teamId" ASC);

-- CreateIndex
CREATE INDEX "TeamMember_userId_idx" ON "public"."TeamMember"("userId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_userId_teamId_key" ON "public"."TeamMember"("userId" ASC, "teamId" ASC);

-- CreateIndex
CREATE INDEX "TeamTag_tagType_tagValue_idx" ON "public"."TeamTag"("tagType" ASC, "tagValue" ASC);

-- CreateIndex
CREATE INDEX "TeamTag_teamId_idx" ON "public"."TeamTag"("teamId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "TeamTag_teamId_tagType_tagValue_key" ON "public"."TeamTag"("teamId" ASC, "tagType" ASC, "tagValue" ASC);

-- CreateIndex
CREATE INDEX "User_email_idx" ON "public"."User"("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email" ASC);

-- CreateIndex
CREATE INDEX "User_isActive_idx" ON "public"."User"("isActive" ASC);

-- CreateIndex
CREATE INDEX "User_oktaId_idx" ON "public"."User"("oktaId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_oktaId_key" ON "public"."User"("oktaId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "UserDevice_userId_deviceToken_key" ON "public"."UserDevice"("userId" ASC, "deviceToken" ASC);

-- CreateIndex
CREATE INDEX "UserDevice_userId_idx" ON "public"."UserDevice"("userId" ASC);

-- CreateIndex
CREATE INDEX "WebhookDelivery_alertId_idx" ON "public"."WebhookDelivery"("alertId" ASC);

-- CreateIndex
CREATE INDEX "WebhookDelivery_integrationId_contentFingerprint_createdAt_idx" ON "public"."WebhookDelivery"("integrationId" ASC, "contentFingerprint" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "WebhookDelivery_integrationId_createdAt_idx" ON "public"."WebhookDelivery"("integrationId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "WebhookDelivery_integrationId_idempotencyKey_idx" ON "public"."WebhookDelivery"("integrationId" ASC, "idempotencyKey" ASC);

-- AddForeignKey
ALTER TABLE "public"."Alert" ADD CONSTRAINT "Alert_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "public"."Integration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ApiKey" ADD CONSTRAINT "ApiKey_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditEvent" ADD CONSTRAINT "AuditEvent_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditEvent" ADD CONSTRAINT "AuditEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ContactVerification" ADD CONSTRAINT "ContactVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TeamMember" ADD CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TeamTag" ADD CONSTRAINT "TeamTag_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserDevice" ADD CONSTRAINT "UserDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "public"."Alert"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "public"."Integration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

