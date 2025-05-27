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