import { useMemo, useRef } from 'react';
import { Excalidraw, convertToExcalidrawElements } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { templateSkeleton } from './data/hldQuestions.js';

const SHAPES = { rectangle: 'rectangle', diamond: 'diamond', ellipse: 'ellipse', cache: 'ellipse', cdn: 'ellipse' };
const FILLS = { database: '#a5d8ff', storage: '#a5d8ff', queue: '#ffec99', 'load-balancer': '#ffec99', cache: '#ffc9c9', cdn: '#ffc9c9', client: '#d0bfff', gateway: '#d0bfff' };

// Boards drawn with the earlier custom canvas stored simple shapes in `elements`.
function legacySkeleton(elements = []) {
  const out = [];
  for (const item of elements) {
    if (item.type === 'arrow' || item.type === 'line') {
      out.push({ type: item.type, x: item.x, y: item.y, points: [[0, 0], [item.x2 - item.x, item.y2 - item.y]], ...(item.label ? { label: { text: item.label } } : {}) });
    } else if (item.type === 'stroke' && item.points?.length > 1) {
      const [first] = item.points;
      out.push({ type: 'line', x: first.x, y: first.y, points: item.points.map((point) => [point.x - first.x, point.y - first.y]) });
    } else if (item.type === 'text') {
      out.push({ type: 'text', x: item.x, y: item.y, text: item.label || 'Text', fontSize: 20 });
    } else if (item.w) {
      out.push({
        type: SHAPES[item.type] || 'rectangle', x: item.x, y: item.y, width: item.w, height: item.h,
        backgroundColor: FILLS[item.type] || '#b2f2bb', fillStyle: 'solid', roundness: { type: 3 },
        ...(item.label ? { label: { text: item.label, fontSize: 14 } } : {}),
      });
    }
  }
  return out;
}

// Boards with no saved scene yet are built from a template or from the old canvas format.
function seedSkeleton(board) {
  if (board.scene?.elements?.length) return null;
  if (board.seed?.template) return templateSkeleton(board.seed.template, 1);
  if (board.elements?.length) return legacySkeleton(board.elements);
  return null;
}

function initialElements(board) {
  if (board.scene?.elements?.length) return board.scene.elements;
  const skeleton = seedSkeleton(board);
  return skeleton ? convertToExcalidrawElements(skeleton) : [];
}

// Excalidraw measures text with whatever font is available at that moment. Wait for the
// hand-drawn faces it registers, then rebuild seeded shapes so boxes fit their labels.
async function waitForSketchFonts() {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const faces = [...document.fonts].filter((face) => /Excalifont|Virgil/.test(face.family));
    if (faces.length) { await Promise.all(faces.map((face) => face.load().catch(() => {}))); return; }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

export default function ExcalidrawCanvas({ board, theme, onSceneChange }) {
  const initialData = useMemo(() => ({
    elements: initialElements(board),
    appState: { ...(board.scene?.appState || {}), openSidebar: null },
    files: board.scene?.files || undefined,
  }), []); // read once per board; the parent remounts this component when the board changes
  const lastSignature = useRef(null);
  const startedRef = useRef(null);
  const userEdited = useRef(false);
  // Seeded boards are not saved until their text has been re-measured with the real font.
  const settled = useRef(!seedSkeleton(board));

  function handleChange(elements, appState, files) {
    if (!settled.current && !userEdited.current) return;
    const live = elements.filter((element) => !element.isDeleted);
    const signature = live.map((element) => `${element.id}:${element.version}`).join('|');
    if (signature === lastSignature.current) return;
    const firstReport = lastSignature.current === null;
    lastSignature.current = signature;
    // The very first report only mirrors what we loaded; persist it only when it carries new data (a converted template/legacy board).
    if (firstReport && board.scene?.elements?.length) return;
    if (firstReport && !live.length) return;
    const usedFiles = {};
    for (const element of live) if (element.fileId && files?.[element.fileId]) usedFiles[element.fileId] = files[element.fileId];
    onSceneChange({ elements: live, appState: { viewBackgroundColor: appState.viewBackgroundColor, gridModeEnabled: appState.gridModeEnabled }, files: usedFiles });
  }

  return (
    <Excalidraw
      initialData={initialData}
      excalidrawAPI={(api) => {
        if (!api || startedRef.current === api) return;
        startedRef.current = api;
        const fit = () => [300, 1000].forEach((delay) => setTimeout(() => api.scrollToContent(api.getSceneElements(), { fitToContent: true, animate: false, viewportZoomFactor: 0.9 }), delay));
        if (!initialData.elements.length) return;
        fit();
        const skeleton = seedSkeleton(board);
        if (!skeleton) return;
        waitForSketchFonts().then(() => {
          if (!userEdited.current) {
            api.updateScene({ elements: convertToExcalidrawElements(skeleton) });
            fit();
          }
          settled.current = true;
          // Persist the re-measured scene right away instead of waiting for the next canvas change.
          setTimeout(() => {
            const live = api.getSceneElements().filter((element) => !element.isDeleted);
            if (!live.length) return;
            const appState = api.getAppState();
            lastSignature.current = live.map((element) => `${element.id}:${element.version}`).join('|');
            onSceneChange({ elements: live, appState: { viewBackgroundColor: appState.viewBackgroundColor, gridModeEnabled: appState.gridModeEnabled }, files: {} });
          }, 400);
        });
      }}
      onChange={handleChange}
      theme={theme}
      onPointerDown={() => { userEdited.current = true; }}
      handleKeyboardGlobally={false}
      autoFocus={false}
      UIOptions={{ canvasActions: { loadScene: true, saveToActiveFile: false, export: { saveFileToDisk: true } } }}
    />
  );
}
