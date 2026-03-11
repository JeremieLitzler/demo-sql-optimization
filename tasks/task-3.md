# Missing Indexes

## Requirements

Indexes are missing. Evaluate which ones and explain why given this execution plan:

```plaintext
Limit  (cost=9357.45..9357.49 rows=17 width=195) (actual time=271.814..271.821 rows=20 loops=1)
  ->  Sort  (cost=9357.45..9357.49 rows=17 width=195) (actual time=271.812..271.818 rows=20 loops=1)
        Sort Key: pc.contractorid
        Sort Method: top-N heapsort  Memory: 32kB
        ->  Nested Loop Left Join  (cost=539.33..9357.10 rows=17 width=195) (actual time=3.185..271.608 rows=122 loops=1)
              ->  Nested Loop Left Join  (cost=539.19..9354.34 rows=17 width=195) (actual time=3.180..271.347 rows=122 loops=1)
                    ->  Nested Loop Left Join  (cost=539.04..9351.58 rows=17 width=184) (actual time=3.168..270.608 rows=122 loops=1)
                          ->  Nested Loop Left Join  (cost=538.75..9345.86 rows=17 width=28) (actual time=3.147..270.012 rows=122 loops=1)
                                ->  Nested Loop  (cost=0.87..201.48 rows=17 width=16) (actual time=0.747..2.976 rows=122 loops=1)
                                      ->  Nested Loop  (cost=0.57..195.09 rows=19 width=16) (actual time=0.734..1.871 rows=123 loops=1)
                                            Join Filter: (pc.projectnumber = upa.projectnumber)
                                            ->  Nested Loop  (cost=0.28..193.64 rows=2 width=8) (actual time=0.708..1.049 rows=11 loops=1)
                                                  ->  Seq Scan on userprojectaccess upa  (cost=0.00..188.64 rows=2 width=4) (actual time=0.691..0.942 rows=11 loops=1)
                                                        Filter: (isactive AND (userid = 6631))
                                                        Rows Removed by Filter: 10530
                                                  ->  Index Scan using project_pkey on project pr  (cost=0.28..2.50 rows=1 width=4) (actual time=0.007..0.007 rows=1 loops=11)
                                                        Index Cond: (number = upa.projectnumber)
                                                        Filter: isactive
                                            ->  Index Scan using projectcontractor_pkey on projectcontractor pc  (cost=0.29..0.60 rows=10 width=16) (actual time=0.012..0.069 rows=11 loops=11)
                                                  Index Cond: (projectnumber = pr.number)
                                                  Filter: isactive
                                                  Rows Removed by Filter: 1
                                      ->  Index Scan using contractor_pkey on contractor ct  (cost=0.29..0.34 rows=1 width=4) (actual time=0.008..0.008 rows=1 loops=123)
                                            Index Cond: (id = pc.contractorid)
                                            Filter: isactive
                                            Rows Removed by Filter: 0
                                ->  Limit  (cost=537.88..537.89 rows=1 width=12) (actual time=2.188..2.188 rows=1 loops=122)
                                      ->  Sort  (cost=537.88..537.89 rows=1 width=12) (actual time=2.187..2.187 rows=1 loops=122)
                                            Sort Key: a.createdon DESC
                                            Sort Method: quicksort  Memory: 25kB
                                            ->  Nested Loop  (cost=0.43..537.87 rows=1 width=12) (actual time=1.790..2.184 rows=1 loops=122)
                                                  ->  Seq Scan on internationalassignment ia  (cost=0.00..535.23 rows=1 width=4) (actual time=1.776..2.169 rows=1 loops=122)
                                                        Filter: (contractorid = pc.contractorid)
                                                        Rows Removed by Filter: 31537
                                                  ->  Index Scan using assignment_pkey on assignment a  (cost=0.43..2.65 rows=1 width=12) (actual time=0.011..0.011 rows=1 loops=124)
                                                        Index Cond: (id = ia.id)
                          ->  Index Scan using contractor_pkey on contractor c7  (cost=0.29..0.34 rows=1 width=160) (actual time=0.003..0.003 rows=1 loops=122)
                                Index Cond: (id = pc.contractorid)
                    ->  Index Scan using country_pkey on country co_contractor  (cost=0.14..0.16 rows=1 width=14) (actual time=0.005..0.005 rows=1 loops=122)
                          Index Cond: (isocode = c7.countryisocode)
              ->  Index Scan using country_pkey on country co_agency  (cost=0.14..0.16 rows=1 width=14) (actual time=0.001..0.001 rows=0 loops=122)
                    Index Cond: (isocode = c7.agencycountryisocode)
Planning Time: 7.044 ms
Execution Time: 272.046 ms
```

## Plan

PostgreSQL does **not** auto-create indexes on foreign key columns. The execution plan confirms two sequential scans causing the bottleneck.

### Missing indexes — ranked by impact

#### 1. `InternationalAssignment(ContractorId)` — critical

The plan shows:

```
Seq Scan on internationalassignment ia  (actual time=1.776..2.169 rows=1 loops=122)
  Filter: (contractorid = pc.contractorid)
  Rows Removed by Filter: 31537
```

This scan runs **122 times**, each time reading ~31,538 rows to find 1. That is ~3.85 million row examinations and accounts for ~267 ms out of 272 ms total. This is the must-have index.

#### 2. `UserProjectAccess(UserId)` — secondary

```
Seq Scan on userprojectaccess upa  (actual time=0.691..0.942 rows=11 loops=1)
  Filter: (isactive AND (userid = 6631))
  Rows Removed by Filter: 10530
```

Runs only once, costs ~1 ms here. Still worth adding since it will hurt proportionally more as the table grows or for users with fewer projects.

### Indexes already covered by the plan

All other joins use index scans (`project_pkey`, `projectcontractor_pkey`, `contractor_pkey`, `assignment_pkey`, `country_pkey`) — no action needed there.

### Implementation

```sql
-- supabase/migrations/<timestamp>_add-fk-indexes.sql

-- Priority 1: eliminates the dominant seq scan (122 loops × 31k rows)
CREATE INDEX idx_internationalassignment_contractorid ON InternationalAssignment (ContractorId);

-- Priority 2: eliminates the userprojectaccess seq scan
CREATE INDEX idx_userprojectaccess_userid ON UserProjectAccess (UserId);
```

The new execution plan became:

```plaintext
Limit  (cost=116.19..116.24 rows=17 width=195) (actual time=3.601..3.607 rows=20 loops=1)
  ->  Sort  (cost=116.19..116.24 rows=17 width=195) (actual time=3.600..3.604 rows=20 loops=1)
        Sort Key: pc.contractorid
        Sort Method: top-N heapsort  Memory: 32kB
        ->  Nested Loop Left Join  (cost=6.90..115.85 rows=17 width=195) (actual time=0.144..3.485 rows=122 loops=1)
              ->  Nested Loop Left Join  (cost=6.75..113.08 rows=17 width=195) (actual time=0.137..3.334 rows=122 loops=1)
                    ->  Nested Loop Left Join  (cost=6.61..110.32 rows=17 width=184) (actual time=0.125..2.970 rows=122 loops=1)
                          ->  Nested Loop Left Join  (cost=6.31..104.61 rows=17 width=28) (actual time=0.118..2.717 rows=122 loops=1)
                                ->  Nested Loop  (cost=1.15..16.46 rows=17 width=16) (actual time=0.083..1.143 rows=122 loops=1)
                                      ->  Nested Loop  (cost=0.86..10.08 rows=19 width=16) (actual time=0.067..0.462 rows=123 loops=1)
                                            Join Filter: (pc.projectnumber = upa.projectnumber)
                                            ->  Nested Loop  (cost=0.57..8.62 rows=2 width=8) (actual time=0.031..0.069 rows=11 loops=1)
                                                  ->  Index Scan using idx_userprojectaccess_userid on userprojectaccess upa  (cost=0.29..3.62 rows=2 width=4) (actual time=0.018..0.027 rows=11 loops=1)
                                                        Index Cond: (userid = 6631)
                                                        Filter: isactive
                                                  ->  Index Scan using project_pkey on project pr  (cost=0.28..2.50 rows=1 width=4) (actual time=0.003..0.003 rows=1 loops=11)
                                                        Index Cond: (number = upa.projectnumber)
                                                        Filter: isactive
                                            ->  Index Scan using projectcontractor_pkey on projectcontractor pc  (cost=0.29..0.60 rows=10 width=16) (actual time=0.007..0.033 rows=11 loops=11)
                                                  Index Cond: (projectnumber = pr.number)
                                                  Filter: isactive
                                                  Rows Removed by Filter: 1
                                      ->  Index Scan using contractor_pkey on contractor ct  (cost=0.29..0.34 rows=1 width=4) (actual time=0.005..0.005 rows=1 loops=123)
                                            Index Cond: (id = pc.contractorid)
                                            Filter: isactive
                                            Rows Removed by Filter: 0
                                ->  Limit  (cost=5.16..5.17 rows=1 width=12) (actual time=0.012..0.012 rows=1 loops=122)
                                      ->  Sort  (cost=5.16..5.17 rows=1 width=12) (actual time=0.012..0.012 rows=1 loops=122)
                                            Sort Key: a.createdon DESC
                                            Sort Method: quicksort  Memory: 25kB
                                            ->  Nested Loop  (cost=0.71..5.15 rows=1 width=12) (actual time=0.010..0.011 rows=1 loops=122)
                                                  ->  Index Scan using idx_internationalassignment_contractorid on internationalassignment ia  (cost=0.29..2.51 rows=1 width=4) (actual time=0.004..0.005 rows=1 loops=122)
                                                        Index Cond: (contractorid = pc.contractorid)
                                                  ->  Index Scan using assignment_pkey on assignment a  (cost=0.43..2.65 rows=1 width=12) (actual time=0.005..0.005 rows=1 loops=124)
                                                        Index Cond: (id = ia.id)
                          ->  Index Scan using contractor_pkey on contractor c7  (cost=0.29..0.34 rows=1 width=160) (actual time=0.001..0.001 rows=1 loops=122)
                                Index Cond: (id = pc.contractorid)
                    ->  Index Scan using country_pkey on country co_contractor  (cost=0.14..0.16 rows=1 width=14) (actual time=0.002..0.002 rows=1 loops=122)
                          Index Cond: (isocode = c7.countryisocode)
              ->  Index Scan using country_pkey on country co_agency  (cost=0.14..0.16 rows=1 width=14) (actual time=0.001..0.001 rows=0 loops=122)
                    Index Cond: (isocode = c7.agencycountryisocode)
Planning Time: 7.371 ms
Execution Time: 3.841 ms
```
