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
      'sUper'
  },

  challenge: true,

  unauthorizedResponse: () => ({
    error: 'Unauthorized'
  })
});


// =====================================================
// HELPERS
// =====================================================

const normalizeAllowedCountries = (value) => {

  if (Array.isArray(value)) {

    return value
      .map(item =>
        String(item)
          .trim()
          .toUpperCase()
      )
      .filter(Boolean);

  }

  if (typeof value === 'string') {

    return value
      .split(',')
      .map(item =>
        item
          .trim()
          .toUpperCase()
      )
      .filter(Boolean);

  }

  return [];

};


// =====================================================
// ESCAPE HTML
// Prevent product names / URLs from injecting HTML
// =====================================================

const escapeHtml = (value) => {

  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

};


// =====================================================
// WARNING PAGE
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

<title>${escapeHtml(title)}</title>

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

  font-family:
    Arial,
    Helvetica,
    sans-serif;

  background: #f4f4f4;

  color: #222;

}

.container {

  width: 90%;

  max-width: 500px;

  background: white;

  padding: 40px 30px;

  border-radius: 16px;

  text-align: center;

  box-shadow:
    0 10px 30px
    rgba(0, 0, 0, 0.10);

}

.icon {

  font-size: 55px;

  margin-bottom: 15px;

}

h2 {

  margin: 0 0 15px;

  font-size: 27px;

}

p {

  color: #666;

  line-height: 1.6;

}

</style>

</head>

<body>

<div class="container">

  <div class="icon">⚠️</div>

  <h2>${escapeHtml(title)}</h2>

  <p>${escapeHtml(message)}</p>

</div>

</body>

</html>
`;

};


// =====================================================
// VERIFICATION PAGE
// =====================================================

const verificationPage = ({
  productName,
  codeId,
  country,
  city,
  totalScans,
  maxScanThreshold,
  destinationUrl
}) => {

  const remainingScans =
    Math.max(
      0,
      Number(maxScanThreshold) -
      Number(totalScans)
    );

  return `
<!DOCTYPE html>

<html lang="en">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
>

<title>QR Verification</title>

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

  padding: 20px;

  font-family:
    Arial,
    Helvetica,
    sans-serif;

  background:
    linear-gradient(
      135deg,
      #ecfdf5,
      #f0fdf4
    );

  color: #1f2937;

}

.card {

  width: 100%;

  max-width: 520px;

  background: white;

  border-radius: 20px;

  padding: 30px;

  box-shadow:
    0 15px 40px
    rgba(0, 0, 0, 0.12);

}

.success-icon {

  width: 75px;

  height: 75px;

  margin: 0 auto 18px;

  border-radius: 50%;

  display: flex;

  align-items: center;

  justify-content: center;

  background: #dcfce7;

  color: #15803d;

  font-size: 40px;

  font-weight: bold;

}

h1 {

  text-align: center;

  margin: 0;

  color: #166534;

  font-size: 28px;

}

.subtitle {

  text-align: center;

  color: #6b7280;

  margin: 10px 0 25px;

}

.info {

  border: 1px solid #e5e7eb;

  border-radius: 12px;

  overflow: hidden;

  margin-bottom: 20px;

}

.row {

  display: flex;

  justify-content: space-between;

  gap: 15px;

  padding: 14px 16px;

  border-bottom: 1px solid #e5e7eb;

}

.row:last-child {

  border-bottom: none;

}

.label {

  color: #6b7280;

}

.value {

  font-weight: bold;

  text-align: right;

  word-break: break-word;

}

.status {

  background: #f0fdf4;

  border: 1px solid #bbf7d0;

  color: #166534;

  padding: 15px;

  border-radius: 10px;

  text-align: center;

  margin-bottom: 20px;

}

.continue-button {

  display: block;

  width: 100%;

  padding: 15px;

  border: none;

  border-radius: 10px;

  background: #15803d;

  color: white;

  font-size: 17px;

  font-weight: bold;

  text-decoration: none;

  text-align: center;

  cursor: pointer;

}

.continue-button:hover {

  background: #166534;

}

.small {

  text-align: center;

  color: #9ca3af;

  font-size: 12px;

  margin-top: 15px;

}

</style>

</head>

<body>

<div class="card">

  <div class="success-icon">
    ✓
  </div>

  <h1>
    Authentic Product
  </h1>

  <div class="subtitle">
    QR code verification successful
  </div>


  <div class="info">

    <div class="row">

      <span class="label">
        Product
      </span>

      <span class="value">
        ${escapeHtml(productName)}
      </span>

    </div>


    <div class="row">

      <span class="label">
        QR Code
      </span>

      <span class="value">
        ${escapeHtml(codeId)}
      </span>

    </div>


    <div class="row">

      <span class="label">
        Country
      </span>

      <span class="value">
        ${escapeHtml(country)}
      </span>

    </div>


    <div class="row">

      <span class="label">
        City
      </span>

      <span class="value">
        ${escapeHtml(city)}
      </span>

    </div>


    <div class="row">

      <span class="label">
        Scan Count
      </span>

      <span class="value">
        ${escapeHtml(totalScans)}
        /
        ${escapeHtml(maxScanThreshold)}
      </span>

    </div>

  </div>


  <div class="status">

    ✓ This QR code has been successfully verified.

    <br>

    Remaining allowed scans:
    <strong>${escapeHtml(remainingScans)}</strong>

  </div>


  <a
    class="continue-button"
    href="${escapeHtml(destinationUrl)}"
    rel="noopener noreferrer"
  >
    Continue to Product Website →
  </a>


  <div class="small">

    Verification completed by QR Product Verification System

  </div>

</div>

</body>

</html>
`;

};


// =====================================================
// GET REAL CLIENT IP
// =====================================================

const getClientIp = (req) => {

  let clientIp =
    req.headers['x-forwarded-for'] ||
    req.headers['x-real-ip'] ||
    req.socket.remoteAddress ||
    '';

  if (typeof clientIp === 'string') {

    clientIp =
      clientIp
        .split(',')[0]
        .trim();

  }

  if (clientIp.startsWith('::ffff:')) {

    clientIp =
      clientIp.replace(
        '::ffff:',
        ''
      );

  }

  return clientIp;

};


// =====================================================
// GEO LOCATION
// =====================================================

const lookupGeoLocation = async (clientIp) => {

  try {

    const response =
      await axios.get(
        `https://ipapi.co/${clientIp}/json/`,
        {
          timeout: 5000
        }
      );

    const country =
      response.data.country_code
        ?.toUpperCase();

    if (country) {

      return {

        country,

        city:
          response.data.city ||
          'UNKNOWN'

      };

    }

  } catch (error) {

    console.error(
      'Primary GeoIP lookup error:',
      error.message
    );

  }


  try {

    const response =
      await axios.get(
        `https://ipwho.is/${clientIp}`,
        {
          timeout: 5000
        }
      );

    const country =
      response.data.country_code
        ?.toUpperCase();

    if (
      response.data.success !== false &&
      country
    ) {

      return {

        country,

        city:
          response.data.city ||
          'UNKNOWN'

      };

    }

  } catch (error) {

    console.error(
      'Fallback GeoIP lookup error:',
      error.message
    );

  }


  return {

    country: 'UNKNOWN',

    city: 'UNKNOWN'

  };

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

router.get(
  '/qrcodes',
  adminAuth,
  async (req, res) => {

    try {

      const qrs =
        await QrCode
          .find()
          .sort({
            createdAt: -1
          });

      return res.json({

        data: qrs

      });

    } catch (error) {

      console.error(
        'List QR error:',
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
// 2. GET SINGLE QR CODE
// =====================================================

router.get(
  '/qrcodes/:codeId',
  adminAuth,
  async (req, res) => {

    try {

      const { codeId } =
        req.params;

      const qr =
        await QrCode.findOne({

          codeId:
            String(codeId).trim()

        });

      if (!qr) {

        return res.status(404).json({

          error:
            'QR code not found'

        });

      }

      return res.json({

        data: qr

      });

    } catch (error) {

      console.error(
        'Get QR error:',
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
// 3. CREATE QR CODE
// =====================================================

router.post(
  '/qrcodes',
  adminAuth,
  async (req, res) => {

    try {

      const body =
        req.body || {};

      const {
        codeId,
        productName,
        destinationUrl,
        maxScanThreshold,
        allowedCountries
      } = body;


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
          ].includes(
            parsed.protocol
          )
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


      const baseUrl = (

        process.env.BASE_URL ||

        req.protocol +
        '://' +
        req.get('host')

      ).replace(
        /\/$/,
        ''
      );


      const trackingUrl =
        `${baseUrl}/api/qrcodes/${encodeURIComponent(
          newQr.codeId
        )}/scan`;


      const qrImageDataUrl =
        await QRCodeGenerator.toDataURL(
          trackingUrl,
          {

            errorCorrectionLevel:
              'M',

            margin:
              2,

            width:
              500

          }
        );


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

  }
);


// =====================================================
// 4. SCAN QR CODE
// =====================================================
//
// NEW FLOW:
//
// QR Scan
//    ↓
// Find QR
//    ↓
// Detect IP
//    ↓
// Detect Country
//    ↓
// Increase Scan Counter
//    ↓
// Check Threshold
//    ↓
// Check Country
//    ↓
// VALID
//    ↓
// Show Verification Page
//    ↓
// User presses Continue
//    ↓
// Destination Website
//
// =====================================================

router.get(
  '/qrcodes/:codeId/scan',
  async (req, res) => {

    try {

      const { codeId } =
        req.params;


      // ---------------------------------------------
      // FIND QR
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
      // VALIDATE DESTINATION
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


      if (
        clientIp === '::1' ||
        clientIp === '127.0.0.1' ||
        clientIp === ''
      ) {

        clientIp =
          'UNKNOWN';

      }


      // ---------------------------------------------
      // GEO LOCATION
      // ---------------------------------------------

      const {
        country,
        city
      } = clientIp === 'UNKNOWN'

        ? {
            country: 'UNKNOWN',
            city: 'UNKNOWN'
          }

        : await lookupGeoLocation(
            clientIp
          );


      // ---------------------------------------------
      // INCREMENT SCAN COUNTER
      // ---------------------------------------------

      qrRecord.totalScans += 1;

      await qrRecord.save();


      // ---------------------------------------------
      // CHECK THRESHOLD
      // ---------------------------------------------

      if (
        qrRecord.totalScans >
        qrRecord.maxScanThreshold
      ) {

        await ScanLog.create({

          qrCodeId:
            qrRecord.codeId,

          ipAddress:
            clientIp,

          country,

          city,

          status:
            'THRESHOLD_EXCEEDED'

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
      // GEO LOCATION UNAVAILABLE
      // ---------------------------------------------

      if (
        country === 'UNKNOWN'
      ) {

        await ScanLog.create({

          qrCodeId:
            qrRecord.codeId,

          ipAddress:
            clientIp,

          country,

          city,

          status:
            'GEO_UNAVAILABLE'

        });


        return res
          .status(503)
          .send(

            warningPage(

              '🌍 Location Verification Unavailable',

              'We could not determine your current region. Please try again or contact the manufacturer.'

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

        await ScanLog.create({

          qrCodeId:
            qrRecord.codeId,

          ipAddress:
            clientIp,

          country,

          city,

          status:
            'GEO_MISMATCH'

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
          'VALID'

      });


      // ---------------------------------------------
      // SHOW VERIFICATION PAGE
      // ---------------------------------------------
      //
      // IMPORTANT:
      //
      // There is NO res.redirect() here.
      //
      // The customer must manually press
      // "Continue to Product Website".
      //
      // ---------------------------------------------

      return res.send(

        verificationPage({

          productName:
            qrRecord.productName,

          codeId:
            qrRecord.codeId,

          country,

          city,

          totalScans:
            qrRecord.totalScans,

          maxScanThreshold:
            qrRecord.maxScanThreshold,

          destinationUrl

        })

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

              'GEO_MISMATCH',

              'GEO_UNAVAILABLE'

            ]

          }

        });


      const recentLogs =
        await ScanLog
          .find()
          .sort({
            scannedAt: -1
          })
          .limit(20);


      const qrs =
        await QrCode
          .find()
          .sort({
            createdAt: -1
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
            scannedAt: -1
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

      const { codeId } =
        req.params;

      const {
        productName,
        destinationUrl,
        maxScanThreshold,
        allowedCountries
      } = req.body;


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


      if (
        productName !== undefined
      ) {

        qr.productName =
          String(
            productName
          ).trim();

      }


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


      if (
        allowedCountries !== undefined
      ) {

        qr.allowedCountries =
          normalizeAllowedCountries(
            allowedCountries
          );

      }


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

      const { codeId } =
        req.params;


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