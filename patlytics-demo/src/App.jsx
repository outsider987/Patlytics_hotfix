import React, { useState, useCallback, useEffect, useRef } from 'react';
import ReactFlow, {
  Background,
  Controls,
  applyEdgeChanges,
  applyNodeChanges,
  MarkerType
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useCycleDetection, ACTION_TYPES } from './hooks/useCycleDetection';

// Test cases for different scenarios
const TEST_CASES = {
  'patlytics_edge': {
    name: 'Patlytics Edge Case',
    description: 'The original infinite loop bug: 2→3→2',
    data: `{
  "1": ["2", "7"],
  "2": ["3", "4"],
  "3": ["2", "1"]
}`
  },
  'self_loop': {
    name: 'Self Loop',
    description: 'Node points to itself: 1→1',
    data: `{
  "1": ["1", "2"],
  "2": ["3"],
  "3": []
}`
  },
  'no_cycle': {
    name: 'No Cycle (DAG)',
    description: 'Directed Acyclic Graph - all paths safe',
    data: `{
  "1": ["2", "3"],
  "2": ["4"],
  "3": ["4"],
  "4": []
}`
  },
  'long_cycle': {
    name: 'Long Cycle',
    description: 'Cycle spans multiple nodes: 1→2→3→4→1',
    data: `{
  "1": ["2"],
  "2": ["3"],
  "3": ["4"],
  "4": ["1"]
}`
  },
  'complex': {
    name: 'Complex Graph',
    description: 'Multiple paths with hidden cycle',
    data: `{
  "A": ["B", "C"],
  "B": ["D", "E"],
  "C": ["F"],
  "D": ["C"],
  "E": ["F"],
  "F": ["B"]
}`
  },
  'diamond_safe': {
    name: 'Diamond (Safe)',
    description: 'Diamond pattern without cycle',
    data: `{
  "1": ["2", "3"],
  "2": ["4"],
  "3": ["4"],
  "4": ["5"],
  "5": []
}`
  }
};

const App = () => {
  const [selectedCase, setSelectedCase] = useState('patlytics_edge');
  const [jsonInput, setJsonInput] = useState(TEST_CASES['patlytics_edge'].data);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [result, setResult] = useState(null);
  const [targetPatent, setTargetPatent] = useState('1');

  // Step-by-step mode state
  const [steps, setSteps] = useState([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [isStepMode, setIsStepMode] = useState(false);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [autoPlaySpeed, setAutoPlaySpeed] = useState(1000);
  const autoPlayRef = useRef(null);

  // Use the cycle detection hook
  const { runDetection, runDetectionWithSteps, removeCycles } = useCycleDetection();

  // Handle test case selection
  const handleCaseChange = (caseId) => {
    setSelectedCase(caseId);
    setJsonInput(TEST_CASES[caseId].data);
    // Set default target based on first key in the test case
    const firstKey = Object.keys(JSON.parse(TEST_CASES[caseId].data))[0];
    setTargetPatent(firstKey);
    setResult(null);
    setIsStepMode(false);
    setSteps([]);
    setCurrentStepIndex(-1);
  };

  // ----------------------------------------------------
  // UI Logic
  // ----------------------------------------------------

  const generateGraph = () => {
    try {
      const adjList = JSON.parse(jsonInput);
      const newNodes = [];
      const newEdges = [];

      const keys = Object.keys(adjList);
      const centerX = 400;
      const centerY = 200;
      const radius = 150;

      keys.forEach((key, index) => {
        const angle = (2 * Math.PI * index) / keys.length - Math.PI / 2;
        newNodes.push({
          id: key,
          data: { label: `[${key}]` },
          position: {
            x: centerX + radius * Math.cos(angle),
            y: centerY + radius * Math.sin(angle)
          },
          style: {
            background: '#0a0a0a',
            border: '1px solid #00ff00',
            borderRadius: '0',
            width: 80,
            padding: '10px',
            textAlign: 'center',
            fontFamily: '"Fira Code", "SF Mono", "Consolas", monospace',
            fontWeight: 400,
            fontSize: '14px',
            color: '#00ff00',
            boxShadow: '0 0 10px rgba(0, 255, 0, 0.3)'
          }
        });

        adjList[key].forEach(target => {
          newEdges.push({
            id: `e${key}-${target}`,
            source: key,
            target: String(target),
            type: 'smoothstep',
            markerEnd: { type: MarkerType.ArrowClosed, color: '#00ff00' },
            animated: false,
            style: { stroke: '#00ff00', strokeWidth: 1 }
          });
        });
      });

      setNodes(newNodes);
      setEdges(newEdges);
      setResult(null);
      setSteps([]);
      setCurrentStepIndex(-1);
      setIsStepMode(false);
      setIsAutoPlaying(false);
    } catch (e) {
      alert("ERROR: Invalid JSON syntax");
    }
  };

  const handleAnalyze = () => {
    try {
      const adjList = JSON.parse(jsonInput);

      const analysis = runDetection(adjList, targetPatent);

      if (analysis.error) {
        alert(analysis.error);
        return;
      }

      if (analysis.found) {
        setResult({
          status: 'FAIL',
          message: `CYCLE @ ${analysis.loopPath.join(' -> ')}`,
          cycleEdge: analysis.cycleEdge
        });
        highlightGraph(analysis.loopPath);
      } else {
        setResult({
          status: 'PASS',
          message: 'exit 0 -- all paths verified safe'
        });
        resetGraphStyles();
      }
      setIsStepMode(false);
    } catch (error) {
      console.error(error);
      alert("FATAL: Analysis failed");
    }
  };

  const handleStepByStep = () => {
    try {
      const adjList = JSON.parse(jsonInput);

      if (nodes.length === 0) {
        generateGraph();
      }

      const analysis = runDetectionWithSteps(adjList, targetPatent);

      if (analysis.error) {
        alert(analysis.error);
        return;
      }

      setSteps(analysis.steps);
      setCurrentStepIndex(0);
      setIsStepMode(true);
      setResult(null);

      if (analysis.found) {
        setResult({
          status: 'FAIL',
          message: `CYCLE @ ${analysis.loopPath.join(' -> ')}`,
          hidden: true,
          cycleEdge: analysis.cycleEdge
        });
      }
    } catch (error) {
      console.error(error);
      alert("FATAL: Step mode init failed");
    }
  };

  const fixCycle = () => {
    try {
      const currentData = JSON.parse(jsonInput);

      // Use the algorithm to resolve conflicts
      const { safeGraph, removedEdges } = removeCycles(currentData, targetPatent);

      if (removedEdges.length > 0) {
        const newJson = JSON.stringify(safeGraph, null, 2);
        setJsonInput(newJson);
        setIsStepMode(false); // EXIT DEBUG MODE
        setResult(null);

        // Short delay to let UI update then re-analyze
        setTimeout(() => {
          const adjList = JSON.parse(newJson);
          const analysis = runDetection(adjList, targetPatent);

          if (!analysis.found) {
            const removedDesc = removedEdges.map(e => `${e.source}->${e.target}`).join(', ');
            setResult({
              status: 'PASS',
              message: `ALGORITHM FIX: Removed back-edge(s) [${removedDesc}]. Graph is now a DAG.`
            });
            resetGraphStyles();
            // Re-generate graph visualization
            const newNodes = [];
            const newEdges = [];

            const keys = Object.keys(adjList);
            const centerX = 400;
            const centerY = 200;
            const radius = 150;

            keys.forEach((key, index) => {
              const angle = (2 * Math.PI * index) / keys.length - Math.PI / 2;
              newNodes.push({
                id: key,
                data: { label: `[${key}]` },
                position: {
                  x: centerX + radius * Math.cos(angle),
                  y: centerY + radius * Math.sin(angle)
                },
                style: {
                  background: '#0a0a0a',
                  border: '2px solid #00ff00',
                  borderRadius: '0',
                  width: 80,
                  padding: '10px',
                  textAlign: 'center',
                  fontFamily: '"Fira Code", "SF Mono", "Consolas", monospace',
                  fontWeight: 400,
                  fontSize: '14px',
                  color: '#00ff00',
                  boxShadow: '0 0 10px rgba(0, 255, 0, 0.3)'
                }
              });

              adjList[key].forEach(target => {
                newEdges.push({
                  id: `e${key}-${target}`,
                  source: key,
                  target: String(target),
                  type: 'smoothstep',
                  markerEnd: { type: MarkerType.ArrowClosed, color: '#00ff00' },
                  animated: false,
                  style: { stroke: '#00ff00', strokeWidth: 1 }
                });
              });
            });
            setNodes(newNodes);
            setEdges(newEdges);
          }
        }, 100);
      } else {
        alert("Algorithm found no cycles to remove (maybe start node is different?)");
      }
    } catch (e) {
      console.error(e);
      alert("Failed to fix cycle automatically");
    }
  };

  const nextStep = () => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    }
  };

  const prevStep = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  };

  const goToStep = (index) => {
    if (index >= 0 && index < steps.length) {
      setCurrentStepIndex(index);
    }
  };

  const toggleAutoPlay = () => {
    setIsAutoPlaying(!isAutoPlaying);
  };

  useEffect(() => {
    if (isAutoPlaying && currentStepIndex < steps.length - 1) {
      autoPlayRef.current = setTimeout(() => {
        setCurrentStepIndex(prev => prev + 1);
      }, autoPlaySpeed);
    } else if (currentStepIndex >= steps.length - 1) {
      setIsAutoPlaying(false);
    }

    return () => {
      if (autoPlayRef.current) {
        clearTimeout(autoPlayRef.current);
      }
    };
  }, [isAutoPlaying, currentStepIndex, steps.length, autoPlaySpeed]);

  useEffect(() => {
    if (!isStepMode || currentStepIndex < 0 || steps.length === 0) return;

    const step = steps[currentStepIndex];

    setNodes(nds => nds.map(node => {
      let style = {
        background: '#0a0a0a',
        border: '1px solid #00ff00',
        borderRadius: '0',
        width: 80,
        padding: '10px',
        textAlign: 'center',
        fontFamily: '"Fira Code", "SF Mono", "Consolas", monospace',
        fontWeight: 400,
        fontSize: '14px',
        color: '#00ff00',
        transition: 'all 0.2s ease',
        boxShadow: '0 0 10px rgba(0, 255, 0, 0.3)'
      };

      if (step.action === ACTION_TYPES.CYCLE_FOUND && step.pathStack.includes(node.id)) {
        const cycleStartIndex = step.pathStack.indexOf(step.cycleNode);
        const isInCycle = step.pathStack.indexOf(node.id) >= cycleStartIndex || node.id === step.cycleNode;

        if (isInCycle) {
          style = {
            ...style,
            background: '#1a0000',
            border: '2px solid #ff0000',
            color: '#ff0000',
            boxShadow: '0 0 20px rgba(255, 0, 0, 0.8), inset 0 0 20px rgba(255, 0, 0, 0.2)'
          };
        }
      }
      else if (node.id === step.node && step.action !== ACTION_TYPES.START && step.action !== ACTION_TYPES.COMPLETE) {
        style = {
          ...style,
          background: '#1a1a00',
          border: '2px solid #ffff00',
          color: '#ffff00',
          boxShadow: '0 0 20px rgba(255, 255, 0, 0.6)'
        };
      }
      else if (step.recursionStack.has(node.id)) {
        style = {
          ...style,
          background: '#001a1a',
          border: '2px solid #00ffff',
          color: '#00ffff',
          boxShadow: '0 0 15px rgba(0, 255, 255, 0.5)'
        };
      }
      else if (step.visited.has(node.id)) {
        style = {
          ...style,
          background: '#001a00',
          border: '2px solid #00ff00',
          color: '#00ff00',
          boxShadow: '0 0 15px rgba(0, 255, 0, 0.6)'
        };
      }

      return { ...node, style };
    }));

    setEdges(eds => eds.map(edge => {
      let style = { stroke: '#003300', strokeWidth: 1 };
      let animated = false;

      const pathStack = step.pathStack;
      for (let i = 0; i < pathStack.length - 1; i++) {
        if (pathStack[i] === edge.source && pathStack[i + 1] === edge.target) {
          style = { stroke: '#00ffff', strokeWidth: 2 };
          animated = true;
          break;
        }
      }

      if (step.action === ACTION_TYPES.EXPLORE_NEIGHBOR &&
        step.node === edge.source &&
        step.targetNeighbor === edge.target) {
        style = { stroke: '#ffff00', strokeWidth: 2 };
        animated = true;
      }

      if (step.action === ACTION_TYPES.CYCLE_FOUND) {
        const cycleNode = step.cycleNode;
        const cycleStartIndex = step.pathStack.indexOf(cycleNode);
        const cyclePath = [...step.pathStack.slice(cycleStartIndex), cycleNode];

        for (let i = 0; i < cyclePath.length - 1; i++) {
          if (cyclePath[i] === edge.source && cyclePath[i + 1] === edge.target) {
            style = { stroke: '#ff0000', strokeWidth: 3 };
            animated = true;
            break;
          }
        }
      }

      return { ...edge, style, animated, markerEnd: { type: MarkerType.ArrowClosed, color: style.stroke } };
    }));
  }, [currentStepIndex, isStepMode, steps]);

  const previewFix = () => {
    try {
      const currentData = JSON.parse(jsonInput);
      const { removedEdges } = removeCycles(currentData, targetPatent);

      if (removedEdges.length > 0) {
        // Highlight the edges that WOULD be removed
        setResult({
          status: 'FAIL',
          message: `PREVIEW: Algorithm identifies ${removedEdges.length} back-edge(s) to remove: [${removedEdges.map(e => `${e.source}->${e.target}`).join(', ')}]`,
          cycleEdge: result && result.cycleEdge, // Keep for auto-fix button
          previewEdges: removedEdges,
          hidden: false // Ensure it's shown even if in Step Mode
        });

        // Visual indication
        setEdges(eds => eds.map(edge => {
          const isRemoved = removedEdges.some(re => String(re.source) === String(edge.source) && String(re.target) === String(edge.target));
          if (isRemoved) {
            return {
              ...edge,
              animated: true,
              style: {
                stroke: '#ff00ff', // Magenta for "To Be Deleted"
                strokeWidth: 3,
                strokeDasharray: '5,5',
                opacity: 0.8
              },
              label: '❌ TO DELETE',
              labelStyle: { fill: '#ff00ff', fontWeight: 700 }
            };
          }
          return { ...edge, style: { ...edge.style, opacity: 0.3 } };
        }));

        setNodes(nds => nds.map(node => ({
          ...node,
          style: { ...node.style, opacity: 0.5 }
        })));

      } else {
        alert("Algorithm sees no conflicts to fix.");
      }
    } catch (e) {
      console.error(e);
      alert("Preview failed");
    }
  };

  const resetGraphStyles = () => {
    setNodes((nds) => nds.map((node) => ({
      ...node,
      style: {
        background: '#0a0a0a',
        border: '1px solid #00ff00',
        borderRadius: '0',
        width: 80,
        padding: '10px',
        textAlign: 'center',
        fontFamily: '"Fira Code", "SF Mono", "Consolas", monospace',
        fontWeight: 400,
        fontSize: '14px',
        color: '#00ff00',
        boxShadow: '0 0 10px rgba(0, 255, 0, 0.3)',
        opacity: 1
      }
    })));
    setEdges((eds) => eds.map((edge) => ({
      ...edge,
      animated: false,
      label: '',
      labelStyle: undefined,
      style: { stroke: '#00ff00', strokeWidth: 1, strokeDasharray: '0', opacity: 1 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#00ff00' }
    })));
  };

  const highlightGraph = (loopPath) => {
    setNodes((nds) => nds.map((node) => {
      if (loopPath.includes(node.id)) {
        return {
          ...node,
          style: {
            ...node.style,
            background: '#1a0000',
            border: '2px solid #ff0000',
            color: '#ff0000',
            boxShadow: '0 0 20px rgba(255, 0, 0, 0.8)',
            opacity: 1
          }
        };
      }
      return { ...node, style: { ...node.style, opacity: 0.3 } };
    }));

    setEdges((eds) => eds.map((edge) => {
      let isInLoop = false;
      for (let i = 0; i < loopPath.length - 1; i++) {
        if (loopPath[i] === edge.source && loopPath[i + 1] === edge.target) {
          isInLoop = true;
          break;
        }
      }

      if (isInLoop) {
        return {
          ...edge,
          animated: true,
          style: { stroke: '#ff0000', strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#ff0000' }
        };
      }
      return { ...edge, style: { stroke: '#002200' }, markerEnd: { type: MarkerType.ArrowClosed, color: '#002200' } };
    }));
  };

  const exitStepMode = () => {
    setIsStepMode(false);
    setSteps([]);
    setCurrentStepIndex(-1);
    setIsAutoPlaying(false);
    generateGraph();
  };

  const onNodesChange = useCallback((changes) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);

  const currentStep = isStepMode && currentStepIndex >= 0 ? steps[currentStepIndex] : null;

  return (
    <div className="flex flex-col h-screen w-screen bg-black font-mono text-green-400">
      {/* Scanline overlay */}
      <div className="pointer-events-none fixed inset-0 z-50 opacity-[0.03]"
        style={{
          background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.3) 2px, rgba(0,0,0,0.3) 4px)'
        }}
      />

      {/* Header */}
      <div className="px-6 py-3 border-b border-green-900 bg-black shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-green-500">$</span>
          <h1 className="text-lg text-green-400 font-normal">patlytics-cycle-detector <span className="text-green-700">v1.0.0</span></h1>
        </div>
        <p className="text-green-700 text-xs mt-1 pl-4">
          # Detecting circular dependencies in patent graphs
        </p>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel */}
        <div className="w-[380px] shrink-0 p-4 border-r border-green-900 bg-black flex flex-col gap-4 overflow-y-auto">

          {/* Test Case Selector */}
          <div>
            <label className="block mb-2 text-green-600 text-xs">/* select_test_case */</label>
            <select
              value={selectedCase}
              onChange={(e) => handleCaseChange(e.target.value)}
              disabled={isStepMode}
              className="w-full p-2 bg-black border border-green-800 text-green-400 font-mono text-xs outline-none cursor-pointer hover:border-green-500 focus:border-green-500 focus:shadow-[0_0_10px_rgba(0,255,0,0.3)] disabled:opacity-30"
            >
              {Object.entries(TEST_CASES).map(([id, testCase]) => (
                <option key={id} value={id} className="bg-black">
                  {testCase.name}
                </option>
              ))}
            </select>
            <p className="text-green-700 text-[10px] mt-1">
              # {TEST_CASES[selectedCase].description}
            </p>
          </div>

          <div>
            <label className="block mb-2 text-green-600 text-xs">/* input.json */</label>
            <textarea
              className="w-full h-28 p-3 rounded-none border border-green-800 font-mono text-xs resize-none outline-none bg-black text-green-400 focus:border-green-500 focus:shadow-[0_0_10px_rgba(0,255,0,0.3)]"
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              spellCheck="false"
              disabled={isStepMode}
            />
          </div>

          {/* Target Patent Input */}
          <div>
            <label className="block mb-2 text-green-600 text-xs">/* target_patent */</label>
            <div className="flex items-center gap-2">
              <span className="text-green-700 text-xs">start_node =</span>
              <input
                type="text"
                value={targetPatent}
                onChange={(e) => setTargetPatent(e.target.value)}
                disabled={isStepMode}
                className="flex-1 p-2 bg-black border border-green-800 text-green-400 font-mono text-xs outline-none focus:border-green-500 focus:shadow-[0_0_10px_rgba(0,255,0,0.3)] disabled:opacity-30"
                placeholder="1"
              />
            </div>
            <p className="text-green-700 text-[10px] mt-1">
              # DFS will start from this node
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={generateGraph}
              disabled={isStepMode}
              className="flex-1 py-2 px-3 bg-black border border-green-800 text-green-400 font-mono text-xs transition-all hover:bg-green-950 hover:border-green-500 hover:shadow-[0_0_10px_rgba(0,255,0,0.3)] disabled:opacity-30"
            >
              [load]
            </button>
            <button
              onClick={handleAnalyze}
              disabled={isStepMode}
              className="flex-1 py-2 px-3 bg-black border border-green-800 text-green-400 font-mono text-xs transition-all hover:bg-green-950 hover:border-green-500 hover:shadow-[0_0_10px_rgba(0,255,0,0.3)] disabled:opacity-30"
            >
              [run]
            </button>
          </div>

          <button
            onClick={isStepMode ? exitStepMode : handleStepByStep}
            className={`w-full py-2.5 px-4 font-mono text-xs transition-all border ${isStepMode
              ? 'bg-red-950 border-red-800 text-red-400 hover:bg-red-900'
              : 'bg-green-950 border-green-500 text-green-300 hover:shadow-[0_0_15px_rgba(0,255,0,0.5)]'
              }`}
          >
            {isStepMode ? '[exit debug]' : '[debug --step-by-step]'}
          </button>

          {/* Legend */}
          <div className="p-3 border border-green-900 bg-black">
            <div className="text-xs text-green-700 mb-2">/* color_map.c */</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-yellow-900 border border-yellow-500"></span>
                <span className="text-yellow-500">CURRENT</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-cyan-900 border border-cyan-500"></span>
                <span className="text-cyan-500">IN_STACK</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-green-900 border border-green-500"></span>
                <span className="text-green-500">VERIFIED</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-red-900 border border-red-500"></span>
                <span className="text-red-500">CYCLE!</span>
              </div>
            </div>
          </div>

          {/* Result Box */}
          {result && !result.hidden && (
            <div className={`p-3 border font-mono text-xs ${result.status === 'FAIL'
              ? 'border-red-800 bg-red-950 text-red-400'
              : 'border-green-800 bg-green-950 text-green-400'
              }`}>
              <div className="mb-1 flex justify-between items-center">
                <span>{result.status === 'FAIL' ? '> ERROR: ' : '> OK: '}</span>

                {result.status === 'FAIL' && result.cycleEdge && (
                  <div className="flex gap-2">
                    <button
                      onClick={previewFix}
                      className="px-2 py-0.5 bg-yellow-900 border border-yellow-500 text-white text-[10px] hover:bg-yellow-700 cursor-pointer uppercase tracking-wider font-bold"
                    >
                      [SHOW FIX]
                    </button>
                    <button
                      onClick={fixCycle}
                      className="px-2 py-0.5 bg-red-900 border border-red-500 text-white text-[10px] hover:bg-red-700 cursor-pointer animate-pulse uppercase tracking-wider font-bold"
                    >
                      [AUTO-FIX]
                    </button>
                  </div>
                )}
              </div>
              <div className="pl-2 text-[11px]">
                {result.message}
              </div>
            </div>
          )}
        </div>

        {/* Right Panel */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#050505]">
          {/* Graph Area */}
          <div className="flex-1">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              fitView
              attributionPosition="bottom-right"
              style={{ background: '#050505' }}
            >
              <Background color="#0f2f0f" gap={30} size={1} />
              <Controls />
            </ReactFlow>
          </div>

          {/* Step Panel */}
          {isStepMode && currentStep && (
            <div className="shrink-0 border-t border-green-900 bg-black text-green-400 p-4 font-mono">
              {/* Step Progress */}
              <div className="flex items-center justify-between mb-2 text-xs">
                <span className="text-green-700">
                  step[<span className="text-green-400">{currentStepIndex + 1}</span>/<span className="text-green-600">{steps.length}</span>]
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-green-800">--speed=</span>
                  <input
                    type="range"
                    min="200"
                    max="2000"
                    step="100"
                    value={2200 - autoPlaySpeed}
                    onChange={(e) => setAutoPlaySpeed(2200 - parseInt(e.target.value))}
                    className="w-16 h-1 accent-green-500 bg-green-900"
                  />
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-1 bg-green-950 mb-3 overflow-hidden">
                <div
                  className="h-full bg-green-500 transition-all duration-200"
                  style={{ width: `${((currentStepIndex + 1) / steps.length) * 100}%` }}
                />
              </div>

              {/* Terminal Output */}
              <div className={`p-2 mb-3 border text-xs ${currentStep.action === ACTION_TYPES.CYCLE_FOUND
                ? 'border-red-800 bg-red-950/30'
                : currentStep.action === ACTION_TYPES.MARK_SAFE || currentStep.action === ACTION_TYPES.COMPLETE
                  ? 'border-green-700 bg-green-950/30'
                  : 'border-green-900 bg-black'
                }`}>
                <span className={
                  currentStep.action === ACTION_TYPES.CYCLE_FOUND
                    ? 'text-red-400'
                    : 'text-green-400'
                }>
                  {currentStep.explanation}
                </span>
                <div className="text-green-800 text-[10px] mt-1"># {currentStep.explanationZh}</div>

                {/* Step Mode Fix Buttons */}
                {currentStep.action === ACTION_TYPES.CYCLE_FOUND && (
                  <div className="mt-3 flex gap-2 border-t border-red-900/50 pt-2">
                    <button
                      onClick={previewFix}
                      className="px-2 py-0.5 bg-yellow-900 border border-yellow-500 text-white text-[10px] hover:bg-yellow-700 cursor-pointer uppercase tracking-wider font-bold"
                    >
                      [SHOW FIX]
                    </button>
                    <button
                      onClick={fixCycle}
                      className="px-2 py-0.5 bg-red-900 border border-red-500 text-white text-[10px] hover:bg-red-700 cursor-pointer animate-pulse uppercase tracking-wider font-bold"
                    >
                      [AUTO-FIX]
                    </button>
                  </div>
                )}
              </div>

              {/* State Display */}
              <div className="grid grid-cols-2 gap-2 mb-3 text-[11px]">
                <div className="p-2 border border-green-900">
                  <span className="text-green-700">stack[] = </span>
                  <span className="text-cyan-400">[{[...currentStep.recursionStack].join(', ') || '∅'}]</span>
                </div>
                <div className="p-2 border border-green-900">
                  <span className="text-green-700">visited{'{}'} = </span>
                  <span className="text-green-400">{'{' + ([...currentStep.visited].join(', ') || '∅') + '}'}</span>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center justify-center gap-2 text-xs">
                <button
                  onClick={() => goToStep(0)}
                  disabled={currentStepIndex === 0}
                  className="px-2 py-1 border border-green-800 hover:bg-green-950 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  |&lt;
                </button>
                <button
                  onClick={prevStep}
                  disabled={currentStepIndex === 0}
                  className="px-3 py-1 border border-green-800 hover:bg-green-950 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  &lt;&lt;
                </button>
                <button
                  onClick={toggleAutoPlay}
                  className={`px-4 py-1 border ${isAutoPlaying
                    ? 'border-yellow-700 bg-yellow-950 text-yellow-400'
                    : 'border-green-500 bg-green-950 text-green-300'
                    }`}
                >
                  {isAutoPlaying ? '[pause]' : '[play]'}
                </button>
                <button
                  onClick={nextStep}
                  disabled={currentStepIndex >= steps.length - 1}
                  className="px-3 py-1 border border-green-800 hover:bg-green-950 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  &gt;&gt;
                </button>
                <button
                  onClick={() => goToStep(steps.length - 1)}
                  disabled={currentStepIndex >= steps.length - 1}
                  className="px-2 py-1 border border-green-800 hover:bg-green-950 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  &gt;|
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;