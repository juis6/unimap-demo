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
        const roomElement = document.