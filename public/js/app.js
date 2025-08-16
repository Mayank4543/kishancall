// Global variables
let socket = null;
let isConnected = false;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupEventListeners();
    checkServerStatus();
});

// Initialize application
function initializeApp() {
    addLog('🚀 Application initialized', 'info');
    refreshSystemStatus();
}

// Setup all event listeners
function setupEventListeners() {
    // File upload
    const fileUploadArea = document.getElementById('file-upload-area');
    const fileInput = document.getElementById('csv-file-input');

    fileUploadArea.addEventListener('click', () => fileInput.click());
    fileUploadArea.addEventListener('dragover', handleDragOver);
    fileUploadArea.addEventListener('drop', handleFileDrop);
    fileInput.addEventListener('change', handleFileSelect);

    // Buttons
    document.getElementById('upload-csv-btn').addEventListener('click', uploadCSV);
    document.getElementById('generate-embeddings-btn').addEventListener('click', generateEmbeddings);
    document.getElementById('refresh-status-btn').addEventListener('click', refreshSystemStatus);
    document.getElementById('search-btn').addEventListener('click', performSearch);
    document.getElementById('clear-logs-btn').addEventListener('click', clearLogs);

    // Search input - Enter key
    document.getElementById('search-query').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            performSearch();
        }
    });

    // Quick search buttons
    document.querySelectorAll('.quick-search').forEach(btn => {
        btn.addEventListener('click', function() {
            const query = this.getAttribute('data-query');
            document.getElementById('search-query').value = query;
            performSearch();
        });
    });
}

// File handling functions
function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('dragover');
}

function handleFileDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFileSelect({ target: { files: files } });
    }
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
            displayFileInfo(file);
            document.getElementById('upload-csv-btn').disabled = false;
            addLog(`📁 File selected: ${file.name} (${formatFileSize(file.size)})`, 'info');
        } else {
            addLog('❌ Please select a CSV file', 'error');
            alert('Please select a CSV file.');
        }
    }
}

function displayFileInfo(file) {
    document.getElementById('file-name').textContent = file.name;
    document.getElementById('file-size').textContent = formatFileSize(file.size);
    document.getElementById('file-info').style.display = 'block';
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// API calls
async function uploadCSV() {
    const fileInput = document.getElementById('csv-file-input');
    const file = fileInput.files[0];
    
    if (!file) {
        addLog('❌ No file selected', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('csvFile', file);

    try {
        showProgress('Uploading CSV file...');
        addLog('📤 Starting CSV upload...', 'info');

        const response = await fetch('/api/upload-csv', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (response.ok) {
            addLog(`✅ CSV uploaded successfully: ${result.message}`, 'success');
            addLog(`📊 Processed ${result.totalProcessed} rows, inserted ${result.totalInserted} documents`, 'info');
            refreshSystemStatus();
        } else {
            addLog(`❌ Upload failed: ${result.error}`, 'error');
        }
    } catch (error) {
        addLog(`❌ Upload error: ${error.message}`, 'error');
    } finally {
        hideProgress();
    }
}

async function generateEmbeddings() {
    try {
        showProgress('Generating embeddings...');
        addLog('🧠 Starting embedding generation...', 'info');

        const response = await fetch('/api/generate-embeddings', {
            method: 'POST'
        });

        const result = await response.json();

        if (response.ok) {
            addLog(`✅ Embedding generation started: ${result.message}`, 'success');
            
            // Start polling for progress
            pollEmbeddingProgress();
        } else {
            addLog(`❌ Embedding generation failed: ${result.error}`, 'error');
        }
    } catch (error) {
        addLog(`❌ Embedding generation error: ${error.message}`, 'error');
    } finally {
        hideProgress();
    }
}

async function performSearch() {
    const query = document.getElementById('search-query').value.trim();
    const limit = parseInt(document.getElementById('search-limit').value);
    const method = document.getElementById('search-method').value;
    
    if (!query) {
        addLog('❌ Please enter a search query', 'warning');
        return;
    }

    // Build filters
    const filters = {};
    const stateFilter = document.getElementById('filter-state').value.trim();
    const categoryFilter = document.getElementById('filter-category').value.trim();
    
    if (stateFilter) filters.StateName = stateFilter;
    if (categoryFilter) filters.Category = categoryFilter;

    try {
        addLog(`🔍 Searching for: "${query}"`, 'info');
        
        const searchStartTime = Date.now();
        const endpoint = method === 'vector' ? '/api/search' : '/api/search-fallback';
        
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                query: query,
                topK: limit,
                filters: filters
            })
        });

        const result = await response.json();
        const searchTime = Date.now() - searchStartTime;

        if (response.ok) {
            displaySearchResults(result.results, query, searchTime);
            updateLastSearchTime(searchTime);
            addLog(`✅ Search completed in ${searchTime}ms - Found ${result.results.length} results`, 'success');
        } else {
            addLog(`❌ Search failed: ${result.error}`, 'error');
            if (method === 'vector' && result.error.includes('vectorSearch')) {
                addLog('🔄 Trying fallback search method...', 'warning');
                document.getElementById('search-method').value = 'fallback';
                setTimeout(performSearch, 1000);
            }
        }
    } catch (error) {
        addLog(`❌ Search error: ${error.message}`, 'error');
    }
}

async function refreshSystemStatus() {
    try {
        const response = await fetch('/api/status');
        const status = await response.json();

        if (response.ok) {
            updateSystemStats(status);
            addLog('🔄 System status refreshed', 'info');
        } else {
            addLog('❌ Failed to fetch system status', 'error');
        }
    } catch (error) {
        addLog(`❌ Status refresh error: ${error.message}`, 'error');
    }
}

async function checkServerStatus() {
    try {
        const response = await fetch('/api/status');
        if (response.ok) {
            updateConnectionStatus(true);
            addLog('✅ Connected to server', 'success');
        } else {
            updateConnectionStatus(false);
        }
    } catch (error) {
        updateConnectionStatus(false);
        addLog('❌ Server connection failed', 'error');
    }
}

// UI Update functions
function updateSystemStats(status) {
    document.getElementById('total-docs').textContent = status.database.totalDocuments.toLocaleString();
    document.getElementById('docs-with-embeddings').textContent = status.database.documentsWithEmbeddings.toLocaleString();
    document.getElementById('embedding-progress').textContent = status.database.embeddingProgress;
}

function updateConnectionStatus(connected) {
    isConnected = connected;
    const statusIndicator = document.querySelector('.status-indicator');
    const statusText = statusIndicator.nextElementSibling;
    
    if (connected) {
        statusIndicator.className = 'status-indicator status-ready';
        statusText.textContent = 'Connected';
    } else {
        statusIndicator.className = 'status-indicator status-error';
        statusText.textContent = 'Disconnected';
    }
}

function updateLastSearchTime(time) {
    document.getElementById('last-search-time').textContent = time + 'ms';
}

function displaySearchResults(results, query, searchTime) {
    const resultsContainer = document.getElementById('search-results');
    const resultsCount = document.getElementById('results-count');
    
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

    let html = '';
    results.forEach((result, index) => {
        const similarity = result.similarity ? (result.similarity * 100).toFixed(1) : 'N/A';
        html += `
            <div class="search-result">
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <h6 class="mb-0">${index + 1}. ${result.Category || 'General'}</h6>
                    <span class="similarity-score">${similarity}%</span>
                </div>
                <div class="row">
                    <div class="col-md-6">
                        <small class="text-muted">Location:</small>
                        <p class="mb-1">${result.StateName || 'N/A'}, ${result.DistrictName || 'N/A'}</p>
                    </div>
                    <div class="col-md-6">
                        <small class="text-muted">Query Type:</small>
                        <p class="mb-1">${result.QueryType || 'N/A'}</p>
                    </div>
                </div>
                <div class="mt-2">
                    <small class="text-muted">Query:</small>
                    <p class="mb-1">${truncateText(result.QueryText || '', 150)}</p>
                </div>
                <div class="mt-2">
                    <small class="text-muted">Answer:</small>
                    <p class="mb-0">${truncateText(result.KccAns || '', 200)}</p>
                </div>
            </div>
        `;
    });
    
    resultsContainer.innerHTML = html;
}

function truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

function showProgress(text) {
    document.querySelector('.progress-container').style.display = 'block';
    document.getElementById('progress-text').textContent = text;
    document.getElementById('progress-bar').style.width = '50%';
}

function hideProgress() {
    document.querySelector('.progress-container').style.display = 'none';
}

function addLog(message, type = 'info') {
    const logContainer = document.getElementById('log-container');
    const timestamp = new Date().toLocaleTimeString();
    
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry log-${type}`;
    logEntry.innerHTML = `<span class="text-muted">[${timestamp}]</span> ${message}`;
    
    logContainer.appendChild(logEntry);
    logContainer.scrollTop = logContainer.scrollHeight;
    
    // Keep only last 100 log entries
    const logEntries = logContainer.querySelectorAll('.log-entry');
    if (logEntries.length > 100) {
        logEntries[0].remove();
    }
}

function clearLogs() {
    document.getElementById('log-container').innerHTML = '';
    addLog('📝 Logs cleared', 'info');
}

// Polling for embedding progress
async function pollEmbeddingProgress() {
    const pollInterval = setInterval(async () => {
        try {
            const response = await fetch('/api/status');
            const status = await response.json();
            
            if (response.ok) {
                updateSystemStats(status);
                
                // Check if embeddings are complete
                const progress = parseFloat(status.database.embeddingProgress);
                if (progress >= 100) {
                    addLog('🎉 Embedding generation completed!', 'success');
                    clearInterval(pollInterval);
                } else {
                    addLog(`⚡ Embedding progress: ${status.database.embeddingProgress}`, 'info');
                }
            }
        } catch (error) {
            console.error('Polling error:', error);
        }
    }, 5000); // Poll every 5 seconds

    // Stop polling after 10 minutes
    setTimeout(() => {
        clearInterval(pollInterval);
        addLog('⏱️ Stopped polling for embedding progress', 'warning');
    }, 600000);
}

// Auto-refresh status every 30 seconds
setInterval(refreshSystemStatus, 30000);
