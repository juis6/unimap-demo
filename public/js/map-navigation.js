// Клас для роботи з навігацією та побудовою маршрутів - Material Design версія
class MapNavigation {
    constructor(mapCore) {
        this.mapCore = mapCore;
        this.currentRoute = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Побудова маршруту
        document.getElementById('build-route').addEventListener('click', () => {
            this.buildRoute();
        });

        // Поміняти місцями початок і кінець маршруту
        document.getElementById('swap-route').addEventListener('click', () => {
            this.swapRoute();
        });

        // Очистити маршрут
        document.getElementById('clear-route').addEventListener('click', () => {
            this.clearRoute();
        });

        // Швидкі дії
        document.getElementById('find-nearest-restroom').addEventListener('click', () => {
            this.findNearest('restroom');
        });

        document.getElementById('find-nearest-food').addEventListener('click', () => {
            this.findNearest('food-service');
        });

        document.getElementById('find-exit').addEventListener('click', () => {
            this.findExit();
        });

        // Дії з вибраною кімнатою
        document.getElementById('route-to-room').addEventListener('click', () => {
            this.routeToSelectedRoom();
        });

        document.getElementById('route-from-room').addEventListener('click', () => {
            this.routeFromSelectedRoom();
        });

        document.getElementById('highlight-room').addEventListener('click', () => {
            this.highlightSelectedRoom();
        });
    }

    async buildRoute() {
        const fromSelect = document.getElementById('from-select');
        const toSelect = document.getElementById('to-select');

        const fromRoomId = fromSelect.value;
        const toRoomId = toSelect.value;

        if (!fromRoomId || !toRoomId) {
            this.mapCore.showError('Будь ласка, виберіть початкову та кінцеву кімнати');
            return;
        }

        if (fromRoomId === toRoomId) {
            this.mapCore.showError('Початкова та кінцева кімнати не можуть бути однаковими');
            return;
        }

        // Показуємо індикатор завантаження
        this.showRouteBuilding();

        try {
            const mapSelect = document.getElementById('map-list');
            const currentMapId = mapSelect.value;

            // Активуємо режим маршруту для показу nodes та edges
            this.mapCore.toggleRouteMode(true);

            const response = await fetch('/map/route', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    mapId: currentMapId,
                    fromRoomId: fromRoomId,
                    toRoomId: toRoomId
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();

            if (result.error) {
                throw new Error(result.error);
            }

            this.displayRoute(result.route);
            this.mapCore.announceToScreenReader('Маршрут успішно побудовано');

        } catch (error) {
            console.error('Error building route:', error);
            this.mapCore.showError('Помилка побудови маршруту: ' + error.message);
            // Вимикаємо режим маршруту при помилці
            this.mapCore.toggleRouteMode(false);
        } finally {
            this.hideRouteBuilding();
        }
    }

    showRouteBuilding() {
        const buildButton = document.getElementById('build-route');
        buildButton.disabled = true;
        buildButton.textContent = 'Будується маршрут...';
        buildButton.style.opacity = '0.6';
    }

    hideRouteBuilding() {
        const buildButton = document.getElementById('build-route');
        buildButton.disabled = false;
        buildButton.textContent = 'Побудувати маршрут';
        buildButton.style.opacity = '1';
    }

    displayRoute(route) {
        this.currentRoute = route;

        // Очищуємо попередній маршрут
        this.clearRouteDisplay();

        // Підсвічуємо кімнати та ребра маршруту
        this.highlightRoute(route);

        // Показуємо інформацію про маршрут
        this.showRouteInfo(route);

        // Показуємо панель з інформацією про маршрут
        const routeInfo = document.getElementById('route-info');
        routeInfo.style.display = 'block';

        // Додаємо ARIA-атрибути для доступності
        routeInfo.setAttribute('aria-live', 'polite');
        routeInfo.setAttribute('aria-expanded', 'true');
    }

    highlightRoute(route) {
        // Підсвічуємо вузли маршруту
        route.path.forEach(nodeId => {
            const nodeElement = document.getElementById(nodeId);
            if (nodeElement) {
                nodeElement.classList.add('route-highlight');
            }
        });

        // Підсвічуємо ребра маршруту
        if (route.edges) {
            route.edges.forEach(edge => {
                const edgeElement = document.getElementById(edge.id);
                if (edgeElement) {
                    edgeElement.classList.add('route-highlight');
                }
            });
        }

        // Підсвічуємо кімнати маршруту
        route.nodes.forEach(routeNode => {
            if (routeNode.room) {
                const roomElement = document.getElementById(routeNode.room.id);
                if (roomElement) {
                    roomElement.classList.add('route-highlight');
                    // Додаємо ARIA-атрибут для індикації що кімната частина маршруту
                    roomElement.setAttribute('aria-describedby', 'route-description');
                }
            }
        });

        // Створюємо опис маршруту для screen readers
        this.createRouteDescription(route);
    }

    createRouteDescription(route) {
        let description = document.getElementById('route-description');
        if (!description) {
            description = document.createElement('div');
            description.id = 'route-description';
            description.className = 'sr-only';
            document.body.appendChild(description);
        }

        const fromRoom = route.nodes[0]?.room?.label || 'початкова точка';
        const toRoom = route.nodes[route.nodes.length - 1]?.room?.label || 'кінцева точка';
        const distance = Math.round(route.distance * 10) / 10;

        description.textContent = `Активний маршрут від ${fromRoom} до ${toRoom}, відстань ${distance} метрів`;
    }

    showRouteInfo(route) {
        const routeDistance = document.getElementById('route-distance');
        const routeSteps = document.getElementById('route-steps');

        // Показуємо відстань з часом
        const distance = Math.round(route.distance * 10) / 10;
        const estimatedTime = this.calculateRouteTime(route);

        routeDistance.innerHTML = `
            <div>Відстань: <strong>${distance}</strong> м</div>
            <div style="font-size: 0.75rem; color: var(--md-text-secondary); margin-top: 4px;">
                Приблизний час: ${estimatedTime} хв
            </div>
        `;

        // Створюємо кроки маршруту
        routeSteps.innerHTML = '';

        route.nodes.forEach((routeNode, index) => {
            const step = document.createElement('div');
            step.classList.add('route-step');
            step.setAttribute('role', 'listitem');

            if (routeNode.room) {
                if (index === 0) {
                    step.innerHTML = `
                        <strong>${index + 1}. Початок</strong><br>
                        <span style="color: var(--md-text-secondary);">${routeNode.room.label}</span>
                    `;
                } else if (index === route.nodes.length - 1) {
                    step.innerHTML = `
                        <strong>${index + 1}. Кінець</strong><br>
                        <span style="color: var(--md-text-secondary);">${routeNode.room.label}</span>
                    `;
                } else {
                    step.innerHTML = `
                        <strong>${index + 1}. Через</strong><br>
                        <span style="color: var(--md-text-secondary);">${routeNode.room.label}</span>
                    `;
                }
            } else {
                step.innerHTML = `
                    <strong>${index + 1}.</strong> 
                    <span style="color: var(--md-text-secondary);">Навігаційна точка</span>
                `;
            }

            routeSteps.appendChild(step);
        });
    }

    calculateRouteTime(route, walkingSpeedKmh = 4.5) {
        if (!route) return 0;

        const distanceKm = route.distance / 1000;
        const timeHours = distanceKm / walkingSpeedKmh;
        const timeMinutes = Math.ceil(timeHours * 60);

        return Math.max(timeMinutes, 1); // Мінімум 1 хвилина
    }

    clearRoute() {
        this.clearRouteDisplay();
        this.currentRoute = null;

        // Приховуємо панель маршруту
        const routeInfo = document.getElementById('route-info');
        routeInfo.style.display = 'none';
        routeInfo.setAttribute('aria-expanded', 'false');

        // Вимикаємо режим маршруту
        this.mapCore.toggleRouteMode(false);

        // Видаляємо опис маршруту
        const description = document.getElementById('route-description');
        if (description) {
            description.remove();
        }

        this.mapCore.announceToScreenReader('Маршрут очищено');
    }

    clearRouteDisplay() {
        // Видаляємо підсвічування з усіх елементів
        document.querySelectorAll('.route-highlight').forEach(element => {
            element.classList.remove('route-highlight');
            element.removeAttribute('aria-describedby');
        });
    }

    swapRoute() {
        const fromSelect = document.getElementById('from-select');
        const toSelect = document.getElementById('to-select');

        const temp = fromSelect.value;
        fromSelect.value = toSelect.value;
        toSelect.value = temp;

        // Оголошуємо зміну для screen readers
        const fromText = fromSelect.options[fromSelect.selectedIndex]?.text || 'не вибрано';
        const toText = toSelect.options[toSelect.selectedIndex]?.text || 'не вибрано';

        this.mapCore.announceToScreenReader(`Маршрут змінено: з ${fromText} до ${toText}`);
    }

    async findNearest(category) {
        if (!this.mapCore.selectedRoom) {
            this.mapCore.showError('Спочатку виберіть кімнату на карті');
            return;
        }

        try {
            const mapSelect = document.getElementById('map-list');
            const currentMapId = mapSelect.value;

            const response = await fetch(`/map/search/${currentMapId}?category=${category}`);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();

            if (result.results.length === 0) {
                const categoryName = this.mapCore.getCategoryName(category);
                this.mapCore.showError(`Кімнати категорії "${categoryName}" не знайдено`);
                return;
            }

            // Знаходимо найближчу кімнату
            const nearest = this.findNearestRoom(this.mapCore.selectedRoom, result.results);

            if (nearest) {
                // Встановлюємо маршрут
                document.getElementById('from-select').value = this.mapCore.selectedRoom.id;
                document.getElementById('to-select').value = nearest.id;

                // Будуємо маршрут
                await this.buildRoute();

                const categoryName = this.mapCore.getCategoryName(category);
                this.mapCore.announceToScreenReader(`Знайдено найближчий ${categoryName.toLowerCase()}: ${nearest.label}`);
            }

        } catch (error) {
            console.error('Error finding nearest:', error);
            this.mapCore.showError('Помилка пошуку найближчої кімнати: ' + error.message);
        }
    }

    findNearestRoom(fromRoom, rooms) {
        if (!fromRoom || !rooms || rooms.length === 0) return null;

        let nearest = null;
        let minDistance = Infinity;

        const fromCenter = this.calculateRoomCenter(fromRoom);

        rooms.forEach(room => {
            if (room.id === fromRoom.id) return;

            const roomCenter = this.calculateRoomCenter(room);
            const distance = Math.sqrt(
                Math.pow(roomCenter.x - fromCenter.x, 2) +
                Math.pow(roomCenter.y - fromCenter.y, 2)
            );

            if (distance < minDistance) {
                minDistance = distance;
                nearest = room;
            }
        });

        return nearest;
    }

    calculateRoomCenter(room) {
        if (!room.geometry || !room.geometry.children || room.geometry.children.length === 0) {
            return { x: 0, y: 0 };
        }

        const shape = room.geometry.children[0];

        if (shape.type === 'polygon' || shape.type === 'polyline') {
            const points = shape.coordinates;
            if (points.length > 0) {
                const centerX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
                const centerY = points.reduce((sum, p) => sum + p.y, 0) / points.length;
                return { x: centerX, y: centerY };
            }
        }

        if (shape.type === 'rect' && shape.coordinates) {
            return {
                x: shape.coordinates.x + shape.coordinates.width / 2,
                y: shape.coordinates.y + shape.coordinates.height / 2
            };
        }

        return { x: 0, y: 0 };
    }

    findExit() {
        if (!this.mapCore.currentMapData || !this.mapCore.currentMapData.rooms) {
            this.mapCore.showError('Карта не завантажена');
            return;
        }

        const exits = this.mapCore.currentMapData.rooms.filter(room =>
            room.keywords.some(keyword =>
                keyword.toLowerCase().includes('exit') ||
                keyword.toLowerCase().includes('вихід') ||
                keyword.toLowerCase().includes('entrance') ||
                keyword.toLowerCase().includes('вхід')
            )
        );

        if (exits.length === 0) {
            this.mapCore.showError('Виходи не знайдено на карті');
            return;
        }

        // Підсвічуємо всі виходи
        exits.forEach(exit => {
            this.mapCore.highlightRoom(exit.id, true);
        });

        // Оголошуємо кількість знайдених виходів
        this.mapCore.announceToScreenReader(`Знайдено ${exits.length} виходів`);

        // Якщо є вибрана кімната, будуємо маршрут до найближчого виходу
        if (this.mapCore.selectedRoom) {
            const nearest = this.findNearestRoom(this.mapCore.selectedRoom, exits);
            if (nearest) {
                document.getElementById('from-select').value = this.mapCore.selectedRoom.id;
                document.getElementById('to-select').value = nearest.id;
                this.buildRoute();
            }
        }

        // Видаляємо підсвічування через 5 секунд
        setTimeout(() => {
            exits.forEach(exit => {
                this.mapCore.highlightRoom(exit.id, false);
            });
        }, 5000);
    }

    routeToSelectedRoom() {
        if (!this.mapCore.selectedRoom) return;

        document.getElementById('to-select').value = this.mapCore.selectedRoom.id;
        this.mapCore.announceToScreenReader(`Встановлено кінцеву точку: ${this.mapCore.selectedRoom.label || this.mapCore.selectedRoom.id}`);
    }

    routeFromSelectedRoom() {
        if (!this.mapCore.selectedRoom) return;

        document.getElementById('from-select').value = this.mapCore.selectedRoom.id;
        this.mapCore.announceToScreenReader(`Встановлено початкову точку: ${this.mapCore.selectedRoom.label || this.mapCore.selectedRoom.id}`);
    }

    highlightSelectedRoom() {
        if (!this.mapCore.selectedRoom) return;

        this.mapCore.highlightRoom(this.mapCore.selectedRoom.id, true);
        this.mapCore.announceToScreenReader(`Підсвічено кімнату: ${this.mapCore.selectedRoom.label || this.mapCore.selectedRoom.id}`);

        // Видаляємо підсвічування через 3 секунди
        setTimeout(() => {
            if (this.mapCore.selectedRoom) {
                this.mapCore.highlightRoom(this.mapCore.selectedRoom.id, false);
            }
        }, 3000);
    }

    // Допоміжний метод для отримання всіх кімнат певної категорії
    getRoomsByCategory(category) {
        if (!this.mapCore.currentMapData || !this.mapCore.currentMapData.rooms) {
            return [];
        }

        return this.mapCore.currentMapData.rooms.filter(room =>
            room.category === category && room.access
        );
    }

    // Експорт маршруту
    exportRoute() {
        if (!this.currentRoute) {
            this.mapCore.showError('Немає маршруту для експорту');
            return;
        }

        const routeData = {
            created: new Date().toISOString(),
            distance: this.currentRoute.distance,
            estimatedTime: this.calculateRouteTime(this.currentRoute),
            steps: this.currentRoute.nodes.map((node, index) => ({
                step: index + 1,
                room: node.room ? {
                    id: node.room.id,
                    label: node.room.label,
                    category: node.room.category
                } : null,
                isNavigationPoint: !node.room
            }))
        };

        const jsonString = JSON.stringify(routeData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `route-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();

        URL.revokeObjectURL(url);
        this.mapCore.announceToScreenReader('Маршрут експортовано');
    }

    // Поділитися маршрутом
    shareRoute() {
        if (!this.currentRoute) {
            this.mapCore.showError('Немає маршруту для поділу');
            return;
        }

        const fromRoom = this.currentRoute.nodes[0]?.room;
        const toRoom = this.currentRoute.nodes[this.currentRoute.nodes.length - 1]?.room;

        if (!fromRoom || !toRoom) {
            this.mapCore.showError('Неможливо поділитися маршрутом');
            return;
        }

        const shareUrl = new URL(window.location.href);
        shareUrl.searchParams.set('from', fromRoom.id);
        shareUrl.searchParams.set('to', toRoom.id);
        shareUrl.searchParams.set('autoRoute', 'true');

        // Копіюємо URL до буферу обміну
        if (navigator.clipboard) {
            navigator.clipboard.writeText(shareUrl.toString()).then(() => {
                this.mapCore.announceToScreenReader('Посилання скопійовано до буферу обміну');
                this.showShareSuccess();
            }).catch(() => {
                this.showShareModal(shareUrl.toString());
            });
        } else {
            this.showShareModal(shareUrl.toString());
        }
    }

    // Показати повідомлення про успішне копіювання
    showShareSuccess() {
        if (window.mapUI && window.mapUI.showMessage) {
            window.mapUI.showMessage('Посилання скопійовано до буферу обміну', 'success');
        }
    }

    // Показати модальне вікно для поділу
    showShareModal(url) {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background-color: rgba(0, 0, 0, 0.32);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2000;
        `;
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'share-title');

        const content = document.createElement('div');
        content.style.cssText = `
            background-color: var(--md-surface);
            padding: var(--md-spacing-lg);
            border-radius: var(--md-border-radius);
            box-shadow: var(--md-elevation-4);
            max-width: 500px;
            width: calc(100% - var(--md-spacing-xl));
        `;

        content.innerHTML = `
            <h3 id="share-title" style="margin-bottom: var(--md-spacing-md); color: var(--md-text-primary);">
                Поділитися маршрутом
            </h3>
            <p style="margin-bottom: var(--md-spacing-md); color: var(--md-text-secondary);">
                Скопіюйте це посилання для поділу:
            </p>
            <div class="md-text-field">
                <input type="text" value="${url}" readonly style="font-family: monospace; font-size: 0.875rem;">
            </div>
            <div style="display: flex; gap: var(--md-spacing-sm); justify-content: flex-end; margin-top: var(--md-spacing-md);">
                <button id="copy-link" class="md-button md-button-contained">Копіювати</button>
                <button id="close-share-modal" class="md-button md-button-outlined">Закрити</button>
            </div>
        `;

        // Обробники подій
        content.querySelector('#close-share-modal').addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        content.querySelector('#copy-link').addEventListener('click', () => {
            const input = content.querySelector('input');
            input.select();
            document.execCommand('copy');
            this.mapCore.announceToScreenReader('Посилання скопійовано');
            document.body.removeChild(modal);
        });

        // Закриття по Escape
        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.body.removeChild(modal);
            }
        });

        // Автоматично виділяємо текст та фокусуємо
        setTimeout(() => {
            const input = content.querySelector('input');
            input.focus();
            input.select();
        }, 100);

        modal.appendChild(content);
        document.body.appendChild(modal);
    }

    // Обробка URL параметрів для автоматичної побудови маршруту
    handleAutoRoute() {
        const urlParams = new URLSearchParams(window.location.search);
        const fromRoomId = urlParams.get('from');
        const toRoomId = urlParams.get('to');
        const autoRoute = urlParams.get('autoRoute');

        if (fromRoomId && toRoomId && autoRoute === 'true') {
            // Затримка для завантаження карти
            setTimeout(() => {
                const fromSelect = document.getElementById('from-select');
                const toSelect = document.getElementById('to-select');

                fromSelect.value = fromRoomId;
                toSelect.value = toRoomId;

                this.buildRoute();

                // Очищуємо URL параметри
                const newUrl = new URL(window.location.href);
                newUrl.searchParams.delete('from');
                newUrl.searchParams.delete('to');
                newUrl.searchParams.delete('autoRoute');
                window.history.replaceState({}, '', newUrl);

                this.mapCore.announceToScreenReader('Автоматично побудовано маршрут з посилання');
            }, 1500);
        }
    }

    // Обчислення відстані між двома точками
    calculateDistance(point1, point2) {
        return Math.sqrt(
            Math.pow(point2.x - point1.x, 2) +
            Math.pow(point2.y - point1.y, 2)
        );
    }

    // Створення доступних кнопок дій з маршрутом
    createRouteActions() {
        const routeInfo = document.getElementById('route-info');
        if (!routeInfo) return;

        let actionsContainer = document.getElementById('route-actions');
        if (!actionsContainer) {
            actionsContainer = document.createElement('div');
            actionsContainer.id = 'route-actions';
            actionsContainer.style.cssText = `
                margin-top: var(--md-spacing-md);
                display: flex;
                gap: var(--md-spacing-sm);
                flex-wrap: wrap;
            `;

            actionsContainer.innerHTML = `
                <button id="export-route" class="md-button md-button-outlined" 
                        style="flex: 1; font-size: 0.75rem; padding: var(--md-spacing-sm);"
                        aria-describedby="route-title">
                    Експорт
                </button>
                <button id="share-route" class="md-button md-button-outlined" 
                        style="flex: 1; font-size: 0.75rem; padding: var(--md-spacing-sm);"
                        aria-describedby="route-title">
                    Поділитися
                </button>
            `;

            routeInfo.appendChild(actionsContainer);

            // Додаємо обробники подій
            document.getElementById('export-route').addEventListener('click', () => this.exportRoute());
            document.getElementById('share-route').addEventListener('click', () => this.shareRoute());
        }
    }

    // Ініціалізація дій з маршрутом при відображенні
    initializeRouteActions() {
        if (this.currentRoute) {
            this.createRouteActions();
        }
    }
}

// Ініціалізуємо навігацію після завантаження DOM
document.addEventListener('DOMContentLoaded', () => {
    // Чекаємо ініціалізації MapCore
    const initNavigation = () => {
        if (window.mapCore) {
            window.mapNavigation = new MapNavigation(window.mapCore);
            window.mapNavigation.handleAutoRoute();
        } else {
            setTimeout(initNavigation, 100);
        }
    };

    initNavigation();
});