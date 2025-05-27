// Клас для роботи з навігацією та побудовою маршрутів між поверхами
class MapNavigation {
    constructor(mapCore) {
        this.mapCore = mapCore;
        this.currentRoute = null;
        this.buildingGraph = null; // Єдиний граф для всієї будівлі
        this.init();
    }

    init() {
        this.setupEventListeners();

        // Чекаємо завантаження всіх поверхів
        const waitForMapsLoad = setInterval(() => {
            if (this.mapCore.allMapsData.size > 0) {
                clearInterval(waitForMapsLoad);
                this.buildBuildingGraph();
                this.populateRoomSelects();
            }
        }, 100);
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

    // Побудова єдиного графа для всієї будівлі
    buildBuildingGraph() {
        this.buildingGraph = {
            nodes: new Map(),
            edges: new Map(),
            rooms: new Map(),
            stairs: new Map()
        };

        console.log('=== Building Graph Debug ===');
        console.log('Total floors:', this.mapCore.allMapsData.size);

        // Спочатку додаємо всі вузли, включаючи міжповерхові
        for (const [floor, mapData] of this.mapCore.allMapsData) {
            console.log(`Processing floor ${floor}:`, {
                nodes: mapData.nodes?.length || 0,
                edges: mapData.edges?.length || 0,
                rooms: mapData.rooms?.length || 0,
                interFloorNodes: mapData.interFloorNodes || []
            });

            // Додаємо звичайні вузли
            if (mapData.nodes) {
                mapData.nodes.forEach(node => {
                    const globalNodeId = `${floor}-${node.id}`;
                    this.buildingGraph.nodes.set(globalNodeId, {
                        ...node,
                        floor: floor,
                        globalId: globalNodeId,
                        originalId: node.id
                    });
                });
            }

            // ВАЖЛИВО: Додаємо міжповерхові вузли окремо
            if (mapData.interFloorNodes) {
                mapData.interFloorNodes.forEach(nodeId => {
                    const globalNodeId = `${floor}-${nodeId}`;
                    // Створюємо віртуальний вузол для сходів
                    this.buildingGraph.nodes.set(globalNodeId, {
                        id: nodeId,
                        type: 'stairs',
                        floor: floor,
                        globalId: globalNodeId,
                        originalId: nodeId,
                        position: { x: 297.5, y: 430 } // Приблизна позиція
                    });

                    // Додаємо до списку сходів
                    if (!this.buildingGraph.stairs.has(nodeId)) {
                        this.buildingGraph.stairs.set(nodeId, []);
                    }
                    if (!this.buildingGraph.stairs.get(nodeId).includes(floor)) {
                        this.buildingGraph.stairs.get(nodeId).push(floor);
                    }
                });
            }

            // Додаємо кімнати
            if (mapData.rooms) {
                mapData.rooms.forEach(room => {
                    const globalRoomId = `${floor}-${room.id}`;
                    this.buildingGraph.rooms.set(globalRoomId, {
                        ...room,
                        floor: floor,
                        globalId: globalRoomId,
                        originalId: room.id,
                        globalNodeId: room.nodeId ? `${floor}-${room.nodeId}` : null
                    });
                });
            }

            // Додаємо ребра в межах поверху
            if (mapData.edges) {
                mapData.edges.forEach(edge => {
                    const globalFromId = `${floor}-${edge.fromNodeId}`;
                    const globalToId = `${floor}-${edge.toNodeId}`;
                    const globalEdgeId = `${floor}-${edge.id}`;

                    // Перевіряємо чи обидва вузли існують в графі
                    if (this.buildingGraph.nodes.has(globalFromId) ||
                        this.buildingGraph.nodes.has(globalToId) ||
                        edge.fromNodeId?.match(/^31-01-00-\d+$/) ||
                        edge.toNodeId?.match(/^31-01-00-\d+$/)) {

                        this.buildingGraph.edges.set(globalEdgeId, {
                            ...edge,
                            floor: floor,
                            globalId: globalEdgeId,
                            originalId: edge.id,
                            globalFromId: globalFromId,
                            globalToId: globalToId
                        });

                        // Оновлюємо список сходів якщо це ребро до сходів
                        if (edge.fromNodeId?.match(/^31-01-00-\d+$/)) {
                            const stairNodeId = edge.fromNodeId;
                            if (!this.buildingGraph.stairs.has(stairNodeId)) {
                                this.buildingGraph.stairs.set(stairNodeId, []);
                            }
                            if (!this.buildingGraph.stairs.get(stairNodeId).includes(floor)) {
                                this.buildingGraph.stairs.get(stairNodeId).push(floor);
                            }
                        }

                        if (edge.toNodeId?.match(/^31-01-00-\d+$/)) {
                            const stairNodeId = edge.toNodeId;
                            if (!this.buildingGraph.stairs.has(stairNodeId)) {
                                this.buildingGraph.stairs.set(stairNodeId, []);
                            }
                            if (!this.buildingGraph.stairs.get(stairNodeId).includes(floor)) {
                                this.buildingGraph.stairs.get(stairNodeId).push(floor);
                            }
                        }
                    }
                });
            }
        }

        console.log('Total nodes in building:', this.buildingGraph.nodes.size);
        console.log('Total edges in building:', this.buildingGraph.edges.size);
        console.log('Total rooms in building:', this.buildingGraph.rooms.size);
        console.log('Stairs found:', Array.from(this.buildingGraph.stairs.entries()));

        // Додаємо міжповерхові з'єднання для сходів
        this.connectFloorsThroughStairs();
    }

    // З'єднуємо поверхи через сходи
    connectFloorsThroughStairs() {
        console.log('=== Connecting Floors ===');
        console.log('Stair connections to create:', this.buildingGraph.stairs);

        let stairConnectionsCreated = 0;

        for (const [stairNodeId, floors] of this.buildingGraph.stairs) {
            console.log(`Processing stair ${stairNodeId} on floors:`, floors);

            // Створюємо віртуальні з'єднання між сходами різних поверхів
            for (let i = 0; i < floors.length - 1; i++) {
                for (let j = i + 1; j < floors.length; j++) {
                    const floor1 = floors[i];
                    const floor2 = floors[j];

                    const globalNodeId1 = `${floor1}-${stairNodeId}`;
                    const globalNodeId2 = `${floor2}-${stairNodeId}`;

                    // Перевіряємо чи обидва вузли існують
                    if (!this.buildingGraph.nodes.has(globalNodeId1)) {
                        console.warn(`Stair node ${globalNodeId1} not found in graph`);
                        continue;
                    }
                    if (!this.buildingGraph.nodes.has(globalNodeId2)) {
                        console.warn(`Stair node ${globalNodeId2} not found in graph`);
                        continue;
                    }

                    const virtualEdgeId = `stairs-${floor1}-${floor2}-${stairNodeId}`;
                    const weight = Math.abs(parseInt(floor2) - parseInt(floor1)) * 20; // Вага залежить від різниці поверхів

                    // Додаємо віртуальне ребро між поверхами
                    this.buildingGraph.edges.set(virtualEdgeId, {
                        id: virtualEdgeId,
                        globalId: virtualEdgeId,
                        globalFromId: globalNodeId1,
                        globalToId: globalNodeId2,
                        fromNodeId: stairNodeId,
                        toNodeId: stairNodeId,
                        weight: weight,
                        isStairs: true,
                        fromFloor: floor1,
                        toFloor: floor2,
                        stairNodeId: stairNodeId
                    });

                    console.log(`Created stair connection: ${virtualEdgeId} (weight: ${weight})`);
                    stairConnectionsCreated++;
                }
            }
        }

        console.log(`Total stair connections created: ${stairConnectionsCreated}`);
    }

    // Заповнення випадаючих списків кімнат зі всіх поверхів
    populateRoomSelects() {
        const fromSelect = document.getElementById('from-select');
        const toSelect = document.getElementById('to-select');

        fromSelect.innerHTML = '<option value="">Виберіть початкову кімнату</option>';
        toSelect.innerHTML = '<option value="">Виберіть кінцеву кімнату</option>';

        // Групуємо кімнати за поверхами
        const roomsByFloor = new Map();

        for (const [globalRoomId, room] of this.buildingGraph.rooms) {
            if (room.access) {
                const floor = room.floor;
                if (!roomsByFloor.has(floor)) {
                    roomsByFloor.set(floor, []);
                }
                roomsByFloor.get(floor).push(room);
            }
        }

        // Сортуємо поверхи та додаємо кімнати до селектів
        const sortedFloors = Array.from(roomsByFloor.keys()).sort((a, b) => parseInt(a) - parseInt(b));

        sortedFloors.forEach(floor => {
            // Створюємо групу для поверху
            const fromOptgroup = document.createElement('optgroup');
            fromOptgroup.label = `Поверх ${floor}`;

            const toOptgroup = document.createElement('optgroup');
            toOptgroup.label = `Поверх ${floor}`;

            // Сортуємо кімнати за назвою
            const rooms = roomsByFloor.get(floor).sort((a, b) =>
                (a.label || a.originalId).localeCompare(b.label || b.originalId, 'uk')
            );

            rooms.forEach(room => {
                const displayName = room.label || room.originalId;

                const option1 = document.createElement('option');
                option1.value = room.globalId;
                option1.textContent = displayName;
                option1.dataset.floor = room.floor;
                fromOptgroup.appendChild(option1);

                const option2 = document.createElement('option');
                option2.value = room.globalId;
                option2.textContent = displayName;
                option2.dataset.floor = room.floor;
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
            // Знаходимо кімнати в графі будівлі
            const fromRoom = this.buildingGraph.rooms.get(fromRoomId);
            const toRoom = this.buildingGraph.rooms.get(toRoomId);

            if (!fromRoom || !toRoom) {
                throw new Error('Не вдалося знайти одну з кімнат');
            }

            // Будуємо маршрут через загальний граф будівлі
            const route = await this.buildGlobalRoute(fromRoom, toRoom);

            if (!route) {
                throw new Error('Маршрут не знайдено');
            }

            this.displayRoute(route);
            this.mapCore.announceToScreenReader('Маршрут успішно побудовано');

            // Переходимо на поверх початку маршруту
            if (fromRoom.floor !== this.mapCore.currentFloor) {
                await this.mapCore.selectFloor(fromRoom.floor);
            }

        } catch (error) {
            console.error('Error building route:', error);
            this.mapCore.showError('Помилка побудови маршруту: ' + error.message);
        } finally {
            this.hideRouteBuilding();
        }
    }

    // Побудова маршруту через глобальний граф будівлі
    async buildGlobalRoute(fromRoom, toRoom) {
        // Знаходимо найближчі вузли до кімнат
        let fromNodeId = fromRoom.globalNodeId;
        let toNodeId = toRoom.globalNodeId;

        if (!fromNodeId || !this.buildingGraph.nodes.has(fromNodeId)) {
            fromNodeId = this.findNearestGlobalNode(fromRoom);
        }

        if (!toNodeId || !this.buildingGraph.nodes.has(toNodeId)) {
            toNodeId = this.findNearestGlobalNode(toRoom);
        }

        if (!fromNodeId || !toNodeId) {
            console.error('Cannot find navigation nodes for rooms');
            return null;
        }

        // Використовуємо алгоритм Дейкстри на глобальному графі
        const path = this.dijkstraGlobal(fromNodeId, toNodeId);

        if (!path || path.length === 0) {
            return null;
        }

        // Формуємо детальний маршрут
        const route = this.buildDetailedRoute(path, fromRoom, toRoom);
        return route;
    }

    // Алгоритм Дейкстри для глобального графа
    dijkstraGlobal(fromNodeId, toNodeId) {
        const distances = new Map();
        const previous = new Map();
        const unvisited = new Set();

        // Ініціалізація
        for (const [nodeId, node] of this.buildingGraph.nodes) {
            distances.set(nodeId, Infinity);
            previous.set(nodeId, null);
            unvisited.add(nodeId);
        }

        distances.set(fromNodeId, 0);

        while (unvisited.size > 0) {
            // Знаходимо вузол з найменшою відстанню
            let currentNode = null;
            let minDistance = Infinity;

            for (const nodeId of unvisited) {
                if (distances.get(nodeId) < minDistance) {
                    minDistance = distances.get(nodeId);
                    currentNode = nodeId;
                }
            }

            if (currentNode === null || distances.get(currentNode) === Infinity) {
                break;
            }

            unvisited.delete(currentNode);

            // Якщо досягли цілі
            if (currentNode === toNodeId) {
                break;
            }

            // Знаходимо всі ребра з поточного вузла
            const neighbors = this.getNeighbors(currentNode);

            for (const neighbor of neighbors) {
                if (unvisited.has(neighbor.nodeId)) {
                    const newDistance = distances.get(currentNode) + neighbor.weight;
                    if (newDistance < distances.get(neighbor.nodeId)) {
                        distances.set(neighbor.nodeId, newDistance);
                        previous.set(neighbor.nodeId, currentNode);
                    }
                }
            }
        }

        // Відновлюємо шлях
        const path = [];
        let currentNode = toNodeId;

        while (currentNode !== null) {
            path.unshift(currentNode);
            currentNode = previous.get(currentNode);
        }

        if (path[0] !== fromNodeId) {
            return null; // Шлях не знайдено
        }

        return path;
    }

    // Отримання сусідів вузла
    getNeighbors(nodeId) {
        const neighbors = [];

        for (const [edgeId, edge] of this.buildingGraph.edges) {
            if (edge.globalFromId === nodeId) {
                neighbors.push({
                    nodeId: edge.globalToId,
                    weight: edge.weight,
                    edge: edge
                });
            } else if (edge.globalToId === nodeId) {
                neighbors.push({
                    nodeId: edge.globalFromId,
                    weight: edge.weight,
                    edge: edge
                });
            }
        }

        return neighbors;
    }

    // Пошук найближчого глобального вузла
    findNearestGlobalNode(room) {
        const roomCenter = this.calculateRoomCenter(room);
        let nearestNodeId = null;
        let minDistance = Infinity;

        // Шукаємо тільки серед вузлів на тому ж поверсі
        for (const [nodeId, node] of this.buildingGraph.nodes) {
            if (node.floor === room.floor && (node.type === 'nav' || node.type === 'sup')) {
                const nodePos = node.position || { x: 0, y: 0 };
                const distance = Math.sqrt(
                    Math.pow(nodePos.x - roomCenter.x, 2) +
                    Math.pow(nodePos.y - roomCenter.y, 2)
                );

                if (distance < minDistance) {
                    minDistance = distance;
                    nearestNodeId = nodeId;
                }
            }
        }

        return nearestNodeId;
    }

    // Побудова детального маршруту
    buildDetailedRoute(path, fromRoom, toRoom) {
        const route = {
            path: path,
            nodes: [],
            edges: [],
            segments: [], // Сегменти маршруту по поверхах
            totalDistance: 0,
            isMultiFloor: false
        };

        // Визначаємо чи маршрут міжповерховий
        const floors = new Set();
        path.forEach(nodeId => {
            const node = this.buildingGraph.nodes.get(nodeId);
            if (node) {
                floors.add(node.floor);
            }
        });
        route.isMultiFloor = floors.size > 1;

        // Збираємо інформацію про вузли та ребра
        for (let i = 0; i < path.length; i++) {
            const nodeId = path[i];
            const node = this.buildingGraph.nodes.get(nodeId);

            if (node) {
                // Знаходимо кімнату для вузла
                let room = null;
                for (const [roomId, r] of this.buildingGraph.rooms) {
                    if (r.globalNodeId === nodeId) {
                        room = r;
                        break;
                    }
                }

                route.nodes.push({
                    nodeId: nodeId,
                    node: node,
                    room: room,
                    floor: node.floor
                });
            }

            // Знаходимо ребро до наступного вузла
            if (i < path.length - 1) {
                const nextNodeId = path[i + 1];
                const edge = this.findEdgeBetweenNodes(nodeId, nextNodeId);

                if (edge) {
                    route.edges.push(edge);
                    route.totalDistance += edge.weight;
                }
            }
        }

        // Розбиваємо маршрут на сегменти по поверхах
        if (route.isMultiFloor) {
            route.segments = this.segmentRouteByFloor(route);
        }

        return route;
    }

    // Пошук ребра між двома вузлами
    findEdgeBetweenNodes(nodeId1, nodeId2) {
        for (const [edgeId, edge] of this.buildingGraph.edges) {
            if ((edge.globalFromId === nodeId1 && edge.globalToId === nodeId2) ||
                (edge.globalFromId === nodeId2 && edge.globalToId === nodeId1)) {
                return edge;
            }
        }
        return null;
    }

    // Розбиття маршруту на сегменти по поверхах
    segmentRouteByFloor(route) {
        const segments = [];
        let currentSegment = null;
        let currentFloor = null;

        route.nodes.forEach((nodeInfo, index) => {
            const floor = nodeInfo.floor;

            if (floor !== currentFloor) {
                // Починаємо новий сегмент
                if (currentSegment) {
                    segments.push(currentSegment);
                }

                currentSegment = {
                    floor: floor,
                    nodes: [],
                    edges: [],
                    startNode: nodeInfo,
                    endNode: null
                };
                currentFloor = floor;
            }

            currentSegment.nodes.push(nodeInfo);
            currentSegment.endNode = nodeInfo;

            // Додаємо ребро якщо воно на тому ж поверсі
            if (index < route.edges.length) {
                const edge = route.edges[index];
                if (!edge.isStairs) {
                    currentSegment.edges.push(edge);
                }
            }
        });

        if (currentSegment) {
            segments.push(currentSegment);
        }

        return segments;
    }

    // Відображення маршруту
    displayRoute(route) {
        if (!route) {
            console.error('No route to display');
            return;
        }

        this.currentRoute = route;
        this.clearRouteDisplay();

        // Відображаємо маршрут залежно від типу
        if (route.isMultiFloor) {
            this.displayMultiFloorRoute(route);
        } else {
            this.displaySingleFloorRoute(route);
        }

        // Показуємо інформацію про маршрут
        document.getElementById('route-info').style.display = 'block';
        document.getElementById('route-distance').querySelector('span').textContent =
            Math.round(route.totalDistance);

        // Додаємо кроки маршруту
        this.displayRouteSteps(route);

        // Анімація маршруту на поточному поверсі
        this.animateRouteOnCurrentFloor(route);
    }

    // Відображення маршруту на одному поверсі
    displaySingleFloorRoute(route) {
        // Активуємо елементи маршруту на поточному поверсі
        this.activateRouteElementsOnFloor(route, this.mapCore.currentFloor);

        // Підсвічуємо кімнати початку та кінця якщо вони на поточному поверсі
        if (route.nodes.length > 0) {
            const startRoom = route.nodes[0].room;
            const endRoom = route.nodes[route.nodes.length - 1].room;

            if (startRoom && startRoom.floor === this.mapCore.currentFloor) {
                this.highlightRouteRoom(startRoom.originalId, 'start');
            }
            if (endRoom && endRoom.floor === this.mapCore.currentFloor) {
                this.highlightRouteRoom(endRoom.originalId, 'end');
            }
        }
    }

    // Відображення маршруту між поверхами
    displayMultiFloorRoute(route) {
        // Відображаємо сегмент маршруту для поточного поверху
        const currentFloorSegment = route.segments.find(seg => seg.floor === this.mapCore.currentFloor);

        if (currentFloorSegment) {
            this.displayRouteSegment(currentFloorSegment);
        }

        // Додаємо індикатори переходу між поверхами
        this.addFloorTransitionIndicators(route);
    }

    // Відображення сегменту маршруту
    displayRouteSegment(segment) {
        // Активуємо елементи сегменту
        segment.edges.forEach(edge => {
            const edgeElement = document.getElementById(edge.originalId);
            if (edgeElement) {
                edgeElement.classList.add('route-active');
                edgeElement.style.display = 'block';
            }
        });

        segment.nodes.forEach(nodeInfo => {
            if (nodeInfo.node && nodeInfo.node.originalId) {
                const nodeElement = document.getElementById(nodeInfo.node.originalId);
                if (nodeElement) {
                    nodeElement.classList.add('route-active');
                    nodeElement.style.display = 'block';
                }
            }
        });

        // Підсвічуємо кімнати в сегменті
        if (segment.startNode.room) {
            this.highlightRouteRoom(segment.startNode.room.originalId, 'segment-start');
        }
        if (segment.endNode.room) {
            this.highlightRouteRoom(segment.endNode.room.originalId, 'segment-end');
        }
    }

    // Активація елементів маршруту на конкретному поверсі
    activateRouteElementsOnFloor(route, floor) {
        const svgElement = document.getElementById('main-svg');
        if (!svgElement) return;

        // Активуємо ребра на поточному поверсі
        route.edges.forEach(edge => {
            if (edge.floor === floor || (!edge.isStairs &&
                (edge.fromFloor === floor || edge.toFloor === floor))) {
                const edgeElement = svgElement.getElementById(edge.originalId);
                if (edgeElement) {
                    edgeElement.classList.add('route-active');
                    edgeElement.style.display = 'block';
                }
            }
        });

        // Активуємо вузли на поточному поверсі
        route.nodes.forEach(nodeInfo => {
            if (nodeInfo.floor === floor && nodeInfo.node && nodeInfo.node.originalId) {
                const nodeElement = svgElement.getElementById(nodeInfo.node.originalId);
                if (nodeElement) {
                    nodeElement.classList.add('route-active');
                    nodeElement.style.display = 'block';
                }
            }
        });
    }

    // Додавання індикаторів переходу між поверхами
    addFloorTransitionIndicators(route) {
        // Знаходимо переходи між поверхами
        for (let i = 0; i < route.edges.length; i++) {
            const edge = route.edges[i];
            if (edge.isStairs) {
                // Додаємо візуальний індикатор на карті
                const fromNode = this.buildingGraph.nodes.get(edge.globalFromId);
                const toNode = this.buildingGraph.nodes.get(edge.globalToId);

                if (fromNode && fromNode.floor === this.mapCore.currentFloor) {
                    this.addStairIndicator(fromNode, toNode, 'up');
                } else if (toNode && toNode.floor === this.mapCore.currentFloor) {
                    this.addStairIndicator(toNode, fromNode, 'down');
                }
            }
        }
    }

    // Додавання індикатора сходів
    addStairIndicator(stairNode, targetNode, direction) {
        const svgElement = document.getElementById('main-svg');
        if (!svgElement) return;

        // Створюємо SVG елемент для індикатора
        const indicator = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        indicator.setAttribute('class', 'stair-indicator');
        indicator.setAttribute('data-direction', direction);

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', stairNode.position.x);
        circle.setAttribute('cy', stairNode.position.y);
        circle.setAttribute('r', '15');
        circle.setAttribute('fill', '#ff6f00');
        circle.setAttribute('opacity', '0.8');

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', stairNode.position.x);
        text.setAttribute('y', stairNode.position.y + 5);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('fill', 'white');
        text.setAttribute('font-weight', 'bold');
        text.textContent = direction === 'up' ? '↑' : '↓';

        indicator.appendChild(circle);
        indicator.appendChild(text);

        // Додаємо tooltip
        const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        title.textContent = `Перейти на поверх ${targetNode.floor}`;
        indicator.appendChild(title);

        svgElement.appendChild(indicator);
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

        // Видаляємо індикатори сходів
        document.querySelectorAll('.stair-indicator').forEach(indicator => {
            indicator.remove();
        });

        // Приховуємо інформацію про маршрут
        document.getElementById('route-info').style.display = 'none';
        document.getElementById('route-steps').innerHTML = '';
    }

    // Відображення кроків маршруту
    displayRouteSteps(route) {
        const stepsContainer = document.getElementById('route-steps');
        stepsContainer.innerHTML = '';

        // Генеруємо кроки на основі сегментів маршруту
        const steps = this.generateDetailedRouteSteps(route);

        steps.forEach((step, index) => {
            const stepElement = document.createElement('div');
            stepElement.className = 'route-step';
            if (step.type === 'stairs') {
                stepElement.className += ' route-step-stairs';
            }
            stepElement.setAttribute('role', 'listitem');
            stepElement.innerHTML = `<strong>${index + 1}.</strong> ${step.text}`;

            // Додаємо обробник для переходу на відповідний поверх
            if (step.floor) {
                stepElement.style.cursor = 'pointer';
                stepElement.addEventListener('click', () => {
                    this.mapCore.selectFloor(step.floor);
                });
            }

            stepsContainer.appendChild(stepElement);
        });
    }

    // Генерація детальних кроків маршруту
    generateDetailedRouteSteps(route) {
        const steps = [];

        if (route.isMultiFloor) {
            // Для міжповерхового маршруту
            route.segments.forEach((segment, index) => {
                // Початок сегменту
                if (index === 0 && segment.startNode.room) {
                    steps.push({
                        text: `Початок маршруту: ${segment.startNode.room.label || segment.startNode.room.originalId} (Поверх ${segment.floor})`,
                        type: 'start',
                        floor: segment.floor
                    });
                }

                // Проміжні кроки сегменту
                if (segment.nodes.length > 2) {
                    steps.push({
                        text: `Пройдіть через поверх ${segment.floor}`,
                        type: 'path',
                        floor: segment.floor
                    });
                }

                // Перехід між поверхами
                if (index < route.segments.length - 1) {
                    const nextSegment = route.segments[index + 1];
                    const direction = parseInt(nextSegment.floor) > parseInt(segment.floor) ? 'вгору' : 'вниз';
                    steps.push({
                        text: `⬆️ Перейдіть ${direction} на поверх ${nextSegment.floor} по сходах`,
                        type: 'stairs',
                        floor: nextSegment.floor
                    });
                }

                // Кінець маршруту
                if (index === route.segments.length - 1 && segment.endNode.room) {
                    steps.push({
                        text: `Кінець маршруту: ${segment.endNode.room.label || segment.endNode.room.originalId} (Поверх ${segment.floor})`,
                        type: 'end',
                        floor: segment.floor
                    });
                }
            });
        } else {
            // Для одноповерхового маршруту
            if (route.nodes.length > 0) {
                const startRoom = route.nodes[0].room;
                const endRoom = route.nodes[route.nodes.length - 1].room;

                if (startRoom) {
                    steps.push({
                        text: `Початок маршруту: ${startRoom.label || startRoom.originalId}`,
                        type: 'start'
                    });
                }

                if (route.nodes.length > 2) {
                    steps.push({
                        text: `Пройдіть через коридор`,
                        type: 'path'
                    });
                }

                if (endRoom) {
                    steps.push({
                        text: `Кінець маршруту: ${endRoom.label || endRoom.originalId}`,
                        type: 'end'
                    });
                }
            }
        }

        // Додаємо загальну відстань
        steps.push({
            text: `Загальна відстань: ${Math.round(route.totalDistance)} м`,
            type: 'distance'
        });

        return steps;
    }

    // Анімація маршруту на поточному поверсі
    animateRouteOnCurrentFloor(route) {
        const currentFloorEdges = route.edges.filter(edge =>
            edge.floor === this.mapCore.currentFloor && !edge.isStairs
        );

        if (currentFloorEdges.length === 0) return;

        let currentIndex = 0;

        const animateNext = () => {
            if (currentIndex >= currentFloorEdges.length) {
                return;
            }

            const edge = currentFloorEdges[currentIndex];
            const edgeElement = document.getElementById(edge.originalId);

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

    // Підсвічування кімнати маршруту
    highlightRouteRoom(roomId, type = 'default') {
        const roomElement = document.getElementById(roomId);
        if (roomElement) {
            roomElement.classList.add('route-highlight');
            roomElement.setAttribute('data-route-type', type);
        }
    }

    // Обчислення центру кімнати
    calculateRoomCenter(room) {
        if (!room.geometry || !room.geometry.children || room.geometry.children.length === 0) {
            return { x: 0, y: 0 };
        }

        const shape = room.geometry.children[0];

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
        const globalRoomId = room.floor ? `${room.floor}-${room.id}` : room.id;

        // Перевіряємо чи є така опція в селекті
        const option = toSelect.querySelector(`option[value="${globalRoomId}"]`);
        if (option) {
            toSelect.value = globalRoomId;

            // Якщо початкова точка вже вибрана, будуємо маршрут
            const fromSelect = document.getElementById('from-select');
            if (fromSelect.value) {
                this.buildRoute();
            }
        }
    }

    // Встановлення початкової точки маршруту
    setRouteOrigin(room) {
        const fromSelect = document.getElementById('from-select');
        const globalRoomId = room.floor ? `${room.floor}-${room.id}` : room.id;

        // Перевіряємо чи є така опція в селекті
        const option = fromSelect.querySelector(`option[value="${globalRoomId}"]`);
        if (option) {
            fromSelect.value = globalRoomId;

            // Якщо кінцева точка вже вибрана, будуємо маршрут
            const toSelect = document.getElementById('to-select');
            if (toSelect.value) {
                this.buildRoute();
            }
        }
    }

    // Пошук найближчої кімнати певної категорії
    findNearest(category) {
        const currentRoom = this.mapCore.selectedRoom;
        if (!currentRoom) {
            this.mapCore.showError('Спочатку виберіть кімнату');
            return;
        }

        // Шукаємо найближчу кімнату заданої категорії на всіх поверхах
        const nearestRoom = this.findNearestRoomByCategoryGlobal(currentRoom, category);

        if (nearestRoom) {
            // Встановлюємо маршрут
            const fromSelect = document.getElementById('from-select');
            const toSelect = document.getElementById('to-select');

            const fromGlobalId = currentRoom.floor ? `${currentRoom.floor}-${currentRoom.id}` : currentRoom.id;
            const toGlobalId = nearestRoom.globalId;

            fromSelect.value = fromGlobalId;
            toSelect.value = toGlobalId;

            this.buildRoute();
        } else {
            const categoryName = this.mapCore.getCategoryName(category);
            this.mapCore.showError(`Не знайдено ${categoryName} в будівлі`);
        }
    }

    // Пошук найближчої кімнати за категорією в усій будівлі
    findNearestRoomByCategoryGlobal(fromRoom, category) {
        const candidateRooms = [];

        // Збираємо всі кімнати заданої категорії
        for (const [globalRoomId, room] of this.buildingGraph.rooms) {
            if (room.category === category && room.access &&
                room.globalId !== `${fromRoom.floor}-${fromRoom.id}`) {
                candidateRooms.push(room);
            }
        }

        if (candidateRooms.length === 0) return null;

        // Спочатку шукаємо на тому ж поверсі
        const sameFloorRooms = candidateRooms.filter(room => room.floor === fromRoom.floor);
        if (sameFloorRooms.length > 0) {
            return this.findClosestRoom(fromRoom, sameFloorRooms);
        }

        // Якщо на поверсі немає, шукаємо на найближчих поверхах
        const floorDifferences = new Map();
        candidateRooms.forEach(room => {
            const diff = Math.abs(parseInt(room.floor) - parseInt(fromRoom.floor));
            if (!floorDifferences.has(diff)) {
                floorDifferences.set(diff, []);
            }
            floorDifferences.get(diff).push(room);
        });

        // Сортуємо за різницею поверхів
        const sortedDiffs = Array.from(floorDifferences.keys()).sort((a, b) => a - b);

        for (const diff of sortedDiffs) {
            const rooms = floorDifferences.get(diff);
            if (rooms.length > 0) {
                return rooms[0]; // Повертаємо першу знайдену кімнату
            }
        }

        return null;
    }

    // Знаходження найближчої кімнати зі списку
    findClosestRoom(fromRoom, candidateRooms) {
        const fromCenter = this.calculateRoomCenter(fromRoom);
        let closestRoom = null;
        let minDistance = Infinity;

        candidateRooms.forEach(room => {
            const roomCenter = this.calculateRoomCenter(room);
            const distance = Math.sqrt(
                Math.pow(roomCenter.x - fromCenter.x, 2) +
                Math.pow(roomCenter.y - fromCenter.y, 2)
            );

            if (distance < minDistance) {
                minDistance = distance;
                closestRoom = room;
            }
        });

        return closestRoom;
    }

    // Пошук виходу
    findExit() {
        // Шукаємо кімнату з ключовими словами "exit", "вихід"
        let exitRoom = null;

        for (const [globalRoomId, room] of this.buildingGraph.rooms) {
            if (room.keywords.some(keyword =>
                keyword.toLowerCase().includes('exit') ||
                keyword.toLowerCase().includes('вихід')
            )) {
                exitRoom = room;
                break;
            }
        }

        if (exitRoom) {
            // Переходимо на поверх з виходом
            if (exitRoom.floor !== this.mapCore.currentFloor) {
                this.mapCore.selectFloor(exitRoom.floor).then(() => {
                    this.mapCore.selectRoom({
                        ...exitRoom,
                        id: exitRoom.originalId
                    });
                    this.routeToSelectedRoom();
                });
            } else {
                this.mapCore.selectRoom({
                    ...exitRoom,
                    id: exitRoom.originalId
                });
                this.routeToSelectedRoom();
            }
        } else {
            // Якщо вихід не знайдено, шукаємо сходи на першому поверсі
            this.mapCore.selectFloor('1').then(() => {
                this.findNearest('utility');
            });
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
        const globalRoomId = selectedRoom.floor ?
            `${selectedRoom.floor}-${selectedRoom.id}` : selectedRoom.id;

        toSelect.value = globalRoomId;

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
        const globalRoomId = selectedRoom.floor ?
            `${selectedRoom.floor}-${selectedRoom.id}` : selectedRoom.id;

        fromSelect.value = globalRoomId;

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