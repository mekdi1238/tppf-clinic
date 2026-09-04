const express = require("express");
const { query, withTransaction } = require("../db/pool");
const asyncHandler = require("../utils/asyncHandler");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const { ApiError } = require("../middleware/errorHandler");
const { logAudit } = require("../services/auditLogger");

const RX_READ = requireRole("physician", "pharmacist", "system_administrator", "hr_admin", "department_hr");
const RX_PRESCRIBE = requireRole("physician", "system_administrator", "hr_admin");
const RX_DISPENSE = requireRole("pharmacist", "system_administrator", "hr_admin");

const router = express.Router();
router.use(requireAuth);

async function embedPrescription(rx) {
  const items = await query(
    `SELECT i.*, row_to_json(d.*) AS drug,
            COALESCE((SELECT SUM(quantity_dispensed) FROM dispensing_records WHERE prescription_item_id = i.id), 0) AS dispensed_total
     FROM prescription_items i
     JOIN drugs d ON d.id = i.drug_id
     WHERE i.prescription_id = $1;`,
    [rx.id]
  );
  const withRemaining = items.rows.map((i) => ({
    ...i,
    remaining: Number(i.quantity_prescribed) - Number(i.dispensed_total),
  }));
  const status = withRemaining.every((i) => i.remaining <= 0) ? "fulfilled" : "active";
  return { ...rx, items: withRemaining, status };
}

router.get("/drugs", RX_READ, asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT d.*,
            COALESCE(row_to_json(s.*), json_build_object('quantity_on_hand', 0, 'reorder_threshold', 0, 'max_threshold', NULL)) AS stock
     FROM drugs d
     LEFT JOIN drug_stock s ON s.drug_id = d.id
     ORDER BY d.drug_code ASC, d.name ASC;`
  );
  res.json(result.rows);
}));

router.post("/drugs", RX_DISPENSE, asyncHandler(async (req, res) => {
  const { drug_code, name, category, unit, batch_no, description, initial_quantity, reorder_threshold, max_threshold, expiry_date } = req.body;
  if (!name || !name.trim()) throw new ApiError(422, "name_required", "Drug item name is required.");

  const initQty = initial_quantity !== undefined && initial_quantity !== null && initial_quantity !== "" ? Number(initial_quantity) : 0;
  const threshold = reorder_threshold !== undefined && reorder_threshold !== null && reorder_threshold !== "" ? Number(reorder_threshold) : 0;
  const maxThresh = max_threshold !== undefined && max_threshold !== null && max_threshold !== "" ? Number(max_threshold) : null;

  if (isNaN(initQty) || initQty < 0) throw new ApiError(422, "invalid_quantity", "Initial quantity must be a non-negative number.");
  if (isNaN(threshold) || threshold < 0) throw new ApiError(422, "invalid_threshold", "Reorder threshold must be a non-negative number.");
  if (maxThresh !== null && (isNaN(maxThresh) || maxThresh < 0)) throw new ApiError(422, "invalid_max_threshold", "Maximum threshold must be a non-negative number.");
  if (expiry_date && isNaN(Date.parse(expiry_date))) {
    throw new ApiError(422, "invalid_expiry_date", "Invalid expiry date format. Use YYYY-MM-DD.");
  }

  const created = await withTransaction(async (client) => {
    let finalCode = drug_code ? drug_code.trim().toUpperCase() : null;
    if (!finalCode) {
      const seqRes = await client.query(`
        SELECT 'D' || lpad((COALESCE(MAX(NULLIF(regexp_replace(drug_code, '\\D', '', 'g'), '')::integer), 0) + 1)::text, 3, '0') AS code
        FROM drugs;
      `);
      finalCode = seqRes.rows[0].code;
    }

    const drugResult = await client.query(
      `INSERT INTO drugs (drug_code, name, category, unit, batch_no, description, expiry_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *;`,
      [
        finalCode,
        name.trim(),
        category ? category.trim() : null,
        unit ? unit.trim() : null,
        batch_no ? batch_no.trim() : null,
        description ? description.trim() : null,
        expiry_date || null,
      ]
    );

    const stockResult = await client.query(
      `INSERT INTO drug_stock (drug_id, quantity_on_hand, reorder_threshold, max_threshold)
       VALUES ($1, $2, $3, $4)
       RETURNING *;`,
      [drugResult.rows[0].id, initQty, threshold, maxThresh]
    );

    return { ...drugResult.rows[0], stock: stockResult.rows[0] };
  });

  await logAudit(req, {
    action: "create",
    module: "pharmacy",
    tableName: "drugs",
    recordId: created.id,
    description: `Added new drug '${created.name}' (${created.drug_code || 'No code'}) with initial stock ${initQty}`,
    afterData: created,
  });

  res.status(201).json(created);
}));

router.post("/drugs/import", RX_DISPENSE, asyncHandler(async (req, res) => {
  const { records, atomic = false } = req.body;

  if (!Array.isArray(records) || records.length === 0) {
    throw new ApiError(422, "import_records_required", "records must be a non-empty array.");
  }

  const REQUIRED_FIELDS = ["name"];

  function validateRow(row) {
    const itemName = (row.name || row.item || "").toString().trim();
    if (!itemName) return `Missing required drug/item name.`;

    const qty = row.quantity_on_hand !== undefined ? row.quantity_on_hand : (row.quantity !== undefined ? row.quantity : row.initial_quantity);
    if (qty !== undefined && qty !== null && qty !== "") {
      const q = Number(qty);
      if (isNaN(q) || q < 0) return `Invalid quantity "${qty}". Must be a non-negative number.`;
    }

    const minThresh = row.reorder_threshold !== undefined ? row.reorder_threshold : row.min_threshold;
    if (minThresh !== undefined && minThresh !== null && minThresh !== "") {
      const t = Number(minThresh);
      if (isNaN(t) || t < 0) return `Invalid minimum threshold "${minThresh}". Must be a non-negative number.`;
    }

    const maxThresh = row.max_threshold !== undefined ? row.max_threshold : row.maximum;
    if (maxThresh !== undefined && maxThresh !== null && maxThresh !== "") {
      const m = Number(maxThresh);
      if (isNaN(m) || m < 0) return `Invalid maximum threshold "${maxThresh}". Must be a non-negative number.`;
    }

    const expDate = row.expiry_date || row.expiration_date;
    if (expDate && isNaN(Date.parse(expDate))) {
      return `Invalid expiration date "${expDate}". Use YYYY-MM-DD format.`;
    }
    return null;
  }

  async function insertDrugRow(client, row) {
    let finalCode = (row.drug_code || row.item_code || "").toString().trim().toUpperCase() || null;
    if (!finalCode) {
      const seqRes = await client.query(`
        SELECT 'D' || lpad((COALESCE(MAX(NULLIF(regexp_replace(drug_code, '\\D', '', 'g'), '')::integer), 0) + 1)::text, 3, '0') AS code
        FROM drugs;
      `);
      finalCode = seqRes.rows[0].code;
    }

    const name = (row.name || row.item || "").toString().trim();
    const category = (row.category || "").toString().trim() || null;
    const rawUnit = (row.unit || "").toString().trim();
    const unit = rawUnit ? (rawUnit.replace(/\s*\([^)]*\)/g, '').trim() || rawUnit) : null;
    const batchNo = (row.batch_no || row.batch || "").toString().trim() || null;

    const description = (row.description || "").toString().trim() || null;

    const rawQty = row.quantity_on_hand !== undefined ? row.quantity_on_hand : (row.quantity !== undefined ? row.quantity : row.initial_quantity);
    const initialQty = rawQty !== undefined && rawQty !== null && rawQty !== "" ? Number(rawQty) : 0;

    const rawMin = row.reorder_threshold !== undefined ? row.reorder_threshold : row.min_threshold;
    const minThreshold = rawMin !== undefined && rawMin !== null && rawMin !== "" ? Number(rawMin) : 0;

    const rawMax = row.max_threshold !== undefined ? row.max_threshold : row.maximum;
    const maxThreshold = rawMax !== undefined && rawMax !== null && rawMax !== "" ? Number(rawMax) : null;

    const rawExp = row.expiry_date || row.expiration_date;
    const expiry = rawExp && !isNaN(Date.parse(rawExp)) ? rawExp.toString().trim() : null;

    const drugRes = await client.query(
      `INSERT INTO drugs (drug_code, name, category, unit, batch_no, description, expiry_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *;`,
      [finalCode, name, category, unit, batchNo, description, expiry]
    );

    const stockRes = await client.query(
      `INSERT INTO drug_stock (drug_id, quantity_on_hand, reorder_threshold, max_threshold)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (drug_id) DO UPDATE SET
         quantity_on_hand = EXCLUDED.quantity_on_hand,
         reorder_threshold = EXCLUDED.reorder_threshold,
         max_threshold = EXCLUDED.max_threshold
       RETURNING *;`,
      [drugRes.rows[0].id, initialQty, minThreshold, maxThreshold]
    );

    return { ...drugRes.rows[0], stock: stockRes.rows[0] };
  }

  // ---------- ATOMIC MODE ----------
  if (atomic) {
    for (let i = 0; i < records.length; i++) {
      const err = validateRow(records[i]);
      if (err) {
        return res.status(422).json({
          success: false,
          mode: "atomic",
          successCount: 0,
          failedRowIndex: i + 1,
          failedRow: records[i],
          error: err,
          remainingRows: records.slice(i),
        });
      }
    }

    const inserted = await withTransaction(async (client) => {
      const results = [];
      for (const row of records) {
        const r = await insertDrugRow(client, row);
        results.push(r);
      }
      return results;
    });

    await logAudit(req, {
      action: "import",
      module: "pharmacy",
      tableName: "drugs",
      description: `Imported ${inserted.length} drug item(s) (Atomic mode)`,
      afterData: { count: inserted.length },
    });

    return res.status(201).json({
      success: true,
      mode: "atomic",
      successCount: inserted.length,
      records: inserted,
    });
  }

  // ---------- PARTIAL MODE ----------
  const committed = [];
  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    const err = validateRow(row);
    if (err) {
      if (committed.length > 0) {
        await logAudit(req, {
          action: "import",
          module: "pharmacy",
          tableName: "drugs",
          description: `Imported ${committed.length} drug item(s) before validation error at row ${i + 1}`,
          afterData: { count: committed.length },
        });
      }
      return res.status(207).json({
        success: false,
        mode: "partial",
        successCount: committed.length,
        failedRowIndex: i + 1,
        failedRow: row,
        error: err,
        remainingRows: records.slice(i),
      });
    }
    try {
      const result = await withTransaction(async (client) => {
        return await insertDrugRow(client, row);
      });
      committed.push(result);
    } catch (dbErr) {
      if (committed.length > 0) {
        await logAudit(req, {
          action: "import",
          module: "pharmacy",
          tableName: "drugs",
          description: `Imported ${committed.length} drug item(s) before DB error at row ${i + 1}`,
          afterData: { count: committed.length },
        });
      }
      return res.status(207).json({
        success: false,
        mode: "partial",
        successCount: committed.length,
        failedRowIndex: i + 1,
        failedRow: row,
        error: `Database error: ${dbErr.message}`,
        remainingRows: records.slice(i),
      });
    }
  }

  await logAudit(req, {
    action: "import",
    module: "pharmacy",
    tableName: "drugs",
    description: `Imported ${committed.length} drug item(s) (Partial mode)`,
    afterData: { count: committed.length },
  });

  return res.status(201).json({
    success: true,
    mode: "partial",
    successCount: committed.length,
    records: committed,
  });
}));

router.delete("/drugs/:id", RX_DISPENSE, asyncHandler(async (req, res) => {
  const drugId = req.params.id;
  const existing = await query(`SELECT * FROM drugs WHERE id = $1;`, [drugId]);
  if (!existing.rows[0]) throw new ApiError(404, "drug_not_found", "Drug not found.");

  // Check if drug is referenced in prescription items
  const inUse = await query(`SELECT id FROM prescription_items WHERE drug_id = $1 LIMIT 1;`, [drugId]);
  if (inUse.rows.length > 0) {
    throw new ApiError(409, "drug_in_use", `Cannot delete "${existing.rows[0].name}" because it is referenced in patient prescription history. You can adjust its stock quantity to 0 instead.`);
  }

  await withTransaction(async (client) => {
    await client.query(`DELETE FROM drug_stock WHERE drug_id = $1;`, [drugId]);
    await client.query(`DELETE FROM drugs WHERE id = $1;`, [drugId]);
  });

  await logAudit(req, {
    action: "delete",
    module: "pharmacy",
    tableName: "drugs",
    recordId: Number(drugId),
    description: `Deleted drug '${existing.rows[0].name}' (${existing.rows[0].drug_code || 'No code'})`,
    beforeData: existing.rows[0],
  });

  res.json({ success: true, id: drugId });
}));

router.put("/drugs/:id", RX_DISPENSE, asyncHandler(async (req, res) => {
  const drugId = req.params.id;
  const { drug_code, name, category, unit, batch_no, description, expiry_date, quantity_on_hand, reorder_threshold, max_threshold } = req.body;
  const existing = await query(`SELECT * FROM drugs WHERE id = $1;`, [drugId]);
  if (!existing.rows[0]) throw new ApiError(404, "drug_not_found", "Drug not found.");

  if (expiry_date && isNaN(Date.parse(expiry_date))) {
    throw new ApiError(422, "invalid_expiry_date", "Invalid expiry date format. Use YYYY-MM-DD.");
  }

  const updated = await withTransaction(async (client) => {
    const drugResult = await client.query(
      `UPDATE drugs
       SET drug_code = COALESCE($1, drug_code),
           name = COALESCE($2, name),
           category = CASE WHEN $3 IS NOT NULL THEN $3 ELSE category END,
           unit = CASE WHEN $4 IS NOT NULL THEN $4 ELSE unit END,
           batch_no = CASE WHEN $5 IS NOT NULL THEN $5 ELSE batch_no END,
           description = CASE WHEN $6 IS NOT NULL THEN $6 ELSE description END,
           expiry_date = $7
       WHERE id = $8
       RETURNING *;`,
      [
        drug_code ? drug_code.trim().toUpperCase() : null,
        name ? name.trim() : null,
        category !== undefined ? (category ? category.trim() : null) : null,
        unit !== undefined ? (unit ? unit.trim() : null) : null,
        batch_no !== undefined ? (batch_no ? batch_no.trim() : null) : null,
        description !== undefined ? (description ? description.trim() : null) : null,
        expiry_date !== undefined ? (expiry_date || null) : existing.rows[0].expiry_date,
        drugId,
      ]
    );

    const stockUpdates = [];
    const stockParams = [];
    if (quantity_on_hand !== undefined && quantity_on_hand !== null && quantity_on_hand !== "") {
      const q = Number(quantity_on_hand);
      if (!isNaN(q) && q >= 0) {
        stockParams.push(q);
        stockUpdates.push(`quantity_on_hand = $${stockParams.length}`);
      }
    }
    if (reorder_threshold !== undefined && reorder_threshold !== null && reorder_threshold !== "") {
      const t = Number(reorder_threshold);
      if (!isNaN(t) && t >= 0) {
        stockParams.push(t);
        stockUpdates.push(`reorder_threshold = $${stockParams.length}`);
      }
    }
    if (max_threshold !== undefined) {
      const m = max_threshold !== null && max_threshold !== "" ? Number(max_threshold) : null;
      if (m === null || (!isNaN(m) && m >= 0)) {
        stockParams.push(m);
        stockUpdates.push(`max_threshold = $${stockParams.length}`);
      }
    }

    let stockRow = null;
    if (stockUpdates.length > 0) {
      stockParams.push(drugId);
      const stockRes = await client.query(
        `UPDATE drug_stock SET ${stockUpdates.join(", ")}, updated_at = now() WHERE drug_id = $${stockParams.length} RETURNING *;`,
        stockParams
      );
      stockRow = stockRes.rows[0];
    } else {
      const stockRes = await client.query(`SELECT * FROM drug_stock WHERE drug_id = $1;`, [drugId]);
      stockRow = stockRes.rows[0];
    }

    return { ...drugResult.rows[0], stock: stockRow };
  });

  await logAudit(req, {
    action: "update",
    module: "pharmacy",
    tableName: "drugs",
    recordId: Number(drugId),
    description: `Updated drug '${updated.name}' details and inventory parameters`,
    beforeData: existing.rows[0],
    afterData: updated,
  });

  res.json(updated);
}));

router.put("/drug-stock/:drugId", RX_DISPENSE, asyncHandler(async (req, res) => {
  const delta = Number(req.body.delta) || 0;
  const { expiry_date } = req.body;
  const current = await query(`SELECT * FROM drug_stock WHERE drug_id = $1;`, [req.params.drugId]);
  if (!current.rows[0]) throw new ApiError(404, "stock_not_found", "Stock record not found.");
  if (Number(current.rows[0].quantity_on_hand) + delta < 0) {
    throw new ApiError(422, "stock_negative", "Stock cannot go below zero.");
  }

  if (expiry_date !== undefined) {
    await query(`UPDATE drugs SET expiry_date = $1 WHERE id = $2;`, [expiry_date || null, req.params.drugId]);
  }

  const result = await query(
    `UPDATE drug_stock SET quantity_on_hand = quantity_on_hand + $1, updated_at = now() WHERE drug_id = $2 RETURNING *;`,
    [delta, req.params.drugId]
  );

  const drugInfo = await query(`SELECT name, drug_code FROM drugs WHERE id = $1;`, [req.params.drugId]);
  const drugName = drugInfo.rows[0]?.name || `Drug #${req.params.drugId}`;

  await logAudit(req, {
    action: "update",
    module: "pharmacy",
    tableName: "drug_stock",
    recordId: Number(req.params.drugId),
    description: `Adjusted stock for '${drugName}' by ${delta >= 0 ? '+' : ''}${delta} unit(s) (New On-Hand: ${result.rows[0].quantity_on_hand})`,
    beforeData: current.rows[0],
    afterData: result.rows[0],
  });

  res.json(result.rows[0]);
}));

router.get("/prescriptions", RX_READ, asyncHandler(async (req, res) => {
  const { search, status, visit_id } = req.query;
  const conditions = [];
  const params = [];

  if (visit_id) {
    params.push(visit_id);
    conditions.push(`rx.visit_id = $${params.length}`);
  }
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    conditions.push(`(lower(p.full_name) LIKE $${params.length} OR lower(p.patient_code) LIKE $${params.length})`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await query(
    `SELECT rx.*, 
            p.full_name AS patient_name, 
            p.patient_code AS patient_code,
            p.date_of_birth AS patient_dob,
            p.gender AS patient_gender,
            p.phone AS patient_phone,
            p.location AS patient_location,
            p.address AS patient_address,
            p.department AS patient_department,
            p.position AS patient_position,
            ph.full_name AS physician_full_name,
            ph.full_name AS physician_name,
            ph.qualification AS physician_qualification,
            ph.license_no AS physician_license_no,
            v.diagnosis AS visit_diagnosis
     FROM prescriptions rx
     JOIN visits v ON v.id = rx.visit_id
     JOIN patients p ON p.id = rx.patient_id
     LEFT JOIN physicians ph ON ph.id = rx.physician_id
     ${where}
     ORDER BY rx.prescribed_date DESC;`,
    params
  );
  const withItems = await Promise.all(result.rows.map(embedPrescription));
  if (status && status !== "all") {
    return res.json(withItems.filter((rx) => rx.status === status));
  }
  res.json(withItems);
}));

router.get("/prescriptions/:id", RX_READ, asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT rx.*, 
            p.full_name AS patient_name, 
            p.patient_code AS patient_code,
            p.date_of_birth AS patient_dob,
            p.gender AS patient_gender,
            p.phone AS patient_phone,
            p.location AS patient_location,
            p.address AS patient_address,
            p.department AS patient_department,
            p.position AS patient_position,
            ph.full_name AS physician_full_name,
            ph.full_name AS physician_name,
            ph.qualification AS physician_qualification,
            ph.license_no AS physician_license_no,
            v.diagnosis AS visit_diagnosis
     FROM prescriptions rx
     JOIN visits v ON v.id = rx.visit_id
     JOIN patients p ON p.id = rx.patient_id
     LEFT JOIN physicians ph ON ph.id = rx.physician_id
     WHERE rx.id = $1;`,
    [req.params.id]
  );
  if (!result.rows[0]) throw new ApiError(404, "prescription_not_found", "Prescription not found.");
  res.json(await embedPrescription(result.rows[0]));
}));

router.post("/prescriptions", RX_PRESCRIBE, asyncHandler(async (req, res) => {
  const { visit_id, physician_id, diagnosis_note, items } = req.body;
  if (!visit_id) throw new ApiError(422, "visit_required", "A visit is required.");
  if (!Array.isArray(items) || !items.length) throw new ApiError(422, "items_required", "Add at least one drug.");

  const visitResult = await query(`SELECT * FROM visits WHERE id = $1;`, [visit_id]);
  const visit = visitResult.rows[0];
  if (!visit) throw new ApiError(422, "invalid_visit", "Select a valid visit.");

  const createdRx = await withTransaction(async (client) => {
    const rxResult = await client.query(
      `INSERT INTO prescriptions (visit_id, patient_id, physician_id, diagnosis_note)
       VALUES ($1, $2, $3, $4) RETURNING *;`,
      [visit_id, visit.patient_id, physician_id || visit.physician_id || null, diagnosis_note || null]
    );
    for (const item of items) {
      if (!item.drug_id || !item.quantity_prescribed) continue;
      await client.query(
        `INSERT INTO prescription_items (prescription_id, drug_id, dosage, frequency, duration, quantity_prescribed, instructions)
         VALUES ($1, $2, $3, $4, $5, $6, $7);`,
        [rxResult.rows[0].id, item.drug_id, item.dosage || null, item.frequency || null, item.duration || null, item.quantity_prescribed, item.instructions || null]
      );
    }
    return rxResult.rows[0];
  });

  const embedded = await embedPrescription(createdRx);

  await logAudit(req, {
    action: "create",
    module: "pharmacy",
    tableName: "prescriptions",
    recordId: createdRx.id,
    description: `Created Prescription #${createdRx.id} for Visit #${visit_id} with ${items.length} item(s)`,
    afterData: { prescription: createdRx, items },
  });

  res.status(201).json(embedded);
}));

router.post("/prescriptions/:id/dispense", RX_DISPENSE, asyncHandler(async (req, res) => {
  const { item_id, quantity, notes } = req.body;
  const qty = Number(quantity);
  if (!qty || qty <= 0) throw new ApiError(422, "quantity_required", "Enter a quantity to dispense.");

  await withTransaction(async (client) => {
    // Validate the prescription item exists
    const itemResult = await client.query(
      `SELECT * FROM prescription_items WHERE id = $1 AND prescription_id = $2;`,
      [item_id, req.params.id]
    );
    const item = itemResult.rows[0];
    if (!item) throw new ApiError(404, "item_not_found", "Prescription item not found.");

    // Check remaining quantity (inside transaction for consistency)
    const dispensedResult = await client.query(
      `SELECT COALESCE(SUM(quantity_dispensed), 0) AS total FROM dispensing_records WHERE prescription_item_id = $1;`,
      [item_id]
    );
    const remaining = Number(item.quantity_prescribed) - Number(dispensedResult.rows[0].total);
    if (qty > remaining) {
      throw new ApiError(422, "exceeds_remaining", `Cannot dispense more than the ${remaining} unit(s) remaining on this item.`);
    }

    // Ensure drug_stock row exists before locking
    await client.query(
      `INSERT INTO drug_stock (drug_id, quantity_on_hand, reorder_threshold)
       VALUES ($1, 0, 0)
       ON CONFLICT (drug_id) DO NOTHING;`,
      [item.drug_id]
    );

    // Lock the stock row to prevent concurrent dispensing race conditions
    const stockResult = await client.query(
      `SELECT * FROM drug_stock WHERE drug_id = $1 FOR UPDATE;`,
      [item.drug_id]
    );
    const stock = stockResult.rows[0];
    if (!stock || Number(stock.quantity_on_hand) < qty) {
      const onHand = stock ? Number(stock.quantity_on_hand) : 0;
      throw new ApiError(422, "insufficient_stock", `Not enough stock on hand to dispense ${qty} unit(s). Current stock on hand: ${onHand}.`);
    }

    await client.query(
      `UPDATE drug_stock SET quantity_on_hand = quantity_on_hand - $1, updated_at = now() WHERE drug_id = $2;`,
      [qty, item.drug_id]
    );
    await client.query(
      `INSERT INTO dispensing_records (prescription_item_id, quantity_dispensed, dispensed_by, notes)
       VALUES ($1, $2, $3, $4);`,
      [item_id, qty, req.user ? req.user.id : null, notes || null]
    );
  });

  const drugInfo = await query(
    `SELECT d.name, d.drug_code FROM prescription_items pi JOIN drugs d ON d.id = pi.drug_id WHERE pi.id = $1;`,
    [item_id]
  );
  const drugName = drugInfo.rows[0]?.name || "Medication";

  await logAudit(req, {
    action: "dispense",
    module: "pharmacy",
    tableName: "dispensing_records",
    recordId: Number(req.params.id),
    description: `Dispensed ${qty} unit(s) of '${drugName}' for Prescription #${req.params.id}`,
    afterData: { prescription_id: req.params.id, item_id, quantity: qty, notes },
  });

  const rxResult = await query(`SELECT * FROM prescriptions WHERE id = $1;`, [req.params.id]);
  res.json(await embedPrescription(rxResult.rows[0]));
}));

router.delete("/prescriptions/:id", requireRole("physician", "pharmacist", "system_administrator", "hr_admin"), asyncHandler(async (req, res) => {
  const rxId = req.params.id;
  const existing = await query(`SELECT * FROM prescriptions WHERE id = $1;`, [rxId]);
  if (!existing.rows[0]) throw new ApiError(404, "prescription_not_found", "Prescription not found.");

  await withTransaction(async (client) => {
    // Restore any dispensed quantities back to drug stock
    const dispensedItems = await client.query(
      `SELECT pi.drug_id, dr.quantity_dispensed
       FROM dispensing_records dr
       JOIN prescription_items pi ON pi.id = dr.prescription_item_id
       WHERE pi.prescription_id = $1;`,
      [rxId]
    );
    for (const row of dispensedItems.rows) {
      if (row.drug_id && Number(row.quantity_dispensed) > 0) {
        await client.query(
          `UPDATE drug_stock SET quantity_on_hand = quantity_on_hand + $1, updated_at = now() WHERE drug_id = $2;`,
          [Number(row.quantity_dispensed), row.drug_id]
        );
      }
    }

    // Delete prescription (CASCADE will delete prescription_items and dispensing_records)
    await client.query(`DELETE FROM prescriptions WHERE id = $1;`, [rxId]);
  });

  await logAudit(req, {
    action: "delete",
    module: "pharmacy",
    tableName: "prescriptions",
    recordId: Number(rxId),
    description: `Deleted Prescription #${rxId} and restored dispensed stock`,
    beforeData: existing.rows[0],
  });

  res.json({ success: true, id: rxId });
}));

module.exports = router;
