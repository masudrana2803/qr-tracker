const mongoose = require('mongoose');

const QrCodeSchema = new mongoose.Schema(
  {
    codeId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true
    },

    productName: {
      type: String,
      required: true,
      trim: true
    },

    destinationUrl: {
      type: String,
      required: true,
      trim: true
    },

    maxScanThreshold: {
      type: Number,
      default: 5,
      min: 1
    },

    // 2-letter country codes
    // Example: ['BD', 'IN', 'CN']
    allowedCountries: {
      type: [String],
      default: []
    },

    // QR image without the data:image/png;base64, prefix
    qrImageBase64: {
      type: String,
      default: ''
    },

    totalScans: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model(
  'QrCode',
  QrCodeSchema
);
