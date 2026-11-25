import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';

import {
  Store,
  Product,
  Order,
  Category,
  User
} from '../models.js';

import {
  auth,
  allow,
  asyncRoute,
  validate,
  notify,
  mail
} from '../lib.js';

// =====================================================
// CLOUDINARY CONFIGURATION
// =====================================================

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const r = Router();

r.use(auth, allow('seller'));

const own = async user =>
  Store.findOne({ owner: user.id });

// =====================================================
// IMAGE UPLOAD CONFIGURATION
// =====================================================

const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp'
]);

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1
  },

  fileFilter: (req, file, cb) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      return cb(
        new Error('Only JPG, PNG and WebP images are allowed')
      );
    }

    cb(null, true);
  }
});

// =====================================================
// IMAGE FILE VALIDATION
// =====================================================

function isValidImage(buffer, mimeType) {
  const isJpeg =
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff;

  const isPng =
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([
        137, 80, 78, 71, 13, 10, 26, 10
      ])
    );

  const isWebp =
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP';

  return (
    (mimeType === 'image/jpeg' && isJpeg) ||
    (mimeType === 'image/png' && isPng) ||
    (mimeType === 'image/webp' && isWebp)
  );
}

// =====================================================
// CLOUDINARY IMAGE UPLOAD
// =====================================================

function uploadToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'shopsphere/products',
        resource_type: 'image'
      },

      (error, result) => {
        if (error) {
          return reject(error);
        }

        if (!result?.secure_url) {
          return reject(
            new Error('Cloudinary did not return an image URL')
          );
        }

        resolve(result.secure_url);
      }
    );

    stream.end(buffer);
  });
}

// =====================================================
// UPLOAD PRODUCT IMAGE
// POST /api/seller/upload
// =====================================================

r.post(
  '/upload',
  asyncRoute(async (req, res) => {
    const store = await own(req.user);

    if (!store) {
      return res.status(403).json({
        error: 'Create your store before uploading images'
      });
    }

    if (!store.approved) {
      return res.status(403).json({
        error: 'Store approval required'
      });
    }

    upload.single('image')(req, res, async err => {
      if (err) {
        return res.status(
          err instanceof multer.MulterError &&
          err.code === 'LIMIT_FILE_SIZE'
            ? 413
            : 400
        ).json({
          error:
            err.code === 'LIMIT_FILE_SIZE'
              ? 'Image must be smaller than 5 MB'
              : err.message
        });
      }

      if (!req.file) {
        return res.status(400).json({
          error: 'Please choose an image file'
        });
      }

      if (
        !isValidImage(
          req.file.buffer,
          req.file.mimetype
        )
      ) {
        return res.status(400).json({
          error: 'Invalid image file'
        });
      }

      if (
        !process.env.CLOUDINARY_CLOUD_NAME ||
        !process.env.CLOUDINARY_API_KEY ||
        !process.env.CLOUDINARY_API_SECRET
      ) {
        return res.status(503).json({
          error: 'Image storage is not configured'
        });
      }

      try {
        const imageUrl = await uploadToCloudinary(
          req.file.buffer
        );

        return res.status(201).json({
          message: 'Image uploaded successfully',
          image: imageUrl
        });

      } catch (error) {
        console.error(
          'Cloudinary upload failed:',
          error.message
        );

        return res.status(502).json({
          error: 'Unable to upload image'
        });
      }
    });
  })
);

// =====================================================
// STORE MANAGEMENT
// =====================================================

r.get(
  '/store',
  asyncRoute(async (req, res) => {
    res.json({
      store: await own(req.user)
    });
  })
);

// =====================================================
// CREATE STORE
// =====================================================

r.post(
  '/store',
  asyncRoute(async (req, res) => {
    if (await own(req.user)) {
      return res.status(409).json({
        error: 'You already have a store'
      });
    }

    const data = validate(
      z.object({

        name: z.string()
          .trim()
          .min(2, 'Store name must contain at least 2 characters')
          .max(100, 'Store name cannot exceed 100 characters'),

        description: z.string()
          .trim()
          .min(1, 'Store description is required')
          .max(1500, 'Store description cannot exceed 1500 characters'),

        contact: z.string()
          .trim()
          .min(1, 'Contact information is required')
          .max(100, 'Contact information cannot exceed 100 characters')

      }),
      req
    );

    const store = await Store.create({
      ...data,
      owner: req.user.id
    });

    res.status(201).json({
      store
    });
  })
);

// =====================================================
// UPDATE STORE
// =====================================================

r.patch(
  '/store',
  asyncRoute(async (req, res) => {
    const store = await own(req.user);

    if (!store) {
      return res.status(404).json({
        error: 'Create a store first'
      });
    }

    const data = validate(
      z.object({

        name: z.string()
          .trim()
          .min(2, 'Store name must contain at least 2 characters')
          .max(100, 'Store name cannot exceed 100 characters')
          .optional(),

        description: z.string()
          .trim()
          .min(1, 'Store description is required')
          .max(1500, 'Store description cannot exceed 1500 characters')
          .optional(),

        contact: z.string()
          .trim()
          .min(1, 'Contact information is required')
          .max(100, 'Contact information cannot exceed 100 characters')
          .optional()

      }),
      req
    );

    Object.assign(store, data);

    await store.save();

    res.json({
      store
    });
  })
);

// =====================================================
// PRODUCT MANAGEMENT
// =====================================================

r.get(
  '/products',
  asyncRoute(async (req, res) => {
    const store = await own(req.user);

    const products = store
      ? await Product.find({
          store: store.id
        })
          .populate('category', 'name')
          .sort({ createdAt: -1 })
      : [];

    res.json({
      products
    });
  })
);

// =====================================================
// PRODUCT IMAGE URL VALIDATION
// =====================================================

function isValidImageUrl(value) {
  try {
    const url = new URL(value);

    return (
      (url.protocol === 'https:' ||
        url.protocol === 'http:') &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    );

  } catch {
    return false;
  }
}

// =====================================================
// REQUIRED NUMBER VALIDATION
// =====================================================

function parseProductNumber(value) {
  if (typeof value === 'number') {
    return value;
  }

  if (
    typeof value === 'string' &&
    value.trim() !== ''
  ) {
    return Number(value);
  }

  return undefined;
}

// =====================================================
// PRODUCT SCHEMA
// =====================================================

const productSchema = z.object({

  name: z.string()
    .trim()
    .min(2, 'Product name must contain at least 2 characters')
    .max(150, 'Product name cannot exceed 150 characters'),

  description: z.string()
    .trim()
    .min(1, 'Product description is required')
    .max(3000, 'Product description cannot exceed 3000 characters'),

  price: z.preprocess(
    parseProductNumber,

    z.number()
      .finite('Enter a valid product price')
      .positive('Product price must be greater than zero')
  ),

  stock: z.preprocess(
    parseProductNumber,

    z.number()
      .finite('Enter a valid stock quantity')
      .int('Stock quantity must be a whole number')
      .min(0, 'Stock quantity cannot be negative')
  ),

  category: z.string()
    .trim()
    .min(1, 'Product category is required')
    .regex(
      /^[a-fA-F0-9]{24}$/,
      'Invalid product category'
    ),

  image: z.string()
    .trim()
    .min(1, 'Product image is required')
    .max(4096, 'Image URL is too long')
    .refine(
      isValidImageUrl,
      'Please provide a valid HTTP or HTTPS image URL'
    ),

  active: z.boolean().optional()

});

// =====================================================
// CREATE PRODUCT
// =====================================================

r.post(
  '/products',
  asyncRoute(async (req, res) => {
    const store = await own(req.user);

    if (!store?.approved) {
      return res.status(403).json({
        error: 'Store approval required'
      });
    }

    const data = validate(productSchema, req);

    const validCategory = await Category.exists({
      _id: data.category,
      active: true
    });

    if (!validCategory) {
      return res.status(400).json({
        error: 'Invalid or inactive product category'
      });
    }

    const product = await Product.create({
      ...data,
      store: store.id
    });

    res.status(201).json({
      product
    });
  })
);

// =====================================================
// UPDATE PRODUCT
// =====================================================

r.patch(
  '/products/:id',
  asyncRoute(async (req, res) => {
    const store = await own(req.user);

    if (!store) {
      return res.status(403).json({
        error: 'Create your store first'
      });
    }

    const data = validate(
      productSchema.partial(),
      req
    );

    if (
      data.category &&
      !(await Category.exists({
        _id: data.category,
        active: true
      }))
    ) {
      return res.status(400).json({
        error: 'Invalid or inactive product category'
      });
    }

    const product = await Product.findOneAndUpdate(
      {
        _id: req.params.id,
        store: store.id
      },
      data,
      {
        new: true,
        runValidators: true
      }
    );

    if (!product) {
      return res.status(404).json({
        error: 'Product not found'
      });
    }

    res.json({
      product
    });
  })
);

// =====================================================
// DEACTIVATE PRODUCT
// =====================================================

r.delete(
  '/products/:id',
  asyncRoute(async (req, res) => {
    const store = await own(req.user);

    const product = await Product.findOneAndUpdate(
      {
        _id: req.params.id,
        store: store?.id
      },
      {
        active: false
      },
      {
        new: true
      }
    );

    if (!product) {
      return res.status(404).json({
        error: 'Product not found'
      });
    }

    res.json({
      ok: true
    });
  })
);

// =====================================================
// SELLER ORDERS
// =====================================================

r.get(
  '/orders',
  asyncRoute(async (req, res) => {
    const store = await own(req.user);

    const orders = store
      ? await Order.find({
          seller: store.id
        }).sort({ createdAt: -1 })
      : [];

    res.json({
      orders
    });
  })
);

// =====================================================
// EMAIL HELPERS
// =====================================================

const formatPrice = amount =>
  Number(amount).toLocaleString('en-PK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });

const safeText = value =>
  String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);

// =====================================================
// PROFESSIONAL ORDER STATUS EMAIL TEMPLATE
// =====================================================

function createOrderStatusEmail(order, customer, status) {
  const orderId = order.id.slice(-8).toUpperCase();

  const statusDetails = {

    Processing: {
      title: 'Your Order Is Being Processed!',
      message:
        'Your seller has confirmed your order and is preparing it for shipment.',
      icon: '&#10003;',
      color: '#946200'
    },

    Shipped: {
      title: 'Your Order Has Been Shipped!',
      message:
        'Great news! Your order is on its way to your delivery address.',
      icon: '&#128666;',
      color: '#245a81'
    },

    Delivered: {
      title: 'Your Order Has Been Delivered!',
      message:
        'Your order has been successfully delivered. Thank you for shopping with ShopSphere!',
      icon: '&#10003;',
      color: '#237a45'
    }

  };

  const details = statusDetails[status];

  const trackingUrl = new URL(
    '/orders',
    process.env.CLIENT_URL ||
    'https://shopsphere-frontend-gamma.vercel.app'
  ).href;

  const productRows = order.items.map(item => `
    <tr>

      <td style="padding:14px 12px;border-bottom:1px solid #e9e3dc;">
        ${safeText(item.name)}
      </td>

      <td style="padding:14px 12px;text-align:center;border-bottom:1px solid #e9e3dc;">
        ${item.quantity}
      </td>

      <td style="padding:14px 12px;text-align:right;border-bottom:1px solid #e9e3dc;">
        PKR ${formatPrice(item.price * item.quantity)}
      </td>

    </tr>
  `).join('');

  return `

    <div style="margin:0;padding:32px 12px;background:#f6f4f0;font-family:Arial,Helvetica,sans-serif;color:#252525;">

      <div style="max-width:620px;margin:auto;background:#ffffff;border:1px solid #e7e1d8;border-radius:12px;overflow:hidden;">

        <!-- SHOPSPHERE HEADER -->

        <div style="background:#172b43;padding:28px;text-align:center;">

          <h1 style="color:#ffffff;margin:0;font-size:30px;letter-spacing:1px;">
            ShopSphere
          </h1>

          <p style="color:#d7e0e8;margin:8px 0 0;font-size:13px;">
            Your marketplace. Your style.
          </p>

        </div>

        <!-- EMAIL BODY -->

        <div style="padding:32px 28px;">

          <!-- STATUS MESSAGE -->

          <div style="text-align:center;margin-bottom:28px;">

            <div style="font-size:42px;color:${details.color};margin-bottom:12px;">
              ${details.icon}
            </div>

            <h2 style="font-size:26px;color:#172b43;margin:0 0 12px;">
              ${details.title}
            </h2>

            <p style="color:#666;line-height:1.7;">
              Dear ${safeText(customer.name || order.delivery?.name || 'Customer')},
            </p>

            <p style="color:#666;line-height:1.7;">
              ${details.message}
            </p>

          </div>

          <!-- ORDER INFORMATION -->

          <div style="background:#f6f4f0;padding:20px;border-radius:8px;margin-bottom:24px;">

            <p style="margin:0 0 8px;font-size:13px;color:#777;">
              ORDER NUMBER
            </p>

            <h3 style="margin:0;color:#172b43;font-size:22px;">
              #${orderId}
            </h3>

            <p style="margin:12px 0 0;font-size:14px;">

              <strong>Status:</strong>

              <span style="color:${details.color};font-weight:bold;">
                ${safeText(status)}
              </span>

            </p>

            <p style="margin:8px 0 0;font-size:14px;">
              <strong>Payment:</strong> Cash on Delivery
            </p>

          </div>

          <!-- PRODUCT SUMMARY -->

          <h3 style="color:#172b43;margin-bottom:12px;">
            Order Summary
          </h3>

          <table style="width:100%;border-collapse:collapse;font-size:14px;">

            <thead>

              <tr style="background:#f6f4f0;">

                <th style="padding:12px;text-align:left;">
                  Product
                </th>

                <th style="padding:12px;text-align:center;">
                  Qty
                </th>

                <th style="padding:12px;text-align:right;">
                  Amount
                </th>

              </tr>

            </thead>

            <tbody>
              ${productRows}
            </tbody>

          </table>

          <!-- TOTAL AMOUNT -->

          <div style="text-align:right;padding:22px 0;border-bottom:1px solid #e9e3dc;">

            <span style="font-size:15px;color:#555;">
              Total Amount:
            </span>

            <strong style="font-size:22px;color:#172b43;margin-left:12px;">
              PKR ${formatPrice(order.total)}
            </strong>

          </div>

          <!-- DELIVERY INFORMATION -->

          <div style="margin-top:24px;">

            <h3 style="color:#172b43;margin-bottom:14px;">
              Delivery Information
            </h3>

            <p style="margin:8px 0;line-height:1.6;">
              <strong>Name:</strong>
              ${safeText(order.delivery?.name)}
            </p>

            <p style="margin:8px 0;line-height:1.6;">
              <strong>Phone:</strong>
              ${safeText(order.delivery?.phone)}
            </p>

            <p style="margin:8px 0;line-height:1.6;">
              <strong>Address:</strong>
              ${safeText(order.delivery?.address)}
            </p>

          </div>

          <!-- ORDER TRACKING BUTTON -->

          <div style="text-align:center;margin-top:30px;">

            <a
              href="${safeText(trackingUrl)}"
              style="display:inline-block;background:#172b43;color:#ffffff;padding:14px 28px;text-decoration:none;border-radius:6px;font-weight:bold;"
            >

              ${status === 'Delivered'
                ? 'View Your Order'
                : 'Track Your Order'}

            </a>

          </div>

          <!-- THANK YOU MESSAGE -->

          <div style="background:#f6f4f0;padding:18px;border-radius:8px;margin-top:26px;">

            <p style="margin:0;font-size:14px;line-height:1.7;color:#555;">

              ${status === 'Delivered'
                ? 'We hope you enjoy your purchase. You can visit your ShopSphere account to view your order and leave a product review.'
                : 'You can track the latest order status anytime from your ShopSphere account.'}

            </p>

          </div>

          <p style="text-align:center;color:#777;font-size:13px;margin-top:30px;">
            Thank you for choosing ShopSphere!
          </p>

        </div>

        <!-- EMAIL FOOTER -->

        <div style="background:#172b43;text-align:center;padding:20px;">

          <p style="color:#ffffff;font-size:13px;margin:0;">
            © 2026 ShopSphere. All rights reserved.
          </p>

        </div>

      </div>

    </div>

  `;
}

// =====================================================
// UPDATE ORDER STATUS + SEND PROFESSIONAL EMAIL
// =====================================================

r.patch(
  '/orders/:id/status',
  asyncRoute(async (req, res) => {
    const store = await own(req.user);

    if (!store) {
      return res.status(403).json({
        error: 'Create your store first'
      });
    }

    const { status } = validate(
      z.object({

        status: z.enum([
          'Processing',
          'Shipped',
          'Delivered'
        ])

      }),
      req
    );

    const order = await Order.findOne({
      _id: req.params.id,
      seller: store.id
    });

    if (!order) {
      return res.status(404).json({
        error: 'Order not found'
      });
    }

    // =================================================
    // VALID ORDER STATUS TRANSITIONS
    // =================================================

    const next = {
      Pending: 'Processing',
      Processing: 'Shipped',
      Shipped: 'Delivered'
    };

    if (next[order.status] !== status) {
      return res.status(400).json({
        error: 'Invalid order status transition'
      });
    }

    // =================================================
    // UPDATE ORDER STATUS
    // =================================================

    const updatedOrder = await Order.findOneAndUpdate(
      {
        _id: order.id,
        seller: store.id,
        status: order.status
      },
      {
        $set: {
          status
        }
      },
      {
        new: true,
        runValidators: true
      }
    );

    if (!updatedOrder) {
      return res.status(409).json({
        error: 'Order status has already changed'
      });
    }

    // =================================================
    // CUSTOMER DATABASE NOTIFICATION
    // =================================================

    try {
      await notify(
        updatedOrder.customer,
        `Your order #${updatedOrder.id.slice(-8).toUpperCase()} is now ${status}`,
        '/orders'
      );

    } catch (error) {
      console.error(
        'Order status notification failed:',
        error
      );
    }

    // =================================================
    // CUSTOMER ORDER STATUS EMAIL
    // =================================================

    let emailSent = false;

    try {
      const customer = await User.findById(
        updatedOrder.customer
      ).select('name email');

      if (customer?.email) {

        const orderId =
          updatedOrder.id.slice(-8).toUpperCase();

        const subject =
          `ShopSphere | Order ${status} #${orderId}`;

        const htmlMessage =
          createOrderStatusEmail(
            updatedOrder,
            customer,
            status
          );

        // Wait for email sending before returning response

        emailSent = await mail(
          customer.email,
          subject,
          htmlMessage
        );

        if (!emailSent) {
          console.error(
            'Order status email skipped: SMTP not configured'
          );
        }

      } else {
        console.error(
          'Customer email address not found'
        );
      }

    } catch (error) {
      console.error(
        'Order status email failed:',
        error
      );
    }

    // =================================================
    // ORDER STATUS SUCCESS RESPONSE
    // =================================================

    res.json({
      order: updatedOrder,
      emailSent,
      message: `Order status updated to ${status}`
    });
  })
);

// =====================================================
// SELLER STATISTICS
// =====================================================

r.get(
  '/stats',
  asyncRoute(async (req, res) => {
    const store = await own(req.user);

    const orders = store
      ? await Order.find({
          seller: store.id
        })
      : [];

    const sales = orders
      .filter(o => o.status === 'Delivered')
      .reduce((a, o) => a + o.total, 0);

    const products = store
      ? await Product.countDocuments({
          store: store.id
        })
      : 0;

    res.json({
      orders: orders.length,
      sales,
      products
    });
  })
);

// =====================================================
// EXPORT SELLER ROUTER
// =====================================================

export default r;