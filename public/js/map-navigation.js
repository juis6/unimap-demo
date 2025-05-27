// Class for navigation and route building between floors
class MapNavigation {
    constructor(mapCore) {
        this.mapCore = mapCore;
        this.currentRoute = null;
        this.buildingGraph = null; // Single graph for entire building
        this.init();
    }

    init() {
        this.setupEventListeners();

        // Wait for all floors to load
        const waitForMapsLoad = setInterval(() => {
            if (this.mapCore.allMapsData.size > 0) {
                clearInterval(waitForMapsLoad);
                this.buildBuildingGraph();
                this.populateRoomSelects();
            }
        }, 100);
    }

    setupEventListeners() {
        // Build route
        document.getElementById('build-route').addEventListener('click', () => {
            this.buildRoute();
        });

        // Swap start and end
        document.getElementById('swap-route').addEventListener('click', () => {
            this.swapRoute();
        });

        // Clear route
        document.getElementById('clear-route').addEventListener('click', () => {
            this.clearRoute();
        });

        // Quick actions
        document.getElementById('find-nearest-restroom').addEventListener('click', () => {
            this.findNearest('restroom');
        });

        // Actions for selected room
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

    // Build unified graph for entire building
    buildBuildingGraph() {
        this.buildingGraph = {
            nodes: new Map(),
            edges: new Map(),
            rooms: new Map(),
            stairs: new Map()
        };

        console.log('=== Building Graph Debug ===');
        console.log('Total floors:', this.mapCore.allMapsData.size);

        // First add all nodes, including inter-floor ones
        for (const [floor, mapData] of this.mapCore.allMapsData) {
            console.log(`Processing floor ${floor}:`, {
                nodes: mapData.nodes?.length || 0,
                edges: mapData.edges?.length || 0,
                rooms: mapData.rooms?.length || 0,
                interFloorNodes: mapData.interFloorNodes || []
            });

            // Add regular nodes
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

            // IMPORTANT: Add inter-floor nodes separately
            if (mapData.interFloorNodes) {
                mapData.interFloorNodes.forEach(nodeId => {
                    const globalNodeId = `${floor}-${nodeId}`;
                    // Create virtual node for stairs
                    this.buildingGraph.nodes.set(globalNodeId, {
                        id: nodeId,
                        type: 'stairs',
                        floor: floor,
                        globalId: globalNodeId,
                        originalId: nodeId,
                        position: { x: 297.5, y: 430 } // Approximate position
                    });

                    // Add to stairs list
                    if (!this.buildingGraph.stairs.has(nodeId)) {
                        this.buildingGraph.stairs.set(nodeId, []);
                    }
                    if (!this.buildingGraph.stairs.get(nodeId).includes(floor)) {
                        this.buildingGraph.stairs.get(nodeId).push(floor);
                    }
                });
            }

            // Add rooms
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

            // Add edges within floor
            if (mapData.edges) {
                mapData.edges.forEach(edge => {
                    const globalFromId = `${floor}-${edge.fromNodeId}`;
                    const globalToId = `${floor}-${edge.toNodeId}`;
                    const globalEdgeId = `${floor}-${edge.id}`;

                    // Check if both nodes exist in graph
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

                        // Update stairs list if this edge leads to stairs
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

        // Add inter-floor connections through stairs
        this.connectFloorsThroughStairs();
    }

    // Connect floors through stairs
    connectFloorsThroughStairs() {
        console.log('=== Connecting Floors ===');
        console.log('Stair connections to create:', this.buildingGraph.stairs);

        let stairConnectionsCreated = 0;

        for (const [stairNodeId, floors] of this.buildingGraph.stairs) {
            console.log(`Processing stair ${stairNodeId} on floors:`, floors);

            // Create virtual connections between stairs on different floors
            for (let i = 0; i < floors.length - 1; i++) {
                for (let j = i + 1; j < floors.length; j++) {
                    const floor1 = floors[i];
                    const floor2 = floors[j];

                    const globalNodeId1 = `${floor1}-${stairNodeId}`;
                    const globalNodeId2 = `${floor2}-${stairNodeId}`;

                    // Check if both nodes exist
                    if (!this.buildingGraph.nodes.has(globalNodeId1)) {
                        console.warn(`Stair node ${globalNodeId1} not found in graph`);
                        continue;
                    }
                    if (!this.buildingGraph.nodes.has(globalNodeId2)) {
                        console.warn(`Stair node ${globalNodeId2} not found in graph`);
                        continue;
                    }

                    const virtualEdgeId = `stairs-${floor1}-${floor2}-${stairNodeId}`;
                    const weight = Math.abs(parseInt(floor2) - parseInt(floor1)) * 20; // Weight depends on floor difference

                    // Add virtual edge between floors
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

    // Populate room select dropdowns with all floors
    populateRoomSelects() {
        const fromSelect = document.getElementById('from-select');
        const toSelect = document.getElementById('to-select');

        fromSelect.innerHTML = '<option value="">Select starting room</option>';
        toSelect.innerHTML = '<option value="">Select destination room</option>';

        // Group rooms by floor
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

        // Sort floors and add rooms to selects
        const sortedFloors = Array.from(roomsByFloor.keys()).sort((a, b) => parseInt(a) - parseInt(b));

        sortedFloors.forEach(floor => {
            // Create group for floor
            const fromOptgroup = document.createElement('optgroup');
            fromOptgroup.label = `Floor ${floor}`;

            const toOptgroup = document.createElement('optgroup');
            toOptgroup.label = `Floor ${floor}`;

            // Sort rooms by name
            const rooms = roomsByFloor.get(floor).sort((a, b) =>
                (a.label || a.originalId).localeCompare(b.label || b.originalId, 'en')
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
            this.mapCore.showError('Please select both starting and destination rooms');
            return;
        }

        if (fromRoomId === toRoomId) {
            this.mapCore.showError('Starting and destination rooms cannot be the same');
            return;
        }

        // Show loading indicator
        this.showRouteBuilding();

        try {
            // Find rooms in building graph
            const fromRoom = this.buildingGraph.rooms.get(fromRoomId);
            const toRoom = this.buildingGraph.rooms.get(toRoomId);

            if (!fromRoom || !toRoom) {
                throw new Error('Could not find one of the rooms');
            }

            // Build route through global building graph
            const route = await this.buildGlobalRoute(fromRoom, toRoom);

            if (!route) {
                throw new Error('Route not found');
            }

            this.displayRoute(route);
            this.mapCore.announceToScreenReader('Route successfully built');

            // Navigate to floor of route start
            if (fromRoom.floor !== this.mapCore.currentFloor) {
                await this.mapCore.selectFloor(fromRoom.floor);
            }

        } catch (error) {
            console.error('Error building route:', error);
            this.mapCore.showError('Error building route: ' + error.message);
        } finally {
            this.hideRouteBuilding();
        }
    }

    // Build route through global building graph
    async buildGlobalRoute(fromRoom, toRoom) {
        // Find nearest nodes to rooms
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

        // Use Dijkstra's algorithm on global graph
        const path = this.dijkstraGlobal(fromNodeId, toNodeId);

        if (!path || path.length === 0) {
            return null;
        }

        // Build detailed route
        const route = this.buildDetailedRoute(path, fromRoom, toRoom);
        return route;
    }

    // Dijkstra's algorithm for global graph
    dijkstraGlobal(fromNodeId, toNodeId) {
        const distances = new Map();
        const previous = new Map();
        const unvisited = new Set();

        // Initialize
        for (const [nodeId, node] of this.buildingGraph.nodes) {
            distances.set(nodeId, Infinity);
            previous.set(nodeId, null);
            unvisited.add(nodeId);
        }

        distances.set(fromNodeId, 0);

        while (unvisited.size > 0) {
            // Find node with smallest distance
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

            // If we reached destination
            if (currentNode === toNodeId) {
                break;
            }

            // Find all edges from current node
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

        // Reconstruct path
        const path = [];
        let currentNode = toNodeId;

        while (currentNode !== null) {
            path.unshift(currentNode);
            currentNode = previous.get(currentNode);
        }

        if (path[0] !== fromNodeId) {
            return null; // Path not found
        }

        return path;
    }

    // Get neighbors of a node
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

    // Find nearest global node
    findNearestGlobalNode(room) {
        const roomCenter = this.calculateRoomCenter(room);
        let nearestNodeId = null;
        let minDistance = Infinity;

        // Search only among nodes on same floor
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

    // Build detailed route
    buildDetailedRoute(path, fromRoom, toRoom) {
        const route = {
            path: path,
            nodes: [],
            edges: [],
            segments: [], // Route segments by floor
            totalDistance: 0,
            isMultiFloor: false
        };

        // Determine if route is multi-floor
        const floors = new Set();
        path.forEach(nodeId => {
            const node = this.buildingGraph.nodes.get(nodeId);
            if (node) {
                floors.add(node.floor);
            }
        });
        route.isMultiFloor = floors.size > 1;

        // Collect information about nodes and edges
        for (let i = 0; i < path.length; i++) {
            const nodeId = path[i];
            const node = this.buildingGraph.nodes.get(nodeId);

            if (node) {
                // Find room for node
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

            // Find edge to next node
            if (i < path.length - 1) {
                const nextNodeId = path[i + 1];
                const edge = this.findEdgeBetweenNodes(nodeId, nextNodeId);

                if (edge) {
                    route.edges.push(edge);
                    route.totalDistance += edge.weight;
                }
            }
        }

        // Split route into segments by floor
        if (route.isMultiFloor) {
            route.segments = this.segmentRouteByFloor(route);
        }

        return route;
    }

    // Find edge between two nodes
    findEdgeBetweenNodes(nodeId1, nodeId2) {
        for (const [edgeId, edge] of this.buildingGraph.edges) {
            if ((edge.globalFromId === nodeId1 && edge.globalToId === nodeId2) ||
                (edge.globalFromId === nodeId2 && edge.globalToId === nodeId1)) {
                return edge;
            }
        }
        return null;
    }

    // Segment route by floor
    segmentRouteByFloor(route) {
        const segments = [];
        let currentSegment = null;
        let currentFloor = null;

        route.nodes.forEach((nodeInfo, index) => {
            const floor = nodeInfo.floor;

            if (floor !== currentFloor) {
                // Start new segment
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

            // Add edge if it's on the same floor
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

    // Display route
    displayRoute(route) {
        if (!route) {
            console.error('No route to display');
            return;
        }

        this.currentRoute = route;
        this.clearRouteDisplay();

        // Display route depending on type
        if (route.isMultiFloor) {
            this.displayMultiFloorRoute(route);
        } else {
            this.displaySingleFloorRoute(route);
        }

        // Show route information
        document.getElementById('route-info').style.display = 'block';
        document.getElementById('route-distance').querySelector('span').textContent =
            Math.round(route.totalDistance);

        // Add route steps
        this.displayRouteSteps(route);

        // Animate route on current floor
        this.animateRouteOnCurrentFloor(route);
    }

    // Display single floor route
    displaySingleFloorRoute(route) {
        // Activate route elements on current floor
        this.activateRouteElementsOnFloor(route, this.mapCore.currentFloor);

        // Highlight start and end rooms if on current floor
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

    // Display multi-floor route
    displayMultiFloorRoute(route) {
        // Display route segment for current floor
        const currentFloorSegment = route.segments.find(seg => seg.floor === this.mapCore.currentFloor);

        if (currentFloorSegment) {
            this.displayRouteSegment(currentFloorSegment);
        }

        // Add floor transition indicators
        this.addFloorTransitionIndicators(route);
    }

    // Display route segment
    displayRouteSegment(segment) {
        // Activate segment elements
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

        // Highlight rooms in segment
        if (segment.startNode.room) {
            this.highlightRouteRoom(segment.startNode.room.originalId, 'segment-start');
        }
        if (segment.endNode.room) {
            this.highlightRouteRoom(segment.endNode.room.originalId, 'segment-end');
        }
    }

    // Activate route elements on specific floor
    activateRouteElementsOnFloor(route, floor) {
        const svgElement = document.getElementById('main-svg');
        if (!svgElement) return;

        // Activate edges on current floor
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

        // Activate nodes on current floor
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

    // Add floor transition indicators
    addFloorTransitionIndicators(route) {
        // Find floor transitions
        for (let i = 0; i < route.edges.length; i++) {
            const edge = route.edges[i];
            if (edge.isStairs) {
                // Add visual indicator on map
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

    // Add stair indicator
    addStairIndicator(stairNode, targetNode, direction) {
        const svgElement = document.getElementById('main-svg');
        if (!svgElement) return;

        // Create SVG element for indicator
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

        // Add tooltip
        const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        title.textContent = `Go to floor ${targetNode.floor}`;
        indicator.appendChild(title);

        svgElement.appendChild(indicator);
    }

    // Clear route display
    clearRouteDisplay() {
        // Clear active route elements
        document.querySelectorAll('.route-active').forEach(element => {
            element.classList.remove('route-active');
            if (element.getAttribute('data-name') === 'node' ||
                element.getAttribute('data-name') === 'edge') {
                element.style.display = 'none';
            }
        });

        // Clear room highlights
        document.querySelectorAll('.room.route-highlight').forEach(room => {
            room.classList.remove('route-highlight');
        });

        // Remove stair indicators
        document.querySelectorAll('.stair-indicator').forEach(indicator => {
            indicator.remove();
        });

        // Hide route information
        document.getElementById('route-info').style.display = 'none';
        document.getElementById('route-steps').innerHTML = '';
    }

    // Display route steps
    displayRouteSteps(route) {
        const stepsContainer = document.getElementById('route-steps');
        stepsContainer.innerHTML = '';

        // Generate steps based on route segments
        const steps = this.generateDetailedRouteSteps(route);

        steps.forEach((step, index) => {
            const stepElement = document.createElement('div');
            stepElement.className = 'route-step';
            if (step.type === 'stairs') {
                stepElement.className += ' route-step-stairs';
            }
            stepElement.setAttribute('role', 'listitem');
            stepElement.innerHTML = `<strong>${index + 1}.</strong> ${step.text}`;

            // Add handler to navigate to corresponding floor
            if (step.floor) {
                stepElement.style.cursor = 'pointer';
                stepElement.addEventListener('click', () => {
                    this.mapCore.selectFloor(step.floor);
                });
            }

            stepsContainer.appendChild(stepElement);
        });
    }

    // Generate detailed route steps
    generateDetailedRouteSteps(route) {
        const steps = [];

        if (route.isMultiFloor) {
            // For multi-floor route
            route.segments.forEach((segment, index) => {
                // Start of segment
                if (index === 0 && segment.startNode.room) {
                    steps.push({
                        text: `Start from: ${segment.startNode.room.label || segment.startNode.room.originalId} (Floor ${segment.floor})`,
                        type: 'start',
                        floor: segment.floor
                    });
                }

                // Intermediate segment steps
                if (segment.nodes.length > 2) {
                    steps.push({
                        text: `Navigate through floor ${segment.floor}`,
                        type: 'path',
                        floor: segment.floor
                    });
                }

                // Floor transition
                if (index < route.segments.length - 1) {
                    const nextSegment = route.segments[index + 1];
                    const direction = parseInt(nextSegment.floor) > parseInt(segment.floor) ? 'up' : 'down';
                    steps.push({
                        text: `⬆️ Take stairs ${direction} to floor ${nextSegment.floor}`,
                        type: 'stairs',
                        floor: nextSegment.floor
                    });
                }

                // End of route
                if (index === route.segments.length - 1 && segment.endNode.room) {
                    steps.push({
                        text: `Destination: ${segment.endNode.room.label || segment.endNode.room.originalId} (Floor ${segment.floor})`,
                        type: 'end',
                        floor: segment.floor
                    });
                }
            });
        } else {
            // For single floor route
            if (route.nodes.length > 0) {
                const startRoom = route.nodes[0].room;
                const endRoom = route.nodes[route.nodes.length - 1].room;

                if (startRoom) {
                    steps.push({
                        text: `Start from: ${startRoom.label || startRoom.originalId}`,
                        type: 'start'
                    });
                }

                if (route.nodes.length > 2) {
                    steps.push({
                        text: `Navigate through corridor`,
                        type: 'path'
                    });
                }

                if (endRoom) {
                    steps.push({
                        text: `Destination: ${endRoom.label || endRoom.originalId}`,
                        type: 'end'
                    });
                }
            }
        }

        // Add total distance
        steps.push({
            text: `Total distance: ${Math.round(route.totalDistance)} m`,
            type: 'distance'
        });

        return steps;
    }

    // Animate route on current floor
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

        // Start animation after short delay
        setTimeout(animateNext, 500);
    }

    // Highlight route room
    highlightRouteRoom(roomId, type = 'default') {
        const roomElement = document.getElementById(roomId);
        if (roomElement) {
            roomElement.classList.add('route-highlight');
            roomElement.setAttribute('data-route-type', type);
        }
    }

    // Calculate room center
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

    // Clear route
    clearRoute() {
        this.currentRoute = null;
        this.clearRouteDisplay();

        // Clear selections in dropdowns
        document.getElementById('from-select').value = '';
        document.getElementById('to-select').value = '';

        this.mapCore.announceToScreenReader('Route cleared');
    }

    // Swap start and end
    swapRoute() {
        const fromSelect = document.getElementById('from-select');
        const toSelect = document.getElementById('to-select');

        const tempValue = fromSelect.value;
        fromSelect.value = toSelect.value;
        toSelect.value = tempValue;

        this.mapCore.announceToScreenReader('Start and end points swapped');
    }

    // Set route destination
    setRouteDestination(room) {
        const toSelect = document.getElementById('to-select');
        const globalRoomId = room.floor ? `${room.floor}-${room.id}` : room.id;

        // Check if option exists in select
        const option = toSelect.querySelector(`option[value="${globalRoomId}"]`);
        if (option) {
            toSelect.value = globalRoomId;

            // If start point already selected, build route
            const fromSelect = document.getElementById('from-select');
            if (fromSelect.value) {
                this.buildRoute();
            }
        }
    }

    // Set route origin
    setRouteOrigin(room) {
        const fromSelect = document.getElementById('from-select');
        const globalRoomId = room.floor ? `${room.floor}-${room.id}` : room.id;

        // Check if option exists in select
        const option = fromSelect.querySelector(`option[value="${globalRoomId}"]`);
        if (option) {
            fromSelect.value = globalRoomId;

            // If end point already selected, build route
            const toSelect = document.getElementById('to-select');
            if (toSelect.value) {
                this.buildRoute();
            }
        }
    }

    // Find nearest room of specific category
    findNearest(category) {
        const currentRoom = this.mapCore.selectedRoom;
        if (!currentRoom) {
            this.mapCore.showError('Please select a room first');
            return;
        }

        // Find nearest room of given category on all floors
        const nearestRoom = this.findNearestRoomByCategoryGlobal(currentRoom, category);

        if (nearestRoom) {
            // Set up route
            const fromSelect = document.getElementById('from-select');
            const toSelect = document.getElementById('to-select');

            const fromGlobalId = currentRoom.floor ? `${currentRoom.floor}-${currentRoom.id}` : currentRoom.id;
            const toGlobalId = nearestRoom.globalId;

            fromSelect.value = fromGlobalId;
            toSelect.value = toGlobalId;

            this.buildRoute();
        } else {
            const categoryName = this.mapCore.getCategoryName(category);
            this.mapCore.showError(`No ${categoryName} found in building`);
        }
    }

    // Find nearest room by category in entire building
    findNearestRoomByCategoryGlobal(fromRoom, category) {
        const candidateRooms = [];

        // Collect all rooms of given category
        for (const [globalRoomId, room] of this.buildingGraph.rooms) {
            if (room.category === category && room.access &&
                room.globalId !== `${fromRoom.floor}-${fromRoom.id}`) {
                candidateRooms.push(room);
            }
        }

        if (candidateRooms.length === 0) return null;

        // First search on same floor
        const sameFloorRooms = candidateRooms.filter(room => room.floor === fromRoom.floor);
        if (sameFloorRooms.length > 0) {
            return this.findClosestRoom(fromRoom, sameFloorRooms);
        }

        // If not on floor, search on nearest floors
        const floorDifferences = new Map();
        candidateRooms.forEach(room => {
            const diff = Math.abs(parseInt(room.floor) - parseInt(fromRoom.floor));
            if (!floorDifferences.has(diff)) {
                floorDifferences.set(diff, []);
            }
            floorDifferences.get(diff).push(room);
        });

        // Sort by floor difference
        const sortedDiffs = Array.from(floorDifferences.keys()).sort((a, b) => a - b);

        for (const diff of sortedDiffs) {
            const rooms = floorDifferences.get(diff);
            if (rooms.length > 0) {
                return rooms[0]; // Return first found room
            }
        }

        return null;
    }

    // Find closest room from list
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

    // Route to selected room
    routeToSelectedRoom() {
        const selectedRoom = this.mapCore.selectedRoom;
        if (!selectedRoom) {
            this.mapCore.showError('No room selected');
            return;
        }

        const toSelect = document.getElementById('to-select');
        const globalRoomId = selectedRoom.floor ?
            `${selectedRoom.floor}-${selectedRoom.id}` : selectedRoom.id;

        toSelect.value = globalRoomId;

        // If start point already selected, build route
        const fromSelect = document.getElementById('from-select');
        if (fromSelect.value) {
            this.buildRoute();
        } else {
            this.mapCore.showError('Please select a starting point');
        }
    }

    // Route from selected room
    routeFromSelectedRoom() {
        const selectedRoom = this.mapCore.selectedRoom;
        if (!selectedRoom) {
            this.mapCore.showError('No room selected');
            return;
        }

        const fromSelect = document.getElementById('from-select');
        const globalRoomId = selectedRoom.floor ?
            `${selectedRoom.floor}-${selectedRoom.id}` : selectedRoom.id;

        fromSelect.value = globalRoomId;

        // If end point already selected, build route
        const toSelect = document.getElementById('to-select');
        if (toSelect.value) {
            this.buildRoute();
        } else {
            this.mapCore.showError('Please select a destination');
        }
    }

    // Highlight selected room
    highlightSelectedRoom() {
        const selectedRoom = this.mapCore.selectedRoom;
        if (!selectedRoom) {
            this.mapCore.showError('No room selected');
            return;
        }

        if (window.mapUI) {
            window.mapUI.highlightRoom(selectedRoom.id, 3000);
            window.mapUI.panToRoom(selectedRoom.id);
        }
    }

    // Show route building indicator
    showRouteBuilding() {
        const buildButton = document.getElementById('build-route');
        buildButton.disabled = true;
        buildButton.textContent = 'Building...';
        this.mapCore.announceToScreenReader('Building route');
    }

    // Hide route building indicator
    hideRouteBuilding() {
        const buildButton = document.getElementById('build-route');
        buildButton.disabled = false;
        buildButton.textContent = 'Build route';
    }
}

// Initialize navigation after DOM loads
document.addEventListener('DOMContentLoaded', () => {
    // Wait for MapCore initialization
    const initNavigation = () => {
        if (window.mapCore && window.mapCore.allMapsData.size > 0) {
            window.mapNavigation = new MapNavigation(window.mapCore);
        } else {
            setTimeout(initNavigation, 200);
        }
    };

    initNavigation();
});