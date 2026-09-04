/**
 * Automatic Department & Position Sorter
 * Maps and validates positions between 'Production' and 'Technic'.
 */

const PRODUCTION_POSITIONS = [
  'Automobile Driver',
  'Janitor',
  'Janitor Coordinator',
  'Machine Operator 1',
  'Machine Operator 2',
  'Production Foreman',
  'Production Section Head',
  'Production Supervisor',
  'Production Worker',
  'Versatile Production Worker',
];

const TECHNIC_POSITIONS = [
  'Electrical Engineer',
  'Electrician 1',
  'Janitor',
  'Mechanic 1',
  'Mechanic 2',
  'Mechanical Engineer',
  'Senior Electrician',
  'Senior Mechanic',
  'Senior Welder',
  'Technique Section Head',
  'Technician',
];

function isProductionPosition(posOrOcc) {
  if (!posOrOcc) return false;
  const p = posOrOcc.toString().trim().toLowerCase();
  return (
    p.includes('production') ||
    p.includes('machine operator') ||
    p.includes('automobile') ||
    p.includes('janitor coordinator') ||
    p.includes('janitor co-ordinator') ||
    p === 'janitor'
  );
}

function isTechnicPosition(posOrOcc) {
  if (!posOrOcc) return false;
  const p = posOrOcc.toString().trim().toLowerCase();
  return (
    p.includes('technic') ||
    p.includes('electric') ||
    p.includes('mechanic') ||
    p.includes('welder') ||
    p === 'technician'
  );
}

/**
 * Automatically sorts/resolves department for legacy or combined names.
 */
function resolveDepartment(dept, posOrOcc) {
  if (!dept) return dept;
  const d = dept.toString().trim();
  const lowerDept = d.toLowerCase();

  if (
    lowerDept === 'production and technic' ||
    lowerDept === 'production and technique' ||
    lowerDept === 'production & technic' ||
    lowerDept === 'production & technique'
  ) {
    if (isTechnicPosition(posOrOcc)) return 'Technic';
    return 'Production';
  }

  if (lowerDept === 'technician' || lowerDept === 'technique') {
    return 'Technic';
  }

  return d;
}

module.exports = {
  PRODUCTION_POSITIONS,
  TECHNIC_POSITIONS,
  isProductionPosition,
  isTechnicPosition,
  resolveDepartment,
};
