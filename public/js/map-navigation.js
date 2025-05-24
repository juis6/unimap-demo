// Клас для роботи з навігацією та побудовою маршрутів
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

        try {
            const mapSelect = document.getElementById('map-list');
            const currentMapId = mapSelect.value;

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

        } catch (error) {
            console.error('Error building route:', error);
            this.mapCore.showError('Помилка побудови маршруту: ' + error.message);
        }
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
        document.getElementById('route-info').style.display = 'block';
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
                }
            }
        });
    }

    showRouteInfo(route) {
        const routeDistance = document.getElementById('route-distance');
        const routeSteps = document.getElementById('route-steps');

        // Показуємо відстань
        routeDistance.querySelector('span').textContent = Math.round(route.distance * 10) / 10;

        // Створюємо кроки маршруту
        routeSteps.innerHTML = '';

        route.nodes.forEach((routeNode, index) => {
            const step = document.createElement('div');
            step.classList.add('route-step');

            if (routeNode.room) {
                if (index === 0) {
                    step.textContent = `${index + 1}. Початок: ${routeNode.room.label}`;
                } else if (index === route.nodes.length - 1) {
                    step.textContent = `${index + 1}. Кінець: ${routeNode.room.label}`;
                } else {
                    step.textContent = `${index + 1}. Через: ${routeNode.room.label}`;
                }
            } else {
                step.textContent = `${index + 1}. Навігаційна точка`;
            }

            routeSteps.appendChild(step);
        });
    }

    clearRoute() {
        this.clearRouteDisplay();
        this.currentRoute = null;
        document.getElementById('route-info').style.display = 'none';
    }

    clearRouteDisplay() {
        // Видаляємо підсвічування з усіх елементів
        document.querySelectorAll('.route-highlight').forEach(element => {
            element.classList.remove('route-highlight');
        });
    }

    swapRoute() {
        const fromSelect = document.getElementById('from-select');
        const toSelect = document.getElementById('to-select');

        const temp = fromSelect.value;
        fromSelect.value = toSelect.value;
        toSelect.value = temp;
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
                this.mapCore.showError(`Кімнати категорії "${this.mapCore.getCategoryName(category)}" не знайдено`);
                return;
            }

            // Знаходимо найближчу кімнату (спрощений алгоритм)
            const nearest = this.findNearestRoom(this.mapCore.selectedRoom, result.results);

            if (nearest) {
                // Встановлюємо маршрут
                document.getElementById('from-select').value = this.mapCore.selectedRoom.id;
                document.getElementById('to-select').value = nearest.id;

                // Будуємо маршрут
                await this.buildRoute();
            }

        } catch (error) {
            console.error('Error finding nearest:', error);
            this.mapCore.showError('Помилка пошуку найближчої кімнати: ' + error.message);
        }
    }

    findNearestRoom(fromRoom, rooms) {
        if (!fromRoom || !rooms || rooms.length === 0) return null;

        // Спрощений алгоритм - знаходимо кімнату з найменшою відстанню за координатами
        let nearest = null;
        let minDistance = Infinity;

        const fromCenter = this.mapCore.calculateRoomCenter ?
            this.mapCore.calculateRoomCenter(fromRoom.geometry) :
            { x: 0, y: 0 };

        rooms.forEach(room => {
            if (room.id === fromRoom.id) return; // Пропускаємо ту ж кімнату

            const roomCenter = this.mapCore.calculateRoomCenter ?
                this.mapCore.calculateRoomCenter(room.geometry) :
                { x: 0, y: 0 };

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

    findExit() {
        // Спрощена реалізація - шукаємо кімнати з ключовими словами "exit" або "вихід"
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

        // Якщо є вибрана кімната, будуємо маршрут до найближчого виходу
        if (this.mapCore.selectedRoom) {
            const nearest = this.findNearestRoom(this.mapCore.selectedRoom, exits);
            if (nearest) {
                document.getElementById('from-select').value = this.mapCore.selectedRoom.id;
                document.getElementById('to-select').value = nearest.id;
                this.buildRoute();
            }
        }
    }

    routeToSelectedRoom() {
        if (!this.mapCore.selectedRoom) return;

        document.getElementById('to-select').value = this.mapCore.selectedRoom.id;
    }

    routeFromSelectedRoom() {
        if (!this.mapCore.selectedRoom) return;

        document.getElementById('from-select').value = this.mapCore.selectedRoom.id;
    }

    highlightSelectedRoom() {
        if (!this.mapCore.selectedRoom) return;

        this.mapCore.highlightRoom(this.mapCore.selectedRoom.id, true);

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

    // Метод для анімованого переходу до кімнати
    panToRoom(roomId) {
        const roomElement = document.getElementById(roomId);
        if (roomElement && window.mapUI) {
            window.mapUI.panToRoom(roomId);
        }
    }

    // Обчислення центру кімнати для навігації
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

    // Обчислення відстані між двома точками
    calculateDistance(point1, point2) {
        return Math.sqrt(
            Math.pow(point2.x - point1.x, 2) +
            Math.pow(point2.y - point1.y, 2)
        );
    }

    // Створення маршруту з використанням A* алгоритму (альтернатива Дейкстрі)
    async buildRouteAStar(fromRoomId, toRoomId) {
        try {
            const mapSelect = document.getElementById('map-list');
            const currentMapId = mapSelect.value;

            const response = await fetch('/map/route', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    mapId: currentMapId,
                    fromRoomId: fromRoomId,
                    toRoomId: toRoomId,
                    algorithm: 'astar'
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

        } catch (error) {
            console.error('Error building A* route:', error);
            this.mapCore.showError('Помилка побудови маршруту: ' + error.message);
        }
    }

    // Розрахунок альтернативних маршрутів
    async findAlternativeRoutes(fromRoomId, toRoomId) {
        try {
            const mapSelect = document.getElementById('map-list');
            const currentMapId = mapSelect.value;

            const response = await fetch('/map/route/alternatives', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    mapId: currentMapId,
                    fromRoomId: fromRoomId,
                    toRoomId: toRoomId,
                    maxAlternatives: 3
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            this.displayAlternativeRoutes(result.routes);

        } catch (error) {
            console.error('Error finding alternative routes:', error);
            this.mapCore.showError('Помилка пошуку альтернативних маршрутів: ' + error.message);
        }
    }

    // Відображення альтернативних маршрутів
    displayAlternativeRoutes(routes) {
        if (!routes || routes.length === 0) {
            this.mapCore.showError('Альтернативні маршрути не знайдено');
            return;
        }

        // Створюємо модальне вікно для вибору маршруту
        const modal = this.createRouteSelectionModal(routes);
        document.body.appendChild(modal);
    }

    // Створення модального вікна для вибору маршруту
    createRouteSelectionModal(routes) {
        const modal = document.createElement('div');
        modal.id = 'route-selection-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 2000;
        `;

        const content = document.createElement('div');
        content.style.cssText = `
            background: white;
            padding: 2rem;
            border-radius: 8px;
            max-width: 600px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
        `;

        content.innerHTML = `
            <h3>Виберіть маршрут</h3>
            <div id="route-options"></div>
            <div style="margin-top: 1rem; text-align: right;">
                <button id="cancel-route-selection">Скасувати</button>
            </div>
        `;

        const routeOptions = content.querySelector('#route-options');

        routes.forEach((route, index) => {
            const option = document.createElement('div');
            option.style.cssText = `
                border: 1px solid #dee2e6;
                border-radius: 4px;
                padding: 1rem;
                margin-bottom: 1rem;
                cursor: pointer;
                transition: all 0.2s ease;
            `;

            option.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong>Маршрут ${index + 1}</strong>
                        <div style="color: #6c757d; font-size: 0.9rem;">
                            Відстань: ${Math.round(route.distance * 10) / 10} м
                        </div>
                        <div style="color: #6c757d; font-size: 0.9rem;">
                            Кроків: ${route.nodes.length}
                        </div>
                    </div>
                    <div style="color: ${index === 0 ? '#28a745' : '#6c757d'};">
                        ${index === 0 ? '(Рекомендований)' : ''}
                    </div>
                </div>
            `;

            option.addEventListener('mouseenter', () => {
                option.style.background = '#f8f9fa';
                this.previewRoute(route);
            });

            option.addEventListener('mouseleave', () => {
                option.style.background = 'white';
                this.clearRoutePreview();
            });

            option.addEventListener('click', () => {
                this.displayRoute(route);
                document.body.removeChild(modal);
            });

            routeOptions.appendChild(option);
        });

        // Обробник закриття модального вікна
        content.querySelector('#cancel-route-selection').addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });

        modal.appendChild(content);
        return modal;
    }

    // Попередній перегляд маршруту
    previewRoute(route) {
        this.clearRouteDisplay();

        // Підсвічуємо маршрут з меншою прозорістю
        route.path.forEach(nodeId => {
            const nodeElement = document.getElementById(nodeId);
            if (nodeElement) {
                nodeElement.classList.add('route-preview');
            }
        });

        if (route.edges) {
            route.edges.forEach(edge => {
                const edgeElement = document.getElementById(edge.id);
                if (edgeElement) {
                    edgeElement.classList.add('route-preview');
                }
            });
        }
    }

    // Очищення попереднього перегляду маршруту
    clearRoutePreview() {
        document.querySelectorAll('.route-preview').forEach(element => {
            element.classList.remove('route-preview');
        });
    }

    // Збереження маршруту
    saveRoute(routeName = null) {
        if (!this.currentRoute) {
            this.mapCore.showError('Немає маршруту для збереження');
            return;
        }

        const name = routeName || prompt('Введіть назву маршруту:');
        if (!name) return;

        try {
            let savedRoutes = JSON.parse(localStorage.getItem('savedRoutes') || '[]');

            const routeData = {
                id: Date.now().toString(),
                name: name,
                created: new Date().toISOString(),
                fromRoomId: this.currentRoute.nodes[0]?.room?.id,
                toRoomId: this.currentRoute.nodes[this.currentRoute.nodes.length - 1]?.room?.id,
                distance: this.currentRoute.distance,
                path: this.currentRoute.path
            };

            savedRoutes.unshift(routeData);

            // Обмежуємо кількість збережених маршрутів
            savedRoutes = savedRoutes.slice(0, 20);

            localStorage.setItem('savedRoutes', JSON.stringify(savedRoutes));

            this.mapCore.showMessage?.('Маршрут збережено', 'success');
            this.updateSavedRoutesUI();

        } catch (error) {
            console.error('Error saving route:', error);
            this.mapCore.showError('Помилка збереження маршруту');
        }
    }

    // Завантаження збереженого маршруту
    loadSavedRoute(routeId) {
        try {
            const savedRoutes = JSON.parse(localStorage.getItem('savedRoutes') || '[]');
            const route = savedRoutes.find(r => r.id === routeId);

            if (!route) {
                this.mapCore.showError('Збережений маршрут не знайдено');
                return;
            }

            // Встановлюємо початкову та кінцеву точки
            if (route.fromRoomId) {
                document.getElementById('from-select').value = route.fromRoomId;
            }

            if (route.toRoomId) {
                document.getElementById('to-select').value = route.toRoomId;
            }

            // Будуємо маршрут
            this.buildRoute();

        } catch (error) {
            console.error('Error loading saved route:', error);
            this.mapCore.showError('Помилка завантаження маршруту');
        }
    }

    // Оновлення UI збережених маршрутів
    updateSavedRoutesUI() {
        let savedRoutesContainer = document.getElementById('saved-routes');

        if (!savedRoutesContainer) {
            // Створюємо секцію збережених маршрутів
            savedRoutesContainer = document.createElement('div');
            savedRoutesContainer.id = 'saved-routes';
            savedRoutesContainer.innerHTML = `
                <h3>Збережені маршрути</h3>
                <div id="saved-routes-list"></div>
            `;

            const navigationSection = document.getElementById('navigation');
            navigationSection.appendChild(savedRoutesContainer);
        }

        const routesList = document.getElementById('saved-routes-list');
        routesList.innerHTML = '';

        try {
            const savedRoutes = JSON.parse(localStorage.getItem('savedRoutes') || '[]');

            if (savedRoutes.length === 0) {
                routesList.innerHTML = '<p style="color: #6c757d; font-size: 0.9rem;">Немає збережених маршрутів</p>';
                return;
            }

            savedRoutes.forEach(route => {
                const routeItem = document.createElement('div');
                routeItem.style.cssText = `
                    padding: 0.75rem;
                    border: 1px solid #e9ecef;
                    border-radius: 4px;
                    margin-bottom: 0.5rem;
                    background: white;
                `;

                routeItem.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div style="font-weight: 500;">${route.name}</div>
                            <div style="font-size: 0.8rem; color: #6c757d;">
                                ${Math.round(route.distance * 10) / 10} м • ${new Date(route.created).toLocaleDateString('uk-UA')}
                            </div>
                        </div>
                        <div>
                            <button onclick="window.mapNavigation.loadSavedRoute('${route.id}')" 
                                    style="background: #007bff; color: white; border: none; padding: 0.25rem 0.5rem; border-radius: 3px; font-size: 0.8rem; margin-right: 0.25rem;">
                                Завантажити
                            </button>
                            <button onclick="window.mapNavigation.deleteSavedRoute('${route.id}')" 
                                    style="background: #dc3545; color: white; border: none; padding: 0.25rem 0.5rem; border-radius: 3px; font-size: 0.8rem;">
                                ×
                            </button>
                        </div>
                    </div>
                `;

                routesList.appendChild(routeItem);
            });

        } catch (error) {
            console.error('Error updating saved routes UI:', error);
        }
    }

    // Видалення збереженого маршруту
    deleteSavedRoute(routeId) {
        try {
            let savedRoutes = JSON.parse(localStorage.getItem('savedRoutes') || '[]');
            savedRoutes = savedRoutes.filter(r => r.id !== routeId);
            localStorage.setItem('savedRoutes', JSON.stringify(savedRoutes));

            this.updateSavedRoutesUI();
            this.mapCore.showMessage?.('Маршрут видалено', 'info');

        } catch (error) {
            console.error('Error deleting saved route:', error);
            this.mapCore.showError('Помилка видалення маршруту');
        }
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
                this.mapCore.showMessage?.('Посилання скопійовано до буферу обміну', 'success');
            }).catch(() => {
                this.showShareModal(shareUrl.toString());
            });
        } else {
            this.showShareModal(shareUrl.toString());
        }
    }

    // Показати модальне вікно для поділу
    showShareModal(url) {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 2000;
        `;

        const content = document.createElement('div');
        content.style.cssText = `
            background: white;
            padding: 2rem;
            border-radius: 8px;
            max-width: 500px;
            width: 90%;
        `;

        content.innerHTML = `
            <h3>Поділитися маршрутом</h3>
            <p>Скопіюйте це посилання для поділу:</p>
            <input type="text" value="${url}" readonly style="width: 100%; padding: 0.5rem; margin: 1rem 0;">
            <div style="text-align: right;">
                <button id="close-share-modal">Закрити</button>
            </div>
        `;

        content.querySelector('#close-share-modal').addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        // Автоматично виділяємо текст
        const input = content.querySelector('input');
        input.focus();
        input.select();

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
                document.getElementById('from-select').value = fromRoomId;
                document.getElementById('to-select').value = toRoomId;
                this.buildRoute();

                // Очищуємо URL параметри
                const newUrl = new URL(window.location.href);
                newUrl.searchParams.delete('from');
                newUrl.searchParams.delete('to');
                newUrl.searchParams.delete('autoRoute');
                window.history.replaceState({}, '', newUrl);
            }, 1000);
        }
    }

    // Розрахунок часу проходження маршруту
    calculateRouteTime(route, walkingSpeedKmh = 5) {
        if (!route) return 0;

        const distanceKm = route.distance / 1000;
        const timeHours = distanceKm / walkingSpeedKmh;
        const timeMinutes = Math.ceil(timeHours * 60);

        return timeMinutes;
    }

    // Оновити інформацію про маршрут з часом
    updateRouteInfoWithTime(route) {
        const routeDistance = document.getElementById('route-distance');
        const estimatedTime = this.calculateRouteTime(route);

        if (routeDistance) {
            routeDistance.innerHTML = `
                <div>Відстань: <span>${Math.round(route.distance * 10) / 10}</span> м</div>
                <div style="font-size: 0.9rem; color: #6c757d;">
                    Приблизний час: ${estimatedTime} хв
                </div>
            `;
        }
    }

    // Додати кнопки для збереження та поділу маршруту
    addRouteActionButtons() {
        const routeInfo = document.getElementById('route-info');
        if (!routeInfo) return;

        let actionsContainer = document.getElementById('route-actions');
        if (!actionsContainer) {
            actionsContainer = document.createElement('div');
            actionsContainer.id = 'route-actions';
            actionsContainer.style.cssText = `
                margin-top: 1rem;
                display: flex;
                gap: 0.5rem;
                flex-wrap: wrap;
            `;

            actionsContainer.innerHTML = `
                <button id="save-route" style="flex: 1; padding: 0.5rem; font-size: 0.9rem; background: #28a745;">
                    Зберегти
                </button>
                <button id="share-route" style="flex: 1; padding: 0.5rem; font-size: 0.9rem; background: #17a2b8;">
                    Поділитися
                </button>
                <button id="export-route" style="flex: 1; padding: 0.5rem; font-size: 0.9rem; background: #6f42c1;">
                    Експорт
                </button>
            `;

            routeInfo.appendChild(actionsContainer);

            // Додаємо обробники подій
            document.getElementById('save-route').addEventListener('click', () => this.saveRoute());
            document.getElementById('share-route').addEventListener('click', () => this.shareRoute());
            document.getElementById('export-route').addEventListener('click', () => this.exportRoute());
        }
    }
}

// Ініціалізуємо навігацію після завантаження DOM
document.addEventListener('DOMContentLoaded', () => {
    // Чекаємо ініціалізації MapCore
    const initNavigation = () => {
        if (window.mapCore) {
            window.mapNavigation = new MapNavigation(window.mapCore);
            window.mapNavigation.updateSavedRoutesUI();
            window.mapNavigation.handleAutoRoute();
        } else {
            setTimeout(initNavigation, 100);
        }
    };

    initNavigation();
});