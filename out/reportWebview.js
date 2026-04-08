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
exports.ReportWebviewProvider = void 0;
const vscode = __importStar(require("vscode"));
class ReportWebviewProvider {
    constructor(extensionUri) {
        this.extensionUri = extensionUri;
    }
    show(result) {
        if (!this.panel) {
            this.panel = vscode.window.createWebviewPanel('sfdxStructureReport', 'SFDX Structure Report', vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true });
            this.panel.onDidDispose(() => { this.panel = undefined; });
        }
        const data = this.buildReportData(result);
        const dataBase64 = Buffer.from(JSON.stringify(data), 'utf-8').toString('base64');
        this.panel.webview.html = this.getHtml(dataBase64);
        this.panel.reveal();
    }
    buildReportData(result) {
        const { graph } = result;
        const nodes = graph.nodes;
        const edges = graph.edges;
        // Index edges by source and target
        const edgesBySource = {};
        const edgesByTarget = {};
        for (const e of edges) {
            if (!edgesBySource[e.source]) {
                edgesBySource[e.source] = [];
            }
            edgesBySource[e.source].push(e);
            if (!edgesByTarget[e.target]) {
                edgesByTarget[e.target] = [];
            }
            edgesByTarget[e.target].push(e);
        }
        // --- Aura components ---
        const auraComponents = [];
        for (const [id, node] of nodes) {
            if (node.type !== 'aura') {
                continue;
            }
            const outEdges = edgesBySource[id] || [];
            const apexController = outEdges
                .filter(e => e.type === 'apex-import')
                .map(e => this.nodeName(nodes, e.target));
            const childAura = outEdges
                .filter(e => e.type === 'lwc-composition' && e.target.startsWith('aura:'))
                .map(e => this.nodeName(nodes, e.target));
            const childLwc = outEdges
                .filter(e => e.type === 'lwc-composition' && e.target.startsWith('lwc:'))
                .map(e => this.nodeName(nodes, e.target));
            const dynamicCreates = outEdges
                .filter(e => e.type === 'instantiates')
                .map(e => this.nodeName(nodes, e.target));
            const events = outEdges
                .filter(e => e.type === 'type-reference' && e.target.startsWith('aura-event:'))
                .map(e => e.target.replace('aura-event:', ''));
            auraComponents.push({
                name: node.name,
                isUnused: node.isUnused,
                apexController,
                childAura,
                childLwc,
                dynamicCreates,
                events,
                attributes: node.metadata.apiProperties || [],
                isExposed: node.metadata.isExposed || false,
            });
        }
        auraComponents.sort((a, b) => a.name.localeCompare(b.name));
        // --- LWC components ---
        const lwcComponents = [];
        for (const [id, node] of nodes) {
            if (node.type !== 'lwc') {
                continue;
            }
            const outEdges = edgesBySource[id] || [];
            const inEdges = edgesByTarget[id] || [];
            const childLwc = outEdges
                .filter(e => e.type === 'lwc-composition')
                .map(e => this.nodeName(nodes, e.target));
            const apexImports = outEdges
                .filter(e => e.type === 'apex-import')
                .map(e => this.nodeName(nodes, e.target));
            const wireAdapters = (node.metadata.wireAdapters || []).slice();
            const parentComponents = inEdges
                .filter(e => e.type === 'lwc-composition')
                .map(e => this.nodeName(nodes, e.source));
            lwcComponents.push({
                name: node.name,
                isUnused: node.isUnused,
                childLwc,
                apexImports,
                wireAdapters,
                parentComponents,
                apiProperties: node.metadata.apiProperties || [],
                isExposed: node.metadata.isExposed || false,
                targets: node.metadata.targets || [],
            });
        }
        lwcComponents.sort((a, b) => a.name.localeCompare(b.name));
        // --- Apex controllers (those referenced by LWC/Aura) ---
        const controllerIds = new Set();
        for (const e of edges) {
            const src = nodes.get(e.source);
            const tgt = nodes.get(e.target);
            if (src && tgt && (src.type === 'lwc' || src.type === 'aura') && tgt.type === 'apex-class') {
                controllerIds.add(e.target);
            }
        }
        const apexControllers = [];
        for (const cid of controllerIds) {
            const node = nodes.get(cid);
            if (!node) {
                continue;
            }
            const outEdges = edgesBySource[cid] || [];
            const inEdges = edgesByTarget[cid] || [];
            const calledBy = inEdges
                .filter(e => {
                const src = nodes.get(e.source);
                return src && (src.type === 'lwc' || src.type === 'aura');
            })
                .map(e => this.nodeName(nodes, e.source));
            const dependencies = outEdges
                .map(e => ({ name: this.nodeName(nodes, e.target), type: e.type }));
            apexControllers.push({
                name: node.name,
                calledBy,
                dependencies,
                annotations: node.metadata.annotations || [],
            });
        }
        apexControllers.sort((a, b) => a.name.localeCompare(b.name));
        return { auraComponents, lwcComponents, apexControllers };
    }
    nodeName(nodes, id) {
        const n = nodes.get(id);
        return n ? n.name : id.replace(/^[^:]+:/, '');
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
  font-size: 13px; padding: 0; line-height: 1.6;
}
#header {
  position: sticky; top: 0; z-index: 10;
  background: #2d2d2d; border-bottom: 1px solid #444;
  padding: 10px 20px; display: flex; align-items: center; gap: 12px;
}
#header h1 { font-size: 15px; font-weight: 600; color: #fff; }
.tab-bar { display: flex; gap: 2px; margin-left: 20px; }
.tab {
  padding: 5px 16px; border-radius: 4px 4px 0 0; cursor: pointer;
  background: #383838; color: #999; font-size: 12px; border: 1px solid transparent;
  border-bottom: none; transition: background 0.15s, color 0.15s;
}
.tab:hover { background: #444; color: #ccc; }
.tab.active { background: #1e1e1e; color: #fff; border-color: #555; }
.tab .count {
  background: #555; color: #ccc; border-radius: 8px;
  padding: 0 6px; font-size: 10px; margin-left: 6px;
}
.tab.active .count { background: #0e639c; color: #fff; }
#searchBar {
  margin-left: auto;
  background: #3c3c3c; color: #ccc; border: 1px solid #555;
  padding: 4px 10px; border-radius: 3px; font-size: 12px; width: 220px; outline: none;
}
.panel { display: none; padding: 16px 20px 40px; }
.panel.active { display: block; }
.component-card {
  background: #252526; border: 1px solid #383838; border-radius: 6px;
  margin-bottom: 10px; overflow: hidden;
}
.card-header {
  padding: 10px 14px; cursor: pointer; display: flex;
  align-items: center; gap: 10px; user-select: none;
}
.card-header:hover { background: #2a2d2e; }
.card-chevron {
  font-size: 10px; color: #888; transition: transform 0.2s;
  width: 14px; text-align: center; flex-shrink: 0;
}
.component-card.open .card-chevron { transform: rotate(90deg); }
.card-name { font-weight: 600; color: #fff; font-size: 13px; }
.card-badge {
  font-size: 10px; padding: 1px 7px; border-radius: 3px;
  font-weight: 500; text-transform: uppercase; letter-spacing: 0.3px;
}
.badge-aura { background: #4a2050; color: #c586c0; }
.badge-lwc { background: #1e4f45; color: #4ec9b0; }
.badge-apex { background: #1e3a5f; color: #569cd6; }
.badge-unused { background: #4a2020; color: #f48771; }
.badge-exposed { background: #2a3a2a; color: #6a9955; }
.card-tags { display: flex; gap: 4px; flex-wrap: wrap; margin-left: auto; }
.card-body { display: none; padding: 0 14px 12px; }
.component-card.open .card-body { display: block; }
.conn-section { margin-top: 8px; }
.conn-label {
  font-size: 11px; color: #888; text-transform: uppercase;
  letter-spacing: 0.5px; margin-bottom: 4px; font-weight: 600;
}
.conn-list { list-style: none; padding: 0; }
.conn-list li {
  padding: 3px 0 3px 16px; position: relative; font-size: 12px;
}
.conn-list li::before {
  content: ''; position: absolute; left: 4px; top: 10px;
  width: 6px; height: 6px; border-radius: 1px;
}
.conn-apex li::before { background: #569cd6; }
.conn-lwc li::before { background: #4ec9b0; }
.conn-aura li::before { background: #c586c0; }
.conn-trigger li::before { background: #ce9178; }
.conn-event li::before { background: #dcdcaa; }
.conn-generic li::before { background: #888; }
.conn-item-type { color: #666; font-size: 11px; margin-left: 4px; }
.empty-state {
  text-align: center; padding: 60px 20px; color: #666; font-size: 14px;
}
.summary-row {
  display: flex; gap: 8px; flex-wrap: wrap; padding: 10px 0 6px;
  border-bottom: 1px solid #333; margin-bottom: 12px;
}
.summary-stat {
  font-size: 12px; color: #999;
}
.summary-stat strong { color: #ccc; }
</style>
</head>
<body>
<div id="header">
  <h1>Structure Report</h1>
  <div class="tab-bar">
    <div class="tab active" data-panel="aura">Aura<span class="count" id="auraCount">0</span></div>
    <div class="tab" data-panel="lwc">LWC<span class="count" id="lwcCount">0</span></div>
    <div class="tab" data-panel="controllers">Controllers<span class="count" id="ctrlCount">0</span></div>
  </div>
  <input type="text" id="searchBar" placeholder="Filter components..." />
</div>

<div class="panel active" id="panel-aura"></div>
<div class="panel" id="panel-lwc"></div>
<div class="panel" id="panel-controllers"></div>

<script>
try {
  var data = JSON.parse(atob("${dataBase64}"));

  document.getElementById('auraCount').textContent = data.auraComponents.length;
  document.getElementById('lwcCount').textContent = data.lwcComponents.length;
  document.getElementById('ctrlCount').textContent = data.apexControllers.length;

  /* --- Tab switching --- */
  var tabs = document.querySelectorAll('.tab');
  var panels = document.querySelectorAll('.panel');
  for (var t = 0; t < tabs.length; t++) {
    tabs[t].addEventListener('click', function() {
      for (var i = 0; i < tabs.length; i++) { tabs[i].classList.remove('active'); }
      for (var i = 0; i < panels.length; i++) { panels[i].classList.remove('active'); }
      this.classList.add('active');
      document.getElementById('panel-' + this.getAttribute('data-panel')).classList.add('active');
    });
  }

  /* --- Helpers --- */
  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  function connSection(label, items, cssClass) {
    if (!items || items.length === 0) return '';
    var html = '<div class="conn-section"><div class="conn-label">' + esc(label) + '</div>';
    html += '<ul class="conn-list ' + cssClass + '">';
    for (var i = 0; i < items.length; i++) {
      if (typeof items[i] === 'string') {
        html += '<li>' + esc(items[i]) + '</li>';
      } else {
        html += '<li>' + esc(items[i].name) + '<span class="conn-item-type">' + esc(items[i].type) + '</span></li>';
      }
    }
    html += '</ul></div>';
    return html;
  }

  function toggleCard(ev) {
    var card = ev.currentTarget.parentElement;
    card.classList.toggle('open');
  }

  /* --- Render Aura --- */
  var auraPanel = document.getElementById('panel-aura');
  if (data.auraComponents.length === 0) {
    auraPanel.innerHTML = '<div class="empty-state">No Aura components found</div>';
  } else {
    var auraHtml = '<div class="summary-row">';
    auraHtml += '<span class="summary-stat"><strong>' + data.auraComponents.length + '</strong> components</span>';
    var auraWithCtrl = 0, auraWithChildren = 0;
    for (var i = 0; i < data.auraComponents.length; i++) {
      if (data.auraComponents[i].apexController.length > 0) auraWithCtrl++;
      if (data.auraComponents[i].childAura.length + data.auraComponents[i].childLwc.length > 0) auraWithChildren++;
    }
    auraHtml += '<span class="summary-stat"><strong>' + auraWithCtrl + '</strong> with Apex controller</span>';
    auraHtml += '<span class="summary-stat"><strong>' + auraWithChildren + '</strong> with child components</span>';
    auraHtml += '</div>';
    for (var i = 0; i < data.auraComponents.length; i++) {
      var a = data.auraComponents[i];
      var tags = '<span class="card-badge badge-aura">Aura</span>';
      if (a.isUnused) tags += '<span class="card-badge badge-unused">Unused</span>';
      if (a.isExposed) tags += '<span class="card-badge badge-exposed">Exposed</span>';

      auraHtml += '<div class="component-card" data-name="' + esc(a.name.toLowerCase()) + '">';
      auraHtml += '<div class="card-header" onclick="this.parentElement.classList.toggle(\'open\')">';
      auraHtml += '<span class="card-chevron">&#9654;</span>';
      auraHtml += '<span class="card-name">' + esc(a.name) + '</span>';
      auraHtml += '<div class="card-tags">' + tags + '</div>';
      auraHtml += '</div>';
      auraHtml += '<div class="card-body">';
      auraHtml += connSection('Apex Controller', a.apexController, 'conn-apex');
      auraHtml += connSection('Child Aura Components', a.childAura, 'conn-aura');
      auraHtml += connSection('Child LWC Components', a.childLwc, 'conn-lwc');
      auraHtml += connSection('Dynamic Creates', a.dynamicCreates, 'conn-generic');
      auraHtml += connSection('Events', a.events, 'conn-event');
      auraHtml += connSection('Attributes', a.attributes, 'conn-generic');
      if (!a.apexController.length && !a.childAura.length && !a.childLwc.length &&
          !a.dynamicCreates.length && !a.events.length) {
        auraHtml += '<div style="color:#666;font-size:12px;padding:4px 0;">No connections found</div>';
      }
      auraHtml += '</div></div>';
    }
    auraPanel.innerHTML = auraHtml;
  }

  /* --- Render LWC --- */
  var lwcPanel = document.getElementById('panel-lwc');
  if (data.lwcComponents.length === 0) {
    lwcPanel.innerHTML = '<div class="empty-state">No LWC components found</div>';
  } else {
    var lwcHtml = '<div class="summary-row">';
    lwcHtml += '<span class="summary-stat"><strong>' + data.lwcComponents.length + '</strong> components</span>';
    var lwcWithChildren = 0, lwcWithApex = 0, lwcParents = 0;
    for (var i = 0; i < data.lwcComponents.length; i++) {
      if (data.lwcComponents[i].childLwc.length > 0) lwcWithChildren++;
      if (data.lwcComponents[i].apexImports.length > 0) lwcWithApex++;
      if (data.lwcComponents[i].parentComponents.length > 0) lwcParents++;
    }
    lwcHtml += '<span class="summary-stat"><strong>' + lwcWithChildren + '</strong> with child LWC</span>';
    lwcHtml += '<span class="summary-stat"><strong>' + lwcWithApex + '</strong> calling Apex</span>';
    lwcHtml += '<span class="summary-stat"><strong>' + lwcParents + '</strong> used as children</span>';
    lwcHtml += '</div>';
    for (var i = 0; i < data.lwcComponents.length; i++) {
      var c = data.lwcComponents[i];
      var tags = '<span class="card-badge badge-lwc">LWC</span>';
      if (c.isUnused) tags += '<span class="card-badge badge-unused">Unused</span>';
      if (c.isExposed) tags += '<span class="card-badge badge-exposed">Exposed</span>';
      if (c.parentComponents.length > 0) tags += '<span class="card-badge" style="background:#2a2d3e;color:#9cdcfe;">Child</span>';
      if (c.childLwc.length > 0) tags += '<span class="card-badge" style="background:#2a3d2e;color:#b5cea8;">Parent</span>';

      lwcHtml += '<div class="component-card" data-name="' + esc(c.name.toLowerCase()) + '">';
      lwcHtml += '<div class="card-header" onclick="this.parentElement.classList.toggle(\'open\')">';
      lwcHtml += '<span class="card-chevron">&#9654;</span>';
      lwcHtml += '<span class="card-name">' + esc(c.name) + '</span>';
      lwcHtml += '<div class="card-tags">' + tags + '</div>';
      lwcHtml += '</div>';
      lwcHtml += '<div class="card-body">';
      lwcHtml += connSection('Used By (Parents)', c.parentComponents, 'conn-lwc');
      lwcHtml += connSection('Child LWC Components', c.childLwc, 'conn-lwc');
      lwcHtml += connSection('Apex Controllers', c.apexImports, 'conn-apex');
      lwcHtml += connSection('Wire Adapters', c.wireAdapters, 'conn-generic');
      lwcHtml += connSection('@api Properties', c.apiProperties, 'conn-generic');
      if (c.targets.length > 0) {
        lwcHtml += connSection('Targets', c.targets, 'conn-generic');
      }
      if (!c.parentComponents.length && !c.childLwc.length && !c.apexImports.length && !c.wireAdapters.length) {
        lwcHtml += '<div style="color:#666;font-size:12px;padding:4px 0;">No connections found</div>';
      }
      lwcHtml += '</div></div>';
    }
    lwcPanel.innerHTML = lwcHtml;
  }

  /* --- Render Controllers --- */
  var ctrlPanel = document.getElementById('panel-controllers');
  if (data.apexControllers.length === 0) {
    ctrlPanel.innerHTML = '<div class="empty-state">No Apex controllers found (no Apex classes referenced by LWC or Aura)</div>';
  } else {
    var ctrlHtml = '<div class="summary-row">';
    ctrlHtml += '<span class="summary-stat"><strong>' + data.apexControllers.length + '</strong> controllers</span>';
    ctrlHtml += '</div>';
    for (var i = 0; i < data.apexControllers.length; i++) {
      var ctrl = data.apexControllers[i];
      var tags = '<span class="card-badge badge-apex">Controller</span>';

      ctrlHtml += '<div class="component-card" data-name="' + esc(ctrl.name.toLowerCase()) + '">';
      ctrlHtml += '<div class="card-header" onclick="this.parentElement.classList.toggle(\'open\')">';
      ctrlHtml += '<span class="card-chevron">&#9654;</span>';
      ctrlHtml += '<span class="card-name">' + esc(ctrl.name) + '</span>';
      ctrlHtml += '<div class="card-tags">' + tags + '</div>';
      ctrlHtml += '</div>';
      ctrlHtml += '<div class="card-body">';
      ctrlHtml += connSection('Called By', ctrl.calledBy, 'conn-lwc');
      ctrlHtml += connSection('Dependencies', ctrl.dependencies, 'conn-apex');
      if (ctrl.annotations.length > 0) {
        ctrlHtml += connSection('Annotations', ctrl.annotations, 'conn-generic');
      }
      ctrlHtml += '</div></div>';
    }
    ctrlPanel.innerHTML = ctrlHtml;
  }

  /* --- Search/filter --- */
  document.getElementById('searchBar').addEventListener('input', function() {
    var term = this.value.toLowerCase();
    var activePanel = document.querySelector('.panel.active');
    if (!activePanel) return;
    var cards = activePanel.querySelectorAll('.component-card');
    for (var i = 0; i < cards.length; i++) {
      var name = cards[i].getAttribute('data-name') || '';
      cards[i].style.display = (!term || name.indexOf(term) >= 0) ? '' : 'none';
    }
  });

} catch(err) {
  document.body.innerHTML = '<div style="color:#f48771;padding:20px;">Report error: ' + err.message + '</div>';
}
</script>
</body>
</html>`;
    }
}
exports.ReportWebviewProvider = ReportWebviewProvider;
//# sourceMappingURL=reportWebview.js.map