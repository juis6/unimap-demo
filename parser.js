// Імпорт JSDOM для серверного середовища
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

// SVG Map Parser - конвертує SVG карти у JSON формат
class SVGMapParser {
    constructor() {
        this.mapData = {
            building: {},
            floors: [],
            rooms: [],
            walls: [],
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
        // Створюємо JSDOM для серверного середовища
        const dom = new JSDOM(svgContent, { contentType: "image/svg+xml" });
        const svgDoc = dom.window.document;

        // Отримуємо root SVG елемент
        const svgElement = svgDoc.querySelector('svg');
        if (!svgElement) {
            throw new Error('SVG element not found');
        }

        // Парсимо різні секції
        this.parseMetadata(svgElement);
        this.parseBuilding(svgElement);
        this.parseFloors(svgElement);
        this.parseWalls(svgElement);
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

        // Якщо поверхи не знайдено, додаємо базовий поверх
        if (this.mapData.floors.length === 0) {
            this.mapData.floors.push({
                id: '20-01-01',
                number: '1',
                buildingId: '10-01'
            });
        }
    }

    /**
     * Парсить стіни
     */
    parseWalls(svgElement) {
        const wallElements = svgElement.querySelectorAll('[data-name="walls"], [data-name="hatch"]');
        wallElements.forEach(wallElement => {
            const wall = {
                id: wallElement.id,
                type: wallElement.getAttribute('data-name') || 'wall',
                geometry: this.parseGeometry(wallElement),
                style: this.parseStyle(wallElement)
            };
            this.mapData.walls.push(wall);
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
            const nodeId = nodeElement.id;

            // Пропускаємо вузли типу 31-01-00-xxx для звичайних поверхів
            // Вони використовуються лише для міжповерхової навігації
            if (nodeId && nodeId.match(/^31-01-00-\d+$/)) {
                return;
            }

            const node = {
                id: nodeId,
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
     * Парсить позицію вузла
     */
    parseNodePosition(nodeElement) {
        const shapes = nodeElement.querySelectorAll('rect, polygon, circle');
        if (shapes.length === 0) return { x: 0, y: 0 };

        const shape = shapes[0];
        let position = { x: 0, y: 0 };

        switch (shape.tagName.toLowerCase()) {
            case 'rect':
                position = {
                    x: parseFloat(shape.getAttribute('x')) || 0,
                    y: parseFloat(shape.getAttribute('y')) || 0
                };
                break;
            case 'circle':
                position = {
                    x: parseFloat(shape.getAttribute('cx')) || 0,
                    y: parseFloat(shape.getAttribute('cy')) || 0
                };
                break;
            case 'polygon':
                const points = this.parsePoints(shape.getAttribute('points') || '');
                if (points.length > 0) {
                    const centerX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
                    const centerY = points.reduce((sum, p) => sum + p.y, 0) / points.length;
                    position = { x: centerX, y: centerY };
                }
                break;
        }

        // Застосовуємо transform якщо є
        const transform = shape.getAttribute('transform');
        if (transform) {
            position = this.applyTransform(position, transform);
        }

        return position;
    }

    /**
     * Застосовує transform до координат
     */
    applyTransform(point, transformString) {
        const translateMatch = transformString.match(/translate\(([^)]+)\)/);
        if (translateMatch) {
            const coords = translateMatch[1].split(/[,\s]+/).map(Number);
            const tx = coords[0] || 0;
            const ty = coords[1] || 0;
            return {
                x: point.x + tx,
                y: point.y + ty
            };
        }
        return point;
    }

    /**
     * Парсить стилі елемента
     */
    parseStyle(element) {
        const classList = Array.from(element.classList || []);
        return {
            classes: classList,
            fill: element.getAttribute('fill') || '',
            stroke: element.getAttribute('stroke') || '',
            strokeWidth: element.getAttribute('stroke-width') || ''
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
}

// Функція для використання парсера
function parseSVGMap(svgContent) {
    const parser = new SVGMapParser();
    return parser.parse(svgContent);
}

module.exports = { SVGMapParser, parseSVGMap };