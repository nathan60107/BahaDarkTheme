# 巴哈姆特深色主題

巴哈姆特全站（哈啦區、首頁、小屋、GNN、動畫瘋、公會…）的深色主題，支援自訂與隨機背景圖片。本專案為 userscript，主要原始碼為本 repo 的 `main.js`。

本腳本延續 [hbl917070（深海異音）](https://home.gamer.com.tw/hbl917070) 的「css-巴哈姆特深色主題」，經原作者同意後合併兩個原始腳本並繼續維護。感謝原作者多年來的維護。
- 原作說明：https://home.gamer.com.tw/artwork.php?sn=2803391
- 原腳本：[css-巴哈姆特深色主題](https://greasyfork.org/zh-TW/scripts/368415)、[css-巴哈姆特深色主題 - 首頁、登入畫面](https://greasyfork.org/zh-TW/scripts/368417)

**安裝**
1. 安裝使用者腳本管理器，例如 [Tampermonkey](https://www.tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/)。
2. 前往 Greasy Fork 安裝本腳本：（發布後補上）

從 Greasy Fork 安裝後，腳本管理器會自動更新到最新版本。除非要參與開發，否則不需要從本 repo 手動安裝。

若原本有安裝原作者的兩個腳本，請先停用或移除，避免重複套用樣式。原腳本的背景圖片設定不會自動搬過來，需要在本腳本的設定視窗重新填入。

**與原腳本的差異**
- **兩個腳本合而為一**：只需要安裝一個腳本，哈啦區與其他頁面的背景圖片仍可分開設定。
- **範圍擴大到整個巴哈姆特**：原腳本只處理哈啦區、首頁與登入畫面，現在小屋、GNN、動畫瘋、公會、商城等 `*.gamer.com.tw` 頁面都套用相同的配色，原腳本跳過的發文、編輯創作頁面也會套用。例外是活動專題頁（`prj.gamer.com.tw`）與哈啦區的版務專用頁面。
- **尊重小屋自訂背景**：小屋主人有設定背景圖片時顯示小屋主人的圖片（一樣疊上背景遮罩），沒有設定才使用本腳本的背景圖片。
- **發文預覽維持原樣**：哈啦區與小屋的發文頁有「一般 / 闇黑」預覽開關，切到「一般」時編輯器與預覽維持網站原本的淺色，切到「闇黑」才套用深色，方便確認文章在兩種模式下的樣子。
- **設定不必改程式碼**：原腳本的背景遮罩、擴充 CSS 必須修改程式碼開頭的變數，腳本更新時會被覆蓋。本腳本所有設定都在設定視窗中修改，更新後仍會保留。
- **補上改版後變回淺色的區塊**：例如改版後的巴哈首頁、哈啦區首頁、NOW! 哈啦板聊天室等。配色沿用原腳本的風格（半透明黑底、白色細框、淺藍色連結），不使用網站內建的闇黑模式。
- **背景圖片處理改善**：第一次使用新圖片時直接顯示原圖，同時在背景調整成 16:9 後快取，下次載入就使用快取；儲存設定時會先檢查圖片網址能否載入。圖床不支援跨網域讀取（CORS）時無法快取，會直接使用原圖，建議使用 imgur 等支援 CORS 的圖床。

**設定**
點選腳本管理器選單（Tampermonkey 圖示 → 巴哈姆特深色主題 → 設定）開啟設定視窗：
- **哈啦區背景圖片 / 其他頁面背景圖片**：一行一個圖片網址，有多張時每次載入頁面會隨機挑一張；留空則不使用背景圖片。預設為原作者使用的背景圖。
- **背景遮罩**：疊在背景圖片上面的漸層（CSS `background-image` 的值），用來讓文字更容易閱讀。
- **功能**：簡化文章連結（讓已讀文章變色）、置頂分隔線、格式化文章顏色按鈕、反轉文章內自訂顏色、取消圖片延遲載入、快速回覆框輸入時改為白底，皆可個別開關。
- **自訂 CSS**：原腳本的「擴充CSS」，會套用在所有支援的頁面。

按「儲存並重新整理」後生效。

**注意事項**
- 請關閉巴哈姆特網站內建的「闇黑模式」（個人選單 → 闇黑模式）。本腳本以網站的淺色版面為基礎調整，同時開啟可能會有部分顏色不一致。
- 若同時使用 Dark Reader 等會改變網頁顏色的擴充功能，請對巴哈姆特停用，避免兩者互相干擾（例如背景圖片消失）。
- 本腳本依賴巴哈姆特的頁面結構，網站改版後部分區塊可能會恢復成淺色，遇到問題歡迎回報。

**安裝型別套件（編輯器提示用）**
若想在 VS Code 等編輯器中取得較好的型別提示與 IntelliSense，可在專案根目錄執行以下指令安裝型別定義：

```bash
npm install
```

**快速開發流程（Chrome + Tampermonkey）**
1. 確認腳本原始碼為本 repo 的 `main.js`（Windows 範例路徑：`C:\path\to\BahaDarkTheme\main.js`）。
2. 開啟 Chrome，若尚未安裝 Tampermonkey 請先安裝。
3. 允許 Tampermonkey 存取本機檔案：開啟 `chrome://extensions/`，找到 Tampermonkey，點選「詳細資料」，開啟「允許存取檔案網址」。
4. 在 Tampermonkey 新增腳本（控制台 → 新增腳本），貼上下方的 header，並將 `@require` 的本機路徑改為你自己的絕對路徑。
5. 儲存腳本。由於 `@require` 指向 `file:///` 網址，每次載入目標頁面時 Tampermonkey 都會從磁碟讀取 `main.js`，因此在外部修改檔案後重新整理巴哈姆特頁面即可看到變更。

**Userscript header（貼到 Tampermonkey，並將 `file:///...` 改為你自己的絕對路徑）**

```js
// ==UserScript==
// @name         巴哈姆特深色主題
// @description  巴哈姆特全站（哈啦區、首頁、小屋、GNN、動畫瘋…）的深色主題，可從選單設定隨機背景圖片。延續 hbl917070（深海異音）的「css-巴哈姆特深色主題」。
// @namespace    nathan60107
// @author       nathan60107(貝果), hbl917070(深海異音)
// @version      0.0.0
// @homepage     https://home.gamer.com.tw/creationCategory.php?owner=nathan60107&c=425332
// @match        https://*.gamer.com.tw/*
// @icon         https://i2.bahamut.com.tw/apple-touch-icon-144x144.png
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @require      file:///C:/path/to/BahaDarkTheme/main.js
// ==/UserScript==
```

**授權**
MIT License，見 [LICENSE.txt](LICENSE.txt)。原作著作權屬於 hbl917070。
