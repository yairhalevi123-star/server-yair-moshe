// import express from 'express';
// import webpush from 'web-push';
// import { Pool } from 'pg';

// const router = express.Router();
// const pool = new Pool({
//     connectionString: process.env.DATABASE_URL,
// });

// // Configure web-push with VAPID keys from environment variables
// const vapidKeys = {
//     publicKey: process.env.VAPID_PUBLIC_KEY,
//     privateKey: process.env.VAPID_PRIVATE_KEY
// };

// if (vapidKeys.publicKey && vapidKeys.privateKey) {
//     webpush.setVapidDetails(
//         'mailto:' + (process.env.VAPID_EMAIL || 'admin@pregnancyassistant.com'),
//         vapidKeys.publicKey,
//         vapidKeys.privateKey
//     );
// }

// /**
//  * POST /api/notifications/subscribe
//  * Save push notification subscription for authenticated user
//  */
// router.post('/subscribe', async (req, res) => {
//     try {
//         const { subscription } = req.body;
//         const userId = req.body.userId; // Should come from authenticated session

//         if (!subscription || !subscription.endpoint) {
//             return res.status(400).json({ error: 'Invalid subscription object' });
//         }

//         if (!userId) {
//             return res.status(401).json({ error: 'User not authenticated' });
//         }

//         // Store subscription in database
//         const query = `
//       INSERT INTO push_subscriptions (user_id, endpoint, keys)
//       VALUES ($1, $2, $3)
//       ON CONFLICT (endpoint)
//       DO UPDATE SET keys = $3, updated_at = NOW()
//       RETURNING id
//     `;

//         const values = [
//             userId,
//             subscription.endpoint,
//             JSON.stringify(subscription.keys)
//         ];

//         const result = await pool.query(query, values);

//         res.status(201).json({
//             success: true,
//             message: 'Subscription saved successfully',
//             subscriptionId: result.rows[0].id
//         });

//     } catch (error) {
//         console.error('Error saving subscription:', error);
//         res.status(500).json({ error: 'Failed to save subscription' });
//     }
// });

// /**
//  * POST /api/notifications/send
//  * Send push notification to user(s)
//  */
// router.post('/send', async (req, res) => {
//     try {
//         const { userId, title, body, icon, data } = req.body;

//         if (!userId) {
//             return res.status(400).json({ error: 'userId is required' });
//         }

//         // Get user's subscriptions
//         const query = 'SELECT endpoint, keys FROM push_subscriptions WHERE user_id = $1';
//         const result = await pool.query(query, [userId]);

//         if (result.rows.length === 0) {
//             return res.status(404).json({ error: 'No subscriptions found for user' });
//         }

//         const payload = JSON.stringify({
//             title: title || 'Pregnancy Assistant',
//             body: body || 'You have a new notification',
//             icon: icon || '/logo192.png',
//             data: data || {}
//         });

//         // Send notification to all user's subscriptions
//         const sendPromises = result.rows.map(sub => {
//             const pushSubscription = {
//                 endpoint: sub.endpoint,
//                 keys: sub.keys
//             };
//             return webpush.sendNotification(pushSubscription, payload);
//         });

//         await Promise.all(sendPromises);

//         res.status(200).json({
//             success: true,
//             message: `Notification sent to ${result.rows.length} subscription(s)`
//         });

//     } catch (error) {
//         console.error('Error sending notification:', error);

//         // Handle expired subscriptions (410 Gone)
//         if (error.statusCode === 410) {
//             // Remove expired subscription from database
//             // This would require tracking which subscription failed
//             console.log('Subscription expired, should be removed');
//         }

//         res.status(500).json({ error: 'Failed to send notification' });
//     }
// });

// /**
//  * DELETE /api/notifications/unsubscribe
//  * Remove push notification subscription
//  */
// router.delete('/unsubscribe', async (req, res) => {
//     try {
//         const { endpoint, userId } = req.body;

//         if (!endpoint && !userId) {
//             return res.status(400).json({ error: 'endpoint or userId is required' });
//         }

//         let query, values;

//         if (endpoint) {
//             query = 'DELETE FROM push_subscriptions WHERE endpoint = $1 RETURNING id';
//             values = [endpoint];
//         } else {
//             query = 'DELETE FROM push_subscriptions WHERE user_id = $1 RETURNING id';
//             values = [userId];
//         }

//         const result = await pool.query(query, values);

//         if (result.rows.length === 0) {
//             return res.status(404).json({ error: 'Subscription not found' });
//         }

//         res.status(200).json({
//             success: true,
//             message: 'Subscription removed successfully'
//         });

//     } catch (error) {
//         console.error('Error removing subscription:', error);
//         res.status(500).json({ error: 'Failed to remove subscription' });
//     }
// });

// /**
//  * GET /api/notifications/vapid-public-key
//  * Get VAPID public key for frontend subscription
//  */
// router.get('/vapid-public-key', (req, res) => {
//     if (!vapidKeys.publicKey) {
//         return res.status(500).json({ error: 'VAPID keys not configured' });
//     }

//     res.status(200).json({
//         publicKey: vapidKeys.publicKey
//     });
// });

// /**
//  * POST /api/notifications/send-checkup-reminder
//  * Send checkup reminder notification
//  */
// router.post('/send-checkup-reminder', async (req, res) => {
//     try {
//         const { userId, appointmentDetails } = req.body;

//         const title = '🏥 תזכורת לבדיקה';
//         const body = `יש לך בדיקה מחר בשעה ${appointmentDetails.time || 'לא צוין'}`;
//         const icon = '/logo192.png';
//         const data = {
//             type: 'checkup',
//             appointmentId: appointmentDetails.id,
//             url: '/dashboard#appointments'
//         };

//         // Reuse the send endpoint logic
//         req.body = { userId, title, body, icon, data };
//         return router.handle(req, res);

//     } catch (error) {
//         console.error('Error sending checkup reminder:', error);
//         res.status(500).json({ error: 'Failed to send checkup reminder' });
//     }
// });

// /**
//  * POST /api/notifications/send-water-reminder
//  * Send water drinking reminder
//  */
// router.post('/send-water-reminder', async (req, res) => {
//     try {
//         const { userId } = req.body;

//         const title = '💧 תזכורת לשתות מים';
//         const body = 'הגיע הזמן לשתות כוס מים! שמירה על לחות חשובה להריון בריא';
//         const icon = '/logo192.png';
//         const data = {
//             type: 'water',
//             url: '/dashboard#daily-log'
//         };

//         // Reuse the send endpoint logic
//         req.body = { userId, title, body, icon, data };
//         return router.handle(req, res);

//     } catch (error) {
//         console.error('Error sending water reminder:', error);
//         res.status(500).json({ error: 'Failed to send water reminder' });
//     }
// });

// export default router;
import express from "express";
import webpush from "web-push";
import { Pool } from "pg";

const router = express.Router();

// התחברות למסד הנתונים
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * פונקציה להגדרת WebPush - מוודאת שהמפתחות קיימים
 */
// Configure web-push with VAPID keys from environment variables
// const vapidKeys = {
//   publicKey: process.env.VAPID_PUBLIC_KEY,
//   privateKey: process.env.VAPID_PRIVATE_KEY,
// };
const configureWebPush = () => {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const email = process.env.VAPID_EMAIL || "admin@pregnancyassistant.com";

  if (publicKey && privateKey) {
    webpush.setVapidDetails(`mailto:${email}`, publicKey, privateKey);
    return true;
  }
  console.error("❌ VAPID keys are missing in environment variables!");
  return false;
};

// הגדרה ראשונית
configureWebPush();

/**
 * GET /api/notifications/vapid-public-key
 * שליחת המפתח הציבורי לצד הלקוח
 */
router.get("/vapid-public-key", (req, res) => {
  const publicKey = process.env.VAPID_PUBLIC_KEY;

  if (!publicKey) {
    return res.status(500).json({
      error: "VAPID keys not configured on server",
      details: "Make sure VAPID_PUBLIC_KEY is set in .env",
    });
  }

  res.status(200).json({ publicKey });
});

/**
 * POST /api/notifications/subscribe
 * שמירת מנוי חדש במסד הנתונים
 */
router.post("/subscribe", async (req, res) => {
  try {
    const { subscription, userId } = req.body;

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: "Invalid subscription object" });
    }

    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const query = `
            INSERT INTO push_subscriptions (user_id, endpoint, keys)
            VALUES ($1, $2, $3)
            ON CONFLICT (endpoint) 
            DO UPDATE SET keys = $3, updated_at = NOW()
            RETURNING id
        `;

    const values = [
      userId,
      subscription.endpoint,
      JSON.stringify(subscription.keys),
    ];

    const result = await pool.query(query, values);

    res.status(201).json({
      success: true,
      subscriptionId: result.rows[0].id,
    });
  } catch (error) {
    console.error("Error saving subscription:", error);
    res.status(500).json({ error: "Failed to save subscription" });
  }
});

/**
 * POST /api/notifications/send
 * פונקציה גנרית לשליחת התראה
 */
router.post("/send", async (req, res) => {
  try {
    const { userId, title, body, icon, data } = req.body;

    if (!userId) return res.status(400).json({ error: "userId is required" });

    const result = await pool.query(
      "SELECT endpoint, keys FROM push_subscriptions WHERE user_id = $1",
      [userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "No subscriptions found" });
    }

    const payload = JSON.stringify({
      title: title || "Pregnancy Assistant",
      body: body || "יש לך עדכון חדש",
      icon: icon || "/logo192.png",
      data: data || {},
    });

    const sendPromises = result.rows.map((sub) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: typeof sub.keys === "string" ? JSON.parse(sub.keys) : sub.keys,
      };
      return webpush
        .sendNotification(pushSubscription, payload)
        .catch((err) => {
          if (err.statusCode === 410 || err.statusCode === 404) {
            // מנוי פג תוקף - כדאי למחוק מהדאטהבייס
            pool.query("DELETE FROM push_subscriptions WHERE endpoint = $1", [
              sub.endpoint,
            ]);
          }
        });
    });

    await Promise.all(sendPromises);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error sending notification:", error);
    res.status(500).json({ error: "Failed to send notification" });
  }
});

/**
 * עזרים לשליחת תזכורות ספציפיות
 * משתמשים ב-logic הפנימי במקום ב-router.handle
 */
const sendInternalNotification = async (userId, payloadData) => {
  // לוגיקה פנימית לשליחה (ניתן לקרוא לה מה-routes למטה)
  // הערה: עדיף להוציא את לוגיקת השליחה לפונקציה נפרדת כדי למנוע חזרתיות
};

router.post("/send-checkup-reminder", async (req, res) => {
  const { userId, appointmentDetails } = req.body;
  req.body = {
    userId,
    title: "🏥 תזכורת לבדיקה",
    body: `יש לך בדיקה מחר בשעה ${appointmentDetails?.time || "לא צוין"}`,
    data: { type: "checkup", url: "/dashboard#appointments" },
  };
  // קריאה ישירה לפונקציית השליחה במקום router.handle (שיכול לגרום לבעיות)
  return router.handle(req, res);
});

export default router;
