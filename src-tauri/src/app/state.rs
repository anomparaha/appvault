pub struct AppState {
    pub app_name: &'static str,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            app_name: "Plurivex",
        }
    }
}
