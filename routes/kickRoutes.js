import express from "express";
import { Pool } from "pg";

const router = express.Router();

let pool;

export const setPool = (dbPool) => {
  pool = dbPool;
};

// POST - Save a new kick session
router.post("/:userId", async (req, res) => {
  const { userId } = req.params;
  const { start_time, end_time, total_kicks, intensity, session_notes } =
    req.body;

  try {
    // Calculate duration in seconds
    const startTime = new Date(start_time);
    const endTime = new Date(end_time);
    const durationSeconds = Math.round((endTime - startTime) / 1000);

    const result = await pool.query(
      `INSERT INTO kick_sessions 
       (user_id, session_date, start_time, end_time, total_kicks, duration_seconds, intensity, session_notes) 
       VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7) 
       RETURNING *`,
      [
        userId,
        startTime,
        endTime,
        total_kicks,
        durationSeconds,
        intensity,
        session_notes,
      ],
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Error saving kick session:", err);
    res.status(500).json({ error: "Failed to save kick session" });
  }
});

// GET - Fetch kick sessions for user
router.get("/:userId", async (req, res) => {
  const { userId } = req.params;
  const limit = req.query.limit || 30;

  try {
    const result = await pool.query(
      `SELECT * FROM kick_sessions 
       WHERE user_id = $1 
       ORDER BY session_date DESC, start_time DESC 
       LIMIT $2`,
      [userId, limit],
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching kick sessions:", err);
    res.status(500).json({ error: "Failed to fetch kick sessions" });
  }
});

// GET - AI Analysis of kick patterns
router.get("/:userId/analyze", async (req, res) => {
  const { userId } = req.params;

  try {
    // Fetch last 7-10 sessions
    const sessionsResult = await pool.query(
      `SELECT * FROM kick_sessions 
       WHERE user_id = $1 
       ORDER BY session_date DESC, start_time DESC 
       LIMIT 10`,
      [userId],
    );

    const sessions = sessionsResult.rows;

    if (sessions.length === 0) {
      return res.json({
        insights: [
          "התחילי בהקלדת מספר בעיטות כדי לקבל תובנות על דפוסי הפעילות של התינוק.",
          "כל סשן עוזר לנו להבין טוב יותר את קצב התנועה של הבייבי שלך.",
          "אני כאן כדי ללוות אותך בכל שלב של ההריון.",
        ],
      });
    }

    // Format sessions for AI analysis
    const sessionsText = sessions
      .reverse()
      .map(
        (session) => `
${new Date(session.start_time).toLocaleString("he-IL")}: 
  בעיטות: ${session.total_kicks}, 
  משך: ${Math.round(session.duration_seconds / 60)} דקות, 
  עוצמה: ${session.intensity}/5, 
  הערות: ${session.session_notes || "ללא"}`,
      )
      .join("\n");

    const prompt = `את מאומת להיות מלווה הריון תמיכה חם וחסר שיפוט.
בהתבסס על נתוני הבעיטות של הנשה מהימים האחרונים, אנא זהי את שעות הפעילות הגבוהה של התינוק, אם יש דפוס עקבי, ותן 2-3 משפטים חמים ותומכים.
כתוב בעברית בלבד.

נתוני בעיטות:
${sessionsText}

אנא ספק 2-3 משפטים קצרים וחמים בעברית בלבד:`;

    // Call Groq API
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            {
              role: "system",
              content:
                "You are a warm, supportive pregnancy wellness assistant. Respond in Hebrew only. Be empathetic and encouraging.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          max_tokens: 200,
          temperature: 0.7,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.statusText}`);
    }

    const data = await response.json();
    const responseText =
      data.choices[0]?.message?.content || "לא הצלחתי לנתח את הנתונים כרגע.";

    res.json({
      insights: responseText,
      sessionsCount: sessions.length,
    });
  } catch (err) {
    console.error("Error analyzing kick sessions:", err);
    res.status(500).json({
      error: "Failed to analyze kick sessions",
      insights:
        "אתם עושות עבודה מדהימה בהעקבת הבעיטות של התינוק. המשיכו להקליד נתונים וההתבנות יתפתחו בהדרגה.",
    });
  }
});

export default router;
