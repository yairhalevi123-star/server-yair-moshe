import express from "express";
import bcrypt from "bcrypt";

const router = express.Router();
let pool;

export const setPool = (dbPool) => {
  pool = dbPool;
};

// GET /api/settings/:userId - Fetch user settings
router.get("/:userId", async (req, res) => {
  const { userId } = req.params;

  // Validate userId
  if (!userId || userId === "null" || userId === "undefined") {
    return res.status(400).json({ error: "Invalid or missing user ID" });
  }

  try {
    // First, check if settings exist
    let result = await pool.query(
      "SELECT * FROM user_settings WHERE user_id = $1",
      [userId],
    );

    if (result.rows.length === 0) {
      // Create default settings if they don't exist
      const defaultResult = await pool.query(
        `INSERT INTO user_settings (user_id, pregnancy_type, language, dark_mode, water_reminder_interval)
         VALUES ($1, 'single', 'he', FALSE, 60)
         RETURNING *`,
        [userId],
      );
      return res.json(defaultResult.rows[0]);
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching settings:", error);
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

// PATCH /api/settings/:userId - Update user settings
router.patch("/:userId", async (req, res) => {
  const { userId } = req.params;
  const { pregnancy_type, language, dark_mode, water_reminder_interval } =
    req.body;

  // Validate userId
  if (!userId || userId === "null" || userId === "undefined") {
    return res.status(400).json({ error: "Invalid or missing user ID" });
  }

  try {
    // Validate water_reminder_interval
    if (water_reminder_interval && water_reminder_interval < 15) {
      return res
        .status(400)
        .json({ error: "Water reminder interval must be at least 15 minutes" });
    }

    const result = await pool.query(
      `UPDATE user_settings
       SET pregnancy_type = COALESCE($2, pregnancy_type),
           language = COALESCE($3, language),
           dark_mode = COALESCE($4, dark_mode),
           water_reminder_interval = COALESCE($5, water_reminder_interval),
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1
       RETURNING *`,
      [userId, pregnancy_type, language, dark_mode, water_reminder_interval],
    );

    if (result.rows.length === 0) {
      // If settings don't exist, create them with provided values
      const createResult = await pool.query(
        `INSERT INTO user_settings (user_id, pregnancy_type, language, dark_mode, water_reminder_interval)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          userId,
          pregnancy_type || "single",
          language || "he",
          dark_mode || false,
          water_reminder_interval || 60,
        ],
      );
      return res.json(createResult.rows[0]);
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating settings:", error);
    res.status(500).json({ error: "Failed to update settings" });
  }
});

// PATCH /api/settings/:userId/due-date - Update due date
router.patch("/:userId/due-date", async (req, res) => {
  const { userId } = req.params;
  const { due_date } = req.body;

  // Validate userId
  if (!userId || userId === "null" || userId === "undefined") {
    return res.status(400).json({ error: "Invalid or missing user ID" });
  }

  if (!due_date) {
    return res.status(400).json({ error: "due_date is required" });
  }

  try {
    const result = await pool.query(
      `UPDATE users
       SET due_date = $2
       WHERE id = $1
       RETURNING id, due_date, last_period_date`,
      [userId, due_date],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating due date:", error);
    res.status(500).json({ error: "Failed to update due date" });
  }
});

// GET /api/settings/:userId/pregnancy-week - Calculate pregnancy week
router.get("/:userId/pregnancy-week", async (req, res) => {
  const { userId } = req.params;

  // Validate userId
  if (!userId || userId === "null" || userId === "undefined") {
    return res.status(400).json({ error: "Invalid or missing user ID" });
  }

  try {
    const result = await pool.query(
      `SELECT last_period_date, due_date FROM users WHERE id = $1`,
      [userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const { last_period_date, due_date } = result.rows[0];

    if (!last_period_date) {
      return res.status(400).json({ error: "Last period date not set" });
    }

    // Calculate weeks since last period date
    const today = new Date();
    const lastPeriod = new Date(last_period_date);
    const weeksSincePeriod = Math.floor(
      (today - lastPeriod) / (7 * 24 * 60 * 60 * 1000),
    );

    // Calculate days until due date
    let daysUntilDue = null;
    if (due_date) {
      const dueDate = new Date(due_date);
      daysUntilDue = Math.ceil((dueDate - today) / (24 * 60 * 60 * 1000));
    }

    res.json({
      pregnancy_week: weeksSincePeriod,
      days_until_due: daysUntilDue,
      due_date: due_date,
    });
  } catch (error) {
    console.error("Error calculating pregnancy week:", error);
    res.status(500).json({ error: "Failed to calculate pregnancy week" });
  }
});

// DELETE /api/settings/:userId/account - Delete user account (with all related data)
router.delete("/:userId/account", async (req, res) => {
  const { userId } = req.params;
  const { confirmEmail } = req.body;

  // Validate userId
  if (!userId || userId === "null" || userId === "undefined") {
    return res.status(400).json({ error: "Invalid or missing user ID" });
  }

  try {
    // Fetch user to verify email confirmation
    const userResult = await pool.query(
      "SELECT email FROM users WHERE id = $1",
      [userId],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const { email } = userResult.rows[0];

    // Verify email confirmation matches
    if (confirmEmail !== email) {
      return res
        .status(400)
        .json({ error: "Email confirmation does not match" });
    }

    // Delete user and all related data (CASCADE will handle it)
    await pool.query("DELETE FROM users WHERE id = $1", [userId]);

    res.json({ message: "Account successfully deleted", userId });
  } catch (error) {
    console.error("Error deleting account:", error);
    res.status(500).json({ error: "Failed to delete account" });
  }
});

// PATCH /api/settings/:userId/change-password - Change user password
router.patch("/:userId/change-password", async (req, res) => {
  const { userId } = req.params;
  const { currentPassword, newPassword } = req.body;

  // Validate userId
  if (!userId || userId === "null" || userId === "undefined") {
    return res.status(400).json({ error: "Invalid or missing user ID" });
  }

  if (!currentPassword || !newPassword) {
    return res
      .status(400)
      .json({ error: "Current and new passwords are required" });
  }

  if (newPassword.length < 6) {
    return res
      .status(400)
      .json({ error: "New password must be at least 6 characters" });
  }

  try {
    // Fetch user with password hash
    const userResult = await pool.query(
      "SELECT id, password_hash FROM users WHERE id = $1",
      [userId],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = userResult.rows[0];

    // Verify current password
    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password_hash,
    );
    if (!isPasswordValid) {
      return res.status(401).json({ error: "הסיסמה הנוכחית אינה נכונה" });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await pool.query("UPDATE users SET password_hash = $2 WHERE id = $1", [
      userId,
      hashedPassword,
    ]);

    res.json({ message: "Password changed successfully" });
  } catch (error) {
    console.error("Error changing password:", error);
    res.status(500).json({ error: "Failed to change password" });
  }
});

export default router;
