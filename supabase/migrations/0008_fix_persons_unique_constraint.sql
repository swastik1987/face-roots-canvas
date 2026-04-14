-- Migration 0008: Fix persons unique constraint
--
-- The original `one_self_per_user` unique constraint on (owner_user_id, is_self)
-- inadvertently prevents adding more than ONE family member per user because
-- all non-self persons share is_self = false, making the pair non-unique.
--
-- Replace it with a partial unique index that only enforces uniqueness on the
-- self-person row (is_self = true), allowing unlimited family members.

-- Drop the broken constraint
ALTER TABLE persons DROP CONSTRAINT IF EXISTS one_self_per_user;

-- Partial unique index: only one self-person allowed per owner
CREATE UNIQUE INDEX IF NOT EXISTS persons_one_self_per_user
  ON persons (owner_user_id)
  WHERE is_self = true;
