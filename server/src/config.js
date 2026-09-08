import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  siteUrl: process.env.SITE_URL || 'http://localhost:3000',
  serveSite: (process.env.SERVE_SITE || 'true') === 'true',

  databaseUrl: process.env.DATABASE_URL || '',
  pgSsl: (process.env.PGSSL || 'true') === 'true',

  email: {
    resendApiKey: process.env.RESEND_API_KEY || '',
    from: `${process.env.FROM_NAME || 'גוב ארי מערכות'} <${process.env.FROM_EMAIL || 'orders@example.com'}>`,
    ownerEmail: process.env.OWNER_EMAIL || 'davidazulay75@gmail.com',
  },

  payment: {
    provider: process.env.PAYMENT_PROVIDER || 'none',
    apiUrl: process.env.PAYMENT_API_URL || '',
    apiKey: process.env.PAYMENT_API_KEY || '',
    secret: process.env.PAYMENT_SECRET || '',
    webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET || '',
  },

  product: {
    name: process.env.PRODUCT_NAME || 'מצלמת רכב גוב ארי — 4 ערוצים',
    price: parseInt(process.env.PRODUCT_PRICE || '1090', 10),
    currency: process.env.CURRENCY || 'ILS',
  },
};

export function emailEnabled() {
  return Boolean(config.email.resendApiKey);
}

export function paymentEnabled() {
  return config.payment.provider && config.payment.provider !== 'none';
}
