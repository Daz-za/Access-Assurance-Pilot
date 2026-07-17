-- CreateEnum
CREATE TYPE "ReviewItemStatus" AS ENUM ('pending', 'completed');

-- CreateEnum
CREATE TYPE "ReviewDecisionType" AS ENUM ('approve_all', 'revoke_selected', 'flag_follow_up');

-- CreateTable
CREATE TABLE "System" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "connectionStatus" TEXT NOT NULL DEFAULT 'connected',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "System_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppUser" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "roleName" TEXT NOT NULL,
    "risk" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewItem" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "systemName" TEXT NOT NULL,
    "roleName" TEXT NOT NULL,
    "issue" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" "ReviewItemStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewDecision" (
    "id" TEXT NOT NULL,
    "reviewItemId" TEXT NOT NULL,
    "decision" "ReviewDecisionType" NOT NULL,
    "comment" TEXT,
    "selectedAssignmentIds" JSONB NOT NULL DEFAULT '[]',
    "policyResult" JSONB,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT NOT NULL,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppUser_email_key" ON "AppUser"("email");

-- CreateIndex
CREATE INDEX "AccessAssignment_userId_idx" ON "AccessAssignment"("userId");

-- CreateIndex
CREATE INDEX "AccessAssignment_systemId_idx" ON "AccessAssignment"("systemId");

-- CreateIndex
CREATE INDEX "ReviewItem_status_idx" ON "ReviewItem"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewItem_campaignId_userId_key" ON "ReviewItem"("campaignId", "userId");

-- CreateIndex
CREATE INDEX "ReviewDecision_reviewItemId_idx" ON "ReviewDecision"("reviewItemId");

-- CreateIndex
CREATE INDEX "AuditEvent_campaignId_userId_idx" ON "AuditEvent"("campaignId", "userId");

-- AddForeignKey
ALTER TABLE "AccessAssignment" ADD CONSTRAINT "AccessAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessAssignment" ADD CONSTRAINT "AccessAssignment_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "System"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewItem" ADD CONSTRAINT "ReviewItem_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewItem" ADD CONSTRAINT "ReviewItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewDecision" ADD CONSTRAINT "ReviewDecision_reviewItemId_fkey" FOREIGN KEY ("reviewItemId") REFERENCES "ReviewItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
