use std::fs::{self, File};
use std::io::{BufWriter, Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender, SyncSender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use tauri::{AppHandle, Emitter, Manager, State};

#[cfg(feature = "local-transcription")]
use reqwest::blocking::Client;

#[cfg(feature = "local-transcription")]
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

const LEVEL_EVENT_NAME: &str = "recorder://level-update";
#[cfg(feature = "local-transcription")]
const LIVE_TRANSCRIPT_SEGMENT_EVENT_NAME: &str = "recorder://live-transcript-segment-update";
const STATE_EVENT_NAME: &str = "recorder://state-update";
const LEVEL_EMIT_INTERVAL_MS: u64 = 75;
#[cfg(feature = "local-transcription")]
const LIVE_TRANSCRIPT_SEGMENT_INTERVAL_MS: u64 = 3_000;
const MAX_RECORDER_STORAGE_BYTES: u64 = 5 * 1024 * 1024 * 1024;
const MAX_RECORDING_DURATION_MS: u64 = 2 * 60 * 60 * 1000;
const MUTED_THRESHOLD: f32 = 0.0005;
const WORKER_POLL_MS: u64 = 250;
#[cfg(feature = "local-transcription")]
const WHISPER_MODEL_FILE_NAME: &str = "ggml-base.bin";
#[cfg(feature = "local-transcription")]
const WHISPER_MODEL_DOWNLOAD_URL: &str =
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin";
#[cfg(feature = "local-transcription")]
const WHISPER_TARGET_SAMPLE_RATE: u32 = 16_000;

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecorderStateSnapshot {
    status: RecorderStatus,
    active_recording_id: Option<String>,
    duration_ms: u64,
    live_transcript_text: String,
    final_transcript_text: String,
    organised_text: Option<String>,
    live_transcript_segments: Vec<RecorderTranscriptSegment>,
    level: f32,
    peak_level: f32,
    muted: bool,
    error_code: Option<String>,
    error_message: Option<String>,
    updated_at: Option<u64>,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
enum RecorderStatus {
    Idle,
    Recording,
    Stopping,
    Transcribing,
    #[cfg(feature = "local-transcription")]
    Finalizing,
    Completed,
    Error,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct RecorderTranscriptSegment {
    id: String,
    sequence: u64,
    start_ms: u64,
    end_ms: u64,
    text: String,
    is_final: bool,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct RecorderLevelUpdateEventPayload {
    recording_id: Option<String>,
    level: f32,
    peak_level: f32,
    muted: bool,
    timestamp: u64,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecorderDiagnosticsData {
    checked_at: u64,
    desktop_runtime: bool,
    active_recording: bool,
    device_available: bool,
    device_name: Option<String>,
    config_available: bool,
    sample_rate: Option<u32>,
    channels: Option<u16>,
    permission_granted: Option<bool>,
    input_signal_detected: Option<bool>,
    peak_level: Option<f32>,
    muted: Option<bool>,
    error_code: Option<String>,
    error_message: Option<String>,
    notes: Vec<String>,
}

#[cfg(feature = "local-transcription")]
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct RecorderLiveTranscriptSegmentUpdateEventPayload {
    recording_id: String,
    segment: RecorderTranscriptSegment,
    live_transcript_text: String,
    updated_at: u64,
}

#[derive(Clone)]
struct RecorderErrorState {
    code: String,
    message: String,
}

struct LevelAccumulator {
    sample_count: u64,
    sum_squares: f64,
    peak: f32,
    last_emit_at: Instant,
}

#[cfg(feature = "local-transcription")]
struct LiveTranscriptBuffer {
    pending_samples: Vec<f32>,
    sample_rate: u32,
    next_sequence: u64,
    next_start_ms: u64,
    in_flight: bool,
}

#[cfg(feature = "local-transcription")]
impl LiveTranscriptBuffer {
    fn new(sample_rate: u32) -> Self {
        Self {
            pending_samples: Vec::new(),
            sample_rate,
            next_sequence: 0,
            next_start_ms: 0,
            in_flight: false,
        }
    }
}

#[cfg(feature = "local-transcription")]
struct LiveTranscriptJob {
    samples: Vec<f32>,
    sample_rate: u32,
    sequence: u64,
    start_ms: u64,
    end_ms: u64,
}

#[cfg(feature = "local-transcription")]
struct FinalTranscriptionRequest {
    recording_id: String,
    file_path: PathBuf,
    duration_ms: u64,
    file_size_bytes: u64,
    created_at: u64,
}

#[cfg(feature = "local-transcription")]
struct FinalTranscriptionResult {
    detected_language: Option<String>,
    final_text: String,
    segments: Vec<RecorderTranscriptSegment>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct PersistedRecordingPayload {
    id: String,
    status: String,
    file_path: String,
    duration_ms: u64,
    file_size_bytes: u64,
    language: Option<String>,
    live_transcript_text: Option<String>,
    final_transcript_text: Option<String>,
    transcript_json: Option<String>,
    organised_text: Option<String>,
    created_at: u64,
    updated_at: u64,
}

impl LevelAccumulator {
    fn new() -> Self {
        Self {
            sample_count: 0,
            sum_squares: 0.0,
            peak: 0.0,
            last_emit_at: Instant::now(),
        }
    }

    fn push(&mut self, sample: f32) {
        let clamped = sample.clamp(-1.0, 1.0);
        let amplitude = clamped.abs();
        self.sample_count += 1;
        self.sum_squares += (clamped as f64) * (clamped as f64);
        if amplitude > self.peak {
            self.peak = amplitude;
        }
    }

    fn should_emit(&self) -> bool {
        self.last_emit_at.elapsed() >= Duration::from_millis(LEVEL_EMIT_INTERVAL_MS)
    }

    fn reset_and_measure(&mut self) -> (f32, f32, bool) {
        let rms = if self.sample_count == 0 {
            0.0
        } else {
            (self.sum_squares / self.sample_count as f64).sqrt() as f32
        }
        .clamp(0.0, 1.0);
        let peak = self.peak.clamp(0.0, 1.0);
        let muted = peak <= MUTED_THRESHOLD;
        self.sample_count = 0;
        self.sum_squares = 0.0;
        self.peak = 0.0;
        self.last_emit_at = Instant::now();
        (rms, peak, muted)
    }
}

enum RecorderWriter {
    Int16(hound::WavWriter<BufWriter<File>>),
    Float32(hound::WavWriter<BufWriter<File>>),
}

impl RecorderWriter {
    fn write_i16(&mut self, sample: i16) -> Result<(), hound::Error> {
        match self {
            Self::Int16(writer) => writer.write_sample(sample),
            Self::Float32(writer) => writer.write_sample(sample as f32 / i16::MAX as f32),
        }
    }

    fn write_f32(&mut self, sample: f32) -> Result<(), hound::Error> {
        let clamped = sample.clamp(-1.0, 1.0);
        match self {
            Self::Float32(writer) => writer.write_sample(clamped),
            Self::Int16(writer) => writer.write_sample((clamped * i16::MAX as f32).round() as i16),
        }
    }

    fn finalize(self) -> Result<(), hound::Error> {
        match self {
            Self::Int16(writer) => writer.finalize(),
            Self::Float32(writer) => writer.finalize(),
        }
    }
}

struct ActiveRecording {
    app: AppHandle,
    recording_id: String,
    file_path: PathBuf,
    started_at: Instant,
    stream: cpal::Stream,
    writer: Arc<Mutex<Option<RecorderWriter>>>,
    stop_signal: Arc<AtomicBool>,
    #[cfg(feature = "local-transcription")]
    live_transcript: Arc<Mutex<LiveTranscriptBuffer>>,
    #[cfg(feature = "local-transcription")]
    model_path: PathBuf,
}

enum WorkerCommand {
    Start {
        app: AppHandle,
        reply: SyncSender<Result<String, String>>,
    },
    Stop {
        app: AppHandle,
        reply: Option<SyncSender<Result<(), String>>>,
        error: Option<RecorderErrorState>,
    },
    RuntimeError {
        app: AppHandle,
        error: RecorderErrorState,
    },
}

pub struct RecorderManager {
    sender: Mutex<Sender<WorkerCommand>>,
    snapshot: Arc<Mutex<RecorderStateSnapshot>>,
}

impl RecorderManager {
    pub fn new(recordings_dir: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(&recordings_dir).map_err(|err| err.to_string())?;
        #[cfg(feature = "local-transcription")]
        let model_path = recordings_dir
            .parent()
            .unwrap_or(recordings_dir.as_path())
            .join("models")
            .join("whisper")
            .join(WHISPER_MODEL_FILE_NAME);

        let snapshot = Arc::new(Mutex::new(RecorderStateSnapshot::idle()));
        let (sender, receiver) = mpsc::channel::<WorkerCommand>();
        let worker_sender = sender.clone();
        let worker_snapshot = Arc::clone(&snapshot);

        thread::Builder::new()
            .name("ims-recorder-worker".to_string())
            .spawn(move || {
                recorder_worker_loop(
                    receiver,
                    worker_sender,
                    worker_snapshot,
                    recordings_dir,
                    #[cfg(feature = "local-transcription")]
                    model_path,
                )
            })
            .map_err(|err| err.to_string())?;

        Ok(Self {
            sender: Mutex::new(sender),
            snapshot,
        })
    }

    pub fn start(&self, app: &AppHandle) -> Result<String, String> {
        let (reply_tx, reply_rx) = mpsc::sync_channel(1);
        self.sender_clone()?
            .send(WorkerCommand::Start {
                app: app.clone(),
                reply: reply_tx,
            })
            .map_err(|err| err.to_string())?;
        reply_rx.recv().map_err(|err| err.to_string())?
    }

    pub fn request_stop(&self, app: &AppHandle) -> Result<(), String> {
        self.sender_clone()?
            .send(WorkerCommand::Stop {
                app: app.clone(),
                reply: None,
                error: None,
            })
            .map_err(|err| err.to_string())
    }

    pub fn stop_blocking(&self, app: &AppHandle) -> Result<(), String> {
        let (reply_tx, reply_rx) = mpsc::sync_channel(1);
        self.sender_clone()?
            .send(WorkerCommand::Stop {
                app: app.clone(),
                reply: Some(reply_tx),
                error: None,
            })
            .map_err(|err| err.to_string())?;
        reply_rx.recv().map_err(|err| err.to_string())?
    }

    pub fn cleanup(&self, app: &AppHandle) -> Result<(), String> {
        self.stop_blocking(app)
    }

    pub fn get_status(&self) -> Result<RecorderStateSnapshot, String> {
        self.snapshot
            .lock()
            .map(|snapshot| snapshot.clone())
            .map_err(|_| "failed to lock recorder snapshot".to_string())
    }

    fn sender_clone(&self) -> Result<Sender<WorkerCommand>, String> {
        self.sender
            .lock()
            .map(|sender| sender.clone())
            .map_err(|_| "failed to lock recorder channel".to_string())
    }
}

fn recorder_worker_loop(
    receiver: Receiver<WorkerCommand>,
    sender: Sender<WorkerCommand>,
    snapshot: Arc<Mutex<RecorderStateSnapshot>>,
    recordings_dir: PathBuf,
    #[cfg(feature = "local-transcription")] model_path: PathBuf,
) {
    let mut active: Option<ActiveRecording> = None;

    loop {
        let poll_duration = timeout_for_active_recording(active.as_ref());
        match receiver.recv_timeout(poll_duration) {
            Ok(command) => match command {
                WorkerCommand::Start { app, reply } => {
                    let result = handle_start_command(
                        &app,
                        &snapshot,
                        &recordings_dir,
                        #[cfg(feature = "local-transcription")]
                        &model_path,
                        &sender,
                        &mut active,
                    );
                    let _ = reply.send(result);
                }
                WorkerCommand::Stop { app, reply, error } => {
                    let result = stop_active_recording(&app, &snapshot, &mut active, error);
                    if let Some(reply) = reply {
                        let _ = reply.send(result);
                    }
                }
                WorkerCommand::RuntimeError { app, error } => {
                    let _ = stop_active_recording(&app, &snapshot, &mut active, Some(error));
                }
            },
            Err(RecvTimeoutError::Timeout) => {
                #[cfg(feature = "local-transcription")]
                if let Some(recording) = active.as_ref() {
                    maybe_schedule_live_transcript(recording, &snapshot);
                }

                if let Some(app) = active.as_ref().and_then(|recording| {
                    (recording.started_at.elapsed().as_millis() as u64 >= MAX_RECORDING_DURATION_MS)
                        .then(|| recording.app.clone())
                }) {
                    let error = RecorderErrorState {
                        code: "RECORDING_TIMEOUT".to_string(),
                        message: "录音已达到时长上限，已自动停止".to_string(),
                    };
                    let _ = stop_active_recording(&app, &snapshot, &mut active, Some(error));
                }
            }
            Err(RecvTimeoutError::Disconnected) => break,
        }
    }
}

fn handle_start_command(
    app: &AppHandle,
    snapshot: &Arc<Mutex<RecorderStateSnapshot>>,
    recordings_dir: &Path,
    #[cfg(feature = "local-transcription")] model_path: &Path,
    sender: &Sender<WorkerCommand>,
    active: &mut Option<ActiveRecording>,
) -> Result<String, String> {
    if active.is_some() {
        let message = "录音已在进行中".to_string();
        set_error_state(snapshot, app, "VALIDATION_ERROR", &message)?;
        return Err(message);
    }

    ensure_storage_limit(recordings_dir, snapshot, app)?;

    let host = cpal::default_host();
    let device = host.default_input_device().ok_or_else(|| {
        let message = "未找到可用录音设备".to_string();
        let _ = set_error_state(snapshot, app, "RECORDING_DEVICE_UNAVAILABLE", &message);
        message
    })?;

    let supported_config = device.default_input_config().map_err(|error| {
        let mapped = map_config_error(&error);
        let _ = set_error_state(snapshot, app, &mapped.code, &mapped.message);
        mapped.message
    })?;

    let recording_id = build_recording_id();
    let file_path = recordings_dir.join(format!("{}.wav", recording_id));
    let writer = Arc::new(Mutex::new(Some(create_writer(
        &file_path,
        &supported_config,
    )?)));
    let stop_signal = Arc::new(AtomicBool::new(false));
    let started_at = Instant::now();
    #[cfg(feature = "local-transcription")]
    let live_transcript = Arc::new(Mutex::new(LiveTranscriptBuffer::new(
        supported_config.sample_rate().0,
    )));

    let stream = build_stream(
        &device,
        &supported_config,
        Arc::clone(&writer),
        Arc::clone(snapshot),
        Arc::clone(&stop_signal),
        #[cfg(feature = "local-transcription")]
        Arc::clone(&live_transcript),
        app.clone(),
        recording_id.clone(),
        started_at,
        sender.clone(),
    )
    .map_err(|error| {
        let mapped = map_build_stream_error(&error);
        let _ = set_error_state(snapshot, app, &mapped.code, &mapped.message);
        mapped.message
    })?;

    stream.play().map_err(|error| {
        let mapped = map_play_stream_error(&error);
        let _ = set_error_state(snapshot, app, &mapped.code, &mapped.message);
        mapped.message
    })?;

    *active = Some(ActiveRecording {
        app: app.clone(),
        recording_id: recording_id.clone(),
        file_path,
        started_at,
        stream,
        writer,
        stop_signal,
        #[cfg(feature = "local-transcription")]
        live_transcript,
        #[cfg(feature = "local-transcription")]
        model_path: model_path.to_path_buf(),
    });

    update_snapshot(snapshot, |state| {
        state.status = RecorderStatus::Recording;
        state.active_recording_id = Some(recording_id.clone());
        state.duration_ms = 0;
        state.live_transcript_text.clear();
        state.final_transcript_text.clear();
        state.organised_text = None;
        state.live_transcript_segments.clear();
        state.level = 0.0;
        state.peak_level = 0.0;
        state.muted = true;
        state.error_code = None;
        state.error_message = None;
        state.updated_at = Some(now_unix_ms());
    })?;
    emit_state_update(app, snapshot)?;

    Ok(recording_id)
}

fn stop_active_recording(
    app: &AppHandle,
    snapshot: &Arc<Mutex<RecorderStateSnapshot>>,
    active: &mut Option<ActiveRecording>,
    error: Option<RecorderErrorState>,
) -> Result<(), String> {
    let Some(active_recording) = active.take() else {
        if let Some(error) = error {
            set_error_state(snapshot, app, &error.code, &error.message)?;
            return Err(error.message);
        }
        return Ok(());
    };

    active_recording.stop_signal.store(true, Ordering::SeqCst);

    update_snapshot(snapshot, |state| {
        state.status = RecorderStatus::Stopping;
        state.active_recording_id = Some(active_recording.recording_id.clone());
        state.updated_at = Some(now_unix_ms());
    })?;
    emit_state_update(app, snapshot)?;

    drop(active_recording.stream);

    let finalize_result = {
        let mut writer = active_recording
            .writer
            .lock()
            .map_err(|_| "failed to lock recording writer".to_string())?;
        writer
            .take()
            .ok_or_else(|| "recording writer already closed".to_string())?
            .finalize()
            .map_err(|err| err.to_string())
    };

    let duration_ms = active_recording.started_at.elapsed().as_millis() as u64;
    let file_size_bytes = fs::metadata(&active_recording.file_path)
        .map(|metadata| metadata.len())
        .unwrap_or(0);

    let error = match (error, finalize_result) {
        (Some(existing), _) => Some(existing),
        (None, Ok(())) => None,
        (None, Err(message)) => Some(RecorderErrorState {
            code: "INTERNAL_ERROR".to_string(),
            message: format!("录音文件保存失败：{}", message),
        }),
    };

    update_snapshot(snapshot, |state| {
        state.status = if error.is_some() {
            RecorderStatus::Error
        } else {
            RecorderStatus::Transcribing
        };
        state.active_recording_id = None;
        state.duration_ms = duration_ms;
        state.level = 0.0;
        state.peak_level = 0.0;
        state.muted = true;
        state.updated_at = Some(now_unix_ms());
        match &error {
            Some(error) => {
                state.error_code = Some(error.code.clone());
                state.error_message = Some(error.message.clone());
            }
            None => {
                state.error_code = None;
                state.error_message = None;
            }
        }
    })?;
    emit_state_update(app, snapshot)?;
    emit_level_update(
        app,
        RecorderLevelUpdateEventPayload {
            recording_id: None,
            level: 0.0,
            peak_level: 0.0,
            muted: true,
            timestamp: now_unix_ms(),
        },
    );

    if file_size_bytes == 0 && error.is_none() {
        let message = "录音已停止，但文件为空".to_string();
        set_error_state(snapshot, app, "INTERNAL_ERROR", &message)?;
        return Err(message);
    }

    if let Some(error) = error {
        return Err(error.message);
    }

    #[cfg(feature = "local-transcription")]
    spawn_final_transcription(
        app.clone(),
        Arc::clone(snapshot),
        active_recording.model_path,
        FinalTranscriptionRequest {
            recording_id: active_recording.recording_id,
            file_path: active_recording.file_path,
            duration_ms,
            file_size_bytes,
            created_at: now_unix_ms().saturating_sub(duration_ms),
        },
    );

    #[cfg(not(feature = "local-transcription"))]
    {
        let payload = build_recording_persist_payload(
            &active_recording.recording_id,
            &active_recording.file_path,
            duration_ms,
            file_size_bytes,
            now_unix_ms().saturating_sub(duration_ms),
            None,
            None,
            None,
        )?;
        if let Err(persist_error) = persist_recording_to_server(app, &payload) {
            crate::log_event(
                app,
                "WARN",
                "recorder",
                format!("failed to persist recording {}: {}", payload.id, persist_error),
            );
        }

        update_snapshot(snapshot, |state| {
            state.status = RecorderStatus::Completed;
            state.updated_at = Some(now_unix_ms());
        })?;
        emit_state_update(app, snapshot)?;
    }

    Ok(())
}

fn ensure_storage_limit(
    recordings_dir: &Path,
    snapshot: &Arc<Mutex<RecorderStateSnapshot>>,
    app: &AppHandle,
) -> Result<(), String> {
    let total_bytes = directory_size(recordings_dir)?;
    if total_bytes > MAX_RECORDER_STORAGE_BYTES {
        let message = format!(
            "录音存储已超限（{:.2} GB / {:.2} GB），请先清理旧录音",
            bytes_to_gb(total_bytes),
            bytes_to_gb(MAX_RECORDER_STORAGE_BYTES)
        );
        set_error_state(snapshot, app, "RECORDING_STORAGE_LIMIT_EXCEEDED", &message)?;
        return Err(message);
    }
    Ok(())
}

fn create_writer(
    file_path: &Path,
    config: &cpal::SupportedStreamConfig,
) -> Result<RecorderWriter, String> {
    let file = File::create(file_path).map_err(|err| err.to_string())?;
    let writer = BufWriter::new(file);
    match config.sample_format() {
        cpal::SampleFormat::F32 => hound::WavWriter::new(
            writer,
            hound::WavSpec {
                channels: config.channels(),
                sample_rate: config.sample_rate().0,
                bits_per_sample: 32,
                sample_format: hound::SampleFormat::Float,
            },
        )
        .map(RecorderWriter::Float32)
        .map_err(|err| err.to_string()),
        cpal::SampleFormat::I16 | cpal::SampleFormat::U16 => hound::WavWriter::new(
            writer,
            hound::WavSpec {
                channels: config.channels(),
                sample_rate: config.sample_rate().0,
                bits_per_sample: 16,
                sample_format: hound::SampleFormat::Int,
            },
        )
        .map(RecorderWriter::Int16)
        .map_err(|err| err.to_string()),
        other => Err(format!("不支持的录音采样格式：{:?}", other)),
    }
}

#[allow(clippy::too_many_arguments)]
fn build_stream(
    device: &cpal::Device,
    supported_config: &cpal::SupportedStreamConfig,
    writer: Arc<Mutex<Option<RecorderWriter>>>,
    snapshot: Arc<Mutex<RecorderStateSnapshot>>,
    stop_signal: Arc<AtomicBool>,
    #[cfg(feature = "local-transcription")] live_transcript: Arc<Mutex<LiveTranscriptBuffer>>,
    app: AppHandle,
    recording_id: String,
    started_at: Instant,
    sender: Sender<WorkerCommand>,
) -> Result<cpal::Stream, cpal::BuildStreamError> {
    let config = supported_config.config();
    let sample_format = supported_config.sample_format();
    #[cfg(feature = "local-transcription")]
    let channels = config.channels as usize;

    match sample_format {
        cpal::SampleFormat::F32 => {
            let data_writer = Arc::clone(&writer);
            let data_snapshot = Arc::clone(&snapshot);
            let data_stop_signal = Arc::clone(&stop_signal);
            let data_app = app.clone();
            let data_recording_id = recording_id.clone();
            let data_level_accumulator = Arc::new(Mutex::new(LevelAccumulator::new()));
            let callback_levels = Arc::clone(&data_level_accumulator);
            let callback_sender = sender.clone();
            let error_sender = sender.clone();
            let error_app = app.clone();
            #[cfg(feature = "local-transcription")]
            let data_live_transcript = Arc::clone(&live_transcript);

            device.build_input_stream(
                &config,
                move |data: &[f32], _| {
                    handle_input_callback_f32(
                        data,
                        &data_writer,
                        &data_snapshot,
                        &callback_levels,
                        &data_stop_signal,
                        &data_app,
                        &data_recording_id,
                        started_at,
                        #[cfg(feature = "local-transcription")]
                        channels,
                        #[cfg(feature = "local-transcription")]
                        &data_live_transcript,
                        &callback_sender,
                    );
                },
                move |error: cpal::StreamError| {
                    let _ = error_sender.send(WorkerCommand::RuntimeError {
                        app: error_app.clone(),
                        error: map_stream_runtime_error(&error.to_string()),
                    });
                },
                None,
            )
        }
        cpal::SampleFormat::I16 => {
            let data_writer = Arc::clone(&writer);
            let data_snapshot = Arc::clone(&snapshot);
            let data_stop_signal = Arc::clone(&stop_signal);
            let data_app = app.clone();
            let data_recording_id = recording_id.clone();
            let data_level_accumulator = Arc::new(Mutex::new(LevelAccumulator::new()));
            let callback_levels = Arc::clone(&data_level_accumulator);
            let callback_sender = sender.clone();
            let error_sender = sender.clone();
            let error_app = app.clone();
            #[cfg(feature = "local-transcription")]
            let data_live_transcript = Arc::clone(&live_transcript);

            device.build_input_stream(
                &config,
                move |data: &[i16], _| {
                    handle_input_callback_i16(
                        data,
                        &data_writer,
                        &data_snapshot,
                        &callback_levels,
                        &data_stop_signal,
                        &data_app,
                        &data_recording_id,
                        started_at,
                        #[cfg(feature = "local-transcription")]
                        channels,
                        #[cfg(feature = "local-transcription")]
                        &data_live_transcript,
                        &callback_sender,
                    );
                },
                move |error: cpal::StreamError| {
                    let _ = error_sender.send(WorkerCommand::RuntimeError {
                        app: error_app.clone(),
                        error: map_stream_runtime_error(&error.to_string()),
                    });
                },
                None,
            )
        }
        cpal::SampleFormat::U16 => {
            let data_writer = Arc::clone(&writer);
            let data_snapshot = Arc::clone(&snapshot);
            let data_stop_signal = Arc::clone(&stop_signal);
            let data_app = app.clone();
            let data_recording_id = recording_id.clone();
            let data_level_accumulator = Arc::new(Mutex::new(LevelAccumulator::new()));
            let callback_levels = Arc::clone(&data_level_accumulator);
            let callback_sender = sender.clone();
            let error_sender = sender.clone();
            let error_app = app.clone();
            #[cfg(feature = "local-transcription")]
            let data_live_transcript = Arc::clone(&live_transcript);

            device.build_input_stream(
                &config,
                move |data: &[u16], _| {
                    handle_input_callback_u16(
                        data,
                        &data_writer,
                        &data_snapshot,
                        &callback_levels,
                        &data_stop_signal,
                        &data_app,
                        &data_recording_id,
                        started_at,
                        #[cfg(feature = "local-transcription")]
                        channels,
                        #[cfg(feature = "local-transcription")]
                        &data_live_transcript,
                        &callback_sender,
                    );
                },
                move |error: cpal::StreamError| {
                    let _ = error_sender.send(WorkerCommand::RuntimeError {
                        app: error_app.clone(),
                        error: map_stream_runtime_error(&error.to_string()),
                    });
                },
                None,
            )
        }
        _ => unreachable!(),
    }
}

fn handle_input_callback_f32(
    data: &[f32],
    writer: &Arc<Mutex<Option<RecorderWriter>>>,
    snapshot: &Arc<Mutex<RecorderStateSnapshot>>,
    accumulator: &Arc<Mutex<LevelAccumulator>>,
    stop_signal: &Arc<AtomicBool>,
    app: &AppHandle,
    recording_id: &str,
    started_at: Instant,
    #[cfg(feature = "local-transcription")] channels: usize,
    #[cfg(feature = "local-transcription")] live_transcript: &Arc<Mutex<LiveTranscriptBuffer>>,
    sender: &Sender<WorkerCommand>,
) {
    if stop_signal.load(Ordering::SeqCst) {
        return;
    }

    if let Err(message) = write_f32_samples(writer, data) {
        stop_signal.store(true, Ordering::SeqCst);
        let _ = sender.send(WorkerCommand::RuntimeError {
            app: app.clone(),
            error: RecorderErrorState {
                code: "INTERNAL_ERROR".to_string(),
                message,
            },
        });
        return;
    }

    emit_levels_if_needed(
        data.iter().copied(),
        snapshot,
        accumulator,
        app,
        recording_id,
        started_at,
    );

    #[cfg(feature = "local-transcription")]
    push_live_samples_from_f32(data, channels, live_transcript);
}

fn handle_input_callback_i16(
    data: &[i16],
    writer: &Arc<Mutex<Option<RecorderWriter>>>,
    snapshot: &Arc<Mutex<RecorderStateSnapshot>>,
    accumulator: &Arc<Mutex<LevelAccumulator>>,
    stop_signal: &Arc<AtomicBool>,
    app: &AppHandle,
    recording_id: &str,
    started_at: Instant,
    #[cfg(feature = "local-transcription")] channels: usize,
    #[cfg(feature = "local-transcription")] live_transcript: &Arc<Mutex<LiveTranscriptBuffer>>,
    sender: &Sender<WorkerCommand>,
) {
    if stop_signal.load(Ordering::SeqCst) {
        return;
    }

    if let Err(message) = write_i16_samples(writer, data.iter().copied()) {
        stop_signal.store(true, Ordering::SeqCst);
        let _ = sender.send(WorkerCommand::RuntimeError {
            app: app.clone(),
            error: RecorderErrorState {
                code: "INTERNAL_ERROR".to_string(),
                message,
            },
        });
        return;
    }

    emit_levels_if_needed(
        data.iter()
            .map(|sample| (*sample as f32 / i16::MAX as f32).clamp(-1.0, 1.0)),
        snapshot,
        accumulator,
        app,
        recording_id,
        started_at,
    );

    #[cfg(feature = "local-transcription")]
    push_live_samples_from_i16(data, channels, live_transcript);
}

fn handle_input_callback_u16(
    data: &[u16],
    writer: &Arc<Mutex<Option<RecorderWriter>>>,
    snapshot: &Arc<Mutex<RecorderStateSnapshot>>,
    accumulator: &Arc<Mutex<LevelAccumulator>>,
    stop_signal: &Arc<AtomicBool>,
    app: &AppHandle,
    recording_id: &str,
    started_at: Instant,
    #[cfg(feature = "local-transcription")] channels: usize,
    #[cfg(feature = "local-transcription")] live_transcript: &Arc<Mutex<LiveTranscriptBuffer>>,
    sender: &Sender<WorkerCommand>,
) {
    if stop_signal.load(Ordering::SeqCst) {
        return;
    }

    let signed_samples = data.iter().map(|sample| (*sample as i32 - 32768) as i16);
    if let Err(message) = write_i16_samples(writer, signed_samples) {
        stop_signal.store(true, Ordering::SeqCst);
        let _ = sender.send(WorkerCommand::RuntimeError {
            app: app.clone(),
            error: RecorderErrorState {
                code: "INTERNAL_ERROR".to_string(),
                message,
            },
        });
        return;
    }

    emit_levels_if_needed(
        data.iter().map(|sample| normalize_u16_sample(*sample)),
        snapshot,
        accumulator,
        app,
        recording_id,
        started_at,
    );

    #[cfg(feature = "local-transcription")]
    push_live_samples_from_u16(data, channels, live_transcript);
}

#[cfg(feature = "local-transcription")]
fn push_live_samples_from_f32(
    data: &[f32],
    channels: usize,
    live_transcript: &Arc<Mutex<LiveTranscriptBuffer>>,
) {
    push_mono_samples(
        live_transcript,
        interleaved_to_mono(data.iter().copied(), channels),
    );
}

#[cfg(feature = "local-transcription")]
fn push_live_samples_from_i16(
    data: &[i16],
    channels: usize,
    live_transcript: &Arc<Mutex<LiveTranscriptBuffer>>,
) {
    let normalized = data
        .iter()
        .map(|sample| (*sample as f32 / i16::MAX as f32).clamp(-1.0, 1.0));
    push_mono_samples(live_transcript, interleaved_to_mono(normalized, channels));
}

#[cfg(feature = "local-transcription")]
fn push_live_samples_from_u16(
    data: &[u16],
    channels: usize,
    live_transcript: &Arc<Mutex<LiveTranscriptBuffer>>,
) {
    let normalized = data.iter().map(|sample| normalize_u16_sample(*sample));
    push_mono_samples(live_transcript, interleaved_to_mono(normalized, channels));
}

#[cfg(feature = "local-transcription")]
fn push_mono_samples(live_transcript: &Arc<Mutex<LiveTranscriptBuffer>>, samples: Vec<f32>) {
    if let Ok(mut state) = live_transcript.lock() {
        state.pending_samples.extend(samples);
    }
}

#[cfg(feature = "local-transcription")]
fn interleaved_to_mono<I>(samples: I, channels: usize) -> Vec<f32>
where
    I: IntoIterator<Item = f32>,
{
    let channels = channels.max(1);
    if channels == 1 {
        return samples.into_iter().collect();
    }

    let mut mono = Vec::new();
    let mut frame = Vec::with_capacity(channels);
    for sample in samples {
        frame.push(sample);
        if frame.len() == channels {
            let sum: f32 = frame.iter().copied().sum();
            mono.push(sum / channels as f32);
            frame.clear();
        }
    }
    mono
}

fn write_f32_samples(
    writer: &Arc<Mutex<Option<RecorderWriter>>>,
    data: &[f32],
) -> Result<(), String> {
    let mut writer = writer
        .lock()
        .map_err(|_| "failed to lock recording writer".to_string())?;
    let Some(writer) = writer.as_mut() else {
        return Err("recording writer already closed".to_string());
    };
    for sample in data {
        writer
            .write_f32(*sample)
            .map_err(|err| format!("录音写入失败：{}", err))?;
    }
    Ok(())
}

fn write_i16_samples<I>(writer: &Arc<Mutex<Option<RecorderWriter>>>, data: I) -> Result<(), String>
where
    I: IntoIterator<Item = i16>,
{
    let mut writer = writer
        .lock()
        .map_err(|_| "failed to lock recording writer".to_string())?;
    let Some(writer) = writer.as_mut() else {
        return Err("recording writer already closed".to_string());
    };
    for sample in data {
        writer
            .write_i16(sample)
            .map_err(|err| format!("录音写入失败：{}", err))?;
    }
    Ok(())
}

fn emit_levels_if_needed<I>(
    samples: I,
    snapshot: &Arc<Mutex<RecorderStateSnapshot>>,
    accumulator: &Arc<Mutex<LevelAccumulator>>,
    app: &AppHandle,
    recording_id: &str,
    started_at: Instant,
) where
    I: IntoIterator<Item = f32>,
{
    let mut accumulator = match accumulator.lock() {
        Ok(accumulator) => accumulator,
        Err(_) => return,
    };

    for sample in samples {
        accumulator.push(sample);
    }

    if !accumulator.should_emit() {
        return;
    }

    let (level, peak_level, muted) = accumulator.reset_and_measure();
    let timestamp = now_unix_ms();
    let duration_ms = started_at.elapsed().as_millis() as u64;

    if let Ok(mut state) = snapshot.lock() {
        if state.active_recording_id.as_deref() != Some(recording_id) {
            return;
        }
        state.duration_ms = duration_ms;
        state.level = level;
        state.peak_level = peak_level;
        state.muted = muted;
        state.updated_at = Some(timestamp);
    }

    emit_level_update(
        app,
        RecorderLevelUpdateEventPayload {
            recording_id: Some(recording_id.to_string()),
            level,
            peak_level,
            muted,
            timestamp,
        },
    );
}

fn update_snapshot(
    snapshot: &Arc<Mutex<RecorderStateSnapshot>>,
    mutate: impl FnOnce(&mut RecorderStateSnapshot),
) -> Result<(), String> {
    let mut state = snapshot
        .lock()
        .map_err(|_| "failed to lock recorder snapshot".to_string())?;
    mutate(&mut state);
    Ok(())
}

fn emit_state_update(
    app: &AppHandle,
    snapshot: &Arc<Mutex<RecorderStateSnapshot>>,
) -> Result<(), String> {
    let payload = snapshot
        .lock()
        .map(|snapshot| snapshot.clone())
        .map_err(|_| "failed to lock recorder snapshot".to_string())?;
    let _ = app.emit(STATE_EVENT_NAME, payload);
    Ok(())
}

fn emit_level_update(app: &AppHandle, payload: RecorderLevelUpdateEventPayload) {
    let _ = app.emit(LEVEL_EVENT_NAME, payload);
}

fn probe_input_signal(
    device: &cpal::Device,
    supported_config: &cpal::SupportedStreamConfig,
) -> Result<(f32, bool), RecorderErrorState> {
    let config = supported_config.config();
    let peak_level = Arc::new(Mutex::new(0.0_f32));
    let runtime_error = Arc::new(Mutex::new(None::<RecorderErrorState>));

    let stream = match supported_config.sample_format() {
        cpal::SampleFormat::F32 => {
            let peak_level = Arc::clone(&peak_level);
            let runtime_error = Arc::clone(&runtime_error);
            device.build_input_stream(
                &config,
                move |data: &[f32], _| {
                    if let Ok(mut peak) = peak_level.lock() {
                        for sample in data {
                            *peak = peak.max(sample.abs().clamp(0.0, 1.0)).to_owned();
                        }
                    }
                },
                move |error: cpal::StreamError| {
                    if let Ok(mut slot) = runtime_error.lock() {
                        *slot = Some(map_stream_runtime_error(&error.to_string()));
                    }
                },
                None,
            )
        }
        cpal::SampleFormat::I16 => {
            let peak_level = Arc::clone(&peak_level);
            let runtime_error = Arc::clone(&runtime_error);
            device.build_input_stream(
                &config,
                move |data: &[i16], _| {
                    if let Ok(mut peak) = peak_level.lock() {
                        for sample in data {
                            *peak = peak.max(((*sample as f32 / i16::MAX as f32).abs()).clamp(0.0, 1.0)).to_owned();
                        }
                    }
                },
                move |error: cpal::StreamError| {
                    if let Ok(mut slot) = runtime_error.lock() {
                        *slot = Some(map_stream_runtime_error(&error.to_string()));
                    }
                },
                None,
            )
        }
        cpal::SampleFormat::U16 => {
            let peak_level = Arc::clone(&peak_level);
            let runtime_error = Arc::clone(&runtime_error);
            device.build_input_stream(
                &config,
                move |data: &[u16], _| {
                    if let Ok(mut peak) = peak_level.lock() {
                        for sample in data {
                            *peak = peak.max(normalize_u16_sample(*sample).abs().clamp(0.0, 1.0)).to_owned();
                        }
                    }
                },
                move |error: cpal::StreamError| {
                    if let Ok(mut slot) = runtime_error.lock() {
                        *slot = Some(map_stream_runtime_error(&error.to_string()));
                    }
                },
                None,
            )
        }
        _ => unreachable!(),
    }
    .map_err(|error| map_build_stream_error(&error))?;

    stream.play().map_err(|error| map_play_stream_error(&error))?;
    thread::sleep(Duration::from_millis(350));
    drop(stream);

    if let Ok(mut error) = runtime_error.lock() {
        if let Some(error) = error.take() {
            return Err(error);
        }
    }

    let peak = peak_level.lock().map(|value| *value).unwrap_or(0.0);
    Ok((peak, peak <= MUTED_THRESHOLD))
}

#[cfg(feature = "local-transcription")]
fn emit_live_transcript_segment_update(
    app: &AppHandle,
    payload: RecorderLiveTranscriptSegmentUpdateEventPayload,
) {
    let _ = app.emit(LIVE_TRANSCRIPT_SEGMENT_EVENT_NAME, payload);
}

fn set_error_state(
    snapshot: &Arc<Mutex<RecorderStateSnapshot>>,
    app: &AppHandle,
    code: &str,
    message: &str,
) -> Result<(), String> {
    update_snapshot(snapshot, |state| {
        state.status = RecorderStatus::Error;
        state.active_recording_id = None;
        state.level = 0.0;
        state.peak_level = 0.0;
        state.muted = true;
        state.error_code = Some(code.to_string());
        state.error_message = Some(message.to_string());
        state.updated_at = Some(now_unix_ms());
    })?;
    emit_state_update(app, snapshot)
}

fn timeout_for_active_recording(active: Option<&ActiveRecording>) -> Duration {
    let Some(active) = active else {
        return Duration::from_millis(WORKER_POLL_MS);
    };

    let elapsed = active.started_at.elapsed().as_millis() as u64;
    if elapsed >= MAX_RECORDING_DURATION_MS {
        Duration::from_millis(0)
    } else {
        Duration::from_millis((MAX_RECORDING_DURATION_MS - elapsed).min(WORKER_POLL_MS))
    }
}

#[cfg(feature = "local-transcription")]
fn maybe_schedule_live_transcript(
    active: &ActiveRecording,
    snapshot: &Arc<Mutex<RecorderStateSnapshot>>,
) {
    let Some(job) = prepare_live_transcript_job(&active.live_transcript) else {
        return;
    };

    let app = active.app.clone();
    let recording_id = active.recording_id.clone();
    let model_path = active.model_path.clone();
    let live_transcript = Arc::clone(&active.live_transcript);
    let snapshot = Arc::clone(snapshot);

    tauri::async_runtime::spawn_blocking(move || {
        let outcome = transcribe_pcm_samples(&model_path, &job.samples, job.sample_rate);
        finish_live_transcript_job(
            &app,
            &snapshot,
            &live_transcript,
            &recording_id,
            job,
            outcome,
        );
    });
}

#[cfg(feature = "local-transcription")]
fn prepare_live_transcript_job(
    live_transcript: &Arc<Mutex<LiveTranscriptBuffer>>,
) -> Option<LiveTranscriptJob> {
    let mut state = live_transcript.lock().ok()?;
    if state.in_flight {
        return None;
    }

    let chunk_len =
        ((state.sample_rate as u64 * LIVE_TRANSCRIPT_SEGMENT_INTERVAL_MS) / 1000) as usize;
    if state.pending_samples.len() < chunk_len || chunk_len == 0 {
        return None;
    }

    let samples = state.pending_samples.drain(..chunk_len).collect::<Vec<_>>();
    let start_ms = state.next_start_ms;
    let end_ms = start_ms + ((samples.len() as u64) * 1000 / state.sample_rate as u64);
    let sequence = state.next_sequence;
    state.next_sequence += 1;
    state.next_start_ms = end_ms;
    state.in_flight = true;

    Some(LiveTranscriptJob {
        samples,
        sample_rate: state.sample_rate,
        sequence,
        start_ms,
        end_ms,
    })
}

#[cfg(feature = "local-transcription")]
fn finish_live_transcript_job(
    app: &AppHandle,
    snapshot: &Arc<Mutex<RecorderStateSnapshot>>,
    live_transcript: &Arc<Mutex<LiveTranscriptBuffer>>,
    recording_id: &str,
    job: LiveTranscriptJob,
    outcome: Result<FinalTranscriptionResult, RecorderErrorState>,
) {
    if let Ok(mut live_state) = live_transcript.lock() {
        live_state.in_flight = false;
    }

    let Ok(result) = outcome else {
        return;
    };

    let text = normalize_transcript_text(&result.final_text);
    if text.is_empty() {
        return;
    }

    let segment = RecorderTranscriptSegment {
        id: format!("{}_live_{}", recording_id, job.sequence),
        sequence: job.sequence,
        start_ms: job.start_ms,
        end_ms: job.end_ms,
        text,
        is_final: false,
    };

    let mut payload = None;
    if let Ok(mut state) = snapshot.lock() {
        if state.active_recording_id.as_deref() != Some(recording_id) {
            return;
        }
        state.live_transcript_segments.push(segment.clone());
        state.live_transcript_segments.sort_by(|left, right| {
            left.sequence
                .cmp(&right.sequence)
                .then(left.start_ms.cmp(&right.start_ms))
        });
        state.live_transcript_text = join_transcript_segments(&state.live_transcript_segments);
        state.updated_at = Some(now_unix_ms());
        payload = Some(RecorderLiveTranscriptSegmentUpdateEventPayload {
            recording_id: recording_id.to_string(),
            segment,
            live_transcript_text: state.live_transcript_text.clone(),
            updated_at: state.updated_at.unwrap_or_else(now_unix_ms),
        });
    }

    if let Some(payload) = payload {
        emit_live_transcript_segment_update(app, payload);
        let _ = emit_state_update(app, snapshot);
    }
}

#[cfg(feature = "local-transcription")]
fn spawn_final_transcription(
    app: AppHandle,
    snapshot: Arc<Mutex<RecorderStateSnapshot>>,
    model_path: PathBuf,
    request: FinalTranscriptionRequest,
) {
    tauri::async_runtime::spawn_blocking(move || {
        let init_message = format!("正在准备本地转写模型：{}", model_path.display());
        let _ = set_snapshot_phase(
            &snapshot,
            &app,
            RecorderStatus::Transcribing,
            None,
            Some(init_message),
        );

        let outcome = transcribe_wav_file(&model_path, &request.file_path);
        match outcome {
            Ok(result) => {
                let _ = set_snapshot_phase(
                    &snapshot,
                    &app,
                    RecorderStatus::Finalizing,
                    None,
                    Some("正在整理最终转写结果".to_string()),
                );

                let _ = write_transcript_sidecar(
                    &request.file_path,
                    &request.recording_id,
                    &result.detected_language,
                    &result.segments,
                );

                match build_recording_persist_payload(
                    &request.recording_id,
                    &request.file_path,
                    request.duration_ms,
                    request.file_size_bytes,
                    request.created_at,
                    result.detected_language.clone(),
                    Some(result.final_text.clone()),
                    Some(result.segments.clone()),
                ) {
                    Ok(payload) => {
                        if let Err(persist_error) = persist_recording_to_server(&app, &payload) {
                            crate::log_event(
                                &app,
                                "WARN",
                                "recorder",
                                format!("failed to persist recording {}: {}", payload.id, persist_error),
                            );
                        }
                    }
                    Err(error) => {
                        crate::log_event(
                            &app,
                            "WARN",
                            "recorder",
                            format!("failed to build persist payload for {}: {}", request.recording_id, error),
                        );
                    }
                }

                let _ = update_snapshot(&snapshot, |state| {
                    state.status = RecorderStatus::Completed;
                    state.final_transcript_text = result.final_text;
                    state.error_code = None;
                    state.error_message = None;
                    state.updated_at = Some(now_unix_ms());
                });
                let _ = emit_state_update(&app, &snapshot);
            }
            Err(error) => {
                let _ = set_error_state(&snapshot, &app, &error.code, &error.message);
            }
        }
    });
}

#[cfg(feature = "local-transcription")]
fn set_snapshot_phase(
    snapshot: &Arc<Mutex<RecorderStateSnapshot>>,
    app: &AppHandle,
    status: RecorderStatus,
    error_code: Option<String>,
    error_message: Option<String>,
) -> Result<(), String> {
    update_snapshot(snapshot, |state| {
        state.status = status;
        state.error_code = error_code.clone();
        state.error_message = error_message.clone();
        state.updated_at = Some(now_unix_ms());
    })?;
    emit_state_update(app, snapshot)
}

#[cfg(feature = "local-transcription")]
fn transcribe_wav_file(
    model_path: &Path,
    file_path: &Path,
) -> Result<FinalTranscriptionResult, RecorderErrorState> {
    ensure_model_exists(model_path)?;
    let (samples, sample_rate) =
        read_wav_as_mono_f32(file_path).map_err(|message| RecorderErrorState {
            code: "INTERNAL_ERROR".to_string(),
            message,
        })?;
    transcribe_pcm_samples(model_path, &samples, sample_rate)
}

#[cfg(feature = "local-transcription")]
fn transcribe_pcm_samples(
    model_path: &Path,
    samples: &[f32],
    sample_rate: u32,
) -> Result<FinalTranscriptionResult, RecorderErrorState> {
    ensure_model_exists(model_path)?;
    let resampled = resample_audio_linear(samples, sample_rate, WHISPER_TARGET_SAMPLE_RATE);
    if resampled.is_empty() {
        return Ok(FinalTranscriptionResult {
            detected_language: None,
            final_text: String::new(),
            segments: Vec::new(),
        });
    }

    let context = WhisperContext::new_with_params(
        model_path.to_string_lossy().as_ref(),
        WhisperContextParameters::default(),
    )
    .map_err(|err| RecorderErrorState {
        code: "RECORDING_MODEL_MISSING".to_string(),
        message: format!("本地转写模型初始化失败：{}", err),
    })?;
    let mut state = context.create_state().map_err(|err| RecorderErrorState {
        code: "INTERNAL_ERROR".to_string(),
        message: format!("本地转写状态创建失败：{}", err),
    })?;

    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    params.set_detect_language(true);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_special(false);
    params.set_print_timestamps(false);
    params.set_n_threads(4);

    state
        .full(params, &resampled)
        .map_err(|err| RecorderErrorState {
            code: "INTERNAL_ERROR".to_string(),
            message: format!("本地离线转写失败：{}", err),
        })?;

    let mut segments = Vec::new();
    for (index, segment) in state.as_iter().enumerate() {
        let raw_text = segment.to_str_lossy().map_err(|err| RecorderErrorState {
            code: "INTERNAL_ERROR".to_string(),
            message: format!("读取转写文本失败：{}", err),
        })?;
        let text = normalize_transcript_text(&raw_text);
        if text.is_empty() {
            continue;
        }

        let start_ms = (segment.start_timestamp().max(0) as u64) * 10;
        let end_ms = (segment.end_timestamp().max(0) as u64) * 10;
        segments.push(RecorderTranscriptSegment {
            id: format!("final_{}", index),
            sequence: index as u64,
            start_ms,
            end_ms: end_ms.max(start_ms),
            text,
            is_final: true,
        });
    }

    let detected_language =
        whisper_rs::get_lang_str(state.full_lang_id_from_state()).map(|value| value.to_string());
    let final_text = join_transcript_segments(&segments);

    Ok(FinalTranscriptionResult {
        detected_language,
        final_text,
        segments,
    })
}

#[cfg(feature = "local-transcription")]
fn ensure_model_exists(model_path: &Path) -> Result<(), RecorderErrorState> {
    if model_path.exists() {
        return Ok(());
    }

    let parent = model_path.parent().ok_or_else(|| RecorderErrorState {
        code: "RECORDING_MODEL_MISSING".to_string(),
        message: format!("无法解析模型目录：{}", model_path.display()),
    })?;
    fs::create_dir_all(parent).map_err(|err| RecorderErrorState {
        code: "RECORDING_MODEL_MISSING".to_string(),
        message: format!("创建模型目录失败：{}", err),
    })?;

    let temp_path = model_path.with_extension("bin.partial");
    let response = reqwest::blocking::get(WHISPER_MODEL_DOWNLOAD_URL)
        .and_then(|response| response.error_for_status())
        .map_err(|err| RecorderErrorState {
            code: "RECORDING_MODEL_MISSING".to_string(),
            message: format!("本地转写模型缺失，自动下载失败，可稍后重试：{}", err),
        })?;

    let mut file = File::create(&temp_path).map_err(|err| RecorderErrorState {
        code: "RECORDING_MODEL_MISSING".to_string(),
        message: format!("创建模型临时文件失败：{}", err),
    })?;
    let mut response = response;
    std::io::copy(&mut response, &mut file).map_err(|err| RecorderErrorState {
        code: "RECORDING_MODEL_MISSING".to_string(),
        message: format!("写入模型文件失败：{}", err),
    })?;
    file.flush().map_err(|err| RecorderErrorState {
        code: "RECORDING_MODEL_MISSING".to_string(),
        message: format!("刷新模型文件失败：{}", err),
    })?;
    fs::rename(&temp_path, model_path).map_err(|err| RecorderErrorState {
        code: "RECORDING_MODEL_MISSING".to_string(),
        message: format!("完成模型下载失败：{}", err),
    })?;

    Ok(())
}

#[cfg(feature = "local-transcription")]
fn read_wav_as_mono_f32(file_path: &Path) -> Result<(Vec<f32>, u32), String> {
    let mut reader = hound::WavReader::open(file_path).map_err(|err| err.to_string())?;
    let spec = reader.spec();
    let channels = spec.channels.max(1) as usize;

    let mono = match (spec.sample_format, spec.bits_per_sample) {
        (hound::SampleFormat::Float, _) => {
            let samples = reader
                .samples::<f32>()
                .collect::<Result<Vec<_>, _>>()
                .map_err(|err| err.to_string())?;
            interleaved_to_mono(samples, channels)
        }
        (hound::SampleFormat::Int, bits) if bits <= 16 => {
            let samples = reader
                .samples::<i16>()
                .collect::<Result<Vec<_>, _>>()
                .map_err(|err| err.to_string())?;
            interleaved_to_mono(
                samples
                    .into_iter()
                    .map(|sample| (sample as f32 / i16::MAX as f32).clamp(-1.0, 1.0)),
                channels,
            )
        }
        (hound::SampleFormat::Int, _) => {
            let samples = reader
                .samples::<i32>()
                .collect::<Result<Vec<_>, _>>()
                .map_err(|err| err.to_string())?;
            interleaved_to_mono(
                samples
                    .into_iter()
                    .map(|sample| (sample as f32 / i32::MAX as f32).clamp(-1.0, 1.0)),
                channels,
            )
        }
    };

    Ok((mono, spec.sample_rate))
}

#[cfg(feature = "local-transcription")]
fn resample_audio_linear(samples: &[f32], source_rate: u32, target_rate: u32) -> Vec<f32> {
    if samples.is_empty() {
        return Vec::new();
    }
    if source_rate == target_rate || source_rate == 0 || target_rate == 0 {
        return samples.to_vec();
    }

    let ratio = source_rate as f64 / target_rate as f64;
    let target_len = ((samples.len() as f64) / ratio).round().max(1.0) as usize;
    let mut output = Vec::with_capacity(target_len);
    for index in 0..target_len {
        let source_pos = index as f64 * ratio;
        let left = source_pos.floor() as usize;
        let right = (left + 1).min(samples.len() - 1);
        let frac = (source_pos - left as f64) as f32;
        let interpolated = samples[left] * (1.0 - frac) + samples[right] * frac;
        output.push(interpolated.clamp(-1.0, 1.0));
    }
    output
}

#[cfg(feature = "local-transcription")]
fn normalize_transcript_text(text: &str) -> String {
    text.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string()
}

fn build_recording_persist_payload(
    recording_id: &str,
    file_path: &Path,
    duration_ms: u64,
    file_size_bytes: u64,
    created_at: u64,
    language: Option<String>,
    final_transcript_text: Option<String>,
    segments: Option<Vec<RecorderTranscriptSegment>>,
) -> Result<PersistedRecordingPayload, String> {
    let updated_at = now_unix_ms();
    let normalized_final_text = final_transcript_text
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let transcript_json = segments
        .filter(|items| !items.is_empty())
        .map(|items| serde_json::to_string(&items).map_err(|err| err.to_string()))
        .transpose()?;

    Ok(PersistedRecordingPayload {
        id: recording_id.to_string(),
        status: "completed".to_string(),
        file_path: file_path.to_string_lossy().to_string(),
        duration_ms,
        file_size_bytes,
        language,
        live_transcript_text: normalized_final_text.clone(),
        final_transcript_text: normalized_final_text,
        transcript_json,
        organised_text: None,
        created_at,
        updated_at,
    })
}

fn persist_recording_to_server(app: &AppHandle, payload: &PersistedRecordingPayload) -> Result<(), String> {
    #[cfg(feature = "local-transcription")]
    {
        return persist_recording_with_reqwest(app, payload);
    }

    #[cfg(not(feature = "local-transcription"))]
    {
        persist_recording_with_tcp(app, payload)
    }
}

fn resolve_server_port(app: &AppHandle) -> Result<u16, String> {
    app.state::<std::sync::Mutex<crate::ServerProcess>>()
        .lock()
        .map(|server| server.port)
        .map_err(|_| "failed to lock managed server state".to_string())
}

#[cfg(feature = "local-transcription")]
fn persist_recording_with_reqwest(app: &AppHandle, payload: &PersistedRecordingPayload) -> Result<(), String> {
    let server_port = resolve_server_port(app)?;
    let url = format!("http://127.0.0.1:{}/api/recordings", server_port);
    Client::new()
        .post(url)
        .json(payload)
        .send()
        .and_then(|response| response.error_for_status())
        .map(|_| ())
        .map_err(|err| err.to_string())
}

#[cfg(not(feature = "local-transcription"))]
fn persist_recording_with_tcp(app: &AppHandle, payload: &PersistedRecordingPayload) -> Result<(), String> {
    let server_port = resolve_server_port(app)?;
    let body = serde_json::to_vec(payload).map_err(|err| err.to_string())?;
    let mut stream = TcpStream::connect(("127.0.0.1", server_port)).map_err(|err| err.to_string())?;
    let headers = format!(
        "POST /api/recordings HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        server_port,
        body.len(),
    );
    stream.write_all(headers.as_bytes()).map_err(|err| err.to_string())?;
    stream.write_all(&body).map_err(|err| err.to_string())?;
    stream.flush().map_err(|err| err.to_string())?;

    let mut response = String::new();
    stream.read_to_string(&mut response).map_err(|err| err.to_string())?;
    let status_line = response.lines().next().unwrap_or_default().to_string();
    if !(status_line.starts_with("HTTP/1.1 2") || status_line.starts_with("HTTP/1.0 2")) {
        return Err(if status_line.is_empty() {
            "server returned empty response".to_string()
        } else {
            status_line
        });
    }

    Ok(())
}

#[cfg(any(test, feature = "local-transcription"))]
fn join_transcript_segments(segments: &[RecorderTranscriptSegment]) -> String {
    segments
        .iter()
        .map(|segment| segment.text.trim())
        .filter(|text| !text.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(feature = "local-transcription")]
fn write_transcript_sidecar(
    file_path: &Path,
    recording_id: &str,
    detected_language: &Option<String>,
    segments: &[RecorderTranscriptSegment],
) -> Result<(), String> {
    let sidecar_path = file_path.with_extension("segments.json");
    let payload = serde_json::json!({
        "recordingId": recording_id,
        "language": detected_language,
        "segments": segments,
    });
    fs::write(
        sidecar_path,
        serde_json::to_vec_pretty(&payload).map_err(|err| err.to_string())?,
    )
    .map_err(|err| err.to_string())
}

fn build_recording_id() -> String {
    format!("rec_{}_{}", now_unix_ms(), std::process::id())
}

fn normalize_u16_sample(sample: u16) -> f32 {
    ((sample as f32 / u16::MAX as f32) * 2.0 - 1.0).clamp(-1.0, 1.0)
}

fn directory_size(path: &Path) -> Result<u64, String> {
    let entries = fs::read_dir(path).map_err(|err| err.to_string())?;
    let mut total = 0_u64;
    for entry in entries {
        let entry = entry.map_err(|err| err.to_string())?;
        let metadata = entry.metadata().map_err(|err| err.to_string())?;
        if metadata.is_file() {
            total = total.saturating_add(metadata.len());
        }
    }
    Ok(total)
}

fn bytes_to_gb(bytes: u64) -> f64 {
    bytes as f64 / 1024_f64 / 1024_f64 / 1024_f64
}

fn map_config_error(error: &cpal::DefaultStreamConfigError) -> RecorderErrorState {
    match error {
        cpal::DefaultStreamConfigError::DeviceNotAvailable => RecorderErrorState {
            code: "RECORDING_DEVICE_UNAVAILABLE".to_string(),
            message: "录音设备当前不可用".to_string(),
        },
        cpal::DefaultStreamConfigError::StreamTypeNotSupported => RecorderErrorState {
            code: "RECORDING_DEVICE_UNAVAILABLE".to_string(),
            message: "当前录音设备不支持默认输入格式".to_string(),
        },
        cpal::DefaultStreamConfigError::BackendSpecific { err } => {
            map_stream_runtime_error(&err.to_string())
        }
    }
}

fn map_build_stream_error(error: &cpal::BuildStreamError) -> RecorderErrorState {
    match error {
        cpal::BuildStreamError::DeviceNotAvailable => RecorderErrorState {
            code: "RECORDING_DEVICE_UNAVAILABLE".to_string(),
            message: "录音设备当前不可用".to_string(),
        },
        cpal::BuildStreamError::StreamConfigNotSupported => RecorderErrorState {
            code: "RECORDING_DEVICE_UNAVAILABLE".to_string(),
            message: "录音设备不支持当前采样配置".to_string(),
        },
        cpal::BuildStreamError::InvalidArgument => RecorderErrorState {
            code: "INTERNAL_ERROR".to_string(),
            message: "录音参数无效，无法启动输入流".to_string(),
        },
        cpal::BuildStreamError::StreamIdOverflow => RecorderErrorState {
            code: "INTERNAL_ERROR".to_string(),
            message: "录音流实例过多，稍后再试".to_string(),
        },
        cpal::BuildStreamError::BackendSpecific { err } => {
            map_stream_runtime_error(&err.to_string())
        }
    }
}

fn map_play_stream_error(error: &cpal::PlayStreamError) -> RecorderErrorState {
    match error {
        cpal::PlayStreamError::DeviceNotAvailable => RecorderErrorState {
            code: "RECORDING_DEVICE_UNAVAILABLE".to_string(),
            message: "录音设备当前不可用".to_string(),
        },
        cpal::PlayStreamError::BackendSpecific { err } => {
            map_stream_runtime_error(&err.to_string())
        }
    }
}

fn map_stream_runtime_error(message: &str) -> RecorderErrorState {
    let lower = message.to_lowercase();
    if lower.contains("permission")
        || lower.contains("not authorized")
        || lower.contains("access denied")
    {
        RecorderErrorState {
            code: "RECORDING_PERMISSION_DENIED".to_string(),
            message: "麦克风权限被拒绝，请在系统设置中允许 IMS 访问麦克风".to_string(),
        }
    } else if lower.contains("device") || lower.contains("input") || lower.contains("host") {
        RecorderErrorState {
            code: "RECORDING_DEVICE_UNAVAILABLE".to_string(),
            message: format!("录音设备不可用：{}", message),
        }
    } else {
        RecorderErrorState {
            code: "INTERNAL_ERROR".to_string(),
            message: format!("录音运行失败：{}", message),
        }
    }
}

fn build_diagnostics_from_error(
    active_recording: bool,
    device_name: Option<String>,
    sample_rate: Option<u32>,
    channels: Option<u16>,
    error: RecorderErrorState,
    notes: Vec<String>,
) -> RecorderDiagnosticsData {
    RecorderDiagnosticsData {
        checked_at: now_unix_ms(),
        desktop_runtime: true,
        active_recording,
        device_available: device_name.is_some(),
        device_name,
        config_available: sample_rate.is_some() && channels.is_some(),
        sample_rate,
        channels,
        permission_granted: Some(error.code != "RECORDING_PERMISSION_DENIED"),
        input_signal_detected: None,
        peak_level: None,
        muted: None,
        error_code: Some(error.code),
        error_message: Some(error.message),
        notes,
    }
}

fn now_unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis() as u64)
        .unwrap_or(0)
}

impl RecorderStateSnapshot {
    fn idle() -> Self {
        Self {
            status: RecorderStatus::Idle,
            active_recording_id: None,
            duration_ms: 0,
            live_transcript_text: String::new(),
            final_transcript_text: String::new(),
            organised_text: None,
            live_transcript_segments: Vec::new(),
            level: 0.0,
            peak_level: 0.0,
            muted: true,
            error_code: None,
            error_message: None,
            updated_at: Some(now_unix_ms()),
        }
    }
}

#[tauri::command]
pub fn start_recording(
    app: AppHandle,
    recorder: State<'_, RecorderManager>,
) -> Result<String, String> {
    recorder.inner().start(&app)
}

#[tauri::command]
pub fn stop_recording(app: AppHandle, recorder: State<'_, RecorderManager>) -> Result<(), String> {
    recorder.inner().request_stop(&app)
}

#[tauri::command]
pub fn get_recorder_status(
    recorder: State<'_, RecorderManager>,
) -> Result<RecorderStateSnapshot, String> {
    recorder.inner().get_status()
}

#[tauri::command]
pub fn run_recorder_diagnostics(
    recorder: State<'_, RecorderManager>,
) -> Result<RecorderDiagnosticsData, String> {
    let snapshot = recorder.inner().get_status()?;
    let active_recording = matches!(snapshot.status, RecorderStatus::Recording | RecorderStatus::Stopping | RecorderStatus::Transcribing)
        || snapshot.active_recording_id.is_some();

    if active_recording {
        return Ok(RecorderDiagnosticsData {
            checked_at: now_unix_ms(),
            desktop_runtime: true,
            active_recording: true,
            device_available: true,
            device_name: None,
            config_available: true,
            sample_rate: None,
            channels: None,
            permission_granted: Some(true),
            input_signal_detected: Some(snapshot.peak_level > MUTED_THRESHOLD),
            peak_level: Some(snapshot.peak_level),
            muted: Some(snapshot.muted),
            error_code: snapshot.error_code,
            error_message: snapshot.error_message,
            notes: vec!["当前正在录音或后处理，已直接复用当前会话状态。".to_string()],
        });
    }

    let host = cpal::default_host();
    let device = match host.default_input_device() {
        Some(device) => device,
        None => {
            return Ok(build_diagnostics_from_error(
                false,
                None,
                None,
                None,
                RecorderErrorState {
                    code: "RECORDING_DEVICE_UNAVAILABLE".to_string(),
                    message: "未找到默认麦克风设备".to_string(),
                },
                vec!["请确认系统已连接并启用至少一个输入设备。".to_string()],
            ));
        }
    };

    let device_name = device.name().ok();
    let supported_config = match device.default_input_config() {
        Ok(config) => config,
        Err(error) => {
            return Ok(build_diagnostics_from_error(
                false,
                device_name,
                None,
                None,
                map_config_error(&error),
                vec!["已检测到默认设备，但无法读取默认输入配置。".to_string()],
            ));
        }
    };

    match probe_input_signal(&device, &supported_config) {
        Ok((peak_level, muted)) => Ok(RecorderDiagnosticsData {
            checked_at: now_unix_ms(),
            desktop_runtime: true,
            active_recording: false,
            device_available: true,
            device_name,
            config_available: true,
            sample_rate: Some(supported_config.sample_rate().0),
            channels: Some(supported_config.channels()),
            permission_granted: Some(true),
            input_signal_detected: Some(!muted),
            peak_level: Some(peak_level),
            muted: Some(muted),
            error_code: None,
            error_message: None,
            notes: if muted {
                vec!["麦克风可访问，但本次 350ms 探测窗口内没有检测到明显输入信号。".to_string()]
            } else {
                vec!["麦克风可访问，且已检测到输入信号。".to_string()]
            },
        }),
        Err(error) => Ok(build_diagnostics_from_error(
            false,
            device_name,
            Some(supported_config.sample_rate().0),
            Some(supported_config.channels()),
            error,
            vec!["已检测到默认设备和输入配置，但探测输入流时失败。".to_string()],
        )),
    }
}

pub fn cleanup_recorder(app: &AppHandle) -> Result<(), String> {
    let recorder = app.state::<RecorderManager>();
    recorder.inner().cleanup(app)
}

#[cfg(test)]
mod tests {
    use super::{
        bytes_to_gb, join_transcript_segments, normalize_u16_sample, now_unix_ms,
        LevelAccumulator, RecorderTranscriptSegment,
    };

    #[test]
    fn normalize_u16_sample_maps_midpoint_to_zero() {
        assert!(normalize_u16_sample(u16::MAX / 2).abs() < 0.001);
    }

    #[test]
    fn normalize_u16_sample_clamps_range() {
        let zero = normalize_u16_sample(0);
        assert!((zero - (-1.0_f32)).abs() < 0.001, "expected -1, got {}", zero);
        let max = normalize_u16_sample(u16::MAX);
        assert!((max - 1.0_f32).abs() < 0.001, "expected 1, got {}", max);
    }

    #[test]
    fn bytes_to_gb_uses_binary_units() {
        let value = bytes_to_gb(1024 * 1024 * 1024);
        assert!((value - 1.0).abs() < f64::EPSILON);
    }

    #[test]
    fn bytes_to_gb_zero_returns_zero() {
        assert!(bytes_to_gb(0).abs() < f64::EPSILON);
    }

    #[test]
    fn join_transcript_segments_skips_empty_lines() {
        let text = join_transcript_segments(&[
            RecorderTranscriptSegment {
                id: "a".to_string(),
                sequence: 0,
                start_ms: 0,
                end_ms: 1000,
                text: "  第一段  ".to_string(),
                is_final: false,
            },
            RecorderTranscriptSegment {
                id: "b".to_string(),
                sequence: 1,
                start_ms: 1000,
                end_ms: 2000,
                text: "".to_string(),
                is_final: false,
            },
            RecorderTranscriptSegment {
                id: "c".to_string(),
                sequence: 2,
                start_ms: 2000,
                end_ms: 3000,
                text: "第二段".to_string(),
                is_final: true,
            },
        ]);
        assert_eq!(text, "第一段\n第二段");
    }

    #[test]
    fn now_unix_ms_is_recent() {
        let now = now_unix_ms();
        // Should be within year 2025-2030 (reasonable range)
        assert!(now > 1_700_000_000_000, "timestamp too small: {}", now);
        assert!(now < 2_000_000_000_000, "timestamp too large: {}", now);
    }

    #[test]
    fn level_accumulator_starts_empty() {
        let mut acc = LevelAccumulator::new();
        let (rms, peak, muted) = acc.reset_and_measure();
        assert!((rms - 0.0).abs() < f64::EPSILON as f32);
        assert!((peak - 0.0).abs() < f64::EPSILON as f32);
        assert!(muted);
    }

    #[test]
    fn level_accumulator_tracks_peak() {
        let mut acc = LevelAccumulator::new();
        acc.push(0.5);
        acc.push(-0.8);
        acc.push(0.3);
        let (rms, peak, muted) = acc.reset_and_measure();
        assert!((peak - 0.8).abs() < 0.001, "expected peak 0.8, got {}", peak);
        assert!(!muted, "should not be muted with peak 0.8");
        // RMS of [0.5, -0.8, 0.3]: sum_sq = 0.25 + 0.64 + 0.09 = 0.98, rms = sqrt(0.98/3) ≈ 0.5715
        let expected_rms = (0.98_f64 / 3.0_f64).sqrt() as f32;
        assert!((rms - expected_rms).abs() < 0.001, "expected rms {}, got {}", expected_rms, rms);
    }

    #[test]
    fn level_accumulator_muted_below_threshold() {
        let mut acc = LevelAccumulator::new();
        acc.push(0.0001);
        let (_, _, muted) = acc.reset_and_measure();
        assert!(muted);
    }

    #[test]
    fn stream_error_maps_permission_denied() {
        let error = super::map_stream_runtime_error("permission denied");
        assert_eq!(error.code, "RECORDING_PERMISSION_DENIED");
    }

    #[test]
    fn stream_error_maps_device_unavailable() {
        let error = super::map_stream_runtime_error("device not found");
        assert_eq!(error.code, "RECORDING_DEVICE_UNAVAILABLE");
    }

    #[test]
    fn stream_error_falls_back_to_internal() {
        let error = super::map_stream_runtime_error("unknown foo");
        assert_eq!(error.code, "INTERNAL_ERROR");
    }

    #[cfg(feature = "local-transcription")]
    #[test]
    fn linear_resample_downsamples_without_empty_output() {
        let samples = vec![0.0_f32, 0.5, 1.0, 0.5, 0.0, -0.5, -1.0, -0.5];
        let output = super::resample_audio_linear(&samples, 48_000, 16_000);
        assert!(!output.is_empty());
        assert!(output.len() < samples.len());
    }

    #[cfg(feature = "local-transcription")]
    #[test]
    fn linear_resample_preserves_range() {
        let samples = vec![-1.0_f32, 0.0, 1.0];
        let output = super::resample_audio_linear(&samples, 48_000, 16_000);
        for sample in &output {
            assert!(*sample >= -1.0 && *sample <= 1.0, "sample {} out of range", sample);
        }
    }
}
