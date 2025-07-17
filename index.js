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
// index.js (add this new endpoint)

// GET /api/user-profile
// Fetches user's name, profile picture, and balances from Stake.
app.get('/api/user-profile', async (req, res) => {
    try {
        // This GraphQL query asks for the user's details and balances all at once.
        const response = await stakeApi.post('', {
            query: `query { currentUser { id name profile { avatarUrl } balances { available { amount currency } } } }`
        });

        const user = response.data.data.currentUser;
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        // Find the USDT balance from the list of all currency balances.
        const usdtBalance = user.balances.find(b => b.available.currency === 'usdt');

        // Prepare a clean response object for the frontend.
        const userProfile = {
            name: user.name,
            avatarUrl: user.profile.avatarUrl,
            usdt: usdtBalance ? usdtBalance.available.amount : 0 // Show 0 if no USDT balance exists
        };

        res.json(userProfile);

    } catch (error) {
        console.error("Error in /api/user-profile:", error.message);
        res.status(500).json({ message: "Failed to fetch user profile.", details: error.message });
    }
});
// index.js (add this new endpoint)

// GET /api/bet-history
// Reads the bet history from our local database.
app.get('/api/bet-history', async (req, res) => {
    try {
        const db = JSON.parse(await fs.readFile(DB_PATH));
        // We'll send the history in reverse order so newest bets are first.
        res.json(db.history.reverse());
    } catch (error) {
        console.error("Error in /api/bet-history:", error.message);
        res.status(500).json({ message: "Failed to fetch bet history." });
    }
});

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