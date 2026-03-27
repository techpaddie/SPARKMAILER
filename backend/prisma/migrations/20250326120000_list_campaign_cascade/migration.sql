-- Allow deleting a list: remove campaigns that reference it (cascade).
ALTER TABLE "Campaign" DROP CONSTRAINT IF EXISTS "Campaign_listId_fkey";
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_listId_fkey"
  FOREIGN KEY ("listId") REFERENCES "List"("id") ON DELETE CASCADE ON UPDATE CASCADE;
