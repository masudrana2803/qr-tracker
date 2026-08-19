const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'routes', 'qrRoutes.js');
let content = fs.readFileSync(filePath, 'utf8');

const startMarker = "router.post('/create', adminAuth, async (req, res) => {";
const endMarker = "router.get('/logout', (req, res) => {";

const start = content.indexOf(startMarker);
const end = content.indexOf(endMarker);

if (start === -1 || end === -1 || end <= start) {
  throw new Error('Could not locate create route block');
}

const replacement = `router.post('/create', adminAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const { codeId, productName, destinationUrl, maxScanThreshold, allowedCountries } = body;

    if (!codeId || !productName || !destinationUrl) {
      return res.status(400).json({
        error: 'codeId, productName, and destinationUrl are required.',
        receivedBody: body
      });
    }

    const baseUrl = (process.env.BASE_URL || \
      `${req.protocol}://${req.get('host')}`).replace(/\\\/$/, '');

    const newQr = await QrCode.create({
      codeId: String(codeId).trim(),
      productName: String(productName).trim(),
      destinationUrl: String(destinationUrl).trim(),
      maxScanThreshold: Number(maxScanThreshold) || 5,
      allowedCountries: normalizeAllowedCountries(allowedCountries)
    });

    const trackingUrl = `${baseUrl}/scan/${String(codeId).trim()}`;
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

`;

content = content.slice(0, start) + replacement + content.slice(end);
fs.writeFileSync(filePath, content, 'utf8');
console.log('applied');
