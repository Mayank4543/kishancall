require("dotenv").config();
const {
  semanticSearch,
  fastSemanticSearch,
  generateEmbeddingsForAllDocuments,
  connectToMongoDB,
  main,
} = require("./semantic-search");

/**
 * Test script for the semantic search system
 */
async function testSemanticSearch() {
  console.log("🧪 Starting Semantic Search Test...\n");

  try {
    // Connect to MongoDB
    await connectToMongoDB();

    // Check if embeddings exist
    const Document = require("./models/Document");
    const totalDocs = await Document.countDocuments();
    const docsWithEmbeddings = await Document.countDocuments({
      embedding: { $exists: true, $ne: [] },
    });

    console.log(`📊 Database Status:`);
    console.log(`   Total documents: ${totalDocs}`);
    console.log(`   Documents with embeddings: ${docsWithEmbeddings}\n`);

    if (totalDocs === 0) {
      console.log("❌ No documents found! Please run CSV import first:");
      console.log("   npm run import-csv\n");
      return;
    }

    if (docsWithEmbeddings === 0) {
      console.log("🧠 No embeddings found. Generating embeddings...");
      await generateEmbeddingsForAllDocuments();
      console.log("✅ Embeddings generated!\n");
    }

    // Test queries
    const testQueries = [
      "Government Schemes",
      "fertilizer application",
      "pest control methods",
      "irrigation techniques",
      "soil health improvement",
      "organic farming practices",
      "weather related crop damage",
      "seed treatment procedures",
    ];

    console.log("🔍 Running test searches...\n");

    for (const query of testQueries) {
      console.log(`🎯 Query: "${query}"`);
      console.log("─".repeat(50));

      // Test both regular and fast search for comparison
      console.log("🔄 Testing FAST search...");
      const fastStartTime = Date.now();
      const fastResults = await fastSemanticSearch(query, 3);
      const fastSearchTime = Date.now() - fastStartTime;

      if (fastResults.length > 0) {
        console.log(`⚡ Fast search time: ${fastSearchTime}ms`);
        console.log(`📊 Found ${fastResults.length} results\n`);

        fastResults.forEach((result, index) => {
          console.log(`${index + 1}. Score: ${result.similarity.toFixed(4)}`);
          console.log(`   Category: ${result.Category || "N/A"}`);
          console.log(`   Query Type: ${result.QueryType || "N/A"}`);
          console.log(`   State: ${result.StateName || "N/A"}`);
          console.log(`   District: ${result.DistrictName || "N/A"}`);
          console.log(
            `   Query: ${(result.QueryText || "").substring(0, 100)}${
              result.QueryText?.length > 100 ? "..." : ""
            }`
          );
          console.log(
            `   Answer: ${(result.KccAns || "").substring(0, 100)}${
              result.KccAns?.length > 100 ? "..." : ""
            }`
          );
          console.log("");
        });
      } else {
        console.log("❌ No results found\n");
      }

      console.log("═".repeat(60));
      console.log("");
    }

    // Test with filters
    console.log("🔍 Testing search with filters...\n");

    const filterQuery = "crop disease";
    const filters = {
      Category: "Crop",
      StateName: "Maharashtra",
    };

    console.log(`🎯 Query: "${filterQuery}"`);
    console.log(`🔧 Filters:`, filters);
    console.log("─".repeat(50));

    const filteredResults = await semanticSearch(filterQuery, 5, filters);

    if (filteredResults.length > 0) {
      console.log(`📊 Found ${filteredResults.length} filtered results\n`);

      filteredResults.forEach((result, index) => {
        console.log(`${index + 1}. Score: ${result.similarity.toFixed(4)}`);
        console.log(`   Category: ${result.Category || "N/A"}`);
        console.log(`   State: ${result.StateName || "N/A"}`);
        console.log(`   District: ${result.DistrictName || "N/A"}`);
        console.log(
          `   Query: ${(result.QueryText || "").substring(0, 80)}...`
        );
        console.log("");
      });
    } else {
      console.log("❌ No filtered results found\n");
    }

    console.log("🎉 Semantic search test completed successfully!");
  } catch (error) {
    console.error("❌ Test failed:", error);
  } finally {
    // Close database connection
    const mongoose = require("mongoose");
    await mongoose.connection.close();
    console.log("✅ Database connection closed");
    process.exit(0);
  }
}

/**
 * Performance benchmark test
 */
async function benchmarkSearch() {
  console.log("⚡ Running performance benchmark...\n");

  await connectToMongoDB();

  const queries = [
    "crop disease management",
    "fertilizer application timing",
    "pest control organic methods",
    "irrigation water management",
    "soil nutrient deficiency",
  ];

  const iterations = 5;
  const totalTimes = [];

  for (let i = 0; i < iterations; i++) {
    console.log(`🔄 Benchmark round ${i + 1}/${iterations}`);

    const roundTimes = [];

    for (const query of queries) {
      const startTime = Date.now();
      await semanticSearch(query, 10);
      const searchTime = Date.now() - startTime;
      roundTimes.push(searchTime);
    }

    const avgTime = roundTimes.reduce((a, b) => a + b, 0) / roundTimes.length;
    totalTimes.push(avgTime);

    console.log(`   Average search time: ${avgTime.toFixed(2)}ms`);
  }

  const overallAvg = totalTimes.reduce((a, b) => a + b, 0) / totalTimes.length;
  const minTime = Math.min(...totalTimes);
  const maxTime = Math.max(...totalTimes);

  console.log("\n📊 Benchmark Results:");
  console.log(`   Average search time: ${overallAvg.toFixed(2)}ms`);
  console.log(`   Fastest search: ${minTime.toFixed(2)}ms`);
  console.log(`   Slowest search: ${maxTime.toFixed(2)}ms`);

  const mongoose = require("mongoose");
  await mongoose.connection.close();
  console.log("✅ Benchmark completed");
}

// Command line arguments handling
const args = process.argv.slice(2);

if (args.includes("--benchmark")) {
  benchmarkSearch();
} else if (args.includes("--setup")) {
  main();
} else {
  testSemanticSearch();
}

module.exports = {
  testSemanticSearch,
  benchmarkSearch,
};
