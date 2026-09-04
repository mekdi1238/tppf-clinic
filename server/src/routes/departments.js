const express = require("express");
const { query, withTransaction } = require("../db/pool");
const asyncHandler = require("../utils/asyncHandler");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const { ApiError } = require("../middleware/errorHandler");
const { logAudit } = require("../services/auditLogger");

const router = express.Router();
router.use(requireAuth);

const SUPER_ADMIN_ONLY = requireRole("system_administrator");

/**
 * Helper to fetch a single department with its positions and record counts.
 */
async function fetchDepartmentById(clientOrPool, deptId) {
  const result = await clientOrPool.query(
    `SELECT d.id, d.name, d.display_order, d.created_at, d.updated_at,
            (SELECT COUNT(*)::int FROM patients p WHERE p.department = d.name) AS patient_count,
            (SELECT COUNT(*)::int FROM employee_registrations er WHERE er.department = d.name) AS registration_count,
            COALESCE(
              (
                SELECT json_agg(
                  json_build_object(
                    'id', p.id,
                    'department_id', p.department_id,
                    'name', p.name,
                    'display_order', p.display_order,
                    'created_at', p.created_at,
                    'updated_at', p.updated_at
                  ) ORDER BY p.display_order ASC, p.name ASC
                )
                FROM department_positions p
                WHERE p.department_id = d.id
              ),
              '[]'::json
            ) AS positions
     FROM departments d
     WHERE d.id = $1;`,
    [deptId]
  );
  return result.rows[0] || null;
}

// GET /departments — Accessible by all authenticated staff to populate dropdowns
router.get("/departments", asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT d.id, d.name, d.display_order, d.created_at, d.updated_at,
            (SELECT COUNT(*)::int FROM patients p WHERE p.department = d.name) AS patient_count,
            (SELECT COUNT(*)::int FROM employee_registrations er WHERE er.department = d.name) AS registration_count,
            COALESCE(
              (
                SELECT json_agg(
                  json_build_object(
                    'id', p.id,
                    'department_id', p.department_id,
                    'name', p.name,
                    'display_order', p.display_order,
                    'created_at', p.created_at,
                    'updated_at', p.updated_at
                  ) ORDER BY p.display_order ASC, p.name ASC
                )
                FROM department_positions p
                WHERE p.department_id = d.id
              ),
              '[]'::json
            ) AS positions
     FROM departments d
     ORDER BY d.display_order ASC, d.name ASC;`
  );
  res.json(result.rows);
}));

// GET /departments/:id — Get single department
router.get("/departments/:id", asyncHandler(async (req, res) => {
  const dept = await fetchDepartmentById(query, req.params.id);
  if (!dept) throw new ApiError(404, "department_not_found", "Department not found.");
  res.json(dept);
}));

// POST /departments — Create department (Super Admin Only)
router.post("/departments", SUPER_ADMIN_ONLY, asyncHandler(async (req, res) => {
  const { name, display_order = 0, positions = [] } = req.body;
  if (!name || !name.trim()) {
    throw new ApiError(422, "name_required", "Department name is required.");
  }
  const cleanName = name.trim();

  const existing = await query(
    `SELECT id FROM departments WHERE lower(name) = lower($1);`,
    [cleanName]
  );
  if (existing.rows[0]) {
    throw new ApiError(422, "department_exists", `Department '${cleanName}' already exists.`);
  }

  const dept = await withTransaction(async (client) => {
    const insertRes = await client.query(
      `INSERT INTO departments (name, display_order)
       VALUES ($1, $2)
       RETURNING *;`,
      [cleanName, Number(display_order) || 0]
    );
    const newDept = insertRes.rows[0];

    // Insert initial positions if provided
    if (Array.isArray(positions) && positions.length > 0) {
      let ord = 1;
      for (const pos of positions) {
        const posName = typeof pos === "string" ? pos.trim() : (pos.name ? pos.name.trim() : "");
        if (posName) {
          await client.query(
            `INSERT INTO department_positions (department_id, name, display_order)
             VALUES ($1, $2, $3)
             ON CONFLICT (department_id, name) DO NOTHING;`,
            [newDept.id, posName, ord++]
          );
        }
      }
    }

    return await fetchDepartmentById(client, newDept.id);
  });

  await logAudit(req, {
    action: "create",
    module: "departments",
    tableName: "departments",
    recordId: dept.id,
    description: `Created department '${dept.name}' with ${dept.positions.length} position(s)`,
    afterData: dept,
  });

  res.status(201).json(dept);
}));

// PUT /departments/:id — Update/Rename department & Cascade to all records (Super Admin Only)
router.put("/departments/:id", SUPER_ADMIN_ONLY, asyncHandler(async (req, res) => {
  const deptId = req.params.id;
  const currentDept = await fetchDepartmentById(query, deptId);
  if (!currentDept) throw new ApiError(404, "department_not_found", "Department not found.");

  const { name, display_order } = req.body;
  if (name !== undefined && (!name || !name.trim())) {
    throw new ApiError(422, "name_required", "Department name cannot be blank.");
  }

  const oldName = currentDept.name;
  const newName = name !== undefined ? name.trim() : oldName;
  const newOrder = display_order !== undefined ? Number(display_order) : currentDept.display_order;

  // If name changed, check uniqueness
  if (newName.toLowerCase() !== oldName.toLowerCase()) {
    const existing = await query(
      `SELECT id FROM departments WHERE lower(name) = lower($1) AND id != $2;`,
      [newName, deptId]
    );
    if (existing.rows[0]) {
      throw new ApiError(422, "department_exists", `Department '${newName}' already exists.`);
    }
  }

  const updatedDept = await withTransaction(async (client) => {
    // 1. Update department table
    await client.query(
      `UPDATE departments
       SET name = $1, display_order = $2, updated_at = now()
       WHERE id = $3;`,
      [newName, newOrder, deptId]
    );

    // 2. If department name changed, cascade update across all related tables
    if (newName !== oldName) {
      // Patients
      await client.query(
        `UPDATE patients SET department = $1 WHERE department = $2;`,
        [newName, oldName]
      );
      // Pre-employment Registrations
      await client.query(
        `UPDATE employee_registrations SET department = $1 WHERE department = $2;`,
        [newName, oldName]
      );
      // Users
      await client.query(
        `UPDATE users SET department = $1 WHERE department = $2;`,
        [newName, oldName]
      );
      // Clinic staff
      await client.query(
        `UPDATE clinic_staff SET department = $1 WHERE department = $2;`,
        [newName, oldName]
      );
    }

    return await fetchDepartmentById(client, deptId);
  });

  await logAudit(req, {
    action: "update",
    module: "departments",
    tableName: "departments",
    recordId: deptId,
    description: newName !== oldName
      ? `Renamed department '${oldName}' to '${newName}' and updated all associated patient and employee records`
      : `Updated department '${newName}' details`,
    beforeData: currentDept,
    afterData: updatedDept,
  });

  res.json(updatedDept);
}));

// DELETE /departments/:id — Delete department with safe reassignment check (Super Admin Only)
router.delete("/departments/:id", SUPER_ADMIN_ONLY, asyncHandler(async (req, res) => {
  const deptId = req.params.id;
  const currentDept = await fetchDepartmentById(query, deptId);
  if (!currentDept) throw new ApiError(404, "department_not_found", "Department not found.");

  const { reassign_to_id, reassign_to_name } = req.body || {};

  await withTransaction(async (client) => {
    let targetName = null;
    if (reassign_to_id) {
      const targetDept = await client.query(`SELECT name FROM departments WHERE id = $1;`, [reassign_to_id]);
      if (!targetDept.rows[0]) throw new ApiError(422, "target_dept_not_found", "Reassignment target department not found.");
      targetName = targetDept.rows[0].name;
    } else if (reassign_to_name && reassign_to_name.trim()) {
      targetName = reassign_to_name.trim();
    }

    const patientCount = Number(currentDept.patient_count) || 0;
    const regCount = Number(currentDept.registration_count) || 0;

    if ((patientCount > 0 || regCount > 0) && !targetName) {
      throw new ApiError(
        422,
        "department_in_use",
        `Department '${currentDept.name}' has ${patientCount} patient(s) and ${regCount} registration(s). Please choose a department to reassign them to before deleting.`
      );
    }

    if (targetName) {
      await client.query(`UPDATE patients SET department = $1 WHERE department = $2;`, [targetName, currentDept.name]);
      await client.query(`UPDATE employee_registrations SET department = $1 WHERE department = $2;`, [targetName, currentDept.name]);
      await client.query(`UPDATE users SET department = $1 WHERE department = $2;`, [targetName, currentDept.name]);
      await client.query(`UPDATE clinic_staff SET department = $1 WHERE department = $2;`, [targetName, currentDept.name]);
    }

    // Delete department (cascades to department_positions)
    await client.query(`DELETE FROM departments WHERE id = $1;`, [deptId]);
  });

  await logAudit(req, {
    action: "delete",
    module: "departments",
    tableName: "departments",
    recordId: deptId,
    description: `Deleted department '${currentDept.name}'`,
    beforeData: currentDept,
  });

  res.json({ success: true, message: `Department '${currentDept.name}' deleted successfully.` });
}));

// POST /departments/:id/positions — Add position to department (Super Admin Only)
router.post("/departments/:id/positions", SUPER_ADMIN_ONLY, asyncHandler(async (req, res) => {
  const deptId = req.params.id;
  const dept = await fetchDepartmentById(query, deptId);
  if (!dept) throw new ApiError(404, "department_not_found", "Department not found.");

  const { name, display_order = 0 } = req.body;
  if (!name || !name.trim()) {
    throw new ApiError(422, "position_name_required", "Position name is required.");
  }
  const cleanPos = name.trim();

  const existing = await query(
    `SELECT id FROM department_positions WHERE department_id = $1 AND lower(name) = lower($2);`,
    [deptId, cleanPos]
  );
  if (existing.rows[0]) {
    throw new ApiError(422, "position_exists", `Position '${cleanPos}' already exists in ${dept.name}.`);
  }

  const result = await query(
    `INSERT INTO department_positions (department_id, name, display_order)
     VALUES ($1, $2, $3)
     RETURNING *;`,
    [deptId, cleanPos, Number(display_order) || 0]
  );

  const newPos = result.rows[0];
  await logAudit(req, {
    action: "create",
    module: "departments",
    tableName: "department_positions",
    recordId: newPos.id,
    description: `Added position '${newPos.name}' to department '${dept.name}'`,
    afterData: newPos,
  });

  res.status(201).json(newPos);
}));

// PUT /departments/:id/positions/:posId — Rename/Edit position (Super Admin Only)
router.put("/departments/:id/positions/:posId", SUPER_ADMIN_ONLY, asyncHandler(async (req, res) => {
  const { id: deptId, posId } = req.params;
  const dept = await fetchDepartmentById(query, deptId);
  if (!dept) throw new ApiError(404, "department_not_found", "Department not found.");

  const currentPosRes = await query(
    `SELECT * FROM department_positions WHERE id = $1 AND department_id = $2;`,
    [posId, deptId]
  );
  const currentPos = currentPosRes.rows[0];
  if (!currentPos) throw new ApiError(404, "position_not_found", "Position not found in this department.");

  const { name, display_order } = req.body;
  if (name !== undefined && (!name || !name.trim())) {
    throw new ApiError(422, "position_name_required", "Position name cannot be blank.");
  }

  const oldPosName = currentPos.name;
  const newPosName = name !== undefined ? name.trim() : oldPosName;
  const newOrder = display_order !== undefined ? Number(display_order) : currentPos.display_order;

  if (newPosName.toLowerCase() !== oldPosName.toLowerCase()) {
    const existing = await query(
      `SELECT id FROM department_positions WHERE department_id = $1 AND lower(name) = lower($2) AND id != $3;`,
      [deptId, newPosName, posId]
    );
    if (existing.rows[0]) {
      throw new ApiError(422, "position_exists", `Position '${newPosName}' already exists in ${dept.name}.`);
    }
  }

  const updatedPos = await withTransaction(async (client) => {
    const res = await client.query(
      `UPDATE department_positions
       SET name = $1, display_order = $2, updated_at = now()
       WHERE id = $3
       RETURNING *;`,
      [newPosName, newOrder, posId]
    );

    // Cascade position rename to patients and employee_registrations within this department
    if (newPosName !== oldPosName) {
      await client.query(
        `UPDATE patients
         SET position = $1
         WHERE department = $2 AND position = $3;`,
        [newPosName, dept.name, oldPosName]
      );
      await client.query(
        `UPDATE employee_registrations
         SET position = $1
         WHERE department = $2 AND position = $3;`,
        [newPosName, dept.name, oldPosName]
      );
      await client.query(
        `UPDATE clinic_staff
         SET position = $1
         WHERE department = $2 AND position = $3;`,
        [newPosName, dept.name, oldPosName]
      );
    }

    return res.rows[0];
  });

  await logAudit(req, {
    action: "update",
    module: "departments",
    tableName: "department_positions",
    recordId: posId,
    description: newPosName !== oldPosName
      ? `Renamed position in '${dept.name}' from '${oldPosName}' to '${newPosName}' (updated related records)`
      : `Updated position '${newPosName}' in '${dept.name}'`,
    beforeData: currentPos,
    afterData: updatedPos,
  });

  res.json(updatedPos);
}));

// DELETE /departments/:id/positions/:posId — Delete position (Super Admin Only)
router.delete("/departments/:id/positions/:posId", SUPER_ADMIN_ONLY, asyncHandler(async (req, res) => {
  const { id: deptId, posId } = req.params;
  const dept = await fetchDepartmentById(query, deptId);
  if (!dept) throw new ApiError(404, "department_not_found", "Department not found.");

  const currentPosRes = await query(
    `SELECT * FROM department_positions WHERE id = $1 AND department_id = $2;`,
    [posId, deptId]
  );
  const currentPos = currentPosRes.rows[0];
  if (!currentPos) throw new ApiError(404, "position_not_found", "Position not found in this department.");

  await query(`DELETE FROM department_positions WHERE id = $1;`, [posId]);

  await logAudit(req, {
    action: "delete",
    module: "departments",
    tableName: "department_positions",
    recordId: posId,
    description: `Deleted position '${currentPos.name}' from department '${dept.name}'`,
    beforeData: currentPos,
  });

  res.json({ success: true, message: `Position '${currentPos.name}' deleted successfully.` });
}));

module.exports = router;
