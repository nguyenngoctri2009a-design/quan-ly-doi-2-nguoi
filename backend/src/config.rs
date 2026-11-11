use std::env;

#[derive(Clone, Debug)]
pub struct AppConfig {
    pub host: String,
    pub port: u16,
    pub firebase_database_url: String,
    pub firebase_database_secret: Option<String>,
    pub cors_allowed_origins: Vec<String>,
    pub allow_duplicate_custom_names: bool,
    pub max_name_length: usize,
    pub max_member_name_length: usize,
}

impl AppConfig {
    pub fn from_env() -> Result<Self, String> {
        let host = env::var("HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
        let port = env::var("PORT")
            .unwrap_or_else(|_| "3000".to_string())
            .parse::<u16>()
            .map_err(|e| format!("Invalid PORT: {e}"))?;

        let raw_firebase_url = env::var("FIREBASE_DATABASE_URL")
            .unwrap_or_else(|_| "https://mechamay-7cbce-default-rtdb.asia-southeast1.firebasedatabase.app".to_string());
        let firebase_database_url = raw_firebase_url.trim_end_matches('/').to_string();

        let firebase_database_secret = env::var("FIREBASE_DATABASE_SECRET").ok().filter(|s| !s.trim().is_empty());

        let raw_origins = env::var("CORS_ALLOWED_ORIGINS").unwrap_or_else(|_| "*".to_string());
        let cors_allowed_origins = raw_origins
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();

        let allow_duplicate_custom_names = env::var("ALLOW_DUPLICATE_CUSTOM_NAMES")
            .map(|v| v.trim().eq_ignore_ascii_case("true"))
            .unwrap_or(true);

        let max_name_length = env::var("MAX_NAME_LENGTH")
            .unwrap_or_else(|_| "50".to_string())
            .parse::<usize>()
            .unwrap_or(50);

        let max_member_name_length = env::var("MAX_MEMBER_NAME_LENGTH")
            .unwrap_or_else(|_| "50".to_string())
            .parse::<usize>()
            .unwrap_or(50);

        Ok(Self {
            host,
            port,
            firebase_database_url,
            firebase_database_secret,
            cors_allowed_origins,
            allow_duplicate_custom_names,
            max_name_length,
            max_member_name_length,
        })
    }
}
