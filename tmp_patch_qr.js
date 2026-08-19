const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'routes', 'qrRoutes.js');
let content = fs.readFileSync(filePath, 'utf8');

const oldBlock = `router.post('/create', adminAuth, async (req, res) => {
  try {
    const { codeId, productName, destinationUrl, maxScanThreshold, allowedCountries } = req.body;

    if (!codeId || !productName || !destinationUrl) {
      return res.status(400).json({ error: 'codeId, productName, and destinationUrl are required.' });
    }

    const newQr = await QrCode.create({
      codeId: String(codeId).trim(),
      productName: String(productName).trim(),
      destinationUrl: String(destinationUrl).trim(),
      maxScanThreshold: Number(maxScanThreshold) || 5,
      allowedCountries: normalizeAllowedCountries(allowedCountries)
    });

    const trackingUrl = `${process.env.BASE_URL}/scan/${codeId}`;
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
});`;

const newBlock = `router.post('/create', adminAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const { codeId, productName, destinationUrl, maxScanThreshold, allowedCountries } = body;

    if (!codeId || !productName || !destinationUrl) {
      return res.status(400).json({
        error: 'codeId, productName, and destinationUrl are required.',
        receivedBody: body
      });
    }

    const baseUrl = (process.env.BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');

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
});`;

if (!content.includes(oldBlock)) {
  throw new Error('Target block not found');
}

content = content.replace(oldBlock, newBlock);
fs.writeFileSync(filePath, content, 'utf8');
console.log('patched');
