const express = require('express');
const router = express.Router();

const axios = require('axios');
const QRCodeGenerator = require('qrcode');
const basicAuth = require('express-basic-auth');

const QrCode = require('../models/QrCode');
const ScanLog = require('../models/ScanLog');


// =====================================================
// ADMIN BASIC AUTH
// =====================================================

const adminAuth = basicAuth({
  users: {
    [process.env.ADMIN_USER ||
      process.env.ADMIN_USERNAME ||
      'admin']:
      process.env.ADMIN_PASS ||
      process.env.ADMIN_PASSWORD ||
      'admin123'
  },

  challenge: true,

  unauthorizedResponse: () => ({
    error: 'Unauthorized'
  })
});


// =====================================================
// HELPERS
// =====================================================

// Normalize country list
// Example:
// "BD, IN, CN" -> ["BD", "IN", "CN"]
const normalizeAllowedCountries = (value) => {
  if (Array.isArray(value)) {
    return value
      .map(item => String(item).trim().toUpperCase())
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map(item => item.trim().toUpperCase())
      .filter(Boolean);
  }

  return [];
};


// =====================================================
// HTML WARNING PAGE HELPER
// =====================================================

const warningPage = (title, message) => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">

      <meta
        name="viewport"
        content="width=device-width, initial-scale=1.0"
      >

      <title>${title}</title>

      <style>
        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          min-height: 100vh;

          display: flex;
          align-items: center;
          justify-content: center;

          font-family: Arial, sans-serif;

          background: #f4f4f4;
          color: #222;
        }

        .container {
          width: 90%;
          max-width: 500px;

          background: white;

          padding: 40px 30px;

          border-radius: 12px;

          text-align: center;

          box-shadow:
            0 10px 30px rgba(0, 0, 0, 0.1);
        }

        h2 {
          margin-top: 0;
          font-size: 28px;
        }

        p {
          color: #666;
          line-height: 1.6;
        }
      </style>

    </head>

    <body>

      <div class="container">

        <h2>${title}</h2>

        <p>${message}</p>

      </div>

    </body>
    </html>
  `;
};

const authenticPage = (productName, destinationUrl) => `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Authentic Product</title>
    <style>
      body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; font-family: Arial, sans-serif; background: #f0fdf4; color: #166534; }
      .container { width: 90%; max-width: 500px; padding: 40px 30px; border-radius: 12px; text-align: center; background: white; box-shadow: 0 10px 30px rgba(22, 101, 52, 0.12); }
      h2 { margin-top: 0; font-size: 28px; }
      p { color: #365314; line-height: 1.6; }
      a { display: inline-block; margin-top: 16px; padding: 12px 18px; border-radius: 6px; background: #15803d; color: white; font-weight: bold; text-decoration: none; }
    </style>
  </head>
  <body>
    <div class="container">
      <h2>Authentic Product</h2>
      <p>This QR code has been verified successfully for ${productName}.</p>
      <a href="${destinationUrl}">Continue to product website</a>
    </div>
  </body>
  </html>
`;


// =====================================================
// GET REAL CLIENT IP
// =====================================================

const getClientIp = (req) => {

  let clientIp =
    req.headers['x-forwarded-for'] ||
    req.headers['x-real-ip'] ||
    req.socket.remoteAddress ||
    '';

  // x-forwarded-for can contain multiple IP addresses
  if (typeof clientIp === 'string') {
    clientIp = clientIp.split(',')[0].trim();
  }

  // Remove IPv6 mapped prefix
  if (clientIp.startsWith('::ffff:')) {
    clientIp = clientIp.replace('::ffff:', '');
  }

  return clientIp;
};


// =====================================================
// API INFORMATION
// =====================================================

router.get('/', (req, res) => {

  res.json({

    name: 'QR Tracker API',

    status: 'ok',

    version: '1.0.0',

    endpoints: {

      create:
        'POST /api/qrcodes',

      scan:
        'GET /api/qrcodes/:codeId/scan',

      list:
        'GET /api/qrcodes',

      getOne:
        'GET /api/qrcodes/:codeId',

      update:
        'PUT /api/qrcodes/:codeId',

      delete:
        'DELETE /api/qrcodes/:codeId',

      analytics:
        'GET /api/analytics',

      exportCsv:
        'GET /api/export-csv'

    }

  });

});


// =====================================================
// 1. LIST QR CODES
// =====================================================

router.get('/qrcodes', adminAuth, async (req, res) => {

  try {

    const qrs = await QrCode
      .find()
      .sort({ createdAt: -1 });

    return res.json({

      data: qrs

    });

  } catch (error) {

    console.error('List QR error:', error);

    return res.status(500).json({

      error: error.message

    });

  }

});


// =====================================================
// 2. GET SINGLE QR CODE
// =====================================================

router.get('/qrcodes/:codeId', adminAuth, async (req, res) => {

  try {

    const { codeId } = req.params;

    const qr = await QrCode.findOne({
      codeId: String(codeId).trim()
    });

    if (!qr) {

      return res.status(404).json({

        error: 'QR code not found'

      });

    }

    return res.json({

      data: qr

    });

  } catch (error) {

    console.error('Get QR error:', error);

    return res.status(500).json({

      error: error.message

    });

  }

});


// =====================================================
// 3. CREATE QR CODE
// =====================================================

router.post('/qrcodes', adminAuth, async (req, res) => {

  try {

    const body = req.body || {};

    const {
      codeId,
      productName,
      destinationUrl,
      maxScanThreshold,
      allowedCountries
    } = body;


    // -----------------------------------------------
    // VALIDATION
    // -----------------------------------------------

    if (
      !codeId ||
      !productName ||
      !destinationUrl
    ) {

      return res.status(400).json({

        error:
          'codeId, productName, and destinationUrl are required.',

        receivedBody:
          body

      });

    }


    // -----------------------------------------------
    // VALIDATE DESTINATION URL
    // -----------------------------------------------

    let validDestinationUrl;

    try {

      const parsed =
        new URL(
          String(destinationUrl).trim()
        );

      if (
        ![
          'http:',
          'https:'
        ].includes(parsed.protocol)
      ) {

        throw new Error(
          'Invalid protocol'
        );

      }

      validDestinationUrl =
        parsed.toString();

    } catch {

      return res.status(400).json({

        error:
          'Invalid destinationUrl format.'

      });

    }


    // -----------------------------------------------
    // CHECK DUPLICATE CODE ID
    // -----------------------------------------------

    const existingQr =
      await QrCode.findOne({

        codeId:
          String(codeId).trim()

      });

    if (existingQr) {

      return res.status(409).json({

        error:
          'A QR code with this codeId already exists.'

      });

    }


    // -----------------------------------------------
    // CREATE QR RECORD
    // -----------------------------------------------

    const newQr =
      await QrCode.create({

        codeId:
          String(codeId).trim(),

        productName:
          String(productName).trim(),

        destinationUrl:
          validDestinationUrl,

        maxScanThreshold:
          Number(maxScanThreshold) || 5,

        allowedCountries:
          normalizeAllowedCountries(
            allowedCountries
          ),

        totalScans:
          0

      });


    // -----------------------------------------------
    // CREATE BASE URL
    // -----------------------------------------------

    const baseUrl = (
      process.env.BASE_URL ||
      req.protocol +
      '://' +
      req.get('host')
    ).replace(/\/$/, '');


    // -----------------------------------------------
    // QR TRACKING URL
    // -----------------------------------------------

    const trackingUrl =
      `${baseUrl}/api/qrcodes/${encodeURIComponent(
        newQr.codeId
      )}/scan`;


    // -----------------------------------------------
    // GENERATE QR IMAGE
    // -----------------------------------------------

    const qrImageDataUrl =
      await QRCodeGenerator.toDataURL(
        trackingUrl,
        {
          errorCorrectionLevel: 'M',
          margin: 2,
          width: 500
        }
      );


    // -----------------------------------------------
    // SAVE BASE64 QR IMAGE
    // -----------------------------------------------

    const qrImageBase64 =
      qrImageDataUrl.replace(
        /^data:image\/png;base64,/,
        ''
      );


    const savedQr =
      await QrCode.findByIdAndUpdate(

        newQr._id,

        {
          qrImageBase64
        },

        {
          new: true
        }

      );


    return res.status(201).json({

      message:
        'QR code created successfully',

      trackingUrl,

      qrImageBase64:
        qrImageDataUrl,

      data:
        savedQr

    });


  } catch (error) {

    console.error(
      'Create QR error:',
      error
    );

    return res.status(500).json({

      error:
        error.message

    });

  }

});


// =====================================================
// 4. SCAN QR CODE
// =====================================================
// This is the URL embedded inside the QR code.
//
// When scanned:
//
// 1. QR record is found
// 2. IP address is detected
// 3. Country is detected
// 4. Scan counter increases
// 5. Threshold is checked
// 6. Country restriction is checked
// 7. Valid users are redirected
// 8. Suspicious users see warning page
// =====================================================

router.get(
  '/qrcodes/:codeId/scan',

  async (req, res) => {

    try {

      const { codeId } =
        req.params;


      // ---------------------------------------------
      // FIND QR CODE
      // ---------------------------------------------

      const qrRecord =
        await QrCode.findOne({

          codeId:
            String(codeId).trim()

        });


      if (!qrRecord) {

        return res
          .status(404)
          .send(

            warningPage(

              '❌ Invalid QR Code',

              'This QR code is not recognized by our verification system.'

            )

          );

      }


      // ---------------------------------------------
      // CHECK DESTINATION
      // ---------------------------------------------

      if (!qrRecord.destinationUrl) {

        return res
          .status(404)
          .send(

            warningPage(

              '⚠️ Destination Missing',

              'No destination URL has been configured for this QR code.'

            )

          );

      }


      // ---------------------------------------------
      // VALIDATE DESTINATION URL
      // ---------------------------------------------

      let destinationUrl;

      try {

        const parsed =
          new URL(
            qrRecord.destinationUrl.trim()
          );

        if (
          ![
            'http:',
            'https:'
          ].includes(
            parsed.protocol
          )
        ) {

          throw new Error(
            'Invalid protocol'
          );

        }

        destinationUrl =
          parsed.toString();

      } catch {

        return res
          .status(400)
          .send(

            warningPage(

              '⚠️ Invalid Destination',

              'The destination URL configured for this QR code is invalid.'

            )

          );

      }


      // ---------------------------------------------
      // GET CLIENT IP
      // ---------------------------------------------

      let clientIp =
        getClientIp(req);


      // Local development fallback
      if (

        clientIp === '::1' ||

        clientIp === '127.0.0.1' ||

        clientIp === ''

      ) {

        clientIp =
          '8.8.8.8';

      }


      // ---------------------------------------------
      // GEO LOCATION
      // ---------------------------------------------

      let country =
        'UNKNOWN';

      let city =
        'UNKNOWN';


      try {

        const geoResponse =
          await axios.get(

            `https://ipapi.co/${clientIp}/json/`,

            {
              timeout: 5000
            }

          );


        country =
          (
            geoResponse.data.country_code ||
            'UNKNOWN'
          )
            .toUpperCase();


        city =
          geoResponse.data.city ||
          'UNKNOWN';


      } catch (error) {

        console.error(

          'GeoIP lookup error:',

          error.message

        );

      }


      // ---------------------------------------------
      // INCREMENT TOTAL SCANS
      // ---------------------------------------------

      qrRecord.totalScans += 1;

      await qrRecord.save();


      // ---------------------------------------------
      // DEFAULT STATUS
      // ---------------------------------------------

      let scanStatus =
        'VALID';


      // ---------------------------------------------
      // CHECK SCAN THRESHOLD
      // ---------------------------------------------

      if (

        qrRecord.totalScans >

        qrRecord.maxScanThreshold

      ) {

        scanStatus =
          'THRESHOLD_EXCEEDED';


        await ScanLog.create({

          qrCodeId:
            qrRecord.codeId,

          ipAddress:
            clientIp,

          country,

          city,

          status:
            scanStatus

        });


        return res
          .status(403)
          .send(

            warningPage(

              '🚨 Security Warning',

              'This QR code has exceeded its allowed scan limit. Please contact the manufacturer or seller for verification.'

            )

          );

      }


      // ---------------------------------------------
      // CHECK COUNTRY RESTRICTION
      // ---------------------------------------------

      if (

        Array.isArray(
          qrRecord.allowedCountries
        ) &&

        qrRecord.allowedCountries.length > 0 &&

        !qrRecord.allowedCountries.includes(
          country
        )

      ) {

        scanStatus =
          'GEO_MISMATCH';


        await ScanLog.create({

          qrCodeId:
            qrRecord.codeId,

          ipAddress:
            clientIp,

          country,

          city,

          status:
            scanStatus

        });


        return res
          .status(403)
          .send(

            warningPage(

              '🌍 Region Verification Warning',

              `This product QR code is not authorized for your current region (${country}).`

            )

          );

      }


      // ---------------------------------------------
      // SAVE VALID SCAN
      // ---------------------------------------------

      await ScanLog.create({

        qrCodeId:
          qrRecord.codeId,

        ipAddress:
          clientIp,

        country,

        city,

        status:
          scanStatus

      });


      // ---------------------------------------------
      // REDIRECT VALID USER
      // ---------------------------------------------

      return res.redirect(
        302,
        destinationUrl
      );


    } catch (error) {

      console.error(

        'Scan error:',

        error

      );


      return res
        .status(500)
        .send(

          warningPage(

            '❌ Server Error',

            'There was a problem processing this QR code. Please try again later.'

          )

        );

    }

  }

);


// =====================================================
// 5. ANALYTICS
// =====================================================

router.get(
  '/analytics',

  adminAuth,

  async (req, res) => {

    try {

      const totalQrs =
        await QrCode.countDocuments();


      const totalScans =
        await ScanLog.countDocuments();


      const suspiciousScans =
        await ScanLog.countDocuments({

          status: {

            $in: [

              'THRESHOLD_EXCEEDED',

              'GEO_MISMATCH'

            ]

          }

        });


      const recentLogs =
        await ScanLog
          .find()
          .sort({

            scannedAt:
              -1

          })
          .limit(20);


      const qrs =
        await QrCode.find()
          .sort({

            createdAt:
              -1

          });


      return res.json({

        summary: {

          totalQrs,

          totalScans,

          suspiciousScans

        },

        qrs,

        recentLogs

      });


    } catch (error) {

      console.error(

        'Analytics error:',

        error

      );


      return res.status(500).json({

        error:
          error.message

      });

    }

  }

);


// =====================================================
// 6. EXPORT SCAN LOGS TO CSV
// =====================================================

router.get(
  '/export-csv',

  adminAuth,

  async (req, res) => {

    try {

      const logs =
        await ScanLog
          .find()
          .sort({

            scannedAt:
              -1

          });


      let csv =
        'ID,QR Code ID,Scanned At,IP Address,Country,City,Status\n';


      logs.forEach(
        log => {

          csv +=

            `"${log._id}",` +

            `"${log.qrCodeId}",` +

            `"${log.scannedAt ? log.scannedAt.toISOString() : ''}",` +

            `"${log.ipAddress}",` +

            `"${log.country}",` +

            `"${log.city}",` +

            `"${log.status}"\n`;

        }
      );


      res.header(

        'Content-Type',

        'text/csv'

      );


      res.attachment(

        'scan_logs.csv'

      );


      return res.send(
        csv
      );


    } catch (error) {

      console.error(

        'CSV export error:',

        error

      );


      return res.status(500).json({

        error:
          error.message

      });

    }

  }

);


// =====================================================
// 7. UPDATE QR CODE
// =====================================================

router.put(
  '/qrcodes/:codeId',

  adminAuth,

  async (req, res) => {

    try {

      const {

        codeId

      } = req.params;


      const {

        productName,

        destinationUrl,

        maxScanThreshold,

        allowedCountries

      } = req.body;


      // ---------------------------------------------
      // FIND QR
      // ---------------------------------------------

      const qr =
        await QrCode.findOne({

          codeId:
            String(codeId).trim()

        });


      if (!qr) {

        return res.status(404).json({

          error:
            'QR code not found.'

        });

      }


      // ---------------------------------------------
      // UPDATE PRODUCT NAME
      // ---------------------------------------------

      if (

        productName !== undefined

      ) {

        qr.productName =
          String(
            productName
          ).trim();

      }


      // ---------------------------------------------
      // UPDATE DESTINATION URL
      // ---------------------------------------------

      if (

        destinationUrl !== undefined

      ) {

        try {

          const parsed =
            new URL(

              String(
                destinationUrl
              ).trim()

            );


          if (

            ![
              'http:',
              'https:'
            ].includes(
              parsed.protocol
            )

          ) {

            throw new Error(
              'Invalid protocol'
            );

          }


          qr.destinationUrl =
            parsed.toString();


        } catch {

          return res.status(400).json({

            error:
              'Invalid destinationUrl format.'

          });

        }

      }


      // ---------------------------------------------
      // UPDATE MAX SCAN THRESHOLD
      // ---------------------------------------------

      if (

        maxScanThreshold !== undefined

      ) {

        const threshold =
          Number(
            maxScanThreshold
          );


        if (

          Number.isNaN(
            threshold
          ) ||

          threshold < 1

        ) {

          return res.status(400).json({

            error:
              'maxScanThreshold must be at least 1.'

          });

        }


        qr.maxScanThreshold =
          threshold;

      }


      // ---------------------------------------------
      // UPDATE ALLOWED COUNTRIES
      // ---------------------------------------------

      if (

        allowedCountries !== undefined

      ) {

        qr.allowedCountries =
          normalizeAllowedCountries(
            allowedCountries
          );

      }


      // ---------------------------------------------
      // SAVE UPDATE
      // ---------------------------------------------

      await qr.save();


      return res.json({

        message:
          'QR code updated successfully',

        data:
          qr

      });


    } catch (error) {

      console.error(

        'Update QR error:',

        error

      );


      return res.status(500).json({

        error:
          error.message

      });

    }

  }

);


// =====================================================
// 8. DELETE QR CODE
// =====================================================

router.delete(
  '/qrcodes/:codeId',

  adminAuth,

  async (req, res) => {

    try {

      const {

        codeId

      } = req.params;


      const deletedQr =
        await QrCode.findOneAndDelete({

          codeId:
            String(codeId).trim()

        });


      if (!deletedQr) {

        return res.status(404).json({

          error:
            'QR code not found.'

        });

      }


      // Optional:
      // Delete all scan logs belonging to this QR code

      await ScanLog.deleteMany({

        qrCodeId:
          deletedQr.codeId

      });


      return res.json({

        message:
          'QR code deleted successfully',

        data:
          deletedQr

      });


    } catch (error) {

      console.error(

        'Delete QR error:',

        error

      );


      return res.status(500).json({

        error:
          error.message

      });

    }

  }

);


// =====================================================
// EXPORT ROUTER
// =====================================================

module.exports = router;

