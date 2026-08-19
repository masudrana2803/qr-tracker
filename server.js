const express = require('express');
const mongoose = require('mongoose');
require('dotenv').config();

const qrRoutes = require('./routes/qrRoutes');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/qrtracker';

// Connect to MongoDB
mongoose.connect(mongoUri)
  .then(() => console.log('MongoDB Connected Successfully'))
  .catch((err) => console.error('MongoDB Connection Error:', err));

// Register Routes
app.use('/', qrRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));