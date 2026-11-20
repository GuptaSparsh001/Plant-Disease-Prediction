require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDb } = require('./models/Prediction');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api', apiRoutes);

// Initialise SQLite database, then start listening
(async () => {
  try {
    await initDb();
    app.listen(PORT, () => {
      console.log(`Node Server running on port ${PORT}`);
      console.log(`SQLite database ready – no external DB service required.`);
    });
  } catch (err) {
    console.error('Failed to initialise database:', err);
    process.exit(1);
  }
})();
