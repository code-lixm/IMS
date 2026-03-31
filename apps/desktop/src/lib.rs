use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Listener, Manager, Runtime,
};

static QUITTING: AtomicBool = AtomicBool::new(false);

// Store the server child process so we can kill it on exit
struct ServerProcess {
    child: Option<tauri_plugin_shell::process::CommandChild>,
}

fn start_server<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<tauri_plugin_shell::process::CommandChild, Box<dyn std::error::Error>> {
    use tauri_plugin_shell::ShellExt;

    // Get the server executable path from bundled resources
    let resource_dir = app.path().resource_dir()?;
    let server_path = resource_dir.join("dist/server");
    let node_modules_path = resource_dir.join("node_modules");
    println!("[tauri] starting server at: {:?}", server_path);

    let cmd = app
        .shell()
        .command(&server_path)
        .env("NODE_PATH", node_modules_path.to_str().unwrap_or(""));
    let (mut rx, child) = cmd.spawn()?;

    // Forward server logs to stdout
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                    println!("[server] {}", String::from_utf8_lossy(&line));
                }
                tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                    eprintln!("[server] {}", String::from_utf8_lossy(&line));
                }
                tauri_plugin_shell::process::CommandEvent::Error(err) => {
                    eprintln!("[server] error: {}", err);
                }
                tauri_plugin_shell::process::CommandEvent::Terminated(status) => {
                    println!("[server] terminated with status: {:?}", status);
                    // Notify frontend that server has stopped
                    let _ = app_handle.emit("server-stopped", ());
                }
                _ => {}
            }
        }
    });

    println!("[tauri] server started successfully");
    Ok(child)
}

// ─────────────────────────────────────────────────────────────────────────────
// Tray
// ─────────────────────────────────────────────────────────────────────────────

fn setup_tray<R: Runtime>(app: &AppHandle<R>) -> Result<(), Box<dyn std::error::Error>> {
    let show_item = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
    let hide_item = MenuItem::with_id(app, "hide", "隐藏窗口", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&show_item, &hide_item, &quit_item])?;

    let _tray = TrayIconBuilder::with_id("main-tray")
        .tooltip("面试管理")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "hide" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }
            "quit" => {
                QUITTING.store(true, Ordering::SeqCst);
                // Kill the server before exiting
                if let Some(server) = app.state::<Mutex<ServerProcess>>().lock().ok() {
                    let mut process = server;
                    if let Some(child) = process.child.take() {
                        let _ = child.kill();
                    }
                }
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        })
        .build(app)?;

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// Deep link — .imr file open
// ─────────────────────────────────────────────────────────────────────────────

fn handle_imr_open<R: Runtime>(app: &AppHandle<R>, path: &str) {
    println!("[tauri] opening .imr file: {}", path);
    // Emit event to frontend so it can trigger the import flow
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.emit("imr-file-opened", path);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tauri commands
// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
fn is_quitting() -> bool {
    QUITTING.load(Ordering::SeqCst)
}

#[tauri::command]
fn show_main_window(app: AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[tauri::command]
fn hide_main_window(app: AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

#[tauri::command]
fn get_app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

// ─────────────────────────────────────────────────────────────────────────────
// App entry
// ─────────────────────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // If another instance launches with an .imr file argument, handle it
            for arg in argv.iter() {
                if arg.ends_with(".imr") {
                    handle_imr_open(app, arg);
                    break;
                }
            }
            // Focus existing window
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            // Start the backend server
            match start_server(app.handle()) {
                Ok(child) => {
                    app.manage(Mutex::new(ServerProcess { child: Some(child) }));
                }
                Err(e) => {
                    eprintln!("[tauri] failed to start server: {}", e);
                }
            }

            // Setup system tray
            if let Err(e) = setup_tray(app.handle()) {
                eprintln!("[tauri] tray setup failed: {}", e);
            }

            // Listen for .imr deep link / file open events
            // On macOS/iOS the deep link plugin emits these events
            let handle = app.handle().clone();
            app.listen("deep-link://new-url", move |event| {
                if let Ok(urls) = serde_json::from_str::<Vec<String>>(event.payload()) {
                    for url in urls {
                        if url.ends_with(".imr") {
                            handle_imr_open(&handle, &url);
                        }
                    }
                }
            });

            println!(
                "[tauri] Interview Manager v{} started",
                env!("CARGO_PKG_VERSION")
            );
            Ok(())
        })
        .on_window_event(|window, event| {
            // Removed unused import

            // On close button, hide to tray instead of quitting
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if !QUITTING.load(Ordering::SeqCst) {
                    api.prevent_close();
                    let _ = window.hide();
                } else {
                    // Actually quitting - kill the server
                    if let Ok(mut server) = window.state::<Mutex<ServerProcess>>().lock() {
                        if let Some(child) = server.child.take() {
                            let _ = child.kill();
                        }
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            is_quitting,
            show_main_window,
            hide_main_window,
            get_app_version,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
