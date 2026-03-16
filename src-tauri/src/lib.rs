use std::fs;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use portable_pty::{native_pty_system, CommandBuilder, PtySize, MasterPty};

mod ast_tester;

struct PTYProcess {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
}

struct AppState {
    ptys: Mutex<HashMap<String, PTYProcess>>,
}


// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

#[tauri::command]
fn save_graph(path: &str, data: &str) -> Result<(), String> {
    fs::write(path, data).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_graph(path: &str) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_file(path: &str, content: &str) -> Result<(), String> {
    fs::write(path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_file(path: &str) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
struct ParsedNode {
    id: String,
    name: String,
    node_type: String,
    file_path: String,
    folder_id: Option<String>,
}

#[derive(serde::Serialize, Clone)]
struct ParsedFolder {
    id: String,
    name: String,
    parent_folder_id: Option<String>,
}

#[derive(serde::Serialize)]
struct ParsedEdge {
    source: String,
    target_name: String,
}

#[derive(serde::Serialize)]
struct DirectoryDropResult {
    folders: Vec<ParsedFolder>,
    nodes: Vec<ParsedNode>,
    edges: Vec<ParsedEdge>,
}

fn scan_directory(
    path: &std::path::Path,
    parent_folder_id: Option<String>,
    folders: &mut Vec<ParsedFolder>,
    nodes: &mut Vec<ParsedNode>,
    edges: &mut Vec<ParsedEdge>,
) {
    let ignored_dirs = [
        "node_modules", "target", ".git", ".idea", ".vscode", "dist", "build", 
        "__pycache__", ".venv", "venv", "env", "bin", "obj", ".next", ".nuxt", 
        "coverage", ".cache", "vendor", "utils", "assets", "snapshots", "refs", "blobs"
    ];
    
    let ignored_extensions = [
        "dll", "exe", "so", "dylib", "bin", "obj", "pdb", // Compiled/Binary
        "zip", "tar", "gz", "7z", "rar", // Archives
        "woff", "woff2", "ttf", "eot", // Fonts
        "doc", "docx", "xls", "xlsx", "ppt", // Office/Docs (PDF removed to allow rendering)
        "pyc", "pyo", "pyd", "class", "jar", "war" // Bytecode
    ];
    
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let metadata = entry.metadata().unwrap();
            let file_name = entry.file_name().into_string().unwrap_or_default();
            let path_buf = entry.path();
            
            if metadata.is_dir() {
                if ignored_dirs.contains(&file_name.as_str()) {
                    continue;
                }
                
                if file_name.starts_with("models--") || file_name.starts_with("datasets--") {
                    continue;
                }
                
                // Ignore long purely alphanumeric strings (like 40-char git hashes or cache folders)
                if file_name.len() >= 32 && file_name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
                    continue;
                }
                
                let folder_id = uuid::Uuid::new_v4().to_string();
                folders.push(ParsedFolder {
                    id: folder_id.clone(),
                    name: file_name,
                    parent_folder_id: parent_folder_id.clone(),
                });
                
                scan_directory(&path_buf, Some(folder_id), folders, nodes, edges);
            } else {
                // It's a file
                let extension = path_buf.extension().and_then(|e| e.to_str()).unwrap_or("");
                
                if extension.is_empty() {
                    continue; // Skip files with no extensions (often git objects, cache hashes, etc)
                }

                if ignored_extensions.contains(&extension) {
                    continue; // Skip junk files
                }

                let node_id = uuid::Uuid::new_v4().to_string();
                
                // Attempt to read for basic relationships
                if metadata.len() < 1024 * 500 { // Only read files < 500KB
                    if let Ok(content) = fs::read_to_string(&path_buf) {
                        if extension == "ts" || extension == "tsx" || extension == "js" || extension == "jsx" {
                            let imports = ast_tester::check_js_imports(&content);
                            for imported_module in imports {
                                let target_name = imported_module.split('/').last().unwrap_or(&imported_module);
                                edges.push(ParsedEdge {
                                    source: node_id.clone(),
                                    target_name: target_name.to_lowercase()
                                });
                            }
                        } else if extension == "py" {
                            let imports = ast_tester::check_py_imports(&content);
                            for m in imports {
                                edges.push(ParsedEdge {
                                    source: node_id.clone(),
                                    target_name: m.to_lowercase()
                                });
                            }
                        }
                    }
                }
                
                nodes.push(ParsedNode {
                    id: node_id,
                    name: file_name,
                    node_type: format!(".{}", extension),
                    file_path: path_buf.to_string_lossy().to_string(),
                    folder_id: parent_folder_id.clone(),
                });
            }
        }
    }
}

#[tauri::command]
fn open_in_vscode(path: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let result = std::process::Command::new("cmd")
        .args(["/c", "code", path])
        .spawn()
        .or_else(|_| {
            std::process::Command::new("powershell")
                .args(["-Command", &format!("Start-Process '{}'", path)])
                .spawn()
        });

    #[cfg(not(target_os = "windows"))]
    let result = std::process::Command::new("code")
        .arg(path)
        .spawn()
        .or_else(|_| std::process::Command::new("open").arg(path).spawn());

    match result {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Failed to open file: {}", e)),
    }
}

#[tauri::command]
fn spawn_pty(node_id: String, app_handle: AppHandle, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let pty_system = native_pty_system();
    
    let pair = pty_system.openpty(PtySize {
        rows: 24,
        cols: 80,
        pixel_width: 0,
        pixel_height: 0,
    }).map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    let cmd = CommandBuilder::new("cmd.exe");
    
    #[cfg(not(target_os = "windows"))]
    let cmd = CommandBuilder::new("bash");

    let _child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;

    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;

    state.ptys.lock().unwrap().insert(node_id.clone(), PTYProcess {
        master: pair.master,
        writer,
    });

    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        while let Ok(n) = reader.read(&mut buf) {
            if n == 0 { break; }
            let output = buf[..n].to_vec();
            let text = String::from_utf8_lossy(&output).to_string();
            let _ = app_handle.emit(&format!("pty_output_{}", node_id), text);
        }
        let _ = app_handle.emit(&format!("pty_exit_{}", node_id), ());
    });

    Ok(())
}

#[tauri::command]
fn write_pty(node_id: String, data: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    if let Some(pty) = state.ptys.lock().unwrap().get_mut(&node_id) {
        pty.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        pty.writer.flush().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn resize_pty(node_id: String, rows: u16, cols: u16, state: tauri::State<'_, AppState>) -> Result<(), String> {
    if let Some(pty) = state.ptys.lock().unwrap().get(&node_id) {
        pty.master.resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        }).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn process_directory_drop(path: &str) -> Result<String, String> {
    let mut folders = Vec::new();
    let mut nodes = Vec::new();
    let mut edges = Vec::new();
    let root_path = std::path::Path::new(path);
    
    if root_path.is_dir() {
        // Create root folder
        let root_folder_id = uuid::Uuid::new_v4().to_string();
        folders.push(ParsedFolder {
            id: root_folder_id.clone(),
            name: root_path.file_name().and_then(|n| n.to_str()).unwrap_or("Root").to_string(),
            parent_folder_id: None,
        });
        
        scan_directory(root_path, Some(root_folder_id), &mut folders, &mut nodes, &mut edges);
    }

    // --- Post-Processing: Prune Empty Folders ---
    // A folder is "empty" if no nodes belong to it directly, AND no retained subfolders belong to it.
    let mut changed = true;
    while changed {
        changed = false;
        let initial_len = folders.len();
        
        // Create a set of folder IDs that currently contain either files OR valid subfolders
        let mut active_parents = std::collections::HashSet::new();
        
        for folder in &folders {
            if let Some(parent_id) = &folder.parent_folder_id {
                active_parents.insert(parent_id.clone());
            }
        }
        
        folders.retain(|folder| {
            // Does it have nodes directly inside it?
            let has_nodes = nodes.iter().any(|n| n.folder_id.as_deref() == Some(&folder.id));
            if has_nodes { return true; }
            
            // Does it act as a parent for other valid subfolders?
            if active_parents.contains(&folder.id) { return true; }
            
            false 
        });
        
        if folders.len() != initial_len {
            changed = true;
        }
    }
    
    let result = DirectoryDropResult { folders, nodes, edges };
    serde_json::to_string(&result).map_err(|e| e.to_string())
}

// ── Child Webview Management ─────────────────────────────────────────────────

/// Creates a native child webview inside the main window at the given position/size.
/// This bypasses iframe X-Frame-Options restrictions since it's a real browser instance.
#[tauri::command]
async fn create_webview(
    app: AppHandle,
    label: String,
    url: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    use tauri::Manager;

    // Destroy the old one if it exists (re-opening same node)
    if let Some(existing) = app.get_webview(&label) {
        let _ = existing.close();
        // Small delay to let the old webview clean up
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }

    // Get the main window (Window type has add_child, not WebviewWindow)
    let window = app
        .get_window("main")
        .ok_or("Main window not found")?;

    // Parse the URL
    let parsed_url: url::Url = url.parse().map_err(|e: url::ParseError| e.to_string())?;

    // Build the child webview
    let builder = tauri::webview::WebviewBuilder::new(
        &label,
        tauri::WebviewUrl::External(parsed_url),
    );

    // Attach it to the main window at the specified position and size
    window
        .add_child(
            builder,
            tauri::LogicalPosition::new(x, y),
            tauri::LogicalSize::new(width, height),
        )
        .map_err(|e: tauri::Error| e.to_string())?;

    Ok(())
}

/// Destroys (closes) a child webview by its label.
#[tauri::command]
async fn destroy_webview(app: AppHandle, label: String) -> Result<(), String> {
    use tauri::Manager;
    if let Some(wv) = app.get_webview(&label) {
        wv.close().map_err(|e: tauri::Error| e.to_string())?;
    }
    Ok(())
}

/// Repositions and resizes an existing child webview.
#[tauri::command]
async fn resize_webview(
    app: AppHandle,
    label: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    use tauri::Manager;
    let wv = app
        .get_webview(&label)
        .ok_or("Webview not found")?;

    wv.set_position(tauri::LogicalPosition::new(x, y))
        .map_err(|e: tauri::Error| e.to_string())?;
    wv.set_size(tauri::LogicalSize::new(width, height))
        .map_err(|e: tauri::Error| e.to_string())?;

    Ok(())
}

/// Navigates an existing child webview to a new URL.
#[tauri::command]
async fn navigate_webview(app: AppHandle, label: String, url: String) -> Result<(), String> {
    use tauri::Manager;
    let wv = app
        .get_webview(&label)
        .ok_or("Webview not found")?;

    let parsed_url: url::Url = url.parse().map_err(|e: url::ParseError| e.to_string())?;
    wv.navigate(parsed_url);

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState { ptys: Mutex::new(HashMap::new()) })
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            save_graph, load_graph, save_file, load_file, process_directory_drop, open_in_vscode,
            spawn_pty, write_pty, resize_pty,
            create_webview, destroy_webview, resize_webview, navigate_webview
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
