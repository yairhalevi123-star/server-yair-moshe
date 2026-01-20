import "dotenv/config";
import express from "express";
import { Pool } from "pg";
import bcrypt from "bcrypt";

const app = express();
const port = process.env.PORT || 3000;

// PostgreSQL connection pool
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
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

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    // 1. בדיקה האם המשתמש קיים ב-Database לפי האימייל
    const userResult = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email],
      console.log(email),
    );

    if (userResult.rows.length === 0) {
      // למען האבטחה, עדיף לא להגיד "האימייל לא קיים" אלא הודעה כללית
      return res.status(401).json({ message: "אימייל או סיסמה שגויים" });
    }

    const user = userResult.rows[0];

    // 2. השוואת הסיסמה שהוזנה לסיסמה המוצפנת (ה-Hash) ב-DB
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
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
app.post("/api/register", async (req, res) => {
  const { name, email, password, last_period_date } = req.body;

  try {
    // 1. הצפנת סיסמה
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // 2. חישוב תאריך לידה משוער (הוספת 280 יום לתאריך המחזור)
    const lmp = new Date(last_period_date);
    const dueDate = new Date(lmp);
    dueDate.setDate(lmp.getDate() + 280);
    const formattedDueDate = dueDate.toISOString().slice(0, 10); // Format to YYYY-MM-DD

    // 3. שמירה ל-Postgres
    const newUser = await pool.query(
      "INSERT INTO users (name, email, password_hash, last_period_date, due_date) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [name, email, passwordHash, last_period_date, formattedDueDate],
    );

    res.json(newUser.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
