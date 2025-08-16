# Kishan Call Express Server

A complete Express.js server with MongoDB Atlas integration and OpenAI embeddings for semantic search.

## Features

- ✅ MongoDB Atlas connection
- ✅ Mongoose model for "queries" collection
- ✅ OpenAI Embeddings API integration
- ✅ Vector search using MongoDB Atlas
- ✅ Error handling and logging
- ✅ Environment variable configuration

## Setup

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Environment Configuration:**

   - Copy `.env.example` to `.env`
   - Add your OpenAI API key to the `.env` file

   ```bash
   cp .env.example .env
   ```

3. **MongoDB Atlas Vector Index:**
   Create a vector search index named `vector_index` on the `embedding` field in your MongoDB Atlas collection:

   ```json
   {
     "fields": [
       {
         "type": "vector",
         "path": "embedding",
         "numDimensions": 1536,
         "similarity": "cosine"
       }
     ]
   }
   ```

4. **Start the server:**

   ```bash
   npm start
   ```

   Or for development with auto-reload:

   ```bash
   npm run dev
   ```

## API Endpoints

### Health Check

```http
GET /health
```

Returns server health status and database statistics.

### Generate Embeddings

```http
POST /generate-embeddings
```

Fetches up to 100 documents without embeddings, generates embeddings using OpenAI, and saves them to MongoDB.

**Response:**

```json
{
  "message": "Embedding generation completed",
  "updated": 50,
  "failed": 0,
  "total": 50
}
```

### Semantic Search

```http
POST /semantic-search
Content-Type: application/json

{
  "query": "rice farming techniques"
}
```

**Response:**

```json
{
  "query": "rice farming techniques",
  "results": [
    {
      "_id": "...",
      "StateName": "Punjab",
      "QueryText": "How to grow rice?",
      "KccAns": "Rice farming requires...",
      "score": 0.85
    }
  ],
  "count": 10
}
```

## Environment Variables

| Variable         | Description                     | Default      |
| ---------------- | ------------------------------- | ------------ |
| `MONGODB_URI`    | MongoDB Atlas connection string | Provided URL |
| `OPENAI_API_KEY` | OpenAI API key for embeddings   | Required     |
| `PORT`           | Server port                     | 5000         |
| `NODE_ENV`       | Environment mode                | development  |

## Database Schema

The `queries` collection contains documents with the following fields:

- `StateName` (String): State name
- `DistrictNam` (String): District name
- `BlockName` (String): Block name
- `Season` (String): Agricultural season
- `Sector` (String): Sector information
- `Category` (String): Category
- `Crop` (String): Crop type
- `QueryText` (String): User query text
- `KccAns` (String): KCC answer text
- `CreatedOn` (Date): Creation timestamp
- `year` (Number): Year
- `month` (Number): Month
- `embedding` (Array): Vector embedding (1536 dimensions)

## Error Handling

The server includes comprehensive error handling:

- MongoDB connection errors
- OpenAI API errors
- Rate limiting protection
- Input validation
- Graceful shutdown

## Logging

Console logs include:

- Database connection status
- Embedding generation progress
- Search query details
- Error messages with context

## Development

Start the server in development mode:

```bash
npm run dev
```

This uses nodemon for automatic restarts on file changes.
