require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

const authRoutes = require('./routes/auth');
const athleteRoutes = require('./routes/athletes');
const injuryRoutes = require('./routes/injuries');
const activityRoutes = require('./routes/activities');
const selfReportRoutes = require('./routes/selfReports');
const uploadRoutes = require('./routes/upload');

const app = express();

connectDB();

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/auth', authRoutes);
app.use('/api/athletes', athleteRoutes);
app.use('/api/injuries', injuryRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/self-reports', selfReportRoutes);
app.use('/api/upload', uploadRoutes);

app.get('/api/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date() }));

app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`AIRMS backend running on port ${PORT}`));
