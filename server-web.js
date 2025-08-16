require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const csv = require("csv-parser");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 8080;

// Configure multer for file uploads
const upload = multer({ 
  dest: 'uploads/',
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static("public"));

// Global variables
let isEmbeddingsReady = false;
let isInitializing = false;

// Import semantic search functions
let semanticSearchModule;
try {
  semanticSearchModule = require("./semantic-search");
  console.log("✅ Semantic search module loaded");
} catch (error) {
  console.error("❌ Failed to load semantic search module:", error.message);
}

/**
 * Initialize the system on server startup
 */
async function initializeSystem() {
  if (isInitializing || !semanticSearchModule) return;
  isInitializing = true;

  try {
    console.log("🚀 Initializing semantic search system...");

    // Connect to MongoDB
    await semanticSearchModule.connectToMongoDB();

    // Initialize the embedding model
    await semanticSearchModule.initializeEmbeddingPipeline();

    // Check if embeddings exist
    const Document = require("./models/Document");
    const documentsWithEmbeddings = await Document.countDocuments({
      embedding: { $exists: true, $ne: [] },
    });

    const totalDocuments = await Document.countDocuments();

    console.log(`📊 Documents with embeddings: ${documentsWithEmbeddings}/${totalDocuments}`);

    isEmbeddingsReady = documentsWithEmbeddings > 0;
    console.log("✅ System initialized successfully!");

  } catch (error) {
    console.error("❌ System initialization error:", error);
  } finally {
    isInitializing = false;
  }
}

// Helper function to process record batches
async function processRecordBatch(records) {
  try {
    const Document = require("./models/Document");
    const result = await Document.insertMany(records, { ordered: false });
    return result.length;
  } catch (error) {
    console.error("Batch insert error:", error);
    return 0;
  }
}

// Routes

/**
 * Health check endpoint
 */
app.get("/", (req, res) => {
  res.json({
    message: "🚀 Semantic Search CSV Manager is running!",
    status: "healthy",
    embeddingsReady: isEmbeddingsReady,
    endpoints: {
      uploadCSV: "POST /api/upload-csv",
      search: "POST /api/search",
      searchFallback: "POST /api/search-fallback",
      generateEmbeddings: "POST /api/generate-embeddings",
      status: "GET /api/status"
    }
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
      embedding: { $exists: true, $ne: [] }
    });

    res.json({
      status: "healthy",
      database: {
        connected: true,
        totalDocuments,
        documentsWithEmbeddings,
        embeddingProgress: totalDocuments > 0 ? (documentsWithEmbeddings / totalDocuments * 100).toFixed(1) + "%" : "0%"
      },
      embeddingsReady: isEmbeddingsReady,
      isInitializing
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: error.message
    });
  }
});

/**
 * CSV Upload endpoint
 */
app.post("/api/upload-csv", upload.single('csvFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: "No file uploaded"
      });
    }

    const filePath = req.file.path;
    console.log(`📁 Processing uploaded CSV: ${req.file.originalname}`);

    // Import the CSV processing functions
    const Document = require("./models/Document");
    
    // Clear existing documents
    console.log("🗑️ Clearing existing documents...");
    await Document.deleteMany({});
    
    // Process CSV file
    const records = [];
    let totalProcessed = 0;
    let totalInserted = 0;

    return new Promise((resolve) => {
      fs.createReadStream(filePath)
        .pipe(csv({
          skipEmptyLines: true,
          headers: [
            "StateName", "DistrictName", "BlockName", "Season", "Sector",
            "Category", "Crop", "QueryType", "QueryText", "KccAns",
            "CreatedOn", "year", "month"
          ]
        }))
        .on("data", (data) => {
          totalProcessed++;
          
          // Skip header row
          if (totalProcessed === 1 && data.StateName === "StateName") {
            return;
          }

          // Parse and clean data
          const cleanRecord = {
            StateName: data.StateName?.trim() || "",
            DistrictName: data.DistrictName?.trim() || "",
            BlockName: data.BlockName?.trim() || "",
            Season: data.Season?.trim() || "",
            Sector: data.Sector?.trim() || "",
            Category: data.Category?.trim() || "",
            Crop: data.Crop?.trim() || "",
            QueryType: data.QueryType?.trim() || "",
            QueryText: data.QueryText?.trim() || "",
            KccAns: data.KccAns?.trim() || "",
            CreatedOn: data.CreatedOn ? new Date(data.CreatedOn) : new Date(),
            year: data.year ? parseInt(data.year) : null,
            month: data.month ? parseInt(data.month) : null,
            embedding: []
          };

          records.push(cleanRecord);

          // Process in batches
          if (records.length >= 1000) {
            processRecordBatch(records.splice(0, 1000))
              .then(count => { totalInserted += count; })
              .catch(console.error);
          }
        })
        .on("end", async () => {
          try {
            // Process remaining records
            if (records.length > 0) {
              const count = await processRecordBatch(records);
              totalInserted += count;
            }

            // Clean up uploaded file
            fs.unlinkSync(filePath);

            console.log(`✅ CSV processing completed: ${totalInserted} documents inserted`);
            
            res.json({
              success: true,
              message: "CSV uploaded and processed successfully",
              totalProcessed: totalProcessed - 1, // Subtract header row
              totalInserted: totalInserted
            });

            resolve();
          } catch (error) {
            console.error("CSV processing error:", error);
            res.status(500).json({
              error: "CSV processing failed",
              message: error.message
            });
            resolve();
          }
        })
        .on("error", (error) => {
          console.error("CSV parsing error:", error);
          res.status(500).json({
            error: "CSV parsing failed",
            message: error.message
          });
          resolve();
        });
    });

  } catch (error) {
    console.error("❌ CSV upload error:", error);
    res.status(500).json({
      error: "CSV upload failed",
      message: error.message
    });
  }
});

/**
 * Semantic search endpoint
 */
app.post("/api/search", async (req, res) => {
  try {
    if (!semanticSearchModule) {
      return res.status(503).json({
        error: "Semantic search module not available"
      });
    }

    const { query, topK = 10, filters = {} } = req.body;
    
    if (!query) {
      return res.status(400).json({
        error: "Query parameter is required"
      });
    }
    
    console.log(`🔍 Vector search request: "${query}" (topK: ${topK})`);
    
    const startTime = Date.now();
    const results = await semanticSearchModule.semanticSearch(query, topK, filters);
    const searchTime = Date.now() - startTime;
    
    res.json({
      success: true,
      query,
      topK,
      filters,
      resultsCount: results.length,
      searchTime: `${searchTime}ms`,
      results: results.map(result => ({
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
        CreatedOn: result.CreatedOn
      }))
    });
    
  } catch (error) {
    console.error("❌ Search error:", error);
    res.status(500).json({
      error: "Search failed",
      message: error.message
    });
  }
});

/**
 * Fallback search endpoint
 */
app.post("/api/search-fallback", async (req, res) => {
  try {
    if (!semanticSearchModule || !semanticSearchModule.semanticSearchFallback) {
      return res.status(503).json({
        error: "Fallback search not available"
      });
    }

    const { query, topK = 10, filters = {} } = req.body;
    
    if (!query) {
      return res.status(400).json({
        error: "Query parameter is required"
      });
    }
    
    console.log(`🔍 Fallback search request: "${query}" (topK: ${topK})`);
    
    const startTime = Date.now();
    const results = await semanticSearchModule.semanticSearchFallback(query, topK, filters);
    const searchTime = Date.now() - startTime;
    
    res.json({
      success: true,
      query,
      topK,
      filters,
      resultsCount: results.length,
      searchTime: `${searchTime}ms`,
      results: results.map(result => ({
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
        CreatedOn: result.CreatedOn
      }))
    });
    
  } catch (error) {
    console.error("❌ Fallback search error:", error);
    res.status(500).json({
      error: "Fallback search failed",
      message: error.message
    });
  }
});

/**
 * Generate embeddings endpoint
 */
app.post("/api/generate-embeddings", async (req, res) => {
  try {
    if (!semanticSearchModule) {
      return res.status(503).json({
        error: "Semantic search module not available"
      });
    }

    console.log("🧠 Starting embedding generation via API...");
    
    // Start the process asynchronously
    semanticSearchModule.generateEmbeddingsForAllDocuments()
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
      note: "This is an asynchronous process that may take several minutes."
    });
    
  } catch (error) {
    console.error("❌ Embedding generation error:", error);
    res.status(500).json({
      error: "Failed to start embedding generation",
      message: error.message
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("❌ Unhandled error:", error);
  res.status(500).json({
    error: "Internal server error",
    message: error.message
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Endpoint not found",
    availableEndpoints: [
      "GET /",
      "GET /api/status",
      "POST /api/upload-csv",
      "POST /api/search",
      "POST /api/search-fallback",
      "POST /api/generate-embeddings"
    ]
  });
});

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 API URL: http://localhost:${PORT}`);
  console.log(`🌐 Web Interface: http://localhost:${PORT}`);
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
