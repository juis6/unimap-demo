const express = require('express');
const router = express.Router();

// Головна сторінка
router.get('/', (req, res) => {
    res.render('pages/index', {
        title: 'Цифрова навігаційна карта університету',
        page: 'home'
    });
});

module.exports = router;