require("dotenv").config();
const mongoose = require("mongoose");
const { pipeline } = require("@xenova/transformers");

// MongoDB connection URI from environment variables
const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://mayankrathore9897:codemonk234@cluster0.gnop8w8.mongodb.net/mydb";

// Import the shared Document model
const Document = require("./models/Document");

// Global pipeline variable to store the loaded model
let embeddingPipeline = null;

// Query embedding cache to avoid recomputing same queries
const queryEmbeddingCache = new Map();
const CACHE_SIZE_LIMIT = 100; // Limit cache to 100 entries

/**
 * Initialize the embedding pipeline with the local transformer model
 */
async function initializeEmbeddingPipeline() {
  if (!embeddingPipeline) {
    console.log("🤖 Loading Xenova/all-MiniLM-L6-v2 model...");
    embeddingPipeline = await pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2"
    );
    console.log("✅ Model loaded successfully!");
  }
  return embeddingPipeline;
}

/**
 * Connect to MongoDB
 */
async function connectToMongoDB() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ Connected to MongoDB Atlas successfully");
    console.log("📊 Database:", mongoose.connection.name);
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    process.exit(1);
  }
}

/**
 * Create formatted text for embedding generation
 * Format: Category: <Category>. QueryType: <QueryType>. Query: <QueryText>. Answer: <KccAns>
 */
function createEmbeddingText(document) {
  const category = document.Category || "";
  const queryType = document.QueryType || "";
  const queryText = document.QueryText || "";
  const kccAns = document.KccAns || "";

  return `Category: ${category}. QueryType: ${queryType}. Query: ${queryText}. Answer: ${kccAns}`;
}

/**
 * Generate embedding for a given text using the local model with caching
 */
async function generateEmbedding(text) {
  // Check cache first
  const cacheKey = text.toLowerCase().trim();
  if (queryEmbeddingCache.has(cacheKey)) {
    console.log(`🎯 Using cached embedding for query`);
    return queryEmbeddingCache.get(cacheKey);
  }

  const pipeline = await initializeEmbeddingPipeline();
  
  // Generate embedding
  const result = await pipeline(text, { pooling: "mean", normalize: true });
  
  // Convert to regular array
  const embedding = Array.from(result.data);

  // Cache the result (with size limit)
  if (queryEmbeddingCache.size >= CACHE_SIZE_LIMIT) {
    // Remove oldest entry
    const firstKey = queryEmbeddingCache.keys().next().value;
    queryEmbeddingCache.delete(firstKey);
  }
  queryEmbeddingCache.set(cacheKey, embedding);

  return embedding;
}/**
 * Calculate cosine similarity between two vectors (optimized version)
 */
function cosineSimilarity(vectorA, vectorB) {
  if (vectorA.length !== vectorB.length) {
    throw new Error("Vectors must have the same length");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  // Use single loop for better performance
  for (let i = 0; i < vectorA.length; i++) {
    const a = vectorA[i];
    const b = vectorB[i];
    dotProduct += a * b;
    normA += a * a;
    normB += b * b;
  }

  // Early return for zero vectors
  if (normA === 0 || normB === 0) {
    return 0;
  }

  // Use Math.sqrt once for both norms
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Generate embeddings for all documents in the database
 */
async function generateEmbeddingsForAllDocuments() {
  console.log("🔄 Starting embedding generation for all documents...");

  await connectToMongoDB();

  // Get total count
  const totalDocuments = await Document.countDocuments({
    embedding: { $size: 0 },
  });
  console.log(`📊 Found ${totalDocuments} documents without embeddings`);

  if (totalDocuments === 0) {
    console.log("✅ All documents already have embeddings!");
    return;
  }

  // Initialize the embedding pipeline
  await initializeEmbeddingPipeline();

  const batchSize = 100; // Process in smaller batches to avoid memory issues
  let processed = 0;

  while (processed < totalDocuments) {
    console.log(
      `📦 Processing batch ${Math.floor(processed / batchSize) + 1}...`
    );

    // Get a batch of documents without embeddings
    const documents = await Document.find({ embedding: { $size: 0 } }, null, {
      limit: batchSize,
      skip: processed,
    });

    // Process each document in the batch
    for (const doc of documents) {
      try {
        // Create the formatted text for embedding
        const embeddingText = createEmbeddingText(doc);

        // Generate embedding
        const embedding = await generateEmbedding(embeddingText);

        // Update the document with the embedding
        await Document.findByIdAndUpdate(doc._id, { embedding: embedding });

        processed++;

        if (processed % 10 === 0) {
          console.log(
            `   ⚡ Processed ${processed}/${totalDocuments} documents (${(
              (processed / totalDocuments) *
              100
            ).toFixed(1)}%)`
          );
        }
      } catch (error) {
        console.error(
          `❌ Error processing document ${doc._id}:`,
          error.message
        );
      }
    }
  }

  console.log(
    `🎉 Embedding generation completed! Processed ${processed} documents.`
  );
}

/**
 * Fast semantic search using MongoDB aggregation pipeline for better performance
 * @param {string} query - The search query
 * @param {number} topK - Number of top results to return (default: 10)
 * @param {Object} filters - Optional filters for the search
 * @returns {Array} Array of documents with similarity scores
 */
async function fastSemanticSearch(query, topK = 10, filters = {}) {
  console.log(`🚀 Fast semantic search for: "${query}"`);
  const startTime = Date.now();

  // Ensure we're connected to MongoDB
  if (mongoose.connection.readyState !== 1) {
    await connectToMongoDB();
  }

  // Generate embedding for the query
  const embeddingStartTime = Date.now();
  const queryEmbedding = await generateEmbedding(query);
  const embeddingTime = Date.now() - embeddingStartTime;
  console.log(`🧠 Query embedding generated in ${embeddingTime}ms`);

  // Build the MongoDB match stage
  const matchStage = { embedding: { $exists: true, $ne: [] } };

  // Add optional filters
  Object.keys(filters).forEach((key) => {
    if (filters[key]) {
      matchStage[key] = new RegExp(filters[key], "i");
    }
  });

  const aggregationStartTime = Date.now();

  // Use MongoDB aggregation for better performance
  const pipeline = [
    { $match: matchStage },
    {
      $project: {
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
        embedding: 1,
        // Calculate dot product in MongoDB (partial similarity calculation)
        similarity: {
          $reduce: {
            input: { $range: [0, { $size: "$embedding" }] },
            initialValue: 0,
            in: {
              $add: [
                "$$value",
                {
                  $multiply: [
                    { $arrayElemAt: ["$embedding", "$$this"] },
                    { $arrayElemAt: [queryEmbedding, "$$this"] }
                  ]
                }
              ]
            }
          }
        }
      }
    },
    { $sort: { similarity: -1 } },
    { $limit: topK * 3 } // Get more results than needed for post-processing
  ];

  const results = await Document.aggregate(pipeline);
  const aggregationTime = Date.now() - aggregationStartTime;

  console.log(`📊 MongoDB aggregation completed in ${aggregationTime}ms`);
  console.log(`📊 Found ${results.length} candidate results`);

  if (results.length === 0) {
    console.log("⚠️ No documents found with embeddings.");
    return [];
  }

  // Calculate proper cosine similarity for the top candidates
  const processStartTime = Date.now();
  const finalResults = results.map((doc) => {
    const similarity = cosineSimilarity(queryEmbedding, doc.embedding);
    return {
      _id: doc._id,
      StateName: doc.StateName,
      DistrictName: doc.DistrictName,
      Category: doc.Category,
      QueryType: doc.QueryType,
      QueryText: doc.QueryText,
      KccAns: doc.KccAns,
      Crop: doc.Crop,
      Season: doc.Season,
      CreatedOn: doc.CreatedOn,
      similarity: similarity,
    };
  });

  // Final sort and limit
  const topResults = finalResults
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);

  const processTime = Date.now() - processStartTime;
  const totalTime = Date.now() - startTime;

  console.log(`✅ Returning top ${topResults.length} results`);
  console.log(`🎯 Best match similarity: ${topResults[0]?.similarity.toFixed(4) || "N/A"}`);
  console.log(`⚡ Fast search time: ${totalTime}ms (embedding: ${embeddingTime}ms, aggregation: ${aggregationTime}ms, processing: ${processTime}ms)`);

  return topResults;
}

/**
 * Perform semantic search using MongoDB Atlas Vector Search (FAST!)
 * @param {string} query - The search query
 * @param {number} topK - Number of top results to return (default: 10)
 * @param {Object} filters - Optional filters for the search
 * @returns {Array} Array of documents with similarity scores
 */
async function semanticSearch(query, topK = 10, filters = {}) {
  console.log(`🔍 Performing MongoDB Atlas Vector Search for: "${query}"`);
  const startTime = Date.now();

  // Ensure we're connected to MongoDB
  if (mongoose.connection.readyState !== 1) {
    await connectToMongoDB();
  }

  // Generate embedding for the query (with caching)
  const embeddingStartTime = Date.now();
  const queryEmbedding = await generateEmbedding(query);
  const embeddingTime = Date.now() - embeddingStartTime;
  console.log(`🧠 Query embedding generated in ${embeddingTime}ms`);

  // Build the vector search aggregation pipeline
  const pipeline = [
    {
      $vectorSearch: {
        index: "vector_index", // This matches your Atlas vector search index name
        path: "embedding",
        queryVector: queryEmbedding,
        numCandidates: Math.max(topK * 20, 200), // Search more candidates for better results
        limit: topK * 2 // Get extra results before filtering
      }
    },
    {
      $addFields: {
        similarity: { $meta: "vectorSearchScore" } // Get the similarity score
      }
    }
  ];

  // Add filters if provided
  if (Object.keys(filters).length > 0) {
    const matchStage = { $match: {} };
    
    Object.keys(filters).forEach(key => {
      if (filters[key]) {
        matchStage.$match[key] = new RegExp(filters[key], 'i');
      }
    });
    
    // Add match stage after vector search
    pipeline.push(matchStage);
  }
  
  // Final limit and projection
  pipeline.push({ $limit: topK });
  pipeline.push({
    $project: {
      embedding: 0 // Exclude embedding field from results to save bandwidth
    }
  });

  try {
    const searchStartTime = Date.now();
    
    // Execute the vector search
    const results = await Document.aggregate(pipeline);
    
    const searchTime = Date.now() - searchStartTime;
    const totalTime = Date.now() - startTime;
    
    console.log(`✅ Vector search completed in ${searchTime}ms`);
    console.log(`📊 Found ${results.length} results`);
    console.log(`⏱️ Total time: ${totalTime}ms (embedding: ${embeddingTime}ms, search: ${searchTime}ms)`);
    
    if (results.length > 0) {
      console.log(`🎯 Best match similarity: ${results[0]?.similarity?.toFixed(4) || 'N/A'}`);
    }
    
    return results;
    
  } catch (error) {
    console.error("❌ Vector search failed:", error.message);
    
    // Check if it's a vector search specific error
    if (error.message.includes('$vectorSearch') || error.message.includes('vector_index')) {
      console.log("🔧 Vector search index might not be properly configured.");
      console.log("📋 Please ensure:");
      console.log("   1. Atlas Search index 'vector_index' exists");
      console.log("   2. Index is configured for 'embedding' field");
      console.log("   3. numDimensions matches your embedding size (384 for all-MiniLM-L6-v2)");
      console.log("   4. similarity is set to 'cosine'");
    }
    
    // Fallback to the old method if vector search fails
    console.log("🔄 Falling back to manual cosine similarity search...");
    return await semanticSearchFallback(query, topK, filters);
  }
}

/**
 * Fallback semantic search using manual cosine similarity (slower but reliable)
 */
async function semanticSearchFallback(query, topK = 10, filters = {}) {
  console.log(`🔍 Performing fallback cosine similarity search for: "${query}"`);
  const startTime = Date.now();

  // Generate embedding for the query
  const queryEmbedding = await generateEmbedding(query);

  // Build the MongoDB filter
  const mongoFilter = { embedding: { $exists: true, $ne: [] } };

  // Add optional filters
  Object.keys(filters).forEach((key) => {
    if (filters[key]) {
      mongoFilter[key] = new RegExp(filters[key], "i");
    }
  });

  // Use a more efficient approach - limit the number of documents we process
  const maxDocuments = 10000; // Limit to first 10k documents for faster processing
  
  const documents = await Document.find(mongoFilter, {
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
    embedding: 1
  })
  .lean()
  .limit(maxDocuments);

  console.log(`📊 Processing ${documents.length} documents with embeddings`);

  if (documents.length === 0) {
    console.log("⚠️ No documents found with embeddings.");
    return [];
  }

  // Calculate similarity scores
  const results = documents.map((doc) => {
    const similarity = cosineSimilarity(queryEmbedding, doc.embedding);
    return {
      _id: doc._id,
      StateName: doc.StateName,
      DistrictName: doc.DistrictName,
      Category: doc.Category,
      QueryType: doc.QueryType,
      QueryText: doc.QueryText,
      KccAns: doc.KccAns,
      Crop: doc.Crop,
      Season: doc.Season,
      CreatedOn: doc.CreatedOn,
      similarity: similarity,
    };
  });

  // Sort by similarity (highest first) and return top K
  const topResults = results
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);

  const totalTime = Date.now() - startTime;
  console.log(`✅ Fallback search completed in ${totalTime}ms`);
  console.log(`📊 Returning top ${topResults.length} results`);
  console.log(`🎯 Best match similarity: ${topResults[0]?.similarity.toFixed(4) || "N/A"}`);

  return topResults;
}

/**
 * Main function that orchestrates the entire process
 */
async function main() {
  try {
    console.log("🚀 Starting Semantic Search System Setup...\n");

    // Connect to MongoDB
    await connectToMongoDB();

    // Check current document count
    const documentCount = await Document.countDocuments();
    console.log(`📊 Current document count: ${documentCount}`);

    if (documentCount === 0) {
      console.log("📥 No documents found. Please run CSV import first:");
      console.log("Run: npm run import-csv");
      return;
    }

    // Generate embeddings for all documents
    console.log("\n🧠 Generating embeddings...");
    await generateEmbeddingsForAllDocuments();

    // Test the semantic search
    console.log("\n🔍 Testing semantic search...");
    const testQuery = "crop disease management";
    const results = await semanticSearch(testQuery, 5);

    console.log("\n📋 Sample search results:");
    results.forEach((result, index) => {
      console.log(
        `\n${index + 1}. Similarity: ${result.similarity.toFixed(4)}`
      );
      console.log(`   Category: ${result.Category}`);
      console.log(`   Query Type: ${result.QueryType}`);
      console.log(`   Query: ${result.QueryText?.substring(0, 100)}...`);
      console.log(`   Answer: ${result.KccAns?.substring(0, 100)}...`);
    });

    console.log("\n🎉 Semantic search system is ready!");
    console.log(
      "💡 You can now use the semanticSearch(query, topK, filters) function"
    );
  } catch (error) {
    console.error("❌ Error in main process:", error);
  } finally {
    // Keep connection open for further searches
    console.log(
      "✅ Setup completed. Database connection remains open for searches."
    );
  }
}

// Export functions for use in other modules
module.exports = {
  semanticSearch,
  semanticSearchFallback,
  fastSemanticSearch,
  generateEmbeddingsForAllDocuments,
  connectToMongoDB,
  initializeEmbeddingPipeline,
  generateEmbedding,
  cosineSimilarity,
  createEmbeddingText,
  main,
};

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n🛑 Semantic search interrupted by user");
  await mongoose.connection.close();
  console.log("✅ Database connection closed");
  process.exit(0);
});

// Run main function if this file is executed directly
if (require.main === module) {
  main();
}
