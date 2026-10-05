# 叮当打包铺集成清单
版本：1.0.0。原创中文空间装箱，10个手工关卡，鼠标/单指拖动、90度旋转、撤销、重开、参考图、选关解锁和本地进度。
工程：D:/AI-Workspace/Projects/ding-dang-parcel
隔离Hub工作树：D:/AI-Workspace/Projects/ding-dang-parcel-hub
专属介绍页：projects/ding-dang-parcel/index.html
试玩：projects/ding-dang-parcel/play/index.html
工程下载：downloads/ding-dang-parcel-unity-project.zip
真实截图：projects/ding-dang-parcel/assets/game-desktop.png、game-mobile.png、game-victory.png、game-final.png
验收记录：projects/ding-dang-parcel/verification.json
建议Hub卡片：名称“叮当打包铺”，简介“把奇奇怪怪装成刚刚好。拖动、旋转，将搞怪小物拼进纸盒，10关原创装箱谜题。”，标签“Unity / 中文 / 空间装箱 / WebGL”，封面game-desktop.png，详情projects/ding-dang-parcel/。
建议作品展示条目：原创轻休闲，Unity2022.3.62f3c1，首版10关，原创程序化2D美术/合成音效，开放许可中文字体。链接到Hub专属介绍页和试玩。
只改本游戏专属目录与下载；没有改Hub首页、共享清单、CI或game-producer-portfolio。父线程统一添加两站共享入口。
证据：Builds/build-final.log中“PARCEL BUILD Succeeded bytes=27491583”；10关已知解答由模型验证；真实浏览器正常鼠标操作完成全部10关；390x844触摸通关和刷新恢复；撤销/非法落点/重开/提示/选关均通过；无页面脚本错误或失败资源。
范围：测试环境为Windows Chromium/SwiftShader手机模拟，未验证真实iOS/Android设备或Windows独立播放器。JS heap不等于完整WASM或设备内存，WebGL初始内存128MB。
美术和音效为原创代码绘制与合成，未称手绘或图像模型生成。中文字体Noto Sans CJK SC，字体许可随工程附带。
工程下载页面沿用现有管理员门禁；当前管理员服务未配置时下载入口关闭，父线程若需网页工程下载应协调现有管理员资源目录，不能绕过。GitHub仓库已包含完整工程ZIP。
