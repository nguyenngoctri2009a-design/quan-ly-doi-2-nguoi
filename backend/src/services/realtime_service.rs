use futures_util::StreamExt;
use reqwest::Client;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::broadcast;
use tracing::{debug, error, info, warn};

use crate::config::AppConfig;
use crate::models::{Team, TeamEvent};

pub struct FirebaseRealtimeListener {
    config: Arc<AppConfig>,
    event_tx: broadcast::Sender<TeamEvent>,
}

impl FirebaseRealtimeListener {
    pub fn new(config: Arc<AppConfig>, event_tx: broadcast::Sender<TeamEvent>) -> Self {
        Self { config, event_tx }
    }

    pub fn start(self) {
        tokio::spawn(async move {
            let client = Client::builder()
                .tcp_keepalive(Duration::from_secs(30))
                .build()
                .unwrap_or_default();

            let raw_url = format!("{}/teams.json", self.config.firebase_database_url);
            let stream_url = if let Some(secret) = &self.config.firebase_database_secret {
                format!("{raw_url}?auth={secret}")
            } else {
                raw_url
            };

            loop {
                info!("Connecting to Firebase RTDB EventStream: {stream_url}");
                match client
                    .get(&stream_url)
                    .header("Accept", "text/event-stream")
                    .send()
                    .await
                {
                    Ok(resp) if resp.status().is_success() => {
                        info!("Connected to Firebase RTDB EventStream successfully");
                        let mut stream = resp.bytes_stream();
                        let mut buffer = String::new();

                        while let Some(chunk_result) = stream.next().await {
                            match chunk_result {
                                Ok(bytes) => {
                                    if let Ok(text) = std::str::from_utf8(&bytes) {
                                        buffer.push_str(text);
                                        while let Some(pos) = buffer.find("\n\n") {
                                            let message = buffer[..pos].to_string();
                                            buffer = buffer[pos + 2..].to_string();
                                            Self::process_sse_message(&message, &self.event_tx);
                                        }
                                    }
                                }
                                Err(err) => {
                                    warn!("Firebase RTDB EventStream error chunk: {err}");
                                    break;
                                }
                            }
                        }
                    }
                    Ok(resp) => {
                        let status = resp.status();
                        warn!("Firebase RTDB EventStream returned status {status}, retrying in 5s...");
                        tokio::time::sleep(Duration::from_secs(5)).await;
                    }
                    Err(err) => {
                        error!("Failed to connect to Firebase RTDB stream: {err}. Retrying in 5s...");
                        tokio::time::sleep(Duration::from_secs(5)).await;
                    }
                }
            }
        });
    }

    fn process_sse_message(raw_msg: &str, tx: &broadcast::Sender<TeamEvent>) {
        let mut event_type = "";
        let mut event_data = "";

        for line in raw_msg.lines() {
            if let Some(stripped) = line.strip_prefix("event: ") {
                event_type = stripped.trim();
            } else if let Some(stripped) = line.strip_prefix("data: ") {
                event_data = stripped.trim();
            }
        }

        if event_type == "put" || event_type == "patch" {
            // Cố gắng deserialize data thành Team hoặc map Teams
            if let Ok(payload) = serde_json::from_str::<serde_json::Value>(event_data) {
                if let Some(path) = payload.get("path").and_then(|p| p.as_str()) {
                    let data = payload.get("data");
                    debug!("Firebase stream update on path: {path}");

                    if path == "/" {
                        if let Some(map) = data.and_then(|d| d.as_object()) {
                            let mut teams = Vec::new();
                            for val in map.values() {
                                if let Ok(t) = serde_json::from_value::<Team>(val.clone()) {
                                    teams.push(t);
                                }
                            }
                            let _ = tx.send(TeamEvent::SyncAll(teams));
                        }
                    } else if let Some(id) = path.strip_prefix('/') {
                        if data.is_none() || data.unwrap().is_null() {
                            let _ = tx.send(TeamEvent::TeamDeleted { id: id.to_string() });
                        } else if let Some(team_val) = data {
                            if let Ok(t) = serde_json::from_value::<Team>(team_val.clone()) {
                                let _ = tx.send(TeamEvent::TeamUpdated(t));
                            }
                        }
                    }
                }
            }
        }
    }
}
