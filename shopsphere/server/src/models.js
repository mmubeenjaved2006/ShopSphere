
import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const options = {
  timestamps: true
};

// =====================================================
// USER MODEL - EMAIL/PASSWORD + GOOGLE AUTHENTICATION
// =====================================================

export const User = model('User', new Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },

  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },

  password: {
    type: String,
    required: true,
    select: false
  },

  // Google Authentication
  // Unique Google account identifier
  googleId: {
    type: String,
    unique: true,
    sparse: true,
    default: undefined
  },

  role: {
    type: String,
    enum: ['customer', 'seller', 'admin'],
    default: 'customer'
  },

  active: {
    type: Boolean,
    default: true
  },

  phone: String,

  address: String,

  verified: {
    type: Boolean,
    default: false
  }
}, options));

// =====================================================
// STORE MODEL
// =====================================================

export const Store = model('Store', new Schema({
  owner: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    unique: true,
    required: true
  },

  name: {
    type: String,
    required: true
  },

  description: String,

  contact: String,

  approved: {
    type: Boolean,
    default: false
  }
}, options));

// =====================================================
// CATEGORY MODEL
// =====================================================

export const Category = model('Category', new Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },

  active: {
    type: Boolean,
    default: true
  }
}, options));

// =====================================================
// PRODUCT MODEL
// =====================================================

export const Product = model('Product', new Schema({
  store: {
    type: Schema.Types.ObjectId,
    ref: 'Store',
    required: true
  },

  name: {
    type: String,
    required: true
  },

  description: String,

  price: {
    type: Number,
    required: true,
    min: 0
  },

  category: {
    type: Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },

  stock: {
    type: Number,
    required: true,
    min: 0
  },

  image: String,

  active: {
    type: Boolean,
    default: true
  }
}, options));

// =====================================================
// ORDER MODEL
// =====================================================

export const Order = model('Order', new Schema({
  customer: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  seller: {
    type: Schema.Types.ObjectId,
    ref: 'Store',
    required: true
  },

  items: [{
    product: {
      type: Schema.Types.ObjectId,
      ref: 'Product'
    },

    name: String,

    price: Number,

    quantity: Number
  }],

  total: Number,

  delivery: {
    name: String,
    phone: String,
    address: String
  },

  status: {
    type: String,
    enum: [
      'Pending',
      'Processing',
      'Shipped',
      'Delivered',
      'Cancelled'
    ],
    default: 'Pending'
  },

  paymentMethod: {
    type: String,
    default: 'COD'
  }
}, options));

// =====================================================
// NOTIFICATION MODEL
// =====================================================

export const Notification = model('Notification', new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  message: String,

  read: {
    type: Boolean,
    default: false
  },

  link: String
}, options));

// =====================================================
// WISHLIST MODEL
// =====================================================

export const Wishlist = model('Wishlist', new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    unique: true
  },

  products: [{
    type: Schema.Types.ObjectId,
    ref: 'Product'
  }]
}, options));

// =====================================================
// REVIEW MODEL
// =====================================================

export const Review = model('Review', new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },

  product: {
    type: Schema.Types.ObjectId,
    ref: 'Product'
  },

  rating: {
    type: Number,
    min: 1,
    max: 5
  },

  comment: String
}, options));

// =====================================================
// PASSWORD RESET TOKEN MODEL
// =====================================================

export const ResetToken = model('ResetToken', new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },

  hash: String,

  expires: Date
}, options));
