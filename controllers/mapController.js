const fs = require('fs').promises;
const path = require('path');
const { parseSVGMap } = require('../parser');
const NodeCache = require('node-cache');
const Fuse = require('fuse.js');

// Кеш для збереження парсованих карт
const mapCache = new NodeCache({ stdTTL: 3600 }); // кеш на 1 годину

class MapController {
    constructor() {
        this.mapsDirectory = path.join(__dirname, '../data/maps');
    }

    // Отримання головної сторінки карти
    async getMapPage(req, res) {
        try {
            const availableMaps = await this.getAvailableMaps();
            const defaultMapId = availableMaps.length > 0 ? availableMaps[0].id : null;

            res.render('pages/map', {
                title: 'Інтерактивна карта університету',
                page: 'map',
                availableMaps,
                defaultMapId
            });
        } catch (error) {
            console.error('Error loading map page:', error);
            res.status(500).render('pages/error', {
                title: 'Помилка сервера',
                error: 'Не вдалося завантажити карту'
            });
        }
    }

    // Отримання даних карти
    async getMapData(req, res) {
        try {
            const { mapId } = req.params;
            const mapData = await this.parseMap(mapId);

            if (!mapData) {
                return res.status(404).json({
                    error: 'Карту не знайдено'
                });
            }

            res.json(mapData);
        } catch (error) {
            console.error('Error getting map data:', error);
            res.status(500).json({
                error: 'Помилка завантаження карти'
            });
        }
    }

    // Отримання поверхів карти
    async getFloors(req, res) {
        try {
            const { mapId } = req.params;
            const mapData = await this.parseMap(mapId);

            if (!mapData) {
                return res.status(404).json({
                    error: 'Карту не знайдено'
                });
            }

            res.json({
                floors: mapData.floors,
                building: mapData.building
            });
        } catch (error) {
            console.error('Error getting floors:', error);
            res.status(500).json({
                error: 'Помилка завантаження поверхів'
            });
        }
    }

    // Отримання кімнат карти
    async getRooms(req, res) {
        try {
            const { mapId } = req.params;
            const mapData = await this.parseMap(mapId);

            if (!mapData) {
                return res.status(404).json({
                    error: 'Карту не знайдено'
                });
            }

            res.json({
                rooms: mapData.rooms,
                nodes: mapData.nodes
            });
        } catch (error) {
            console.error('Error getting rooms:', error);
            res.status(500).json({
                error: 'Помилка завантаження кімнат'
            });
        }
    }

    // Пошук маршруту між двома точками
    async findRoute(req, res) {
        try {
            const { mapId, fromRoomId, toRoomId } = req.body;

            if (!mapId || !fromRoomId || !toRoomId) {
                return res.status(400).json({
                    error: 'Не вказані обов\'язкові параметри'
                });
            }

            const mapData = await this.parseMap(mapId);
            if (!mapData) {
                return res.status(404).json({
                    error: 'Карту не знайдено'
                });
            }

            const route = this.dijkstraRoute(mapData, fromRoomId, toRoomId);

            if (!route) {
                return res.status(404).json({
                    error: 'Маршрут не знайдено'
                });
            }

            res.json({ route });
        } catch (error) {
            console.error('Error finding route:', error);
            res.status(500).json({
                error: 'Помилка пошуку маршруту'
            });
        }
    }

    // Пошук кімнат
    async searchRooms(req, res) {
        try {
            const { mapId } = req.params;
            const { query, category } = req.query;

            const mapData = await this.parseMap(mapId);
            if (!mapData) {
                return res.status(404).json({
                    error: 'Карту не знайдено'
                });
            }

            let results = mapData.rooms;

            // Фільтрація за категорією
            if (category && category !== 'all') {
                results = results.filter(room => room.category === category);
            }

            // Пошук за запитом
            if (query) {
                const fuse = new Fuse(results, {
                    keys: ['label', 'category', 'keywords'],
                    threshold: 0.3
                });
                results = fuse.search(query).map(result => result.item);
            }

            res.json({ results });
        } catch (error) {
            console.error('Error searching rooms:', error);
            res.status(500).json({
                error: 'Помилка пошуку'
            });
        }
    }

    // Приватні методи

    // Отримання доступних карт
    async getAvailableMaps() {
        try {
            // Створюємо директорію якщо її немає
            await this.ensureMapsDirectory();

            const files = await fs.readdir(this.mapsDirectory);
            const svgFiles = files.filter(file =>
                file.endsWith('.svg') && file.startsWith('map-')
            );

            return svgFiles.map(file => ({
                id: file.replace('.svg', ''),
                name: this.formatMapName(file),
                file: file
            }));
        } catch (error) {
            console.error('Error getting available maps:', error);
            return [];
        }
    }

    // Створення директорії для карт
    async ensureMapsDirectory() {
        try {
            await fs.access(this.mapsDirectory);
        } catch (error) {
            // Директорія не існує, створюємо її
            await fs.mkdir(this.mapsDirectory, { recursive: true });
            console.log(`Created maps directory: ${this.mapsDirectory}`);
        }
    }

    // Форматування назви карти
    formatMapName(filename) {
        const mapId = filename.replace('.svg', '').replace('map-', '');
        const parts = mapId.split('-');

        if (parts.length >= 2) {
            return `Будівля ${parts[0]}, Поверх ${parts[1]}`;
        }

        return `Карта ${mapId}`;
    }

    // Парсинг карти з кешуванням
    async parseMap(mapId) {
        // Перевіряємо кеш
        const cached = mapCache.get(mapId);
        if (cached) {
            return cached;
        }

        try {
            const filename = `${mapId}.svg`;
            const filePath = path.join(this.mapsDirectory, filename);

            // Перевіряємо чи існує файл
            await fs.access(filePath);

            const svgContent = await fs.readFile(filePath, 'utf8');
            const mapData = parseSVGMap(svgContent);

            // Зберігаємо в кеш
            mapCache.set(mapId, mapData);
            console.log(`Parsed and cached map: ${mapId}`);

            return mapData;
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.error(`Map file not found: ${mapId}.svg`);
            } else {
                console.error(`Error parsing map ${mapId}:`, error);
            }
            return null;
        }
    }

    // Алгоритм Дейкстри для пошуку найкоротшого шляху
    dijkstraRoute(mapData, fromRoomId, toRoomId) {
        // Знаходимо кімнати
        const fromRoom = mapData.rooms.find(room => room.id === fromRoomId);
        const toRoom = mapData.rooms.find(room => room.id === toRoomId);

        if (!fromRoom || !toRoom) {
            console.log(`Room not found: from=${fromRoomId}, to=${toRoomId}`);
            return null;
        }

        // Знаходимо відповідні вузли
        let fromNodeId = fromRoom.nodeId;
        let toNodeId = toRoom.nodeId;

        // Якщо прямі вузли не знайдено, шукаємо найближчі навігаційні вузли
        if (!fromNodeId || !mapData.nodes.find(n => n.id === fromNodeId)) {
            fromNodeId = this.findNearestNode(fromRoom, mapData.nodes);
        }

        if (!toNodeId || !mapData.nodes.find(n => n.id === toNodeId)) {
            toNodeId = this.findNearestNode(toRoom, mapData.nodes);
        }

        if (!fromNodeId || !toNodeId) {
            console.log(`Navigation nodes not found: from=${fromNodeId}, to=${toNodeId}`);
            return null;
        }

        return this.findShortestPath(mapData, fromNodeId, toNodeId);
    }

    // Пошук найближчого вузла до кімнати
    findNearestNode(room, nodes) {
        if (!room.geometry || !room.geometry.children) {
            console.log(`No geometry for room: ${room.id}`);
            return null;
        }

        const roomCenter = this.calculateRoomCenter(room.geometry);
        let nearestNode = null;
        let minDistance = Infinity;

        nodes.forEach(node => {
            if (node.type === 'nav') { // тільки навігаційні вузли
                const distance = Math.sqrt(
                    Math.pow(node.position.x - roomCenter.x, 2) +
                    Math.pow(node.position.y - roomCenter.y, 2)
                );

                if (distance < minDistance) {
                    minDistance = distance;
                    nearestNode = node.id;
                }
            }
        });

        return nearestNode;
    }

    // Обчислення центру кімнати
    calculateRoomCenter(geometry) {
        if (!geometry || !geometry.children || geometry.children.length === 0) {
            return { x: 0, y: 0 };
        }

        const shape = geometry.children[0];

        if (shape.type === 'rect' && shape.coordinates) {
            return {
                x: shape.coordinates.x + shape.coordinates.width / 2,
                y: shape.coordinates.y + shape.coordinates.height / 2
            };
        }

        if (shape.type === 'polygon' || shape.type === 'polyline') {
            const points = shape.coordinates;
            if (points.length > 0) {
                const centerX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
                const centerY = points.reduce((sum, p) => sum + p.y, 0) / points.length;
                return { x: centerX, y: centerY };
            }
        }

        return { x: 0, y: 0 };
    }

    // Пошук найкоротшого шляху
    findShortestPath(mapData, fromNodeId, toNodeId) {
        // Будуємо граф
        const graph = this.buildGraph(mapData);

        // Перевіряємо чи існують вузли в графі
        if (!graph[fromNodeId] || !graph[toNodeId]) {
            console.log(`Nodes not in graph: from=${fromNodeId}, to=${toNodeId}`);
            return null;
        }

        // Виконуємо алгоритм Дейкстри
        const distances = {};
        const previous = {};
        const unvisited = new Set();

        // Ініціалізація
        for (const nodeId in graph) {
            distances[nodeId] = Infinity;
            previous[nodeId] = null;
            unvisited.add(nodeId);
        }

        distances[fromNodeId] = 0;

        while (unvisited.size > 0) {
            // Знаходимо вузол з найменшою відстанню
            let currentNode = null;
            let minDistance = Infinity;

            for (const nodeId of unvisited) {
                if (distances[nodeId] < minDistance) {
                    minDistance = distances[nodeId];
                    currentNode = nodeId;
                }
            }

            if (currentNode === null || distances[currentNode] === Infinity) {
                console.log('No path found - disconnected graph');
                break;
            }

            unvisited.delete(currentNode);

            // Якщо досягли цілі
            if (currentNode === toNodeId) {
                break;
            }

            // Оновлюємо відстані до сусідів
            const neighbors = graph[currentNode] || [];
            for (const neighbor of neighbors) {
                if (unvisited.has(neighbor.nodeId)) {
                    const newDistance = distances[currentNode] + neighbor.weight;
                    if (newDistance < distances[neighbor.nodeId]) {
                        distances[neighbor.nodeId] = newDistance;
                        previous[neighbor.nodeId] = currentNode;
                    }
                }
            }
        }

        // Відновлюємо шлях
        const path = [];
        let currentNode = toNodeId;

        while (currentNode !== null) {
            path.unshift(currentNode);
            currentNode = previous[currentNode];
        }

        if (path[0] !== fromNodeId) {
            console.log('No valid path found');
            return null; // Шлях не знайдено
        }

        // Додаємо інформацію про кімнати та вузли
        const routeNodes = path.map(nodeId => {
            const node = mapData.nodes.find(n => n.id === nodeId);
            const room = mapData.rooms.find(r => r.nodeId === nodeId);
            return {
                nodeId,
                node,
                room
            };
        });

        return {
            path,
            nodes: routeNodes,
            distance: distances[toNodeId],
            edges: this.getEdgesForPath(mapData, path)
        };
    }

    // Побудова графа з вузлів та ребер
    buildGraph(mapData) {
        const graph = {};

        // Ініціалізуємо вузли
        mapData.nodes.forEach(node => {
            graph[node.id] = [];
        });

        // Додаємо ребра
        mapData.edges.forEach(edge => {
            const { fromNodeId, toNodeId, weight } = edge;

            if (graph[fromNodeId] && graph[toNodeId]) {
                graph[fromNodeId].push({ nodeId: toNodeId, weight });
                graph[toNodeId].push({ nodeId: fromNodeId, weight });
            }
        });

        return graph;
    }

    // Отримання ребер для шляху
    getEdgesForPath(mapData, path) {
        const edges = [];

        for (let i = 0; i < path.length - 1; i++) {
            const fromNodeId = path[i];
            const toNodeId = path[i + 1];

            const edge = mapData.edges.find(e =>
                (e.fromNodeId === fromNodeId && e.toNodeId === toNodeId) ||
                (e.fromNodeId === toNodeId && e.toNodeId === fromNodeId)
            );

            if (edge) {
                edges.push(edge);
            }
        }

        return edges;
    }
}

// Створюємо та експортуємо екземпляр контролера
const mapController = new MapController();
module.exports = mapController;