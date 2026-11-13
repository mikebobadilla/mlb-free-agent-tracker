-- CreateTable
CREATE TABLE "SyncStatus" (
    "id" INTEGER NOT NULL,
    "lastAttemptAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncStatus_pkey" PRIMARY KEY ("id")
);
