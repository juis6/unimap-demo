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

        // Шукаємо вузли типу сходів (31-01-00-xxx) в масиві edges
        // Оскільки парсер їх виключає з nodes, шукаємо в edges
        const stairNodeId = mapData.edges.find(edge => {
            return edge.fromNodeId?.match(/^31-01-00-\d+$/) ||
                edge.toNodeId?.match(/^31-01-00-\d+$/);
        });

        if (stairNodeId) {
            const nodeId = stairNodeId.fromNodeId?.match(/^31-01-00-\d+$/) ?
                stairNodeId.fromNodeId : stairNodeId.toNodeId;

            // Створюємо віртуальну "кімнату" для сходів
            return {
                id: `stairs-${floor}`,
                nodeId: nodeId,
                label: `Сходи (поверх ${floor})`,
                category: 'utility',
                keywords: ['stairs', 'сходи'],
                access: true,
                floor: floor,
                isStairs: true,
                geometry: { type: 'virtual' },
                position: { x: 297.5, y: 430 } // Приблизна позиція сходів
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

    // Пошук найкоротшого шляху (продовження класу MapNavigation)
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
            return null; // Шлях не знайдено
        }

        // Додаємо інформацію про кімнати та вузли
        const routeNodes = path.map(nodeId => {
            const node = mapData.nodes.find(n => n.id === nodeId);
            const room = mapData.rooms.find(r => r.nodeId === nodeId);
            return {
                nodeId,
                node,
                room,
                floor: floor
            };
        });

        return {
            path,
            nodes: routeNodes,
            distance: distances[toNodeId],
            edges: this.getEdgesForPath(mapData, path),
            floor: floor
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
            const { fromNodeId, toNodeId, weight, isInterFloor } = edge;

            // Пропускаємо міжповерхові ребра для навігації в межах поверху
            if (isInterFloor) {
                return;
            }

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

    // Відображення маршруту
    displayRoute(route) {
        if (!route) {
            console.error('No route to display');
            return;
        }

        this.currentRoute = route;
        this.clearRouteDisplay();

        // Якщо маршрут між поверхами
        if (route.isMultiFloor) {
            this.displayMultiFloorRoute(route);
        } else {
            this.displaySingleFloorRoute(route);
        }

        // Показуємо інформацію про маршрут
        document.getElementById('route-info').style.display = 'block';
        document.getElementById('route-distance').querySelector('span').textContent =
            Math.round(route.distance);

        // Додаємо кроки маршруту
        this.displayRouteSteps(route);

        // Анімація маршруту
        this.animateRoute(route);
    }

    // Відображення маршруту на одному поверсі
    displaySingleFloorRoute(route) {
        // Підсвічуємо кімнати початку та кінця
        if (route.nodes.length > 0) {
            const startRoom = route.nodes[0].room;
            const endRoom = route.nodes[route.nodes.length - 1].room;

            if (startRoom) {
                this.highlightRouteRoom(startRoom.id, 'start');
            }
            if (endRoom) {
                this.highlightRouteRoom(endRoom.id, 'end');
            }
        }

        // Активуємо елементи маршруту
        this.activateRouteElements(route);
    }

    // Відображення маршруту між поверхами
    displayMultiFloorRoute(route) {
        // Показуємо інструкцію про перехід між поверхами
        const { stairTransition } = route;

        if (stairTransition) {
            const stairMessage = `Перейдіть з ${stairTransition.from.label} на ${stairTransition.to.label}`;
            this.mapCore.announceToScreenReader(stairMessage);

            // Додаємо спеціальний крок для переходу між поверхами
            const routeSteps = document.getElementById('route-steps');
            const stairStep = document.createElement('div');
            stairStep.className = 'route-step route-step-stairs';
            stairStep.innerHTML = `<strong>⬆️ ${stairMessage}</strong>`;
            routeSteps.appendChild(stairStep);
        }

        // Відображаємо частину маршруту на поточному поверсі
        this.displaySingleFloorRoute(route);
    }

    // Активація елементів маршруту на карті
    activateRouteElements(route) {
        if (!route.edges || route.edges.length === 0) return;

        const svgElement = document.getElementById('main-svg');
        if (!svgElement) return;

        // Активуємо ребра маршруту
        route.edges.forEach(edge => {
            const edgeElement = svgElement.getElementById(edge.id);
            if (edgeElement) {
                edgeElement.classList.add('route-active');
                edgeElement.style.display = 'block';
            }
        });

        // Активуємо вузли маршруту
        route.nodes.forEach(node => {
            if (node.node && node.node.id) {
                const nodeElement = svgElement.getElementById(node.node.id);
                if (nodeElement) {
                    nodeElement.classList.add('route-active');
                    nodeElement.style.display = 'block';
                }
            }
        });
    }

    // Очищення відображення маршруту
    clearRouteDisplay() {
        // Очищаємо активні елементи маршруту
        document.querySelectorAll('.route-active').forEach(element => {
            element.classList.remove('route-active');
            if (element.getAttribute('data-name') === 'node' ||
                element.getAttribute('data-name') === 'edge') {
                element.style.display = 'none';
            }
        });

        // Очищаємо підсвічування кімнат
        document.querySelectorAll('.room.route-highlight').forEach(room => {
            room.classList.remove('route-highlight');
        });

        // Приховуємо інформацію про маршрут
        document.getElementById('route-info').style.display = 'none';
        document.getElementById('route-steps').innerHTML = '';
    }

    // Підсвічування кімнати маршруту
    highlightRouteRoom(roomId, type = 'default') {
        const roomElement = document.getElementById(roomId);
        if (roomElement) {
            roomElement.classList.add('route-highlight');
            roomElement.setAttribute('data-route-type', type);
        }
    }

    // Відображення кроків маршруту
    displayRouteSteps(route) {
        const stepsContainer = document.getElementById('route-steps');
        stepsContainer.innerHTML = '';

        // Генеруємо кроки на основі вузлів маршруту
        const steps = this.generateRouteSteps(route);

        steps.forEach((step, index) => {
            const stepElement = document.createElement('div');
            stepElement.className = 'route-step';
            stepElement.setAttribute('role', 'listitem');
            stepElement.innerHTML = `<strong>${index + 1}.</strong> ${step}`;
            stepsContainer.appendChild(stepElement);
        });
    }

    // Генерація текстових інструкцій маршруту
    generateRouteSteps(route) {
        const steps = [];

        if (!route.nodes || route.nodes.length < 2) {
            return ['Маршрут не знайдено'];
        }

        // Початкова точка
        const startRoom = route.nodes[0].room;
        if (startRoom) {
            steps.push(`Початок маршруту: ${startRoom.label || startRoom.id}`);
        }

        // Проміжні кроки
        for (let i = 1; i < route.nodes.length - 1; i++) {
            const node = route.nodes[i];
            if (node.room && node.room.label) {
                steps.push(`Пройдіть повз ${node.room.label}`);
            }
        }

        // Кінцева точка
        const endRoom = route.nodes[route.nodes.length - 1].room;
        if (endRoom) {
            steps.push(`Кінець маршруту: ${endRoom.label || endRoom.id}`);
        }

        // Додаємо інформацію про відстань
        if (route.distance) {
            steps.push(`Загальна відстань: ${Math.round(route.distance)} м`);
        }

        return steps;
    }

    // Анімація маршруту
    animateRoute(route) {
        if (!route.edges || route.edges.length === 0) return;

        let currentIndex = 0;

        const animateNext = () => {
            if (currentIndex >= route.edges.length) {
                return;
            }

            const edge = route.edges[currentIndex];
            const edgeElement = document.getElementById(edge.id);

            if (edgeElement) {
                edgeElement.classList.add('route-animate');
                setTimeout(() => {
                    edgeElement.classList.remove('route-animate');
                }, 500);
            }

            currentIndex++;
            setTimeout(animateNext, 300);
        };

        // Запускаємо анімацію через невелику затримку
        setTimeout(animateNext, 500);
    }

    // Очищення маршруту
    clearRoute() {
        this.currentRoute = null;
        this.clearRouteDisplay();

        // Очищаємо вибір у селектах
        document.getElementById('from-select').value = '';
        document.getElementById('to-select').value = '';

        this.mapCore.announceToScreenReader('Маршрут очищено');
    }

    // Поміняти місцями початок і кінець
    swapRoute() {
        const fromSelect = document.getElementById('from-select');
        const toSelect = document.getElementById('to-select');

        const tempValue = fromSelect.value;
        fromSelect.value = toSelect.value;
        toSelect.value = tempValue;

        this.mapCore.announceToScreenReader('Початкову та кінцеву точки помінено місцями');
    }

    // Встановлення кінцевої точки маршруту
    setRouteDestination(room) {
        const toSelect = document.getElementById('to-select');
        toSelect.value = room.id;

        // Якщо початкова точка вже вибрана, будуємо маршрут
        const fromSelect = document.getElementById('from-select');
        if (fromSelect.value) {
            this.buildRoute();
        }
    }

    // Встановлення початкової точки маршруту
    setRouteOrigin(room) {
        const fromSelect = document.getElementById('from-select');
        fromSelect.value = room.id;

        // Якщо кінцева точка вже вибрана, будуємо маршрут
        const toSelect = document.getElementById('to-select');
        if (toSelect.value) {
            this.buildRoute();
        }
    }

    // Пошук найближчої кімнати певної категорії
    findNearest(category) {
        const currentRoom = this.mapCore.selectedRoom;
        if (!currentRoom) {
            this.mapCore.showError('Спочатку виберіть кімнату');
            return;
        }

        // Шукаємо найближчу кімнату заданої категорії
        const nearestRoom = this.findNearestRoomByCategory(currentRoom, category);

        if (nearestRoom) {
            // Встановлюємо маршрут
            const fromSelect = document.getElementById('from-select');
            const toSelect = document.getElementById('to-select');

            fromSelect.value = currentRoom.id;
            toSelect.value = nearestRoom.id;

            this.buildRoute();
        } else {
            const categoryName = this.mapCore.getCategoryName(category);
            this.mapCore.showError(`Не знайдено ${categoryName} на цьому поверсі`);
        }
    }

    // Пошук найближчої кімнати за категорією
    findNearestRoomByCategory(fromRoom, category) {
        const mapData = this.mapCore.allMapsData.get(fromRoom.floor);
        if (!mapData) return null;

        const candidateRooms = mapData.rooms.filter(room =>
            room.category === category &&
            room.id !== fromRoom.id &&
            room.access
        );

        if (candidateRooms.length === 0) return null;

        // Знаходимо найближчу кімнату
        let nearestRoom = null;
        let shortestDistance = Infinity;

        candidateRooms.forEach(room => {
            const distance = this.calculateApproximateDistance(fromRoom, room);
            if (distance < shortestDistance) {
                shortestDistance = distance;
                nearestRoom = room;
            }
        });

        return nearestRoom;
    }

    // Приблизний розрахунок відстані між кімнатами
    calculateApproximateDistance(room1, room2) {
        const center1 = this.calculateRoomCenter(room1.geometry);
        const center2 = this.calculateRoomCenter(room2.geometry);

        return Math.sqrt(
            Math.pow(center2.x - center1.x, 2) +
            Math.pow(center2.y - center1.y, 2)
        );
    }

    // Пошук виходу
    findExit() {
        // Шукаємо кімнату з ключовими словами "exit", "вихід"
        const allRooms = this.mapCore.getAllRooms();
        const exitRoom = allRooms.find(room =>
            room.keywords.some(keyword =>
                keyword.toLowerCase().includes('exit') ||
                keyword.toLowerCase().includes('вихід')
            )
        );

        if (exitRoom) {
            this.mapCore.selectRoom(exitRoom);
            this.routeToSelectedRoom();
        } else {
            // Якщо вихід не знайдено, шукаємо сходи
            this.findNearest('utility');
        }
    }

    // Маршрут до вибраної кімнати
    routeToSelectedRoom() {
        const selectedRoom = this.mapCore.selectedRoom;
        if (!selectedRoom) {
            this.mapCore.showError('Кімната не вибрана');
            return;
        }

        const toSelect = document.getElementById('to-select');
        toSelect.value = selectedRoom.id;

        // Якщо початкова точка вже вибрана, будуємо маршрут
        const fromSelect = document.getElementById('from-select');
        if (fromSelect.value) {
            this.buildRoute();
        } else {
            this.mapCore.showError('Виберіть початкову точку маршруту');
        }
    }

    // Маршрут від вибраної кімнати
    routeFromSelectedRoom() {
        const selectedRoom = this.mapCore.selectedRoom;
        if (!selectedRoom) {
            this.mapCore.showError('Кімната не вибрана');
            return;
        }

        const fromSelect = document.getElementById('from-select');
        fromSelect.value = selectedRoom.id;

        // Якщо кінцева точка вже вибрана, будуємо маршрут
        const toSelect = document.getElementById('to-select');
        if (toSelect.value) {
            this.buildRoute();
        } else {
            this.mapCore.showError('Виберіть кінцеву точку маршруту');
        }
    }

    // Підсвічування вибраної кімнати
    highlightSelectedRoom() {
        const selectedRoom = this.mapCore.selectedRoom;
        if (!selectedRoom) {
            this.mapCore.showError('Кімната не вибрана');
            return;
        }

        if (window.mapUI) {
            window.mapUI.highlightRoom(selectedRoom.id, 3000);
            window.mapUI.panToRoom(selectedRoom.id);
        }
    }

    // Показати індикатор побудови маршруту
    showRouteBuilding() {
        const buildButton = document.getElementById('build-route');
        buildButton.disabled = true;
        buildButton.textContent = 'Побудова...';
        this.mapCore.announceToScreenReader('Побудова маршруту');
    }

    // Приховати індикатор побудови маршруту
    hideRouteBuilding() {
        const buildButton = document.getElementById('build-route');
        buildButton.disabled = false;
        buildButton.textContent = 'Побудувати маршрут';
    }
}

// Ініціалізуємо навігацію після завантаження DOM
document.addEventListener('DOMContentLoaded', () => {
    // Чекаємо ініціалізації MapCore
    const initNavigation = () => {
        if (window.mapCore && window.mapCore.allMapsData.size > 0) {
            window.mapNavigation = new MapNavigation(window.mapCore);
        } else {
            setTimeout(initNavigation, 200);
        }
    };

    initNavigation();
});