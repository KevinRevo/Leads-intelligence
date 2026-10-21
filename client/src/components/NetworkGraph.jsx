import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  User, 
  Share2, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  ExternalLink,
  ShieldCheck,
  Sparkles,
  X,
  Phone,
  Mail,
  FileText,
  Globe
} from 'lucide-react';

export default function NetworkGraph({ network, onClose }) {
  const [selectedNode, setSelectedNode] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  const [nodePositions, setNodePositions] = useState({});
  const [draggingNodeId, setDraggingNodeId] = useState(null);

  useEffect(() => {
    if (!network || !Array.isArray(network.nodes) || network.nodes.length === 0) return;

    const positions = {};
    const center = { x: 430, y: 280 };

    const targetNode = network.nodes.find(n => n.type === 'target_company') || network.nodes[0];
    if (targetNode) {
      positions[targetNode.id] = { ...center };
    }

    const otherNodes = network.nodes.filter(n => n.id !== targetNode?.id);
    const personNodes = otherNodes.filter(n => n.type.includes('person'));
    const companyNodes = otherNodes.filter(n => !n.type.includes('person'));

    // Place physical persons (Dirigeants / Board / CFO) in inner ring
    const personRadius = 165;
    const personAngles = {};
    personNodes.forEach((node, index) => {
      const angle = (2 * Math.PI * index) / (personNodes.length || 1) - Math.PI / 2;
      personAngles[node.id] = angle;
      positions[node.id] = {
        x: center.x + personRadius * Math.cos(angle),
        y: center.y + personRadius * Math.sin(angle),
      };
    });

    // Place sister / holding / foreign companies in outer ring
    const sisterRadius = 295;
    companyNodes.forEach((node, index) => {
      const edge = (network.edges || []).find(e => e.target === node.id || e.source === node.id);
      const connectedId = edge ? (edge.source === node.id ? edge.target : edge.source) : null;
      const baseAngle = connectedId && personAngles[connectedId] !== undefined
        ? personAngles[connectedId] + ((index % 3) - 1) * 0.38
        : (2 * Math.PI * index) / (companyNodes.length || 1) + Math.PI / 4;

      positions[node.id] = {
        x: center.x + sisterRadius * Math.cos(baseAngle),
        y: center.y + sisterRadius * Math.sin(baseAngle),
      };
    });

    setNodePositions(positions);
    setSelectedNode(targetNode || null);
  }, [network]);

  const handleMouseDown = (e) => {
    if (e.target.tagName === 'svg' || e.target.id === 'graph-bg') {
      setIsDragging(true);
      setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    }
  };

  const handleMouseMove = (e) => {
    if (isDragging) {
      setOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    } else if (draggingNodeId) {
      const svg = document.getElementById('network-svg');
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const newX = (e.clientX - rect.left - offset.x) / zoom;
      const newY = (e.clientY - rect.top - offset.y) / zoom;

      setNodePositions(prev => ({
        ...prev,
        [draggingNodeId]: { x: newX, y: newY }
      }));
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDraggingNodeId(null);
  };

  const getNodeColor = (node) => {
    const type = typeof node === 'string' ? node : node?.type;
    const isForeign = typeof node === 'object' && Boolean(node?.isForeign);

    if (isForeign) {
      return { fill: '#d97706', stroke: '#fbbf24', badge: `🌍 Entité Étrangère (${node.countryName || node.country || 'International'})` };
    }
    switch (type) {
      case 'target_company':
        return { fill: '#0075eb', stroke: '#38bdf8', badge: 'Société Cible' };
      case 'person_cfo':
        return { fill: '#2563eb', stroke: '#60a5fa', badge: '👤 Co-Dirigeant / CFO (Personne Physique)' };
      case 'person':
        return { fill: '#7c3aed', stroke: '#c084fc', badge: '👤 Dirigeant / Board (Personne Physique)' };
      case 'sister_company':
        return { fill: '#059669', stroke: '#34d399', badge: '🏢 Holding / Société Liée (Personne Morale)' };
      default:
        return { fill: '#4b5563', stroke: '#9ca3af', badge: 'Entité' };
    }
  };

  const targetNode = network?.nodes?.find(n => n.type === 'target_company') || network?.nodes?.[0];
  const northDataMainUrl = network?.northDataUrl || targetNode?.northDataUrl || `https://www.northdata.fr/?query=${encodeURIComponent(targetNode?.label || '')}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 animate-fade-in">
      <div className="bg-white dark:bg-[#121824] border border-slate-200 dark:border-slate-700/80 rounded-2xl w-full max-w-6xl h-[90vh] flex flex-col shadow-2xl overflow-hidden transition-colors">
        
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-[#161f30] transition-colors flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 border border-blue-500/30 rounded-xl text-blue-600 dark:text-blue-400">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-wide">
                  Cartographie North Data — Dirigeants Physiques, Holdings & Liens Internationaux
                </h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 font-semibold border border-blue-200 dark:border-blue-500/30">
                  {targetNode?.label || network?.companyName}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Visualisation des décideurs (personnes physiques), sociétés mères / holdings et rattachements étrangers (RCS / FOSC / North Data)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Direct North Data Button */}
            <a
              href={northDataMainUrl}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
              title="Ouvrir le graphe de détention et l'historique sur North Data Europe"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Graphe North Data</span>
              <ExternalLink className="w-3 h-3" />
            </a>

            {/* Zoom Controls */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800/80 rounded-lg p-1 border border-slate-200 dark:border-slate-700">
              <button 
                onClick={() => setZoom(z => Math.min(z + 0.15, 2))}
                className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded transition"
                title="Zoomer"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setZoom(z => Math.max(z - 0.15, 0.5))}
                className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded transition"
                title="Dézoomer"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button 
                onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }}
                className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded transition"
                title="Réinitialiser la vue"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex overflow-hidden relative">
          
          {/* Main SVG Graph */}
          <div 
            className="flex-1 bg-slate-50 dark:bg-[#0b0f17] relative cursor-grab active:cursor-grabbing overflow-hidden select-none transition-colors"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          >
            <svg
              id="network-svg"
              className="w-full h-full"
              style={{
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                transformOrigin: '0 0',
                transition: isDragging || draggingNodeId ? 'none' : 'transform 0.1s ease-out',
              }}
            >
              <rect id="graph-bg" width="100%" height="100%" fill="transparent" />

              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" className="text-slate-200 dark:text-slate-800" strokeWidth="0.5" opacity="0.6" />
                </pattern>
                <marker id="arrow" viewBox="0 0 10 10" refX="28" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
                </marker>
                <marker id="arrow-foreign" viewBox="0 0 10 10" refX="28" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#f59e0b" />
                </marker>
              </defs>
              <rect width="2400" height="2400" x="-600" y="-600" fill="url(#grid)" pointerEvents="none" />

              {/* Draw Edges */}
              {network?.edges?.map(edge => {
                const sourcePos = nodePositions[edge.source];
                const targetPos = nodePositions[edge.target];
                if (!sourcePos || !targetPos) return null;

                const midX = (sourcePos.x + targetPos.x) / 2;
                const midY = (sourcePos.y + targetPos.y) / 2;
                const isCrossBorder = edge.type === 'cross_border';

                return (
                  <g key={edge.id}>
                    <line
                      x1={sourcePos.x}
                      y1={sourcePos.y}
                      x2={targetPos.x}
                      y2={targetPos.y}
                      stroke={isCrossBorder ? '#f59e0b' : '#94a3b8'}
                      className={isCrossBorder ? '' : 'dark:stroke-slate-600'}
                      strokeWidth={isCrossBorder ? '2.5' : '2'}
                      strokeDasharray={edge.type === 'cross_mandate' || isCrossBorder ? '5 3' : 'none'}
                      markerEnd={isCrossBorder ? 'url(#arrow-foreign)' : 'url(#arrow)'}
                    />
                    <rect
                      x={midX - 58}
                      y={midY - 10}
                      width="116"
                      height="18"
                      rx="4"
                      className={isCrossBorder ? 'fill-amber-950 stroke-amber-500' : 'fill-white dark:fill-slate-800 stroke-slate-300 dark:stroke-slate-700'}
                      strokeWidth="1"
                    />
                    <text
                      x={midX}
                      y={midY + 3}
                      className={isCrossBorder ? 'fill-amber-200 font-bold pointer-events-none select-none' : 'fill-slate-600 dark:fill-slate-300 font-medium pointer-events-none select-none'}
                      fontSize="9"
                      textAnchor="middle"
                    >
                      {edge.label ? (edge.label.length > 22 ? edge.label.slice(0, 20) + '…' : edge.label) : 'Mandat'}
                    </text>
                  </g>
                );
              })}

              {/* Draw Nodes */}
              {network?.nodes?.map(node => {
                const pos = nodePositions[node.id];
                if (!pos) return null;

                const isSelected = selectedNode?.id === node.id;
                const colors = getNodeColor(node);
                const isTarget = node.type === 'target_company';
                const isPerson = node.type.includes('person');

                const radius = isTarget ? 38 : (isPerson ? 28 : 32);

                return (
                  <g
                    key={node.id}
                    transform={`translate(${pos.x}, ${pos.y})`}
                    className="cursor-pointer group"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedNode(node);
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setDraggingNodeId(node.id);
                    }}
                  >
                    {(isSelected || isTarget || node.isForeign) && (
                      <circle
                        r={radius + 8}
                        fill="none"
                        stroke={colors.stroke}
                        strokeWidth="2"
                        strokeOpacity="0.5"
                        className={isTarget || node.isForeign ? "animate-pulse" : ""}
                        pointerEvents="none"
                      />
                    )}

                    <circle
                      r={radius}
                      fill={colors.fill}
                      stroke={isSelected ? '#ffffff' : colors.stroke}
                      strokeWidth={isSelected ? '3.5' : '2'}
                      className="transition-all duration-150 group-hover:stroke-white dark:group-hover:stroke-sky-300 shadow-md"
                    />

                    <foreignObject x={-14} y={-14} width="28" height="28" pointerEvents="none">
                      <div className="w-full h-full flex items-center justify-center text-white select-none">
                        {isPerson ? (
                          <User className="w-4 h-4" />
                        ) : (
                          <Building2 className="w-4 h-4" />
                        )}
                      </div>
                    </foreignObject>

                    <text
                      y={radius + 16}
                      className="fill-slate-900 dark:fill-slate-100 font-medium select-none pointer-events-none drop-shadow-xs"
                      fontSize={isTarget ? "12" : "11"}
                      fontWeight={isTarget ? "bold" : "600"}
                      textAnchor="middle"
                    >
                      {node.flag && !node.label?.startsWith(node.flag) ? `${node.flag} ` : ''}
                      {node.label?.length > 24 ? node.label.slice(0, 22) + '…' : node.label}
                    </text>

                    {(node.role || node.roleHeld || node.legalForm) && (
                      <text
                        y={radius + 30}
                        className="fill-slate-500 dark:fill-slate-400 select-none pointer-events-none"
                        fontSize="9"
                        textAnchor="middle"
                      >
                        {(node.role || node.roleHeld || node.legalForm).slice(0, 28)}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* Floating Legend */}
            <div className="absolute bottom-4 left-4 bg-white/95 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs flex flex-col gap-1.5 backdrop-blur-sm shadow-xl transition-colors">
              <span className="font-bold text-slate-800 dark:text-slate-200">Légende Cartographie (Style North Data) :</span>
              <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                <span className="w-3 h-3 rounded-full bg-[#0075eb] border border-[#38bdf8]" />
                <span>Société Cible (FR / CH)</span>
              </div>
              <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                <span className="w-3 h-3 rounded-full bg-[#7c3aed] border border-[#c084fc]" />
                <span>👤 Dirigeant / Board (Personne Physique uniquement)</span>
              </div>
              <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                <span className="w-3 h-3 rounded-full bg-[#059669] border border-[#34d399]" />
                <span>🏢 Holding / Société Mère ou Sœur</span>
              </div>
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-semibold">
                <span className="w-3 h-3 rounded-full bg-[#d97706] border border-[#fbbf24]" />
                <span>🌍 Entité Étrangère / Lien International</span>
              </div>
            </div>
          </div>

          {/* Right Info Drawer */}
          {selectedNode && (
            <div className="w-80 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121824] p-4 flex flex-col gap-3.5 overflow-y-auto transition-colors">
              <div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  selectedNode.isForeign ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-500/30' :
                  selectedNode.type === 'target_company' ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30' :
                  selectedNode.type.includes('person') ? 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30' :
                  'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30'
                }`}>
                  {getNodeColor(selectedNode).badge}
                </span>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mt-1.5 leading-snug">
                  {selectedNode.flag && !selectedNode.label?.startsWith(selectedNode.flag) ? `${selectedNode.flag} ` : ''}
                  {selectedNode.label}
                </h3>
              </div>

              <div className="space-y-2.5 text-xs">
                {(selectedNode.role || selectedNode.roleHeld) && (
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700/60">
                    <span className="text-slate-500 dark:text-slate-400 block mb-0.5">Fonction / Lien de détention</span>
                    <span className="text-slate-900 dark:text-white font-semibold">{selectedNode.role || selectedNode.roleHeld}</span>
                  </div>
                )}

                {(selectedNode.registrationNumber || selectedNode.siren) && (
                  <div className="flex justify-between py-1.5 border-b border-slate-200 dark:border-slate-800">
                    <span className="text-slate-500 dark:text-slate-400">N° Registre (SIREN / IDE)</span>
                    <span className="text-slate-800 dark:text-slate-200 font-mono font-semibold">
                      {selectedNode.registrationNumber || selectedNode.siren}
                    </span>
                  </div>
                )}

                {selectedNode.legalForm && (
                  <div className="flex justify-between py-1.5 border-b border-slate-200 dark:border-slate-800">
                    <span className="text-slate-500 dark:text-slate-400">Forme juridique</span>
                    <span className="text-slate-800 dark:text-slate-200 font-semibold">{selectedNode.legalForm}</span>
                  </div>
                )}

                {selectedNode.shareCapital && (
                  <div className="flex justify-between py-1.5 border-b border-slate-200 dark:border-slate-800">
                    <span className="text-slate-500 dark:text-slate-400">Capital Social</span>
                    <span className="text-slate-800 dark:text-slate-200 font-semibold">
                      {selectedNode.shareCapital.toLocaleString()} {selectedNode.country === 'CH' ? 'CHF' : '€'}
                    </span>
                  </div>
                )}

                {selectedNode.revenue && (
                  <div className="flex justify-between py-1.5 border-b border-slate-200 dark:border-slate-800">
                    <span className="text-slate-500 dark:text-slate-400">Chiffre d'Affaires</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                      {selectedNode.revenue.toLocaleString('fr-FR')} €
                    </span>
                  </div>
                )}

                {selectedNode.city && (
                  <div className="flex justify-between py-1.5 border-b border-slate-200 dark:border-slate-800">
                    <span className="text-slate-500 dark:text-slate-400">Localisation / Pays</span>
                    <span className="text-slate-800 dark:text-slate-200 font-medium">
                      {selectedNode.flag ? `${selectedNode.flag} ` : ''}{selectedNode.city}
                    </span>
                  </div>
                )}

                {selectedNode.activity && (
                  <div className="py-1.5 border-b border-slate-200 dark:border-slate-800">
                    <span className="text-slate-500 dark:text-slate-400 block mb-1">Activité / Objet</span>
                    <span className="text-slate-700 dark:text-slate-300 leading-relaxed line-clamp-4">{selectedNode.activity}</span>
                  </div>
                )}

                {/* Direct Contact & North Data info if Physical Person */}
                {selectedNode.type.includes('person') && (
                  <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 rounded-xl p-3 space-y-2 mt-2">
                    <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-300 block">Décideur Personne Physique :</span>
                    {selectedNode.email && (
                      <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 truncate">
                        <Mail className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        <span className="truncate font-mono">{selectedNode.email}</span>
                      </div>
                    )}
                    {selectedNode.phone && (
                      <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                        <Phone className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span className="font-mono">{selectedNode.phone}</span>
                      </div>
                    )}
                    <div className="flex flex-col gap-1.5 pt-1">
                      <a
                        href={selectedNode.northDataUrl || `https://www.northdata.fr/?query=${encodeURIComponent(selectedNode.label)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full py-1.5 px-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg inline-flex items-center justify-center gap-1.5 font-semibold text-xs transition"
                      >
                        <Globe className="w-3.5 h-3.5" />
                        <span>Voir tous ses mandats sur North Data</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      {selectedNode.linkedinUrl && (
                        <a
                          href={selectedNode.linkedinUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="w-full py-1.5 px-2.5 bg-[#0a66c2] hover:bg-[#004182] text-white rounded-lg inline-flex items-center justify-center gap-1.5 font-semibold text-xs transition"
                        >
                          <span>Rechercher sur LinkedIn</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {/* Direct North Data, Registry & LinkedIn links if company node */}
                {!selectedNode.type.includes('person') && (
                  <div className="space-y-1.5 pt-1">
                    <a
                      href={selectedNode.northDataUrl || `https://www.northdata.fr/?query=${encodeURIComponent(selectedNode.label)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full py-1.5 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg flex items-center justify-center gap-1.5 font-semibold text-xs transition"
                    >
                      <Globe className="w-3.5 h-3.5" />
                      <span>Voir l'entité sur North Data</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <a
                      href={
                        selectedNode.country === 'CH'
                          ? `https://www.zefix.ch/fr/search/entity/list?name=${encodeURIComponent(selectedNode.label)}`
                          : `https://www.pappers.fr/recherche?q=${encodeURIComponent(selectedNode.siren || selectedNode.registrationNumber || selectedNode.label)}`
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="w-full py-1.5 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg flex items-center justify-center gap-1.5 font-semibold text-xs transition"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>{selectedNode.country === 'CH' ? 'Consulter sur Zefix (CH)' : 'Consulter sur Pappers (FR)'}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}

                <div className="pt-1">
                  <div className="p-3 bg-slate-50 dark:bg-gradient-to-br dark:from-slate-800 dark:to-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                    <span className="text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1.5 mb-1 text-[11px]">
                      <ShieldCheck className="w-3.5 h-3.5" /> Opportunité Multi-Comptes / FX
                    </span>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                      {selectedNode.isForeign
                        ? `Cette société est reliée à une entité en ${selectedNode.countryName || selectedNode.country}. Fort besoin de transferts internationaux et comptes multi-devises Revolut Business.`
                        : selectedNode.type.includes('company')
                        ? "Vérifier la chaîne de détention sur North Data pour proposer un onboarding groupé (Holding + Filiales)."
                        : "Approcher cette personne physique en mentionnant ses mandats actifs pour ouvrir plusieurs comptes Revolut Business simultanément."}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
