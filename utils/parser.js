// SVG Map Parser - конвертує SVG карти у JSON формат
class SVGMapParser {
    constructor() {
        this.mapData = {
            building: {},
            floors: [],
            rooms: [],
            nodes: [],
            edges: [],
            metadata: {}
        };
    }

    /**
     * Основна функція парсингу SVG
     * @param {string} svgContent - вміст SVG файлу
     * @returns {Object} - об'єкт з даними карти
     */
    parse(svgContent) {
        // Створюємо DOM parser для роботи з SVG
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(svgContent, 'image/svg+xml');

        // Перевіряємо на помилки парсингу
        const parseError = svgDoc.querySelector('parsererror');
        if (parseError) {
            throw new Error('Invalid SVG format: ' + parseError.textContent);
        }

        // Отримуємо root SVG елемент
        const svgElement = svgDoc.querySelector('svg');
        if (!svgElement) {
            throw new Error('SVG element not found');
        }

        // Парсимо різні секції
        this.parseMetadata(svgElement);
        this.parseBuilding(svgElement);
        this.parseFloors(svgElement);
        this.parseRooms(svgElement);
        this.parseNodes(svgElement);
        this.parseEdges(svgElement);

        return this.mapData;
    }

    /**
     * Парсить метадані SVG
     */
    parseMetadata(svgElement) {
        const viewBox = svgElement.getAttribute('viewBox');
        if (viewBox) {
            const [x, y, width, height] = viewBox.split(' ').map(Number);
            this.mapData.metadata = {
                viewBox: { x, y, width, height },
                width: svgElement.getAttribute('width') || width,
                height: svgElement.getAttribute('height') || height
            };
        }
    }

    /**
     * Парсить інформацію про будівлю
     */
    parseBuilding(svgElement) {
        const buildingElement = svgElement.querySelector('[data-name="building"]');
        if (buildingElement) {
            this.mapData.building = {
                id: buildingElement.id,
                label: buildingElement.getAttribute('data-label') || '',
                address: buildingElement.getAttribute('data-adress') || buildingElement.getAttribute('data-address') || ''
            };
        }
    }

    /**
     * Парсить інформацію про поверхи
     */
    parseFloors(svgElement) {
        const floorElements = svgElement.querySelectorAll('[data-name="floor"]');
        floorElements.forEach(floorElement => {
            const floor = {
                id: floorElement.id,
                number: floorElement.getAttribute('data-floor'),
                buildingId: floorElement.parentElement?.id || ''
            };
            this.mapData.floors.push(floor);
        });
    }

    /**
     * Парсить кімнати
     */
    parseRooms(svgElement) {
        const roomElements = svgElement.querySelectorAll('[data-name="room"]');
        roomElements.forEach(roomElement => {
            const room = {
                id: roomElement.id,
                nodeId: roomElement.getAttribute('data-node-id') || '',
                label: roomElement.getAttribute('data-label') || '',
                category: roomElement.getAttribute('data-category') || '',
                keywords: this.parseKeywords(roomElement.getAttribute('data-keywords')),
                access: roomElement.getAttribute('data-access') === 'true',
                geometry: this.parseGeometry(roomElement),
                style: this.parseStyle(roomElement)
            };
            this.mapData.rooms.push(room);
        });
    }

    /**
     * Парсить вузли навігації
     */
    parseNodes(svgElement) {
        const nodeElements = svgElement.querySelectorAll('[data-name="node"]');
        nodeElements.forEach(nodeElement => {
            const node = {
                id: nodeElement.id,
                type: nodeElement.getAttribute('data-type') || 'nav',
                roomId: nodeElement.getAttribute('data-room-id') || 'none',
                position: this.parseNodePosition(nodeElement),
                geometry: this.parseGeometry(nodeElement)
            };
            this.mapData.nodes.push(node);
        });
    }

    /**
     * Парсить з'єднання між вузлами
     */
    parseEdges(svgElement) {
        const edgeElements = svgElement.querySelectorAll('[data-name="edge"]');
        edgeElements.forEach(edgeElement => {
            const nodesId = edgeElement.getAttribute('data-nodes-id') || '';
            const [fromNodeId, toNodeId] = nodesId.split(',');

            const edge = {
                id: edgeElement.id,
                fromNodeId: fromNodeId?.trim() || '',
                toNodeId: toNodeId?.trim() || '',
                weight: parseFloat(edgeElement.getAttribute('data-weight')) || 1,
                geometry: this.parseGeometry(edgeElement)
            };
            this.mapData.edges.push(edge);
        });
    }

    /**
     * Парсить ключові слова
     */
    parseKeywords(keywordsString) {
        if (!keywordsString) return [];
        return keywordsString.split(',').map(keyword => keyword.trim());
    }

    /**
     * Парсить геометрію елемента
     */
    parseGeometry(element) {
        const geometry = {
            type: element.tagName.toLowerCase(),
            coordinates: [],
            attributes: {}
        };

        switch (element.tagName.toLowerCase()) {
            case 'rect':
                geometry.coordinates = {
                    x: parseFloat(element.getAttribute('x')) || 0,
                    y: parseFloat(element.getAttribute('y')) || 0,
                    width: parseFloat(element.getAttribute('width')) || 0,
                    height: parseFloat(element.getAttribute('height')) || 0
                };
                break;

            case 'polygon':
                const polygonPoints = element.getAttribute('points') || '';
                geometry.coordinates = this.parsePoints(polygonPoints);
                break;

            case 'polyline':
                const polylinePoints = element.getAttribute('points') || '';
                geometry.coordinates = this.parsePoints(polylinePoints);
                break;

            case 'path':
                geometry.coordinates = element.getAttribute('d') || '';
                break;

            case 'g':
                // For groups, find child elements with geometry
                const childElements = element.children;
                if (childElements.length > 0) {
                    geometry.children = Array.from(childElements).map(child =>
                        this.parseGeometry(child)
                    );
                }
                break;
        }

        // Додаємо transform атрибут якщо він є
        const transform = element.getAttribute('transform');
        if (transform) {
            geometry.transform = transform;
        }

        return geometry;
    }

    /**
     * Парсить points атрибут для polygon/polyline
     */
    parsePoints(pointsString) {
        if (!pointsString) return [];

        // Обробляємо різні формати points: "x1,y1 x2,y2" або "x1 y1 x2 y2"
        const points = [];
        const coords = pointsString.trim().replace(/,/g, ' ').split(/\s+/).map(Number);

        for (let i = 0; i < coords.length; i += 2) {
            if (i + 1 < coords.length) {
                points.push({
                    x: coords[i] || 0,
                    y: coords[i + 1] || 0
                });
            }
        }

        return points;
    }

    /**
     * Парсить позицію вузла з урахуванням transform
     */
    parseNodePosition(nodeElement) {
        const rect = nodeElement.querySelector('rect, polygon');
        if (!rect) return { x: 0, y: 0 };

        let position = { x: 0, y: 0 };

        if (rect.tagName.toLowerCase() === 'rect') {
            position = {
                x: parseFloat(rect.getAttribute('x')) || 0,
                y: parseFloat(rect.getAttribute('y')) || 0
            };
        } else if (rect.tagName.toLowerCase() === 'polygon') {
            const points = this.parsePoints(rect.getAttribute('points') || '');
            if (points.length > 0) {
                // Обчислюємо центр полігону
                const centerX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
                const centerY = points.reduce((sum, p) => sum + p.y, 0) / points.length;
                position = { x: centerX, y: centerY };
            }
        }

        // Застосовуємо transform якщо є
        const transform = rect.getAttribute('transform');
        if (transform) {
            position = this.applyTransform(position, transform);
        }

        return position;
    }

    /**
     * Застосовує transform до координат (спрощена версія)
     */
    applyTransform(point, transformString) {
        // Простий парсинг translate() transform
        const translateMatch = transformString.match(/translate\(([^)]+)\)/);
        if (translateMatch) {
            const [tx, ty] = translateMatch[1].split(/[,\s]+/).map(Number);
            return {
                x: point.x + (tx || 0),
                y: point.y + (ty || 0)
            };
        }
        return point;
    }

    /**
     * Парсить стилі елемента
     */
    parseStyle(element) {
        const classList = Array.from(element.classList || []);
        const style = {
            classes: classList,
            fill: element.getAttribute('fill') || '',
            stroke: element.getAttribute('stroke') || '',
            strokeWidth: element.getAttribute('stroke-width') || ''
        };

        return style;
    }

    /**
     * Знаходить кімнату за її вузлом
     */
    findRoomByNodeId(nodeId) {
        return this.mapData.rooms.find(room => room.nodeId === nodeId);
    }

    /**
     * Знаходить всі з'єднання для вузла
     */
    findEdgesForNode(nodeId) {
        return this.mapData.edges.filter(edge =>
            edge.fromNodeId === nodeId || edge.toNodeId === nodeId
        );
    }

    /**
     * Створює граф для навігації
     */
    buildNavigationGraph() {
        const graph = new Map();

        // Ініціалізуємо всі вузли
        this.mapData.nodes.forEach(node => {
            graph.set(node.id, {
                ...node,
                connections: []
            });
        });

        // Додаємо з'єднання
        this.mapData.edges.forEach(edge => {
            const fromNode = graph.get(edge.fromNodeId);
            const toNode = graph.get(edge.toNodeId);

            if (fromNode && toNode) {
                fromNode.connections.push({
                    nodeId: edge.toNodeId,
                    weight: edge.weight,
                    edgeId: edge.id
                });

                toNode.connections.push({
                    nodeId: edge.fromNodeId,
                    weight: edge.weight,
                    edgeId: edge.id
                });
            }
        });

        return graph;
    }

    /**
     * Експортує дані у JSON
     */
    toJSON() {
        return JSON.stringify(this.mapData, null, 2);
    }

    /**
     * Створює спрощену версію даних для навігації
     */
    toNavigationData() {
        return {
            metadata: this.mapData.metadata,
            building: this.mapData.building,
            rooms: this.mapData.rooms.map(room => ({
                id: room.id,
                nodeId: room.nodeId,
                label: room.label,
                category: room.category,
                keywords: room.keywords,
                access: room.access,
                center: this.calculateRoomCenter(room.geometry)
            })),
            nodes: this.mapData.nodes.map(node => ({
                id: node.id,
                type: node.type,
                roomId: node.roomId,
                position: node.position
            })),
            edges: this.mapData.edges.map(edge => ({
                id: edge.id,
                from: edge.fromNodeId,
                to: edge.toNodeId,
                weight: edge.weight
            })),
            graph: this.buildSimpleGraph()
        };
    }

    /**
     * Обчислює центр кімнати
     */
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

    /**
     * Створює простий граф для алгоритмів пошуку шляху
     */
    buildSimpleGraph() {
        const graph = {};

        // Ініціалізуємо вузли
        this.mapData.nodes.forEach(node => {
            graph[node.id] = {
                position: node.position,
                roomId: node.roomId,
                connections: []
            };
        });

        // Додаємо з'єднання
        this.mapData.edges.forEach(edge => {
            if (graph[edge.fromNodeId] && graph[edge.toNodeId]) {
                graph[edge.fromNodeId].connections.push({
                    nodeId: edge.toNodeId,
                    weight: edge.weight
                });

                graph[edge.toNodeId].connections.push({
                    nodeId: edge.fromNodeId,
                    weight: edge.weight
                });
            }
        });

        return graph;
    }
}

// Функція для використання парсера
function parseSVGMap(svgContent) {
    const parser = new SVGMapParser();
    return parser.parse(svgContent);
}

// Експорт для використання в Node.js або браузері
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SVGMapParser, parseSVGMap };
} else if (typeof window !== 'undefined') {
    window.SVGMapParser = SVGMapParser;
    window.parseSVGMap = parseSVGMap;
}

// Приклад використання:
/*
// Читання SVG файлу та парсинг
fetch('map_10_01.svg')
    .then(response => response.text())
    .then(svgContent => {
        const mapData = parseSVGMap(svgContent);
        console.log('Parsed map data:', mapData);
        
        // Збереження в JSON
        const jsonData = JSON.stringify(mapData, null, 2);
        console.log('JSON output:', jsonData);
    })
    .catch(error => {
        console.error('Error parsing SVG:', error);
    });

// Або з використанням класу
const parser = new SVGMapParser();
const mapData = parser.parse(svgContent);
const navigationGraph = parser.buildNavigationGraph();
*/