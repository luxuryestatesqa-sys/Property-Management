-- Random, unguessable id per listing for public share links. The default is evaluated per row,
-- so every existing listing gets its own value.
ALTER TABLE "Listing" ADD COLUMN "shareToken" TEXT NOT NULL DEFAULT (gen_random_uuid())::text;
CREATE UNIQUE INDEX "Listing_shareToken_key" ON "Listing"("shareToken");
