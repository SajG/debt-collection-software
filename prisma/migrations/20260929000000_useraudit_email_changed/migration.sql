-- Add EMAIL_CHANGED to UserAuditAction so setUserEmailAction (admin
-- /admin/users → inline "Add email") can record the change alongside
-- the existing CREATED / ROLE_CHANGED / PHONE_CHANGED / INVITED
-- variants. No data change; enum addition is non-destructive.
ALTER TYPE "UserAuditAction" ADD VALUE IF NOT EXISTS 'EMAIL_CHANGED';
