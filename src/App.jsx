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

  // ReactFlow instance ref for programmatic control
  const reactFlowInstance = useRef(null);

  const handleCaseChange = (caseId) => {
    setSelectedCase(caseId);
    setJsonInput(TEST_CASES[caseId].data);
    const firstKey = Object.keys(JSON.parse(TEST_CASES[caseId].data))[0];
    setTargetPatent(firstKey);
    setResult(null);
    setIsStepMode(false);
    setSteps([]);
    setCurrentStepIndex(-1);
  };

  const generateGraph = () => {
    try {
      const adjList = JSON.parse(jsonInput);
      const newNodes = [];
      const newEdges = [];

      const keys = Object.keys(adjList);

      const centerX = 300;
      const centerY = 250;
      const radius = 180;

      keys.forEach((key, index) => {
        const angle = (2 * Math.PI * index) / keys.length - Math.PI / 2;
        newNodes.push({
          id: key,
          data: { label: key },
          position: {
            x: centerX + radius * Math.cos(angle),
            y: centerY + radius * Math.sin(angle)
          },
          style: {
            background: '#FFFFFF',
            border: '1px solid #0F2C1F',
            borderRadius: '8px',
            minWidth: 60,
            width: 'auto',
            padding: '10px',
            textAlign: 'center',
            fontWeight: 600,
            fontSize: '14px',
            color: '#0F2C1F',
            boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
          }
        });

        if (adjList[key]) {
          adjList[key].forEach(target => {
            newEdges.push({
              id: `e${key}-${target}`,
              source: key,
              target: String(target),
              type: 'smoothstep',
              markerEnd: { type: MarkerType.ArrowClosed, color: '#9CA3AF' },
              animated: false,
              style: { stroke: '#9CA3AF', strokeWidth: 1.5 }
            });
          });
        }
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
          message: `Cycle detected in path: ${analysis.loopPath.join(' → ')}`,
          cycleEdge: analysis.cycleEdge
        });
        highlightGraph(analysis.loopPath);
      } else {
        setResult({
          status: 'PASS',
          message: 'All paths verified safe. No cycles found.'
        });
        resetGraphStyles();
      }
      setIsStepMode(false);
    } catch (error) {
      console.error(error);
      alert("Analysis failed");
    }
  };

  const handleStepByStep = () => {
    try {
      const adjList = JSON.parse(jsonInput);
      if (nodes.length === 0) generateGraph();

      const analysis = runDetectionWithSteps(adjList, targetPatent);

      if (analysis.error) {
        alert(analysis.error);
        return;
      }

      setSteps(analysis.steps);
      setCurrentStepIndex(0);
      setIsStepMode(true);
      setResult(null);

      // Fit view to show all nodes
      setTimeout(() => {
        if (reactFlowInstance.current) {
          reactFlowInstance.current.fitView({ padding: 0.2, duration: 300 });
        }
      }, 100);

      if (analysis.found && analysis.handled) {
        // Cycles were found but handled by skipping
        setResult({
          status: 'HANDLED',
          message: `Traversal complete. ${analysis.skippedEdges.length} cycle(s) detected and skipped.`,
          skippedEdges: analysis.skippedEdges,
          hidden: true
        });
      } else if (analysis.found) {
        setResult({
          status: 'FAIL',
          message: `Cycle detected`,
          hidden: true,
          cycleEdge: analysis.cycleEdge
        });
      }
    } catch (error) {
      console.error(error);
      alert("Step mode init failed");
    }
  };

  const fixCycle = () => {
    try {
      const currentData = JSON.parse(jsonInput);
      const { safeGraph, removedEdges } = removeCycles(currentData, targetPatent);

      if (removedEdges.length > 0) {
        const newJson = JSON.stringify(safeGraph, null, 2);
        setJsonInput(newJson);
        setIsStepMode(false);
        setResult(null);

        setTimeout(() => {
          const adjList = JSON.parse(newJson);
          // Re-generate basic visual nodes
          const newNodes = []; // Simplified for brevity, same as generateGraph logic
          const newEdges = [];
          const keys = Object.keys(adjList);
          const centerX = 400; const centerY = 200; const radius = 150;
          keys.forEach((key, index) => {
            const angle = (2 * Math.PI * index) / keys.length - Math.PI / 2;
            newNodes.push({
              id: key, data: { label: key },
              position: { x: centerX + radius * Math.cos(angle), y: centerY + radius * Math.sin(angle) },
              style: { background: '#FFFFFF', border: '1px solid #0F2C1F', borderRadius: '8px', minWidth: 60, width: 'auto', padding: '10px', textAlign: 'center', fontWeight: 600, fontSize: '14px', color: '#0F2C1F', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }
            });
            if (adjList[key]) {
              adjList[key].forEach(target => {
                newEdges.push({
                  id: `e${key}-${target}`, source: key, target: String(target), type: 'smoothstep',
                  markerEnd: { type: MarkerType.ArrowClosed, color: '#9CA3AF' },
                  animated: false, style: { stroke: '#9CA3AF', strokeWidth: 1.5 }
                });
              });
            }
          });
          setNodes(newNodes);
          setEdges(newEdges);

          const analysis = runDetection(adjList, targetPatent);
          if (!analysis.found) {
            const removedDesc = removedEdges.map(e => `${e.source}→${e.target}`).join(', ');
            setResult({
              status: 'PASS',
              message: `Algorithm resolved ${removedEdges.length} conflict(s): [${removedDesc}].`
            });
          }
        }, 100);
      } else {
        alert("No cycles to remove.");
      }
    } catch (e) {
      console.error(e);
      alert("Fix failed");
    }
  };

  const nextStep = () => currentStepIndex < steps.length - 1 && setCurrentStepIndex(currentStepIndex + 1);
  const prevStep = () => currentStepIndex > 0 && setCurrentStepIndex(currentStepIndex - 1);
  const goToStep = (index) => index >= 0 && index < steps.length && setCurrentStepIndex(index);
  const toggleAutoPlay = () => setIsAutoPlaying(!isAutoPlaying);

  useEffect(() => {
    if (isAutoPlaying && currentStepIndex < steps.length - 1) {
      autoPlayRef.current = setTimeout(() => setCurrentStepIndex(prev => prev + 1), autoPlaySpeed);
    } else if (currentStepIndex >= steps.length - 1) {
      setIsAutoPlaying(false);
    }
    return () => autoPlayRef.current && clearTimeout(autoPlayRef.current);
  }, [isAutoPlaying, currentStepIndex, steps, autoPlaySpeed]);

  useEffect(() => {
    if (!isStepMode || currentStepIndex < 0 || steps.length === 0) return;
    const step = steps[currentStepIndex];

    setNodes(nds => nds.map(node => {
      let style = {
        background: '#FFFFFF', border: '1px solid #0F2C1F', borderRadius: '8px',
        minWidth: 60, width: 'auto',
        padding: '10px', textAlign: 'center', fontWeight: 600, fontSize: '14px', color: '#0F2C1F',
        transition: 'all 0.3s ease', boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
      };

      if (step.action === ACTION_TYPES.CYCLE_FOUND && step.pathStack.includes(node.id)) {
        const cycleStartIndex = step.pathStack.indexOf(step.cycleNode);
        const isInCycle = step.pathStack.indexOf(node.id) >= cycleStartIndex || node.id === step.cycleNode;
        if (isInCycle) {
          style = { ...style, background: '#FEF2F2', border: '2px solid #EF4444', color: '#B91C1C', boxShadow: '0 0 15px rgba(239, 68, 68, 0.2)' };
        }
      }
      else if (node.id === step.node && step.action !== ACTION_TYPES.START && step.action !== ACTION_TYPES.COMPLETE) {
        style = { ...style, background: '#F0FDF4', border: '2px solid #59A645', color: '#166534' };
      }
      else if (step.recursionStack.has(node.id)) {
        style = { ...style, background: '#EFF6FF', border: '2px solid #3B82F6', color: '#1E40AF' };
      }
      else if (step.visited.has(node.id)) {
        style = { ...style, opacity: 0.7, background: '#F9FAFB', border: '1px dashed #9CA3AF', color: '#6B7280' };
      }
      return { ...node, style };
    }));

    setEdges(eds => eds.map(edge => {
      let style = { stroke: '#D1D5DB', strokeWidth: 1.5 };
      let animated = false;
      const pathStack = step.pathStack;
      for (let i = 0; i < pathStack.length - 1; i++) {
        if (pathStack[i] === edge.source && pathStack[i + 1] === edge.target) {
          style = { stroke: '#3B82F6', strokeWidth: 2.5 };
          animated = true;
          break;
        }
      }
      if (step.action === ACTION_TYPES.EXPLORE_NEIGHBOR && step.node === edge.source && step.targetNeighbor === edge.target) {
        style = { stroke: '#F59E0B', strokeWidth: 2.5 };
        animated = true;
      }
      if (step.action === ACTION_TYPES.CYCLE_FOUND) {
        const cycleNode = step.cycleNode;
        const cycleStartIndex = step.pathStack.indexOf(cycleNode);
        const cyclePath = [...step.pathStack.slice(cycleStartIndex), cycleNode];
        for (let i = 0; i < cyclePath.length - 1; i++) {
          if (cyclePath[i] === edge.source && cyclePath[i + 1] === edge.target) {
            style = { stroke: '#EF4444', strokeWidth: 3 };
            animated = true;
            break;
          }
        }
      }
      // Show skipped edge in blue with dashed line
      if (step.action === ACTION_TYPES.SKIP_CYCLE && step.skippedEdge) {
        if (edge.source === String(step.skippedEdge.source) && edge.target === String(step.skippedEdge.target)) {
          style = { stroke: '#3B82F6', strokeWidth: 3, strokeDasharray: '5,5' };
          animated = true;
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
        setResult({
          status: 'FAIL',
          message: `Preview Removal: ${removedEdges.length} edge(s) will be deleted.`,
          cycleEdge: result && result.cycleEdge,
          previewEdges: removedEdges,
          hidden: false
        });
        setEdges(eds => eds.map(edge => {
          const isRemoved = removedEdges.some(re => String(re.source) === String(edge.source) && String(re.target) === String(edge.target));
          if (isRemoved) {
            return {
              ...edge, animated: true,
              style: { stroke: '#EC4899', strokeWidth: 3, strokeDasharray: '5,5', opacity: 0.8 },
              label: 'TO DELETE', labelStyle: { fill: '#EC4899', fontWeight: 700 }
            };
          }
          return { ...edge, style: { ...edge.style, opacity: 0.3 } };
        }));
        setNodes(nds => nds.map(node => ({ ...node, style: { ...node.style, opacity: 0.5 } })));
      } else {
        alert("No conflicts to fix.");
      }
    } catch (e) { console.error(e); alert("Preview failed"); }
  };

  const resetGraphStyles = () => {
    setNodes((nds) => nds.map((node) => ({
      ...node,
      style: { background: '#FFFFFF', border: '1px solid #0F2C1F', borderRadius: '8px', width: 60, padding: '10px', textAlign: 'center', fontWeight: 600, fontSize: '14px', color: '#0F2C1F', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', opacity: 1 }
    })));
    setEdges((eds) => eds.map((edge) => ({
      ...edge, animated: false, label: '', labelStyle: undefined,
      style: { stroke: '#9CA3AF', strokeWidth: 1.5, opacity: 1 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#9CA3AF' }
    })));
  };

  const highlightGraph = (loopPath) => {
    setNodes((nds) => nds.map((node) => {
      if (loopPath.includes(node.id)) {
        return {
          ...node,
          style: { ...node.style, background: '#FEF2F2', border: '2px solid #EF4444', color: '#B91C1C', boxShadow: '0 0 10px rgba(239, 68, 68, 0.3)', opacity: 1 }
        };
      }
      return { ...node, style: { ...node.style, opacity: 0.3 } };
    }));
    setEdges((eds) => eds.map((edge) => {
      let isInLoop = false;
      for (let i = 0; i < loopPath.length - 1; i++) {
        if (loopPath[i] === edge.source && loopPath[i + 1] === edge.target) isInLoop = true; break;
      }
      if (isInLoop) {
        return { ...edge, animated: true, style: { stroke: '#EF4444', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#EF4444' } };
      }
      return { ...edge, style: { stroke: '#E5E7EB' }, markerEnd: { type: MarkerType.ArrowClosed, color: '#E5E7EB' } };
    }));
  };

  const exitStepMode = () => { setIsStepMode(false); setSteps([]); setCurrentStepIndex(-1); setIsAutoPlaying(false); generateGraph(); };
  const onNodesChange = useCallback((changes) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);

  const currentStep = isStepMode && currentStepIndex >= 0 ? steps[currentStepIndex] : null;

  return (
    <div className="flex flex-col h-screen w-screen bg-[var(--bg-cream)] font-sans text-[var(--text-dark)]">
      {/* Navbar Header */}
      <div className="h-16 px-8 flex items-center justify-between bg-[var(--bg-cream)] border-b border-[var(--card-border)]">
        <div className="flex items-center gap-3">
          {/* Logo Icon */}
          <div className="w-8 h-8 bg-[var(--green-dark)] rounded flex items-center justify-center">
            <span className="text-white font-serif font-bold text-xl">P</span>
          </div>
          <h1 className="text-2xl font-serif text-[var(--text-dark)] tracking-tight">Patlytics <span className="text-[var(--text-muted)] font-sans text-sm font-normal ml-2">Internal Tool / Dependency Validator</span></h1>
        </div>
        <div className="flex gap-4 text-sm font-medium text-[var(--text-muted)]">
          {/* <span className="hover:text-[var(--green-accent)] cursor-pointer">Documentation</span>
          <span className="hover:text-[var(--green-accent)] cursor-pointer">Support</span> */}
          <span className="w-8 h-8 rounded-full bg-[var(--green-dark)] text-white flex items-center justify-center text-xs">JD</span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden p-6 gap-6">
        {/* Left Panel: Controls */}
        <div className="w-[400px] flex flex-col gap-6 shrink-0 overflow-y-auto">

          <div className="bg-[var(--card-white)] rounded-xl shadow-sm border border-[var(--card-border)] p-5">
            <h2 className="text-lg font-serif mb-4 flex items-center gap-2">
              <span className="w-1 h-6 bg-[var(--green-accent)] rounded-full"></span>
              Test Configuration
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Use Case</label>
                <select
                  value={selectedCase}
                  onChange={(e) => handleCaseChange(e.target.value)}
                  disabled={isStepMode}
                  className="w-full p-2.5 bg-white border border-[var(--card-border)] rounded-md text-sm outline-none focus:border-[var(--green-accent)] focus:ring-1 ring-[var(--green-accent)]/20"
                >
                  {Object.entries(TEST_CASES).map(([id, testCase]) => (
                    <option key={id} value={id}>{testCase.name}</option>
                  ))}
                </select>
                <p className="text-xs text-[var(--text-muted)] mt-1.5">{TEST_CASES[selectedCase].description}</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Graph Data (JSON)</label>
                <textarea
                  className="w-full h-32 p-3 rounded-md border border-[var(--card-border)] text-sm font-mono resize-none focus:border-[var(--green-accent)] focus:ring-1 ring-[var(--green-accent)]/20"
                  value={jsonInput}
                  onChange={(e) => setJsonInput(e.target.value)}
                  spellCheck="false"
                  disabled={isStepMode}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Start Node</label>
                <input
                  type="text"
                  value={targetPatent}
                  onChange={(e) => setTargetPatent(e.target.value)}
                  disabled={isStepMode}
                  className="w-full p-2.5 rounded-md border border-[var(--card-border)] text-sm focus:border-[var(--green-accent)] focus:ring-1 ring-[var(--green-accent)]/20"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={generateGraph} disabled={isStepMode} className="flex-1 secondary bg-white border border-[var(--card-border)] text-[var(--text-dark)] hover:border-[var(--green-accent)] hover:text-[var(--green-accent)]">Load Graph</button>
                <button onClick={handleAnalyze} disabled={isStepMode} className="flex-1">Detailed Analysis</button>
              </div>
            </div>
          </div>

          <div className="bg-[var(--card-white)] rounded-xl shadow-sm border border-[var(--card-border)] p-5">
            <h2 className="text-lg font-serif mb-4 flex items-center gap-2">
              <span className="w-1 h-6 bg-[var(--green-dark)] rounded-full"></span>
              Actions
            </h2>
            <button
              onClick={isStepMode ? exitStepMode : handleStepByStep}
              className={`w-full py-3 font-medium transition-all ${isStepMode
                ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
                : 'bg-[var(--green-dark)] text-white hover:bg-black shadow-md'
                }`}
            >
              {isStepMode ? 'Exit Debug Mode' : 'Start Step-by-Step Visualization'}
            </button>
          </div>

          {/* Result Box */}
          {result && !result.hidden && (
            <div className={`p-4 rounded-xl border-l-4 shadow-sm ${result.status === 'FAIL'
              ? 'bg-red-50 border-red-500 text-red-800'
              : result.status === 'HANDLED'
                ? 'bg-blue-50 border-blue-500 text-blue-800'
                : 'bg-green-50 border-green-500 text-green-800'
              }`}>
              <div>
                <span className="font-bold block mb-1">
                  {result.status === 'FAIL' ? 'Issue Detected' :
                    result.status === 'HANDLED' ? 'Cycles Handled ✓' : 'Validation Passed'}
                </span>
                <p className="text-sm opacity-90">{result.message}</p>
                {result.status === 'HANDLED' && result.skippedEdges && (
                  <div className="mt-2 text-xs font-mono bg-white/50 rounded p-2">
                    Skipped edges: {result.skippedEdges.map(e => `${e.source}→${e.target}`).join(', ')}
                  </div>
                )}
              </div>
            </div>
          )}


        </div>

        {/* Right Panel: Graph & Steps */}
        <div className="flex-1 flex flex-col min-w-0 bg-[var(--card-white)] rounded-xl shadow-sm border border-[var(--card-border)] overflow-hidden relative">

          <div className="absolute top-4 right-4 z-10 flex gap-4 pointer-events-none">
            <div className="flex items-center gap-2 bg-white/90 backdrop-blur px-3 py-1.5 rounded-full border border-[var(--card-border)] shadow-sm">
              <div className="w-2.5 h-2.5 rounded-full bg-[var(--green-accent)]"></div>
              <span className="text-xs font-medium text-[var(--text-muted)]">Current</span>
            </div>
            <div className="flex items-center gap-2 bg-white/90 backdrop-blur px-3 py-1.5 rounded-full border border-[var(--card-border)] shadow-sm">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div>
              <span className="text-xs font-medium text-[var(--text-muted)]">In Stack</span>
            </div>
            <div className="flex items-center gap-2 bg-white/90 backdrop-blur px-3 py-1.5 rounded-full border border-[var(--card-border)] shadow-sm">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
              <span className="text-xs font-medium text-[var(--text-muted)]">Cycle</span>
            </div>
          </div>

          {/* Graph Area */}
          <div className="flex-1 bg-[var(--card-white)]">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onInit={(instance) => { reactFlowInstance.current = instance; }}
              fitView
              attributionPosition="bottom-left"
            >
              <Background gap={20} size={1} color="#E5E7EB" />
              <Controls showInteractive={false} />
            </ReactFlow>
          </div>


          {/* Step Control Panel (Floating or Bottom) */}
          {isStepMode && currentStep && (
            <div className="bg-white border-t border-[var(--card-border)] p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
              {/* Progress */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-[var(--green-dark)] font-serif">
                    Step {currentStepIndex + 1} of {steps.length}
                  </span>
                  <div className="h-1.5 w-32 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-[var(--green-accent)] transition-all duration-300" style={{ width: `${((currentStepIndex + 1) / steps.length) * 100}%` }}></div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                  <span>Speed</span>
                  <input type="range" min="200" max="2000" step="100" value={2200 - autoPlaySpeed} onChange={(e) => setAutoPlaySpeed(2200 - parseInt(e.target.value))} className="w-20 accent-[var(--green-dark)]" />
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-1 bg-[var(--bg-cream)] rounded-lg p-3 border border-[var(--card-border)]">
                  <p className={`text-sm font-medium ${currentStep.action === ACTION_TYPES.CYCLE_FOUND ? 'text-red-700' : 'text-[var(--text-dark)]'}`}>
                    {currentStep.explanation}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">{currentStep.explanationZh}</p>

                  {/* Step Mode: Show skip info for SKIP_CYCLE action */}
                  {currentStep.action === ACTION_TYPES.SKIP_CYCLE && currentStep.skippedEdge && (
                    <div className="mt-3 pt-2 border-t border-gray-200">
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold rounded">
                        ✓ SKIPPED: {currentStep.skippedEdge.source} → {currentStep.skippedEdge.target}
                      </div>
                    </div>
                  )}

                </div>

                <div className="shrink-0 flex items-center gap-2">
                  <button onClick={() => goToStep(0)} disabled={currentStepIndex === 0} className="p-2 bg-white border border-gray-200 rounded hover:bg-gray-50 text-gray-600 disabled:opacity-30">⏮</button>
                  <button onClick={prevStep} disabled={currentStepIndex === 0} className="px-4 py-2 bg-white border border-gray-200 rounded hover:bg-gray-50 text-gray-700 font-medium disabled:opacity-30">Previous</button>
                  <button onClick={toggleAutoPlay} className={`w-24 py-2 rounded font-medium ${isAutoPlaying ? 'bg-yellow-100 text-yellow-800 border-yellow-200' : 'bg-[var(--green-dark)] text-white shadow-sm hover:bg-black'}`}>
                    {isAutoPlaying ? 'Pause' : 'Play'}
                  </button>
                  <button onClick={nextStep} disabled={currentStepIndex >= steps.length - 1} className="px-4 py-2 bg-white border border-gray-200 rounded hover:bg-gray-50 text-gray-700 font-medium disabled:opacity-30">Next</button>
                  <button onClick={() => goToStep(steps.length - 1)} disabled={currentStepIndex >= steps.length - 1} className="p-2 bg-white border border-gray-200 rounded hover:bg-gray-50 text-gray-600 disabled:opacity-30">⏭</button>
                </div>
              </div>
            </div>
          )}
        </div>
        {/* Traversal Log Panel - Shows during/after step mode */}
        {isStepMode && steps.length > 0 && (
          <div className="bg-[var(--card-white)] rounded-xl shadow-sm border border-[var(--card-border)] p-4 flex flex-col w-[300px]">
            <h3 className="text-sm font-serif font-semibold mb-2 flex items-center gap-2">
              <span className="w-1 h-4 bg-purple-500 rounded-full"></span>
              Traversal Log
            </h3>

            {/* Infringement Summary */}
            {result && result.skippedEdges && result.skippedEdges.length > 0 && (
              <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-xs">
                <div className="font-bold text-red-700 mb-1">⚠ Infringement Detected:</div>
                {(() => {
                  // Group skipped edges by source (key)
                  const infringementMap = {};
                  result.skippedEdges.forEach(edge => {
                    if (!infringementMap[edge.source]) {
                      infringementMap[edge.source] = [];
                    }
                    infringementMap[edge.source].push(edge.target);
                  });
                  return Object.entries(infringementMap).map(([key, values]) => (
                    <div key={key} className="text-red-600 font-mono">
                      Key "<span className="font-bold">{key}</span>" → Infringing values: [{values.join(', ')}]
                    </div>
                  ));
                })()}
              </div>
            )}

            {/* Variable State Display */}
            {currentStepIndex >= 0 && steps[currentStepIndex] && (
              <div className="mb-3 p-2 bg-gray-100 rounded text-xs font-mono border">
                <div className="font-bold text-gray-700 mb-2">📊 Variable State @ Step {currentStepIndex + 1}:</div>
                <div className="space-y-1">
                  <div className="flex items-start gap-2">
                    <span className="text-purple-600 font-semibold w-28 shrink-0">pathStack:</span>
                    <span className="text-gray-700">[{steps[currentStepIndex].pathStack.join(' → ')}]</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-blue-600 font-semibold w-28 shrink-0">recursionStack:</span>
                    <span className="text-gray-700">{`{${[...steps[currentStepIndex].recursionStack].join(', ')}}`}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-green-600 font-semibold w-28 shrink-0">visited:</span>
                    <span className="text-gray-700">{`{${[...steps[currentStepIndex].visited].join(', ')}}`}</span>
                  </div>
                  {steps[currentStepIndex].node && (
                    <div className="flex items-start gap-2">
                      <span className="text-orange-600 font-semibold w-28 shrink-0">currentNode:</span>
                      <span className="text-gray-700 font-bold">{steps[currentStepIndex].node}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step Log List */}
            <div className="flex-1 overflow-y-auto text-xs font-mono space-y-1 bg-gray-50 rounded p-2 border">
              {steps.map((step, index) => (
                <div
                  key={index}
                  className={`p-1 rounded cursor-pointer transition-all ${index === currentStepIndex
                    ? 'bg-blue-100 border-l-2 border-blue-500 font-bold'
                    : step.action === ACTION_TYPES.CYCLE_FOUND
                      ? 'bg-red-50 text-red-700'
                      : step.action === ACTION_TYPES.SKIP_CYCLE
                        ? 'bg-blue-50 text-blue-700'
                        : step.action === ACTION_TYPES.COMPLETE
                          ? 'bg-green-50 text-green-700'
                          : 'hover:bg-gray-100'
                    }`}
                  onClick={() => goToStep(index)}
                >
                  <span className="text-gray-400 mr-2">{String(index + 1).padStart(2, '0')}.</span>
                  {step.explanation}
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default App;