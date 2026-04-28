use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Listener, Manager, Runtime,
};
use tauri_plugin_updater::UpdaterExt;

static QUITTING: AtomicBool = AtomicBool::new(false);
// Increase max log size to 20MB and keep 5 rotated files
const LOG_FILE_SIZE_LIMIT: u64 = 20 * 1024 * 1024;
const LOG_FILE_COUNT_LIMIT: usize = 5;
const LOG_EXPORT_COUNT_LIMIT: usize = 10;
const DESKTOP_SERVER_HOST: &str = "127.0.0.1";
const DEFAULT_DESKTOP_SERVER_PORT: u16 = 9092;
const MAX_DESKTOP_SERVER_PORT: u16 = 9112;
const SERVER_PORT_RELEASE_WAIT_MS: u64 = 300;
const SERVER_READY_TIMEOUT_MS: u64 = 30_000;
const SERVER_READY_POLL_MS: u64 = 250;

// Store the server child process so we can kill it on exit
struct ServerProcess {
    child: Option<tauri_plugin_shell::process::CommandChild>,
    port: u16,
}

struct AppLogger {
    dir: PathBuf,
    current_file: PathBuf,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopAppInfo {
    version: String,
    log_dir: String,
}

struct StartedServer {
    child: Option<tauri_plugin_shell::process::CommandChild>,
    port: u16,
}

impl AppLogger {
    fn new(dir: PathBuf) -> Result<Self, Box<dyn std::error::Error>> {
        fs::create_dir_all(&dir)?;
        let current_file = dir.join("ims.log");
        if !current_file.exists() {
            File::create(&current_file)?;
        }
        Ok(Self { dir, current_file })
    }

    fn write_line(&mut self, level: &str, source: &str, message: &str) {
        if self.rotate_if_needed().is_err() {
            return;
        }

        // Format timestamp as `YYYY-MM-DD HH:mm:ss.mmm`
        let now = SystemTime::now();
        let datetime: chrono::DateTime<chrono::Local> = now.into();
        let timestamp = datetime.format("%Y-%m-%d %H:%M:%S.%3f").to_string();
        let sanitized = message.replace('\n', " ").replace('\r', " ");
        let line = format!("[{}] [{}] [{}] {}\n", timestamp, level, source, sanitized);

        if let Ok(mut file) = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.current_file)
        {
            let _ = file.write_all(line.as_bytes());
            let _ = file.flush();
        }
    }

    fn rotate_if_needed(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        let size = fs::metadata(&self.current_file)
            .map(|value| value.len())
            .unwrap_or(0);
        if size < LOG_FILE_SIZE_LIMIT {
            return Ok(());
        }

        for index in (1..=LOG_FILE_COUNT_LIMIT).rev() {
            let from = self.dir.join(format!("ims.{}.log", index));
            let to = self.dir.join(format!("ims.{}.log", index + 1));
            if from.exists() {
                if index == LOG_FILE_COUNT_LIMIT {
                    let _ = fs::remove_file(&from);
                } else {
                    let _ = fs::rename(&from, &to);
                }
            }
        }

        if self.current_file.exists() {
            let _ = fs::rename(&self.current_file, self.dir.join("ims.1.log"));
        }
        let _ = File::create(&self.current_file)?;
        Ok(())
    }

    fn export_bundle(&mut self) -> Result<PathBuf, Box<dyn std::error::Error>> {
        self.prune_old_exports();

        let exports_dir = self.dir.join("exports");
        fs::create_dir_all(&exports_dir)?;
        let export_dir = exports_dir.join(format!("ims-logs-{}", now_unix_ms()));
        fs::create_dir_all(&export_dir)?;

        for entry in fs::read_dir(&self.dir)? {
            let entry = entry?;
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
                continue;
            };
            if !name.ends_with(".log") {
                continue;
            }
            fs::copy(&path, export_dir.join(name))?;
        }

        let mut meta = File::create(export_dir.join("README.txt"))?;
        meta.write_all(
            format!(
                "IMS 日志导出\n版本: {}\n导出时间: {}\n日志目录: {}\n",
                get_app_version(),
                now_unix_ms(),
                self.dir.display()
            )
            .as_bytes(),
        )?;

        Ok(export_dir)
    }

    fn prune_old_exports(&self) {
        let exports_dir = self.dir.join("exports");
        let Ok(read_dir) = fs::read_dir(&exports_dir) else {
            return;
        };

        let mut entries = read_dir
            .filter_map(|entry| entry.ok())
            .filter_map(|entry| {
                let path = entry.path();
                let metadata = entry.metadata().ok()?;
                let modified = metadata.modified().ok()?;
                Some((path, modified))
            })
            .collect::<Vec<_>>();

        entries.sort_by(|a, b| b.1.cmp(&a.1));
        for (path, _) in entries.into_iter().skip(LOG_EXPORT_COUNT_LIMIT) {
            let _ = fs::remove_dir_all(path);
        }
    }

    fn dir_path(&self) -> PathBuf {
        self.dir.clone()
    }
}

fn log_event<R: Runtime>(app: &AppHandle<R>, level: &str, source: &str, message: impl AsRef<str>) {
    if let Ok(mut logger) = app.state::<Mutex<AppLogger>>().lock() {
        logger.write_line(level, source, message.as_ref());
    }

    match level {
        "ERROR" => eprintln!("[{}] {}", source, message.as_ref()),
        _ => println!("[{}] {}", source, message.as_ref()),
    }
}

fn open_in_file_manager(path: &Path) -> Result<(), String> {
    let status = if cfg!(target_os = "macos") {
        Command::new("open").arg(path).status()
    } else if cfg!(target_os = "windows") {
        Command::new("explorer").arg(path).status()
    } else {
        Command::new("xdg-open").arg(path).status()
    }
    .map_err(|err| err.to_string())?;

    if status.success() {
        Ok(())
    } else {
        Err(format!("failed to open path: {}", path.display()))
    }
}

fn reveal_in_file_manager(path: &Path) -> Result<(), String> {
    let status = if cfg!(target_os = "macos") {
        Command::new("open").arg("-R").arg(path).status()
    } else if cfg!(target_os = "windows") {
        Command::new("explorer")
            .arg(format!("/select,{}", path.display()))
            .status()
    } else {
        let target = path.parent().unwrap_or(path);
        Command::new("xdg-open").arg(target).status()
    }
    .map_err(|err| err.to_string())?;

    if status.success() {
        Ok(())
    } else {
        Err(format!("failed to reveal path: {}", path.display()))
    }
}

fn stop_managed_server<R: Runtime>(app: &AppHandle<R>) {
    if let Ok(mut server) = app.state::<Mutex<ServerProcess>>().lock() {
        if let Some(child) = server.child.take() {
            log_event(
                app,
                "INFO",
                "tauri",
                format!("stopping managed server on port {}", server.port),
            );
            let _ = child.kill();
        }
    }
}

#[cfg(unix)]
fn should_kill_stale_server_process(command: &str) -> bool {
    let lower = command.to_lowercase();
    lower.contains("/ims.app/")
        || lower.contains("interview-manager")
        || lower.contains("/packages/server/dist/server")
        || lower.ends_with("/dist/server")
}

#[cfg(unix)]
fn terminate_stale_server_process(pid: i32) -> bool {
    let term_ok = Command::new("kill")
        .args(["-TERM", &pid.to_string()])
        .status()
        .map(|status| status.success())
        .unwrap_or(false);

    std::thread::sleep(Duration::from_millis(SERVER_PORT_RELEASE_WAIT_MS));

    let still_running = Command::new("kill")
        .args(["-0", &pid.to_string()])
        .status()
        .map(|status| status.success())
        .unwrap_or(false);

    if !still_running {
        return term_ok;
    }

    Command::new("kill")
        .args(["-KILL", &pid.to_string()])
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

#[cfg(unix)]
fn release_stale_server_on_port<R: Runtime>(
    app: &AppHandle<R>,
    _expected_server_path: &Path,
    port: u16,
) -> bool {
    let output = match Command::new("lsof")
        .args(["-nP", &format!("-iTCP:{}", port), "-sTCP:LISTEN", "-t"])
        .output()
    {
        Ok(output) => output,
        Err(error) => {
            log_event(
                app,
                "WARN",
                "tauri",
                format!("failed to run lsof: {}", error),
            );
            return false;
        }
    };

    let pids = String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| line.trim().parse::<i32>().ok())
        .collect::<Vec<_>>();

    if pids.is_empty() {
        return false;
    }

    let mut released = false;
    for pid in pids {
        let command_output = Command::new("ps")
            .args(["-p", &pid.to_string(), "-o", "command="])
            .output();
        let command_text = command_output
            .ok()
            .map(|value| String::from_utf8_lossy(&value.stdout).trim().to_string())
            .unwrap_or_default();

        if !should_kill_stale_server_process(&command_text) {
            log_event(
                app,
                "WARN",
                "tauri",
                format!(
                    "port {} occupied by non-IMS process pid={} command={}",
                    port, pid, command_text
                ),
            );
            continue;
        }

        let kill_ok = terminate_stale_server_process(pid);

        if kill_ok {
            released = true;
            log_event(
                app,
                "WARN",
                "tauri",
                format!(
                    "terminated stale IMS server process pid={} on port {}",
                    pid, port
                ),
            );
        }
    }

    released
}

#[cfg(windows)]
fn should_kill_stale_server_process(command: &str, expected_server_path: &Path) -> bool {
    let lower = command.to_lowercase();
    let expected = expected_server_path.to_string_lossy().to_lowercase();
    lower.contains(expected.as_str())
}

#[cfg(windows)]
fn get_windows_process_command(pid: u32) -> String {
    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            &format!(
                "(Get-CimInstance Win32_Process -Filter \"ProcessId = {}\").CommandLine",
                pid
            ),
        ])
        .output();

    output
        .ok()
        .map(|value| String::from_utf8_lossy(&value.stdout).trim().to_string())
        .unwrap_or_default()
}

#[cfg(windows)]
fn release_stale_server_on_port<R: Runtime>(
    app: &AppHandle<R>,
    expected_server_path: &Path,
    port: u16,
) -> bool {
    let output = match Command::new("netstat").args(["-ano", "-p", "tcp"]).output() {
        Ok(output) => output,
        Err(error) => {
            log_event(
                app,
                "WARN",
                "tauri",
                format!("failed to run netstat: {}", error),
            );
            return false;
        }
    };

    let port_suffix = format!(":{}", port);
    let pids = String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter(|line| line.contains(&port_suffix) && line.to_uppercase().contains("LISTEN"))
        .filter_map(|line| line.split_whitespace().last()?.parse::<u32>().ok())
        .collect::<Vec<_>>();

    if pids.is_empty() {
        return false;
    }

    let mut released = false;
    for pid in pids {
        let command_text = get_windows_process_command(pid);
        if !should_kill_stale_server_process(&command_text, expected_server_path) {
            log_event(
                app,
                "WARN",
                "tauri",
                format!(
                    "port {} occupied by non-IMS process pid={} command={}",
                    port, pid, command_text
                ),
            );
            continue;
        }

        let kill_ok = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/F"])
            .status()
            .map(|status| status.success())
            .unwrap_or(false);

        if kill_ok {
            released = true;
            log_event(
                app,
                "WARN",
                "tauri",
                format!(
                    "killed stale IMS server process pid={} on port {}",
                    pid, port
                ),
            );
        }
    }

    released
}

#[cfg(all(not(unix), not(windows)))]
fn release_stale_server_on_port<R: Runtime>(
    _app: &AppHandle<R>,
    _expected_server_path: &Path,
    _port: u16,
) -> bool {
    false
}

fn find_server_executable(resource_dir: &Path) -> Option<PathBuf> {
    let server_name = if cfg!(target_os = "windows") {
        "server.exe"
    } else {
        "server"
    };

    let direct_candidates = [
        resource_dir.join("dist").join(server_name),
        resource_dir
            .join("_up_")
            .join("_up_")
            .join("packages")
            .join("server")
            .join("dist")
            .join(server_name),
        resource_dir.join(server_name),
    ];

    for candidate in direct_candidates {
        if candidate.is_file() {
            return Some(candidate);
        }
    }

    fn visit(dir: &Path, server_name: &str, depth: usize) -> Option<PathBuf> {
        if depth > 6 {
            return None;
        }

        let entries = fs::read_dir(dir).ok()?;
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file()
                && path
                    .file_name()
                    .and_then(|value| value.to_str())
                    .is_some_and(|value| value == server_name)
            {
                return Some(path);
            }

            if path.is_dir() {
                if let Some(found) = visit(&path, server_name, depth + 1) {
                    return Some(found);
                }
            }
        }

        None
    }

    visit(resource_dir, server_name, 0)
}

fn find_bundled_interview_opencode_dir(resource_dir: &Path) -> Option<PathBuf> {
    let direct_candidates = [
        resource_dir.join("resources").join("interview-opencode"),
        resource_dir
            .join("_up_")
            .join("_up_")
            .join("packages")
            .join("server")
            .join("resources")
            .join("interview-opencode"),
    ];

    for candidate in direct_candidates {
        if candidate.is_dir() {
            return Some(candidate);
        }
    }

    fn visit(dir: &Path, depth: usize) -> Option<PathBuf> {
        if depth > 6 {
            return None;
        }

        let entries = fs::read_dir(dir).ok()?;
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir()
                && path
                    .file_name()
                    .and_then(|value| value.to_str())
                    .is_some_and(|value| value == "interview-opencode")
            {
                return Some(path);
            }

            if path.is_dir() {
                if let Some(found) = visit(&path, depth + 1) {
                    return Some(found);
                }
            }
        }

        None
    }

    visit(resource_dir, 0)
}

fn probe_existing_ims_server(port: u16) -> Result<Option<String>, String> {
    let address = (DESKTOP_SERVER_HOST, port)
        .to_socket_addrs()
        .map_err(|err| err.to_string())?
        .next()
        .ok_or_else(|| "failed to resolve desktop server address".to_string())?;

    let mut stream = match TcpStream::connect_timeout(&address, std::time::Duration::from_secs(2)) {
        Ok(stream) => stream,
        Err(_) => return Ok(None),
    };

    let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(1)));
    let _ = stream.set_write_timeout(Some(std::time::Duration::from_secs(1)));

    if stream
        .write_all(b"GET /api/health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
        .is_err()
    {
        return Ok(None);
    }

    let mut response = String::new();
    if stream.read_to_string(&mut response).is_err() {
        return Ok(None);
    }

    if response.contains("\"service\":\"interview-manager\"")
        && response.contains("\"status\":\"ok\"")
    {
        return Ok(Some("existing ims server is healthy".to_string()));
    }

    Err(format!(
        "port {} is already occupied by a non-IMS service or unhealthy process",
        port
    ))
}

fn wait_for_server_ready<R: Runtime>(
    app: &AppHandle<R>,
    port: u16,
    timeout: Duration,
) -> Result<(), String> {
    let started = std::time::Instant::now();
    let mut last_error = "server is not ready yet".to_string();

    while started.elapsed() < timeout {
        match probe_existing_ims_server(port) {
            Ok(Some(reason)) => {
                log_event(
                    app,
                    "INFO",
                    "tauri",
                    format!(
                        "server ready on {}:{} ({})",
                        DESKTOP_SERVER_HOST, port, reason
                    ),
                );
                return Ok(());
            }
            Ok(None) => {
                last_error = "server port is not listening yet".to_string();
            }
            Err(error) => {
                last_error = error;
            }
        }

        std::thread::sleep(Duration::from_millis(SERVER_READY_POLL_MS));
    }

    Err(format!(
        "server did not become ready within {}ms: {}",
        timeout.as_millis(),
        last_error
    ))
}

fn reveal_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn desktop_server_base_url(port: u16) -> String {
    format!("http://{}:{}", DESKTOP_SERVER_HOST, port)
}

fn configure_frontend_server_base_url<R: Runtime>(app: &AppHandle<R>, port: u16) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    let base_url = desktop_server_base_url(port);
    let Ok(base_url_json) = serde_json::to_string(&base_url) else {
        log_event(
            app,
            "ERROR",
            "tauri",
            "failed to serialize desktop server base url",
        );
        return;
    };

    let script = format!(
        "const imsServerBaseUrlKey = 'ims:serverBaseUrl'; const previousImsServerBaseUrl = window.localStorage.getItem(imsServerBaseUrlKey); window.__IMS_SERVER_BASE_URL = {base_url}; window.localStorage.setItem(imsServerBaseUrlKey, {base_url}); if ({port} !== {default_port} || (previousImsServerBaseUrl && previousImsServerBaseUrl !== {base_url})) {{ window.location.reload(); }}",
        base_url = base_url_json,
        port = port,
        default_port = DEFAULT_DESKTOP_SERVER_PORT,
    );

    if let Err(error) = window.eval(&script) {
        log_event(
            app,
            "ERROR",
            "tauri",
            format!("failed to configure frontend server base url: {}", error),
        );
    }
}

fn resolve_server_port<R: Runtime>(
    app: &AppHandle<R>,
    server_path: &Path,
) -> Result<(u16, bool), String> {
    let requested_port = std::env::var("IMS_PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(DEFAULT_DESKTOP_SERVER_PORT);

    let mut candidate_ports = vec![requested_port];
    if requested_port == DEFAULT_DESKTOP_SERVER_PORT {
        candidate_ports.extend((DEFAULT_DESKTOP_SERVER_PORT + 1)..=MAX_DESKTOP_SERVER_PORT);
    }

    for port in candidate_ports {
        match probe_existing_ims_server(port) {
            Ok(Some(reason)) => {
                log_event(
                    app,
                    "WARN",
                    "tauri",
                    format!(
                        "reusing existing IMS server on {}:{} ({})",
                        DESKTOP_SERVER_HOST, port, reason
                    ),
                );
                return Ok((port, true));
            }
            Ok(None) => return Ok((port, false)),
            Err(probe_error) => {
                log_event(
                    app,
                    "WARN",
                    "tauri",
                    format!(
                        "probe detected occupied or unhealthy port {}: {}",
                        port, probe_error
                    ),
                );

                if release_stale_server_on_port(app, server_path, port) {
                    std::thread::sleep(Duration::from_millis(SERVER_PORT_RELEASE_WAIT_MS));
                    match probe_existing_ims_server(port) {
                        Ok(Some(reason)) => {
                            log_event(
                                app,
                                "WARN",
                                "tauri",
                                format!(
                                    "reusing existing IMS server on {}:{} ({})",
                                    DESKTOP_SERVER_HOST, port, reason
                                ),
                            );
                            return Ok((port, true));
                        }
                        Ok(None) => return Ok((port, false)),
                        Err(error) => {
                            log_event(
                                app,
                                "WARN",
                                "tauri",
                                format!("port {} still unavailable after cleanup: {}", port, error),
                            );
                        }
                    }
                }
            }
        }
    }

    Err(format!(
        "no available desktop server port in {}..={}",
        requested_port,
        if requested_port == DEFAULT_DESKTOP_SERVER_PORT {
            MAX_DESKTOP_SERVER_PORT
        } else {
            requested_port
        }
    ))
}

fn start_server<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<StartedServer, Box<dyn std::error::Error>> {
    use tauri_plugin_shell::ShellExt;

    let resource_dir = app.path().resource_dir()?;
    let server_path = find_server_executable(&resource_dir).ok_or_else(|| {
        format!(
            "server executable not found under {}",
            resource_dir.display()
        )
    })?;
    let (port, reuse_existing_server) = resolve_server_port(app, &server_path)?;
    if reuse_existing_server {
        return Ok(StartedServer { child: None, port });
    }

    let app_data_dir = app.path().app_data_dir()?;
    let runtime_dir = app_data_dir.join("runtime");
    let data_dir = runtime_dir.join("data");
    let files_dir = runtime_dir.join("files");
    let agent_workspaces_dir = runtime_dir.join("agent-workspaces");
    let db_path = runtime_dir.join("interview.db");
    fs::create_dir_all(&agent_workspaces_dir)?;
    let node_modules_path = resource_dir.join("node_modules");
    let bundled_interview_opencode_dir = find_bundled_interview_opencode_dir(&resource_dir);
    log_event(
        app,
        "INFO",
        "tauri",
        format!("starting server at: {:?} on port {}", server_path, port),
    );
    log_event(
        app,
        "INFO",
        "tauri",
        format!("server runtime dir: {:?}", runtime_dir),
    );

    let mut cmd = app
        .shell()
        .command(&server_path)
        .env("NODE_PATH", node_modules_path.to_str().unwrap_or(""))
        .env("IMS_ROOT_DIR", app_data_dir.to_str().unwrap_or(""))
        .env("IMS_RUNTIME_DIR", runtime_dir.to_str().unwrap_or(""))
        .env("IMS_DATA_DIR", data_dir.to_str().unwrap_or(""))
        .env("IMS_FILES_DIR", files_dir.to_str().unwrap_or(""))
        .env(
            "IMS_AGENT_WORKSPACES_DIR",
            agent_workspaces_dir.to_str().unwrap_or(""),
        )
        .env("IMS_DB_PATH", db_path.to_str().unwrap_or(""))
        .env("IMS_PORT", port.to_string());

    if let Some(opencode_dir) = bundled_interview_opencode_dir {
        cmd = cmd.env(
            "IMS_BUNDLED_INTERVIEW_OPENCODE_DIR",
            opencode_dir.to_str().unwrap_or(""),
        );
    }
    let (mut rx, child) = cmd.spawn()?;

    // Forward server logs to stdout
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                    log_event(
                        &app_handle,
                        "INFO",
                        "server",
                        String::from_utf8_lossy(&line),
                    );
                }
                tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                    log_event(
                        &app_handle,
                        "ERROR",
                        "server",
                        String::from_utf8_lossy(&line),
                    );
                }
                tauri_plugin_shell::process::CommandEvent::Error(err) => {
                    log_event(&app_handle, "ERROR", "server", format!("error: {}", err));
                }
                tauri_plugin_shell::process::CommandEvent::Terminated(status) => {
                    log_event(
                        &app_handle,
                        "WARN",
                        "server",
                        format!("terminated with status: {:?}", status),
                    );
                    // Notify frontend that server has stopped
                    let _ = app_handle.emit("server-stopped", ());
                }
                _ => {}
            }
        }
    });

    log_event(
        app,
        "INFO",
        "tauri",
        format!("server started successfully on port {}", port),
    );
    Ok(StartedServer {
        child: Some(child),
        port,
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// Tray
// ─────────────────────────────────────────────────────────────────────────────

fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let version_label = format!("版本 {}", get_app_version());
    let version_item = MenuItem::with_id(app, "version", version_label, false, None::<&str>)?;
    let open_logs_item = MenuItem::with_id(app, "open_logs", "打开日志目录", true, None::<&str>)?;
    let export_logs_item = MenuItem::with_id(app, "export_logs", "导出日志", true, None::<&str>)?;
    let show_item = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
    let hide_item = MenuItem::with_id(app, "hide", "隐藏窗口", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[
            &version_item,
            &open_logs_item,
            &export_logs_item,
            &show_item,
            &hide_item,
            &quit_item,
        ],
    )?;

    let mut tray_builder = TrayIconBuilder::with_id("main-tray")
        .tooltip("IMS")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "open_logs" => {
                if let Err(err) = open_logs_dir(app.clone()) {
                    log_event(app, "ERROR", "logs", err);
                }
            }
            "export_logs" => match export_logs_bundle(app.clone()) {
                Ok(path) => log_event(app, "INFO", "logs", format!("logs exported to {}", path)),
                Err(err) => log_event(app, "ERROR", "logs", err),
            },
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
                // Kill the managed server before exiting
                stop_managed_server(app);
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
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        tray_builder = tray_builder.icon(icon);
    }

    let _tray = tray_builder.build(app)?;

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

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AppUpdateStatus {
    available: bool,
    version: Option<String>,
    date: Option<String>,
    notes: Option<String>,
    checked_at: u64,
    installed: bool,
}

fn now_unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[tauri::command]
async fn check_for_app_update(app: AppHandle) -> Result<AppUpdateStatus, String> {
    let updater = match app.updater() {
        Ok(updater) => updater,
        Err(err) => {
            let msg = format!("updater init failed: {}", err);
            eprintln!("[tauri-updater] {}", msg);
            return Err(msg);
        }
    };

    let update = match updater.check().await {
        Ok(update) => update,
        Err(err) => {
            let msg = format!("check failed: {}", err);
            eprintln!("[tauri-updater] {}", msg);
            return Err(msg);
        }
    };

    if let Some(update) = update {
        let status = AppUpdateStatus {
            available: true,
            version: Some(update.version),
            date: update.date.map(|v| v.to_string()),
            notes: update.body,
            checked_at: now_unix_ms(),
            installed: false,
        };
        return Ok(status);
    }

    Ok(AppUpdateStatus {
        available: false,
        version: None,
        date: None,
        notes: None,
        checked_at: now_unix_ms(),
        installed: false,
    })
}

#[tauri::command]
async fn install_app_update(app: AppHandle) -> Result<AppUpdateStatus, String> {
    let updater = match app.updater() {
        Ok(updater) => updater,
        Err(err) => {
            let msg = format!("updater init failed: {}", err);
            eprintln!("[tauri-updater] {}", msg);
            return Err(msg);
        }
    };

    let update = match updater.check().await {
        Ok(update) => update,
        Err(err) => {
            let msg = format!("check failed before install: {}", err);
            eprintln!("[tauri-updater] {}", msg);
            return Err(msg);
        }
    };

    let Some(update) = update else {
        return Ok(AppUpdateStatus {
            available: false,
            version: None,
            date: None,
            notes: None,
            checked_at: now_unix_ms(),
            installed: false,
        });
    };

    let version = Some(update.version.clone());
    let date = update.date.map(|v| v.to_string());
    let notes = update.body.clone();

    let mut downloaded: usize = 0;
    update
        .download_and_install(
            |chunk_length, content_length| {
                downloaded += chunk_length;
                println!(
                    "[tauri-updater] downloading: {}/{}",
                    downloaded,
                    content_length
                        .map(|v| v.to_string())
                        .unwrap_or_else(|| "?".to_string())
                );
            },
            || {
                println!("[tauri-updater] download finished");
            },
        )
        .await
        .map_err(|err| {
            let msg = format!("install failed: {}", err);
            eprintln!("[tauri-updater] {}", msg);
            msg
        })?;

    Ok(AppUpdateStatus {
        available: true,
        version,
        date,
        notes,
        checked_at: now_unix_ms(),
        installed: true,
    })
}

#[tauri::command]
fn restart_desktop_app(app: AppHandle) {
    app.restart();
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

fn resolve_log_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join("logs"))
        .map_err(|err| err.to_string())
}

fn export_logs_bundle(app: AppHandle) -> Result<String, String> {
    let export_path = {
        let logger_state = app.state::<Mutex<AppLogger>>();
        let mut logger = logger_state
            .lock()
            .map_err(|_| "failed to lock logger".to_string())?;
        logger.export_bundle().map_err(|err| err.to_string())?
    };

    reveal_in_file_manager(&export_path)?;
    Ok(export_path.display().to_string())
}

fn open_logs_dir(app: AppHandle) -> Result<(), String> {
    let log_dir = {
        let logger_state = app.state::<Mutex<AppLogger>>();
        let logger = logger_state
            .lock()
            .map_err(|_| "failed to lock logger".to_string())?;
        logger.dir_path()
    };
    open_in_file_manager(&log_dir)
}

#[tauri::command]
fn get_desktop_app_info(app: AppHandle) -> Result<DesktopAppInfo, String> {
    Ok(DesktopAppInfo {
        version: get_app_version().to_string(),
        log_dir: resolve_log_dir(&app)?.display().to_string(),
    })
}

#[tauri::command]
fn export_current_logs(app: AppHandle) -> Result<String, String> {
    export_logs_bundle(app)
}

// ─────────────────────────────────────────────────────────────────────────────
// App entry
// ─────────────────────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
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
            let log_dir = app.path().app_data_dir()?.join("logs");
            let logger = AppLogger::new(log_dir)?;
            app.manage(Mutex::new(logger));
            log_event(
                app.handle(),
                "INFO",
                "tauri",
                format!("IMS v{} starting", env!("CARGO_PKG_VERSION")),
            );

            let mut server_port = DEFAULT_DESKTOP_SERVER_PORT;

            // Start the backend server
            match start_server(app.handle()) {
                Ok(started_server) => {
                    server_port = started_server.port;
                    app.manage(Mutex::new(ServerProcess {
                        child: started_server.child,
                        port: started_server.port,
                    }));
                }
                Err(e) => {
                    app.manage(Mutex::new(ServerProcess {
                        child: None,
                        port: server_port,
                    }));
                    log_event(
                        app.handle(),
                        "ERROR",
                        "tauri",
                        format!("failed to start server: {}", e),
                    );
                }
            }

            match wait_for_server_ready(
                app.handle(),
                server_port,
                Duration::from_millis(SERVER_READY_TIMEOUT_MS),
            ) {
                Ok(()) => log_event(
                    app.handle(),
                    "INFO",
                    "tauri",
                    "server health check passed before showing window",
                ),
                Err(error) => log_event(app.handle(), "ERROR", "tauri", error),
            }

            configure_frontend_server_base_url(app.handle(), server_port);
            reveal_main_window(app.handle());

            // Setup system tray
            if let Err(e) = setup_tray(app.handle()) {
                log_event(
                    app.handle(),
                    "ERROR",
                    "tauri",
                    format!("tray setup failed: {}", e),
                );
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

            log_event(
                app.handle(),
                "INFO",
                "tauri",
                format!("IMS v{} started", env!("CARGO_PKG_VERSION")),
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
                    // Actually quitting - kill the managed server
                    let app_handle = window.app_handle();
                    stop_managed_server(&app_handle);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            is_quitting,
            show_main_window,
            hide_main_window,
            get_app_version,
            get_desktop_app_info,
            export_current_logs,
            check_for_app_update,
            install_app_update,
            restart_desktop_app,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if matches!(
            event,
            tauri::RunEvent::Exit | tauri::RunEvent::ExitRequested { .. }
        ) {
            stop_managed_server(app_handle);
        }
    });
}
