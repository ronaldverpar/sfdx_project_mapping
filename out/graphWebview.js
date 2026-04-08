"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.GraphWebviewProvider = void 0;
const vscode = __importStar(require("vscode"));
class GraphWebviewProvider {
    constructor(extensionUri) {
        this.extensionUri = extensionUri;
    }
    show(result) {
        if (!this.panel) {
            this.panel = vscode.window.createWebviewPanel('sfdxDependencyGraph', 'SFDX Dependency Graph', vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true });
            this.panel.onDidDispose(() => { this.panel = undefined; });
        }
        const nodes = [...result.graph.nodes.values()].map(n => ({
            id: n.id,
            name: n.name,
            type: n.type,
            isUnused: n.isUnused,
        }));
        const edges = result.graph.edges.map(e => ({
            source: e.source,
            target: e.target,
            type: e.type,
        }));
        // Encode data as base64 to avoid any template literal / HTML escaping issues
        const dataJson = JSON.stringify({ nodes, edges });
        const dataBase64 = Buffer.from(dataJson, 'utf-8').toString('base64');
        this.panel.webview.html = this.getHtml(dataBase64);
        this.panel.reveal();
    }
    focusNode(nodeId) {
        this.panel?.webview.postMessage({ type: 'focusNode', nodeId });
    }
    getHtml(dataBase64) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  background: #1e1e1e; color: #ccc;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 13px; overflow: hidden; height: 100vh;
  display: flex; flex-direction: column;
}
#toolbar {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 12px; background: #2d2d2d;
  border-bottom: 1px solid #444; flex-shrink: 0;
}
#toolbar button {
  background: #0e639c; color: #fff; border: none;
  padding: 3px 10px; border-radius: 3px; font-size: 12px; cursor: pointer;
}
#toolbar button:hover { background: #1177bb; }
#toolbar button.active { background: #1177bb; box-shadow: inset 0 0 0 1px #fff; }
.legend { display: flex; gap: 10px; margin-left: auto; font-size: 11px; align-items: center; }
.legend-item { display: flex; align-items: center; gap: 4px; }
.legend-dot { width: 12px; height: 10px; border-radius: 2px; display: inline-block; }
#stats { font-size: 11px; opacity: 0.7; }
#main { display: flex; flex: 1; overflow: hidden; }
#sidebar {
  width: 240px; flex-shrink: 0; background: #252526;
  border-right: 1px solid #333; display: flex; flex-direction: column;
  overflow: hidden;
}
#sidebar-search {
  margin: 8px; padding: 4px 8px; background: #3c3c3c; color: #ccc;
  border: 1px solid #555; border-radius: 3px; font-size: 12px; outline: none;
}
#sidebar-sections {
  flex: 1; overflow-y: auto;
}
#sidebar-sections::-webkit-scrollbar { width: 6px; }
#sidebar-sections::-webkit-scrollbar-thumb { background: #555; border-radius: 3px; }
.accordion-header {
  padding: 8px 12px; font-size: 11px; text-transform: uppercase;
  letter-spacing: 0.5px; color: #aaa; background: #2d2d2d;
  border-bottom: 1px solid #333; cursor: pointer;
  display: flex; align-items: center; gap: 6px;
  user-select: none; position: sticky; top: 0; z-index: 1;
}
.accordion-header:hover { background: #333; }
.accordion-header .arrow { font-size: 9px; transition: transform 0.15s; }
.accordion-header.collapsed .arrow { transform: rotate(-90deg); }
.accordion-header .section-dot { width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0; }
.accordion-header .section-count { margin-left: auto; font-size: 10px; color: #666; }
.accordion-body { padding: 2px 0; }
.accordion-body.hidden { display: none; }
.sidebar-item {
  padding: 6px 12px 6px 24px; cursor: pointer; font-size: 12px;
  display: flex; align-items: center; gap: 8px;
  border-left: 3px solid transparent;
}
.sidebar-item:hover { background: #2a2d2e; }
.sidebar-item.active { background: #37373d; border-left-color: #4ec9b0; }
.sidebar-item .dot { width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0; }
.sidebar-item .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sidebar-item .count { font-size: 10px; color: #888; }
.sidebar-item .unused-badge { font-size: 9px; color: #f48771; }
#canvas-wrap { flex: 1; position: relative; overflow: hidden; }
canvas { display: block; cursor: grab; }
canvas:active { cursor: grabbing; }
#tooltip {
  position: fixed; display: none;
  background: #252526; border: 1px solid #555;
  padding: 8px 12px; border-radius: 4px; font-size: 12px;
  pointer-events: none; z-index: 100; max-width: 320px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.4); line-height: 1.5;
}
#tooltip .tt-name { font-weight: bold; font-size: 13px; }
#tooltip .tt-type { opacity: 0.6; }
#tooltip .tt-unused { color: #f48771; }
#tooltip .tt-edges { margin-top: 4px; opacity: 0.8; }
#empty-state {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  text-align: center; color: #666; font-size: 14px; pointer-events: none;
}
#error { color: #f48771; padding: 20px; display: none; white-space: pre-wrap; }
</style>
</head>
<body>
<div id="toolbar">
  <button id="btnShowAll">Show All</button>
  <button id="btnFit">Fit</button>
  <button id="btnZoomIn">+</button>
  <button id="btnZoomOut">&minus;</button>
  <span id="stats"></span>
  <div class="legend">
    <span class="legend-item"><span class="legend-dot" style="background:#c586c0"></span> Aura</span>
    <span class="legend-item"><span class="legend-dot" style="background:#4ec9b0"></span> LWC</span>
    <span class="legend-item"><span class="legend-dot" style="background:#ce9178"></span> Trigger</span>
    <span class="legend-item"><span class="legend-dot" style="background:#569cd6"></span> Apex</span>
    <span class="legend-item"><span class="legend-dot" style="background:#d16969"></span> Interface</span>
    <span class="legend-item"><span class="legend-dot" style="background:#dcdcaa"></span> SObject</span>
  </div>
</div>
<div id="main">
  <div id="sidebar">
    <input type="text" id="sidebar-search" placeholder="Filter..." />
    <div id="sidebar-sections"></div>
  </div>
  <div id="canvas-wrap">
    <canvas id="canvas"></canvas>
    <div id="empty-state">Select a component from the sidebar<br/>to view its dependency tree</div>
    <div id="tooltip"></div>
  </div>
</div>
<div id="error"></div>
<script>
try {
  var DATA_BASE64 = "${dataBase64}";
  var parsed = JSON.parse(atob(DATA_BASE64));
  var rawNodes = parsed.nodes;
  var rawEdges = parsed.edges;

  var TYPE_COLORS = {
    'apex-class': '#569cd6', 'apex-interface': '#d16969',
    'apex-trigger': '#ce9178', 'lwc': '#4ec9b0', 'aura': '#c586c0',
    'sobject': '#dcdcaa'
  };
  var TYPE_BG = {
    'apex-class': '#1e3a5f', 'apex-interface': '#5f2020',
    'apex-trigger': '#5f3a20', 'lwc': '#1e4f45', 'aura': '#4a2050',
    'sobject': '#3d3d1e'
  };
  var EDGE_COLORS = {
    'extends': '#569cd6', 'implements': '#d16969', 'instantiates': '#dcdcaa',
    'static-call': '#9cdcfe', 'type-reference': '#666', 'apex-import': '#4ec9b0',
    'lwc-composition': '#4ec9b0', 'trigger-object': '#ce9178', 'wire-adapter': '#c586c0',
    'sobject-reference': '#dcdcaa'
  };

  var NODE_PAD_X = 12, NODE_PAD_Y = 6, NODE_FONT = '12px sans-serif', NODE_CORNER = 4;

  var canvas = document.getElementById('canvas');
  var ctx = canvas.getContext('2d');
  ctx.font = NODE_FONT;

  /* --- Build full node map and edge list --- */
  var allNodeMap = {};
  var allNodes = [];
  for (var i = 0; i < rawNodes.length; i++) {
    var n = rawNodes[i];
    var tw = ctx.measureText(n.name).width;
    var obj = {
      id: n.id, name: n.name, type: n.type, isUnused: n.isUnused,
      x: 0, y: 0, vx: 0, vy: 0,
      w: tw + NODE_PAD_X * 2, h: 14 + NODE_PAD_Y * 2,
      inDeg: 0, outDeg: 0, visible: false
    };
    allNodeMap[n.id] = obj;
    allNodes.push(obj);
  }

  var allEdges = [];
  for (var i = 0; i < rawEdges.length; i++) {
    var e = rawEdges[i];
    if (allNodeMap[e.source] && allNodeMap[e.target]) {
      allEdges.push({ source: allNodeMap[e.source], target: allNodeMap[e.target], type: e.type });
    }
  }
  for (var i = 0; i < allEdges.length; i++) {
    allEdges[i].source.outDeg++;
    allEdges[i].target.inDeg++;
  }

  /* Build node lists by category */
  var lwcList = [], auraList = [], triggerList = [], unusedApexList = [];
  for (var i = 0; i < allNodes.length; i++) {
    var nd = allNodes[i];
    if (nd.type === 'lwc') lwcList.push(nd);
    else if (nd.type === 'aura') auraList.push(nd);
    else if (nd.type === 'apex-trigger') triggerList.push(nd);
    else if ((nd.type === 'apex-class' || nd.type === 'apex-interface') && nd.isUnused) unusedApexList.push(nd);
  }
  lwcList.sort(function(a, b) { return a.name.localeCompare(b.name); });
  auraList.sort(function(a, b) { return a.name.localeCompare(b.name); });
  triggerList.sort(function(a, b) { return a.name.localeCompare(b.name); });
  unusedApexList.sort(function(a, b) { return a.name.localeCompare(b.name); });

  /* --- Currently visible subset --- */
  var visNodes = [];
  var visEdges = [];
  var activeRootId = null;
  var showAll = false;

  /* Walk the dependency tree from a root node (follow outgoing edges recursively) */
  function collectDeps(rootId) {
    var visited = {};
    var queue = [rootId];
    visited[rootId] = true;
    while (queue.length > 0) {
      var cur = queue.shift();
      for (var i = 0; i < allEdges.length; i++) {
        var e = allEdges[i];
        if (e.source.id === cur && !visited[e.target.id]) {
          visited[e.target.id] = true;
          queue.push(e.target.id);
        }
      }
    }
    return visited;
  }

  function applyFilter(rootId) {
    activeRootId = rootId;
    showAll = false;
    var depSet = collectDeps(rootId);
    depSet[rootId] = true;

    visNodes = [];
    visEdges = [];
    for (var i = 0; i < allNodes.length; i++) {
      allNodes[i].visible = !!depSet[allNodes[i].id];
      if (allNodes[i].visible) visNodes.push(allNodes[i]);
    }
    for (var i = 0; i < allEdges.length; i++) {
      if (allEdges[i].source.visible && allEdges[i].target.visible) {
        visEdges.push(allEdges[i]);
      }
    }

    layoutNodes();
    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('stats').textContent = visNodes.length + ' nodes, ' + visEdges.length + ' edges';
    updateSidebarActive();
  }

  function applyShowAll() {
    activeRootId = null;
    showAll = true;
    visNodes = [];
    visEdges = [];

    for (var i = 0; i < allNodes.length; i++) {
      allNodes[i].visible = true;
      visNodes.push(allNodes[i]);
    }
    for (var i = 0; i < allEdges.length; i++) {
      visEdges.push(allEdges[i]);
    }
    layoutNodes();
    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('stats').textContent = visNodes.length + ' nodes, ' + visEdges.length + ' edges';
    updateSidebarActive();
  }

  function layoutNodes() {
    /* Place nodes in a circle then run simulation to completion */
    var n = visNodes.length;
    var radius = Math.max(100, n * 20);
    for (var i = 0; i < n; i++) {
      var angle = (2 * Math.PI * i) / n;
      visNodes[i].x = Math.cos(angle) * radius;
      visNodes[i].y = Math.sin(angle) * radius;
      visNodes[i].vx = 0; visNodes[i].vy = 0;
    }
    /* Run physics offline until settled */
    var a = 1, decay = 0.004, minA = 0.001, maxV = 40;
    for (var iter = 0; iter < 300 && a >= minA; iter++) {
      for (var i = 0; i < visNodes.length; i++) {
        visNodes[i].vx += (0 - visNodes[i].x) * 0.001 * a;
        visNodes[i].vy += (0 - visNodes[i].y) * 0.001 * a;
      }
      for (var i = 0; i < visNodes.length; i++) {
        for (var j = i + 1; j < visNodes.length; j++) {
          var aa = visNodes[i], bb = visNodes[j];
          var dx = bb.x - aa.x, dy = bb.y - aa.y;
          var dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 30) dist = 30;
          if (dist > 500) continue;
          var strength = -200 * a / (dist * dist);
          var fx = (dx / dist) * strength;
          var fy = (dy / dist) * strength;
          aa.vx -= fx; aa.vy -= fy;
          bb.vx += fx; bb.vy += fy;
        }
      }
      for (var i = 0; i < visEdges.length; i++) {
        var ed = visEdges[i];
        var dx = ed.target.x - ed.source.x;
        var dy = ed.target.y - ed.source.y;
        ed.source.vx += dx * 0.008 * a;
        ed.source.vy += dy * 0.008 * a;
        ed.target.vx -= dx * 0.008 * a;
        ed.target.vy -= dy * 0.008 * a;
      }
      for (var i = 0; i < visNodes.length; i++) {
        var nd = visNodes[i];
        nd.vx *= 0.5; nd.vy *= 0.5;
        if (nd.vx > maxV) nd.vx = maxV; else if (nd.vx < -maxV) nd.vx = -maxV;
        if (nd.vy > maxV) nd.vy = maxV; else if (nd.vy < -maxV) nd.vy = -maxV;
        nd.x += nd.vx; nd.y += nd.vy;
      }
      a = Math.max(a - decay, 0);
    }
    /* Resolve overlaps — push apart any nodes whose rectangles intersect */
    var pad = 12;
    for (var pass = 0; pass < 50; pass++) {
      var moved = false;
      for (var i = 0; i < visNodes.length; i++) {
        for (var j = i + 1; j < visNodes.length; j++) {
          var aa = visNodes[i], bb = visNodes[j];
          var overlapX = (aa.w + bb.w) / 2 + pad - Math.abs(aa.x - bb.x);
          var overlapY = (aa.h + bb.h) / 2 + pad - Math.abs(aa.y - bb.y);
          if (overlapX > 0 && overlapY > 0) {
            moved = true;
            /* Push along the axis with smaller overlap */
            if (overlapX < overlapY) {
              var pushX = overlapX / 2 + 1;
              if (aa.x <= bb.x) { aa.x -= pushX; bb.x += pushX; }
              else { aa.x += pushX; bb.x -= pushX; }
            } else {
              var pushY = overlapY / 2 + 1;
              if (aa.y <= bb.y) { aa.y -= pushY; bb.y += pushY; }
              else { aa.y += pushY; bb.y -= pushY; }
            }
          }
        }
      }
      if (!moved) break;
    }
    /* Zero out velocities — layout is final */
    for (var i = 0; i < visNodes.length; i++) {
      visNodes[i].vx = 0; visNodes[i].vy = 0;
    }
    camX = 0; camY = 0; camScale = 1;
    fitGraph();
  }

  /* --- Build accordion sidebar --- */
  var sectionsContainer = document.getElementById('sidebar-sections');
  var sidebarItems = [];

  var sections = [
    { key: 'lwc', label: 'LWC Components', color: '#4ec9b0', nodes: lwcList },
    { key: 'aura', label: 'Aura Components', color: '#c586c0', nodes: auraList },
    { key: 'trigger', label: 'Triggers', color: '#ce9178', nodes: triggerList },
    { key: 'unused', label: 'Unused Apex', color: '#f48771', nodes: unusedApexList }
  ];

  function buildSidebar() {
    sectionsContainer.innerHTML = '';
    sidebarItems = [];
    for (var s = 0; s < sections.length; s++) {
      var sec = sections[s];
      if (sec.nodes.length === 0) continue;

      var header = document.createElement('div');
      header.className = 'accordion-header';
      header.innerHTML = '<span class="arrow">&#9660;</span>' +
        '<span class="section-dot" style="background:' + sec.color + '"></span>' +
        '<span>' + sec.label + '</span>' +
        '<span class="section-count">' + sec.nodes.length + '</span>';

      var body = document.createElement('div');
      body.className = 'accordion-body';

      (function(hdr, bdy) {
        hdr.addEventListener('click', function() {
          var collapsed = hdr.classList.contains('collapsed');
          if (collapsed) {
            hdr.classList.remove('collapsed');
            bdy.classList.remove('hidden');
          } else {
            hdr.classList.add('collapsed');
            bdy.classList.add('hidden');
          }
        });
      })(header, body);

      for (var i = 0; i < sec.nodes.length; i++) {
        var nd = sec.nodes[i];
        var depCount = 0;
        var deps = collectDeps(nd.id);
        for (var k in deps) { if (k !== nd.id) depCount++; }

        var div = document.createElement('div');
        div.className = 'sidebar-item';
        div.setAttribute('data-id', nd.id);
        var extra = nd.isUnused ? '<span class="unused-badge">unused</span>' : '';
        div.innerHTML = '<span class="dot" style="background:' + sec.color + '"></span>' +
          '<span class="name">' + nd.name + '</span>' + extra +
          '<span class="count">' + depCount + '</span>';
        (function(nodeId) {
          div.addEventListener('click', function() { applyFilter(nodeId); });
        })(nd.id);
        body.appendChild(div);
        sidebarItems.push({ el: div, name: nd.name.toLowerCase(), id: nd.id, header: header, body: body });
      }

      sectionsContainer.appendChild(header);
      sectionsContainer.appendChild(body);
    }
  }
  buildSidebar();

  document.getElementById('sidebar-search').addEventListener('input', function(ev) {
    var term = ev.target.value.toLowerCase();
    for (var i = 0; i < sidebarItems.length; i++) {
      var show = !term || sidebarItems[i].name.indexOf(term) >= 0;
      sidebarItems[i].el.style.display = show ? '' : 'none';
    }
    /* Auto-expand sections with matches, collapse empty ones when filtering */
    if (term) {
      var bodyMap = {};
      for (var i = 0; i < sidebarItems.length; i++) {
        var b = sidebarItems[i].body;
        var h = sidebarItems[i].header;
        var key = h.textContent;
        if (!bodyMap[key]) bodyMap[key] = { header: h, body: b, hasMatch: false };
        if (sidebarItems[i].el.style.display !== 'none') bodyMap[key].hasMatch = true;
      }
      for (var k in bodyMap) {
        if (bodyMap[k].hasMatch) {
          bodyMap[k].header.classList.remove('collapsed');
          bodyMap[k].body.classList.remove('hidden');
        } else {
          bodyMap[k].header.classList.add('collapsed');
          bodyMap[k].body.classList.add('hidden');
        }
      }
    }
  });

  function updateSidebarActive() {
    for (var i = 0; i < sidebarItems.length; i++) {
      if (sidebarItems[i].id === activeRootId) {
        sidebarItems[i].el.className = 'sidebar-item active';
      } else {
        sidebarItems[i].el.className = 'sidebar-item';
      }
    }
    var btn = document.getElementById('btnShowAll');
    btn.className = showAll ? 'active' : '';
  }

  document.getElementById('btnShowAll').addEventListener('click', applyShowAll);

  /* --- Canvas setup --- */
  var W, H;
  function resize() {
    var wrap = document.getElementById('canvas-wrap');
    W = wrap.clientWidth;
    H = wrap.clientHeight;
    var dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  var camX = 0, camY = 0, camScale = 1;
  function screenToWorld(sx, sy) {
    return { x: (sx - camX) / camScale, y: (sy - camY) / camScale };
  }
  function worldToScreen(wx, wy) {
    return { x: wx * camScale + camX, y: wy * camScale + camY };
  }

  var dragNode = null;

  var selectedNode = null, hoveredNode = null;

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function rectEdgePoint(cx, cy, hw, hh, tx, ty) {
    var dx = tx - cx, dy = ty - cy;
    if (dx === 0 && dy === 0) return { x: cx, y: cy };
    var absDx = Math.abs(dx), absDy = Math.abs(dy);
    var scale;
    if (absDx / hw > absDy / hh) { scale = hw / absDx; }
    else { scale = hh / absDy; }
    return { x: cx + dx * scale, y: cy + dy * scale };
  }

  function draw() {
    ctx.save();
    ctx.clearRect(0, 0, W, H);

    if (visNodes.length === 0) { ctx.restore(); return; }

    ctx.translate(camX, camY);
    ctx.scale(camScale, camScale);

    var connSet = {};
    if (selectedNode) {
      for (var i = 0; i < visEdges.length; i++) {
        var ed = visEdges[i];
        if (ed.source === selectedNode || ed.target === selectedNode) {
          connSet[ed.source.id] = true;
          connSet[ed.target.id] = true;
        }
      }
    }

    for (var i = 0; i < visEdges.length; i++) {
      var ed = visEdges[i];
      var hi = selectedNode && (ed.source === selectedNode || ed.target === selectedNode);
      var dim = selectedNode && !hi;

      var sp = rectEdgePoint(ed.source.x, ed.source.y, ed.source.w / 2 + 2, ed.source.h / 2 + 2, ed.target.x, ed.target.y);
      var tp = rectEdgePoint(ed.target.x, ed.target.y, ed.target.w / 2 + 2, ed.target.h / 2 + 2, ed.source.x, ed.source.y);

      ctx.strokeStyle = dim ? 'rgba(80,80,80,0.15)' : (EDGE_COLORS[ed.type] || '#555');
      ctx.lineWidth = hi ? 2 : 0.8;
      ctx.globalAlpha = dim ? 0.2 : (hi ? 1 : 0.5);
      ctx.beginPath();
      ctx.moveTo(sp.x, sp.y);
      ctx.lineTo(tp.x, tp.y);
      ctx.stroke();

      if (hi || !selectedNode) {
        var adx = tp.x - sp.x, ady = tp.y - sp.y;
        var alen = Math.sqrt(adx * adx + ady * ady) || 1;
        var ux = adx / alen, uy = ady / alen;
        var arl = hi ? 9 : 6;
        ctx.beginPath();
        ctx.moveTo(tp.x, tp.y);
        ctx.lineTo(tp.x - ux * arl - uy * 3.5, tp.y - uy * arl + ux * 3.5);
        ctx.lineTo(tp.x - ux * arl + uy * 3.5, tp.y - uy * arl - ux * 3.5);
        ctx.closePath();
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    ctx.font = NODE_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var i = 0; i < visNodes.length; i++) {
      var nd = visNodes[i];
      var isSel = nd === selectedNode;
      var isConn = !!connSet[nd.id];
      var dim = selectedNode && !isSel && !isConn;
      ctx.globalAlpha = dim ? 0.15 : 1;

      var rx = nd.x - nd.w / 2, ry = nd.y - nd.h / 2;
      var bgColor = nd.isUnused ? '#4a2020' : (TYPE_BG[nd.type] || '#333');
      var borderColor = nd.isUnused ? '#f48771' : (TYPE_COLORS[nd.type] || '#888');

      if (isSel || nd === hoveredNode) {
        ctx.shadowColor = borderColor;
        ctx.shadowBlur = isSel ? 12 : 6;
      }

      roundRect(rx, ry, nd.w, nd.h, NODE_CORNER);
      ctx.fillStyle = bgColor;
      ctx.fill();
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = isSel ? 2.5 : (nd === hoveredNode ? 2 : 1);
      ctx.stroke();

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;

      /* Highlight root node */
      if (nd.id === activeRootId && !isSel) {
        roundRect(rx - 2, ry - 2, nd.w + 4, nd.h + 4, NODE_CORNER + 1);
        ctx.strokeStyle = '#4ec9b0';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.fillStyle = nd.isUnused ? '#f48771' : '#ddd';
      if (isSel) ctx.fillStyle = '#fff';
      ctx.fillText(nd.name, nd.x, nd.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function loop() { draw(); requestAnimationFrame(loop); }
  loop();

  var isPanning = false, lastMX = 0, lastMY = 0;

  function findNodeAt(sx, sy) {
    var w = screenToWorld(sx, sy);
    for (var i = visNodes.length - 1; i >= 0; i--) {
      var nd = visNodes[i];
      if (w.x >= nd.x - nd.w / 2 - 4 && w.x <= nd.x + nd.w / 2 + 4 &&
          w.y >= nd.y - nd.h / 2 - 4 && w.y <= nd.y + nd.h / 2 + 4) return nd;
    }
    return null;
  }

  canvas.addEventListener('mousedown', function(ev) {
    var rect = canvas.getBoundingClientRect();
    var sx = ev.clientX - rect.left, sy = ev.clientY - rect.top;
    lastMX = ev.clientX; lastMY = ev.clientY;
    var nd = findNodeAt(sx, sy);
    if (nd) { dragNode = nd; selectedNode = nd; }
    else { isPanning = true; selectedNode = null; }
  });

  canvas.addEventListener('mousemove', function(ev) {
    var rect = canvas.getBoundingClientRect();
    var sx = ev.clientX - rect.left, sy = ev.clientY - rect.top;
    var dx = ev.clientX - lastMX, dy = ev.clientY - lastMY;
    lastMX = ev.clientX; lastMY = ev.clientY;

    if (dragNode) {
      var w = screenToWorld(sx, sy);
      dragNode.x = w.x; dragNode.y = w.y;
    } else if (isPanning) {
      camX += dx; camY += dy;
    } else {
      var nd = findNodeAt(sx, sy);
      hoveredNode = nd;
      canvas.style.cursor = nd ? 'pointer' : 'grab';
      var tt = document.getElementById('tooltip');
      if (nd) {
        var inE = 0, outE = 0;
        for (var i = 0; i < visEdges.length; i++) {
          if (visEdges[i].target === nd) inE++;
          if (visEdges[i].source === nd) outE++;
        }
        tt.innerHTML = '<div class="tt-name">' + nd.name + '</div>' +
          '<div class="tt-type">' + nd.type + '</div>' +
          (nd.isUnused ? '<div class="tt-unused">Unused</div>' : '') +
          '<div class="tt-edges">' + inE + ' in, ' + outE + ' out</div>';
        tt.style.display = 'block';
        tt.style.left = (ev.clientX + 14) + 'px';
        tt.style.top = (ev.clientY + 14) + 'px';
      } else { tt.style.display = 'none'; }
    }
  });

  canvas.addEventListener('mouseup', function() {
    dragNode = null; isPanning = false;
  });
  canvas.addEventListener('mouseleave', function() {
    dragNode = null; isPanning = false; hoveredNode = null;
    document.getElementById('tooltip').style.display = 'none';
  });

  canvas.addEventListener('wheel', function(ev) {
    ev.preventDefault();
    var rect = canvas.getBoundingClientRect();
    var mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
    var factor = ev.deltaY < 0 ? 1.1 : 0.9;
    var ns = Math.max(0.05, Math.min(5, camScale * factor));
    var ratio = ns / camScale;
    camX = mx - (mx - camX) * ratio;
    camY = my - (my - camY) * ratio;
    camScale = ns;
  }, { passive: false });

  document.getElementById('btnFit').addEventListener('click', fitGraph);
  document.getElementById('btnZoomIn').addEventListener('click', function() {
    camScale *= 1.3;
    camX = W / 2 - (W / 2 - camX) * 1.3;
    camY = H / 2 - (H / 2 - camY) * 1.3;
  });
  document.getElementById('btnZoomOut').addEventListener('click', function() {
    camScale *= 0.7;
    camX = W / 2 - (W / 2 - camX) * 0.7;
    camY = H / 2 - (H / 2 - camY) * 0.7;
  });

  function fitGraph() {
    if (visNodes.length === 0) return;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var i = 0; i < visNodes.length; i++) {
      var left = visNodes[i].x - visNodes[i].w / 2;
      var right = visNodes[i].x + visNodes[i].w / 2;
      var top = visNodes[i].y - visNodes[i].h / 2;
      var bot = visNodes[i].y + visNodes[i].h / 2;
      if (left < minX) minX = left;
      if (top < minY) minY = top;
      if (right > maxX) maxX = right;
      if (bot > maxY) maxY = bot;
    }
    var pad = 60, gw = (maxX - minX) || 1, gh = (maxY - minY) || 1;
    camScale = Math.min((W - pad * 2) / gw, (H - pad * 2) / gh, 2);
    camX = (W - gw * camScale) / 2 - minX * camScale;
    camY = (H - gh * camScale) / 2 - minY * camScale;
  }

  window.addEventListener('message', function(event) {
    var msg = event.data;
    if (msg.type === 'focusNode' && allNodeMap[msg.nodeId]) {
      applyFilter(msg.nodeId);
    }
  });

  document.getElementById('stats').textContent = allNodes.length + ' total nodes';

} catch(err) {
  var el = document.getElementById('error');
  if (el) { el.style.display = 'block'; el.textContent = 'Graph error: ' + err.message + '\\n' + err.stack; }
}
</script>
</body>
</html>`;
    }
}
exports.GraphWebviewProvider = GraphWebviewProvider;
//# sourceMappingURL=graphWebview.js.map