# 🚀 Quick Start Guide - Kishan Call

## ⚡ Quick Setup (5 minutes)

### 1. Prerequisites

- Node.js 16+ installed
- MongoDB Atlas account
- Git

### 2. Clone and Install

```bash
git clone <your-repository-url>
cd kishancall
npm install
```

### 3. Environment Setup

Create `.env` file:

```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/kishancall?retryWrites=true&w=majority
PORT=5000
NODE_ENV=development
```

### 4. MongoDB Atlas Configuration

#### Create Vector Search Index

1. Go to MongoDB Atlas Dashboard
2. Navigate to your cluster → Browse Collections
3. Go to Search → Create Search Index
4. Choose JSON Editor and paste:

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 384,
      "similarity": "cosine"
    }
  ]
}
```

5. Name it `vector_index`

### 5. Start the Application

```bash
npm start
```

Visit: `http://localhost:5000`

---

## 🎯 First Steps Tutorial

### Step 1: Upload Sample Data

1. Open the web interface
2. Click on the file upload area
3. Select a CSV file with agricultural data
4. Choose options:
   - ✅ Process in Background
   - ✅ Generate Embeddings
5. Click "Upload CSV"

### Step 2: Generate Embeddings

1. Go to "Background Embedding Manager"
2. Configure settings:
   - Batch Size: 50
   - Delay: 1000ms
   - Retry Attempts: 3
3. Click "Start" to begin embedding generation
4. Monitor progress in real-time

### Step 3: Search Your Data

1. Go to the search section
2. Start typing a query (e.g., "rice farming")
3. Watch as the system shows:
   - Latest data for short queries (1-2 chars)
   - Semantic search results for longer queries (3+ chars)

---

## 📊 Sample Data Format

Your CSV should have these columns:

```csv
StateName,DistrictName,Category,QueryType,QueryText,KccAns,Crop,Season,CreatedOn
Punjab,Ludhiana,Crop Management,Technical,"How to manage wheat diseases?","Wheat disease management involves...",Wheat,Rabi,2024-01-01
```

### Required Fields:

- `StateName`: State name
- `QueryText`: The question or query
- `KccAns`: The answer or response

### Optional Fields:

- `DistrictName`, `Category`, `QueryType`, `Crop`, `Season`, `CreatedOn`

---

## 🎨 Interface Overview

Take a look at our beautiful farming-themed interface:

### 🏠 Main Dashboard

![Main Dashboard](./public/image/image1001.jpg)

- **System Status**: Live document counts and health
- **Quick Actions**: Upload, search, and manage data
- **Activity Log**: Real-time operation logging

### 📤 Upload Section

![Data Management](./public/image/image1004.jpg)

- **File Upload**: Drag & drop CSV files
- **Processing Options**: Background processing settings
- **Queue Management**: Multi-file processing control

### 🔍 Search Interface

![Search Interface](./public/image/image1002.jpg)

- **Smart Search**: Real-time search with auto-suggestions
- **Filters**: State, Category, and custom filters
- **Results Display**: Similarity scores and relevance

### ⚙️ Background Processing

![Background Processing](./public/image/image1003.jpg)

- **Embedding Manager**: Automated embedding generation
- **CSV Queue**: Multi-file processing queue
- **Status Monitoring**: Real-time progress tracking

---

## 🎯 Common Use Cases

### 1. Upload Large Dataset

```
1. Upload CSV with "Background Processing" enabled
2. Monitor queue status
3. Start background embedding generation
4. Search becomes available as embeddings are generated
```

### 2. Quick Search Setup

```
1. Upload small CSV file (< 1000 rows)
2. Wait for direct processing
3. Generate embeddings manually
4. Start searching immediately
```

### 3. Data Migration

```
1. Enable "Clear Existing" option
2. Upload new dataset
3. Process in background
4. Generate embeddings
5. Verify data through search
```

---

## 🔧 Configuration Tips

### Optimal Batch Sizes

- **Small datasets (< 1,000 docs)**: Batch size 25
- **Medium datasets (1,000-10,000 docs)**: Batch size 50
- **Large datasets (> 10,000 docs)**: Batch size 100

### Processing Delays

- **Fast processing**: 500ms delay
- **Balanced processing**: 1000ms delay (recommended)
- **Conservative processing**: 2000ms delay

### Memory Optimization

- Use smaller batch sizes for limited memory
- Increase delays for stability
- Monitor system resources during processing

---

## 🐛 Common Issues

### Issue: "Vector search failed"

**Solution**:

1. Verify MongoDB Atlas vector index exists
2. Check index name is `vector_index`
3. Confirm 384 dimensions setting
4. Fallback search will activate automatically

### Issue: "No embeddings found"

**Solution**:

1. Start background embedding generation
2. Wait for processing to complete
3. Check embedding progress in status

### Issue: "CSV upload failed"

**Solution**:

1. Verify CSV format and headers
2. Check file size (< 50MB recommended)
3. Ensure required fields are present
4. Try processing in background

### Issue: "Search returns no results"

**Solution**:

1. Try broader search terms
2. Remove filters temporarily
3. Check if embeddings are generated
4. Use "Latest Data" to see available content

---

## 📈 Performance Tips

### Fast Search Performance

1. Generate embeddings for all documents
2. Use vector search (not fallback)
3. Apply appropriate filters
4. Limit result count to needed amount

### Efficient Processing

1. Process large files in background
2. Use optimal batch sizes
3. Monitor system resources
4. Process during off-peak hours

### UI Responsiveness

1. Use real-time search delays
2. Process uploads in background
3. Monitor status without page refresh
4. Use progressive result loading

---

## 🌱 Best Practices

### Data Management

- Keep CSV files well-formatted
- Include relevant metadata fields
- Use consistent naming conventions
- Regular data backups

### Search Optimization

- Use descriptive search terms
- Apply relevant filters
- Review search results quality
- Monitor search performance

### System Maintenance

- Regular embedding updates
- Monitor queue processing
- Check system logs
- Update configuration as needed

---

## 🆘 Getting Help

### Documentation

- `README.md` - Complete feature overview
- `API.md` - Detailed API reference
- `FEATURES.md` - Feature documentation

### Support

- Check console logs for errors
- Review API response messages
- Monitor system status dashboard
- Use fallback options when available

### Community

- Submit issues on GitHub
- Share feedback and suggestions
- Contribute improvements
- Help other users

---

## 🎉 Success Indicators

You'll know everything is working when:

- ✅ Documents upload successfully
- ✅ Embeddings generate without errors
- ✅ Search returns relevant results
- ✅ Real-time features work smoothly
- ✅ Background processing completes
- ✅ Queue manages multiple files

**Happy farming! 🌾**
