# Seed the database

## Requirements

Using Faker library to provide random **BUT** coherent data, seed the tables with these constraints.

Make sure seeding is efficient considering the amount of `Assignment` to create.

**Table mapping:**

| Rows    | Anonymized                |
| ------- | ------------------------- |
| 9297    | `DemoUser`                |
| 7189    | `Project`                 |
| 72374   | `Contractor`              |
| 10531   | `UserProjectAccess`       |
| 72374   | `ProjectContractor`       |
| 1700661 | `Assignment`              |
| 31465   | `InternationalAssignment` |
| 250     | `Country`                 |

Not all `DemoUser` have a link with `Project` through `UserProjectAccess`, but a `DemoUser` can have multiple links to `Project`.
Make sure many `DemoUser` have multiple links to `Project`.

Not all `Project` have a link with `Contractor` through `ProjectContractor`, but all `Contractor` exists in `ProjectContractor`.

Not all `Country` have a link with `InternationalAssignment`.

Not all `Assignment` have a link with `InternationalAssignment`.

Use `database\EXAMPLE_sedding.js` as example but stick to schema defined in `supabase\migrations\20260310125945_init-schema.sql`

## Plan

### Seeding order (respects FK dependencies)

1. **`Country`** (250) — no dependencies; seed all ISO countries upfront; collect `IsoCodes[]`
2. **`DemoUser`** (9,297) — no dependencies; collect `userIds[]`
3. **`Project`** (7,189) — no dependencies; collect `projectNumbers[]`
4. **`Contractor`** (72,374) — references `Country`; assign a random `CountryIsoCode` (and optionally `AgencyCountryIsoCode`) from `isoCodes[]`; collect `contractorIds[]`
5. **`UserProjectAccess`** (10,531) — references `DemoUser` + `Project`; use ~6,000 distinct users (leaving ~3,297 with no project link); distribute unevenly so many users appear multiple times (skew with `faker.helpers.weightedArrayElement` or repeat heavy users)
6. **`ProjectContractor`** (72,374) — references `Project` + `Contractor`; every `Contractor` must appear exactly once; assign each contractor to a random project (not all projects need a contractor)
7. **`Assignment`** (1,700,661) — no FK dependencies itself; collect `assignmentIds[]`
8. **`InternationalAssignment`** (31,465) — references `Assignment` + `Contractor`; pick a random subset of `assignmentIds` (no duplicates); assign a random `contractorId`

### Efficiency strategy for 1.7 M assignments

- Insert in batches of **5,000 rows** per `supabase.from(...).insert(batch)` call
- Run **10 batches concurrently** with `Promise.all` (340 waves × 10 concurrent = 3,400 calls total)
- Collect returned `id` values incrementally into `assignmentIds[]` for use in step 8
- Use the same batch + `Promise.all` pattern for all other large tables (`Contractor`, `ProjectContractor`)

### Coherence rules to enforce in code

- `UserProjectAccess`: generate pairs as `(userId, projectNumber)` and deduplicate before inserting (no composite-unique constraint in schema but keep data clean)
- `ProjectContractor`: shuffle `contractorIds[]` and zip with random project numbers — guarantees every contractor appears; use a `Set` to prevent duplicate `(projectNumber, contractorId)` pairs (composite PK in schema)
- `InternationalAssignment.Id` is also the PK → sample **without replacement** from `assignmentIds[]` using `faker.helpers.arrayElements(assignmentIds, 31465)`

### Output file

Create `database/seed.js` following the structure of `database/EXAMPLE_sedding.js`:

- Read env vars via `process.env` (run with `node --env-file=.env database/seed.js`)
- One `async` function per table, called in dependency order from a top-level `seedDatabase()` function
- Log progress at the start and end of each table and after each batch wave for `Assignment`
