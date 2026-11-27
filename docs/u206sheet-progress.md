# u206sheet 審查修正進度

2026-11-27（台灣時間）；沿用 `content/u206-sheet` 及所有既有未提交變更。

- 來源：Console `tasks/ybs-newsite-20261123/night/review-u206sheet-reply.md`；無 P0/P1，一項 P2：D12 錯標題仍製圖。
- P2 已修正：`makeChart` 建立圖表前，同時比對任務標題及已套用篩選的組別／場次；不符時回傳核對提示，沿用原有失效處理清除舊圖與分析答案。
- 已新增模型、模擬 DOM 與離線瀏覽器回歸：錯組別／場次／空標題、任務標題與實際篩選不符，須清除舊圖、分析答案且不得顯示 figure／圓餅／圖例；訂正後可製圖，原有直接注入錯標題及過期圖拒絕檢查保留。
- 修正前 D12 模型與 DOM 共2項失敗；修正後專用26 pass / 0 fail，相關回歸150 pass / 0 fail，CJS分別14 pass / 0 fail、2 pass / 0 fail，均 exit0。所有測試包持有共用排他 flock；未放寬斷言。
- 瀏覽器 D12 嘗試0 pass / 1 fail（exit1）：before hook 出現 `listen EPERM: operation not permitted 127.0.0.1`，尚未執行顯示斷言。`node --check`、腳本 `bash -n` 及 `git diff --check` 均 exit0。
- 本輪未重跑全站；原輪瀏覽器／loopback 及缺少 `YBS_WORKER_SOURCE` 的驗收限制不視為通過。未查找私有 Worker，無 Emulator 或 Rules 變更。
- P3 分類測試建議不屬本次 P0～P2 修正範圍，維持現況。
- 不提交、推送、部署、連外、讀 secret、改 Rules 或操作正式資料。
- 指定 Console `tasks/ybs-newsite-20261123/night/` 超出沙箱可寫範圍；本輪 PR 文件及單支補跑腳本暫存可寫的 `tasks/ybs-u206-sheet-20261127/night/`，交 Console 搬放指定位置。
- 續作入口：`/home/teacher/projects/console/tasks/ybs-u206-sheet-20261127/night/u206sheet-pr.md`、同目錄 `u206sheet-console-check.sh`；實測日誌在該任務的 `evidence/review-fix/`。原 `pr.md`、`test-results.md` 同步加上本輪結果並保留首輪歷史。
- 未完成驗收：Console 補跑瀏覽器／360px／鍵盤與視覺／對比，教師人工四關兩組25分鐘及預覽核准；本輪不執行移植或上線。
