const express = require('express');
const router = express.Router();
const mapController = require('../controllers/mapController');

// Маршрути для карти
router.get('/', mapController.getMapPage);
router.get('/data/:mapId', mapController.getMapData);
router.get('/floors/:mapId', mapController.getFloors);
router.get('/rooms/:mapId', mapController.getRooms);
router.post('/route', mapController.findRoute);
router.get('/search/:mapId', mapController.searchRooms);

module.exports = router;