-- Priority 1: eliminates the dominant seq scan (122 loops × 31k rows, ~267ms)
CREATE INDEX idx_internationalassignment_contractorid ON InternationalAssignment (ContractorId);

-- Priority 2: eliminates the userprojectaccess seq scan on userid filter
CREATE INDEX idx_userprojectaccess_userid ON UserProjectAccess (UserId);
