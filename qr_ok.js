router.post('/create', adminAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const { codeId, productName, destinationUrl, maxScanThreshold, allowedCountries } = body;

    // Basic validation
    if (!codeId || !productName || !destinationUrl) {
      return res.status(400).json({
        error: 'codeId, productName, and destinationUrl are required.',
        receivedBody: body
      });
    }

    // Validate destinationUrl format
    try {
      new URL(destinationUrl);
    } catch {
      return res.status(400).json({
        error: 'Invalid destinationUrl format.',
        receivedBody: body
      });
    }

    // Build base URL safely
    const baseUrl = (process.env.BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');

    // Create QR record
    const newQr = await QrCode.create({
      codeId: String(codeId).trim(),
      productName: String(productName).trim(),
      destinationUrl: String(destinationUrl).trim(),
      maxScanThreshold: maxScanThreshold != null ? Number(maxScanThreshold) : 5,
      allowedCountries: normalizeAllowedCountries(allowedCountries)
    });

    // Generate tracking URL and QR image
    const trackingUrl = `${baseUrl}/scan/${String(codeId).trim()}`;
    const qrImageBuffer = await QRCodeGenerator.toDataURL(trackingUrl);
    const qrImageBase64 = qrImageBuffer.replace(/^data:image\/png;base64,/, '');

    // Success response
    res.status(201).json({
      message: 'QR Code created successfully',
      trackingUrl,
      qrImageBase64,
      data: newQr
    });
  } catch (error) {
    console.error('QR creation error:', error);
    res.status(500).json({ error: error.message });
  }
});
