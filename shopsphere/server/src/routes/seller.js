
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
        name: z.string().min(2).max(100),
        description: z.string().max(1500).default(''),
        contact: z.string().max(100).default('')
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
        name: z.string().min(2).max(100).optional(),
        description: z.string().max(1500).optional(),
        contact: z.string().max(100).optional()
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

const productSchema = z.object({
  name: z.string().min(2).max(150),

  description: z.string().max(3000).default(''),

  price: z.coerce.number().min(0),

  stock: z.coerce.number().int().min(0),

  category: z.string().min(1),

  image: z.string().max(2000000).default(''),

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
        error: 'Invalid category'
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
        error: 'Invalid category'
      });
    }

    const product = await Product.findOneAndUpdate(
      {
        _id: req.params.id,
        store: store?.id
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
// UPDATE ORDER STATUS
// =====================================================

r.patch(
  '/orders/:id/status',
  asyncRoute(async (req, res) => {
    const store = await own(req.user);

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
      seller: store?.id
    });

    if (!order) {
      return res.status(404).json({
        error: 'Order not found'
      });
    }

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

    order.status = status;

    await order.save();

    await notify(
      order.customer,
      `Your order #${order.id.slice(-6)} is now ${status}`,
      '/orders'
    );

    const customer = await User.findById(
      order.customer
    );

    if (customer) {
      mail(
        customer.email,
        'ShopSphere order update',
        `Your order #${order.id.slice(-6)} is now ${status}`
      ).catch(console.error);
    }

    res.json({
      order
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

export default r;
