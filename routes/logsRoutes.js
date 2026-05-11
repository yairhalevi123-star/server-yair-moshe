import express from "express";
import { Pool } from "pg";

const router = express.Router();

let pool;

export const setPool = (dbPool) => {
  pool = dbPool;
};

// GET - Fetch last 30 days of logs
router.get("/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    const result = await pool.query(
      `SELECT * FROM logs 
       WHERE user_id = $1 AND log_date <= CURRENT_DATE
       ORDER BY log_date DESC 
       LIMIT 30`,
      [userId],
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching logs:", err);
    res.status(500).json({ error: "Failed to fetch logs" });
  }
});

// POST - AI Analysis of logs
router.post("/:userId/analyze", async (req, res) => {
  const { userId } = req.params;

  try {
    const logsResult = await pool.query(
      `SELECT weight, water_intake, mood, notes, log_date FROM logs 
       WHERE user_id = $1 AND log_date <= CURRENT_DATE
       ORDER BY log_date DESC 
       LIMIT 7`,
      [userId],
    );

    const logs = logsResult.rows;

    if (logs.length === 0) {
      return res.json({
        insights: [
          "התחילי בהקלדת נתונים יומיים - אפילו נתון אחד ליום עוזר!",
          "רגע נוח להתחיל יומן הוא בבוקר או בערב כחלק מהשגרה.",
          "כל נתון שתכניסי עוזר להבנה טובה יותר של בריאותך במהלך ההיריון.",
        ],
      });
    }

    // תיקון קריטי: המרת התאריכים לטקסט פשוט לפני השליחה ל-AI
    const logsText = logs
      .map((log) => {
        // המרת התאריך לפורמט קריא DD/MM/YYYY
        const dateStr =
          log.log_date instanceof Date
            ? log.log_date.toLocaleDateString("he-IL")
            : log.log_date;

        return `תאריך: ${dateStr}, משקל: ${log.weight || "לא הוזן"} ק"ג, מים: ${log.water_intake || "לא הוזן"} מ"ל, מצב רוח: ${log.mood || "לא הוזן"}, הערות: ${log.notes || "אין"}`;
      })
      .join("\n");

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          // עדכון המודל לגרסה החדשה והנתמכת
          model: "llama-3.3-70b-versatile",
          messages: [
            {
              role: "system",
              content:
                "You are a warm, supportive pregnancy wellness assistant. Respond in Hebrew only. Always provide 3 short bullet points starting with '•'.",
            },
            {
              role: "user",
              content: `נתחי את נתוני ההיריון הבאים וספקי 3 תובנות תומכות:\n${logsText}`,
            },
          ],
          max_tokens: 500,
          temperature: 0.7,
        }),
      },
    );

    // לוג לבדיקה אם Groq מחזיר שגיאה ספציפית
    if (!response.ok) {
      const errorData = await response.json();
      console.error(
        "Groq API Error Detail:",
        JSON.stringify(errorData, null, 2),
      );
      throw new Error(`Groq API error: ${response.statusText}`);
    }

    const data = await response.json();
    const responseText = data.choices[0]?.message?.content || "";

    // Parse bullet points
    const insights = responseText
      .split("\n")
      .filter((line) => line.trim().includes("•"))
      .map((line) => line.replace(/^[^•]*•\s*/, "").trim())
      .slice(0, 3);

    res.json({
      insights:
        insights.length >= 3
          ? insights
          : [
              "כל הכבוד על המעקב היומי!",
              "הקפידי על שתייה מספקת של מים.",
              "זכרי לנוח ולהקשיב לגוף שלך.",
            ],
      logsCount: logs.length,
    });
  } catch (err) {
    console.error("Full Error details:", err);
    res.status(500).json({ error: "Failed to analyze logs" });
  }
});
export default router;
