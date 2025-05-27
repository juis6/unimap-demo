// Головний клас для роботи з картою - оновлена версія для роботи з поверхами
class MapCore {
    constructor() {
        this.allMapsData = new Map(); // Зберігаємо дані для всіх поверхів
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
        // Керування масштабом
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

        // Touch-події для мобільних пристроїв
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

        // Закрити модальне вікно помилки
        document.getElementById('close-error').addEventListener('click', () => {
            this.hideError();
        });

        // Навігація клавіатурою для SVG контейнера
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
        description.textContent = 'Інтерактивна карта університету з навігацією по поверхах. Використовуйте панель інструментів для пошуку кімнат та побудови маршрутів.';
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

            // Завантажуємо дані для всіх поверхів
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
            console.error('Помилка завантаження поверхів:', error);
            this.showError('Помилка завантаження поверхів: ' + error.message);
            this.updateConnectionStatus('Помилка');
            this.hideLoading();
        }
    }

    // Витягнути номер поверху з ID карти
    extractFloorNumber(mapId) {
        const match = mapId.match(/map-\d+-(\d+)/);
        return match ? match[1] : '1';
    }

    // Завантажити дані окремої карти
    async loadMapData(mapId) {
        try {
            const response = await fetch(`/map/data/${mapId}`);
            if (!response.ok) {
                throw new Error(`HTTP помилка! статус: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error(`Помилка завантаження карти ${mapId}:`, error);
            return null;
        }
    }

    // Показати поточний поверх
    async displayCurrentFloor() {
        const mapData = this.allMapsData.get(this.currentFloor);
        if (!mapData) {
            console.error('Дані карти не знайдено для поверху:', this.currentFloor);
            return;
        }

        try {
            // Завантажуємо SVG для поточного поверху
            const mapId = `map-10-${this.currentFloor.padStart(2, '0')}`;
            await this.loadOriginalSVG(mapId, mapData);

            this.updateBuildingInfo();
            this.updateFloorInfo();

        } catch (error) {
            console.error('Помилка відображення поверху:', error);
            this.showError('Помилка відображення поверху: ' + error.message);
        }
    }

    // Завантажити оригінальний SVG
    async loadOriginalSVG(mapId, mapData) {
        try {
            const svgResponse = await fetch(`/map/svg/${mapId}`);
            if (!svgResponse.ok) {
                throw new Error('SVG файл не знайдено');
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
            console.warn('Не вдалося завантажити оригінальний SVG:', error);
            await this.renderMap(mapData);
        }
    }

    // Налаштувати кнопки поверхів
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

    // Вибрати поверх
    async selectFloor(floorNumber) {
        if (floorNumber === this.currentFloor) return;

        this.currentFloor = floorNumber;
        await this.displayCurrentFloor();

        // Оновити стан кнопок поверхів
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
        this.announceToScreenReader(`Вибрано поверх ${floorNumber}`);
    }

    // Отримати всі кімнати з усіх поверхів
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

    // Отримати всі вузли з усіх поверхів
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

    // Отримати всі ребра з усіх поверхів
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

    // Знайти кімнату по ID на всіх поверхах
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

    // Вибрати кімнату (може бути на іншому поверсі)
    async selectRoom(room, options = {}) {
        // Перевіряємо, чи кімната вже вибрана, щоб уникнути циклічних викликів
        if (this.selectedRoom && this.selectedRoom.id === room.id &&
            this.selectedRoom.floor === room.floor) {
            return;
        }

        this.selectedRoom = room;

        // Якщо кімната на іншому поверсі, переключаємось
        if (room.floor && room.floor !== this.currentFloor) {
            await this.selectFloor(room.floor);
        }

        // Скидаємо попередній вибір
        document.querySelectorAll('.room.selected').forEach(r => {
            r.classList.remove('selected');
            r.setAttribute('aria-selected', 'false');
        });

        // Підсвічуємо нову кімнату
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
        this.announceToScreenReader(`Вибрано кімнату ${roomDescription}`);
    }

    // Оновити інформацію про кімнату
    updateRoomDetails(room) {
        const roomName = room.floorLabel ?
            `${room.label || room.id} (${room.floorLabel})` :
            (room.label || room.id);

        document.getElementById('room-name').textContent = roomName;
        document.getElementById('room-category').textContent = `Категорія: ${this.getCategoryName(room.category)}`;
        document.getElementById('room-keywords').textContent = `Ключові слова: ${room.keywords.join(', ')}`;
        document.getElementById('room-access').textContent = `Доступ: ${room.access ? 'Дозволено' : 'Обмежено'}`;
    }

    // Налаштувати взаємодію з кімнатами
    setupRoomInteractions(svgElement, mapData) {
        if (!mapData || !mapData.rooms) return;

        const roomElements = svgElement.querySelectorAll('[data-name="room"]');

        roomElements.forEach(roomElement => {
            const roomId = roomElement.id;
            const roomData = mapData.rooms.find(r => r.id === roomId);

            if (roomData) {
                // Додаємо інформацію про поверх
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

                roomElement.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    this.showContextMenu(e, roomWithFloor);
                });

                roomElement.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        this.selectRoom(roomWithFloor);
                    }
                });
            }
        });
    }

    // Впровадити користувацькі SVG стилі
    injectSVGStyles(svgElement) {
        const styleElement = document.createElementNS('http://www.w3.org/2000/svg', 'style');
        styleElement.textContent = `
            .room { cursor: pointer; transition: all 0.3s ease; }
            .room:hover { stroke-width: 2.5; filter: brightness(1.1); }
            .room.selected { stroke-width: 3; filter: brightness(1.2); }
            .room.highlighted { animation: pulse 2s ease-in-out infinite; }
            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.6; }
            }
        `;
        svgElement.insertBefore(styleElement, svgElement.firstChild);
    }

    // Отримати назву категорії
    getCategoryName(category) {
        const categoryNames = {
            'laboratory': 'Лабораторія',
            'restroom': 'Санвузол',
            'food-service': 'Харчування',
            'utility': 'Службове приміщення',
            'recreation': 'Відпочинок',
            'workspace': 'Робоче місце'
        };
        return categoryNames[category] || category;
    }

    // Показати контекстне меню
    showContextMenu(event, room) {
        if (window.mapUI) {
            window.mapUI.showContextMenu(event, room);
        }
    }

    // Збільшити
    zoomIn() {
        this.zoomLevel = Math.min(this.zoomLevel * 1.2, 5);
        this.applyTransform();
        this.announceToScreenReader('Збільшено');
    }

    // Зменшити
    zoomOut() {
        this.zoomLevel = Math.max(this.zoomLevel / 1.2, 0.5);
        this.applyTransform();
        this.announceToScreenReader('Зменшено');
    }

    // Скинути вигляд
    resetView() {
        this.zoomLevel = 1;
        this.panX = 0;
        this.panY = 0;
        this.applyTransform();
        this.announceToScreenReader('Вигляд скинуто');
    }

    // Застосувати трансформацію
    applyTransform() {
        const svgElement = document.getElementById('main-svg');
        if (svgElement) {
            svgElement.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoomLevel})`;
            svgElement.style.transformOrigin = 'center center';
        }
    }

    // Почати перетягування
    startDrag(e) {
        if (e.target.closest('.room')) return;
        this.isDragging = true;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        document.getElementById('svg-container').style.cursor = 'grabbing';
    }

    // Обробити перетягування
    drag(e) {
        if (!this.isDragging) return;

        const deltaX = e.clientX - this.lastMouseX;
        const deltaY = e.clientY - this.lastMouseY;

        this.panX += deltaX;
        this.panY += deltaY;

        this.applyTransform();

        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
    }

    // Закінчити перетягування
    endDrag() {
        this.isDragging = false;
        document.getElementById('svg-container').style.cursor = 'grab';
    }

    // Обробити початок дотику
    handleTouchStart(e) {
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            this.lastMouseX = touch.clientX;
            this.lastMouseY = touch.clientY;
            this.isDragging = true;
        }
    }

    // Обробити рух дотику
    handleTouchMove(e) {
        if (e.touches.length === 1 && this.isDragging) {
            e.preventDefault();
            const touch = e.touches[0];
            const deltaX = touch.clientX - this.lastMouseX;
            const deltaY = touch.clientY - this.lastMouseY;

            this.panX += deltaX;
            this.panY += deltaY;

            this.applyTransform();

            this.lastMouseX = touch.clientX;
            this.lastMouseY = touch.clientY;
        }
    }

    // Обробити навігацію клавіатурою
    handleKeyNavigation(e) {
        const step = 20;
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
            case '_':
                e.preventDefault();
                this.zoomOut();
                break;
            case '0':
                e.preventDefault();
                this.resetView();
                break;
        }
    }

    // Оновити інформацію про будівлю
    updateBuildingInfo() {
        const mapData = this.allMapsData.get(this.currentFloor);
        if (mapData && mapData.building) {
            document.getElementById('building-name').textContent = mapData.building.label || 'Університетська будівля';
        }
    }

    // Оновити інформацію про поверх
    updateFloorInfo() {
        document.getElementById('current-floor').textContent = this.currentFloor;
    }

    // Оновити системну інформацію
    updateSystemInfo() {
        const mapData = this.allMapsData.get(this.currentFloor);
        if (mapData) {
            document.getElementById('current-map-name').textContent = `Корпус 10, поверх ${this.currentFloor}`;
            document.getElementById('rooms-count').textContent = mapData.rooms ? mapData.rooms.length : 0;
            document.getElementById('nodes-count').textContent = mapData.nodes ? mapData.nodes.length : 0;
        }
    }

    // Оновити статус з'єднання
    updateConnectionStatus(status) {
        const statusElement = document.getElementById('connection-status');
        statusElement.textContent = status;

        if (status === 'Підключено') {
            statusElement.style.color = '#2e7d32';
        } else if (status === 'Завантаження...') {
            statusElement.style.color = '#ff6f00';
        } else {
            statusElement.style.color = '#d32f2f';
        }
    }

    // Показати індикатор завантаження
    showLoading() {
        document.getElementById('loading-indicator').style.display = 'flex';
    }

    // Сховати індикатор завантаження
    hideLoading() {
        document.getElementById('loading-indicator').style.display = 'none';
    }

    // Показати повідомлення про помилку
    showError(message) {
        document.getElementById('error-message').textContent = message;
        document.getElementById('error-modal').style.display = 'flex';
        this.announceToScreenReader(`Помилка: ${message}`);
    }

    // Сховати повідомлення про помилку
    hideError() {
        document.getElementById('error-modal').style.display = 'none';
    }

    // Оголосити для зчитувача екрану
    announceToScreenReader(message) {
        const announcement = document.createElement('div');
        announcement.setAttribute('role', 'status');
        announcement.setAttribute('aria-live', 'polite');
        announcement.className = 'sr-only';
        announcement.textContent = message;
        document.body.appendChild(announcement);

        setTimeout(() => {
            document.body.removeChild(announcement);
        }, 1000);
    }
}

// Ініціалізувати MapCore після завантаження DOM
document.addEventListener('DOMContentLoaded', () => {
    window.mapCore = new MapCore();
});