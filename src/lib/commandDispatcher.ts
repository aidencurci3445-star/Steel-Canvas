import { useStore } from '../store/useStore';
import { saveStateToFile, loadStateFromFile, newCanvas } from './persistence';
import { startWeld, stopWeld, testWeldConnectivity } from './weldNetwork';
import { check } from '@tauri-apps/plugin-updater';

/**
 * Strips path traversal sequences and dangerous characters from user input names.
 * Prevents CWE-22 (Path Traversal) when names are used in file operations.
 */
const sanitizeName = (name: string): string => {
    return name
        .replace(/\.\.[/\\]/g, '')    // Remove ../ and ..\
        .replace(/[/\\]/g, '-')       // Replace path separators with dashes
        .replace(/[\x00-\x1f]/g, '')  // Strip control characters
        .replace(/[<>:"|]/g, '')      // Strip truly dangerous chars (keep ? and *)
        .trim();
};

export const dispatchCommand = async (input: string) => {
    const store = useStore.getState();
    const trimmed = input.trim();
    if (!trimmed.startsWith('/')) return;

    // Simple tokenization separating by spaces
    const parts = trimmed.split(' ').filter(Boolean);
    const command = parts[0].toLowerCase();

    try {
        switch (command) {
            case '/node': {
                // /node [name] [x] [y]
                if (parts.length < 2) throw new Error('Usage: /node [name] [x] [y]');
                const name = sanitizeName(parts[1]);
                const x = parseFloat(parts[2] || '0');
                const y = parseFloat(parts[3] || '0');

                store.addNode({
                    id: crypto.randomUUID(),
                    name,
                    x,
                    y,
                    summary: '',
                    type: 'default'
                });
                break;
            }
            case '/link': {
                // /link [source_id] [target_id]
                if (parts.length < 3) throw new Error('Usage: /link [source] [target]');
                store.addEdge({
                    id: crypto.randomUUID(),
                    source: parts[1],
                    target: parts[2]
                });
                break;
            }
            case '/delete': {
                // /delete [id]
                if (parts.length < 2) throw new Error('Usage: /delete [id]');
                store.deleteNode(parts[1]);
                break;
            }
            case '/clear': {
                // /clear
                store.clearGraph();
                break;
            }
            case '/edit': {
                // /edit [id] [new_name]
                if (parts.length < 3) throw new Error('Usage: /edit [id] [new_name_with_spaces...]');
                const id = parts[1];
                const newName = sanitizeName(parts.slice(2).join(' '));

                const nodeExists = store.nodes.some(n => n.id === id);
                if (!nodeExists) throw new Error(`Node not found: ${id}`);

                store.updateNode(id, { name: newName });
                break;
            }
            case '/folder': {
                // /folder [name] [x] [y] [w] [h]
                if (parts.length < 6) throw new Error('Usage: /folder [name] [x] [y] [w] [h]');
                store.addFolder({
                    id: crypto.randomUUID(),
                    name: sanitizeName(parts[1]),
                    x: parseFloat(parts[2]),
                    y: parseFloat(parts[3]),
                    w: parseFloat(parts[4]),
                    h: parseFloat(parts[5]),
                });
                break;
            }
            case '/term': {
                // /term [name] [x] [y]
                const name = sanitizeName(parts[1] || 'Console');
                const x = parseFloat(parts[2] || '0');
                const y = parseFloat(parts[3] || '0');

                store.addNode({
                    id: crypto.randomUUID(),
                    name,
                    x,
                    y,
                    summary: 'Terminal Session',
                    type: 'terminal'
                });
                break;
            }
            case '/save': {
                await saveStateToFile();
                break;
            }
            case '/anim': {
                // /anim [on|off]
                const val = parts[1]?.toLowerCase();
                if (val !== 'on' && val !== 'off') throw new Error('Usage: /anim [on|off]');
                store.setAnimationsDisabled(val === 'off');
                break;
            }
            case '/load': {
                await loadStateFromFile();
                break;
            }
            case '/new': {
                newCanvas();
                break;
            }
            case '/autosave': {
                // /autosave [seconds] — 0 to disable
                if (parts.length < 2) throw new Error('Usage: /autosave [seconds] (0 = off)');
                const seconds = parseFloat(parts[1]);
                if (isNaN(seconds) || seconds < 0) throw new Error('Interval must be a non-negative number.');
                const ms = Math.round(seconds * 1000);
                store.setAutosaveInterval(ms);
                break;
            }
            case '/weld': {
                if (parts.length < 2) throw new Error('Usage: /weld [start|cut|join] [id?]');
                const subCommand = parts[1].toLowerCase();

                if (subCommand === 'start') {
                    const newRoomId = crypto.randomUUID();
                    store.setSwarmKey(newRoomId);
                    await startWeld(newRoomId);
                    // Force a local save so the file has the new key embedded 
                    await saveStateToFile();
                } else if (subCommand === 'join') {
                    if (parts.length < 3) throw new Error('Usage: /weld join [id]');
                    const joinId = parts[2];
                    store.setSwarmKey(joinId);
                    await startWeld(joinId);
                } else if (subCommand === 'cut' || subCommand === 'break') {
                    store.setSwarmKey(null);
                    stopWeld();
                    await saveStateToFile();
                } else if (subCommand === 'test') {
                    const report = await testWeldConnectivity();
                    // Show each line as a notification (showError acts as toast)
                    store.showError(report);
                } else {
                    throw new Error(`Unknown weld subcommand: ${subCommand}`);
                }
                break;
            }
            case '/register': {
                // /register [jwt_key]
                if (parts.length < 2) throw new Error('Usage: /register [key]');
                store.setLicenseKey(parts[1]);
                store.showError('License key registered successfully. You can now connect to official servers.');
                break;
            }
            case '/config': {
                // /config weld [url]
                if (parts.length < 3 || parts[1] !== 'weld') throw new Error('Usage: /config weld [url]');
                store.setWeldServerUrl(parts[2]);
                store.showError(`Weld server URL updated to: ${parts[2]}`);
                break;
            }
            case '/autoupdate': {
                // /autoupdate [on|off]
                const val = parts[1]?.toLowerCase();
                if (val !== 'on' && val !== 'off') throw new Error('Usage: /autoupdate [on|off]');
                store.setAutoUpdate(val === 'on');
                store.showError(`Auto-updating is now ${val.toUpperCase()}`);
                break;
            }
            case '/update': {
                if (!store.licenseKey) {
                    throw new Error('You must register a valid license key (/register <key>) to use the official updater.');
                }
                store.showError('Verifying license locally...');
                try {
                    const parts = store.licenseKey.split('.');
                    if (parts.length !== 3) {
                        throw new Error('Invalid format.');
                    }
                    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
                    if (!payload.user) {
                        throw new Error('Invalid payload state.');
                    }
                } catch (err: any) {
                    throw new Error(`License validation failed locally: The key is not a valid recognized format.`);
                }
                store.showError('Checking for updates...');
                try {
                    const update = await check();
                    if (update && update.version !== update.currentVersion) {
                        store.showError(`Found update ${update.version} (published ${update.currentVersion}). Downloading...`);

                        // We could show download progress here using the onEvent hook
                        await update.downloadAndInstall();
                        store.showError('Update installed successfully. App will restart shortly.');

                        // Wait a bit to let the user read the success message
                        setTimeout(async () => {
                            const { relaunch } = await import('@tauri-apps/plugin-process');
                            await relaunch();
                        }, 3000);
                    } else {
                        store.showError('You are already on the latest version.');
                    }
                } catch (e: any) {
                    const msg = e?.message || (typeof e === 'string' ? e : JSON.stringify(e));
                    throw new Error(`Updater failed. Ensure you are a licensed user or using a valid server. ${msg}`);
                }
                break;
            }
            default:
                throw new Error(`Unknown command: ${command}`);
        }

        // On success, save to history and clear input
        store.addToHistory(trimmed);
        store.setCurrentInput('');
    } catch (err: any) {
        store.showError(err.message);
    }
};
