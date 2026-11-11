use reqwest::Client;
use std::collections::HashMap;
use std::time::Duration;
use tracing::{error, info};

use crate::config::AppConfig;
use crate::errors::AppError;
use crate::models::Team;

#[derive(Clone)]
pub struct FirebaseClient {
    client: Client,
    base_url: String,
    secret: Option<String>,
}

impl FirebaseClient {
    pub fn new(config: &AppConfig) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(10))
            .pool_idle_timeout(Duration::from_secs(90))
            .pool_max_idle_per_host(10)
            .build()
            .expect("Failed to build Reqwest client for Firebase");

        Self {
            client,
            base_url: config.firebase_database_url.clone(),
            secret: config.firebase_database_secret.clone(),
        }
    }

    fn build_url(&self, path: &str) -> String {
        let clean_path = path.trim_start_matches('/');
        let base = format!("{}/{clean_path}.json", self.base_url);
        if let Some(secret) = &self.secret {
            format!("{base}?auth={secret}")
        } else {
            base
        }
    }

    #[allow(dead_code)]
    pub fn streaming_url(&self, path: &str) -> String {
        self.build_url(path)
    }

    pub async fn get_all_teams(&self) -> Result<HashMap<String, Team>, AppError> {
        let url = self.build_url("teams");
        let resp = self.client.get(&url).send().await.map_err(|e| {
            error!("Firebase GET error: {e}");
            AppError::Firebase(format!("Không thể kết nối đến Firebase: {e}"))
        })?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            error!("Firebase returned error status {status}: {body}");
            return Err(AppError::Firebase(format!("Firebase trả về lỗi {status}: {body}")));
        }

        let teams_map: Option<HashMap<String, Team>> = resp.json().await.map_err(|e| {
            error!("Failed to parse Firebase teams JSON: {e}");
            AppError::Firebase(format!("Dữ liệu từ Firebase không đúng định dạng: {e}"))
        })?;

        Ok(teams_map.unwrap_or_default())
    }

    pub async fn get_team_by_id(&self, id: &str) -> Result<Option<Team>, AppError> {
        let path = format!("teams/{id}");
        let url = self.build_url(&path);

        let resp = self.client.get(&url).send().await.map_err(|e| {
            error!("Firebase GET team error: {e}");
            AppError::Firebase(format!("Không thể kết nối đến Firebase: {e}"))
        })?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            error!("Firebase returned error status {status}: {body}");
            return Err(AppError::Firebase(format!("Firebase trả về lỗi {status}: {body}")));
        }

        let team: Option<Team> = resp.json().await.map_err(|e| {
            error!("Failed to parse team JSON: {e}");
            AppError::Firebase(format!("Không thể đọc thông tin đội: {e}"))
        })?;

        Ok(team)
    }

    pub async fn put_team(&self, team: &Team) -> Result<(), AppError> {
        let path = format!("teams/{}", team.id);
        let url = self.build_url(&path);

        let resp = self.client.put(&url).json(team).send().await.map_err(|e| {
            error!("Firebase PUT team error: {e}");
            AppError::Firebase(format!("Lỗi khi lưu đội vào Firebase: {e}"))
        })?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            error!("Firebase PUT error status {status}: {body}");
            return Err(AppError::Firebase(format!("Firebase từ chối lưu đội ({status}): {body}")));
        }

        info!("Successfully saved team {} to Firebase", team.id);
        Ok(())
    }

    pub async fn delete_team(&self, id: &str) -> Result<(), AppError> {
        let path = format!("teams/{id}");
        let url = self.build_url(&path);

        let resp = self.client.delete(&url).send().await.map_err(|e| {
            error!("Firebase DELETE team error: {e}");
            AppError::Firebase(format!("Lỗi khi xóa đội trên Firebase: {e}"))
        })?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            error!("Firebase DELETE error status {status}: {body}");
            return Err(AppError::Firebase(format!("Firebase từ chối xóa đội ({status}): {body}")));
        }

        info!("Successfully deleted team {} from Firebase", id);
        Ok(())
    }

    pub async fn check_health(&self) -> bool {
        let url = self.build_url(".info/connected");
        match self.client.get(&url).send().await {
            Ok(resp) => resp.status().is_success() || resp.status().as_u16() == 401 || resp.status().as_u16() == 403,
            Err(_) => false,
        }
    }
}
