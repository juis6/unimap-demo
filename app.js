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

// Статичні файли
app.use(express.static('public'));
// ДОДАНО: Статичний доступ до папки data для SVG файлів
app.use('/data', express.static(path.join(__dirname, 'data')));

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

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).render('pages/error', {
        title: 'Помилка сервера',
        error: 'Внутрішня помилка сервера'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).render('pages/error', {
        title: 'Сторінка не знайдена',
        error: 'Запитувана сторінка не знайдена'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} to view the application`);
});

module.exports = app;