-- CreateTable
CREATE TABLE "ShowcaseSet" (
    "setNum" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "year" INTEGER,
    "themeName" TEXT,
    "numParts" INTEGER,
    "imgUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "ShowcaseSet_sortOrder_idx" ON "ShowcaseSet"("sortOrder");
