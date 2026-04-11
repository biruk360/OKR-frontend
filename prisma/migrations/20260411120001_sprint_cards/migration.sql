-- Sprint activity enhancements: Trello-style card features.
--   * Add objectiveId + convertedInitiativeId to sprint_activities
--   * New tables: sprint_activity_comments, sprint_activity_tasks

PRAGMA foreign_keys=OFF;

ALTER TABLE "sprint_activities" ADD COLUMN "objectiveId" TEXT;
ALTER TABLE "sprint_activities" ADD COLUMN "convertedInitiativeId" TEXT;
-- FK for objectiveId is enforced at the application layer since SQLite ALTER TABLE
-- can't add a named constraint; setNull behavior is handled by the delete route.

CREATE TABLE "sprint_activity_comments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "activityId" TEXT NOT NULL,
    "authorId" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "sprint_activity_comments_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "sprint_activities" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sprint_activity_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "sprint_activity_comments_activityId_createdAt_idx" ON "sprint_activity_comments"("activityId", "createdAt");

CREATE TABLE "sprint_activity_tasks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "activityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "assigneeId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "sprint_activity_tasks_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "sprint_activities" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sprint_activity_tasks_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "sprint_activity_tasks_activityId_position_idx" ON "sprint_activity_tasks"("activityId", "position");

PRAGMA foreign_keys=ON;
