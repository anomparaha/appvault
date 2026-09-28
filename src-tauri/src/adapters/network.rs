use std::time::Duration;

pub type NetworkAccessGate = dyn Fn() -> Result<(), String> + Send + Sync;

/// Reqwest errors may include the full request URL, including provider API keys
/// passed in query strings. Strip it before surfacing or logging the error.
pub fn redact_reqwest_error(error: reqwest::Error) -> String {
    error.without_url().to_string()
}

/// Race a network future against the app-level network gate. Polling lets Safe Mode
/// activation or session expiry drop an in-flight request rather than wait for timeout.
pub async fn await_with_gate<F, T>(
    future: F,
    network_gate: &NetworkAccessGate,
) -> Result<T, String>
where
    F: std::future::Future<Output = Result<T, String>>,
{
    tokio::pin!(future);
    loop {
        network_gate()?;
        tokio::select! {
            result = &mut future => {
                network_gate()?;
                return result;
            }
            _ = tokio::time::sleep(Duration::from_millis(100)) => {}
        }
    }
}

/// Read an HTTP response incrementally, checking the gate between chunks and
/// refusing bodies larger than the caller's explicit limit.
pub async fn read_response_limited(
    response: &mut reqwest::Response,
    max_bytes: usize,
    network_gate: &NetworkAccessGate,
) -> Result<Vec<u8>, String> {
    if response
        .content_length()
        .is_some_and(|length| length > max_bytes as u64)
    {
        return Err(format!("HTTP response exceeds the {max_bytes}-byte limit"));
    }

    let mut body = Vec::new();
    loop {
        let next_chunk = await_with_gate(
            async {
                response
                    .chunk()
                    .await
                    .map_err(|error| format!("Failed to read HTTP response body: {}", redact_reqwest_error(error)))
            },
            network_gate,
        )
        .await?;
        let Some(chunk) = next_chunk else { break };
        if body.len().saturating_add(chunk.len()) > max_bytes {
            return Err(format!("HTTP response exceeds the {max_bytes}-byte limit"));
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}
