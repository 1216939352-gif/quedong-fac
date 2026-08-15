// 鹊动健康 桌面客户端（Tauri 云壳）
// 本程序本身不含任何业务/后端逻辑：启动后直接加载 tauri.conf.json 中配置的云端 URL。
// 所有业务逻辑（评估、方案、打卡、媒体）都运行在云端，桌面端只是原生窗口外壳。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
