# 叮当打包铺 v1.1.0
原创中文轻休闲空间装箱谜题。单指或鼠标拖动小物，点击旋转，装好纸盒后贴签寄出。10个手工关卡，参考解答、撤销、重开、选关及本地进度。

手机触控模式采用720×1280竖屏基准；360×640及长屏等比适配。按钮可直接点按，桌面保留鼠标拖动和可选R/Z快捷键。触摸取消、失焦、越界与尺寸变化取消当前手势，不改变原摆放；弹层阻止下方按钮接收点按。WebGL外框使用系统安全区并禁止游戏画布滚动/长按菜单；真机验证情况见QA报告，模拟器不代表iOS/Android真机。

旧版存档键和10关模型保持不变。美术为原创程序化扁平卡通，音效为程序合成；中文字体Noto Sans CJK SC采用SIL Open Font License，许可见Assets/Resources/FONT-LICENSE.txt。
Unity 2022.3.62f3c1：使用 -batchmode -quit -projectPath <本目录> -executeMethod ParcelBuild.WebGL -buildTarget WebGL 构建。
QA目录含四尺寸实际WebGL操作脚本与截图/报告；构建时Model.Validate验证10关参考解答。工程不包含Library、浏览器缓存或任何原生商店上架包。
