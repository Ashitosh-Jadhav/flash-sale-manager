const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '../../.env') });

const User = require('../models/User');
const { BadRequestError, ConflictError } = require('../utils/errors');

// ============================================
// Auth Service (Business Logic Layer)
// ============================================
// WHY: Keeps password hashing, JWT signing, and auth logic
// out of controllers. Controllers only handle HTTP concerns.
//
// PASSWORD HASHING (bcrypt):
// 1. We NEVER store plaintext passwords.
// 2. bcrypt adds a SALT (random bytes) before hashing.
//    This means two users with the same password get different hashes.
// 3. bcrypt is deliberately SLOW (~100ms per hash). This makes
//    brute-force attacks computationally expensive. An attacker
//    trying 1 billion passwords would need ~3 years instead of seconds.
// 4. The "cost factor" (saltRounds=12) controls how slow it is.
//    Each increment doubles the time: 10=~100ms, 12=~300ms, 14=~1s.
//
// JWT (JSON Web Token):
// Structure: HEADER.PAYLOAD.SIGNATURE
//   Header:    { "alg": "HS256", "typ": "JWT" }
//   Payload:   { "userId": 1, "role": "customer", "iat": ..., "exp": ... }
//   Signature: HMACSHA256(base64(header) + "." + base64(payload), secret)
//
// The payload is base64-encoded, NOT encrypted. Anyone can decode it.
// The signature prevents TAMPERING — if someone changes the payload,
// the signature won't match and verification fails.
// NEVER put sensitive data (password, SSN, credit card) in the payload.

const SALT_ROUNDS = 12;
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET is not defined in environment variables. Cannot start.');
}

class AuthService {
  /**
   * Register a new user
   */
  static async register(userData) {
    const { name, email, password } = userData;

    // 1. Check if email already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      throw new ConflictError('A user with this email already exists');
    }

    // 2. Hash the password with bcrypt
    // bcrypt.hash(plaintext, saltRounds):
    //   - Generates a random salt
    //   - Hashes password + salt
    //   - Returns a string containing: algorithm + cost + salt + hash
    //   - Example: $2b$12$LJ3m4ys3Lk.../...hashedvalue...
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // 3. Store user with hashed password
    const userId = await User.create({
      name,
      email,
      passwordHash,
      role: 'customer', // Default role. Admins are created manually or seeded.
    });

    // 4. Generate JWT
    const token = AuthService.generateToken({ userId, role: 'customer' });

    // 5. Return user info (NEVER return password_hash)
    return {
      user: { id: userId, name, email, role: 'customer' },
      token,
    };
  }

  /**
   * Login an existing user
   */
  static async login(email, password) {
    // 1. Find user by email
    const user = await User.findByEmail(email);

    // SECURITY: We use the same error message for "user not found" AND
    // "wrong password". If we said "User not found" vs "Wrong password",
    // an attacker could enumerate which emails exist in our system.
    if (!user) {
      throw new BadRequestError('Invalid email or password');
    }

    // 2. Compare the provided password with the stored hash
    // bcrypt.compare(plaintext, hash):
    //   - Extracts the salt from the stored hash
    //   - Hashes the provided password with that salt
    //   - Compares the two hashes
    //   - Returns true if they match, false otherwise
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      throw new BadRequestError('Invalid email or password');
    }

    // 3. Generate JWT
    const token = AuthService.generateToken({ userId: user.id, role: user.role });

    // 4. Return user info (NEVER return password_hash)
    return {
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      token,
    };
  }

  /**
   * Generate a JWT token
   * @param {Object} payload - { userId, role }
   * @returns {string} Signed JWT
   */
  static generateToken(payload) {
    return jwt.sign(
      {
        userId: payload.userId,
        role: payload.role,
      },
      JWT_SECRET,
      {
        expiresIn: JWT_EXPIRES_IN,
        issuer: 'flash-sale-manager',
        subject: String(payload.userId),
      }
    );
  }

  /**
   * Verify and decode a JWT token
   * @param {string} token
   * @returns {Object} Decoded payload
   * @throws {Error} If token is invalid, expired, or tampered
   */
  static verifyToken(token) {
    return jwt.verify(token, JWT_SECRET, {
      issuer: 'flash-sale-manager',
    });
  }
}

module.exports = AuthService;
