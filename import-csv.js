require("dotenv").config();
const mongoose = require("mongoose");
const fs = require("fs");
const csv = require("csv-parser");
const path = require("path");

// MongoDB connection URI from environment variables
const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://mayankrathore9897:codemonk234@cluster0.gnop8w8.mongodb.net/mydb";

// Connect to MongoDB
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

// Import the shared Document model
const Document = require("./models/Document");

// Function to parse and clean data
function parseRecord(record) {
  try {
    // Clean and parse the record
    const cleanRecord = {
      StateName: record.StateName?.trim() || "",
      DistrictName: record.DistrictName?.trim() || "",
      BlockName: record.BlockName?.trim() || "",
      Season: record.Season?.trim() || "",
      Sector: record.Sector?.trim() || "",
      Category: record.Category?.trim() || "",
      Crop: record.Crop?.trim() || "",
      QueryType: record.QueryType?.trim() || "",
      QueryText: record.QueryText?.trim() || "",
      KccAns: record.KccAns?.trim() || "",
      CreatedOn: record.CreatedOn ? new Date(record.CreatedOn) : new Date(),
      year: record.year ? parseInt(record.year) : null,
      month: record.month ? parseInt(record.month) : null,
    };

    return cleanRecord;
  } catch (error) {
    console.warn("⚠️ Error parsing record:", error.message);
    return null;
  }
}

// Function to insert records in batches
async function insertBatch(records) {
  try {
    const result = await Document.insertMany(records, {
      ordered: false,
      rawResult: true,
    });
    return result.insertedCount || records.length;
  } catch (error) {
    if (error.name === "BulkWriteError") {
      // Handle partial success in bulk operations
      const insertedCount = error.result.result.nInserted || 0;
      console.warn(
        `⚠️ Batch insert partial success: ${insertedCount}/${records.length} inserted`
      );
      return insertedCount;
    } else {
      console.error("❌ Batch insert error:", error.message);
      throw error;
    }
  }
}

// Main function to import CSV
async function importCSV() {
  const csvFilePath = path.join(__dirname, "data1.csv");

  console.log("🚀 Starting CSV import process...");
  console.log(`📁 CSV file path: ${csvFilePath}`);

  // Check if CSV file exists
  if (!fs.existsSync(csvFilePath)) {
    console.error("❌ CSV file not found:", csvFilePath);
    process.exit(1);
  }

  await connectToMongoDB();

  // Clear existing documents (optional - comment out if you want to append)
  console.log("🗑️ Clearing existing documents...");
  await Document.deleteMany({});
  console.log("✅ Existing documents cleared");

  return new Promise((resolve, reject) => {
    const records = [];
    let totalProcessed = 0;
    let totalInserted = 0;
    let batchSize = 1000;
    let batchNumber = 1;

    console.log(`📦 Processing in batches of ${batchSize} records`);

    const stream = fs.createReadStream(csvFilePath).pipe(
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
    );

    stream.on("data", async (data) => {
      totalProcessed++;

      // Skip header row if it contains column names
      if (totalProcessed === 1 && data.StateName === "StateName") {
        return;
      }

      const parsedRecord = parseRecord(data);
      if (parsedRecord) {
        records.push(parsedRecord);
      }

      // Process batch when it reaches the batch size
      if (records.length >= batchSize) {
        stream.pause(); // Pause the stream while processing batch

        try {
          console.log(
            `📦 Processing batch ${batchNumber} (${records.length} records)...`
          );
          const insertedCount = await insertBatch(records);
          totalInserted += insertedCount;

          console.log(
            `✅ Batch ${batchNumber} completed: ${insertedCount}/${records.length} inserted`
          );
          console.log(
            `📊 Progress: ${totalInserted} total inserted, ${totalProcessed} total processed`
          );

          batchNumber++;
          records.length = 0; // Clear the batch array
        } catch (error) {
          console.error(`❌ Error processing batch ${batchNumber}:`, error);
        }

        stream.resume(); // Resume the stream
      }
    });

    stream.on("end", async () => {
      try {
        // Process remaining records
        if (records.length > 0) {
          console.log(
            `📦 Processing final batch (${records.length} records)...`
          );
          const insertedCount = await insertBatch(records);
          totalInserted += insertedCount;
          console.log(
            `✅ Final batch completed: ${insertedCount}/${records.length} inserted`
          );
        }

        console.log("\n🎉 CSV import completed!");
        console.log(`📊 Final Statistics:`);
        console.log(`   - Total rows processed: ${totalProcessed}`);
        console.log(`   - Total documents inserted: ${totalInserted}`);
        console.log(
          `   - Success rate: ${(
            (totalInserted / Math.max(totalProcessed - 1, 1)) *
            100
          ).toFixed(2)}%`
        );

        // Verify the count in database
        const dbCount = await Document.countDocuments();
        console.log(
          `✅ Database verification: ${dbCount} documents in collection`
        );

        resolve(totalInserted);
      } catch (error) {
        console.error("❌ Error in final processing:", error);
        reject(error);
      }
    });

    stream.on("error", (error) => {
      console.error("❌ CSV reading error:", error);
      reject(error);
    });
  });
}

// Run the import
async function main() {
  try {
    const startTime = Date.now();

    const insertedCount = await importCSV();

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    console.log(`⏱️ Import completed in ${duration.toFixed(2)} seconds`);
    console.log(
      `🚀 Average speed: ${Math.round(insertedCount / duration)} records/second`
    );
  } catch (error) {
    console.error("❌ Import failed:", error);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log("✅ Database connection closed");
    process.exit(0);
  }
}

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n🛑 Import interrupted by user");
  await mongoose.connection.close();
  console.log("✅ Database connection closed");
  process.exit(0);
});

// Export functions for use in other modules
module.exports = {
  importCSV,
  connectToMongoDB,
  Document,
  parseRecord,
  insertBatch,
  main,
};

// Start the import process only if this file is run directly
if (require.main === module) {
  main();
}
