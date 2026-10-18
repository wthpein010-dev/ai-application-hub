# 素材与媒体来源 · 1.6.6

制作：Pain；日期：2026-10-17。

本页记录本轮新增资源和媒体。既有十套大厅、七项活动美术、金币场及比赛场资源继续沿用原网页交付。PSD为1.6.4独立交付，本轮未重新生成。

## 新增福利横幅

- 资源：`demo/assets/activity-welfare-header-166.webp`
- 来源：OpenAI内置image_gen按本项目活动中心需求原创生成；不是竞品截图。
- 尺寸：2171×724；大小：1,623,476字节。
- 处理：生成PNG转无损WebP，method 6，原图与WebP的RGBA像素逐字节相同；未编辑画面内容。
- WebP SHA256：`af73791e89319e71c78b68aa1cef0076f89a690db322c76c1dc238863bf57dbb`
- 原始生成图SHA256：`efa9175d3c6c15d65517853170feef737f06ad874ddbf62b5a25c4c63b12dadd`
- 用途：活动中心横幅背景；活动文字、数值和操作由网页独立呈现。

完整生成提示词：

```text
Use case: stylized-concept. Asset type: panoramic illustrated header background for a Chinese casual mahjong game's welfare center. Create one very wide landscape artwork, 3:1 ratio, polished commercial mobile game 3D-painted illustration, same cheerful bright blue and gold Chinese ancient-city world. On the RIGHT THIRD: a charming ornate blue-and-gold lacquer gift chest opened with warm glowing gold coins, one ivory mahjong tile with a simple blue bamboo engraving, a red silk bow, small porcelain teacup, bright soft sparkles; soft blue pavilions and airy clouds behind. LEFT TWO THIRDS are very calm luminous pale sky-blue/cloud gradients with extremely subtle cloud scroll details, ample clear space for live interface text. Clean crisp objects and readable silhouettes, premium playful mobile-game UI art, smooth soft bevels, gentle shadows, saturated cornflower blue with cyan, luminous honey gold, red accent. Keep main objects compact and fully inside frame. No people, NO TEXT, no numbers, no logos, no buttons, no card borders, no UI, no watermark. This is a single shared hero background, not a collage.
```

## 网页图册

34个画面、每屏5秒，共170秒，H264，1280×720、24fps；字幕每条一行。这是网页截图图册，不是连续实机录屏，也不是完整动效验收。

29张截图按1.6.5交付原字节沿用；活动中心、七日茶约、茶歇好礼、回访有礼、好运翻牌5张为1.6.6浏览器实际截图，逐屏目检。工具返回的新截图原为JPEG，已规范为PNG且解码RGBA完全一致；本地效果图交付统一提供JPG。来源清单记录各画面哈希；历史原始文件保持原字节，未按保存扩展名推断真实编码。

截图仅含本项目演示状态，不包含竞品账号原图、私有验收页面、登录资料或测试工具。


## 1.7.0 活动海报与邀友插画

制作Pain；2026-10-18。活动交互及数值沿本项目现行活动策划；竞品仅用于活动海报导航、任务奖励行的信息层级参考，竞品账号原图没有进入公开资源。

新增资源 `demo/assets/activity-invite-170.webp`，1024×640、918796字节。内置image_gen原创生成，PNG转换为无损WebP并逐RGBA核对一致。源PNG SHA256 `04f0f7326fa97435bb67b3f759369cbd381aa1e6d8d95c55f27f390226adc7c6`；WebP SHA256 `341acfdd5fb5aafdbd543c0540ea018f288927b4bbd235b9698d5ddd8bcf6dad`。使用在普通邀友主视觉及海报；文字与按钮由HTML独立呈现。

生成提示词：
```text
Use case: stylized-concept. Asset type: original horizontal illustration for a Chinese casual mahjong game's ordinary friend invitation page. Primary request: create a polished, inviting tea-courtyard gathering, no text, no logos. Reference images: the blue, jade-white and gold 3D tea service and the blue-gold courtyard header provided in the conversation are style references only; create a new scene. Scene: a graceful old Chinese town courtyard with blue glazed tiled roofs, a flowering tree, subtle warm gold sunlight and a soft cyan distant canal background. Subject: two friendly adult tea companions seated around a compact round tea table, one woman and one man, in tasteful stylized contemporary casual clothing with subtle Chinese details; relaxed welcoming smiles, holding tiny tea cups, a few clean mahjong tiles and refined tea service on the table, one small closed blue-gold decorative keepsake box with no coins flowing out. Style: exquisite rounded 3D illustration for a premium Chinese casual board game, sculpted characters, silk, glazed ceramic, enamel blue and gold details, bright clean readable silhouettes; fit an existing blue-and-gold mahjong interface. Composition: landscape 8:5, medium-wide scene, main two characters and table centered toward the right two thirds, no UI, enough quiet space on upper left for interface overlay; visual polish and controlled rich detail. Palette: turquoise and sky blue backdrop, deep azure roof and ceramic, ivory jade, warm gold rim light, small jade green accents. Constraints: no text, no symbols that resemble letters, no logo, no watermark, no interface buttons, no monetary amounts, no currency icons, no invitation-reward implication, no casino or gambling imagery, no extra people. Fully rendered background, not transparent.
```

本版图册35画面、175秒：29张按既有交付原字节沿用；活动中心、签到、茶歇、回访、翻牌和普通邀友6张本轮浏览器新拍。新截图仅规范PNG容器，解码像素一致。图册不是连续实机录屏，未连接真实服务。PSD仍保留独立1.6.4交付。
