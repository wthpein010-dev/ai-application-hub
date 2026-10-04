# Third-party assets and redistribution evidence

Checked 2026-09-29. Kenney packages contain CC0 1.0 `License.txt` (copied in `Licenses/`); Noto Sans SC is under SIL OFL 1.1 (`../Resources/Fonts/OFL.txt`). Only the listed files are shipped. Original gameplay layout and lighthouse geometry are built in code.

| Package | Official source | Downloaded ZIP SHA-256 | License |
| --- | --- | --- | --- |
| Pirate Pack | https://kenney.nl/assets/pirate-pack | `91A0A43446910357E38B877971A94C06E6B3D9D28C035E51C107A1731E84F76A` | CC0 1.0 |
| UI Pack - Adventure | https://kenney.nl/assets/ui-pack-adventure | `982E8AB66842509EE9214F9C2038E594CBE029F19D1DC177FECAAD3B41A67ED3` | CC0 1.0 |
| Interface Sounds | https://kenney.nl/assets/interface-sounds | `F2193D072726D6758A5F7871B2DCC54DCCE0D5C35C6F0A62F92549B327C81232` | CC0 1.0 |
| Noto Sans SC | https://github.com/google/fonts/tree/main/ofl/notosanssc | font downloaded directly; see below | SIL OFL 1.1 |

| Shipped asset | Source within original package | SHA-256 |
| --- | --- | --- |
| `Resources/Art/ButtonBrown.png` | UI Pack - Adventure / PNG/Default/button_brown.png | `ee6d0103b23c877d28296a3fb620b5cdb340dd2c798134a7ea6317d5467d5053` |
| `Resources/Art/CrewA.png` | Pirate Pack / PNG/Retina/Ship parts/crew (1).png | `eb48dabab3d3c742cd57bcd7cd0969b2db1fcdcfacfaae34c99fdabc01731361` |
| `Resources/Art/CrewB.png` | Pirate Pack / PNG/Retina/Ship parts/crew (2).png | `946e941d2c2d6142979d9319074ea36794588a4437ad99dc964af17a5ad8603a` |
| `Resources/Art/CrewC.png` | Pirate Pack / PNG/Retina/Ship parts/crew (3).png | `591ea010dc509ef11deb39cc8dca5a6d46802e8208e9ff0497308f6e7b335699` |
| `Resources/Art/Dinghy.png` | Pirate Pack / PNG/Retina/Ships/dinghyLarge1.png | `b90ec60b2530bc96bfe1f3befb5b63d0ef023a3e75542f0d0eb8e8d9f674443a` |
| `Resources/Art/Island.png` | Pirate Pack / PNG/Retina/Tiles/tile_52.png | `83bb4273a4b149198fc8248f39fef93824c26c411b5d63b70284ea4004c9862d` |
| `Resources/Art/RescueShip.png` | Pirate Pack / PNG/Retina/Ships/ship (5).png | `ebe09da802e9a37815c21dcefec6e3f1f24c01b0751ca8a01d0bd6888e2157f2` |
| `Resources/Art/RockA.png` | Pirate Pack / PNG/Retina/Tiles/tile_49.png | `7c5d95a0da4f7612a03d4d9a418148ac5376662856c5fc58c42b37859127d604` |
| `Resources/Art/RockB.png` | Pirate Pack / PNG/Retina/Tiles/tile_50.png | `1ec460e02b999f55064ba9e2c3896bf4774689f7b352e5e894e26728f7b572f2` |
| `Resources/Audio/Click.ogg` | Interface Sounds / Audio/click_001.ogg | `ccfb7fa0cccdd9faec0eb16033c732b1e308d139d80f799161495d58f7adcdb9` |
| `Resources/Audio/Confirm.ogg` | Interface Sounds / Audio/confirmation_001.ogg | `063564703b6094d70718a3e787a55cc9141611e4ecd6b6637f8828f79b4a8c3a` |
| `Resources/Audio/Rescue.ogg` | Interface Sounds / Audio/bong_001.ogg | `d21d0f0b782445db579d11e2506b24cd1ac9d664ee33aeaf807761aa7b6fd710` |
| `Resources/Audio/Warning.ogg` | Interface Sounds / Audio/error_001.ogg | `46e67425d16339772e8d328fb36a49426c9467418686e11beeb71ff84b0f6433` |
| `Resources/Fonts/NotoSansSC-VF.ttf` | Noto Sans SC / NotoSansSC[wght].ttf | `a3041811a78c361b1de50f953c805e0244951c21c5bd412f7232ef0d899af0da` |

## Original art generated for the 2026-10-03 visual pass

The following files were generated with the built-in image generation tool for this game, then checked visually and copied into the Unity project. They are separate from the Kenney assets above. The prompts specified a hand-painted nocturnal maritime map, a transparent top-down civilian rescue boat, and a transparent survivor marker; each excluded text, logos and watermarks.

| Shipped asset | Intended use | SHA-256 |
| --- | --- | --- |
| `Resources/Art/NightSeaV2.png` | Night sea game board, lighthouse and reefs, with open center for gameplay | `F8BCB3833D121CAC6A97DFFED5084C80A25010E042587674FD1B0DF54FA4449E` |
| `Resources/Art/RescueShipV2.png` | Top-down rescue boat cutout | `2110C4720FF39A0F5D5140972295F6804DD6B7245BAC0BF54D7EC90E61EF9EDA` |
| `Resources/Art/SurvivorV2.png` | Survivor marker and ending badge cutout | `B207BC4E38E95CA1A8887F647CBC01224DBD6E5D239F7934261665FEB0CB64F8` |

## Original rescue POV art generated for the 2026-10-03 storm pass

These three scene illustrations were generated with the built-in image generation tool for this game. The prompts used the existing `NightSeaV2`, `SurvivorV2` and `RescueShipV2` images as art-direction references, then requested a first-person boat-deck perspective with one readable survivor in each scene, storm waves and a distant lighthouse. The generated images were inspected before copying into Unity. No text, logos or watermarks were requested.

| Shipped asset | Intended use | SHA-256 |
| --- | --- | --- |
| `Resources/Art/RescuePOV1.png` | First rescue: yellow-raincoat survivor in orange life ring, viewed from boat bow | `A6A9AA29211437605799FD512BB27E0E99741F237C0A331957C1983372864BC3` |
| `Resources/Art/RescuePOV2.png` | Second rescue: red-raincoat survivor reaching from broken dinghy | `9DDD291687F3E27C5E1C9017F34CC375001152B67CF56D1D8BBD29A4A9EA2729` |
| `Resources/Art/RescuePOV3.png` | Third rescue: yellow-raincoat survivor by rocks in heavy surf | `64C5614F58A859D5FF373FE7E16F723E48490A7312EF72BDE160C06B24009929` |

## Original ending illustrations generated on 2026-10-05

These assets were generated with the built-in image generation tool, visually checked, and copied into `Assets/Resources/Art/`. They are game illustrations, separate from the licensed Kenney sprites. All prompts excluded text, logos, UI and watermarks.

| Shipped asset | Final prompt / intended use | SHA-256 |
| --- | --- | --- |
| `Resources/Art/EndingFull.png` | Wide realistic painterly dawn harbor: weathered orange rescue boat, captain and exactly three blanket-wrapped rescued people, warm lighthouse and relieved atmosphere. Full success only. | `42A5188A8D87BDB7A4EED4FC339EBCF1E580D1B26BB222911D6080BE10902A43` |
| `Resources/Art/EndingPartial.png` | Edit the rainy return illustration to a wide 16:9 neutral safe return: remove blanket-wrapped passengers, keep only captain and one raincoat-wearing crew member operating the searchlight, amber boat, rainy twilight sea and warm harbor. Do not specify survivor count. Actual saved count is rendered by UI badges and text. | `178E66EE44E509ADFADCFC6C5A7658682397544DAE7F71000F23DDACC4AC32FF` |
| `Resources/Art/EndingFailure.png` | Wide realistic painterly storm retreat: weathered damaged orange rescue boat remains afloat, captain steering toward lighthouse, heavy rain, large waves and lightning. No casualties or celebratory rescued group. | `F19472B331EDD8892ACFFD41F67C87D2DDF3E1622DC663BE89C758EF7FEF53ED` |

Local audience portraits use the existing licensed `CrewA`, `CrewB`, and `CrewC` sprites. They are decorative stand-ins, not downloaded viewer profile photos.

## Original synthesized storm audio

`tools/generate_weather_audio.py` uses seeded noise and oscillators to create these sounds, then encodes them with the repository's locked `ffmpeg-static` binary. No third-party field recording is embedded. The generator is the reproducible source for the shipped OGG files.

| Shipped asset | Intended use | SHA-256 |
| --- | --- | --- |
| `Resources/Audio/StormRain.ogg` | Looping rain, wind and distant surf | `B73A3E2C5E1C29A5A4D9F3D89CC299C6515074E6DE0E5EDA5FE4661DF5D489B6` |
| `Resources/Audio/WindGust.ogg` | Short low wind swell, separate from the constant rain loop | `CF31877769E0598E05C2A6C443A387322658B186EF1805B19BF9120DC292FFDA` |
| `Resources/Audio/Thunder.ogg` | Lightning crack and rolling thunder | `5F6D2D7C3B03ECEADFEEB538FC9C33F395EE8EBB76DB0B46B9A69453197027F4` |
| `Resources/Audio/Splash.ogg` | Water splash when a survivor is saved | `C44ED6F29E5C74A24F5C5718D44539DB951C9B1DB994CACA3872BCB21EC141BE` |
