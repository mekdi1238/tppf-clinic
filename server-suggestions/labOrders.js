const express = require("express");
const { query } = require("../db/pool");
const asyncHandler = require("../utils/asyncHandler");
const requireAuth = require("../middleware/requireAuth");
const { ApiError } = require("../middleware/errorHandler");

const router = express.Router();
router.use(requireAuth);

const LAB_ORDER_TRANSITIONS = {
  pending: ["in_progress"],
  in_progress: ["completed"],
  completed: [],
};

async function embedItems(order) {
  const items = await query(
    `SELECT i.*, row_to_json(t.*) AS test
     FROM lab_order_items i
     JOIN lab_test_catalog t ON t.id = i.test_id
     WHERE i.lab_order_id = $1;`,
    [order.id]
  );
  return { ...order, items: items.rows };
}

router.get("/lab-test-catalog", asyncHandler(async (req, res) => {
  const result = await query(`SELECT * FROM lab_test_catalog ORDER BY panel, display_name;`);
  res.json(result.rows);
}));

router.get("/lab-orders", asyncHandler(async (req, res) => {
  const { search, status, visit_id } = req.query;
  const conditions = [];
  const params = [];

  if (visit_id) {
    params.push(visit_id);
    conditions.push(`o.visit_id = $${params.length}`);
  }
  if (status && status !== "all") {
    params.push(status);
    conditions.push(`o.status = $${params.length}`);
  }
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    conditions.push(`(lower(p.full_name) LIKE $${params.length} OR lower(p.patient_code) LIKE $${params.length})`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await query(
    `SELECT o.*, p.full_name AS patient_name, p.patient_code AS patient_code
     FROM lab_orders o
     JOIN visits v ON v.id = o.visit_id
     JOIN patients p ON p.id = v.patient_id
     ${where}
     ORDER BY o.order_date DESC;`,
    params
  );
  const withItems = await Promise.all(result.rows.map(embedItems));
  res.json(withItems);
}));

router.get("/lab-orders/:id", asyncHandler(async (req, res) => {
  const result = await query(`SELECT * FROM lab_orders WHERE id = $1;`, [req.params.id]);
  if (!result.rows[0]) throw new ApiError(404, "lab_order_not_found", "Lab order not found.");
  res.json(await embedItems(result.rows[0]));
}));

router.post("/lab-orders", asyncHandler(async (req, res) => {
  const { visit_id, physician_id, test_ids } = req.body;
  if (!visit_id) throw new ApiError(422, "visit_required", "A visit is required.");
  if (!Array.isArray(test_ids) || !test_ids.length) {
    throw new ApiError(422, "tests_required", "Select at least one test.");
  }

  const visitResult = await query(`SELECT id FROM visits WHERE id = $1;`, [visit_id]);
  if (!visitResult.rows[0]) throw new ApiError(422, "invalid_visit", "Select a valid visit.");

  const orderResult = await query(
    `INSERT INTO lab_orders (visit_id, physician_id) VALUES ($1, $2) RETURNING *;`,
    [visit_id, physician_id || null]
  );
  const order = orderResult.rows[0];

  for (const testId of test_ids) {
    await query(
      `INSERT INTO lab_order_items (lab_order_id, test_id) VALUES ($1, $2);`,
      [order.id, testId]
    );
  }

  res.status(201).json(await embedItems(order));
}));

router.put("/lab-orders/:id", asyncHandler(async (req, res) => {
  const current = await query(`SELECT * FROM lab_orders WHERE id = $1;`, [req.params.id]);
  const order = current.rows[0];
  if (!order) throw new ApiError(404, "lab_order_not_found", "Lab order not found.");

  const { status } = req.body;
  if (status && status !== order.status) {
    const allowed = LAB_ORDER_TRANSITIONS[order.status] || [];
    if (!allowed.includes(status)) {
      throw new ApiError(
        422,
        "invalid_lab_order_transition",
        `Cannot move a lab order from "${order.status}" to "${status}" directly.`
      );
    }
    if (status === "completed") {
      const items = await query(`SELECT result_value FROM lab_order_items WHERE lab_order_id = $1;`, [order.id]);
      if (items.rows.some((i) => !i.result_value)) {
        throw new ApiError(
          422,
          "results_incomplete",
          "Enter a result for every test before marking this order completed."
        );
      }
    }
  }

  const result = await query(
    `UPDATE lab_orders SET status = $1 WHERE id = $2 RETURNING *;`,
    [status || order.status, req.params.id]
  );
  res.json(await embedItems(result.rows[0]));
}));

router.put("/lab-orders/:orderId/items/:itemId", asyncHandler(async (req, res) => {
  const { result_value } = req.body;
  const result = await query(
    `UPDATE lab_order_items
     SET result_value = $1, entered_by = $2, entered_at = CASE WHEN $1 IS NOT NULL THEN now() ELSE NULL END
     WHERE id = $3 AND lab_order_id = $4
     RETURNING *;`,
    [result_value || null, req.user ? req.user.id : null, req.params.itemId, req.params.orderId]
  );
  if (!result.rows[0]) throw new ApiError(404, "lab_order_item_not_found", "Lab order item not found.");
  res.json(result.rows[0]);
}));

module.exports = router;
