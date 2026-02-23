import express from "express";
import { Pool } from "pg";

const router = express.Router();

// Initialize pool (will be passed from server.js or use environment variables)
let pool;

export const setPool = (dbPool) => {
  pool = dbPool;
};

// Default hospital bag items
const DEFAULT_ITEMS = [
  { text: "תעודת זהות וכרטיס מעקב היריון", category: "מסמכים" },
  { text: "תוכנית לידה מודפסת", category: "מסמכים" },
  { text: "בקבוק מים עם פיית ספורט", category: "לאמא" },
  { text: "שפתון לחות (וזלין)", category: "לאמא" },
  { text: "בגדים נוחים לשחרור", category: "לאמא" },
  { text: "חליפה ראשונה לבייבי", category: "לבייבי" },
  { text: "חיתולי טטרה", category: "לבייבי" },
  { text: "סלקל מותקן ברכב", category: "לבייבי" },
];

// GET - Fetch user's hospital bag items, auto-seed if new user
router.get("/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    // Check if user has any items
    const result = await pool.query(
      "SELECT * FROM hospital_bag_items WHERE user_id = $1 ORDER BY created_at ASC",
      [userId],
    );

    // If no items exist, seed with defaults
    if (result.rows.length === 0) {
      const defaultValues = DEFAULT_ITEMS.map((item, index) => ({
        id: `${userId}-${index}`,
        user_id: userId,
        text: item.text,
        category: item.category,
        checked: false,
      }));

      for (const item of defaultValues) {
        await pool.query(
          "INSERT INTO hospital_bag_items (user_id, text, category, checked) VALUES ($1, $2, $3, $4)",
          [item.user_id, item.text, item.category, item.checked],
        );
      }

      // Return newly seeded items
      const seededResult = await pool.query(
        "SELECT * FROM hospital_bag_items WHERE user_id = $1 ORDER BY created_at ASC",
        [userId],
      );
      return res.json(seededResult.rows);
    }

    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching hospital bag items:", err);
    res.status(500).json({ error: "Failed to fetch hospital bag items" });
  }
});

// PATCH - Toggle checked status
router.patch("/:userId/:itemId", async (req, res) => {
  const { userId, itemId } = req.params;

  try {
    // First get current state
    const currentResult = await pool.query(
      "SELECT checked FROM hospital_bag_items WHERE id = $1 AND user_id = $2",
      [itemId, userId],
    );

    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    const newChecked = !currentResult.rows[0].checked;

    // Update the item
    const updateResult = await pool.query(
      "UPDATE hospital_bag_items SET checked = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3 RETURNING *",
      [newChecked, itemId, userId],
    );

    res.json(updateResult.rows[0]);
  } catch (err) {
    console.error("Error updating hospital bag item:", err);
    res.status(500).json({ error: "Failed to update item" });
  }
});

// POST - Add custom item
router.post("/:userId", async (req, res) => {
  const { userId } = req.params;
  const { text, category } = req.body;

  if (!text || !category) {
    return res.status(400).json({ error: "Text and category are required" });
  }

  try {
    const result = await pool.query(
      "INSERT INTO hospital_bag_items (user_id, text, category, checked) VALUES ($1, $2, $3, FALSE) RETURNING *",
      [userId, text, category],
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Error adding hospital bag item:", err);
    res.status(500).json({ error: "Failed to add item" });
  }
});

// DELETE - Remove custom item
router.delete("/:userId/:itemId", async (req, res) => {
  const { userId, itemId } = req.params;

  try {
    const result = await pool.query(
      "DELETE FROM hospital_bag_items WHERE id = $1 AND user_id = $2 RETURNING *",
      [itemId, userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    res.json({ message: "Item deleted successfully" });
  } catch (err) {
    console.error("Error deleting hospital bag item:", err);
    res.status(500).json({ error: "Failed to delete item" });
  }
});

export default router;
