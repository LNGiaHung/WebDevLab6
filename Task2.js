require('dotenv').config(); // Load environment variables
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Sequelize, DataTypes } = require('sequelize');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';
const shouldForceSync = process.env.FORCE_SYNC === 'true';

// Initialize Sequelize
const sequelize = new Sequelize(
  process.env.DB_NAME || 'jwt_auth',
  process.env.DB_USER || 'root',
  process.env.DB_PASSWORD || '',
  {
    host: process.env.DB_HOST || 'localhost',
    dialect: 'mysql',
  }
);

// Define User model
const User = sequelize.define('User', {
  username: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  role: {
    type: DataTypes.STRING,
    allowNull: false,
  },
});

// Define Token model
const Token = sequelize.define('Token', {
  token: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  loginTime: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  loginAddress: {
    type: DataTypes.STRING,
    allowNull: true,
  },
});

// Establish relationships
User.hasMany(Token, { foreignKey: 'userId' });
Token.belongsTo(User, { foreignKey: 'userId' });

// Sync models with the database
(async () => {
  try {
    await sequelize.authenticate();
    console.log('Connected to MySQL database.');

    // Sync models conditionally based on FORCE_SYNC environment variable
    await sequelize.sync({ force: shouldForceSync });
    console.log(`Database synchronized. Force sync: ${shouldForceSync}`);
  } catch (error) {
    console.error('Unable to connect to the database:', error);
  }
})();

// Registration endpoint
app.post('/register', async (req, res) => {
  const { username, password, role } = req.body;

  if (!username || !password || !role) {
    return res.status(400).json({ message: 'Username, password, and role are required' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await User.create({ username, password: hashedPassword, role });
    res.status(201).json({ message: 'User registered successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error registering user' });
  }
});

// Login endpoint
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }

  try {
    const user = await User.findOne({ where: { username } });

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const loginAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const loginTime = new Date();

    const token = jwt.sign(
      { id: user.id, role: user.role, loginTime, loginAddress },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    await Token.create({ userId: user.id, token, loginTime, loginAddress });

    res.status(200).json({ message: 'Login successful', token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error logging in' });
  }
});

// Middleware to check admin role
const checkAdminRole = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) {
    return res.status(403).json({ message: 'No token provided' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }
    if (decoded.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied: Admins only' });
    }
    req.userId = decoded.id;
    next();
  });
};

// Admin endpoint
app.get('/admin', checkAdminRole, (req, res) => {
  res.status(200).json({ message: 'Welcome to the admin panel' });
});

// Verify token endpoint
app.get('/verify', (req, res) => {
  const authorizationHeader = req.headers['authorization'];

  if (!authorizationHeader) {
    return res.status(400).json({ message: 'Authorization header is required' });
  }

  const token = authorizationHeader.split(' ')[1];
  if (!token) {
    return res.status(400).json({ message: 'Bearer token is missing' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.status(200).json({ message: 'Token is valid', decoded });
  } catch (err) {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
});

// Logout endpoint
app.post('/logout', async (req, res) => {
  const authorizationHeader = req.headers['authorization'];

  if (!authorizationHeader) {
    return res.status(400).json({ message: 'Authorization header is required' });
  }

  const token = authorizationHeader.split(' ')[1];
  if (!token) {
    return res.status(400).json({ message: 'Bearer token is missing' });
  }

  try {
    const deletedCount = await Token.destroy({ where: { token } });

    if (deletedCount === 0) {
      return res.status(404).json({ message: 'Token not found or already logged out' });
    }

    res.status(200).json({ message: 'Logout successful' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error logging out' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
