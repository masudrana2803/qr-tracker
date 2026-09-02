const express = require('express');
const router = express.Router();
const axios = require('axios');
const QRCodeGenerator = require('qrcode');
const basicAuth = require('express-basic-auth');

const QrCode = require('../models/QrCode');
const ScanLog = require('../models/ScanLog');

// Initialize Basic Auth for Admin routes
const adminAuth = basicAuth({
  users: { 
    [process.env.ADMIN_USER || 'admin']: process.env.ADMIN_PASS || 'admin123' 
  },
  challenge: true,
  unauthorizedResponse: JSON.stringify({ error: 'Unauthorized' })
});

const normalizeAllowedCountries = (value) => {
  if (Array.isArray(value)) {
    return value.map(item => String(item).trim().toUpperCase()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map(item => item.trim().toUpperCase())
      .filter(Boolean);
  }

  return [];
};

// ==========================================
// API INFO
// ==========================================

router.get('/', (req, res) => {
  res.json({
    name: 'QR Tracker API',
    status: 'ok',
    version: '1.0.0',
    endpoints: {
      create: 'POST /api/qrcodes',
      scan: 'POST /api/qrcodes/:codeId/scan',
      list: 'GET /api/qrcodes',
      update: 'PUT /api/qrcodes/:codeId',
      delete: 'DELETE /api/qrcodes/:codeId',
      analytics: 'GET /api/analytics',
      exportCsv: 'GET /api/export-csv'
    }
  });
});

// 1. LIST QR CODES
router.get('/qrcodes', adminAuth, async (req, res) => {
  try {
    const qrs = await QrCode.find().sort({ createdAt: -1 });
    res.json({ data: qrs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. CREATE A NEW TRACKABLE QR CODE
router.post('/qrcodes', adminAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const { codeId, productName, destinationUrl, maxScanThreshold, allowedCountries } = body;

    if (!codeId || !productName || !destinationUrl) {
      return res.status(400).json({
        error: 'codeId, productName, and destinationUrl are required.',
        receivedBody: body
      });
    }

    const baseUrl = (process.env.BASE_URL || req.protocol + '://' + req.get('host')).replace(/\/$/, '');

    const newQr = await QrCode.create({
      codeId: String(codeId).trim(),
      productName: String(productName).trim(),
      destinationUrl: String(destinationUrl).trim(),
      maxScanThreshold: Number(maxScanThreshold) || 5,
      allowedCountries: normalizeAllowedCountries(allowedCountries)
    });

    const trackingUrl = baseUrl + '/api/qrcodes/' + String(codeId).trim() + '/scan';
    const qrImageBuffer = await QRCodeGenerator.toDataURL(trackingUrl);

    const savedQr = await QrCode.findByIdAndUpdate(
      newQr._id,
      { qrImageBase64: qrImageBuffer.replace(/^data:image\/png;base64,/, '') },
      { new: true }
    );

    res.status(201).json({
      message: 'QR code created successfully',
      trackingUrl,
      qrImageBase64: qrImageBuffer,
      data: savedQr
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. SCAN HANDLER (REST-ONLY: JSON response, no redirect)
router.post('/qrcodes/:codeId/scan', async (req, res) => {
  try {
    const { codeId } = req.params;
    const qrRecord = await QrCode.findOne({ codeId }).sort({ createdAt: -1 });

    if (!qrRecord) {
      return res.status(404).json({ error: 'Invalid or unrecognized QR code.' });
    }

    if (!qrRecord.destinationUrl) {
      return res.status(404).json({ error: 'QR destination is missing.' });
    }

    let destinationUrl = qrRecord.destinationUrl.trim();
    try {
      const parsed = new URL(destinationUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Invalid protocol');
      }
      destinationUrl = parsed.toString();
    } catch (error) {
      return res.status(400).json({ error: 'Invalid QR destination URL configured.' });
    }

    // Extract IP Address
    let clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (clientIp === '::1' || clientIp === '127.0.0.1') {
      clientIp = '8.8.8.8';
    }

    // Free GeoIP Lookup
    let country = 'UNKNOWN';
    let city = 'UNKNOWN';
    try {
      const geoResponse = await axios.get(`https://ipapi.co/${clientIp}/json/`);
      country = geoResponse.data.country_code || 'UNKNOWN';
      city = geoResponse.data.city || 'UNKNOWN';
    } catch (err) {
      console.error('GeoIP lookup error:', err.message);
    }

    qrRecord.totalScans += 1;
    await qrRecord.save();

    let scanStatus = 'VALID';

    if (qrRecord.totalScans > qrRecord.maxScanThreshold) {
      scanStatus = 'THRESHOLD_EXCEEDED';
      await ScanLog.create({ qrCodeId: codeId, ipAddress: clientIp, country, city, status: scanStatus });
      return res.status(403).json({
        status: 'THRESHOLD_EXCEEDED',
        message: 'Security warning: this QR code has exceeded its allowed scan limit.',
        totalScans: qrRecord.totalScans,
        maxScanThreshold: qrRecord.maxScanThreshold
      });
    }

    if (qrRecord.allowedCountries.length > 0 && !qrRecord.allowedCountries.includes(country)) {
      scanStatus = 'GEO_MISMATCH';
      await ScanLog.create({ qrCodeId: codeId, ipAddress: clientIp, country, city, status: scanStatus });
      return res.status(403).json({
        status: 'GEO_MISMATCH',
        message: 'Cross-country or counterfeit alert: this QR code is not authorized for this region.',
        country,
        allowedCountries: qrRecord.allowedCountries
      });
    }

    await ScanLog.create({ qrCodeId: codeId, ipAddress: clientIp, country, city, status: scanStatus });
    return res.status(200).json({
      status: 'VALID',
      message: 'Scan validated successfully.',
      qrCodeId: codeId,
      destinationUrl,
      country,
      city,
      totalScans: qrRecord.totalScans
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error processing scan.' });
  }
});

// 4. ANALYTICS JSON API
router.get('/analytics', adminAuth, async (req, res) => {
  try {
    const totalQrs = await QrCode.countDocuments();
    const totalScans = await ScanLog.countDocuments();
    const suspiciousScans = await ScanLog.countDocuments({
      status: { $in: ['THRESHOLD_EXCEEDED', 'GEO_MISMATCH'] }
    });

    const recentLogs = await ScanLog.find().sort({ scannedAt: -1 }).limit(20);
    const qrs = await QrCode.find();

    res.json({
      summary: { totalQrs, totalScans, suspiciousScans },
      qrs,
      recentLogs
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. EXPORT LOGS TO CSV
router.get('/export-csv', adminAuth, async (req, res) => {
  try {
    const logs = await ScanLog.find().sort({ scannedAt: -1 });

    let csv = 'ID,QR Code ID,Scanned At,IP Address,Country,City,Status\n';
    logs.forEach(log => {
      csv += `"${log._id}","${log.qrCodeId}","${log.scannedAt.toISOString()}","${log.ipAddress}","${log.country}","${log.city}","${log.status}"\n`;
    });

    res.header('Content-Type', 'text/csv');
    res.attachment('scan_logs.csv');
    return res.send(csv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6. DYNAMICALLY UPDATE QR CODE TARGET/RULES
router.put('/qrcodes/:codeId', adminAuth, async (req, res) => {
  try {
    const { destinationUrl, maxScanThreshold, allowedCountries } = req.body;

    if (!destinationUrl) {
      return res.status(400).json({ error: 'destinationUrl is required' });
    }

    try {
      const parsed = new URL(destinationUrl.trim());
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Invalid protocol');
      }
    } catch (error) {
      return res.status(400).json({ error: 'Invalid destinationUrl format.' });
    }

    const updated = await QrCode.findOneAndUpdate(
      { codeId: req.params.codeId },
      { destinationUrl: destinationUrl.trim(), maxScanThreshold, allowedCountries },
      { new: true }
    );
    res.json({ message: 'QR Code updated successfully', data: updated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 7. DELETE QR CODE
router.delete('/qrcodes/:codeId', adminAuth, async (req, res) => {
  try {
    const deleted = await QrCode.findOneAndDelete({ codeId: req.params.codeId });

    if (!deleted) {
      return res.status(404).json({ error: 'QR code not found' });
    }

    await ScanLog.deleteMany({ qrCodeId: req.params.codeId });

    res.json({ message: 'QR code deleted successfully', data: deleted });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

module.exports = router;