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
    parseFloat(computedStyle.maxHeight) || 130;

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
// EMOJI / CURSOR / RTL FIX
// ==========================================
if (messageInput) {
messageInput.setAttribute(
"dir",
"auto"
);

messageInput.style.unicodeBidi =
    "plaintext";

messageInput.style.direction =
    "auto";

messageInput.addEventListener(
    "focus",
    () => {
        messageInput.setAttribute(
            "dir",
            "auto"
        );

        messageInput.style.unicodeBidi =
            "plaintext";

        messageInput.style.direction =
            "auto";
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
// MESSAGE DELETE
// ==========================================
let deleteMenu = null;
let deleteMenuMessage = null;
let deleteMenuElement = null;
let deleteLongPressTimer = null;
const LONG_PRESS_DURATION = 600;
// ==========================================
// NOTIFICATIONS
// ==========================================
let notificationsEnabled = false;
const NOTIFICATION_SOUND =
"data/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
function canUseNotifications() {
return "Notification" in window;
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

    if (!notificationsEnabled) {
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
(
4 -
(base64String.length % 4)
) % 4
);

const base64 =
    (
        base64String +
        padding
    )
        .replace(/-/g, "+")
        .replace(/_/g, "/");

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
if (loginForm) {
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

}
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

// ==========================================
// SCROLL TO ABSOLUTE BOTTOM
// ==========================================

function scrollMessages(instant = false) {
    if (!messagesContainer) {
        return;
    }

    const goToBottom = () => {
        messagesContainer.scrollTop =
            messagesContainer.scrollHeight;
    };

    // یەکەم جار
    requestAnimationFrame(() => {
        goToBottom();

        // دووبارە دوای تەواوبوونی render
        setTimeout(() => {
            goToBottom();
        }, 100);

        // بۆ media / image / video
        setTimeout(() => {
            goToBottom();
        }, 300);

        setTimeout(() => {
            goToBottom();
        }, 600);
    });
}
// ==========================================
// ==========================================
// MESSAGE DELETE MENU
// ==========================================
function createDeleteMenu() {
    if (deleteMenu) return;

    deleteMenu = document.createElement("div");
    deleteMenu.id = "messageDeleteMenu";

    Object.assign(deleteMenu.style, {
        position: "fixed",
        zIndex: "99999",
        display: "none",
        minWidth: "190px",
        background: "#ffffff",
        borderRadius: "12px",
        padding: "6px",
        boxShadow: "0 8px 30px rgba(0,0,0,.22)",
        border: "1px solid rgba(0,0,0,.08)",
        direction: "rtl"
    });

    document.body.appendChild(
        deleteMenu
    );

    document.addEventListener(
        "pointerdown",
        event => {
            if (
                deleteMenu.style.display !==
                    "none" &&
                !deleteMenu.contains(
                    event.target
                )
            ) {
                hideDeleteMenu();
            }
        }
    );

    window.addEventListener(
        "resize",
        hideDeleteMenu
    );

    window.addEventListener(
        "scroll",
        hideDeleteMenu,
        true
    );
}

function hideDeleteMenu() {
    if (!deleteMenu) return;

    deleteMenu.style.display =
        "none";

    deleteMenuMessage = null;
    deleteMenuElement = null;
}

function createDeleteMenuButton(
    text,
    onClick
) {
    const button =
        document.createElement(
            "button"
        );

    button.type =
        "button";

    button.textContent =
        text;

    Object.assign(
        button.style,
        {
            display: "block",
            width: "100%",
            border: "0",
            background: "transparent",
            padding: "12px 14px",
            borderRadius: "8px",
            textAlign: "right",
            fontSize: "15px",
            cursor: "pointer",
            fontFamily: "inherit"
        }
    );

    button.addEventListener(
        "pointerdown",
        e => e.stopPropagation()
    );

    button.addEventListener(
        "click",
        async e => {
            e.preventDefault();
            e.stopPropagation();

            await onClick();
        }
    );

    button.addEventListener(
        "mouseenter",
        () =>
            button.style.background =
                "#f1f1f1"
    );

    button.addEventListener(
        "mouseleave",
        () =>
            button.style.background =
                "transparent"
    );

    return button;
}

function showDeleteMenu(
    message,
    messageElement,
    clientX,
    clientY
) {
    if (!deleteMenu) {
        createDeleteMenu();
    }

    deleteMenu.innerHTML = "";

    deleteMenuMessage =
        message;

    deleteMenuElement =
        messageElement;

    const isMine =
        Number(
            message.sender_id
        ) ===
        Number(
            currentUser.id
        );

    deleteMenu.appendChild(
        createDeleteMenuButton(
            "سڕینەوە بۆ من",
            deleteMessageForMe
        )
    );

    if (isMine) {
        deleteMenu.appendChild(
            createDeleteMenuButton(
                "سڕینەوە بۆ هەمووان",
                deleteMessageForEveryone
            )
        );
    }

    deleteMenu.style.display =
        "block";

    const rect =
        deleteMenu.getBoundingClientRect();

    const margin = 8;

    let left = clientX;
    let top = clientY;

    if (
        left +
            rect.width +
            margin >
        window.innerWidth
    ) {
        left =
            window.innerWidth -
            rect.width -
            margin;
    }

    if (
        top +
            rect.height +
            margin >
        window.innerHeight
    ) {
        top =
            window.innerHeight -
            rect.height -
            margin;
    }

    deleteMenu.style.left =
        `${Math.max(
            margin,
            left
        )}px`;

    deleteMenu.style.top =
        `${Math.max(
            margin,
            top
        )}px`;
}

async function deleteMessageForMe() {
    if (
        !deleteMenuMessage ||
        !currentUser
    ) {
        hideDeleteMenu();
        return;
    }

    const messageId =
        Number(
            deleteMenuMessage.id
        );

    const element =
        deleteMenuElement;

    hideDeleteMenu();

    if (!messageId) {
        return;
    }

    try {
        const response =
            await fetch(
                `/api/messages/${messageId}/delete-for-me`,
                {
                    method: "DELETE",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        userId:
                            Number(
                                currentUser.id
                            )
                    })
                }
            );

        const data =
            await response
                .json()
                .catch(
                    () => ({})
                );

        if (
            !response.ok ||
            !data.success
        ) {
            console.error(
                "Delete for me failed:",
                data.error ||
                    data.message ||
                    response.status
            );

            return;
        }

        removeMessageFromUI(
            messageId,
            element
        );

    } catch (error) {
        console.error(
            "Delete for me error:",
            error
        );
    }
}

async function deleteMessageForEveryone() {
    if (
        !deleteMenuMessage ||
        !currentUser
    ) {
        hideDeleteMenu();
        return;
    }

    const messageId =
        Number(
            deleteMenuMessage.id
        );

    const element =
        deleteMenuElement;

    hideDeleteMenu();

    if (!messageId) {
        return;
    }

    try {
        const response =
            await fetch(
                `/api/messages/${messageId}/delete-for-everyone`,
                {
                    method: "DELETE",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        userId:
                            Number(
                                currentUser.id
                            )
                    })
                }
            );

        const data =
            await response
                .json()
                .catch(
                    () => ({})
                );

        if (
            !response.ok ||
            !data.success
        ) {
            console.error(
                "Delete for everyone failed:",
                data.error ||
                    data.message ||
                    response.status
            );

            return;
        }

        removeMessageFromUI(
            messageId,
            element
        );

    } catch (error) {
        console.error(
            "Delete for everyone error:",
            error
        );
    }
}

function attachDeleteHandlers(
    messageElement,
    message
) {
    if (
        !messageElement ||
        !message
    ) {
        return;
    }

    let longPressTriggered =
        false;

    let localTimer =
        null;

    const clearLongPress =
        () => {
            clearTimeout(
                localTimer
            );

            if (
                deleteLongPressTimer ===
                localTimer
            ) {
                deleteLongPressTimer =
                    null;
            }

            localTimer =
                null;
        };

    messageElement.addEventListener(
        "contextmenu",
        event => {
            event.preventDefault();

            showDeleteMenu(
                message,
                messageElement,
                event.clientX,
                event.clientY
            );
        }
    );

    messageElement.addEventListener(
        "pointerdown",
        event => {
            if (
                event.button !== 0 &&
                event.pointerType !==
                    "touch"
            ) {
                return;
            }

            if (
                event.target.closest(
                    "button, input, textarea, audio, video, a"
                )
            ) {
                return;
            }

            clearLongPress();

            longPressTriggered =
                false;

            const startX =
                event.clientX;

            const startY =
                event.clientY;

            localTimer =
                setTimeout(
                    () => {
                        longPressTriggered =
                            true;

                        deleteLongPressTimer =
                            localTimer;

                        showDeleteMenu(
                            message,
                            messageElement,
                            startX ||
                                window.innerWidth /
                                    2,
                            startY ||
                                window.innerHeight /
                                    2
                        );

                        if (
                            navigator.vibrate
                        ) {
                            try {
                                navigator.vibrate(
                                    25
                                );
                            } catch {}
                        }
                    },
                    LONG_PRESS_DURATION
                );

            deleteLongPressTimer =
                localTimer;
        }
    );

    messageElement.addEventListener(
        "pointermove",
        event => {
            if (
                event.pointerType ===
                    "touch" &&
                localTimer
            ) {
                clearLongPress();
            }
        }
    );

    messageElement.addEventListener(
        "pointerup",
        clearLongPress
    );

    messageElement.addEventListener(
        "pointercancel",
        clearLongPress
    );

    messageElement.addEventListener(
        "click",
        event => {
            if (
                longPressTriggered
            ) {
                event.preventDefault();
                event.stopPropagation();

                longPressTriggered =
                    false;
            }
        },
        true
    );
}

function removeMessageFromUI(
    messageId,
    knownElement = null
) {
    const id =
        String(messageId);

    let element =
        knownElement;

    if (
        !element ||
        !element.isConnected
    ) {
        element =
            Array.from(
                messagesContainer.querySelectorAll(
                    ".message"
                )
            ).find(
                item =>
                    item.dataset
                        .messageId ===
                    id
            );
    }

    if (element) {
        element.remove();
    }

    if (
        !messagesContainer.querySelector(
            ".message"
        )
    ) {
        addWelcomeMessage();
    }
}

// ==========================================
// ADD MESSAGE
// ==========================================
function addMessage(
    message
) {
    const welcome =
        messagesContainer.querySelector(
            ".welcome-message"
        );

    if (welcome) {
        welcome.remove();
    }

    const div =
        document.createElement(
            "div"
        );

    const isMine =
        Number(
            message.sender_id
        ) ===
        Number(
            currentUser.id
        );

    div.className =
        isMine
            ? "message message-out"
            : "message message-in";

    div.dataset.messageId =
        String(message.id);

    div.dataset.senderId =
        String(
            message.sender_id
        );

    attachDeleteHandlers(
        div,
        message
    );

    const bubble =
        document.createElement(
            "div"
        );

    bubble.className =
        "message-bubble";

    // ======================================
    // IMAGE
    // ======================================

    if (
        message.media_type ===
            "image" &&
        message.media_url
    ) {
        const image =
            document.createElement(
                "img"
            );

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

    // ======================================
    // VIDEO
    // ======================================

    if (
        message.media_type ===
            "video" &&
        message.media_url
    ) {
        const video =
            document.createElement(
                "video"
            );

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

    // ======================================
    // VOICE MESSAGE
    // ======================================

    if (
        message.media_type ===
            "voice" &&
        message.media_url
    ) {
        const voiceBox =
            document.createElement(
                "div"
            );

        voiceBox.style.display =
            "flex";

        voiceBox.style.alignItems =
            "center";

        voiceBox.style.gap =
            "8px";

        voiceBox.style.minWidth =
            "220px";

        const icon =
            document.createElement(
                "span"
            );

        icon.textContent =
            "🎤";

        icon.style.fontSize =
            "22px";

        const audio =
            document.createElement(
                "audio"
            );

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

    // ======================================
    // TEXT
    // ======================================

    if (
        message.message &&
        message.message.trim()
    ) {
        const text =
            document.createElement(
                "span"
            );

        text.className =
            "message-text";

        text.setAttribute(
            "dir",
            "auto"
        );

        text.style.unicodeBidi =
            "plaintext";

        text.style.direction =
            "auto";

        text.textContent =
            message.message;

        bubble.appendChild(
            text
        );
    }

    // ======================================
    // META
    // ======================================

    const meta =
        document.createElement(
            "span"
        );

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
        document.createElement(
            "span"
        );

    timeSpan.textContent =
        time;

    meta.appendChild(
        timeSpan
    );

    if (isMine) {
        const seen =
            document.createElement(
                "span"
            );

        seen.className =
            "message-seen";

        seen.textContent =
            Number(
                message.seen
            ) === 1
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

    messageInput.value =
        "";

    resizeMessageInput();

    messageInput.focus();
}

if (sendButton) {
    sendButton.addEventListener(
        "click",
        sendMessage
    );
}

// ==========================================
// ENTER SEND
// ==========================================
if (messageInput) {
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
}

// ==========================================
// TYPING + AUTO RESIZE
// ==========================================
if (messageInput) {
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
}

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
async function uploadMedia(
    file
) {
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
        1000 *
        1024 *
        1024;

    if (file.size > maxSize) {
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

        // ================================
        // UPLOAD PROGRESS
        // ================================

        const xhr =
            new XMLHttpRequest();

        xhr.open(
            "POST",
            "/api/upload",
            true
        );

        xhr.upload.addEventListener(
            "progress",
            event => {
                if (
                    !event.lengthComputable
                ) {
                    return;
                }

                const percent =
                    Math.round(
                        (
                            event.loaded /
                            event.total
                        ) *
                            100
                    );

                console.log(
                    `Upload: ${percent}%`
                );

                if (mediaButton) {
                    mediaButton.title =
                        `ناردن ${percent}%`;
                }
            }
        );

        const result =
            await new Promise(
                (
                    resolve,
                    reject
                ) => {
                    xhr.onload =
                        () => {
                            try {
                                const data =
                                    JSON.parse(
                                        xhr.responseText
                                    );

                                resolve({
                                    ok:
                                        xhr.status >=
                                            200 &&
                                        xhr.status <
                                            300,

                                    data
                                });

                            } catch (
                                error
                            ) {
                                reject(
                                    error
                                );
                            }
                        };

                    xhr.onerror =
                        () => {
                            reject(
                                new Error(
                                    "Network error"
                                )
                            );
                        };

                    xhr.onabort =
                        () => {
                            reject(
                                new Error(
                                    "Upload aborted"
                                )
                            );
                        };

                    xhr.send(
                        formData
                    );
                }
            );

        if (
            !result.ok ||
            !result.data.success
        ) {
            alert(
                result.data.message ||
                    "ناردنی فایل سەرکەوتوو نەبوو."
            );

            return;
        }

        console.log(
            "Upload: 100%"
        );

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

            mediaButton.title =
                "ناردنی فایل";
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

    if (
        !messageArea ||
        !sendButton
    ) {
        return;
    }

    // ======================================
    // MAIN VOICE BUTTON
    // ======================================

    voiceButton =
        document.createElement(
            "button"
        );

    voiceButton.type =
        "button";

    voiceButton.id =
        "voiceButton";

    voiceButton.className =
        "voice-button";

    voiceButton.title =
        "ناردنی دەنگ";

    voiceButton.setAttribute(
        "aria-label",
        "ناردنی دەنگ"
    );

    voiceButton.textContent =
        "🎤";

    Object.assign(
        voiceButton.style,
        {
            width: "46px",
            height: "46px",
            border: "none",
            borderRadius: "50%",
            background: "#25d366",
            color: "#ffffff",
            fontSize: "20px",
            cursor: "pointer",
            flexShrink: "0",
            order: "3"
        }
    );

    voiceButton.addEventListener(
        "click",
        toggleVoiceRecording
    );

    // ======================================
    // CANCEL BUTTON
    // ======================================

    voiceCancelButton =
        document.createElement(
            "button"
        );

    voiceCancelButton.type =
        "button";

    voiceCancelButton.id =
        "voiceCancelButton";

    voiceCancelButton.className =
        "voice-cancel-button";

    voiceCancelButton.title =
        "هەڵوەشاندنەوەی تۆمارکردن";

    voiceCancelButton.setAttribute(
        "aria-label",
        "هەڵوەشاندنەوەی تۆمارکردن"
    );

    voiceCancelButton.textContent =
        "✕";

    Object.assign(
        voiceCancelButton.style,
        {
            display: "none",
            width: "40px",
            height: "40px",
            border: "none",
            borderRadius: "50%",
            background: "#e53935",
            color: "#ffffff",
            cursor: "pointer",
            flexShrink: "0",
            order: "3"
        }
    );

    voiceCancelButton.addEventListener(
        "click",
        cancelVoiceRecording
    );

    // ======================================
    // RECORDING STATUS
    // ======================================

    voiceStatus =
        document.createElement(
            "span"
        );

    voiceStatus.id =
        "voiceStatus";

    voiceStatus.className =
        "voice-status";

    voiceStatus.textContent =
        "00:00";

    Object.assign(
        voiceStatus.style,
        {
            display: "none",
            color: "#e53935",
            fontWeight: "bold",
            fontSize: "14px",
            direction: "ltr",
            minWidth: "45px",
            textAlign: "center",
            order: "2"
        }
    );

    // ======================================
    // INSERT
    // ======================================

    const inputContainer =
        messageArea.querySelector(
            ".message-input-container"
        );

    if (inputContainer) {
        inputContainer.appendChild(
            voiceButton
        );

        inputContainer.appendChild(
            voiceCancelButton
        );

        inputContainer.appendChild(
            voiceStatus
        );
    } else {
        messageArea.appendChild(
            voiceButton
        );

        messageArea.appendChild(
            voiceCancelButton
        );

        messageArea.appendChild(
            voiceStatus
        );
    }
}

// ==========================================
// START / STOP VOICE RECORDING
// ==========================================
async function toggleVoiceRecording() {
    if (isRecordingVoice) {
        stopVoiceRecording();
        return;
    }

    await startVoiceRecording();
}

// ==========================================
// START VOICE RECORDING
// ==========================================
async function startVoiceRecording() {
    if (
        !currentUser ||
        !otherUser
    ) {
        return;
    }

    if (
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
    ) {
        alert(
            "مۆبایل یان وێبگەڕەکەت پشتگیری تۆمارکردنی دەنگ ناکات."
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

        audioChunks = [];

        let options = {};

        if (
            MediaRecorder.isTypeSupported(
                "audio/webm;codecs=opus"
            )
        ) {
            options.mimeType =
                "audio/webm;codecs=opus";
        } else if (
            MediaRecorder.isTypeSupported(
                "audio/webm"
            )
        ) {
            options.mimeType =
                "audio/webm";
        }

        mediaRecorder =
            new MediaRecorder(
                stream,
                options
            );

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
                        track =>
                            track.stop()
                    );

                if (
                    audioChunks.length ===
                    0
                ) {
                    return;
                }

                const blob =
                    new Blob(
                        audioChunks,
                        {
                            type:
                                mediaRecorder.mimeType ||
                                "audio/webm"
                        }
                    );

                audioChunks = [];

                await uploadVoiceBlob(
                    blob
                );
            };

        mediaRecorder.start();

        isRecordingVoice =
            true;

        recordingSeconds =
            0;

        updateVoiceRecordingUI();

        clearInterval(
            recordingTimer
        );

        recordingTimer =
            setInterval(
                () => {
                    recordingSeconds++;

                    updateVoiceRecordingUI();
                },
                1000
            );

    } catch (error) {
        console.error(
            "Voice recording error:",
            error
        );

        alert(
            "نەتوانرا دەنگ تۆمار بکرێت. تکایە ڕێگە بە مایکروفۆن بدە."
        );
    }
}

// ==========================================
// STOP VOICE RECORDING
// ==========================================
function stopVoiceRecording() {
    if (
        !mediaRecorder ||
        !isRecordingVoice
    ) {
        return;
    }

    isRecordingVoice =
        false;

    clearInterval(
        recordingTimer
    );

    recordingTimer =
        null;

    mediaRecorder.stop();

    updateVoiceRecordingUI();
}

// ==========================================
// CANCEL VOICE RECORDING
// ==========================================
function cancelVoiceRecording() {
    if (
        !mediaRecorder ||
        !isRecordingVoice
    ) {
        return;
    }

    isRecordingVoice =
        false;

    clearInterval(
        recordingTimer
    );

    recordingTimer =
        null;

    audioChunks = [];

    try {
        mediaRecorder.stream
            .getTracks()
            .forEach(
                track =>
                    track.stop()
            );
    } catch {}

    try {
        mediaRecorder.onstop =
            null;

        mediaRecorder.stop();
    } catch {}

    mediaRecorder =
        null;

    updateVoiceRecordingUI();
}

// ==========================================
// UPDATE VOICE UI
// ==========================================
function updateVoiceRecordingUI() {
    if (!voiceButton) {
        return;
    }

    if (isRecordingVoice) {
        voiceButton.style.display =
            "none";

        if (voiceCancelButton) {
            voiceCancelButton.style.display =
                "block";
        }

        if (voiceStatus) {
            voiceStatus.style.display =
                "block";

            const minutes =
                Math.floor(
                    recordingSeconds /
                        60
                );

            const seconds =
                recordingSeconds %
                60;

            voiceStatus.textContent =
                `${String(
                    minutes
                ).padStart(
                    2,
                    "0"
                )}:${String(
                    seconds
                ).padStart(
                    2,
                    "0"
                )}`;
        }

    } else {
        voiceButton.style.display =
            "block";

        if (voiceCancelButton) {
            voiceCancelButton.style.display =
                "none";
        }

        if (voiceStatus) {
            voiceStatus.style.display =
                "none";
        }
    }
}

// ==========================================
// UPLOAD VOICE BLOB
// ==========================================
async function uploadVoiceBlob(
    blob
) {
    if (
        !currentUser ||
        !otherUser
    ) {
        return;
    }

    const extension =
        blob.type.includes(
            "ogg"
        )
            ? "ogg"
            : "webm";

    const file =
        new File(
            [
                blob
            ],
            `voice-${Date.now()}.${extension}`,
            {
                type:
                    blob.type ||
                    "audio/webm"
            }
        );

    await uploadMedia(
        file
    );

    mediaRecorder =
        null;

    audioChunks = [];
}
// ==========================================
// WEBRTC UI
// ==========================================
let callContainer = null;
let localVideo = null;
let remoteVideo = null;
let callStatus = null;
let endCallButton = null;
let muteCallButton = null;
let toggleCameraButton = null;

function createCallUI() {
    if (callContainer) {
        return;
    }

    callContainer =
        document.createElement("div");

    callContainer.id =
        "callContainer";

    Object.assign(
        callContainer.style,
        {
            position: "fixed",
            inset: "0",
            zIndex: "100000",
            display: "none",
            background: "#111",
            color: "#fff",
            flexDirection: "column"
        }
    );

    const topBar =
        document.createElement("div");

    Object.assign(
        topBar.style,
        {
            height: "60px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 15px",
            background: "#075e54",
            flexShrink: "0"
        }
    );

    callStatus =
        document.createElement("span");

    callStatus.textContent =
        "Calling...";

    topBar.appendChild(
        callStatus
    );

    const closeButton =
        document.createElement(
            "button"
        );

    closeButton.type =
        "button";

    closeButton.textContent =
        "✕";

    Object.assign(
        closeButton.style,
        {
            width: "40px",
            height: "40px",
            border: "none",
            borderRadius: "50%",
            background: "#e53935",
            color: "#fff",
            fontSize: "18px",
            cursor: "pointer"
        }
    );

    closeButton.addEventListener(
        "click",
        endCall
    );

    topBar.appendChild(
        closeButton
    );

    callContainer.appendChild(
        topBar
    );

    const videoArea =
        document.createElement("div");

    Object.assign(
        videoArea.style,
        {
            position: "relative",
            flex: "1",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            background: "#000"
        }
    );

    remoteVideo =
        document.createElement(
            "video"
        );

    remoteVideo.autoplay =
        true;

    remoteVideo.playsInline =
        true;

    remoteVideo.style.width =
        "100%";

    remoteVideo.style.height =
        "100%";

    remoteVideo.style.objectFit =
        "contain";

    videoArea.appendChild(
        remoteVideo
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
            right: "15px",
            bottom: "15px",
            width: "120px",
            height: "170px",
            objectFit: "cover",
            borderRadius: "10px",
            background: "#222",
            display: "none"
        }
    );

    videoArea.appendChild(
        localVideo
    );

    callContainer.appendChild(
        videoArea
    );

    const controls =
        document.createElement("div");

    Object.assign(
        controls.style,
        {
            minHeight: "80px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "15px",
            background: "#111",
            padding: "15px"
        }
    );

    muteCallButton =
        document.createElement(
            "button"
        );

    muteCallButton.type =
        "button";

    muteCallButton.textContent =
        "🎤";

    Object.assign(
        muteCallButton.style,
        {
            width: "50px",
            height: "50px",
            border: "none",
            borderRadius: "50%",
            cursor: "pointer",
            fontSize: "20px"
        }
    );

    muteCallButton.addEventListener(
        "click",
        toggleMute
    );

    controls.appendChild(
        muteCallButton
    );

    toggleCameraButton =
        document.createElement(
            "button"
        );

    toggleCameraButton.type =
        "button";

    toggleCameraButton.textContent =
        "📹";

    Object.assign(
        toggleCameraButton.style,
        {
            width: "50px",
            height: "50px",
            border: "none",
            borderRadius: "50%",
            cursor: "pointer",
            fontSize: "20px"
        }
    );

    toggleCameraButton.addEventListener(
        "click",
        toggleCamera
    );

    controls.appendChild(
        toggleCameraButton
    );

    endCallButton =
        document.createElement(
            "button"
        );

    endCallButton.type =
        "button";

    endCallButton.textContent =
        "📞";

    Object.assign(
        endCallButton.style,
        {
            width: "55px",
            height: "55px",
            border: "none",
            borderRadius: "50%",
            background: "#e53935",
            color: "#fff",
            cursor: "pointer",
            fontSize: "22px"
        }
    );

    endCallButton.addEventListener(
        "click",
        endCall
    );

    controls.appendChild(
        endCallButton
    );

    callContainer.appendChild(
        controls
    );

    document.body.appendChild(
        callContainer
    );
}

// ==========================================
// SHOW CALL UI
// ==========================================
function showCallUI(
    type,
    status
) {
    if (!callContainer) {
        createCallUI();
    }

    currentCallType =
        type;

    callContainer.style.display =
        "flex";

    if (callStatus) {
        callStatus.textContent =
            status ||
            "Calling...";
    }

    if (localVideo) {
        localVideo.style.display =
            type === "video"
                ? "block"
                : "none";
    }

    if (toggleCameraButton) {
        toggleCameraButton.style.display =
            type === "video"
                ? "block"
                : "none";
    }
}

// ==========================================
// HIDE CALL UI
// ==========================================
function hideCallUI() {
    if (!callContainer) {
        return;
    }

    callContainer.style.display =
        "none";

    if (localVideo) {
        localVideo.srcObject =
            null;
    }

    if (remoteVideo) {
        remoteVideo.srcObject =
            null;
    }

    if (callStatus) {
        callStatus.textContent =
            "";
    }
}

// ==========================================
// START VOICE CALL
// ==========================================
async function startVoiceCall() {
    if (!currentUser || !otherUser || isCallActive) {
        return;
    }

    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false
        });

        currentCallRole = "caller";
        currentCallType = "voice";
        currentCallPartnerId = Number(otherUser.id);
        isCallActive = true;

        showCallUI("voice", "Calling...");

        createPeerConnection();

        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        socket.emit("call-user", {
            callerId: Number(currentUser.id),
            receiverId: Number(otherUser.id),
            callType: "voice"
        });

    } catch (error) {
        console.error("Start voice call error:", error);
        cleanupCall();
    }
}

// ==========================================
// START VIDEO CALL
// ==========================================
async function startVideoCall() {
    if (!currentUser || !otherUser || isCallActive) {
        return;
    }

    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: true
        });

        currentCallRole = "caller";
        currentCallType = "video";
        currentCallPartnerId = Number(otherUser.id);
        isCallActive = true;

        showCallUI("video", "Calling...");

        createPeerConnection();

        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        const localVideo = document.getElementById("localVideo");

        if (localVideo) {
            localVideo.srcObject = localStream;
            localVideo.muted = true;
            localVideo.play().catch(() => {});
        }

        socket.emit("call-user", {
            callerId: Number(currentUser.id),
            receiverId: Number(otherUser.id),
            callType: "video"
        });

    } catch (error) {
        console.error("Start video call error:", error);
        cleanupCall();
    }
}

// ==========================================
// CREATE PEER CONNECTION
// ==========================================
function createPeerConnection() {
    if (peerConnection) {
        return;
    }

    peerConnection = new RTCPeerConnection(
        rtcConfiguration
    );

    peerConnection.onicecandidate = event => {
        if (
            !event.candidate ||
            !currentUser ||
            !currentCallPartnerId
        ) {
            return;
        }

        socket.emit("webrtc-ice-candidate", {
            senderId: Number(currentUser.id),
            receiverId: Number(currentCallPartnerId),
            candidate: event.candidate
        });
    };

    peerConnection.ontrack = event => {
        if (
            !event.streams ||
            !event.streams[0]
        ) {
            return;
        }

        remoteStream = event.streams[0];

        if (remoteVideo) {
            remoteVideo.srcObject = remoteStream;
            remoteVideo.play().catch(() => {});
        }
    };

    peerConnection.onconnectionstatechange = () => {
        if (!peerConnection) {
            return;
        }

        const state = peerConnection.connectionState;

        console.log(
            "WebRTC connection state:",
            state
        );

        if (state === "connected") {
            if (callStatus) {
                callStatus.textContent = "Connected";
            }
        }

        if (
            state === "failed" ||
            state === "closed"
        ) {
            cleanupCall();
        }
    };
}

// ==========================================
// ACCEPT INCOMING CALL
// ==========================================
// ==========================================
// ACCEPT INCOMING CALL
// ==========================================
async function acceptIncomingCall() {
    if (!incomingCallData) {
        return;
    }

    const data = incomingCallData;

    try {
        currentCallRole = "receiver";
        currentCallType = data.callType;
        currentCallPartnerId = Number(data.callerId);
        isCallActive = true;

        incomingCallData = null;

        if (data.callType === "video") {
            localStream =
                await navigator.mediaDevices.getUserMedia({
                    audio: true,
                    video: true
                });
        } else {
            localStream =
                await navigator.mediaDevices.getUserMedia({
                    audio: true
                });
        }

        showCallUI(
            data.callType,
            "Connecting..."
        );

        createPeerConnection();

        localStream
            .getTracks()
            .forEach(track => {
                peerConnection.addTrack(
                    track,
                    localStream
                );
            });

        const localVideo =
            document.getElementById("localVideo");

        if (
            localVideo &&
            data.callType === "video"
        ) {
            localVideo.srcObject =
                localStream;

            localVideo.muted = true;

            localVideo
                .play()
                .catch(() => {});
        }

        socket.emit(
            "accept-call",
            {
                callerId:
                    Number(data.callerId),

                receiverId:
                    Number(data.receiverId)
            }
        );

    } catch (error) {
        console.error(
            "Accept call error:",
            error
        );

        cleanupCall();
    }
}

// ==========================================
// REJECT INCOMING CALL
// ==========================================
function rejectIncomingCall() {
    if (
        !incomingCallData
    ) {
        return;
    }

    const data =
        incomingCallData;

    incomingCallData =
        null;

    socket.emit(
        "call-rejected",
        {
            from:
                Number(
                    currentUser.id
                ),

            to:
                Number(
                    data.from
                )
        }
    );
}

// ==========================================
// WEBRTC ANSWER
// ==========================================
socket.on(
    "webrtc-answer",
    async data => {
        if (
            !peerConnection ||
            !data ||
            !data.answer
        ) {
            return;
        }

        try {
            await peerConnection.setRemoteDescription(
                new RTCSessionDescription(
                    data.answer
                )
            );

            await flushPendingIceCandidates();

            if (callStatus) {
                callStatus.textContent =
                    "Connected";
            }

        } catch (error) {
            console.error(
                "WebRTC answer error:",
                error
            );

            cleanupCall();
        }
    }
);

// ==========================================
// HANDLE INCOMING CALL
// ==========================================
socket.on(
    "incoming-call",
    data => {
        if (
            !currentUser ||
            !data
        ) {
            return;
        }

        if (
            Number(data.receiverId) !==
            Number(currentUser.id)
        ) {
            return;
        }

        if (isCallActive) {
            return;
        }

        incomingCallData = data;

        currentCallPartnerId =
            Number(data.callerId);

        const callerName =
            otherUser
                ? otherUser.username
                : "User";

        const callTypeText =
            data.callType === "video"
                ? "ڤیدیۆ"
                : "دەنگ";

        notifyIncomingCall(
            data.callType
        );

        const accepted =
            window.confirm(
                `${callerName} پەیوەندییەکی ${callTypeText} بۆ ناردوویت.\n\nOK = وەرگرتن\nCancel = ڕەتکردنەوە`
            );

        if (accepted) {
            acceptIncomingCall();
        } else {
            rejectIncomingCall();
        }
    }
);

// ==========================================
// HANDLE ICE CANDIDATE
// ==========================================
// ==========================================
// WEBRTC ICE CANDIDATE
// ==========================================
socket.on(
    "webrtc-ice-candidate",
    async data => {
        if (
            !data ||
            !data.candidate
        ) {
            return;
        }

        if (
            !peerConnection
        ) {
            pendingIceCandidates.push(
                data.candidate
            );

            return;
        }

        if (
            !peerConnection.remoteDescription
        ) {
            pendingIceCandidates.push(
                data.candidate
            );

            return;
        }

        try {
            await peerConnection.addIceCandidate(
                new RTCIceCandidate(
                    data.candidate
                )
            );
        } catch (error) {
            console.error(
                "WebRTC ICE candidate error:",
                error
            );
        }
    }
);

// ==========================================
// FLUSH ICE CANDIDATES
// ==========================================
async function flushPendingIceCandidates() {
    if (
        !peerConnection ||
        !peerConnection.remoteDescription
    ) {
        return;
    }

    const candidates =
        pendingIceCandidates;

    pendingIceCandidates =
        [];

    for (
        const candidate of candidates
    ) {
        try {
            await peerConnection.addIceCandidate(
                new RTCIceCandidate(
                    candidate
                )
            );
        } catch (error) {
            console.error(
                "Flush ICE error:",
                error
            );
        }
    }
}

// ==========================================
// END CALL
// ==========================================
function endCall() {
    if (
        currentUser &&
        currentCallPartnerId &&
        socket.connected
    ) {
        socket.emit(
            "call-ended",
            {
                from:
                    Number(
                        currentUser.id
                    ),

                to:
                    Number(
                        currentCallPartnerId
                    )
            }
        );
    }

    cleanupCall();
}

// ==========================================
// REMOTE CALL ENDED
// ==========================================
socket.on(
    "call-ended",
    data => {
        if (
            !currentUser ||
            !data
        ) {
            return;
        }

        if (
            Number(
                data.to
            ) !==
                Number(
                    currentUser.id
                ) &&
            Number(
                data.from
            ) !==
                Number(
                    currentUser.id
                )
        ) {
            return;
        }

        cleanupCall();
    }
);

// ==========================================
// CALL REJECTED
// ==========================================
socket.on(
    "call-rejected",
    data => {
        if (
            !data ||
            !currentUser
        ) {
            return;
        }

        if (
            Number(
                data.to
            ) !==
            Number(
                currentUser.id
            )
        ) {
            return;
        }

        if (callStatus) {
            callStatus.textContent =
                "Call rejected";
        }

        setTimeout(
            cleanupCall,
            700
        );
    }
);

// ==========================================
// CALL BUSY
// ==========================================
socket.on(
    "call-busy",
    data => {
        if (
            !data ||
            !currentUser
        ) {
            return;
        }

        if (
            Number(
                data.to
            ) !==
            Number(
                currentUser.id
            )
        ) {
            return;
        }

        if (callStatus) {
            callStatus.textContent =
                "Busy";
        }

        setTimeout(
            cleanupCall,
            700
        );
    }
);

// ==========================================
// CLEANUP CALL
// ==========================================
function cleanupCall() {
    if (localStream) {
        localStream
            .getTracks()
            .forEach(
                track =>
                    track.stop()
            );
    }

    if (remoteStream) {
        remoteStream
            .getTracks()
            .forEach(
                track =>
                    track.stop()
            );
    }

    localStream =
        null;

    remoteStream =
        null;

    if (peerConnection) {
        try {
            peerConnection.close();
        } catch {}
    }

    peerConnection =
        null;

    pendingIceCandidates =
        [];

    currentCallType =
        null;

    currentCallRole =
        null;

    currentCallPartnerId =
        null;

    incomingCallData =
        null;

    isCallActive =
        false;

    hideCallUI();
}

// ==========================================
// MUTE CALL
// ==========================================
function toggleMute() {
    if (!localStream) {
        return;
    }

    const audioTracks =
        localStream.getAudioTracks();

    if (
        audioTracks.length ===
        0
    ) {
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

    if (muteCallButton) {
        muteCallButton.textContent =
            enabled
                ? "🔇"
                : "🎤";
    }
}

// ==========================================
// TOGGLE CAMERA
// ==========================================
function toggleCamera() {
    if (!localStream) {
        return;
    }

    const videoTracks =
        localStream.getVideoTracks();

    if (
        videoTracks.length ===
        0
    ) {
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

    if (toggleCameraButton) {
        toggleCameraButton.textContent =
            enabled
                ? "🚫"
                : "📹";
    }
}

// ==========================================
// CALL BUTTON EVENTS
// ==========================================
if (voiceCallButton) {
    voiceCallButton.addEventListener(
        "click",
        startVoiceCall
    );
}

if (videoCallButton) {
    videoCallButton.addEventListener(
        "click",
        startVideoCall
    );
}

// ==========================================
// NEW MESSAGE SOCKET
// ==========================================
socket.on(
    "new-message",
    message => {
        if (
            !currentUser ||
            !message
        ) {
            return;
        }

        const senderId =
            Number(
                message.sender_id
            );

        const receiverId =
            Number(
                message.receiver_id
            );

        if (
            senderId !==
                Number(
                    currentUser.id
                ) &&
            receiverId !==
                Number(
                    currentUser.id
                )
        ) {
            return;
        }

        addMessage(
            message
        );

        scrollMessages();

        if (
            senderId !==
            Number(
                currentUser.id
            )
        ) {
            notifyNewMessage(
                message
            );

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
// TYPING SOCKET
// ==========================================
socket.on(
    "typing",
    data => {
        if (
            !currentUser ||
            !data
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

        userStatus.textContent =
            "typing...";

        userStatus.classList.add(
            "typing"
        );
    }
);

socket.on(
    "stop-typing",
    data => {
        if (
            !currentUser ||
            !data
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

        updateUserStatus(
            otherUserOnline
        );
    }
);

// ==========================================
// USER STATUS
// ==========================================
function updateUserStatus(
    online
) {
    otherUserOnline =
        Boolean(online);

    userStatus.classList.remove(
        "typing"
    );

    if (otherUserOnline) {
        userStatus.textContent =
            "online";

        userStatus.classList.add(
            "online"
        );

    } else {
        userStatus.textContent =
            "offline";

        userStatus.classList.remove(
            "online"
        );
    }
}

// ==========================================
// STATUS FROM SOCKET
// ==========================================
socket.on(
    "user-status",
    data => {
        if (
            !currentUser ||
            !data
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

        updateUserStatus(
            data.online
        );
    }
);

// ==========================================
// MESSAGES SEEN
// ==========================================
socket.on(
    "messages-seen",
    data => {
        if (
            !currentUser ||
            !data
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

        const messages =
            messagesContainer.querySelectorAll(
                ".message-out"
            );

        messages.forEach(
            message => {
                const seen =
                    message.querySelector(
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
// ==========================================
// MESSAGE DELETE SOCKET EVENTS
// ==========================================
socket.on(
    "message-deleted-for-me",
    data => {
        if (!currentUser || !data || !data.messageId) return;
        removeMessageFromUI(data.messageId);
    }
);

socket.on(
    "message-deleted-for-everyone",
    data => {
        if (!currentUser || !data || !data.messageId) return;
        hideDeleteMenu();
        removeMessageFromUI(data.messageId);
    }
);

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
// ==========================================
// LOGOUT
// ==========================================
if (logoutButton) {
    logoutButton.addEventListener("click", (event) => {
        event.preventDefault();

        console.log("LOGOUT CLICKED");

        // Stop typing
        stopTyping();

        // Cancel voice recording
        if (isRecordingVoice) {
            cancelVoiceRecording();
        }

        // End active call
        if (
            currentCallPartnerId &&
            socket.connected &&
            currentUser
        ) {
            socket.emit("call-ended", {
                from: Number(currentUser.id),
                to: Number(currentCallPartnerId)
            });
        }

        // Cleanup WebRTC
        cleanupCall();

        // Remove saved login
        localStorage.removeItem("privateChatUser");

        // Clear user data
        currentUser = null;
        otherUser = null;
        otherUserOnline = false;
        isTyping = false;
        incomingCallData = null;

        // Disconnect socket
        if (socket.connected) {
            socket.disconnect();
        }

        // Show login page
        showLogin();

        // Clear login inputs
        if (usernameInput) {
            usernameInput.value = "";
        }

        if (pinInput) {
            pinInput.value = "";
        }

        if (loginError) {
            loginError.textContent = "";
        }

        console.log("LOGOUT SUCCESS");
    });
}


// ==========================================
// START
// ==========================================

createDeleteMenu();

resizeMessageInput();

restoreLogin();