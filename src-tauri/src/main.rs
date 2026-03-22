#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::env;

fn main() {
    // Check for .imr file passed as CLI argument (file association launch)
    let args: Vec<String> = env::args().collect();
    for arg in &args {
        if arg.ends_with(".imr") {
            // Store it for the app to pick up after startup
            // The single-instance plugin + deep-link handler will process it
            println!("[main] .imr file argument: {}", arg);
        }
    }

    interview_manager_lib::run();
}
