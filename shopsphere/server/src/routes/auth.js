
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { OAuth2Client } from 'google-auth-library';

import { User, ResetToken } from '../models.js';

import {
  asyncRoute,
  auth,
  token,
  setCookie,
  mail,
  validate
} from '../lib.js';

const r = Router();

const googleClient = new OAuth2Client();

const publicUser = u => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  phone: u.phone,
  address: u.address,
  active: u.active
});

// =====================================================
// REGISTER WITH EMAIL AND PASSWORD
// =====================================================

r.post('/register', asyncRoute(async (req, res) => {
  const data = validate(
    z.object({
      name: z.string().trim().min(2).max(100),
      email: z.string().email(),
      password: z.string().min(8),
      role: z.enum(['customer', 'seller']).default('customer')
    }),
    req
  );

  const email = data.email.trim().toLowerCase();

  if (await User.exists({ email })) {
    return res.status(409).json({
      error: 'Email already registered'
    });
  }

  const user = await User.create({
    ...data,
    email,
    password: await bcrypt.hash(data.password, 12)
  });

  setCookie(res, token(user));

  mail(
    user.email,
    'Welcome to ShopSphere',
    `Welcome ${user.name}!`
  ).catch(console.error);

  res.status(201).json({
    user: publicUser(user)
  });
}));

// =====================================================
// LOGIN WITH EMAIL AND PASSWORD
// =====================================================

r.post('/login', asyncRoute(async (req, res) => {
  const { email, password } = validate(
    z.object({
      email: z.string().email(),
      password: z.string().min(1)
    }),
    req
  );

  const user = await User.findOne({
    email: email.trim().toLowerCase()
  }).select('+password');

  if (
    !user ||
    !user.active ||
    !user.password ||
    !await bcrypt.compare(password, user.password)
  ) {
    return res.status(401).json({
      error: 'Invalid email or password'
    });
  }

  setCookie(res, token(user));

  res.json({
    user: publicUser(user)
  });
}));

// =====================================================
// GOOGLE LOGIN / SIGNUP
// =====================================================

r.post('/google', asyncRoute(async (req, res) => {
  const { credential } = validate(
    z.object({
      credential: z.string().min(20)
    }),
    req
  );

  const clientId = process.env.GOOGLE_CLIENT_ID;

  if (!clientId) {
    return res.status(503).json({
      error: 'Google login is not configured'
    });
  }

  let payload;

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: clientId
    });

    payload = ticket.getPayload();
  } catch {
    return res.status(401).json({
      error: 'Invalid Google authentication token'
    });
  }

  if (
    !payload ||
    !payload.sub ||
    !payload.email ||
    payload.email_verified !== true
  ) {
    return res.status(401).json({
      error: 'Google email verification required'
    });
  }

  const email = payload.email.trim().toLowerCase();
  const name = (payload.name || email.split('@')[0])
    .trim()
    .slice(0, 100);

  // Existing email accounts are not automatically linked
  // to Google. This prevents account takeover.
  let user = await User.findOne({ email });

  if (user) {
    if (!user.active) {
      return res.status(403).json({
        error: 'Account unavailable'
      });
    }

    if (!user.googleId || user.googleId !== payload.sub) {
      return res.status(409).json({
        error: 'An account already uses this email. Sign in with your existing method first.'
      });
    }
  } else {
    try {
      user = await User.create({
        name: name.length >= 2 ? name : 'Google User',
        email,
        googleId: payload.sub,
        role: 'customer',
        password: await bcrypt.hash(
          crypto.randomBytes(48).toString('hex'),
          12
        )
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({
          error: 'Account already exists. Please sign in normally.'
        });
      }

      throw error;
    }

    mail(
      user.email,
      'Welcome to ShopSphere',
      `Welcome ${user.name}! Your Google account is ready.`
    ).catch(console.error);
  }

  setCookie(res, token(user));

  res.json({
    user: publicUser(user),
    message: 'Google login successful'
  });
}));

// =====================================================
// LOGOUT
// =====================================================

r.post('/logout', (req, res) => {
  res.clearCookie('shopsphere_session', {
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  });

  res.json({ ok: true });
});

// =====================================================
// CURRENT USER
// =====================================================

r.get('/me', auth, (req, res) => {
  res.json({
    user: publicUser(req.user)
  });
});

// =====================================================
// UPDATE PROFILE
// =====================================================

r.patch('/me', auth, asyncRoute(async (req, res) => {
  const data = validate(
    z.object({
      name: z.string().min(2).max(100).optional(),
      phone: z.string().max(30).optional(),
      address: z.string().max(500).optional()
    }),
    req
  );

  Object.assign(req.user, data);

  await req.user.save();

  res.json({
    user: publicUser(req.user)
  });
}));

// =====================================================
// FORGOT PASSWORD
// =====================================================

r.post('/forgot-password', asyncRoute(async (req, res) => {
  const { email } = validate(
    z.object({
      email: z.string().email()
    }),
    req
  );

  const user = await User.findOne({
    email: email.trim().toLowerCase()
  });

  if (user) {
    const raw = crypto.randomBytes(32).toString('hex');

    await ResetToken.deleteMany({
      user: user.id
    });

    await ResetToken.create({
      user: user.id,
      hash: crypto
        .createHash('sha256')
        .update(raw)
        .digest('hex'),
      expires: new Date(Date.now() + 30 * 60000)
    });

    await mail(
      user.email,
      'Reset your ShopSphere password',
      `Open ${process.env.CLIENT_URL}/reset-password?token=${raw} to reset your password. This link expires in 30 minutes.`
    ).catch(console.error);
  }

  res.json({
    message: 'If the account exists, a reset email will be sent.'
  });
}));

// =====================================================
// RESET PASSWORD
// =====================================================

r.post('/reset-password', asyncRoute(async (req, res) => {
  const { token: raw, password } = validate(
    z.object({
      token: z.string().min(10),
      password: z.string().min(8)
    }),
    req
  );

  const record = await ResetToken.findOne({
    hash: crypto
      .createHash('sha256')
      .update(raw)
      .digest('hex'),
    expires: {
      $gt: new Date()
    }
  });

  if (!record) {
    return res.status(400).json({
      error: 'Invalid or expired reset link'
    });
  }

  await User.findByIdAndUpdate(
    record.user,
    {
      password: await bcrypt.hash(password, 12)
    }
  );

  await ResetToken.deleteMany({
    user: record.user
  });

  res.json({
    message: 'Password updated. Please sign in.'
  });
}));

export default r;
