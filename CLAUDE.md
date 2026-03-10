# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

This project demonstrates SQL query performance issues caused by missing indexes, using a Supabase (PostgreSQL) backend with enough seeded data to reproduce the problem.

## Setup

Copy `.env.prod` to `.env` and fill in your Supabase credentials:

- `SUPABASE_PROJECT_ID` — Supabase project ID
- `SUPABASE_PROJECT_PASSWORD` — Supabase DB password
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_KEY` — Supabase anon key
- `VITE_SUPABASE_PROJECT_SERVICE_ROLE` — service role key (used by seeding scripts)
- `VITE_TESTING_USER_EMAIL` — email for the test user

Install dependencies:

```bash
npm install
```

## Supabase CLI Commands

```bash
supabase start          # Start local Supabase stack (Docker required)
supabase db reset       # Re-run all migrations against local DB
supabase migration new <name>  # Create a new migration file
supabase db push        # Push migrations to remote Supabase project
supabase stop           # Stop local Supabase stack
```

Local API runs on port `54321`, local DB on port `54322`.

## Database Schema

Migrations live in `supabase/migrations/`. The canonical schema is defined there. Key tables:

- `Country` — ISO 2-char code + name
- `Project` — projects with active flag
- `DemoUser` — application users
- `UserProjectAccess` — join table linking users to projects
- `Contractor` — contractors with optional agency info and country references
- `ProjectContractor` — join table linking projects to contractors
- `Assignment` — base assignment record
- `InternationalAssignment` — extends `Assignment` with a `ContractorId` (table-per-type inheritance)

## Seeding

`database/EXAMPLE_sedding.js` is a reference/template seeding script using `@faker-js/faker` and `@supabase/supabase-js`. It targets a different schema than the current one (references `profiles`, `entities`, `sub_entities` tables). Adapt it when creating seeding scripts for the current schema.

Run a seeding script with:

```bash
node --env-file=.env database/<your-seed-script>.js
```
