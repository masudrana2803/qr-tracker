const mongoose = require('mongoose');

const ScanLogSchema = new mongoose.Schema({
  qrCodeId: { type: String, required: true },
  scannedAt: { type: Date, default: Date.now },
  ipAddress: { type: String },
  country: { type: String },
  city: { type: String },
  status: { 
    type: String, 
    enum: ['VALID', 'THRESHOLD_EXCEEDED', 'GEO_MISMATCH'], 
    default: 'VALID' 
  }
});

module.exports = mongoose.model('ScanLog', ScanLogSchema);