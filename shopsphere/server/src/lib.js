
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';

import {
  User,
  Notification
} from './models.js';

// =====================================================
// ASYNC ROUTE HANDLER
// =====================================================

export const asyncRoute = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// =====================================================
// JWT AUTHENTICATION
// =====================================================

export function token(user) {
  return jwt.sign(
    { id: user.id },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// =====================================================
// SECURE SESSION COOKIE
// =====================================================

export function setCookie(res, value) {
  res.cookie('shopsphere_session', value, {
    httpOnly: true,
   sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
   secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 86400000,
    path: '/'
  });
}

// =====================================================
// AUTHENTICATION MIDDLEWARE
// =====================================================

export const auth = asyncRoute(async (req, res, next) => {
  const t = req.cookies.shopsphere_session;

  if (!t) {
    return res.status(401).json({
      error: 'Please sign in'
    });
  }

  let payload;

  try {
    payload = jwt.verify(
      t,
      process.env.JWT_SECRET
    );
  } catch {
    return res.status(401).json({
      error: 'Session expired'
    });
  }

  const user = await User.findById(payload.id);

  if (!user || !user.active) {
    return res.status(401).json({
      error: 'Account unavailable'
    });
  }

  req.user = user;
  next();
});

// =====================================================
// ROLE AUTHORIZATION
// =====================================================

export const allow = (...roles) => (req, res, next) =>
  roles.includes(req.user?.role)
    ? next()
    : res.status(403).json({
        error: 'Access denied'
      });

// =====================================================
// DATABASE NOTIFICATIONS
// =====================================================

export async function notify(user, message, link = '') {
  if (user) {
    await Notification.create({
      user,
      message,
      link
    });
  }
}

// =====================================================
// EMAIL CONFIGURATION
// =====================================================

let emailTransport = null;

function getEmailTransport() {
  if (!process.env.SMTP_HOST) {
    return null;
  }

  if (!emailTransport) {
    const port = Number(
      process.env.SMTP_PORT || 587
    );

    emailTransport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,

      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }

  return emailTransport;
}

// =====================================================
// SEND PLAIN TEXT OR HTML EMAIL
// =====================================================

export async function mail(to, subject, content) {
  const transport = getEmailTransport();

  if (!transport) {
    console.log(
      '[Email not configured]',
      to,
      subject
    );

    return false;
  }

  if (!to || !subject || !content) {
    throw new Error(
      'Email recipient, subject and content are required'
    );
  }

  const isHtml =
    typeof content === 'string' &&
    /<\s*(?:html|div|table|p|h[1-6])(?:\s|>)/i.test(content);

  const message = {
    from:
      process.env.MAIL_FROM ||
      process.env.SMTP_USER,

    to,
    subject
  };

  if (isHtml) {
    message.html = content;

    // Plain-text fallback for email clients
    message.text = content
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();
  } else {
    message.text = content;
  }

  const result = await transport.sendMail(message);

  console.log(
    '[ShopSphere Email Sent]',
    subject,
    result.messageId
  );

  return true;
}

// =====================================================
// REQUEST VALIDATION
// =====================================================

export function validate(schema, req) {
  const result = schema.safeParse(req.body);

  if (!result.success) {
    const err = new Error(
      result.error.issues
        .map(
          i => `${i.path.join('.')}: ${i.message}`
        )
        .join('; ')
    );

    err.status = 400;

    throw err;
  }

  return result.data;
}
