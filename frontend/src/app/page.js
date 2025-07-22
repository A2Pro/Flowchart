'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';

const API_BASE = 'http://localhost:5000/api';

export default function FlowchartPage() {
  const [nodes, setNodes] = useState([]);
  const [connections, setConnections] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStart, setConnectionStart] = useState(null);
  const [connectionStartHandle, setConnectionStartHandle] = useState(null);
  const [currentMousePos, setCurrentMousePos] = useState({ x: 0, y: 0 });
  const [dragPreview, setDragPreview] = useState(null);
  const [editingNode, setEditingNode] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, width: 1200, height: 800 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  const [isDraggingFromToolbar, setIsDraggingFromToolbar] = useState(false);
  const [toolbarDragType, setToolbarDragType] = useState(null);
  const svgRef = useRef(null);
  const [nodeIdCounter, setNodeIdCounter] = useState(1);
  const [currentFlowchartId, setCurrentFlowchartId] = useState(null);
  const [flowchartName, setFlowchartName] = useState('Untitled Flowchart');
  const [isSaving, setIsSaving] = useState(false);
  const [savedFlowcharts, setSavedFlowcharts] = useState([]);
  const [showLoadDialog, setShowLoadDialog] = useState(false);

  const nodeTypes = {
    rectangle: { shape: 'rect', defaultWidth: 120, defaultHeight: 60 },
    circle: { shape: 'ellipse', defaultWidth: 100, defaultHeight: 100 },
    diamond: { shape: 'polygon', defaultWidth: 120, defaultHeight: 80 }
  };

  // Consistent coordinate transformation functions
  const screenToSvg = useCallback((clientX, clientY) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (viewBox.width / rect.width) + viewBox.x,
      y: (clientY - rect.top) * (viewBox.height / rect.height) + viewBox.y
    };
  }, [viewBox]);

  const createNode = (type, x, y) => {
    const nodeType = nodeTypes[type];
    const newNode = {
      id: `node-${nodeIdCounter}`,
      type,
      x: x - nodeType.defaultWidth / 2,
      y: y - nodeType.defaultHeight / 2,
      width: nodeType.defaultWidth,
      height: nodeType.defaultHeight,
      text: '', // Start with empty text
      color: '#3b82f6',
      textColor: '#ffffff',
      borderColor: '#1e40af',
      borderWidth: 2
    };
    setNodes([...nodes, newNode]);
    setNodeIdCounter(nodeIdCounter + 1);
    
    // Auto-start text editing for new nodes
    setTimeout(() => {
      setEditingNode(newNode.id);
      setEditingText('');
    }, 50);
  };

  const updateNode = (id, updates) => {
    setNodes(nodes.map(node => node.id === id ? { ...node, ...updates } : node));
  };

  const deleteNode = (id) => {
    setNodes(nodes.filter(node => node.id !== id));
    setConnections(connections.filter(conn => conn.from !== id && conn.to !== id));
    setSelectedNode(null);
  };

  const createConnection = (fromId, toId, fromHandle = null, toHandle = null) => {
    if (fromId === toId) return;
    const existingConnection = connections.find(
      conn => (conn.from === fromId && conn.to === toId) || (conn.from === toId && conn.to === fromId)
    );
    if (existingConnection) return;

    const newConnection = {
      id: `conn-${Date.now()}`,
      from: fromId,
      to: toId,
      fromHandle,
      toHandle,
      color: '#374151',
      width: 2,
      arrowSize: 8
    };
    setConnections([...connections, newConnection]);
  };

  const deleteConnection = (id) => {
    setConnections(connections.filter(conn => conn.id !== id));
  };

  const getNodeCenter = (node) => ({
    x: node.x + node.width / 2,
    y: node.y + node.height / 2
  });

  const getNodeHandles = (node) => {
    const cx = node.x + node.width / 2;
    const cy = node.y + node.height / 2;
    
    if (node.type === 'circle') {
      const rx = node.width / 2;
      const ry = node.height / 2;
      return {
        top: { x: cx, y: node.y, id: 'top' },
        right: { x: node.x + node.width, y: cy, id: 'right' },
        bottom: { x: cx, y: node.y + node.height, id: 'bottom' },
        left: { x: node.x, y: cy, id: 'left' }
      };
    } else if (node.type === 'diamond') {
      return {
        top: { x: cx, y: node.y, id: 'top' },
        right: { x: node.x + node.width, y: cy, id: 'right' },
        bottom: { x: cx, y: node.y + node.height, id: 'bottom' },
        left: { x: node.x, y: cy, id: 'left' }
      };
    } else {
      return {
        top: { x: cx, y: node.y, id: 'top' },
        right: { x: node.x + node.width, y: cy, id: 'right' },
        bottom: { x: cx, y: node.y + node.height, id: 'bottom' },
        left: { x: node.x, y: cy, id: 'left' }
      };
    }
  };

  const getHandlePosition = (node, handleId) => {
    const handles = getNodeHandles(node);
    return handles[handleId];
  };

  const getConnectionPath = (from, to, connection = null) => {
    const fromNode = nodes.find(n => n.id === from);
    const toNode = nodes.find(n => n.id === to);
    if (!fromNode || !toNode) return '';

    let fromPoint, toPoint;
    
    if (connection?.fromHandle && connection?.toHandle) {
      fromPoint = getHandlePosition(fromNode, connection.fromHandle);
      toPoint = getHandlePosition(toNode, connection.toHandle);
    } else {
      const fromCenter = getNodeCenter(fromNode);
      const toCenter = getNodeCenter(toNode);
      fromPoint = getNodeEdgePoint(fromNode, toCenter);
      toPoint = getNodeEdgePoint(toNode, fromCenter);
    }
    
    return `M ${fromPoint.x} ${fromPoint.y} L ${toPoint.x} ${toPoint.y}`;
  };

  const getNodeEdgePoint = (node, targetPoint) => {
    const center = getNodeCenter(node);
    const dx = targetPoint.x - center.x;
    const dy = targetPoint.y - center.y;
    
    if (node.type === 'circle') {
      const radius = Math.min(node.width, node.height) / 2;
      const distance = Math.sqrt(dx * dx + dy * dy);
      return {
        x: center.x + (dx / distance) * radius,
        y: center.y + (dy / distance) * radius
      };
    } else if (node.type === 'diamond') {
      const halfW = node.width / 2;
      const halfH = node.height / 2;
      const slope = Math.abs(dy / dx);
      const ratio = halfH / halfW;
      
      if (slope <= ratio) {
        const edgeY = center.y + (dx > 0 ? 1 : -1) * halfH * slope;
        return { x: center.x + (dx > 0 ? halfW : -halfW), y: edgeY };
      } else {
        const edgeX = center.x + (dy > 0 ? 1 : -1) * halfW / slope;
        return { x: edgeX, y: center.y + (dy > 0 ? halfH : -halfH) };
      }
    } else {
      const halfW = node.width / 2;
      const halfH = node.height / 2;
      
      if (Math.abs(dx) / halfW > Math.abs(dy) / halfH) {
        return {
          x: center.x + (dx > 0 ? halfW : -halfW),
          y: center.y + dy * (halfW / Math.abs(dx))
        };
      } else {
        return {
          x: center.x + dx * (halfH / Math.abs(dy)),
          y: center.y + (dy > 0 ? halfH : -halfH)
        };
      }
    }
  };

  const getArrowPath = (connection) => {
    const fromNode = nodes.find(n => n.id === connection.from);
    const toNode = nodes.find(n => n.id === connection.to);
    if (!fromNode || !toNode) return '';

    let toPoint;
    if (connection.toHandle) {
      toPoint = getHandlePosition(toNode, connection.toHandle);
    } else {
      const fromCenter = getNodeCenter(fromNode);
      toPoint = getNodeEdgePoint(toNode, fromCenter);
    }
    
    let fromPoint;
    if (connection.fromHandle) {
      fromPoint = getHandlePosition(fromNode, connection.fromHandle);
    } else {
      const toCenter = getNodeCenter(toNode);
      fromPoint = getNodeEdgePoint(fromNode, toCenter);
    }
    
    const dx = fromPoint.x - toPoint.x;
    const dy = fromPoint.y - toPoint.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance === 0) return '';
    
    const unitX = dx / distance;
    const unitY = dy / distance;
    
    const arrowSize = connection.arrowSize;
    const point1 = {
      x: toPoint.x + unitX * arrowSize - unitY * arrowSize * 0.5,
      y: toPoint.y + unitY * arrowSize + unitX * arrowSize * 0.5
    };
    const point2 = {
      x: toPoint.x + unitX * arrowSize + unitY * arrowSize * 0.5,
      y: toPoint.y + unitY * arrowSize - unitX * arrowSize * 0.5
    };
    
    return `M ${toPoint.x} ${toPoint.y} L ${point1.x} ${point1.y} L ${point2.x} ${point2.y} Z`;
  };

  const handleMouseDown = (e, node) => {
    e.stopPropagation();
    
    if (e.detail === 2) { // Double click
      // Finish any existing edit session first
      if (editingNode && editingNode !== node.id) {
        finishTextEdit();
      }
      
      // Start new edit session
      setTimeout(() => {
        startTextEdit(node);
      }, 10);
      return;
    }

    setSelectedNode(node);
    setIsDragging(true);
    const svgPoint = screenToSvg(e.clientX, e.clientY);
    setDragOffset({
      x: svgPoint.x - node.x,
      y: svgPoint.y - node.y
    });
  };

  const handleHandleMouseDown = (e, node, handleId) => {
    e.stopPropagation();
    setIsConnecting(true);
    setConnectionStart(node.id);
    setConnectionStartHandle(handleId);
  };

  const startTextEdit = (node) => {
    setEditingNode(node.id);
    setEditingText(node.text || ''); // Ensure we start with the current text or empty string
  };

  const finishTextEdit = () => {
    if (editingNode) {
      updateNode(editingNode, { text: editingText });
      setEditingNode(null);
      setEditingText(''); // Clear the editing text
    }
  };

  const handleTextEditKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      finishTextEdit();
    } else if (e.key === 'Escape') {
      setEditingNode(null);
      setEditingText(''); // Clear on escape
    }
    // Allow all other keys including backspace/delete to work normally
  };

  const findNearestHandle = (x, y, excludeNodeId = null) => {
    const snapDistance = 20;
    let nearest = null;
    let minDistance = snapDistance;

    nodes.forEach(node => {
      if (node.id === excludeNodeId) return;
      
      const handles = getNodeHandles(node);
      Object.values(handles).forEach(handle => {
        const distance = Math.sqrt(
          Math.pow(handle.x - x, 2) + Math.pow(handle.y - y, 2)
        );
        if (distance < minDistance) {
          nearest = { nodeId: node.id, handleId: handle.id, ...handle };
          minDistance = distance;
        }
      });
    });

    return nearest;
  };

  const handleMouseMove = useCallback((e) => {
    if (!svgRef.current) return;
    
    const svgPoint = screenToSvg(e.clientX, e.clientY);
    setCurrentMousePos(svgPoint);

    if (isDraggingFromToolbar && toolbarDragType) {
      setDragPreview({ x: e.clientX, y: e.clientY, type: toolbarDragType });
    } else if (isDragging && selectedNode) {
      updateNode(selectedNode.id, {
        x: svgPoint.x - dragOffset.x,
        y: svgPoint.y - dragOffset.y
      });
    } else if (isPanning) {
      const deltaX = (e.clientX - lastMousePos.x) * (viewBox.width / svgRef.current.getBoundingClientRect().width);
      const deltaY = (e.clientY - lastMousePos.y) * (viewBox.height / svgRef.current.getBoundingClientRect().height);
      setViewBox(prev => ({
        ...prev,
        x: prev.x - deltaX,
        y: prev.y - deltaY
      }));
      setLastMousePos({ x: e.clientX, y: e.clientY });
    }
  }, [isDragging, selectedNode, dragOffset, isPanning, lastMousePos, viewBox, isDraggingFromToolbar, toolbarDragType, screenToSvg]);

  const handleMouseUp = useCallback((e) => {
    if (isDraggingFromToolbar && toolbarDragType && svgRef.current) {
      const svgPoint = screenToSvg(e.clientX, e.clientY);
      
      // Only create node if dropped on canvas
      if (e.target === svgRef.current || e.target.closest('svg') === svgRef.current) {
        createNode(toolbarDragType, svgPoint.x, svgPoint.y);
      }
    } else if (isConnecting && connectionStart) {
      // Use current mouse position for connection detection
      const nearest = findNearestHandle(currentMousePos.x, currentMousePos.y, connectionStart);
      if (nearest) {
        createConnection(connectionStart, nearest.nodeId, connectionStartHandle, nearest.handleId);
      }
      
      setIsConnecting(false);
      setConnectionStart(null);
      setConnectionStartHandle(null);
    }
    
    setIsDragging(false);
    setIsPanning(false);
    setIsDraggingFromToolbar(false);
    setToolbarDragType(null);
    setDragPreview(null);
  }, [isDraggingFromToolbar, toolbarDragType, isConnecting, connectionStart, connectionStartHandle, currentMousePos, screenToSvg]);

  const handleSvgMouseDown = (e) => {
    if (e.target === svgRef.current) {
      // Finish any active text editing when clicking outside
      if (editingNode) {
        finishTextEdit();
      }
      
      setSelectedNode(null);
      setIsConnecting(false);
      setConnectionStart(null);
      setConnectionStartHandle(null);
      
      if (e.ctrlKey || e.metaKey) {
        setIsPanning(true);
        setLastMousePos({ x: e.clientX, y: e.clientY });
      }
    }
  };

  const handleSvgDoubleClick = (e) => {
    if (e.target === svgRef.current) {
      const svgPoint = screenToSvg(e.clientX, e.clientY);
      createNode('rectangle', svgPoint.x, svgPoint.y);
    }
  };

  const handleWheel = (e) => {
    e.preventDefault();
    
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Calculate the SVG point under the mouse before zoom
    const svgX = mouseX * (viewBox.width / rect.width) + viewBox.x;
    const svgY = mouseY * (viewBox.height / rect.height) + viewBox.y;
    
    // Calculate new zoom
    const delta = e.deltaY > 0 ? 1.1 : 0.9;
    const newZoom = Math.min(Math.max(zoom * delta, 0.1), 5);
    const scale = newZoom / zoom;
    
    // Calculate new viewBox dimensions
    const newWidth = viewBox.width * delta;
    const newHeight = viewBox.height * delta;
    
    // Calculate new viewBox position to keep the point under the mouse stationary
    const newX = svgX - mouseX * (newWidth / rect.width);
    const newY = svgY - mouseY * (newHeight / rect.height);
    
    setViewBox({
      x: newX,
      y: newY,
      width: newWidth,
      height: newHeight
    });
    setZoom(newZoom);
  };

  const handleToolbarMouseDown = (e, type) => {
    e.preventDefault();
    setIsDraggingFromToolbar(true);
    setToolbarDragType(type);
    setDragPreview({ x: e.clientX, y: e.clientY, type });
  };

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const renderNode = (node) => {
    const isSelected = selectedNode?.id === node.id;
    const isHovered = hoveredNode === node.id;
    const isEditing = editingNode === node.id;
    
    let shape;
    if (node.type === 'rectangle') {
      shape = (
        <rect
          x={node.x}
          y={node.y}
          width={node.width}
          height={node.height}
          fill={node.color}
          stroke={node.borderColor}
          strokeWidth={node.borderWidth}
          rx="4"
        />
      );
    } else if (node.type === 'circle') {
      shape = (
        <ellipse
          cx={node.x + node.width / 2}
          cy={node.y + node.height / 2}
          rx={node.width / 2}
          ry={node.height / 2}
          fill={node.color}
          stroke={node.borderColor}
          strokeWidth={node.borderWidth}
        />
      );
    } else if (node.type === 'diamond') {
      const cx = node.x + node.width / 2;
      const cy = node.y + node.height / 2;
      const points = `${cx},${node.y} ${node.x + node.width},${cy} ${cx},${node.y + node.height} ${node.x},${cy}`;
      shape = (
        <polygon
          points={points}
          fill={node.color}
          stroke={node.borderColor}
          strokeWidth={node.borderWidth}
        />
      );
    }

    const handles = getNodeHandles(node);

    return (
      <g key={node.id}>
        {shape}
        
        {/* Text or text input */}
        {isEditing ? (
          <foreignObject
            x={node.x}
            y={node.y}
            width={node.width}
            height={node.height}
          >
            <input
              type="text"
              value={editingText}
              onChange={(e) => {
                const newText = e.target.value;
                setEditingText(newText);
                // Auto-resize node based on text length
                const textLength = newText.length;
                if (textLength > 0) {
                  const newWidth = Math.max(nodeTypes[node.type].defaultWidth, textLength * 8 + 20);
                  updateNode(node.id, { width: newWidth });
                }
              }}
              onBlur={finishTextEdit}
              onKeyDown={handleTextEditKeyDown}
              autoFocus
              style={{
                width: '100%',
                height: '100%',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                textAlign: 'center',
                fontSize: '14px',
                fontWeight: '500',
                color: node.textColor,
                fontFamily: 'inherit'
              }}
              placeholder="Enter text..."
            />
          </foreignObject>
        ) : (
          <text
            x={node.x + node.width / 2}
            y={node.y + node.height / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={node.textColor}
            fontSize="14"
            fontWeight="500"
            pointerEvents="none"
            style={{ userSelect: 'none' }}
          >
            {node.text || 'Double-click to edit'}
          </text>
        )}
        
        {/* Selection indicator */}
        {isSelected && (
          <>
            <rect
              x={node.x - 3}
              y={node.y - 3}
              width={node.width + 6}
              height={node.height + 6}
              fill="none"
              stroke="#3b82f6"
              strokeWidth="2"
              strokeDasharray="4 4"
              pointerEvents="none"
            />
          </>
        )}
        
        {/* Connection handles */}
        {(isHovered || isSelected || isConnecting) && (
          <>
            {Object.values(handles).map((handle) => (
              <g key={handle.id}>
                {/* Larger invisible click area */}
                <circle
                  cx={handle.x}
                  cy={handle.y}
                  r="12"
                  fill="transparent"
                  style={{ cursor: 'crosshair' }}
                  onMouseDown={(e) => handleHandleMouseDown(e, node, handle.id)}
                />
                {/* Visible handle */}
                <circle
                  cx={handle.x}
                  cy={handle.y}
                  r="6"
                  fill="#3b82f6"
                  stroke="#ffffff"
                  strokeWidth="2"
                  style={{ cursor: 'crosshair', pointerEvents: 'none' }}
                />
              </g>
            ))}
          </>
        )}
        
        {/* Invisible interaction area */}
        <rect
          x={node.x}
          y={node.y}
          width={node.width}
          height={node.height}
          fill="transparent"
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
          onMouseDown={(e) => handleMouseDown(e, node)}
          onMouseEnter={() => setHoveredNode(node.id)}
          onMouseLeave={() => setHoveredNode(null)}
        />
      </g>
    );
  };

  const fitToCanvas = () => {
    if (nodes.length === 0) return;
    
    const padding = 50;
    const minX = Math.min(...nodes.map(n => n.x)) - padding;
    const minY = Math.min(...nodes.map(n => n.y)) - padding;
    const maxX = Math.max(...nodes.map(n => n.x + n.width)) + padding;
    const maxY = Math.max(...nodes.map(n => n.y + n.height)) + padding;
    
    const rect = svgRef.current.getBoundingClientRect();
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    
    // Calculate zoom to fit content
    const scaleX = rect.width / contentWidth;
    const scaleY = rect.height / contentHeight;
    const newZoom = Math.min(scaleX, scaleY, 1); // Don't zoom in more than 100%
    
    setViewBox({
      x: minX,
      y: minY,
      width: contentWidth,
      height: contentHeight
    });
    setZoom(newZoom);
  };

  const resetView = () => {
    setViewBox({ x: 0, y: 0, width: 1200, height: 800 });
    setZoom(1);
  };

  // API Functions
  const saveFlowchart = async () => {
    if (nodes.length === 0) return;
    
    setIsSaving(true);
    try {
      const flowchartData = {
        name: flowchartName,
        description: `Flowchart with ${nodes.length} nodes and ${connections.length} connections`,
        data: { nodes, connections }
      };

      const url = currentFlowchartId 
        ? `${API_BASE}/flowcharts/${currentFlowchartId}`
        : `${API_BASE}/flowcharts`;
      
      const method = currentFlowchartId ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(flowchartData)
      });

      if (response.ok) {
        const result = await response.json();
        if (!currentFlowchartId) {
          setCurrentFlowchartId(result.id);
        }
        loadSavedFlowcharts(); // Refresh the list
      } else {
        throw new Error('Failed to save flowchart');
      }
    } catch (error) {
      console.error('Error saving flowchart:', error);
      alert('Failed to save flowchart');
    }
    setIsSaving(false);
  };

  const loadFlowchart = async (id) => {
    try {
      const response = await fetch(`${API_BASE}/flowcharts/${id}`);
      if (response.ok) {
        const flowchart = await response.json();
        setNodes(flowchart.data.nodes || []);
        setConnections(flowchart.data.connections || []);
        setFlowchartName(flowchart.name);
        setCurrentFlowchartId(id);
        setShowLoadDialog(false);
        
        // Auto-fit the loaded flowchart
        setTimeout(fitToCanvas, 100);
      } else {
        throw new Error('Failed to load flowchart');
      }
    } catch (error) {
      console.error('Error loading flowchart:', error);
      alert('Failed to load flowchart');
    }
  };

  const loadSavedFlowcharts = async () => {
    try {
      const response = await fetch(`${API_BASE}/flowcharts?limit=50`);
      if (response.ok) {
        const result = await response.json();
        setSavedFlowcharts(result.flowcharts);
      }
    } catch (error) {
      console.error('Error loading saved flowcharts:', error);
    }
  };

  const deleteFlowchart = async (id) => {
    if (!confirm('Are you sure you want to delete this flowchart?')) return;
    
    try {
      const response = await fetch(`${API_BASE}/flowcharts/${id}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        loadSavedFlowcharts();
        if (currentFlowchartId === id) {
          newFlowchart();
        }
      } else {
        throw new Error('Failed to delete flowchart');
      }
    } catch (error) {
      console.error('Error deleting flowchart:', error);
      alert('Failed to delete flowchart');
    }
  };

  const newFlowchart = () => {
    setNodes([]);
    setConnections([]);
    setSelectedNode(null);
    setCurrentFlowchartId(null);
    setFlowchartName('Untitled Flowchart');
    resetView();
  };

  const exportFlowchart = () => {
    const exportData = {
      name: flowchartName,
      data: { nodes, connections },
      exported_at: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json'
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${flowchartName.replace(/[^a-z0-9]/gi, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importFlowchart = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importData = JSON.parse(e.target.result);
        if (importData.data && importData.data.nodes) {
          setNodes(importData.data.nodes);
          setConnections(importData.data.connections || []);
          setFlowchartName(importData.name || 'Imported Flowchart');
          setCurrentFlowchartId(null);
          setTimeout(fitToCanvas, 100);
        } else {
          throw new Error('Invalid file format');
        }
      } catch (error) {
        alert('Failed to import flowchart. Please check the file format.');
      }
    };
    reader.readAsText(file);
    event.target.value = ''; // Reset file input
  };

  // Load saved flowcharts on component mount
  useEffect(() => {
    loadSavedFlowcharts();
  }, []);

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-gray-900">Flowchart Builder</h1>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={flowchartName}
                onChange={(e) => setFlowchartName(e.target.value)}
                className="px-3 py-1 border border-gray-300 rounded text-sm bg-gray-50"
                placeholder="Flowchart name..."
              />
              {currentFlowchartId && (
                <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded">Saved</span>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {/* File Operations */}
            <div className="flex gap-2">
              <button
                onClick={newFlowchart}
                className="px-3 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 text-sm"
              >
                New
              </button>
              <button
                onClick={() => setShowLoadDialog(true)}
                className="px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
              >
                Load
              </button>
              <button
                onClick={saveFlowchart}
                disabled={isSaving || nodes.length === 0}
                className="px-3 py-2 bg-green-500 text-white rounded hover:bg-green-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
            
            <div className="w-px h-6 bg-gray-300"></div>
            
            {/* Draggable Shape Tools */}
            <div className="flex gap-2">
              <div
                onMouseDown={(e) => handleToolbarMouseDown(e, 'rectangle')}
                className="px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm cursor-grab active:cursor-grabbing select-none"
              >
                📄 Rectangle
              </div>
              <div
                onMouseDown={(e) => handleToolbarMouseDown(e, 'circle')}
                className="px-3 py-2 bg-green-500 text-white rounded hover:bg-green-600 text-sm cursor-grab active:cursor-grabbing select-none"
              >
                ⭕ Circle
              </div>
              <div
                onMouseDown={(e) => handleToolbarMouseDown(e, 'diamond')}
                className="px-3 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 text-sm cursor-grab active:cursor-grabbing select-none"
              >
                ♦️ Diamond
              </div>
            </div>
            
            <div className="w-px h-6 bg-gray-300"></div>
            
            {/* View Controls */}
            <div className="flex gap-2">
              <button
                onClick={fitToCanvas}
                className="px-3 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 text-sm"
              >
                Fit All
              </button>
              <button
                onClick={resetView}
                className="px-3 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 text-sm"
              >
                Reset View
              </button>
            </div>
            
            <div className="w-px h-6 bg-gray-300"></div>
            
            {/* Import/Export */}
            <div className="flex gap-2">
              <label className="px-3 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 text-sm cursor-pointer">
                Import
                <input
                  type="file"
                  accept=".json"
                  onChange={importFlowchart}
                  className="hidden"
                />
              </label>
              <button
                onClick={exportFlowchart}
                disabled={nodes.length === 0}
                className="px-3 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Export
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-1">
        {/* Sidebar */}
        <div className="w-80 bg-white border-r border-gray-200 p-4 overflow-y-auto">
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Instructions</h3>
              <div className="text-xs text-gray-500 space-y-1">
                <p>• Drag shapes from toolbar onto canvas</p>
                <p>• Double-click shapes to edit text (starts blank)</p>
                <p>• Drag shapes to move them</p>
                <p>• Hover over shapes to see connection handles</p>
                <p>• Drag from blue handles to connect shapes</p>
                <p>• Ctrl+drag to pan canvas</p>
                <p>• Mouse wheel to zoom in/out</p>
                <p>• Click connection line to delete</p>
                <p>• Green circle shows valid connection target</p>
              </div>
            </div>

            {selectedNode && (
              <div className="border border-gray-200 rounded-lg p-3">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Edit Selected Node</h3>
                
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Text</label>
                    <input
                      type="text"
                      value={selectedNode.text}
                      onChange={(e) => updateNode(selectedNode.id, { text: e.target.value })}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Shape</label>
                    <select
                      value={selectedNode.type}
                      onChange={(e) => updateNode(selectedNode.id, { type: e.target.value })}
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                    >
                      <option value="rectangle">Rectangle</option>
                      <option value="circle">Circle</option>
                      <option value="diamond">Diamond</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Width</label>
                      <input
                        type="number"
                        value={selectedNode.width}
                        onChange={(e) => updateNode(selectedNode.id, { width: parseInt(e.target.value) || 50 })}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        min="30"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Height</label>
                      <input
                        type="number"
                        value={selectedNode.height}
                        onChange={(e) => updateNode(selectedNode.id, { height: parseInt(e.target.value) || 30 })}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        min="30"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Fill Color</label>
                    <input
                      type="color"
                      value={selectedNode.color}
                      onChange={(e) => updateNode(selectedNode.id, { color: e.target.value })}
                      className="w-full h-8 border border-gray-300 rounded"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Text Color</label>
                    <input
                      type="color"
                      value={selectedNode.textColor}
                      onChange={(e) => updateNode(selectedNode.id, { textColor: e.target.value })}
                      className="w-full h-8 border border-gray-300 rounded"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Border Color</label>
                    <input
                      type="color"
                      value={selectedNode.borderColor}
                      onChange={(e) => updateNode(selectedNode.id, { borderColor: e.target.value })}
                      className="w-full h-8 border border-gray-300 rounded"
                    />
                  </div>

                  <button
                    onClick={() => deleteNode(selectedNode.id)}
                    className="w-full px-3 py-2 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
                  >
                    Delete Node
                  </button>
                </div>
              </div>
            )}

            {isConnecting && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800 font-medium">🔗 Connection Mode Active</p>
                <p className="text-xs text-blue-600 mt-1">
                  Drag to another shape's blue handle to connect. Green circle shows valid targets.
                </p>
              </div>
            )}

            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Stats</h3>
              <div className="text-xs text-gray-500">
                <p>Nodes: {nodes.length}</p>
                <p>Connections: {connections.length}</p>
                <p>Zoom: {Math.round(zoom * 100)}%</p>
              </div>
            </div>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 relative overflow-hidden">
          <svg
            ref={svgRef}
            className="w-full h-full cursor-crosshair"
            viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
            onMouseDown={handleSvgMouseDown}
            onDoubleClick={handleSvgDoubleClick}
            onWheel={handleWheel}
          >
            <defs>
              <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e5e7eb" strokeWidth="1"/>
              </pattern>
            </defs>
            
            <rect
              x={viewBox.x - 1000}
              y={viewBox.y - 1000}
              width={viewBox.width + 2000}
              height={viewBox.height + 2000}
              fill="url(#grid)"
            />

            {/* Connections */}
            {connections.map(connection => (
              <g key={connection.id}>
                <path
                  d={getConnectionPath(connection.from, connection.to, connection)}
                  stroke={connection.color}
                  strokeWidth={connection.width}
                  fill="none"
                  markerEnd="url(#arrowhead)"
                />
                <path
                  d={getArrowPath(connection)}
                  fill={connection.color}
                />
                <path
                  d={getConnectionPath(connection.from, connection.to, connection)}
                  stroke="transparent"
                  strokeWidth="8"
                  fill="none"
                  style={{ cursor: 'pointer' }}
                  onClick={() => deleteConnection(connection.id)}
                />
              </g>
            ))}

            {/* Connection preview */}
            {isConnecting && connectionStart && connectionStartHandle && (
              <g>
                <line
                  x1={getHandlePosition(nodes.find(n => n.id === connectionStart), connectionStartHandle)?.x || 0}
                  y1={getHandlePosition(nodes.find(n => n.id === connectionStart), connectionStartHandle)?.y || 0}
                  x2={currentMousePos.x}
                  y2={currentMousePos.y}
                  stroke="#3b82f6"
                  strokeWidth="3"
                  strokeDasharray="8 4"
                  opacity="0.8"
                />
                {/* Show potential connection target */}
                {(() => {
                  const nearest = findNearestHandle(currentMousePos.x, currentMousePos.y, connectionStart);
                  if (nearest) {
                    return (
                      <circle
                        cx={nearest.x}
                        cy={nearest.y}
                        r="10"
                        fill="none"
                        stroke="#10b981"
                        strokeWidth="3"
                        opacity="0.8"
                      />
                    );
                  }
                  return null;
                })()}
              </g>
            )}

            {/* Nodes */}
            {nodes.map(renderNode)}
          </svg>
        </div>
      </div>

      {/* Drag Preview */}
      {dragPreview && (
        <div
          className="fixed pointer-events-none z-50 px-3 py-2 bg-blue-500 text-white rounded text-sm opacity-75"
          style={{
            left: dragPreview.x + 10,
            top: dragPreview.y + 10,
            transform: 'translate(-50%, -50%)'
          }}
        >
          {dragPreview.type === 'rectangle' && '📄'}
          {dragPreview.type === 'circle' && '⭕'}
          {dragPreview.type === 'diamond' && '♦️'}
          {' '}{dragPreview.type}
        </div>
      )}

      {/* Load Dialog */}
      {showLoadDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-96 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Load Flowchart</h2>
              <button
                onClick={() => setShowLoadDialog(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              {savedFlowcharts.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No saved flowcharts found</p>
              ) : (
                <div className="space-y-2">
                  {savedFlowcharts.map((flowchart) => (
                    <div
                      key={flowchart.id}
                      className="flex items-center justify-between p-3 border border-gray-200 rounded hover:bg-gray-50"
                    >
                      <div className="flex-1">
                        <h3 className="font-medium">{flowchart.name}</h3>
                        <p className="text-sm text-gray-500">{flowchart.description}</p>
                        <p className="text-xs text-gray-400">
                          Updated: {new Date(flowchart.updated_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => loadFlowchart(flowchart.id)}
                          className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
                        >
                          Load
                        </button>
                        <button
                          onClick={() => deleteFlowchart(flowchart.id)}
                          className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="mt-4 pt-4 border-t border-gray-200">
              <button
                onClick={() => setShowLoadDialog(false)}
                className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}