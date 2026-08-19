-- Adds per-form accent theme selection, and documents the settings JSONB
-- fields added alongside it (settings itself needs no schema change since
-- it's already JSONB — this just documents the expected shape).

alter table forms add column if not exists theme text not null default 'indigo';

-- Expected settings JSONB shape (enforced in application code, not the DB):
-- {
--   "confirmationMessage": string,
--   "redirectUrl": string,
--   "notifyEmail": string,
--   "allowMultiple": boolean,
--   "limitResponses": boolean,
--   "maxResponses": number,
--   "closeOnDate": boolean,
--   "closeDate": string (YYYY-MM-DD)
-- }
