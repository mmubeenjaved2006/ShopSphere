
import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BrowserRouter, Routes, Route, Link, NavLink,
  useNavigate, useParams, useSearchParams
} from 'react-router-dom';
import {
  ShoppingBag, Search, UserRound, Heart, Menu, ArrowRight,
  Store as StoreIcon, Bell, LogOut, Plus, Trash2,
  CheckCircle, Truck, ShieldCheck, SlidersHorizontal,
  ChevronRight
} from 'lucide-react';
import { api, money } from './api';
import './style.css';

const C = createContext();
const useApp = () => useContext(C);
const img = p => p?.image || 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=700';

function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('ss-cart') || '[]');
    } catch {
      return [];
    }
  });
  const [toast, setToast] = useState('');

  useEffect(() => {
    api('/auth/me')
      .then(d => setUser(d.user))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    localStorage.setItem('ss-cart', JSON.stringify(cart));
  }, [cart]);

  const flash = message => {
    setToast(message);
    setTimeout(() => setToast(''), 3500);
  };

  const add = p => {
    if (cart.length && cart[0].store._id !== p.store._id) {
      flash('Cart can contain products from one seller only');
      return;
    }
    if (p.stock < 1) return flash('Out of stock');

    setCart(c => {
      const old = c.find(i => i._id === p._id);
      return old
        ? c.map(i => i._id === p._id
            ? { ...i, quantity: Math.min(i.quantity + 1, p.stock) }
            : i)
        : [...c, { ...p, quantity: 1 }];
    });
    flash('Added to your bag');
  };

  return (
    <C.Provider value={{
      user, setUser, loading, cart, setCart, flash, add
    }}>
      {children}
      {toast && <div className="toast">{toast}</div>}
    </C.Provider>
  );
}

function Header() {
  const { user, setUser, cart, flash } = useApp();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    setUser(null);
    flash('Signed out');
    navigate('/');
  }

  return (
    <>
      <div className="topbar">
        Curated finds, everyday delights. &nbsp; • &nbsp;
        Cash on delivery across Pakistan
      </div>
      <header className="header">
        <div className="container header-inner">
          <Link to="/" className="logo">
            <span className="logo-mark">S</span>
            shop<span>sphere</span>
            <span className="logo-dot">.</span>
          </Link>

          <form className="search" onSubmit={e => {
            e.preventDefault();
            navigate('/shop?q=' + encodeURIComponent(search));
          }}>
            <Search size={19} />
            <input
              placeholder="Search for something wonderful..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <button aria-label="Search">
              <ArrowRight size={18} />
            </button>
          </form>

          <nav className={open ? 'nav open' : 'nav'}>
            <NavLink to="/shop" onClick={() => setOpen(false)}>
              Shop all
            </NavLink>

            {user?.role === 'seller' && (
              <NavLink to="/seller">Seller studio</NavLink>
            )}
            {user?.role === 'admin' && (
              <NavLink to="/admin">Admin</NavLink>
            )}
            {user && (
              <NavLink to="/notifications"><Bell size={19} /></NavLink>
            )}
            {user?.role === 'customer' && (
              <NavLink to="/wishlist"><Heart size={19} /></NavLink>
            )}

            {user ? (
              <>
                <NavLink to="/account"><UserRound size={19} /></NavLink>
                <button className="icon-button" onClick={logout} title="Sign out">
                  <LogOut size={19} />
                </button>
              </>
            ) : (
              <NavLink to="/login">Sign in</NavLink>
            )}

            {user?.role !== 'seller' && user?.role !== 'admin' && (
              <NavLink to="/cart" className="bag">
                <ShoppingBag size={20} />
                <sup>{cart.reduce((a, i) => a + i.quantity, 0)}</sup>
              </NavLink>
            )}
          </nav>

          <button className="icon-button hamburger" onClick={() => setOpen(!open)}>
            <Menu />
          </button>
        </div>
      </header>
    </>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-grid">
        <div>
          <div className="logo light">
            <span className="logo-mark">S</span> shopsphere.
          </div>
          <p>Connecting businesses. Empowering sellers.<br />Simplifying shopping.</p>
        </div>
        <div>
          <h4>Explore</h4>
          <Link to="/shop">Shop all products</Link>
          <Link to="/register?role=seller">Become a seller</Link>
        </div>
        <div>
          <h4>Your account</h4>
          <Link to="/account">My profile</Link>
          <Link to="/orders">My orders</Link>
        </div>
        <div>
          <h4>Get in touch</h4>
          <p>Built with care for the local marketplace.</p>
          <p>Pakistan · Made for everyone</p>
        </div>
      </div>
      <div className="container footer-bottom">
        © 2026 ShopSphere. Thoughtful shopping starts here.
        <span>Semester project · Version 1.0</span>
      </div>
    </footer>
  );
}

function Layout({ children }) {
  return <><Header /><main>{children}</main><Footer /></>;
}

function Loading() {
  return <div className="container empty">Loading your experience…</div>;
}

function ErrorBox({ message }) {
  return message && <p className="error">{message}</p>;
}

function Empty({ title, text, link = '/shop', label = 'Explore products' }) {
  return (
    <div className="empty">
      <ShoppingBag size={42} />
      <h2>{title}</h2>
      <p>{text}</p>
      <Link className="btn primary" to={link}>{label}</Link>
    </div>
  );
}

function ProductCard({ p }) {
  const { add, user, flash } = useApp();

  return (
    <article className="product-card">
      <Link to={'/product/' + p._id} className="product-image">
        <img src={img(p)} alt={p.name} loading="lazy" />
        <span className="product-tag">CURATED FIND</span>
      </Link>
      <div className="product-info">
        <span className="eyebrow">{p.category?.name || 'Discover'}</span>
        <Link to={'/product/' + p._id}><h3>{p.name}</h3></Link>
        <p className="muted">By {p.store?.name || 'ShopSphere seller'}</p>
        <div className="product-bottom">
          <strong>{money(p.price)}</strong>
          <button
            title="Add to bag"
            className="round-add"
            onClick={() =>
              user?.role === 'seller' || user?.role === 'admin'
                ? flash('Shopping is for customer accounts')
                : add(p)
            }
          >
            <Plus size={20} />
          </button>
        </div>
      </div>
    </article>
  );
}

function Home() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    api('/products').then(d => setProducts(d.products)).catch(() => {});
    api('/categories').then(setCategories).catch(() => {});
  }, []);

  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <div className="eyebrow hero-eyebrow">THE ART OF EVERYDAY LIVING</div>
            <h1>Find your <em>everyday</em> extraordinary.</h1>
            <p>
              Discover thoughtful finds from independent sellers.
              Beautiful things, better stories, all in one place.
            </p>
            <div className="hero-actions">
              <Link className="btn primary" to="/shop">
                Explore collection <ArrowRight size={18} />
              </Link>
              <Link className="text-link" to="/register?role=seller">
                Become a seller <ChevronRight size={17} />
              </Link>
            </div>
            <div className="hero-note">
              <span>✦</span> Independent sellers <span>✦</span>
              Carefully curated <span>✦</span> COD available
            </div>
          </div>
          <div className="hero-visual">
            <img
              src="https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=1400"
              alt="Thoughtfully curated lifestyle essentials"
            />
            <div className="hero-sticker">
              GOOD FINDS.<br />GREAT STORIES.<span>↗</span>
            </div>
          </div>
        </div>
      </section>

      <section className="container section">
        <div className="section-head">
          <div>
            <span className="eyebrow">EXPLORE WHAT YOU LOVE</span>
            <h2>Shop by inspiration</h2>
          </div>
          <Link to="/shop" className="text-link">
            View everything <ArrowRight size={17} />
          </Link>
        </div>
        <div className="categories">
          {categories.slice(0, 6).map((c, i) => (
            <Link to={'/shop?category=' + c._id} className="category" key={c._id}>
              <span className="category-number">0{i + 1}</span>
              <strong>{c.name}</strong>
              <ArrowRight size={19} />
            </Link>
          ))}
        </div>
      </section>

      <section className="section soft">
        <div className="container">
          <div className="section-head">
            <div>
              <span className="eyebrow">HANDPICKED FOR YOU</span>
              <h2>Objects worth discovering</h2>
            </div>
            <Link to="/shop" className="text-link">
              Shop all <ArrowRight size={17} />
            </Link>
          </div>
          {products.length ? (
            <div className="product-grid">
              {products.slice(0, 8).map(p => <ProductCard key={p._id} p={p} />)}
            </div>
          ) : (
            <Empty
              title="The shelves are being stocked"
              text="Check back soon or add products from your seller studio."
            />
          )}
        </div>
      </section>

      <section className="container story-banner">
        <div>
          <span className="eyebrow">YOUR STORE, YOUR STORY</span>
          <h2>Big dreams deserve<br /><em>a beautiful storefront.</em></h2>
          <p>
            Join our community of makers, creators, and entrepreneurs.
            Start selling in a marketplace built for you.
          </p>
          <Link to="/register?role=seller" className="btn light-btn">
            Start selling <ArrowRight size={18} />
          </Link>
        </div>
        <div className="story-art">
          <StoreIcon size={115} strokeWidth={1} />
          <span>MADE FOR MAKERS</span>
        </div>
      </section>

      <section className="container values">
        <div>
          <ShieldCheck />
          <h3>Shop with confidence</h3>
          <p>Secure accounts and simple cash-on-delivery checkout.</p>
        </div>
        <div>
          <Truck />
          <h3>Follow your order</h3>
          <p>Stay informed with clear order status updates.</p>
        </div>
        <div>
          <Heart />
          <h3>Support independent sellers</h3>
          <p>Every order helps a local business grow.</p>
        </div>
      </section>
    </>
  );
}

function Shop() {
  const [params, setParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(true);

  const q = params.get('q') || '';
  const category = params.get('category') || '';
  const sort = params.get('sort') || '';
  const min = params.get('min') || '';
  const max = params.get('max') || '';

  const change = (key, value) => {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    setParams(next);
  };

  useEffect(() => {
    setBusy(true);
    api('/products?' + params.toString())
      .then(d => {
        setProducts(d.products);
        setTotal(d.total);
      })
      .catch(() => {})
      .finally(() => setBusy(false));
  }, [params]);

  useEffect(() => {
    api('/categories').then(setCategories).catch(() => {});
  }, []);

  return (
    <div className="container page">
      <div className="page-heading">
        <span className="eyebrow">THE SHOPSPHERE EDIT</span>
        <h1>Discover something good.</h1>
        <p>Unique finds from independent shops, made easy to explore.</p>
      </div>

      <div className="shop-layout">
        <aside className="filters">
          <h3><SlidersHorizontal size={18} /> Refine your search</h3>
          <label>Search</label>
          <input
            value={q}
            onChange={e => change('q', e.target.value)}
            placeholder="Product name..."
          />
          <label>Category</label>
          <select value={category} onChange={e => change('category', e.target.value)}>
            <option value="">All categories</option>
            {categories.map(c => (
              <option key={c._id} value={c._id}>{c.name}</option>
            ))}
          </select>
          <label>Min price (PKR)</label>
          <input type="number" value={min} min="0" onChange={e => change('min', e.target.value)} />
          <label>Max price (PKR)</label>
          <input type="number" value={max} min="0" onChange={e => change('max', e.target.value)} />
          <button className="text-link" onClick={() => setParams({})}>
            Clear all filters
          </button>
        </aside>

        <div>
          <div className="shop-toolbar">
            <span>{total} lovely finds</span>
            <select value={sort} onChange={e => change('sort', e.target.value)}>
              <option value="">Newest first</option>
              <option value="low">Price: low to high</option>
              <option value="high">Price: high to low</option>
            </select>
          </div>
          {busy ? <Loading /> : products.length ? (
            <div className="product-grid shop-products">
              {products.map(p => <ProductCard key={p._id} p={p} />)}
            </div>
          ) : (
            <Empty title="No products found" text="Try a different search or category." />
          )}
        </div>
      </div>
    </div>
  );
}

function Detail() {
  const { id } = useParams();
  const { add, user, flash } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');

  const load = () => api('/products/' + id)
    .then(setData)
    .catch(e => setError(e.message));

  useEffect(() => { load(); }, [id]);

  if (error) return <div className="container page"><ErrorBox message={error} /></div>;
  if (!data) return <Loading />;

  const p = data.product;

  async function wish() {
    if (!user) return flash('Sign in first');
    try {
      await api('/account/wishlist/' + id, { method: 'POST' });
      flash('Saved to wishlist');
    } catch (e) {
      flash(e.message);
    }
  }

  async function review(e) {
    e.preventDefault();
    try {
      await api('/products/' + id + '/reviews', {
        method: 'POST',
        body: { rating: Number(rating), comment }
      });
      flash('Review saved');
      load();
    } catch (e) {
      flash(e.message);
    }
  }

  return (
    <div className="container page">
      <div className="breadcrumb">
        <Link to="/shop">Shop</Link> / {p.category?.name} / {p.name}
      </div>
      <div className="detail-grid">
        <div className="detail-image">
          <img src={img(p)} alt={p.name} />
        </div>
        <div className="detail-copy">
          <span className="eyebrow">{p.category?.name}</span>
          <h1>{p.name}</h1>
          <Link className="muted" to={'/store/' + p.store?._id}>
            Sold by {p.store?.name}
          </Link>
          <div className="detail-price">{money(p.price)}</div>
          <p>{p.description || 'A thoughtful addition to your everyday.'}</p>
          <div className="stock">
            {p.stock > 0
              ? `● In stock · ${p.stock} available`
              : '● Currently out of stock'}
          </div>
          <div className="detail-actions">
            <button className="btn primary" disabled={!p.stock} onClick={() => add(p)}>
              Add to bag <ShoppingBag size={18} />
            </button>
            <button className="btn outline" onClick={wish}>
              <Heart size={18} /> Save
            </button>
          </div>
          <div className="detail-perks">
            <span><Truck size={17} /> Order tracking</span>
            <span><ShieldCheck size={17} /> Cash on delivery</span>
          </div>
        </div>
      </div>
      <div className="reviews">
        <h2>Customer reviews</h2>
        {data.reviews.map(r => (
          <div className="review" key={r._id}>
            <strong>{r.user?.name || 'Customer'} · {'★'.repeat(r.rating)}</strong>
            <p>{r.comment}</p>
          </div>
        ))}
        {!data.reviews.length && <p className="muted">No reviews yet.</p>}
        {user?.role === 'customer' && (
          <form onSubmit={review} className="form narrow">
            <h3>Review a delivered purchase</h3>
            <select value={rating} onChange={e => setRating(e.target.value)}>
              {[5, 4, 3, 2, 1].map(n => (
                <option key={n} value={n}>{n} stars</option>
              ))}
            </select>
            <textarea
              placeholder="Your experience"
              value={comment}
              onChange={e => setComment(e.target.value)}
            />
            <button className="btn primary">Submit review</button>
          </form>
        )}
      </div>
    </div>
  );
}

function StorePage() {
  const { id } = useParams();
  const [data, setData] = useState(null);

  useEffect(() => {
    api('/stores/' + id).then(setData).catch(() => {});
  }, [id]);

  return (
    <div className="container page">
      {!data ? <Loading /> : (
        <>
          <div className="page-heading">
            <span className="eyebrow">INDEPENDENT SELLER</span>
            <h1>{data.store.name}</h1>
            <p>{data.store.description}</p>
          </div>
          <div className="product-grid">
            {data.products.map(p => (
              <ProductCard key={p._id} p={{ ...p, store: data.store }} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function GoogleSignIn({ onSuccess, onError, disabled }) {
  const buttonRef = useRef(null);
  const successRef = useRef(onSuccess);
  const errorRef = useRef(onError);
  successRef.current = onSuccess;
  errorRef.current = onError;

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) return;
    let cancelled = false;
    let script;

    const render = () => {
      if (cancelled || !buttonRef.current || !window.google?.accounts?.id) return;
      try {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: ({ credential }) => {
            if (credential) successRef.current(credential);
            else errorRef.current('Google did not return a credential');
          },
          auto_select: false
        });
        buttonRef.current.replaceChildren();
        window.google.accounts.id.renderButton(buttonRef.current, {
          theme: 'outline', size: 'large', text: 'continue_with',
          shape: 'rectangular', width: 300
        });
      } catch (e) {
        errorRef.current(e.message || 'Google sign-in failed to initialize');
      }
    };

    const failed = () => {
      if (!cancelled) errorRef.current('Google sign-in script could not load');
    };

    if (window.google?.accounts?.id) render();
    else {
      script = document.querySelector('script[data-shopsphere-google]');
      if (!script) {
        script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.dataset.shopsphereGoogle = 'true';
        document.head.appendChild(script);
      }
      script.addEventListener('load', render);
      script.addEventListener('error', failed);
    }
    return () => {
      cancelled = true;
      script?.removeEventListener('load', render);
      script?.removeEventListener('error', failed);
    };
  }, []);

  if (!import.meta.env.VITE_GOOGLE_CLIENT_ID) return null;
  return (
    <div style={{ marginTop: 20, opacity: disabled ? 0.5 : 1,
      pointerEvents: disabled ? 'none' : 'auto' }}>
      <p className="muted" style={{ textAlign: 'center', marginBottom: 12 }}>
        or continue with
      </p>
      <div ref={buttonRef} style={{ display: 'flex', justifyContent: 'center', minHeight: 42 }} />
    </div>
  );
}

function Auth({ register = false }) {
  const { setUser, flash } = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [role, setRole] = useState(params.get('role') === 'seller' ? 'seller' : 'customer');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function googleLogin(credential) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const d = await api('/auth/google', {
        method: 'POST',
        body: { credential }
      });
      setUser(d.user);
      flash('Signed in with Google!');
      navigate(d.user.role === 'seller' ? '/seller'
        : d.user.role === 'admin' ? '/admin' : '/');
    } catch (e) {
      setError(e.message || 'Google sign-in failed');
    } finally {
      setBusy(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const d = await api('/auth/' + (register ? 'register' : 'login'), {
        method: 'POST',
        body: register
          ? { name, email, password, role }
          : { email, password }
      });
      setUser(d.user);
      flash('Welcome to ShopSphere!');
      navigate(
        d.user.role === 'seller' ? '/seller'
          : d.user.role === 'admin' ? '/admin' : '/'
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-art">
        <span className="eyebrow">WELCOME TO THE GOOD SIDE OF SHOPPING</span>
        <h2>Good things<br />start <em>here.</em></h2>
        <p>Discover better. Sell beautifully. Belong somewhere.</p>
      </div>
      <div className="auth-panel">
        <form className="form auth-form" onSubmit={submit}>
          <span className="eyebrow">YOUR SHOPSPHERE ACCOUNT</span>
          <h1>{register ? 'Join the community' : 'Welcome back'}</h1>
          <p className="muted">
            {register
              ? 'Create an account and find your place here.'
              : 'Sign in to continue your journey.'}
          </p>
          {register && (
            <>
              <label>I'm here to</label>
              <div className="role-choice">
                <button
                  type="button"
                  className={role === 'customer' ? 'selected' : ''}
                  onClick={() => setRole('customer')}
                >Shop</button>
                <button
                  type="button"
                  className={role === 'seller' ? 'selected' : ''}
                  onClick={() => setRole('seller')}
                >Sell</button>
              </div>
              <label>Full name</label>
              <input
                required minLength="2" value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your full name"
              />
            </>
          )}
          <label>Email address</label>
          <input
            required type="email" value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          <label>Password</label>
          <input
            required type="password" minLength={register ? 8 : 1}
            value={password} onChange={e => setPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
          <ErrorBox message={error} />
          <button disabled={busy} className="btn primary full">
            {busy ? 'Please wait...' : register ? 'Create my account' : 'Sign in'}
            <ArrowRight size={18} />
          </button>
          {(!register || role === 'customer') && (
            <GoogleSignIn onSuccess={googleLogin} onError={setError} disabled={busy} />
          )}
          <p className="auth-switch">
            {register ? 'Already a member?' : 'New to ShopSphere?'}{' '}
            <Link to={register ? '/login' : '/register'}>
              {register ? 'Sign in' : 'Create an account'}
            </Link>
          </p>
          {!register && (
            <Link className="small-link" to="/forgot-password">
              Forgot password?
            </Link>
          )}
        </form>
      </div>
    </div>
  );
}

function PasswordPage({ reset = false }) {
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  async function submit(e) {
    e.preventDefault();
    try {
      const d = await api('/auth/' + (reset ? 'reset-password' : 'forgot-password'), {
        method: 'POST',
        body: reset
          ? { token: params.get('token'), password }
          : { email }
      });
      setMessage(d.message);
    } catch (e) {
      setMessage(e.message);
    }
  }

  return (
    <div className="container page">
      <form className="form narrow" onSubmit={submit}>
        <h1>{reset ? 'Reset password' : 'Forgot password'}</h1>
        {reset ? (
          <input
            type="password" minLength="8" required
            placeholder="New password" value={password}
            onChange={e => setPassword(e.target.value)}
          />
        ) : (
          <input
            type="email" required placeholder="Your email"
            value={email} onChange={e => setEmail(e.target.value)}
          />
        )}
        <button className="btn primary">Continue</button>
        <p>{message}</p>
      </form>
    </div>
  );
}

function Guard({ roles, children }) {
  const { user, loading } = useApp();
  if (loading) return <Loading />;
  if (!user) return (
    <Empty
      title="Sign in to continue"
      text="Your account keeps your shopping experience together."
      link="/login" label="Sign in"
    />
  );
  if (roles && !roles.includes(user.role)) return (
    <Empty
      title="Access restricted"
      text="This section belongs to another account role."
      link="/" label="Go home"
    />
  );
  return children;
}

function Cart() {
  const { cart, setCart, user, flash } = useApp();
  const navigate = useNavigate();
  const total = cart.reduce((a, i) => a + i.price * i.quantity, 0);

  function qty(id, n) {
    setCart(c => c.map(i =>
      i._id === id
        ? { ...i, quantity: Math.max(1, Math.min(i.stock, n)) }
        : i
    ));
  }

  return (
    <div className="container page">
      <div className="page-heading">
        <span className="eyebrow">YOUR SELECTION</span>
        <h1>Your shopping bag</h1>
      </div>
      {!cart.length ? (
        <Empty title="Your bag is feeling lonely" text="Find something lovely to bring home." />
      ) : (
        <div className="checkout-layout">
          <div>
            {cart.map(p => (
              <div className="cart-row" key={p._id}>
                <img src={img(p)} alt="" />
                <div>
                  <Link to={'/product/' + p._id}><h3>{p.name}</h3></Link>
                  <p className="muted">{p.store?.name}</p>
                  <strong>{money(p.price)}</strong>
                  <div className="qty">
                    <button onClick={() => qty(p._id, p.quantity - 1)}>−</button>
                    <span>{p.quantity}</span>
                    <button onClick={() => qty(p._id, p.quantity + 1)}>+</button>
                  </div>
                </div>
                <button
                  className="icon-button"
                  onClick={() => setCart(c => c.filter(i => i._id !== p._id))}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>
          <div className="summary">
            <h2>Order summary</h2>
            <div className="summary-line">
              <span>Subtotal</span><strong>{money(total)}</strong>
            </div>
            <div className="summary-line">
              <span>Payment</span><span>Cash on delivery</span>
            </div>
            <div className="summary-line total">
              <span>Total</span><strong>{money(total)}</strong>
            </div>
            <button className="btn primary full" onClick={() => {
              if (!user) {
                flash('Sign in to checkout');
                navigate('/login');
              } else if (user.role !== 'customer') {
                flash('Use a customer account to checkout');
              } else {
                navigate('/checkout');
              }
            }}>
              Proceed to checkout <ArrowRight size={18} />
            </button>
            <p className="muted small">
              One seller per order · Shipping arranged by seller
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Checkout() {
  const { cart, setCart, user, flash } = useApp();
  const navigate = useNavigate();
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [address, setAddress] = useState(user?.address || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/orders', {
        method: 'POST',
        body: {
          items: cart.map(i => ({ product: i._id, quantity: i.quantity })),
          delivery: { name, phone, address }
        }
      });
      setCart([]);
      flash('Order placed successfully!');
      navigate('/orders');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container page">
      <div className="page-heading">
        <span className="eyebrow">ONE LAST STEP</span>
        <h1>Checkout</h1>
        <p>Secure and simple. Pay when your order arrives.</p>
      </div>
      {!cart.length ? (
        <Empty title="Your bag is empty" text="Add a product before checkout." />
      ) : (
        <div className="checkout-layout">
          <form className="form" onSubmit={submit}>
            <h2>Delivery details</h2>
            <label>Full name</label>
            <input
              required minLength="2" value={name}
              onChange={e => setName(e.target.value)}
            />
            <label>Phone number</label>
            <input
              required minLength="7" value={phone}
              onChange={e => setPhone(e.target.value)}
            />
            <label>Delivery address</label>
            <textarea
              required minLength="8" value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="House, street, city..."
            />
            <div className="payment">
              <CheckCircle size={20} />
              Cash on Delivery (COD) — the only payment method
            </div>
            <ErrorBox message={error} />
            <button disabled={busy} className="btn primary">
              {busy ? 'Placing order...' : 'Place order'} <ArrowRight size={18} />
            </button>
          </form>
          <div className="summary">
            <h2>Your order</h2>
            {cart.map(p => (
              <div className="summary-line" key={p._id}>
                <span>{p.name} × {p.quantity}</span>
                <strong>{money(p.price * p.quantity)}</strong>
              </div>
            ))}
            <div className="summary-line total">
              <span>Total</span>
              <strong>{money(cart.reduce((a, p) => a + p.price * p.quantity, 0))}</strong>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Orders() {
  const [orders, setOrders] = useState([]);
  const { flash } = useApp();

  const load = () => api('/orders')
    .then(d => setOrders(d.orders))
    .catch(e => flash(e.message));

  useEffect(() => { load(); }, []);

  async function cancel(id) {
    if (!confirm('Cancel this pending order?')) return;
    try {
      await api('/orders/' + id + '/cancel', { method: 'POST' });
      flash('Order cancelled');
      load();
    } catch (e) {
      flash(e.message);
    }
  }

  return (
    <div className="container page">
      <div className="page-heading">
        <span className="eyebrow">YOUR PURCHASES</span>
        <h1>Order history</h1>
      </div>
      {!orders.length ? (
        <Empty title="No orders yet" text="Your next favorite find is waiting." />
      ) : orders.map(o => (
        <div className="order-card" key={o._id}>
          <div className="order-top">
            <div>
              <span className="eyebrow">
                ORDER #{o._id.slice(-8).toUpperCase()}
              </span>
              <h3>{o.seller?.name || 'ShopSphere seller'}</h3>
              <p className="muted">{new Date(o.createdAt).toLocaleDateString()}</p>
            </div>
            <span className={'status ' + o.status.toLowerCase()}>{o.status}</span>
          </div>
          {o.items.map((i, k) => (
            <div className="summary-line" key={k}>
              <span>{i.name} × {i.quantity}</span>
              <strong>{money(i.price * i.quantity)}</strong>
            </div>
          ))}
          <div className="summary-line total">
            <strong>Total · {money(o.total)}</strong>
            {o.status === 'Pending' && (
              <button className="btn outline small" onClick={() => cancel(o._id)}>
                Cancel order
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function Account() {
  const { user, setUser, flash } = useApp();
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone || '');
  const [address, setAddress] = useState(user.address || '');

  async function save(e) {
    e.preventDefault();
    try {
      const d = await api('/auth/me', {
        method: 'PATCH',
        body: { name, phone, address }
      });
      setUser(d.user);
      flash('Profile saved');
    } catch (e) {
      flash(e.message);
    }
  }

  return (
    <div className="container page">
      <div className="page-heading">
        <span className="eyebrow">YOUR SPACE</span>
        <h1>My account</h1>
      </div>
      <form className="form narrow" onSubmit={save}>
        <label>Full name</label>
        <input value={name} onChange={e => setName(e.target.value)} />
        <label>Email</label>
        <input disabled value={user.email} />
        <label>Phone</label>
        <input value={phone} onChange={e => setPhone(e.target.value)} />
        <label>Default address</label>
        <textarea value={address} onChange={e => setAddress(e.target.value)} />
        <button className="btn primary">Save changes</button>
        <div className="quick-links">
          <Link to="/orders">My orders</Link>
          <Link to="/wishlist">Wishlist</Link>
          <Link to="/notifications">Notifications</Link>
        </div>
      </form>
    </div>
  );
}

function Notifications() {
  const [items, setItems] = useState([]);
  const { flash } = useApp();

  const load = () => api('/account/notifications')
    .then(d => setItems(d.notifications))
    .catch(e => flash(e.message));

  useEffect(() => { load(); }, []);

  async function read(id) {
    await api('/account/notifications/' + id + '/read', { method: 'PATCH' });
    load();
  }

  return (
    <div className="container page">
      <div className="page-heading">
        <span className="eyebrow">STAY IN THE LOOP</span>
        <h1>Notifications</h1>
      </div>
      {items.map(n => (
        <div className={'notification ' + (!n.read ? 'unread' : '')} key={n._id}>
          <Bell size={20} />
          <div>
            <p>{n.message}</p>
            <span className="muted small">
              {new Date(n.createdAt).toLocaleString()}
            </span>
          </div>
          {!n.read && (
            <button className="btn outline small" onClick={() => read(n._id)}>
              Mark read
            </button>
          )}
        </div>
      ))}
      {!items.length && (
        <Empty title="All caught up" text="Important updates will appear here." />
      )}
    </div>
  );
}

function Wishlist() {
  const [products, setProducts] = useState([]);
  const { flash } = useApp();

  const load = () => api('/account/wishlist')
    .then(d => setProducts(d.products))
    .catch(e => flash(e.message));

  useEffect(() => { load(); }, []);

  async function remove(id) {
    await api('/account/wishlist/' + id, { method: 'DELETE' });
    load();
  }

  return (
    <div className="container page">
      <div className="page-heading">
        <span className="eyebrow">SAVED WITH LOVE</span>
        <h1>Your wishlist</h1>
      </div>
      {products.length ? (
        <div className="product-grid">
          {products.map(p => (
            <div key={p._id}>
              <ProductCard p={p} />
              <button className="text-link" onClick={() => remove(p._id)}>
                Remove from wishlist
              </button>
            </div>
          ))}
        </div>
      ) : (
        <Empty title="Nothing saved yet" text="Keep your favorites close." />
      )}
    </div>
  );
}

// ======================================================
// SELLER DASHBOARD — UPDATED WITH PRODUCT IMAGE UPLOAD
// ======================================================

function Seller() {
  const { flash } = useApp();

  const emptyProduct = () => ({
    name: '',
    description: '',
    price: '',
    stock: '',
    category: '',
    image: ''
  });

  const [store, setStore] = useState(null);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState({});
  const [categories, setCategories] = useState([]);
  const [tab, setTab] = useState('overview');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyProduct);
  const [storeForm, setStoreForm] = useState({
    name: '',
    description: '',
    contact: ''
  });

  // NEW: Image upload states
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);

  const load = async () => {
    try {
      const [s, p, o, st, c] = await Promise.all([
        api('/seller/store'),
        api('/seller/products'),
        api('/seller/orders'),
        api('/seller/stats'),
        api('/categories')
      ]);

      setStore(s.store);
      setProducts(p.products);
      setOrders(o.orders);
      setStats(st);
      setCategories(c);

      if (s.store) {
        setStoreForm({
          name: s.store.name,
          description: s.store.description || '',
          contact: s.store.contact || ''
        });
      }
    } catch (e) {
      flash(e.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // NEW: Select product image
  function handleImageChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp'
    ];

    if (!allowedTypes.includes(file.type)) {
      flash('Only JPG, PNG and WebP images are allowed');
      e.target.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      flash('Maximum image size is 5 MB');
      e.target.value = '';
      return;
    }

    setImageFile(file);

    const reader = new FileReader();
    reader.onload = () => {
      setImagePreview(reader.result);
    };
    reader.readAsDataURL(file);
  }

  function resetProductForm() {
    setEditing(null);
    setForm(emptyProduct());
    setImageFile(null);
    setImagePreview('');
    setFileInputKey(k => k + 1);
  }

  function editProduct(p) {
    setEditing(p._id);
    setForm({
      name: p.name,
      description: p.description || '',
      price: p.price,
      stock: p.stock,
      category: p.category?._id || p.category,
      image: p.image || '',
      active: p.active
    });
    setImageFile(null);
    setImagePreview(p.image || '');
    setFileInputKey(k => k + 1);

    document.getElementById('product-form')
      ?.scrollIntoView({ behavior: 'smooth' });
  }

  async function saveStore(e) {
    e.preventDefault();

    try {
      await api('/seller/store', {
        method: store ? 'PATCH' : 'POST',
        body: storeForm
      });
      flash(
        store
          ? 'Store updated'
          : 'Store created. Awaiting admin approval.'
      );
      load();
    } catch (e) {
      flash(e.message);
    }
  }

  // NEW: Upload image first, then save product
  async function saveProduct(e) {
    e.preventDefault();
    if (saving) return;

    setSaving(true);

    try {
      let imageUrl = form.image;

      if (imageFile) {
        const uploadData = new FormData();
        uploadData.append('image', imageFile);

        const response = await fetch('/api/seller/upload', {
          method: 'POST',
          credentials: 'include',
          body: uploadData
        });

        let result;
        try {
          result = await response.json();
        } catch {
          throw new Error('Upload server returned an invalid response');
        }

        if (!response.ok) {
          throw new Error(
            result.message ||
            result.error ||
            'Image upload failed'
          );
        }

        if (!result.image) {
          throw new Error('Upload response did not contain an image URL');
        }

        imageUrl = result.image;
      }

      await api('/seller/products' + (editing ? '/' + editing : ''), {
        method: editing ? 'PATCH' : 'POST',
        body: {
          ...form,
          image: imageUrl,
          price: Number(form.price),
          stock: Number(form.stock)
        }
      });

      flash('Product saved successfully');
      resetProductForm();
      await load();

    } catch (e) {
      flash(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(id) {
    if (!confirm('Deactivate this product?')) return;

    try {
      await api('/seller/products/' + id, {
        method: 'DELETE'
      });
      flash('Product deactivated');
      load();
    } catch (e) {
      flash(e.message);
    }
  }

  async function status(id, value) {
    try {
      await api('/seller/orders/' + id + '/status', {
        method: 'PATCH',
        body: { status: value }
      });
      flash('Order updated');
      load();
    } catch (e) {
      flash(e.message);
    }
  }

  return (
    <div className="container page">
      <div className="page-heading">
        <span className="eyebrow">YOUR CREATIVE COMMERCE SPACE</span>
        <h1>Seller studio</h1>
        <p>Build your brand. Manage your products. Grow your story.</p>
      </div>

      <div className="tabs">
        {['overview', 'store', 'products', 'orders'].map(t => (
          <button
            key={t}
            className={tab === t ? 'active' : ''}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          <div className="stat-grid">
            <Stat label="Products" value={stats.products || 0} />
            <Stat label="Orders" value={stats.orders || 0} />
            <Stat label="Delivered sales" value={money(stats.sales || 0)} />
          </div>
          <div className="notice">
            Store status:{' '}
            <strong>
              {store
                ? store.approved
                  ? 'Approved · Live'
                  : 'Pending administrator approval'
                : 'Create your store to begin'}
            </strong>
          </div>
        </>
      )}

      {tab === 'store' && (
        <form className="form narrow" onSubmit={saveStore}>
          <h2>{store ? 'Edit your storefront' : 'Create your storefront'}</h2>

          <label>Store name</label>
          <input
            required
            value={storeForm.name}
            onChange={e => setStoreForm({
              ...storeForm, name: e.target.value
            })}
          />

          <label>Description</label>
          <textarea
            value={storeForm.description}
            onChange={e => setStoreForm({
              ...storeForm, description: e.target.value
            })}
          />

          <label>Contact information</label>
          <input
            value={storeForm.contact}
            onChange={e => setStoreForm({
              ...storeForm, contact: e.target.value
            })}
          />

          <button className="btn primary">
            {store ? 'Update store' : 'Create store'}
          </button>
        </form>
      )}

      {tab === 'products' && (
        <>
          <div className="section-head">
            <h2>My products</h2>
            <button
              className="btn outline small"
              onClick={() => {
                resetProductForm();
                document.getElementById('product-form')
                  ?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              New product <Plus size={17} />
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Price</th>
                  <th>Stock</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map(p => (
                  <tr key={p._id}>
                    <td>{p.name}</td>
                    <td>{money(p.price)}</td>
                    <td>{p.stock}</td>
                    <td>{p.active ? 'Active' : 'Inactive'}</td>
                    <td>
                      <button onClick={() => editProduct(p)}>
                        Edit
                      </button>{' '}
                      <button onClick={() => deactivate(p._id)}>
                        Deactivate
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form
            id="product-form"
            className="form narrow spaced"
            onSubmit={saveProduct}
          >
            <h2>{editing ? 'Edit product' : 'Add a product'}</h2>

            <label>Product name</label>
            <input
              required
              value={form.name}
              onChange={e => setForm({
                ...form, name: e.target.value
              })}
              placeholder="Enter product name"
            />

            <label>Description</label>
            <textarea
              value={form.description}
              onChange={e => setForm({
                ...form, description: e.target.value
              })}
              placeholder="Describe your product"
            />

            <label>Price (PKR)</label>
            <input
              required type="number" min="0"
              value={form.price}
              onChange={e => setForm({
                ...form, price: e.target.value
              })}
              placeholder="Enter price"
            />

            <label>Stock quantity</label>
            <input
              required type="number" min="0"
              value={form.stock}
              onChange={e => setForm({
                ...form, stock: e.target.value
              })}
              placeholder="Available quantity"
            />

            {/* NEW: CHOOSE FILE */}
            <label>Upload Product Image</label>
            <input
              key={fileInputKey}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleImageChange}
            />
            <p className="muted small">
              Choose a JPG, PNG or WebP image (maximum 5 MB).
            </p>

            {/* EXISTING: IMAGE URL */}
            <label>Or enter Image URL</label>
            <input
              type="url"
              placeholder="https://example.com/product.jpg"
              value={form.image}
              onChange={e => {
                setForm({ ...form, image: e.target.value });
                setImageFile(null);
                setImagePreview(e.target.value);
                setFileInputKey(k => k + 1);
              }}
            />

            {/* NEW: IMAGE PREVIEW */}
            {(imagePreview || form.image) && (
              <div style={{ margin: '16px 0' }}>
                <p className="muted small">Product Image Preview</p>
                <img
                  src={imagePreview || form.image}
                  alt="Product preview"
                  style={{
                    width: '220px',
                    height: '220px',
                    objectFit: 'cover',
                    borderRadius: '12px',
                    border: '1px solid #ddd'
                  }}
                />
                <div style={{ marginTop: '10px' }}>
                  <button
                    type="button"
                    className="btn outline small"
                    onClick={() => {
                      setImageFile(null);
                      setImagePreview('');
                      setForm({ ...form, image: '' });
                      setFileInputKey(k => k + 1);
                    }}
                  >
                    Remove Image
                  </button>
                </div>
              </div>
            )}

            <label>Category</label>
            <select
              required
              value={form.category}
              onChange={e => setForm({
                ...form, category: e.target.value
              })}
            >
              <option value="">Choose category</option>
              {categories.map(c => (
                <option value={c._id} key={c._id}>
                  {c.name}
                </option>
              ))}
            </select>

            {editing && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={form.active !== false}
                  onChange={e => setForm({
                    ...form, active: e.target.checked
                  })}
                />
                Active
              </label>
            )}

            <button className="btn primary" disabled={saving}>
              {saving ? 'Saving product...' : 'Save product'}
            </button>
          </form>
        </>
      )}

      {tab === 'orders' && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Items</th>
                <th>Delivery</th>
                <th>Total</th>
                <th>Status</th>
                <th>Next action</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(o => {
                const nextStatus = {
                  Pending: 'Processing',
                  Processing: 'Shipped',
                  Shipped: 'Delivered'
                }[o.status];

                return (
                  <tr key={o._id}>
                    <td>#{o._id.slice(-7)}</td>
                    <td>
                      {o.items.map(i =>
                        i.name + ' × ' + i.quantity
                      ).join(', ')}
                    </td>
                    <td>
                      {o.delivery.name}<br />
                      {o.delivery.phone}<br />
                      {o.delivery.address}
                    </td>
                    <td>{money(o.total)}</td>
                    <td>{o.status}</td>
                    <td>
                      {nextStatus && (
                        <button onClick={() => status(o._id, nextStatus)}>
                          Mark {nextStatus}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <span className="eyebrow">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Admin() {
  const { flash } = useApp();
  const [tab, setTab] = useState('overview');
  const [data, setData] = useState({});
  const [category, setCategory] = useState('');

  async function load() {
    try {
      const result = await Promise.all([
        '/admin/overview',
        '/admin/users',
        '/admin/stores',
        '/admin/categories',
        '/admin/products',
        '/admin/orders'
      ].map(x => api(x)));

      setData({
        overview: result[0],
        users: result[1].users,
        stores: result[2].stores,
        categories: result[3].categories,
        products: result[4].products,
        orders: result[5].orders
      });
    } catch (e) {
      flash(e.message);
    }
  }

  useEffect(() => { load(); }, []);

  async function update(path, body) {
    try {
      await api('/admin/' + path, { method: 'PATCH', body });
      flash('Updated');
      load();
    } catch (e) {
      flash(e.message);
    }
  }

  async function addCategory(e) {
    e.preventDefault();
    try {
      await api('/admin/categories', {
        method: 'POST',
        body: { name: category }
      });
      setCategory('');
      load();
    } catch (e) {
      flash(e.message);
    }
  }

  return (
    <div className="container page">
      <div className="page-heading">
        <span className="eyebrow">MARKETPLACE CONTROL CENTER</span>
        <h1>Admin dashboard</h1>
        <p>Keep the marketplace safe, organized, and thriving.</p>
      </div>

      <div className="tabs">
        {['overview', 'stores', 'users', 'categories', 'products', 'orders'].map(t => (
          <button
            key={t}
            className={tab === t ? 'active' : ''}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="stat-grid">
          {Object.entries(data.overview || {}).map(([k, v]) => (
            <Stat key={k} label={k} value={v} />
          ))}
        </div>
      )}

      {tab === 'stores' && (
        <Table
          heads={['Store', 'Owner', 'Approval', 'Action']}
          rows={(data.stores || []).map(s => [
            s.name,
            s.owner?.email,
            s.approved ? 'Approved' : 'Pending',
            <button onClick={() => update('stores/' + s._id, {
              approved: !s.approved
            })}>
              {s.approved ? 'Revoke' : 'Approve'}
            </button>
          ])}
        />
      )}

      {tab === 'users' && (
        <Table
          heads={['Name', 'Email', 'Role', 'Status', 'Action']}
          rows={(data.users || []).map(u => [
            u.name,
            u.email,
            u.role,
            u.active ? 'Active' : 'Disabled',
            <button onClick={() => update('users/' + u._id, {
              active: !u.active
            })}>
              {u.active ? 'Disable' : 'Enable'}
            </button>
          ])}
        />
      )}

      {tab === 'categories' && (
        <>
          <form className="inline-form" onSubmit={addCategory}>
            <input
              placeholder="New category"
              value={category}
              required
              onChange={e => setCategory(e.target.value)}
            />
            <button className="btn primary">Add category</button>
          </form>
          <Table
            heads={['Name', 'Status', 'Action']}
            rows={(data.categories || []).map(c => [
              c.name,
              c.active ? 'Active' : 'Inactive',
              <button onClick={() => update('categories/' + c._id, {
                active: !c.active
              })}>
                {c.active ? 'Deactivate' : 'Activate'}
              </button>
            ])}
          />
        </>
      )}

      {tab === 'products' && (
        <Table
          heads={['Product', 'Store', 'Price', 'Status', 'Moderation']}
          rows={(data.products || []).map(p => [
            p.name,
            p.store?.name,
            money(p.price),
            p.active ? 'Active' : 'Inactive',
            <button onClick={() => update('products/' + p._id, {
              active: !p.active
            })}>
              {p.active ? 'Deactivate' : 'Restore'}
            </button>
          ])}
        />
      )}

      {tab === 'orders' && (
        <Table
          heads={['Order', 'Customer', 'Seller', 'Total', 'Status']}
          rows={(data.orders || []).map(o => [
            '#' + o._id.slice(-8),
            o.customer?.email,
            o.seller?.name,
            money(o.total),
            o.status
          ])}
        />
      )}
    </div>
  );
}

function Table({ heads, rows }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {heads.map(h => <th key={h}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => <td key={j}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p className="muted">No records found.</p>}
    </div>
  );
}

function Root() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/shop" element={<Shop />} />
            <Route path="/product/:id" element={<Detail />} />
            <Route path="/store/:id" element={<StorePage />} />
            <Route path="/login" element={<Auth />} />
            <Route path="/register" element={<Auth register />} />
            <Route path="/forgot-password" element={<PasswordPage />} />
            <Route path="/reset-password" element={<PasswordPage reset />} />
            <Route path="/cart" element={<Cart />} />

            <Route
              path="/checkout"
              element={<Guard roles={['customer']}><Checkout /></Guard>}
            />
            <Route
              path="/orders"
              element={<Guard roles={['customer']}><Orders /></Guard>}
            />
            <Route
              path="/account"
              element={<Guard><Account /></Guard>}
            />
            <Route
              path="/notifications"
              element={<Guard><Notifications /></Guard>}
            />
            <Route
              path="/wishlist"
              element={<Guard roles={['customer']}><Wishlist /></Guard>}
            />
            <Route
              path="/seller"
              element={<Guard roles={['seller']}><Seller /></Guard>}
            />
            <Route
              path="/admin"
              element={<Guard roles={['admin']}><Admin /></Guard>}
            />

            <Route
              path="*"
              element={
                <Empty
                  title="Page not found"
                  text="Let's get you back to the good stuff."
                  link="/"
                  label="Go home"
                />
              }
            />
          </Routes>
        </Layout>
      </BrowserRouter>
    </AppProvider>
  );
}

createRoot(document.getElementById('root')).render(<Root />);
