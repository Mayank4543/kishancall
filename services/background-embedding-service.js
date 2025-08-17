require("dotenv").config();
const mongoose = require("mongoose");
const Document = require("../models/Document");
const {
  generateEmbedding,
  createEmbeddingText,
  initializeEmbeddingPipeline,
  connectToMongoDB,
} = require("./semantic-search");

class BackgroundEmbeddingService {
  constructor() {
    this.isRunning = false;
    this.isPaused = false;
    this.isStopping = false;
    this.currentBatch = 0;
    this.totalDocuments = 0;
    this.processedDocuments = 0;
    this.failedDocuments = 0;
    this.startTime = null;
    this.pauseTime = null;
    this.totalPauseDuration = 0;
    this.batchSize = 50; // Process in smaller batches for better control
    this.delayBetweenBatches = 100; // 100ms delay between batches to prevent overwhelming
    this.retryAttempts = 3;
    this.logs = [];
    this.maxLogEntries = 1000;
    this.lastProcessedId = null;
    this.estimatedTimeRemaining = null;
    this.averageProcessingTime = 0;
    this.processingTimes = [];
    this.currentOperation = null;
    this.errorCount = 0;
    this.successCount = 0;
    this.onProgressCallback = null;
    this.onCompleteCallback = null;
    this.onErrorCallback = null;
    this.processingQueue = [];
    this.priority = "normal"; // normal, high, low
    this.concurrentWorkers = 1; // Number of concurrent processing workers
    this.activeWorkers = 0;
    this.skipExisting = true; // Skip documents that already have embeddings
    
    // CSV Processing Queue
    this.csvQueue = [];
    this.csvProcessingActive = false;
    this.currentCsvTask = null;
    this.csvTaskId = 0;
    this.onCsvProgressCallback = null;
    this.onCsvCompleteCallback = null;
    this.onCsvErrorCallback = null;
  }

  /**
   * Add a log entry with timestamp and proper formatting
   */
  addLog(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      data,
      batchNumber: this.currentBatch,
      processedCount: this.processedDocuments,
    };

    this.logs.push(logEntry);

    // Keep logs within limit
    if (this.logs.length > this.maxLogEntries) {
      this.logs = this.logs.slice(-this.maxLogEntries);
    }

    // Console output with proper formatting
    const levelEmoji = {
      info: "ℹ️",
      success: "✅",
      warning: "⚠️",
      error: "❌",
      debug: "🐛",
      progress: "⚡",
    };

    const emoji = levelEmoji[level] || "ℹ️";
    const timeStr = new Date().toLocaleTimeString();

    if (data) {
      console.log(`[${timeStr}] ${emoji} ${message}`, data);
    } else {
      console.log(`[${timeStr}] ${emoji} ${message}`);
    }

    return logEntry;
  }

  /**
   * Get the current status of the embedding generation process
   */
  getStatus() {
    const status = {
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      isStopping: this.isStopping,
      currentBatch: this.currentBatch,
      totalDocuments: this.totalDocuments,
      processedDocuments: this.processedDocuments,
      failedDocuments: this.failedDocuments,
      successDocuments: this.successCount,
      errorCount: this.errorCount,
      progress:
        this.totalDocuments > 0
          ? ((this.processedDocuments / this.totalDocuments) * 100).toFixed(2)
          : 0,
      estimatedTimeRemaining: this.estimatedTimeRemaining,
      averageProcessingTime: this.averageProcessingTime,
      startTime: this.startTime,
      pauseTime: this.pauseTime,
      totalPauseDuration: this.totalPauseDuration,
      batchSize: this.batchSize,
      delayBetweenBatches: this.delayBetweenBatches,
      retryAttempts: this.retryAttempts,
      currentOperation: this.currentOperation,
      lastProcessedId: this.lastProcessedId,
      priority: this.priority,
      concurrentWorkers: this.concurrentWorkers,
      activeWorkers: this.activeWorkers,
      skipExisting: this.skipExisting,
      configuration: {
        batchSize: this.batchSize,
        delayBetweenBatches: this.delayBetweenBatches,
        retryAttempts: this.retryAttempts,
        concurrentWorkers: this.concurrentWorkers,
        priority: this.priority,
        skipExisting: this.skipExisting,
      },
    };

    // Calculate elapsed time
    if (this.startTime) {
      const currentTime = this.isPaused ? this.pauseTime : new Date();
      status.elapsedTime =
        currentTime - this.startTime - this.totalPauseDuration;
      status.elapsedTimeFormatted = this.formatDuration(status.elapsedTime);

      if (this.estimatedTimeRemaining) {
        status.estimatedTimeRemainingFormatted = this.formatDuration(
          this.estimatedTimeRemaining
        );
      }
    }

    return status;
  }

  /**
   * Get recent logs
   */
  getLogs(limit = 50, level = null) {
    let logs = this.logs;

    if (level) {
      logs = logs.filter((log) => log.level === level);
    }

    return logs.slice(-limit).reverse(); // Most recent first
  }

  /**
   * Clear all logs
   */
  clearLogs() {
    this.logs = [];
    this.addLog("info", "Logs cleared");
  }

  /**
   * Format duration in milliseconds to human readable format
   */
  formatDuration(ms) {
    if (!ms || ms < 0) return "N/A";

    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Calculate average processing time and estimate remaining time
   */
  updateTimeEstimates(processingTime) {
    this.processingTimes.push(processingTime);

    // Keep only last 100 processing times for better accuracy
    if (this.processingTimes.length > 100) {
      this.processingTimes = this.processingTimes.slice(-100);
    }

    // Calculate average
    this.averageProcessingTime =
      this.processingTimes.reduce((a, b) => a + b, 0) /
      this.processingTimes.length;

    // Estimate remaining time
    const remainingDocuments = this.totalDocuments - this.processedDocuments;
    this.estimatedTimeRemaining =
      remainingDocuments * this.averageProcessingTime;
  }

  /**
   * Configure the embedding generation process
   */
  configure(options = {}) {
    if (this.isRunning && !this.isPaused) {
      throw new Error(
        "Cannot configure while process is running. Please pause first."
      );
    }

    const validOptions = [
      "batchSize",
      "delayBetweenBatches",
      "retryAttempts",
      "priority",
      "concurrentWorkers",
      "skipExisting",
    ];

    for (const [key, value] of Object.entries(options)) {
      if (validOptions.includes(key)) {
        const oldValue = this[key];
        this[key] = value;
        this.addLog(
          "info",
          `Configuration updated: ${key} changed from ${oldValue} to ${value}`
        );
      } else {
        this.addLog("warning", `Invalid configuration option: ${key}`);
      }
    }

    // Validate configuration
    this.batchSize = Math.max(1, Math.min(1000, this.batchSize));
    this.delayBetweenBatches = Math.max(0, this.delayBetweenBatches);
    this.retryAttempts = Math.max(0, Math.min(10, this.retryAttempts));
    this.concurrentWorkers = Math.max(1, Math.min(5, this.concurrentWorkers));

    this.addLog(
      "info",
      "Configuration validated and applied",
      this.getConfiguration()
    );
  }

  /**
   * Get current configuration
   */
  getConfiguration() {
    return {
      batchSize: this.batchSize,
      delayBetweenBatches: this.delayBetweenBatches,
      retryAttempts: this.retryAttempts,
      priority: this.priority,
      concurrentWorkers: this.concurrentWorkers,
      skipExisting: this.skipExisting,
    };
  }

  /**
   * Set progress callback
   */
  onProgress(callback) {
    this.onProgressCallback = callback;
  }

  /**
   * Set completion callback
   */
  onComplete(callback) {
    this.onCompleteCallback = callback;
  }

  /**
   * Set error callback
   */
  onError(callback) {
    this.onErrorCallback = callback;
  }

  /**
   * Validate that we're only processing documents without embeddings
   */
  async validateSafetyFilter() {
    const filter = this.skipExisting
      ? {
          $or: [
            { embedding: { $exists: false } },
            { embedding: { $size: 0 } },
            { embedding: null },
          ],
        }
      : {};

    // Count documents that would be processed
    const documentsToProcess = await Document.countDocuments(filter);

    // Count documents that already have embeddings
    const documentsWithEmbeddings = await Document.countDocuments({
      embedding: { $exists: true, $ne: null, $not: { $size: 0 } },
    });

    // Count total documents
    const totalDocuments = await Document.countDocuments({});

    this.addLog("info", "🔒 Data Safety Validation:", {
      totalDocuments,
      documentsWithEmbeddings,
      documentsToProcess,
      documentsProtected: documentsWithEmbeddings,
      protectionPercentage:
        totalDocuments > 0
          ? ((documentsWithEmbeddings / totalDocuments) * 100).toFixed(2) + "%"
          : "0%",
    });

    return {
      totalDocuments,
      documentsWithEmbeddings,
      documentsToProcess,
      safetyValidated: true,
    };
  }

  /**
   * Start the background embedding generation process
   */
  async start(options = {}) {
    if (this.isRunning) {
      throw new Error("Embedding generation is already running");
    }

    try {
      this.addLog(
        "info",
        "🚀 Starting background embedding generation process..."
      );

      // Apply any configuration options
      if (Object.keys(options).length > 0) {
        this.configure(options);
      }

      // Reset counters
      this.isRunning = true;
      this.isPaused = false;
      this.isStopping = false;
      this.currentBatch = 0;
      this.processedDocuments = 0;
      this.failedDocuments = 0;
      this.successCount = 0;
      this.errorCount = 0;
      this.startTime = new Date();
      this.pauseTime = null;
      this.totalPauseDuration = 0;
      this.processingTimes = [];
      this.lastProcessedId = null;
      this.currentOperation = "initializing";

      // Connect to MongoDB
      this.addLog("info", "Connecting to MongoDB...");
      await connectToMongoDB();

      // Initialize embedding pipeline
      this.addLog("info", "Initializing embedding model...");
      await initializeEmbeddingPipeline();

      // Validate data safety before processing
      this.addLog("info", "Validating data safety...");
      const safetyValidation = await this.validateSafetyFilter();

      // Count total documents needing embeddings
      this.currentOperation = "counting_documents";
      const filter = this.skipExisting
        ? {
            $or: [
              { embedding: { $exists: false } },
              { embedding: { $size: 0 } },
              { embedding: null },
            ],
          }
        : {};

      this.totalDocuments = await Document.countDocuments(filter);

      this.addLog(
        "info",
        `Found ${this.totalDocuments} documents that need embeddings`
      );

      if (this.totalDocuments === 0) {
        this.addLog("success", "All documents already have embeddings!");
        this.isRunning = false;
        if (this.onCompleteCallback) {
          this.onCompleteCallback(this.getStatus());
        }
        return this.getStatus();
      }

      this.currentOperation = "processing_embeddings";
      this.addLog(
        "info",
        `Starting to process ${this.totalDocuments} documents in batches of ${this.batchSize}`
      );

      // Start processing
      await this.processEmbeddings();

      this.addLog(
        "success",
        "🎉 Background embedding generation completed successfully!"
      );
    } catch (error) {
      this.addLog(
        "error",
        "Failed to start embedding generation",
        error.message
      );
      this.isRunning = false;
      if (this.onErrorCallback) {
        this.onErrorCallback(error, this.getStatus());
      }
      throw error;
    }
  }

  /**
   * Pause the embedding generation process
   */
  async pause() {
    if (!this.isRunning || this.isPaused) {
      throw new Error("Cannot pause: process is not running or already paused");
    }

    this.isPaused = true;
    this.pauseTime = new Date();
    this.currentOperation = "paused";
    this.addLog("warning", "⏸️ Embedding generation paused");

    return this.getStatus();
  }

  /**
   * Resume the embedding generation process
   */
  async resume() {
    if (!this.isRunning || !this.isPaused) {
      throw new Error("Cannot resume: process is not paused");
    }

    // Calculate pause duration
    const pauseDuration = new Date() - this.pauseTime;
    this.totalPauseDuration += pauseDuration;

    this.isPaused = false;
    this.pauseTime = null;
    this.currentOperation = "processing_embeddings";
    this.addLog("info", "▶️ Embedding generation resumed", {
      pauseDuration: this.formatDuration(pauseDuration),
    });

    // Continue processing
    await this.processEmbeddings();

    return this.getStatus();
  }

  /**
   * Stop the embedding generation process
   */
  async stop() {
    if (!this.isRunning) {
      throw new Error("Process is not running");
    }

    this.isStopping = true;
    this.currentOperation = "stopping";
    this.addLog("warning", "🛑 Stopping embedding generation process...");

    // Wait for current batch to complete
    let attempts = 0;
    while (this.activeWorkers > 0 && attempts < 30) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      attempts++;
    }

    this.isRunning = false;
    this.isPaused = false;
    this.isStopping = false;
    this.currentOperation = "stopped";

    const status = this.getStatus();
    this.addLog("info", "🛑 Embedding generation stopped", {
      processedDocuments: this.processedDocuments,
      totalDocuments: this.totalDocuments,
      progress: status.progress + "%",
    });

    return status;
  }

  /**
   * Main processing loop for generating embeddings
   */
  async processEmbeddings() {
    try {
      const filter = this.skipExisting
        ? {
            $or: [
              { embedding: { $exists: false } },
              { embedding: { $size: 0 } },
              { embedding: null },
            ],
          }
        : {};

      let skip = 0;

      while (
        this.processedDocuments < this.totalDocuments &&
        this.isRunning &&
        !this.isStopping
      ) {
        // Handle pause
        if (this.isPaused) {
          this.addLog("info", "Process is paused, waiting...");
          while (this.isPaused && this.isRunning) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
          if (!this.isRunning) break;
        }

        this.currentBatch++;
        const batchStartTime = Date.now();

        this.addLog("progress", `📦 Processing batch ${this.currentBatch}...`);

        try {
          // Get batch of documents
          const documents = await Document.find(filter)
            .select(
              "_id StateName DistrictName Category QueryType QueryText KccAns embedding"
            )
            .limit(this.batchSize)
            .skip(skip)
            .lean();

          if (documents.length === 0) {
            this.addLog("info", "No more documents to process");
            break;
          }

          // Process documents in the batch
          await this.processBatch(documents);

          skip += this.batchSize;

          // Update time estimates
          const batchTime = Date.now() - batchStartTime;
          this.updateTimeEstimates(batchTime / documents.length);

          // Progress callback
          if (this.onProgressCallback) {
            this.onProgressCallback(this.getStatus());
          }

          // Delay between batches (if configured)
          if (this.delayBetweenBatches > 0) {
            await new Promise((resolve) =>
              setTimeout(resolve, this.delayBetweenBatches)
            );
          }

          // Log progress every 10 batches
          if (this.currentBatch % 10 === 0) {
            const status = this.getStatus();
            this.addLog(
              "progress",
              `⚡ Progress update: ${status.progress}% completed`,
              {
                processed: this.processedDocuments,
                total: this.totalDocuments,
                estimatedTimeRemaining: status.estimatedTimeRemainingFormatted,
                successRate:
                  ((this.successCount / this.processedDocuments) * 100).toFixed(
                    1
                  ) + "%",
              }
            );
          }
        } catch (error) {
          this.addLog(
            "error",
            `Batch ${this.currentBatch} failed`,
            error.message
          );
          this.errorCount++;

          if (this.onErrorCallback) {
            this.onErrorCallback(error, this.getStatus());
          }
        }
      }

      // Process completion
      if (this.isRunning && !this.isStopping) {
        this.isRunning = false;
        this.currentOperation = "completed";

        const finalStatus = this.getStatus();
        this.addLog("success", "🎉 All embeddings generated successfully!", {
          totalProcessed: this.processedDocuments,
          totalSuccessful: this.successCount,
          totalFailed: this.failedDocuments,
          successRate:
            ((this.successCount / this.processedDocuments) * 100).toFixed(1) +
            "%",
          totalTime: finalStatus.elapsedTimeFormatted,
        });

        if (this.onCompleteCallback) {
          this.onCompleteCallback(finalStatus);
        }
      }
    } catch (error) {
      this.addLog("error", "Critical error in processing loop", error.message);
      this.isRunning = false;
      if (this.onErrorCallback) {
        this.onErrorCallback(error, this.getStatus());
      }
      throw error;
    }
  }

  /**
   * Process a batch of documents
   */
  async processBatch(documents) {
    this.activeWorkers++;

    try {
      for (const doc of documents) {
        if (this.isStopping) break;

        let attempts = 0;
        let success = false;

        while (attempts <= this.retryAttempts && !success && !this.isStopping) {
          try {
            const docStartTime = Date.now();

            // Skip if document already has embeddings (double check for safety)
            if (
              this.skipExisting &&
              doc.embedding &&
              Array.isArray(doc.embedding) &&
              doc.embedding.length > 0
            ) {
              this.addLog(
                "debug",
                `Skipping document ${doc._id} - already has ${doc.embedding.length} embedding dimensions`
              );
              this.processedDocuments++;
              success = true;
              continue;
            }

            this.currentOperation = `processing_document_${doc._id}`;

            // Create embedding text
            const embeddingText = createEmbeddingText(doc);

            // Generate embedding
            this.addLog(
              "debug",
              `Generating embedding for document ${doc._id}`
            );
            const embedding = await generateEmbedding(embeddingText);

            // Update document with embedding
            await Document.findByIdAndUpdate(doc._id, { embedding: embedding });

            this.processedDocuments++;
            this.successCount++;
            this.lastProcessedId = doc._id;
            success = true;

            const docTime = Date.now() - docStartTime;
            this.addLog(
              "debug",
              `✅ Document ${doc._id} processed successfully in ${docTime}ms`
            );
          } catch (error) {
            attempts++;
            this.addLog(
              "warning",
              `Attempt ${attempts}/${
                this.retryAttempts + 1
              } failed for document ${doc._id}`,
              error.message
            );

            if (attempts > this.retryAttempts) {
              this.failedDocuments++;
              this.errorCount++;
              this.processedDocuments++;
              this.addLog(
                "error",
                `❌ Failed to process document ${doc._id} after ${attempts} attempts`,
                error.message
              );
            } else {
              // Wait before retry
              await new Promise((resolve) =>
                setTimeout(resolve, 1000 * attempts)
              );
            }
          }
        }
      }
    } finally {
      this.activeWorkers--;
    }
  }

  /**
   * Get detailed statistics
   */
  getStatistics() {
    const status = this.getStatus();
    return {
      ...status,
      statistics: {
        successRate:
          this.processedDocuments > 0
            ? ((this.successCount / this.processedDocuments) * 100).toFixed(2)
            : 0,
        failureRate:
          this.processedDocuments > 0
            ? ((this.failedDocuments / this.processedDocuments) * 100).toFixed(
                2
              )
            : 0,
        averageProcessingTimeMs: this.averageProcessingTime.toFixed(2),
        totalBatches: this.currentBatch,
        documentsPerBatch:
          this.processedDocuments > 0
            ? (this.processedDocuments / this.currentBatch).toFixed(2)
            : 0,
        errorsPerBatch:
          this.currentBatch > 0
            ? (this.errorCount / this.currentBatch).toFixed(2)
            : 0,
      },
    };
  }

  /**
   * Reset the service to initial state
   */
  reset() {
    if (this.isRunning) {
      throw new Error(
        "Cannot reset while process is running. Please stop first."
      );
    }

    this.isRunning = false;
    this.isPaused = false;
    this.isStopping = false;
    this.currentBatch = 0;
    this.totalDocuments = 0;
    this.processedDocuments = 0;
    this.failedDocuments = 0;
    this.startTime = null;
    this.pauseTime = null;
    this.totalPauseDuration = 0;
    this.logs = [];
    this.lastProcessedId = null;
    this.estimatedTimeRemaining = null;
    this.averageProcessingTime = 0;
    this.processingTimes = [];
    this.currentOperation = null;
    this.errorCount = 0;
    this.successCount = 0;
    this.activeWorkers = 0;

    this.addLog("info", "Service reset to initial state");
  }

  // ==========================================
  // CSV PROCESSING QUEUE METHODS
  // ==========================================

  /**
   * Add a CSV file to the background processing queue
   */
  addCsvToQueue(filePath, fileName, options = {}) {
    const taskId = ++this.csvTaskId;
    const csvTask = {
      id: taskId,
      filePath: filePath,
      fileName: fileName,
      status: "queued",
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
      totalRecords: 0,
      processedRecords: 0,
      insertedRecords: 0,
      failedRecords: 0,
      progress: 0,
      error: null,
      options: {
        clearExisting: options.clearExisting || false,
        generateEmbeddings: options.generateEmbeddings || true,
        batchSize: options.batchSize || 1000,
        ...options
      }
    };

    this.csvQueue.push(csvTask);
    this.addLog("info", `📄 CSV file added to queue: ${fileName}`, { taskId, fileName, queueLength: this.csvQueue.length });

    // Start processing if not already active
    if (!this.csvProcessingActive) {
      this.startCsvProcessing();
    }

    return csvTask;
  }

  /**
   * Get CSV processing queue status
   */
  getCsvQueueStatus() {
    return {
      active: this.csvProcessingActive,
      queueLength: this.csvQueue.length,
      currentTask: this.currentCsvTask,
      queue: this.csvQueue.map(task => ({
        id: task.id,
        fileName: task.fileName,
        status: task.status,
        progress: task.progress,
        createdAt: task.createdAt,
        startedAt: task.startedAt,
        completedAt: task.completedAt,
        totalRecords: task.totalRecords,
        processedRecords: task.processedRecords,
        insertedRecords: task.insertedRecords,
        failedRecords: task.failedRecords,
        error: task.error
      }))
    };
  }

  /**
   * Start CSV processing queue
   */
  async startCsvProcessing() {
    if (this.csvProcessingActive || this.csvQueue.length === 0) {
      return;
    }

    this.csvProcessingActive = true;
    this.addLog("info", "🚀 Starting CSV processing queue...");

    while (this.csvQueue.length > 0 && this.csvProcessingActive) {
      const task = this.csvQueue.shift();
      this.currentCsvTask = task;
      
      try {
        await this.processCsvFile(task);
      } catch (error) {
        this.addLog("error", `Failed to process CSV task ${task.id}`, error.message);
        task.status = "failed";
        task.error = error.message;
        task.completedAt = new Date();
        
        if (this.onCsvErrorCallback) {
          this.onCsvErrorCallback(error, task);
        }
      }
    }

    this.csvProcessingActive = false;
    this.currentCsvTask = null;
    this.addLog("info", "📋 CSV processing queue completed");
  }

  /**
   * Process a single CSV file
   */
  async processCsvFile(task) {
    const fs = require("fs");
    const csv = require("csv-parser");
    const Document = require("../models/Document");

    task.status = "processing";
    task.startedAt = new Date();
    
    this.addLog("info", `📄 Processing CSV file: ${task.fileName}`, { taskId: task.id });

    // Clear existing documents if requested
    if (task.options.clearExisting) {
      this.addLog("info", "🗑️ Clearing existing documents...", { taskId: task.id });
      await Document.deleteMany({});
    }

    const records = [];
    let totalProcessed = 0;

    return new Promise((resolve, reject) => {
      fs.createReadStream(task.filePath)
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
          if (records.length >= task.options.batchSize) {
            this.processRecordBatch(records.splice(0, task.options.batchSize), task)
              .then((count) => {
                task.insertedRecords += count;
                task.processedRecords += task.options.batchSize;
                this.updateCsvProgress(task);
              })
              .catch(console.error);
          }
        })
        .on("end", async () => {
          try {
            // Process remaining records
            if (records.length > 0) {
              const count = await this.processRecordBatch(records, task);
              task.insertedRecords += count;
              task.processedRecords += records.length;
            }

            // Clean up uploaded file
            if (fs.existsSync(task.filePath)) {
              fs.unlinkSync(task.filePath);
            }

            task.totalRecords = totalProcessed - 1; // Subtract header row
            task.status = "completed";
            task.completedAt = new Date();
            task.progress = 100;

            this.addLog(
              "success",
              `✅ CSV processing completed: ${task.insertedRecords} documents inserted`,
              { taskId: task.id, fileName: task.fileName }
            );

            // Start embedding generation if requested
            if (task.options.generateEmbeddings && !this.isRunning) {
              this.addLog("info", "🧠 Starting embedding generation for new documents...", { taskId: task.id });
              this.start().catch(error => {
                this.addLog("error", "Failed to start embedding generation", error.message);
              });
            }

            if (this.onCsvCompleteCallback) {
              this.onCsvCompleteCallback(task);
            }

            resolve(task);
          } catch (error) {
            task.status = "failed";
            task.error = error.message;
            task.completedAt = new Date();
            
            this.addLog("error", "CSV processing error", error.message);
            reject(error);
          }
        })
        .on("error", (error) => {
          task.status = "failed";
          task.error = error.message;
          task.completedAt = new Date();
          
          this.addLog("error", "CSV parsing error", error.message);
          reject(error);
        });
    });
  }

  /**
   * Process a batch of records for CSV import
   */
  async processRecordBatch(records, task) {
    try {
      const Document = require("../models/Document");
      const result = await Document.insertMany(records, { ordered: false });
      return result.length;
    } catch (error) {
      this.addLog("warning", `Batch insert error for task ${task.id}`, error.message);
      task.failedRecords += records.length;
      return 0;
    }
  }

  /**
   * Update CSV processing progress
   */
  updateCsvProgress(task) {
    if (task.totalRecords > 0) {
      task.progress = Math.min(100, (task.processedRecords / task.totalRecords) * 100);
    }

    if (this.onCsvProgressCallback) {
      this.onCsvProgressCallback(task);
    }
  }

  /**
   * Set CSV progress callback
   */
  onCsvProgress(callback) {
    this.onCsvProgressCallback = callback;
  }

  /**
   * Set CSV completion callback
   */
  onCsvComplete(callback) {
    this.onCsvCompleteCallback = callback;
  }

  /**
   * Set CSV error callback
   */
  onCsvError(callback) {
    this.onCsvErrorCallback = callback;
  }

  /**
   * Clear CSV queue
   */
  clearCsvQueue() {
    this.csvQueue = [];
    this.currentCsvTask = null;
    this.addLog("info", "📋 CSV queue cleared");
  }

  /**
   * Stop CSV processing
   */
  stopCsvProcessing() {
    this.csvProcessingActive = false;
    this.addLog("info", "🛑 CSV processing stopped");
  }
}

// Create singleton instance
const backgroundEmbeddingService = new BackgroundEmbeddingService();

module.exports = backgroundEmbeddingService;
