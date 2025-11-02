// Import ESM-compatible modules
import "dotenv/config"; // Loads .env file
import express from "express";
import multer from "multer";
import cors from "cors";
import PinataSDK from "@pinata/sdk"; // Use default import
import { Readable } from "stream"; // For creating streams from buffers
import crypto from "crypto"; // For generating random IDs

// ----- Configuration -----
const PORT = process.env.PORT || 5001;
const PINATA_JWT_KEY = process.env.PINATA_JWT_KEY;
const PINATA_GATEWAY = "https://gateway.pinata.cloud/ipfs/";

if (!PINATA_JWT_KEY) {
  console.warn("WARNING: PINATA_JWT_KEY is not set in .env file. Uploads will fail.");
}

const pinata = PINATA_JWT_KEY ? new PinataSDK({ pinataJwtKey: PINATA_JWT_KEY }) : null;

// ----- App & Middleware Setup -----
const app = express();
app.use(cors()); // Allow cross-origin requests
app.use(express.json()); // Allow the server to parse JSON bodies

// Configure Multer to handle multiple file uploads (up to 5) in memory
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { files: 5, fileSize: 10 * 1024 * 1024 } // 5 files max, 10MB each
});

// ----- API Endpoints -----

app.get("/", (req, res) => {
  res.json({
    message: "TrackChain IPFS Service is running",
    endpoints: [
      "POST /api/create-product-data",
      "POST /api/add-checkpoint-data",
      "POST /api/fetch-metadata-batch"
    ]
  });
});

/**
 * [POST] /api/create-product-data
 * Receives multiple files and a wallet address (for Manufacturer).
 * 1. Generates a random Product ID.
 * 2. Uploads all files to IPFS.
 * 3. Creates a metadata.json with all data.
 * 4. Uploads metadata.json to IPFS.
 * 5. Returns the single metadataHash and the productId.
 */
app.post("/api/create-product-data", upload.array('files', 5), async (req, res) => {
  if (!pinata) return res.status(500).json({ error: "Pinata JWT Key not configured." });

  const files = req.files;
  const producerAddress = req.body.address; // 'address' must match the key in your frontend form

  if (!files || files.length === 0) {
    return res.status(400).json({ error: "No files were uploaded." });
  }
  if (!producerAddress) {
    return res.status(400).json({ error: "Producer address is required." });
  }
  
  console.log(`Processing ${files.length} files for address: ${producerAddress}`);

  try {
    // Step 1: Upload all images to IPFS in parallel
    const uploadPromises = files.map((file) => {
      const stream = Readable.from(file.buffer);
      const options = {
        pinataMetadata: {
          name: file.originalname,
        },
      };
      return pinata.pinFileToIPFS(stream, options);
    });

    const fileUploadResults = await Promise.all(uploadPromises);
    const imageHashes = fileUploadResults.map(result => result.IpfsHash);
    
    console.log("Image Hashes:", imageHashes);

    // Step 2: Generate a random Product ID
    const productId = crypto.randomBytes(4).toString('hex'); // e.g., "a1b2c3d4"

    // Step 3: Create the metadata.json object
    const metadata = {
      type: "product",
      productId: productId,
      producerAddress: producerAddress,
      images: imageHashes,
      createdAt: new Date().toISOString()
    };
    
    console.log("Pinning Product Metadata:", metadata);

    // Step 4: Upload the metadata.json to IPFS
    const metadataUploadResult = await pinata.pinJSONToIPFS(metadata, {
      pinataMetadata: {
        name: `TrackChain Product - ${productId}`,
      },
    });

    const metadataHash = metadataUploadResult.IpfsHash;

    // Step 5: Return the new ID and the single metadata hash
    res.status(200).json({
      productId: productId,
      metadataHash: metadataHash
    });

  } catch (error) {
    console.error("Error in /create-product-data:", error.message);
    res.status(500).json({ error: "File upload process failed." });
  }
});

/**
 * [POST] /api/add-checkpoint-data
 * Receives a single file, an actor address, and a product ID (for Intermediary).
 * 1. Uploads the single file to IPFS.
 * 2. Creates a metadata.json with the image hash, actor, and product ID.
 * 3. Uploads metadata.json to IPFS.
 * 4. Returns the single metadataHash.
 */
app.post("/api/add-checkpoint-data", upload.single('file'), async (req, res) => {
  if (!pinata) return res.status(500).json({ error: "Pinata JWT Key not configured." });

  const file = req.file;
  const actorAddress = req.body.address;
  const productId = req.body.productId;

  if (!file) {
    return res.status(400).json({ error: "A file is required." });
  }
  if (!actorAddress || !productId) {
    return res.status(400).json({ error: "Actor address and Product ID are required." });
  }

  console.log(`Processing checkpoint for Product ID: ${productId} by Actor: ${actorAddress}`);

  try {
    // Step 1: Upload the single image to IPFS
    const stream = Readable.from(file.buffer);
    const options = {
      pinataMetadata: {
        name: `Checkpoint - ${productId} - ${file.originalname}`,
      },
    };
    const fileUploadResult = await pinata.pinFileToIPFS(stream, options);
    const imageHash = fileUploadResult.IpfsHash;

    console.log("Checkpoint Image Hash:", imageHash);

    // Step 2: Create the metadata.json object
    const metadata = {
      type: "checkpoint",
      productId: productId,
      actorAddress: actorAddress,
      image: imageHash,
      timestamp: new Date().toISOString()
    };

    console.log("Pinning Checkpoint Metadata:", metadata);

    // Step 3: Upload the metadata.json to IPFS
    const metadataUploadResult = await pinata.pinJSONToIPFS(metadata, {
      pinataMetadata: {
        name: `TrackChain Checkpoint - ${productId}`,
      },
    });

    const metadataHash = metadataUploadResult.IpfsHash;

    // Step 4: Return the single metadata hash
    res.status(200).json({
      metadataHash: metadataHash
    });

  } catch (error) {
    console.error("Error in /add-checkpoint-data:", error.message);
    res.status(500).json({ error: "Checkpoint upload process failed." });
  }
});


/**
 * Receives an array of IPFS hashes.
 * 1. Fetches the JSON data for each hash from the Pinata gateway.
 * 2. Returns an array of the fetched JSON objects.
 */
app.post("/api/fetch-metadata-batch", async (req, res) => {
  const { hashes } = req.body;

  if (!hashes || !Array.isArray(hashes) || hashes.length === 0) {
    return res.status(400).json({ error: "An array of 'hashes' is required." });
  }

  console.log(`Batch fetching ${hashes.length} hashes...`);

  try {
    const fetchPromises = hashes.map(async (hash) => {
      const url = `${PINATA_GATEWAY}${hash}`;
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`Failed to fetch hash: ${hash}, status: ${response.status}`);
        return { hash, error: `Failed to fetch (status ${response.status})` };
      }
      return await response.json();
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
  console.log(`TrackChain IPFS Service running on http://localhost:${PORT}`);
});

