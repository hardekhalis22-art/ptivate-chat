const socket = io({
    autoConnect: false
});

// ==========================================
// ELEMENTS
// ==========================================

const loginPage =
    document.getElementById("loginPage");

const chatPage =
    document.getElementById("chatPage");

const loginForm =
    document.getElementById("loginForm");

const usernameInput =
    document.getElementById("username");

const pinInput =
    document.getElementById("pin");

const loginButton =
    document.getElementById("loginButton");

const loginError =
    document.getElementById("loginError");

const otherUsername =
    document.getElementById("otherUsername");

const userStatus =
    document.getElementById("userStatus");

const messagesContainer =
    document.getElementById("messages");

const messageInput =
    document.getElementById("messageInput");

const sendButton =
    document.getElementById("sendButton");

const mediaButton =
    document.getElementById("mediaButton");

const mediaInput =
    document.getElementById("mediaInput");

const logoutButton =
    document.getElementById("logoutButton");

// ==========================================
// CURRENT USER
// ==========================================

let currentUser = null;
let otherUser = null;

let typingTimer = null;
let isTyping = false;
let otherUserOnline = false;

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
// SHOW LOGIN
// ==========================================

function showLogin() {

    loginPage.classList.remove(
        "hidden"
    );

    chatPage.classList.add(
        "hidden"
    );
}

// ==========================================
// SHOW CHAT
// ==========================================

function showChat() {

    loginPage.classList.add(
        "hidden"
    );

    chatPage.classList.remove(
        "hidden"
    );
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
            JSON.parse(savedUser);

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

        messagesContainer.innerHTML = "";

        if (
            !data.messages ||
            data.messages.length === 0
        ) {

            addWelcomeMessage();

            return;
        }

        data.messages.forEach(
            message => {
                addMessage(message);
            }
        );

        scrollMessages();

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

    // ======================================
    // IMAGE
    // ======================================

    if (
        message.media_type === "image" &&
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

        image.style.maxWidth = "100%";
        image.style.borderRadius = "8px";
        image.style.display = "block";
        image.style.cursor = "pointer";

        image.addEventListener(
            "click",
            () => {
                window.open(
                    message.media_url,
                    "_blank"
                );
            }
        );

        bubble.appendChild(image);
    }

    // ======================================
    // VIDEO
    // ======================================

    if (
        message.media_type === "video" &&
        message.media_url
    ) {

        const video =
            document.createElement("video");

        video.className =
            "message-video";

        video.src =
            message.media_url;

        video.controls = true;

        video.playsInline = true;

        video.preload =
            "metadata";

        video.style.maxWidth =
            "100%";

        video.style.width =
            "100%";

        video.style.borderRadius =
            "8px";

        bubble.appendChild(video);
    }

    // ======================================
    // VOICE MESSAGE
    // ======================================

    if (
        message.media_type === "voice" &&
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

    // ======================================
    // TEXT
    // ======================================

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

        bubble.appendChild(text);
    }

    // ======================================
    // META
    // ======================================

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

    messageInput.focus();
}

// ==========================================
// SEND BUTTON
// ==========================================

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
// TYPING
// ==========================================

messageInput.addEventListener(
    "input",
    () => {

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

            isTyping = true;

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

    isTyping = false;

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

            await uploadMedia(file);

            mediaInput.value = "";
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
        !allowedImages.includes(file.type) &&
        !allowedVideos.includes(file.type) &&
        !allowedAudio.includes(file.type)
    ) {

        alert(
            "تەنها وێنە، ڤیدیۆ و دەنگ ڕێگەپێدراوە."
        );

        return;
    }

    const maxSize =
        1000 * 1024 * 1024;

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
            mediaButton.disabled = true;
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

            return;
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
            mediaButton.disabled = false;
        }
    }
}

// ==========================================
// CREATE VOICE CONTROLS
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
        document.createElement("button");

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
        document.createElement("span");

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
        document.createElement("button");

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
// GET RECORDER MIME
// ==========================================

function getRecorderMimeType() {

    const types = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/ogg",
        "audio/mp4"
    ];

    for (const type of types) {

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
// START / STOP VOICE
// ==========================================

async function toggleVoiceRecording() {

    if (isRecordingVoice) {

        stopVoiceRecording();

        return;
    }

    await startVoiceRecording();
}

// ==========================================
// START VOICE
// ==========================================

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

    if (!window.MediaRecorder) {

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

        audioChunks = [];

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
                    audioChunks.length === 0
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
                        [
                            blob
                        ],
                        `voice-${Date.now()}.${extension}`,
                        {
                            type:
                                actualType
                        }
                    );

                audioChunks = [];

                await uploadVoice(
                    file
                );
            };

        mediaRecorder.start();

        isRecordingVoice = true;

        recordingSeconds = 0;

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

// ==========================================
// RECORDING STATUS
// ==========================================

function updateRecordingStatus() {

    if (!voiceStatus) {
        return;
    }

    const minutes =
        Math.floor(
            recordingSeconds / 60
        );

    const seconds =
        recordingSeconds % 60;

    voiceStatus.textContent =
        `🔴 ${minutes}:${String(
            seconds
        ).padStart(2, "0")}`;
}

// ==========================================
// STOP RECORDING
// ==========================================

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

    recordingTimer = null;

    isRecordingVoice = false;

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

// ==========================================
// CANCEL VOICE
// ==========================================

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

    recordingTimer = null;

    isRecordingVoice = false;

    audioChunks = [];

    if (
        mediaRecorder.stream
    ) {

        mediaRecorder.stream
            .getTracks()
            .forEach(
                track => {
                    track.stop();
                }
            );
    }

    if (
        mediaRecorder.state !==
        "inactive"
    ) {
        mediaRecorder.onstop = null;
        mediaRecorder.stop();
    }

    mediaRecorder = null;

    voiceButton.textContent =
        "🎤";

    voiceButton.style.background =
        "#25d366";

    voiceCancelButton.style.display =
        "none";

    voiceStatus.style.display =
        "none";
}

// ==========================================
// UPLOAD VOICE
// ==========================================

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

            return;
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

        if (
            sender ===
            Number(otherUser.id)
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
            Number(data.userId) !==
            Number(otherUser.id)
        ) {
            return;
        }

        userStatus.textContent =
            "typing...";
    }
);

// ==========================================
// STOP TYPING RECEIVED
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
            Number(data.userId) !==
            Number(otherUser.id)
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
            Number(data.userId) !==
            Number(otherUser.id)
        ) {
            return;
        }

        if (data.online) {

            otherUserOnline = true;

            userStatus.textContent =
                "online";

        } else {

            otherUserOnline = false;

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

            otherUserOnline = true;

            userStatus.textContent =
                "online";

            return;
        }

        otherUserOnline = false;

        if (data.user.last_seen) {

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

function formatLastSeen(value) {

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
            Number(data.userId) !==
            Number(otherUser.id)
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
// CALL EVENTS
// ==========================================

socket.on(
    "call-error",
    data => {

        alert(
            data?.message ||
            "کۆڵ نەکرا."
        );
    }
);

socket.on(
    "call-ringing",
    data => {

        console.log(
            "Call ringing:",
            data
        );
    }
);

socket.on(
    "incoming-call",
    data => {

        console.log(
            "Incoming call:",
            data
        );
    }
);

socket.on(
    "call-accepted",
    data => {

        console.log(
            "Call accepted:",
            data
        );
    }
);

socket.on(
    "call-rejected",
    data => {

        alert(
            "پەیوەندی ڕەتکرایەوە."
        );
    }
);

socket.on(
    "call-ended",
    () => {

        console.log(
            "Call ended"
        );
    }
);

// ==========================================
// WEBRTC SIGNALS
// ==========================================

socket.on(
    "webrtc-offer",
    data => {

        window.dispatchEvent(
            new CustomEvent(
                "private-chat-webrtc-offer",
                {
                    detail: data
                }
            )
        );
    }
);

socket.on(
    "webrtc-answer",
    data => {

        window.dispatchEvent(
            new CustomEvent(
                "private-chat-webrtc-answer",
                {
                    detail: data
                }
            )
        );
    }
);

socket.on(
    "webrtc-ice-candidate",
    data => {

        window.dispatchEvent(
            new CustomEvent(
                "private-chat-webrtc-ice",
                {
                    detail: data
                }
            )
        );
    }
);

// ==========================================
// SCROLL
// ==========================================

function scrollMessages() {

    messagesContainer.scrollTop =
        messagesContainer.scrollHeight;
}

// ==========================================
// LOGOUT
// ==========================================

logoutButton.addEventListener(
    "click",
    () => {

        stopTyping();

        if (isRecordingVoice) {
            cancelVoiceRecording();
        }

        localStorage.removeItem(
            "privateChatUser"
        );

        currentUser = null;
        otherUser = null;

        otherUserOnline = false;
        isTyping = false;

        if (socket.connected) {
            socket.disconnect();
        }

        location.reload();
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

        isTyping = false;
    }
);

// ==========================================
// START
// ==========================================

restoreLogin();