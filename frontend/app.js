const apiBaseUrl = "http://147.45.154.198/api"; // Backend API Base URL
const socketBaseUrl = "ws://147.45.154.198/ws/movie/"; // WebSocket Base URL

// DOM Elements
const roomListItems = document.getElementById("room-list-items");
const videoPlayer = document.getElementById("video-player");
const chatContainer = document.getElementById("chat-container");
const chatInput = document.getElementById("chat-input");
const sendButton = document.getElementById("send-button");
const userListItems = document.getElementById("user-list-items");
const qualitySelector = document.getElementById("quality-selector");
const createRoomForm = document.getElementById("create-room-form");

let hls, socket, currentRoomId = null;
let lastSyncState = { current_time: 0, is_playing: false }; // Last sent state
let isSyncing = false; // Prevent loops during sync

function getCSRFToken() {
    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i].trim();
        if (cookie.startsWith("csrftoken=")) {
            return cookie.split("=")[1];
        }
    }
    return "";
}

// Function debounce
function debounce(func, delay) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => func.apply(this, args), delay);
    };
}

// Debounced syncPlayerState
const debouncedSyncPlayerState = debounce(syncPlayerState, 300);

// --- Fetch Rooms from API ---
async function fetchRooms() {
    try {
        const response = await fetch(`${apiBaseUrl}/room/`);
        const result = await response.json();

        if (result.status === "success") {
            renderRoomList(result.data);
        } else {
            console.error("Failed to fetch rooms:", result);
        }
    } catch (error) {
        console.error("Error fetching rooms:", error);
    }
}

// --- Render Room List ---
function renderRoomList(rooms) {
    roomListItems.innerHTML = "";
    rooms.forEach((room) => {
        const roomElement = document.createElement("li");
        roomElement.textContent = `Room: ${room.room_id} (Type: ${room.room_type}, Max: ${room.max_users})`;
        roomElement.style.cursor = "pointer";
        roomElement.addEventListener("click", () => joinRoom(room.room_id, room.movie_id));
        roomListItems.appendChild(roomElement);
    });
}

// --- Join a Room ---
function joinRoom(roomId, movieId) {
    currentRoomId = roomId;
    console.log(`Joining Room: ${roomId}`);
    fetchMovieDetails(movieId);
    initializeWebSocket(roomId);
}

// --- Fetch Movie Details ---
async function fetchMovieDetails(movieId) {
    try {
        const response = await fetch(`${apiBaseUrl}/movie/${movieId}/`);
        const movie = await response.json();
        initializeVideoPlayer(movie.hls_playlist);
    } catch (error) {
        console.error("Failed to fetch movie details:", error);
    }
}

// --- Initialize Video Player ---
function initializeVideoPlayer(hlsUrl) {
    if (Hls.isSupported()) {
        hls = new Hls();
        hls.loadSource(hlsUrl);
        hls.attachMedia(videoPlayer);
        hls.on(Hls.Events.MANIFEST_PARSED, populateQualitySelector);
    } else if (videoPlayer.canPlayType("application/vnd.apple.mpegurl")) {
        videoPlayer.src = hlsUrl;
    } else {
        console.error("HLS is not supported in this browser.");
    }
}

// --- Populate Quality Selector ---
function populateQualitySelector() {
    qualitySelector.innerHTML = `<option value="auto">Auto</option>`;
    hls.levels.forEach((level, index) => {
        const option = document.createElement("option");
        option.value = index;
        option.textContent = `${level.height}p`;
        qualitySelector.appendChild(option);
    });

    qualitySelector.addEventListener("change", () => {
        hls.currentLevel = qualitySelector.value === "auto" ? -1 : parseInt(qualitySelector.value, 10);
    });
}

// --- Initialize WebSocket ---
function initializeWebSocket(roomId) {
    if (socket) socket.close();

    socket = new WebSocket(`${socketBaseUrl}${roomId}/`);

    socket.onopen = () => {
        console.log("WebSocket connected.");
        sendWebSocketMessage("get_initial_state", { room_id: roomId });
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log("Received WebSocket message:", data);
        handleWebSocketMessage(data);
    };

    socket.onerror = (error) => console.error("WebSocket error:", error);
    socket.onclose = () => {
        console.warn("WebSocket disconnected.");
    };
}

// --- Handle WebSocket Messages ---
function handleWebSocketMessage(data) {
    if (data.result) {
        switch (data.result.type) {
            case "initial_state":
                setPlayerState(data.result.state);
                updateChatMessages(data.result.messages);
                break;
            case "set_sync_state":
                setPlayerState(data.result.state);
                break;
            case "chat_message":
                addChatMessage(data.result.username || "User", data.result.message);
                break;
            case "update_users":
                renderUserList(data.result.users);
                break;
                
        }
    }
}

// --- Update Chat Messages ---
function updateChatMessages(messages) {
    chatContainer.innerHTML = "";
    messages.forEach((msg) => {
        const username = Object.keys(msg)[0]; // Extract username
        const message = msg[username]; // Extract message
        addChatMessage(username, message);
    });
}

// --- Add Chat Message ---
function addChatMessage(user, message) {
    const displayName = user || "Anonymous"; // Fallback for username
    const messageElement = document.createElement("div");
    messageElement.textContent = `${displayName}: ${message || "No message"}`; // Fallback for message
    chatContainer.appendChild(messageElement);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function renderUserList(users) {
    userListItems.innerHTML = ""; // Очистка списка
    users.forEach((user) => {
        const userElement = document.createElement("li");
        userElement.textContent = user.username || "Anonymous";
        userListItems.appendChild(userElement);
    });
}


// --- Set Video Player State ---
function setPlayerState(state) {
    if (state) {
        const currentTime = parseFloat(state.current_time || 0);
        const isPlaying = state.is_playing;

        isSyncing = true; // Prevent loops

        if (Math.abs(videoPlayer.currentTime - currentTime) > 1) {
            videoPlayer.currentTime = currentTime;
        }

        if (isPlaying && videoPlayer.paused) {
            videoPlayer.play();
        } else if (!isPlaying && !videoPlayer.paused) {
            videoPlayer.pause();
        }

        setTimeout(() => isSyncing = false, 500); // Allow sync after delay
    }
}

// --- Send Chat Message ---
sendButton.addEventListener("click", () => {
    const message = chatInput.value.trim();
    if (message && currentRoomId) {
        sendWebSocketMessage("send_chat_message", {
            room_id: currentRoomId,
            username: "User1", // Replace with dynamic user
            message: message,
        });
        chatInput.value = "";
    }
});
const csrfToken = getCSRFToken();
// --- Create Room ---
createRoomForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const roomName = document.getElementById("room-name").value.trim();
    const movieId = document.getElementById("movie-id").value.trim();
    const roomType = document.getElementById("room-type").value;
    const maxUsers = document.getElementById("max-users").value;

    try {
        const response = await fetch(`${apiBaseUrl}/room/`, {
            method: "POST",
            headers: { "Content-Type": "application/json",  "X-CSRFToken": csrfToken},
            body: JSON.stringify({
                room_id: roomName,
                movie_id: movieId,
                room_type: roomType,
                max_users: parseInt(maxUsers, 10),
            }),
        });

        const result = await response.json();
        if (result.status === "success") {
            alert("Room created successfully!");
            fetchRooms();
            createRoomForm.reset();
        } else {
            console.error("Failed to create room:", result);
        }
    } catch (error) {
        console.error("Error creating room:", error);
    }
});

// --- Video Events for Immediate Sync ---
videoPlayer.addEventListener("play", () => debouncedSyncPlayerState(true));
videoPlayer.addEventListener("pause", () => debouncedSyncPlayerState(false));
videoPlayer.addEventListener("seeked", () => debouncedSyncPlayerState(!videoPlayer.paused));

// --- Synchronize State Immediately ---
function syncPlayerState(isPlaying) {
    if (isSyncing || !currentRoomId) return; // Skip if syncing or room not set

    const currentTime = videoPlayer.currentTime;
    if (
        Math.abs(currentTime - lastSyncState.current_time) > 0.5 || // Drift > 0.5 seconds
        isPlaying !== lastSyncState.is_playing
    ) {
        sendWebSocketMessage("set_sync_state", {
            room_id: currentRoomId,
            current_time: currentTime,
            is_playing: isPlaying,
        });
        lastSyncState = { current_time: currentTime, is_playing: isPlaying };
    }
}

// --- Send WebSocket Message ---
function sendWebSocketMessage(method, params) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            jsonrpc: "2.0",
            method: method,
            params: params,
            id: 1,
        }));
    } else {
        console.error("WebSocket is not open.");
    }
}

// --- Initialize Application ---
function initializeApp() {
    fetchRooms();
}

initializeApp();
