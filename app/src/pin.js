const crypto = require('crypto');
const hashPin = (pin, salt = crypto.randomBytes(16).toString('hex')) => salt + ':' + crypto.scryptSync(String(pin), salt, 32).toString('hex');
const checkPin = (pin, stored) => { const [salt, h] = String(stored).split(':'); if (!salt || !h) return false; const a = Buffer.from(h, 'hex'), b = crypto.scryptSync(String(pin), salt, 32); return a.length === b.length && crypto.timingSafeEqual(a, b); };
const newPin = () => String(crypto.randomInt(0, 10000)).padStart(4, '0');
module.exports = { hashPin, checkPin, newPin };
