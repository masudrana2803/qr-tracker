const express = require('express');
const router = express.Router();
const path = require('path');
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
  unauthorizedResponse: '<h1>401 Unauthorized - Access Denied</h1>'
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
// PUBLIC ROUTES
// ==========================================

router.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>QR Tracker</title>
      <style>
        body {
          margin: 0;
          font-family: Arial, sans-serif;
          background: linear-gradient(135deg, #edf6ff, #f8fafc);
          color: #1a202c;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
        }
        .card {
          background: #fff;
          border-radius: 16px;
          padding: 40px 30px;
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
          text-align: center;
          max-width: 540px;
          width: 90%;
        }
        h1 {
          margin-bottom: 12px;
        }
        p {
          margin-bottom: 24px;
          color: #4a5568;
        }
        .btn {
          display: inline-block;
          margin: 8px;
          padding: 12px 20px;
          border-radius: 10px;
          background: #3182ce;
          color: white;
          text-decoration: none;
          font-weight: 600;
        }
        .btn.secondary {
          background: #2d3748;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>QR Tracker</h1>
        <p>Track scans, validate product authenticity, and review QR activity securely.</p>
        <a class="btn" href="/admin">Open Admin Dashboard</a>
        <a class="btn secondary" href="/scan/demo">View Demo Scan</a>
      </div>
    </body>
    </html>
  `);
});

// 1. SCAN & REDIRECT HANDLER
router.get('/scan/:codeId', async (req, res) => {
  try {
    const { codeId } = req.params;
    const qrRecord = await QrCode.findOne({ codeId });

    if (!qrRecord) {
      return res.status(404).send('<h1>Invalid or Unrecognized QR Code</h1>');
    }

    // Extract IP Address
    let clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (clientIp === '::1' || clientIp === '127.0.0.1') {
      clientIp = '8.8.8.8'; // Fallback Google DNS IP for local testing
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

    // Increment scan count
    qrRecord.totalScans += 1;
    await qrRecord.save();

    let scanStatus = 'VALID';

    // CHECK 1: Exceeded Threshold
    if (qrRecord.totalScans > qrRecord.maxScanThreshold) {
      scanStatus = 'THRESHOLD_EXCEEDED';
      await ScanLog.create({ qrCodeId: codeId, ipAddress: clientIp, country, city, status: scanStatus });
      
      return res.status(403).send(`
        <div style="text-align:center; padding:50px; font-family:sans-serif;">
          <h1 style="color:red;">Security Warning</h1>
          <p>This product code has been scanned <b>${qrRecord.totalScans} times</b> (Maximum limit: ${qrRecord.maxScanThreshold}).</p>
          <p>This item may be duplicated or counterfeit.</p>
        </div>
      `);
    }

    // CHECK 2: Geofence Country Match
    if (qrRecord.allowedCountries.length > 0 && !qrRecord.allowedCountries.includes(country)) {
      scanStatus = 'GEO_MISMATCH';
      await ScanLog.create({ qrCodeId: codeId, ipAddress: clientIp, country, city, status: scanStatus });

      return res.status(403).send(`
        <div style="text-align:center; padding:50px; font-family:sans-serif;">
          <h1 style="color:red;">Cross-Country / Counterfeit Alert</h1>
          <p>This product is not authorized for scan or distribution in your region (<b>${country}</b>).</p>
        </div>
      `);
    }

    // Record legitimate scan and redirect
    await ScanLog.create({ qrCodeId: codeId, ipAddress: clientIp, country, city, status: scanStatus });
    return res.redirect(qrRecord.destinationUrl);

  } catch (error) {
    res.status(500).send('Server Error Processing Scan');
  }
});


// ==========================================
// PROTECTED ADMIN ROUTES
// ==========================================

// 2. CREATE A NEW TRACKABLE QR CODE
router.post('/create', adminAuth, async (req, res) => {
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

    const trackingUrl = baseUrl + '/scan/' + String(codeId).trim();
    const qrImageBuffer = await QRCodeGenerator.toDataURL(trackingUrl);

    res.status(201).json({
      message: 'QR Code created successfully',
      trackingUrl,
      qrImageBase64: qrImageBuffer,
      data: newQr
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
router.get('/logout', (req, res) => {
  res.set('WWW-Authenticate', 'Basic realm="Admin Area"');
  return res.status(401).send('<h1>Logged out</h1><p>Credentials cleared. Please sign in again.</p>');
});

// 3. SERVE ADMIN DASHBOARD UI
router.get('/admin', adminAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '../views/dashboard.html'));
});

// 4. ANALYTICS JSON API
router.get('/api/analytics', adminAuth, async (req, res) => {
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
router.get('/api/export-csv', adminAuth, async (req, res) => {
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
router.put('/update/:codeId', adminAuth, async (req, res) => {
  try {
    const { destinationUrl, maxScanThreshold, allowedCountries } = req.body;
    const updated = await QrCode.findOneAndUpdate(
      { codeId: req.params.codeId },
      { destinationUrl, maxScanThreshold, allowedCountries },
      { new: true }
    );
    res.json({ message: 'QR Code updated successfully', data: updated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 7. DELETE QR CODE
router.delete('/delete/:codeId', adminAuth, async (req, res) => {
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

module.exports = router;