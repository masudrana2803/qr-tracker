const express = require('express');
const mongoose = require('mongoose');
require('dotenv').config();

const qrRoutes = require('./routes/qrRoutes');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
const allowedOrigins = (process.env.FRONTEND_URL || process.env.CORS_ORIGIN || '*')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

app.use((req, res, next) => {
  const requestOrigin = req.headers.origin;
  const origin = allowedOrigins.includes('*') || allowedOrigins.includes(requestOrigin)
    ? requestOrigin || '*'
    : allowedOrigins[0];

  res.header('Access-Control-Allow-Origin', origin);
  res.header('Vary', 'Origin');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' });
});

if (!mongoUri) {
  throw new Error('MONGODB_URI is required. Configure the remote database in the backend .env file.');
}

// Register API routes
app.use('/api', qrRoutes);

const PORT = process.env.PORT || 5000;

mongoose.connect(mongoUri)
  .then(() => {
    console.log('MongoDB Connected Successfully');
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('MongoDB Connection Error:', err.message);
    process.exit(1);
  });