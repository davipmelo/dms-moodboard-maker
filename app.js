/**
 * DM'S MOODBOARD MAKER - Core Application Logic
 * Organic Masonry Grid Layout, Infinite Canvas Pan & Zoom,
 * GIF frame-accurate animation, clipboard paste, and multi-scale export.
 */

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Global State
  // ---------------------------------------------------------------------------
  const state = {
    items: [], // Array of { id, type, src, blob, width, height, gifData, fit, flipH, title }
    settings: {
      gridMode: 'masonry', // 'masonry' (organic) | 'uniform' (fixed aspect ratio)
      cols: 3,
      rows: 2,
      gap: 16,
      padding: 24,
      radius: 8,
      aspect: '1/1', // used when gridMode === 'uniform'
      defaultFit: 'cover',
      bgColor: '#0e1014',
      showTitle: true,
      titleText: "DM'S MOODBOARD // CONCEPT & REFERENCES",
      subtitleText: 'Visual Exploration • Curated Textures & Aesthetics',
      textColor: '#ffffff',
      showPalette: true,
      palette: ['#0e1014', '#ffbb00', '#9ca3af', '#242832', '#f9fafb']
    },
    export: {
      format: 'jpg', // 'jpg' | 'pdf' | 'mp4'
      scale: 2, // 1x, 2x, 3x, 4x
      duration: 5.0, // seconds
      fps: 30,
      jpgQuality: 0.95
    },
    // Viewport Pan & Zoom State
    pan: {
      x: 0,
      y: 0,
      zoom: 1.0,
      isPanning: false,
      startX: 0,
      startY: 0,
      initialX: 0,
      initialY: 0,
      isSpaceDown: false
    },
    ffmpegAvailable: false,
    encoder: null,
    draggedIndex: null
  };

  // History Stack for Undo / Redo
  const history = {
    past: [],
    future: []
  };

  function pushHistory() {
    const snapshot = JSON.stringify({
      items: state.items.map(it => ({
        id: it.id,
        type: it.type,
        src: it.src,
        fit: it.fit,
        flipH: it.flipH,
        title: it.title,
        width: it.width,
        height: it.height
      })),
      settings: state.settings
    });
    history.past.push(snapshot);
    if (history.past.length > 25) history.past.shift();
    history.future = [];
    updateUndoRedoButtons();
  }

  function undo() {
    if (history.past.length === 0) return;
    const current = JSON.stringify({
      items: state.items.map(it => ({
        id: it.id,
        type: it.type,
        src: it.src,
        fit: it.fit,
        flipH: it.flipH,
        title: it.title,
        width: it.width,
        height: it.height
      })),
      settings: state.settings
    });
    history.future.push(current);
    const prev = JSON.parse(history.past.pop());
    restoreSnapshot(prev);
    updateUndoRedoButtons();
    showToast('Ação desfeita', 'info');
  }

  function redo() {
    if (history.future.length === 0) return;
    const current = JSON.stringify({
      items: state.items.map(it => ({
        id: it.id,
        type: it.type,
        src: it.src,
        fit: it.fit,
        flipH: it.flipH,
        title: it.title,
        width: it.width,
        height: it.height
      })),
      settings: state.settings
    });
    history.past.push(current);
    const next = JSON.parse(history.future.pop());
    restoreSnapshot(next);
    updateUndoRedoButtons();
    showToast('Ação refeita', 'info');
  }

  function restoreSnapshot(snap) {
    state.settings = Object.assign({}, state.settings, snap.settings);
    syncSettingsUI();
    state.items = [];
    renderGrid();
    if (snap.items && snap.items.length) {
      snap.items.forEach(it => {
        addItemFromUrlOrData(it.src, it.type, {
          fit: it.fit,
          flipH: it.flipH,
          title: it.title,
          skipHistory: true
        });
      });
    }
    updateStatsPill();
  }

  function updateUndoRedoButtons() {
    const btnUndo = document.getElementById('btnUndo');
    const btnRedo = document.getElementById('btnRedo');
    if (btnUndo) btnUndo.style.opacity = history.past.length > 0 ? '1' : '0.35';
    if (btnRedo) btnRedo.style.opacity = history.future.length > 0 ? '1' : '0.35';
  }

  // ---------------------------------------------------------------------------
  // Toast Notifications
  // ---------------------------------------------------------------------------
  function showToast(message, type = 'info', duration = 3200) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    let iconSvg = '';
    if (type === 'error') {
      iconSvg = `<svg class="toast-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
    } else if (type === 'success') {
      iconSvg = `<svg class="toast-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
    } else {
      iconSvg = `<svg class="toast-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
    }
    toast.innerHTML = `${iconSvg}<span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px) scale(0.96)';
      toast.style.transition = 'all 0.2s ease';
      setTimeout(() => toast.remove(), 220);
    }, duration);
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  // ---------------------------------------------------------------------------
  // Server Info Check
  // ---------------------------------------------------------------------------
  async function checkServerInfo() {
    try {
      const res = await fetch('/api/info');
      if (res.ok) {
        const data = await res.json();
        state.ffmpegAvailable = !!data.ffmpeg;
        state.encoder = data.encoder;
      }
    } catch (e) {
      console.warn('Servidor local:', e);
    }
  }

  // ---------------------------------------------------------------------------
  // Media Loading & GIF Decoding
  // ---------------------------------------------------------------------------
  async function fetchMediaWithProxy(url) {
    if (url.startsWith('data:') || url.startsWith('blob:')) {
      const resp = await fetch(url);
      const blob = await resp.blob();
      return { blob, contentType: blob.type, finalUrl: url };
    }

    // 1. Try local server proxy first if running locally
    try {
      const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
      const resp = await fetch(proxyUrl);
      if (resp.ok) {
        const contentType = resp.headers.get('Content-Type') || 'application/octet-stream';
        const finalUrl = resp.headers.get('X-Final-Url') || url;
        const blob = await resp.blob();
        return { blob, contentType, finalUrl };
      }
    } catch (err) {
      // Local server proxy not reachable (e.g. on GitHub Pages)
    }

    // 2. Direct fetch (works for CORS-enabled image hosts like Unsplash, Imgur, Tenor, Giphy, GitHub, etc.)
    try {
      const directResp = await fetch(url, { mode: 'cors' });
      if (directResp.ok) {
        const contentType = directResp.headers.get('Content-Type') || 'image/jpeg';
        const blob = await directResp.blob();
        return { blob, contentType, finalUrl: url };
      }
    } catch (err) {
      // Direct CORS fetch blocked
    }

    // 3. Fallback to public CORS proxy (for static hosting on GitHub Pages)
    const publicProxies = [
      `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
      `https://corsproxy.io/?url=${encodeURIComponent(url)}`
    ];

    for (const pUrl of publicProxies) {
      try {
        const pResp = await fetch(pUrl);
        if (pResp.ok) {
          const blob = await pResp.blob();
          const contentType = blob.type || 'image/jpeg';
          return { blob, contentType, finalUrl: url };
        }
      } catch (err) {}
    }

    throw new Error('Não foi possível carregar a imagem deste link devido a restrições CORS da origem. Você pode salvar a imagem e fazer upload direto pelo botão ou arrastando o arquivo.');
  }

  async function decodeGifFrames(arrayBuffer) {
    if (typeof window.GifReader === 'undefined') return null;
    try {
      const reader = new window.GifReader(new Uint8Array(arrayBuffer));
      const numFrames = reader.numFrames();
      const width = reader.width;
      const height = reader.height;
      const frames = [];
      let totalDurationMs = 0;

      const compCanvas = document.createElement('canvas');
      compCanvas.width = width;
      compCanvas.height = height;
      const compCtx = compCanvas.getContext('2d');

      for (let i = 0; i < numFrames; i++) {
        const frameInfo = reader.frameInfo(i);
        const delayMs = (frameInfo.delay && frameInfo.delay > 0 ? frameInfo.delay : 10) * 10;

        const frameImgData = compCtx.createImageData(width, height);
        reader.decodeAndBlitFrameRGBA(i, frameImgData.data);

        const frameCanvas = document.createElement('canvas');
        frameCanvas.width = width;
        frameCanvas.height = height;
        const frameCtx = frameCanvas.getContext('2d');
        frameCtx.putImageData(frameImgData, 0, 0);

        frames.push({
          canvas: frameCanvas,
          delay: delayMs,
          startMs: totalDurationMs,
          endMs: totalDurationMs + delayMs
        });
        totalDurationMs += delayMs;
      }

      return {
        width,
        height,
        frames,
        totalDurationMs: totalDurationMs || 1000,
        totalDurationSec: (totalDurationMs || 1000) / 1000
      };
    } catch (err) {
      console.error('Falha ao decodificar GIF:', err);
      return null;
    }
  }

  async function addItemFromUrlOrData(rawUrl, hintType = null, opts = {}) {
    const url = rawUrl.trim();
    if (!url) return;

    if (!opts.skipHistory) pushHistory();

    const tempId = 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);

    try {
      const { blob, contentType } = await fetchMediaWithProxy(url);
      const isGif = contentType.includes('gif') || url.toLowerCase().includes('.gif');
      const isVideo = contentType.includes('video') || url.toLowerCase().match(/\.(mp4|webm)$/);

      let gifData = null;
      let displayUrl = URL.createObjectURL(blob);
      let detectedType = isGif ? 'gif' : isVideo ? 'video' : 'image';

      let naturalWidth = 800;
      let naturalHeight = 600;

      if (isGif) {
        const ab = await blob.arrayBuffer();
        gifData = await decodeGifFrames(ab);
        if (gifData) {
          naturalWidth = gifData.width;
          naturalHeight = gifData.height;
        }
      } else if (!isVideo) {
        await new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            naturalWidth = img.naturalWidth || 800;
            naturalHeight = img.naturalHeight || 600;
            resolve();
          };
          img.onerror = () => resolve();
          img.src = displayUrl;
        });
      }

      const newItem = {
        id: tempId,
        type: detectedType,
        src: displayUrl,
        blob: blob,
        gifData: gifData,
        width: naturalWidth,
        height: naturalHeight,
        fit: opts.fit || state.settings.defaultFit,
        flipH: !!opts.flipH,
        title: opts.title || ''
      };

      state.items.push(newItem);
      renderGrid();
      updateStatsPill();
      extractDominantColors();
      showToast('Imagem adicionada!', 'success');
      return newItem;
    } catch (err) {
      showToast(err.message || 'Erro ao carregar link.', 'error', 4500);
      renderGrid();
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Grid Rendering (Masonry Organic vs Uniform Grid)
  // ---------------------------------------------------------------------------
  function renderGrid() {
    const grid = document.getElementById('moodboardGrid');
    const board = document.getElementById('moodboardBoard');
    if (!grid || !board) return;

    const cols = parseInt(state.settings.cols, 10) || 3;
    const gap = state.settings.gap;
    const padding = state.settings.padding;
    const radius = state.settings.radius;

    // Apply board styles
    board.style.backgroundColor = state.settings.bgColor;
    board.style.padding = `${padding}px`;

    // Title & Subtitle visibility and styling
    const header = document.getElementById('boardHeader');
    if (header) {
      header.style.display = state.settings.showTitle ? 'flex' : 'none';
      const dispTitle = document.getElementById('displayTitle');
      const dispSubtitle = document.getElementById('displaySubtitle');
      const txtColor = state.settings.textColor || '#ffffff';
      if (dispTitle) {
        if (dispTitle.textContent !== state.settings.titleText) {
          dispTitle.textContent = state.settings.titleText;
        }
        dispTitle.style.color = txtColor;
      }
      if (dispSubtitle) {
        if (dispSubtitle.textContent !== state.settings.subtitleText) {
          dispSubtitle.textContent = state.settings.subtitleText;
        }
        dispSubtitle.style.color = txtColor;
      }
    }

    // Palette strip visibility
    const paletteStrip = document.getElementById('boardPaletteStrip');
    if (paletteStrip) {
      paletteStrip.style.display = state.settings.showPalette ? 'flex' : 'none';
    }

    grid.innerHTML = '';

    if (state.settings.gridMode === 'masonry') {
      // -----------------------------------------------------------------------
      // ORGANIC MASONRY (Reference 2 Aesthetic: Zero Dead Space!)
      // -----------------------------------------------------------------------
      grid.className = 'moodboard-grid layout-masonry';
      grid.style.display = 'flex';
      grid.style.gap = `${gap}px`;

      // Create column containers
      const colContainers = [];
      const colHeights = new Array(cols).fill(0);

      for (let c = 0; c < cols; c++) {
        const colDiv = document.createElement('div');
        colDiv.className = 'masonry-col';
        colDiv.style.flex = '1';
        colDiv.style.display = 'flex';
        colDiv.style.flexDirection = 'column';
        colDiv.style.gap = `${gap}px`;
        colDiv.dataset.colIndex = c;

        // Support dropping into specific column
        colDiv.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = state.draggedIndex !== null ? 'move' : 'copy';
        });

        colDiv.addEventListener('drop', (e) => {
          if (e.target === colDiv && state.draggedIndex !== null && state.draggedIndex !== undefined) {
            e.preventDefault();
            e.stopPropagation();
            const fromIndex = state.draggedIndex;
            pushHistory();
            const [movedItem] = state.items.splice(fromIndex, 1);
            state.items.push(movedItem);
            renderGrid();
            showToast('Imagem reposicionada', 'info');
            state.draggedIndex = null;
          }
        });

        grid.appendChild(colDiv);
        colContainers.push(colDiv);
      }

      if (state.items.length === 0) {
        // Show empty prompt slot in first column
        const emptyCell = createEmptySlotElement();
        emptyCell.style.borderRadius = `${radius}px`;
        colContainers[0].appendChild(emptyCell);
      } else {
        // Distribute items using greedy shortest column packing
        state.items.forEach((item, itemIndex) => {
          // Find column with minimal height
          let minColIndex = 0;
          let minH = colHeights[0];
          for (let c = 1; c < cols; c++) {
            if (colHeights[c] < minH) {
              minH = colHeights[c];
              minColIndex = c;
            }
          }

          const cell = createCellElement(item, itemIndex, radius, false);
          colContainers[minColIndex].appendChild(cell);

          // Approximate rendered aspect ratio for balance
          const aspect = (item.height && item.width) ? (item.height / item.width) : 1.0;
          colHeights[minColIndex] += aspect * 300 + gap;
        });
      }

    } else {
      // -----------------------------------------------------------------------
      // UNIFORM GRID (Fixed Aspect Ratio)
      // -----------------------------------------------------------------------
      grid.className = 'moodboard-grid layout-uniform';
      grid.style.display = 'grid';
      grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
      grid.style.gap = `${gap}px`;

      let totalSlots = Math.max(state.items.length, cols * state.settings.rows);
      if (state.items.length === 0) totalSlots = cols;

      for (let i = 0; i < totalSlots; i++) {
        const item = state.items[i];
        if (item) {
          const cell = createCellElement(item, i, radius, true);
          grid.appendChild(cell);
        } else {
          const emptyCell = createEmptySlotElement();
          emptyCell.style.borderRadius = `${radius}px`;
          if (state.settings.aspect !== 'auto') {
            emptyCell.style.aspectRatio = state.settings.aspect;
          }
          grid.appendChild(emptyCell);
        }
      }
    }

    renderPaletteStrip();
    updateStatsPill();
  }

  function createCellElement(item, index, radius, isUniform = false) {
    const cell = document.createElement('div');
    cell.className = 'grid-cell';
    cell.dataset.index = index;
    cell.style.borderRadius = `${radius}px`;
    cell.draggable = true;

    if (isUniform && state.settings.aspect !== 'auto') {
      cell.style.aspectRatio = state.settings.aspect;
    }

    const mediaWrap = document.createElement('div');
    mediaWrap.className = 'cell-media-wrap';

    let mediaEl;
    if (item.type === 'video') {
      mediaEl = document.createElement('video');
      mediaEl.src = item.src;
      mediaEl.autoplay = true;
      mediaEl.loop = true;
      mediaEl.muted = true;
      mediaEl.playsInline = true;
    } else {
      mediaEl = document.createElement('img');
      mediaEl.src = item.src;
      mediaEl.alt = item.title || 'Moodboard item';
      mediaEl.loading = 'lazy';
    }

    const fitClass = isUniform ? (item.fit === 'contain' ? 'fit-contain' : 'fit-cover') : '';
    mediaEl.className = `cell-media ${fitClass} ${item.flipH ? 'flipped-h' : ''}`;
    mediaWrap.appendChild(mediaEl);

    // Format badge
    const badge = document.createElement('span');
    badge.className = 'cell-badge';
    badge.textContent = item.type.toUpperCase();
    mediaWrap.appendChild(badge);

    // Hover Overlay & Actions
    const overlay = document.createElement('div');
    overlay.className = 'cell-overlay';
    overlay.innerHTML = `
      <div class="cell-toolbar-top">
        <button class="cell-action-btn" data-action="flip-h" title="Inverter Horizontalmente">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="m3 7 5 5-5 5V7zm18 0-5 5 5 5V7zM12 3v18"/>
          </svg>
        </button>
        <button class="cell-action-btn btn-delete" data-action="delete" title="Remover Imagem">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </div>
      <div class="cell-toolbar-bottom">
        <span class="drag-handle-pill">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/>
            <circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>
          </svg>
          Mover
        </span>
        <span style="font-size: 9px; color: rgba(255,255,255,0.7); font-family: var(--font-mono);">${item.width}×${item.height}</span>
      </div>
    `;
    mediaWrap.appendChild(overlay);
    cell.appendChild(mediaWrap);

    // Cell action events
    overlay.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      e.stopPropagation();
      const action = btn.dataset.action;
      if (action === 'delete') {
        pushHistory();
        state.items.splice(index, 1);
        renderGrid();
        updateStatsPill();
        extractDominantColors();
        showToast('Item removido', 'info');
      } else if (action === 'flip-h') {
        pushHistory();
        item.flipH = !item.flipH;
        renderGrid();
      }
    });

    // Drag & Drop reorder
    cell.addEventListener('dragstart', (e) => {
      if (state.pan.isSpaceDown || state.pan.isPanning) {
        e.preventDefault();
        return false;
      }
      state.draggedIndex = index;
      cell.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', index.toString());
      try {
        e.dataTransfer.setData('application/x-moodboard-card', index.toString());
      } catch (err) {}
    });

    cell.addEventListener('dragend', () => {
      cell.classList.remove('dragging');
      state.draggedIndex = null;
      document.querySelectorAll('.grid-cell').forEach(c => {
        c.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom');
      });
      const overlay = document.getElementById('windowDragOverlay');
      if (overlay) overlay.classList.remove('active');
    });

    cell.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (state.draggedIndex !== null && state.draggedIndex !== undefined) {
        e.dataTransfer.dropEffect = 'move';
        const rect = cell.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY < midY) {
          cell.classList.add('drag-over-top');
          cell.classList.remove('drag-over-bottom');
        } else {
          cell.classList.add('drag-over-bottom');
          cell.classList.remove('drag-over-top');
        }
      } else {
        e.dataTransfer.dropEffect = 'copy';
        cell.classList.add('drag-over');
      }
    });

    cell.addEventListener('dragleave', () => {
      cell.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom');
    });

    cell.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      cell.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom');

      if (state.draggedIndex !== null && state.draggedIndex !== undefined) {
        const fromIndex = state.draggedIndex;
        let toIndex = index;

        const rect = cell.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY >= midY && fromIndex < toIndex) {
          toIndex = Math.min(state.items.length - 1, toIndex);
        } else if (e.clientY < midY && fromIndex > toIndex) {
          toIndex = Math.max(0, toIndex);
        }

        if (fromIndex !== toIndex && fromIndex < state.items.length) {
          pushHistory();
          const [movedItem] = state.items.splice(fromIndex, 1);
          state.items.splice(toIndex, 0, movedItem);
          renderGrid();
          showToast('Imagem reposicionada', 'info');
        }
        state.draggedIndex = null;
        return;
      }

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFilesList(e.dataTransfer.files);
        return;
      }

      const droppedText = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text/uri-list');
      if (droppedText) {
        await addItemFromUrlOrData(droppedText);
      }
    });

    return cell;
  }

  function createEmptySlotElement() {
    const slot = document.createElement('div');
    slot.className = 'empty-slot';
    slot.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="16"/>
        <line x1="8" y1="12" x2="16" y2="12"/>
      </svg>
      <span>+ Adicionar Imagem ou GIF</span>
    `;
    slot.addEventListener('click', () => {
      const quickInput = document.getElementById('quickUrlInput');
      if (quickInput) {
        quickInput.focus();
        showToast('Cole o link ou pressione Ctrl+V para inserir', 'info');
      }
    });
    return slot;
  }

  // ---------------------------------------------------------------------------
  // Infinite Canvas Pan & Zoom Engine
  // (Space + Drag to Pan, Mouse Wheel / Alt + Wheel to Zoom)
  // ---------------------------------------------------------------------------
  function applyPanZoomTransform() {
    const stage = document.getElementById('moodboardStage');
    const zoomText = document.getElementById('zoomLevelText');
    if (stage) {
      stage.style.transform = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.pan.zoom})`;
    }
    if (zoomText) {
      zoomText.textContent = `${Math.round(state.pan.zoom * 100)}%`;
    }
  }

  function setupPanAndZoom() {
    const viewport = document.getElementById('appViewport');
    if (!viewport) return;

    // 1. Space key handling for Pan mode
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.key === ' ') {
        const activeTag = document.activeElement ? document.activeElement.tagName : '';
        const isEditable = document.activeElement && document.activeElement.isContentEditable;
        if (['INPUT', 'TEXTAREA'].includes(activeTag) || isEditable) return;

        e.preventDefault();
        if (!state.pan.isSpaceDown) {
          state.pan.isSpaceDown = true;
          viewport.classList.add('space-pan-ready');
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space' || e.key === ' ') {
        state.pan.isSpaceDown = false;
        viewport.classList.remove('space-pan-ready');
        if (!state.pan.isMiddlePanning) {
          state.pan.isPanning = false;
          viewport.classList.remove('is-panning');
        }
      }
    });

    // 2. Mouse Down to start Pan
    viewport.addEventListener('mousedown', (e) => {
      const isMiddleClick = e.button === 1;
      const isSpaceDrag = state.pan.isSpaceDown && e.button === 0;

      if (isMiddleClick || isSpaceDrag) {
        e.preventDefault();
        state.pan.isPanning = true;
        state.pan.isMiddlePanning = isMiddleClick;
        state.pan.startX = e.clientX;
        state.pan.startY = e.clientY;
        state.pan.initialX = state.pan.x;
        state.pan.initialY = state.pan.y;
        viewport.classList.add('is-panning');
      }
    });

    // 3. Mouse Move to update Pan position
    window.addEventListener('mousemove', (e) => {
      if (state.pan.isPanning) {
        const dx = e.clientX - state.pan.startX;
        const dy = e.clientY - state.pan.startY;
        state.pan.x = state.pan.initialX + dx;
        state.pan.y = state.pan.initialY + dy;
        applyPanZoomTransform();
      }
    });

    // 4. Mouse Up to end Pan
    window.addEventListener('mouseup', () => {
      if (state.pan.isPanning) {
        state.pan.isPanning = false;
        state.pan.isMiddlePanning = false;
        viewport.classList.remove('is-panning');
      }
    });

    // 5. Mouse Wheel Zoom (Direct scroll or Alt + Scroll)
    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();

      const zoomFactor = e.deltaY < 0 ? 1.09 : 0.91;
      const newZoom = Math.max(0.15, Math.min(4.0, state.pan.zoom * zoomFactor));

      if (newZoom === state.pan.zoom) return;

      // Zoom centered on cursor position
      const rect = viewport.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - rect.width / 2;
      const mouseY = e.clientY - rect.top - rect.height / 2;

      state.pan.x = mouseX - (mouseX - state.pan.x) * (newZoom / state.pan.zoom);
      state.pan.y = mouseY - (mouseY - state.pan.y) * (newZoom / state.pan.zoom);
      state.pan.zoom = newZoom;

      applyPanZoomTransform();
    }, { passive: false });

    // 6. Viewport Toolbar buttons
    const btnZoomIn = document.getElementById('btnZoomIn');
    const btnZoomOut = document.getElementById('btnZoomOut');
    const btnFitZoom = document.getElementById('btnFitZoom');
    const btnResetZoom = document.getElementById('btnResetZoom');

    if (btnZoomIn) {
      btnZoomIn.addEventListener('click', () => {
        state.pan.zoom = Math.min(4.0, state.pan.zoom * 1.15);
        applyPanZoomTransform();
      });
    }

    if (btnZoomOut) {
      btnZoomOut.addEventListener('click', () => {
        state.pan.zoom = Math.max(0.15, state.pan.zoom * 0.85);
        applyPanZoomTransform();
      });
    }

    if (btnResetZoom) {
      btnResetZoom.addEventListener('click', () => {
        state.pan.x = 0;
        state.pan.y = 0;
        state.pan.zoom = 1.0;
        applyPanZoomTransform();
      });
    }

    if (btnFitZoom) {
      btnFitZoom.addEventListener('click', fitMoodboardToScreen);
    }

    // Double click on viewport background to fit
    viewport.addEventListener('dblclick', (e) => {
      if (e.target === viewport || e.target.id === 'canvasPanContainer') {
        fitMoodboardToScreen();
      }
    });
  }

  function fitMoodboardToScreen() {
    const viewport = document.getElementById('appViewport');
    const board = document.getElementById('moodboardBoard');
    if (!viewport || !board) return;

    const availW = viewport.clientWidth - 80;
    const availH = viewport.clientHeight - 80;
    const boardW = board.offsetWidth || 960;
    const boardH = board.offsetHeight || 600;

    const scale = Math.min(availW / boardW, availH / boardH, 1.0);
    state.pan.x = 0;
    state.pan.y = 0;
    state.pan.zoom = Math.max(0.2, scale);
    applyPanZoomTransform();
  }

  // ---------------------------------------------------------------------------
  // Color Palette Extraction (Aesthetic K-Means Quantization)
  // ---------------------------------------------------------------------------
  function extractDominantColors() {
    if (state.items.length === 0) {
      state.settings.palette = ['#0e1014', '#ffbb00', '#9ca3af', '#242832', '#f9fafb'];
      renderPaletteStrip();
      return;
    }

    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = 100;
    sampleCanvas.height = 100;
    const ctx = sampleCanvas.getContext('2d');

    const loadedImgs = Array.from(document.querySelectorAll('.cell-media'))
      .filter(el => el.tagName === 'IMG' && el.complete && el.naturalWidth > 0);

    if (loadedImgs.length === 0) return;

    ctx.clearRect(0, 0, 100, 100);
    const step = 100 / Math.min(loadedImgs.length, 5);
    loadedImgs.slice(0, 5).forEach((img, idx) => {
      try {
        ctx.drawImage(img, idx * step, 0, step, 100);
      } catch (e) {}
    });

    try {
      const imgData = ctx.getImageData(0, 0, 100, 100).data;
      const colorBuckets = {};

      for (let i = 0; i < imgData.length; i += 16) {
        const r = imgData[i];
        const g = imgData[i + 1];
        const b = imgData[i + 2];
        const a = imgData[i + 3];

        if (a < 128) continue;

        const qr = Math.round(r / 32) * 32;
        const qg = Math.round(g / 32) * 32;
        const qb = Math.round(b / 32) * 32;

        const hex = rgbToHex(qr, qg, qb);
        colorBuckets[hex] = (colorBuckets[hex] || 0) + 1;
      }

      const sorted = Object.entries(colorBuckets)
        .sort((a, b) => b[1] - a[1])
        .map(entry => entry[0]);

      if (sorted.length >= 3) {
        state.settings.palette = sorted.slice(0, 5);
        renderPaletteStrip();
      }
    } catch (err) {
      console.warn('Erro ao extrair paleta:', err);
    }
  }

  function rgbToHex(r, g, b) {
    const toH = c => Math.min(255, Math.max(0, c)).toString(16).padStart(2, '0');
    return `#${toH(r)}${toH(g)}${toH(b)}`;
  }

  function renderPaletteStrip() {
    const strip = document.getElementById('boardPaletteStrip');
    if (!strip) return;
    strip.innerHTML = '';

    const colors = state.settings.palette || ['#0e1014', '#ffbb00', '#9ca3af'];
    colors.forEach(hex => {
      const item = document.createElement('div');
      item.className = 'palette-swatch-item';
      item.innerHTML = `
        <div class="palette-swatch-circle" style="background-color: ${hex};" title="Copiar ${hex}"></div>
        <span class="palette-swatch-hex">${hex.toUpperCase()}</span>
      `;
      item.addEventListener('click', () => {
        navigator.clipboard.writeText(hex.toUpperCase()).then(() => {
          showToast(`Cor ${hex.toUpperCase()} copiada!`, 'success');
        });
      });
      strip.appendChild(item);
    });
  }

  // ---------------------------------------------------------------------------
  // Sync Controls with UI State
  // ---------------------------------------------------------------------------
  function syncSettingsUI() {
    document.querySelectorAll('#gridModeGroup .segmented-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === state.settings.gridMode);
    });

    const aspectContainer = document.getElementById('aspectControlContainer');
    if (aspectContainer) {
      aspectContainer.style.display = state.settings.gridMode === 'uniform' ? 'flex' : 'none';
    }

    const sliderCols = document.getElementById('sliderCols');
    const valCols = document.getElementById('valCols');
    if (sliderCols) sliderCols.value = state.settings.cols;
    if (valCols) valCols.textContent = state.settings.cols;

    const sliderGap = document.getElementById('sliderGap');
    const valGap = document.getElementById('valGap');
    if (sliderGap) sliderGap.value = state.settings.gap;
    if (valGap) valGap.textContent = `${state.settings.gap} px`;

    const sliderPadding = document.getElementById('sliderPadding');
    const valPadding = document.getElementById('valPadding');
    if (sliderPadding) sliderPadding.value = state.settings.padding;
    if (valPadding) valPadding.textContent = `${state.settings.padding} px`;

    const sliderRadius = document.getElementById('sliderRadius');
    const valRadius = document.getElementById('valRadius');
    if (sliderRadius) sliderRadius.value = state.settings.radius;
    if (valRadius) valRadius.textContent = `${state.settings.radius} px`;

    document.querySelectorAll('#aspectRatioGroup .segmented-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.aspect === state.settings.aspect);
    });

    const valBgColor = document.getElementById('valBgColor');
    const nativeColor = document.getElementById('nativeColorPicker');
    if (valBgColor) valBgColor.textContent = state.settings.bgColor;
    if (nativeColor) nativeColor.value = state.settings.bgColor.startsWith('#') ? state.settings.bgColor : '#0e1014';

    document.querySelectorAll('#bgColorPresets .color-swatch-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.color.toLowerCase() === state.settings.bgColor.toLowerCase());
    });

    const valTextColor = document.getElementById('valTextColor');
    const nativeTextColor = document.getElementById('nativeTextColorPicker');
    const curTxtColor = state.settings.textColor || '#ffffff';
    if (valTextColor) valTextColor.textContent = curTxtColor;
    if (nativeTextColor) nativeTextColor.value = curTxtColor.startsWith('#') ? curTxtColor : '#ffffff';

    document.querySelectorAll('#textColorPresets .color-swatch-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.color.toLowerCase() === curTxtColor.toLowerCase());
    });

    const checkShowTitle = document.getElementById('checkShowTitle');
    if (checkShowTitle) checkShowTitle.checked = state.settings.showTitle;

    const checkShowPalette = document.getElementById('checkShowPalette');
    if (checkShowPalette) checkShowPalette.checked = state.settings.showPalette;
  }

  function updateStatsPill() {
    const statsText = document.getElementById('statsText');
    if (!statsText) return;
    const count = state.items.length;
    const modeName = state.settings.gridMode === 'masonry' ? 'Orgânico' : 'Grade';
    statsText.textContent = `${count} ${count === 1 ? 'imagem' : 'imagens'} • ${state.settings.cols} colunas (${modeName})`;
  }

  // ---------------------------------------------------------------------------
  // Clipboard Paste & File Upload Handling
  // ---------------------------------------------------------------------------
  async function handleFilesList(files) {
    if (!files || files.length === 0) return;
    let addedCount = 0;
    pushHistory();

    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) continue;
      const objectUrl = URL.createObjectURL(file);
      try {
        await addItemFromUrlOrData(objectUrl, null, { skipHistory: true });
        addedCount++;
      } catch (e) {}
    }

    if (addedCount > 0) {
      showToast(`${addedCount} ${addedCount === 1 ? 'arquivo importado' : 'arquivos importados'}!`, 'success');
    }
  }

  function setupClipboardAndDragDrop() {
    window.addEventListener('paste', async (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) &&
          document.activeElement.id !== 'quickUrlInput') {
        return;
      }

      const clipboardFiles = e.clipboardData.files;
      if (clipboardFiles && clipboardFiles.length > 0) {
        e.preventDefault();
        showToast('Colando imagem da área de transferência...', 'info');
        handleFilesList(clipboardFiles);
        return;
      }

      const text = e.clipboardData.getData('text');
      if (text) {
        const urls = text.split(/\r?\n/).map(s => s.trim()).filter(s => s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:image/'));
        if (urls.length > 0) {
          e.preventDefault();
          showToast(`Colando ${urls.length} link(s)...`, 'info');
          pushHistory();
          for (const u of urls) {
            try {
              await addItemFromUrlOrData(u, null, { skipHistory: true });
            } catch (err) {}
          }
        }
      }
    });

    const overlay = document.getElementById('windowDragOverlay');
    let dragCounter = 0;

    window.addEventListener('dragenter', (e) => {
      // If we are currently dragging an internal card, DO NOT show the overlay!
      if (state.draggedIndex !== null && state.draggedIndex !== undefined) return;

      const dt = e.dataTransfer;
      if (!dt) return;
      const types = Array.from(dt.types || []);
      // If internal card or no files, do not activate
      if (types.includes('application/x-moodboard-card')) return;
      if (!types.includes('Files') && !types.includes('application/x-moz-file')) return;

      e.preventDefault();
      dragCounter++;
      if (overlay) overlay.classList.add('active');
    });

    window.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0 && overlay) {
        dragCounter = 0;
        overlay.classList.remove('active');
      }
    });

    window.addEventListener('dragover', (e) => {
      // When dragging internal item, let cells handle their own dragover
      if (state.draggedIndex !== null && state.draggedIndex !== undefined) {
        return;
      }
      const dt = e.dataTransfer;
      if (dt && Array.from(dt.types || []).includes('Files')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }
    });

    window.addEventListener('drop', (e) => {
      dragCounter = 0;
      if (overlay) overlay.classList.remove('active');

      if (state.draggedIndex !== null && state.draggedIndex !== undefined) {
        state.draggedIndex = null;
        return;
      }

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        e.preventDefault();
        handleFilesList(e.dataTransfer.files);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Canvas Export Renderer (Matches Masonry Organic Layout Pixel-for-Pixel!)
  // ---------------------------------------------------------------------------
  async function renderMoodboardToCanvas(scale = 2, timeSec = 0) {
    const boardEl = document.getElementById('moodboardBoard');
    if (!boardEl) throw new Error('Quadro do moodboard não encontrado.');

    // Ensure measurements are independent of current viewport pan & zoom
    const zoom = state.pan.zoom || 1.0;
    const rect = boardEl.getBoundingClientRect();
    const width = Math.round((rect.width / zoom) * scale);
    const height = Math.round((rect.height / zoom) * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // 1. Fill Background
    ctx.fillStyle = state.settings.bgColor;
    ctx.fillRect(0, 0, width, height);

    const pad = state.settings.padding * scale;
    const radius = state.settings.radius * scale;

    let currentY = pad;

    // 2. Render Header if visible
    if (state.settings.showTitle) {
      const headerEl = document.getElementById('boardHeader');
      const headerRect = headerEl ? headerEl.getBoundingClientRect() : null;
      const headerH = ((headerRect ? headerRect.height : 50) / zoom) * scale;
      const txtColor = state.settings.textColor || '#ffffff';

      ctx.save();
      ctx.fillStyle = txtColor;
      ctx.font = `900 ${Math.round(20 * scale)}px "Plus Jakarta Sans", sans-serif`;
      ctx.textBaseline = 'top';
      ctx.fillText(state.settings.titleText, pad, currentY);

      ctx.save();
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = txtColor;
      ctx.font = `500 ${Math.round(11 * scale)}px "Plus Jakarta Sans", sans-serif`;
      ctx.fillText(state.settings.subtitleText, pad, currentY + Math.round(25 * scale));
      ctx.restore();

      ctx.restore();

      currentY += headerH + 6 * scale;
    }

    // 3. Render Cells using exact screen positions
    const cellEls = Array.from(boardEl.querySelectorAll('.grid-cell'));

    for (let i = 0; i < cellEls.length; i++) {
      const cellEl = cellEls[i];
      const itemIndex = parseInt(cellEl.dataset.index, 10);
      const item = state.items[itemIndex];
      if (!item) continue;

      const cellRect = cellEl.getBoundingClientRect();
      const cellX = ((cellRect.left - rect.left) / zoom) * scale;
      const cellY = ((cellRect.top - rect.top) / zoom) * scale;
      const cellW = (cellRect.width / zoom) * scale;
      const cellH = (cellRect.height / zoom) * scale;

      ctx.save();
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(cellX, cellY, cellW, cellH, radius);
      } else {
        drawRoundedRectPath(ctx, cellX, cellY, cellW, cellH, radius);
      }
      ctx.clip();

      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fillRect(cellX, cellY, cellW, cellH);

      if (item.type === 'gif' && item.gifData && item.gifData.frames.length > 0) {
        const timeMs = (timeSec * 1000) % item.gifData.totalDurationMs;
        let selectedFrame = item.gifData.frames[0];
        for (const f of item.gifData.frames) {
          if (timeMs >= f.startMs && timeMs < f.endMs) {
            selectedFrame = f;
            break;
          }
        }
        drawImageCoverOrContain(ctx, selectedFrame.canvas, cellX, cellY, cellW, cellH, item.fit, item.flipH);
      } else {
        const imgEl = cellEl.querySelector('.cell-media');
        if (imgEl) {
          drawImageCoverOrContain(ctx, imgEl, cellX, cellY, cellW, cellH, item.fit, item.flipH);
        }
      }

      ctx.restore();
    }

    // 4. Render Palette Strip if visible
    if (state.settings.showPalette && state.settings.palette && state.settings.palette.length > 0) {
      const paletteStripEl = document.getElementById('boardPaletteStrip');
      if (paletteStripEl) {
        const stripRect = paletteStripEl.getBoundingClientRect();
        const stripY = ((stripRect.top - rect.top) / zoom) * scale;
        const totalW = (rect.width / zoom) * scale;

        ctx.save();
        ctx.strokeStyle = isLightColor(state.settings.bgColor) ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1 * scale;
        ctx.beginPath();
        ctx.moveTo(pad, stripY);
        ctx.lineTo(totalW - pad, stripY);
        ctx.stroke();

        const swatchSize = 26 * scale;
        const swatchGap = 10 * scale;
        const count = state.settings.palette.length;
        const totalSwatchesW = count * swatchSize + (count - 1) * swatchGap;
        let startX = (totalW - totalSwatchesW) / 2;

        state.settings.palette.forEach(hex => {
          ctx.beginPath();
          if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(startX, stripY + 12 * scale, swatchSize, swatchSize, 4 * scale);
          } else {
            drawRoundedRectPath(ctx, startX, stripY + 12 * scale, swatchSize, swatchSize, 4 * scale);
          }
          ctx.fillStyle = hex;
          ctx.fill();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
          ctx.lineWidth = 1 * scale;
          ctx.stroke();

          ctx.fillStyle = isLightColor(state.settings.bgColor) ? '#334155' : '#cbd5e1';
          ctx.font = `600 ${Math.round(9 * scale)}px "JetBrains Mono", monospace`;
          ctx.textAlign = 'center';
          ctx.fillText(hex.toUpperCase(), startX + swatchSize / 2, stripY + 12 * scale + swatchSize + 11 * scale);

          startX += swatchSize + swatchGap;
        });

        ctx.restore();
      }
    }

    return canvas;
  }

  function isLightColor(hex) {
    if (!hex.startsWith('#') || hex.length < 7) return false;
    const r = parseInt(hex.substr(1, 2), 16);
    const g = parseInt(hex.substr(3, 2), 16);
    const b = parseInt(hex.substr(5, 2), 16);
    return (r * 0.299 + g * 0.587 + b * 0.114) > 160;
  }

  function drawRoundedRectPath(ctx, x, y, w, h, r) {
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

  function drawImageCoverOrContain(ctx, source, dx, dy, dw, dh, fit = 'cover', flipH = false) {
    const sw = source.naturalWidth || source.videoWidth || source.width;
    const sh = source.naturalHeight || source.videoHeight || source.height;
    if (!sw || !sh) return;

    ctx.save();
    if (flipH) {
      ctx.translate(dx + dw, dy);
      ctx.scale(-1, 1);
      dx = 0;
      dy = 0;
    }

    // In Masonry, image fits exact cell width and height (natural ratio)
    ctx.drawImage(source, dx, dy, dw, dh);
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Export Handlers (JPG, PDF, MP4 via ffmpeg)
  // ---------------------------------------------------------------------------
  async function exportMoodboard() {
    const btnExecute = document.getElementById('btnExecuteExport');
    const progressContainer = document.getElementById('exportProgressContainer');
    const progressBar = document.getElementById('exportProgressBar');
    const statusMsg = document.getElementById('exportStatusMsg');
    const statusPercent = document.getElementById('exportStatusPercent');

    if (btnExecute) btnExecute.disabled = true;
    if (progressContainer) progressContainer.classList.remove('hidden');

    function updateProgress(pct, message) {
      if (progressBar) progressBar.style.width = `${pct}%`;
      if (statusPercent) statusPercent.textContent = `${Math.round(pct)}%`;
      if (statusMsg) statusMsg.textContent = message;
    }

    const scale = state.export.scale;
    const format = state.export.format;

    try {
      if (format === 'jpg') {
        updateProgress(30, 'Renderizando moodboard em alta definição...');
        const canvas = await renderMoodboardToCanvas(scale, 0);

        updateProgress(80, 'Codificando JPG...');
        canvas.toBlob((blob) => {
          if (!blob) throw new Error('Falha ao gerar arquivo de imagem.');
          downloadBlob(blob, `dms_moodboard_${scale}x.jpg`);
          updateProgress(100, 'Download concluído!');
          setTimeout(closeExportModal, 800);
          showToast('Moodboard exportado em JPG!', 'success');
        }, 'image/jpeg', state.export.jpgQuality);

      } else if (format === 'pdf') {
        updateProgress(30, 'Renderizando imagem para PDF...');
        const canvas = await renderMoodboardToCanvas(scale, 0);

        updateProgress(60, 'Gerando documento PDF...');
        const imgData = canvas.toDataURL('image/jpeg', 0.95);

        const { jsPDF } = window.jspdf || {};
        if (!jsPDF) throw new Error('Biblioteca jsPDF não carregada.');

        const orientation = canvas.width >= canvas.height ? 'landscape' : 'portrait';
        const pdf = new jsPDF({
          orientation: orientation,
          unit: 'px',
          format: [canvas.width, canvas.height]
        });

        pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height);
        pdf.save(`dms_moodboard_${scale}x.pdf`);

        updateProgress(100, 'Download do PDF concluído!');
        setTimeout(closeExportModal, 800);
        showToast('Moodboard exportado em PDF!', 'success');

      } else if (format === 'mp4') {
        const duration = parseFloat(state.export.duration) || 5.0;
        const fps = parseInt(state.export.fps, 10) || 30;
        const totalFrames = Math.round(duration * fps);

        if (state.ffmpegAvailable) {
          // A. FFmpeg Local Server Encode (Ultra-precision H.264)
          updateProgress(5, 'Iniciando codificador ffmpeg...');
          const startRes = await fetch('/api/video/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ format: 'mp4', fps: fps })
          });

          if (!startRes.ok) {
            const err = await startRes.json();
            throw new Error(err.error || 'Falha ao iniciar trabalho no ffmpeg.');
          }

          const { id: jobId } = await startRes.json();

          for (let f = 0; f < totalFrames; f++) {
            const timeSec = f / fps;
            const pct = 10 + (f / totalFrames) * 75;
            updateProgress(pct, `Renderizando quadro ${f + 1}/${totalFrames} (${timeSec.toFixed(2)}s)...`);

            const frameCanvas = await renderMoodboardToCanvas(scale, timeSec);
            const frameBlob = await new Promise(res => frameCanvas.toBlob(res, 'image/jpeg', 0.92));
            if (!frameBlob) throw new Error(`Falha no quadro ${f + 1}.`);

            const frameRes = await fetch(`/api/video/frame/${jobId}`, {
              method: 'POST',
              body: frameBlob
            });

            if (!frameRes.ok) {
              const err = await frameRes.json();
              throw new Error(err.error || 'Erro ao enviar quadro ao ffmpeg.');
            }
          }

          updateProgress(90, 'Finalizando compressão MP4 com ffmpeg...');
          const finishRes = await fetch(`/api/video/finish/${jobId}`, { method: 'POST' });
          if (!finishRes.ok) {
            const err = await finishRes.json();
            throw new Error(err.error || 'Erro na codificação final do MP4.');
          }

          const mp4Blob = await finishRes.blob();
          downloadBlob(mp4Blob, `dms_moodboard_${scale}x.mp4`);

          updateProgress(100, 'Vídeo MP4 gerado com sucesso!');
          setTimeout(closeExportModal, 800);
          showToast('Vídeo MP4 exportado com sucesso!', 'success');

        } else if (typeof window.MediaRecorder !== 'undefined') {
          // B. Browser-Native MediaRecorder Export (Works on GitHub Pages, Mac Safari, Chrome, Edge)
          updateProgress(8, 'Iniciando gravação de vídeo no navegador...');

          let mimeType = 'video/webm';
          let extension = 'webm';
          if (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1') || MediaRecorder.isTypeSupported('video/mp4')) {
            mimeType = MediaRecorder.isTypeSupported('video/mp4;codecs=avc1') ? 'video/mp4;codecs=avc1' : 'video/mp4';
            extension = 'mp4';
          } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
            mimeType = 'video/webm;codecs=vp9';
            extension = 'webm';
          }

          const exportCanvas = await renderMoodboardToCanvas(scale, 0);
          const stream = exportCanvas.captureStream(fps);
          const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 12000000 });
          const recordedChunks = [];

          recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) recordedChunks.push(e.data);
          };

          const recordDonePromise = new Promise((resolve, reject) => {
            recorder.onstop = () => {
              const videoBlob = new Blob(recordedChunks, { type: mimeType });
              downloadBlob(videoBlob, `dms_moodboard_${scale}x.${extension}`);
              resolve();
            };
            recorder.onerror = reject;
          });

          recorder.start();

          const ctx = exportCanvas.getContext('2d');
          const frameIntervalMs = 1000 / fps;

          for (let f = 0; f < totalFrames; f++) {
            const timeSec = f / fps;
            const pct = 10 + (f / totalFrames) * 85;
            updateProgress(pct, `Gravando quadro ${f + 1}/${totalFrames} (${timeSec.toFixed(1)}s)...`);

            const frame = await renderMoodboardToCanvas(scale, timeSec);
            ctx.clearRect(0, 0, exportCanvas.width, exportCanvas.height);
            ctx.drawImage(frame, 0, 0);

            await new Promise(r => setTimeout(r, frameIntervalMs));
          }

          updateProgress(98, 'Finalizando arquivo de vídeo...');
          recorder.stop();
          await recordDonePromise;

          updateProgress(100, `Vídeo ${extension.toUpperCase()} gerado com sucesso!`);
          setTimeout(closeExportModal, 800);
          showToast(`Vídeo baixado (${extension.toUpperCase()})!`, 'success');

        } else {
          throw new Error('Nenhum codificador de vídeo suportado encontrado neste navegador. Recomendamos exportar em JPG ou PDF em alta resolução.');
        }
      }
    } catch (err) {
      console.error('Falha na exportação:', err);
      showToast(err.message || 'Erro durante a exportação.', 'error', 5500);
      updateProgress(0, 'Falha no processo.');
    } finally {
      if (btnExecute) btnExecute.disabled = false;
    }
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function openExportModal() {
    updateResolutionPreview();
    const modal = document.getElementById('exportModal');
    if (modal) modal.classList.add('open');
  }

  function closeExportModal() {
    const modal = document.getElementById('exportModal');
    if (modal) modal.classList.remove('open');
    const progress = document.getElementById('exportProgressContainer');
    if (progress) progress.classList.add('hidden');
  }

  function updateResolutionPreview() {
    const boardEl = document.getElementById('moodboardBoard');
    const resText = document.getElementById('resPreviewText');
    if (!boardEl || !resText) return;

    const zoom = state.pan.zoom || 1.0;
    const scale = state.export.scale;
    const rect = boardEl.getBoundingClientRect();
    const w = Math.round((rect.width / zoom) * scale);
    const h = Math.round((rect.height / zoom) * scale);
    resText.textContent = `${w} × ${h} px`;

    const btnText = document.getElementById('btnExecuteExportText');
    if (btnText) {
      btnText.textContent = `Baixar ${state.export.format.toUpperCase()} (${scale}x)`;
    }
  }

  // ---------------------------------------------------------------------------
  // Showcase Sample Preset (High-End Editorial / Cyberpunk / Tech Aesthetics)
  // ---------------------------------------------------------------------------
  async function loadSampleShowcase() {
    pushHistory();
    state.items = [];
    state.settings.gridMode = 'masonry'; // Organic Masonry default!
    state.settings.cols = 3;
    state.settings.titleText = "DM'S MOODBOARD // CONCEPT & REFERENCES";
    state.settings.subtitleText = 'Visual Exploration • Curated Textures & Aesthetics';
    state.settings.bgColor = '#0e1014';
    state.settings.textColor = '#ffffff';

    syncSettingsUI();
    renderGrid();
    showToast('Carregando moodboard orgânico...', 'info');

    // Editorial samples matching Reference 2 aesthetic
    const samples = [
      {
        // Cyberpunk portrait (Vertical)
        url: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=800&q=80'
      },
      {
        // Sports car rear (Horizontal)
        url: 'https://images.unsplash.com/photo-1603584173870-7f23fdae1b7a?auto=format&fit=crop&w=800&q=80'
      },
      {
        // Geometric tech loop GIF
        url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExMjRna243amF1OXoxcDRsNmtkcWl3YnA4Nm01MXRzMTkyczNqNGhsaCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3o7TKSjRrfIPjeiVyM/giphy.gif'
      },
      {
        // Urban alleyway perspective (Vertical)
        url: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=800&q=80'
      },
      {
        // Interior sunset light through blinds
        url: 'https://images.unsplash.com/photo-1507089947368-19c1da9775ae?auto=format&fit=crop&w=800&q=80'
      },
      {
        // Custom car rim detail
        url: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=800&q=80'
      },
      {
        // Aerospace cockpit view (Wide landscape)
        url: 'https://images.unsplash.com/photo-1541185933-ef5d8ed016c2?auto=format&fit=crop&w=800&q=80'
      }
    ];

    for (const s of samples) {
      try {
        await addItemFromUrlOrData(s.url, null, { skipHistory: true });
      } catch (e) {
        console.warn('Falha no sample:', s.url);
      }
    }

    extractDominantColors();
    setTimeout(fitMoodboardToScreen, 300);
    showToast('Moodboard orgânico carregado!', 'success');
  }

  // ---------------------------------------------------------------------------
  // Event Bindings
  // ---------------------------------------------------------------------------
  function bindUIEvents() {
    // Top Bar Quick Actions
    const btnQuickUrl = document.getElementById('btnQuickUrl');
    const quickInput = document.getElementById('quickUrlInput');
    const btnAddUrlBtn = document.getElementById('btnAddUrlBtn');

    if (btnQuickUrl && quickInput) {
      btnQuickUrl.addEventListener('click', () => {
        // Open sidebar if closed
        const sidebar = document.getElementById('appSidebar');
        if (sidebar && sidebar.classList.contains('collapsed')) {
          sidebar.classList.remove('collapsed');
        }
        quickInput.focus();
        showToast('Cole o link da imagem/GIF no campo da barra lateral', 'info');
      });
    }

    if (btnAddUrlBtn && quickInput) {
      btnAddUrlBtn.addEventListener('click', () => {
        const url = quickInput.value.trim();
        if (url) {
          addItemFromUrlOrData(url);
          quickInput.value = '';
        }
      });

      quickInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          btnAddUrlBtn.click();
        }
      });
    }

    // Local file uploads
    const fileHidden = document.getElementById('fileInputHidden');
    const btnUploadLocal = document.getElementById('btnUploadLocal');
    const btnUploadLocalSidebar = document.getElementById('btnUploadLocalSidebar');

    const triggerUpload = () => fileHidden && fileHidden.click();
    if (btnUploadLocal) btnUploadLocal.addEventListener('click', triggerUpload);
    if (btnUploadLocalSidebar) btnUploadLocalSidebar.addEventListener('click', triggerUpload);

    if (fileHidden) {
      fileHidden.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          handleFilesList(e.target.files);
          e.target.value = '';
        }
      });
    }

    // Sample button
    const btnLoadSample = document.getElementById('btnLoadSample');
    if (btnLoadSample) btnLoadSample.addEventListener('click', loadSampleShowcase);

    // Undo / Redo
    const btnUndo = document.getElementById('btnUndo');
    const btnRedo = document.getElementById('btnRedo');
    if (btnUndo) btnUndo.addEventListener('click', undo);
    if (btnRedo) btnRedo.addEventListener('click', redo);

    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
        e.preventDefault();
        redo();
      }
    });

    // Clear board
    const btnClearBoard = document.getElementById('btnClearBoard');
    if (btnClearBoard) {
      btnClearBoard.addEventListener('click', () => {
        if (state.items.length === 0) return;
        if (confirm('Tem certeza que deseja limpar todo o moodboard?')) {
          pushHistory();
          state.items = [];
          renderGrid();
          updateStatsPill();
          extractDominantColors();
          showToast('Moodboard limpo', 'info');
        }
      });
    }

    // Toggle Sidebar
    const btnToggleSidebar = document.getElementById('btnToggleSidebar');
    const btnCloseSidebar = document.getElementById('btnCloseSidebar');
    const appSidebar = document.getElementById('appSidebar');

    const toggleSidebar = () => {
      if (!appSidebar) return;
      appSidebar.classList.toggle('collapsed');
      setTimeout(fitMoodboardToScreen, 220);
    };

    if (btnToggleSidebar) btnToggleSidebar.addEventListener('click', toggleSidebar);
    if (btnCloseSidebar) btnCloseSidebar.addEventListener('click', toggleSidebar);

    // Sidebar: Grid Mode (Masonry Organic vs Uniform Grid)
    document.querySelectorAll('#gridModeGroup .segmented-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        pushHistory();
        state.settings.gridMode = btn.dataset.mode;
        syncSettingsUI();
        renderGrid();
      });
    });

    // Columns Slider
    const sliderCols = document.getElementById('sliderCols');
    if (sliderCols) {
      sliderCols.addEventListener('input', (e) => {
        state.settings.cols = parseInt(e.target.value, 10);
        document.getElementById('valCols').textContent = state.settings.cols;
        renderGrid();
      });
      sliderCols.addEventListener('change', pushHistory);
    }

    // Gap Slider
    const sliderGap = document.getElementById('sliderGap');
    if (sliderGap) {
      sliderGap.addEventListener('input', (e) => {
        state.settings.gap = parseInt(e.target.value, 10);
        document.getElementById('valGap').textContent = `${state.settings.gap} px`;
        renderGrid();
      });
      sliderGap.addEventListener('change', pushHistory);
    }

    // Padding Slider
    const sliderPadding = document.getElementById('sliderPadding');
    if (sliderPadding) {
      sliderPadding.addEventListener('input', (e) => {
        state.settings.padding = parseInt(e.target.value, 10);
        document.getElementById('valPadding').textContent = `${state.settings.padding} px`;
        renderGrid();
      });
      sliderPadding.addEventListener('change', pushHistory);
    }

    // Radius Slider
    const sliderRadius = document.getElementById('sliderRadius');
    if (sliderRadius) {
      sliderRadius.addEventListener('input', (e) => {
        state.settings.radius = parseInt(e.target.value, 10);
        document.getElementById('valRadius').textContent = `${state.settings.radius} px`;
        renderGrid();
      });
      sliderRadius.addEventListener('change', pushHistory);
    }

    // Aspect Ratio Buttons (for Uniform Grid)
    document.querySelectorAll('#aspectRatioGroup .segmented-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        pushHistory();
        state.settings.aspect = btn.dataset.aspect;
        syncSettingsUI();
        renderGrid();
      });
    });

    // Background Color Presets & Native Picker
    document.querySelectorAll('#bgColorPresets .color-swatch-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        pushHistory();
        state.settings.bgColor = btn.dataset.color;
        syncSettingsUI();
        renderGrid();
      });
    });

    const nativeColor = document.getElementById('nativeColorPicker');
    if (nativeColor) {
      nativeColor.addEventListener('input', (e) => {
        state.settings.bgColor = e.target.value;
        syncSettingsUI();
        renderGrid();
      });
      nativeColor.addEventListener('change', pushHistory);
    }

    // Text Color (Title & Subtitle) Presets & Native Picker
    document.querySelectorAll('#textColorPresets .color-swatch-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        pushHistory();
        state.settings.textColor = btn.dataset.color;
        syncSettingsUI();
        renderGrid();
      });
    });

    const nativeTextColor = document.getElementById('nativeTextColorPicker');
    if (nativeTextColor) {
      nativeTextColor.addEventListener('input', (e) => {
        state.settings.textColor = e.target.value;
        syncSettingsUI();
        renderGrid();
      });
      nativeTextColor.addEventListener('change', pushHistory);
    }

    // Title Toggle & Inputs
    const checkShowTitle = document.getElementById('checkShowTitle');
    const inputBoardTitle = document.getElementById('inputBoardTitle');
    const inputBoardSubtitle = document.getElementById('inputBoardSubtitle');

    if (checkShowTitle) {
      checkShowTitle.addEventListener('change', (e) => {
        pushHistory();
        state.settings.showTitle = e.target.checked;
        renderGrid();
      });
    }

    if (inputBoardTitle) {
      inputBoardTitle.addEventListener('input', (e) => {
        state.settings.titleText = e.target.value;
        const disp = document.getElementById('displayTitle');
        if (disp) disp.textContent = e.target.value;
      });
      inputBoardTitle.addEventListener('change', pushHistory);
    }

    if (inputBoardSubtitle) {
      inputBoardSubtitle.addEventListener('input', (e) => {
        state.settings.subtitleText = e.target.value;
        const disp = document.getElementById('displaySubtitle');
        if (disp) disp.textContent = e.target.value;
      });
      inputBoardSubtitle.addEventListener('change', pushHistory);
    }

    // Editable text directly on the board
    const dispTitle = document.getElementById('displayTitle');
    if (dispTitle) {
      dispTitle.addEventListener('blur', () => {
        state.settings.titleText = dispTitle.textContent;
        if (inputBoardTitle) inputBoardTitle.value = dispTitle.textContent;
        pushHistory();
      });
    }

    const dispSubtitle = document.getElementById('displaySubtitle');
    if (dispSubtitle) {
      dispSubtitle.addEventListener('blur', () => {
        state.settings.subtitleText = dispSubtitle.textContent;
        if (inputBoardSubtitle) inputBoardSubtitle.value = dispSubtitle.textContent;
        pushHistory();
      });
    }

    // Palette Toggle & Re-extract
    const checkShowPalette = document.getElementById('checkShowPalette');
    const btnExtractPalette = document.getElementById('btnExtractPalette');

    if (checkShowPalette) {
      checkShowPalette.addEventListener('change', (e) => {
        pushHistory();
        state.settings.showPalette = e.target.checked;
        renderGrid();
      });
    }

    if (btnExtractPalette) {
      btnExtractPalette.addEventListener('click', () => {
        extractDominantColors();
        showToast('Cores predominantes extraídas!', 'success');
      });
    }

    // Export Modal Controls
    const btnOpenExportModal = document.getElementById('btnOpenExportModal');
    const btnCloseExportModal = document.getElementById('btnCloseExportModal');
    const btnCancelExport = document.getElementById('btnCancelExport');
    const btnExecuteExport = document.getElementById('btnExecuteExport');

    if (btnOpenExportModal) btnOpenExportModal.addEventListener('click', openExportModal);
    if (btnCloseExportModal) btnCloseExportModal.addEventListener('click', closeExportModal);
    if (btnCancelExport) btnCancelExport.addEventListener('click', closeExportModal);
    if (btnExecuteExport) btnExecuteExport.addEventListener('click', exportMoodboard);

    // Export format selection
    document.querySelectorAll('#exportFormatGrid .format-card').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('#exportFormatGrid .format-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        state.export.format = card.dataset.format;

        const mp4Card = document.getElementById('mp4OptionsCard');
        if (mp4Card) {
          if (state.export.format === 'mp4') {
            mp4Card.classList.remove('hidden');
          } else {
            mp4Card.classList.add('hidden');
          }
        }
        updateResolutionPreview();
      });
    });

    // Scale selection
    document.querySelectorAll('#exportScaleGroup .segmented-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#exportScaleGroup .segmented-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.export.scale = parseInt(btn.dataset.scale, 10);
        const valScale = document.getElementById('valExportScale');
        if (valScale) {
          const labels = {
            1: '1x (Resolução de Tela)',
            2: '2x (Recomendado - HD)',
            3: '3x (Ultra Print)',
            4: '4x (Master 4K+)'
          };
          valScale.textContent = labels[state.export.scale] || `${state.export.scale}x`;
        }
        updateResolutionPreview();
      });
    });

    // Video duration & FPS
    const sliderVideoDuration = document.getElementById('sliderVideoDuration');
    const valVideoDuration = document.getElementById('valVideoDuration');
    if (sliderVideoDuration && valVideoDuration) {
      sliderVideoDuration.addEventListener('input', (e) => {
        state.export.duration = parseFloat(e.target.value);
        valVideoDuration.textContent = `${state.export.duration.toFixed(1)} seg`;
      });
    }

    document.querySelectorAll('#fpsGroup .segmented-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#fpsGroup .segmented-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.export.fps = parseInt(btn.dataset.fps, 10);
      });
    });

    // Batch URLs Modal
    const btnOpenBatchModal = document.getElementById('btnOpenBatchModal');
    const batchModal = document.getElementById('batchModal');
    const btnCloseBatchModal = document.getElementById('btnCloseBatchModal');
    const btnCancelBatchModal = document.getElementById('btnCancelBatchModal');
    const btnAddBatchUrlsBtn = document.getElementById('btnAddBatchUrlsBtn');
    const batchUrlsTextarea = document.getElementById('batchUrlsTextarea');

    if (btnOpenBatchModal && batchModal) {
      btnOpenBatchModal.addEventListener('click', () => {
        batchModal.classList.add('open');
        if (batchUrlsTextarea) batchUrlsTextarea.focus();
      });
    }

    const closeBatchModal = () => batchModal && batchModal.classList.remove('open');
    if (btnCloseBatchModal) btnCloseBatchModal.addEventListener('click', closeBatchModal);
    if (btnCancelBatchModal) btnCancelBatchModal.addEventListener('click', closeBatchModal);

    if (btnAddBatchUrlsBtn && batchUrlsTextarea) {
      btnAddBatchUrlsBtn.addEventListener('click', async () => {
        const text = batchUrlsTextarea.value.trim();
        if (!text) return;

        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
        closeBatchModal();
        batchUrlsTextarea.value = '';

        if (lines.length > 0) {
          showToast(`Importando ${lines.length} link(s)...`, 'info');
          pushHistory();
          let count = 0;
          for (const line of lines) {
            try {
              await addItemFromUrlOrData(line, null, { skipHistory: true });
              count++;
            } catch (e) {}
          }
          showToast(`${count} link(s) importados!`, 'success');
        }
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Initialize Application
  // ---------------------------------------------------------------------------
  async function init() {
    checkServerInfo();
    syncSettingsUI();
    renderGrid();
    setupPanAndZoom();
    setupClipboardAndDragDrop();
    bindUIEvents();
    updateUndoRedoButtons();

    // Auto load sample showcase
    setTimeout(() => {
      loadSampleShowcase();
    }, 200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
