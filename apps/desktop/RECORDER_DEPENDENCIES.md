# Recorder desktop dependency baseline

未来录音 / Whisper 本地转写功能在 Linux 上需要先安装系统音频与原生构建依赖。

默认 `cargo check` 不会编译 `whisper-rs`；要启用本地转写基线时，请使用 `--features local-transcription`。

## Linux audio packages

- Debian / Ubuntu: `sudo apt install libasound2-dev libpulse-dev`

## whisper-rs build toolchain

- `cmake`
- C/C++ toolchain（例如 `build-essential` 或 `clang`）
- `pkg-config`

说明：`whisper-rs` 会在构建时编译其底层 C/C++ 依赖；`cpal` 在 Linux 下通常依赖 ALSA / PulseAudio 开发包。
