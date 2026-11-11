use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use std::fmt;

use crate::models::ApiResponse;

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub enum AppError {
    NotFound(String),
    Validation(String),
    Conflict(String),
    Firebase(String),
    Internal(String),
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AppError::NotFound(msg) => write!(f, "Không tìm thấy: {msg}"),
            AppError::Validation(msg) => write!(f, "Dữ liệu không hợp lệ: {msg}"),
            AppError::Conflict(msg) => write!(f, "Xung đột: {msg}"),
            AppError::Firebase(msg) => write!(f, "Lỗi Firebase: {msg}"),
            AppError::Internal(msg) => write!(f, "Lỗi hệ thống: {msg}"),
        }
    }
}

impl std::error::Error for AppError {}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code, message) = match &self {
            AppError::NotFound(msg) => (StatusCode::NOT_FOUND, "NOT_FOUND", msg.clone()),
            AppError::Validation(msg) => (StatusCode::BAD_REQUEST, "VALIDATION_ERROR", msg.clone()),
            AppError::Conflict(msg) => (StatusCode::CONFLICT, "CONFLICT", msg.clone()),
            AppError::Firebase(msg) => (StatusCode::BAD_GATEWAY, "FIREBASE_ERROR", msg.clone()),
            AppError::Internal(msg) => (StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", msg.clone()),
        };

        let body: ApiResponse<()> = ApiResponse::error(code, &message);
        (status, Json(body)).into_response()
    }
}
