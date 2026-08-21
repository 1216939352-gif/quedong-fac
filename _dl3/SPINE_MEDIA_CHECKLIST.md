# 脊柱健康单元 · 动作演示媒体缺口清单

> 生成时间：2026-08-21
> 审计结论：以下 34 个媒体文件（`assets/spine/*.jpg` 示意图 / `*.mp4` 演示视频）在代码 `spine.js` 的 `SPINE_ACTIONS` 中被引用，但**真实素材尚未制作**。
> 当前状态：已部署「线条示意图」临时占位图（17 jpg + 17 mp4，由 PIL/imageio 生成），动作卡不再显示 Qoo 默认图；后续只需把同名真实照片/视频覆盖进 `assets/spine/`，即可自动替换为真实演示素材。
> 修复方式：用真实照片/视频覆盖下表对应路径，无需改代码。

## 需制作的媒体（17 个动作 × jpg + mp4）

| 动作编码 | 动作名称 | 文件路径（jpg 示意图） | 文件路径（mp4 演示） |
|---|---|---|---|
| JC01 | 胸椎旋转伸展 | `assets/spine/jc01.jpg` | `assets/spine/jc01.mp4` |
| JC05 | 站姿肋骨内收 | `assets/spine/jc05.jpg` | `assets/spine/jc05.mp4` |
| JC06 | 仰卧骨盆后倾 | `assets/spine/jc06.jpg` | `assets/spine/jc06.mp4` |
| JC08 | 脊柱侧凸矫正拉伸 | `assets/spine/jc08.jpg` | `assets/spine/jc08.mp4` |
| JC09 | 站姿脊柱伸展 | `assets/spine/jc09.jpg` | `assets/spine/jc09.mp4` |
| JL01 | 弹力带侧平举(弱侧强化) | `assets/spine/jl01.jpg` | `assets/spine/jl01.mp4` |
| JL03 | 侧卧抬腿(弱侧强化) | `assets/spine/jl03.jpg` | `assets/spine/jl03.mp4` |
| JL05 | 弹力带划船(双侧平衡) | `assets/spine/jl05.jpg` | `assets/spine/jl05.mp4` |
| JL09 | 俯卧燕飞(弱侧强化) | `assets/spine/jl09.jpg` | `assets/spine/jl09.mp4` |
| JL10 | 侧卧平衡支撑 | `assets/spine/jl10.jpg` | `assets/spine/jl10.mp4` |
| PH01 | 单脚闭眼站立 | `assets/spine/ph01.jpg` | `assets/spine/ph01.mp4` |
| PH02 | 平衡垫站立 | `assets/spine/ph02.jpg` | `assets/spine/ph02.mp4` |
| PH04 | 坐姿转体平衡 | `assets/spine/ph04.jpg` | `assets/spine/ph04.mp4` |
| PH06 | 侧卧平衡支撑 | `assets/spine/ph06.jpg` | `assets/spine/ph06.mp4` |
| HX01 | 腹式呼吸训练 | `assets/spine/hx01.jpg` | `assets/spine/hx01.mp4` |
| HX03 | 胸廓扩张训练 | `assets/spine/hx03.jpg` | `assets/spine/hx03.mp4` |
| HX05 | 单侧胸廓扩张训练 | `assets/spine/hx05.jpg` | `assets/spine/hx05.mp4` |

## 真实素材替换步骤
1. 准备 17 个动作的真实照片/视频，命名为上表对应文件名（小写）。
2. 直接覆盖 `_dl3/assets/spine/` 下的占位文件。
3. `git add _dl3/assets/spine/` 并 commit/push，Railway 自动更新后动作卡即显示真实演示。

## 占位图规格（当前已部署）
- 格式：600×600 像素 JPEG / 2 秒 H.264 MP4（静态帧，由占位 jpg 生成）。
- 风格：浅紫底 + 品牌紫线条人体 + 动作编码 + 中文名称 + 临时示意标签。
- 生成脚本：`_gen_spine_ph.py`（jpg）与 `_gen_spine_mp4.py`（mp4）为本地一次性脚本，未提交。

## 真实素材建议
- jpg：真人/模型示范图，清晰展示起始与关键姿态；竖版 4:3 或 1:1。
- mp4：10–30s 标准动作演示，无声或轻解说，体积 < 5MB/个 利于移动端加载。
