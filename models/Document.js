const mongoose = require("mongoose");

// Define schema for documents collection
const documentSchema = new mongoose.Schema(
  {
    StateName: { type: String, trim: true },
    DistrictName: { type: String, trim: true },
    BlockName: { type: String, trim: true },
    Season: { type: String, trim: true },
    Sector: { type: String, trim: true },
    Category: { type: String, trim: true },
    Crop: { type: String, trim: true },
    QueryType: { type: String, trim: true },
    QueryText: { type: String, trim: true },
    KccAns: { type: String, trim: true },
    CreatedOn: { type: Date },
    year: { type: Number },
    month: { type: Number },
    embedding: { type: [Number], default: [] },
  },
  {
    collection: "documents",
    timestamps: true,
  }
);

// Create index for better performance
documentSchema.index({ StateName: 1, DistrictName: 1 });
documentSchema.index({ CreatedOn: -1 });
documentSchema.index({ year: 1, month: 1 });

// Export model, but only create it if it doesn't exist
module.exports =
  mongoose.models.Document || mongoose.model("Document", documentSchema);
