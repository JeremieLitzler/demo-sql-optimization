# Modify Database Seeding

## Requirements

To make this query run very slow, modify seeding:

```sql
-- ============================================================
-- TRANSLATED QUERY (PostgreSQL)
-- Changes from original T-SQL:
--   OUTER APPLY TOP(1) … ORDER BY  →  LEFT JOIN LATERAL … LIMIT 1
--   OFFSET n ROWS FETCH NEXT n ROWS ONLY  →  LIMIT / OFFSET
--   Removed redundant double-join on Contractor (co8 / co8_c collapsed into c7)
-- ============================================================

SELECT
    p3.ContractorId,
    p3.Name,
    p3.Address,
    p3.Address2,
    p3.ZipCode,
    p3.City,
    p3.CountryIsoCode,
    p3.CountryName,
    p3.ContactEmail,
    p3.IsEmailVerified,
    p3.TaxId,
    p3.AgencyName,
    p3.AgencyAddress,
    p3.AgencyAddress2,
    p3.AgencyCountryName,
    p3.ProjectNumber,
    p3.LastAssignmentDate,
    p3.LastAssignmentId
FROM (
    SELECT
        p1.ContractorId,
        p1.ProjectNumber,
        c7.ContactEmail,
        c7.IsEmailVerified,
        c7.TaxId,
        c7.Name,
        c7.Address,
        c7.Address2,
        c7.City,
        c7.ZipCode,
        c7.CountryIsoCode,
        c7.AgencyName,
        c7.AgencyAddress,
        c7.AgencyAddress2,
        co_contractor.Name                                                          AS CountryName,
        co_agency.Name                                                              AS AgencyCountryName,
        COALESCE(lim.CreatedOn, p1.CreatedOn)                                       AS LastAssignmentDate,
        lim.Id                                                                      AS LastAssignmentId
    FROM (
        SELECT
            pc.ContractorId,
            pc.ProjectNumber,
            pc.CreatedOn
        FROM       UserProjectAccess  upa
        INNER JOIN Project            pr  ON upa.ProjectNumber = pr.Number
        INNER JOIN ProjectContractor  pc  ON pc.ProjectNumber  = pr.Number
        INNER JOIN Contractor         ct  ON ct.Id             = pc.ContractorId
        WHERE upa.UserId    = 6631
          AND upa.IsActive  = TRUE
          AND pr.IsActive   = TRUE
          AND pc.IsActive   = TRUE
          AND ct.IsActive   = TRUE
    ) p1
    -- OUTER APPLY TOP(1) equivalent: LEFT JOIN LATERAL + LIMIT 1
    LEFT JOIN LATERAL (
        SELECT ia.Id, a.CreatedOn
        FROM   InternationalAssignment ia
        INNER JOIN Assignment           a ON a.Id = ia.Id
        WHERE  ia.ContractorId = p1.ContractorId
        ORDER BY a.CreatedOn DESC
        LIMIT 1
    ) lim ON TRUE
    LEFT JOIN Contractor c7          ON c7.Id          = p1.ContractorId
    LEFT JOIN Country   co_contractor ON co_contractor.IsoCode = c7.CountryIsoCode
    LEFT JOIN Country   co_agency     ON co_agency.IsoCode     = c7.AgencyCountryIsoCode
) p3
ORDER BY p3.ContractorId
LIMIT 20 OFFSET 0;
```

## Plan

### Why the query is slow (root cause analysis)

Two missing indexes drive the cost:

1. **`InternationalAssignment.ContractorId` — primary bottleneck**
   The `LEFT JOIN LATERAL` executes once per row returned by `p1`. Without this index, each execution does a full sequential scan of all 31,465 `InternationalAssignment` rows to find `ia.ContractorId = p1.ContractorId`. If `p1` returns *N* contractors, the LATERAL alone costs **N × 31,465 row reads**.

2. **`UserProjectAccess.UserId` — secondary bottleneck**
   The filter `upa.UserId = 6631 AND upa.IsActive = TRUE` forces a full sequential scan of all 10,531 `UserProjectAccess` rows on every query execution. This seeds the size of `p1`.

The `Assignment`/`Contractor`/`Country` joins are cheap because they use existing PK or FK indexes (`Assignment.Id`, `Contractor.Id`, `Country.IsoCode`).

### What the seed must guarantee for the query to be measurably slow

| Condition | Why it matters |
|---|---|
| User 6631 exists with `IsActive = TRUE` | Query hard-codes `upa.UserId = 6631` |
| User 6631 has ≥ 10 `UserProjectAccess` rows (`IsActive = TRUE`) | Controls the size of `p1`; more rows = more LATERAL executions |
| Those projects exist and are `IsActive = TRUE` | Inner join filter `pr.IsActive = TRUE` would eliminate them |
| Each of those projects has contractors in `ProjectContractor` (`IsActive = TRUE`) | Without this, `p1` is empty and the LATERAL never runs |
| Those contractors have `InternationalAssignment` rows | If no match exists the LATERAL still scans all 31K rows, but having matches makes the cost visible in EXPLAIN and real in execution time |

### Seeding modifications (two-pass approach)

The main `seedDatabase()` flow stays unchanged. Add a `seedQueryScenario(projectNumbers, assignmentIds)` function called at the end, after all tables are populated:

**Step 1 — Designate 10 "scenario" projects**
Pick the first 10 entries from `projectNumbers`. Update those rows directly to set `isactive = TRUE`, removing any doubt about the IsActive filter.

**Step 2 — Guarantee UserProjectAccess for user 6631**
Insert 10 `userprojectaccess` rows (one per scenario project) with `userid = 6631` and `isactive = TRUE`. Use `ON CONFLICT DO NOTHING` if a pair already exists from the random seed.

**Step 3 — Discover contractors linked to the scenario projects**
Query `projectcontractor` for `projectnumber IN (<10 scenario numbers>)` and collect the distinct `contractorid` values.

**Step 4 — Fill InternationalAssignment gaps**
Query `internationalassignment` to find which of those contractors already have a row. For the ones missing one, pick unused `assignmentId` values (from the 1,700,661 seeded) and insert `internationalassignment` rows so every contractor in the scenario has at least one entry. This ensures the LATERAL produces real work, not just fruitless scans.

### Expected slow-query profile

With ~10 scenario projects each averaging ~10 contractors (72,374 contractors / 7,189 projects ≈ 10), `p1` returns ~100 rows. The LATERAL then executes 100 times, each scanning 31,465 `InternationalAssignment` rows sequentially = **~3.1 million row reads** for that join alone, before `LIMIT 20` is applied. `EXPLAIN (ANALYZE, BUFFERS)` will show Seq Scan on `internationalassignment` with high `rows removed by filter` repeated for every outer row.
