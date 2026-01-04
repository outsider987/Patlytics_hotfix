/**
 * useCycleDetection Hook
 * 
 * Core algorithm for detecting cycles in directed graphs using DFS.
 * This is the solution to the Patlytics infinite loop edge case.
 */

// Step action types for debugging/visualization
export const ACTION_TYPES = {
    START: 'START',
    ENTER_NODE: 'ENTER_NODE',
    CHECK_IN_STACK: 'CHECK_IN_STACK',
    CYCLE_FOUND: 'CYCLE_FOUND',
    CHECK_VISITED: 'CHECK_VISITED',
    SKIP_VISITED: 'SKIP_VISITED',
    ADD_TO_STACK: 'ADD_TO_STACK',
    EXPLORE_NEIGHBOR: 'EXPLORE_NEIGHBOR',
    BACKTRACK: 'BACKTRACK',
    MARK_SAFE: 'MARK_SAFE',
    COMPLETE: 'COMPLETE'
};

/**
 * Custom hook for cycle detection in graphs
 * @returns {Object} - { runDetection, runDetectionWithSteps }
 */
export const useCycleDetection = () => {

    /**
     * Fast cycle detection (no step recording)
     * @param {Object} graphData - Adjacency list { "node": ["neighbors"] }
     * @param {string} startNode - Starting node for DFS
     * @returns {Object} - { found: boolean, loopPath?: string[], error?: string }
     */
    const runDetection = (graphData, startNode) => {
        const visited = new Set();
        const recursionStack = new Set();
        const pathStack = [];

        const dfs = (currentNode) => {
            // 1. Cycle detection: node already in current path
            if (recursionStack.has(currentNode)) {
                return { found: true, culprit: currentNode };
            }

            // 2. Already visited and verified safe
            if (visited.has(currentNode)) {
                return { found: false };
            }

            // 3. Add to current path
            recursionStack.add(currentNode);
            pathStack.push(currentNode);

            // 4. Explore neighbors
            const neighbors = graphData[currentNode] || [];
            for (const neighbor of neighbors) {
                const neighborStr = String(neighbor);
                const result = dfs(neighborStr);
                if (result.found) {
                    return result;
                }
            }

            // 5. Backtrack: remove from path, mark as safe
            recursionStack.delete(currentNode);
            pathStack.pop();
            visited.add(currentNode);

            return { found: false };
        };

        // Validate start node
        if (!graphData[startNode]) {
            return { found: false, error: `Node "${startNode}" not found in graph` };
        }

        const result = dfs(startNode);

        if (result.found) {
            // Extract the actual cycle path
            const loopStartIndex = pathStack.indexOf(result.culprit);
            const actualLoop = pathStack.slice(loopStartIndex);
            actualLoop.push(result.culprit);

            return {
                found: true,
                path: pathStack,
                loopPath: actualLoop
            };
        }

        return { found: false };
    };

    /**
     * Cycle detection with step-by-step recording for visualization
     * @param {Object} graphData - Adjacency list
     * @param {string} startNode - Starting node for DFS
     * @returns {Object} - { found, loopPath?, steps[], error? }
     */
    const runDetectionWithSteps = (graphData, startNode) => {
        const visited = new Set();
        const recursionStack = new Set();
        const pathStack = [];
        const stepsLog = [];

        // Helper to capture current state
        const captureState = (action, node, explanation, explanationZh, extra = {}) => {
            stepsLog.push({
                action,
                node,
                explanation,
                explanationZh,
                visited: new Set(visited),
                recursionStack: new Set(recursionStack),
                pathStack: [...pathStack],
                ...extra
            });
        };

        captureState(
            ACTION_TYPES.START,
            startNode,
            `> init dfs --start="${startNode}"`,
            `初始化深度優先搜尋，起點="${startNode}"`
        );

        const dfs = (currentNode) => {
            captureState(
                ACTION_TYPES.ENTER_NODE,
                currentNode,
                `> push node[${currentNode}]`,
                `進入節點 ${currentNode}`
            );

            captureState(
                ACTION_TYPES.CHECK_IN_STACK,
                currentNode,
                `> check stack.contains(${currentNode}) => [${[...recursionStack].join(',')}]`,
                `檢查堆疊是否包含 ${currentNode}`
            );

            if (recursionStack.has(currentNode)) {
                captureState(
                    ACTION_TYPES.CYCLE_FOUND,
                    currentNode,
                    `[!] FATAL: cycle detected @ node[${currentNode}] | path: ${pathStack.join('->')}->${currentNode}`,
                    `致命錯誤：在節點 ${currentNode} 發現循環`,
                    { isCycle: true, cycleNode: currentNode }
                );
                // Identify the back-edge
                const sourceNode = pathStack[pathStack.length - 1];
                return {
                    found: true,
                    culprit: currentNode,
                    cycleEdge: { source: sourceNode, target: currentNode }
                };
            }

            captureState(
                ACTION_TYPES.CHECK_VISITED,
                currentNode,
                `> check visited.has(${currentNode}) => {${[...visited].join(',')}}`,
                `檢查是否已訪問 ${currentNode}`
            );

            if (visited.has(currentNode)) {
                captureState(
                    ACTION_TYPES.SKIP_VISITED,
                    currentNode,
                    `> skip node[${currentNode}] -- already verified`,
                    `跳過節點 ${currentNode}，已驗證安全`
                );
                return { found: false };
            }

            recursionStack.add(currentNode);
            pathStack.push(currentNode);

            captureState(
                ACTION_TYPES.ADD_TO_STACK,
                currentNode,
                `> stack.push(${currentNode}) => [${[...recursionStack].join(',')}]`,
                `將 ${currentNode} 加入堆疊`
            );

            const neighbors = graphData[currentNode] || [];
            for (const neighbor of neighbors) {
                const neighborStr = String(neighbor);

                captureState(
                    ACTION_TYPES.EXPLORE_NEIGHBOR,
                    currentNode,
                    `> traverse edge[${currentNode}]->[${neighborStr}]`,
                    `遍歷邊 ${currentNode} -> ${neighborStr}`,
                    { targetNeighbor: neighborStr }
                );

                const result = dfs(neighborStr);
                if (result.found) {
                    return result;
                }
            }

            captureState(
                ACTION_TYPES.BACKTRACK,
                currentNode,
                `> stack.pop() -- backtrack from node[${currentNode}]`,
                `回溯，從堆疊移除 ${currentNode}`
            );

            recursionStack.delete(currentNode);
            pathStack.pop();
            visited.add(currentNode);

            captureState(
                ACTION_TYPES.MARK_SAFE,
                currentNode,
                `> visited.add(${currentNode}) -- node verified safe`,
                `節點 ${currentNode} 標記為安全`
            );

            return { found: false };
        };

        // Validate start node
        if (!graphData[startNode]) {
            return { found: false, error: `Node "${startNode}" not found in graph`, steps: stepsLog };
        }

        const result = dfs(startNode);

        if (result.found) {
            const loopStartIndex = pathStack.indexOf(result.culprit);
            const actualLoop = pathStack.slice(loopStartIndex);
            actualLoop.push(result.culprit);

            return {
                found: true,
                path: pathStack,
                loopPath: actualLoop,
                cycleEdge: result.cycleEdge,
                steps: stepsLog
            };
        }

        captureState(
            ACTION_TYPES.COMPLETE,
            startNode,
            `> exit 0 -- no cycles detected, all paths verified`,
            `檢測完成，無循環，所有路徑安全`
        );

        return { found: false, steps: stepsLog };
    };

    /**
     * Algorithm to automatically resolve conflicts by removing back-edges.
     * Returns a new, safe DAG (Directed Acyclic Graph).
     * @param {Object} graphData - The potentially cyclic graph
     * @param {string} startNode - Starting node for traversal
     * @returns {Object} - { safetyGraph: Object, removedEdges: Array }
     */
    const removeCycles = (graphData, startNode) => {
        // Deep copy graph to avoid mutating original
        const safeGraph = JSON.parse(JSON.stringify(graphData));
        const removedEdges = [];

        const visited = new Set();
        const recursionStack = new Set();
        const pathStack = [];

        const dfs = (currentNode) => {
            recursionStack.add(currentNode);
            pathStack.push(currentNode);

            // Get neighbors from the safe (mutable) graph
            const neighbors = safeGraph[currentNode] || [];

            // Iterate backwards to allow safe removal during iteration
            for (let i = neighbors.length - 1; i >= 0; i--) {
                const neighbor = String(neighbors[i]);

                // CONFLICT RESOLUTION ALGORITHM:
                // 1. If neighbor is in recursion stack => BACK EDGE (Cycle) => REMOVE IT
                if (recursionStack.has(neighbor)) {
                    // Remove the conflict
                    safeGraph[currentNode].splice(i, 1);
                    removedEdges.push({ source: currentNode, target: neighbor });
                    continue;
                }

                // 2. If visited, it's a cross edge or forward edge (Safe) => SKIP
                if (!visited.has(neighbor)) {
                    dfs(neighbor);
                }
            }

            recursionStack.delete(currentNode);
            pathStack.pop();
            visited.add(currentNode);
        };

        if (safeGraph[startNode]) {
            dfs(startNode);
        }

        return { safeGraph, removedEdges };
    };

    return {
        runDetection,
        runDetectionWithSteps,
        removeCycles
    };
};

export default useCycleDetection;
