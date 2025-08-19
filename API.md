# 🚀 API Reference - Kishan Call

## Base URL

```
http://localhost:5000
```

## Response Format

All API responses follow this structure:

```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": {},
  "timestamp": "2024-01-01T00:00:00Z"
}
```

## Error Responses

```json
{
  "error": "Error description",
  "message": "Detailed error message",
  "code": "ERROR_CODE",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

---

## 🏠 System Endpoints

### Health Check

```http
GET /
```

**Response:**

```json
{
  "message": "🚀 Semantic Search CSV Manager is running!",
  "status": "healthy",
  "embeddingsReady": true,
  "endpoints": {
    "uploadCSV": "POST /api/upload-csv",
    "search": "POST /api/search",
    "latestData": "GET /api/latest-data"
  }
}
```

### System Status

```http
GET /api/status
```

**Response:**

```json
{
  "database": {
    "connected": true,
    "totalDocuments": 1500,
    "documentsWithEmbeddings": 1200,
    "embeddingProgress": "80.0%"
  },
  "csvQueue": {
    "active": false,
    "queueLength": 0,
    "currentTask": null
  }
}
```

---

## 📊 Data Management

### Upload CSV File

```http
POST /api/upload-csv
Content-Type: multipart/form-data
```

**Parameters:**

- `csvFile` (file, required): CSV file to upload
- `processInBackground` (boolean): Process file in background queue
- `clearExisting` (boolean): Clear existing data before import
- `generateEmbeddings` (boolean): Generate embeddings after import

**Response:**

```json
{
  "success": true,
  "message": "CSV uploaded and processed successfully",
  "totalProcessed": 500,
  "totalInserted": 480,
  "errors": 20,
  "processInBackground": false
}
```

### Get Latest Data

```http
GET /api/latest-data?limit=10&filters={"StateName":"Punjab"}
```

**Query Parameters:**

- `limit` (number): Number of documents to return (default: 10)
- `filters` (JSON string): Filter criteria

**Response:**

```json
{
  "success": true,
  "totalFound": 10,
  "fetchTime": "45ms",
  "results": [
    {
      "id": "507f1f77bcf86cd799439011",
      "StateName": "Punjab",
      "DistrictName": "Ludhiana",
      "Category": "Crop Management",
      "QueryText": "How to manage wheat diseases?",
      "KccAns": "Wheat disease management involves...",
      "CreatedOn": "2024-01-01T10:30:00Z",
      "isLatest": true
    }
  ]
}
```

---

## 🔍 Search Operations

### Semantic Search

```http
POST /api/search
Content-Type: application/json
```

**Request Body:**

```json
{
  "query": "rice farming techniques",
  "topK": 10,
  "filters": {
    "StateName": "Punjab",
    "Category": "Crop Management"
  }
}
```

**Response:**

```json
{
  "success": true,
  "query": "rice farming techniques",
  "topK": 10,
  "resultsCount": 8,
  "searchTime": "120ms",
  "results": [
    {
      "id": "507f1f77bcf86cd799439011",
      "similarity": 0.8542,
      "StateName": "Punjab",
      "DistrictName": "Amritsar",
      "Category": "Crop Management",
      "QueryType": "Technical",
      "QueryText": "What are the best rice farming techniques?",
      "KccAns": "Modern rice farming involves...",
      "Crop": "Rice",
      "Season": "Kharif",
      "CreatedOn": "2024-01-01T10:30:00Z"
    }
  ]
}
```

### Fallback Search

```http
POST /api/search-fallback
Content-Type: application/json
```

Same request/response format as semantic search, but uses manual cosine similarity.

---

## ⚙️ Background Processing

### Background Embeddings

#### Start Background Embedding Generation

```http
POST /api/background-embeddings/start
Content-Type: application/json
```

**Request Body:**

```json
{
  "batchSize": 50,
  "delayBetweenBatches": 1000,
  "retryAttempts": 3,
  "priority": "normal",
  "skipExisting": true
}
```

**Response:**

```json
{
  "success": true,
  "message": "Background embedding generation started",
  "status": {
    "isRunning": true,
    "isPaused": false,
    "progress": "0%",
    "processedDocuments": 0
  }
}
```

#### Get Background Status

```http
GET /api/background-embeddings/status?detailed=true
```

**Response:**

```json
{
  "status": {
    "isRunning": true,
    "isPaused": false,
    "isStopping": false,
    "progress": "45.2%",
    "processedDocuments": 226,
    "successDocuments": 220,
    "failedDocuments": 6,
    "totalDocuments": 500,
    "currentBatch": 5,
    "elapsedTime": 120000,
    "elapsedTimeFormatted": "2m 0s",
    "estimatedTimeRemaining": 145000,
    "estimatedTimeRemainingFormatted": "2m 25s",
    "processingRate": 1.88
  }
}
```

#### Control Background Processing

```http
POST /api/background-embeddings/pause
POST /api/background-embeddings/resume
POST /api/background-embeddings/stop
```

**Response:**

```json
{
  "success": true,
  "message": "Background embedding paused",
  "status": {
    "isRunning": true,
    "isPaused": true
  }
}
```

#### Get Background Logs

```http
GET /api/background-embeddings/logs?level=info&limit=100
```

**Response:**

```json
{
  "logs": [
    {
      "timestamp": "2024-01-01T10:30:00Z",
      "level": "info",
      "message": "Processing batch 5 of 10",
      "data": {
        "batchNumber": 5,
        "documentsInBatch": 50
      }
    }
  ],
  "totalLogs": 247
}
```

#### Configure Background Processing

```http
POST /api/background-embeddings/config
Content-Type: application/json
```

**Request Body:**

```json
{
  "batchSize": 25,
  "delayBetweenBatches": 2000,
  "retryAttempts": 5,
  "priority": "high"
}
```

---

## 📋 CSV Queue Management

### Get Queue Status

```http
GET /api/csv-queue/status
```

**Response:**

```json
{
  "queueStatus": {
    "active": true,
    "queueLength": 3,
    "currentTask": {
      "id": "task_001",
      "fileName": "agricultural_data.csv",
      "status": "processing",
      "progress": 65.4,
      "processedRecords": 327,
      "insertedRecords": 320,
      "failedRecords": 7,
      "totalRecords": 500,
      "startedAt": "2024-01-01T10:25:00Z"
    },
    "queue": [
      {
        "id": "task_002",
        "fileName": "crop_diseases.csv",
        "status": "queued",
        "createdAt": "2024-01-01T10:30:00Z",
        "totalRecords": 200,
        "options": {
          "generateEmbeddings": true,
          "clearExisting": false
        }
      }
    ]
  }
}
```

### Control Queue Processing

```http
POST /api/csv-queue/start
POST /api/csv-queue/stop
POST /api/csv-queue/clear
```

**Response:**

```json
{
  "success": true,
  "message": "CSV queue processing started",
  "queueStatus": {
    "active": true,
    "queueLength": 3
  }
}
```

---

## 🔧 Generate Embeddings

### Generate Embeddings for All Documents

```http
POST /api/generate-embeddings
```

**Response:**

```json
{
  "success": true,
  "message": "Embedding generation started",
  "totalDocuments": 1500,
  "documentsWithoutEmbeddings": 300
}
```

---

## ⚠️ Error Codes

| Code                          | Description                      |
| ----------------------------- | -------------------------------- |
| `MONGODB_CONNECTION_ERROR`    | Database connection failed       |
| `INVALID_CSV_FORMAT`          | Uploaded file is not a valid CSV |
| `EMBEDDING_GENERATION_FAILED` | Failed to generate embeddings    |
| `SEARCH_QUERY_EMPTY`          | Search query is required         |
| `BACKGROUND_PROCESS_ERROR`    | Background processing error      |
| `QUEUE_OPERATION_FAILED`      | CSV queue operation failed       |
| `INSUFFICIENT_PERMISSIONS`    | Operation not permitted          |
| `RATE_LIMIT_EXCEEDED`         | Too many requests                |

---

## 📈 Response Times

| Endpoint                    | Average Response Time       |
| --------------------------- | --------------------------- |
| `GET /api/status`           | 50ms                        |
| `GET /api/latest-data`      | 80ms                        |
| `POST /api/search`          | 150ms                       |
| `POST /api/search-fallback` | 300ms                       |
| `POST /api/upload-csv`      | 2-10s (varies by file size) |

---

## 🔒 Authentication

Currently, the API does not require authentication. Future versions will include:

- API key authentication
- JWT token-based authentication
- Role-based access control

---

## 📊 Rate Limiting

- **General API calls**: 100 requests per minute
- **Search operations**: 50 requests per minute
- **Upload operations**: 10 requests per minute
- **Background operations**: 20 requests per minute

---

## 🌍 CORS

CORS is enabled for all origins in development mode. In production, configure specific allowed origins.

---

## 📝 Notes

1. All timestamps are in ISO 8601 format (UTC)
2. File uploads must be CSV format with proper headers
3. Vector search requires MongoDB Atlas with vector index
4. Background processing is persistent across server restarts
5. Queue operations are atomic and thread-safe
