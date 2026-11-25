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
      email: z.string().trim().toLowerCase().email(),
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
      email: z.string().trim().toLowerCase().email(),
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
// GOOGLE LOGIN / SIGNUP — CUSTOMER AND SELLER
// =====================================================

r.post('/google', asyncRoute(async (req, res) => {
  const { credential, role } = validate(
    z.object({
      credential: z.string().min(20),
      role: z.enum(['customer', 'seller']).default('customer')
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

  let user = await User.findOne({ email });

  // Existing Google account login

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

    // Existing account role remains unchanged.

  } else {

    // Create a new customer or seller account.

    try {
      user = await User.create({
        name: name.length >= 2 ? name : 'Google User',
        email,
        googleId: payload.sub,
        role: role,
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
    sameSite: process.env.NODE_ENV === 'production'
      ? 'none'
      : 'lax',
    secure: process.env.NODE_ENV === 'production'
  });

  res.json({
    ok: true
  });
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
// FORGOT PASSWORD — UPDATED
// =====================================================

r.post('/forgot-password', asyncRoute(async (req, res) => {
  const { email } = validate(
    z.object({
      email: z.string().trim().toLowerCase().email()
    }),
    req
  );

  const user = await User.findOne({
    email,
    active: true
  });

  if (user) {
    const raw = crypto.randomBytes(32).toString('hex');

    const hash = crypto
      .createHash('sha256')
      .update(raw)
      .digest('hex');

    const clientUrl = process.env.CLIENT_URL;

    if (!clientUrl) {
      throw new Error('CLIENT_URL is not configured');
    }

    const resetUrl = new URL(
      '/reset-password',
      clientUrl
    );

    resetUrl.searchParams.set('token', raw);

    const resetLink = resetUrl.toString()
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Remove previous reset tokens.

    await ResetToken.deleteMany({
      user: user.id
    });

    // Create a new token valid for 15 minutes.

    await ResetToken.create({
      user: user.id,
      hash,
      expires: new Date(Date.now() + 15 * 60000)
    });

    // Professional password reset email.

    const emailContent = `
      <div style="
        background-color: #fbfaf6;
        padding: 30px 15px;
        font-family: Arial, sans-serif;
        color: #242a25;
      ">

        <div style="
          max-width: 550px;
          margin: auto;
          background-color: #ffffff;
          border: 1px solid #e4e5df;
          border-radius: 12px;
          overflow: hidden;
        ">

          <div style="
            background-color: #173e32;
            padding: 25px;
            text-align: center;
          ">
            <h1 style="
              color: #ffffff;
              margin: 0;
              font-size: 30px;
            ">
              ShopSphere.
            </h1>
          </div>

          <div style="padding: 30px;">

            <h2 style="color: #173e32;">
              Reset Your Password
            </h2>

            <p>Hello,</p>

            <p style="line-height: 1.7;">
              We received a request to reset the
              password for your ShopSphere account.
            </p>

            <p style="line-height: 1.7;">
              Click the button below to create
              a new password.
            </p>

            <div style="
              text-align: center;
              margin: 30px 0;
            ">
              <a href="${resetLink}" style="
                display: inline-block;
                background-color: #173e32;
                color: #ffffff;
                padding: 15px 30px;
                text-decoration: none;
                border-radius: 6px;
                font-weight: bold;
              ">
                Reset Password
              </a>
            </div>

            <p style="
              color: #a65d42;
              font-weight: bold;
            ">
              This link expires in 15 minutes.
            </p>

            <p style="line-height: 1.7;">
              For your security, this link can
              only be used once.
            </p>

            <p style="line-height: 1.7;">
              If you did not request a password
              reset, you can safely ignore this email.
            </p>

            <p style="font-size: 13px;">
              If the button does not work,
              copy and paste this link into your browser:
            </p>

            <p style="
              font-size: 12px;
              word-break: break-all;
              color: #173e32;
            ">
              ${resetLink}
            </p>

            <p>
              Best regards,<br>
              <strong>The ShopSphere Team</strong>
            </p>

          </div>

          <div style="
            background-color: #f7f7f2;
            padding: 18px;
            text-align: center;
            font-size: 12px;
            color: #777777;
          ">
            © 2026 ShopSphere. All rights reserved.
          </div>

        </div>

      </div>
    `;

    try {
      const sent = await mail(
        user.email,
        'Reset Your ShopSphere Password',
        emailContent
      );

      if (!sent) {
        throw new Error('Email service is not configured');
      }

    } catch (error) {
      await ResetToken.deleteOne({
        user: user.id,
        hash
      });

      console.error(
        'Password reset email failed:',
        error.message
      );
    }
  }

  // Generic response prevents account enumeration.

  res.json({
    message: 'If your account exists, a password reset link will be sent to your email.'
  });
}));

// =====================================================
// RESET PASSWORD — UPDATED
// =====================================================

r.post('/reset-password', asyncRoute(async (req, res) => {
  const { token: raw, password } = validate(
    z.object({
      token: z.string().regex(
        /^[a-f0-9]{64}$/,
        'Invalid reset token'
      ),

      password: z.string()
        .min(8, 'Password must contain at least 8 characters')
        .refine(
          value => Buffer.byteLength(value, 'utf8') <= 72,
          'Password is too long'
        ),

      confirmPassword: z.string().min(8)
    }).refine(
      data => data.password === data.confirmPassword,
      {
        message: 'Passwords do not match',
        path: ['confirmPassword']
      }
    ),
    req
  );

  const hash = crypto
    .createHash('sha256')
    .update(raw)
    .digest('hex');

  const hashedPassword = await bcrypt.hash(
    password,
    12
  );

  // Atomically consume the token.
  // Prevents the same token from being used twice.

  const record = await ResetToken.findOneAndDelete({
    hash,
    expires: {
      $gt: new Date()
    }
  });

  if (!record) {
    return res.status(400).json({
      error: 'Invalid, expired or already used reset link'
    });
  }

  // Update the account password.

  const user = await User.findOneAndUpdate(
    {
      _id: record.user,
      active: true
    },
    {
      $set: {
        password: hashedPassword
      }
    },
    {
      new: true
    }
  );

  if (!user) {
    return res.status(400).json({
      error: 'Account unavailable'
    });
  }

  // Remove any remaining reset tokens.

  await ResetToken.deleteMany({
    user: user.id
  });

  // Password changed confirmation email.

  const confirmationEmail = `
    <div style="
      background-color: #fbfaf6;
      padding: 30px 15px;
      font-family: Arial, sans-serif;
      color: #242a25;
    ">

      <div style="
        max-width: 550px;
        margin: auto;
        background-color: #ffffff;
        border: 1px solid #e4e5df;
        border-radius: 12px;
        overflow: hidden;
      ">

        <div style="
          background-color: #173e32;
          padding: 25px;
          text-align: center;
        ">
          <h1 style="
            color: #ffffff;
            margin: 0;
          ">
            ShopSphere.
          </h1>
        </div>

        <div style="padding: 30px;">

          <h2 style="color: #173e32;">
            Password Successfully Changed
          </h2>

          <p>Hello,</p>

          <p style="line-height: 1.7;">
            Your ShopSphere account password
            has been successfully updated.
          </p>

          <p style="line-height: 1.7;">
            You can now sign in using your
            new password.
          </p>

          <p style="
            color: #a65d42;
            line-height: 1.7;
          ">
            If you did not make this change,
            reset your password immediately
            and contact support.
          </p>

          <p>
            Best regards,<br>
            <strong>The ShopSphere Team</strong>
          </p>

        </div>

        <div style="
          background-color: #f7f7f2;
          padding: 18px;
          text-align: center;
          font-size: 12px;
          color: #777777;
        ">
          © 2026 ShopSphere. All rights reserved.
        </div>

      </div>

    </div>
  `;

  try {
    await mail(
      user.email,
      'Your ShopSphere Password Has Been Changed',
      confirmationEmail
    );

  } catch (error) {
    console.error(
      'Password confirmation email failed:',
      error.message
    );
  }

  res.json({
    message: 'Password updated successfully. Please sign in with your new password.'
  });
}));

export default r;