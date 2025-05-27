// Основний клас для роботи з картою - оновлена версія для роботи з поверхами
class MapCore {
    constructor() {
        this.allMapsData = new Map(); // Зберігаємо дані всіх поверхів
        this.currentFloor = '1';
        this.buildingId = null;
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
        this.setupAccessibility();
        await this.loadAllFloors();
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

        // Обробка перетягування карти
        const svgContainer = document.getElementById('svg-container');
        svgContainer.addEventListener('mousedown', (e) => this.startDrag(e));
        svgContainer.addEventListener('mousemove', (e) => this.drag(e));
        svgContainer.addEventListener('mouseup', () => this.endDrag());
        svgContainer.addEventListener('mouseleave', () => this.endDrag());

        // Touch events для мобільних пристроїв
        svgContainer.addEventListener('touchstart', (e) => this.handleTouchStart(e));
        svgContainer.addEventListener('touchmove', (e) => this.handleTouchMove(e));
        svgContainer.addEventListener('touchend', () => this.endDrag());

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

        // Клавіатурна навігація для SVG контейнера
        svgContainer.addEventListener('keydown', (e) => {
            this.handleKeyNavigation(e);
        });
    }

    // Налаштування доступності
    setupAccessibility() {
        const mapContainer = document.getElementById('map-container');
        mapContainer.setAttribute('role', 'application');
        mapContainer.setAttribute('aria-label', 'Інтерактивна карта університету');

        const loadingIndicator = document.getElementById('loading-indicator');
        loadingIndicator.setAttribute('aria-live', 'assertive');

        this.createScreenReaderDescription();
    }

    createScreenReaderDescription() {
        const description = document.createElement('div');
        description.id = 'map-description';
        description.className = 'sr-only';
        description.textContent = 'Інтерактивна карта університету з можливістю навігації між поверхами. Використовуйте панель інструментів для пошуку кімнат та побудови маршрутів.';
        document.body.appendChild(description);

        const svgContainer = document.getElementById('svg-container');
        svgContainer.setAttribute('aria-describedby', 'map-description');
    }

    // Завантаження всіх поверхів будівлі
    async loadAllFloors() {
        this.showLoading();
        this.updateConnectionStatus('Завантаження...');

        try {
            // Отримуємо список доступних карт
            const availableMaps = window.mapConfig.availableMaps;
            const buildingMaps = availableMaps.filter(map => map.id.startsWith('map-10-'));

            if (buildingMaps.length === 0) {
                throw new Error('Карти будівлі не знайдено');
            }

            // Завантажуємо дані всіх поверхів
            for (const mapInfo of buildingMaps) {
                const mapData = await this.loadMapData(mapInfo.id);
                if (mapData) {
                    const floorNumber = this.extractFloorNumber(mapInfo.id);
                    this.allMapsData.set(floorNumber, mapData);

                    // Встановлюємо buildingId з першої карти
                    if (!this.buildingId && mapData.building) {
                        this.buildingId = mapData.building.id;
                    }
                }
            }

            if (this.allMapsData.size === 0) {
                throw new Error('Не вдалося завантажити дані поверхів');
            }

            // Завантажуємо перший поверх за замовчуванням
            const floors = Array.from(this.allMapsData.keys()).sort();
            this.currentFloor = floors[0];

            await this.displayCurrentFloor();
            this.setupFloorButtons();
            this.updateSystemInfo();
            this.updateConnectionStatus('Підключено');
            this.hideLoading();

            this.announceToScreenReader(`Завантажено ${this.allMapsData.size} поверхів будівлі`);

        } catch (error) {
            console.error('Error loading floors:', error);
            this.showError('Помилка завантаження поверхів: ' + error.message);
            this.updateConnectionStatus('Помилка');
            this.hideLoading();
        }
    }

    // Витягування номера поверху з ID карти
    extractFloorNumber(mapId) {
        const match = mapId.match(/map-\d+-(\d+)/);
        return match ? match[1] : '1';
    }

    // Завантаження даних окремої карти
    async loadMapData(mapId) {
        try {
            const response = await fetch(`/map/data/${mapId}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error(`Error loading map ${mapId}:`, error);
            return null;
        }
    }

    // Відображення поточного поверху
    async displayCurrentFloor() {
        const mapData = this.allMapsData.get(this.currentFloor);
        if (!mapData) {
            console.error('Map data not found for floor:', this.currentFloor);
            return;
        }

        try {
            // Завантажуємо SVG поточного поверху
            const mapId = `map-10-${this.currentFloor.padStart(2, '0')}`;
            await this.loadOriginalSVG(mapId, mapData);

            this.updateBuildingInfo();
            this.updateFloorInfo();

        } catch (error) {
            console.error('Error displaying floor:', error);
            this.showError('Помилка відображення поверху: ' + error.message);
        }
    }

    // Завантаження оригінального SVG
    async loadOriginalSVG(mapId, mapData) {
        try {
            const svgResponse = await fetch(`/map/svg/${mapId}`);
            if (!svgResponse.ok) {
                throw new Error('SVG file not found');
            }

            const svgContent = await svgResponse.text();
            const svgContainer = document.getElementById('map-svg');
            svgContainer.innerHTML = svgContent;

            const svgElement = svgContainer.querySelector('svg');
            if (svgElement) {
                svgElement.setAttribute('id', 'main-svg');
                svgElement.style.width = '100%';
                svgElement.style.height = '100%';

                svgElement.setAttribute('role', 'img');
                svgElement.setAttribute('aria-label', `Карта поверху ${this.currentFloor}`);

                this.setupRoomInteractions(svgElement, mapData);
                this.injectSVGStyles(svgElement);
            }
        } catch (error) {
            console.warn('Could not load original SVG:', error);
            await this.renderMap(mapData);
        }
    }

    // Налаштування кнопок поверхів
    setupFloorButtons() {
        const floorButtons = document.getElementById('floor-buttons');
        floorButtons.innerHTML = '';

        const floors = Array.from(this.allMapsData.keys()).sort();

        floors.forEach(floorNumber => {
            const button = document.createElement('button');
            button.textContent = `Поверх ${floorNumber}`;
            button.setAttribute('data-floor', floorNumber);
            button.classList.add('md-chip');
            button.setAttribute('role', 'radio');
            button.setAttribute('aria-checked', floorNumber === this.currentFloor ? 'true' : 'false');

            if (floorNumber === this.currentFloor) {
                button.classList.add('active');
            }

            button.addEventListener('click', () => {
                this.selectFloor(floorNumber);
            });

            floorButtons.appendChild(button);
        });
    }

    // Вибір поверху
    async selectFloor(floorNumber) {
        if (floorNumber === this.currentFloor) return;

        this.currentFloor = floorNumber;
        await this.displayCurrentFloor();

        // Оновлюємо стан кнопок поверхів
        document.querySelectorAll('#floor-buttons .md-chip').forEach(btn => {
            btn.classList.remove('active');
            btn.setAttribute('aria-checked', 'false');
        });

        const selectedButton = document.querySelector(`[data-floor="${floorNumber}"]`);
        if (selectedButton) {
            selectedButton.classList.add('active');
            selectedButton.setAttribute('aria-checked', 'true');
        }

        this.updateFloorInfo();
        this.announceToScreenReader(`Обрано поверх ${floorNumber}`);
    }

    // Отримання всіх кімнат зі всіх поверхів
    getAllRooms() {
        const allRooms = [];
        for (const [floorNumber, mapData] of this.allMapsData) {
            if (mapData.rooms) {
                mapData.rooms.forEach(room => {
                    allRooms.push({
                        ...room,
                        floor: floorNumber,
                        floorLabel: `Поверх ${floorNumber}`
                    });
                });
            }
        }
        return allRooms;
    }

    // Отримання всіх вузлів зі всіх поверхів
    getAllNodes() {
        const allNodes = [];
        for (const [floorNumber, mapData] of this.allMapsData) {
            if (mapData.nodes) {
                mapData.nodes.forEach(node => {
                    allNodes.push({
                        ...node,
                        floor: floorNumber
                    });
                });
            }
        }
        return allNodes;
    }

    // Отримання всіх ребер зі всіх поверхів
    getAllEdges() {
        const allEdges = [];
        for (const [floorNumber, mapData] of this.allMapsData) {
            if (mapData.edges) {
                mapData.edges.forEach(edge => {
                    allEdges.push({
                        ...edge,
                        floor: floorNumber
                    });
                });
            }
        }
        return allEdges;
    }

    // Пошук кімнати за ID у всіх поверхах
    findRoomById(roomId) {
        for (const [floorNumber, mapData] of this.allMapsData) {
            if (mapData.rooms) {
                const room = mapData.rooms.find(r => r.id === roomId);
                if (room) {
                    return {
                        ...room,
                        floor: floorNumber,
                        floorLabel: `Поверх ${floorNumber}`
                    };
                }
            }
        }
        return null;
    }

    // Вибір кімнати (може бути на іншому поверсі)
    async selectRoom(room) {
        this.selectedRoom = room;

        // Якщо кімната на іншому поверсі, переключаємося
        if (room.floor && room.floor !== this.currentFloor) {
            await this.selectFloor(room.floor);
        }

        // Скидаємо попереднє виділення
        document.querySelectorAll('.room.selected').forEach(r => {
            r.classList.remove('selected');
            r.setAttribute('aria-selected', 'false');
        });

        // Виділяємо нову кімнату
        const roomElement = document.getElementById(room.id);
        if (roomElement) {
            roomElement.classList.add('selected');
            roomElement.setAttribute('aria-selected', 'true');
            roomElement.focus();
        }

        this.updateRoomDetails(room);
        document.getElementById('room-details').style.display = 'block';

        const roomDescription = room.floorLabel ?
            `${room.label || room.id} на ${room.floorLabel}` :
            `${room.label || room.id}`;
        this.announceToScreenReader(`Обрано кімнату ${roomDescription}`);
    }

    // Оновлення інформації про кімнату
    updateRoomDetails(room) {
        const roomName = room.floorLabel ?
            `${room.label || room.id} (${room.floorLabel})` :
            (room.label || room.id);

        document.getElementById('room-name').textContent = roomName;
        document.getElementById('room-category').textContent = `Категорія: ${this.getCategoryName(room.category)}`;
        document.getElementById('room-keywords').textContent = `Ключові слова: ${room.keywords.join(', ')}`;
        document.getElementById('room-access').textContent = `Доступ: ${room.access ? 'Дозволено' : 'Обмежено'}`;
    }

    // Налаштування взаємодії з кімнатами
    setupRoomInteractions(svgElement, mapData) {
        if (!mapData || !mapData.rooms) return;

        const roomElements = svgElement.querySelectorAll('[data-name="room"]');

        roomElements.forEach(roomElement => {
            const roomId = roomElement.id;
            const roomData = mapData.rooms.find(r => r.id === roomId);

            if (roomData) {
                // Додаємо інфо про поверх
                const roomWithFloor = {
                    ...roomData,
                    floor: this.currentFloor,
                    floorLabel: `Поверх ${this.currentFloor}`
                };

                roomElement.classList.add('room');
                roomElement.classList.add(`category-${roomData.category}`);
                roomElement.setAttribute('role', 'button');
                roomElement.setAttribute('aria-label', `Кімната ${roomData.label || roomId} на поверсі ${this.currentFloor}`);
                roomElement.setAttribute('tabindex', '0');

                roomElement.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.selectRoom(roomWithFloor);
                });

                roomElement.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        this.selectRoom(roomWithFloor);
                    }
                });

                roomElement.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    this.showContextMenu(e, roomWithFloor);
                });

                roomElement.addEventListener('mouseenter', () => {
                    this.highlightRoom(roomId, true);
                });

                roomElement.addEventListener('mouseleave', () => {
                    this.highlightRoom(roomId, false);
                });

                roomElement.addEventListener('focus', () => {
                    this.highlightRoom(roomId, true);
                });

                roomElement.addEventListener('blur', () => {
                    this.highlightRoom(roomId, false);
                });

                roomElement.setAttribute('data-room-id', roomId);
                roomElement.setAttribute('data-room-label', roomData.label || '');
                roomElement.setAttribute('data-room-category', roomData.category || '');
                roomElement.setAttribute('data-room-floor', this.currentFloor);
            }
        });
    }

    // Додавання стилів в SVG
    injectSVGStyles(svgElement) {
        let styleElement = svgElement.querySelector('#dynamic-styles');
        if (!styleElement) {
            styleElement = document.createElementNS('http://www.w3.org/2000/svg', 'style');
            styleElement.id = 'dynamic-styles';

            let defsElement = svgElement.querySelector('defs');
            if (!defsElement) {
                defsElement = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
                svgElement.insertBefore(defsElement, svgElement.firstChild);
            }
            defsElement.appendChild(styleElement);
        }

        styleElement.textContent = `
            .room {
                cursor: pointer;
                transition: fill 0.15s ease, stroke 0.15s ease;
                outline: none;
            }
            
            .room:hover, .room.highlighted, .room:focus {
                filter: brightness(0.95) drop-shadow(0 1px 3px rgba(25, 118, 210, 0.2));
            }
            
            .room.selected {
                filter: brightness(0.9) drop-shadow(0 2px 6px rgba(25, 118, 210, 0.4));
                stroke: #1565c0 !important;
                stroke-width: 2 !important;
            }
            
            .room.route-highlight {
                fill: #fff3e0 !important;
                stroke: #ff6f00 !important;
                stroke-width: 3 !important;
                filter: drop-shadow(0 2px 8px rgba(255, 111, 0, 0.5)) !important;
                animation: routePulse 2s infinite;
            }
            
            @keyframes routePulse {
                0%, 100% { 
                    fill-opacity: 1;
                    stroke-opacity: 1;
                }
                50% { 
                    fill-opacity: 0.7;
                    stroke-opacity: 0.8;
                }
            }
            
            .category-laboratory { fill: #f3e5f5; stroke: #7b1fa2; }
            .category-restroom { fill: #e8f5e8; stroke: #2e7d32; }
            .category-food-service { fill: #fff3e0; stroke: #ef6c00; }
            .category-utility { fill: #fce4ec; stroke: #c2185b; }
            .category-recreation { fill: #e1f5fe; stroke: #0277bd; }
            .category-workspace { fill: #f5f7fa; stroke: #546e7a; }
        `;
    }

    // Оновлення інформації про будівлю та поверх
    updateBuildingInfo() {
        const currentMapData = this.allMapsData.get(this.currentFloor);
        if (currentMapData && currentMapData.building) {
            document.getElementById('building-name').textContent =
                currentMapData.building.label || 'Університет';
        }
    }

    updateFloorInfo() {
        document.getElementById('current-floor').textContent = this.currentFloor;
    }

    // Оновлення системної інформації
    updateSystemInfo() {
        const totalRooms = this.getAllRooms().length;
        const totalNodes = this.getAllNodes().length;

        document.getElementById('current-map-name').textContent = `Будівля (${this.allMapsData.size} поверхів)`;
        document.getElementById('rooms-count').textContent = totalRooms;
        document.getElementById('nodes-count').textContent = totalNodes;
    }

    // Методи масштабування та переміщення
    handleKeyNavigation(e) {
        const step = 50;

        switch (e.key) {
            case 'ArrowUp':
                e.preventDefault();
                this.panY += step;
                this.applyTransform();
                break;
            case 'ArrowDown':
                e.preventDefault();
                this.panY -= step;
                this.applyTransform();
                break;
            case 'ArrowLeft':
                e.preventDefault();
                this.panX += step;
                this.applyTransform();
                break;
            case 'ArrowRight':
                e.preventDefault();
                this.panX -= step;
                this.applyTransform();
                break;
            case '+':
            case '=':
                e.preventDefault();
                this.zoomIn();
                break;
            case '-':
                e.preventDefault();
                this.zoomOut();
                break;
            case 'Home':
                e.preventDefault();
                this.resetView();
                break;
        }
    }

    handleTouchStart(e) {
        if (e.touches.length === 1) {
            this.isDragging = true;
            this.lastMouseX = e.touches[0].clientX;
            this.lastMouseY = e.touches[0].clientY;
        }
    }

    handleTouchMove(e) {
        if (this.isDragging && e.touches.length === 1) {
            e.preventDefault();
            const deltaX = e.touches[0].clientX - this.lastMouseX;
            const deltaY = e.touches[0].clientY - this.lastMouseY;

            this.panX += deltaX / this.zoomLevel;
            this.panY += deltaY / this.zoomLevel;

            this.lastMouseX = e.touches[0].clientX;
            this.lastMouseY = e.touches[0].clientY;

            this.applyTransform();
        }
    }

    loadSelectedMap() {
        // Для цієї версії не потрібно, оскільки ми завантажуємо всі поверхи відразу
        this.announceToScreenReader('Всі поверхи вже завантажені');
    }

    zoomIn() {
        this.zoomLevel = Math.min(this.zoomLevel * 1.2, 5);
        this.applyTransform();
        this.announceToScreenReader(`Масштаб збільшено до ${Math.round(this.zoomLevel * 100)}%`);
    }

    zoomOut() {
        this.zoomLevel = Math.max(this.zoomLevel / 1.2, 0.1);
        this.applyTransform();
        this.announceToScreenReader(`Масштаб зменшено до ${Math.round(this.zoomLevel * 100)}%`);
    }

    resetView() {
        this.zoomLevel = 1;
        this.panX = 0;
        this.panY = 0;
        this.applyTransform();
        this.announceToScreenReader('Вигляд карти скинуто до початкового стану');
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

        const displayName = room.floorLabel ?
            `${room.label || room.id} (${room.floorLabel})` :
            (room.label || room.id);

        roomName.textContent = displayName;

        contextMenu.style.display = 'block';
        contextMenu.style.left = event.pageX + 'px';
        contextMenu.style.top = event.pageY + 'px';

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

        setTimeout(() => {
            document.addEventListener('click', this.hideContextMenu.bind(this), { once: true });
        }, 100);
    }

    hideContextMenu() {
        document.getElementById('context-menu').style.display = 'none';
    }

    setRouteDestination(room) {
        if (window.mapNavigation) {
            window.mapNavigation.setRouteDestination(room);
        }
        this.announceToScreenReader(`Встановлено кінцеву точку: ${room.label || room.id}`);
    }

    setRouteOrigin(room) {
        if (window.mapNavigation) {
            window.mapNavigation.setRouteOrigin(room);
        }
        this.announceToScreenReader(`Встановлено початкову точку: ${room.label || room.id}`);
    }

    updateConnectionStatus(status) {
        const statusElement = document.getElementById('connection-status');
        statusElement.textContent = status;
    }

    showLoading() {
        const loadingIndicator = document.getElementById('loading-indicator');
        const mapSvg = document.getElementById('map-svg');

        loadingIndicator.style.display = 'flex';
        mapSvg.style.display = 'none';

        this.announceToScreenReader('Завантаження карти');
    }

    hideLoading() {
        const loadingIndicator = document.getElementById('loading-indicator');
        const mapSvg = document.getElementById('map-svg');

        loadingIndicator.style.display = 'none';
        mapSvg.style.display = 'block';
    }

    showError(message) {
        const errorModal = document.getElementById('error-modal');
        const errorMessage = document.getElementById('error-message');

        errorMessage.textContent = message;
        errorModal.style.display = 'flex';

        setTimeout(() => {
            document.getElementById('close-error').focus();
        }, 100);

        this.announceToScreenReader(`Помилка: ${message}`);
    }

    hideError() {
        document.getElementById('error-modal').style.display = 'none';
    }

    announceToScreenReader(message) {
        let announcement = document.getElementById('announcement');
        if (!announcement) {
            announcement = document.createElement('div');
            announcement.id = 'announcement';
            announcement.className = 'sr-only';
            announcement.setAttribute('aria-live', 'polite');
            announcement.setAttribute('aria-atomic', 'true');
            document.body.appendChild(announcement);
        }

        announcement.textContent = message;

        setTimeout(() => {
            announcement.textContent = '';
        }, 1000);
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

    // Fallback метод рендерингу карти (якщо SVG недоступний)
    async renderMap(mapData) {
        // Реалізація fallback рендерингу при потребі
        console.warn('Fallback rendering not implemented in this version');
    }
}

// Ініціалізуємо карту після завантаження DOM
document.addEventListener('DOMContentLoaded', () => {
    window.mapCore = new MapCore();
});