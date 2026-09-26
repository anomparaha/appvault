//! Tauri IPC command registrar for database commands.

/// Appends this module's database commands to an app-command list and builds
/// the single Tauri invoke handler.
#[macro_export]
macro_rules! db_commands {
    ($($app_command:path),* $(,)?) => {
        tauri::generate_handler![
            $($app_command,)*
            $crate::db::commands::vault_db_init,
            $crate::db::commands::vault_db_has_master_password,
            $crate::db::commands::vault_db_has_pin,
            $crate::db::commands::vault_db_save_master_password,
            $crate::db::commands::vault_db_save_pin_vault,
            $crate::db::commands::vault_db_verify_master_password,
            $crate::db::commands::vault_db_reset_entire_vault,
            $crate::db::commands::vault_db_insert_wallets_batch,
            $crate::db::commands::vault_db_get_all_wallets,
            $crate::db::commands::vault_db_delete_wallet,
            $crate::db::commands::vault_db_delete_all_wallets,
            $crate::db::commands::vault_db_get_existing_fingerprints,
            $crate::db::commands::vault_db_get_existing_addresses,
            $crate::db::commands::vault_db_update_wallet_label,
            $crate::db::commands::vault_db_update_wallet_addresses,
            $crate::db::commands::vault_db_cleanup_duplicate_wallets,
            $crate::db::commands::vault_db_clear_swept_balance,
        ]
    };
}
