use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpListener;
use tracing::{error, info};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod config;
mod errors;
mod firebase;
mod handlers;
mod models;
mod routes;
mod services;

use config::AppConfig;
use firebase::FirebaseClient;
use handlers::AppState;
use routes::create_router;
use services::{FirebaseRealtimeListener, TeamService};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Nạp file .env nếu có
    let _ = dotenvy::dotenv();

    // Khởi tạo logging
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,team_manager_backend=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    info!("=== Khởi động Hệ Thống Quản Lý Đội 2 Người (Axum + Firebase) ===");

    // Nạp cấu hình
    let config = match AppConfig::from_env() {
        Ok(cfg) => cfg,
        Err(err) => {
            error!("Lỗi cấu hình: {err}");
            std::process::exit(1);
        }
    };

    let config_arc = Arc::new(config.clone());

    // Khởi tạo Firebase client & Team service
    let firebase_client = FirebaseClient::new(&config);
    let team_service = Arc::new(TeamService::new(config_arc.clone(), firebase_client));

    // Kích hoạt background listener đón sự kiện realtime từ Firebase RTDB
    let realtime_listener = FirebaseRealtimeListener::new(config_arc.clone(), team_service.event_sender());
    realtime_listener.start();

    // Shared AppState
    let app_state = Arc::new(AppState {
        team_service: team_service.clone(),
    });

    // Tạo Axum Router
    let app = create_router(app_state, &config);

    // Bind cổng mạng
    let addr_str = format!("{}:{}", config.host, config.port);
    let listener = match TcpListener::bind(&addr_str).await {
        Ok(l) => l,
        Err(e) => {
            error!("Không thể lắng nghe trên {addr_str}: {e}");
            return Err(e.into());
        }
    };

    info!("Backend sẵn sàng phục vụ tại: http://{addr_str}");
    info!("Endpoint kiểm tra sức khỏe: http://{addr_str}/api/health");
    info!("Firebase URL: {}", config.firebase_database_url);

    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await?;

    info!("Máy chủ đã dừng an toàn (graceful shutdown)");
    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("Không thể cài đặt Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("Không thể cài đặt SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {
            info!("Nhận tín hiệu Ctrl+C, bắt đầu tắt máy chủ...");
        },
        _ = terminate => {
            info!("Nhận tín hiệu SIGTERM, bắt đầu tắt máy chủ...");
        },
    }
}
