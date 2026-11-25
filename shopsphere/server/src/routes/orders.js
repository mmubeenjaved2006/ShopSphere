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
// WEBSITE URL
// =====================================================

const getWebsiteUrl = path =>
  new URL(
    path,
    process.env.CLIENT_URL ||
    'https://shopsphere-frontend-gamma.vercel.app'
  ).href;

// =====================================================
// PROFESSIONAL EMAIL TEMPLATE
// =====================================================

function createOrderEmail(order, options) {
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

          <!-- EMAIL TITLE -->

          <div style="text-align:center;margin-bottom:28px;">

            <div style="font-size:42px;color:${options.color};margin-bottom:12px;">
              ${options.icon}
            </div>

            <h2 style="font-size:27px;color:#172b43;margin:0 0 12px;">
              ${safeText(options.title)}
            </h2>

            <p style="color:#666;line-height:1.7;">
              Dear ${safeText(options.name || 'Customer')},
            </p>

            <p style="color:#666;line-height:1.7;margin:0;">
              ${safeText(options.message)}
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

              <span style="color:${options.color};font-weight:bold;">
                ${safeText(order.status || 'Pending')}
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

          <!-- ADDITIONAL INFORMATION -->

          <div style="background:#f6f4f0;padding:18px;border-radius:8px;margin-top:26px;">

            <p style="margin:0;font-size:14px;line-height:1.7;color:#555;">
              ${safeText(options.note)}
            </p>

          </div>

          <!-- ACTION BUTTON -->

          <div style="text-align:center;margin-top:30px;">

            <a
              href="${safeText(options.buttonUrl)}"
              style="display:inline-block;background:#172b43;color:#ffffff;padding:14px 28px;text-decoration:none;border-radius:6px;font-weight:bold;"
            >
              ${safeText(options.buttonText)}
            </a>

          </div>

          <!-- THANK YOU MESSAGE -->

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
// CUSTOMER ORDER CONFIRMATION EMAIL
// =====================================================

function createOrderConfirmationEmail(order, customer) {
  return createOrderEmail(order, {

    name:
      customer?.name ||
      order.delivery?.name ||
      'Customer',

    title: 'Order Confirmed!',

    message:
      'Thank you for shopping with ShopSphere. Your order has been placed successfully.',

    icon: '&#10003;',

    color: '#237a45',

    note:
      'Your seller will process your order soon. You will receive an email whenever your order status changes.',

    buttonText: 'Track Your Order',

    buttonUrl: getWebsiteUrl('/orders')

  });
}

// =====================================================
// SELLER NEW ORDER EMAIL
// =====================================================

function createSellerOrderEmail(order, seller) {
  return createOrderEmail(order, {

    name: seller?.name || 'Seller',

    title: 'You Have Received a New Order!',

    message:
      'Congratulations! A customer has placed a new order from your ShopSphere store.',

    icon: '&#128722;',

    color: '#237a45',

    note:
      'Please visit your seller dashboard to review the order and begin processing it.',

    buttonText: 'Open Seller Dashboard',

    buttonUrl: getWebsiteUrl('/seller')

  });
}

// =====================================================
// CUSTOMER ORDER CANCELLATION EMAIL
// =====================================================

function createOrderCancellationEmail(order, customer) {
  return createOrderEmail(order, {

    name:
      customer?.name ||
      order.delivery?.name ||
      'Customer',

    title: 'Your Order Has Been Cancelled',

    message:
      'Your order cancellation request has been completed successfully.',

    icon: '&#10005;',

    color: '#a83232',

    note:
      'Your order was placed using Cash on Delivery. No online payment was collected, so no online refund is required. You can continue shopping anytime.',

    buttonText: 'Continue Shopping',

    buttonUrl: getWebsiteUrl('/shop')

  });
}

// =====================================================
// SELLER ORDER CANCELLATION EMAIL
// =====================================================

function createSellerCancellationEmail(order, seller) {
  return createOrderEmail(order, {

    name: seller?.name || 'Seller',

    title: 'An Order Has Been Cancelled',

    message:
      'A customer has cancelled a pending order from your ShopSphere store.',

    icon: '&#10005;',

    color: '#a83232',

    note:
      'The order has been cancelled and its product quantities have been restored to your inventory.',

    buttonText: 'Open Seller Dashboard',

    buttonUrl: getWebsiteUrl('/seller')

  });
}

// =====================================================
// SAFE EMAIL SENDING
// =====================================================

async function sendOrderEmail(to, subject, content) {
  if (!to) {
    console.error(
      'Order email skipped: recipient email not found'
    );

    return false;
  }

  try {
    const sent = await mail(
      to,
      subject,
      content
    );

    if (!sent) {
      console.error(
        'Order email skipped: SMTP not configured',
        subject
      );
    }

    return sent === true;

  } catch (error) {
    console.error(
      'Order email failed:',
      subject,
      error.message
    );

    return false;
  }
}

// =====================================================
// SAFE DATABASE NOTIFICATION
// =====================================================

async function sendNotification(user, message, link) {
  try {
    await notify(
      user,
      message,
      link
    );

  } catch (error) {
    console.error(
      'Order notification failed:',
      error.message
    );
  }
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

    res.json({
      orders
    });
  })
);

// =====================================================
// PLACE ORDER + SEND CONFIRMATION EMAILS
// =====================================================

r.post(
  '/',
  asyncRoute(async (req, res) => {

    const data = validate(
      z.object({

        items: z.array(
          z.object({

            product: z.string(),

            quantity: z.number()
              .int()
              .min(1)
              .max(100)

          })
        )
          .min(1)
          .max(50),

        delivery: z.object({

          name: z.string().min(2),

          phone: z.string().min(7),

          address: z.string().min(8)

        })

      }),
      req
    );

    // =================================================
    // PREVENT DUPLICATE PRODUCTS
    // =================================================

    if (
      new Set(
        data.items.map(i => i.product)
      ).size !== data.items.length
    ) {
      return res.status(400).json({
        error: 'Duplicate products in cart'
      });
    }

    // =================================================
    // START DATABASE TRANSACTION
    // =================================================

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
            new Error(
              'One or more products unavailable'
            ),
            {
              status: 400
            }
          );
        }

        // =============================================
        // VERIFY SELLER STORE
        // =============================================

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
            {
              status: 400
            }
          );
        }

        // =============================================
        // VERIFY AND UPDATE PRODUCT STOCK
        // =============================================

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
            {
              session
            }
          );

          if (result.modifiedCount !== 1) {
            throw Object.assign(
              new Error(
                `Insufficient stock: ${product.name}`
              ),
              {
                status: 409
              }
            );
          }

          lines.push({

            product: product.id,

            name: product.name,

            price: product.price,

            quantity: item.quantity

          });
        }

        // =============================================
        // CREATE ORDER
        // =============================================

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
          {
            session
          }
        );

        order = created[0];

      });

    } finally {
      await session.endSession();
    }

    const orderId =
      order.id.slice(-8).toUpperCase();

    // =================================================
    // CUSTOMER NOTIFICATION
    // =================================================

    await sendNotification(
      req.user.id,
      `Order #${orderId} placed successfully`,
      '/orders'
    );

    // =================================================
    // SELLER NOTIFICATION AND EMAIL
    // =================================================

    async function notifySeller() {
      try {
        const store = await Store.findById(
          order.seller
        ).populate('owner', 'name email');

        if (!store?.owner) {
          console.error(
            'Seller account not found'
          );

          return false;
        }

        await sendNotification(
          store.owner.id,
          `New order #${orderId} received`,
          '/seller'
        );

        const subject =
          `ShopSphere | New Order #${orderId}`;

        const htmlMessage =
          createSellerOrderEmail(
            order,
            store.owner
          );

        return await sendOrderEmail(
          store.owner.email,
          subject,
          htmlMessage
        );

      } catch (error) {
        console.error(
          'Seller order email preparation failed:',
          error.message
        );

        return false;
      }
    }

    // =================================================
    // CUSTOMER ORDER CONFIRMATION EMAIL
    // =================================================

    async function notifyCustomer() {
      try {
        const customer = await User.findById(
          req.user.id
        ).select('name email');

        const customerEmail =
          customer?.email ||
          req.user.email;

        const subject =
          `ShopSphere | Order Confirmed #${orderId}`;

        const htmlMessage =
          createOrderConfirmationEmail(
            order,
            customer || req.user
          );

        return await sendOrderEmail(
          customerEmail,
          subject,
          htmlMessage
        );

      } catch (error) {
        console.error(
          'Customer confirmation email preparation failed:',
          error.message
        );

        return false;
      }
    }

    // =================================================
    // WAIT FOR BOTH EMAILS
    // =================================================

    const [
      customerEmailSent,
      sellerEmailSent
    ] = await Promise.all([
      notifyCustomer(),
      notifySeller()
    ]);

    // =================================================
    // ORDER SUCCESS RESPONSE
    // =================================================

    res.status(201).json({

      order,

      customerEmailSent,

      sellerEmailSent,

      message: 'Order placed successfully'

    });
  })
);

// =====================================================
// CANCEL PENDING ORDER
// =====================================================

r.post(
  '/:id/cancel',
  asyncRoute(async (req, res) => {

    const session = await mongoose.startSession();

    let order;

    // =================================================
    // CANCEL ORDER AND RESTORE STOCK
    // =================================================

    try {
      await session.withTransaction(async () => {

        order = await Order.findOneAndUpdate(
          {
            _id: req.params.id,

            customer: req.user.id,

            status: 'Pending'
          },
          {
            $set: {
              status: 'Cancelled'
            }
          },
          {
            new: true,

            runValidators: true,

            session
          }
        );

        if (!order) {
          throw Object.assign(
            new Error(
              'Only pending orders can be cancelled'
            ),
            {
              status: 400
            }
          );
        }

        // =============================================
        // RESTORE PRODUCT INVENTORY
        // =============================================

        for (const line of order.items) {

          await Product.updateOne(
            {
              _id: line.product
            },
            {
              $inc: {
                stock: line.quantity
              }
            },
            {
              session
            }
          );
        }

      });

    } finally {
      await session.endSession();
    }

    const orderId =
      order.id.slice(-8).toUpperCase();

    // =================================================
    // CUSTOMER CANCELLATION NOTIFICATION
    // =================================================

    await sendNotification(
      req.user.id,
      `Your order #${orderId} has been cancelled`,
      '/orders'
    );

    // =================================================
    // CUSTOMER CANCELLATION EMAIL
    // =================================================

    async function notifyCustomerCancellation() {
      try {
        const customer = await User.findById(
          req.user.id
        ).select('name email');

        const customerEmail =
          customer?.email ||
          req.user.email;

        const subject =
          `ShopSphere | Order Cancelled #${orderId}`;

        const htmlMessage =
          createOrderCancellationEmail(
            order,
            customer || req.user
          );

        return await sendOrderEmail(
          customerEmail,
          subject,
          htmlMessage
        );

      } catch (error) {
        console.error(
          'Customer cancellation email failed:',
          error.message
        );

        return false;
      }
    }

    // =================================================
    // SELLER CANCELLATION NOTIFICATION AND EMAIL
    // =================================================

    async function notifySellerCancellation() {
      try {
        const store = await Store.findById(
          order.seller
        ).populate('owner', 'name email');

        if (!store?.owner) {
          return false;
        }

        await sendNotification(
          store.owner.id,
          `Order #${orderId} has been cancelled by the customer`,
          '/seller'
        );

        const subject =
          `ShopSphere | Order Cancelled #${orderId}`;

        const htmlMessage =
          createSellerCancellationEmail(
            order,
            store.owner
          );

        return await sendOrderEmail(
          store.owner.email,
          subject,
          htmlMessage
        );

      } catch (error) {
        console.error(
          'Seller cancellation email failed:',
          error.message
        );

        return false;
      }
    }

    // =================================================
    // WAIT FOR CANCELLATION EMAILS
    // =================================================

    const [
      customerEmailSent,
      sellerEmailSent
    ] = await Promise.all([
      notifyCustomerCancellation(),
      notifySellerCancellation()
    ]);

    // =================================================
    // CANCELLATION SUCCESS RESPONSE
    // =================================================

    res.json({

      order,

      customerEmailSent,

      sellerEmailSent,

      message: 'Order cancelled successfully'

    });
  })
);

// =====================================================
// EXPORT ORDER ROUTER
// =====================================================

export default r;