// Основний клас для роботи з картою
class MapCore {
    constructor() {
        this.currentMapData = null;
        this.selectedRoom = null;
        this.currentRoute = null;
        this.zoomLevel = 1;
        this.panX = 0;
        this.panY = 0;
        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;

        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.loadDefaultMap();
    }

    setupEventListeners() {
        // Завантаження карти
        document.getElementById('load-map').addEventListener('click', () => {
            this.loadSelectedMap();
        });

        // Контроли масштабування
        document.getElementById('zoom-in').addEventListener('click', () => {
            this.zoomIn();
        });

        document.getElementById('zoom-out').addEventListener('click', () => {
            this.zoomOut();
        });

        document.getElementById('reset-view').addEventListener('click', () => {
            this.resetView();
        });

        // Перемикання підписів
        document.getElementById('toggle-labels').addEventListener('click', () => {
            this.toggleLabels();
        });

        // Обробка перетягування карти
        const svgContainer = document.getElementById('svg-container');
        svgContainer.addEventListener('mousedown', (e) => this.startDrag(e));
        svgContainer.addEventListener('mousemove', (e) => this.drag(e));
        svgContainer.addEventListener('mouseup', () => this.endDrag());
        svgContainer.addEventListener('mouseleave', () => this.endDrag());

        // Масштабування колесом миші
        svgContainer.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (e.deltaY < 0) {
                this.zoomIn();
            } else {
                this.zoomOut();
            }
        });

        // Закриття модального вікна помилок
        document.getElementById('close-error').addEventListener('click', () => {
            this.hideError();
        });
    }

    async loadDefaultMap() {
        if (window.mapConfig.defaultMapId) {
            await this.loadMap(window.mapConfig.defaultMapId);
        }
    }

    async loadSelectedMap() {
        const mapSelect = document.getElementById('map-list');
        const selectedMapId = mapSelect.value;

        if (selectedMapId) {
            await this.loadMap(selectedMapId);
        }
    }

    async loadMap(mapId) {
        this.showLoading();

        try {
            const response = await fetch(`/map/data/${mapId}`);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const mapData = await response.json();
            this.currentMapData = mapData;

            await this.renderMap();
            await this.loadFloors();
            await this.loadRooms();

            this.updateSystemInfo();
            this.hideLoading();

        } catch (error) {
            console.error('Error loading map:', error);
            this.showError('Помилка завантаження карти: ' + error.message);
            this.hideLoading();
        }
    }

    async renderMap() {
        if (!this.currentMapData) return;

        const svgContainer = document.getElementById('map-svg');
        svgContainer.innerHTML = '';

        // Створюємо SVG елемент
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        const viewBox = this.currentMapData.metadata.viewBox;

        if (viewBox) {
            svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
        }

        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100%');
        svg.setAttribute('id', 'main-svg');

        // Додаємо стилі
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
        style.textContent = this.getMapStyles();
        defs.appendChild(style);
        svg.appendChild(defs);

        // Рендеримо в правильному порядку (стіни -> ребра -> кімнати -> вузли)
        this.renderWalls(svg);
        this.renderEdges(svg);
        this.renderRooms(svg);
        this.renderNodes(svg);

        svgContainer.appendChild(svg);

        // Оновлюємо інформацію про будівлю
        this.updateBuildingInfo();
    }

    // Додаємо метод для рендерингу стін
    renderWalls(svg) {
        if (!this.currentMapData.walls) return;

        const wallsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        wallsGroup.setAttribute('id', 'walls-group');

        this.currentMapData.walls.forEach(wall => {
            const wallElement = this.createWallElement(wall);
            if (wallElement) {
                wallsGroup.appendChild(wallElement);
            }
        });

        svg.appendChild(wallsGroup);
    }

    createWallElement(wall) {
        if (!wall.geometry || !wall.geometry.children || wall.geometry.children.length === 0) {
            return null;
        }

        const wallGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        wallGroup.setAttribute('id', wall.id);
        wallGroup.classList.add('wall');

        wall.geometry.children.forEach(child => {
            const element = this.createGeometryElement(child);
            if (element) {
                wallGroup.appendChild(element);
            }
        });

        return wallGroup;
    }

    renderRooms(svg) {
        if (!this.currentMapData.rooms) return;

        const roomsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        roomsGroup.setAttribute('id', 'rooms-group');

        this.currentMapData.rooms.forEach(room => {
            const roomElement = this.createRoomElement(room);
            if (roomElement) {
                roomsGroup.appendChild(roomElement);
            }
        });

        svg.appendChild(roomsGroup);
    }

    createRoomElement(room) {
        if (!room.geometry || !room.geometry.children || room.geometry.children.length === 0) {
            return null;
        }

        const roomGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        roomGroup.setAttribute('id', room.id);
        roomGroup.setAttribute('data-room-id', room.id);
        roomGroup.setAttribute('data-room-label', room.label);
        roomGroup.setAttribute('data-room-category', room.category);
        roomGroup.classList.add('room');
        roomGroup.classList.add(`category-${room.category}`);

        // Створюємо геометрію кімнати
        room.geometry.children.forEach(child => {
            const element = this.createGeometryElement(child);
            if (element) {
                roomGroup.appendChild(element);
            }
        });

        // Додаємо обробники подій
        roomGroup.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectRoom(room);
        });

        roomGroup.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showContextMenu(e, room);
        });

        roomGroup.addEventListener('mouseenter', () => {
            this.highlightRoom(room.id, true);
        });

        roomGroup.addEventListener('mouseleave', () => {
            this.highlightRoom(room.id, false);
        });

        return roomGroup;
    }

    createGeometryElement(geometry) {
        let element;

        switch (geometry.type) {
            case 'rect':
                element = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                element.setAttribute('x', geometry.coordinates.x);
                element.setAttribute('y', geometry.coordinates.y);
                element.setAttribute('width', geometry.coordinates.width);
                element.setAttribute('height', geometry.coordinates.height);
                break;

            case 'polygon':
                element = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                const points = geometry.coordinates.map(p => `${p.x},${p.y}`).join(' ');
                element.setAttribute('points', points);
                break;

            case 'polyline':
                element = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
                const polyPoints = geometry.coordinates.map(p => `${p.x},${p.y}`).join(' ');
                element.setAttribute('points', polyPoints);
                break;

            case 'path':
                element = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                element.setAttribute('d', geometry.coordinates);
                break;

            default:
                return null;
        }

        if (geometry.transform) {
            element.setAttribute('transform', geometry.transform);
        }

        return element;
    }

    renderNodes(svg) {
        if (!this.currentMapData.nodes) return;

        // Просто копіюємо оригінальні nodes елементи без змін
        const originalSvg = document.querySelector('#main-svg');
        if (originalSvg) {
            // Знаходимо оригінальні nodes в SVG
            const originalNodes = svg.ownerDocument.querySelectorAll('[data-name="node"]');

            // Створюємо групу для nodes
            const nodesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            nodesGroup.setAttribute('id', 'nodes-group');

            // Копіюємо кожен node як є
            this.currentMapData.nodes.forEach(nodeData => {
                // Створюємо копію оригінального node елемента
                const nodeElement = this.createOriginalNodeCopy(nodeData);
                if (nodeElement) {
                    nodesGroup.appendChild(nodeElement);
                }
            });

            svg.appendChild(nodesGroup);
        }
    }

    createOriginalNodeCopy(nodeData) {
        // Створюємо точну копію оригінального node з геометрією
        if (!nodeData.geometry) return null;

        const nodeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        nodeGroup.setAttribute('id', nodeData.id);
        nodeGroup.setAttribute('data-name', 'node');
        nodeGroup.setAttribute('data-type', nodeData.type);
        nodeGroup.setAttribute('data-room-id', nodeData.roomId);

        // Копіюємо всю оригінальну геометрію
        if (nodeData.geometry.children) {
            nodeData.geometry.children.forEach(child => {
                const element = this.createGeometryElement(child);
                if (element) {
                    nodeGroup.appendChild(element);
                }
            });
        }

        return nodeGroup;
    }

    renderEdges(svg) {
        if (!this.currentMapData.edges) return;

        // Створюємо групу для edges
        const edgesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        edgesGroup.setAttribute('id', 'edges-group');

        // Копіюємо кожен edge як є
        this.currentMapData.edges.forEach(edgeData => {
            const edgeElement = this.createOriginalEdgeCopy(edgeData);
            if (edgeElement) {
                edgesGroup.appendChild(edgeElement);
            }
        });

        svg.appendChild(edgesGroup);
    }

    createOriginalEdgeCopy(edgeData) {
        // Створюємо точну копію оригінального edge з геометрією
        if (!edgeData.geometry) return null;

        const edgeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        edgeGroup.setAttribute('id', edgeData.id);
        edgeGroup.setAttribute('data-name', 'edge');
        edgeGroup.setAttribute('data-weight', edgeData.weight);
        edgeGroup.setAttribute('data-nodes-id', `${edgeData.fromNodeId},${edgeData.toNodeId}`);

        // Копіюємо всю оригінальну геометрію
        if (edgeData.geometry.children) {
            edgeData.geometry.children.forEach(child => {
                const element = this.createGeometryElement(child);
                if (element) {
                    edgeGroup.appendChild(element);
                }
            });
        }

        return edgeGroup;
    }

    async loadFloors() {
        if (!this.currentMapData) return;

        const floorButtons = document.getElementById('floor-buttons');
        floorButtons.innerHTML = '';

        if (this.currentMapData.floors && this.currentMapData.floors.length > 0) {
            this.currentMapData.floors.forEach(floor => {
                const button = document.createElement('button');
                button.textContent = `Поверх ${floor.number}`;
                button.setAttribute('data-floor', floor.number);
                button.classList.add('floor-button');

                if (floor.number === '1') {
                    button.classList.add('active');
                    document.getElementById('current-floor').textContent = floor.number;
                }

                button.addEventListener('click', () => {
                    this.selectFloor(floor.number);
                });

                floorButtons.appendChild(button);
            });
        } else {
            // Якщо поверхи не визначені, показуємо поточну карту як єдиний поверх
            const button = document.createElement('button');
            button.textContent = 'Поверх 1';
            button.classList.add('floor-button', 'active');
            floorButtons.appendChild(button);
            document.getElementById('current-floor').textContent = '1';
        }
    }

    async loadRooms() {
        if (!this.currentMapData || !this.currentMapData.rooms) return;

        // Оновлюємо випадаючі списки для навігації
        const fromSelect = document.getElementById('from-select');
        const toSelect = document.getElementById('to-select');

        fromSelect.innerHTML = '<option value="">Виберіть початкову кімнату</option>';
        toSelect.innerHTML = '<option value="">Виберіть кінцеву кімнату</option>';

        this.currentMapData.rooms.forEach(room => {
            if (room.access) { // Тільки доступні кімнати
                const option1 = document.createElement('option');
                option1.value = room.id;
                option1.textContent = room.label || room.id;
                fromSelect.appendChild(option1);

                const option2 = document.createElement('option');
                option2.value = room.id;
                option2.textContent = room.label || room.id;
                toSelect.appendChild(option2);
            }
        });
    }

    selectFloor(floorNumber) {
        // Оновлюємо активну кнопку поверху
        document.querySelectorAll('.floor-button').forEach(btn => {
            btn.classList.remove('active');
        });

        document.querySelector(`[data-floor="${floorNumber}"]`).classList.add('active');
        document.getElementById('current-floor').textContent = floorNumber;

        // Тут можна було б завантажити карту конкретного поверху
        // Поки що просто оновлюємо відображення
        console.log(`Selected floor: ${floorNumber}`);
    }

    selectRoom(room) {
        this.selectedRoom = room;

        // Підсвічуємо вибрану кімнату
        document.querySelectorAll('.room').forEach(r => r.classList.remove('selected'));
        document.getElementById(room.id).classList.add('selected');

        // Оновлюємо панель деталей кімнати
        this.updateRoomDetails(room);

        // Показуємо панель деталей
        document.getElementById('room-details').style.display = 'block';
    }

    updateRoomDetails(room) {
        document.getElementById('room-name').textContent = room.label || room.id;
        document.getElementById('room-category').textContent = `Категорія: ${this.getCategoryName(room.category)}`;
        document.getElementById('room-keywords').textContent = `Ключові слова: ${room.keywords.join(', ')}`;
        document.getElementById('room-access').textContent = `Доступ: ${room.access ? 'Дозволено' : 'Обмежено'}`;
    }

    getCategoryName(category) {
        const categories = {
            'laboratory': 'Лабораторія',
            'restroom': 'Туалет',
            'food-service': 'Їдальня',
            'utility': 'Підсобне приміщення',
            'recreation': 'Відпочинок',
            'workspace': 'Робоча зона'
        };
        return categories[category] || category;
    }

    highlightRoom(roomId, highlight) {
        const roomElement = document.getElementById(roomId);
        if (roomElement) {
            if (highlight) {
                roomElement.classList.add('highlighted');
            } else {
                roomElement.classList.remove('highlighted');
            }
        }
    }

    showContextMenu(event, room) {
        const contextMenu = document.getElementById('context-menu');
        const roomName = document.getElementById('context-room-name');

        roomName.textContent = room.label || room.id;

        contextMenu.style.display = 'block';
        contextMenu.style.left = event.pageX + 'px';
        contextMenu.style.top = event.pageY + 'px';

        // Додаємо обробники для контекстного меню
        document.getElementById('context-route-to').onclick = () => {
            this.setRouteDestination(room);
            this.hideContextMenu();
        };

        document.getElementById('context-route-from').onclick = () => {
            this.setRouteOrigin(room);
            this.hideContextMenu();
        };

        document.getElementById('context-room-info').onclick = () => {
            this.selectRoom(room);
            this.hideContextMenu();
        };

        // Закриваємо меню при кліку поза ним
        document.addEventListener('click', this.hideContextMenu.bind(this), { once: true });
    }

    hideContextMenu() {
        document.getElementById('context-menu').style.display = 'none';
    }

    setRouteDestination(room) {
        document.getElementById('to-select').value = room.id;
    }

    setRouteOrigin(room) {
        document.getElementById('from-select').value = room.id;
    }

    updateBuildingInfo() {
        if (this.currentMapData && this.currentMapData.building) {
            document.getElementById('building-name').textContent =
                this.currentMapData.building.label || 'Університет';
        }
    }

    updateSystemInfo() {
        if (this.currentMapData) {
            document.getElementById('current-map-name').textContent =
                this.getCurrentMapName();
            document.getElementById('rooms-count').textContent =
                this.currentMapData.rooms ? this.currentMapData.rooms.length : 0;
            document.getElementById('nodes-count').textContent =
                this.currentMapData.nodes ? this.currentMapData.nodes.length : 0;
        }
    }

    getCurrentMapName() {
        const mapSelect = document.getElementById('map-list');
        const selectedOption = mapSelect.options[mapSelect.selectedIndex];
        return selectedOption ? selectedOption.text : 'Невідома карта';
    }

    // Методи масштабування та переміщення
    zoomIn() {
        this.zoomLevel = Math.min(this.zoomLevel * 1.2, 5);
        this.applyTransform();
    }

    zoomOut() {
        this.zoomLevel = Math.max(this.zoomLevel / 1.2, 0.1);
        this.applyTransform();
    }

    resetView() {
        this.zoomLevel = 1;
        this.panX = 0;
        this.panY = 0;
        this.applyTransform();
    }

    startDrag(event) {
        this.isDragging = true;
        this.lastMouseX = event.clientX;
        this.lastMouseY = event.clientY;
        document.getElementById('svg-container').style.cursor = 'grabbing';
    }

    drag(event) {
        if (!this.isDragging) return;

        const deltaX = event.clientX - this.lastMouseX;
        const deltaY = event.clientY - this.lastMouseY;

        this.panX += deltaX / this.zoomLevel;
        this.panY += deltaY / this.zoomLevel;

        this.lastMouseX = event.clientX;
        this.lastMouseY = event.clientY;

        this.applyTransform();
    }

    endDrag() {
        this.isDragging = false;
        document.getElementById('svg-container').style.cursor = 'grab';
    }

    applyTransform() {
        const svg = document.getElementById('main-svg');
        if (svg) {
            svg.style.transform = `scale(${this.zoomLevel}) translate(${this.panX}px, ${this.panY}px)`;
        }
    }

    toggleLabels() {
        const svg = document.getElementById('main-svg');
        if (svg) {
            svg.classList.toggle('hide-labels');
        }
    }

    // Методи для відображення стану
    showLoading() {
        document.getElementById('loading-indicator').style.display = 'block';
        document.getElementById('map-svg').style.display = 'none';
    }

    hideLoading() {
        document.getElementById('loading-indicator').style.display = 'none';
        document.getElementById('map-svg').style.display = 'block';
    }

    showError(message) {
        document.getElementById('error-message').textContent = message;
        document.getElementById('error-modal').style.display = 'block';
    }

    hideError() {
        document.getElementById('error-modal').style.display = 'none';
    }

    getMapStyles() {
        return `
            .wall {
                fill: red;
                stroke: darkred;
                stroke-width: 1;
                fill-rule: evenodd;
            }
            
            .room {
                fill: aqua;
                stroke: #1976d2;
                stroke-width: 1;
                cursor: pointer;
                transition: all 0.3s ease;
            }
            
            .room:hover, .room.highlighted {
                fill: #bbdefb;
                stroke: #0d47a1;
                stroke-width: 2;
            }
            
            .room.selected {
                fill: #2196f3;
                stroke: #0d47a1;
                stroke-width: 3;
            }
            
            .category-laboratory { fill: #e8f5e8; stroke: #4caf50; }
            .category-restroom { fill: #fff3e0; stroke: #ff9800; }
            .category-food-service { fill: #fce4ec; stroke: #e91e63; }
            .category-utility { fill: #f3e5f5; stroke: #9c27b0; }
            .category-recreation { fill: #e0f2f1; stroke: #009688; }
            .category-workspace { fill: #e3f2fd; stroke: #2196f3; }
            
            /* Оригінальні стилі з SVG для nodes та edges */
            .cls-3 {
                fill: yellow;
            }
            
            .cls-4 {
                fill: blue;
            }
            
            .route-highlight {
                fill: #f44336 !important;
                stroke: #d32f2f !important;
                stroke-width: 3 !important;
            }
            
            .hide-labels text {
                display: none;
            }
        `;
    }
}

// Ініціалізуємо карту після завантаження DOM
document.addEventListener('DOMContentLoaded', () => {
    window.mapCore = new MapCore();
});