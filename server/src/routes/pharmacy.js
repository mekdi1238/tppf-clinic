const express = require("express");
const { query, withTransaction } = require("../db/pool");
const asyncHandler = require("../utils/asyncHandler");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const { ApiError } = require("../middleware/errorHandler");

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
    `SELECT d.*, row_to_json(s.*) AS stock
     FROM drugs d
     LEFT JOIN drug_stock s ON s.drug_id = d.id
     ORDER BY d.name;`
  );
  res.json(result.rows);
}));

router.post("/drugs", RX_DISPENSE, asyncHandler(async (req, res) => {
  const { name, unit, description, initial_quantity, reorder_threshold } = req.body;
  if (!name || !name.trim()) throw new ApiError(422, "name_required", "Drug name is required.");

  const created = await withTransaction(async (client) => {
    const drugResult = await client.query(
      `INSERT INTO drugs (name, unit, description) VALUES ($1, $2, $3) RETURNING *;`,
      [name.trim(), unit || null, description || null]
    );
    const stockResult = await client.query(
      `INSERT INTO drug_stock (drug_id, quantity_on_hand, reorder_threshold) VALUES ($1, $2, $3) RETURNING *;`,
      [drugResult.rows[0].id, initial_quantity || 0, reorder_threshold || 0]
    );
    return { ...drugResult.rows[0], stock: stockResult.rows[0] };
  });

  res.status(201).json(created);
}));

router.put("/drug-stock/:drugId", RX_DISPENSE, asyncHandler(async (req, res) => {
  const delta = Number(req.body.delta) || 0;
  const current = await query(`SELECT * FROM drug_stock WHERE drug_id = $1;`, [req.params.drugId]);
  if (!current.rows[0]) throw new ApiError(404, "stock_not_found", "Stock record not found.");
  if (current.rows[0].quantity_on_hand + delta < 0) {
    throw new ApiError(422, "stock_negative", "Stock cannot go below zero.");
  }

  const result = await query(
    `UPDATE drug_stock SET quantity_on_hand = quantity_on_hand + $1 WHERE drug_id = $2 RETURNING *;`,
    [delta, req.params.drugId]
  );
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
    `SELECT rx.*, p.full_name AS patient_name, p.patient_code AS patient_code
     FROM prescriptions rx
     JOIN patients p ON p.id = rx.patient_id
     ${where}
     ORDER BY rx.prescribed_date DESC;`,
    params
  );
  let withItems = await Promise.all(result.rows.map(embedPrescription));
  if (status && status !== "all") withItems = withItems.filter((rx) => rx.status === status);
  res.json(withItems);
}));

router.get("/prescriptions/:id", RX_READ, asyncHandler(async (req, res) => {
  const result = await query(`SELECT * FROM prescriptions WHERE id = $1;`, [req.params.id]);
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

  res.status(201).json(await embedPrescription(createdRx));
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

    // Lock the stock row to prevent concurrent dispensing race conditions
    const stockResult = await client.query(
      `SELECT * FROM drug_stock WHERE drug_id = $1 FOR UPDATE;`,
      [item.drug_id]
    );
    const stock = stockResult.rows[0];
    if (!stock || stock.quantity_on_hand < qty) {
      throw new ApiError(422, "insufficient_stock", "Not enough stock on hand to dispense this quantity.");
    }

    await client.query(
      `UPDATE drug_stock SET quantity_on_hand = quantity_on_hand - $1 WHERE drug_id = $2;`,
      [qty, item.drug_id]
    );
    await client.query(
      `INSERT INTO dispensing_records (prescription_item_id, quantity_dispensed, dispensed_by, notes)
       VALUES ($1, $2, $3, $4);`,
      [item_id, qty, req.user ? req.user.id : null, notes || null]
    );
  });

  const rxResult = await query(`SELECT * FROM prescriptions WHERE id = $1;`, [req.params.id]);
  res.json(await embedPrescription(rxResult.rows[0]));
}));

module.exports = router;
