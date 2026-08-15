-- CreateEnum
CREATE TYPE "SiteAdapterType" AS ENUM ('xiaomi_cloud', 'tuya_cloud', 'local_bridge', 'custom_api');

-- CreateEnum
CREATE TYPE "NodeType" AS ENUM ('master', 'edge');

-- CreateEnum
CREATE TYPE "NodeStatus" AS ENUM ('online', 'offline', 'unknown', 'syncing');

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "adapterType" "SiteAdapterType" NOT NULL DEFAULT 'xiaomi_cloud',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "storageRetentionDays" INTEGER NOT NULL DEFAULT 365,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EdgeNode" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nodeType" "NodeType" NOT NULL DEFAULT 'edge',
    "status" "NodeStatus" NOT NULL DEFAULT 'unknown',
    "localApiBaseUrl" TEXT,
    "storageRetentionDays" INTEGER NOT NULL DEFAULT 90,
    "isLocalControlEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastHeartbeatAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EdgeNode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Site_code_key" ON "Site"("code");

-- CreateIndex
CREATE UNIQUE INDEX "EdgeNode_siteId_code_key" ON "EdgeNode"("siteId", "code");

-- CreateIndex
CREATE INDEX "EdgeNode_siteId_status_idx" ON "EdgeNode"("siteId", "status");

-- Seed default site and master node
INSERT INTO "Site" ("id", "code", "name", "description", "adapterType", "isPrimary", "storageRetentionDays", "createdAt", "updatedAt")
VALUES (
  'default_site_region_1',
  'region-1',
  '区域1',
  '默认主控区域',
  'xiaomi_cloud',
  true,
  365,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "EdgeNode" ("id", "siteId", "code", "name", "nodeType", "status", "storageRetentionDays", "isLocalControlEnabled", "createdAt", "updatedAt")
SELECT
  'default_edge_node_master_1',
  s."id",
  'master-1',
  '主控节点',
  'master',
  'online',
  90,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Site" s
WHERE s."code" = 'region-1'
ON CONFLICT ("siteId", "code") DO NOTHING;

-- Add siteId to Room
ALTER TABLE "Room" ADD COLUMN "siteId" TEXT;

UPDATE "Room"
SET "siteId" = (
  SELECT "id"
  FROM "Site"
  WHERE "code" = 'region-1'
  LIMIT 1
)
WHERE "siteId" IS NULL;

ALTER TABLE "Room" ALTER COLUMN "siteId" SET NOT NULL;

DROP INDEX "Room_roomNumber_key";
CREATE UNIQUE INDEX "Room_siteId_roomNumber_key" ON "Room"("siteId", "roomNumber");
CREATE INDEX "Room_siteId_idx" ON "Room"("siteId");

-- Add siteId to Device
ALTER TABLE "Device" ADD COLUMN "siteId" TEXT;

UPDATE "Device" d
SET "siteId" = COALESCE(
  (
    SELECT r."siteId"
    FROM "Room" r
    WHERE r."id" = d."roomId"
    LIMIT 1
  ),
  (
    SELECT "id"
    FROM "Site"
    WHERE "code" = 'region-1'
    LIMIT 1
  )
)
WHERE d."siteId" IS NULL;

ALTER TABLE "Device" ALTER COLUMN "siteId" SET NOT NULL;

CREATE INDEX "Device_siteId_idx" ON "Device"("siteId");

-- AddForeignKey
ALTER TABLE "EdgeNode" ADD CONSTRAINT "EdgeNode_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
