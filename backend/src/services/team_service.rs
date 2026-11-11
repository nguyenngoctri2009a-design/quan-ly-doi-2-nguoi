use std::collections::HashSet;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::{broadcast, Mutex};
use tracing::{info, warn};
use uuid::Uuid;

use crate::config::AppConfig;
use crate::errors::AppError;
use crate::firebase::FirebaseClient;
use crate::models::{CreateTeamDto, Team, TeamEvent, TeamListResponse, UpdateTeamDto};

pub struct TeamService {
    config: Arc<AppConfig>,
    firebase: FirebaseClient,
    mutation_lock: Mutex<()>,
    event_tx: broadcast::Sender<TeamEvent>,
}

impl TeamService {
    pub fn new(config: Arc<AppConfig>, firebase: FirebaseClient) -> Self {
        let (event_tx, _) = broadcast::channel(128);
        Self {
            config,
            firebase,
            mutation_lock: Mutex::new(()),
            event_tx,
        }
    }

    pub fn subscribe_events(&self) -> broadcast::Receiver<TeamEvent> {
        self.event_tx.subscribe()
    }

    pub fn event_sender(&self) -> broadcast::Sender<TeamEvent> {
        self.event_tx.clone()
    }

    fn now_millis() -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64
    }

    /// Tìm số thứ tự mặc định nhỏ nhất còn trống ("Đội 1", "Đội 2", ...)
    fn find_next_default_number(existing_teams: &[Team]) -> usize {
        let mut used_numbers = HashSet::new();

        for team in existing_teams {
            // Chỉ xét các đội có format "Đội <số>"
            let trimmed = team.name.trim();
            if let Some(num_str) = trimmed.strip_prefix("Đội ") {
                if let Ok(num) = num_str.trim().parse::<usize>() {
                    if num > 0 {
                        used_numbers.insert(num);
                    }
                }
            } else if let Some(num_str) = trimmed.strip_prefix("Doi ") {
                if let Ok(num) = num_str.trim().parse::<usize>() {
                    if num > 0 {
                        used_numbers.insert(num);
                    }
                }
            }
        }

        let mut candidate = 1;
        while used_numbers.contains(&candidate) {
            candidate += 1;
        }
        candidate
    }

    pub async fn get_all_teams(&self, search: Option<String>) -> Result<TeamListResponse, AppError> {
        let teams_map = self.firebase.get_all_teams().await?;
        let mut teams: Vec<Team> = teams_map.into_values().collect();

        // Sắp xếp theo thời gian tạo tăng dần
        teams.sort_by_key(|t| t.created_at);

        if let Some(query) = search {
            let q = query.trim().to_lowercase();
            if !q.is_empty() {
                teams.retain(|t| {
                    t.name.to_lowercase().contains(&q)
                        || t.member1.to_lowercase().contains(&q)
                        || t.member2.to_lowercase().contains(&q)
                });
            }
        }

        let total_teams = teams.len();
        let total_members = teams
            .iter()
            .map(|t| {
                let m1 = if t.member1.trim().is_empty() { 0 } else { 1 };
                let m2 = if t.member2.trim().is_empty() { 0 } else { 1 };
                m1 + m2
            })
            .sum();

        Ok(TeamListResponse {
            teams,
            total_teams,
            total_members,
        })
    }

    pub async fn create_team(&self, dto: CreateTeamDto) -> Result<Team, AppError> {
        // Khóa mutex đảm bảo nguyên tử khi 2 request cùng tạo đội cùng tích tắc
        let _guard = self.mutation_lock.lock().await;

        let existing_map = self.firebase.get_all_teams().await?;
        let existing_teams: Vec<Team> = existing_map.into_values().collect();

        let (final_name, custom_name) = match dto.name {
            Some(custom) if !custom.trim().is_empty() => {
                let trimmed = custom.trim().to_string();
                if trimmed.chars().count() > self.config.max_name_length {
                    return Err(AppError::Validation(format!(
                        "Tên đội không được vượt quá {} ký tự",
                        self.config.max_name_length
                    )));
                }

                if !self.config.allow_duplicate_custom_names {
                    let is_duplicate = existing_teams
                        .iter()
                        .any(|t| t.name.trim().eq_ignore_ascii_case(&trimmed));
                    if is_duplicate {
                        return Err(AppError::Conflict(format!(
                            "Tên đội '{trimmed}' đã tồn tại trong hệ thống"
                        )));
                    }
                }

                (trimmed, true)
            }
            _ => {
                let next_num = Self::find_next_default_number(&existing_teams);
                (format!("Đội {next_num}"), false)
            }
        };

        let member1 = dto.member1.unwrap_or_default().trim().to_string();
        let member2 = dto.member2.unwrap_or_default().trim().to_string();

        if member1.chars().count() > self.config.max_member_name_length {
            return Err(AppError::Validation(format!(
                "Tên thành viên 1 không được vượt quá {} ký tự",
                self.config.max_member_name_length
            )));
        }

        if member2.chars().count() > self.config.max_member_name_length {
            return Err(AppError::Validation(format!(
                "Tên thành viên 2 không được vượt quá {} ký tự",
                self.config.max_member_name_length
            )));
        }

        let now = Self::now_millis();
        let new_id = Uuid::new_v4().to_string();

        let new_team = Team {
            id: new_id,
            name: final_name,
            member1,
            member2,
            custom_name,
            created_at: now,
            updated_at: now,
        };

        self.firebase.put_team(&new_team).await?;

        // Bắn sự kiện tới SSE stream
        let _ = self.event_tx.send(TeamEvent::TeamCreated(new_team.clone()));

        info!("Created team: {} (ID: {})", new_team.name, new_team.id);
        Ok(new_team)
    }

    pub async fn update_team(&self, id: &str, dto: UpdateTeamDto) -> Result<Team, AppError> {
        let _guard = self.mutation_lock.lock().await;

        let existing = self.firebase.get_team_by_id(id).await?;
        let mut team = match existing {
            Some(t) => t,
            None => {
                return Err(AppError::NotFound(format!(
                    "Không tìm thấy đội với ID '{id}'"
                )));
            }
        };

        let mut changed = false;

        if let Some(new_name) = dto.name {
            let trimmed = new_name.trim().to_string();
            if trimmed.is_empty() {
                return Err(AppError::Validation("Tên đội không được để trống".to_string()));
            }
            if trimmed.chars().count() > self.config.max_name_length {
                return Err(AppError::Validation(format!(
                    "Tên đội không được vượt quá {} ký tự",
                    self.config.max_name_length
                )));
            }

            if trimmed != team.name {
                if !self.config.allow_duplicate_custom_names {
                    let existing_map = self.firebase.get_all_teams().await?;
                    let duplicate = existing_map
                        .values()
                        .any(|t| t.id != team.id && t.name.trim().eq_ignore_ascii_case(&trimmed));
                    if duplicate {
                        return Err(AppError::Conflict(format!(
                            "Tên đội '{trimmed}' đã tồn tại"
                        )));
                    }
                }

                team.name = trimmed;
                team.custom_name = true;
                changed = true;
            }
        }

        if let Some(m1) = dto.member1 {
            let trimmed = m1.trim().to_string();
            if trimmed.chars().count() > self.config.max_member_name_length {
                return Err(AppError::Validation(format!(
                    "Tên thành viên 1 không được vượt quá {} ký tự",
                    self.config.max_member_name_length
                )));
            }
            if trimmed != team.member1 {
                team.member1 = trimmed;
                changed = true;
            }
        }

        if let Some(m2) = dto.member2 {
            let trimmed = m2.trim().to_string();
            if trimmed.chars().count() > self.config.max_member_name_length {
                return Err(AppError::Validation(format!(
                    "Tên thành viên 2 không được vượt quá {} ký tự",
                    self.config.max_member_name_length
                )));
            }
            if trimmed != team.member2 {
                team.member2 = trimmed;
                changed = true;
            }
        }

        if changed {
            team.updated_at = Self::now_millis();
            self.firebase.put_team(&team).await?;
            let _ = self.event_tx.send(TeamEvent::TeamUpdated(team.clone()));
            info!("Updated team: {} (ID: {})", team.name, team.id);
        } else {
            warn!("Update request for team {} had no modifications", team.id);
        }

        Ok(team)
    }

    pub async fn delete_team(&self, id: &str) -> Result<String, AppError> {
        let _guard = self.mutation_lock.lock().await;

        let existing = self.firebase.get_team_by_id(id).await?;
        if existing.is_none() {
            return Err(AppError::NotFound(format!(
                "Không tìm thấy đội với ID '{id}' để xóa"
            )));
        }

        self.firebase.delete_team(id).await?;
        let _ = self.event_tx.send(TeamEvent::TeamDeleted {
            id: id.to_string(),
        });

        info!("Deleted team ID: {}", id);
        Ok(id.to_string())
    }

    pub async fn check_health(&self) -> bool {
        self.firebase.check_health().await
    }
}
