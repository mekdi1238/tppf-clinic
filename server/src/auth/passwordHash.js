const bcrypt = require("bcryptjs");

async function hashPassword(plainText) {
  return bcrypt.hash(plainText, 10);
}

async function verifyPassword(plainText, hash) {
  return bcrypt.compare(plainText, hash);
}

module.exports = { hashPassword, verifyPassword };
