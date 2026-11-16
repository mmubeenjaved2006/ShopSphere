
import 'dotenv/config';

import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import authRoutes from './routes/auth.js';
import catalogRoutes from './routes/catalog.js';
import sellerRoutes from './routes/seller.js';
import orderRoutes from './routes/orders.js';
import adminRoutes from './routes/admin.js';
import miscRoutes from './routes/misc.js';

// =====================================================
// ENVIRONMENT VALIDATION
// =====================================================

if (
  !process.env.JWT_SECRET ||
  process.env.JWT_SECRET.length < 32 ||
  !process.env.MONGO_URI
) {
  console.error(
    'Set MONGO_URI and a 32+ character JWT_SECRET in server/.env'
  );
  process.exit(1);
}

// =====================================================
// EXPRESS APPLICATION
// =====================================================

const app = express();

const PORT = process.env.PORT || 5000;
const CLIENT_URL =
  process.env.CLIENT_URL || 'http://localhost:5173';

// =====================================================
// SECURITY MIDDLEWARE
// =====================================================

app.use(helmet());

app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true
  })
);

app.use(cookieParser());

app.use(
  express.json({
    limit: '3mb'
  })
);

// =====================================================
// STATIC PRODUCT IMAGE FILES
// =====================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// server/uploads/products
const uploadsDirectory = path.resolve(
  __dirname,
  '../uploads'
);

// Create uploads folder if missing
fs.mkdirSync(
  path.join(uploadsDirectory, 'products'),
  { recursive: true }
);

// Allow browser to display uploaded images
app.use(
  '/uploads',
  express.static(uploadsDirectory, {
    index: false,
    dotfiles: 'deny',
    fallthrough: false,
    setHeaders: (res) => {
      res.setHeader(
        'X-Content-Type-Options',
        'nosniff'
      );

      res.setHeader(
        'Cache-Control',
        'public, max-age=86400'
      );
    }
  })
);

// =====================================================
// AUTHENTICATION ROUTES
// =====================================================

app.use(
  '/api/auth',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 80,
    standardHeaders: 'draft-7',
    legacyHeaders: false
  }),
  authRoutes
);

// =====================================================
// MARKETPLACE ROUTES
// =====================================================

app.use('/api', catalogRoutes);

app.use('/api/seller', sellerRoutes);

app.use('/api/orders', orderRoutes);

app.use('/api/admin', adminRoutes);

app.use('/api/account', miscRoutes);

// =====================================================
// HEALTH CHECK
// =====================================================

app.get('/api/health', (req, res) => {
  res.json({
    ok: true
  });
});

// =====================================================
// ERROR HANDLER
// =====================================================

app.use((err, req, res, next) => {
  console.error(err);

  const status =
    err.status ||
    (
      err.name === 'ValidationError' ||
      err.name === 'CastError'
        ? 400
        : 500
    );

  let message = 'Something went wrong';

  if (err.code === 11000) {
    message = 'Already exists';
  } else if (err.status) {
    message = err.message;
  } else if (err.name === 'CastError') {
    message = 'Invalid identifier';
  } else if (err.name === 'ValidationError') {
    message = err.message;
  }

  res.status(status).json({
    error: message
  });
});

// =====================================================
// MONGODB CONNECTION AND SERVER START
// =====================================================

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    app.listen(PORT, () => {
      console.log(
        `ShopSphere API running on http://localhost:${PORT}`
      );
      console.log(
        `Product images available at http://localhost:${PORT}/uploads/products/`
      );
    });
  })
  .catch(e => {
    console.error(
      'MongoDB connection failed',
      e.message
    );
    process.exit(1);
  });
