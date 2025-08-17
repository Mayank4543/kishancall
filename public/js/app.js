// Global variables
let socket = null;
let isConnected = false;
let backgroundEmbeddingStatus = null;
let backgroundStatusInterval = null;
let logsAutoRefreshInterval = null;

// Initialize the application
document.addEventListener("DOMContentLoaded", function () {
  initializeApp();
  setupEventListeners();
  checkServerStatus();
});

// Initialize application
function initializeApp() {
  addLog("🚀 Application initialized", "info");
  refreshSystemStatus();
  refreshBackgroundStatus();
}

// Setup all event listeners
function setupEventListeners() {
  // File upload
  const fileUploadArea = document.getElementById("file-upload-area");
  const fileInput = document.getElementById("csv-file-input");

  fileUploadArea.addEventListener("click", () => fileInput.click());
  fileUploadArea.addEventListener("dragover", handleDragOver);
  fileUploadArea.addEventListener("drop", handleFileDrop);
  fileInput.addEventListener("change", handleFileSelect);

  // Buttons
  document
    .getElementById("upload-csv-btn")
    .addEventListener("click", uploadCSV);
  document
    .getElementById("generate-embeddings-btn")
    .addEventListener("click", generateEmbeddings);
  document
    .getElementById("refresh-status-btn")
    .addEventListener("click", refreshSystemStatus);
  document
    .getElementById("search-btn")
    .addEventListener("click", performSearch);
  document
    .getElementById("clear-logs-btn")
    .addEventListener("click", clearLogs);

  // Search input - Enter key
  document
    .getElementById("search-query")
    .addEventListener("keypress", function (e) {
      if (e.key === "Enter") {
        performSearch();
      }
    });

  // Quick search buttons
  document.querySelectorAll(".quick-search").forEach((btn) => {
    btn.addEventListener("click", function () {
      const query = this.getAttribute("data-query");
      document.getElementById("search-query").value = query;
      performSearch();
    });
  });

  // Background embedding controls
  document
    .getElementById("bg-start-btn")
    .addEventListener("click", startBackgroundEmbedding);
  document
    .getElementById("bg-pause-btn")
    .addEventListener("click", pauseBackgroundEmbedding);
  document
    .getElementById("bg-resume-btn")
    .addEventListener("click", resumeBackgroundEmbedding);
  document
    .getElementById("bg-stop-btn")
    .addEventListener("click", stopBackgroundEmbedding);
  document
    .getElementById("bg-apply-config")
    .addEventListener("click", applyBackgroundConfig);
  document
    .getElementById("bg-view-logs")
    .addEventListener("click", showBackgroundLogs);

  // CSV Queue controls
  document
    .getElementById("csv-queue-start-btn")
    .addEventListener("click", startCsvQueue);
  document
    .getElementById("csv-queue-stop-btn")
    .addEventListener("click", stopCsvQueue);
  document
    .getElementById("csv-queue-refresh-btn")
    .addEventListener("click", refreshCsvQueue);
  document
    .getElementById("csv-queue-clear-btn")
    .addEventListener("click", clearCsvQueue);

  // Background logs modal controls
  document
    .getElementById("refresh-logs-btn")
    .addEventListener("click", refreshBackgroundLogs);
  document
    .getElementById("clear-bg-logs-btn")
    .addEventListener("click", clearBackgroundLogs);
  document
    .getElementById("auto-refresh-logs")
    .addEventListener("change", toggleLogsAutoRefresh);
}

// File handling functions
function handleDragOver(e) {
  e.preventDefault();
  e.currentTarget.classList.add("dragover");
}

function handleFileDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove("dragover");

  const files = e.dataTransfer.files;
  if (files.length > 0) {
    handleFileSelect({ target: { files: files } });
  }
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) {
    if (file.type === "text/csv" || file.name.endsWith(".csv")) {
      displayFileInfo(file);
      document.getElementById("upload-csv-btn").disabled = false;
      addLog(
        `📁 File selected: ${file.name} (${formatFileSize(file.size)})`,
        "info"
      );
    } else {
      addLog("❌ Please select a CSV file", "error");
      alert("Please select a CSV file.");
    }
  }
}

function displayFileInfo(file) {
  document.getElementById("file-name").textContent = file.name;
  document.getElementById("file-size").textContent = formatFileSize(file.size);
  document.getElementById("file-info").style.display = "block";
}

function formatFileSize(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// API calls
async function uploadCSV() {
  const fileInput = document.getElementById("csv-file-input");
  const file = fileInput.files[0];

  if (!file) {
    addLog("❌ No file selected", "error");
    return;
  }

  const formData = new FormData();
  formData.append("csvFile", file);
  
  // Get processing options
  const processInBackground = document.getElementById("process-background").checked;
  const clearExisting = document.getElementById("clear-existing").checked;
  const generateEmbeddings = document.getElementById("generate-embeddings").checked;
  
  formData.append("processInBackground", processInBackground);
  formData.append("clearExisting", clearExisting);
  formData.append("generateEmbeddings", generateEmbeddings);

  try {
    if (processInBackground) {
      addLog("📤 Adding CSV to background processing queue...", "info");
    } else {
      showProgress("Uploading CSV file...");
      addLog("📤 Starting CSV upload...", "info");
    }

    const response = await fetch("/api/upload-csv", {
      method: "POST",
      body: formData,
    });

    const result = await response.json();

    if (response.ok) {
      if (result.processInBackground) {
        addLog(`✅ CSV added to queue: ${result.message}`, "success");
        addLog(`📋 Task ID: ${result.taskId}, Queue length: ${result.queueStatus.queueLength}`, "info");
        refreshCsvQueue(); // Refresh the queue display
      } else {
        addLog(`✅ CSV uploaded successfully: ${result.message}`, "success");
        addLog(
          `📊 Processed ${result.totalProcessed} rows, inserted ${result.totalInserted} documents`,
          "info"
        );
      }
      refreshSystemStatus();
      
      // Clear file selection
      fileInput.value = "";
      document.getElementById("file-info").style.display = "none";
      document.getElementById("upload-csv-btn").disabled = true;
    } else {
      addLog(`❌ Upload failed: ${result.error}`, "error");
    }
  } catch (error) {
    addLog(`❌ Upload error: ${error.message}`, "error");
  } finally {
    if (!processInBackground) {
      hideProgress();
    }
  }
}

async function generateEmbeddings() {
  try {
    showProgress("Generating embeddings...");
    addLog("🧠 Starting embedding generation...", "info");

    const response = await fetch("/api/generate-embeddings", {
      method: "POST",
    });

    const result = await response.json();

    if (response.ok) {
      addLog(`✅ Embedding generation started: ${result.message}`, "success");

      // Start polling for progress
      pollEmbeddingProgress();
    } else {
      addLog(`❌ Embedding generation failed: ${result.error}`, "error");
    }
  } catch (error) {
    addLog(`❌ Embedding generation error: ${error.message}`, "error");
  } finally {
    hideProgress();
  }
}

async function performSearch() {
  const query = document.getElementById("search-query").value.trim();
  const limit = parseInt(document.getElementById("search-limit").value);
  const method = document.getElementById("search-method").value;

  if (!query) {
    addLog("❌ Please enter a search query", "warning");
    return;
  }

  // Build filters
  const filters = {};
  const stateFilter = document.getElementById("filter-state").value.trim();
  const categoryFilter = document
    .getElementById("filter-category")
    .value.trim();

  if (stateFilter) filters.StateName = stateFilter;
  if (categoryFilter) filters.Category = categoryFilter;

  try {
    addLog(`🔍 Searching for: "${query}"`, "info");

    const searchStartTime = Date.now();
    const endpoint =
      method === "vector" ? "/api/search" : "/api/search-fallback";

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: query,
        topK: limit,
        filters: filters,
      }),
    });

    const result = await response.json();
    const searchTime = Date.now() - searchStartTime;

    if (response.ok) {
      displaySearchResults(result.results, query, searchTime);
      updateLastSearchTime(searchTime);
      addLog(
        `✅ Search completed in ${searchTime}ms - Found ${result.results.length} results`,
        "success"
      );
    } else {
      addLog(`❌ Search failed: ${result.error}`, "error");
      if (method === "vector" && result.error.includes("vectorSearch")) {
        addLog("🔄 Trying fallback search method...", "warning");
        document.getElementById("search-method").value = "fallback";
        setTimeout(performSearch, 1000);
      }
    }
  } catch (error) {
    addLog(`❌ Search error: ${error.message}`, "error");
  }
}

async function refreshSystemStatus() {
  try {
    const response = await fetch("/api/status");
    const status = await response.json();

    if (response.ok) {
      updateSystemStats(status);
      updateCsvQueueStatus(status.csvQueue);
      addLog("🔄 System status refreshed", "info");
    } else {
      addLog("❌ Failed to fetch system status", "error");
    }
  } catch (error) {
    addLog(`❌ Status refresh error: ${error.message}`, "error");
  }
}

async function checkServerStatus() {
  try {
    const response = await fetch("/api/status");
    if (response.ok) {
      updateConnectionStatus(true);
      addLog("✅ Connected to server", "success");
    } else {
      updateConnectionStatus(false);
    }
  } catch (error) {
    updateConnectionStatus(false);
    addLog("❌ Server connection failed", "error");
  }
}

// UI Update functions
function updateSystemStats(status) {
  document.getElementById("total-docs").textContent =
    status.database.totalDocuments.toLocaleString();
  document.getElementById("docs-with-embeddings").textContent =
    status.database.documentsWithEmbeddings.toLocaleString();
  document.getElementById("embedding-progress").textContent =
    status.database.embeddingProgress;
}

function updateConnectionStatus(connected) {
  isConnected = connected;
  const statusIndicator = document.querySelector(".status-indicator");
  const statusText = statusIndicator.nextElementSibling;

  if (connected) {
    statusIndicator.className = "status-indicator status-ready";
    statusText.textContent = "Connected";
  } else {
    statusIndicator.className = "status-indicator status-error";
    statusText.textContent = "Disconnected";
  }
}

function updateLastSearchTime(time) {
  document.getElementById("last-search-time").textContent = time + "ms";
}

function displaySearchResults(results, query, searchTime) {
  const resultsContainer = document.getElementById("search-results");
  const resultsCount = document.getElementById("results-count");

  resultsCount.textContent = `${results.length} results`;

  if (results.length === 0) {
    resultsContainer.innerHTML = `
            <div class="text-center text-muted p-4">
                <i class="fas fa-search fa-3x mb-3"></i>
                <p>No results found for "${query}"</p>
                <small>Try different keywords or check your filters</small>
            </div>
        `;
    return;
  }

  let html = "";
  results.forEach((result, index) => {
    const similarity = result.similarity
      ? (result.similarity * 100).toFixed(1)
      : "N/A";
    html += `
            <div class="search-result">
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <h6 class="mb-0">${index + 1}. ${
      result.Category || "General"
    }</h6>
                    <span class="similarity-score">${similarity}%</span>
                </div>
                <div class="row">
                    <div class="col-md-6">
                        <small class="text-muted">Location:</small>
                        <p class="mb-1">${result.StateName || "N/A"}, ${
      result.DistrictName || "N/A"
    }</p>
                    </div>
                    <div class="col-md-6">
                        <small class="text-muted">Query Type:</small>
                        <p class="mb-1">${result.QueryType || "N/A"}</p>
                    </div>
                </div>
                <div class="mt-2">
                    <small class="text-muted">Query:</small>
                    <p class="mb-1">${truncateText(
                      result.QueryText || "",
                      150
                    )}</p>
                </div>
                <div class="mt-2">
                    <small class="text-muted">Answer:</small>
                    <p class="mb-0">${truncateText(
                      result.KccAns || "",
                      200
                    )}</p>
                </div>
            </div>
        `;
  });

  resultsContainer.innerHTML = html;
}

function truncateText(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}

function showProgress(text) {
  document.querySelector(".progress-container").style.display = "block";
  document.getElementById("progress-text").textContent = text;
  document.getElementById("progress-bar").style.width = "50%";
}

function hideProgress() {
  document.querySelector(".progress-container").style.display = "none";
}

function addLog(message, type = "info") {
  const logContainer = document.getElementById("log-container");
  const timestamp = new Date().toLocaleTimeString();

  const logEntry = document.createElement("div");
  logEntry.className = `log-entry log-${type}`;
  logEntry.innerHTML = `<span class="text-muted">[${timestamp}]</span> ${message}`;

  logContainer.appendChild(logEntry);
  logContainer.scrollTop = logContainer.scrollHeight;

  // Keep only last 100 log entries
  const logEntries = logContainer.querySelectorAll(".log-entry");
  if (logEntries.length > 100) {
    logEntries[0].remove();
  }
}

function clearLogs() {
  document.getElementById("log-container").innerHTML = "";
  addLog("📝 Logs cleared", "info");
}

// Polling for embedding progress
async function pollEmbeddingProgress() {
  const pollInterval = setInterval(async () => {
    try {
      const response = await fetch("/api/status");
      const status = await response.json();

      if (response.ok) {
        updateSystemStats(status);

        // Check if embeddings are complete
        const progress = parseFloat(status.database.embeddingProgress);
        if (progress >= 100) {
          addLog("🎉 Embedding generation completed!", "success");
          clearInterval(pollInterval);
        } else {
          addLog(
            `⚡ Embedding progress: ${status.database.embeddingProgress}`,
            "info"
          );
        }
      }
    } catch (error) {
      console.error("Polling error:", error);
    }
  }, 5000); // Poll every 5 seconds

  // Stop polling after 10 minutes
  setTimeout(() => {
    clearInterval(pollInterval);
    addLog("⏱️ Stopped polling for embedding progress", "warning");
  }, 600000);
}

// Auto-refresh status every 30 seconds
setInterval(refreshSystemStatus, 30000);

// ==========================================
// BACKGROUND EMBEDDING FUNCTIONS
// ==========================================

// Start background embedding generation
async function startBackgroundEmbedding() {
  try {
    addLog("🚀 Starting background embedding generation...", "info");

    const config = getBackgroundConfig();

    const response = await fetch("/api/background-embeddings/start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(config),
    });

    const result = await response.json();

    if (response.ok) {
      addLog(`✅ Background embedding started: ${result.message}`, "success");
      updateBackgroundControls(result.status);
      startBackgroundStatusPolling();
    } else {
      addLog(
        `❌ Failed to start background embedding: ${result.error}`,
        "error"
      );
    }
  } catch (error) {
    addLog(`❌ Background embedding start error: ${error.message}`, "error");
  }
}

// Pause background embedding generation
async function pauseBackgroundEmbedding() {
  try {
    addLog("⏸️ Pausing background embedding generation...", "info");

    const response = await fetch("/api/background-embeddings/pause", {
      method: "POST",
    });

    const result = await response.json();

    if (response.ok) {
      addLog(`✅ Background embedding paused: ${result.message}`, "success");
      updateBackgroundControls(result.status);
    } else {
      addLog(
        `❌ Failed to pause background embedding: ${result.error}`,
        "error"
      );
    }
  } catch (error) {
    addLog(`❌ Background embedding pause error: ${error.message}`, "error");
  }
}

// Resume background embedding generation
async function resumeBackgroundEmbedding() {
  try {
    addLog("▶️ Resuming background embedding generation...", "info");

    const response = await fetch("/api/background-embeddings/resume", {
      method: "POST",
    });

    const result = await response.json();

    if (response.ok) {
      addLog(`✅ Background embedding resumed: ${result.message}`, "success");
      updateBackgroundControls(result.status);
    } else {
      addLog(
        `❌ Failed to resume background embedding: ${result.error}`,
        "error"
      );
    }
  } catch (error) {
    addLog(`❌ Background embedding resume error: ${error.message}`, "error");
  }
}

// Stop background embedding generation
async function stopBackgroundEmbedding() {
  try {
    addLog("🛑 Stopping background embedding generation...", "info");

    const response = await fetch("/api/background-embeddings/stop", {
      method: "POST",
    });

    const result = await response.json();

    if (response.ok) {
      addLog(`✅ Background embedding stopped: ${result.message}`, "success");
      updateBackgroundControls(result.status);
      stopBackgroundStatusPolling();
    } else {
      addLog(
        `❌ Failed to stop background embedding: ${result.error}`,
        "error"
      );
    }
  } catch (error) {
    addLog(`❌ Background embedding stop error: ${error.message}`, "error");
  }
}

// Apply background configuration
async function applyBackgroundConfig() {
  try {
    const config = getBackgroundConfig();

    const response = await fetch("/api/background-embeddings/config", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(config),
    });

    const result = await response.json();

    if (response.ok) {
      addLog(`✅ Configuration applied: ${result.message}`, "success");
    } else {
      addLog(`❌ Failed to apply configuration: ${result.error}`, "error");
    }
  } catch (error) {
    addLog(`❌ Configuration error: ${error.message}`, "error");
  }
}

// Get background configuration from form
function getBackgroundConfig() {
  return {
    batchSize: parseInt(document.getElementById("bg-batch-size").value),
    delayBetweenBatches: parseInt(document.getElementById("bg-delay").value),
    retryAttempts: parseInt(document.getElementById("bg-retry").value),
    priority: document.getElementById("bg-priority").value,
    skipExisting: true,
  };
}

// Refresh background status
async function refreshBackgroundStatus() {
  try {
    const response = await fetch(
      "/api/background-embeddings/status?detailed=true"
    );
    const result = await response.json();

    if (response.ok) {
      backgroundEmbeddingStatus = result.status;
      updateBackgroundControls(result.status);
      updateBackgroundDetails(result.status);
    }
  } catch (error) {
    console.error("Background status refresh error:", error);
  }
}

// Update background controls based on status
function updateBackgroundControls(status) {
  const startBtn = document.getElementById("bg-start-btn");
  const pauseBtn = document.getElementById("bg-pause-btn");
  const resumeBtn = document.getElementById("bg-resume-btn");
  const stopBtn = document.getElementById("bg-stop-btn");

  const statusElement = document.getElementById("bg-status");
  const progressElement = document.getElementById("bg-progress");
  const progressBar = document.getElementById("bg-progress-bar");
  const detailsElement = document.getElementById("bg-status-details");

  // Update status badge
  if (status.isRunning && !status.isPaused) {
    statusElement.className = "badge bg-success";
    statusElement.textContent = "Running";
  } else if (status.isPaused) {
    statusElement.className = "badge bg-warning";
    statusElement.textContent = "Paused";
  } else if (status.isStopping) {
    statusElement.className = "badge bg-info";
    statusElement.textContent = "Stopping";
  } else {
    statusElement.className = "badge bg-secondary";
    statusElement.textContent = "Not Running";
  }

  // Update progress
  const progress = parseFloat(status.progress) || 0;
  progressElement.textContent = `${progress}%`;
  progressBar.style.width = `${progress}%`;

  if (progress > 0) {
    progressBar.className =
      "progress-bar progress-bar-striped progress-bar-animated";
  } else {
    progressBar.className = "progress-bar";
  }

  // Update button states
  startBtn.disabled = status.isRunning;
  pauseBtn.disabled = !status.isRunning || status.isPaused || status.isStopping;
  resumeBtn.disabled = !status.isPaused;
  stopBtn.disabled = !status.isRunning || status.isStopping;

  // Show/hide details
  if (status.isRunning || status.processedDocuments > 0) {
    detailsElement.style.display = "block";
  } else {
    detailsElement.style.display = "none";
  }
}

// Update background details
function updateBackgroundDetails(status) {
  if (!status) return;

  document.getElementById("bg-processed").textContent =
    status.processedDocuments || 0;
  document.getElementById("bg-success").textContent =
    status.successDocuments || 0;
  document.getElementById("bg-failed").textContent =
    status.failedDocuments || 0;
  document.getElementById("bg-elapsed").textContent =
    status.elapsedTimeFormatted || "0s";
  document.getElementById("bg-eta").textContent =
    status.estimatedTimeRemainingFormatted || "N/A";
  document.getElementById("bg-batch").textContent = status.currentBatch || 0;
}

// Start polling background status
function startBackgroundStatusPolling() {
  if (backgroundStatusInterval) {
    clearInterval(backgroundStatusInterval);
  }

  backgroundStatusInterval = setInterval(refreshBackgroundStatus, 2000); // Poll every 2 seconds
}

// Stop polling background status
function stopBackgroundStatusPolling() {
  if (backgroundStatusInterval) {
    clearInterval(backgroundStatusInterval);
    backgroundStatusInterval = null;
  }
}

// Show background logs modal
function showBackgroundLogs() {
  const modal = new bootstrap.Modal(document.getElementById("bg-logs-modal"));
  modal.show();
  refreshBackgroundLogs();
}

// Refresh background logs
async function refreshBackgroundLogs() {
  try {
    const level = document.getElementById("log-level-filter").value;
    const limit = document.getElementById("log-limit").value;

    let url = `/api/background-embeddings/logs?limit=${limit}`;
    if (level) {
      url += `&level=${level}`;
    }

    const response = await fetch(url);
    const result = await response.json();

    if (response.ok) {
      displayBackgroundLogs(result.logs);
      updateLogStats(result.logs);
    } else {
      console.error("Failed to fetch logs:", result.error);
    }
  } catch (error) {
    console.error("Log refresh error:", error);
  }
}

// Display background logs
function displayBackgroundLogs(logs) {
  const logsContainer = document.getElementById("bg-logs-content");

  if (!logs || logs.length === 0) {
    logsContainer.innerHTML = '<div class="text-muted">No logs available</div>';
    return;
  }

  let html = "";
  logs.forEach((log) => {
    const timestamp = new Date(log.timestamp).toLocaleString();
    const levelClass = getLevelClass(log.level);
    const icon = getLevelIcon(log.level);

    html += `
      <div class="log-line">
        <span class="text-muted">[${timestamp}]</span>
        <span class="${levelClass}">${icon} ${log.level.toUpperCase()}</span>
        <span>${log.message}</span>
        ${
          log.data
            ? `<div class="log-data">${JSON.stringify(log.data, null, 2)}</div>`
            : ""
        }
      </div>
    `;
  });

  logsContainer.innerHTML = html;
  logsContainer.scrollTop = logsContainer.scrollHeight;
}

// Get CSS class for log level
function getLevelClass(level) {
  const classes = {
    info: "text-info",
    success: "text-success",
    warning: "text-warning",
    error: "text-danger",
    debug: "text-muted",
    progress: "text-primary",
  };
  return classes[level] || "text-light";
}

// Get icon for log level
function getLevelIcon(level) {
  const icons = {
    info: "ℹ️",
    success: "✅",
    warning: "⚠️",
    error: "❌",
    debug: "🐛",
    progress: "⚡",
  };
  return icons[level] || "ℹ️";
}

// Update log statistics
function updateLogStats(logs) {
  const stats = document.getElementById("log-stats");

  if (!logs || logs.length === 0) {
    stats.textContent = "No logs available";
    return;
  }

  const levelCounts = {};
  logs.forEach((log) => {
    levelCounts[log.level] = (levelCounts[log.level] || 0) + 1;
  });

  const statsText = Object.entries(levelCounts)
    .map(([level, count]) => `${level}: ${count}`)
    .join(", ");

  stats.textContent = `Total: ${logs.length} entries (${statsText})`;
}

// Clear background logs
async function clearBackgroundLogs() {
  try {
    const response = await fetch("/api/background-embeddings/logs?clear=true");
    const result = await response.json();

    if (response.ok) {
      addLog("🗑️ Background logs cleared", "info");
      refreshBackgroundLogs();
    } else {
      console.error("Failed to clear logs:", result.error);
    }
  } catch (error) {
    console.error("Clear logs error:", error);
  }
}

// Toggle logs auto-refresh
function toggleLogsAutoRefresh() {
  const autoRefresh = document.getElementById("auto-refresh-logs").checked;

  if (autoRefresh) {
    logsAutoRefreshInterval = setInterval(refreshBackgroundLogs, 3000); // Refresh every 3 seconds
  } else {
    if (logsAutoRefreshInterval) {
      clearInterval(logsAutoRefreshInterval);
      logsAutoRefreshInterval = null;
    }
  }
}

// Initialize background status polling on page load
document.addEventListener("DOMContentLoaded", function () {
  // Start with a single status check
  setTimeout(refreshBackgroundStatus, 1000);

  // Set up auto-refresh for background status every 5 seconds
  setInterval(refreshBackgroundStatus, 5000);
});

// ==========================================
// CSV QUEUE MANAGEMENT FUNCTIONS
// ==========================================

// Refresh CSV queue status
async function refreshCsvQueue() {
  try {
    const response = await fetch("/api/csv-queue/status");
    const result = await response.json();

    if (response.ok) {
      updateCsvQueueStatus(result.queueStatus);
    } else {
      console.error("Failed to fetch CSV queue status:", result.error);
    }
  } catch (error) {
    console.error("CSV queue refresh error:", error);
  }
}

// Update CSV queue UI
function updateCsvQueueStatus(queueStatus) {
  if (!queueStatus) return;

  const statusElement = document.getElementById("csv-queue-status");
  const lengthElement = document.getElementById("csv-queue-length");
  const queueListElement = document.getElementById("csv-queue-list");
  const currentTaskElement = document.getElementById("csv-current-task");

  // Update queue status
  if (queueStatus.active) {
    statusElement.className = "badge bg-success";
    statusElement.textContent = "Processing";
  } else {
    statusElement.className = "badge bg-secondary";
    statusElement.textContent = "Idle";
  }

  // Update queue length
  lengthElement.textContent = queueStatus.queueLength;

  // Update current task
  if (queueStatus.currentTask) {
    const task = queueStatus.currentTask;
    currentTaskElement.style.display = "block";
    
    document.getElementById("csv-current-file").textContent = task.fileName;
    document.getElementById("csv-current-status").textContent = task.status;
    document.getElementById("csv-current-progress").textContent = `${task.progress.toFixed(1)}%`;
    document.getElementById("csv-current-processed").textContent = task.processedRecords;
    document.getElementById("csv-current-inserted").textContent = task.insertedRecords;
    document.getElementById("csv-current-failed").textContent = task.failedRecords;
    
    const progressBar = document.getElementById("csv-current-progress-bar");
    progressBar.style.width = `${task.progress}%`;
    
    if (task.status === "processing") {
      progressBar.className = "progress-bar progress-bar-striped progress-bar-animated bg-primary";
    } else if (task.status === "completed") {
      progressBar.className = "progress-bar bg-success";
    } else if (task.status === "failed") {
      progressBar.className = "progress-bar bg-danger";
    } else {
      progressBar.className = "progress-bar bg-secondary";
    }
  } else {
    currentTaskElement.style.display = "none";
  }

  // Update queue list
  updateCsvQueueList(queueStatus.queue);
}

// Update CSV queue list display
function updateCsvQueueList(queue) {
  const queueListElement = document.getElementById("csv-queue-list");

  if (!queue || queue.length === 0) {
    queueListElement.innerHTML = `
      <h6>Queue (Empty)</h6>
      <div class="text-muted text-center p-3">
        <i class="fas fa-inbox fa-2x mb-2"></i>
        <p>No CSV files in queue</p>
      </div>
    `;
    return;
  }

  let html = `<h6>Queue (${queue.length} files)</h6>`;
  
  queue.forEach((task, index) => {
    const statusClass = getTaskStatusClass(task.status);
    const createdAt = new Date(task.createdAt).toLocaleString();
    
    html += `
      <div class="card card-body mb-2">
        <div class="d-flex justify-content-between align-items-start">
          <div>
            <strong>${task.fileName}</strong>
            <span class="badge ${statusClass} ms-2">${task.status}</span>
          </div>
          <small class="text-muted">#${task.id}</small>
        </div>
        <div class="row mt-2">
          <div class="col-md-6">
            <small>Created: ${createdAt}</small><br>
            <small>Progress: ${task.progress.toFixed(1)}%</small>
          </div>
          <div class="col-md-6">
            <small>Records: ${task.processedRecords}/${task.totalRecords}</small><br>
            <small>Inserted: ${task.insertedRecords}</small>
          </div>
        </div>
        ${task.error ? `<div class="text-danger mt-2"><small>Error: ${task.error}</small></div>` : ''}
      </div>
    `;
  });
  
  queueListElement.innerHTML = html;
}

// Get CSS class for task status
function getTaskStatusClass(status) {
  const classes = {
    'queued': 'bg-secondary',
    'processing': 'bg-primary',
    'completed': 'bg-success',
    'failed': 'bg-danger'
  };
  return classes[status] || 'bg-secondary';
}

// Start CSV queue processing
async function startCsvQueue() {
  try {
    addLog("🚀 Starting CSV queue processing...", "info");

    const response = await fetch("/api/csv-queue/start", {
      method: "POST",
    });

    const result = await response.json();

    if (response.ok) {
      addLog(`✅ CSV queue started: ${result.message}`, "success");
      refreshCsvQueue();
    } else {
      addLog(`❌ Failed to start CSV queue: ${result.error}`, "error");
    }
  } catch (error) {
    addLog(`❌ CSV queue start error: ${error.message}`, "error");
  }
}

// Stop CSV queue processing
async function stopCsvQueue() {
  try {
    addLog("🛑 Stopping CSV queue processing...", "info");

    const response = await fetch("/api/csv-queue/stop", {
      method: "POST",
    });

    const result = await response.json();

    if (response.ok) {
      addLog(`✅ CSV queue stopped: ${result.message}`, "success");
      refreshCsvQueue();
    } else {
      addLog(`❌ Failed to stop CSV queue: ${result.error}`, "error");
    }
  } catch (error) {
    addLog(`❌ CSV queue stop error: ${error.message}`, "error");
  }
}

// Clear CSV queue
async function clearCsvQueue() {
  if (!confirm("Are you sure you want to clear the CSV queue? This will remove all pending tasks.")) {
    return;
  }

  try {
    addLog("🗑️ Clearing CSV queue...", "info");

    const response = await fetch("/api/csv-queue/clear", {
      method: "POST",
    });

    const result = await response.json();

    if (response.ok) {
      addLog(`✅ CSV queue cleared: ${result.message}`, "success");
      refreshCsvQueue();
    } else {
      addLog(`❌ Failed to clear CSV queue: ${result.error}`, "error");
    }
  } catch (error) {
    addLog(`❌ CSV queue clear error: ${error.message}`, "error");
  }
}

// Auto-refresh CSV queue status
setInterval(refreshCsvQueue, 3000); // Refresh every 3 seconds
