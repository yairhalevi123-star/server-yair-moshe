// 1. טעינת dotenv בשורה הראשונה ממש ובצורה מיידית
import "dotenv/config";

// 2. עכשיו ייבוא שאר הספריות
import express from "express";
import { Pool } from "pg";
import bcrypt from "bcrypt";
import cors from "cors";
import morgan from "morgan";
import multer from "multer";
import OpenAI from "openai";
import path from "path";
import fs from "fs";

// 3. ייבוא ה-Routes (עכשיו הם יראו את ה-env)
import {
  uploadDocument,
  getUserDocuments,
  deleteDocument,
  viewDocument,
  downloadDocument,
  uploadMiddleware,
} from "./uploadRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";

// אין צורך לקרוא ל-config() יותר כי import "dotenv/config" כבר עשה זאת
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
const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1", // זה הקסם - הוא "מתחזה" ל-OpenAI
});
// Middleware
app.use(express.json());
app.use(morgan("dev"));

// Routes
app.use("/api/notifications", notificationRoutes);

// Example route to get users
app.get("/api/users", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM users");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("שגיאת שרת פנימית");
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
    res.status(500).send("שגיאת שרת פנימית");
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
app.post("/api/ai/chat", async (req, res) => {
  const { messages, currentWeek, userName, userId } = req.body;
  const { pageData, documents } = req.body;

  // 1. Initial Filtering
  const forbiddenPatterns = [/הימורים/i, /קריפטו/i, /פורנו/i];
  const lastUserMessage = messages[messages.length - 1].content;

  if (forbiddenPatterns.some((pattern) => pattern.test(lastUserMessage))) {
    return res.json({
      reply:
        "מצטער, איני יכול לענות על שאלות בנושא זה. אני כאן לליווי הריון בלבד.",
    });
  }

  try {
    // Build a richer system prompt that includes pageData and document list when provided
    let extraContext = "";
    if (pageData) {
      extraContext += `
        נתוני המשתמש: שם=${pageData.name}, שבוע=${pageData.currentWeek}, ימים לתוך השבוע=${pageData.daysIntoWeek}.
      `;
    }

    // If we have a userId, fetch DB information to include
    if (userId) {
      try {
        // fetch scheduled tests
        const testsRes = await pool.query(
          "SELECT title, is_completed, target_week FROM tests WHERE user_id = $1 ORDER BY target_week ASC LIMIT 10",
          [userId],
        );
        if (testsRes.rows.length > 0) {
          const testsSummary = testsRes.rows
            .map(
              (t) =>
                `${t.title} (שבוע ${t.target_week}) - ${t.is_completed ? "בוצע" : "ממתין"}`,
            )
            .join("; ");
          extraContext += `בדיקות מתוזמנות: ${testsSummary}. `;
        }

        // fetch upcoming appointments
        const apptsRes = await pool.query(
          "SELECT title, appointment_date, appointment_time FROM appointments WHERE user_id = $1 AND appointment_date >= CURRENT_DATE ORDER BY appointment_date ASC LIMIT 5",
          [userId],
        );
        if (apptsRes.rows.length > 0) {
          const apptSummary = apptsRes.rows
            .map(
              (a) =>
                `${a.title} ב-${new Date(a.appointment_date).toLocaleDateString()}${a.appointment_time ? ` בשעה ${a.appointment_time}` : ""}`,
            )
            .join("; ");
          extraContext += `פגישות קרובות: ${apptSummary}. `;
        }

        // fetch recent weight logs
        const weightsRes = await pool.query(
          "SELECT weight, recorded_date as date FROM weight_tracking WHERE user_id = $1 ORDER BY recorded_date DESC LIMIT 5",
          [userId],
        );
        if (weightsRes.rows.length > 0) {
          const weightsSummary = weightsRes.rows
            .map(
              (w) =>
                `${w.weight} ק"ג ב-${new Date(w.date).toLocaleDateString()}`,
            )
            .join("; ");
          extraContext += `נתוני משקל אחרונים: ${weightsSummary}. `;
        }

        // If client sent selected document ids, attempt to fetch small text contents
        if (documents && Array.isArray(documents) && documents.length > 0) {
          const docIds = documents.map((d) => d.id);
          const docsRes = await pool.query(
            "SELECT id, file_name, file_path FROM user_documents WHERE id = ANY($1) AND user_id = $2",
            [docIds, userId],
          );

          if (docsRes.rows.length > 0) {
            const docSummaries = [];
            for (const doc of docsRes.rows) {
              let note = doc.file_name;
              try {
                const absolute = path.isAbsolute(doc.file_path)
                  ? doc.file_path
                  : path.join(process.cwd(), doc.file_path);
                const ext = path.extname(absolute).toLowerCase();
                if ([".txt", ".md", ".json", ".csv"].includes(ext)) {
                  const content = fs.readFileSync(absolute, "utf8");
                  const excerpt = content.slice(0, 1000).replace(/\s+/g, " ");
                  note += ` - תוכן (קיצור): ${excerpt}`;
                } else {
                  note +=
                    " - סוג קובץ לא טקסטואלי, יש לבדוק את הקובץ למידע מפורט";
                }
              } catch (err) {
                console.error("Error reading document file:", err);
                note += " - לא ניתן לגשת לתוכן הקובץ";
              }
              docSummaries.push(note);
            }
            extraContext += `מסמכים נבחרים: ${docSummaries.join("; ")}. `;
          }
        }
      } catch (err) {
        console.error("DB fetch for AI chat failed:", err);
      }
    } else {
      if (documents && Array.isArray(documents) && documents.length > 0) {
        const docNames = documents.map((d) => d.name).join(", ");
        extraContext += ` רשימת מסמכים נבחרים: ${docNames}. `;
      }
    }

    const systemContent = `
            אתה עוזר מקצועי המלווה את ${userName} הנמצאת בשבוע ${currentWeek}.
            ${extraContext}
            
            חוקים קשיחים:
            1. ענה אך ורק על נושאי הריון, לידה ובריאות האישה.
            2. בנושאי בטיחות מזון (מה מותר לאכול): 
               - ענה תמיד בפורמט: [אייקון] שם המאכל: הסבר קצר.
               - אייקונים: ✅ (מותר), ⚠️ (בזהירות/מוגבל), ❌ (אסור).
               - אם המאכל אסור (כמו בשר נא או סושי דג נא), הסבר את הסיכון (למשל: ליסטריה או סלמונלה).
            3. ענה ישירות ובקצרה (עד 3 משפטים).
            4. אם המשתמשת שואלת על תסמינים מדאיגים (דימום, כאב חזק, ירידת מים), הנחה לפנות מיד למוקד רפואי או מיון נשים.
            5. שמור על טון אמפתי אך מקצועי.
          `;
    const response = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "system", content: systemContent }, ...messages],
      temperature: 0.3,
      max_tokens: 200,
    });

    res.json({ reply: response.choices[0].message.content });
  } catch (err) {
    console.error("AI Error:", err.message);
    res.status(500).json({ error: "חלה שגיאה." });
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
      message: "המשתמש נרשם והתוכנית נוצרה!",
      user: newUser.rows[0],
    });
  } catch (err) {
    await pool.query("ROLLBACK"); // ביטול הכל במקרה של שגיאה
    console.error(err.message);
    res.status(500).send("שגיאת שרת פנימית");
  }
});

// ============= KICK COUNTER ENDPOINTS =============
// Save a kick
app.post("/api/kicks/:userId", async (req, res) => {
  const { userId } = req.params;
  const { session_id } = req.body;

  try {
    // session_id can be null for initial kicks before session is created
    await pool.query(
      "INSERT INTO kicks (user_id, session_id, kick_time) VALUES ($1, $2, CURRENT_TIMESTAMP)",
      [userId, session_id],
    );
    res.json({ message: "הבעיטה נשמרה" });
  } catch (err) {
    console.error("Error recording kick:", err);
    res
      .status(500)
      .json({ message: "שגיאה בשמירת הבעיטה", error: err.message });
  }
});

// Save kick session
app.post("/api/kick-sessions/:userId", async (req, res) => {
  const { userId } = req.params;
  const { session_id, total_kicks, duration_seconds, session_date } = req.body;

  try {
    let result;

    // If session_id is provided, it's a final update
    if (session_id) {
      result = await pool.query(
        "UPDATE kick_sessions SET total_kicks = $1, duration_seconds = $2 WHERE id = $3 RETURNING *",
        [total_kicks, duration_seconds, session_id],
      );
    } else {
      // Otherwise, create a new session
      result = await pool.query(
        "INSERT INTO kick_sessions (user_id, session_date, total_kicks, duration_seconds) VALUES ($1, $2, 0, 0) RETURNING *",
        [userId, session_date],
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "הסשן לא נמצא" });
    }

    res.json({
      message: "הסשן נשמר",
      session_id: result.rows[0].id,
    });
  } catch (err) {
    console.error("Error saving kick session:", err);
    res.status(500).json({ message: "שגיאה בשמירת הסשן", error: err.message });
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
    res.status(500).send("שגיאת שרת פנימית");
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
// app.get("/api/weight/:userId", async (req, res) => {
//   const { userId } = req.params;

//   try {
//     const result = await pool.query(
//       "SELECT weight, recorded_date as date FROM weight_tracking WHERE user_id = $1 ORDER BY recorded_date ASC",
//       [userId],
//     );
//     res.json(result.rows);
//   } catch (err) {
//     console.error(err);
//     res.status(500).send("Server error");
//   }
// });
// Get weight history - מעודכן עם חישוב שבועות אוטומטי
app.get("/api/weight/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    const result = await pool.query(
      `SELECT 
        w.weight, 
        w.recorded_date as date,
        -- חישוב השבוע: הפרש הימים בין השקילה לווסת האחרונה חלקי 7
        FLOOR(EXTRACT(DAY FROM (w.recorded_date::timestamp - u.last_period_date::timestamp)) / 7) as week
      FROM weight_tracking w
      JOIN users u ON w.user_id = u.id
      WHERE w.user_id = $1 
      ORDER BY w.recorded_date ASC`,
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

// ============= APPOINTMENTS ENDPOINTS =============
// Create appointment
app.post("/api/appointments/:userId", async (req, res) => {
  const { userId } = req.params;
  const {
    title,
    description,
    appointment_date,
    appointment_time,
    category,
    location,
    notes,
  } = req.body;

  try {
    const result = await pool.query(
      "INSERT INTO appointments (user_id, title, description, appointment_date, appointment_time, category, location, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *",
      [
        userId,
        title,
        description,
        appointment_date,
        appointment_time || null,
        category,
        location,
        notes,
      ],
    );
    res.json({
      message: "הפגישה נוצרה בהצלחה",
      appointment: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "שגיאה ביצירת הפגישה",
      error: err.message,
    });
  }
});

// Get all appointments for a user
app.get("/api/appointments/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    const result = await pool.query(
      "SELECT * FROM appointments WHERE user_id = $1 ORDER BY appointment_date ASC",
      [userId],
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "שגיאה בשליפת הפגישות",
      error: err.message,
    });
  }
});

// Get appointments for a specific month
app.get("/api/appointments/:userId/month/:year/:month", async (req, res) => {
  const { userId, year, month } = req.params;
  const startDate = new Date(year, month - 1, 1).toISOString().split("T")[0];
  const endDate = new Date(year, month, 0).toISOString().split("T")[0];

  try {
    const result = await pool.query(
      "SELECT * FROM appointments WHERE user_id = $1 AND appointment_date BETWEEN $2 AND $3 ORDER BY appointment_date ASC",
      [userId, startDate, endDate],
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "שגיאה בשליפת הפגישות",
      error: err.message,
    });
  }
});

// Update appointment
app.put("/api/appointments/:appointmentId", async (req, res) => {
  const { appointmentId } = req.params;
  const {
    title,
    description,
    appointment_date,
    appointment_time,
    category,
    location,
    notes,
  } = req.body;

  try {
    const result = await pool.query(
      "UPDATE appointments SET title = $1, description = $2, appointment_date = $3, appointment_time = $4, category = $5, location = $6, notes = $7, updated_at = CURRENT_TIMESTAMP WHERE id = $8 RETURNING *",
      [
        title,
        description,
        appointment_date,
        appointment_time,
        category,
        location,
        notes,
        appointmentId,
      ],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "הפגישה לא נמצאה" });
    }

    res.json({
      message: "הפגישה עודכנה בהצלחה",
      appointment: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "שגיאה בעדכון הפגישה",
      error: err.message,
    });
  }
});

// Delete appointment
app.delete("/api/appointments/:appointmentId", async (req, res) => {
  const { appointmentId } = req.params;

  try {
    const result = await pool.query(
      "DELETE FROM appointments WHERE id = $1 RETURNING *",
      [appointmentId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "הפגישה לא נמצאה" });
    }

    res.json({
      message: "הפגישה נמחקה בהצלחה",
      appointment: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "שגיאה במחיקת הפגישה",
      error: err.message,
    });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
