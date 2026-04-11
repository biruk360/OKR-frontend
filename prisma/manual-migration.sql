-- Manual migration: Initiatives + cadence + activity log + views + sprints + outbound email
-- Applied directly via `prisma db execute` because the migration history was already out of sync
-- with the actual dev.db state. Schema.prisma is the source of truth going forward.

PRAGMA foreign_keys=OFF;

-- 1. Rename todos -> initiatives. Table is empty (verified), so drop+create is cleanest.
DROP TABLE IF EXISTS "todos";

CREATE TABLE "initiatives" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "dueDate" DATETIME,
    "completedAt" DATETIME,
    "assigneeId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "keyResultId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "initiatives_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "initiatives_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "initiatives_keyResultId_fkey" FOREIGN KEY ("keyResultId") REFERENCES "key_results" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "initiatives_keyResultId_idx" ON "initiatives"("keyResultId");
CREATE INDEX "initiatives_assigneeId_idx" ON "initiatives"("assigneeId");

-- 2. Add checkInCadence to objectives & key_results
ALTER TABLE "objectives" ADD COLUMN "checkInCadence" TEXT NOT NULL DEFAULT 'WEEKLY';
ALTER TABLE "key_results" ADD COLUMN "checkInCadence" TEXT NOT NULL DEFAULT 'WEEKLY';

-- 3. Activity log
CREATE TABLE "activity_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "objectiveId" TEXT,
    "keyResultId" TEXT,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "changes" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "activity_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "activity_logs_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "objectives" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "activity_logs_keyResultId_fkey" FOREIGN KEY ("keyResultId") REFERENCES "key_results" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "activity_logs_objectiveId_createdAt_idx" ON "activity_logs"("objectiveId", "createdAt");
CREATE INDEX "activity_logs_keyResultId_createdAt_idx" ON "activity_logs"("keyResultId", "createdAt");
CREATE INDEX "activity_logs_entityType_createdAt_idx" ON "activity_logs"("entityType", "createdAt");

-- 4. View tracking (one row per user/objective/day)
CREATE TABLE "objective_views" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "objectiveId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "viewDate" TEXT NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 1,
    "firstViewAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastViewAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "objective_views_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "objectives" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "objective_views_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "objective_views_objectiveId_lastViewAt_idx" ON "objective_views"("objectiveId", "lastViewAt");
CREATE UNIQUE INDEX "objective_views_objectiveId_userId_viewDate_key" ON "objective_views"("objectiveId", "userId", "viewDate");

CREATE TABLE "key_result_views" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "keyResultId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "viewDate" TEXT NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 1,
    "firstViewAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastViewAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "key_result_views_keyResultId_fkey" FOREIGN KEY ("keyResultId") REFERENCES "key_results" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "key_result_views_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "key_result_views_keyResultId_lastViewAt_idx" ON "key_result_views"("keyResultId", "lastViewAt");
CREATE UNIQUE INDEX "key_result_views_keyResultId_userId_viewDate_key" ON "key_result_views"("keyResultId", "userId", "viewDate");

-- 5. Sprint planning
CREATE TABLE "sprints" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ownerId" TEXT NOT NULL,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "sprints_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "sprints_ownerId_status_idx" ON "sprints"("ownerId", "status");

CREATE TABLE "sprint_columns" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sprintId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "sprint_columns_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "sprints" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "sprint_columns_sprintId_position_idx" ON "sprint_columns"("sprintId", "position");
CREATE UNIQUE INDEX "sprint_columns_sprintId_name_key" ON "sprint_columns"("sprintId", "name");

CREATE TABLE "sprint_activities" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sprintId" TEXT NOT NULL,
    "columnId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "ownerId" TEXT NOT NULL,
    "keyResultId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "dueDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "sprint_activities_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "sprints" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sprint_activities_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "sprint_columns" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sprint_activities_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "sprint_activities_keyResultId_fkey" FOREIGN KEY ("keyResultId") REFERENCES "key_results" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "sprint_activities_sprintId_columnId_position_idx" ON "sprint_activities"("sprintId", "columnId", "position");
CREATE INDEX "sprint_activities_ownerId_idx" ON "sprint_activities"("ownerId");

-- 6. Email digest state + outbound queue
CREATE TABLE "email_digest_state" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "lastSentAt" DATETIME,
    "lastDigestCadence" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "email_digest_state_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "outbound_emails" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "toEmail" TEXT NOT NULL,
    "toName" TEXT,
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "bodyHtml" TEXT,
    "template" TEXT,
    "metadata" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" DATETIME
);
CREATE INDEX "outbound_emails_status_createdAt_idx" ON "outbound_emails"("status", "createdAt");

PRAGMA foreign_keys=ON;
