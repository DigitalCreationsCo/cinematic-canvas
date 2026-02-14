import crypto from 'crypto';
console.log('sk_live_' + crypto.randomBytes(24).toString('base64url'));
