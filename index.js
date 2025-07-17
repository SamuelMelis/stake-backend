// index.js

// --- CONFIG & IMPORTS ---
require('dotenv').config(); // Loads secrets from .env file
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs/promises'); // For reading/writing our JSON DB

const app = express();
app.use(cors()); // Crucial: Allows your frontend to make requests
app.use(express.json());

const STAKE_API_URL = "https://stake.com/_api/graphql";
const DB_PATH = './database.json';

// --- STAKE API HELPER ---
// A pre-configured Axios instance to talk to Stake's GraphQL API
const stakeApi = axios.create({
  baseURL: STAKE_API_URL,
  headers: {
    'x-access-token': process.env.STAKE_API_TOKEN, // Your secret token
    'Content-Type': 'application/json',
  },
});

// --- API ENDPOINTS ---

// GET /api/status
// The Mini App calls this to get the current streak and last bet status.
app.get('/api/status', async (req, res) => {
  const db = JSON.parse(await fs.readFile(DB_PATH));
  res.json(db);
});

// GET /api/check-new-bet
// This is the magic endpoint. The Mini App polls this after you go to Stake.
app.get('/api/check-new-bet', async (req, res) => {
    try {
        const db = JSON.parse(await fs.readFile(DB_PATH));
        
        // GraphQL query to get the single most recent bet from your history
        const response = await stakeApi.post('', {
            query: `query { currentUser { betHistory(first: 1) { edges { node { id status amount potentialMultiplier currency { symbol } } } } } }`
        });

        // Navigate through the GraphQL response to get the bet object
        const latestBet = response.data.data.currentUser.betHistory.edges[0]?.node;

        if (!latestBet) {
            return res.json({ newBet: false, message: "No bets found in your Stake history." });
        }

        // The core logic: Is the latest bet on Stake different from the last one we saved?
        if (latestBet.id !== db.lastBetId) {
            console.log(`New bet detected! ID: ${latestBet.id}`);
            
            // It's new! Update our database.
            db.streak += 1;
            db.lastBetId = latestBet.id;
            db.status = `Streak: ${db.streak}. Last bet placed.`;
            db.history.push(latestBet); // Add it to our history log
            await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2));

            // Send a success response back to the Mini App
            return res.json({ newBet: true, bet: latestBet });
        }

        // If we're here, it means we checked and found no new bet.
        return res.json({ newBet: false, message: "No new bet detected." });

    } catch (error) {
        console.error("Error in /api/check-new-bet:", error.message);
        res.status(500).json({ message: "Failed to check for new bet.", details: error.message });
    }
});

// --- START THE SERVER ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Backend server is vibing on http://localhost:${PORT}`);
});