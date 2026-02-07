-- CreateTable: EscalationPolicy
CREATE TABLE "EscalationPolicy" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "repeatCount" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "EscalationPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable: EscalationLevel
CREATE TABLE "EscalationLevel" (
    "id" TEXT NOT NULL,
    "escalationPolicyId" TEXT NOT NULL,
    "levelNumber" INTEGER NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "timeoutMinutes" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EscalationLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Incident
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "escalationPolicyId" TEXT NOT NULL,
    "currentLevel" INTEGER NOT NULL DEFAULT 1,
    "currentRepeat" INTEGER NOT NULL DEFAULT 1,
    "assignedUserId" TEXT,
    "status" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "alertCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMPTZ,
    "resolvedAt" TIMESTAMPTZ,
    "closedAt" TIMESTAMPTZ,
    "lastEscalatedAt" TIMESTAMPTZ,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable: EscalationJob
CREATE TABLE "EscalationJob" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "bullJobId" TEXT NOT NULL,
    "scheduledLevel" INTEGER NOT NULL,
    "scheduledFor" TIMESTAMPTZ NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "cancelledAt" TIMESTAMPTZ,
    "executedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EscalationJob_pkey" PRIMARY KEY ("id")
);

-- AlterTable: Alert - Add incidentId column
ALTER TABLE "Alert" ADD COLUMN "incidentId" TEXT;

-- CreateIndex
CREATE INDEX "EscalationPolicy_teamId_idx" ON "EscalationPolicy"("teamId");

-- CreateIndex
CREATE INDEX "EscalationPolicy_teamId_isDefault_idx" ON "EscalationPolicy"("teamId", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "EscalationLevel_escalationPolicyId_levelNumber_key" ON "EscalationLevel"("escalationPolicyId", "levelNumber");

-- CreateIndex
CREATE INDEX "EscalationLevel_escalationPolicyId_levelNumber_idx" ON "EscalationLevel"("escalationPolicyId", "levelNumber");

-- CreateIndex
CREATE INDEX "Incident_teamId_status_idx" ON "Incident"("teamId", "status");

-- CreateIndex
CREATE INDEX "Incident_fingerprint_status_createdAt_idx" ON "Incident"("fingerprint", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Incident_assignedUserId_status_idx" ON "Incident"("assignedUserId", "status");

-- CreateIndex
CREATE INDEX "Incident_status_createdAt_idx" ON "Incident"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EscalationJob_bullJobId_key" ON "EscalationJob"("bullJobId");

-- CreateIndex
CREATE INDEX "EscalationJob_incidentId_completed_idx" ON "EscalationJob"("incidentId", "completed");

-- CreateIndex
CREATE INDEX "Alert_incidentId_idx" ON "Alert"("incidentId");

-- AddForeignKey
ALTER TABLE "EscalationPolicy" ADD CONSTRAINT "EscalationPolicy_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscalationLevel" ADD CONSTRAINT "EscalationLevel_escalationPolicyId_fkey" FOREIGN KEY ("escalationPolicyId") REFERENCES "EscalationPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_escalationPolicyId_fkey" FOREIGN KEY ("escalationPolicyId") REFERENCES "EscalationPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscalationJob" ADD CONSTRAINT "EscalationJob_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE SET NULL ON UPDATE CASCADE;
