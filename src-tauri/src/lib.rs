pub mod adapters;
pub mod app;
pub mod core;
pub mod db;
pub mod utils;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = db::migrations::get_migrations();

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            app::commands::scan_balances,
            app::commands::get_chain_fee_data,
            app::commands::get_account_nonce_and_balance,
            app::commands::broadcast_raw_tx,
            app::commands::broadcast_solana_tx,
            app::commands::get_solana_recent_blockhash,
            app::commands::get_solana_account_details,
            app::commands::scan_directory_native,
            app::commands::window_minimize,
            app::commands::window_toggle_maximize,
            app::commands::window_close,
            app::commands::schedule_clipboard_clear,
            app::commands::vault_create_token,
            app::commands::vault_verify_token,
            app::commands::vault_derive_credentials,
            app::commands::vault_derive_credentials_batch,
            app::commands::vault_derive_public_only,
            app::commands::vault_derive_public_only_batch,
            app::commands::vault_validate_mnemonic,
            app::commands::vault_repair_mnemonic,
            app::commands::set_air_gapped_mode,
            app::commands::get_air_gapped_mode,
            app::commands::start_recovery_session,
            app::commands::pause_recovery_session,
            app::commands::resume_recovery_session,
            app::commands::cancel_recovery_session,
            app::commands::clear_recovery_session,
            app::commands::get_recovery_session_status,
            app::commands::scan_phrase_on_the_fly,
            app::commands::get_token_prices,
            app::commands::vault_extract_credentials,
            app::commands::vault_session_unlock,
            app::commands::vault_session_unlock_with_pin,
            app::commands::vault_setup_pin_scoped,
            app::commands::vault_session_lock,
            app::commands::vault_session_status,
            app::commands::sign_evm_transfer_scoped,
            app::commands::sign_solana_transfer_scoped,
            app::commands::sign_solana_token_sweep_scoped,
            app::commands::sign_solana_versioned_tx_scoped,
            app::commands::jupiter_get_quote,
            app::commands::jupiter_get_swap_instructions,
            app::commands::derive_solana_ata,
            app::commands::vault_reveal_secret_scoped,
            app::commands::vault_encrypt_with_session,
            app::commands::vault_encrypt_batch_with_session,
            app::commands::vault_calculate_fingerprint,
            app::commands::vault_calculate_fingerprints_batch,
            app::commands::vault_backfill_addresses_scoped,
            app::commands::vault_updater_check,
            app::commands::vault_updater_download_and_install,
            app::commands::ping_rpc_node,
            db::commands::vault_db_init,
            db::commands::vault_db_has_master_password,
            db::commands::vault_db_has_pin,
            db::commands::vault_db_save_master_password,
            db::commands::vault_db_save_pin_vault,
            db::commands::vault_db_verify_master_password,
            db::commands::vault_db_reset_entire_vault,
            db::commands::vault_db_insert_wallets_batch,
            db::commands::vault_db_get_all_wallets,
            db::commands::vault_db_delete_wallet,
            db::commands::vault_db_delete_all_wallets,
            db::commands::vault_db_get_existing_fingerprints,
            db::commands::vault_db_get_existing_addresses,
            db::commands::vault_db_update_wallet_label,
            db::commands::vault_db_update_wallet_addresses,
            db::commands::vault_db_cleanup_duplicate_wallets,
            db::commands::vault_db_clear_swept_balance
        ])
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:plurivex.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
