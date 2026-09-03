const mongoose = require('mongoose');

const ScanLogSchema = new mongoose.Schema(
  {
    qrCodeId: {
      type: String,
      required: true,
      trim: true,
      index: true
    },

    ipAddress: {
      type: String,
      default: ''
    },

    country: {
      type: String,
      default: 'UNKNOWN',
      uppercase: true
    },

    city: {
      type: String,
      default: 'UNKNOWN'
    },

    status: {
      type: String,

      enum: [
        'VALID',
        'THRESHOLD_EXCEEDED',
        'GEO_MISMATCH'
      ],

      default: 'VALID',

      index: true
    }
  },
  {
    timestamps: {
      createdAt: 'scannedAt',
      updatedAt: false
    }
  }
);

module.exports = mongoose.model(
  'ScanLog',
  ScanLogSchema
);

