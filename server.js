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
  dest: "uploads/",
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
});

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static("public"));

// Global variables
let isEmbeddingsReady = false;
let isInitializing = false;

// Import semantic search functions
let semanticSearchModule;
try {
  semanticSearchModule = require("./services/semantic-search");
  console.log("✅ Semantic search module loaded");
} catch (error) {
  console.error("❌ Failed to load semantic search module:", error.message);
}

// Import background embedding service
let backgroundEmbeddingService;
try {
  backgroundEmbeddingService = require("./services/background-embedding-service");
  console.log("✅ Background embedding service loaded");
} catch (error) {
  console.error(
    "❌ Failed to load background embedding service:",
    error.message
  );
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

    console.log(
      `📊 Documents with embeddings: ${documentsWithEmbeddings}/${totalDocuments}`
    );

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
      latestData: "GET /api/latest-data",
      generateEmbeddings: "POST /api/generate-embeddings",
      backgroundEmbeddings: {
        start: "POST /api/background-embeddings/start",
        pause: "POST /api/background-embeddings/pause",
        resume: "POST /api/background-embeddings/resume",
        stop: "POST /api/background-embeddings/stop",
        status: "GET /api/background-embeddings/status",
        safetyCheck: "GET /api/background-embeddings/safety-check",
        logs: "GET /api/background-embeddings/logs",
        config: "POST /api/background-embeddings/config",
        reset: "POST /api/background-embeddings/reset",
      },
      csvQueue: {
        status: "GET /api/csv-queue/status",
        clear: "POST /api/csv-queue/clear",
        stop: "POST /api/csv-queue/stop",
        start: "POST /api/csv-queue/start",
      },
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

    // Get background embedding service status
    let backgroundStatus = null;
    let csvQueueStatus = null;

    if (backgroundEmbeddingService) {
      backgroundStatus = backgroundEmbeddingService.getStatus();
      csvQueueStatus = backgroundEmbeddingService.getCsvQueueStatus();
    }

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
      backgroundEmbedding: backgroundStatus,
      csvQueue: csvQueueStatus,
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

/**
 * Enhanced CSV Upload endpoint with background processing option
 */
app.post("/api/upload-csv", upload.single("csvFile"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: "No file uploaded",
      });
    }

    const filePath = req.file.path;
    const fileName = req.file.originalname;
    const processInBackground = req.body.processInBackground === "true";
    const clearExisting = req.body.clearExisting === "true";
    const generateEmbeddings = req.body.generateEmbeddings !== "false"; // default true

    console.log(`📁 Processing uploaded CSV: ${fileName}`);
    console.log(`📋 Background processing: ${processInBackground}`);

    if (processInBackground && backgroundEmbeddingService) {
      // Add to background processing queue
      const csvTask = backgroundEmbeddingService.addCsvToQueue(
        filePath,
        fileName,
        {
          clearExisting,
          generateEmbeddings,
          batchSize: parseInt(req.body.batchSize) || 1000,
        }
      );

      return res.json({
        success: true,
        message: "CSV file added to background processing queue",
        taskId: csvTask.id,
        fileName: fileName,
        processInBackground: true,
        queueStatus: backgroundEmbeddingService.getCsvQueueStatus(),
      });
    } else {
      // Process immediately (legacy behavior)
      const Document = require("./models/Document");

      // Clear existing documents if requested
      if (clearExisting) {
        console.log("🗑️ Clearing existing documents...");
        await Document.deleteMany({});
      }

      // Process CSV file
      const records = [];
      let totalProcessed = 0;
      let totalInserted = 0;

      return new Promise((resolve) => {
        fs.createReadStream(filePath)
          .pipe(
            csv({
              skipEmptyLines: true,
              headers: [
                "StateName",
                "DistrictName",
                "BlockName",
                "Season",
                "Sector",
                "Category",
                "Crop",
                "QueryType",
                "QueryText",
                "KccAns",
                "CreatedOn",
                "year",
                "month",
              ],
            })
          )
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
              embedding: [],
            };

            records.push(cleanRecord);

            // Process in batches
            if (records.length >= 1000) {
              processRecordBatch(records.splice(0, 1000))
                .then((count) => {
                  totalInserted += count;
                })
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

              console.log(
                `✅ CSV processing completed: ${totalInserted} documents inserted`
              );

              res.json({
                success: true,
                message: "CSV uploaded and processed successfully",
                totalProcessed: totalProcessed - 1, // Subtract header row
                totalInserted: totalInserted,
                processInBackground: false,
              });

              resolve();
            } catch (error) {
              console.error("CSV processing error:", error);
              res.status(500).json({
                error: "CSV processing failed",
                message: error.message,
              });
              resolve();
            }
          })
          .on("error", (error) => {
            console.error("CSV parsing error:", error);
            res.status(500).json({
              error: "CSV parsing failed",
              message: error.message,
            });
            resolve();
          });
      });
    }
  } catch (error) {
    console.error("❌ CSV upload error:", error);
    res.status(500).json({
      error: "CSV upload failed",
      message: error.message,
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
        error: "Semantic search module not available",
      });
    }

    const { query, topK = 10, filters = {} } = req.body;

    if (!query) {
      return res.status(400).json({
        error: "Query parameter is required",
      });
    }

    console.log(`🔍 Vector search request: "${query}" (topK: ${topK})`);

    const startTime = Date.now();
    const results = await semanticSearchModule.semanticSearch(
      query,
      topK,
      filters
    );
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
 * Fallback search endpoint
 */
app.post("/api/search-fallback", async (req, res) => {
  try {
    if (!semanticSearchModule || !semanticSearchModule.semanticSearchFallback) {
      return res.status(503).json({
        error: "Fallback search not available",
      });
    }

    const { query, topK = 10, filters = {} } = req.body;

    if (!query) {
      return res.status(400).json({
        error: "Query parameter is required",
      });
    }

    console.log(`🔍 Fallback search request: "${query}" (topK: ${topK})`);

    const startTime = Date.now();
    const results = await semanticSearchModule.semanticSearchFallback(
      query,
      topK,
      filters
    );
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
    console.error("❌ Fallback search error:", error);
    res.status(500).json({
      error: "Fallback search failed",
      message: error.message,
    });
  }
});

/**
 * Get latest/newest documents endpoint
 */
app.get("/api/latest-data", async (req, res) => {
  try {
    const { limit = 10, filters = {} } = req.query;

    console.log(`📅 Fetching latest ${limit} documents`);

    // Build the MongoDB filter
    const mongoFilter = {};

    // Add optional filters
    if (filters.StateName) {
      mongoFilter.StateName = new RegExp(filters.StateName, "i");
    }
    if (filters.Category) {
      mongoFilter.Category = new RegExp(filters.Category, "i");
    }

    const startTime = Date.now();

    // Get the latest documents sorted by CreatedOn (newest first)
    const latestDocuments = await Document.find(mongoFilter, {
      _id: 1,
      StateName: 1,
      DistrictName: 1,
      Category: 1,
      QueryType: 1,
      QueryText: 1,
      KccAns: 1,
      Crop: 1,
      Season: 1,
      CreatedOn: 1,
    })
      .sort({ CreatedOn: -1 }) // Sort by newest first
      .limit(parseInt(limit))
      .lean();

    const fetchTime = Date.now() - startTime;

    console.log(
      `✅ Fetched ${latestDocuments.length} latest documents in ${fetchTime}ms`
    );

    res.json({
      success: true,
      message: "Latest data fetched successfully",
      totalFound: latestDocuments.length,
      fetchTime: `${fetchTime}ms`,
      results: latestDocuments.map((doc) => ({
        id: doc._id,
        StateName: doc.StateName,
        DistrictName: doc.DistrictName,
        Category: doc.Category,
        QueryType: doc.QueryType,
        QueryText: doc.QueryText,
        KccAns: doc.KccAns,
        Crop: doc.Crop,
        Season: doc.Season,
        CreatedOn: doc.CreatedOn,
        isLatest: true, // Flag to indicate this is latest data
      })),
    });
  } catch (error) {
    console.error("❌ Latest data fetch error:", error);
    res.status(500).json({
      error: "Failed to fetch latest data",
      message: error.message,
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
        error: "Semantic search module not available",
      });
    }

    console.log("🧠 Starting embedding generation via API...");

    // Start the process asynchronously
    semanticSearchModule
      .generateEmbeddingsForAllDocuments()
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

// ==========================================
// BACKGROUND EMBEDDING ENDPOINTS
// ==========================================

/**
 * Start background embedding generation
 */
app.post("/api/background-embeddings/start", async (req, res) => {
  try {
    if (!backgroundEmbeddingService) {
      return res.status(503).json({
        error: "Background embedding service not available",
      });
    }

    const options = req.body || {};

    console.log("🚀 Starting background embedding generation...");

    // Set up callbacks for real-time updates
    backgroundEmbeddingService.onProgress((status) => {
      console.log(
        `📊 Progress: ${status.progress}% (${status.processedDocuments}/${status.totalDocuments})`
      );
    });

    backgroundEmbeddingService.onComplete((status) => {
      console.log("🎉 Background embedding generation completed!");
      isEmbeddingsReady = true;
    });

    backgroundEmbeddingService.onError((error, status) => {
      console.error("❌ Background embedding error:", error.message);
    });

    // Start the process (non-blocking)
    backgroundEmbeddingService.start(options).catch((error) => {
      console.error("❌ Failed to start background embedding:", error);
    });

    res.json({
      success: true,
      message: "Background embedding generation started successfully",
      status: backgroundEmbeddingService.getStatus(),
      configuration: backgroundEmbeddingService.getConfiguration(),
    });
  } catch (error) {
    console.error("❌ Background embedding start error:", error);
    res.status(500).json({
      error: "Failed to start background embedding generation",
      message: error.message,
    });
  }
});

/**
 * Pause background embedding generation
 */
app.post("/api/background-embeddings/pause", async (req, res) => {
  try {
    if (!backgroundEmbeddingService) {
      return res.status(503).json({
        error: "Background embedding service not available",
      });
    }

    const status = await backgroundEmbeddingService.pause();

    res.json({
      success: true,
      message: "Background embedding generation paused successfully",
      status: status,
    });
  } catch (error) {
    console.error("❌ Background embedding pause error:", error);
    res.status(400).json({
      error: "Failed to pause background embedding generation",
      message: error.message,
    });
  }
});

/**
 * Resume background embedding generation
 */
app.post("/api/background-embeddings/resume", async (req, res) => {
  try {
    if (!backgroundEmbeddingService) {
      return res.status(503).json({
        error: "Background embedding service not available",
      });
    }

    const status = await backgroundEmbeddingService.resume();

    res.json({
      success: true,
      message: "Background embedding generation resumed successfully",
      status: status,
    });
  } catch (error) {
    console.error("❌ Background embedding resume error:", error);
    res.status(400).json({
      error: "Failed to resume background embedding generation",
      message: error.message,
    });
  }
});

/**
 * Stop background embedding generation
 */
app.post("/api/background-embeddings/stop", async (req, res) => {
  try {
    if (!backgroundEmbeddingService) {
      return res.status(503).json({
        error: "Background embedding service not available",
      });
    }

    const status = await backgroundEmbeddingService.stop();

    res.json({
      success: true,
      message: "Background embedding generation stopped successfully",
      status: status,
    });
  } catch (error) {
    console.error("❌ Background embedding stop error:", error);
    res.status(400).json({
      error: "Failed to stop background embedding generation",
      message: error.message,
    });
  }
});

/**
 * Get background embedding generation status
 */
app.get("/api/background-embeddings/status", (req, res) => {
  try {
    if (!backgroundEmbeddingService) {
      return res.status(503).json({
        error: "Background embedding service not available",
      });
    }

    const detailed = req.query.detailed === "true";

    if (detailed) {
      res.json({
        success: true,
        status: backgroundEmbeddingService.getStatistics(),
      });
    } else {
      res.json({
        success: true,
        status: backgroundEmbeddingService.getStatus(),
      });
    }
  } catch (error) {
    console.error("❌ Background embedding status error:", error);
    res.status(500).json({
      error: "Failed to get background embedding status",
      message: error.message,
    });
  }
});

/**
 * Safety check - validate what documents will be processed without embeddings
 */
app.get("/api/background-embeddings/safety-check", async (req, res) => {
  try {
    if (!backgroundEmbeddingService) {
      return res.status(503).json({
        error: "Background embedding service not available",
      });
    }

    const safetyValidation =
      await backgroundEmbeddingService.validateSafetyFilter();

    res.json({
      success: true,
      safetyValidation,
    });
  } catch (error) {
    console.error("❌ Background embedding safety check error:", error);
    res.status(500).json({
      error: "Failed to perform safety check",
      message: error.message,
    });
  }
});

/**
 * Get background embedding generation logs
 */
app.get("/api/background-embeddings/logs", (req, res) => {
  try {
    if (!backgroundEmbeddingService) {
      return res.status(503).json({
        error: "Background embedding service not available",
      });
    }

    const limit = parseInt(req.query.limit) || 50;
    const level = req.query.level || null;
    const clear = req.query.clear === "true";

    let logs = backgroundEmbeddingService.getLogs(limit, level);

    if (clear) {
      backgroundEmbeddingService.clearLogs();
    }

    res.json({
      success: true,
      logs: logs,
      totalLogs: logs.length,
      filters: {
        limit: limit,
        level: level,
      },
    });
  } catch (error) {
    console.error("❌ Background embedding logs error:", error);
    res.status(500).json({
      error: "Failed to get background embedding logs",
      message: error.message,
    });
  }
});

/**
 * Configure background embedding generation
 */
app.post("/api/background-embeddings/config", (req, res) => {
  try {
    if (!backgroundEmbeddingService) {
      return res.status(503).json({
        error: "Background embedding service not available",
      });
    }

    const options = req.body || {};

    backgroundEmbeddingService.configure(options);

    res.json({
      success: true,
      message: "Configuration updated successfully",
      configuration: backgroundEmbeddingService.getConfiguration(),
    });
  } catch (error) {
    console.error("❌ Background embedding config error:", error);
    res.status(400).json({
      error: "Failed to update configuration",
      message: error.message,
    });
  }
});

/**
 * Reset background embedding service
 */
app.post("/api/background-embeddings/reset", (req, res) => {
  try {
    if (!backgroundEmbeddingService) {
      return res.status(503).json({
        error: "Background embedding service not available",
      });
    }

    backgroundEmbeddingService.reset();

    res.json({
      success: true,
      message: "Background embedding service reset successfully",
    });
  } catch (error) {
    console.error("❌ Background embedding reset error:", error);
    res.status(400).json({
      error: "Failed to reset background embedding service",
      message: error.message,
    });
  }
});

// ==========================================
// CSV QUEUE MANAGEMENT ENDPOINTS
// ==========================================

/**
 * Get CSV processing queue status
 */
app.get("/api/csv-queue/status", (req, res) => {
  try {
    if (!backgroundEmbeddingService) {
      return res.status(503).json({
        error: "Background embedding service not available",
      });
    }

    const queueStatus = backgroundEmbeddingService.getCsvQueueStatus();

    res.json({
      success: true,
      queueStatus: queueStatus,
    });
  } catch (error) {
    console.error("❌ CSV queue status error:", error);
    res.status(500).json({
      error: "Failed to get CSV queue status",
      message: error.message,
    });
  }
});

/**
 * Clear CSV processing queue
 */
app.post("/api/csv-queue/clear", (req, res) => {
  try {
    if (!backgroundEmbeddingService) {
      return res.status(503).json({
        error: "Background embedding service not available",
      });
    }

    backgroundEmbeddingService.clearCsvQueue();

    res.json({
      success: true,
      message: "CSV queue cleared successfully",
    });
  } catch (error) {
    console.error("❌ CSV queue clear error:", error);
    res.status(500).json({
      error: "Failed to clear CSV queue",
      message: error.message,
    });
  }
});

/**
 * Stop CSV processing
 */
app.post("/api/csv-queue/stop", (req, res) => {
  try {
    if (!backgroundEmbeddingService) {
      return res.status(503).json({
        error: "Background embedding service not available",
      });
    }

    backgroundEmbeddingService.stopCsvProcessing();

    res.json({
      success: true,
      message: "CSV processing stopped successfully",
    });
  } catch (error) {
    console.error("❌ CSV processing stop error:", error);
    res.status(500).json({
      error: "Failed to stop CSV processing",
      message: error.message,
    });
  }
});

/**
 * Start CSV processing queue
 */
app.post("/api/csv-queue/start", async (req, res) => {
  try {
    if (!backgroundEmbeddingService) {
      return res.status(503).json({
        error: "Background embedding service not available",
      });
    }

    await backgroundEmbeddingService.startCsvProcessing();

    res.json({
      success: true,
      message: "CSV processing queue started",
      queueStatus: backgroundEmbeddingService.getCsvQueueStatus(),
    });
  } catch (error) {
    console.error("❌ CSV processing start error:", error);
    res.status(500).json({
      error: "Failed to start CSV processing",
      message: error.message,
    });
  }
});

// ==========================================
// END BACKGROUND EMBEDDING ENDPOINTS
// ==========================================

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
      "POST /api/upload-csv",
      "POST /api/search",
      "POST /api/search-fallback",
      "GET /api/latest-data",
      "POST /api/generate-embeddings",
      "POST /api/background-embeddings/start",
      "POST /api/background-embeddings/pause",
      "POST /api/background-embeddings/resume",
      "POST /api/background-embeddings/stop",
      "GET /api/background-embeddings/status",
      "GET /api/background-embeddings/logs",
      "POST /api/background-embeddings/config",
      "POST /api/background-embeddings/reset",
      "GET /api/csv-queue/status",
      "POST /api/csv-queue/clear",
      "POST /api/csv-queue/stop",
      "POST /api/csv-queue/start",
    ],
  });
});

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 API URL: http://localhost:${PORT}`);
  console.log(`🌐 Web Interface: http://localhost:${PORT}`);
  console.log(`📊 Status: http://localhost:${PORT}/api/status`);

  // Setup background service callbacks
  if (backgroundEmbeddingService) {
    // Embedding progress callbacks
    backgroundEmbeddingService.onProgress((status) => {
      console.log(
        `📊 Embedding Progress: ${status.progress}% (${status.processedDocuments}/${status.totalDocuments})`
      );
    });

    backgroundEmbeddingService.onComplete((status) => {
      console.log("🎉 Background embedding generation completed!");
      isEmbeddingsReady = true;
    });

    backgroundEmbeddingService.onError((error, status) => {
      console.error("❌ Background embedding error:", error.message);
    });

    // CSV processing callbacks
    backgroundEmbeddingService.onCsvProgress((task) => {
      console.log(
        `📄 CSV Progress: ${task.fileName} - ${task.progress.toFixed(1)}% (${
          task.processedRecords
        }/${task.totalRecords})`
      );
    });

    backgroundEmbeddingService.onCsvComplete((task) => {
      console.log(
        `✅ CSV Processing completed: ${task.fileName} - ${task.insertedRecords} documents inserted`
      );
    });

    backgroundEmbeddingService.onCsvError((error, task) => {
      console.error(
        `❌ CSV Processing error for ${task.fileName}:`,
        error.message
      );
    });
  }

  // Initialize the system
  await initializeSystem();
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Server shutting down...");
  process.exit(0);
});

module.exports = app;
