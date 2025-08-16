# 🔍 Local Semantic Search System

A complete semantic search system using MongoDB and the local `Xenova/all-MiniLM-L6-v2` transformer model. This system processes ~60k CSV records and enables semantic search without any external APIs (no OpenAI, no HuggingFace cloud services).

## 🚀 Features

- **Local-First**: Uses `@xenova/transformers` for completely local embeddings
- **High Performance**: Processes 60k+ documents with efficient batch operations
- **Smart Search**: Cosine similarity-based semantic search
- **REST API**: Express.js server with search endpoints
- **Filtered Search**: Support for category, state, and other filters
- **Real-time Status**: Progress tracking and health monitoring

## 📋 Prerequisites

- Node.js (v16 or higher)
- MongoDB Atlas connection (or local MongoDB)
- ~2GB RAM for model loading
- ~10GB storage for embeddings

## 🛠️ Installation

1. **Clone and install dependencies:**

   ```bash
   npm install
   ```

2. **Set up environment variables:**
   Create a `.env` file:
   ```env
   MONGODB_URI=your_mongodb_connection_string
   PORT=3000
   ```

## 🎯 Quick Start

### Step 1: Import CSV Data

```bash
npm run import-csv
```

This will:

- Connect to MongoDB
- Parse and validate ~60k CSV records
- Insert documents in optimized batches
- Display progress and statistics

### Step 2: Generate Embeddings

```bash
npm run setup-search
```

This will:

- Load the `Xenova/all-MiniLM-L6-v2` model locally
- Generate embeddings for all documents
- Store embeddings in the `embedding` field

### Step 3: Start the Server

```bash
npm start
```

Server will be available at: `http://localhost:3000`

### Step 4: Test Search

```bash
npm run test-search
```

Runs comprehensive tests with sample queries.

## 🔧 API Endpoints

### **GET /** - Health Check

```json
{
  "message": "🚀 Semantic Search API is running!",
  "status": "healthy",
  "embeddingsReady": true,
  "endpoints": {...}
}
```

### **GET /api/status** - System Status

```json
{
  "status": "healthy",
  "database": {
    "totalDocuments": 60000,
    "documentsWithEmbeddings": 60000,
    "embeddingProgress": "100%"
  },
  "embeddingsReady": true
}
```

### **POST /api/search** - Semantic Search

**Request:**

```json
{
  "query": "crop disease management",
  "topK": 10,
  "filters": {
    "Category": "Crop",
    "StateName": "Maharashtra"
  }
}
```

**Response:**

```json
{
  "success": true,
  "query": "crop disease management",
  "resultsCount": 10,
  "searchTime": "45ms",
  "results": [
    {
      "id": "...",
      "similarity": 0.8542,
      "Category": "Crop",
      "QueryType": "Disease",
      "QueryText": "How to manage fungal diseases in tomato crops?",
      "KccAns": "Apply fungicide spray at early stages...",
      "StateName": "Maharashtra",
      "DistrictName": "Pune"
    }
  ]
}
```

### **POST /api/generate-embeddings** - Generate Embeddings

Starts asynchronous embedding generation for documents without embeddings.

### **POST /api/suggestions** - Query Suggestions

Get similar queries based on semantic search.

## 💻 Usage Examples

### Basic Search

```javascript
const { semanticSearch } = require("./semantic-search");

// Simple search
const results = await semanticSearch("pest control methods", 5);

// Search with filters
const filteredResults = await semanticSearch("irrigation", 10, {
  StateName: "Punjab",
  Category: "Water",
});
```

### Using the API

```javascript
// Search via API
const response = await fetch("http://localhost:3000/api/search", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    query: "organic farming techniques",
    topK: 5,
    filters: { Category: "Organic" },
  }),
});

const data = await response.json();
console.log(data.results);
```

## 🧠 How It Works

### 1. **Text Preprocessing**

Each document's text is formatted as:

```
Category: <Category>. QueryType: <QueryType>. Query: <QueryText>. Answer: <KccAns>
```

### 2. **Embedding Generation**

- Uses `Xenova/all-MiniLM-L6-v2` transformer model
- Generates 384-dimensional embeddings
- Processes in batches for memory efficiency

### 3. **Semantic Search**

- Query embedding generated using same model
- Cosine similarity calculated with all document embeddings
- Results sorted by similarity score (0-1)

### 4. **Performance Optimization**

- Batch processing for large datasets
- MongoDB indexing for fast retrieval
- Memory-efficient embedding storage

## 📊 Performance Metrics

- **Model Loading**: ~10-15 seconds (first time)
- **Embedding Generation**: ~2-3 docs/second
- **Search Speed**: ~50-100ms per query
- **Memory Usage**: ~2-3GB during embedding generation
- **Storage**: ~100MB for 60k embeddings

## 🔧 Scripts Reference

| Script                        | Description                    |
| ----------------------------- | ------------------------------ |
| `npm run import-csv`          | Import CSV data to MongoDB     |
| `npm run setup-search`        | Complete setup with embeddings |
| `npm run generate-embeddings` | Generate embeddings only       |
| `npm run test-search`         | Run comprehensive tests        |
| `npm run benchmark`           | Performance benchmarking       |
| `npm start`                   | Start the API server           |
| `npm run dev`                 | Start with auto-reload         |

## 🛡️ Error Handling

- **Model Loading Failures**: Automatic retry with exponential backoff
- **Memory Issues**: Batch size auto-adjustment
- **Network Errors**: Connection retry logic
- **Data Validation**: Comprehensive input sanitization

## 🔍 Search Tips

1. **Best Practices:**

   - Use descriptive, domain-specific terms
   - Combine related concepts in queries
   - Use filters to narrow down results

2. **Query Examples:**

   - ✅ "fungal disease treatment tomato crop"
   - ✅ "organic pest control methods"
   - ❌ "how" (too generic)
   - ❌ "a" (too short)

3. **Filter Usage:**
   ```javascript
   {
     "StateName": "Maharashtra",     // Specific state
     "Category": "Crop",            // Specific category
     "QueryType": "Disease"         // Specific query type
   }
   ```

## 🚨 Troubleshooting

### Common Issues:

1. **"Model loading failed"**

   - Check internet connection (first-time download)
   - Ensure sufficient RAM (2GB+)
   - Clear node_modules and reinstall

2. **"No embeddings found"**

   - Run `npm run generate-embeddings`
   - Check MongoDB connection
   - Verify documents exist

3. **"Search too slow"**

   - Reduce `topK` parameter
   - Add more specific filters
   - Check database indexing

4. **"Out of memory"**
   - Reduce batch size in code
   - Close other applications
   - Use smaller model (if needed)

## 📈 Monitoring

Monitor system performance via:

- **Health endpoint**: `GET /api/status`
- **Console logs**: Detailed progress information
- **Error tracking**: Comprehensive error logging

## 🔒 Security Notes

- Input validation on all API endpoints
- Rate limiting recommended for production
- Environment variables for sensitive data
- No external API calls (privacy-safe)

## 🚀 Production Deployment

For production use:

1. Use PM2 for process management
2. Add Redis caching for frequent queries
3. Implement request rate limiting
4. Set up proper logging and monitoring
5. Use MongoDB replica sets for high availability

## 📚 Dependencies

- **@xenova/transformers**: Local transformer models
- **mongoose**: MongoDB ODM
- **express**: Web server framework
- **csv-parser**: CSV file processing
- **cors**: Cross-origin resource sharing

## 📝 License

ISC License - See LICENSE file for details.

---

Built with ❤️ for local-first semantic search.
