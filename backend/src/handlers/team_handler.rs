use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse,
    },
    Json,
};
use futures_util::StreamExt;
use serde::Deserialize;
use std::convert::Infallible;
use std::sync::Arc;
use tokio_stream::wrappers::BroadcastStream;

use crate::errors::AppError;
use crate::models::{ApiResponse, CreateTeamDto, TeamListResponse, UpdateTeamDto};
use crate::services::TeamService;

pub struct AppState {
    pub team_service: Arc<TeamService>,
}

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub search: Option<String>,
}

pub async fn health_check(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let firebase_connected = state.team_service.check_health().await;
    let data = serde_json::json!({
        "status": "healthy",
        "firebaseConnected": firebase_connected,
        "timestamp": chrono_or_epoch(),
    });
    Json(ApiResponse::success(data, Some("Hệ thống hoạt động bình thường")))
}

fn chrono_or_epoch() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

pub async fn list_teams(
    State(state): State<Arc<AppState>>,
    Query(query): Query<SearchQuery>,
) -> Result<Json<ApiResponse<TeamListResponse>>, AppError> {
    let list = state.team_service.get_all_teams(query.search).await?;
    Ok(Json(ApiResponse::success(list, None)))
}

pub async fn create_team(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateTeamDto>,
) -> Result<(StatusCode, Json<ApiResponse<crate::models::Team>>), AppError> {
    let team = state.team_service.create_team(payload).await?;
    Ok((
        StatusCode::CREATED,
        Json(ApiResponse::success(team, Some("Tạo đội thành công"))),
    ))
}

pub async fn update_team(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(payload): Json<UpdateTeamDto>,
) -> Result<Json<ApiResponse<crate::models::Team>>, AppError> {
    let team = state.team_service.update_team(&id, payload).await?;
    Ok(Json(ApiResponse::success(team, Some("Cập nhật đội thành công"))))
}

pub async fn delete_team(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let deleted_id = state.team_service.delete_team(&id).await?;
    let data = serde_json::json!({ "id": deleted_id });
    Ok(Json(ApiResponse::success(data, Some("Đã xóa đội thành công"))))
}

pub async fn sse_events(
    State(state): State<Arc<AppState>>,
) -> Sse<impl futures_util::Stream<Item = Result<Event, Infallible>>> {
    let rx = state.team_service.subscribe_events();
    let stream = BroadcastStream::new(rx).filter_map(|msg| async move {
        match msg {
            Ok(event) => match serde_json::to_string(&event) {
                Ok(data) => Some(Ok(Event::default().data(data))),
                Err(_) => None,
            },
            Err(_) => None,
        }
    });

    Sse::new(stream).keep_alive(KeepAlive::default())
}
