-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LegoSet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "setNum" TEXT NOT NULL,
    "name" TEXT,
    "year" INTEGER,
    "themeId" INTEGER,
    "themeName" TEXT,
    "numParts" INTEGER,
    "imgUrl" TEXT,
    "bricksetId" INTEGER,
    "syncStatus" TEXT NOT NULL DEFAULT 'pending',
    "syncError" TEXT,
    "lastSyncedAt" DATETIME,
    "minifigsSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LegoSet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SetImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "setId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "thumbUrl" TEXT,
    "source" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "SetImage_setId_fkey" FOREIGN KEY ("setId") REFERENCES "LegoSet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SetMinifig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "setId" TEXT NOT NULL,
    "figNum" TEXT NOT NULL,
    "name" TEXT,
    "imgUrl" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "SetMinifig_setId_fkey" FOREIGN KEY ("setId") REFERENCES "LegoSet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Minifig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "figNum" TEXT NOT NULL,
    "name" TEXT,
    "imgUrl" TEXT,
    "numParts" INTEGER,
    "partsSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MinifigPart" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "minifigId" TEXT NOT NULL,
    "partNum" TEXT NOT NULL,
    "name" TEXT,
    "imgUrl" TEXT,
    "colorId" INTEGER,
    "colorName" TEXT,
    "colorHex" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "isSpare" BOOLEAN NOT NULL DEFAULT false,
    "elementId" TEXT,
    CONSTRAINT "MinifigPart_minifigId_fkey" FOREIGN KEY ("minifigId") REFERENCES "Minifig" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SetPart" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "setId" TEXT NOT NULL,
    "partNum" TEXT NOT NULL,
    "name" TEXT,
    "imgUrl" TEXT,
    "colorId" INTEGER,
    "colorName" TEXT,
    "colorHex" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "isSpare" BOOLEAN NOT NULL DEFAULT false,
    "elementId" TEXT,
    CONSTRAINT "SetPart_setId_fkey" FOREIGN KEY ("setId") REFERENCES "LegoSet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PartAlias" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "partNum" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "ScanEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "listingId" TEXT,
    "searchType" TEXT NOT NULL,
    "candidates" TEXT NOT NULL,
    "topPartNum" TEXT,
    "topScore" REAL,
    "matchedSets" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScanEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ColorAlias" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "rgb" TEXT,
    "bricklinkId" INTEGER,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "LegoSet_userId_idx" ON "LegoSet"("userId");

-- CreateIndex
CREATE INDEX "LegoSet_syncStatus_idx" ON "LegoSet"("syncStatus");

-- CreateIndex
CREATE UNIQUE INDEX "LegoSet_userId_setNum_key" ON "LegoSet"("userId", "setNum");

-- CreateIndex
CREATE INDEX "SetImage_setId_sortOrder_idx" ON "SetImage"("setId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "SetImage_setId_url_key" ON "SetImage"("setId", "url");

-- CreateIndex
CREATE INDEX "SetMinifig_figNum_idx" ON "SetMinifig"("figNum");

-- CreateIndex
CREATE INDEX "SetMinifig_setId_idx" ON "SetMinifig"("setId");

-- CreateIndex
CREATE UNIQUE INDEX "SetMinifig_setId_figNum_key" ON "SetMinifig"("setId", "figNum");

-- CreateIndex
CREATE UNIQUE INDEX "Minifig_figNum_key" ON "Minifig"("figNum");

-- CreateIndex
CREATE INDEX "MinifigPart_partNum_idx" ON "MinifigPart"("partNum");

-- CreateIndex
CREATE INDEX "MinifigPart_minifigId_idx" ON "MinifigPart"("minifigId");

-- CreateIndex
CREATE UNIQUE INDEX "MinifigPart_minifigId_partNum_colorId_isSpare_key" ON "MinifigPart"("minifigId", "partNum", "colorId", "isSpare");

-- CreateIndex
CREATE INDEX "SetPart_partNum_idx" ON "SetPart"("partNum");

-- CreateIndex
CREATE INDEX "SetPart_setId_idx" ON "SetPart"("setId");

-- CreateIndex
CREATE UNIQUE INDEX "SetPart_setId_partNum_colorId_isSpare_key" ON "SetPart"("setId", "partNum", "colorId", "isSpare");

-- CreateIndex
CREATE INDEX "PartAlias_externalId_idx" ON "PartAlias"("externalId");

-- CreateIndex
CREATE INDEX "PartAlias_partNum_idx" ON "PartAlias"("partNum");

-- CreateIndex
CREATE UNIQUE INDEX "PartAlias_source_externalId_partNum_key" ON "PartAlias"("source", "externalId", "partNum");

-- CreateIndex
CREATE INDEX "ScanEvent_userId_createdAt_idx" ON "ScanEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ScanEvent_createdAt_idx" ON "ScanEvent"("createdAt");

