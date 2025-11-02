import "dotenv/config";

import express from 'express';
import cors from "cors";
import multer from "multer";
import { Readable } from "stream";
import PinataSDK from "@pinata/sdk";

const PORT = process.env.PORT || 5001;
const PINATA_JWT = process.env.PINATA_JWT_KEY;

if(!PINATA_JWT){
    console.warn(
      "WARNING: PINATA_JWT_KEY is not set in .env file. IPFS uploads will fail."  
    );
}

const app = express();
app.use(cors());
app.use(express.json());

const pinata = new PinataSDK({ pinataJwt: PINATA_JWT });

// Set up multer to store files in memory
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.get("/" , (req , res)=>{
    res.json({
        message: "TrackChain IPFS Upload Service is running"
    });
})

app.post("/api/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded." });
  }

  console.log(`Received file: ${req.file.originalname}`);

  try {
    // Create a readable stream from the file buffer
    const stream = Readable.from(req.file.buffer);

    // Set Pinata options, including the original file name
    const options = {
      pinataMetadata: {
        name: req.file.originalname,
      },
    };

    // Upload the stream to Pinata
    const result = await pinata.pinFileToIPFS(stream, options);

    console.log("File uploaded successfully to IPFS:", result.IpfsHash);

    // Return the IPFS hash (CID) to the frontend
    res.status(200).json({
      ipfsHash: result.IpfsHash,
    });
  } catch (error) {
    console.error("Error uploading file to IPFS:", error.message);
    res.status(500).json({ error: "Failed to upload file to IPFS." });
  }
});


app.listen(PORT, () => {
  console.log(`TrackChain IPFS Service running on http://localhost:${PORT}`);
});