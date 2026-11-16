# ShopSphere — Multi-Vendor E-commerce Marketplace

A full-stack university semester project built around the supplied ShopSphere proposal and SRS (v1.0, 12 November 2026).

## Design

Forest green `#173E32`, warm ivory `#FBFAF6`, terracotta `#B76B4D`, charcoal `#242A25`. Responsive storefront with separate customer, seller and administrator interfaces.

## Requirements

- Node.js 20+ and npm
- MongoDB local installation **with replica-set support** (required for transactional checkout), or MongoDB Atlas cluster
- Internet access for Google Fonts and Unsplash demo photos

## Setup on Windows / VS Code

1. Extract the ZIP, open the `shopsphere` folder in VS Code.
2. Open terminal 1:

```powershell
cd server
npm install
Copy-Item .env.example .env
```

3. Edit `server/.env`: set `MONGO_URI`, a unique 32+ character `JWT_SECRET`, and a strong `ADMIN_PASSWORD`. To use local MongoDB transactions, run MongoDB as a single-node replica set (`mongod --replSet rs0 --dbpath <your-data-folder>`) and initialize once with `mongosh --eval "rs.initiate()"`. Atlas is simpler if local MongoDB is not configured for transactions.
4. Seed categories, six demo products and the administrator account:

```powershell
npm run seed
npm run dev
```

5. Open terminal 2:

```powershell
cd client
npm install
Copy-Item .env.example .env
npm run dev
```

6. Visit **http://localhost:5173**. Backend health check: **http://localhost:5000/api/health**.

## Demo accounts

- Admin: `ADMIN_EMAIL` and `ADMIN_PASSWORD` from your server `.env`, created with `npm run seed`.
- Demo seller: `seller-demo@shopsphere.local` / `DemoSeller123!` (development seed account; change/remove for any public deployment).
- Customer: register through the website.

## Main features

- Customer / seller registration, login/logout with signed JWT in HttpOnly cookie, role-based API authorization, profile management, password-reset email flow
- Store creation and approval; seller product CRUD, stock control, seller order queue and status progression
- Public catalogue, categories, search, sorting, filtering, product detail and seller pages
- One-seller cart, cash-on-delivery checkout, stock validation, transactional stock decrement, order history, cancellation while pending
- Email attempts for welcome, order confirmation, seller new-order alert and status updates; persistent in-app notifications and mark-as-read
- Wishlist, reviews limited to delivered purchasers, admin dashboard, user management, category management, seller approvals, product moderation, order overview, seller sales summary

## Important notes

- **SMTP**: Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and MAIL_FROM in server `.env` for real email delivery. Without SMTP, messages are logged to the API console, not sent.
- **Images**: The seller product form accepts an image URL. File uploads are not implemented; remote URLs are stored. Seeded photos use Unsplash.
- **Payments**: Cash on Delivery only. No card/JazzCash/Easypaisa integration, per SRS.
- **Shipping**: Status is manually updated by seller; no courier API or GPS tracking, per SRS.
- **Cart**: Browser localStorage for convenience. Checkout price and stock are recalculated server-side; never trusted from client.
- **Security**: Passwords are bcrypt hashed, session cookies are HttpOnly, backend checks roles and ownership, Helmet and basic auth rate limits are enabled. For public production deployment, add CSRF protection (or strict origin enforcement for state-changing requests), stronger request limits, audit logging, image URL validation, robust email delivery queues and deployment-specific security review.
- **Transactions**: MongoDB replica set is necessary for safe checkout. Local MongoDB standalone mode cannot perform transactional order creation.
- **Cancellation**: Pending-order cancellation restores stock; a production deployment should wrap cancellation and restocking in a transaction to prevent races.
- **Email verification**: The SRS labels it Should; this implementation includes password reset and welcome emails, but not an email-verification token workflow.
- **Testing**: No automated test suite is included; perform the SRS acceptance checks manually before presentation.

## Build

```powershell
cd client
npm run build
```

## Suggested deployment

Frontend on Vercel (set `VITE_API_URL` to the deployed API), API on a Node hosting provider, MongoDB Atlas for database. Set `CLIENT_URL` to the deployed frontend URL. For cross-site deployments, adjust cookie `SameSite=None; Secure` and add CSRF defenses, or serve frontend and API under the same site.

## Project structure

```text
shopsphere/
  client/                 React + Vite storefront and dashboards
    src/main.jsx         Pages, components and routing
    src/style.css        Responsive visual system
    src/api.js           HTTP API client
  server/                 Express API
    src/index.js         API entrypoint, security middleware
    src/models.js        MongoDB models
    src/lib.js           Auth, email, notifications, validation
    src/routes/          Authentication, catalog, seller, orders, admin, account
    src/seed.js          Development seed
```

**Note:** This is a substantial functional starter implementation, not a security-audited commercial marketplace. Review the limitations above before claiming every SRS criterion is production-ready.
