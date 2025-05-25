// Основний клас для роботи з картою - Material Design версія
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
        this.setupAccessibility();
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
        // Додаємо ARIA-атрибути динамічно
        const mapContainer = document.getElementById('map-container');
        mapContainer.setAttribute('role', 'application');
        mapContainer.setAttribute('aria-label', 'Інтерактивна карта університету');

        // Налаштовуємо live regions для динамічного контенту
        const loadingIndicator = document.getElementById('loading-indicator');
        loadingIndicator.setAttribute('aria-live', 'assertive');

        // Додаємо опис для screen readers
        this.createScreenReaderDescription();
    }

    // Створення опису для screen readers
    createScreenReaderDescription() {
        const description = document.createElement('div');
        description.id = 'map-description';
        description.className = 'sr-only';
        description.textContent = 'Інтерактивна карта університету. Використовуйте панель інструментів праворуч для пошуку кімнат та побудови маршрутів. Для навігації картою використовуйте кнопки масштабування або клавіші + та -.';
        document.body.appendChild(description);

        const svgContainer = document.getElementById('svg-container');
        svgContainer.setAttribute('aria-describedby', 'map-description');
    }

    // Обробка клавіатурної навігації
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

    // Touch events для мобільних пристроїв
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
        this.updateConnectionStatus('Завантаження...');

        try {
            const response = await fetch(`/map/data/${mapId}`);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const mapData = await response.json();
            this.currentMapData = mapData;

            // Завантажуємо оригінальний SVG
            await this.loadOriginalSVG(mapId);
            await this.loadFloors();
            await this.loadRooms();

            this.updateSystemInfo();
            this.updateConnectionStatus('Підключено');
            this.hideLoading();

            // Оголошуємо успішне завантаження для screen readers
            this.announceToScreenReader('Карту успішно завантажено');

        } catch (error) {
            console.error('Error loading map:', error);
            this.showError('Помилка завантаження карти: ' + error.message);
            this.updateConnectionStatus('Помилка');
            this.hideLoading();
        }
    }

    // Завантаження оригінального SVG
    async loadOriginalSVG(mapId) {
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

                // Додаємо ARIA-атрибути для SVG
                svgElement.setAttribute('role', 'img');
                svgElement.setAttribute('aria-label', 'Карта університету');

                this.setupRoomInteractions(svgElement);
                this.updateBuildingInfo();
            }
        } catch (error) {
            console.warn('Could not load original SVG, falling back to parsed version:', error);
            await this.renderMap();
        }
    }

    // Налаштування взаємодії з кімнатами
    setupRoomInteractions(svgElement) {
        if (!this.currentMapData || !this.currentMapData.rooms) return;

        const roomElements = svgElement.querySelectorAll('[data-name="room"]');

        roomElements.forEach(roomElement => {
            const roomId = roomElement.id;
            const roomData = this.currentMapData.rooms.find(r => r.id === roomId);

            if (roomData) {
                // Додаємо CSS класи та атрибути доступності
                roomElement.classList.add('room');
                roomElement.classList.add(`category-${roomData.category}`);
                roomElement.setAttribute('role', 'button');
                roomElement.setAttribute('aria-label', `Кімната ${roomData.label || roomId}`);
                roomElement.setAttribute('tabindex', '0');

                // Додаємо обробники подій
                roomElement.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.selectRoom(roomData);
                });

                roomElement.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        this.selectRoom(roomData);
                    }
                });

                roomElement.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    this.showContextMenu(e, roomData);
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

                // Додаємо атрибути для пошуку та ідентифікації
                roomElement.setAttribute('data-room-id', roomId);
                roomElement.setAttribute('data-room-label', roomData.label || '');
                roomElement.setAttribute('data-room-category', roomData.category || '');
            }
        });

        this.injectSVGStyles(svgElement);
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
            /* Material Design стилі для SVG елементів */
            .room {
                cursor: pointer;
                transition: all 0.2s cubic-bezier(0.4, 0.0, 0.2, 1);
                outline: none;
            }
            
            .room:hover, .room.highlighted, .room:focus {
                filter: brightness(0.9) drop-shadow(0 2px 4px rgba(25, 118, 210, 0.2));
            }
            
            .room.selected {
                filter: brightness(0.8) drop-shadow(0 2px 8px rgba(25, 118, 210, 0.4));
                stroke: #1565c0 !important;
                stroke-width: 2 !important;
            }
            
            .room.route-highlight {
                filter: brightness(0.7) drop-shadow(0 2px 8px rgba(3, 218, 198, 0.5)) !important;
                stroke: #00796b !important;
                stroke-width: 3 !important;
                animation: routePulse 2s infinite;
            }
            
            @keyframes routePulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.8; }
            }
            
            /* Стилі для категорій в синій палітрі */
            .category-laboratory { fill: #e8eaf6; stroke: #3f51b5; }
            .category-restroom { fill: #e1f5fe; stroke: #0288d1; }
            .category-food-service { fill: #e0f7fa; stroke: #0097a7; }
            .category-utility { fill: #f3e5f5; stroke: #7b1fa2; }
            .category-recreation { fill: #e8f5e8; stroke: #388e3c; }
            .category-workspace { fill: #e3f2fd; stroke: #1976d2; }
        `;
    }

    async loadFloors() {
        if (!this.currentMapData) return;

        const floorButtons = document.getElementById('floor-buttons');
        floorButtons.innerHTML = '';

        if (this.currentMapData.floors && this.currentMapData.floors.length > 0) {
            this.currentMapData.floors.forEach((floor, index) => {
                const button = document.createElement('button');
                button.textContent = `Поверх ${floor.number}`;
                button.setAttribute('data-floor', floor.number);
                button.classList.add('md-chip');
                button.setAttribute('role', 'radio');
                button.setAttribute('aria-checked', floor.number === '1' ? 'true' : 'false');

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
            const button = document.createElement('button');
            button.textContent = 'Поверх 1';
            button.classList.add('md-chip', 'active');
            button.setAttribute('role', 'radio');
            button.setAttribute('aria-checked', 'true');
            floorButtons.appendChild(button);
            document.getElementById('current-floor').textContent = '1';
        }
    }

    async loadRooms() {
        if (!this.currentMapData || !this.currentMapData.rooms) return;

        const fromSelect = document.getElementById('from-select');
        const toSelect = document.getElementById('to-select');

        fromSelect.innerHTML = '<option value="">Виберіть початкову кімнату</option>';
        toSelect.innerHTML = '<option value="">Виберіть кінцеву кімнату</option>';

        this.currentMapData.rooms.forEach(room => {
            if (room.access) {
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

        document.getElementById('current-floor').textContent = floorNumber;
        this.announceToScreenReader(`Обрано поверх ${floorNumber}`);
    }

    selectRoom(room) {
        this.selectedRoom = room;

        // Скидаємо попереднє виділення
        document.querySelectorAll('.room').forEach(r => {
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

        this.announceToScreenReader(`Обрано кімнату ${room.label || room.id}`);
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

        // Налаштовуємо обробники
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
        setTimeout(() => {
            document.addEventListener('click', this.hideContextMenu.bind(this), { once: true });
        }, 100);
    }

    hideContextMenu() {
        document.getElementById('context-menu').style.display = 'none';
    }

    setRouteDestination(room) {
        document.getElementById('to-select').value = room.id;
        this.announceToScreenReader(`Встановлено кінцеву точку: ${room.label || room.id}`);
    }

    setRouteOrigin(room) {
        document.getElementById('from-select').value = room.id;
        this.announceToScreenReader(`Встановлено початкову точку: ${room.label || room.id}`);
    }

    updateBuildingInfo() {
        if (this.currentMapData && this.currentMapData.building) {
            document.getElementById('building-name').textContent =
                this.currentMapData.building.label || 'Університет';
        }
    }

    updateSystemInfo() {
        if (this.currentMapData) {
            document.getElementById('current-map-name').textContent = this.getCurrentMapName();
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

    updateConnectionStatus(status) {
        const statusElement = document.getElementById('connection-status');
        statusElement.textContent = status;
    }

    // Методи масштабування та переміщення
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

    // Управління видимістю nodes та edges
    toggleRouteMode(isActive) {
        const mapContainer = document.getElementById('map-container');
        if (isActive) {
            mapContainer.classList.add('route-active');
        } else {
            mapContainer.classList.remove('route-active');
        }
    }

    // Методи для відображення стану
    showLoading() {
        const loadingIndicator = document.getElementById('loading-indicator');
        const mapSvg = document.getElementById('map-svg');

        loadingIndicator.style.display = 'flex';
        mapSvg.style.display = 'none';

        // Оголошуємо початок завантаження
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

        // Фокус на кнопці закриття для доступності
        setTimeout(() => {
            document.getElementById('close-error').focus();
        }, 100);

        this.announceToScreenReader(`Помилка: ${message}`);
    }

    hideError() {
        document.getElementById('error-modal').style.display = 'none';
    }

    // Оголошення для screen readers
    announceToScreenReader(message) {
        // Створюємо живий регіон для оголошень
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

        // Очищуємо через 1 секунду
        setTimeout(() => {
            announcement.textContent = '';
        }, 1000);
    }

    // Fallback метод рендерингу карти
    async renderMap() {
        if (!this.currentMapData) return;

        const svgContainer = document.getElementById('map-svg');
        svgContainer.innerHTML = '';

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        const viewBox = this.currentMapData.metadata.viewBox;

        if (viewBox) {
            svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
        }

        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100%');
        svg.setAttribute('id', 'main-svg');
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', 'Карта університету');

        // Додаємо стилі
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
        style.textContent = this.getMapStyles();
        defs.appendChild(style);
        svg.appendChild(defs);

        // Рендеримо елементи карти
        this.renderWalls(svg);
        this.renderEdges(svg);
        this.renderRooms(svg);
        this.renderNodes(svg);

        svgContainer.appendChild(svg);
        this.updateBuildingInfo();
    }

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
        roomGroup.setAttribute('role', 'button');
        roomGroup.setAttribute('aria-label', `Кімната ${room.label || room.id}`);
        roomGroup.setAttribute('tabindex', '0');

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

        roomGroup.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.selectRoom(room);
            }
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

        roomGroup.addEventListener('focus', () => {
            this.highlightRoom(room.id, true);
        });

        roomGroup.addEventListener('blur', () => {
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

        const nodesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        nodesGroup.setAttribute('id', 'nodes-group');
        nodesGroup.setAttribute('data-name', 'node');

        this.currentMapData.nodes.forEach(nodeData => {
            const nodeElement = this.createOriginalNodeCopy(nodeData);
            if (nodeElement) {
                nodesGroup.appendChild(nodeElement);
            }
        });

        svg.appendChild(nodesGroup);
    }

    createOriginalNodeCopy(nodeData) {
        if (!nodeData.geometry) return null;

        const nodeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        nodeGroup.setAttribute('id', nodeData.id);
        nodeGroup.setAttribute('data-name', 'node');
        nodeGroup.setAttribute('data-type', nodeData.type);
        nodeGroup.setAttribute('data-room-id', nodeData.roomId);

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

        const edgesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        edgesGroup.setAttribute('id', 'edges-group');
        edgesGroup.setAttribute('data-name', 'edge');

        this.currentMapData.edges.forEach(edgeData => {
            const edgeElement = this.createOriginalEdgeCopy(edgeData);
            if (edgeElement) {
                edgesGroup.appendChild(edgeElement);
            }
        });

        svg.appendChild(edgesGroup);
    }

    createOriginalEdgeCopy(edgeData) {
        if (!edgeData.geometry) return null;

        const edgeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        edgeGroup.setAttribute('id', edgeData.id);
        edgeGroup.setAttribute('data-name', 'edge');
        edgeGroup.setAttribute('data-weight', edgeData.weight);
        edgeGroup.setAttribute('data-nodes-id', `${edgeData.fromNodeId},${edgeData.toNodeId}`);

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

    getMapStyles() {
        return `
            .wall {
                fill: #eceff1;
                stroke: #90a4ae;
                stroke-width: 1;
                fill-rule: evenodd;
            }
            
            .room {
                fill: #e3f2fd;
                stroke: #1976d2;
                stroke-width: 1;
                cursor: pointer;
                transition: all 0.2s cubic-bezier(0.4, 0.0, 0.2, 1);
            }
            
            .room:hover, .room.highlighted, .room:focus {
                fill: #bbdefb;
                stroke: #1565c0;
                stroke-width: 2;
            }
            
            .room.selected {
                fill: #42a5f5;
                stroke: #1565c0;
                stroke-width: 2;
            }
            
            .category-laboratory { fill: #e8eaf6; stroke: #3f51b5; }
            .category-restroom { fill: #e1f5fe; stroke: #0288d1; }
            .category-food-service { fill: #e0f7fa; stroke: #0097a7; }
            .category-utility { fill: #f3e5f5; stroke: #7b1fa2; }
            .category-recreation { fill: #e8f5e8; stroke: #388e3c; }
            .category-workspace { fill: #e3f2fd; stroke: #1976d2; }
            
            .cls-3 {
                fill: #fff9c4;
                stroke: #f57f17;
            }
            
            .cls-4 {
                fill: #1976d2;
                stroke: #1565c0;
            }
            
            .route-highlight {
                fill: #00e5ff !important;
                stroke: #00796b !important;
                stroke-width: 3 !important;
            }
        `;
    }
}

// Ініціалізуємо карту після завантаження DOM
document.addEventListener('DOMContentLoaded', () => {
    window.mapCore = new MapCore();
});