import { Canvas } from './components/canvas/Canvas';
import { CliBar } from './components/cli/CliBar';
import { ContextMenu } from './components/ui/ContextMenu';
import { NoteEditor } from './components/ui/NoteEditor';
import { AutosaveManager } from './components/ui/AutosaveManager';
import { TagWheel } from './components/ui/TagWheel';
import { TagSearchModal } from './components/ui/TagSearchModal';
import { ExportModal } from './components/ui/ExportModal';
import { WebNodeModal } from './components/ui/WebNodeModal';
import { useStore } from './store/useStore';
import { check } from '@tauri-apps/plugin-updater';
import { useEffect } from 'react';

function App() {
  const theme = useStore((state) => state.theme);

  useEffect(() => {
    const initUpdater = async () => {
      const { autoUpdate, licenseKey, setAutoUpdate, showError } = useStore.getState();
      if (!autoUpdate || !licenseKey) return;

      try {
        const update = await check();
        if (update && update.version !== update.currentVersion) {
          showError(`[SYSTEM] Official Update v${update.version} available. Type /update to install.`);
        }
      } catch (e) {
        console.warn("Update check failed (expected if local DIY build):", e);
        // If we are in DIY mode, checking endpoints will fail, so silently disable auto-update spam
        setAutoUpdate(false);
      }
    };
    // Delay slightly to let the UI render first
    setTimeout(initUpdater, 2000);
  }, []);

  return (
    <main
      className={`relative w-screen h-screen overflow-hidden font-mono selection:bg-neutral-500/30 transition-colors duration-300 ${theme === 'dark' ? 'bg-[#0f0f0f] text-neutral-200' : 'bg-white text-black selection:bg-neutral-200'
        }`}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Canvas />
      <CliBar />
      <ContextMenu />
      <NoteEditor />
      <TagWheel />
      <TagSearchModal />
      <ExportModal />
      <WebNodeModal />
      <AutosaveManager />
      {/* Inline CSS for edge animations — static content, no user input */}
      <style>{`
        @keyframes dash {
          from { stroke-dashoffset: 32; }
          to { stroke-dashoffset: 0; }
        }
        .animated-path {
          animation: dash 1s linear infinite;
          will-change: stroke-dashoffset;
          transform: translateZ(0);
        }
      `}</style>
    </main>
  );
}

export default App;
