const mongoose = require('mongoose');

const QrCodeSchema = new mongoose.Schema({
  codeId: { type: String, required: true, unique: true },
  productName: { type: String, required: true },
  destinationUrl: { type: String, required: true },
  maxScanThreshold: { type: Number, default: 5 },
  allowedCountries: [{ type: String }], // 2-letter codes e.g. ['US', 'BD', 'CA']
  qrImageBase64: { type: String, default: '' },
  totalScans: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('QrCode', QrCodeSchema);