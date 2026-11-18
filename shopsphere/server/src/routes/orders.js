
import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';

import {
  Product,
  Order,
  Store,
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

const r = Router();

r.use(auth, allow('customer'));

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
// CUSTOMER ORDER CONFIRMATION EMAIL
// =====================================================

function createOrderConfirmationEmail(order) {
  const orderId = order.id.slice(-8).toUpperCase();

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

        <div style="background:#172b43;padding:28px;text-align:center;">
          <h1 style="color:#ffffff;margin:0;font-size:30px;letter-spacing:1px;">
            ShopSphere
          </h1>
          <p style="color:#d7e0e8;margin:8px 0 0;font-size:13px;">
            Your marketplace. Your style.
          </p>
        </div>

        <div style="padding:32px 28px;">

          <div style="text-align:center;margin-bottom:28px;">
            <div style="font-size:42px;margin-bottom:12px;">&#10003;</div>

            <h2 style="font-size:27px;color:#172b43;margin:0 0 12px;">
              Order Confirmed!
            </h2>

            <p style="color:#666;line-height:1.7;margin:0;">
              Thank you for shopping with ShopSphere.
              Your order has been placed successfully.
            </p>
          </div>

          <div style="background:#f6f4f0;padding:20px;border-radius:8px;margin-bottom:24px;">
            <p style="margin:0 0 8px;font-size:13px;color:#777;">
              ORDER NUMBER
            </p>

            <h3 style="margin:0;color:#172b43;font-size:22px;">
              #${orderId}
            </h3>

            <p style="margin:12px 0 0;font-size:14px;">
              <strong>Status:</strong> Pending
            </p>

            <p style="margin:8px 0 0;font-size:14px;">
              <strong>Payment:</strong> Cash on Delivery
            </p>
          </div>

          <h3 style="color:#172b43;margin-bottom:12px;">
            Order Summary
          </h3>

          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <thead>
              <tr style="background:#f6f4f0;">
                <th style="padding:12px;text-align:left;">Product</th>
                <th style="padding:12px;text-align:center;">Qty</th>
                <th style="padding:12px;text-align:right;">Amount</th>
              </tr>
            </thead>

            <tbody>
              ${productRows}
            </tbody>
          </table>

          <div style="text-align:right;padding:22px 0;border-bottom:1px solid #e9e3dc;">
            <span style="font-size:15px;color:#555;">
              Total Amount:
            </span>

            <strong style="font-size:22px;color:#172b43;margin-left:12px;">
              PKR ${formatPrice(order.total)}
            </strong>
          </div>

          <div style="margin-top:24px;">
            <h3 style="color:#172b43;margin-bottom:14px;">
              Delivery Information
            </h3>

            <p style="margin:8px 0;line-height:1.6;">
              <strong>Name:</strong> ${safeText(order.delivery.name)}
            </p>

            <p style="margin:8px 0;line-height:1.6;">
              <strong>Phone:</strong> ${safeText(order.delivery.phone)}
            </p>

            <p style="margin:8px 0;line-height:1.6;">
              <strong>Address:</strong> ${safeText(order.delivery.address)}
            </p>
          </div>

          <div style="background:#f6f4f0;padding:18px;border-radius:8px;margin-top:26px;">
            <p style="margin:0;font-size:14px;line-height:1.7;color:#555;">
              Your seller will process your order soon.
              You can track the latest order status in your
              ShopSphere account.
            </p>
          </div>

          <p style="text-align:center;color:#777;font-size:13px;margin-top:30px;">
            Thank you for choosing ShopSphere!
          </p>

        </div>

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
// GET CUSTOMER ORDERS
// =====================================================

r.get(
  '/',
  asyncRoute(async (req, res) => {
    const orders = await Order.find({
      customer: req.user.id
    })
      .populate('seller', 'name')
      .sort({ createdAt: -1 });

    res.json({ orders });
  })
);

// =====================================================
// PLACE ORDER + SEND CONFIRMATION EMAIL
// =====================================================

r.post(
  '/',
  asyncRoute(async (req, res) => {
    const data = validate(
      z.object({
        items: z.array(
          z.object({
            product: z.string(),
            quantity: z.number().int().min(1).max(100)
          })
        ).min(1).max(50),

        delivery: z.object({
          name: z.string().min(2),
          phone: z.string().min(7),
          address: z.string().min(8)
        })
      }),
      req
    );

    if (
      new Set(data.items.map(i => i.product)).size !==
      data.items.length
    ) {
      return res.status(400).json({
        error: 'Duplicate products in cart'
      });
    }

    const session = await mongoose.startSession();

    let order;

    try {
      await session.withTransaction(async () => {
        const products = await Product.find({
          _id: {
            $in: data.items.map(i => i.product)
          },
          active: true
        }).session(session);

        if (products.length !== data.items.length) {
          throw Object.assign(
            new Error('One or more products unavailable'),
            { status: 400 }
          );
        }

        const store = await Store.findById(
          products[0].store
        ).session(session);

        if (
          !store?.approved ||
          products.some(
            p => String(p.store) !== String(store.id)
          )
        ) {
          throw Object.assign(
            new Error(
              'Checkout must contain items from one approved seller'
            ),
            { status: 400 }
          );
        }

        const lines = [];

        for (const item of data.items) {
          const product = products.find(
            p => String(p.id) === item.product
          );

          const result = await Product.updateOne(
            {
              _id: product.id,
              stock: {
                $gte: item.quantity
              }
            },
            {
              $inc: {
                stock: -item.quantity
              }
            },
            { session }
          );

          if (result.modifiedCount !== 1) {
            throw Object.assign(
              new Error(
                `Insufficient stock: ${product.name}`
              ),
              { status: 409 }
            );
          }

          lines.push({
            product: product.id,
            name: product.name,
            price: product.price,
            quantity: item.quantity
          });
        }

        const created = await Order.create(
          [{
            customer: req.user.id,
            seller: store.id,
            items: lines,
            total: lines.reduce(
              (a, i) => a + i.price * i.quantity,
              0
            ),
            delivery: data.delivery
          }],
          { session }
        );

        order = created[0];
      });
    } finally {
      await session.endSession();
    }

    // =================================================
    // CUSTOMER NOTIFICATION
    // =================================================

    try {
      await notify(
        req.user.id,
        `Order #${order.id.slice(-6)} placed successfully`,
        '/orders'
      );
    } catch (error) {
      console.error(
        'Customer notification failed:',
        error
      );
    }

    // =================================================
    // SELLER NOTIFICATION AND EMAIL
    // =================================================

    try {
      const store = await Store.findById(
        order.seller
      ).populate('owner');

      if (store?.owner) {
        try {
          await notify(
            store.owner.id,
            `New order #${order.id.slice(-6)} received`,
            '/seller'
          );
        } catch (error) {
          console.error(
            'Seller notification failed:',
            error
          );
        }

        mail(
          store.owner.email,
          'New ShopSphere order',
          `You received order #${order.id.slice(-6)}.`
        ).catch(error => {
          console.error(
            'Seller email failed:',
            error
          );
        });
      }
    } catch (error) {
      console.error(
        'Seller lookup failed:',
        error
      );
    }

    // =================================================
    // CUSTOMER ORDER CONFIRMATION EMAIL
    // =================================================

    try {
      const customer = await User.findById(
        req.user.id
      ).select('email');

      const customerEmail =
        customer?.email || req.user.email;

      if (customerEmail) {
        const subject =
          `ShopSphere | Order Confirmed #${order.id.slice(-8).toUpperCase()}`;

        const htmlMessage =
          createOrderConfirmationEmail(order);

      try {
  const sent = await mail(
    customerEmail,
    subject,
    htmlMessage
  );

  if (!sent) {
    console.error(
      'Customer confirmation email skipped: SMTP not configured'
    );
  }
} catch (error) {
  console.error(
    'Customer confirmation email failed:',
    error
  );
}
      }
    } catch (error) {
      console.error(
        'Customer email preparation failed:',
        error
      );
    }

    // =================================================
    // ORDER SUCCESS RESPONSE
    // =================================================

    res.status(201).json({
      order,
      message:
        'Order placed successfully. Confirmation email will be sent.'
    });
  })
);

// =====================================================
// CANCEL PENDING ORDER
// =====================================================

r.post(
  '/:id/cancel',
  asyncRoute(async (req, res) => {
    const order = await Order.findOneAndUpdate(
      {
        _id: req.params.id,
        customer: req.user.id,
        status: 'Pending'
      },
      {
        status: 'Cancelled'
      },
      {
        new: true
      }
    );

    if (!order) {
      return res.status(400).json({
        error: 'Only pending orders can be cancelled'
      });
    }

    for (const line of order.items) {
      await Product.updateOne(
        {
          _id: line.product
        },
        {
          $inc: {
            stock: line.quantity
          }
        }
      );
    }

    res.json({ order });
  })
);

export default r;
