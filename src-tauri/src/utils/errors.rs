use serde::Serialize;

#[derive(Debug, Serialize)]
pub enum AppError {
    NotFound(String),
    RpcError(String),
    DatabaseError(String),
    ExecutionError(String),
    ValidationError(String),
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AppError::NotFound(msg) => write!(f, "Not Found: {}", msg),
            AppError::RpcError(msg) => write!(f, "RPC Error: {}", msg),
            AppError::DatabaseError(msg) => write!(f, "Database Error: {}", msg),
            AppError::ExecutionError(msg) => write!(f, "Execution Error: {}", msg),
            AppError::ValidationError(msg) => write!(f, "Validation Error: {}", msg),
        }
    }
}

impl std::error::Error for AppError {}

pub type AppResult<T> = Result<T, AppError>;
