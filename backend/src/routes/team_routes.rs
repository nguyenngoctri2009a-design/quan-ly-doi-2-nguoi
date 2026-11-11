use axum::{
    routing::{get, put},
    Router,
};
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};

use crate::config::AppConfig;
use crate::handlers::{
    create_team, delete_team, health_check, list_teams, sse_events, update_team, AppState,
};

pub fn create_router(state: Arc<AppState>, config: &AppConfig) -> Router {
    let cors = if config.cors_allowed_origins.contains(&"*".to_string()) {
        CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(Any)
            .allow_headers(Any)
    } else {
        let origins: Vec<_> = config
            .cors_allowed_origins
            .iter()
            .filter_map(|s| s.parse().ok())
            .collect();
        CorsLayer::new()
            .allow_origin(origins)
            .allow_methods(Any)
            .allow_headers(Any)
    };

    Router::new()
        .route("/api/health", get(health_check))
        .route("/api/teams", get(list_teams).post(create_team))
        .route("/api/teams/{id}", put(update_team).delete(delete_team))
        .route("/api/teams/events", get(sse_events))
        .layer(cors)
        .with_state(state)
}
