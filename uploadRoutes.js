import express from "express";
import upload from "./upload.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Handle document upload
export const uploadDocument = async (req, res, pool) => {
  const { userId } = req.params;

  if (!req.file) {
    return res.status(400).json({ message: "לא נבחר קובץ" });
  }

  const filePath = req.file.path;
  const fileName = req.file.originalname;

  try {
    const result = await pool.query(
      "INSERT INTO user_documents (user_id, file_name, file_path, uploaded_at) VALUES ($1, $2, $3, NOW()) RETURNING *",
      [userId, fileName, filePath],
    );

    res.status(201).json({
      message: "הקובץ הועלה בהצלחה",
      document: result.rows[0],
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ message: "שגיאה בשמירת הקובץ במסד הנתונים" });
  }
};

// Get all documents for a user
export const getUserDocuments = async (req, res, pool) => {
  const { userId } = req.params;

  try {
    const result = await pool.query(
      "SELECT * FROM user_documents WHERE user_id = $1 ORDER BY uploaded_at DESC",
      [userId],
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Fetch error:", err);
    res.status(500).json({ message: "שגיאה בשליפת המסמכים" });
  }
};

// Delete a document
export const deleteDocument = async (req, res, pool) => {
  const { userId, documentId } = req.params;

  try {
    const result = await pool.query(
      "DELETE FROM user_documents WHERE id = $1 AND user_id = $2 RETURNING *",
      [documentId, userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "המסמך לא נמצא" });
    }

    // Optional: Delete file from disk
    // fs.unlinkSync(result.rows[0].file_path);

    res.json({ message: "המסמך נמחק בהצלחה" });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ message: "שגיאה במחיקת המסמך" });
  }
};

// View a document
export const viewDocument = async (req, res, pool) => {
  const { documentId } = req.params;

  try {
    const result = await pool.query(
      "SELECT * FROM user_documents WHERE id = $1",
      [documentId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "המסמך לא נמצא" });
    }

    const document = result.rows[0];
    let filePath = document.file_path;

    // Convert to absolute path if relative
    if (!path.isAbsolute(filePath)) {
      filePath = path.join(__dirname, filePath);
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "הקובץ לא נמצא בשרת" });
    }

    res.sendFile(filePath);
  } catch (err) {
    console.error("View error:", err);
    res.status(500).json({ message: "שגיאה בצפייה במסמך" });
  }
};

// Download a document
export const downloadDocument = async (req, res, pool) => {
  const { documentId } = req.params;

  try {
    const result = await pool.query(
      "SELECT * FROM user_documents WHERE id = $1",
      [documentId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "המסמך לא נמצא" });
    }

    const document = result.rows[0];
    let filePath = document.file_path;

    // Convert to absolute path if relative
    if (!path.isAbsolute(filePath)) {
      filePath = path.join(__dirname, filePath);
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "הקובץ לא נמצא בשרת" });
    }

    res.download(filePath, document.file_name);
  } catch (err) {
    console.error("Download error:", err);
    res.status(500).json({ message: "שגיאה בהורדת המסמך" });
  }
};

export const uploadMiddleware = upload.single("document");

export default router;
