require("dotenv").config();
const express = require("express");
const cors = require("cors");
const {
  semanticSearch,
  fastSemanticSearch,
  generateEmbeddingsForAllDocuments,
  connectToMongoDB,
  initializeEmbeddingPipeline,
} = require("./semantic-search");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// Global flag to track if embeddings are ready
let isEmbeddingsReady = false;
let isInitializing = false;

/**
 * Initialize the system on server startup
 */
async function initializeSystem() {
  if (isInitializing) return;
  isInitializing = true;

  try {
    console.log("🚀 Initializing semantic search system...");

    // Connect to MongoDB
    await connectToMongoDB();

    // Initialize the embedding model
    await initializeEmbeddingPipeline();

    // Check if embeddings exist
    const Document = require("./models/Document");
    const documentsWithEmbeddings = await Document.countDocuments({
      embedding: { $exists: true, $ne: [] },
    });

    const totalDocuments = await Document.countDocuments();

    console.log(
      `📊 Documents with embeddings: ${documentsWithEmbeddings}/${totalDocuments}`
    );

    if (documentsWithEmbeddings === 0 && totalDocuments > 0) {
      console.log("🧠 No embeddings found. Generating embeddings...");
      await generateEmbeddingsForAllDocuments();
    }

    isEmbeddingsReady = documentsWithEmbeddings > 0 || totalDocuments > 0;
    console.log("✅ System initialized successfully!");
  } catch (error) {
    console.error("❌ System initialization error:", error);
  } finally {
    isInitializing = false;
  }
}

// Routes

/**
 * Health check endpoint
 */
app.get("/", (req, res) => {
  res.json({
    message: "🚀 Semantic Search API is running!",
    status: "healthy",
    embeddingsReady: isEmbeddingsReady,
    endpoints: {
      search: "POST /api/search",
      generateEmbeddings: "POST /api/generate-embeddings",
      status: "GET /api/status",
    },
  });
});

/**
 * System status endpoint
 */
app.get("/api/status", async (req, res) => {
  try {
    const Document = require("./models/Document");
    const totalDocuments = await Document.countDocuments();
    const documentsWithEmbeddings = await Document.countDocuments({
      embedding: { $exists: true, $ne: [] },
    });

    res.json({
      status: "healthy",
      database: {
        connected: true,
        totalDocuments,
        documentsWithEmbeddings,
        embeddingProgress:
          totalDocuments > 0
            ? ((documentsWithEmbeddings / totalDocuments) * 100).toFixed(1) +
              "%"
            : "0%",
      },
      embeddingsReady: isEmbeddingsReady,
      isInitializing,
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

/**
 * Semantic search endpoint
 */
app.post("/api/search", async (req, res) => {
  try {
    const { query, topK = 10, filters = {} } = req.body;

    if (!query) {
      return res.status(400).json({
        error: "Query parameter is required",
      });
    }

    if (!isEmbeddingsReady) {
      return res.status(503).json({
        error:
          "Embeddings are not ready yet. Please wait for initialization to complete or generate embeddings first.",
        suggestion: "POST /api/generate-embeddings",
      });
    }

    console.log(`🔍 Search request: "${query}" (topK: ${topK})`);

    const startTime = Date.now();
    const results = await fastSemanticSearch(query, topK, filters);
    const searchTime = Date.now() - startTime;

    res.json({
      success: true,
      query,
      topK,
      filters,
      resultsCount: results.length,
      searchTime: `${searchTime}ms`,
      results: results.map((result) => ({
        id: result._id,
        similarity: result.similarity,
        StateName: result.StateName,
        DistrictName: result.DistrictName,
        Category: result.Category,
        QueryType: result.QueryType,
        QueryText: result.QueryText,
        KccAns: result.KccAns,
        Crop: result.Crop,
        Season: result.Season,
        CreatedOn: result.CreatedOn,
      })),
    });
  } catch (error) {
    console.error("❌ Search error:", error);
    res.status(500).json({
      error: "Search failed",
      message: error.message,
    });
  }
});

/**
 * Generate embeddings endpoint
 */
app.post("/api/generate-embeddings", async (req, res) => {
  try {
    console.log("🧠 Starting embedding generation via API...");

    // Start the process asynchronously
    generateEmbeddingsForAllDocuments()
      .then(() => {
        isEmbeddingsReady = true;
        console.log("✅ Embedding generation completed!");
      })
      .catch((error) => {
        console.error("❌ Embedding generation failed:", error);
      });

    res.json({
      success: true,
      message: "Embedding generation started. Check /api/status for progress.",
      note: "This is an asynchronous process that may take several minutes.",
    });
  } catch (error) {
    console.error("❌ Embedding generation error:", error);
    res.status(500).json({
      error: "Failed to start embedding generation",
      message: error.message,
    });
  }
});

/**
 * Search suggestions endpoint (returns similar queries)
 */
app.post("/api/suggestions", async (req, res) => {
  try {
    const { query, limit = 5 } = req.body;

    if (!query) {
      return res.status(400).json({
        error: "Query parameter is required",
      });
    }

    // Search for similar queries in QueryText field
    const results = await fastSemanticSearch(query, limit * 2);

    // Extract unique query texts
    const suggestions = [
      ...new Set(
        results
          .filter(
            (r) =>
              r.QueryText && r.QueryText.toLowerCase() !== query.toLowerCase()
          )
          .map((r) => r.QueryText)
      ),
    ].slice(0, limit);

    res.json({
      success: true,
      query,
      suggestions,
    });
  } catch (error) {
    console.error("❌ Suggestions error:", error);
    res.status(500).json({
      error: "Failed to get suggestions",
      message: error.message,
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("❌ Unhandled error:", error);
  res.status(500).json({
    error: "Internal server error",
    message: error.message,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Endpoint not found",
    availableEndpoints: [
      "GET /",
      "GET /api/status",
      "POST /api/search",
      "POST /api/generate-embeddings",
      "POST /api/suggestions",
    ],
  });
});

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 API URL: http://localhost:${PORT}`);
  console.log(`📊 Status: http://localhost:${PORT}/api/status`);

  // Initialize the system
  await initializeSystem();
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Server shutting down...");
  process.exit(0);
});

module.exports = app;
