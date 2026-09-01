
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mysql = require("mysql2/promise");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const webpush = require("web-push");

dotenv.config();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// ==========================================
// BASIC SETUP
// ==========================================

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

const publicPath = path.join(__dirname, "public");
const uploadsPath = path.join(publicPath, "uploads");

if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(uploadsPath, {
        recursive: true
    });
}

app.use(express.static(publicPath));

// ==========================================
// MYSQL
// ==========================================

const MYSQL_HOST = process.env.MYSQLHOST;
const MYSQL_PORT = Number(process.env.MYSQLPORT) || 3306;
const MYSQL_USER = process.env.MYSQLUSER;
const MYSQL_PASSWORD = process.env.MYSQLPASSWORD;
const MYSQL_DATABASE = process.env.MYSQLDATABASE;

console.log("==========================================");
console.log("MYSQL CONFIG");
console.log("HOST:", MYSQL_HOST || "MISSING");
console.log("PORT:", MYSQL_PORT);
console.log("USER:", MYSQL_USER || "MISSING");
console.log(
    "PASSWORD EXISTS:",
    Boolean(MYSQL_PASSWORD)
);
console.log(
    "PASSWORD LENGTH:",
    MYSQL_PASSWORD
        ? MYSQL_PASSWORD.length
        : 0
);
console.log(
    "DATABASE:",
    MYSQL_DATABASE || "MISSING"
);
console.log("==========================================");

if (
    !MYSQL_HOST ||
    !MYSQL_USER ||
    !MYSQL_PASSWORD ||
    !MYSQL_DATABASE
) {
    console.error(
        "❌ MYSQL ENVIRONMENT VARIABLES ARE MISSING!"
    );
}

const db = mysql.createPool({
    host: MYSQL_HOST,
    port: MYSQL_PORT,
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    database: MYSQL_DATABASE,

    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// ==========================================
// WEB PUSH CONFIGURATION
// ==========================================

const VAPID_PUBLIC_KEY =
    process.env.VAPID_PUBLIC_KEY;

const VAPID_PRIVATE_KEY =
    process.env.VAPID_PRIVATE_KEY;

const VAPID_SUBJECT =
    process.env.VAPID_SUBJECT ||
    "mailto:admin@example.com";

if (
    VAPID_PUBLIC_KEY &&
    VAPID_PRIVATE_KEY
) {

    webpush.setVapidDetails(
        VAPID_SUBJECT,
        VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY
    );

    console.log(
        "✅ Web Push VAPID configured"
    );

} else {

    console.warn(
        "⚠️ VAPID keys are missing."
    );

    console.warn(
        "Push notifications will not work until VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are added."
    );
}

// ==========================================
// DATABASE TEST + PUSH TABLE
// ==========================================

async function initializeDatabase() {

    try {

        const connection =
            await db.getConnection();

        console.log(
            "✅ MySQL connected successfully!"
        );

        connection.release();

        // --------------------------------------
        // Push subscriptions table
        // --------------------------------------

        await db.execute(`
            CREATE TABLE IF NOT EXISTS push_subscriptions (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                user_id INT NOT NULL,
                endpoint TEXT NOT NULL,
                p256dh TEXT NOT NULL,
                auth TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                INDEX idx_push_user_id (user_id)
            )
        `);

        console.log(
            "✅ Push subscriptions table ready"
        );

    } catch (error) {

        console.error(
            "❌ Database initialization failed!"
        );

        console.error(
            "Code:",
            error.code
        );

        console.error(
            "Message:",
            error.message
        );
    }
}

initializeDatabase();

// ==========================================
// PUSH HELPERS
// ==========================================

function pushIsConfigured() {

    return Boolean(
        VAPID_PUBLIC_KEY &&
        VAPID_PRIVATE_KEY
    );
}

async function savePushSubscription(
    userId,
    subscription
) {

    if (
        !userId ||
        !subscription ||
        !subscription.endpoint ||
        !subscription.keys
    ) {
        return false;
    }

    const p256dh =
        subscription.keys.p256dh;

    const auth =
        subscription.keys.auth;

    if (!p256dh || !auth) {
        return false;
    }

    try {

        // Remove an older subscription
        // with the same endpoint first.
        await db.execute(
            `
            DELETE FROM push_subscriptions
            WHERE endpoint = ?
            `,
            [
                subscription.endpoint
            ]
        );

        await db.execute(
            `
            INSERT INTO push_subscriptions
            (
                user_id,
                endpoint,
                p256dh,
                auth
            )
            VALUES (?, ?, ?, ?)
            `,
            [
                Number(userId),
                subscription.endpoint,
                p256dh,
                auth
            ]
        );

        return true;

    } catch (error) {

        console.error(
            "Save push subscription error:",
            error.message
        );

        return false;
    }
}

async function removePushSubscription(
    endpoint
) {

    if (!endpoint) {
        return;
    }

    try {

        await db.execute(
            `
            DELETE FROM push_subscriptions
            WHERE endpoint = ?
            `,
            [endpoint]
        );

    } catch (error) {

        console.error(
            "Remove push subscription error:",
            error.message
        );
    }
}

async function sendPushToUser(
    userId,
    payload
) {

    if (!pushIsConfigured()) {

        console.warn(
            "Push skipped: VAPID is not configured."
        );

        return;
    }

    userId = Number(userId);

    if (!userId) {
        return;
    }

    try {

        const [subscriptions] =
            await db.execute(
                `
                SELECT
                    id,
                    endpoint,
                    p256dh,
                    auth
                FROM push_subscriptions
                WHERE user_id = ?
                `,
                [userId]
            );

        if (
            subscriptions.length === 0
        ) {
            return;
        }

        const payloadString =
            JSON.stringify(payload);

        for (
            const subscription
            of subscriptions
        ) {

            const pushSubscription = {
                endpoint:
                    subscription.endpoint,

                keys: {
                    p256dh:
                        subscription.p256dh,

                    auth:
                        subscription.auth
                }
            };

            try {

                await webpush.sendNotification(
                    pushSubscription,
                    payloadString
                );

            } catch (error) {

                console.error(
                    "Push send error:",
                    error.statusCode,
                    error.message
                );

                // Subscription expired / invalid.
                if (
                    error.statusCode === 404 ||
                    error.statusCode === 410
                ) {

                    await removePushSubscription(
                        subscription.endpoint
                    );
                }
            }
        }

    } catch (error) {

        console.error(
            "sendPushToUser error:",
            error
        );
    }
}

// ==========================================
// PUBLIC KEY
// ==========================================

app.get(
    "/api/push/public-key",
    (req, res) => {

        if (!VAPID_PUBLIC_KEY) {

            return res.status(503).json({
                success: false,
                message:
                    "Push notifications are not configured"
            });
        }

        res.json({
            success: true,
            publicKey:
                VAPID_PUBLIC_KEY
        });
    }
);

// ==========================================
// SAVE PUSH SUBSCRIPTION
// ==========================================

app.post(
    "/api/push/subscribe",
    async (req, res) => {

        try {

            const userId =
                Number(req.body.userId);

            const subscription =
                req.body.subscription;

            if (!userId) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid user ID"
                });
            }

            if (
                !subscription ||
                !subscription.endpoint ||
                !subscription.keys
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid push subscription"
                });
            }

            const saved =
                await savePushSubscription(
                    userId,
                    subscription
                );

            if (!saved) {

                return res.status(500).json({
                    success: false,
                    message:
                        "Could not save subscription"
                });
            }

            res.json({
                success: true,
                message:
                    "Push subscription saved"
            });

        } catch (error) {

            console.error(
                "Push subscribe error:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Server error"
            });
        }
    }
);

// ==========================================
// UNSUBSCRIBE
// ==========================================

app.post(
    "/api/push/unsubscribe",
    async (req, res) => {

        try {

            const subscription =
                req.body.subscription;

            if (
                !subscription ||
                !subscription.endpoint
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid subscription"
                });
            }

            await removePushSubscription(
                subscription.endpoint
            );

            res.json({
                success: true
            });

        } catch (error) {

            console.error(
                "Push unsubscribe error:",
                error
            );

            res.status(500).json({
                success: false
            });
        }
    }
);

// ==========================================
// PUSH STATUS
// ==========================================

app.get(
    "/api/push/status/:userId",
    async (req, res) => {

        try {

            const userId =
                Number(req.params.userId);

            if (!userId) {

                return res.status(400).json({
                    success: false
                });
            }

            const [rows] =
                await db.execute(
                    `
                    SELECT COUNT(*) AS count
                    FROM push_subscriptions
                    WHERE user_id = ?
                    `,
                    [userId]
                );

            res.json({
                success: true,
                configured:
                    pushIsConfigured(),
                subscribed:
                    Number(rows[0].count) > 0
            });

        } catch (error) {

            console.error(
                "Push status error:",
                error
            );

            res.status(500).json({
                success: false
            });
        }
    }
);

// ==========================================
// MULTER STORAGE
// ==========================================

const storage = multer.diskStorage({

    destination: function (
        req,
        file,
        cb
    ) {

        cb(
            null,
            uploadsPath
        );
    },

    filename: function (
        req,
        file,
        cb
    ) {

        const ext =
            path
                .extname(
                    file.originalname
                )
                .toLowerCase();

        const uniqueName =
            Date.now() +
            "-" +
            Math.round(
                Math.random() * 1e9
            ) +
            ext;

        cb(
            null,
            uniqueName
        );
    }
});

// ==========================================
// FILE FILTER
// ==========================================

function fileFilter(
    req,
    file,
    cb
) {

    const allowedTypes = [

        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/gif",
        "image/webp",

        "video/mp4",
        "video/webm",
        "video/ogg",
        "video/quicktime",

        "audio/webm",
        "audio/ogg",
        "audio/mp4",
        "audio/mpeg",
        "audio/wav",
        "audio/x-wav",
        "audio/aac"
    ];

    if (
        allowedTypes.includes(
            file.mimetype
        )
    ) {

        cb(
            null,
            true
        );

    } else {

        cb(
            new Error(
                "Only image, video and audio files are allowed"
            )
        );
    }
}

// ==========================================
// UPLOAD
// ==========================================

const upload = multer({

    storage,

    fileFilter,

    limits: {
        fileSize:
            1000 * 1024 * 1024
    }
});

// ==========================================
// ONLINE USERS
// ==========================================

const onlineUsers = new Map();

// ==========================================
// TYPING
// ==========================================

const typingTimers = new Map();

function getTypingKey(
    senderId,
    receiverId
) {

    return `${senderId}-${receiverId}`;
}

function clearTypingTimer(
    senderId,
    receiverId
) {

    const key =
        getTypingKey(
            senderId,
            receiverId
        );

    const timer =
        typingTimers.get(key);

    if (timer) {

        clearTimeout(timer);

        typingTimers.delete(key);
    }
}

// ==========================================
// CALLS
// ==========================================

const activeCalls = new Map();

function getCallKey(
    user1,
    user2
) {

    const a =
        Number(user1);

    const b =
        Number(user2);

    return a < b
        ? `${a}-${b}`
        : `${b}-${a}`;
}

function isAllowedPair(
    user1,
    user2
) {

    const a =
        Number(user1);

    const b =
        Number(user2);

    return (
        (a === 1 && b === 2) ||
        (a === 2 && b === 1)
    );
}

function getSocketByUserId(
    userId
) {

    return onlineUsers.get(
        Number(userId)
    );
}

// ==========================================
// LOGIN
// ==========================================

app.post(
    "/api/login",
    async (req, res) => {

        try {

            const {
                username,
                pin
            } = req.body;

            if (
                !username ||
                !pin
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Username and PIN are required"
                });
            }

            const [users] =
                await db.execute(
                    `
                    SELECT
                        id,
                        username
                    FROM users
                    WHERE
                        username = ?
                        AND pin = ?
                    LIMIT 1
                    `,
                    [
                        username,
                        pin
                    ]
                );

            if (
                users.length === 0
            ) {

                return res.status(401).json({
                    success: false,
                    message:
                        "Username or PIN is incorrect"
                });
            }

            const user =
                users[0];

            res.json({
                success: true,

                user: {
                    id:
                        user.id,

                    username:
                        user.username
                }
            });

        } catch (error) {

            console.error(
                "Login error:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Server error"
            });
        }
    }
);

// ==========================================
// GET MESSAGES
// ==========================================

app.get(
    "/api/messages/:userId/:otherUserId",
    async (req, res) => {

        try {

            const userId =
                Number(
                    req.params.userId
                );

            const otherUserId =
                Number(
                    req.params.otherUserId
                );

            if (
                !userId ||
                !otherUserId
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid users"
                });
            }

            if (
                !isAllowedPair(
                    userId,
                    otherUserId
                )
            ) {

                return res.status(403).json({
                    success: false,
                    message:
                        "Users are not allowed"
                });
            }

            const [messages] =
                await db.execute(
                    `
                    SELECT
                        id,
                        sender_id,
                        receiver_id,
                        message,
                        media_type,
                        media_url,
                        created_at,
                        seen
                    FROM messages
                    WHERE
                        (
                            sender_id = ?
                            AND receiver_id = ?
                        )
                        OR
                        (
                            sender_id = ?
                            AND receiver_id = ?
                        )
                    ORDER BY id ASC
                    `,
                    [
                        userId,
                        otherUserId,
                        otherUserId,
                        userId
                    ]
                );

            res.json({
                success: true,
                messages
            });

        } catch (error) {

            console.error(
                "Get messages error:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Server error"
            });
        }
    }
);

// ==========================================
// UPLOAD MEDIA / VOICE
// ==========================================

app.post(
    "/api/upload",
    upload.single("media"),
    async (req, res) => {

        try {

            if (!req.file) {

                return res.status(400).json({
                    success: false,
                    message:
                        "No file selected"
                });
            }

            const senderId =
                Number(
                    req.body.senderId
                );

            const receiverId =
                Number(
                    req.body.receiverId
                );

            if (
                !senderId ||
                !receiverId
            ) {

                fs.unlink(
                    req.file.path,
                    () => {}
                );

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid users"
                });
            }

            if (
                !isAllowedPair(
                    senderId,
                    receiverId
                )
            ) {

                fs.unlink(
                    req.file.path,
                    () => {}
                );

                return res.status(403).json({
                    success: false,
                    message:
                        "Users are not allowed"
                });
            }

            let mediaType =
                "file";

            if (
                req.file.mimetype.startsWith(
                    "image/"
                )
            ) {

                mediaType =
                    "image";

            } else if (
                req.file.mimetype.startsWith(
                    "video/"
                )
            ) {

                mediaType =
                    "video";

            } else if (
                req.file.mimetype.startsWith(
                    "audio/"
                )
            ) {

                mediaType =
                    "voice";
            }

            const mediaUrl =
                "/uploads/" +
                req.file.filename;

            const [result] =
                await db.execute(
                    `
                    INSERT INTO messages
                    (
                        sender_id,
                        receiver_id,
                        message,
                        media_type,
                        media_url
                    )
                    VALUES (?, ?, ?, ?, ?)
                    `,
                    [
                        senderId,
                        receiverId,
                        "",
                        mediaType,
                        mediaUrl
                    ]
                );

            const messageData = {

                id:
                    result.insertId,

                sender_id:
                    senderId,

                receiver_id:
                    receiverId,

                message:
                    "",

                media_type:
                    mediaType,

                media_url:
                    mediaUrl,

                created_at:
                    new Date(),

                seen:
                    0
            };

            const senderSocketId =
                onlineUsers.get(
                    senderId
                );

            if (
                senderSocketId
            ) {

                io.to(
                    senderSocketId
                ).emit(
                    "new-message",
                    messageData
                );
            }

            const receiverSocketId =
                onlineUsers.get(
                    receiverId
                );

            if (
                receiverSocketId
            ) {

                io.to(
                    receiverSocketId
                ).emit(
                    "new-message",
                    messageData
                );

            } else {

                // ----------------------------------
                // PUSH FOR OFFLINE USER
                // ----------------------------------

                let title =
                    "💬 پەیامێکی نوێ";

                let body =
                    "پەیامێکی نوێت هەیە";

                if (
                    mediaType === "image"
                ) {

                    body =
                        "🖼️ وێنەیەکی نوێت هەیە";

                } else if (
                    mediaType === "video"
                ) {

                    body =
                        "🎥 ڤیدیۆیەکی نوێت هەیە";

                } else if (
                    mediaType === "voice"
                ) {

                    body =
                        "🎤 دەنگێکی نوێت هەیە";
                }

                await sendPushToUser(
                    receiverId,
                    {
                        type:
                            "message",

                        title,

                        body,

                        url:
                            "/",

                        chatUrl:
                            "/",

                        senderId,

                        tag:
                            `message-${senderId}-${receiverId}`
                    }
                );
            }

            res.json({
                success: true,
                message:
                    messageData
            });

        } catch (error) {

            console.error(
                "Upload error:",
                error
            );

            if (
                req.file &&
                req.file.path
            ) {

                fs.unlink(
                    req.file.path,
                    () => {}
                );
            }

            res.status(500).json({
                success: false,
                message:
                    "Upload failed"
            });
        }
    }
);

// ==========================================
// USER STATUS
// ==========================================

app.get(
    "/api/user/:userId/status",
    async (req, res) => {

        try {

            const userId =
                Number(
                    req.params.userId
                );

            if (!userId) {

                return res.status(400).json({
                    success: false
                });
            }

            const [users] =
                await db.execute(
                    `
                    SELECT
                        id,
                        username,
                        online,
                        last_seen
                    FROM users
                    WHERE id = ?
                    LIMIT 1
                    `,
                    [userId]
                );

            if (
                users.length === 0
            ) {

                return res.status(404).json({
                    success: false
                });
            }

            const user =
                users[0];

            user.online =
                onlineUsers.has(
                    userId
                )
                    ? 1
                    : 0;

            res.json({
                success: true,
                user
            });

        } catch (error) {

            console.error(
                "User status error:",
                error
            );

            res.status(500).json({
                success: false
            });
        }
    }
);

// ==========================================
// SOCKET.IO
// ==========================================

io.on(
    "connection",
    socket => {

        console.log(
            "Socket connected:",
            socket.id
        );

        // ======================================
        // USER ONLINE
        // ======================================

        socket.on(
            "user-online",
            async userId => {

                userId =
                    Number(userId);

                if (!userId) {
                    return;
                }

                onlineUsers.set(
                    userId,
                    socket.id
                );

                socket.userId =
                    userId;

                try {

                    await db.execute(
                        `
                        UPDATE users
                        SET online = 1
                        WHERE id = ?
                        `,
                        [userId]
                    );

                } catch (error) {

                    console.error(
                        "Online update error:",
                        error.message
                    );
                }

                io.emit(
                    "user-status",
                    {
                        userId,
                        online: true
                    }
                );
            }
        );

        // ======================================
        // TYPING
        // ======================================

        socket.on(
            "typing",
            data => {

                const senderId =
                    Number(
                        data.senderId
                    );

                const receiverId =
                    Number(
                        data.receiverId
                    );

                if (
                    !senderId ||
                    !receiverId
                ) {
                    return;
                }

                if (
                    !isAllowedPair(
                        senderId,
                        receiverId
                    )
                ) {
                    return;
                }

                clearTypingTimer(
                    senderId,
                    receiverId
                );

                const receiverSocketId =
                    onlineUsers.get(
                        receiverId
                    );

                if (
                    receiverSocketId
                ) {

                    io.to(
                        receiverSocketId
                    ).emit(
                        "typing",
                        {
                            userId:
                                senderId
                        }
                    );
                }

                const timer =
                    setTimeout(
                        () => {

                            const receiverSocket =
                                onlineUsers.get(
                                    receiverId
                                );

                            if (
                                receiverSocket
                            ) {

                                io.to(
                                    receiverSocket
                                ).emit(
                                    "stop-typing",
                                    {
                                        userId:
                                            senderId
                                    }
                                );
                            }

                            typingTimers.delete(
                                getTypingKey(
                                    senderId,
                                    receiverId
                                )
                            );

                        },
                        1600
                    );

                typingTimers.set(
                    getTypingKey(
                        senderId,
                        receiverId
                    ),
                    timer
                );
            }
        );

        // ======================================
        // STOP TYPING
        // ======================================

        socket.on(
            "stop-typing",
            data => {

                const senderId =
                    Number(
                        data.senderId
                    );

                const receiverId =
                    Number(
                        data.receiverId
                    );

                if (
                    !senderId ||
                    !receiverId
                ) {
                    return;
                }

                clearTypingTimer(
                    senderId,
                    receiverId
                );

                const receiverSocketId =
                    onlineUsers.get(
                        receiverId
                    );

                if (
                    receiverSocketId
                ) {

                    io.to(
                        receiverSocketId
                    ).emit(
                        "stop-typing",
                        {
                            userId:
                                senderId
                        }
                    );
                }
            }
        );

        // ======================================
        // SEND TEXT MESSAGE
        // ======================================

        socket.on(
            "send-message",
            async data => {

                try {

                    const senderId =
                        Number(
                            data.senderId
                        );

                    const receiverId =
                        Number(
                            data.receiverId
                        );

                    const message =
                        String(
                            data.message || ""
                        ).trim();

                    if (
                        !senderId ||
                        !receiverId ||
                        !message
                    ) {
                        return;
                    }

                    if (
                        !isAllowedPair(
                            senderId,
                            receiverId
                        )
                    ) {
                        return;
                    }

                    clearTypingTimer(
                        senderId,
                        receiverId
                    );

                    const receiverSocketId =
                        onlineUsers.get(
                            receiverId
                        );

                    if (
                        receiverSocketId
                    ) {

                        io.to(
                            receiverSocketId
                        ).emit(
                            "stop-typing",
                            {
                                userId:
                                    senderId
                            }
                        );
                    }

                    const [result] =
                        await db.execute(
                            `
                            INSERT INTO messages
                            (
                                sender_id,
                                receiver_id,
                                message,
                                media_type,
                                media_url
                            )
                            VALUES (?, ?, ?, NULL, NULL)
                            `,
                            [
                                senderId,
                                receiverId,
                                message
                            ]
                        );

                    const messageData = {

                        id:
                            result.insertId,

                        sender_id:
                            senderId,

                        receiver_id:
                            receiverId,

                        message,

                        media_type:
                            null,

                        media_url:
                            null,

                        created_at:
                            new Date(),

                        seen:
                            0
                    };

                    socket.emit(
                        "new-message",
                        messageData
                    );

                    if (
                        receiverSocketId
                    ) {

                        io.to(
                            receiverSocketId
                        ).emit(
                            "new-message",
                            messageData
                        );

                    } else {

                        // ----------------------------------
                        // PUSH FOR OFFLINE USER
                        // ----------------------------------

                        await sendPushToUser(
                            receiverId,
                            {
                                type:
                                    "message",

                                title:
                                    "💬 پەیامێکی نوێ",

                                body:
                                    message.length > 120
                                        ? message.substring(
                                              0,
                                              117
                                          ) + "..."
                                        : message,

                                url:
                                    "/",

                                chatUrl:
                                    "/",

                                senderId,

                                tag:
                                    `message-${senderId}-${receiverId}`
                            }
                        );
                    }

                } catch (error) {

                    console.error(
                        "Send message error:",
                        error
                    );
                }
            }
        );

        // ======================================
        // MESSAGES SEEN
        // ======================================

        socket.on(
            "messages-seen",
            async data => {

                try {

                    const userId =
                        Number(
                            data.userId
                        );

                    const otherUserId =
                        Number(
                            data.otherUserId
                        );

                    if (
                        !userId ||
                        !otherUserId
                    ) {
                        return;
                    }

                    if (
                        !isAllowedPair(
                            userId,
                            otherUserId
                        )
                    ) {
                        return;
                    }

                    await db.execute(
                        `
                        UPDATE messages
                        SET seen = 1
                        WHERE
                            sender_id = ?
                            AND receiver_id = ?
                            AND seen = 0
                        `,
                        [
                            otherUserId,
                            userId
                        ]
                    );

                    const otherSocketId =
                        onlineUsers.get(
                            otherUserId
                        );

                    if (
                        otherSocketId
                    ) {

                        io.to(
                            otherSocketId
                        ).emit(
                            "messages-seen",
                            {
                                userId
                            }
                        );
                    }

                } catch (error) {

                    console.error(
                        "Seen error:",
                        error
                    );
                }
            }
        );

        // ======================================
        // CALL USER
        // ======================================

        socket.on(
            "call-user",
            async data => {

                try {

                    const callerId =
                        Number(
                            data.callerId
                        );

                    const receiverId =
                        Number(
                            data.receiverId
                        );

                    const callType =
                        data.callType ===
                        "video"
                            ? "video"
                            : "voice";

                    if (
                        !callerId ||
                        !receiverId
                    ) {
                        return;
                    }

                    if (
                        !isAllowedPair(
                            callerId,
                            receiverId
                        )
                    ) {
                        return;
                    }

                    const receiverSocket =
                        getSocketByUserId(
                            receiverId
                        );

                    // ----------------------------------
                    // SAVE ACTIVE CALL
                    // ----------------------------------

                    const callKey =
                        getCallKey(
                            callerId,
                            receiverId
                        );

                    activeCalls.set(
                        callKey,
                        {
                            callerId,
                            receiverId,
                            callType,
                            startedAt:
                                Date.now()
                        }
                    );

                    // ----------------------------------
                    // ONLINE USER
                    // ----------------------------------

                    if (
                        receiverSocket
                    ) {

                        io.to(
                            receiverSocket
                        ).emit(
                            "incoming-call",
                            {
                                callerId,
                                receiverId,
                                callType
                            }
                        );

                    } else {

                        // ----------------------------------
                        // OFFLINE PUSH CALL
                        // ----------------------------------

                        const isVideo =
                            callType ===
                            "video";

                        await sendPushToUser(
                            receiverId,
                            {
                                type:
                                    isVideo
                                        ? "video-call"
                                        : "voice-call",

                                title:
                                    isVideo
                                        ? "📹 پەیوەندی ڤیدیۆ"
                                        : "📞 پەیوەندی دەنگی",

                                body:
                                    isVideo
                                        ? "پەیوەندی ڤیدیۆت هەیە"
                                        : "پەیوەندی دەنگیت هەیە",

                                url:
                                    "/",

                                chatUrl:
                                    "/",

                                senderId:
                                    callerId,

                                callId:
                                    callKey,

                                tag:
                                    `call-${callKey}`
                            }
                        );

                        socket.emit(
                            "call-error",
                            {
                                message:
                                    "بەکارهێنەری بەرامبەر ئێستا ئۆنلاین نییە، بەڵام notification ـی پەیوەندی بۆی نێردرا."
                            }
                        );

                        return;
                    }

                    socket.emit(
                        "call-ringing",
                        {
                            receiverId,
                            callType
                        }
                    );

                } catch (error) {

                    console.error(
                        "Call user error:",
                        error
                    );
                }
            }
        );

        // ======================================
        // ACCEPT CALL
        // ======================================

        socket.on(
            "accept-call",
            data => {

                const callerId =
                    Number(
                        data.callerId
                    );

                const receiverId =
                    Number(
                        data.receiverId
                    );

                if (
                    !callerId ||
                    !receiverId
                ) {
                    return;
                }

                if (
                    !isAllowedPair(
                        callerId,
                        receiverId
                    )
                ) {
                    return;
                }

                const callerSocket =
                    getSocketByUserId(
                        callerId
                    );

                if (
                    callerSocket
                ) {

                    io.to(
                        callerSocket
                    ).emit(
                        "call-accepted",
                        {
                            callerId,
                            receiverId
                        }
                    );
                }
            }
        );

        // ======================================
        // REJECT CALL
        // ======================================

        socket.on(
            "reject-call",
            data => {

                const callerId =
                    Number(
                        data.callerId
                    );

                const receiverId =
                    Number(
                        data.receiverId
                    );

                if (
                    !callerId ||
                    !receiverId
                ) {
                    return;
                }

                const callKey =
                    getCallKey(
                        callerId,
                        receiverId
                    );

                activeCalls.delete(
                    callKey
                );

                const callerSocket =
                    getSocketByUserId(
                        callerId
                    );

                if (
                    callerSocket
                ) {

                    io.to(
                        callerSocket
                    ).emit(
                        "call-rejected",
                        {
                            callerId,
                            receiverId
                        }
                    );
                }
            }
        );

        // ======================================
        // END CALL
        // ======================================

        socket.on(
            "end-call",
            data => {

                const callerId =
                    Number(
                        data.callerId
                    );

                const receiverId =
                    Number(
                        data.receiverId
                    );

                if (
                    !callerId ||
                    !receiverId
                ) {
                    return;
                }

                const callKey =
                    getCallKey(
                        callerId,
                        receiverId
                    );

                activeCalls.delete(
                    callKey
                );

                const otherSocket =
                    getSocketByUserId(
                        receiverId
                    );

                if (
                    otherSocket
                ) {

                    io.to(
                        otherSocket
                    ).emit(
                        "call-ended",
                        {
                            callerId,
                            receiverId
                        }
                    );
                }
            }
        );

        // ======================================
        // WEBRTC OFFER
        // ======================================

        socket.on(
            "webrtc-offer",
            data => {

                const senderId =
                    Number(
                        data.senderId
                    );

                const receiverId =
                    Number(
                        data.receiverId
                    );

                if (
                    !senderId ||
                    !receiverId ||
                    !data.offer
                ) {
                    return;
                }

                if (
                    !isAllowedPair(
                        senderId,
                        receiverId
                    )
                ) {
                    return;
                }

                const receiverSocket =
                    getSocketByUserId(
                        receiverId
                    );

                if (
                    receiverSocket
                ) {

                    io.to(
                        receiverSocket
                    ).emit(
                        "webrtc-offer",
                        {
                            senderId,
                            receiverId,
                            offer:
                                data.offer
                        }
                    );
                }
            }
        );

        // ======================================
        // WEBRTC ANSWER
        // ======================================

        socket.on(
            "webrtc-answer",
            data => {

                const senderId =
                    Number(
                        data.senderId
                    );

                const receiverId =
                    Number(
                        data.receiverId
                    );

                if (
                    !senderId ||
                    !receiverId ||
                    !data.answer
                ) {
                    return;
                }

                if (
                    !isAllowedPair(
                        senderId,
                        receiverId
                    )
                ) {
                    return;
                }

                const receiverSocket =
                    getSocketByUserId(
                        receiverId
                    );

                if (
                    receiverSocket
                ) {

                    io.to(
                        receiverSocket
                    ).emit(
                        "webrtc-answer",
                        {
                            senderId,
                            receiverId,
                            answer:
                                data.answer
                        }
                    );
                }
            }
        );

        // ======================================
        // WEBRTC ICE
        // ======================================

        socket.on(
            "webrtc-ice-candidate",
            data => {

                const senderId =
                    Number(
                        data.senderId
                    );

                const receiverId =
                    Number(
                        data.receiverId
                    );

                if (
                    !senderId ||
                    !receiverId ||
                    !data.candidate
                ) {
                    return;
                }

                if (
                    !isAllowedPair(
                        senderId,
                        receiverId
                    )
                ) {
                    return;
                }

                const receiverSocket =
                    getSocketByUserId(
                        receiverId
                    );

                if (
                    receiverSocket
                ) {

                    io.to(
                        receiverSocket
                    ).emit(
                        "webrtc-ice-candidate",
                        {
                            senderId,
                            receiverId,
                            candidate:
                                data.candidate
                        }
                    );
                }
            }
        );

        // ======================================
        // DISCONNECT
        // ======================================

        socket.on(
            "disconnect",
            async () => {

                const userId =
                    socket.userId;

                if (!userId) {
                    return;
                }

                for (
                    const [
                        callKey,
                        call
                    ]
                    of activeCalls.entries()
                ) {

                    if (
                        call.callerId ===
                            userId ||
                        call.receiverId ===
                            userId
                    ) {

                        const otherUserId =
                            call.callerId ===
                            userId
                                ? call.receiverId
                                : call.callerId;

                        const otherSocket =
                            getSocketByUserId(
                                otherUserId
                            );

                        if (
                            otherSocket
                        ) {

                            io.to(
                                otherSocket
                            ).emit(
                                "call-ended",
                                {
                                    callerId:
                                        call.callerId,

                                    receiverId:
                                        call.receiverId
                                }
                            );
                        }

                        activeCalls.delete(
                            callKey
                        );
                    }
                }

                if (
                    onlineUsers.get(
                        userId
                    ) === socket.id
                ) {

                    onlineUsers.delete(
                        userId
                    );
                }

                for (
                    const key
                    of typingTimers.keys()
                ) {

                    if (
                        key.startsWith(
                            `${userId}-`
                        )
                    ) {

                        const [
                            senderId,
                            receiverId
                        ] =
                            key
                                .split("-")
                                .map(Number);

                        clearTypingTimer(
                            senderId,
                            receiverId
                        );

                        const receiverSocket =
                            onlineUsers.get(
                                receiverId
                            );

                        if (
                            receiverSocket
                        ) {

                            io.to(
                                receiverSocket
                            ).emit(
                                "stop-typing",
                                {
                                    userId
                                }
                            );
                        }
                    }
                }

                if (
                    !onlineUsers.has(
                        userId
                    )
                ) {

                    try {

                        await db.execute(
                            `
                            UPDATE users
                            SET
                                online = 0,
                                last_seen = NOW()
                            WHERE id = ?
                            `,
                            [userId]
                        );

                    } catch (error) {

                        console.error(
                            "Offline update error:",
                            error.message
                        );
                    }

                    io.emit(
                        "user-status",
                        {
                            userId,
                            online: false,
                            lastSeen:
                                new Date()
                        }
                    );
                }

                console.log(
                    `User ${userId} is offline`
                );
            }
        );
    }
);

// ==========================================
// MULTER ERROR HANDLER
// ==========================================

app.use(
    (
        error,
        req,
        res,
        next
    ) => {

        if (
            error instanceof
            multer.MulterError
        ) {

            if (
                error.code ===
                "LIMIT_FILE_SIZE"
            ) {

                return res.status(413).json({
                    success: false,
                    message:
                        "File is too large"
                });
            }

            return res.status(400).json({
                success: false,
                message:
                    error.message
            });
        }

        if (error) {

            console.error(
                "Server error:",
                error
            );

            return res.status(400).json({
                success: false,
                message:
                    error.message ||
                    "Request failed"
            });
        }

        next();
    }
);

// ==========================================
// START SERVER
// ==========================================

const PORT =
    process.env.PORT || 3000;

server.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `Server running on http://localhost:${PORT}`
        );

        console.log(
            "Push system:",
            pushIsConfigured()
                ? "READY"
                : "NOT CONFIGURED"
        );
    }
);

