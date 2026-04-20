-- SMTP servers can be excluded from bulk/campaign rotation while remaining configurable.
ALTER TABLE "SmtpServer" ADD COLUMN "bulkSendEnabled" BOOLEAN NOT NULL DEFAULT true;
