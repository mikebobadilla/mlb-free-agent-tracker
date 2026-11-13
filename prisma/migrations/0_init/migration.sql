-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Player" (
    "id" SERIAL NOT NULL,
    "mlbId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "age" INTEGER,
    "prevTeam" TEXT,
    "retroId" TEXT,
    "birthDate" TIMESTAMP(3),
    "war" DOUBLE PRECISION,
    "season" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'unsigned',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "obp" DOUBLE PRECISION,
    "slg" DOUBLE PRECISION,
    "ops" DOUBLE PRECISION,
    "era" DOUBLE PRECISION,
    "whip" DOUBLE PRECISION,
    "ip" DOUBLE PRECISION,
    "k9" DOUBLE PRECISION,
    "fip" DOUBLE PRECISION,
    "contractExpiry" INTEGER,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" SERIAL NOT NULL,
    "playerId" INTEGER NOT NULL,
    "team" TEXT NOT NULL,
    "years" INTEGER,
    "totalValue" DOUBLE PRECISION,
    "aav" DOUBLE PRECISION,
    "signedDate" TIMESTAMP(3),
    "origin" TEXT NOT NULL DEFAULT 'transaction',
    "transactionId" INTEGER,
    "firstSeason" INTEGER,
    "optedOutAfter" INTEGER,
    "notes" TEXT,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rumor" (
    "id" SERIAL NOT NULL,
    "playerId" INTEGER NOT NULL,
    "linkedTeam" TEXT,
    "source" TEXT,
    "confidence" INTEGER NOT NULL DEFAULT 3,
    "datePosted" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rumor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prediction" (
    "id" SERIAL NOT NULL,
    "playerId" INTEGER NOT NULL,
    "predictedTeam" TEXT,
    "predictedYears" INTEGER,
    "predictedAav" DOUBLE PRECISION,
    "confidence" INTEGER NOT NULL DEFAULT 3,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Prediction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Player_mlbId_key" ON "Player"("mlbId");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_transactionId_key" ON "Contract"("transactionId");

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rumor" ADD CONSTRAINT "Rumor_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

