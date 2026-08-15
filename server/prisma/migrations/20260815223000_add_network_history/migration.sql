-- CreateTable
CREATE TABLE "DailyNetworkTraffic" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "rxBytes" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "txBytes" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalBytes" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyNetworkTraffic_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyNetworkTraffic_date_idx" ON "DailyNetworkTraffic"("date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyNetworkTraffic_deviceId_date_key" ON "DailyNetworkTraffic"("deviceId", "date");

-- AddForeignKey
ALTER TABLE "DailyNetworkTraffic" ADD CONSTRAINT "DailyNetworkTraffic_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
