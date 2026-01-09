// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyDRq3MqUFsvUVw7pfeh7wRo1pEeXXX__1I",
  authDomain: "syncctracker.firebaseapp.com",
  projectId: "syncctracker",
  storageBucket: "syncctracker.firebasestorage.app",
  messagingSenderId: "343712732678",
  appId: "1:343712732678:web:98ea4c9f548d83db4b9587",
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Global variables
let currentUser = null;
let currentEntry = null;
let timerInterval = null;
let entries = [];
let filteredEntries = [];
let editingIndex = null;
let isPaused = false;
let pausedTime = 0;
let notificationPermission = false;
let lastMilestoneHour = 0;
let weeklyChart = null;
let dailyChart = null;

// Request notification permission
if ("Notification" in window && Notification.permission === "default") {
  Notification.requestPermission().then((permission) => {
    notificationPermission = permission === "granted";
    if (notificationPermission) {
      showNotification(
        "Notifications enabled! You'll get alerts at timer milestones.",
        "info"
      );
    }
  });
} else if ("Notification" in window && Notification.permission === "granted") {
  notificationPermission = true;
}

// Authentication functions
function showNotification(message, type = "success") {
  const notif = document.createElement("div");
  notif.className = `notification ${type}`;
  notif.textContent = message;
  document.body.appendChild(notif);

  setTimeout(() => {
    notif.remove();
  }, 4000);

  if (notificationPermission && (type === "warning" || type === "info")) {
    try {
      new Notification("Work Timer", {
        body: message,
        icon: "⏱️",
        badge: "⏱️",
      });
    } catch (e) {
      console.log("Notification failed:", e);
    }
  }

  if (type === "success" || type === "warning") {
    playSound(type === "success" ? "success" : "alert");
  }
}

function playSound(type) {
  try {
    const audioContext = new (window.AudioContext ||
      window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    if (type === "start") {
      oscillator.frequency.value = 800;
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(
        0.01,
        audioContext.currentTime + 0.15
      );
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.15);
    } else if (type === "stop" || type === "success") {
      oscillator.frequency.value = 600;
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(
        0.01,
        audioContext.currentTime + 0.2
      );
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.2);
    } else if (type === "alert") {
      oscillator.frequency.value = 1000;
      gainNode.gain.setValueAtTime(0.25, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(
        0.01,
        audioContext.currentTime + 0.3
      );
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    }
  } catch (e) {
    console.log("Audio failed:", e);
  }
}

function checkAuth() {
  auth.onAuthStateChanged((user) => {
    if (user) {
      currentUser = user;
      showApp();
      loadEntries();
    } else {
      // Check for remembered credentials
      const savedEmail = localStorage.getItem("savedEmail");
      const savedPassword = localStorage.getItem("savedPassword");
      const rememberMe = localStorage.getItem("rememberMe") === "true";

      if (rememberMe && savedEmail && savedPassword) {
        document.getElementById("loginUsername").value = savedEmail;
        document.getElementById("loginPassword").value = savedPassword;
        document.getElementById("rememberMe").checked = true;
      }
    }
  });
}

function togglePasswordVisibility(inputId, button) {
  const input = document.getElementById(inputId);
  if (input.type === "password") {
    input.type = "text";
    button.textContent = "🙈";
  } else {
    input.type = "password";
    button.textContent = "👁️";
  }
}

function showSignup() {
  document.getElementById("loginForm").style.display = "none";
  document.getElementById("signupForm").style.display = "block";
  document.getElementById("forgotPasswordForm").style.display = "none";
  document.getElementById("authError").textContent = "";
}

function showLogin() {
  document.getElementById("loginForm").style.display = "block";
  document.getElementById("signupForm").style.display = "none";
  document.getElementById("forgotPasswordForm").style.display = "none";
  document.getElementById("authError").textContent = "";
}

function showForgotPassword() {
  document.getElementById("loginForm").style.display = "none";
  document.getElementById("signupForm").style.display = "none";
  document.getElementById("forgotPasswordForm").style.display = "block";
  document.getElementById("authError").textContent = "";
}

function resetPassword() {
  const email = document.getElementById("forgotUsername").value.trim();

  if (!email) {
    document.getElementById("authError").textContent =
      "Please enter your email";
    return;
  }

  auth
    .sendPasswordResetEmail(email)
    .then(() => {
      showNotification(
        "Password reset email sent! Check your inbox.",
        "success"
      );
      document.getElementById("forgotUsername").value = "";
      showLogin();
    })
    .catch((error) => {
      document.getElementById("authError").textContent = error.message;
    });
}

function login(event) {
  if (event) event.preventDefault();

  const email = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;
  const rememberMe = document.getElementById("rememberMe").checked;

  if (!email || !password) {
    document.getElementById("authError").textContent =
      "Please enter email and password";
    return;
  }

  auth
    .signInWithEmailAndPassword(email, password)
    .then((userCredential) => {
      if (rememberMe) {
        localStorage.setItem("savedEmail", email);
        localStorage.setItem("savedPassword", password);
        localStorage.setItem("rememberMe", "true");
      } else {
        localStorage.removeItem("savedEmail");
        localStorage.removeItem("savedPassword");
        localStorage.setItem("rememberMe", "false");
      }

      currentUser = userCredential.user;
      showApp();
      loadEntries();
    })
    .catch((error) => {
      document.getElementById("authError").textContent = error.message;
    });
}

function signup(event) {
  if (event) event.preventDefault();

  const email = document.getElementById("signupUsername").value.trim();
  const password = document.getElementById("signupPassword").value;

  if (!email || !password) {
    document.getElementById("authError").textContent =
      "Please enter email and password";
    return;
  }

  if (password.length < 6) {
    document.getElementById("authError").textContent =
      "Password must be at least 6 characters";
    return;
  }

  auth
    .createUserWithEmailAndPassword(email, password)
    .then((userCredential) => {
      localStorage.setItem("savedEmail", email);
      localStorage.setItem("savedPassword", password);
      localStorage.setItem("rememberMe", "true");

      currentUser = userCredential.user;
      showApp();
      loadEntries();
    })
    .catch((error) => {
      document.getElementById("authError").textContent = error.message;
    });
}

function logout() {
  if (currentEntry) {
    if (confirm("Timer is running. Stop and save before logging out?")) {
      stopTimer();
    }
  }

  auth.signOut().then(() => {
    currentUser = null;
    entries = [];
    document.getElementById("authContainer").style.display = "block";
    document.getElementById("appContainer").style.display = "none";
  });
}

function showApp() {
  document.getElementById("authContainer").style.display = "none";
  document.getElementById("appContainer").style.display = "block";
  document.getElementById("userEmail").textContent = currentUser.email;
}

function loadEntries() {
  if (!currentUser) return;

  showSyncStatus("Loading...");

  db.collection("users")
    .doc(currentUser.uid)
    .collection("entries")
    .orderBy("start", "desc")
    .get()
    .then((snapshot) => {
      entries = [];
      snapshot.forEach((doc) => {
        entries.push({ id: doc.id, ...doc.data() });
      });
      filteredEntries = [...entries];
      updateEntriesList();
      updateSummaryCards();
      showSyncStatus("Loaded ✓");
    })
    .catch((error) => {
      console.error("Error loading entries:", error);
      showNotification("Error loading entries", "error");
    });
}

function saveEntry(entry) {
  if (!currentUser) return;

  showSyncStatus("Saving...");

  // Remove local id if exists, Firestore will create one
  const entryData = { ...entry };
  delete entryData.id;

  db.collection("users")
    .doc(currentUser.uid)
    .collection("entries")
    .add(entryData)
    .then(() => {
      showSyncStatus("Saved ✓");
      loadEntries(); // Reload to get Firestore ID
    })
    .catch((error) => {
      console.error("Error saving entry:", error);
      showNotification("Error saving entry", "error");
    });
}

function updateEntry(entryId, updatedData) {
  if (!currentUser) return;

  showSyncStatus("Saving...");

  const entryData = { ...updatedData };
  delete entryData.id;

  db.collection("users")
    .doc(currentUser.uid)
    .collection("entries")
    .doc(entryId)
    .update(entryData)
    .then(() => {
      showSyncStatus("Updated ✓");
      loadEntries();
    })
    .catch((error) => {
      console.error("Error updating entry:", error);
      showNotification("Error updating entry", "error");
    });
}

function deleteEntryFromDB(entryId) {
  if (!currentUser) return;

  db.collection("users")
    .doc(currentUser.uid)
    .collection("entries")
    .doc(entryId)
    .delete()
    .then(() => {
      showSyncStatus("Deleted ✓");
      loadEntries();
    })
    .catch((error) => {
      console.error("Error deleting entry:", error);
      showNotification("Error deleting entry", "error");
    });
}

function showSyncStatus(message) {
  const status = document.getElementById("syncStatus");
  status.textContent = message;
  setTimeout(() => {
    status.textContent = "";
  }, 2000);
}

// Summary Cards
function updateSummaryCards() {
  const now = new Date();
  const today = now.toLocaleDateString();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  let todayTotal = 0;
  let weekTotal = 0;
  let monthTotal = 0;

  entries.forEach((entry) => {
    const entryDate = new Date(entry.start);

    if (entry.date === today) {
      todayTotal += entry.duration;
    }
    if (entryDate >= weekStart) {
      weekTotal += entry.duration;
    }
    if (entryDate >= monthStart) {
      monthTotal += entry.duration;
    }
  });

  document.getElementById("todayTotal").textContent =
    formatDuration(todayTotal);
  document.getElementById("weekTotal").textContent = formatDuration(weekTotal);
  document.getElementById("monthTotal").textContent =
    formatDuration(monthTotal);
  document.getElementById("totalEntries").textContent = entries.length;
}

// Filters
function applyFilters() {
  const searchTerm = document.getElementById("searchInput").value.toLowerCase();
  const fromDate = document.getElementById("fromDate").value;
  const toDate = document.getElementById("toDate").value;

  filteredEntries = entries.filter((entry) => {
    if (searchTerm && !entry.task.toLowerCase().includes(searchTerm)) {
      return false;
    }

    const entryDate = new Date(entry.start);
    if (fromDate && entryDate < new Date(fromDate)) {
      return false;
    }
    if (toDate && entryDate > new Date(toDate + "T23:59:59")) {
      return false;
    }

    return true;
  });

  updateEntriesList();
}

function setQuickFilter(type) {
  const now = new Date();
  let fromDate, toDate;

  if (type === "today") {
    fromDate = toDate = now.toISOString().split("T")[0];
  } else if (type === "week") {
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    fromDate = weekStart.toISOString().split("T")[0];
    toDate = new Date().toISOString().split("T")[0];
  } else if (type === "month") {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    fromDate = monthStart.toISOString().split("T")[0];
    toDate = new Date().toISOString().split("T")[0];
  }

  document.getElementById("fromDate").value = fromDate;
  document.getElementById("toDate").value = toDate;
  applyFilters();
}

function clearFilters() {
  document.getElementById("searchInput").value = "";
  document.getElementById("fromDate").value = "";
  document.getElementById("toDate").value = "";
  filteredEntries = [...entries];
  updateEntriesList();
}

// Tabs
function switchTab(tab) {
  document
    .querySelectorAll(".tab")
    .forEach((t) => t.classList.remove("active"));
  document
    .querySelectorAll(".tab-content")
    .forEach((c) => c.classList.remove("active"));

  event.target.classList.add("active");
  document.getElementById(tab + "Tab").classList.add("active");

  if (tab === "stats") {
    updateStatistics();
  }
}

// Statistics
function updateStatistics() {
  if (entries.length === 0) return;

  const totalDuration = entries.reduce((sum, e) => sum + e.duration, 0);
  const uniqueDays = new Set(entries.map((e) => e.date)).size;
  const avgDaily = totalDuration / uniqueDays / 3600000;

  const dayTotals = {};
  entries.forEach((entry) => {
    if (!dayTotals[entry.date]) dayTotals[entry.date] = 0;
    dayTotals[entry.date] += entry.duration;
  });
  const bestDayDate = Object.keys(dayTotals).reduce((a, b) =>
    dayTotals[a] > dayTotals[b] ? a : b
  );
  const bestDayName = new Date(
    entries.find((e) => e.date === bestDayDate).start
  ).toLocaleDateString("en-US", { weekday: "short" });

  const longest = entries.reduce(
    (max, e) => (e.duration > max ? e.duration : max),
    0
  );

  document.getElementById("avgDaily").textContent = avgDaily.toFixed(1) + "h";
  document.getElementById("bestDay").textContent = bestDayName;
  document.getElementById("longestSession").textContent =
    formatDuration(longest);
  document.getElementById("totalAllTime").textContent =
    formatDuration(totalDuration);

  updateWeeklyChart();
  updateDailyChart();
}

function updateWeeklyChart() {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const weekData = new Array(7).fill(0);

  entries.forEach((entry) => {
    const day = new Date(entry.start).getDay();
    weekData[day] += entry.duration / 3600000;
  });

  const ctx = document.getElementById("weeklyChart");
  if (weeklyChart) weeklyChart.destroy();

  weeklyChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: days,
      datasets: [
        {
          label: "Hours Worked",
          data: weekData,
          backgroundColor: "#A3A380",
          borderRadius: 8,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: "Hours" },
        },
      },
    },
  });
}

function updateDailyChart() {
  const labels = [];
  const data = [];
  const today = new Date();

  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toLocaleDateString();
    const dayName = date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });

    labels.push(dayName);

    const dayTotal =
      entries
        .filter((e) => e.date === dateStr)
        .reduce((sum, e) => sum + e.duration, 0) / 3600000;

    data.push(dayTotal);
  }

  const ctx = document.getElementById("dailyChart");
  if (dailyChart) dailyChart.destroy();

  dailyChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Hours",
          data: data,
          borderColor: "#D8A48F",
          backgroundColor: "rgba(216, 164, 143, 0.1)",
          fill: true,
          tension: 0.4,
          borderWidth: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: "Hours" },
        },
      },
    },
  });
}

// Timer functions
function toggleTimer() {
  if (currentEntry) {
    stopTimer();
  } else {
    startTimer();
  }
}

function startTimer() {
  const taskName =
    document.getElementById("taskInput").value.trim() || "Untitled task";

  currentEntry = {
    task: taskName,
    start: Date.now() - pausedTime,
    elapsed: 0,
  };

  isPaused = false;
  lastMilestoneHour = 0;
  timerInterval = setInterval(updateCurrentTimer, 100);

  document.getElementById("currentTaskName").textContent = taskName;
  document.getElementById("currentTimer").style.display = "block";
  document.getElementById("toggleBtn").classList.add("running");
  document.getElementById("btnIcon").textContent = "■";
  document.getElementById("btnText").textContent = "Stop";
  document.getElementById("taskInput").value = "";
  document.getElementById("pauseBtn").style.display = "flex";
  document.getElementById("pauseBtn").classList.remove("paused");
  document.getElementById("pauseIcon").textContent = "⏸";
  document.getElementById("pauseText").textContent = "Pause";
  document.getElementById("timerMilestone").style.display = "none";

  playSound("start");
  showNotification("Timer started! 🚀", "info");
}

function togglePause() {
  if (isPaused) {
    isPaused = false;
    currentEntry.start = Date.now() - pausedTime;
    timerInterval = setInterval(updateCurrentTimer, 100);
    document.getElementById("pauseBtn").classList.remove("paused");
    document.getElementById("pauseIcon").textContent = "⏸";
    document.getElementById("pauseText").textContent = "Pause";
  } else {
    isPaused = true;
    pausedTime = Date.now() - currentEntry.start;
    clearInterval(timerInterval);
    document.getElementById("pauseBtn").classList.add("paused");
    document.getElementById("pauseIcon").textContent = "▶";
    document.getElementById("pauseText").textContent = "Resume";
  }
}

function stopTimer() {
  if (!currentEntry) return;

  clearInterval(timerInterval);

  const duration = isPaused ? pausedTime : Date.now() - currentEntry.start;

  const entry = {
    task: currentEntry.task,
    start: Date.now() - duration,
    end: Date.now(),
    duration: duration,
    date: new Date(Date.now() - duration).toLocaleDateString(),
  };

  saveEntry(entry);

  currentEntry = null;
  isPaused = false;
  pausedTime = 0;
  lastMilestoneHour = 0;
  document.getElementById("currentTimer").style.display = "none";
  document.getElementById("toggleBtn").classList.remove("running");
  document.getElementById("btnIcon").textContent = "▶";
  document.getElementById("btnText").textContent = "Start";
  document.getElementById("pauseBtn").style.display = "none";

  playSound("stop");
  showNotification(
    `✅ Task completed! Duration: ${formatDuration(duration)}`,
    "success"
  );
}

function updateCurrentTimer() {
  if (!currentEntry) return;

  const elapsed = isPaused ? pausedTime : Date.now() - currentEntry.start;
  document.getElementById("currentTaskTime").textContent = formatTime(elapsed);

  const hours = Math.floor(elapsed / 3600000);
  const minutes = Math.floor((elapsed % 3600000) / 60000);

  if (hours > lastMilestoneHour && hours <= 4) {
    lastMilestoneHour = hours;
    const milestone = document.getElementById("timerMilestone");

    if (hours === 1) {
      milestone.textContent = "🎉 1 hour completed! Great focus!";
      milestone.style.display = "block";
      showNotification("⏱️ 1 hour milestone reached! Keep going!", "info");
    } else if (hours === 2) {
      milestone.textContent = "💪 2 hours! You're on a roll!";
      milestone.style.display = "block";
      showNotification("⏱️ 2 hours of focused work! Awesome!", "info");
    } else if (hours === 3) {
      milestone.textContent = "🔥 3 hours! Incredible productivity!";
      milestone.style.display = "block";
      showNotification("⏱️ 3 hours! You're crushing it!", "info");
    } else if (hours === 4) {
      milestone.textContent = "⚠️ 4 hours! Consider taking a break 😊";
      milestone.style.display = "block";
      showNotification("⚠️ 4 hours of work! Time for a break?", "warning");
    }

    setTimeout(() => {
      milestone.style.display = "none";
    }, 8000);
  }

  if (hours === 0 && minutes === 30 && lastMilestoneHour === 0) {
    const milestone = document.getElementById("timerMilestone");
    milestone.textContent = "⏱️ 30 minutes! Halfway to your first hour!";
    milestone.style.display = "block";
    showNotification("30 minutes completed! 👍", "info");
    setTimeout(() => {
      milestone.style.display = "none";
    }, 5000);
  }
}

function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0"
  )}:${String(seconds).padStart(2, "0")}`;
}

function formatDuration(ms) {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatTimeRange(start, end) {
  const startTime = new Date(start).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const endTime = new Date(end).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${startTime} - ${endTime}`;
}

function formatDateTimeLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function updateEntriesList() {
  const list = document.getElementById("sessionsList");

  if (filteredEntries.length === 0) {
    list.innerHTML =
      '<div class="empty-state">No entries found. Try adjusting your filters or start tracking!</div>';
  } else {
    let html = "";
    let currentDate = null;

    filteredEntries.forEach((entry, index) => {
      if (entry.date !== currentDate) {
        currentDate = entry.date;
        const dateObj = new Date(entry.start);
        const today = new Date().toLocaleDateString();
        const yesterday = new Date(Date.now() - 86400000).toLocaleDateString();

        let dateLabel = entry.date;
        if (entry.date === today) dateLabel = "Today";
        else if (entry.date === yesterday) dateLabel = "Yesterday";

        html += `<div class="date-separator">${dateLabel}</div>`;
      }

      html += `
                <div class="session-item">
                    <div class="session-info">
                        <div class="session-task">${entry.task}</div>
                        <div class="session-time">${formatTimeRange(
                          entry.start,
                          entry.end
                        )}</div>
                    </div>
                    <div class="session-duration">${formatDuration(
                      entry.duration
                    )}</div>
                    <div class="session-actions">
                        <button class="duplicate-btn" onclick="duplicateEntry(${index})" title="Duplicate this task">📋 Duplicate</button>
                        <button class="edit-btn" onclick="openEditModal(${index})">Edit</button>
                        <button class="delete-btn" onclick="deleteEntry(${index})">Delete</button>
                    </div>
                </div>
            `;
    });

    list.innerHTML = html;
  }

  const total = filteredEntries.reduce((sum, entry) => sum + entry.duration, 0);
  const totalHours = Math.floor(total / 3600000);
  const totalMinutes = Math.floor((total % 3600000) / 60000);

  document.getElementById(
    "totalTime"
  ).textContent = `Total: ${totalHours}h ${totalMinutes}m`;
}

function duplicateEntry(index) {
  const entry = filteredEntries[index];
  document.getElementById("taskInput").value = entry.task;
  document.getElementById("taskInput").focus();

  window.scrollTo({ top: 0, behavior: "smooth" });

  showNotification(`📋 Task "${entry.task}" ready to start!`, "info");
}

function openEditModal(index) {
  editingIndex = index;
  const entry = filteredEntries[index];

  document.getElementById("editTask").value = entry.task;

  const startDate = new Date(entry.start);
  const endDate = new Date(entry.end);

  document.getElementById("editStart").value = formatDateTimeLocal(startDate);
  document.getElementById("editEnd").value = formatDateTimeLocal(endDate);

  document.getElementById("editModal").classList.add("active");
}

function closeEditModal() {
  document.getElementById("editModal").classList.remove("active");
  editingIndex = null;
}

function saveEdit() {
  if (editingIndex === null) return;

  const newTask = document.getElementById("editTask").value.trim();
  const newStart = new Date(
    document.getElementById("editStart").value
  ).getTime();
  const newEnd = new Date(document.getElementById("editEnd").value).getTime();

  if (!newTask || !newStart || !newEnd) {
    alert("Please fill in all fields");
    return;
  }

  if (newEnd <= newStart) {
    alert("End time must be after start time");
    return;
  }

  const entry = filteredEntries[editingIndex];
  const updatedEntry = {
    task: newTask,
    start: newStart,
    end: newEnd,
    duration: newEnd - newStart,
    date: new Date(newStart).toLocaleDateString(),
  };

  updateEntry(entry.id, updatedEntry);
  closeEditModal();
  showNotification("Entry updated successfully!", "success");
}

function deleteEntry(index) {
  if (!confirm("Delete this entry?")) return;

  const entry = filteredEntries[index];
  deleteEntryFromDB(entry.id);
}

function exportToCSV() {
  if (filteredEntries.length === 0) {
    alert("No entries to export");
    return;
  }

  let csv =
    "Date,Task,Start Time,End Time,Duration (hours),Duration (minutes)\n";

  filteredEntries.forEach((entry) => {
    const date = new Date(entry.start).toLocaleDateString();
    const startTime = new Date(entry.start).toLocaleTimeString();
    const endTime = new Date(entry.end).toLocaleTimeString();
    const durationHours = (entry.duration / 3600000).toFixed(2);
    const durationMinutes = Math.floor(entry.duration / 60000);

    const task = entry.task.replace(/"/g, '""');

    csv += `"${date}","${task}","${startTime}","${endTime}",${durationHours},${durationMinutes}\n`;
  });

  const totalDuration = filteredEntries.reduce(
    (sum, entry) => sum + entry.duration,
    0
  );
  const totalHours = (totalDuration / 3600000).toFixed(2);
  const totalMinutes = Math.floor(totalDuration / 60000);
  csv += `\n"TOTAL","","","",${totalHours},${totalMinutes}\n`;

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `work-log-${new Date().toISOString().split("T")[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showNotification("📊 Exported to CSV successfully!", "success");
}

function exportEntries() {
  if (filteredEntries.length === 0) {
    alert("No entries to export");
    return;
  }

  let text = "REMOTE WORK TIME LOG\n";
  text += "=".repeat(60) + "\n\n";

  let currentDate = null;
  filteredEntries.forEach((entry) => {
    if (entry.date !== currentDate) {
      currentDate = entry.date;
      text += `\n${entry.date}\n`;
      text += "-".repeat(60) + "\n";
    }

    text += `${entry.task}\n`;
    text += `  ${formatTimeRange(entry.start, entry.end)} (${formatDuration(
      entry.duration
    )})\n\n`;
  });

  const total = filteredEntries.reduce((sum, entry) => sum + entry.duration, 0);
  const totalHours = Math.floor(total / 3600000);
  const totalMinutes = Math.floor((total % 3600000) / 60000);

  text += "=".repeat(60) + "\n";
  text += `TOTAL TIME: ${totalHours}h ${totalMinutes}m\n`;

  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `work-log-${new Date().toISOString().split("T")[0]}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

// Keyboard shortcuts
document.addEventListener("keydown", function (e) {
  if (document.getElementById("appContainer").style.display === "none") return;
  if (e.target.tagName === "INPUT" && e.target.id !== "taskInput" && !e.altKey)
    return;

  if (e.altKey && e.key.toLowerCase() === "s") {
    e.preventDefault();
    toggleTimer();
  }

  if (e.altKey && e.key.toLowerCase() === "p" && currentEntry) {
    e.preventDefault();
    togglePause();
  }

  if (e.altKey && e.key.toLowerCase() === "e") {
    e.preventDefault();
    exportToCSV();
  }

  if (e.altKey && e.key.toLowerCase() === "d" && entries.length > 0) {
    e.preventDefault();
    duplicateEntry(0);
  }
});

document.getElementById("taskInput").addEventListener("keypress", function (e) {
  if (e.key === "Enter" && !currentEntry) {
    toggleTimer();
  }
});

setTimeout(() => {
  if (
    document.getElementById("appContainer").style.display !== "none" &&
    entries.length === 0
  ) {
    showNotification(
      "💡 Tip: Press Alt+S to quickly start/stop the timer!",
      "info"
    );
  }
}, 3000);

// Initialize
checkAuth();
