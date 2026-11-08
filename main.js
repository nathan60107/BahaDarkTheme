// ==UserScript==
// @name         巴哈姆特深色主題
// @description  巴哈姆特全站（哈啦區、首頁、小屋、GNN、動畫瘋…）的深色主題，可從選單設定隨機背景圖片。延續 hbl917070（深海異音）的「css-巴哈姆特深色主題」。
// @namespace    nathan60107
// @author       nathan60107(貝果), hbl917070(深海異音)
// @version      1.0.0
// @homepage     https://home.gamer.com.tw/creationCategory.php?owner=nathan60107&c=425332
// @match        https://*.gamer.com.tw/*
// @icon         https://i2.bahamut.com.tw/apple-touch-icon-144x144.png
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @license      MIT
// @supportURL   https://github.com/nathan60107/BahaDarkTheme/issues
// ==/UserScript==

/**
 * 本腳本延續 hbl917070（深海異音）的兩個腳本，經原作者同意後合併並繼續維護：
 *   - css-巴哈姆特深色主題              https://greasyfork.org/scripts/368415
 *   - css-巴哈姆特深色主題 - 首頁、登入畫面 https://greasyfork.org/scripts/368417
 * 原作說明：https://home.gamer.com.tw/artwork.php?sn=2803391
 *
 * 與原腳本的差異：
 *   - 兩個腳本合而為一。
 *   - 所有設定（背景圖片、背景遮罩、自訂 CSS、功能開關）都改從 Tampermonkey 選單的「設定」
 *     視窗修改並存在腳本儲存空間，不再需要修改程式碼，腳本更新時設定也不會被覆蓋。
 *   - 補上原腳本停止更新後，網站改版造成沒有套用到深色的區塊（見 CSS_FIXES），配色沿用原腳本的風格。
 *   - 範圍擴大到整個 gamer.com.tw（小屋、GNN、動畫瘋、公會…）。小屋主人有設定背景圖片時優先顯示小屋的圖片。
 */

(() => {
  'use strict'

  const LOG_PREFIX = '[巴哈姆特深色主題]'
  const url = location.href
  /** 是否為最上層的頁面（腳本管理器的沙盒裡 window 是代理物件，不能直接和 window.top 比較，改比較 document） */
  const isTop = (() => {
    try {
      return window.top?.document === document
    } catch {
      return false // 上層是不同網域的頁面
    }
  })()

  //---------------------頁面判斷---------------------//

  /** 不套用深色主題的頁面：版務專用網頁（沒辦法測試）、看不到的 API 頁面、活動專題頁 */
  const EXCLUDED_PREFIXES = [
    'https://forum.gamer.com.tw/gemadmin/',
    'https://api.gamer.com.tw/',
    'https://prj.gamer.com.tw/', // 活動專題頁，每個活動都有自己的設計
  ]
  if (EXCLUDED_PREFIXES.some((p) => url.startsWith(p))) return

  /**
   * 上層頁面的「闇黑模式」預覽開關：
   *   - 哈啦區發文頁（post1.php）：#editorDarkTheme
   *   - 小屋發表創作頁：#previewThemeSwitch
   *   - 哈啦區新版發文頁（/post/）：開關沒有 id，改看編輯器的 .theme-dark
   */
  const parentDocument = (() => {
    if (isTop) return null
    try {
      return window.parent.document
    } catch {
      return null // 不同網域的 iframe 讀不到上層頁面
    }
  })()
  const previewSwitch = /** @type { HTMLInputElement | null } */ (
    parentDocument?.querySelector('#editorDarkTheme, #previewThemeSwitch') ?? null
  )
  const newEditor = parentDocument?.querySelector('.ProseMirror.baha-root') ?? null
  /**
   * 發文預覽（預覽視窗是 iframe）：預覽切到「闇黑模式」時才套用深色，「一般」模式維持網站原本的樣子。
   * 小屋的預覽切換開關時不會重新載入，而是直接在預覽裡加上 / 移除網站的深色 CSS，所以要持續偵測。
   */
  const isPreviewFrame = !!previewSwitch || !!newEditor
  /** 預覽視窗裡只切換 CSS，不執行會修改頁面內容的功能（反轉文字顏色…），否則切回一般模式時無法還原 */
  const disabled = isPreviewFrame

  /**
   * forum：哈啦區（原腳本「css-巴哈姆特深色主題」）
   * home、login：巴哈首頁、登入畫面（原腳本「首頁、登入畫面」）
   * site：其他所有頁面（小屋、GNN、動畫瘋、公會…），原腳本沒有處理
   * @type {'forum' | 'home' | 'login' | 'site'}
   */
  const page = url.startsWith('https://forum.gamer.com.tw')
    ? 'forum'
    : url === 'https://www.gamer.com.tw/' || url.startsWith('https://www.gamer.com.tw/index')
      ? 'home'
      : url.startsWith('https://user.gamer.com.tw/login.php')
        ? 'login'
        : 'site'

  //---------------------設定---------------------//

  const DEFAULT_OVERLAY = 'linear-gradient(90deg, rgba(0, 0, 0, 0.8) 0%, rgba(0, 0, 0, 0.2) 100%)'

  /**
   * @typedef { object } Settings
   * @property { string[] } forumImages 哈啦區的背景圖片網址，多張時每次隨機挑一張
   * @property { string[] } homeImages 哈啦區以外的頁面（首頁、登入畫面、小屋…）的背景圖片網址
   * @property { string } overlay 疊在背景圖片上面的漸層（CSS background-image 的值）
   * @property { string } customCss 自訂 CSS（原腳本的「擴充CSS」）
   * @property { boolean } simplifyLinks 簡化文章列表的超連結，讓「已讀文章」能正確變色
   * @property { boolean } stickyDivider 在置頂文章與一般文章之間加上分隔線
   * @property { boolean } formatButton 在文章右上角加入「格式化文章顏色」按鈕
   * @property { boolean } invertFontColor 反轉文章內自訂的文字顏色、表格底色
   * @property { boolean } eagerImages 取消文章內圖片的延遲載入
   * @property { boolean } fastReplyFix 快速回覆框在輸入時改為白底黑字
   */
  /** @type { Settings } */
  const DEFAULT_SETTINGS = {
    forumImages: ['https://i.imgur.com/zF17VkP.jpg'],
    homeImages: ['https://i.imgur.com/d5fXfwG.jpg'],
    overlay: DEFAULT_OVERLAY,
    customCss: '',
    simplifyLinks: true,
    stickyDivider: true,
    formatButton: true,
    invertFontColor: true,
    eagerImages: true,
    fastReplyFix: true,
  }

  /** @returns { Settings } */
  function loadSettings() {
    const saved = GM_getValue('settings', {})
    return { ...DEFAULT_SETTINGS, ...(saved && typeof saved === 'object' ? saved : {}) }
  }

  /** @param { Settings } s */
  function saveSettings(s) {
    GM_setValue('settings', s)
    // 清掉已經不在清單裡的圖片快取
    const keep = new Set([...s.forumImages, ...s.homeImages])
    const cache = loadImageCache()
    for (const k of Object.keys(cache)) if (!keep.has(k)) delete cache[k]
    GM_setValue('imageCache', cache)
  }

  const settings = loadSettings()

  //---------------------背景圖片---------------------//

  /** @returns { Record<string, string> } 圖片網址 → 處理過的 data URL */
  function loadImageCache() {
    const c = GM_getValue('imageCache', {})
    return c && typeof c === 'object' ? c : {}
  }

  /** @param { Blob } blob @returns { Promise<string> } */
  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(/** @type { string } */ (reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
  }

  /**
   * 下載圖片並轉成 data URL（與原腳本相同，只用一般的請求，圖床需要支援 CORS，例如 imgur）
   * @param { string } src
   * @returns { Promise<string> }
   */
  async function fetchAsDataUrl(src) {
    const res = await fetch(src, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return blobToDataUrl(await res.blob())
  }

  /**
   * 確認圖片網址能不能顯示（用 <img> 載入，不受 CORS 限制）
   * @param { string } src
   * @returns { Promise<void> }
   */
  function checkImageLoads(src) {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('圖片無法載入'))
      img.referrerPolicy = 'no-referrer'
      img.src = src
    })
  }

  /**
   * 把圖片調整成目標長寬比（預設 16:9），圖片靠右對齊，左側空白用圖片左緣的平均顏色填滿。
   * 這樣背景圖片的主體不會被左側的漸層遮罩蓋住。（沿用原腳本的做法）
   * @param { string } dataUrl
   * @returns { Promise<string> }
   */
  function adjustImageAspectRatio(dataUrl, targetWidth = 2560, targetHeight = 1440) {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onerror = () => reject(new Error('圖片格式無法解析'))
      img.onload = () => {
        // 圖片比目標小的話，以原圖大小為準，只調整長寬比
        if (img.width < targetWidth && img.height < targetHeight) {
          const targetRatio = targetWidth / targetHeight
          if (img.width / img.height > targetRatio) {
            targetHeight = img.height
            targetWidth = img.height * targetRatio
          } else {
            targetWidth = img.width
            targetHeight = img.width / targetRatio
          }
        }
        const scaledWidth = img.width * (targetHeight / img.height)
        const offsetX = targetWidth - scaledWidth

        const canvas = document.createElement('canvas')
        canvas.width = targetWidth
        canvas.height = targetHeight
        const ctx = /** @type { CanvasRenderingContext2D } */ (canvas.getContext('2d'))
        ctx.drawImage(img, offsetX, 0, scaledWidth, targetHeight)
        if (offsetX > 0) {
          ctx.fillStyle = averageLeftEdgeColor(img)
          ctx.fillRect(0, 0, offsetX, targetHeight)
        }
        resolve(canvas.toDataURL('image/webp'))
      }
      img.src = dataUrl
    })
  }

  /** @param { HTMLImageElement } img */
  function averageLeftEdgeColor(img) {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = img.height
    const ctx = /** @type { CanvasRenderingContext2D } */ (canvas.getContext('2d'))
    ctx.drawImage(img, 0, 0)
    const data = ctx.getImageData(0, 0, 1, img.height).data
    let r = 0, g = 0, b = 0
    for (let i = 0; i < data.length; i += 4) {
      r += data[i]
      g += data[i + 1]
      b += data[i + 2]
    }
    const n = data.length / 4
    return `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`
  }

  /**
   * 下載並快取圖片
   * @param { string } src
   */
  async function cacheImage(src) {
    const adjusted = await adjustImageAspectRatio(await fetchAsDataUrl(src))
    const cache = loadImageCache()
    cache[src] = adjusted
    GM_setValue('imageCache', cache)
    return adjusted
  }

  const images = page === 'forum' ? settings.forumImages : settings.homeImages
  const currentImage = images.length ? images[Math.floor(Math.random() * images.length)] : ''

  /** 背景 = 漸層遮罩 + 隨機挑選的背景圖片 */
  function backgroundValue() {
    const overlay = settings.overlay.trim() || DEFAULT_OVERLAY
    if (!currentImage) return overlay
    const cached = loadImageCache()[currentImage]
    if (!cached) {
      // 第一次使用這張圖：先直接用原圖網址顯示，背景同時下載處理，下次載入就會用快取。
      // 圖床不支援 CORS 時無法處理，就一直用原圖網址（沒有 16:9 調整）
      cacheImage(currentImage).catch((e) => console.info(LOG_PREFIX, '背景圖片無法快取，直接使用原圖網址', currentImage, e))
    }
    return `${overlay}, url("${cached || currentImage}")`
  }

  //---------------------CSS---------------------//

  /** 哈啦區（原「css-巴哈姆特深色主題」） */
  const CSS_FORUM = `

body {
    background-image: var(--bdt-bg) !important;

    background-attachment: fixed !important;
    background-position: center center !important;
    background-repeat: no-repeat !important;
    background-size: cover !important;
    background-color: rgba(45, 45, 45, 1) !important;
    overflow-y: scroll;
}
/*文字預設的顏色*/
#BH-background {
    color: #fff !important;
}

/*縮圖模式 BETA中*/
.side_gray_box h3 {
    color: #fff !important;
}

/*避免聊天室突然冒出來導致點錯東西*/
#chatRoom:not(.BH-rbox-message) {
    height: 450px;
    margin-bottom: 10px;
}

/*--------------------------------*/

/*快速回文框*/
#post_textarea_1 .form-control {
    background-color: rgba(0, 0, 0, 0) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
}

/*送出按鈕*/
.btn--send {
    background-color: rgba(45, 45, 45, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
    color: #fff !important;
}
.btn--send:hover {
    border: 1px solid #87dfff !important;
}

/*「插入範本」按鈕*/
.c-editor__input .option .toolbar button.add-template_c {
    background-color: rgba(0, 0, 0, 0) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
}
.c-editor__input .option .toolbar button.add-template_c:hover,
.c-editor__input .option .toolbar button.add-template_c.is-active {
    background-color: rgba(0, 0, 0, 0) !important;
    border: 1px solid #87dfff !important;
}

/*「插入範本」 文字顏色*/
.add-template_box .c-section a {
    color: #000 !important;
}

.b-list__filter__latest {
    color: #fff !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
    background-color: rgba(0, 0, 0, 0) !important;
}

.is-active {
    /* border: 1px solid #87dfff !important; */
}

.b-list__head .BH_forum_mainop > span a {
    color: #fff !important;
    background-color: rgba(0, 0, 0, 0) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
}
.now_stop {
    border: 1px solid #87dfff !important;
}

/*--------------------------------*/

/*哈哈姆特通知的顏色 2019-03-26 */
.im_bhtop-user-name {
    color: #87dfff !important;
}
.im_bhtop-message-summary {
    color: #fff !important;
}
#topBarHahamut .im_bhtop-msg-item {
    border: none !important;
    border-top: none !important;
}
/*--------------------------------*/
/*文章列表的 縮圖模式 2019-03-07 */

/*回復數、瀏覽人氣 的數字*/
.b-imglist-wrap .b-imglist-info span,
.b-imglist-wrap .b-imglist-info p {
    color: rgb(255, 255, 255) !important;
}
/*內容顏色*/
.b-imglist-wrap .b-list__brief {
    color: #ffffff !important;
    padding-left: 37px !important;
}
/*滑鼠移入列表的顏色*/
.b-imglist-wrap .b-list__row:hover {
    background: rgba(0, 0, 0, 0.2) !important;
}
/*區分每一筆文章的底線*/
.b-imglist-wrap .b-list-item {
    border-bottom: solid 1px rgba(255, 255, 255, 0.2) !important;
}
/*最後一筆不要加底線*/
.b-imglist-wrap .b-list__row:last-of-type .b-list-item {
    border-bottom: none !important;
}
/*置頂文章的底線*/
.b-imglist-wrap .b-list__row--sticky {
    border-bottom: none !important;
}

/*文章列表的面的文章頁數*/
.b-imglist-wrap .b-list__main__pages a {
    color: #87dfff !important;
}
/*發文者*/
.b-imglist-wrap .b-list__author a {
    color: #87dfff !important;
}

/*--------------------------------*/
/*文章列表上面，切換縮圖模式或清單模式的按鈕*/

.b-list__filter__gp,
.b-list__filter__feature,
.b-list__filter__expert {
    background-color: rgba(45, 45, 45, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
}
.b-list__head .is-active,
.b-list__head .now_stop {
    outline: 1px solid #87dfff !important;
    background-color: rgba(45, 45, 45, 0.4) !important;
}
/*----------*/

/*廣告*/
#ad-native-c {
    width: 0px !important;
    height: 0px !important;
    display: block !important;
    overflow: auto !important;
    pointer-events: none !important;
    opacity: 0 !important;
}

/*----------*/
/*右邊 哈哈姆特 2019-03-08*/

/*上半部*/
#message-scoller_forum {
    background: none !important;
    background-color: rgba(45, 45, 45, 0.4) !important;
}
/*下半部*/
#send_msg_div_forum {
    background: none !important;
    background-color: rgba(45, 45, 45, 0.4) !important;
}

#chatRoom {
    background-color: rgba(0, 0, 0, 0) !important;
}
/*整體框線*/
#chatRoom {
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
}
/*超連結顏色*/
.as-mes-wrapper .msg-log a:link {
    color: #87dfff !important;
}
/*外框顏色*/
.as-mes-wrapper .msg-log {
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
}

/*名字*/
.msg-log-title {
    color: #fff !important;
}

/*時間*/
.msg-log-time {
    color: rgba(250, 190, 255, 0.8) !important;
}
/*文字框*/
.msg-log {
    background-color: rgba(45, 45, 45, 0.4) !important;
    color: #fff !important;
}
/*標題列『廣場聊天室』*/
.bh-b-title {
    background-color: rgba(0, 0, 0, 0) !important;
}
#send_msg_div {
    background-color: rgba(255, 255, 255, 0.75) !important;
}
/*輸入框*/
#message-input__editer_forum {
    background-color: rgba(255, 255, 255, 0) !important;
    color: #fff !important;
}

/*輸入框無文字的狀態。 請勿違反站規，歡迎下載APP聊天*/
.as-mes-wrapper .message-input__editer::placeholder {
    color: rgba(255, 255, 255, 0) !important;
}

/*下面圖示的顏色*/
.message-input__toolbar img {
    -webkit-filter: brightness(2);
    opacity: 1 !important;
}
.message-input__toolbar .mini-input:hover {
    outline: solid 2px #87dfff !important;
}
/*右下角的 送出 按鈕*/
.as-mes-wrapper .btn-send-message {
    background: none !important;
}
/*--------*/

/*版務、文章列表下面的 刪除、回覆刪除、置頂、鎖定、收入精華 ...*/
.managertools {
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
    background: none !important;
    background-color: rgba(45, 45, 45, 0.4) !important;
}
.managertools .btn--sm {
    background: rgba(0, 0, 0, 0.4) !important;
    color: #fff !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
}
.managertools .btn--sm:hover {
    border: 1px solid #87dfff !important;
}

/*版務、刪除選取留言*/
.btn--sm {
    color: #fff !important;
}

/*版務、您有*件文章檢舉待處理 */
#auseNum {
    margin: 0px !important;
    padding: 0px !important;
    position: relative !important;
    height: 60px !important;
}
.FM-master-btn > a {
    background: rgba(0, 0, 0, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
    color: #fff !important;
}
.FM-master-btn > a:hover {
    border: 1px solid #87dfff !important;
}

#auseNum font[style] {
}
#auseNum font {
    margin: 10px 0px !important;
    padding: 5px !important;
    display: inline-block;
    background-color: rgba(0, 0, 0, 0.4) !important;
    color: #fff !important;
}
#auseNum font a font {
    font-weight: 900;
    color: #f36d3c !important;
    background-color: rgba(0, 0, 0, 0) !important;
    margin: 0px !important;
}
#auseNum font a font:hover {
    font-weight: 900;
    color: rgb(172, 41, 172) !important;
    margin: 0px !important;
}

/*2018-10-22 文章列表的廣告*/
.b-list_ad {
    height: 0px !important;
    width: 0px !important;
    border: none !important;
    margin: 0px !important;
    padding: 0px !important;
    overflow: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
    display: block !important;
    position: absolute !important;
}

section.c-section {
}

/*--------------------------------------------------------------*/

/*留言圖片自動放大*/
/* .reply-content img {
transition: all 0.3s;
}

.reply-content:hover img {
transition: all 500ms cubic-bezier(1, 0.09, 1, -0.315);

max-width: 100% !important;
max-height: 500px !important;
} */

/*避免留言變色*/
.c-reply__item:hover {
    background-color: rgba(0, 0, 0, 0) !important;
}

/*--------------------------------------------------------------*/

/*文章列表*/
.b-imglist-wrap .b-imglist-item .b-list__main__title {
    color: #fff;
}
/*「被刪除文章」的顏色*/
.b-imglist-wrap .b-imglist-item.is-del .b-list__main__title {
    color: #fff;
}

.b-list__main__title:hover {
    color: #87dfff !important;
}

.b-list__main__title:visited {
    color: rgb(134, 134, 134) !important;
}

.b-list__page {
    color: #87dfff !important;
    display: inline-block;
    margin: 0 3px;
}
.b-list__page:hover {
    text-decoration: underline !important;
}

/*「滑鼠移入時」的顏色*/
.b-imglist-wrap .b-imglist-item a:hover .b-list__main__title {
    color: #87dfff !important;
}

/*--------------------------------------------------------------*/
/*文章已鎖定*/
.c-article__content span[style="color: #333333"] {
    background-color: rgba(255, 255, 255, 0.6);
}
.c-article__content font[color="#474e56"] {
    background-color: rgba(255, 255, 255, 0.6);
}
/*--------------------------------------------------------------*/
/*右下角的「哈哈姆特按鈕」、2018-05-25 */
#btn_quick {
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
    background-color: rgba(45, 45, 45, 0.4) !important;
}
#btn_quick:hover {
    border: 1px solid #87dfff !important;
}
/*--------------------------------------------------------------*/
/*https://forum.gamer.com.tw/*/
/*哈啦區首頁列表「縮圖」*/
.forum_list {
    background-color: rgba(45, 45, 45, 0.4) !important;
}
.forum_list:hover {
    background-color: rgba(0, 0, 0, 0.6) !important;
}
.forum_list a {
    color: #fff !important;
}
/*右下角的排行名次*/
.forum_list_title span:first-child {
    color: #fff !important;
    opacity: 0.4;
}

/*--------------------------------------------------------------*/
/*哈啦區首頁列表「清單」*/
#data-container .BH-table {
    background-color: rgba(45, 45, 45, 0.4) !important;
}
.BH-table1 tr:nth-child(2n + 1) {
    background-color: rgba(0, 0, 0, 0.2) !important;
}
#data-container .BH-table a {
    color: #fff !important;
}
#data-container .BH-table tr:hover {
    background-color: rgba(0, 0, 0, 1) !important;
}

/*右上角的搜尋相關關鍵字*/
.right-child {
    background: rgba(45, 45, 45, 0.4) !important;
}

/*--------------------------------------------------------------*/

/*留言標記  2017-10-05*/
div[data-template-id="#tagList"] {
    /*背景陰影*/
    box-shadow: 0px 5px 10px rgba(0, 0, 0, 0.7) !important;
}
div[data-template-id="#tagList"] .tag-list {
    /*背景顏色*/
    background-color: rgba(230, 230, 230, 0.9) !important;
}
div[data-template-id="#tagList"] .tag-list .username {
    /*文字顏色*/
    color: #000 !important;
}
div[data-template-id="#tagList"] .tag-list h3 {
    /*標題(留言名單、好友名單)*/
    color: rgba(255, 120, 20, 1) !important;
    border-top: none !important;
    margin-top: 10px !important;
    border-bottom: 2px solid rgba(255, 120, 20, 1) !important;
    font-size: 18px !important;
    font-weight: 900 !important;
}
div[data-template-id="#tagList"] .enter {
    /*底下的圓圈*/
    background: none !important;
}

/*--------------------------------------------------------------*/
/*2017/08/14 界面大更新*/

/*文章裡面*/

/*固定在最上面的工具列*/
.c-menu__scrolldown {
    background-color: rgba(0, 0, 0, 0.7) !important;
    color: #fff !important;
    position: relative;
    margin-bottom: 0px;
    box-shadow: 0px 0px 0px rgba(0, 0, 0, 0) !important;
}
.c-menu__scrolldown a,
.c-menu__scrolldown h1 {
    color: #fff !important;
}
.toolbar a:hover {
    color: #87dfff !important;
}
.BH-menuE,
.c-menu,
#BH-menu-path {
    border-top: none !important;
}
#BH-menu-path {
    background-color: rgba(0, 0, 0, 0) !important;
}

.BH-menu fixed {
    background-color: rgba(0, 0, 0, 0) !important;
}

.c-menu {
    box-shadow: 0px 0px 0px rgba(0, 0, 0, 0) !important;
    background: rgba(0, 0, 0, 0) !important;
}

/*關閉動畫*/
/*.c-menu__scrolldown , #BH-menu-path , .c-fixed--header .is-scroll{
  transition: none  !important;
}*/

/*文章區塊*/
.c-post {
    color: #fff !important;
    background-color: rgba(45, 45, 45, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
}
/*文章預設文字顏色*/
.c-article__content {
    color: #fff;
}
/*超連結顏色*/
.c-post a[href] {
    color: #87dfff;
}

/*文章主內容*/
.c-post__body {
    border-top: solid 1px rgba(255, 255, 255, 0.4) !important;
    padding-top: 30px !important;
}

/*簽名檔上面的水平線*/
.c-post__body__signature {
    border-top: 1px solid rgba(255, 255, 255, 0.4) !important;
}

/*作者*/
.username {
    color: #fff !important;
}

/*時間*/
.edittime {
    color: rgba(255, 255, 255, 0.7) !important;
}

/*留言區塊*/
.c-post__footer {
    color: #fff;
    background-color: rgba(0, 0, 0, 0);
    border-top: solid 1px rgba(255, 255, 255, 0.4) !important;
}
.c-reply {
    background: rgba(0, 0, 0, 0) !important;
}
.c-reply span {
    color: #fff;
}
.c-reply a[href] {
    color: #87dfff !important;
}
.c-reply a[href]:hover {
    text-decoration: underline !important;
}

/*右下角的『回覆』*/
.jumptocomment button {
    background: none !important;
    background-color: rgba(45, 45, 45, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
}
.jumptocomment button:hover {
    border: 1px solid #87dfff !important;
}

/*留言輸入框*/
.reply-input {
    background-color: rgba(0, 0, 0, 0) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
    color: #fff !important;
}
.content-edit {
    background-color: rgba(0, 0, 0, 0) !important;
    color: #fff !important;
}
.reply-input div {
    color: #fff !important;
}

/*快速回覆*/
.c-section__main {
    background-color: rgba(45, 45, 45, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
}
.c-section__main h1 {
    color: #fff !important;
}
.ql-editor {
    color: #fff;
    background-color: rgba(45, 45, 45, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
}
.option {
    background-color: rgba(0, 0, 0, 0) !important;
}

/*本版熱門推薦*/
.popular__item a {
    color: #fff;
    text-decoration: none;
}
.popular .popular__item:hover .name {
    color: #87dfff !important;
    text-decoration: none;
}

/*上下一頁的按鈕*/
.c-section__main .next,
.c-section__main .prev {
    height: 52px;
    margin: -12px 0px;
    line-height: 50px !important;
    border-radius: 0px !important;
}

/*頁碼的底色*/
.prev,
.next,
.BH-pagebtnA a[href] {
    background-color: rgba(0, 0, 0, 0.4) !important;
}

/*右邊的『切回舊版』視窗*/
.c-test {
    background-color: rgba(45, 45, 45, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
}

/*右下角『電梯』、『回最上面』、『回列表』*/
.jumpfloor,
.jumpfloor input,
.c-quicktool .goback,
.c-quicktool .gotop {
    background-color: rgba(45, 45, 45, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
    color: #fff;
}
.jumpfloor input:hover,
.c-quicktool .goback:hover,
.c-quicktool .gotop:hover {
    border: 1px solid #87dfff !important;
}
.baha_quicktool .quicktool.jumpfloor input {
    color: #fff !important;
}
/*--------------------------------------------------------------*/

/*2017/08/14*/

/*文章列表*/
.b-list-wrap {
    background-color: rgba(45, 45, 45, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
    margin-top: 30px;
}
.b-list-wrap td {
    border-bottom: 1px dotted rgba(255, 255, 255, 0.4) !important;
}
.b-list__row:nth-child(2n + 1) {
    background-color: rgba(255, 255, 255, 0) !important;
}

/*標題列*/
.b-list__head {
    background-color: rgba(0, 0, 0, 0.5) !important;
}

/*頂置*/
.b-list__row--sticky {
    background-color: rgba(30, 100, 80, 0) !important;
    border-bottom: 1px dotted rgba(255, 255, 255, 0.4) !important;
}

/*移入*/
.b-list-wrap tr:hover {
    background-color: rgba(0, 0, 0, 0.3) !important;
    /* outline: 2px solid #87dfff !important; */
}

/*標題醒目的顏色*/
.is-highlight {
    color: rgba(50, 180, 190, 1) !important;
}

/*作者帳號顏色*/
.b-list__count__user a,
.b-list__time__user a,
.b-list__main__pages a {
    color: #87dfff !important;
}
.b-list-wrap a {
    color: #fff !important;
}

/*移入的顏色*/
.b-list-wrap a:hover {
    color: #87dfff !important;
}

/*icon『圖片』顏色*/
.icon-photo {
    color: rgba(100, 200, 150, 1) !important;
}
/*icon『影片』顏色*/
.icon-video {
    color: rgba(250, 100, 150, 1) !important;
}
/*icon『鎖』顏色*/
.icon-lock {
    color: rgba(150, 100, 200, 1) !important;
}

/*頁碼前面的虛線『>>...』*/
.b-list__main__pages {
    color: rgba(255, 255, 255, 0.7) !important;
}

/*回到文章列表的動畫顏色*/
@keyframes highlight {
    0% {
        background: rgba(150, 100, 100, 0);
    }
    50% {
        background: rgba(150, 100, 100, 0.5);
    }
    100% {
        background: rgba(150, 100, 100, 0);
    }
}
@-moz-keyframes highlight {
    0% {
        background: rgba(150, 100, 100, 0);
    }
    50% {
        background: rgba(150, 100, 100, 0.5);
    }
    100% {
        background: rgba(150, 100, 100, 0);
    }
}
@-webkit-keyframes highlight {
    0% {
        background: rgba(150, 100, 100, 0);
    }
    50% {
        background: rgba(150, 100, 100, 0.5);
    }
    100% {
        background: rgba(150, 100, 100, 0);
    }
}

/*文章列表-版本熱門推薦*/
.b-popular {
    background-color: rgba(45, 45, 45, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
}
/*標題文字*/
.b-popular a {
    color: #fff;
    outline: none !important;
}
.b-popular .name:hover {
    color: #87dfff !important;
}
/*上面的類別按鈕*/
.b-tags a {
    background-color: rgba(45, 45, 45, 0.4) !important;
    outline: 1px solid rgba(255, 255, 255, 0.4) !important;
    color: #fff !important;
}
.b-tags a:hover {
    outline: 1px solid #87dfff !important;
}
/*--------------------------------------------------------------*/

/* 改版的【上方主選單】----最後修改：2018-07-03 */

/* 哈啦區    場外休憩區    文章列表    精華區    板規    水桶 */
ul.BH-menuE > li > a {
    color: #fff;
}
ul.BH-menuE li:first-child > a {
    color: #fff;
}
ul.BH-menuE li > a:hover {
    color: #87dfff;
}
ul.BH-menuE .now {
    color: #87dfff;
}

/** 精華區最上面的選單 */
ul.rwd-nav .rwd-nav-main-items > li > a {
    color: #fff !important;
}
ul.rwd-nav .rwd-nav-main-items > li .now{
    color: #87dfff !important;
}

/* 滑鼠移入時顯示的選單 */
.dropList dl {
    background-color: rgba(0, 0, 0, 0.9) !important;
}
/* 2022-11-15 移除背景的陰影 */
.box-shadow__soft {
    box-shadow: none !important;
}

/** 已訂閱 */
ul.BH-menuE li.BH-menu-forumA-right.nav-text-btn.is-active > a {
    color: #fff;
}
/** 訂閱 */
ul.BH-menuE li.BH-menu-forumA-right > a {
    color: #fff;
}
/** 選單的項目 */
ul.BH-menuE dl a {
    color: #fff !important;
}

/* 底下滑動的光條 */
#navBarHover {
    background: #117e96 !important;
    box-shadow: 0 0 0px 0px rgba(0, 0, 0, 0) !important;
    border: none !important;
}

.dropList a {
    background-color: rgba(0, 0, 0, 0) !important;
}

/* 顏色 */
.BH-menuE,
.BH_menu-search {
    background-color: rgba(0, 0, 0, 0.7) !important;
    color: #000 !important;
    /*display:block!important; 讓【搜尋】預設就是展開的狀態*/
}

/* 右上角「回列表」按鈕 */
.c-menu__scrolldown .toolbar .back {
    margin-right: 5px !important;
}
.BH-menu-forumA-back .is-active {
    margin-right: 5px !important;
}

.BH-searchC input[type="text"] {
    /*【搜尋】的文字框*/

    background-color: rgba(255, 255, 255, 0.3) !important;
    color: #fff !important;
    font-weight: bold !important;
}

/*--------------------------------------------------------------*/

/*2019-09-16 【通知視窗】*/

/*刪除多餘的垂直線*/
.TOP-btn {
    border-right: none !important;
}
/*刪除多餘的垂直線*/
.TOP-my ul > li {
    border: none !important;
}
/*統一右上角按鈕為白色圖示*/
.TOP-btn a::before {
    color: #fff !important;
}
/*統一右上角通知按鈕的寬度*/
.TOP-btn a {
    width: 30px !important;
}
/*右上角的按鈕，在第三個按鈕加入一個垂直分割線*/
.TOP-btn {
    border-right: 1px solid rgba(255, 255, 255, 0.4);
}

/*整體*/
.TOP-msg {
    background-color: rgba(45, 45, 45, 0.9) !important;
    color: #fff !important;
    border: 2px solid #249db8 !important;
}
.TOP-msg span {
    background-color: rgba(0, 0, 0, 0) !important;
    color: #fff;
}
.TOP-msglist {
    background: none !important;
    background-color: none !important;
}
.TOP-msglist div:hover,
.TOP-msglist a:hover {
    /*移到上面時*/
    background-color: rgba(45, 45, 45, 0.95) !important;
}
#topBarMsg_member div,
#topBarMsg_more div {
    background-color: rgba(45, 45, 45, 0) !important;
}

/*通知 項目的分界線*/
.TOP-msglist div {
    background-color: rgba(0, 0, 0, 0) !important;
    color: #fff !important;
}
.TOP-msg .new {
    /*新通知*/
    background-color: rgba(50, 100, 80, 0.5) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
}

.TOP-msgpic {
    /*圖片底色*/
    background-color: rgba(0, 0, 0, 0) !important;
}
.TOP-msgbtn {
    /*最下面那條*/
    background-color: rgba(0, 0, 0, 0) !important;
    border-top: 2px solid #249db8 !important;
}

.TOP-msglist a.msg-ellipsis {
    display: block !important;
}

/*通知項目的標題顏色*/
.TOP-msglist a .link,
.TOP-msglist > div.new .link {
    color: #87dfff !important;
}

/*把右邊黑色的鈴鐺圖示變成白色*/
.TOP-msglist a.msg-ellipsis img {
    -webkit-filter: invert(1);
}

/*通知的顏色，統一為白色*/
.TOP-btn a.topb1::before {
    background-image: url("https://i2.bahamut.com.tw/navicon_notification_active.png") !important;
}

/*通知-訂閱 作者顏色*/
.TOP-msglist a .msgname {
    color: #87dfff !important;
}

/*通知的icon顏色*/
#topBarMsgList_light_0 .TOP-msgpic img {
    /*灰階*/
    filter: grayscale(100%);
    /*影像堆疊方式*/
    mix-blend-mode: hard-light;
}

/*超連結顏色(標題前後的文字)*/
.TOP-msg [href] {
    color: #fff !important;
}

/*我曾訂閱的看板*/
#topBarMsgList_forum a {
    color: #87dfff !important;
}

/*每個項目的分割線*/
.TOP-msglist > div {
    border-top: 1px solid rgba(255, 255, 255, 0.4) !important;
}

.title textarea {
    /*社團快速留言*/
    background-color: rgba(255, 255, 255, 0.2) !important;
    color: #fff !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
}
.check-group h6 {
    color: #fff !important;
}
#topBarMsg_member ul li a:hover {
    background-color: rgba(0, 0, 0, 0) !important;
}

.TOP-board {
    background-color: rgba(0, 0, 0, 0) !important;
}
.TOP-more ul li:hover {
    background: rgba(0, 0, 0, 0.3) !important;
    /* box-shadow: 0 1px 3px 0 rgba(255, 255, 255, 0.4) !important; */
    outline: 1px solid rgba(255, 255, 255, 0.4);
}

.TOP-more ul:hover {
    background: rgba(0, 0, 0, 0) !important;
}
.TOP-more > div p {
    background: rgba(0, 0, 0, 0) !important;
    color: #fff;
}

#topBarMsg_member ul li:hover,
#topBarMsg_member ul li:focus,
#topBarMsg_member ul li:active {
    background: rgba(0, 0, 0, 0.7);
}
.TOP-msglist a:hover,
.TOP-msglist div:hover {
    background-color: rgba(0, 0, 0, 0) !important;
}
/*滑鼠移入的顏色*/
.TOP-msglist > div:hover {
    background-color: rgba(0, 0, 0, 0.3) !important;
}
.TOP-more > div.nav-platform ul li.platform-ac:hover {
    background-color: rgba(0, 0, 0, 0) !important;
}

/*右上角選單、平台專區*/
#topBarMsgList_more a {
    color: #fff !important;
}

/*看所有通知、設定*/
.TOP-msgbtn a i {
    color: #87dfff !important;
}
/*--------------------------------------------------------------*/

/*最上面那條（通知、訂閱、推薦）*/
.TOP-bh {
    background-color: rgba(0, 0, 0, 1) !important;
    background: rgba(0, 0, 0, 1) !important;
    box-shadow: 0 0 0 rgba(0, 0, 0, 0) !important;
}
#BH-top-data {
    background-color: rgba(0, 0, 0, 0) !important;
}
/*最上面的搜尋*/
#top_search_q {
    /*display: none !important;    */
    background-color: rgba(255, 255, 255, 0.3) !important;
    color: rgba(255, 255, 255, 1) !important;
}

/*--------------------------------------------------------------*/

/*【移除FB點讚】*/
.fb-like {
    display: none !important;
    height: 0px !important;
}
/*【移除廣告】上面、右邊 */
#BH-ad_banner,
#flySalve,
#BH-bigbanner {
    opacity: 0 !important;
    height: 0px !important;
    pointer-events: none !important;
    overflow: hidden !important;
}

/*上面的廣告*/
.a-mercy-d {
    display: block;
    opacity: 0 !important;
    height: 0px !important;
    pointer-events: none !important;
    overflow-y: scroll !important;
}

/*下面的廣告（2016-10-14）*/
.forum-bottom-banner {
    opacity: 0 !important;
    height: 0px !important;
    pointer-events: none !important;
    overflow-y: scroll !important;
}

/*--------------------------------------------------------------*/

/*最近閱覽看板*/
.BH-rbox a {
    color: #fff !important;
}

/*google搜尋*/
#BH-search {
    background-color: rgba(45, 45, 45, 0.4) !important;
}

/*--------------------------------------------------------------*/

/* http://forum.gamer.com.tw/ */
/*看版首頁*/
.FM-abox5B {
    background-color: rgba(0, 0, 0, 0) !important;
}
.FM-abox2A,
.FM-abox8A {
    background-color: rgba(0, 0, 0, 0) !important;
    color: #ddd !important;
}
.BH-lbox {
    /*要先讓底色透明*/
    background-color: rgba(45, 45, 45, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
}

.FORUM-master_box1 strong {
    /*標題*/
    background-color: rgba(0, 0, 0, 0) !important;
}

/**/
.FORUM-master_box1 a,
.FORUM-master_box1 p {
    color: #fff !important;
    border: 0px solid rgba(255, 255, 255, 0.4) !important;
}
.FORUM-master_box1 a:hover {
    color: #87dfff !important;
}

/*每個版的樣式*/
.FORUM-master_box1 div {
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
    margin-bottom: 5px !important;
    background-color: rgba(45, 45, 45, 0.4) !important;
    box-sizing: border-box;
}
.FORUM-master_box1 div strong {
    /*標題*/
    background-color: rgba(0, 0, 0, 0.7) !important;
    border-bottom: 1px solid rgba(255, 255, 255, 0.4) !important;
}

.FM-abox2A a[href] {
    color: #87dfff !important;
}

/*達人專區*/
.FM-abox8 a {
    color: #fff !important;
}

/*最上面的（搜尋）*/
.BH-search2 input {
    background-color: #000 !important;
    color: #ddd !important;
}

/*文章搜尋的文字顏色*/
.BH-search2 span {
    color: #000 !important;
}

/*--------------------------------------------------------------*/

/*每個版的首頁*/

.FM-abox6B a[href] {
    /*作品介紹*/
    color: #87dfff !important;
}
.ACG-box span,
.ACG-box p {
    color: #fff !important;
}

#BH-master h4 {
    background-color: rgba(0, 0, 0, 0) !important;
    color: #fff !important;
}
#BH-master h4 img[src="https://i2.bahamut.com.tw/h1_img.gif"]
{
    display: none;
}
/*--------------------------------------------------------------*/

/*文章列表*/
.fmb tr,
.fmb {
    background-color: rgba(0, 0, 0, 0) !important;
    border-collapse: collapse;
    border: none !important;
}

.fmb tr {
    border-bottom: 0px solid rgba(255, 255, 255, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
}

/*滑鼠移動到上面的顏色*/
.fmb tr:hover td {
    background-color: rgba(0, 0, 0, 0) !important;
    /*transform: scale(1.2);*/
}

/*底色*/
.fmb td {
    background-color: rgba(45, 45, 45, 0.4) !important;
    border-bottom: none !important;
}
/*文章列表-文字*/
.FM-blist a {
    color: #eee !important;
    /*font-size:15px;*/ /*讓文章列表的文字變大*/
}
/*單數行的底色*/
.FM-row td {
    background-color: rgba(0, 0, 0, 0.5) !important;
    border-bottom: none !important;
}
/*頂置文章的底色*/
.FM-sticky td {
    background-color: rgba(40, 70, 50, 0.4) !important;
}
/*GP數量*/
.FM-blist4 {
    color: #cc55cc !important;
}

.FM-blist tr:hover {
    background-color: rgba(0, 0, 0, 0.4) !important;
}

/*--------------------------------------------------------------*/

/*推薦\精華\達人*/
.FM-blist1 td {
    background: #000 !important;
    background-color: #000 !important;
}
.FM-blist1 a {
    background: none !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
}
.FM-blist1 a:hover {
    border: 1px solid #87dfff !important;
}
/*文章子板 、頁數*/
.FM-blist2 a,
.FM-blist3 span a {
    color: #87dfff !important;
}
/*文章瀏覽人數*/
.FM-blist5 {
    color: #ccc !important;
}
/*文章列表-作者*/
.FM-blist5 a,
.FM-blist6 a {
    color: #87dfff !important;
}
/*GP篩選*/
.gplist a,
.gplist {
    color: #000 !important;
}

/*--------------------------------------------------------------*/

/*    看板首頁    板規    文章列表    精華區*/
#BH-main_menu,
.BH-search2 {
    background: none !important;
    background-color: rgba(45, 45, 45, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4);
}
#BH-main_menu a {
    color: #fff !important;
}

/*文章分類的標籤-框架*/
.FM-tags {
    border-bottom: 0px solid rgba(255, 255, 255, 0.4) !important;
    margin-bottom: 10px !important;
}
/*文章分類的標籤*/
.FM-tags a {
    background: none !important;
    background-color: rgba(45, 45, 45, 0.4) !important;
    color: #fff !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
}
.FM-tags a:hover {
    border: 1px solid #87dfff !important;
}
/*選中的*/
#FM-tagsnow {
    background-color: #3c91c9 !important;
    color: #000 !important;
}

/*--------------------------------------------------------------*/

/*最上面（文章在哪一個版的文字*/
#BH-pathbox a {
    color: #fff;
}

/*--------------------------------------------------------------*/

/*右邊區塊的標題（動漫電玩通、版務*/
#BH-slave h5 {
    background-color: rgba(0, 0, 0, 0.7) !important;
    background: none;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
    border-bottom: none !important;
}

/*右邊區塊（動漫電玩通、版務*/
.BH-rbox {
    color: #fff;
    background-color: rgba(45, 45, 45, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
}
/*同上的超連結文字*/
.BH-rbox a[href] {
    color: #87dfff !important;
}

/*--------------------------------------------------------------*/

/*文章區塊-整體*/
.FM-cbox1 {
    background-color: rgba(45, 45, 45, 0.4) !important;
    color: #fff !important;
    margin-bottom: 30px !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
}
/*文章當中的超連結*/
.FM-cbox7 a:link {
    color: #87dfff !important;
} /*文章當中點選過得超連結*/
.FM-cbox7 a:visited {
    color: #c78dff !important;
}
/*文章-作者ID */
.FM-cbox5 a:link {
    color: #87dfff !important;
}
/*文章勇者區*/
.FM-cbox2 {
    background: none !important;
    color: #fff !important;
    border-bottom: 1px solid rgba(255, 255, 255, 0.4) !important;
}
/*勇者區上面的標題*/
.FM-cbox3 {
    background: none !important;
    background-color: #000 !important;
    color: #fff !important;
    border-bottom: 1px solid rgba(255, 255, 255, 0.4) !important;
}

.FM-cbox9 {
    border-top: 1px solid rgba(255, 255, 255, 0.4) !important;
}

/*文章的GP、BP*/
.FM-cbox9 p a {
    background: none !important;
    background-color: rgba(45, 45, 45, 0.4) !important;
    color: #87dfff !important;
}
/*看她的文、開啟圖片*/
.FM-cbox4 a {
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
    background: none !important;
    background-color: rgba(45, 45, 45, 0.4) !important;
    color: #ddd !important;
}
.FM-cbox4 a:hover {
    border: 1px solid #87dfff !important;
}

/*檢舉*/
.FM-cbox10 button {
    background-color: #000 !important;
    color: #ddd !important;
}

/*--------------------------------------------------------------*/

/*留言*/
.FM-cbox10D {
    border-top: 1px solid rgba(255, 255, 255, 0.4) !important;
    border-bottom: 1px solid rgba(255, 255, 255, 0.4) !important;
    background-color: rgba(0, 0, 0, 0) !important;
}

.FM-cbox10D a {
    color: #87dfff !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
    background-color: rgba(45, 45, 45, 0.4) !important;
    padding: 5px !important;

    line-height: 30px !important;
}
.FM-cbox10D a:hover {
    border: 1px solid #87dfff !important;
}

/*留言的名字*/
.FM-msgbg a {
    color: #5588cc !important;
}
/*留言的日期*/
.FM-msgbg span {
    color: #558855 !important;
}
/*留言區的漸層*/
.FM-cbox10A,
.FM-cbox10 {
    background: none !important;
    border-bottom: 1px solid rgba(255, 255, 255, 0.4) !important;
}
/*留言-輸入框*/
.FM-cbox10C textarea {
    background-color: rgba(255, 255, 255, 0.2) !important;
    color: #fff !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
}

/*--------------------------------------------------------------*/

/*快速回復*/

/*本體 \ 未登入*/
.FM-reply,
.FM-replyB {
    background-color: rgba(45, 45, 45, 0.4) !important;

    border: 1px solid rgba(255, 255, 255, 0.4) !important;
    color: #ddd !important;
}

#reply0 {
    /*輸入框*/
    background-color: rgba(255, 255, 255, 0.2) !important;
    color: #fff !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
}
.FM-replyA input[type="text"] {
    /*驗證碼輸入框*/
    background-color: rgba(255, 255, 255, 0.2) !important;
    color: #fff !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
    width: 80px !important;
    padding: 5px;
}
.FM-replyC a[style],
.FM-replyA button {
    /*【button】完整編輯、快速回覆*/
    background-color: rgba(45, 45, 45, 0.4) !important;
    color: #87dfff !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
    padding: 3px;
}
.FM-replyC a[style]:hover,
.FM-replyA button:hover {
    border: 1px solid #87dfff !important;
}

/*--------------------------------------------------------------*/

/*避免進階編輯出現背景*/
.editstyle {
    background: none !important;
    background-color: #fff !important;
    color: #000 !important;
}

/*--------------------------------------------------------------*/

/*下面的 本版熱門推薦*/
.FM-blist8 {
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
    margin-top: 10px !important;
}
/*移除外框*/
.FM-blist8 a {
    border: none !important;
}
/*移除外框*/
.popular .popular__item .img {
    outline: none !important;
}
.popular .popular__item .name:hover {
    color: #87dfff !important;
}
/*--------------------------------------------------------------*/

/*版權宣告*/
#BH-footer {
    color: rgba(255, 255, 255, 0.4) !important;
    border: none;
}

/*--------------------------------------------------------------*/

/*編輯器的按鈕（原始碼、即時瀏覽）*/
#_bhrte_btn_text,
#_bhrte_btn_rte {
    background-color: #ccc;
}

/*Google Chrome 編輯器文字矯正*/
#form1 .FM-lbox3C {
    color: #ccaacc !important;
}

/*--------------------------------------------------------------*/

/*看版首頁的【投票區】*/
.FM-abmbar {
    /*color:#000 !important;
  background-color: #222;   */
    background-color: rgba(0, 0, 0, 0) !important;
}

/*--------------------------------------------------------------*/

/*水桶名單 表格【http://forum.gamer.com.tw/water.php?bsn=60076】*/
.FM-stb1,
.FM-stb1 tr {
    background-color: rgba(45, 45, 45, 0.4) !important;
    color: #fff !important;
}
.FM-stb1 tr td,
.FM-stb1 tr td a {
    color: #fff !important;
}
.FM-stb1 tr td span {
    color: #aaffcc !important;
}

/*--------------------------------------------------------------*/

/*精華區索引*/
/*http://forum.gamer.com.tw/listG.php?bsn=60076*/

.FM-sbox3B table a {
    color: #fff !important;
}

/*--------------------------------------------------------------*/
/*--------------------------------------------------------------*/
/*--------------------------------------------------------------*/

/*【反轉顏色】*/

/*【反轉顏色】(公佈欄 公佈欄*/
.FM-abox5B a[href],
.FM-abox5B a[href] font[color] {
    color: #87dfff !important;
}

/*【文字顏色反轉】（版規*/
#BH-master div.FM-lbox4 a[href],
#BH-master div.FM-lbox4 a[href] font[color] {
    color: #87dfff !important;
}

/*【反轉顏色】(哈拉區的文章*/
.FM-cbox7 a[href],
.FM-cbox7 a[href] font[color] {
    color: #87dfff !important;
}

/*--------------------------------------------------------------*/
/*--------------------------------------------------------------*/
/*--------------------------------------------------------------*/

/* 本板熱門推薦 */
.FM-blist8 p:hover {
    outline: 1px solid #87dfff !important;
}

.FM-cbox9 .back:hover,
button[name="accuse_tip"]:hover,
.FM-lbox1 button:hover,
.FM-msgbg button:hover {
    border: 1px solid #87dfff !important;
}

button[name="accuse_tip"],
.FM-lbox1 button,
.FM-msgbg button {
    background-color: rgba(45, 45, 45, 0.4) !important;
    color: #fff !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
    line-height: 0px;
}

#BH-pagebtn a:link {
    background: rgba(0, 0, 0, 0.4) !important;
    color: #fff !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
}

#BH-pagebtn a {
    color: #fff !important;
}

#BH-pagebtn a:hover {
    border: 1px solid #87dfff !important;
    background: rgba(0, 0, 0, 0.4) !important;
}

#BH-pagebtn .pagenow,
#BH-pagebtn .no {
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
}
#BH-pagebtn .pagenow:hover {
    background-color: #148aa4 !important;
}
#BH-pagebtn .no {
    background-color: rgba(45, 45, 45, 0.4) !important;
    color: #444 !important;

    opacity: 0;
}
#BH-pagebtn .no:hover {
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
}

/*動漫電玩通*/
.BH-qabox1 button {
    background: rgba(0, 0, 0, 0.4) !important;
    color: #fff !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
}
.BH-qabox1 button:hover {
    border: 1px solid #87dfff !important;
}

/*針對【BahaForumPreviewer】的優化（在文章列表顯示內文的插件）2017-02-02*/
.FM-blist table tr,
.FM-blist table,
.FM-blist table td {
    border: none !important;
    background: rgba(0, 0, 0, 0) !important;
    color: rgba(240, 255, 205, 1) !important;
}

/*--------------------------------------------------------------*/
/*--------------------------------------------------------------*/
/*--------------------------------------------------------------*/

/* 我們了解您不想看到廣告的心情⋯ 若您願意支持巴哈姆特永續經營，請將 gamer.com.tw 加入廣告阻擋工具的白名單中，謝謝 ! */
body div[style*="position: fixed; left: 20px; right: 20px;"] {
    display: block !important;
    opacity: 0 !important;
    height: 0px !important;
    pointer-events: none !important;
}

/* 搜尋 2024-06-11 */
#searchbox {
    background: rgba(255, 255, 255, 0.4) !important;
}
.gsib_a {
    background: rgba(0, 0, 0, 0) !important;
}
.gcse-bar .gcse-main div.gsc-input-box table.gstl_50 td.gsib_a input.gsc-input {
    color: #fff !important;
}

.TOP-data .gcse-bar .gcse-option .gcse-dropdown.gcse-suggest .gcse-suggest-tag a {
    border: 1px solid #87dfff !important;
    color: #87dfff !important;
    background: rgba(0, 0, 0, 0) !important;
}

/* 修正白底問題   2017/07/26 */
.gcse-wrapper {
    background-color: rgba(0, 0, 0, 0) !important;
}
.gsc-control-cse {
    background-color: rgba(0, 0, 0, 0) !important;
}
.gsc-webResult.gsc-result,
.gsc-results .gsc-imageResult {
    background-color: rgba(0, 0, 0, 0) !important;
}

/*2017/07/07 上面的搜尋框*/
#old_search_searchbox {
    background-color: rgba(255, 255, 255, 0.2) !important;
    color: #fff !important;
}
#old_search_form * {
    background-color: rgba(0, 0, 0, 0) !important;
    color: #fff !important;
}

/*2017/07/07 搜尋框的熱門搜尋*/
.gcse-dropdown {
    background-color: rgba(0, 0, 0, 0.8) !important;
    color: #fff !important;
}
.gcse-suggest-tag a {
    color: #87dfff !important;
}

/*2017/07/07 下拉選單（搜尋方式）*/
.gcse-dropdown span {
    color: #fff !important;
}

/* 2017/07/07 右邊的熱門推薦*/
.right-child {
    background-color: rgba(45, 45, 45, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
}
.right-child a {
    color: #87dfff !important;
}

/*右邊哈哈姆特 人物名字顏色*/
#chatRoom .msg-log-title {
    color: #fff !important;
}
#chatRoom {
    padding: 0px !important;
}

/*右下角哈哈姆特 人物名字顏色*/
.as-mes-box .msg-log-title {
    color: #666 !important;
}
.as-mes-box .msg-log-time {
    color: #888 !important;
}

/*文章顏色如果是預設值，就設定成白色*/
font[color="unset"] {
    color: #fff !important;
}

/*格式化文章*/
div[ge_shi_hua="true"] .c-article__content * {
    background-color: rgba(0, 0, 0, 0) !important;
    color: #fff !important;
    font-size: 18px !important;
}

div[ge_shi_hua="true"] .c-article__content a:link {
    color: #87dfff !important;
}
/*擴充按鈕、文章格式化的按鈕*/
.ge_shi_hua {
    width: 25px;
    height: 25px;
    background-color: rgba(0, 0, 0, 0);
    border: none;
    /*border-left: solid 1px rgba(255, 255, 255, 0.4);
border-top: solid 1px rgba(255, 255, 255, 0.4);*/
    font-size: 14px;
    color: rgba(255, 255, 255, 0.4);
    float: right;
    text-align: center;
    line-height: 25px;
    margin-top: -25px;
    background-image: url(data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iaXNvLTg4NTktMSI/Pgo8IS0tIEdlbmVyYXRvcjogQWRvYmUgSWxsdXN0cmF0b3IgMTkuMC4wLCBTVkcgRXhwb3J0IFBsdWctSW4gLiBTVkcgVmVyc2lvbjogNi4wMCBCdWlsZCAwKSAgLS0+CjxzdmcgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayIgdmVyc2lvbj0iMS4xIiBpZD0iQ2FwYV8xIiB4PSIwcHgiIHk9IjBweCIgdmlld0JveD0iMCAwIDQ0Mi4wMzUgNDQyLjAzNSIgc3R5bGU9ImVuYWJsZS1iYWNrZ3JvdW5kOm5ldyAwIDAgNDQyLjAzNSA0NDIuMDM1OyIgeG1sOnNwYWNlPSJwcmVzZXJ2ZSIgd2lkdGg9IjUxMnB4IiBoZWlnaHQ9IjUxMnB4Ij4KPGc+Cgk8cGF0aCBkPSJNMjQ4LjIyNywzOTkuMjAxYy05LjYxNiwwLTE3LjQ4Myw3Ljg2Ny0xNy40ODMsMTcuNDgzczcuODY3LDE3LjQ4MywxNy40ODMsMTcuNDgzSDQwOC40OSAgIGM5LjYxNiwwLDE3LjQ4My03Ljg2NywxNy40ODMtMTcuNDgzVjEzOC40MDljMC00Ljk1NC0yLjA0LTkuNjE2LTUuNTM2LTEyLjgyMUwyODkuMzEzLDQuNjYyQzI4Ni4xMDgsMS43NDgsMjgxLjczNywwLDI3Ny4zNjYsMCAgIEg4Mi4xMzZDNzIuNTIsMCw2NC42NTMsNy44NjcsNjQuNjUzLDE3LjQ4M3YxODkuNDAyYzAsOS42MTYsNy44NjcsMTcuNDgzLDE3LjQ4MywxNy40ODNzMTcuNDgzLTcuODY3LDE3LjQ4My0xNy40ODNWMzQuOTY3ICAgaDEzOS44NjZ2MTUxLjUyMmMwLDkuNjE2LDcuODY3LDE3LjQ4MywxNy40ODMsMTcuNDgzaDEzMS4xMjVjMC44NzQsMCwyLjA0LDAsMi45MTQtMC4yOTF2MTk1LjUyMUgyNDguMjI3eiBNMzg4LjA5MywxNjkuMDA1ICAgSDI3NC40NTJWMzguNDYzbDExNi41NTUsMTA3LjUyMnYyMy4zMTFDMzkwLjEzMywxNjkuMDA1LDM4OC45NjcsMTY5LjAwNSwzODguMDkzLDE2OS4wMDV6IE0yMS4yMzYsNDEyLjAyMmw0MS4wODYtNDEuMDg2ICAgbC0zOS4wNDYtMzkuMDQ2Yy02LjcwMi02LjcwMi02LjcwMi0xNy43NzUsMC0yNC43NjhjNi43MDItNi43MDIsMTcuNzc1LTYuNzAyLDI0Ljc2OCwwbDM5LjA0NiwzOS4wNDZsMzcuMDA2LTM3LjAwNiAgIGM2LjcwMi02LjcwMiwxNy43NzUtNi43MDIsMjQuNzY4LDBjNi43MDIsNi43MDIsNi43MDIsMTcuNzc1LDAsMjQuNzY4bC0zNy4wMDYsMzcuMDA2bDM5LjA0NiwzOS4wNDYgICBjNi43MDIsNi43MDIsNi43MDIsMTcuNzc1LDAsMjQuNzY4Yy0zLjQ5NywzLjQ5Ny03Ljg2Nyw1LjI0NS0xMi4yMzgsNS4yNDVzLTkuMDMzLTEuNzQ4LTEyLjIzOC01LjI0NWwtMzkuMDQ2LTM5LjA0NiAgIEw0Ni4yOTUsNDM2Ljc5Yy0zLjQ5NywzLjQ5Ny03Ljg2Nyw1LjI0NS0xMi4yMzgsNS4yNDVzLTkuMDMzLTEuNzQ4LTEyLjIzOC01LjI0NUMxNC4yNDMsNDMwLjA4OSwxNC4yNDMsNDE5LjAxNiwyMS4yMzYsNDEyLjAyMnoiIGZpbGw9IiNGRkZGRkYiLz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8Zz4KPC9nPgo8L3N2Zz4K);
    background-size: 22px 22px;
    background-position: center center;
    background-repeat: no-repeat;
    opacity: 0.4;
}
.ge_shi_hua:hover {
    background-color: rgba(0, 0, 0, 0.4);
    opacity: 1;
}

/*修正Chrome瀏覽器導致「Google搜尋頁面」的原生下拉選單物件，文字顏色變成白色 的問題*/
#filter-subbsn option {
    color: #000 !important;
}

/*ACG 同好圈 X 閒聊取暖 X 自由經營公會新手村*/
.forum-b_promot-block {
    display: none;
}

/* 文章子版標籤 */
.c-post__header .tag-category .tag-category_item {
    border: 1px solid rgba(255, 255, 255, 0.4);
    color: #fff;
    background-color: rgba(0, 0, 0, 0);
}

/* 下面的 大家都在看 */
.c-section__main.popular .popular__item .author a {
    color: #87dfff !important;
}

/* 猜你喜歡 */
.c-section__more {
    display: none;
}

/* ------------------ */

/* 投票 */
.vote-block {
    backdrop-filter: saturate(180%) blur(15px);
    border: none !important;
    color: #fff !important;
    background-color: rgba(0, 0, 0, 0.4) !important;
}
.vote-block .c-post__body {
    border-top: none !important;
    padding-top: 0px !important;
}
/* 格式化按鈕 */
.vote-block .ge_shi_hua {
    display: none;
}
/* 一人限投 1 票 / 2022-12-16 到期 / 匿名投票 / 票數即時顯示 */
.vote-block .c-post__header small {
    color: rgba(255, 255, 255, 0.7) !important;
}

/* 選項 */
.vote-item div.form-control {
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
    background-color: rgba(0, 0, 0, 0) !important;
    color: #ffffff !important;
}
/* 選項 選取後值的顏色 */
.vote-item div.form-control .progress-bar {
    background: rgb(0, 139, 177, 0.5) !important;
}
`

  /** 哈啦區的搜尋頁面 */
  const CSS_FORUM_SEARCH = `

/* 搜尋頁面最上面的選單 */
ul.rwd-nav .rwd-nav-main-items > li > a {
    color: #fff;
}
ul.rwd-nav .rwd-nav-main-items > li .now {
    color: #87dfff;
}

#BH-master {
    background: rgba(0, 0, 0, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
}
/** 全部 精華 M文 達人 金選 板務 */
.search_nav li a {
    color: #fff;
}
/** 選中的項目 */
.search_nav li.is-active a {
    color: #87dfff;
}
/** 選擇子板  排序 */
.search_result_filter ul li a[aria-expanded]{
    color: #fff !important;
}
/** 搜尋結果： 共有  筆 */
.search_result_data {
    color: #aaa !important;
}
/** 進階篩選 */
.search_result_filter ul li a:hover {
    color: #fff !important;
}
/* 整體 */
.search-result_wapper {
    background: rgba(0, 0, 0, 0) !important;
}
/* 內文 */
.search-result_text {
    color: #fff !important;
}
/** 日期 GP by */
.search-result_article .forum-textinfo span {
    color: #aaa !important;
}
/* 標題超鏈接 */
.search-result_title a {
    color: #87dfff !important;
}
/** 發文者 */
.forum-textinfo a {
    color: #87dfff !important;
}

/* 右側區塊 */
.right-child {
    background: rgba(0, 0, 0, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
    color: #fff !important;
}
.right-child h3 {
    color: #fff !important;
}
.right-child a {
    color: #87dfff !important;
}
#BH-slave .search-suggest .search-suggest-tag a {
    background-color: rgba(0, 0, 0, 0) !important;
    color: #87dfff !important;
    border: 1px solid #87dfff !important;
    cursor: pointer;
}
`

  /** 首頁（原「css-巴哈姆特深色主題 - 首頁、登入畫面」） */
  const CSS_HOME = `
body {
  /*背景圖片，修改【url()裡面的網址即可】*/
  background-image: var(--bdt-bg) !important;
  background-attachment: fixed !important;
  background-position: center center !important;
  background-repeat: no-repeat !important;
  background-size: cover !important;
  background-color: rgba(45, 45, 45, 1) !important;
}

/*下面的推薦文章*/
#rivers figure {
  background: rgba(45, 45, 45, 0.4) !important;
  border: 1px solid rgba(255, 255, 255, 0.4) !important;
}
/*標題顏色*/
#rivers figcaption a {
  color: #8edbff;
}
/*右上角通知圖示的顏色 2018-05-23*/
.BA-top .TOP-btn a::before {
  color: #fff !important;
}
.BA-top .TOP-my ul li a::before {
  color: #fff !important;
}

/*縮小廣告 2017/05/15 */
/*#flyRightBox div {
  transform: scale(0.3);
  transition: 0.3s transform;
}*/

#flyRightBox div:hover {
  transform: scale(1);
}

/*2018/02/15、關掉新年特效*/
.BA-topbg::after {
  background: none !important;
  background-image: none !important;
}

/*文字預設的顏色*/
#BH-background {
  color: #fff !important;
}

/* 上面【我要登入、註冊】*/
.TOP-my a {
  color: #fff !important;
}

/*--------------------------------------------------------------*/

/*所有超連結*/

[href]:hover {
  /*超連結*/
  color: #87dfff !important;
}
/*--------------------------------------------------------------*/

/*哈哈姆特通知的顏色 2019-03-26 */
.im_bhtop-user-name {
  color: #87dfff !important;
}
.im_bhtop-message-summary {
  color: #fff !important;
}
#topBarHahamut .im_bhtop-msg-item {
  border: none !important;
  border-top: none !important;
}

/*--------------------------------------------------------------*/

/*2019-09-16 【通知視窗】*/

/*最上面的通知*/
.BA-topbg {
  background: none !important;
  background-color: rgba(45, 45, 45, 0.4) !important;
}
.BA-menu a {
  color: #fff;
}

/*避免指過去是文字顏色不清楚*/
.BA-menu li a:hover {
  background-color: rgba(0, 0, 0, 0) !important;
  color: #87dfff !important;
  border: 1px solid #87dfff !important;
}

/*最上面那條（通知、訂閱、推薦）*/
.TOP-bh {
  background-color: rgba(0, 0, 0, 1) !important;
  background: rgba(0, 0, 0, 1) !important;
  box-shadow: 0 0 0 rgba(0, 0, 0, 0) !important;
}
#BH-menu-path {
  background-color: rgba(0, 0, 0, 0) !important;
}

/*哈啦區    場外休憩區    文章列表    精華區    板規    水桶*/
.BH-menuE a:link,
.BH-menuE a {
  color: #fff !important;
  opacity: 1 !important;
}
/*滑鼠移入時顯示的選單*/
.dropList a {
  background-color: rgba(0, 0, 0, 0.9) !important;
}

/*底下滑動的光條*/
#navBarHover {
  background: #117e96 !important;
  box-shadow: 0 0 0px 0px rgba(0, 0, 0, 0) !important;
  border: none !important;
}

/*刪除多餘的垂直線*/
.TOP-btn {
  border-right: none !important;
}
/*刪除多餘的垂直線*/
.TOP-my ul > li {
  border: none !important;
}
/*統一右上角按鈕為白色圖示*/
.TOP-btn a::before {
  color: #fff !important;
}
/*統一右上角通知按鈕的寬度*/
.TOP-btn a {
  width: 30px !important;
}
/*右上角的按鈕，在第三個按鈕加入一個垂直分割線*/
.TOP-btn {
  border-right: 1px solid rgba(255, 255, 255, 0.4);
}

/*整體*/
.TOP-msg {
  background-color: rgba(45, 45, 45, 0.9) !important;
  color: #fff !important;
  border: 2px solid #249db8 !important;
}
.TOP-msg span {
  background-color: rgba(0, 0, 0, 0) !important;
  color: #fff;
}
.TOP-msglist {
  background: none !important;
  background-color: none !important;
}
.TOP-msglist div:hover,
.TOP-msglist a:hover {
  /*移到上面時*/
  background-color: rgba(45, 45, 45, 0.95) !important;
}

/*通知 項目的分界線*/
.TOP-msglist div {
  background-color: rgba(0, 0, 0, 0) !important;
  color: #fff;
}
.TOP-msg .new {
  /*新通知*/
  background-color: rgba(50, 100, 80, 0.5) !important;
  border: 1px solid rgba(255, 255, 255, 0.4) !important;
}

.TOP-msgpic {
  /*圖片底色*/
  background-color: rgba(0, 0, 0, 0) !important;
}
.TOP-msgbtn {
  /*最下面那條*/
  background-color: rgba(0, 0, 0, 0) !important;
  border-top: 2px solid #249db8 !important;
}

.TOP-msglist a.msg-ellipsis {
  display: block !important;
}

/*通知項目的標題顏色*/
.TOP-msglist a .link,
.TOP-msglist > div.new .link {
  color: #87dfff !important;
}

/*把右邊黑色的鈴鐺圖示變成白色*/
.TOP-msglist a.msg-ellipsis img {
  -webkit-filter: invert(1);
}

/*通知的顏色，統一為白色*/
.TOP-btn a.topb1::before {
  background-image: url("https://i2.bahamut.com.tw/navicon_notification_active.png") !important;
}

/*通知-訂閱 作者顏色*/
.TOP-msglist a .msgname {
  color: #87dfff !important;
}

/*通知的icon顏色*/
#topBarMsgList_light_0 .TOP-msgpic img {
  /*灰階*/
  filter: grayscale(100%);
  /*影像堆疊方式*/
  mix-blend-mode: hard-light;
}

/*超連結顏色(標題前後的文字)*/
.TOP-msg [href] {
  color: #fff !important;
}

/*我曾訂閱的看板*/
#topBarMsgList_forum a {
  color: #87dfff !important;
}

/*每個項目的分割線*/
.TOP-msglist > div {
  border-top: 1px solid rgba(255, 255, 255, 0.4) !important;
}

.title textarea {
  /*社團快速留言*/
  background-color: rgba(255, 255, 255, 0.2) !important;
  color: #fff !important;
  border: 1px solid rgba(255, 255, 255, 0.4) !important;
}
.check-group h6 {
  color: #fff !important;
}
#topBarMsg_member ul li a:hover {
  background-color: rgba(0, 0, 0, 0) !important;
}

.TOP-board {
  background-color: rgba(0, 0, 0, 0) !important;
}
.TOP-more ul li:hover {
  background: Transparent !important;
  box-shadow: 0 1px 3px 0 rgba(255, 255, 255, 0) !important;
}

.TOP-more ul:hover {
  background: rgba(0, 0, 0, 0) !important;
}
.TOP-more > div p {
  background: rgba(0, 0, 0, 0) !important;
  color: #fff;
}

#topBarMsg_member ul li:hover,
#topBarMsg_member ul li:focus,
#topBarMsg_member ul li:active {
  background: rgba(0, 0, 0, 0.7);
}
.TOP-msglist a:hover,
.TOP-msglist div:hover {
  background-color: rgba(0, 0, 0, 0) !important;
}
/*滑鼠移入的顏色*/
.TOP-msglist > div:hover {
  background-color: rgba(0, 0, 0, 0.3) !important;
}
.TOP-more > div.nav-platform ul li.platform-ac:hover {
  background-color: rgba(0, 0, 0, 0) !important;
}

/*右上角選單、平台專區*/
#topBarMsgList_more a {
  color: #fff !important;
}

/*看所有通知、設定*/
.TOP-msgbtn a i {
  color: #87dfff !important;
}

/*--------------------------------------------------------------*/

/*左上角的（  GNN新聞 哈啦區  ＡＰＰ....）*/

.BA-serve {
  background-color: hsla(0, 0%, 18%, 0.5) !important;
  margin-top: 30px;
  border: 1px solid rgba(255, 255, 255, 0.4) !important;
}

.BA-serve li a {
  color: #fff !important;
}

/*--------------------------------------------------------------*/

/*主框*/

.BA-cbox {
  transition: all 0.3s;
  background-color: rgba(45, 45, 45, 0.4) !important;
  border: 1px solid rgba(255, 255, 255, 0.4) !important;
}

.BA-cbox a,
.BA-cbox span {
  color: #fff !important;
}

.BA-cbox:hover {
  /* transition: all 0.3s;
  background-color: rgba(0, 0, 0, 0.5) !important; */
}

/*--------------------------------------------------------------*/

#gnn_normal p span {
  /*網底*/
  background-color: hsla(200, 70%, 50%, 0.5) !important;
}

.BA-cbox6E {
  background-color: hsla(200, 70%, 50%, 0.5) !important;
}

/*--------------------------------------------------------------*/

/*標籤*/

.BA-ctag1 li a:hover {
  /*選中*/
  color: #222 !important;
}

.BA-ctag1 li a {
  /*未選中*/
  margin-top: 30px;
}

/*--------------------------------------------------------------*/

/*table表頭*/

.BA-cbox7 tr:first-child,
.BA-cbox5 tr:first-child {
  background-color: rgba(0, 0, 0, 0) !important;
}

/*--------------------------------------------------------------*/

/*最底下那個框的數字編號*/

.BA-cbox7 span {
  color: #189696 !important;
}

/*--------------------------------------------------------------*/

/*--------------------------------------------------------------*/

/*框的【更多】*/

.BA-cbox4B a,
.BA-cbox6F a:link,
#gnn_normal div a:link,
.BA-cbox8A a:link,
#hotboard .BA-cbox5C a,
#hothala p a,
.BA-cbox9C a:link {
  color: #87dfff !important;
}

/*創作的超鏈接*/

#homeOdata a:link {
  color: #87dfff !important;
}

/*圖片背景*/

.BA-cbox4A div,
.BA-cbox6B {
  background-color: hsla(0, 0%, 0%, 0.4) !important;
}

/*看更多 - 2018-05-23*/
.BA-cbox10B,
.BA-cbox9C {
  background-color: rgba(45, 45, 45, 0.4) !important;
  color: #87dfff !important;
}
.BA-cbox9C a {
  color: #87dfff !important;
}
.BA-cbox10B,
.BA-cbox9C {
  border: 1px solid rgba(255, 255, 255, 0.4);
}

/*移除多餘的水平線 - 2018-05-23 */
.BA-cbox10B::before,
.BA-cbox9C::before {
  height: 0px !important;
}

/*--------------------------------------------------------------*/

/*廣告*/

.BA-billboard,
#floatingAd div {
  opacity: 0 !important;
  height: 0px !important;
  pointer-events: none !important;
}

.BA-billboard:hover,
#floatingAd div:hover {
  transition: all 0.5s;
  opacity: 1;
}

/*--------------------------------------------------------------*/

/*版權宣告*/

.BA-footer a {
  color: #fff;
}

/*--------------------------------------------------------------*/

/*標籤
(GNN 新聞    TGS 2019    手機遊戲    PC    TV 掌機    動漫畫    電競   主題報導)*/
.BA-ctag1 a {
  background-image: none !important;
  background-color: rgba(45, 45, 45, 0.4) !important;
  color: #fff;
  border: none;
}

/*滑鼠移入*/
.BA-ctag1 li a:hover {
  color: #87dfff !important;
}
/*選中*/
.BA-ctag1 .BA-ctag1now {
  color: #87dfff !important;
  background-color: rgba(45, 45, 45, 1) !important;
  border: 1px solid #87dfff !important;
}

/*--------------------------------------------------------------*/

/*左邊的 「動畫瘋新番」*/
/*.BA-lbox3 a:nth-child(2n){
  background-color: rgba(45,45,45,0.4) !important;
  border: 1px solid rgba(255,255,255,0.4) !important;
  border-top: none !important;
  color: #FFF !important;
}


.BA-lbox {
  background-color: rgba(45,45,45,0.4) !important;
  border: 1px solid rgba(255,255,255,0.4) !important;
}

.BA-newanime ul li .newanime_name {
  color: #87dfff !important;
}*/

.rank-ranking-list-area .ranking-list-4to10-area .ranking-list-list > p {
  color: #fff;
}

.card_headnews {
  background-color: rgba(0, 0, 0, 0.4) !important;
  border: 1px solid rgba(255, 255, 255, 0.4) !important;
}
.gnn-container .gnn-text {
  color: #fff !important;
}

.gnn-allnews-block {
  background-color: rgba(0, 0, 0, 0.4) !important;
  border: 1px solid rgba(255, 255, 255, 0.4) !important;
}
.bh-index_commontab ul li a {
  color: #fff !important;
}

.bh-section {
  background-color: rgba(0, 0, 0, 0.4) !important;
  border: 1px solid rgba(255, 255, 255, 0.4) !important;
}
.bh-section a {
  color: #fff !important;
}

/*-----------------*/

/* 問題反應｜合作提案｜招兵買馬 隱私權聲明｜著作權聲明 */
.BA-lbox-copyright li a {
  color: rgba(255, 255, 255, 0.7);
}
`

  /** 登入畫面 */
  const CSS_LOGIN = `
/*整體的背景*/
html {
  /*-webkit-animation:myGradual 1s;
   -moz-animation:myGradual 1s;*/

  /*背景圖片，修改【url()裡面的網址即可】*/
  background-image: var(--bdt-bg) !important;

  background-attachment: fixed !important;
  background-position: center center !important;
  background-repeat: no-repeat !important;
  background-size: cover !important;

  background-color: rgba(45, 45, 45, 1) !important;
}

body {
  font-family: "微軟正黑體" !important;
  background-color: rgba(0, 0, 0, 0) !important;
}
/*整體的外框*/
.inner {
  padding: 20px;
  background-color: rgba(255, 255, 255, 0.5) !important;
}
/*背景顏色*/
.wrapper {
  background-color: rgba(0, 0, 0, 0) !important;
}

/*「下面的提示文字」不要在公用電腦勾選*/
#tips {
  width: auto;
  background-color: rgba(0, 0, 0, 0) !important;
}

/*漸變特效（畫面緩緩顯示）*/
/*@-webkit-keyframes myGradual {
    0% {
      opacity: 0;
    }
    100% {
      opacity: 1;
    }
  }
  @-moz-keyframes myGradual {
    0% {
      opacity: 0;
    }
    100% {
      opacity: 1;
    }
  }*/

/*修改帳號密碼的頁面*/
.main {
  background: #fff !important;
}

.card{
  background:none !important;
  box-shadow: none !important;
}
`

  /**
   * 2026-11 補強：所有頁面共用（彈出視窗、發文編輯器）
   */
  const CSS_COMMON = `
/*彈出視窗（發表創作、發文預覽…）*/
dialog.dialogify {
    background-color: rgba(45, 45, 45, 0.95) !important;
    border: 2px solid #249db8 !important;
    color: #fff !important;
}
.dialogify_title {
    color: #87dfff !important;
}
.dialogify__close img {
    filter: invert(1);
}

.dialogify .tab-content {
    background-color: rgba(0, 0, 0, 0.4) !important;
}
.dialogify .tab-wrapper a,
.dialogify .tab-wrapper li {
    color: #fff !important;
}

/*哈啦區發文、小屋發表 / 編輯創作的編輯器工具列*/
.top-editor.editor-tool__box {
    background-color: rgba(0, 0, 0, 0.4) !important;
    border-color: rgba(255, 255, 255, 0.4) !important;
}
.top-editor .editor-button,
.top-editor .dropdown-group,
.top-editor .dropdown-group span,
.top-editor .dropdown-group i {
    color: #fff !important;
}
.top-editor .editor-button:hover {
    color: #87dfff !important;
}
.form-item .main-text,
.check_select label.main-text {
    color: #fff !important;
}
.bh-menu__tilte,
.form-item .caption-text a,
.form-item label.main-text a {
    color: #87dfff !important;
}
/*編輯器的內容區：預覽模式是「一般」時維持白底（方便確認文章實際的顏色），切到「闇黑」時才套用深色。
  data-bdt-theme 由腳本依照編輯器內部 <html data-theme> 設定*/
iframe[data-bdt-theme="dark"] {
    background-color: rgba(0, 0, 0, 0.4) !important;
    border-color: rgba(255, 255, 255, 0.4) !important;
}
`

  /**
   * 2026-11 補強：NOW! 聊天室（哈啦區文章列表右側、now.gamer.com.tw 的網頁版共用）
   */
  const CSS_NOW_CHAT = `
.now_chatroom-container {
    background-color: rgba(45, 45, 45, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
}
.now_chatroom-container .chatroom {
    background-color: rgba(0, 0, 0, 0.5) !important;
}
.now_chatroom-container .user-headshot {
    background-color: rgba(0, 0, 0, 0) !important;
}
.now_chatroom-container .message:not(.is-photo):not(.is-sticker),
.now_chatroom-container .linkview,
.now_chatroom-container .msg_reply,
.now_chatroom-container .tool-item {
    background-color: rgba(0, 0, 0, 0.5) !important;
    color: #fff !important;
}
.now_chatroom-container .msg-replied,
.now_chatroom-container .emoji-item {
    background-color: rgba(0, 0, 0, 0.3) !important;
}
.now_chatroom-container .message,
.now_chatroom-container .link-info,
.now_chatroom-container .link-title,
.now_chatroom-container .replied-user-id,
.now_chatroom-container .reply-user,
.now_chatroom-container .emoji-count,
.now_chatroom-container .close-reply-msg {
    color: #fff !important;
}
.now_chatroom-container .roomtitle a {
    color: #fff !important;
}
`

  /**
   * 2026-11 補強：巴哈改版後的新版頁首、左側選單、頁尾（巴哈首頁、小屋…共用）
   */
  const CSS_MAIN_NAV = `
/*上方導覽列、左側選單*/
.main-nav,
.main-sidebar__left,
.main-sidebar__brief,
.sidenav-section__row {
    background-color: rgba(45, 45, 45, 0.9) !important;
    color: #fff !important;
}
/*小屋的導覽列是藍綠色漸層*/
.main-nav {
    background-image: none !important;
}
.main-nav__member {
    border-color: rgba(255, 255, 255, 0.4) !important;
}
/*左側選單的灰色圖示*/
.sidenav-section .sidenav__icon {
    filter: invert(1) hue-rotate(180deg) !important;
}
.main-nav__form {
    background-color: rgba(0, 0, 0, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
}
/*左上角的 logo、右上角的通知圖示（用 mask 畫的，顏色就是背景色）*/
.main-nav__logo,
.main-nav .tool__icon {
    background-color: #fff !important;
}
.main-nav .gsc-search-button svg {
    fill: #fff !important;
}
.main-nav__dropdown,
.main-nav__dropdown i {
    color: #fff !important;
}

/*右上角的通知、聊天下拉選單*/
.member-service {
    background-color: rgba(45, 45, 45, 0.95) !important;
    border: 2px solid #249db8 !important;
    color: #fff !important;
}
.member-service__heading,
.notice-popover__item {
    border-color: rgba(255, 255, 255, 0.2) !important;
}
.member-service__heading,
.member-service__content,
.member-service__msg,
.chat-popover__name,
.notice-popover__tab {
    color: #fff !important;
}
.chat__msg,
.member-service__time {
    color: rgba(255, 255, 255, 0.6) !important;
}
.notice-popover__title,
.member-service__link,
.notice-popover__tab.is-active,
.notice-popover__tab.active {
    color: #87dfff !important;
}
.member-service__item:hover {
    background-color: rgba(0, 0, 0, 0.4) !important;
}
.member-service__cover {
    background-color: rgba(0, 0, 0, 0) !important;
    border-color: rgba(255, 255, 255, 0.2) !important;
}
.member-service__img {
    border-color: rgba(255, 255, 255, 0.2) !important;
}
.member-service__toolbar {
    background-color: rgba(0, 0, 0, 0.4) !important;
    border-color: rgba(255, 255, 255, 0.2) !important;
}
.member-service .tool__icon {
    background-color: rgba(255, 255, 255, 0.6) !important;
}
/*個人選單*/
.member-popover__wrap {
    border-color: rgba(255, 255, 255, 0.2) !important;
}
.member-popover__info,
.member-popover__name,
.member-popover__link,
.member-popover__link-text,
.member-popover__toggle-label {
    color: #fff !important;
}
.member-popover__account,
.member-popover__unit {
    color: rgba(255, 255, 255, 0.6) !important;
}
.member-popover__metric,
.member-popover__value {
    color: #87dfff !important;
}
.member-popover__link:hover,
.member-popover__link:hover .member-popover__link-text {
    color: #87dfff !important;
}
.member-popover__item:hover,
.member-popover__link:hover {
    background-color: rgba(0, 0, 0, 0.4) !important;
}
.member-popover__finished {
    background-color: rgba(0, 0, 0, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
    color: rgba(255, 255, 255, 0.6) !important;
}
.member-service .member-popover__icon {
    background-color: rgba(255, 255, 255, 0.8) !important;
}
.member-service .btn.link__between {
    background-color: rgba(45, 45, 45, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
    color: #fff !important;
}
.member-service .btn.link__between:hover {
    border: 1px solid #87dfff !important;
    color: #87dfff !important;
}
.sidenav-section__title,
.sidenav-section__name,
.sidenav-section__heading .toggle__trigger {
    color: #fff !important;
}
.sidenav-section__link:hover,
.sidenav-section__link:hover .sidenav-section__title,
.sidenav-section__link:hover .sidenav-section__name,
.sidenav-section__link.is-active .sidenav-section__title,
.sidenav-section__link.active .sidenav-section__title {
    color: #87dfff !important;
}
.sidenav-section__link:hover,
.sidenav-section__link.is-active,
.sidenav-section__link.active {
    background-color: rgba(0, 0, 0, 0.4) !important;
}

/*最下面的頁尾*/
.main-container__footer,
.main-container__footer h4,
.main-container__footer p,
.main-container__footer .footer__inner,
.main-container__footer a {
    color: rgba(255, 255, 255, 0.8) !important;
}
.main-container__footer a:hover {
    color: #87dfff !important;
}
.index-card__body .index-card__item,
.index-card__item .index-card__body,
.section-ec__wrapper .index-card__item,
.index-fuli__wrapper .index-card__item {
    background-color: rgba(0, 0, 0, 0) !important;
}

/*右下角回到頂端*/
.fixed-right .fixed-right__link,
.fixed-right__link {
    background-color: rgba(45, 45, 45, 0.8) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
    color: #fff !important;
}
`

  /**
   * 2026-11 補強：巴哈改版後使用 Tailwind 的新頁面（哈啦區首頁…）
   * 文字、框線顏色都是 CSS 變數（RGB 三個數字），直接改變數；背景色要半透明才看得到背景圖片，所以改 class。
   */
  const CSS_TAILWIND = `
/*文字、框線顏色*/
:root {
    --tw-primary-text: 255 255 255 !important;
    --tw-secondary-text: 255 255 255 !important;
    --tw-tertiary-text: 200 200 200 !important;
    --tw-quaternary-text: 160 160 160 !important;
    --tw-primary-border: 102 102 102 !important;
    --tw-secondary-border: 102 102 102 !important;
    --tw-tertiary-border: 102 102 102 !important;
    --tw-primary: 36 157 184 !important;
}

/*最上面的導覽列、左側選單*/
#global-nav {
    background-image: none !important;
    background-color: rgba(45, 45, 45, 0.9) !important;
}
[class*="_aside_"] {
    background-color: rgba(45, 45, 45, 0.9) !important;
}
/*左側選單最下面的「導航捷徑設定」，不透明才不會跟後面捲動的項目疊在一起*/
[class*="_aside_"] a.fixed {
    background-color: rgb(45, 45, 45) !important;
}
/*左上角的 logo（用 mask 畫的，顏色就是背景色）*/
#global-nav span.bg-white {
    background-color: #fff !important;
}

/*背景色*/
.bg-base-bg,
.bg-f1-bg,
.bg-b1-bg,
.bg-bg-normal,
.bg-white,
.bg-light-backgroundColor-1F,
.lg\\:bg-light-backgroundColor-1F {
    background-color: rgba(45, 45, 45, 0.4) !important;
}
.bg-f2-bg,
.bg-f3-bg,
.bg-common-neutral-100,
.bg-common-neutral-200,
.hover\\:bg-f1-bg:hover,
.hover\\:bg-f2-bg:hover {
    background-color: rgba(0, 0, 0, 0.4) !important;
}
/*彈出選單、黏在上方的分類列：背景太透明會看不清楚*/
:is([role="dialog"], [role="menu"], [role="listbox"], [data-side]):is(.bg-base-bg, .bg-f1-bg, .bg-white),
:is([role="dialog"], [role="menu"], [role="listbox"], [data-side]) > :is(.bg-base-bg, .bg-f1-bg, .bg-white),
.data-\\[scrolled\\]\\:bg-f1-bg[data-scrolled] {
    background-color: rgba(45, 45, 45, 0.95) !important;
}
:is([role="dialog"], [role="menu"], [role="listbox"], [data-side]):is(.bg-base-bg, .bg-f1-bg, .bg-white),
:is([role="dialog"], [role="menu"], [role="listbox"], [data-side]) > :is(.bg-base-bg, .bg-f1-bg, .bg-white) {
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
}
.text-light-textColor-secondary,
.text-common-neutral-300 {
    color: rgba(255, 255, 255, 0.7) !important;
}
`

  /**
   * 原腳本停止更新後，網站改版造成沒有套用到深色的區塊
   * @type { Record<'forum' | 'home' | 'login' | 'site', string> }
   */
  const CSS_FIXES = {
    forum: `
${CSS_NOW_CHAT}
/* 2026-11 補強：文章頁右下角的「一樓 / 最新 / TOP / END」快捷按鈕 */
.baha_quicktool .quicktool.jumpfloor button,
.baha_quicktool .quicktool.iconbtn {
    background-color: rgba(45, 45, 45, 0.8) !important;
    border-color: rgba(255, 255, 255, 0.4) !important;
    color: #fff !important;
}
.baha_quicktool .quicktool.jumpfloor button:hover,
.baha_quicktool .quicktool.iconbtn:hover {
    border-color: #87dfff !important;
    color: #87dfff !important;
}

/* 2026-11 補強：文章列表縮圖載入前的灰色底 */
.b-list__img.skeleton {
    background-color: rgba(255, 255, 255, 0.1) !important;
}

/* 2026-11 補強：搜尋頁的搜尋框 */
.SearchTypeahead-input {
    background-color: rgba(0, 0, 0, 0.4) !important;
    color: #fff !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
}

/* 2026-11 補強：改版後的哈啦區首頁，阻擋廣告時顯示的灰色預留框 */
[class*="bg-[#e9e9e9]"] {
    background-color: rgba(0, 0, 0, 0.4) !important;
    color: rgba(255, 255, 255, 0.7) !important;
}

/* 2026-11 補強：新版發文編輯器（/post/），依「明暗預覽」開關切換：一般時維持白底與網站原本的文字顏色 */
.post-compose__editor:has(.ProseMirror.theme-light) {
    background-color: rgb(255, 255, 255) !important;
    --tw-primary-text: 45 45 45 !important;
    --tw-secondary-text: 70 70 70 !important;
    --tw-tertiary-text: 140 140 140 !important;
    --tw-quaternary-text: 179 179 179 !important;
    --tw-primary-border: 229 229 229 !important;
    --tw-secondary-border: 217 217 217 !important;
    --tw-tertiary-border: 245 245 245 !important;
}
.post-compose__editor:has(.ProseMirror.theme-dark) {
    background-color: rgba(0, 0, 0, 0.4) !important;
}
.ProseMirror.theme-dark {
    color: #fff !important;
}

/* 2026-11 補強：發文 / 回文頁面（post1.php），原腳本不套用 */
.side_gray_box,
.post__template__box,
.post__template__list {
    background-color: rgba(45, 45, 45, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
    color: #fff !important;
}
.side_gray_box a,
.side_gray_box p,
.side_gray_box span,
.side_gray_box h5,
.side_gray_box h6,
.postset_item h5,
.post__template a > h4 {
    color: #fff !important;
}
.post__template a > h4 {
    background-color: rgba(0, 0, 0, 0.4) !important;
}
.label-icon:not(.is-active) {
    background-color: rgba(0, 0, 0, 0.4) !important;
    border-color: rgba(255, 255, 255, 0.4) !important;
}
.post-section .c-post__body > input.form-control,
.post-section .c-post__body > select,
.postset_sign,
.postset_sign select,
.dropdown-group-info .js-link {
    background-color: rgba(0, 0, 0, 0.4) !important;
    border-color: rgba(255, 255, 255, 0.4) !important;
    color: #fff !important;
}
.dropdown-group-info .js-link span,
.post-section .c-post__header h3 {
    color: #fff !important;
}
.post__copyright {
    color: rgba(255, 255, 255, 0.6) !important;
}
${CSS_TAILWIND}
`,
    home: `
${CSS_MAIN_NAV}
/* 2026-11 補強：改版後的巴哈首頁 */
.main-container,
.main-container__footer {
    background-color: rgba(0, 0, 0, 0) !important;
}
.main-container,
.main-container__footer,
.index-card__body,
.index-card__item {
    color: #fff !important;
}

/*區塊標題的分頁*/
.section-index__tab {
    background-color: rgba(45, 45, 45, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
    color: #fff !important;
}
.section-index__tab:hover,
.section-index__tab.is-active,
.section-index__tab.active {
    background-color: rgba(45, 45, 45, 0.4) !important;
    border: 1px solid #87dfff !important;
    color: #87dfff !important;
}
.section-index__title-link {
    color: #fff !important;
}
.btn-filter {
    background-color: rgba(45, 45, 45, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
    color: #fff !important;
}

/*卡片*/
.index-card__item,
.index-card__body,
.section-rank__body,
.section-ec__wrapper,
.index-list__container,
.index-fuli__wrapper {
    background-color: rgba(45, 45, 45, 0.4) !important;
}
.index-card__item {
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
}
.index-card__item:hover {
    border: 1px solid #87dfff !important;
}
.index-card__text,
.index-fuli__name {
    color: #fff !important;
}
.index-card__item:hover .index-card__text,
.index-fuli__item:hover .index-fuli__name {
    color: #87dfff !important;
}
.index-fuli__tag {
    color: #87dfff !important;
}
/*用 mask 畫的灰色小圖示（人氣、訂閱數…），已按讚的愛心維持原本的顏色*/
.info__icon:not(.is-active),
.service__icon {
    background-color: rgba(255, 255, 255, 0.6) !important;
}
`,
    login: `
/* 2026-11 補強：改版後的登入畫面 */
.TOP-bh {
    background-image: none !important;
    background-color: rgba(0, 0, 0, 1) !important;
}
#loginFormDiv {
    background-color: rgba(45, 45, 45, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
    color: #fff !important;
}
#loginFormDiv .header-img img {
    filter: invert(1);
}
#form-login label,
#form-login h6 {
    color: #fff !important;
}
#form-login input.form-control {
    background-color: rgba(0, 0, 0, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
    color: #fff !important;
}
#form-login input.form-control:focus {
    border: 1px solid #87dfff !important;
}
#form-login .password-box a {
    background-color: rgba(0, 0, 0, 0) !important;
}
#form-login .password-box a i {
    color: rgba(255, 255, 255, 0.6) !important;
}
#loginFormDiv .caption-text {
    color: rgba(255, 255, 255, 0.6) !important;
}
#btn-switch-problem,
#btn-switch-register {
    color: #87dfff !important;
}
#loginFormDiv hr {
    background-color: rgba(255, 255, 255, 0.4) !important;
}
#btngroup-social-login a {
    background-color: rgba(255, 255, 255, 0.9) !important;
    border-color: rgba(255, 255, 255, 0.4) !important;
}
#BH-footer,
#BH-footer p {
    color: rgba(255, 255, 255, 0.6) !important;
    border-color: rgba(255, 255, 255, 0.4) !important;
}
`,
    site: `
/* 2026-11 新增：哈啦區以外的頁面（小屋、GNN、動畫瘋…） */
/*背景圖片放在 <html>，<body> 改成透明：小屋主人有設定背景圖片時由腳本搬到 <html>*/
html {
    background-image: var(--bdt-bg) !important;
    background-attachment: fixed !important;
    background-position: center center !important;
    background-repeat: no-repeat !important;
    background-size: cover !important;
    background-color: rgba(45, 45, 45, 1) !important;
}
body {
    background-color: rgba(0, 0, 0, 0) !important;
    color: #fff !important;
}
/*頁面原本的背景圖片已由腳本搬到 <html>（疊上背景遮罩），這裡把 <body> 的拿掉*/
html.bdt-owner-bg body {
    background-image: none !important;
}
${CSS_MAIN_NAV}
${CSS_TAILWIND}

/*白色的卡片（創作內容、側邊欄…）*/
.card-base {
    background-color: rgba(45, 45, 45, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
    color: #fff !important;
}
.creation-hr,
.card-base hr {
    background-color: rgba(255, 255, 255, 0.4) !important;
    border-color: rgba(255, 255, 255, 0.4) !important;
}

/*創作文章*/
.article-title,
.article-content h3,
.text-paragraph,
.text-paragraph h1,
.text-paragraph h2,
.text-paragraph h3,
.text-paragraph h4,
.title-caption-text,
.caption-text.primary {
    color: #fff !important;
}
.caption-text {
    color: rgba(255, 255, 255, 0.6) !important;
}
.text-paragraph a,
.more-creation,
.ct-icon.text {
    color: #87dfff !important;
}
.text-paragraph table,
.text-paragraph td,
.text-paragraph th {
    border-color: rgba(255, 255, 255, 0.4) !important;
}

/*按鈕*/
.ct-btn.normal {
    background-color: rgba(45, 45, 45, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
    color: #fff !important;
}
.ct-btn.normal:hover {
    border: 1px solid #87dfff !important;
    color: #87dfff !important;
}

/*文章下方固定的 GP / 贊助列*/
.image-status-bar {
    background-color: rgba(45, 45, 45, 0.9) !important;
    border-top: 1px solid rgba(255, 255, 255, 0.4) !important;
}
#showGPer,
#showDonater,
.image-status-bar .caption-text {
    color: #fff !important;
}

/*留言*/
.dynamic-reply__head,
.dynamic-reply__row,
.dynamic-reply__editor,
.toggle__trigger.btn-more {
    border-color: rgba(255, 255, 255, 0.2) !important;
}
.dynamic-reply__sort,
.dynamic-reply-user,
.dynamic-reply__article {
    color: #fff !important;
}
.dynamic-reply-user {
    color: #87dfff !important;
}
.dynamic-reply-time {
    color: rgba(255, 255, 255, 0.6) !important;
}
.dynamic-reply__btn {
    color: rgba(255, 255, 255, 0.6) !important;
}
.dynamic-reply__btn:hover {
    color: #87dfff !important;
}
.reply-input,
.reply-avatar__edit {
    background-color: rgba(0, 0, 0, 0.4) !important;
    border-color: rgba(255, 255, 255, 0.4) !important;
    color: #fff !important;
}
.toggle__trigger.btn-more,
.toggle__trigger.btn-more a {
    color: #87dfff !important;
}

/*小屋首頁：頁首*/
.main-container_header_info h1,
.header_info-small small {
    color: #fff !important;
}
#main-nav a {
    color: #fff !important;
}
#main-nav a.is-active,
#main-nav a:hover {
    color: #87dfff !important;
}
#main-nav .btn {
    background-color: rgba(45, 45, 45, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
}
#main-nav .btn:hover {
    border: 1px solid #87dfff !important;
}

/*小屋各區塊裡的文字預設改成白色（用 :where 降低權重，下面個別指定的顏色才蓋得過去）*/
.main-container_wall-post :where(p, span, div, article, button, i, small, h1, h2, h3, h4, h5, li, time) {
    color: #fff !important;
}
.post-time,
.post-status,
.reply_time,
.reply-content__tag,
.reply-content__gpbp p {
    color: rgba(255, 255, 255, 0.6) !important;
}
.c-more-msg,
.c-more-msg span {
    color: #87dfff !important;
}
/*動態裡分享連結的預覽框*/
.linkbox_info {
    background-color: rgba(0, 0, 0, 0.4) !important;
}
.c-quick-reply {
    background-color: rgba(45, 45, 45, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
}
.c-editor_article_input {
    background-color: rgba(0, 0, 0, 0) !important;
    color: #fff !important;
}
/*GP、贊助按鈕的灰色圖示（反轉亮度，hue-rotate 讓有顏色的圖示維持原本的色相）*/
.likebtn-img .backpic,
.sponsorbtn-img .backpic {
    filter: invert(1) hue-rotate(180deg);
}
.main-container_wall-post_header-icon,
.webview_commendlist {
    border-color: rgba(255, 255, 255, 0.2) !important;
}

/*小屋首頁：各區塊、右側的勇者資訊*/
.main-container_wall-post,
.main-sidebar_right {
    background-color: rgba(45, 45, 45, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
}
.main-container_wall-post,
.main-container_wall-post h2,
.main-container_wall-post h4,
.main-container_wall-post .row,
.main-container_wall-post .col-12,
.main-container_wall-post .list-item,
.main-container_wall-post .single-column,
.main-container_wall-post .avatar-info,
.main-container_wall-post .gamer_avatar-info,
.main-container_wall-post .gamer_avatar-info p,
.main-sidebar_right,
.main-sidebar_right .section-title,
.main-sidebar_right li,
.main-sidebar_right small {
    color: #fff !important;
}
.main-container_wall-post a:not(.btn),
.main-sidebar_right a:not(.btn) {
    color: #87dfff !important;
}
.main-container_wall-post table,
.main-container_wall-post tbody,
.main-container_wall-post tr,
.main-container_wall-post td,
.gamer_avatar {
    border-color: rgba(255, 255, 255, 0.4) !important;
}

/*小屋的創作列表：搜尋框、創作行事曆*/
.input-box input,
select.dropdown-group {
    background-color: rgba(0, 0, 0, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
    color: #fff !important;
}
select.dropdown-group option {
    background-color: #2d2d2d !important;
}
.calendar-container {
    background-color: rgba(0, 0, 0, 0) !important;
}
.calendar-container__btn,
.calendar-container__title,
.calendar-table__col,
.calendar-table__item {
    color: #fff !important;
}
.calendar-table__header {
    border-color: rgba(255, 255, 255, 0.2) !important;
}
.calendar-table__today .calendar-table__item {
    background-color: rgba(0, 0, 0, 0.4) !important;
    border-color: #87dfff !important;
    color: #87dfff !important;
}
.calendar-table__inactive .calendar-table__item {
    color: rgba(255, 255, 255, 0.3) !important;
}

/*設定頁面*/
.main-container_wall {
    background-color: rgba(0, 0, 0, 0) !important;
}
.main-sidebar_left {
    background-color: rgba(45, 45, 45, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
}
.main-sidebar_header-l {
    background-color: rgba(45, 45, 45, 0.9) !important;
    color: #fff !important;
}
.main-sidebar_left .sidebar_section {
    border-color: rgba(255, 255, 255, 0.2) !important;
}
.main-sidebar_left .section-title {
    color: rgba(255, 255, 255, 0.6) !important;
}
.side_nav a,
.side_nav a span {
    color: #fff !important;
}
.side_nav a:hover,
.side_nav a:hover span,
.side_nav a.is-active,
.side_nav a.is-active span,
.side_nav a.active,
.side_nav a.active span {
    color: #87dfff !important;
}
.side_nav .side_icon {
    filter: invert(1) hue-rotate(180deg);
}
.box-bg_gray {
    background-color: rgba(0, 0, 0, 0.4) !important;
}
.main-container_wall-post .form-control {
    background-color: rgba(0, 0, 0, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
    color: #fff !important;
}
.device-kind,
.user-set_header_img {
    border-color: rgba(255, 255, 255, 0.2) !important;
}

/*小屋分頁裡的子分頁（好友 / 被好友…）*/
#sub-nav a {
    color: #fff !important;
}
#sub-nav a.is-active,
#sub-nav a:hover {
    color: #87dfff !important;
}

/*好友列表（在 iframe 裡）*/
.friendlist_wrapper .sort_content {
    background-color: rgba(45, 45, 45, 0.4) !important;
}
.friendlist_wrapper .searchBar {
    background-color: rgba(0, 0, 0, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
    color: #fff !important;
}
.friendlist_wrapper .search_placeholder,
.friendlist_wrapper .user_id,
.friendlist_wrapper .main_icon p {
    color: rgba(255, 255, 255, 0.6) !important;
}
.friendlist_wrapper .nickname {
    color: #87dfff !important;
}
.friendlist_wrapper hr.line {
    border-color: rgba(255, 255, 255, 0.2) !important;
}
.friendlist_wrapper .svg-icon img,
.friendlist_wrapper .search_svg img {
    filter: invert(1);
}

/*實況大廳*/
.LIVE-hall {
    background-color: rgba(45, 45, 45, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
}
.LIVE-channel .ch-pic {
    background-color: rgba(0, 0, 0, 0.4) !important;
}
.LIVE-channel .ch-pic span {
    background-color: rgba(0, 0, 0, 0.7) !important;
    color: #fff !important;
}
.LIVE-channel h1 a {
    color: #fff !important;
}
.LIVE-channel h1 a:hover {
    color: #87dfff !important;
}

/*創作大廳（舊版排版，大部分沿用哈啦區的 CSS）*/
.BH-master_tag1 a {
    background-color: rgba(45, 45, 45, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
    color: #fff !important;
}
.BH-master_tag1 a.BH-master_tag1now,
.BH-master_tag1 a:hover {
    border: 1px solid #87dfff !important;
    color: #87dfff !important;
}
.HOME-mainbox1a {
    background-color: rgba(0, 0, 0, 0) !important;
}
.HOME-mainwrap1 h1 a,
.HOME-mainbox1a h1 a {
    color: #fff !important;
}
.HOME-mainwrap1 h1 a:hover,
.HOME-mainbox1a h1 a:hover {
    color: #87dfff !important;
}
.gp-text,
.btn-text,
.mainbox-author {
    color: #87dfff !important;
}
.gp-text {
    border-color: rgba(255, 255, 255, 0.4) !important;
}
.BH-slave_more button {
    background-color: rgba(45, 45, 45, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
    color: #fff !important;
}
.BH-slave_more button:hover {
    border: 1px solid #87dfff !important;
    color: #87dfff !important;
}
#BH-talkmain2,
.HOME-rbox1 > div {
    background-color: rgba(0, 0, 0, 0.4) !important;
    border-color: rgba(255, 255, 255, 0.4) !important;
    color: #fff !important;
}
#searchBtn {
    background-color: rgba(0, 0, 0, 0) !important;
    filter: invert(1);
}

/*===== 各頁面共用的元件 =====*/
/*舊版排版（公會、GNN…）裡沒有 class 的連結，原本是深藍色*/
.main-container__center a:not([class]),
.BH-lbox a:not([class]),
.BH-rbox a:not([class]),
.BH-txtmore {
    color: #87dfff !important;
}
/*舊版排版的區塊標題*/
.main-container__center > h4,
.GH-lbox__heading {
    background-color: rgba(0, 0, 0, 0.4) !important;
    border-color: rgba(255, 255, 255, 0.4) !important;
    color: #fff !important;
}
/*公會、小屋左側選單*/
.main-sidebar_left li > a,
.guild-list_info h4 {
    color: #fff !important;
}
.main-sidebar_left li > a:hover {
    color: #87dfff !important;
}
.sidebar_section_tag,
.about-item .tag {
    background-color: rgba(45, 45, 45, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
    color: #fff !important;
}
.sidebar_section_tag:hover,
.about-item .tag:hover {
    border: 1px solid #87dfff !important;
    color: #87dfff !important;
}
.gamer_avatar-info p {
    color: rgba(255, 255, 255, 0.6) !important;
}
/*第一次進入頁面時的導覽說明*/
#driver-popover-item {
    background-color: rgba(45, 45, 45, 0.95) !important;
    border: 2px solid #249db8 !important;
    color: #fff !important;
}
#driver-popover-item .driver-popover-title,
#driver-popover-item .driver-popover-description {
    color: #fff !important;
}
#driver-popover-item button {
    background-color: rgba(0, 0, 0, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
    color: #fff !important;
    text-shadow: none !important;
}
/*舊版頁首的 Google 搜尋框（酒館…）*/
.TOP-search [id^="___gcse"],
.TOP-search table.gsc-search-box,
.TOP-search .gsc-input-box,
.TOP-search input.gsc-input,
/*Google 的 CSS 權重很高，要用 id 才蓋得過去*/
.TOP-search input:is(#gsc-i-id1, #gsc-i-id2, #gsc-i-id3, #gsc-i-id4, #gsc-i-id5) {
    background-color: rgba(0, 0, 0, 0) !important;
    border-color: rgba(255, 255, 255, 0.4) !important;
    color: #fff !important;
}
.TOP-search [id^="___gcse"] {
    background-color: rgba(0, 0, 0, 0.4) !important;
}
/*右下角的快捷按鈕*/
.baha_quicktool .quicktool.jumpfloor button,
.baha_quicktool .quicktool.iconbtn {
    background-color: rgba(45, 45, 45, 0.8) !important;
    border-color: rgba(255, 255, 255, 0.4) !important;
    color: #fff !important;
}
.baha_quicktool .quicktool.iconbtn img {
    filter: invert(1);
}
/*頁面上方的分頁列（酒館…）*/
.header-nav_guide {
    background-color: rgba(45, 45, 45, 0.9) !important;
    color: #fff !important;
}
.header-nav_guide .navbar_text {
    color: #fff !important;
}
/*ACG 資料庫的搜尋列*/
.search_bar {
    background-color: rgba(0, 0, 0, 0.4) !important;
}
input.form_bar,
input.form_btn {
    background-color: rgba(0, 0, 0, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
    color: #fff !important;
}
input.form_btn:hover {
    border: 1px solid #87dfff !important;
    color: #87dfff !important;
}
/*ACG 資料庫的平台專區*/
.container_card,
.ec-items_info_card {
    background-color: rgba(45, 45, 45, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
    color: #fff !important;
}
.main-news_info,
.fans-follow_head-list_items {
    background-color: rgba(0, 0, 0, 0) !important;
}
.fans-follow_number {
    background-color: rgba(0, 0, 0, 0.4) !important;
    color: #fff !important;
}
.container_card .btn-default {
    background-color: rgba(45, 45, 45, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
    color: #fff !important;
}
.nav_segment-control_content p,
.items_info_title,
#BH-footer p {
    color: #fff !important;
}
.nav_segment-control_content.nav_is-choose p,
.nav_segment-control .btn-show-more,
.nav_segment-control .btn-show-more b,
.items_info_title:hover {
    color: #87dfff !important;
}
/*ACG 資料庫的作品頁*/
.ACG-mster_box1 {
    background-image: none !important;
}
.ACG-mster_box1 li {
    border-color: rgba(255, 255, 255, 0.2) !important;
}
[id^="ACG-box"][id$="pic"],
.ACG-mster_box1 > div > div {
    background-color: rgba(0, 0, 0, 0.4) !important;
    border-color: rgba(255, 255, 255, 0.2) !important;
}
.wikiContent h3 {
    color: #87dfff !important;
}
.ACG-mster_box5 p,
td.w_mbk,
.score-overall-people {
    background-color: rgba(0, 0, 0, 0) !important;
    color: #fff !important;
}
.score-overall-number {
    color: #87dfff !important;
}
.acg-score-date .score-line {
    background-color: rgba(0, 0, 0, 0.4) !important;
}
/*舊版排版裡的輸入框與按鈕*/
.main-container__main :is(input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]):not([type="image"]), select, textarea),
.BH-lbox button,
.BH-rbox button,
.BH-nodata input {
    background-color: rgba(0, 0, 0, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
    color: #fff !important;
}
.main-container__main select option {
    background-color: #2d2d2d !important;
}
/*舊版排版裡的表格（會員中心…）*/
.BH-lbox table.BH-table {
    background-color: rgba(0, 0, 0, 0.4) !important;
    border-color: rgba(255, 255, 255, 0.2) !important;
}
.BH-lbox table.BH-table td,
.BH-lbox table.BH-table th {
    border-color: rgba(255, 255, 255, 0.2) !important;
}
/*會員中心的公告標題*/
.MB-lbox2 h1 {
    color: #87dfff !important;
}
/*找不到網頁*/
body > .box_gray {
    background-image: none !important; /*淺色浮水印，在深色背景上太明顯*/
    background-color: rgba(45, 45, 45, 0.6) !important;
    border-color: rgba(255, 255, 255, 0.4) !important;
    color: #fff !important;
}
/*頁面上方的廣告橫幅預留區*/
#bh-banner {
    background-color: rgba(0, 0, 0, 0) !important;
}
/*經驗值條的底*/
.GU-gained2 {
    background-color: rgba(0, 0, 0, 0.4) !important;
}
/*文章下方的 GP / 分享列*/
.shareandmore {
    background-color: rgba(45, 45, 45, 0.9) !important;
}
/*留言輸入框*/
.reply-avatar__input {
    background-color: rgba(0, 0, 0, 0.4) !important;
    border-color: rgba(255, 255, 255, 0.4) !important;
    color: #fff !important;
}
.reply-avatar__input textarea {
    background-color: rgba(0, 0, 0, 0) !important;
    color: #fff !important;
}
.dynamic-reply__inner .toggle__trigger,
.dynamic-reply__inner .toggle-data {
    color: #87dfff !important;
}
/*文章內的遊戲 / 勇者卡片*/
.article_gamercard,
.gamecard__gamer {
    background-color: rgba(45, 45, 45, 0.4) !important;
    border-color: rgba(255, 255, 255, 0.4) !important;
    color: #fff !important;
}
.gamecard-img {
    background-color: rgba(0, 0, 0, 0.4) !important;
}
`,
  }


  /**
   * 2026-11 新增：只在特定子網域套用的 CSS（key 是 xxx.gamer.com.tw 的 xxx）
   * @type { Record<string, string> }
   */
  const CSS_HOSTS = {
    // GNN 新聞網
    gnn: `
.GN-topimgBar {
    background-color: rgba(0, 0, 0, 0.6) !important;
}
.gnn-preferred-source {
    background-color: rgba(45, 45, 45, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
    color: #fff !important;
}
.GN-lbox2E {
    background-color: rgba(0, 0, 0, 0.4) !important;
}
.GN-lbox2D a,
.GN-lbox2F a {
    color: #fff !important;
}
.GN-lbox2D a:hover,
.GN-lbox2F a:hover {
    color: #87dfff !important;
}
.GN-lbox2D span,
.GN-lbox2F span {
    color: rgba(255, 255, 255, 0.6) !important;
}
.GN-lbox2C,
.GN-lbox2C a {
    color: rgba(255, 255, 255, 0.8) !important;
}
.GN-lbox2G .btn-more,
.GN-lbox2-footer__link {
    color: #87dfff !important;
}
.gnn-preferred-source a {
    color: #fff !important;
}
/*GNN 文章*/
.GN-lbox3 h1 {
    color: #fff !important;
}
.GN-lbox3 a.acglink {
    color: #87dfff !important;
}
.gnn-label .label {
    background-color: rgba(45, 45, 45, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
    color: #fff !important;
}
.promotenews-content .title {
    color: #fff !important;
}
`,
    // 巴哈商城
    buy: `
.shopping-container,
.shopping-footer-area {
    background-color: rgba(45, 45, 45, 0.4) !important;
    border-color: rgba(255, 255, 255, 0.4) !important;
}
.shopping-container :where(p, span, div, a, li, h1, h2, h3, h4, td, th, label) {
    color: #fff !important;
}
.search-input {
    background-color: rgba(0, 0, 0, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
    color: #fff !important;
}
.header-btn-bar a,
.header-link-list a {
    color: #fff !important;
}
.header-link-list a:hover,
.header-btn-bar a:hover {
    color: #87dfff !important;
}
.header-btn-bar img,
.header-btn-bar i {
    filter: invert(1);
}
.slick-dots button {
    background-color: rgba(255, 255, 255, 0.3) !important;
}
.slick-dots .slick-active button {
    background-color: #87dfff !important;
}
.rank-entity-order,
.rank-digital-game {
    background-color: rgba(0, 0, 0, 0.4) !important;
    color: #fff !important;
}
.rank-date,
.footer-list a,
.shopping-footer-area p,
.shopping-footer-area span {
    color: rgba(255, 255, 255, 0.6) !important;
}
.ranking-list-card,
.products-card {
    background-color: rgba(45, 45, 45, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
}
.ranking-list-card:hover,
.products-card:hover {
    border: 1px solid #87dfff !important;
}
.ranking-list-list {
    border-color: rgba(255, 255, 255, 0.2) !important;
}
.products-price {
    color: #87dfff !important;
}
.btn-buy-now {
    background-color: rgba(45, 45, 45, 0.4) !important;
    border-color: #87dfff !important;
    color: #87dfff !important;
}
.btn-buy-now.btn-no-item {
    border-color: rgba(255, 255, 255, 0.4) !important;
    color: rgba(255, 255, 255, 0.6) !important;
}
/*商品頁*/
.detail-img-block > div,
.btn-reduce-number,
.btn-add-number,
.products-slider-area,
.products-description-content-area {
    background-color: rgba(0, 0, 0, 0.4) !important;
    color: #fff !important;
}
`,
    // 勇者造型
    avatar1: `
.AR-myar1 {
    background-color: rgba(45, 45, 45, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
}
.AR-myar1 button,
.AR-array span > a,
#stype {
    background-color: rgba(0, 0, 0, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
    color: #fff !important;
}
.AR-myar1 button:hover,
.AR-array span > a:hover {
    border: 1px solid #87dfff !important;
    color: #87dfff !important;
}
`,
    // 勇者福利社
    fuli: `
.items-card {
    background-color: rgba(45, 45, 45, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
}
.items-card:hover {
    border: 1px solid #87dfff !important;
}
.items-card .card-content {
    background-color: rgba(0, 0, 0, 0) !important;
    color: #fff !important;
}
.items-card .card-content :where(h1, h2, h3, h4, p, span, div) {
    color: #fff !important;
}
.tabs-btn-box .btn-distance {
    background-color: rgba(45, 45, 45, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
    color: #fff !important;
}
.project-item p {
    color: #fff !important;
}
`,
    // 站內信
    mailbox: `
#delFrm,
#delFrm .sticky-nav,
.ML-tb1 {
    background-color: rgba(45, 45, 45, 0.4) !important;
    border-color: rgba(255, 255, 255, 0.2) !important;
}
#delFrm .sticky-nav {
    background-color: rgba(45, 45, 45, 0.9) !important;
}
.label-icon {
    background-color: rgba(0, 0, 0, 0.4) !important;
    border-color: rgba(255, 255, 255, 0.4) !important;
}
.sort-tag:not(.is-active) {
    background-color: rgba(0, 0, 0, 0.4) !important;
    color: #fff !important;
}
.ML-tb1 tr,
.ML-tb1 td {
    color: rgba(255, 255, 255, 0.6) !important;
    border-color: rgba(255, 255, 255, 0.2) !important;
}
.ML-tb1 .searchUser,
.ML-tb1 .mailTitle {
    color: #fff !important;
}
.ML-tb1 .mailTitle:hover {
    color: #87dfff !important;
}
.ML-tb1 tr.mail-new {
    background-color: rgba(17, 170, 193, 0.2) !important;
}
`,
    // NOW! 網頁版聊天室
    now: `
${CSS_NOW_CHAT}
.now_chatroom-container,
.now-msglist,
.im_classify-tag {
    background-color: rgba(45, 45, 45, 0.4) !important;
}
.topsky {
    background-color: rgba(45, 45, 45, 0.9) !important;
}
.setting-firsthint {
    background-color: rgba(45, 45, 45, 0.95) !important;
    border: 2px solid #249db8 !important;
    color: #fff !important;
}
.setting-firsthint p {
    color: #fff !important;
}
.setting-firsthint .firsthint-tittle {
    color: #87dfff !important;
}
.tagitem {
    color: rgba(255, 255, 255, 0.6) !important;
}
.tagitem.is-active,
.tagitem.active {
    color: #fff !important;
}
.list-room {
    border-color: rgba(255, 255, 255, 0.2) !important;
}
.list-room:hover,
.list-room.is-active,
.list-room.active {
    background-color: rgba(0, 0, 0, 0.4) !important;
}
.list-room .im_bhtop-msg-item,
.list-room .im_bhtop-message-state {
    color: #fff !important;
}
.list-room .last-msg,
.list-room .time {
    color: rgba(255, 255, 255, 0.6) !important;
}
.chatroom_system-hint {
    background-color: rgba(0, 0, 0, 0) !important;
}
.chatroom_system-hint-msg {
    color: rgba(255, 255, 255, 0.7) !important;
}
/*對話視窗*/
.list-room.is-select {
    background-color: rgba(0, 0, 0, 0.4) !important;
}
.msg-full_chatroom-area .roomtitle {
    background-color: rgba(45, 45, 45, 0.9) !important;
}
.system_hint-date {
    background-color: rgba(0, 0, 0, 0.5) !important;
    color: #fff !important;
}
.now_user-info .user-id {
    color: rgba(255, 255, 255, 0.6) !important;
}
.chat_inputarea {
    background-color: rgba(45, 45, 45, 0.9) !important;
}
.chat_inputarea .textarea-container,
.chat_inputarea .textarea,
.chat_inputarea textarea {
    background-color: rgba(0, 0, 0, 0.4) !important;
    color: #fff !important;
}
/*右側的頻道資訊、話題列表*/
.msg-full_chatroom-topic-area {
    background-color: rgba(45, 45, 45, 0.4) !important;
    border-color: rgba(255, 255, 255, 0.2) !important;
}
.topiclist-switch-btn,
.msg-full_chatroom-topic-area .channel-info,
.topic-list-item {
    background-color: rgba(0, 0, 0, 0.4) !important;
    color: #fff !important;
}
.topic-list-name {
    color: #87dfff !important;
}
`,
    // 動畫瘋
    ani: `
/*動畫瘋的文字大多是 #2e2f31，先全部改成白色（:where 降低權重），下面再個別指定*/
body :where(p, h1, h2, h3, h4, span, label, li, div, a, i) {
    color: #fff !important;
}
a[href] {
    color: #fff !important;
}

/*上方搜尋列、選單*/
.sky,
.mainmenu,
.mainmenu ul {
    background-color: rgba(45, 45, 45, 0.9) !important;
    border-color: rgba(255, 255, 255, 0.2) !important;
}
#anime-search-sky {
    background-color: rgba(0, 0, 0, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
    color: #fff !important;
}
.anime_search-icon {
    background-color: rgba(0, 0, 0, 0) !important;
}
.mainmenu a:hover {
    color: #87dfff !important;
}

/*右上角的使用者選單*/
.user-setting-toolbox,
.filter-items {
    background-color: rgba(45, 45, 45, 0.95) !important;
    border: 2px solid #249db8 !important;
}
.user-setting-toolbox .switch-toggle,
.btn-logout {
    background-color: rgba(0, 0, 0, 0.4) !important;
}
.user-setting-toolbox .move-bg {
    background-color: #249db8 !important;
}
.user-info {
    border-color: rgba(255, 255, 255, 0.2) !important;
}
.user-id,
.theme-time,
.extend-content,
.anime-watch-number,
.nav-segment-control:not(.nav-choose-segment) p {
    color: rgba(255, 255, 255, 0.6) !important;
}

/*卡片*/
.anime-card-block,
.theme-list-main,
.extend-card,
.trademark-item {
    background-color: rgba(45, 45, 45, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
}
.anime-card-block:hover,
.theme-list-main:hover,
.extend-card:hover {
    border: 1px solid #87dfff !important;
}
.anime-card-block:hover .anime-name,
.theme-list-main:hover .theme-name,
.extend-card:hover .extend-title {
    color: #87dfff !important;
}
.anime-blocker,
.theme-info-block {
    background-color: rgba(0, 0, 0, 0) !important;
}
.theme-number {
    background-color: rgba(0, 0, 0, 0.4) !important;
    color: rgba(255, 255, 255, 0.8) !important;
}
.btn-show-more {
    border-color: rgba(255, 255, 255, 0.4) !important;
}
.btn-next,
.btn-next p,
.btn-next span,
.theme-show-more-list,
.theme-show-more-list i,
.footer-text a {
    color: #87dfff !important;
}

/*影片頁*/
.subtitle,
.sub_top.ani-tabs,
.anime-title,
section.data,
.webview_commendlist {
    background-color: rgba(45, 45, 45, 0.4) !important;
    border-color: rgba(255, 255, 255, 0.2) !important;
}
.ani-tabs-link {
    background-color: rgba(0, 0, 0, 0) !important;
}
.ani-tabs-link.is-active {
    color: #87dfff !important;
}
.season li,
.anime-title li,
.tag-list .tag,
.score-line {
    background-color: rgba(0, 0, 0, 0.4) !important;
    border-color: rgba(255, 255, 255, 0.2) !important;
}
.season li.playing,
.anime-title li.playing {
    background-color: #00b4d8 !important;
}
.anime-title li span {
    background-color: rgba(0, 0, 0, 0.4) !important;
}
.user-score-more {
    border-color: #87dfff !important;
    color: #87dfff !important;
}
.c-reply__item,
.c-reply__editor {
    border-color: rgba(255, 255, 255, 0.2) !important;
}
.commendlist-wrapper .main-container_wall-post {
    background-color: rgba(0, 0, 0, 0) !important;
    border: none !important;
}
.commend-segment-wrapper .filter-nav {
    background-color: rgba(45, 45, 45, 0.9) !important;
}
#sub_list {
    color: rgba(255, 255, 255, 0.6) !important;
}

/*頁尾*/
.footer-topline,
.footer-separate-line {
    background-color: rgba(255, 255, 255, 0.2) !important;
}
`,
  }

  const subdomain = location.hostname.replace(/\.?gamer\.com\.tw$/, '')

  const css = [
    `:root { --bdt-bg: ${backgroundValue()}; }`,
    page === 'forum' ? CSS_FORUM : '',
    // 很多頁面（創作大廳、公會…）還是和哈啦區一樣的舊版排版，沿用哈啦區的 CSS；但背景圖片要另外處理，去掉開頭 body 的設定
    page === 'site' ? CSS_FORUM.replace(/^\s*body \{[^}]*\}/, '') : '',
    page === 'forum' && url.startsWith('https://forum.gamer.com.tw/search') ? CSS_FORUM_SEARCH : '',
    page === 'home' ? CSS_HOME : '',
    page === 'login' ? CSS_LOGIN : '',
    CSS_COMMON,
    CSS_FIXES[page],
    page === 'site' ? CSS_HOSTS[subdomain] || '' : '',
    // 小屋以外的頁面，<body> 原本的背景圖片（商城的格紋…）只是裝飾，直接用設定的背景圖片取代
    page === 'site' && subdomain !== 'home' ? 'body { background-image: none !important; }' : '',
    // 有些內容放在 iframe 裡（小屋的好友列表…），iframe 裡不用再畫一次背景圖片
    page === 'site' && !isTop ? 'html { background: rgba(0, 0, 0, 0) !important; }' : '',
    settings.customCss,
  ].join('\n')

  /** 注入 CSS（插在 <html> 底下而不是 <head>，避免被阻擋廣告的擴充功能移除） */
  function addCss() {
    const style = document.createElement('style')
    style.id = 'bahamut-dark-theme'
    style.textContent = css
    const inject = () => {
      const root = document.documentElement || document.head
      if (root) root.appendChild(style)
      else setTimeout(inject, 10)
    }
    inject()
    return style
  }
  const style = addCss()

  if (isPreviewFrame) {
    const update = () => {
      const dark =
        previewSwitch?.checked ||
        newEditor?.classList.contains('theme-dark') ||
        document.documentElement?.getAttribute('data-theme') === 'dark' ||
        !!document.querySelector('link[href*="_dark.css"]')
      style.media = dark ? '' : 'not all'
    }
    update()
    previewSwitch?.addEventListener('change', () => setTimeout(update))
    new MutationObserver(update).observe(document, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-theme', 'href'],
    })
  }


  //---------------------設定視窗---------------------//

  /** @type { [keyof Settings, string][] } */
  const FEATURE_OPTIONS = [
    ['simplifyLinks', '簡化文章列表的超連結，讓已讀文章能正確變色'],
    ['stickyDivider', '在置頂文章與一般文章之間加上分隔線'],
    ['formatButton', '在文章右上角加入「格式化文章顏色」按鈕'],
    ['invertFontColor', '反轉文章內自訂的文字顏色與表格底色'],
    ['eagerImages', '取消文章內圖片的延遲載入'],
    ['fastReplyFix', '快速回覆框輸入時改為白底黑字'],
  ]

  function openSettings() {
    if (document.getElementById('bdt-settings-host')) return
    const s = loadSettings()

    const host = document.createElement('div')
    host.id = 'bdt-settings-host'
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;'
    const shadow = host.attachShadow({ mode: 'open' })
    shadow.innerHTML = `
<style>
  :host { all: initial; }
  * { box-sizing: border-box; font-family: "Microsoft JhengHei", "PingFang TC", sans-serif; }
  .backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6); display: flex; align-items: center; justify-content: center; }
  .dialog { width: min(720px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow-y: auto; background: #2d2d2d; color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.4); border-radius: 6px; padding: 20px 24px; font-size: 14px; line-height: 1.6; }
  h2 { margin: 0 0 12px; font-size: 18px; color: #87dfff; }
  h3 { margin: 18px 0 6px; font-size: 15px; }
  .hint { color: rgba(255, 255, 255, 0.6); font-size: 12px; margin: 2px 0 6px; }
  textarea, input[type=text] { width: 100%; background: rgba(0, 0, 0, 0.4); color: #fff; border: 1px solid rgba(255, 255, 255, 0.4);
    border-radius: 4px; padding: 6px 8px; font-size: 13px; font-family: Consolas, monospace; }
  textarea:focus, input[type=text]:focus { outline: none; border-color: #87dfff; }
  textarea { resize: vertical; min-height: 64px; }
  label.check { display: flex; gap: 8px; align-items: flex-start; margin: 4px 0; cursor: pointer; }
  label.check input { margin-top: 4px; accent-color: #249db8; }
  .row { display: flex; gap: 8px; align-items: center; }
  .row input { flex: 1; }
  .current { word-break: break-all; color: #87dfff; }
  .actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 20px; flex-wrap: wrap; }
  button { background: rgba(0, 0, 0, 0.4); color: #fff; border: 1px solid rgba(255, 255, 255, 0.4); border-radius: 4px;
    padding: 6px 14px; font-size: 14px; cursor: pointer; }
  button:hover { border-color: #87dfff; color: #87dfff; }
  button.primary { background: #117e96; border-color: #117e96; }
  button.primary:hover { background: #249db8; color: #fff; }
  .status { margin-right: auto; align-self: center; color: #ffb36b; }
</style>
<div class="backdrop">
  <div class="dialog" role="dialog" aria-label="巴哈姆特深色主題設定">
    <h2>巴哈姆特深色主題 設定</h2>

    <h3>哈啦區背景圖片</h3>
    <div class="hint">一行一個圖片網址，有多張時每次載入頁面會隨機挑一張。留空則不使用背景圖片。</div>
    <textarea id="forumImages" rows="3" spellcheck="false"></textarea>

    <h3>其他頁面背景圖片（首頁、登入畫面、小屋、GNN、動畫瘋…）</h3>
    <div class="hint">同上。</div>
    <textarea id="homeImages" rows="3" spellcheck="false"></textarea>

    <div class="hint">目前這個頁面使用的背景圖片：<span class="current" id="current"></span></div>

    <h3>背景遮罩</h3>
    <div class="hint">疊在背景圖片上面的漸層，用來讓文字更容易閱讀（CSS background-image 的值）。</div>
    <div class="row"><input type="text" id="overlay" spellcheck="false"><button id="resetOverlay" type="button">預設值</button></div>

    <h3>功能</h3>
    <div id="features"></div>

    <h3>自訂 CSS</h3>
    <div class="hint">會套用在所有支援的頁面，可用來微調顏色。</div>
    <textarea id="customCss" rows="5" spellcheck="false"></textarea>

    <div class="actions">
      <span class="status" id="status"></span>
      <button id="reset" type="button">全部恢復預設值</button>
      <button id="cancel" type="button">取消</button>
      <button id="save" type="button" class="primary">儲存並重新整理</button>
    </div>
  </div>
</div>`

    /** @type { <T extends HTMLElement>(id: string) => T } */
    const $ = (id) => /** @type { any } */ (shadow.getElementById(id))
    const fill = (/** @type { Settings } */ v) => {
      $('forumImages').value = v.forumImages.join('\n')
      $('homeImages').value = v.homeImages.join('\n')
      $('overlay').value = v.overlay
      $('customCss').value = v.customCss
      for (const [key] of FEATURE_OPTIONS) $(`f-${key}`).checked = !!v[key]
    }

    $('current').textContent = currentImage || '（無）'
    $('features').append(
      ...FEATURE_OPTIONS.map(([key, text]) => {
        const label = document.createElement('label')
        label.className = 'check'
        const input = document.createElement('input')
        input.type = 'checkbox'
        input.id = `f-${key}`
        label.append(input, document.createTextNode(text))
        return label
      }),
    )
    fill(s)

    const close = () => host.remove()
    const parseList = (/** @type { string } */ v) => [...new Set(v.split('\n').map((x) => x.trim()).filter(Boolean))]

    $('resetOverlay').onclick = () => ($('overlay').value = DEFAULT_OVERLAY)
    $('reset').onclick = () => fill(DEFAULT_SETTINGS)
    $('cancel').onclick = close
    shadow.querySelector('.backdrop').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) close()
    })
    shadow.addEventListener('keydown', (e) => {
      if (/** @type { KeyboardEvent } */ (e).key === 'Escape') close()
    })

    $('save').onclick = async () => {
      /** @type { Settings } */
      const next = {
        ...s,
        forumImages: parseList($('forumImages').value),
        homeImages: parseList($('homeImages').value),
        overlay: $('overlay').value.trim() || DEFAULT_OVERLAY,
        customCss: $('customCss').value,
      }
      for (const [key] of FEATURE_OPTIONS) next[key] = $(`f-${key}`).checked

      // 先確認新加入的圖片能顯示，並試著下載快取（圖床不支援 CORS 時只是不快取，不算錯誤）
      const status = $('status')
      const cache = loadImageCache()
      const newImages = [...new Set([...next.forumImages, ...next.homeImages])].filter((x) => !cache[x])
      const failed = []
      for (const [i, src] of newImages.entries()) {
        status.textContent = `檢查圖片中（${i + 1}/${newImages.length}）…`
        try {
          await checkImageLoads(src)
        } catch (e) {
          console.warn(LOG_PREFIX, '背景圖片無法載入', src, e)
          failed.push(src)
          continue
        }
        await cacheImage(src).catch((e) => console.info(LOG_PREFIX, '背景圖片無法快取，直接使用原圖網址', src, e))
      }
      if (failed.length) {
        status.textContent = `以下圖片無法載入，請確認網址：${failed.join('、')}`
        return
      }
      saveSettings(next)
      location.reload()
    }

    ;(document.body || document.documentElement).appendChild(host)
    $('forumImages').focus()
  }

  if (isTop) GM_registerMenuCommand('設定', openSettings)

  //---------------------哈啦區、其他頁面的額外處理---------------------//

  if (page !== 'forum' && page !== 'site') return

  const onReady = (/** @type { () => void } */ fn) => {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn)
    else fn()
  }

  const run = (/** @type { boolean } */ enabled, /** @type { () => void } */ fn, /** @type { string } */ name) => {
    if (!enabled || disabled) return
    try {
      fn()
    } catch (e) {
      console.warn(LOG_PREFIX, name, e)
    }
  }

  onReady(() => run(true, watchEditorTheme, '編輯器明暗模式'))

  /**
   * 哈啦區發文頁的編輯器（iframe）有「闇黑模式」預覽開關，切換時網站會設定編輯器內部的 <html data-theme>。
   * 這裡把狀態同步到 iframe 的 data-bdt-theme 給外層 CSS 使用，並在編輯器內部加入深色樣式（只在闇黑模式生效）。
   */
  function watchEditorTheme() {
    const setup = () => {
      for (const frame of /** @type { NodeListOf<HTMLIFrameElement> } */ (document.querySelectorAll('iframe.main-editor, iframe#editor'))) {
        let doc
        try {
          doc = frame.contentDocument
        } catch {
          continue
        }
        // 編輯器初始化時可能會整個重寫 iframe 的內容，所以用標記元素判斷是否已處理過
        if (!doc?.head || !doc.body || doc.getElementById('bdt-editor-dark')) continue
        const style = doc.createElement('style')
        style.id = 'bdt-editor-dark'
        style.textContent = `
          html[data-theme="dark"] body { background-color: rgba(0, 0, 0, 0) !important; color: #fff !important; }
          html[data-theme="dark"] a { color: #87dfff !important; }`
        doc.head.appendChild(style)
        // 文章頁的快速回覆沒有明暗模式開關，沿用原腳本的做法（輸入時白底黑字）
        if (page === 'forum' && !document.getElementById('editorDarkTheme')) {
          run(settings.fastReplyFix, () => fixFastReplyColor(doc), '修正快速回文的顏色')
        }
        const root = doc.documentElement
        const sync = () => (frame.dataset.bdtTheme = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light')
        sync()
        new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ['data-theme'] })
      }
    }
    setup()
    // 編輯器是動態產生的，晚一點才會出現或重新建立
    new MutationObserver(setup).observe(document.body, { childList: true, subtree: true })
    setInterval(setup, 1000)
  }

  if (page === 'site') {
    onReady(() => {
      if (subdomain === 'home') run(true, moveOwnerBackground, '搬移小屋主人的背景圖片')
      const invertSiteColors = () =>
        invertArticleColors(
          'font',
          '#article_content tr, #article_content td, .main-container_wall-post tr, .main-container_wall-post td',
          true,
        )
      run(settings.invertFontColor, invertSiteColors, '文章文字顏色反轉')
    })
  }

  /**
   * 小屋主人有設定背景圖片時，把圖片搬到 <html> 並疊上背景遮罩，取代設定裡的背景圖片。
   * 圖片原本的重複、大小、位置設定也一起搬過去（有些小屋使用重複排列的花紋）。
   */
  function moveOwnerBackground() {
    const cs = getComputedStyle(document.body)
    if (!cs.backgroundImage.includes('url(')) return
    const overlay = settings.overlay.trim() || DEFAULT_OVERLAY
    const root = document.documentElement.style
    const set = (/** @type { string } */ prop, /** @type { string } */ ownerValue, /** @type { string } */ overlayValue) =>
      root.setProperty(prop, `${overlayValue}, ${ownerValue}`, 'important')
    set('background-image', cs.backgroundImage, overlay)
    set('background-repeat', cs.backgroundRepeat, 'no-repeat')
    set('background-size', cs.backgroundSize, 'cover')
    set('background-position', cs.backgroundPosition, 'center center')
    set('background-attachment', cs.backgroundAttachment, 'fixed')
    document.documentElement.classList.add('bdt-owner-bg')
  }

  if (page !== 'forum') return

  onReady(() => {
    run(settings.simplifyLinks, simplifyArticleLinks, '簡化文章列表的超連結')
    run(settings.stickyDivider, addStickyDivider, '文章列表插入水平線')
    run(settings.formatButton, addFormatButtons, '文章內容格式化')
    run(settings.invertFontColor, () => invertArticleColors('font', '#BH-master tr, #BH-master td'), '文章文字顏色反轉')
    run(settings.eagerImages, cancelImageLazyLoading, '取消圖片延遲載入')
  })

  /** 簡化文章列表的超連結（移除 &tnum=），避免 css 的 :visited 無法順利變色 */
  function simplifyArticleLinks() {
    for (const a of document.querySelectorAll('a[href*="&tnum="]')) {
      const href = a.getAttribute('href') || ''
      if (href.includes('&page=') || href.includes('&last=')) continue // 排除指定頁碼、直達最後一頁的連結
      a.setAttribute('href', href.slice(0, href.indexOf('&tnum=')))
    }
  }

  /** 區分文章列表的置頂公告與一般文章 */
  function addStickyDivider() {
    const sticky = document.getElementsByClassName('b-list__row--sticky')
    if (!sticky.length) return
    const last = sticky[sticky.length - 1]
    const tr = document.createElement('tr')
    tr.className = 'b-list__hr'
    tr.style.height = '20px'
    tr.style.pointerEvents = 'none'
    tr.style.background =
      'url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAUAQMAAADFiO34AAAABlBMVEUAAAD///+l2Z/dAAAAAnRSTlMAZtJCCVUAAAArSURBVAjXYwACBQYQcEAiG0AEIwOCZAKTLEgkBxIpwIAwRgHZGHTDmOAkAKrqAtL90ZhdAAAAAElFTkSuQmCC)'
    tr.innerHTML = "<td colspan='20'></td>"
    last.after(tr)
  }

  /** 避免文章內容看不清楚，在每篇文章加入一個切換「格式化文章顏色」的按鈕 */
  function addFormatButtons() {
    for (const header of document.getElementsByClassName('c-post__header')) {
      const btn = document.createElement('but')
      btn.title = '格式化文章顏色'
      btn.className = 'ge_shi_hua'
      btn.onclick = () => {
        const post = /** @type { HTMLElement } */ (header.parentNode)
        post.setAttribute('ge_shi_hua', post.getAttribute('ge_shi_hua') === 'true' ? '' : 'true')
      }
      // 與原腳本相同，插在標題列後面隔一個節點的位置（按鈕用 float + 負 margin 浮到標題列右側）
      header.parentNode?.insertBefore(btn, header.nextSibling?.nextSibling ?? null)
    }
  }

  /** 取消圖片延遲載入 */
  function cancelImageLazyLoading() {
    for (const img of document.querySelectorAll('.c-section__main img.lazyloaded')) {
      const src = img.getAttribute('data-src')
      if (src) img.setAttribute('src', src)
    }
  }

  /** 焦點在快速回文的方塊時，背景改成白色，失去焦點則改回深色 */
  /**
   * 由 watchEditorTheme 在快速回覆的編輯器（iframe）建立時呼叫
   * @param { Document } doc 編輯器內部的 document
   */
  function fixFastReplyColor(doc) {
    const win = doc.defaultView
    const setFocus = (/** @type { boolean } */ focused) => doc.body?.setAttribute('is_focus', focused ? 'yes' : 'no')
    setFocus(doc.hasFocus())
    win?.addEventListener('focus', () => setFocus(true))
    win?.addEventListener('blur', () => setFocus(false))
    if (doc.getElementById('css_shense')) return
    const style = doc.createElement('style')
    style.id = 'css_shense'
    style.textContent = `
      body, body * { transition: background-color 0.2s, color 0.1s; }
      body[is_focus=yes] { background-color: rgba(255, 255, 255, 0.9) !important; color: #000 !important; }
      body[is_focus=no], body[is_focus=no] * { background-color: rgba(0, 0, 0, 0) !important; color: #fff !important; }`
    doc.head.appendChild(style)
  }

  /**
   * 反轉文章內自訂的文字顏色（<font color>）、文字底色與表格底色，避免深色背景下看不清楚
   * @param { string } fontSelector 要處理的 <font>
   * @param { string } cellSelector 要處理的表格列與儲存格
   * @param { boolean } [onlyDarkText] 只反轉深色的文字（淺色文字在深色背景上本來就看得清楚，反轉反而變暗）。
   *   哈啦區維持原腳本全部反轉的行為，其他頁面使用這個選項。
   */
  function invertArticleColors(fontSelector, cellSelector, onlyDarkText = false) {
    for (const font of /** @type { NodeListOf<HTMLFontElement> } */ (document.querySelectorAll(fontSelector))) {
      const bg = invertColor(font.style.backgroundColor)
      if (bg) font.style.backgroundColor = bg
      if (onlyDarkText && !isDarkColor(font.color)) continue
      const c = invertColor(font.color)
      if (c) font.color = c
    }
    for (const cell of /** @type { NodeListOf<HTMLTableRowElement | HTMLTableCellElement> } */ (
      document.querySelectorAll(cellSelector)
    )) {
      const bg = invertColor(cell.bgColor)
      if (bg) cell.bgColor = bg
    }
  }

  /**
   * 是否為深色（亮度低於一半）；無法解析時回傳 false
   * @param { string } color
   */
  function isDarkColor(color) {
    // invertColor 會回傳 #rrggbb 或 rgb(r,g,b)，再反轉回來就是原本的顏色
    const inverted = invertColor(color)
    const hex = inverted.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
    const rgb = inverted.match(/^rgb\((\d+),(\d+),(\d+)\)$/)
    const parts = hex ? hex.slice(1, 4).map((x) => parseInt(x, 16)) : rgb ? rgb.slice(1, 4).map(Number) : null
    if (!parts) return false
    const [r, g, b] = parts.map((x) => 255 - x)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128
  }

  /**
   * 反轉顏色，支援 rgb()、#RRGGBB、#RGB 與顏色名稱；無法解析時回傳空字串
   * @param { string } color
   */
  function invertColor(color) {
    if (!color) return ''
    if (color.trim().toLowerCase() === 'windowtext') color = '#000000'
    const rgb = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
    if (rgb) return `rgb(${255 - +rgb[1]},${255 - +rgb[2]},${255 - +rgb[3]})`

    // 顏色名稱或 hex 交給瀏覽器解析成 #rrggbb
    const ctx = invertColor.ctx || (invertColor.ctx = document.createElement('canvas').getContext('2d'))
    ctx.fillStyle = '#010203'
    ctx.fillStyle = color.trim()
    const hex = /** @type { string } */ (ctx.fillStyle)
    if (hex === '#010203' && color.trim().toLowerCase() !== '#010203') return '' // 無法解析
    const m = hex.match(/^#([0-9a-f]{6})$/i)
    if (!m) return ''
    return '#' + (0xffffff - parseInt(m[1], 16)).toString(16).padStart(6, '0')
  }
  /** @type { CanvasRenderingContext2D | null } */
  invertColor.ctx = null
})()
