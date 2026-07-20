# TPPF Clinic Management System

Rebuild of the clinic's Microsoft Access system as a web-based system on
PostgreSQL. See `/docs` (to be added) for the full project roadmap,
entity dictionary, and ER diagrams produced during Day 1 planning.

## Project layout

```
/db                  Database schema (migrations) and seed data
  /migrations        Numbered, ordered SQL files — see "Migrations" below
  migrate.js          Small CLI tool that applies/reverts/reports on migrations
  seed.js              Populates roles, an admin user, and sample data
/server
  /src
    /auth            Password hashing, JWT signing/verification
    /config          Environment/config loading
    /db              Shared PostgreSQL connection pool
    /middleware      Error handling, 404 handling, auth, role checks
    /routes          API route handlers
    app.js           Express app assembly — mounts API routes and serves /client
    server.js        Entry point — starts the HTTP server
/client              Frontend (plain HTML/CSS/JS), served statically by Express
```

The frontend and backend run from the same server and the same port — there
is no separate frontend dev server and no CORS configuration needed. Visit
`http://localhost:3000/` once the server is running.

Default login (from the seed script): username `admin`, password `admin123`.

## First-time setup

1. Install PostgreSQL locally (per the team's database collaboration
   workflow — each developer runs their own local instance, never a
   shared dev server).
2. Create a local database and role, e.g.:
   ```sql
   CREATE USER tppf_dev WITH PASSWORD 'tppf_dev_pw';
   CREATE DATABASE tppf_clinic_dev OWNER tppf_dev;
   ```
3. Install dependencies:
   ```
   npm install
   ```
4. Copy the environment template and adjust if your local setup differs:
   ```
   cp .env.example .env
   ```
5. Run the migrations to build the schema:
   ```
   npm run migrate:up
   ```
6. Seed fixed reference data:
   ```
   npm run seed
   ```
7. Start the server:
   ```
   npm run dev
   ```
8. Confirm everything is working:
   ```
   curl http://localhost:3000/api/health
   ```
   A healthy response looks like:
   ```json
   { "status": "ok", "database": { "connected": true, ... } }
   ```

## Migrations

Plain, numbered SQL files in `db/migrations/`, applied in filename order.
Each file has two sections:

```sql
-- +migrate Up
CREATE TABLE ...

-- +migrate Down
DROP TABLE ...
```

Commands:

| Command                | What it does                                                |
|-------------------------|--------------------------------------------------------------|
| `npm run migrate:status` | Lists every migration file and whether it's applied         |
| `npm run migrate:up`     | Applies every migration that hasn't run yet, in order       |
| `npm run migrate:down`   | Reverts only the single most recently applied migration     |

**Whenever you pull new code that includes a new migration file, run
`npm run migrate:up` before continuing work** — this is what keeps both
developers' local databases in the same schema state (see the team's
Database Collaboration workflow for the full reasoning).

Never hand-edit the database schema directly (no manual `ALTER TABLE` run
by hand). If the schema needs to change, write a new migration file.

## Current schema (as of Day 3)

23 tables across 9 migration files, matching the entity dictionary
approved on Day 1, plus two follow-up migrations:

1. `0001_foundation.sql` — roles, physicians, employee_registrations, lab_test_catalog, drugs
2. `0002_identity_and_access.sql` — users, user_roles, audit_log
3. `0003_people.sql` — patients, attachments
4. `0004_certification.sql` — medical_certifications
5. `0005_clinical_encounter.sql` — visits, vitals
6. `0006_admission.sql` — admissions, admission_notes
7. `0007_laboratory.sql` — lab_orders, lab_order_items
8. `0008_pharmacy.sql` — drug_stock, prescriptions, prescription_items, dispensing_records
9. `0009_referrals_certificates.sql` — referrals, sick_leaves
10. `0010_role_display_names.sql` — adds a human-readable label to roles, separate from the stable role key
11. `0011_code_sequences.sql` — real Postgres sequences for patient and registration codes, shared by both the seed script and the API so codes can never collide

Each file is ordered so that every table is created only after everything
it references already exists — the files must be applied in this order,
which is exactly what `npm run migrate:up` does automatically.

## API routes (as of Day 3)

All under `/api/v1`, all requiring `Authorization: Bearer <token>` except
login:

- `POST /api/v1/auth/login`
- `GET /api/v1/dashboard/stats`
- `GET /api/v1/physicians`
- `GET|POST /api/v1/patients`, `GET|PUT /api/v1/patients/:id`
- `GET|POST /api/v1/visits`, `GET|PUT /api/v1/visits/:id`
- `GET|POST /api/v1/registrations`, `GET|PUT /api/v1/registrations/:id`, `POST /api/v1/registrations/:id/hire`
- `GET|POST /api/v1/certifications`, `GET /api/v1/certifications/:id`

Every route's request/response shape matches what `client/js/api.js`
already expected from its mock layer — that mock was well-built enough
that the real backend was implemented as a drop-in replacement with zero
frontend code changes beyond flipping `USE_MOCK` to `false`.
