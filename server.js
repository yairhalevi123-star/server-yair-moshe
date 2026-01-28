// ייבוא קבצים וספריות נדרשות
// import "dotenv/config";
import { config } from "dotenv";
import express from "express";
import { Pool } from "pg";
import bcrypt from "bcrypt";
import cors from "cors";
import morgan from "morgan";
import multer from "multer";
import path from "path";
import {
  uploadDocument,
  getUserDocuments,
  deleteDocument,
  viewDocument,
  downloadDocument,
  uploadMiddleware,
} from "./uploadRoutes.js";

config(); // טוען משתני סביבה מקובץ .env
const app = express();
// אפשרות CORS לשרת Express
app.use(cors());

const port = process.env.PORT || 3000;
const defaultTests = [
  { title: "בדיקת דם והורמונים", category: "בדיקות דם", target_week: 7 },
  { title: "שקיפות עורפית", category: "אולטרסאונד", target_week: 11 },
  { title: "סקירת מערכות מוקדמת", category: "אולטרסאונד", target_week: 15 },
  { title: "חלבון עוברי", category: "בדיקות דם", target_week: 17 },
  { title: "סקירת מערכות מאוחרת", category: "אולטרסאונד", target_week: 22 },
  { title: "בדיקת העמסת סוכר", category: "בדיקות דם", target_week: 24 },
];
// PostgreSQL connection pool
// const pool = new Pool({
//   host: process.env.DB_HOST,
//   port: process.env.DB_PORT,
//   database: process.env.DB_NAME,
//   user: process.env.DB_USER,
//   password: process.env.DB_PASSWORD,
// });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    return console.error("Error acquiring client", err.stack);
  }
  console.log("Connected to PostgreSQL database");
  release();
});

// Middleware
app.use(express.json());
app.use(morgan("dev"));

// Example route to get users
app.get("/api/users", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM users");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});
// Route to get tests for a specific user
app.get("/api/user/tests/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("SELECT * FROM tests WHERE user_id = $1", [
      id,
    ]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// הגדרת מקום השמירה ושם הקובץ
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/"); // וודא שקיימת תיקייה כזו בשרת
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname); // מניעת כפילויות בשמות
  },
});

const upload = multer({ storage: storage });

// נתיב להעלאת קובץ
app.post("/api/upload/:userId", uploadMiddleware, async (req, res) => {
  uploadDocument(req, res, pool);
});

// נתיב לשליפת קבצים של משתמשת ספציפית (אבטחה!)
app.get("/api/documents/:userId", async (req, res) => {
  getUserDocuments(req, res, pool);
});

// View a document
app.get("/api/documents/view/:documentId", async (req, res) => {
  viewDocument(req, res, pool);
});

// Download a document
app.get("/api/documents/download/:documentId", async (req, res) => {
  downloadDocument(req, res, pool);
});

// Delete a document
app.delete("/api/documents/:userId/:documentId", async (req, res) => {
  deleteDocument(req, res, pool);
});

// נתיב להוספת לוג יומי
app.post("/api/logs/:userId", async (req, res) => {
  const { userId } = req.params;
  const { weight, water_intake, mood, notes } = req.body;
  const log_date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  try {
    await pool.query(
      "INSERT INTO logs (user_id, log_date, weight, water_intake, mood, notes) VALUES ($1, $2, $3, $4, $5, $6)",
      [userId, log_date, weight, water_intake, mood, notes],
    );
    res.json({ message: "הלוג נשמר בהצלחה" });
  } catch (err) {
    console.error(err);
    res.status(500).send("שגיאה בשמירת הלוג");
  }
});

// Login route
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    // 1. בדיקה האם המשתמש קיים ב-Database לפי האימייל
    const userResult = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email],
    );

    if (userResult.rows.length === 0) {
      // למען האבטחה, עדיף לא להגיד "האימייל לא קיים" אלא הודעה כללית
      return res.status(401).json({ message: "אימייל או סיסמה שגויים" });
    }

    const user = userResult.rows[0];

    // 2. השוואת הסיסמה שהוזנה לסיסמה המוצפנת (ה-Hash) ב-DB
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      // למען האבטחה, עדיף לא להגיד "הסיסמה שגויה" אלא הודעה כללית
      return res.status(401).json({ message: "אימייל או סיסמה שגויים" });
    }

    // 3. הצלחה! מחזירים ל-React את ה-UUID ואת פרטי המשתמש
    // בשלב הבא תוכל להוסיף כאן יצירת JWT Token
    res.json({
      message: "התחברת בהצלחה!",
      user: {
        id: user.id, // זה ה-UUID
        name: user.name,
        email: user.email,
        dueDate: user.due_date,
      },
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("שגיאת שרת פנימית");
  }
});

// Route to get pregnancy status for a specific user
app.get("/api/user/status/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // 1. שליפת המשתמשת מה-Postgres
    const user = await pool.query(
      "SELECT last_period_date, name FROM users WHERE id = $1",
      [id],
    );

    if (user.rows.length === 0) {
      return res.status(404).json("User not found");
    }

    const lmp = new Date(user.rows[0].last_period_date);
    const today = new Date();

    // 2. חישוב ההפרש בימים
    const diffInTime = today.getTime() - lmp.getTime();
    const diffInDays = Math.floor(diffInTime / (1000 * 3600 * 24));

    // 3. חישוב שבועות וימים
    const currentWeek = Math.floor(diffInDays / 7);
    const extraDays = diffInDays % 7;

    // 4. שליחת התשובה ל-React
    res.json({
      name: user.rows[0].name,
      currentWeek: currentWeek,
      daysIntoWeek: extraDays,
      totalDays: diffInDays,
      trimester: currentWeek <= 13 ? 1 : currentWeek <= 26 ? 2 : 3,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});
app.patch("/api/user/tests/:testId", async (req, res) => {
  const { testId } = req.params;
  const { is_completed } = req.body;

  try {
    await pool.query("UPDATE tests SET is_completed = $1 WHERE id = $2", [
      is_completed,
      testId,
    ]);
    res.json({ message: "סטטוס הבדיקה עודכן" });
  } catch (err) {
    console.error(err);
    res.status(500).send("שגיאת שרת");
  }
});
app.post("/api/register", async (req, res) => {
  const { name, email, password, last_period_date } = req.body;

  try {
    // התחלת טרנזקציה
    await pool.query("BEGIN");

    // 1. יצירת המשתמשת (כמו שעשית קודם)
    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = await pool.query(
      "INSERT INTO users (name, email, password_hash, last_period_date) VALUES ($1, $2, $3, $4) RETURNING *",
      [name, email, passwordHash, last_period_date],
    );

    const userId = newUser.rows[0].id;

    // 2. לוגיקה חכמה: הזרקת בדיקות אוטומטית
    // אנחנו רצים על המערך שהגדרנו למעלה ומכניסים כל בדיקה ל-DB
    for (const test of defaultTests) {
      await pool.query(
        "INSERT INTO tests (user_id, title, category, target_week) VALUES ($1, $2, $3, $4)",
        [userId, test.title, test.category, test.target_week],
      );
    }

    // סיום מוצלח של הטרנזקציה
    await pool.query("COMMIT");

    res.json({
      message: "User registered and plan created!",
      user: newUser.rows[0],
    });
  } catch (err) {
    await pool.query("ROLLBACK"); // ביטול הכל במקרה של שגיאה
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// ============= KICK COUNTER ENDPOINTS =============
// Save a kick
app.post("/api/kicks/:userId", async (req, res) => {
  const { userId } = req.params;
  const { session_id, kick_count } = req.body;

  try {
    await pool.query(
      "INSERT INTO kicks (user_id, session_id, kick_time, kick_count) VALUES ($1, $2, CURRENT_TIMESTAMP, $3)",
      [userId, session_id, kick_count],
    );
    res.json({ message: "Kick recorded" });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// Save kick session
app.post("/api/kick-sessions/:userId", async (req, res) => {
  const { userId } = req.params;
  const { session_id, total_kicks, duration_seconds } = req.body;

  try {
    const result = await pool.query(
      "INSERT INTO kick_sessions (user_id, total_kicks, duration_seconds) VALUES ($1, $2, $3) RETURNING *",
      [userId, total_kicks, duration_seconds],
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// Get kick history
app.get("/api/kicks/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    const result = await pool.query(
      "SELECT * FROM kick_sessions WHERE user_id = $1 ORDER BY session_date DESC LIMIT 10",
      [userId],
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// ============= WEIGHT TRACKING ENDPOINTS =============
// Save weight
app.post("/api/weight/:userId", async (req, res) => {
  const { userId } = req.params;
  const { weight, date } = req.body;

  try {
    const result = await pool.query(
      "INSERT INTO weight_tracking (user_id, weight, recorded_date) VALUES ($1, $2, $3) RETURNING *",
      [userId, weight, new Date(date).toISOString().split("T")[0]],
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// Get weight history
app.get("/api/weight/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    const result = await pool.query(
      "SELECT weight, recorded_date as date FROM weight_tracking WHERE user_id = $1 ORDER BY recorded_date ASC",
      [userId],
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// ============= CONTRACTIONS TRACKING ENDPOINTS =============
// Save contraction
app.post("/api/contractions/:userId", async (req, res) => {
  const { userId } = req.params;
  const { start_time, duration_seconds, interval_minutes } = req.body;

  try {
    const result = await pool.query(
      "INSERT INTO contractions (user_id, start_time, duration_seconds, interval_minutes) VALUES ($1, $2, $3, $4) RETURNING *",
      [userId, start_time, duration_seconds, interval_minutes],
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// Get contractions history
app.get("/api/contractions/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    const result = await pool.query(
      "SELECT * FROM contractions WHERE user_id = $1 ORDER BY start_time DESC LIMIT 20",
      [userId],
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
