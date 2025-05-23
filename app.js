const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const path = require('path');
const morgan = require('morgan');
const methodOverride = require('method-override');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT;

// Middleware
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride('_method'));
app.use(express.static('public'));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/base-layout');

// Routes
const indexRoutes = require('./routes/index');
const mapRoutes = require('./routes/map');

app.use('/', indexRoutes);
app.use('/map', mapRoutes);

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} to view the application`);
});

module.exports = app;