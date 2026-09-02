
const socket = io({
    autoConnect: false
});

// ==========================================
// ELEMENTS
// ==========================================

const loginPage = document.getElementById("loginPage");
const chatPage = document.getElementById("chatPage");

const loginForm = document.getElementById("loginForm");
const usernameInput = document.getElementById("username");
const pinInput = document.getElementById("pin");
const loginButton = document.getElementById("loginButton");
const loginError = document.getElementById("loginError");

const otherUsername = document.getElementById("otherUsername");
const userStatus = document.getElementById("userStatus");

const messagesContainer = document.getElementById("messages");
const messageInput = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");

const mediaButton = document.getElementById("mediaButton");
const mediaInput = document.getElementById("mediaInput");

const logoutButton = document.getElementById("logoutButton");

const voiceCallButton =
    document.getElementById("voiceCallButton");

const videoCallButton =
    document.getElementById("videoCallButton");

// ==========================================
// MESSAGE INPUT AUTO RESIZE
// ==========================================

function resizeMessageInput() {

    if (!messageInput) {
        return;
    }

    messageInput.style.height = "auto";

    const computedStyle =
        window.getComputedStyle(messageInput);

    const maxHeight =
        parseFloat(
            computedStyle.maxHeight
        ) || 130;

    const newHeight =
        Math.min(
            messageInput.scrollHeight,
            maxHeight
        );

    messageInput.style.height =
        `${newHeight}px`;

    messageInput.style.overflowY =
        messageInput.scrollHeight > maxHeight
            ? "auto"
            : "hidden";
}

// ==========================================
// EMOJI / CURSOR FIX
// ==========================================

let emojiRegex = null;

try {

    emojiRegex =
        new RegExp(
            "\\p{Extended_Pictographic}",
            "u"
        );

} catch {

    try {

        emojiRegex =
            new RegExp(
                "[\\u{1F000}-\\u{1FAFF}\\u{2600}-\\u{27BF}]",
                "u"
            );

    } catch {

        emojiRegex = null;
    }
}

function containsEmoji(text) {

    if (!text || !emojiRegex) {
        return false;
    }

    return emojiRegex.test(text);
}

if (messageInput) {

    messageInput.addEventListener(
        "beforeinput",
        event => {

            if (
                event.inputType !==
                "insertText"
            ) {
                return;
            }

            const data =
                event.data || "";

            if (
                !data ||
                !containsEmoji(data)
            ) {
                return;
            }

            const start =
                messageInput.selectionStart;

            const end =
                messageInput.selectionEnd;

            if (
                typeof start !== "number" ||
                typeof end !== "number"
            ) {
                return;
            }

            event.preventDefault();

            messageInput.setRangeText(
                data,
                start,
                end,
                "end"
            );

            messageInput.dispatchEvent(
                new Event(
                    "input",
                    {
                        bubbles: true
                    }
                )
            );
        }
    );
}

// ==========================================
// CURRENT USER
// ==========================================

let currentUser = null;
let otherUser = null;

let typingTimer = null;
let isTyping = false;
let otherUserOnline = false;

// ==========================================
// NOTIFICATIONS
// ==========================================

let notificationsEnabled = false;

const NOTIFICATION_SOUND =
    "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

function canUseNotifications() {

    return (
        "Notification" in window
    );
}

async function requestNotificationPermission() {

    if (!canUseNotifications()) {
        return false;
    }

    try {

        if (
            Notification.permission ===
            "granted"
        ) {

            notificationsEnabled = true;

            return true;
        }

        if (
            Notification.permission ===
            "denied"
        ) {

            notificationsEnabled = false;

            return false;
        }

        const permission =
            await Notification.requestPermission();

        notificationsEnabled =
            permission === "granted";

        return notificationsEnabled;

    } catch (error) {

        console.error(
            "Notification permission error:",
            error
        );

        return false;
    }
}

function playNotificationSound() {

    try {

        const audio =
            new Audio(
                NOTIFICATION_SOUND
            );

        audio.volume = 0.3;

        audio.play().catch(() => {});

    } catch {}
}

function showBrowserNotification(
    title,
    body,
    options = {}
) {

    if (!canUseNotifications()) {
        return null;
    }

    if (
        Notification.permission !==
        "granted"
    ) {
        return null;
    }

    try {

        const notification =
            new Notification(
                title,
                {
                    body,
                    icon:
                        options.icon ||
                        "/icon-192.png",
                    badge:
                        options.badge ||
                        "/icon-192.png",
                    tag:
                        options.tag ||
                        "private-chat",
                    renotify:
                        true,
                    requireInteraction:
                        options.requireInteraction ||
                        false
                }
            );

        notification.onclick = () => {

            try {
                window.focus();
            } catch {}

            notification.close();

            if (
                options.onClick &&
                typeof options.onClick ===
                    "function"
            ) {
                options.onClick();
            }
        };

        return notification;

    } catch (error) {

        console.error(
            "Notification error:",
            error
        );

        return null;
    }
}

function isChatVisible() {

    return (
        document.visibilityState ===
            "visible" &&
        !document.hidden
    );
}

function notifyNewMessage(message) {

    if (!currentUser || !otherUser) {
        return;
    }

    const sender =
        Number(message.sender_id);

    if (
        sender ===
        Number(currentUser.id)
    ) {
        return;
    }

    if (isChatVisible()) {
        return;
    }

    let body =
        "نامەیەکی نوێت هەیە.";

    if (
        message.media_type ===
        "image"
    ) {

        body =
            "🖼️ وێنەیەکی نوێت هەیە.";

    } else if (
        message.media_type ===
        "video"
    ) {

        body =
            "🎥 ڤیدیۆیەکی نوێت هەیە.";

    } else if (
        message.media_type ===
        "voice"
    ) {

        body =
            "🎤 دەنگێکی نوێت هەیە.";

    } else if (
        message.message &&
        message.message.trim()
    ) {

        body =
            message.message.trim();

        if (body.length > 120) {

            body =
                body.substring(0, 117) +
                "...";
        }
    }

    playNotificationSound();

    showBrowserNotification(
        otherUser.username,
        body,
        {
            tag:
                `message-${message.id || Date.now()}`
        }
    );
}

function notifyIncomingCall(
    callType
) {

    if (!currentUser || !otherUser) {
        return;
    }

    const title =
        callType === "video"
            ? "📹 Video Call"
            : "📞 Voice Call";

    const body =
        callType === "video"
            ? `${otherUser.username} پەیوەندییەکی ڤیدیۆیی بۆ ناردوویت.`
            : `${otherUser.username} پەیوەندییەکی دەنگی بۆ ناردوویت.`;

    playNotificationSound();

    showBrowserNotification(
        title,
        body,
        {
            tag: "incoming-call",
            requireInteraction: true
        }
    );
}

// ==========================================
// SERVICE WORKER / PUSH
// ==========================================

async function registerPushNotifications() {

    if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window)
    ) {

        console.log(
            "Push notifications are not supported."
        );

        return;
    }

    if (!currentUser) {
        return;
    }

    try {

        const registration =
            await navigator.serviceWorker.register(
                "/sw.js"
            );

        console.log(
            "Service Worker registered:",
            registration.scope
        );

        await requestNotificationPermission();

        if (
            !notificationsEnabled
        ) {
            return;
        }

        const response =
            await fetch(
                "/api/push/public-key"
            );

        if (!response.ok) {
            return;
        }

        const data =
            await response.json();

        if (
            !data ||
            !data.publicKey
        ) {

            console.log(
                "Push public key not available."
            );

            return;
        }

        let subscription =
            await registration.pushManager.getSubscription();

        if (!subscription) {

            subscription =
                await registration.pushManager.subscribe(
                    {
                        userVisibleOnly: true,
                        applicationServerKey:
                            urlBase64ToUint8Array(
                                data.publicKey
                            )
                    }
                );
        }

        await fetch(
            "/api/push/subscribe",
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({
                    userId:
                        currentUser.id,

                    subscription
                })
            }
        );

        console.log(
            "Push notification subscribed."
        );

    } catch (error) {

        console.error(
            "Push registration error:",
            error
        );
    }
}

function urlBase64ToUint8Array(
    base64String
) {

    const padding =
        "=".repeat(
            (4 -
                (base64String.length % 4)) %
                4
        );

    const base64 =
        (
            base64String +
            padding
        )
            .replace(
                /-/g,
                "+"
            )
            .replace(
                /_/g,
                "/"
            );

    const rawData =
        window.atob(base64);

    const outputArray =
        new Uint8Array(
            rawData.length
        );

    for (
        let i = 0;
        i < rawData.length;
        ++i
    ) {

        outputArray[i] =
            rawData.charCodeAt(i);
    }

    return outputArray;
}

// ==========================================
// VOICE RECORDING
// ==========================================

let mediaRecorder = null;
let audioChunks = [];
let isRecordingVoice = false;
let recordingTimer = null;
let recordingSeconds = 0;

let voiceButton = null;
let voiceCancelButton = null;
let voiceStatus = null;

// ==========================================
// WEBRTC CALL
// ==========================================

let peerConnection = null;

let localStream = null;
let remoteStream = null;

let currentCallType = null;

let currentCallRole = null;

let currentCallPartnerId = null;

let incomingCallData = null;

let pendingIceCandidates = [];

let isCallActive = false;

// ==========================================
// WEBRTC CONFIG
// ==========================================

const rtcConfiguration = {
    iceServers: [
        {
            urls: "stun:stun.l.google.com:19302"
        },
        {
            urls: "stun:stun1.l.google.com:19302"
        }
    ]
};

// ==========================================
// OTHER USER
// ==========================================

function getOtherUser(userId) {

    if (Number(userId) === 1) {

        return {
            id: 2,
            username: "gure"
        };
    }

    return {
        id: 1,
        username: "harde"
    };
}

// ==========================================
// LOGIN UI
// ==========================================

function showLogin() {

    loginPage.classList.remove(
        "hidden"
    );

    chatPage.classList.add(
        "hidden"
    );
}

function showChat() {

    loginPage.classList.add(
        "hidden"
    );

    chatPage.classList.remove(
        "hidden"
    );

    requestAnimationFrame(() => {
        resizeMessageInput();
    });
}

// ==========================================
// LOGIN
// ==========================================

loginForm.addEventListener(
    "submit",
    async event => {

        event.preventDefault();

        loginError.textContent = "";

        const username =
            usernameInput.value.trim();

        const pin =
            pinInput.value.trim();

        if (!username || !pin) {
            return;
        }

        loginButton.disabled = true;
        loginButton.textContent =
            "چاوەڕوان بە...";

        try {

            const response =
                await fetch(
                    "/api/login",
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body: JSON.stringify({
                            username,
                            pin
                        })
                    }
                );

            const data =
                await response.json();

            if (
                !response.ok ||
                !data.success
            ) {

                loginError.textContent =
                    data.message ||
                    "ناوی بەکارهێنەر یان PIN هەڵەیە.";

                return;
            }

            currentUser =
                data.user;

            localStorage.setItem(
                "privateChatUser",
                JSON.stringify(
                    currentUser
                )
            );

            otherUser =
                getOtherUser(
                    currentUser.id
                );

            otherUsername.textContent =
                otherUser.username;

            showChat();

            createVoiceControls();

            createCallUI();

            await requestNotificationPermission();

            registerPushNotifications();

            if (!socket.connected) {
                socket.connect();
            }

        } catch (error) {

            console.error(
                "Login error:",
                error
            );

            loginError.textContent =
                "کێشەیەک ڕوویدا. تکایە دووبارە هەوڵ بدە.";

        } finally {

            loginButton.disabled = false;

            loginButton.textContent =
                "چوونەژوورەوە";
        }
    }
);

// ==========================================
// RESTORE LOGIN
// ==========================================

async function restoreLogin() {

    const savedUser =
        localStorage.getItem(
            "privateChatUser"
        );

    if (!savedUser) {

        showLogin();

        return;
    }

    try {

        currentUser =
            JSON.parse(
                savedUser
            );

        if (
            !currentUser ||
            !currentUser.id ||
            !currentUser.username
        ) {

            throw new Error(
                "Invalid saved user"
            );
        }

        otherUser =
            getOtherUser(
                currentUser.id
            );

        otherUsername.textContent =
            otherUser.username;

        showChat();

        createVoiceControls();

        createCallUI();

        await requestNotificationPermission();

        registerPushNotifications();

        if (!socket.connected) {
            socket.connect();
        }

    } catch (error) {

        console.error(
            "Restore login error:",
            error
        );

        localStorage.removeItem(
            "privateChatUser"
        );

        currentUser = null;
        otherUser = null;

        showLogin();
    }
}

// ==========================================
// LOAD MESSAGES
// ==========================================

async function loadMessages() {

    if (
        !currentUser ||
        !otherUser
    ) {
        return;
    }

    try {

        const response =
            await fetch(
                `/api/messages/${currentUser.id}/${otherUser.id}`
            );

        const data =
            await response.json();

        if (!data.success) {
            return;
        }

        messagesContainer.innerHTML =
            "";

        if (
            !data.messages ||
            data.messages.length === 0
        ) {

            addWelcomeMessage();

            return;
        }

        data.messages.forEach(
            message => {

                addMessage(
                    message
                );
            }
        );

        // Go directly to the newest message
        scrollMessages(true);

        socket.emit(
            "messages-seen",
            {
                userId:
                    currentUser.id,

                otherUserId:
                    otherUser.id
            }
        );

    } catch (error) {

        console.error(
            "Load messages error:",
            error
        );
    }
}

// ==========================================
// WELCOME
// ==========================================

function addWelcomeMessage() {

    messagesContainer.innerHTML = `
        <div class="welcome-message">
            <div class="welcome-icon">
                🔒
            </div>

            <h3>
                Private Chat
            </h3>

            <p>
                ئەم چاتە تەنها بۆ تۆ و کەسی بەرامبەرە.
            </p>
        </div>
    `;
}

// ==========================================
// SCROLL TO LATEST MESSAGE
// ==========================================

function scrollMessages(instant = false) {

    if (!messagesContainer) {
        return;
    }

    requestAnimationFrame(() => {

        messagesContainer.scrollTo({
            top:
                messagesContainer.scrollHeight,
            behavior:
                instant
                    ? "auto"
                    : "smooth"
        });

        /*
         * دووبارە scroll دەکەینەوە دوای کەمێک کات،
         * بۆ ئەوەی ئەگەر image/video load بوو
         * هێشتا لە کۆتایی چات بمێنینەوە.
         */

        setTimeout(() => {

            if (!messagesContainer) {
                return;
            }

            messagesContainer.scrollTo({
                top:
                    messagesContainer.scrollHeight,
                behavior: "auto"
            });

        }, 150);
    });
}

// ==========================================
// ADD MESSAGE
// ==========================================

function addMessage(message) {

    const welcome =
        messagesContainer.querySelector(
            ".welcome-message"
        );

    if (welcome) {
        welcome.remove();
    }

    const div =
        document.createElement("div");

    const isMine =
        Number(message.sender_id) ===
        Number(currentUser.id);

    div.className =
        isMine
            ? "message message-out"
            : "message message-in";

    const bubble =
        document.createElement("div");

    bubble.className =
        "message-bubble";

    // IMAGE

    if (
        message.media_type ===
            "image" &&
        message.media_url
    ) {

        const image =
            document.createElement("img");

        image.className =
            "message-image";

        image.src =
            message.media_url;

        image.alt =
            "image";

        image.loading =
            "lazy";

        image.style.maxWidth =
            "100%";

        image.style.borderRadius =
            "8px";

        image.style.display =
            "block";

        image.style.cursor =
            "pointer";

        image.addEventListener(
            "click",
            () => {

                window.open(
                    message.media_url,
                    "_blank"
                );
            }
        );

        bubble.appendChild(
            image
        );
    }

    // VIDEO

    if (
        message.media_type ===
            "video" &&
        message.media_url
    ) {

        const video =
            document.createElement("video");

        video.className =
            "message-video";

        video.src =
            message.media_url;

        video.controls =
            true;

        video.playsInline =
            true;

        video.preload =
            "metadata";

        video.style.maxWidth =
            "100%";

        video.style.width =
            "100%";

        video.style.borderRadius =
            "8px";

        bubble.appendChild(
            video
        );
    }

    // VOICE MESSAGE

    if (
        message.media_type ===
            "voice" &&
        message.media_url
    ) {

        const voiceBox =
            document.createElement("div");

        voiceBox.style.display =
            "flex";

        voiceBox.style.alignItems =
            "center";

        voiceBox.style.gap =
            "8px";

        voiceBox.style.minWidth =
            "220px";

        const icon =
            document.createElement("span");

        icon.textContent =
            "🎤";

        icon.style.fontSize =
            "22px";

        const audio =
            document.createElement("audio");

        audio.src =
            message.media_url;

        audio.controls =
            true;

        audio.preload =
            "metadata";

        audio.style.width =
            "220px";

        audio.style.maxWidth =
            "100%";

        voiceBox.appendChild(
            icon
        );

        voiceBox.appendChild(
            audio
        );

        bubble.appendChild(
            voiceBox
        );
    }

    // TEXT

    if (
        message.message &&
        message.message.trim()
    ) {

        const text =
            document.createElement("span");

        text.className =
            "message-text";

        text.textContent =
            message.message;

        bubble.appendChild(
            text
        );
    }

    // META

    const meta =
        document.createElement("span");

    meta.className =
        "message-meta";

    const date =
        new Date(
            message.created_at
        );

    const time =
        date.toLocaleTimeString(
            [],
            {
                hour: "2-digit",
                minute: "2-digit"
            }
        );

    const timeSpan =
        document.createElement("span");

    timeSpan.textContent =
        time;

    meta.appendChild(
        timeSpan
    );

    if (isMine) {

        const seen =
            document.createElement("span");

        seen.className =
            "message-seen";

        seen.textContent =
            Number(message.seen) === 1
                ? "✓✓"
                : "✓";

        meta.appendChild(
            seen
        );
    }

    bubble.appendChild(
        meta
    );

    div.appendChild(
        bubble
    );

    messagesContainer.appendChild(
        div
    );
}

// ==========================================
// SEND MESSAGE
// ==========================================

function sendMessage() {

    if (
        !currentUser ||
        !otherUser
    ) {
        return;
    }

    const message =
        messageInput.value.trim();

    if (!message) {
        return;
    }

    stopTyping();

    if (!socket.connected) {
        return;
    }

    socket.emit(
        "send-message",
        {
            senderId:
                currentUser.id,

            receiverId:
                otherUser.id,

            message
        }
    );

    messageInput.value = "";

    resizeMessageInput();

    messageInput.focus();
}

sendButton.addEventListener(
    "click",
    sendMessage
);

// ==========================================
// ENTER SEND
// ==========================================

messageInput.addEventListener(
    "keydown",
    event => {

        if (
            event.key === "Enter" &&
            !event.shiftKey
        ) {

            event.preventDefault();

            sendMessage();
        }
    }
);

// ==========================================
// TYPING + AUTO RESIZE
// ==========================================

messageInput.addEventListener(
    "input",
    () => {

        resizeMessageInput();

        if (
            !currentUser ||
            !otherUser ||
            !socket.connected
        ) {
            return;
        }

        if (
            !messageInput.value.trim()
        ) {

            stopTyping();

            return;
        }

        if (!isTyping) {

            isTyping =
                true;

            socket.emit(
                "typing",
                {
                    senderId:
                        currentUser.id,

                    receiverId:
                        otherUser.id
                }
            );
        }

        clearTimeout(
            typingTimer
        );

        typingTimer =
            setTimeout(
                stopTyping,
                1200
            );
    }
);

// ==========================================
// STOP TYPING
// ==========================================

function stopTyping() {

    clearTimeout(
        typingTimer
    );

    if (!isTyping) {
        return;
    }

    isTyping =
        false;

    if (
        !currentUser ||
        !otherUser ||
        !socket.connected
    ) {
        return;
    }

    socket.emit(
        "stop-typing",
        {
            senderId:
                currentUser.id,

            receiverId:
                otherUser.id
        }
    );
}

// ==========================================
// MEDIA BUTTON
// ==========================================

if (
    mediaButton &&
    mediaInput
) {

    mediaButton.addEventListener(
        "click",
        () => {

            mediaInput.click();
        }
    );

    mediaInput.addEventListener(
        "change",
        async () => {

            const file =
                mediaInput.files[0];

            if (!file) {
                return;
            }

            await uploadMedia(
                file
            );

            mediaInput.value =
                "";
        }
    );
}

// ==========================================
// UPLOAD MEDIA
// ==========================================

async function uploadMedia(file) {

    if (
        !currentUser ||
        !otherUser
    ) {
        return;
    }

    const allowedImages = [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/gif",
        "image/webp"
    ];

    const allowedVideos = [
        "video/mp4",
        "video/webm",
        "video/ogg",
        "video/quicktime"
    ];

    const allowedAudio = [
        "audio/webm",
        "audio/ogg",
        "audio/mp4",
        "audio/mpeg",
        "audio/wav",
        "audio/x-wav",
        "audio/aac"
    ];

    if (
        !allowedImages.includes(
            file.type
        ) &&
        !allowedVideos.includes(
            file.type
        ) &&
        !allowedAudio.includes(
            file.type
        )
    ) {

        alert(
            "تەنها وێنە، ڤیدیۆ و دەنگ ڕێگەپێدراوە."
        );

        return;
    }

    const maxSize =
        1000 * 1024 * 1024;

    if (
        file.size >
        maxSize
    ) {

        alert(
            "قەبارەی فایل زۆر گەورەیە."
        );

        return;
    }

    const formData =
        new FormData();

    formData.append(
        "media",
        file
    );

    formData.append(
        "senderId",
        currentUser.id
    );

    formData.append(
        "receiverId",
        otherUser.id
    );

    try {

        if (mediaButton) {
            mediaButton.disabled =
                true;
        }

        const response =
            await fetch(
                "/api/upload",
                {
                    method: "POST",
                    body: formData
                }
            );

        const data =
            await response.json();

        if (
            !response.ok ||
            !data.success
        ) {

            alert(
                data.message ||
                "ناردنی فایل سەرکەوتوو نەبوو."
            );
        }

    } catch (error) {

        console.error(
            "Upload error:",
            error
        );

        alert(
            "کێشەیەک لە ناردنی فایل ڕوویدا."
        );

    } finally {

        if (mediaButton) {
            mediaButton.disabled =
                false;
        }
    }
}

// ==========================================
// VOICE RECORDING CONTROLS
// ==========================================

function createVoiceControls() {

    if (voiceButton) {
        return;
    }

    const messageArea =
        document.querySelector(
            ".message-area"
        );

    if (!messageArea) {
        return;
    }

    voiceButton =
        document.createElement(
            "button"
        );

    voiceButton.type =
        "button";

    voiceButton.id =
        "voiceButton";

    voiceButton.title =
        "ناردنی دەنگ";

    voiceButton.textContent =
        "🎤";

    voiceButton.style.width =
        "46px";

    voiceButton.style.height =
        "46px";

    voiceButton.style.border =
        "none";

    voiceButton.style.borderRadius =
        "50%";

    voiceButton.style.background =
        "#25d366";

    voiceButton.style.color =
        "#ffffff";

    voiceButton.style.fontSize =
        "20px";

    voiceButton.style.cursor =
        "pointer";

    voiceButton.style.flexShrink =
        "0";

    voiceButton.addEventListener(
        "click",
        toggleVoiceRecording
    );

    voiceStatus =
        document.createElement(
            "span"
        );

    voiceStatus.id =
        "voiceStatus";

    voiceStatus.textContent =
        "";

    voiceStatus.style.display =
        "none";

    voiceStatus.style.fontSize =
        "12px";

    voiceStatus.style.color =
        "#d93025";

    voiceStatus.style.whiteSpace =
        "nowrap";

    voiceCancelButton =
        document.createElement(
            "button"
        );

    voiceCancelButton.type =
        "button";

    voiceCancelButton.textContent =
        "✕";

    voiceCancelButton.style.display =
        "none";

    voiceCancelButton.style.width =
        "40px";

    voiceCancelButton.style.height =
        "40px";

    voiceCancelButton.style.border =
        "none";

    voiceCancelButton.style.borderRadius =
        "50%";

    voiceCancelButton.style.background =
        "#e53935";

    voiceCancelButton.style.color =
        "#ffffff";

    voiceCancelButton.style.cursor =
        "pointer";

    voiceCancelButton.addEventListener(
        "click",
        cancelVoiceRecording
    );

    messageArea.insertBefore(
        voiceButton,
        sendButton
    );

    messageArea.insertBefore(
        voiceCancelButton,
        sendButton
    );

    messageArea.insertBefore(
        voiceStatus,
        sendButton
    );
}

// ==========================================
// RECORDER MIME
// ==========================================

function getRecorderMimeType() {

    const types = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/ogg",
        "audio/mp4"
    ];

    for (
        const type of types
    ) {

        if (
            window.MediaRecorder &&
            MediaRecorder.isTypeSupported(
                type
            )
        ) {

            return type;
        }
    }

    return "";
}

// ==========================================
// VOICE RECORDING
// ==========================================

async function toggleVoiceRecording() {

    if (
        isRecordingVoice
    ) {

        stopVoiceRecording();

        return;
    }

    await startVoiceRecording();
}

async function startVoiceRecording() {

    if (
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
    ) {

        alert(
            "ئەم وێبگەیە پشتگیری Microphone ناکات."
        );

        return;
    }

    if (
        !window.MediaRecorder
    ) {

        alert(
            "ئەم براوزەرە پشتگیری Voice Recording ناکات."
        );

        return;
    }

    try {

        const stream =
            await navigator.mediaDevices.getUserMedia(
                {
                    audio: true
                }
            );

        const mimeType =
            getRecorderMimeType();

        mediaRecorder =
            mimeType
                ? new MediaRecorder(
                    stream,
                    {
                        mimeType
                    }
                )
                : new MediaRecorder(
                    stream
                );

        audioChunks =
            [];

        mediaRecorder.ondataavailable =
            event => {

                if (
                    event.data &&
                    event.data.size > 0
                ) {

                    audioChunks.push(
                        event.data
                    );
                }
            };

        mediaRecorder.onstop =
            async () => {

                stream
                    .getTracks()
                    .forEach(
                        track => {
                            track.stop();
                        }
                    );

                if (
                    !audioChunks.length
                ) {
                    return;
                }

                const actualType =
                    mediaRecorder.mimeType ||
                    mimeType ||
                    "audio/webm";

                const extension =
                    actualType.includes(
                        "ogg"
                    )
                        ? "ogg"
                        : actualType.includes(
                            "mp4"
                        )
                            ? "mp4"
                            : "webm";

                const blob =
                    new Blob(
                        audioChunks,
                        {
                            type:
                                actualType
                        }
                    );

                const file =
                    new File(
                        [blob],
                        `voice-${Date.now()}.${extension}`,
                        {
                            type:
                                actualType
                        }
                    );

                audioChunks =
                    [];

                await uploadVoice(
                    file
                );

                mediaRecorder =
                    null;
            };

        mediaRecorder.start();

        isRecordingVoice =
            true;

        recordingSeconds =
            0;

        voiceButton.textContent =
            "⏹️";

        voiceButton.style.background =
            "#d93025";

        voiceCancelButton.style.display =
            "flex";

        voiceCancelButton.style.alignItems =
            "center";

        voiceCancelButton.style.justifyContent =
            "center";

        voiceStatus.style.display =
            "inline";

        updateRecordingStatus();

        recordingTimer =
            setInterval(
                () => {

                    recordingSeconds++;

                    updateRecordingStatus();

                },
                1000
            );

    } catch (error) {

        console.error(
            "Microphone error:",
            error
        );

        alert(
            "نەتوانرا دەنگ وەربگیرێت. تکایە مۆڵەتی Microphone بدە."
        );
    }
}

function updateRecordingStatus() {

    if (!voiceStatus) {
        return;
    }

    const minutes =
        Math.floor(
            recordingSeconds /
            60
        );

    const seconds =
        recordingSeconds %
        60;

    voiceStatus.textContent =
        `🔴 ${minutes}:${String(
            seconds
        ).padStart(
            2,
            "0"
        )}`;
}

function stopVoiceRecording() {

    if (
        !mediaRecorder ||
        !isRecordingVoice
    ) {
        return;
    }

    clearInterval(
        recordingTimer
    );

    recordingTimer =
        null;

    isRecordingVoice =
        false;

    voiceButton.textContent =
        "🎤";

    voiceButton.style.background =
        "#25d366";

    voiceCancelButton.style.display =
        "none";

    voiceStatus.style.display =
        "none";

    if (
        mediaRecorder.state !==
        "inactive"
    ) {

        mediaRecorder.stop();
    }
}

function cancelVoiceRecording() {

    if (
        !mediaRecorder ||
        !isRecordingVoice
    ) {
        return;
    }

    clearInterval(
        recordingTimer
    );

    recordingTimer =
        null;

    isRecordingVoice =
        false;

    audioChunks =
        [];

    if (
        mediaRecorder.stream
    ) {

        mediaRecorder.stream
            .getTracks()
            .forEach(
                track =>
                    track.stop()
            );
    }

    mediaRecorder.onstop =
        null;

    if (
        mediaRecorder.state !==
        "inactive"
    ) {

        mediaRecorder.stop();
    }

    mediaRecorder =
        null;

    voiceButton.textContent =
        "🎤";

    voiceButton.style.background =
        "#25d366";

    voiceCancelButton.style.display =
        "none";

    voiceStatus.style.display =
        "none";
}

async function uploadVoice(file) {

    if (
        !currentUser ||
        !otherUser
    ) {
        return;
    }

    try {

        const formData =
            new FormData();

        formData.append(
            "media",
            file
        );

        formData.append(
            "senderId",
            currentUser.id
        );

        formData.append(
            "receiverId",
            otherUser.id
        );

        const response =
            await fetch(
                "/api/upload",
                {
                    method: "POST",
                    body: formData
                }
            );

        const data =
            await response.json();

        if (
            !response.ok ||
            !data.success
        ) {

            alert(
                data.message ||
                "ناردنی دەنگ سەرکەوتوو نەبوو."
            );
        }

    } catch (error) {

        console.error(
            "Voice upload error:",
            error
        );

        alert(
            "کێشەیەک لە ناردنی دەنگ ڕوویدا."
        );
    }
}

// ==========================================
// CALL UI
// ==========================================

let callOverlay = null;
let incomingOverlay = null;

let localVideo = null;
let remoteVideo = null;

let callTitle = null;
let callStatus = null;

let muteButton = null;
let cameraButton = null;
let endCallButton = null;

function createCallUI() {

    if (callOverlay) {
        return;
    }

    callOverlay =
        document.createElement(
            "div"
        );

    callOverlay.id =
        "callOverlay";

    Object.assign(
        callOverlay.style,
        {
            position: "fixed",
            inset: "0",
            zIndex: "9999",
            background: "#111",
            display: "none",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            boxSizing: "border-box"
        }
    );

    callTitle =
        document.createElement(
            "h2"
        );

    callTitle.style.color =
        "#fff";

    callTitle.style.marginBottom =
        "8px";

    callStatus =
        document.createElement(
            "div"
        );

    callStatus.style.color =
        "#bbb";

    callStatus.style.marginBottom =
        "20px";

    remoteVideo =
        document.createElement(
            "video"
        );

    remoteVideo.autoplay =
        true;

    remoteVideo.playsInline =
        true;

    Object.assign(
        remoteVideo.style,
        {
            width: "100%",
            maxWidth: "900px",
            maxHeight: "70vh",
            objectFit: "contain",
            background: "#000",
            borderRadius: "15px"
        }
    );

    localVideo =
        document.createElement(
            "video"
        );

    localVideo.autoplay =
        true;

    localVideo.muted =
        true;

    localVideo.playsInline =
        true;

    Object.assign(
        localVideo.style,
        {
            position: "absolute",
            right: "20px",
            top: "20px",
            width: "180px",
            maxWidth: "35vw",
            borderRadius: "12px",
            background: "#222",
            display: "none",
            border: "2px solid #fff"
        }
    );

    const controls =
        document.createElement(
            "div"
        );

    Object.assign(
        controls.style,
        {
            display: "flex",
            gap: "12px",
            marginTop: "20px"
        }
    );

    muteButton =
        createCallButton(
            "🎤",
            "Microphone"
        );

    cameraButton =
        createCallButton(
            "📹",
            "Camera"
        );

    endCallButton =
        createCallButton(
            "🔴",
            "End Call"
        );

    endCallButton.style.background =
        "#d93025";

    muteButton.addEventListener(
        "click",
        toggleMute
    );

    cameraButton.addEventListener(
        "click",
        toggleCamera
    );

    endCallButton.addEventListener(
        "click",
        endCurrentCall
    );

    controls.appendChild(
        muteButton
    );

    controls.appendChild(
        cameraButton
    );

    controls.appendChild(
        endCallButton
    );

    callOverlay.appendChild(
        callTitle
    );

    callOverlay.appendChild(
        callStatus
    );

    callOverlay.appendChild(
        remoteVideo
    );

    callOverlay.appendChild(
        localVideo
    );

    callOverlay.appendChild(
        controls
    );

    document.body.appendChild(
        callOverlay
    );

    // ======================================
    // INCOMING CALL
    // ======================================

    incomingOverlay =
        document.createElement(
            "div"
        );

    incomingOverlay.id =
        "incomingCallOverlay";

    Object.assign(
        incomingOverlay.style,
        {
            position: "fixed",
            inset: "0",
            zIndex: "10000",
            background:
                "rgba(0,0,0,.85)",
            display: "none",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            boxSizing: "border-box"
        }
    );

    const incomingBox =
        document.createElement(
            "div"
        );

    Object.assign(
        incomingBox.style,
        {
            width:
                "min(400px, 100%)",
            background: "#fff",
            borderRadius: "20px",
            padding: "30px",
            textAlign: "center"
        }
    );

    const incomingTitle =
        document.createElement(
            "h2"
        );

    incomingTitle.id =
        "incomingCallTitle";

    incomingTitle.textContent =
        "Incoming Call";

    const incomingText =
        document.createElement(
            "p"
        );

    incomingText.id =
        "incomingCallText";

    incomingText.textContent =
        "پەیوەندییەکت هەیە.";

    const incomingButtons =
        document.createElement(
            "div"
        );

    Object.assign(
        incomingButtons.style,
        {
            display: "flex",
            justifyContent:
                "center",
            gap: "15px",
            marginTop: "25px"
        }
    );

    const acceptButton =
        document.createElement(
            "button"
        );

    acceptButton.textContent =
        "📞 وەرگرتن";

    Object.assign(
        acceptButton.style,
        {
            padding:
                "12px 22px",
            border: "none",
            borderRadius:
                "12px",
            background:
                "#25d366",
            color: "#fff",
            cursor:
                "pointer",
            fontSize:
                "16px"
        }
    );

    const rejectButton =
        document.createElement(
            "button"
        );

    rejectButton.textContent =
        "❌ ڕەتکردنەوە";

    Object.assign(
        rejectButton.style,
        {
            padding:
                "12px 22px",
            border: "none",
            borderRadius:
                "12px",
            background:
                "#d93025",
            color:
                "#fff",
            cursor:
                "pointer",
            fontSize:
                "16px"
        }
    );

    acceptButton.addEventListener(
        "click",
        acceptIncomingCall
    );

    rejectButton.addEventListener(
        "click",
        rejectIncomingCall
    );

    incomingButtons.appendChild(
        acceptButton
    );

    incomingButtons.appendChild(
        rejectButton
    );

    incomingBox.appendChild(
        incomingTitle
    );

    incomingBox.appendChild(
        incomingText
    );

    incomingBox.appendChild(
        incomingButtons
    );

    incomingOverlay.appendChild(
        incomingBox
    );

    document.body.appendChild(
        incomingOverlay
    );
}

function createCallButton(
    text,
    title
) {

    const button =
        document.createElement(
            "button"
        );

    button.type =
        "button";

    button.textContent =
        text;

    button.title =
        title;

    Object.assign(
        button.style,
        {
            width: "55px",
            height: "55px",
            border: "none",
            borderRadius: "50%",
            background: "#333",
            color: "#fff",
            fontSize: "22px",
            cursor: "pointer"
        }
    );

    return button;
}

// ==========================================
// CALL BUTTONS
// ==========================================

if (voiceCallButton) {

    voiceCallButton.addEventListener(
        "click",
        () => {

            startCall(
                "voice"
            );
        }
    );
}

if (videoCallButton) {

    videoCallButton.addEventListener(
        "click",
        () => {

            startCall(
                "video"
            );
        }
    );
}

// ==========================================
// START CALL
// ==========================================

async function startCall(
    callType
) {

    if (
        !currentUser ||
        !otherUser
    ) {
        return;
    }

    if (isCallActive) {

        alert(
            "پەیوەندییەک هەنووکە چالاکە."
        );

        return;
    }

    if (!socket.connected) {

        alert(
            "پەیوەندی بە server نییە."
        );

        return;
    }

    try {

        currentCallType =
            callType;

        currentCallRole =
            "caller";

        currentCallPartnerId =
            Number(
                otherUser.id
            );

        showCallScreen(
            callType,
            "calling..."
        );

        const stream =
            await navigator.mediaDevices.getUserMedia(
                {
                    audio: true,
                    video:
                        callType ===
                        "video"
                }
            );

        localStream =
            stream;

        localVideo.srcObject =
            localStream;

        localVideo.style.display =
            callType ===
            "video"
                ? "block"
                : "none";

        socket.emit(
            "call-user",
            {
                callerId:
                    currentUser.id,

                receiverId:
                    otherUser.id,

                callType
            }
        );

    } catch (error) {

        console.error(
            "Start call error:",
            error
        );

        closeCallUI();

        alert(
            "نەتوانرا Microphone/Camera بەکاربهێنرێت. تکایە مۆڵەت بدە."
        );
    }
}

// ==========================================
// INCOMING CALL
// ==========================================

socket.on(
    "incoming-call",
    data => {

        if (!currentUser) {
            return;
        }

        if (
            Number(
                data.receiverId
            ) !==
            Number(
                currentUser.id
            )
        ) {
            return;
        }

        if (isCallActive) {

            socket.emit(
                "reject-call",
                {
                    callerId:
                        data.callerId,

                    receiverId:
                        data.receiverId
                }
            );

            return;
        }

        incomingCallData =
            data;

        notifyIncomingCall(
            data.callType
        );

        const incomingTitle =
            document.getElementById(
                "incomingCallTitle"
            );

        const incomingText =
            document.getElementById(
                "incomingCallText"
            );

        if (incomingTitle) {

            incomingTitle.textContent =
                data.callType ===
                "video"
                    ? "📹 Video Call"
                    : "📞 Voice Call";
        }

        if (incomingText) {

            incomingText.textContent =
                `${otherUser?.username || "User"} پەیوەندییەکی ${
                    data.callType ===
                    "video"
                        ? "ڤیدیۆیی"
                        : "دەنگی"
                }ی بۆ ناردوویت.`;
        }

        if (incomingOverlay) {

            incomingOverlay.style.display =
                "flex";
        }
    }
);

// ==========================================
// ACCEPT INCOMING CALL
// ==========================================

async function acceptIncomingCall() {

    if (!incomingCallData) {
        return;
    }

    const data =
        incomingCallData;

    incomingCallData =
        null;

    if (incomingOverlay) {

        incomingOverlay.style.display =
            "none";
    }

    try {

        currentCallType =
            data.callType;

        currentCallRole =
            "receiver";

        currentCallPartnerId =
            Number(
                data.callerId
            );

        showCallScreen(
            data.callType,
            "connecting..."
        );

        const stream =
            await navigator.mediaDevices.getUserMedia(
                {
                    audio: true,
                    video:
                        data.callType ===
                        "video"
                }
            );

        localStream =
            stream;

        localVideo.srcObject =
            localStream;

        localVideo.style.display =
            data.callType ===
            "video"
                ? "block"
                : "none";

        socket.emit(
            "accept-call",
            {
                callerId:
                    data.callerId,

                receiverId:
                    data.receiverId
            }
        );

    } catch (error) {

        console.error(
            "Accept call error:",
            error
        );

        alert(
            "نەتوانرا Microphone/Camera بەکاربهێنرێت."
        );

        socket.emit(
            "reject-call",
            {
                callerId:
                    data.callerId,

                receiverId:
                    data.receiverId
            }
        );

        closeCallUI();
    }
}

// ==========================================
// REJECT INCOMING CALL
// ==========================================

function rejectIncomingCall() {

    if (!incomingCallData) {
        return;
    }

    socket.emit(
        "reject-call",
        {
            callerId:
                incomingCallData.callerId,

            receiverId:
                incomingCallData.receiverId
        }
    );

    incomingCallData =
        null;

    if (incomingOverlay) {

        incomingOverlay.style.display =
            "none";
    }
}

// ==========================================
// CALL ACCEPTED
// ==========================================

socket.on(
    "call-accepted",
    async data => {

        if (
            !currentUser ||
            currentCallRole !==
                "caller"
        ) {
            return;
        }

        if (
            Number(
                data.callerId
            ) !==
            Number(
                currentUser.id
            )
        ) {
            return;
        }

        try {

            createPeerConnection();

            const offer =
                await peerConnection.createOffer();

            await peerConnection.setLocalDescription(
                offer
            );

            socket.emit(
                "webrtc-offer",
                {
                    senderId:
                        currentUser.id,

                    receiverId:
                        otherUser.id,

                    offer:
                        peerConnection.localDescription
                }
            );

            callStatus.textContent =
                "connected / waiting...";

        } catch (error) {

            console.error(
                "Create offer error:",
                error
            );

            endCurrentCall();
        }
    }
);

// ==========================================
// WEBRTC OFFER
// ==========================================

socket.on(
    "webrtc-offer",
    async data => {

        if (
            !currentUser ||
            !otherUser
        ) {
            return;
        }

        if (
            Number(
                data.receiverId
            ) !==
            Number(
                currentUser.id
            )
        ) {
            return;
        }

        try {

            if (!peerConnection) {

                createPeerConnection();
            }

            await peerConnection.setRemoteDescription(
                new RTCSessionDescription(
                    data.offer
                )
            );

            await addPendingIceCandidates();

            const answer =
                await peerConnection.createAnswer();

            await peerConnection.setLocalDescription(
                answer
            );

            socket.emit(
                "webrtc-answer",
                {
                    senderId:
                        currentUser.id,

                    receiverId:
                        Number(
                            data.senderId
                        ),

                    answer:
                        peerConnection.localDescription
                }
            );

            isCallActive =
                true;

            callStatus.textContent =
                "connected";

        } catch (error) {

            console.error(
                "Offer handling error:",
                error
            );

            endCurrentCall();
        }
    }
);

// ==========================================
// WEBRTC ANSWER
// ==========================================

socket.on(
    "webrtc-answer",
    async data => {

        if (
            !peerConnection ||
            !currentUser
        ) {
            return;
        }

        if (
            Number(
                data.receiverId
            ) !==
            Number(
                currentUser.id
            )
        ) {
            return;
        }

        try {

            await peerConnection.setRemoteDescription(
                new RTCSessionDescription(
                    data.answer
                )
            );

            await addPendingIceCandidates();

            isCallActive =
                true;

            callStatus.textContent =
                "connected";

        } catch (error) {

            console.error(
                "Answer error:",
                error
            );
        }
    }
);

// ==========================================
// ICE CANDIDATE
// ==========================================

socket.on(
    "webrtc-ice-candidate",
    async data => {

        if (!currentUser) {
            return;
        }

        if (
            Number(
                data.receiverId
            ) !==
            Number(
                currentUser.id
            )
        ) {
            return;
        }

        if (!data.candidate) {
            return;
        }

        try {

            const candidate =
                new RTCIceCandidate(
                    data.candidate
                );

            if (
                peerConnection &&
                peerConnection.remoteDescription
            ) {

                await peerConnection.addIceCandidate(
                    candidate
                );

            } else {

                pendingIceCandidates.push(
                    candidate
                );
            }

        } catch (error) {

            console.error(
                "ICE candidate error:",
                error
            );
        }
    }
);

// ==========================================
// CREATE PEER CONNECTION
// ==========================================

function createPeerConnection() {

    if (peerConnection) {
        return peerConnection;
    }

    peerConnection =
        new RTCPeerConnection(
            rtcConfiguration
        );

    if (localStream) {

        localStream
            .getTracks()
            .forEach(
                track => {

                    peerConnection.addTrack(
                        track,
                        localStream
                    );
                }
            );
    }

    remoteStream =
        new MediaStream();

    remoteVideo.srcObject =
        remoteStream;

    peerConnection.ontrack =
        event => {

            event.streams[0]
                .getTracks()
                .forEach(
                    track => {

                        remoteStream.addTrack(
                            track
                        );
                    }
                );

            remoteVideo.srcObject =
                remoteStream;

            remoteVideo.play()
                .catch(
                    () => {}
                );

            isCallActive =
                true;

            callStatus.textContent =
                "connected";
        };

    peerConnection.onicecandidate =
        event => {

            if (
                !event.candidate ||
                !currentUser ||
                !currentCallPartnerId
            ) {
                return;
            }

            socket.emit(
                "webrtc-ice-candidate",
                {
                    senderId:
                        currentUser.id,

                    receiverId:
                        currentCallPartnerId,

                    candidate:
                        event.candidate
                }
            );
        };

    peerConnection.onconnectionstatechange =
        () => {

            if (!peerConnection) {
                return;
            }

            console.log(
                "WebRTC state:",
                peerConnection.connectionState
            );

            if (
                peerConnection.connectionState ===
                "connected"
            ) {

                isCallActive =
                    true;

                callStatus.textContent =
                    "connected";
            }

            if (
                peerConnection.connectionState ===
                "failed"
            ) {

                callStatus.textContent =
                    "connection failed";
            }

            if (
                peerConnection.connectionState ===
                "disconnected"
            ) {

                callStatus.textContent =
                    "disconnected";
            }
        };

    peerConnection.oniceconnectionstatechange =
        () => {

            console.log(
                "ICE state:",
                peerConnection.iceConnectionState
            );
        };

    return peerConnection;
}

// ==========================================
// PENDING ICE
// ==========================================

async function addPendingIceCandidates() {

    if (!peerConnection) {
        return;
    }

    if (
        !peerConnection.remoteDescription
    ) {
        return;
    }

    for (
        const candidate of
        pendingIceCandidates
    ) {

        try {

            await peerConnection.addIceCandidate(
                candidate
            );

        } catch (error) {

            console.error(
                "Pending ICE error:",
                error
            );
        }
    }

    pendingIceCandidates =
        [];
}

// ==========================================
// SHOW CALL SCREEN
// ==========================================

function showCallScreen(
    type,
    status
) {

    createCallUI();

    callOverlay.style.display =
        "flex";

    callTitle.textContent =
        type === "video"
            ? `📹 ${
                otherUser?.username ||
                "User"
            }`
            : `📞 ${
                otherUser?.username ||
                "User"
            }`;

    callStatus.textContent =
        status ||
        "connecting...";

    cameraButton.style.display =
        type === "video"
            ? "block"
            : "none";

    remoteVideo.style.display =
        type === "video"
            ? "block"
            : "none";

    isCallActive =
        false;
}

// ==========================================
// MUTE
// ==========================================

function toggleMute() {

    if (!localStream) {
        return;
    }

    const audioTracks =
        localStream.getAudioTracks();

    if (!audioTracks.length) {
        return;
    }

    const enabled =
        audioTracks[0].enabled;

    audioTracks.forEach(
        track => {

            track.enabled =
                !enabled;
        }
    );

    muteButton.textContent =
        enabled
            ? "🔇"
            : "🎤";
}

// ==========================================
// CAMERA
// ==========================================

function toggleCamera() {

    if (!localStream) {
        return;
    }

    const videoTracks =
        localStream.getVideoTracks();

    if (!videoTracks.length) {
        return;
    }

    const enabled =
        videoTracks[0].enabled;

    videoTracks.forEach(
        track => {

            track.enabled =
                !enabled;
        }
    );

    cameraButton.textContent =
        enabled
            ? "🚫"
            : "📹";
}

// ==========================================
// END CURRENT CALL
// ==========================================

function endCurrentCall() {

    if (
        currentUser &&
        currentCallPartnerId &&
        socket.connected
    ) {

        socket.emit(
            "end-call",
            {
                callerId:
                    currentUser.id,

                receiverId:
                    currentCallPartnerId
            }
        );
    }

    closeCallUI();
}

// ==========================================
// CALL ENDED
// ==========================================

socket.on(
    "call-ended",
    () => {

        closeCallUI();
    }
);

// ==========================================
// CALL REJECTED
// ==========================================

socket.on(
    "call-rejected",
    () => {

        closeCallUI();

        alert(
            "پەیوەندییەکە ڕەتکرایەوە."
        );
    }
);

// ==========================================
// CALL ERROR
// ==========================================

socket.on(
    "call-error",
    data => {

        closeCallUI();

        alert(
            data?.message ||
            "کۆڵ نەکرا."
        );
    }
);

// ==========================================
// CALL RINGING
// ==========================================

socket.on(
    "call-ringing",
    () => {

        if (callStatus) {

            callStatus.textContent =
                "ringing...";
        }
    }
);

// ==========================================
// CLOSE CALL UI
// ==========================================

function closeCallUI() {

    if (localStream) {

        localStream
            .getTracks()
            .forEach(
                track => {

                    track.stop();
                }
            );
    }

    if (peerConnection) {

        try {

            peerConnection.close();

        } catch {}
    }

    peerConnection =
        null;

    if (localVideo) {

        localVideo.srcObject =
            null;
    }

    if (remoteVideo) {

        remoteVideo.srcObject =
            null;
    }

    localStream =
        null;

    remoteStream =
        null;

    pendingIceCandidates =
        [];

    currentCallType =
        null;

    currentCallRole =
        null;

    currentCallPartnerId =
        null;

    isCallActive =
        false;

    if (callOverlay) {

        callOverlay.style.display =
            "none";
    }

    if (incomingOverlay) {

        incomingOverlay.style.display =
            "none";
    }

    incomingCallData =
        null;
}

// ==========================================
// NEW MESSAGE
// ==========================================

socket.on(
    "new-message",
    message => {

        if (
            !currentUser ||
            !otherUser
        ) {
            return;
        }

        const sender =
            Number(
                message.sender_id
            );

        const receiver =
            Number(
                message.receiver_id
            );

        const isThisChat =
            (
                sender ===
                    Number(
                        currentUser.id
                    ) &&
                receiver ===
                    Number(
                        otherUser.id
                    )
            )
            ||
            (
                sender ===
                    Number(
                        otherUser.id
                    ) &&
                receiver ===
                    Number(
                        currentUser.id
                    )
            );

        if (!isThisChat) {
            return;
        }

        addMessage(
            message
        );

        scrollMessages();

        notifyNewMessage(
            message
        );

        if (
            sender ===
            Number(
                otherUser.id
            )
        ) {

            socket.emit(
                "messages-seen",
                {
                    userId:
                        currentUser.id,

                    otherUserId:
                        otherUser.id
                }
            );
        }
    }
);

// ==========================================
// TYPING RECEIVED
// ==========================================

socket.on(
    "typing",
    data => {

        if (
            !currentUser ||
            !otherUser
        ) {
            return;
        }

        if (
            Number(
                data.userId
            ) !==
            Number(
                otherUser.id
            )
        ) {
            return;
        }

        userStatus.textContent =
            "typing...";
    }
);

// ==========================================
// STOP TYPING
// ==========================================

socket.on(
    "stop-typing",
    data => {

        if (
            !currentUser ||
            !otherUser
        ) {
            return;
        }

        if (
            Number(
                data.userId
            ) !==
            Number(
                otherUser.id
            )
        ) {
            return;
        }

        if (otherUserOnline) {

            userStatus.textContent =
                "online";

        } else {

            updateOfflineStatus();
        }
    }
);

// ==========================================
// USER STATUS
// ==========================================

socket.on(
    "user-status",
    data => {

        if (
            !currentUser ||
            !otherUser
        ) {
            return;
        }

        if (
            Number(
                data.userId
            ) !==
            Number(
                otherUser.id
            )
        ) {
            return;
        }

        if (data.online) {

            otherUserOnline =
                true;

            userStatus.textContent =
                "online";

        } else {

            otherUserOnline =
                false;

            if (data.lastSeen) {

                userStatus.textContent =
                    formatLastSeen(
                        data.lastSeen
                    );

            } else {

                updateOfflineStatus();
            }
        }
    }
);

// ==========================================
// OFFLINE STATUS
// ==========================================

async function updateOfflineStatus() {

    if (!otherUser) {
        return;
    }

    try {

        const response =
            await fetch(
                `/api/user/${otherUser.id}/status`
            );

        const data =
            await response.json();

        if (
            !data.success ||
            !data.user
        ) {

            userStatus.textContent =
                "offline";

            return;
        }

        if (data.user.online) {

            otherUserOnline =
                true;

            userStatus.textContent =
                "online";

            return;
        }

        otherUserOnline =
            false;

        if (
            data.user.last_seen
        ) {

            userStatus.textContent =
                formatLastSeen(
                    data.user.last_seen
                );

        } else {

            userStatus.textContent =
                "offline";
        }

    } catch (error) {

        console.error(
            "Status error:",
            error
        );

        userStatus.textContent =
            "offline";
    }
}

// ==========================================
// FORMAT LAST SEEN
// ==========================================

function formatLastSeen(
    value
) {

    const date =
        new Date(value);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return "offline";
    }

    const now =
        new Date();

    const today =
        now.toDateString() ===
        date.toDateString();

    const time =
        date.toLocaleTimeString(
            [],
            {
                hour: "2-digit",
                minute: "2-digit"
            }
        );

    if (today) {

        return `last seen today at ${time}`;
    }

    const dateText =
        date.toLocaleDateString(
            [],
            {
                year: "numeric",
                month: "short",
                day: "numeric"
            }
        );

    return `last seen ${dateText} at ${time}`;
}

// ==========================================
// MESSAGES SEEN
// ==========================================

socket.on(
    "messages-seen",
    data => {

        if (
            !currentUser ||
            !otherUser
        ) {
            return;
        }

        if (
            Number(
                data.userId
            ) !==
            Number(
                otherUser.id
            )
        ) {
            return;
        }

        const mine =
            messagesContainer.querySelectorAll(
                ".message-out"
            );

        mine.forEach(
            element => {

                const seen =
                    element.querySelector(
                        ".message-seen"
                    );

                if (seen) {

                    seen.textContent =
                        "✓✓";
                }
            }
        );
    }
);

// ==========================================
// SOCKET CONNECT
// ==========================================

socket.on(
    "connect",
    async () => {

        console.log(
            "Socket connected:",
            socket.id
        );

        if (!currentUser) {
            return;
        }

        socket.emit(
            "user-online",
            currentUser.id
        );

        await loadMessages();

        await updateOfflineStatus();

        registerPushNotifications();

        requestAnimationFrame(() => {
            resizeMessageInput();
        });
    }
);

// ==========================================
// SOCKET DISCONNECT
// ==========================================

socket.on(
    "disconnect",
    () => {

        console.log(
            "Socket disconnected"
        );

        isTyping =
            false;
    }
);

// ==========================================
// VISIBILITY CHANGE
// ==========================================

document.addEventListener(
    "visibilitychange",
    () => {

        if (
            document.visibilityState ===
            "visible"
        ) {

            if (
                currentUser &&
                otherUser &&
                socket.connected
            ) {

                socket.emit(
                    "messages-seen",
                    {
                        userId:
                            currentUser.id,

                        otherUserId:
                            otherUser.id
                    }
                );
            }

            requestAnimationFrame(() => {
                resizeMessageInput();
            });
        }
    }
);

// ==========================================
// WINDOW RESIZE
// ==========================================

window.addEventListener(
    "resize",
    () => {

        resizeMessageInput();
    }
);

// ==========================================
// LOGOUT
// ==========================================

logoutButton.addEventListener(
    "click",
    () => {

        stopTyping();

        if (
            isRecordingVoice
        ) {

            cancelVoiceRecording();
        }

        if (
            currentCallPartnerId &&
            socket.connected
        ) {

            socket.emit(
                "end-call",
                {
                    callerId:
                        currentUser.id,

                    receiverId:
                        currentCallPartnerId
                }
            );
        }

        closeCallUI();

        localStorage.removeItem(
            "privateChatUser"
        );

        currentUser =
            null;

        otherUser =
            null;

        otherUserOnline =
            false;

        isTyping =
            false;

        if (socket.connected) {

            socket.disconnect();
        }

        location.reload();
    }
);

// ==========================================
// START
// ==========================================

resizeMessageInput();

restoreLogin();
