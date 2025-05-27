// Клас для роботи з навігацією та побудовою маршрутів між поверхами
class MapNavigation {
    constructor(mapCore) {
        this.mapCore = mapCore;
        this.currentRoute = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.populateRoomSelects();
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

    // Заповнення випадаючих списків кімнат зі всіх поверхів
    populateRoomSelects() {
        const fromSelect = document.getElementById('from-select');
        const toSelect = document.getElementById('to-select');

        fromSelect.innerHTML = '<option value="">Виберіть початкову кімнату</option>';
        toSelect.innerHTML = '<option value="">Виберіть кінцеву кімнату</option>';

        // Отримуємо всі кімнати зі всіх поверхів
        const allRooms = this.mapCore.getAllRooms();

        // Групуємо кімнати за поверхами
        const roomsByFloor = {};
        allRooms.forEach(room => {
            if (room.access) {
                const floor = room.floor || '1';
                if (!roomsByFloor[floor]) {
                    roomsByFloor[floor] = [];
                }
                roomsByFloor[floor].push(room);
            }
        });

        // Додаємо кімнати до селектів, згруповані за поверхами
        Object.keys(roomsByFloor).sort().forEach(floor => {
            // Створюємо групу для поверху
            const fromOptgroup = document.createElement('optgroup');
            fromOptgroup.label = `Поверх ${floor}`;

            const toOptgroup = document.createElement('optgroup');
            toOptgroup.label = `Поверх ${floor}`;

            roomsByFloor[floor].forEach(room => {
                const option1 = document.createElement('option');
                option1.value = room.id;
                option1.textContent = room.label || room.id;
                fromOptgroup.appendChild(option1);

                const option2 = document.createElement('option');
                option2.value = room.id;
                option2.textContent = room.label || room.id;
                toOptgroup.appendChild(option2);
            });

            fromSelect.appendChild(fromOptgroup);
            toSelect.appendChild(toOptgroup);
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
            // Знаходимо кімнати в усіх поверхах
            const fromRoom = this.mapCore.findRoomById(fromRoomId);
            const toRoom = this.mapCore.findRoomById(toRoomId);

            if (!fromRoom || !toRoom) {
                throw new Error('Не вдалося знайти одну з кімнат');
            }

            // Будуємо маршрут (може бути між поверхами)
            const route = await this.buildInterFloorRoute(fromRoom, toRoom);

            if (!route) {
                throw new Error('Маршрут не знайдено');
            }

            this.displayRoute(route);
            this.mapCore.announceToScreenReader('Маршрут успішно побудовано');

        } catch (error) {
            console.error('Error building route:', error);
            this.mapCore.showError('Помилка побудови маршруту: ' + error.message);
        } finally {
            this.hideRouteBuilding();
        }
    }

    // Побудова маршруту між поверхами
    async buildInterFloorRoute(fromRoom, toRoom) {
        // Якщо кімнати на одному поверсі, використовуємо звичайний алгоритм
        if (fromRoom.floor === toRoom.floor) {
            return this.buildSingleFloorRoute(fromRoom, toRoom);
        }

        // Якщо кімнати на різних поверхах, шукаємо шлях через сходи
        return this.buildMultiFloorRoute(fromRoom, toRoom);
    }

    // Маршрут у межах одного поверху
    buildSingleFloorRoute(fromRoom, toRoom) {
        const mapData = this.mapCore.allMapsData.get(fromRoom.floor);
        if (!mapData) {
            console.error('Map data not found for floor:', fromRoom.floor);
            return null;
        }

        // Використовуємо алгоритм Дейкстри для пошуку шляху
        return this.dijkstraRoute(mapData, fromRoom.id, toRoom.id, fromRoom.floor);
    }

    // Маршрут між поверхами
    async buildMultiFloorRoute(fromRoom, toRoom) {
        try {
            // 1. Знаходимо найкращий шлях від початкової кімнати до сходів
            const fromFloorStairs = this.findStairsOnFloor(fromRoom.floor);
            if (!fromFloorStairs) {
                throw new Error(`Сходи не знайдено на поверсі ${fromRoom.floor}`);
            }

            const routeToStairs = this.buildSingleFloorRoute(fromRoom, fromFloorStairs);

            // 2. Знаходимо сходи на цільовому поверсі
            const toFloorStairs = this.findStairsOnFloor(toRoom.floor);
            if (!toFloorStairs) {
                throw new Error(`Сходи не знайдено на поверсі ${toRoom.floor}`);
            }

            // 3. Будуємо шлях від сходів до цільової кімнати
            const routeFromStairs = this.buildSingleFloorRoute(toFloorStairs, toRoom);

            // 4. Об'єднуємо маршрути
            return this.combineRoutes(routeToStairs, routeFromStairs, fromFloorStairs, toFloorStairs);

        } catch (error) {
            console.error('Error building multi-floor route:', error);
            return null;
        }
    }

    // Пошук сходів на поверсі
    findStairsOnFloor(floor) {
        const mapData = this.mapCore.allMapsData.get(floor);
        if (!mapData || !mapData.nodes) {
            return null;
        }

        // Шукаємо вузли типу сходів (31-01-00-xxx)
        const stairNode = mapData.nodes.find(node =>
            node.id.match(/31-01-00-\d+/) && node.type === 'nav'
        );

        if (stairNode) {
            // Створюємо віртуальну "кімнату" для сходів
            return {
                id: `stairs-${floor}`,
                nodeId: stairNode.id,
                label: `Сходи (поверх ${floor})`,
                category: 'utility',
                keywords: ['stairs', 'сходи'],
                access: true,
                floor: floor,
                isStairs: true,
                geometry: stairNode.geometry,
                position: stairNode.position
            };
        }

        return null;
    }

    // Об'єднання маршрутів
    combineRoutes(routeToStairs, routeFromStairs, fromStairs, toStairs) {
        if (!routeToStairs || !routeFromStairs) {
            return null;
        }

        // Створюємо об'єднаний маршрут
        const combinedRoute = {
            path: [...routeToStairs.path, ...routeFromStairs.path],
            nodes: [...routeToStairs.nodes, ...routeFromStairs.nodes],
            edges: [...(routeToStairs.edges || []), ...(routeFromStairs.edges || [])],
            distance: routeToStairs.distance + routeFromStairs.distance + 10, // +10 для переходу між поверхами
            isMultiFloor: true,
            floors: [fromStairs.floor, toStairs.floor],
            stairTransition: {
                from: fromStairs,
                to: toStairs
            }
        };

        return combinedRoute;
    }

    // Алгоритм Дейкстри для пошуку найкоротшого шляху
    dijkstraRoute(mapData, fromRoomId, toRoomId, floor) {
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

        return this.findShortestPath(mapData, fromNodeId, toNodeId, floor);
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
            if (node.type === 'nav' || node.type === 'sup') {
                const nodePos = node.position || { x: 0, y: 0 };
                const distance = Math.sqrt(
                    Math.pow(nodePos.x - roomCenter.x, 2) +
                    Math.pow(nodePos.y - roomCenter.y, 2)
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
    findShortestPath(mapData, fromNodeId, toNodeId, floor) {
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
            return null;
        }

        // Додаємо інформацію про кімнати та вузли
        const routeNodes = path.map(nodeId => {
            const node = mapData.nodes.find(n => n.id === nodeId);
            const room = mapData.rooms.find(r => r.nodeId === nodeId);
            return {
                nodeId,
                node,
                room: room ? { ...room, floor } : null
            };
        });

        return {
            path,
            nodes: routeNodes,
            distance: distances[toNodeId],
            edges: this.getEdgesForPath(mapData, path),
            floor
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

        // Показуємо інформацію про маршрут
        this.showRouteInfo(route);

        // Показуємо панель з інформацією про маршрут
        const routeInfo = document.getElementById('route-info');
        routeInfo.style.display = 'block';

        // Додаємо ARIA-атрибути для доступності
        routeInfo.setAttribute('aria-live', 'polite');
        routeInfo.setAttribute('aria-expanded', 'true');

        // Якщо маршрут між поверхами, показуємо відповідне повідомлення
        if (route.isMultiFloor) {
            const floorTransitionMessage = `Маршрут проходить через ${route.floors.length} поверхи`;
            this.mapCore.announceToScreenReader(floorTransitionMessage);
        }
    }

    showRouteInfo(route) {
        const routeDistance = document.getElementById('route-distance');
        const routeSteps = document.getElementById('route-steps');

        // Показуємо відстань з часом
        const distance = Math.round(route.distance * 10) / 10;
        const estimatedTime = this.calculateRouteTime(route);

        let routeTypeInfo = '';
        if (route.isMultiFloor) {
            routeTypeInfo = `<div style="font-size: 0.75rem; color: var(--md-primary); margin-top: 4px; font-weight: 500;">
                Міжповерховий маршрут (${route.floors.join(' → ')})
            </div>`;
        }

        routeDistance.innerHTML = `
            <div>Відстань: <strong>${distance}</strong> м</div>
            <div style="font-size: 0.75rem; color: var(--md-text-secondary); margin-top: 4px;">
                Приблизний час: ${estimatedTime} хв
            </div>
            ${routeTypeInfo}
        `;

        // Створюємо кроки маршруту
        routeSteps.innerHTML = '';

        if (route.isMultiFloor) {
            this.createMultiFloorSteps(route, routeSteps);
        } else {
            this.createSingleFloorSteps(route, routeSteps);
        }
    }

    createSingleFloorSteps(route, container) {
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

            container.appendChild(step);
        });
    }

    createMultiFloorSteps(route, container) {
        let stepNumber = 1;

        // Перший поверх - до сходів
        if (route.stairTransition && route.stairTransition.from) {
            const step = document.createElement('div');
            step.classList.add('route-step');
            step.innerHTML = `
                <strong>${stepNumber++}. Пройдіть до сходів</strong><br>
                <span style="color: var(--md-text-secondary);">Поверх ${route.stairTransition.from.floor}</span>
            `;
            container.appendChild(step);
        }

        // Перехід між поверхами
        if (route.floors && route.floors.length > 1) {
            const step = document.createElement('div');
            step.classList.add('route-step');
            step.style.backgroundColor = 'rgba(25, 118, 210, 0.05)';
            step.innerHTML = `
                <strong>${stepNumber++}. Підніміться/спустіться сходами</strong><br>
                <span style="color: var(--md-primary);">З поверху ${route.floors[0]} на поверх ${route.floors[1]}</span>
            `;
            container.appendChild(step);
        }

        // Другий поверх - від сходів до цілі
        if (route.stairTransition && route.stairTransition.to) {
            const step = document.createElement('div');
            step.classList.add('route-step');
            step.innerHTML = `
                <strong>${stepNumber++}. Пройдіть до кінцевої точки</strong><br>
                <span style="color: var(--md-text-secondary);">Поверх ${route.stairTransition.to.floor}</span>
            `;
            container.appendChild(step);
        }
    }

    calculateRouteTime(route, walkingSpeedKmh = 4.5) {
        if (!route) return 0;

        const distanceKm = route.distance / 1000;
        let timeHours = distanceKm / walkingSpeedKmh;

        // Додаємо додатковий час для переходу між поверхами
        if (route.isMultiFloor) {
            timeHours += 0.02; // +1.2 хвилини для переходу між поверхами
        }

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

        this.mapCore.announceToScreenReader('Маршрут очищено');
    }

    clearRouteDisplay() {
        // Видаляємо підсвічування з усіх елементів на всіх поверхах
        document.querySelectorAll('.route-highlight, .route-active').forEach(element => {
            element.classList.remove('route-highlight', 'route-active');
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
            // Отримуємо всі кімнати цієї категорії зі всіх поверхів
            const allRooms = this.mapCore.getAllRooms();
            const categoryRooms = allRooms.filter(room =>
                room.category === category && room.access
            );

            if (categoryRooms.length === 0) {
                const categoryName = this.mapCore.getCategoryName(category);
                this.mapCore.showError(`Кімнати категорії "${categoryName}" не знайдено`);
                return;
            }

            // Знаходимо найближчу кімнату (може бути на іншому поверсі)
            const nearest = this.findNearestRoom(this.mapCore.selectedRoom, categoryRooms);

            if (nearest) {
                // Встановлюємо маршрут
                this.setRouteOrigin(this.mapCore.selectedRoom);
                this.setRouteDestination(nearest);

                // Будуємо маршрут
                await this.buildRoute();

                const categoryName = this.mapCore.getCategoryName(category);
                const locationInfo = nearest.floorLabel ? ` (${nearest.floorLabel})` : '';
                this.mapCore.announceToScreenReader(`Знайдено найближчий ${categoryName.toLowerCase()}: ${nearest.label}${locationInfo}`);
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

        rooms.forEach(room => {
            if (room.id === fromRoom.id) return;

            let distance;

            // Якщо кімнати на одному поверсі, використовуємо евклідову відстань
            if (room.floor === fromRoom.floor) {
                const fromCenter = this.calculateRoomCenter(fromRoom);
                const roomCenter = this.calculateRoomCenter(room);
                distance = Math.sqrt(
                    Math.pow(roomCenter.x - fromCenter.x, 2) +
                    Math.pow(roomCenter.y - fromCenter.y, 2)
                );
            } else {
                // Якщо на різних поверхах, додаємо штраф за переміщення між поверхами
                distance = 1000 + Math.abs(parseInt(room.floor) - parseInt(fromRoom.floor)) * 100;
            }

            if (distance < minDistance) {
                minDistance = distance;
                nearest = room;
            }
        });

        return nearest;
    }

    findExit() {
        // Шукаємо виходи на всіх поверхах
        const allRooms = this.mapCore.getAllRooms();
        const exits = allRooms.filter(room =>
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

        // Групуємо виходи за поверхами
        const exitsByFloor = {};
        exits.forEach(exit => {
            const floor = exit.floor || '1';
            if (!exitsByFloor[floor]) {
                exitsByFloor[floor] = [];
            }
            exitsByFloor[floor].push(exit);
        });

        // Оголошуємо кількість знайдених виходів
        const floorCount = Object.keys(exitsByFloor).length;
        this.mapCore.announceToScreenReader(`Знайдено ${exits.length} виходів на ${floorCount} поверхах`);

        // Якщо є вибрана кімната, будуємо маршрут до найближчого виходу
        if (this.mapCore.selectedRoom) {
            const nearest = this.findNearestRoom(this.mapCore.selectedRoom, exits);
            if (nearest) {
                this.setRouteOrigin(this.mapCore.selectedRoom);
                this.setRouteDestination(nearest);
                this.buildRoute();
            }
        }
    }

    routeToSelectedRoom() {
        if (!this.mapCore.selectedRoom) return;
        this.setRouteDestination(this.mapCore.selectedRoom);
    }

    routeFromSelectedRoom() {
        if (!this.mapCore.selectedRoom) return;
        this.setRouteOrigin(this.mapCore.selectedRoom);
    }

    setRouteDestination(room) {
        const toSelect = document.getElementById('to-select');
        toSelect.value = room.id;
        const roomDescription = room.floorLabel ?
            `${room.label || room.id} (${room.floorLabel})` :
            `${room.label || room.id}`;
        this.mapCore.announceToScreenReader(`Встановлено кінцеву точку: ${roomDescription}`);
    }

    setRouteOrigin(room) {
        const fromSelect = document.getElementById('from-select');
        fromSelect.value = room.id;
        const roomDescription = room.floorLabel ?
            `${room.label || room.id} (${room.floorLabel})` :
            `${room.label || room.id}`;
        this.mapCore.announceToScreenReader(`Встановлено початкову точку: ${roomDescription}`);
    }

    highlightSelectedRoom() {
        if (!this.mapCore.selectedRoom) return;

        // Якщо кімната на іншому поверсі, переключаємося на неї
        if (this.mapCore.selectedRoom.floor &&
            this.mapCore.selectedRoom.floor !== this.mapCore.currentFloor) {
            this.mapCore.selectFloor(this.mapCore.selectedRoom.floor).then(() => {
                this.highlightRoomOnCurrentFloor();
            });
        } else {
            this.highlightRoomOnCurrentFloor();
        }
    }

    highlightRoomOnCurrentFloor() {
        if (!this.mapCore.selectedRoom) return;

        this.mapCore.highlightRoom(this.mapCore.selectedRoom.id, true);
        const roomDescription = this.mapCore.selectedRoom.floorLabel ?
            `${this.mapCore.selectedRoom.label || this.mapCore.selectedRoom.id} (${this.mapCore.selectedRoom.floorLabel})` :
            `${this.mapCore.selectedRoom.label || this.mapCore.selectedRoom.id}`;
        this.mapCore.announceToScreenReader(`Підсвічено кімнату: ${roomDescription}`);

        // Видаляємо підсвічування через 3 секунди
        setTimeout(() => {
            if (this.mapCore.selectedRoom) {
                this.mapCore.highlightRoom(this.mapCore.selectedRoom.id, false);
            }
        }, 3000);
    }

    // Допоміжний метод для отримання всіх кімнат певної категорії
    getRoomsByCategory(category) {
        const allRooms = this.mapCore.getAllRooms();
        return allRooms.filter(room => room.category === category && room.access);
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
            isMultiFloor: this.currentRoute.isMultiFloor || false,
            floors: this.currentRoute.floors || [this.currentRoute.floor],
            steps: this.currentRoute.nodes.map((node, index) => ({
                step: index + 1,
                room: node.room ? {
                    id: node.room.id,
                    label: node.room.label,
                    category: node.room.category,
                    floor: node.room.floor
                } : null,
                isNavigationPoint: !node.room,
                isStairTransition: node.room && node.room.isStairs
            }))
        };

        if (this.currentRoute.stairTransition) {
            routeData.stairTransition = {
                from: this.currentRoute.stairTransition.from.floor,
                to: this.currentRoute.stairTransition.to.floor
            };
        }

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

        // Знаходимо початкову та кінцеву кімнати
        const fromNode = this.currentRoute.nodes[0];
        const toNode = this.currentRoute.nodes[this.currentRoute.nodes.length - 1];

        if (!fromNode?.room || !toNode?.room) {
            this.mapCore.showError('Неможливо поділитися маршрутом');
            return;
        }

        const shareUrl = new URL(window.location.href);
        shareUrl.searchParams.set('from', fromNode.room.id);
        shareUrl.searchParams.set('to', toNode.room.id);
        shareUrl.searchParams.set('autoRoute', 'true');

        // Додаємо інформацію про тип маршруту
        if (this.currentRoute.isMultiFloor) {
            shareUrl.searchParams.set('multiFloor', 'true');
        }

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

        const routeTypeText = this.currentRoute.isMultiFloor ?
            ' (міжповерховий маршрут)' : '';

        content.innerHTML = `
            <h3 id="share-title" style="margin-bottom: var(--md-spacing-md); color: var(--md-text-primary);">
                Поділитися маршрутом${routeTypeText}
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
        const isMultiFloor = urlParams.get('multiFloor');

        if (fromRoomId && toRoomId && autoRoute === 'true') {
            // Затримка для завантаження всіх поверхів
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
                newUrl.searchParams.delete('multiFloor');
                window.history.replaceState({}, '', newUrl);

                const routeTypeText = isMultiFloor === 'true' ?
                    'міжповерховий маршрут' : 'маршрут';
                this.mapCore.announceToScreenReader(`Автоматично побудовано ${routeTypeText} з посилання`);
            }, 2000);
        }
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

    // Статистика навігації
    getNavigationStats() {
        const allRooms = this.mapCore.getAllRooms();
        const floors = [...new Set(allRooms.map(r => r.floor))].sort();

        const stats = {
            totalFloors: floors.length,
            totalRooms: allRooms.length,
            accessibleRooms: allRooms.filter(r => r.access).length,
            roomsByFloor: {},
            categoriesByFloor: {},
            hasStairs: false
        };

        // Статистика по поверхах
        floors.forEach(floor => {
            const floorRooms = allRooms.filter(r => r.floor === floor);
            stats.roomsByFloor[floor] = floorRooms.length;

            const categories = [...new Set(floorRooms.map(r => r.category))];
            stats.categoriesByFloor[floor] = categories.length;
        });

        // Перевіряємо наявність сходів
        floors.forEach(floor => {
            const stairs = this.findStairsOnFloor(floor);
            if (stairs) {
                stats.hasStairs = true;
            }
        });

        return stats;
    }

    // Рекомендації для покращення навігації
    getNavigationRecommendations() {
        const stats = this.getNavigationStats();
        const recommendations = [];

        if (!stats.hasStairs && stats.totalFloors > 1) {
            recommendations.push({
                type: 'warning',
                message: 'Сходи не знайдено. Міжповерхова навігація може бути недоступна.',
                action: 'Додайте вузли сходів (31-01-00-xxx) для кращої навігації'
            });
        }

        if (stats.accessibleRooms / stats.totalRooms < 0.8) {
            recommendations.push({
                type: 'info',
                message: 'Деякі кімнати недоступні для навігації',
                action: 'Перевірте налаштування доступності кімнат'
            });
        }

        return recommendations;
    }
}

// Ініціалізуємо навігацію після завантаження DOM
document.addEventListener('DOMContentLoaded', () => {
    // Чекаємо ініціалізації MapCore
    const initNavigation = () => {
        if (window.mapCore && window.mapCore.allMapsData.size > 0) {
            window.mapNavigation = new MapNavigation(window.mapCore);
            window.mapNavigation.handleAutoRoute();
        } else {
            setTimeout(initNavigation, 200);
        }
    };

    initNavigation();
});