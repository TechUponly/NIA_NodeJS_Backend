const { pool } = require("../config/database");

// --- DEPARTMENTS ---

const getDepartment = async (orgName, deptName) => {
  const query =
    "SELECT * FROM hrms_department_new WHERE org_name = ? AND department = ?";
  const [rows] = await pool.execute(query, [orgName, deptName]);
  return rows[0];
};

const addDepartment = async (orgName, deptName) => {
  const query =
    "INSERT INTO hrms_department_new (org_name, department) VALUES (?, ?)";
  const [result] = await pool.execute(query, [orgName, deptName]);
  return result;
};

// FIXED: Changed DISTINCT to GROUP BY to allow sorting by hidden ID
const getAllDepartments = async () => {
  const query =
    "SELECT department FROM hrms_department_new GROUP BY department ORDER BY MAX(id) DESC";
  const [rows] = await pool.execute(query);
  return rows;
};

const deleteDepartment = async (deptId, deptName) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    let targetName = deptName;
    if (deptId) {
      const [rows] = await connection.execute(
        "SELECT department FROM hrms_department_new WHERE id = ?",
        [deptId]
      );
      if (rows.length > 0) targetName = rows[0].department;
      else {
        await connection.release();
        return null;
      }
    }

    await connection.execute(
      `
      DELETE b FROM band b 
      INNER JOIN hrms_designation_new d ON b.designation = d.designation 
      WHERE d.department = ?
    `,
      [targetName]
    );

    await connection.execute(
      "DELETE FROM hrms_designation_new WHERE department = ?",
      [targetName]
    );
    const [res] = await connection.execute(
      "DELETE FROM hrms_department_new WHERE department = ?",
      [targetName]
    );

    await connection.commit();
    return res;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// --- DESIGNATIONS ---

const getDesignation = async (deptName, desigName) => {
  const query =
    "SELECT * FROM hrms_designation_new WHERE designation = ? AND department = ?";
  const [rows] = await pool.execute(query, [desigName, deptName]);
  return rows[0];
};

const addDesignation = async (deptName, desigName) => {
  const query =
    "INSERT INTO hrms_designation_new (designation, department) VALUES (?, ?)";
  const [result] = await pool.execute(query, [desigName, deptName]);
  return result;
};

const getAllDesignations = async () => {
  const query =
    "SELECT id, designation FROM hrms_designation_new GROUP BY id, designation ORDER BY designation ASC";
  const [rows] = await pool.execute(query);
  return rows;
};

const deleteDesignation = async (desigId, desigName, deptName) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    let targetName = desigName;
    if (desigId) {
      const [rows] = await connection.execute(
        "SELECT designation FROM hrms_designation_new WHERE id = ?",
        [desigId]
      );
      if (rows.length > 0) targetName = rows[0].designation;
      else {
        await connection.release();
        return null;
      }
    }

    await connection.execute("DELETE FROM band WHERE designation = ?", [
      targetName,
    ]);
    const [res] = await connection.execute(
      "DELETE FROM hrms_designation_new WHERE designation = ? AND department = ?",
      [targetName, deptName]
    );

    await connection.commit();
    return res;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// --- BANDS ---

// FIXED: Changed DISTINCT to GROUP BY to allow sorting by hidden ID
const getAllBands = async () => {
  const query =
    "SELECT band, probationary_period, notice_period FROM band GROUP BY band, probationary_period, notice_period ORDER BY MAX(id) DESC";
  const [rows] = await pool.execute(query);
  return rows;
};

const getBandListOnly = async () => {
  const query = "SELECT DISTINCT band FROM band ORDER BY band ASC";
  const [rows] = await pool.execute(query);
  return rows;
};

const addOrUpdateBand = async (data) => {
  const { designation, band, prob_period, notice_period } = data;

  const [existing] = await pool.execute(
    "SELECT * FROM band WHERE designation = ? AND band = ?",
    [designation, band]
  );

  if (existing.length > 0) {
    const record = existing[0];
    if (
      record.probationary_period !== prob_period ||
      record.notice_period !== notice_period
    ) {
      await pool.execute(
        "UPDATE band SET probationary_period = ?, notice_period = ? WHERE designation = ? AND band = ?",
        [prob_period, notice_period, designation, band]
      );
      return { action: "updated", data };
    }
    return { action: "exists", data: record };
  } else {
    await pool.execute(
      "INSERT INTO band (band, probationary_period, designation, notice_period) VALUES (?, ?, ?, ?)",
      [band, prob_period, designation, notice_period]
    );
    return { action: "inserted", data };
  }
};

module.exports = {
  getDepartment,
  addDepartment,
  getAllDepartments,
  deleteDepartment,
  getDesignation,
  addDesignation,
  getAllDesignations,
  deleteDesignation,
  getAllBands,
  getBandListOnly,
  addOrUpdateBand,
};
