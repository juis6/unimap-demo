const express = require('express');
const router = express.Router();
const mapController = require('../controllers/mapController');

router.get('/', (req, res) => {
    mapController.getMapPage(req, res);
});

router.get('/data/:mapId', (req, res) => {
    mapController.getMapData(req, res);
});

router.get('/svg/:mapId', (req, res) => {
    mapController.getSVGFile(req, res);
});

router.get('/floors/:mapId', (req, res) => {
    mapController.getFloors(req, res);
});

router.get('/rooms/:mapId', (req, res) => {
    mapController.getRooms(req, res);
});

router.post('/route', (req, res) => {
    mapController.findRoute(req, res);
});

router.get('/search/:mapId', (req, res) => {
    mapController.searchRooms(req, res);
});

module.exports = router;