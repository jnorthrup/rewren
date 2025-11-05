#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CouchDbConfig {
    pub url: String,
    pub database: String,
    pub username: String,
    pub password: String,
}

impl CouchDbConfig {
    pub fn new(url: impl Into<String>, database: impl Into<String>) -> Self {
        Self {
            url: url.into(),
            database: database.into(),
            username: "admin".into(),
            password: "password".into(),
        }
    }

    pub fn with_credentials(
        mut self,
        username: impl Into<String>,
        password: impl Into<String>,
    ) -> Self {
        self.username = username.into();
        self.password = password.into();
        self
    }

    pub fn auth_tuple(&self) -> (&str, &str) {
        (&self.username, &self.password)
    }
}
