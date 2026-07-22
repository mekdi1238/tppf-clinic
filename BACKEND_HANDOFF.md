# Backend handoff — Admissions, Laboratory, Pharmacy, Referrals & Certificates, Users & Roles

Frontend for all remaining modules is done: `client/admissions.html`, `client/laboratory.html`,
`client/pharmacy.html`, `client/referrals.html`, `client/users.html`, `client/reports.html`,
`client/backup.html`, `client/settings.html`, and their `.js` files. They call the
same `Api.*` pattern as everything else, but since none of these tables (except
`users`/`roles`, which already exist) have backend routes yet, `client/js/api.js`
forces those paths through the mock layer regardless of `USE_MOCK`:

```js
const MOCK_ONLY_PATHS = ['/admissions', '/lab-orders', '/lab-test-catalog', '/drugs', '/drug-stock', '/prescriptions', '/referrals', '/sick-leaves', '/users', '/roles', '/settings', '/backups'];
```

Everything else (patients, visits, registrations, certifications) already goes to
your real API as before. Data for the mock-only paths lives in the browser's
localStorage, seeded empty (no fake admissions/lab orders/prescriptions/referrals/
sick leaves, since those need to reference real visit IDs from Postgres —
`lab_test_catalog` and `drugs`/`drug_stock` have seed rows since they're standalone
reference data).

## What's needed from you

1. **Five route files** in `server-suggestions/` — `admissions.js`, `labOrders.js`,
   `pharmacy.js`, `referralsAndSickLeaves.js`, `users.js` — written to match
   `patients.js` / `registrations.js` exactly (asyncHandler, ApiError, requireAuth,
   the `query` pool helper — no transaction wrapper, since `db/pool.js` doesn't
   export one; see the note below). `users.js` also uses your real
   `hashPassword`/`verifyPassword` from `auth/passwordHash.js`, not a mock
   plaintext check. Review, adjust, move into `server/src/routes/`, then in
   `app.js`:
   ```js
   const admissionsRoutes = require("./routes/admissions");
   const labOrdersRoutes = require("./routes/labOrders");
   const pharmacyRoutes = require("./routes/pharmacy");
   const referralsRoutes = require("./routes/referralsAndSickLeaves");
   const usersRoutes = require("./routes/users");
   app.use("/api/v1", admissionsRoutes);
   app.use("/api/v1", labOrdersRoutes);
   app.use("/api/v1", pharmacyRoutes);
   app.use("/api/v1", referralsRoutes);
   app.use("/api/v1", usersRoutes);
   ```

2. **Atomicity gap, flagged honestly**: `pharmacy.js`'s dispense action does two
   writes (decrement `drug_stock`, insert `dispensing_records`) as two sequential
   `query()` calls, same as your existing `hire` route does for patients/registrations
   — there's no transaction wrapper anywhere in the codebase yet. For dispensing
   specifically, if the second write fails after the first succeeds, stock would be
   decremented without a matching record. Same shape of gap already exists in your
   own migration comment on `dispensing_records` (the cross-row quantity check).
   Worth a real transaction (`BEGIN`/`COMMIT` via a checked-out client, or a
   `withTransaction` helper added to `pool.js`) before this goes to production —
   flagging it rather than silently working around it.

3. **Seed `lab_test_catalog`** (migration 0007 created the table, nothing seeds it
   yet). Add to `db/seed.js`, matching the existing pattern:
   ```js
   const labTests = [
     ["WBC", "Hematology", "White Blood Cell Count"],
     ["HGB", "Hematology", "Hemoglobin"],
     ["PLT", "Hematology", "Platelet Count"],
     ["RBS", "Chemistry", "Random Blood Sugar"],
     ["FBS", "Chemistry", "Fasting Blood Sugar"],
     ["CREA", "Chemistry", "Creatinine"],
     ["HBSAG", "Serology", "Hepatitis B Surface Antigen"],
     ["VDRL", "Serology", "Syphilis Screening (VDRL)"],
     ["HIV", "Serology", "HIV Antibody Test"],
     ["URINE", "Urinalysis", "Routine Urinalysis"],
     ["STOOL", "Stool/Parasitology", "Stool Examination, Direct"],
   ];
   for (const [code, panel, displayName] of labTests) {
     await client.query(
       `INSERT INTO lab_test_catalog (code, panel, display_name)
        VALUES ($1, $2, $3)
        ON CONFLICT (code) DO UPDATE SET panel = EXCLUDED.panel, display_name = EXCLUDED.display_name;`,
       [code, panel, displayName]
     );
   }
   ```

4. **Seed `drugs` / `drug_stock`** similarly — the frontend's mock seed
   (`buildSeed()` in `client/js/api.js`) has 8 example drugs with starting
   quantities and reorder thresholds you can copy the values from directly.

5. **Update the visit-closing rule** in `server/src/routes/visits.js`. It currently
   hard-blocks any `closed` + `disposition = admitted` combination with a
   placeholder message. Once `admissions.js` and `labOrders.js` are live, replace
   that block with the real rule from the entity dictionary — an admission record
   must exist, and no lab order on the visit may still be `pending`/`in_progress`:

   ```js
   if (req.body.status === "closed") {
     if (next.disposition === "admitted") {
       const admission = await query(`SELECT id FROM admissions WHERE visit_id = $1;`, [req.params.id]);
       if (!admission.rows[0]) {
         throw new ApiError(422, "admission_required", 'Disposition is "admitted" but no admission record exists for this visit yet.');
       }
     }
     const pendingLab = await query(
       `SELECT id FROM lab_orders WHERE visit_id = $1 AND status IN ('pending', 'in_progress');`,
       [req.params.id]
     );
     if (pendingLab.rows[0]) {
       throw new ApiError(422, "lab_orders_pending", "This visit has lab orders still pending or in progress.");
     }
   }
   ```

6. Once each route is live, remove its entry from `MOCK_ONLY_PATHS` in
   `client/js/api.js` — no other frontend change needed, same drop-in pattern as
   the rest of the app.

7. **Referrals & sick leaves need neither seed data nor a visit-closing rule** —
   they're standalone documents attached to a visit, not part of the state machine.
   `referralsAndSickLeaves.js` is otherwise ready to drop in like the other three.

## Frontend ID note

The mock's `lab_test_catalog` and `drugs` collections use string IDs
(`test_wbc`, `drug_paracetamol`, etc.) purely for localStorage. Your real tables
use integer IDs from Postgres. This doesn't require any frontend change — the
frontend already just renders whatever `id`/`code`/`name` it gets back, from
either source.

The `prescriptions` field name is `prescribed_date` (matching your migration),
not `prescribed_at` — flagging this since it's the kind of naming mismatch that's
easy to introduce by accident on the frontend side and silently break once the
real route replaces the mock one. Already double-checked against
`0008_pharmacy.sql` and consistent across `api.js`, `pharmacy.js`, and `visits.js`.

## Reports — no backend work needed

`client/reports.html` is read-only and purely aggregates data from calls that
already exist (`Api.patients.list()`, `Api.visits.list()`, etc.) — nothing new
to build here. Once the routes above are live, its numbers automatically stop
being mock data with zero changes to `reports.js`.

## Backup & Settings — flagged, not invented

Unlike everything else above, `backups` and `settings` don't correspond to any
table in the entity dictionary or your migrations — I didn't invent a schema for
either, since that's a real design decision, not "preparation":

- **Backups**: `client/backup.html` is an admin UI shell (create/list/delete
  backup *records*) with a clear on-page notice that it doesn't do anything real
  yet. Actually generating a dump is server-side work (`pg_dump`, file storage —
  local disk vs. S3/object storage, a download-streaming endpoint) that depends
  on how you want to host this, so there's no route file to review here.
- **Settings**: `client/settings.html`'s Clinic Profile tab needs *some* place to
  persist a handful of key/value fields (clinic name, tagline, address, phone).
  A single-row `clinic_settings` table or a generic `settings(key, value)` table
  both work; picking one is a small but real schema decision, so I left it for
  you rather than adding an unreviewed migration. The "My Account" password-change
  tab already calls a real pattern worth keeping: `POST /users/:id/change-password`
  in `server-suggestions/users.js` verifies the current password via
  `verifyPassword` before allowing the change, distinct from the admin-only
  `reset-password` endpoint which doesn't require it.

