// Import ESM-compatible modules
import "dotenv/config"; // Loads .env file
import express from "express";
import multer from "multer";
import cors from "cors";
// --- UPDATED S3 IMPORT ---
// Use the official AWS S3 Client
import { S3Client, PutObjectCommand, ListBucketsCommand } from "@aws-sdk/client-s3";
// --- END UPDATE ---
import crypto from "crypto"; // For generating random IDs

// ----- Configuration -----
const PORT = process.env.PORT || 5001;

// --- UPDATED ENV & CLIENT ---
// Switched to Filebase S3 Credentials
const FILEBASE_KEY = process.env.FILEBASE_KEY ? process.env.FILEBASE_KEY.trim() : null;
const FILEBASE_SECRET = process.env.FILEBASE_SECRET ? process.env.FILEBASE_SECRET.trim() : null;
const FILEBASE_BUCKET_NAME = process.env.FILEBASE_BUCKET_NAME ? process.env.FILEBASE_BUCKET_NAME.trim() : null;

// The Filebase S3-compatible API endpoint
const FILEBASE_S3_ENDPOINT = "https://s3.filebase.com";
// --- END UPDATE ---

if (!FILEBASE_KEY || !FILEBASE_SECRET || !FILEBASE_BUCKET_NAME) {
  console.warn("WARNING: FILEBASE_KEY, FILEBASE_SECRET, or FILEBASE_BUCKET_NAME is not set in .env file. Uploads will fail.");
}

// --- UPDATED CLIENT INITIALIZATION ---
let s3Client = null;
if (FILEBASE_KEY && FILEBASE_SECRET) {
  s3Client = new S3Client({
    credentials: {
      accessKeyId: FILEBASE_KEY,
      secretAccessKey: FILEBASE_SECRET,
    },
    region: "us-east-1", // Default region for Filebase
    endpoint: FILEBASE_S3_ENDPOINT,
    forcePathStyle: true, // Required for Filebase
  });
}
// --- END UPDATE ---


// --- UPDATED AUTHENTICATION TEST ---
(async () => {
  if (s3Client) {
    try {
      // Test credentials by listing buckets
      await s3Client.send(new ListBucketsCommand({}));
      console.log("Filebase S3 Authentication Test SUCCESSFUL");
      console.log(`Ready to upload to bucket: ${FILEBASE_BUCKET_NAME}`);
    } catch (error) {
      console.error("--- FILEBASE S3 AUTHENTICATION TEST FAILED ---");
      console.error("This is likely due to invalid Filebase credentials or bucket name.");
      console.error("Please re-check your .env file.");
      console.error("Error details:", error.message);
      console.error("-------------------------------------------");
    }
  } else {
    console.error("Filebase S3 client not initialized. Check .env file.");
  }
})();
// --- END AUTHENTICATION TEST ---


// ----- App & Middleware Setup -----
const app = express();
app.use(cors()); // Allow cross-origin requests
app.use(express.json()); // Allow the server to parse JSON bodies

// Configure Multer (no change)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { files: 5, fileSize: 10 * 1024 * 1024 }
});

// ----- Helper Function -----
// Helper to upload a buffer to S3
const uploadToS3 = async (bucket, key, body, contentType) => {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  });
  await s3Client.send(command);
  // Return the public URL
  return `https://${bucket}.s3.filebase.com/${key}`;
};


// ----- API Endpoints -----

app.get("/", (req, res) => {
  res.json({
    message: "TrackChain S3 Service is running (Filebase)",
    endpoints: [
      "POST /api/create-product-data",
      "POST /api/add-checkpoint-data",
      "POST /api/fetch-metadata-batch"
    ]
  });
});

/**
 * [POST] /api/create-product-data
 * (Logic updated for Filebase S3)
 */
app.post("/api/create-product-data", upload.array('files', 5), async (req, res) => {
  if (!s3Client) return res.status(500).json({ error: "Filebase client not configured." });

  const files = req.files;
  const { address: producerAddress, name: productName, physicalAddress } = req.body;

  if (!files || files.length === 0) {
    return res.status(400).json({ error: "No files were uploaded." });
  }
  if (!producerAddress || !productName || !physicalAddress) {
    return res.status(400).json({ error: "Address, name, and physical address are required." });
  }
  
  console.log(`Processing ${files.length} files for: ${productName}`);

  try {
    // Step 1: Generate a random Product ID
    const randomBytes = crypto.randomBytes(16);
    const productIdBigInt = BigInt('0x' + randomBytes.toString('hex'));
    const productId = productIdBigInt.toString(); // Send as a decimal string
    const productPath = `products/${productId}`;

    // Step 2: Upload all images to S3 in parallel
    const uploadPromises = files.map((file, index) => {
      const fileKey = `${productPath}/image-${index}-${file.originalname}`;
      return uploadToS3(FILEBASE_BUCKET_NAME, fileKey, file.buffer, file.mimetype);
    });

    const imageUrls = await Promise.all(uploadPromises);
    
    console.log("Image URLs:", imageUrls);

    // Step 3: Create the metadata.json object
    const metadata = {
      type: "product",
      name: productName,
      productId: productId,
      producerAddress: producerAddress,
      physicalAddress: physicalAddress,
      images: imageUrls, // Array of public URLs
      createdAt: new Date().toISOString()
    };
    
    console.log("Pinning Product Metadata:", metadata);

    // Step 4: Upload the metadata.json to S3
    const metadataKey = `${productPath}/metadata.json`;
    const metadataUrl = await uploadToS3(
      FILEBASE_BUCKET_NAME,
      metadataKey,
      Buffer.from(JSON.stringify(metadata)),
      "application/json"
    );


    // Step 5: Return the new ID and the *public URL* of the metadata
    res.status(200).json({
      productId: productId,
      metadataHash: metadataUrl // Return the public URL as the "hash"
    });

  } catch (error) {
    console.error("Error in /create-product-data:", error.message);
    res.status(500).json({ error: error.message || "File upload process failed." });
  }
});

/**
 * [POST] /api/add-checkpoint-data
 * (Logic updated for Filebase S3)
 */
app.post("/api/add-checkpoint-data", upload.single('file'), async (req, res) => {
  if (!s3Client) return res.status(500).json({ error: "Filebase client not configured." });

  const file = req.file;
  const { address: actorAddress, productId } = req.body;

  if (!file) {
    return res.status(400).json({ error: "A file is required." });
  }
  if (!actorAddress || !productId) {
    return res.status(400).json({ error: "Actor address and Product ID are required." });
  }

  console.log(`Processing checkpoint for Product ID: ${productId}`);

  try {
    // Step 1: Upload the single image to S3
    const checkpointPath = `checkpoints/${productId}`;
    const fileKey = `${checkpointPath}/actor-${actorAddress}-${Date.now()}-${file.originalname}`;
    const imageUrl = await uploadToS3(FILEBASE_BUCKET_NAME, fileKey, file.buffer, file.mimetype);

    console.log("Checkpoint Image URL:", imageUrl);

    // Step 2: Create the metadata.json object
    const metadata = {
      type: "checkpoint",
      productId: productId,
      actorAddress: actorAddress,
      image: imageUrl, // Public URL
      timestamp: new Date().toISOString()
    };

    console.log("Pinning Checkpoint Metadata:", metadata);

    // Step 3: Upload the metadata.json to S3
    const metadataKey = `${checkpointPath}/metadata-${Date.now()}.json`;
    const metadataUrl = await uploadToS3(
      FILEBASE_BUCKET_NAME,
      metadataKey,
      Buffer.from(JSON.stringify(metadata)),
      "application/json"
    );

    // Step 4: Return the single metadata hash (URL)
    res.status(200).json({
      metadataHash: metadataUrl
    });

  } catch (error) {
    console.error("Error in /add-checkpoint-data:", error.message);
    res.status(500).json({ error: "Checkpoint upload process failed." });
  }
});


/**
 * [POST] /api/fetch-metadata-batch
 * (Logic updated to fetch from public S3 URLs)
 */
app.post("/api/fetch-metadata-batch", async (req, res) => {
  // The 'hashes' are now expected to be an array of objects, each with a 'hash' field (URL)
  const { hashes: items } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "An array of 'hashes' (structs) is required." });
  }

  console.log(`Batch fetching ${items.length} URLs...`);

  try {
    const fetchPromises = items.map(async (item) => {
      const url = item.ipfsHash; // Extract the URL from the 'hash' field

      if (!url || typeof url !== 'string') {
        console.error(`Invalid item in batch fetch:`, item);
        return { hash: null, status: 'error', reason: 'Invalid item structure, missing hash field.' };
      }

      const response = await fetch(url); 
      if (!response.ok) {
        console.error(`Failed to fetch URL: ${url}, status: ${response.status}`);
        return { hash: url, status: 'error', reason: `Failed to fetch (status ${response.status})` };
      }
      const data = await response.json();
      return { ...data, originalHash: url };
    });

    const results = await Promise.all(fetchPromises);
    
    console.log("Batch fetch complete.");
    res.status(200).json(results);

  } catch (error) {
    console.error("Error in /fetch-metadata-batch:", error.message);
    res.status(500).json({ error: "Batch fetch process failed." });
  }
});

// ----- Start Server -----
app.listen(PORT, () => {
  console.log(`TrackChain S3 Service (Filebase) running on http://localhost:${PORT}`);
});

