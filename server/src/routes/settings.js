const express = require("express");
const { query } = require("../db/pool");
const asyncHandler = require("../utils/asyncHandler");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();
router.use(requireAuth);

router.get("/settings", asyncHandler(async (req, res) => {
  const result = await query(`SELECT * FROM clinic_settings WHERE id = 1;`);
  if (!result.rows[0]) {
    return res.json({
      clinic_name: "TPPF Clinic",
      clinic_tagline: "Quality Healthcare & Occupational Services",
      clinic_address: "Bole, Addis Ababa, Ethiopia",
      clinic_phone: "+251 11 600 0000",
    });
  }
  res.json(result.rows[0]);
}));

router.put("/settings", asyncHandler(async (req, res) => {
  const { clinic_name, clinic_tagline, clinic_address, clinic_phone } = req.body;

  const result = await query(
    `INSERT INTO clinic_settings (id, clinic_name, clinic_tagline, clinic_address, clinic_phone, updated_at)
     VALUES (1, $1, $2, $3, $4, now())
     ON CONFLICT (id) DO UPDATE SET
       clinic_name = EXCLUDED.clinic_name,
       clinic_tagline = EXCLUDED.clinic_tagline,
       clinic_address = EXCLUDED.clinic_address,
       clinic_phone = EXCLUDED.clinic_phone,
       updated_at = now()
     RETURNING *;`,
    [
      clinic_name || "TPPF Clinic",
      clinic_tagline || "",
      clinic_address || "",
      clinic_phone || "",
    ]
  );

  res.json(result.rows[0]);
}));

module.exports = router;
